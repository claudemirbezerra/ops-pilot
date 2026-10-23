# Research: Canal de chat

Todas as escolhas abaixo fecham o desenho. Não resta `NEEDS CLARIFICATION` no contexto técnico.

## 1. Onde vive o catálogo

- **Decision**: O catálogo do canal fica em `src/agents/index.ts`. Nomes públicos: `react` e `plan-and-execute`, apontando para as estratégias já exportadas. `reflect: true` chama `wrapWithReflection` com o nome composto interno (`reflect:react` ou `reflect:plan-and-execute`) e o crítico recebido. A borda HTTP fica em `src/http/server.ts`. `src/index.ts`, hoje vazio, só chama `listen`.
- **Rationale**: O pedido bruto citou `src/agent/index.ts`, mas o núcleo já está em `src/agents/`. Uma pasta paralela `src/agent/` dividiria o mesmo conceito. A spec exige catálogo nome → estratégia e reflexão pela camada existente; o arquivo de índice do pacote que já existe cumpre isso. `src/http/server.ts` é o caminho que o pedido aceita para o Express.
- **Alternatives considered**: Criar `src/agent/index.ts` ao pé da letra (rejeitado: segundo lar para as mesmas estratégias). Colocar o mapa dentro de `src/http/server.ts` (rejeitado: a borda passaria a conhecer reflexão e deixaria de ser só tradução HTTP). Reutilizar o mapa da arena, que inclui `reflect:*` (rejeitado: a spec trata esses nomes como 422 neste canal).

## 2. Zod na borda e 422 fora do schema

- **Decision**: O schema é `z.object({ message: z.string(), strategy: z.string().optional(), reflect: z.boolean().optional() })`. Chaves desconhecidas são descartadas (padrão do objeto Zod). `strategy` ausente vira `react` depois do parse. `reflect` ausente vira `false`. String vazia, caixa diferente e `reflect:react` passam do Zod (são string) e o catálogo responde `UnknownStrategyError` → 422. Tipo errado, `message` ausente, corpo ausente ou JSON ilegível → 400.
- **Rationale**: A spec separa corpo inválido de nome desconhecido e manda texto vazio de estratégia para o 422. Um `z.enum` transformaria `""` e `reflect:react` em 400. Validar tipo na fronteira e pertinência no domínio segue os princípios III e IV.
- **Alternatives considered**: Enum Zod com os dois nomes (rejeitado: 400 no lugar de 422). Tratar string vazia como omitida e cair em `react` (rejeitado: a spec marca 422). Rejeitar chaves extras com `.strict()` (rejeitado: a spec manda ignorá-las).

## 3. Forma dos corpos de erro

- **Decision**: 400 é `{ issues }`, e `issues` é o array `ZodError.issues` sem reformatar. Cada item expõe pelo menos `path` (array) e `message` (string); os demais campos do Zod podem ir junto. JSON ilegível vira 400 com um item sintético `{ path: [], message: "JSON inválido." }`. 422 é `{ message: "Estratégia desconhecida: <nome>." }`, o texto já usado por `UnknownStrategyError`. 504 é `{ message: "Tempo esgotado: a resposta não ficou pronta em <segundos> segundos." }`. Nenhum desses três traz `answer`, `trace` ou `metrics`.
- **Rationale**: A spec pede os `issues` da validação de fronteira e deixa o miolo de cada item para o plano, desde que o problema seja identificável. Devolver o array do Zod cumpre o pedido bruto sem inventar um DTO. 422 e 504 não reutilizam `issues`. O nome rejeitado cabe na frase que a arena já usa.
- **Alternatives considered**: Mapear `issues` para `{ field, reason }` (rejeitado: esconde o relatório que a spec quer). Usar `issues` também no 422 (rejeitado: a spec separa os desfechos). Corpo vazio no 504 (rejeitado: o plantonista precisa saber que a espera acabou).

## 4. Limite de 180 segundos sem travar o teste

- **Decision**: O padrão de `createApp()` e de `npm run dev` é `180_000` ms. O serviço faz `Promise.race` entre `strategy.run` e um timer. Se o timer ganha, lança `ChatTimeoutError` e a borda responde 504. A promise da estratégia não é cancelada; um `catch` evita rejeição tardia não tratada, e o resultado tardio não é escrito na resposta. Testes passam `timeoutMs` curto (dezenas de milissegundos) com um substituto que não resolve.
- **Rationale**: A spec fixa 180 segundos para o plantonista e pede conferência sem rede. Esperar três minutos na suíte quebra o fluxo de `npm test`. Injetar o limite mantém o relógio real no serviço e o número de produção no processo de `dev`. Não cancelar o trabalho segue a premissa da spec.
- **Alternatives considered**: `setTimeout` de 180 s no teste (rejeitado: a suíte deixa de ser prática). Fake de relógio global (rejeitado: mais acoplamento do que um parâmetro da fábrica). Abortar a estratégia no 504 (rejeitado: a spec não exige cancelamento, e as bases não têm aborto comum).

## 5. Prova offline do contrato

- **Decision**: `createApp` aceita catálogo, crítico e `timeoutMs`. O teste sobe `listen(0)` em `127.0.0.1` e chama `fetch`. O catálogo do ensaio aponta `react` (e, quando o caso pedir, `plan-and-execute`) para uma estratégia que devolve sempre o mesmo `StrategyResult` e registra se `run` foi chamado. Reflexão ligada usa um crítico substituto que aprova; o 200 traz um evento `critique`. Reflexão desligada não traz `critique` e não chama o crítico. 400 não chama `run`. 422 não chama `run`. Nada disso importa o modelo nem abre socket externo.
- **Rationale**: A spec (US6, FR-014, SC-006) pede substituto determinístico e ausência de rede. Ouvir numa porta efêmera evita depender de 3000 e de biblioteca nova. O catálogo de produção não ganha o nome do substituto: o ensaio injeta o mapa.
- **Alternatives considered**: Supertest ou undici como dependência (rejeitado: `fetch` do Node 22 basta). Testar só funções puras sem HTTP (rejeitado: a spec pede integração do canal). Apontar o teste para OpenRouter (rejeitado: rede e não determinístico).

## 6. Opções de execução que não entram no corpo

- **Decision**: Cada `run` do canal usa `maxIterations: 8` e, quando há reflexão, `maxReflections: 2`. Os dois números não são campos do pedido. Mensagem em branco segue `isBlankInput` / `buildEmptyInputResult` dentro da estratégia ou do envoltório e responde 200, sem modelo.
- **Rationale**: A spec não abre teto no corpo e manda reutilizar o padrão da reflexão (2). O 8 é o padrão já usado na arena. Pedido vazio já está especificado no núcleo e na camada de reflexão.
- **Alternatives considered**: Aceitar `maxIterations` no JSON (rejeitado: fora da spec). Usar outro teto só no HTTP (rejeitado: o plantonista veria um ReAct diferente do da arena).

## 7. Processo que `npm run dev` sobe

- **Decision**: `src/index.ts` cria o app com os padrões de produção e escuta em `127.0.0.1`. Porta: `PORT` do ambiente do processo, ou 3000. O arquivo `.env` não é lido. Ao escutar, o processo escreve uma linha com o endereço e permanece no ar. O guarda `import.meta.url` evita o `listen` quando o módulo é importado por teste — o teste importa `createApp` de `src/http/server.ts`.
- **Rationale**: Hoje `npm run dev` executa um `src/index.ts` vazio e termina. O canal só é utilizável se o processo ficar escutando. Loopback segue segurança por padrão. O mesmo padrão de entrada da arena impede que o teste dispare o servidor de produção.
- **Alternatives considered**: Escutar em `0.0.0.0` (rejeitado: expõe o canal sem autenticação, e autenticação está fora desta feature). Exigir `PORT` sem padrão (rejeitado: `npm run dev` voltaria a parecer mudo ou falharia sem motivo). Ler `.env` (rejeitado: a constituição proíbe).
