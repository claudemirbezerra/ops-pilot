# Quickstart: Canal de chat

Guia de validação. Campos em [data-model.md](./data-model.md). Comportamento em [contracts/](./contracts/).

## Pré-requisitos

- Node 22 e `npm install`.
- Núcleo `001-nucleo-raciocinio` e reflexão `002-camada-reflection` já implementados.
- Para um `POST /chat` real, com ReAct de produção: `OPENROUTER_API_KEY` e `OPENROUTER_MODEL` no ambiente do processo. O código não lê `.env`.

A suíte abaixo não usa banco, modelo nem porta 3000.

## 1. Conferência offline

```text
npm test
npm run typecheck
```

Esperado: os dois terminam com sucesso. O teste de integração do canal, com catálogo e crítico substitutos, cobre:

- duas vezes o mesmo `message` sem `strategy` e sem `reflect` → 200 com o mesmo `answer`, e o `trace` e as `metrics` vêm do substituto;
- corpo sem `message`, ou `strategy` numérica → 400 com `issues`, e o substituto não executa;
- `strategy` `"reflect:react"` ou `""` → 422 cujo `message` cita esse texto, sem execução;
- `reflect: true` → 200 do substituto envolvido pela reflexão (há `critique`); `reflect: false` → 200 do substituto sozinho, sem chamar o crítico;
- substituto que não conclui e limite curto injetado → 504 sem `answer`.

Nenhuma dessas chamadas abre conexão externa. O teste não espera 180 segundos.

## 2. Subir o canal

```text
npm run dev
```

Esperado: o processo permanece no ar e escreve que escuta em `http://127.0.0.1:3000` (ou na porta de `PORT`). Não termina na hora.

## 3. Pedido com a estratégia padrão

Com o processo do passo 2 e a chave do modelo no ambiente:

```text
curl.exe -s -X POST http://127.0.0.1:3000/chat -H "Content-Type: application/json" -d "{\"message\":\"Quais alertas estão em disparo?\"}"
```

Esperado: HTTP 200 e um JSON com `answer`, `trace` e `metrics`. A estratégia executada é ReAct.

## 4. Plan-and-Execute com reflexão

```text
curl.exe -s -X POST http://127.0.0.1:3000/chat -H "Content-Type: application/json" -d "{\"message\":\"Abra um incidente crítico para o checkout.\",\"strategy\":\"plan-and-execute\",\"reflect\":true}"
```

Esperado: HTTP 200. O `trace` inclui ao menos um evento `critique`. `metrics.llmCalls` conta o ciclo, não só a primeira passagem.

## 5. Recusas

```text
curl.exe -s -o NUL -w "%{http_code}" -X POST http://127.0.0.1:3000/chat -H "Content-Type: application/json" -d "{\"strategy\":\"react\"}"
```

Esperado: `400`.

```text
curl.exe -s -X POST http://127.0.0.1:3000/chat -H "Content-Type: application/json" -d "{\"message\":\"oi\",\"strategy\":\"reflect:react\",\"reflect\":true}"
```

Esperado: HTTP 422 e `message` contendo `reflect:react`. Nenhuma consulta ao modelo por causa desse nome.
