# Research: Memória semântica

**Phase 0 output for** `specs/008-memoria-semantica/plan.md`

---

## Contexto

O `/chat` já compõe janela de conversa (`history-prompt.ts`) e grava mensagens via `SqliteConversationStore`. Não há memória de longo prazo por plantonista. A spec exige MemoryStore por `userId` (*remember* / *recall* / *forget*), embeddings locais all-MiniLM-L6-v2, tabela `memories`, e injeção do recall no prompt quando `userId` vem no pedido. Esta fase fecha store, embedding, limiares, composição e testes.

---

## Decisão 1: `SqliteMemoryStore` separado, mesmo arquivo

**Decisão**: Classe `src/memory/memory-store.ts` (`SqliteMemoryStore`), com `DatabaseSync` própria. Construtor: `process.env.OPSPILOT_DB ?? "./data/opspilot.db"`, cria diretório pai se não for `:memory:`, DDL só de `memories`. Não altera `OpsStore`, `ConversationStore` nem tabelas existentes.

No open: `PRAGMA foreign_keys = ON` e `PRAGMA busy_timeout = 5000`.

**Rationale**: Espelha o padrão de `SqliteConversationStore` / `SqliteOpsStore`. Escopo distinto (fatos por usuário vs mensagens vs operações). Duas/três conexões no mesmo arquivo convivem no processo único; o timeout cobre contenção.

**Alternatives considered**:
- Métodos de memória dentro de `SqliteConversationStore` — mistura fio de chat com fatos de longo prazo.
- Banco SQLite separado — foge do “mesmo arquivo” da spec.
- Vetor store externo (Chroma, etc.) — fora da stack e do pedido.

---

## Decisão 2: Nome do módulo `memory-store.ts` (não `memory-story`)

**Decisão**: Arquivo `src/memory/memory-store.ts`. O pedido citou `memory-story.ts`; trata-se do store de memória.

**Rationale**: Alinha com `MemoryStore` da spec e com `sqlite-*-store.ts` do projeto. `story` seria ambíguo.

**Alternatives considered**:
- Literal `memory-story.ts` — só preserva o typo do pedido.

---

## Decisão 3: Embeddings via `@huggingface/transformers`, lazy singleton

**Decisão**:
- Dependência nova: `@huggingface/transformers`
- Modelo: `Xenova/all-MiniLM-L6-v2` (ONNX do all-MiniLM-L6-v2, 384 dims)
- `src/memory/embeddings.ts`: lazy singleton — `pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2")` na primeira chamada; reuso depois
- Cada embed: `{ pooling: "mean", normalize: true }` → `Float32Array` / `number[]` de comprimento 384
- Interface injetável `Embedder = { embed(text: string): Promise<Float32Array> }` no store, para testes de dedup/ranking com vetores fake

**Rationale**: Spec e Assumptions fixam biblioteca, pooling, normalize e singleton. Vetores unitários fazem produto interno = cosseno. Injeção permite suíte rápida sem baixar o modelo em todo teste; um ensaio semântico usa o modelo real.

**Alternatives considered**:
- Chamada remota de embedding — contradiz “local” e a constituição (sem segredo/rede extra no caminho feliz dos testes).
- Carregar o pipeline no boot — atrasa `npm run dev` e testes que não precisam de embedding.
- CLS pooling — spec pede mean.

---

## Decisão 4: BLOB = `Buffer` de Float32 little-endian

**Decisão**: Coluna `embedding BLOB NOT NULL`. Serialização: `Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength)` (384 × 4 = 1536 bytes). Leitura: `new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)`. Sem JSON de floats.

**Rationale**: Compacto, round-trip exato, prepared statements do `node:sqlite` aceitam `Buffer`.

**Alternatives considered**:
- TEXT JSON — maior e mais lento no scoring.
- tabela de dimensões — overkill para 384 floats por fato.

---

## Decisão 5: Limiares e ranking em funções puras

**Decisão** (em `src/memory/similarity.ts` ou no próprio store, funções exportadas puras):

| Constante | Valor | Uso |
|-----------|-------|-----|
| `DEDUP_THRESHOLD` | `0.92` | *remember*: se `max(dot) > 0.92` com fato do mesmo `userId`, não inserir |
| `RECALL_MIN_SCORE` | `0.3` | *recall*: descartar `score < 0.3` |
| `RECALL_TOP_K` | `3` | *recall*: no máximo 3 |

- `dot(a, b)` = produto interno
- *recall*: embed consulta → carregar fatos do `userId` → scores → filtrar ≥ 0,3 → ordenar por score DESC, empate `created_at` ASC, depois `id` ASC → slice(0, 3)
- *remember*: embed fato → se algum existente com dot > 0,92, devolver o existente (sem insert); senão insert e devolver o novo

**Rationale**: Spec fixa os números. Empate determinístico evita flaky tests. Puro = testável sem SQLite.

**Alternatives considered**:
- Índice ANN (HNSW) — desnecessário na escala de um plantão (dezenas/centenas de fatos por usuário).
- Dedup ≥ 0,92 em vez de > 0,92 — a spec diz **maior que** 0,92.

---

## Decisão 6: API do store e erros de domínio

**Decisão**:

```ts
type MemoryRecord = {
  id: string;
  userId: string;
  fact: string;
  createdAt: number;
};

type RecalledMemory = MemoryRecord & { score: number };

interface MemoryStore {
  remember(userId: string, fact: string): Promise<MemoryRecord>;
  recall(userId: string, query: string): Promise<RecalledMemory[]>;
  forget(userId: string, memoryId: string): void; // sync delete após validação
}
```

- `id`: `crypto.randomUUID()` TEXT PK
- Fato / `userId` em branco (`trim` vazio) → `InvalidMemoryInputError` antes de embed/SQL
- *forget* com id inexistente ou de outro `userId` → `MemoryNotFoundError`
- Falha ao carregar/rodar o modelo → `EmbeddingUnavailableError` (domínio); HTTP que dependa de embed traduz na borda se o turno de chat precisar de recall

*forget* pode ser síncrono (só SQL). *remember* / *recall* são async por causa do embed.

**Rationale**: Espelha erros de conversa. Escopo `userId` + `id` no DELETE evita apagar fato alheio.

**Alternatives considered**:
- *forget* só por id global — quebraria isolamento se ids vazassem entre usuários.
- HTTP dedicado a remember/forget nesta feature — Assumptions: gravação via store; canal só injeta recall. Ferramentas/HTTP de escrita ficam fora do escopo do plan (podem aparecer em feature seguinte).

---

## Decisão 7: Composição do prompt — bloco de memória antes do histórico

**Decisão**: Função pura `renderMemoryPrompt(facts: { fact: string }[]): string`:

```text
Memória do plantonista:
- <fato1>
- <fato2>
- <fato3>
```

(vazio → `""`). Em `runChat`, quando há `userId`:

1. `recalled = await memoryStore.recall(userId, message)`
2. `memoryBlock = renderMemoryPrompt(recalled)`
3. `history = renderHistoryPrompt(window)` (como hoje)
4. `prompt = memoryBlock ? `${memoryBlock}\n\n${history}` : history`

Sem `userId`: sem recall, prompt = só histórico (comportamento atual). Estratégias continuam recebendo uma string; não conhecem o MemoryStore.

Pedido vazio: sem recall, sem gravação (atalho atual).

**Rationale**: Spec pede fatos distinguíveis no texto composto. Prefixo “Memória do plantonista” não colide com rótulos `Plantonista:` / `Copiloto:`. Ordem: memória de longo prazo → fio recente.

**Alternatives considered**:
- Injetar só na última linha do plantonista — mistura fato com a fala do turno.
- Estratégia buscar memória — a spec diz composição antes da estratégia.

---

## Decisão 8: `userId` no HTTP

**Decisão**: Zod: `userId: z.string().trim().min(1).optional()`. Omitido → sem memória. `""`, `"   "`, número, `null` → 400 com `issues`. Não há 404 de usuário (não existe cadastro de usuário).

Ordem de desfechos permanece: 400 → 422 → 404 (conversa) → execução (com recall se `userId`).

`createApp` recebe `memoryStore?: MemoryStore`; produção instancia `new SqliteMemoryStore()` (mesmo path env).

**Rationale**: Spec: opcional; vazio inválido. Sem entidade User.

**Alternatives considered**:
- Exigir `userId` sempre — quebraria clientes atuais do canal.
- Validar formato UUID — desnecessário; é chave opaca de escopo.

---

## Decisão 9: Estratégia de testes

**Decisão**:
1. **Puros**: `dot`, ranking/dedup thresholds com vetores fabricados — sem modelo, sem SQLite.
2. **Store `:memory:`** com `Embedder` fake determinístico — remember/dedup/recall/forget/isolamento.
3. **Ensaio semântico real** (um teste): modelo `Xenova/all-MiniLM-L6-v2`, fato “o cluster de pagamentos é o azul” vs consulta “qual cor do ambiente de payments?” — espera score ≥ 0,3 e fato no top. Timeout generoso; cache Hugging Face no ambiente do desenvolvedor/CI.
4. **`POST /chat`**: substituto de estratégia; MemoryStore `:memory:` + embedder fake (ou real só no ensaio 3); com/sem `userId`; 400 para `userId` inválido; prompt contém bloco de memória quando há recall.

Arena/bench: sem mudança de fluxo.

**Rationale**: SC-003 exige o ensaio sem palavra em comum; o restante da suíte não pode depender de download a cada caso.

**Alternatives considered**:
- Todos os testes com modelo real — lento e frágil em CI frio.
- Mockar o ensaio semântico — não valida SC-003 de verdade.

---

## Decisão 10: Sem *remember* automático no `/chat`

**Decisão**: `/chat` só *recall* + injeta. *remember* / *forget* são API do store (e testes). Nenhum endpoint novo nesta feature.

**Rationale**: Assumptions da spec. Escopo fechado: memória no prompt do plantão, não CRUD HTTP completo.

**Alternatives considered**:
- Tools LangChain remember/forget no agente — fora do texto do pedido desta feature; pode ser converge/feature seguinte.
