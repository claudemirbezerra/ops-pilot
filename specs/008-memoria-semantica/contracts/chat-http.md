# Contract: POST /chat com userId e memória

Estende [specs/007-conversa-persistente/contracts/chat-http.md](../../007-conversa-persistente/contracts/chat-http.md). Onde este arquivo não fala, 007 (e 003) continuam valendo.

Store: [memory-store.md](./memory-store.md). Prompt: [data-model.md](../data-model.md).

## Pedido — campo novo

| Campo | Obrigatório | Tipo |
|-------|-------------|------|
| `userId` | não | string não vazia depois de `trim` |

Demais campos (`message`, `strategy`, `reflect`, `conversationId`) inalterados.

Exemplos:

```json
{ "message": "qual cor do ambiente de payments?", "userId": "plantonista-42" }
```

```json
{ "message": "listar alertas", "conversationId": "…", "userId": "plantonista-42" }
```

`userId` numérico, `null`, `""` ou `"   "` → **400** com `issues`, sem executar, sem recall, sem gravar conversa/memória.

Omitido → comportamento 007 (sem recall).

## Ordem (atualizada)

1. JSON ilegível → 400.
2. Schema do corpo (incl. `userId`) → 400.
3. Estratégia desconhecida → 422 (sem olhar conversa nem memória).
4. `conversationId` desconhecido → 404.
5. Mensagem em branco → 200 vazio, `historyMessages` 0, **sem** recall, sem gravar.
6. Se `userId` presente: `recall(userId, message)` → bloco de memória.
7. Compor prompt = `[memória?]\n\n` + histórico (janela 12) → executar estratégia.
8. 200: gravar conversa como em 007. **Não** chama *remember* automaticamente.
9. 504: store de conversa e de memória iguais ao início do pedido.

Falha de embedding no passo 6 → erro de domínio traduzido na borda (5xx distinto de 504; mensagem estável). Não grava conversa nem inventa fatos.

## Texto entregue à estratégia

Com recall não vazio:

```text
Memória do plantonista:
- o cluster de pagamentos é o azul

Plantonista: qual cor do ambiente de payments?
```

Com histórico prévio e memória:

```text
Memória do plantonista:
- o cluster de pagamentos é o azul

Plantonista: listar alertas
Copiloto: …
Plantonista: e a cor do ambiente?
```

Sem `userId` ou recall vazio: igual ao contrato 007 (só histórico).

ReAct / Plan-and-Execute / reflexão recebem essa string já composta. Não abrem o MemoryStore.

## 200

Corpo igual ao 007 (`answer`, `trace`, `metrics` com `historyMessages`, `conversationId` quando houver). **Não** há campo novo obrigatório de memórias no JSON de resposta nesta feature. `historyMessages` continua contando só a janela de conversa (não conta linhas do bloco de memória).

## createApp

Opção nova: `memoryStore?: MemoryStore`. Default de produção: `new SqliteMemoryStore()`. Testes: `:memory:` + embedder fake (exceto o ensaio semântico real).

## Fora deste contrato

- `POST` de *remember* / *forget*
- Métrica `recalledMemories` (opcional em converge; não exigida pela spec)
- Mudança em arena / bench
