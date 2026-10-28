# Contract: `conversa-longa.sh`

Script bash na **raiz** do repositório. Smoke manual — não faz parte de `npm test`.

Depende do contrato [chat-http.md](./chat-http.md) (`metrics.promptTokens`).

## Pré-condição

Servidor OpsPilot já escutando (ex.: `npm run dev`). O script **não** sobe nem derruba o processo.

## Variáveis de ambiente

| Variável | Default | Significado |
|----------|---------|-------------|
| `BASE_URL` | URL local do `/chat` (ex. `http://127.0.0.1:<porta>`) | Prefixo sem path final obrigatório; script chama `POST $BASE_URL/chat` (normalizar barra) |
| `TURNS` | inteiro ≥ 2 (ex. `5`) | Quantidade de turnos na **mesma** conversa |

Opcionais úteis (se implementados): `USER_ID`, mensagem base — desde que o contrato de impressão abaixo se mantenha.

## Comportamento

1. Turno 1: `POST /chat` **sem** `conversationId` (abre fio).
2. Turnos 2..N: reutiliza o `conversationId` do 200 anterior.
3. Em cada **200**: imprime **uma linha** contendo o índice do turno (1-based) e o valor numérico de `metrics.promptTokens` daquele turno (não um acumulado inventado).
4. Em não-200 ou falha de rede: escreve diagnóstico em stderr, exit code ≠ 0; linhas de turnos anteriores já impressas **permanecem**.
5. Sucesso completo: exit 0.

## Formato de saída (stdout) — mínimo

Cada turno bem-sucedido, uma linha parseável, por exemplo:

```text
turn=1 promptTokens=1204
turn=2 promptTokens=1580
```

Prefixos/rótulos podem variar desde que `promptTokens` e o número do turno sejam inequívocos.

## Fora de escopo

- Subir OpenRouter / validar qualidade da `answer`
- Assertar crescimento monotônico de tokens (janela de 12 pode estabilizar)
- CI obrigatória com servidor vivo
