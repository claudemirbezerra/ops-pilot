# Quickstart: Grafo unificado de produção

Validação da feature 013. Contratos: [contracts/production-graph.md](./contracts/production-graph.md), [contracts/chat-http.md](./contracts/chat-http.md). Modelo: [data-model.md](./data-model.md).

## Pré-requisitos

- Node 22 LTS
- `npm install`
- Testes desta feature não usam OpenRouter. Não ler arquivo `.env`.

## 1. Typecheck e suíte

```bash
npm run typecheck
npm test
```

Esperado: ambos verdes.

A suíte nova cobre, sem rede:

- `ROUTER_PROMPT` contém as três linhas da tabela e nenhuma quarta rota.
- Carimbo: todo evento fica com o `node` pedido; evento `route` de override usa o motivo fixo.
- `resolveProductionStrategy`: rota `reflection` envolve só ReAct; `reflect: true` nessa rota não cria segundo ciclo; nas bases, `reflect: true` envolve a base e o `node` continua sendo a rota.
- Grafo com fakes: uma estratégia roda; as outras duas não; `route` vem antes; override não chama `decide`; decisão inválida não chama `run`.
- HTTP: 422 cita o nome e não executa; 502 devolve `Não foi possível decidir a rota.`; mensagem em branco com `strategy` desconhecida responde 200 com o aviso vazio e `node: "response"`, sem evento `route`.
- Turno sem `strategy` usa o roteador injetado (não o modelo) e soma `llmCalls` / `promptTokens` da decisão.

Testes de chat que hoje omitem `strategy` e esperam o fake `react` passam a injetar um roteador que devolve `react`. Isso não é default de produção.

## 2. Foco nos arquivos novos

Depois de implementados:

```bash
node --import tsx --test src/agents/production-route.test.ts src/agents/production-graph.test.ts
```

Esperado: os casos do passo 1 que moram nesses arquivos passam. O 502 e o 422 continuam em `src/http/server.test.ts`.

## 3. O que não regressar

- `strategy` numérica ou `reflect` com tipo errado → 400, sem execução.
- `strategy: "nope"` com mensagem não vazia e `conversationId` inexistente → 422, não 404.
- Mensagem em branco com `conversationId` inexistente → 404.
- Arena (`npm run arena`) segue escolhendo estratégia pelo nome, sem este grafo.
- Orçamento de contexto: o prompt da estratégia ainda sai de `buildContext`.

## 4. Smoke manual (opcional, com modelo)

Só com `OPENROUTER_API_KEY` e `OPENROUTER_MODEL` no ambiente do processo, não via leitura de arquivo `.env` pelo código:

1. `npm run dev`
2. `POST /chat` só com `message` de uma consulta direta → 200, primeiro evento `type: "route"`, `override: false`, `node` em todos os eventos, uma estratégia só.
3. O mesmo pedido com `"strategy": "plan-and-execute"` → `override: true`, `reason` = `Estratégia informada no pedido.`, e o roteador automático não entra no custo.
4. `"strategy": "reflect:react"` → 422 citando esse nome.
