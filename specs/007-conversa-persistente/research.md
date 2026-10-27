# Research: Conversa persistente

**Phase 0 output for** `specs/007-conversa-persistente/plan.md`

---

## Contexto

O `POST /chat` (`src/services/chat-service.ts`, `src/http/server.ts`) executa uma estratégia com a string crua e devolve `answer`, `trace` e `metrics` (`llmCalls`, `latencyMs`). Não há conversa. `SqliteOpsStore` persiste operações num `DatabaseSync` próprio, com DDL idempotente e prepared statements. Arena e bench chamam as estratégias direto e não passam pelo canal. Esta fase fecha onde mora o histórico, o formato do identificador, a janela de 12 e o que os testes atuais precisam passar a observar.

---

## Decisão 1: `SqliteConversationStore` separado, mesmo arquivo

**Decisão**: Nova classe `src/store/sqlite-conversation-store.ts`, com conexão `DatabaseSync` própria. O construtor usa `process.env.OPSPILOT_DB ?? "./data/opspilot.db"`, cria o diretório pai quando o path não é `:memory:`, e só executa DDL de `conversations` e `messages`. Não altera `OpsStore` nem as tabelas operacionais.

No open: `PRAGMA foreign_keys = ON` e `PRAGMA busy_timeout = 5000`.

**Rationale**: A spec pede um guarda com `create` / `append` / `lastMessages` no padrão do `SqliteOpsStore`, não métodos novos de alerta/incidente. Duas conexões no mesmo arquivo convivem no processo único; o timeout cobre o caso em que o turno da estratégia ainda segura a outra conexão. O DDL novo não apaga o Mercadinho.

**Alternatives considered**:
- Métodos de conversa dentro de `SqliteOpsStore` / `OpsStore` — misturaria plantão operacional com chat e forçaria arena/bench a conhecer conversa.
- Uma única `DatabaseSync` compartilhada — exige abrir o ops store só para testar mensagens e acopla ciclos de vida. `:memory:` nem seria o mesmo banco entre duas instâncias.
- Banco separado da conversa — foge do “mesmo arquivo” da spec e duplica configuração.

---

## Decisão 2: Tabela `conversations` além de `messages`

**Decisão**: `create()` insere uma linha em `conversations` (`id` TEXT, `created_at` INTEGER) e devolve o id com a conversa vazia. `messages` referencia esse id. `lastMessages` numa conversa vazia devolve `[]`. Id ausente lança `ConversationNotFoundError` — não se confunde com conversa vazia.

**Rationale**: A spec exige conversa que nasce vazia e 404 para id desconhecido. Sem linha de conversa, o id só existiria depois da primeira mensagem e o 404 ficaria indistinguível de “ainda não houve fala”.

**Alternatives considered**:
- Só `messages`, id gerado no cliente ou na primeira fala — não há como `create()` devolver um fio vazio persistido.
- Sentinela na primeira mensagem — vaza para o prompt se a leitura não filtrar.

---

## Decisão 3: Identificador opaco em texto

**Decisão**: `crypto.randomUUID()` guardado como `TEXT PRIMARY KEY`. No HTTP, `conversationId` é string. Zod: `z.string().trim().min(1).optional()`. Texto vazio, só espaços, número ou `null` → 400. Qualquer texto não vazio que não exista → 404. Não se valida formato UUID na borda.

**Rationale**: O contrato da spec é “texto estável que o cliente devolve”. UUID evita o número JSON que cairia em 400 e não é sequencial adivinhável. Recusar só o formato na borda transformaria id legado ou de teste em 400 em vez de 404.

**Alternatives considered**:
- Inteiro autoincremento, como incidentes — no JSON vira número e a spec trata número como 400; sequencial é fácil de varrer.
- Exigir UUID no Zod — ids bem formados porém ausentes e ids “feios” deixariam de ser o mesmo 404.

---

## Decisão 4: Falantes `user` e `assistant`; rótulos no prompt

**Decisão**: Coluna `role` com `CHECK (role IN ('user', 'assistant'))`. A API do store rejeita outro falante e texto em branco (`trim` vazio) com `InvalidConversationMessageError` antes do `INSERT`. O prompt traduz `user` → `Plantonista` e `assistant` → `Copiloto`.

**Rationale**: O domínio fechado segue o CHECK do guarda operacional. Os rótulos em português são o que o plantonista e o modelo distinguem; o token persistido fica estável e curto. O `answer` gravado é o texto da estratégia, não o rastro.

**Alternatives considered**:
- Gravar `plantonista` / `copiloto` — acopla rótulo de prompt ao schema.
- Gravar o trace — a spec exclui o rastro da conversa.

---

## Decisão 5: Ordem por `id`, janela pura de 12

**Decisão**: `messages.id INTEGER PRIMARY KEY AUTOINCREMENT`. `lastMessages` faz `ORDER BY id DESC LIMIT ?` e o store devolve a lista já em ordem cronológica (mais antiga primeiro). Índice `(conversation_id, id)`.

A composição é pura, em `src/services/history-prompt.ts`:

- `HISTORY_LIMIT = 12`
- `selectHistoryWindow(prior, currentText)` acrescenta `{ role: "user", content: currentText }` e fica com os últimos 12 (`slice`)
- `renderHistoryPrompt` junta linhas `Rótulo: conteúdo` com `\n`

O service pede `lastMessages(id, 12)` (ou `[]` se não há id), aplica a janela e só então chama a estratégia com **essa string**. `historyMessages` é o tamanho da janela. A resposta produzida neste turno não entra nela.

Com 12 mensagens já gravadas, a leitura traz as 12 mais novas; a janela descarta a mais antiga delas ao entrar o pedido atual. Mensagens mais velhas que essas 12 nem saem do store.

**Rationale**: `id` monotônico desempata relógio. A conta “12 incluindo o pedido atual” fica testável sem SQLite. A estratégia continua `run(input: string)` — ReAct, Plan-and-Execute e a reflexão recebem o mesmo texto e não conhecem o store de conversa.

**Alternatives considered**:
- Empurrar histórico como mensagens LangChain dentro de cada grafo — duplica a composição e foge do “via composição” antes da estratégia.
- 12 anteriores **mais** o pedido (13 no prompt) — a spec limita o texto a 12, com o pedido atual dentro da janela.
- Ordenar só por `created_at` — empata no mesmo milissegundo.

---

## Decisão 6: Quando gravar, e o pedido vazio

**Decisão**: Ordem no `runChat`:

1. Resolver estratégia (nome desconhecido → `UnknownStrategyError`, 422). O store de conversa não é lido.
2. Se veio `conversationId`, `lastMessages` (existência). Ausente → `ConversationNotFoundError`, 404.
3. Se `isBlankInput(message)`, devolver `buildEmptyInputResult()` com `historyMessages: 0`, sem `strategy.run` e sem `append`. Id existente é ecoado; id omitido não cria conversa.
4. Compor e correr a estratégia na corrida com o timeout já existente.
5. Só se a corrida devolver o resultado: `create()` quando não havia id; `append` do pedido (`user`); `append` do `answer` (`assistant`). Depois responder.

504 não cria conversa e não acrescenta mensagem. O `append` tardio da estratégia que perde a corrida não roda, porque a gravação está no caminho que ganha a corrida — o mesmo ponto em que o canal hoje devolve 200.

**Rationale**: A spec fixa 400, depois 422, depois 404, e gravação só no 200 executado. O pedido vazio precisa ser barrado no service: o texto composto (`Plantonista:    `) não seria branco, e o substituto de teste não implementa `isBlankInput`. O atalho reproduz `buildEmptyInputResult` (sem modelo e sem crítico).

**Alternatives considered**:
- Gravar o pedido antes da estratégia e apagar no 504 — deixa lixo se o processo cair e complica o 404.
- Delegar o pedido vazio à estratégia — o substituto executaria e o rótulo estragaria o atalho das estratégias reais.
- Uma transação única no lugar de dois `append` — a spec pede a operação `append` de uma mensagem. Os dois `append` acontecem antes do `res.json`. Falha entre eles fica fora do escopo.

---

## Decisão 7: `historyMessages` só no resultado do canal

**Decisão**: `StrategyResult.metrics` continua `{ llmCalls, latencyMs }`. O resultado de `runChat` acrescenta `historyMessages` e `conversationId?`. O 200 do HTTP serializa os três números. `JSON.stringify` omite `conversationId` quando é `undefined` (pedido vazio sem id).

**Rationale**: Arena, bench, reflexão e `runWithMetrics` não conhecem conversa. Contar a janela dentro da estratégia multiplicaria o número nas regenerações da reflexão. A spec manda contar uma vez por turno, na composição.

**Alternatives considered**:
- Campo obrigatório em `Metrics` — todo fake, reflexão e bench passariam a preencher um dado que não produzem.
- Somar `historyMessages` na reflexão — quebra “uma vez por turno”.

---

## Decisão 8: Testes atuais do canal passam a ver o texto composto

**Decisão**: `createApp` ganha `conversationStore?`. Os `createApp` de `src/http/server.test.ts` recebem `new SqliteConversationStore(":memory:")`. No primeiro turno, o substituto recebe `Plantonista: <mensagem>` e o 200 inclui `conversationId` e `metrics.historyMessages === 1`. Asserts que comparam o eco cru (`react:listar alertas`, `plan-and-execute:abrir incidente`, `react:com extra`, `react:rapido`) acompanham esse prefixo. Dois POST sem id continuam em conversas distintas, então mensagens iguais ainda geram a mesma resposta.

Não há `InMemoryConversationStore`. Arena/bench não são alterados para “não usar conversa”: eles nunca chamam `runChat`.

**Rationale**: O default de produção abriria `./data/opspilot.db` dentro do teste. A spec pede a conferência em `:memory:`. O primeiro turno tem uma mensagem só, mas o falante tem de ser distinguível — o texto não pode permanecer a string crua.

**Alternatives considered**:
- Store em arquivo temporário para simular reinício — a spec manda teste em `:memory:`. O reinício no mesmo path é o mesmo `DatabaseSync` do guarda operacional e fica no quickstart.
- Manter o eco cru no primeiro turno — não dá para distinguir o plantonista, que a spec exige já na primeira mensagem.
