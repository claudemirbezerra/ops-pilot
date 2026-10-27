# Research: Refletor de aprendizado

**Phase 0 output for** `specs/009-refletor-aprendizado/plan.md`

---

## Contexto

A memória semântica (008) já oferece `MemoryStore` (*remember* / *recall* / *forget*), `userId` no `/chat` e injeção de recall no prompt. A spec 008 assumiu *remember* só explícito. Esta feature acrescenta: (1) extração estruturada pós-resposta `{ hasLearning, fact }` → *remember* assíncrono; (2) ferramenta de agente `forget_preference`. O canal de crítica (`reflection.ts` / `critic.ts`) **não** é reutilizado — é outro “refletor” (aprendizado), com nome distinto para evitar colisão.

---

## Decisão 1: Extrator injetável (padrão Critic) + schema Zod fixo

**Decisão**:

```ts
type LearningDecision = { hasLearning: boolean; fact: string };

type LearningExtractor = {
  extract(userMessage: string): Promise<LearningDecision>;
};
```

- Schema Zod: `z.object({ hasLearning: z.boolean(), fact: z.string() })`
- Implementação LLM: `createModel().withStructuredOutput(schema)` (mesmo padrão de `critic.ts`), system prompt que define fato durável vs pedido pontual vs segredo; **no máximo um** fato por chamada
- Default em produção: `createLlmLearningExtractor()`
- Testes / `createApp`: injetar stub determinístico (como `critic` nos testes de `/chat`)

**Rationale**: Spec fixa os campos. Injeção permite SC-001/SC-002 sem OpenRouter. Espelha Critic → camadas claras e testáveis.

**Alternatives considered**:
- Heurística só por regex — frágil para “durável vs pontual”.
- Extrator acoplado a `runChat` sem interface — impede fixtures determinísticas.
- Reusar o crítico de reflexão — propósitos diferentes (qualidade da resposta ≠ aprendizado).

---

## Decisão 2: Orquestração pós-resposta em `runChat` (fire-and-forget)

**Decisão**: Em `runChat`, **depois** de obter o `StrategyResult` com sucesso e **antes** do `return` (após append na conversa):

1. Se `userId` ausente → não agenda nada.
2. Se mensagem em branco (já short-circuit) → refletor não roda.
3. Caso contrário: `void scheduleLearning({ userId, message, memoryStore, extractor }).catch(...)` — **não** `await`.
4. `scheduleLearning`: `extract` → se `hasLearning && fact.trim()` → `memoryStore.remember(userId, fact.trim())`; senão no-op.
5. Qualquer erro (extract, remember, embedding) é engolido para o cliente: log em `console.error` com prefixo `[learning-reflector]`; a resposta HTTP/JSON já montada permanece.

Timeouts do `/chat` e falhas de estratégia **não** disparam aprendizado (só caminho de sucesso que retorna answer).

**Rationale**: FR-004 / SC-003 exigem que a entrega não espere *remember*. Centralizar em `runChat` cobre HTTP sem duplicar no handler. `void` + `.catch` evita unhandled rejection (padrão já usado com `runPromise.catch` no mesmo arquivo).

**Alternatives considered**:
- Agendar no handler HTTP após `res.json` — atrasaria se outro caller usar `runChat`; menos testável.
- `await remember` em background worker/fila — overkill para processo único.
- Rodar o extrator **antes** da estratégia — atrasa o plantão e mistura com o caminho crítico.

---

## Decisão 3: Gate puro da decisão (antes do *remember*)

**Decisão**: Função pura `shouldRemember(decision: LearningDecision): string | null`:

- `hasLearning === false` → `null` (ignora `fact` preenchido)
- `hasLearning === true` e `fact.trim() === ""` → `null`
- senão → `fact.trim()`

O *remember* só recebe o texto retornado. Dedup (> 0,92) continua 100% no MemoryStore.

**Rationale**: Edge cases da spec viram teste unitário sem LLM nem SQLite. Isola I/O.

**Alternatives considered**:
- Confiar só no LLM — flaky e sem teste do edge `hasLearning: true` + fact vazio.

---

## Decisão 4: Prompt do extrator — regras de conteúdo (não segundo silo)

**Decisão**: System prompt (constante exportada) instrui:

| Classificar | Exemplos |
|-------------|----------|
| **Aprendizado** (`hasLearning: true`) | Preferências estáveis, dono de produto, cluster preferido, handoff |
| **Não** (`false`) | Abrir/resolver incidente, listar alertas, check de provedor, perguntas pontuais |
| **Nunca** | Senhas, tokens, API keys, connection strings com credencial — `hasLearning: false`, `fact: ""` |
| Misto | Extrair **só** o fato durável; omitir pedido e segredo do texto de `fact` |
| Volume | No máximo **um** fato por mensagem |

Sem pré-filtro regex obrigatório nesta feature (defesa em profundidade fica opcional no implement); testes usam stub que simula as classes.

**Rationale**: Spec atribui a classificação ao passo estruturado. Regex de segredo sozinho é incompleto; o contrato testável é o stub + prompt documentado.

**Alternatives considered**:
- Bloquear *remember* se regex de key bater no `fact` — útil como camada extra; adiar para não expandir escopo (pode entrar como tarefa opcional se o time quiser).

---

## Decisão 5: `forget_preference` via tools + contexto no `StrategyOptions`

**Decisão**:

1. Estender `StrategyOptions` com `userId?: string` e `memoryStore?: MemoryStore`.
2. `runChat` passa ambos em `strategy.run(...)` quando `userId` está definido (e sempre pode passar `memoryStore` do input).
3. `createOpsTools(store, deps)` ganha `deps.memoryStore` e `deps.userId` (opcionais).
4. Nova tool `forget_preference`:
   - Input: `{ description: string }` (Zod trim min 1)
   - Sem `userId` ou sem `memoryStore` → observação de erro de domínio (não throw para o grafo); store intacto
   - Com contexto: `recall(userId, description)` → se lista vazia → `{ forgotten: false }`; senão `forget(userId, top.id)` → `{ forgotten: true, id, fact }`
5. `ToolName` / trace: incluir `"forget_preference"`.
6. react e plan-and-execute: ao criar tools, repassar `options.userId` / `options.memoryStore`.

**Rationale**: Spec: localizar por relevância semântica com mín. 0,3 — *recall* já implementa isso; pegar o primeiro do ranking. Reusa *forget* por id. Sem `userId` no turno, falha previsível (FR-012).

**Alternatives considered**:
- Tool só registrada se `userId` presente — o modelo não veria a tool; a spec prefere falha explícita.
- *forget* por id exposto ao plantonista — UX ruim; plantonista fala em linguagem natural.
- Serviço HTTP DELETE de memória — fora do escopo (sem CRUD HTTP novo).

---

## Decisão 6: Nomes de módulo (evitar colisão com reflection)

**Decisão**:

| Peça | Path sugerido |
|------|----------------|
| Extrator LLM + tipo | `src/agents/learning-extractor.ts` (+ `.test.ts` com stub) |
| Gate puro + schedule | `src/services/learning-reflector.ts` (+ `.test.ts`) |
| Tool | dentro de `src/agents/tools.ts` (ou schema em `ops-tool-schemas` / arquivo irmão se crescer) |
| Erro sem userId | `UserIdRequiredError` (ou reutilizar mensagem via `InvalidMemoryInputError` + texto claro) em `domain/errors.ts` |

**Rationale**: `reflection.ts` já é a camada crítica. “learning-*” deixa a intenção óbvia no code review.

**Alternatives considered**:
- `src/agents/reflector.ts` — ambíguo com reflect:*.

---

## Decisão 7: Testes — não-bloqueio e fixtures

**Decisão**:

| Caso | Como |
|------|------|
| Durável → remember | Stub extractor + MemoryStore `:memory:` + fake embedder; após `runChat`, `await` microtask/`setImmediate` e `recall` |
| Pontual / segredo | Stub `hasLearning: false`; zero linhas novas |
| Não bloqueia | `remember` do store mockado com Promise controlada; assert que `runChat` resolve **antes** de `resolveRemember()` |
| Falha async | remember rejeita; `runChat` ainda devolve 200/answer |
| Sem userId | nenhuma chamada ao extractor |
| `forget_preference` | unitário na tool (com/sem userId, hit/miss recall) |
| Trace | action com tool `forget_preference` quando a estratégia fake/real a chama |

Sem chamar OpenRouter na suíte padrão. Arena/bench inalterados (sem learning no fluxo).

**Rationale**: SC-001…SC-007 cobertos sem rede de chat.

**Alternatives considered**:
- Teste e2e só com LLM real — flaky; fica smoke manual opcional no quickstart.

---

## Decisão 8: Sem mudança de schema SQLite / HTTP body

**Decisão**: Nenhuma coluna nova em `memories`. `POST /chat` body inalterado (`userId` já existe). Resposta JSON inalterada (aprendizado não aparece no payload).

**Rationale**: Spec reusa MemoryStore; aprendizado é efeito colateral pós-turno.

**Alternatives considered**:
- Campo `learned: true` na resposta — vazaria timing e expandiria contrato sem pedido.

---

## NEEDS CLARIFICATION

Nenhum restante. Defaults acima fecham FR/SC da spec 009.
