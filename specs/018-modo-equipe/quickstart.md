# Quickstart: Modo equipe

Validação depois de implementar [plan.md](./plan.md). Contratos: [contracts/](./contracts/). Modelo: [data-model.md](./data-model.md).

Sem OpenRouter. Supervisor, papéis e roteador dos cenários abaixo são substitutos.

## Pré-requisitos

- Node 22+
- Na raiz: `npm install`
- Em `web/`: `npm install`

## 1. Typecheck e testes

Na raiz:

```bash
npm run typecheck
npm test
```

Em `web/`:

```bash
npm run typecheck
npm test
```

Esperado: os dois pares verdes.

## 2. Quadro, papéis e teto (sem grafo de produção)

Conferir as funções puras e um grafo de equipe com portas falsas:

- Analista não altera `plan`. As únicas ferramentas invocáveis são `list_alertas`, `list_incidents`, `consultar_runbook` e `check_provider_status`. O prompt contém `Relate apenas fatos. Não proponha abertura, resolução, plano de passos nem próxima ação.`
- Planejador não invoca ferramenta. O prompt contém `Não chame ferramentas.` Passos válidos viram `plan` no quadro e um evento `plan`. Lista vazia ou passo em branco rejeita com `Não foi possível cumprir o papel.`
- Executor só pode pedir `open_incident` e `resolver_incident`. O prompt contém `Não contorne a aprovação humana.` O pedido para na espera, o store não ganha incidente, e o rastro tem o `handoff` do executor mais o `action`.
- Nome fora da allowlist não é invocado e a observação é `Ferramenta indisponível para este papel.`
- Oito decisões sem `encerrar`: o oitavo papel roda, não há nona chamada ao supervisor, a resposta é `Teto de iterações atingido antes de concluir o raciocínio. (máximo: 8).`
- A oitava decisão `encerrar` devolve o `brief`, não o aviso de teto.
- `next` inválido ou `brief` vazio: nenhum `handoff` dessa decisão, mensagem `Não foi possível decidir o próximo papel.`
- Cada `handoff` traz `node` `team`, o `next` e o `brief`, e aparece antes dos eventos daquele papel.

## 3. Rota no chat

Com registry e roteador injetados, mensagem não vazia:

- `strategy: "team"` → um evento `route` com `override: true`, motivo `Estratégia informada no pedido.`, `node: "router"`. O `decide` do roteador não roda. `react`, `plan-and-execute` e `reflection` não rodam. `reflect: true` não chama o crítico.
- Sem `strategy`, roteador falso devolvendo `team` → só a equipe roda, `override: false`.
- `strategy: "Team"` → 422 citando `Team`.
- Mensagem em branco com `strategy: "team"` → aviso de pedido vazio, sem `route` e sem `handoff`.
- Supervisor falso ilegível → 502 `{ message: "Não foi possível decidir o próximo papel." }`, distinto de `Não foi possível decidir a rota.`
- Executor falso que pede `open_incident` → 202, `trace` com o `handoff`, incidente ainda ausente no store.

O prompt do roteador contém a linha da rota `team` da spec e a frase `Não invente uma quinta rota.`

## 4. Ver raciocínio

`formatTraceEvent` de um `handoff` com `next` `analista` e `brief` `Ler os alertas em disparo.` devolve `analista: Ler os alertas em disparo.`

`formatTrace` no servidor inclui o bloco `[handoff]` e a mesma linha `analista: Ler os alertas em disparo.`

O painel existente mostra o tipo `handoff` por `event.type`. Não há tela nova para abrir.
