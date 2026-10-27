# Contract: forget_preference

Ferramenta LangChain do inventário Ops para remover uma preferência/fato por descrição semântica. Reusa `MemoryStore.recall` + `forget` (008).

## Registro

- **Nome**: `forget_preference`
- **Onde**: `createOpsTools(opsStore, { memoryStore?, userId?, ... })`
- **Quando disponível**: sempre no array de tools (react / plan-and-execute)
- **Contexto**: `userId` e `memoryStore` vêm de `StrategyOptions` → `createOpsTools` deps (não do schema da tool)

## Schema de entrada

```ts
z.object({
  description: z
    .string()
    .trim()
    .min(1)
    .describe("Descrição da preferência ou fato a esquecer"),
});
```

## Algoritmo

1. Se `userId` ausente/blank **ou** `memoryStore` ausente → devolver observação com erro de domínio (`UserIdRequiredError` ou mensagem equivalente); **não** alterar memória.
2. `candidates = await memoryStore.recall(userId, description)`  
   (já: score ≥ 0,3, top 3, mesmo `userId`).
3. Se `candidates.length === 0` → observação JSON `{ "forgotten": false }`.
4. Senão: `top = candidates[0]` (maior score; empate estável do 008).
5. `memoryStore.forget(userId, top.id)`.
6. Observação JSON `{ "forgotten": true, "id": top.id, "fact": top.fact }`.

Erros de domínio do store (`MemoryNotFoundError`, etc.) → `asObservation` (mesmo padrão das outras tools).

## StrategyOptions (extensão)

```ts
type StrategyOptions = {
  // ... existentes
  userId?: string;
  memoryStore?: MemoryStore;
};
```

`runChat` passa `userId` e `memoryStore` quando o turno tem `userId`. Arena/bench tipicamente omitem → tool falha de forma previsível se o modelo a chamar.

## Trace

`ToolName` inclui `"forget_preference"`. Eventos `action` usam esse nome quando a tool é invocada.

## Fora deste contrato

- Esquecer por UUID digitado pelo plantonista (use *forget* interno do store)
- Esquecer em lote / todos os fatos do usuário
- Endpoint HTTP dedicado
- MCP tool espelhada (fora desta feature)
