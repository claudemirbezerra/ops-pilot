# Contract: Handoff no rastro

Evento definido em [data-model.md](../data-model.md). O painel não muda de estrutura: `TracePanel` já lista `event.type` e o retorno de `formatTraceEvent`.

## Ver raciocínio (`web/src/lib/trace.ts`)

O tipo local `TraceEvent` ganha:

```ts
{
  type: "handoff";
  next: string;
  brief: string;
  node?: string;
}
```

`formatTraceEvent` desse evento devolve exatamente `` `${next}: ${brief}` ``.

Exemplo: evento `{ type: "handoff", next: "analista", brief: "Ler os alertas em disparo." }` → texto `analista: Ler os alertas em disparo.` O rótulo visível ao lado continua sendo `handoff`, porque o painel imprime `event.type`.

Vários handoffs permanecem na ordem do array. Eventos `action`, `observation` e `plan` do mesmo turno continuam formatados como hoje.

## formatTrace do servidor (`src/agents/trace.ts`)

Para o mesmo evento, o bloco é:

```text
[handoff]
analista: Ler os alertas em disparo.
```

A segunda linha é a mesma forma `{next}: {brief}` da war room. O `switch` precisa do caso novo para o tipo fechar.

## O que não fazer

- Não criar outro painel, outra rota de UI nem outro botão. O botão continua "Ver raciocínio".
- Não omitir `next` ou `brief` num JSON genérico. O texto formatado tem de mostrar os dois.
- Não usar o evento `route` para a passagem entre papéis.
