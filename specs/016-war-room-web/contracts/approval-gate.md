# Contract: Gate de aprovação humana (tools)

## Conjunto marcado (MVP)

```ts
TOOLS_REQUIRING_HUMAN_APPROVAL: ReadonlySet<ToolName> = new Set([
  "open_incident",
  "resolver_incident",
]);
```

Helper puro: `requiresHumanApproval(tool: string): boolean`.

## Onde aplica

Nos loops de tool call de **ReAct** e **Plan-and-Execute** (e reflexão que os envolve): **antes** de `invoke` da tool selecionada.

## Comportamento

| Situação | Ação |
|----------|------|
| Tool ∉ set | Invoke normal; observation no trace; segue o loop |
| Tool ∈ set | **Não** invoke; cria `PendingApproval`; retorna `ChatOutcome` `pending_approval`; HTTP 202 |
| Nenhuma tool gated no turno | Sempre caminho `completed` / 200 |

## Trace no pause

Incluir o evento `action` com `tool` + `args` **antes** de pausar (a UI mostra o que seria feito). Não incluir `observation` da tool até approve/deny.

## Testabilidade

- Injetar strategy/registry fake que emite pending sem LLM.
- Ou: harness de tool loop unitário com `requiresHumanApproval` + stub de invoke que falha se chamado no path gated.

## Fora do MVP

- Checkpointer LangGraph / `interrupt()`.
- Marcar tools via metadata LangChain genérica (pode evoluir; MVP = set explícito).
- Gate em `forget_preference` ou tools só-leitura.
