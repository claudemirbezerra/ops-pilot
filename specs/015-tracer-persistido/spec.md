# Feature Specification: Tracer persistido e logs JSON

**Feature Branch**: `015-tracer-persistido`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "tracer persistido + logs JSON: /chat: requestId no corpo e no header X-Request_Id. SQLite: request (métricas) e trace_events (node, payloads). src/obs/logger.ts: 1 linha JSON por evento só metadados. GET /request/:id registro + trace ordenado."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correlacionar cada turno de chat por requestId (Priority: P1)

Após um POST `/chat`, quem opera o copiloto recebe um `requestId` estável no corpo da resposta e no header `X-Request-Id`, permitindo correlacionar aquela execução com logs e com a consulta posterior do registro persistido.

**Why this priority**: Sem um identificador único e visível na borda HTTP, o restante do tracer (persistência e consulta) não tem chave de correlação operacional.

**Independent Test**: Disparar POST `/chat` (com substituto determinístico se necessário) e assertir presença e igualdade do `requestId` no JSON e no header `X-Request-Id`.

**Acceptance Scenarios**:

1. **Given** um POST `/chat` bem-sucedido (200), **When** o cliente lê a resposta, **Then** o corpo inclui `requestId` (string não vazia) e o header `X-Request-Id` traz o mesmo valor.
2. **Given** dois POSTs `/chat` distintos, **When** ambos retornam 200, **Then** cada um tem `requestId` distinto.
3. **Given** um POST `/chat` que falha com erro de domínio/validação (4xx) ou timeout de modelo (ex.: 504), **When** a resposta de erro é devolvida, **Then** o `requestId` ainda é exposto no header `X-Request-Id` (e no corpo quando o formato de erro permitir) para correlação do turno tentado.

---

### User Story 2 - Persistir métricas do request e eventos de trace (Priority: P1)

Cada execução de `/chat` deixa um registro persistente de request (com métricas do turno) e uma sequência de eventos de trace (nó do grafo e payloads associados), consultáveis depois pelo `requestId`.

**Why this priority**: É o núcleo do valor: o plantonista precisa reconstruir o que o agente fez sem depender só da resposta efêmera do `/chat`.

**Independent Test**: Executar um `/chat` que produza trace e métricas; consultar o armazenamento pelo `requestId` e confirmar um registro de request com métricas e N eventos com nó e payload, na ordem de ocorrência.

**Acceptance Scenarios**:

1. **Given** um `/chat` 200 com métricas e trace em memória na resposta, **When** a persistência conclui, **Then** existe exatamente um registro de request para aquele `requestId` contendo as métricas do turno.
2. **Given** um `/chat` cujo grafo emite múltiplos eventos de trace, **When** a persistência conclui, **Then** cada evento fica gravado com identificação do nó e o payload correspondente, associados ao mesmo `requestId`.
3. **Given** um `/chat` sem eventos de trace (ex.: pedido em branco / resposta orientativa), **When** a persistência conclui, **Then** o registro de request existe (com métricas aplicáveis) e a lista de eventos pode ser vazia.
4. **Given** reinício do processo com o mesmo banco configurado, **When** se consulta o `requestId` anterior, **Then** request e eventos ainda estão disponíveis.

---

### User Story 3 - Emitir log JSON só com metadados (Priority: P2)

Em paralelo à persistência, o sistema emite uma linha JSON por evento de observação, contendo apenas metadados (sem payloads completos), adequada a coleta por ferramentas de log linha a linha.

**Why this priority**: Complementa a persistência: logs leves para operação em tempo real; payloads completos ficam no armazenamento consultável, não no stream de log.

**Independent Test**: Executar um fluxo que gere eventos; capturar a saída do logger e verificar uma linha JSON válida por evento, com metadados de correlação e sem o payload completo do nó.

**Acceptance Scenarios**:

1. **Given** um turno que gera K eventos de trace, **When** o logger observa esses eventos, **Then** emite exatamente K linhas (uma por evento), cada uma um objeto JSON em linha única.
2. **Given** uma linha emitida, **When** o consumidor parseia o JSON, **Then** encontra metadados suficientes para correlacionar (`requestId`, tipo/nó do evento, e carimbo temporal ou ordem) e **não** encontra o payload completo do evento.
3. **Given** ausência de eventos, **When** o turno termina, **Then** o logger não inventa linhas de evento de trace (pode ainda haver linha de ciclo de vida do request, se definida — ver Assumptions).

---

### User Story 4 - Consultar request e trace ordenado (Priority: P1)

O plantonista chama `GET /request/:id` com o `requestId` e recebe o registro do request (métricas) mais a lista de eventos de trace na ordem em que ocorreram.

**Why this priority**: Fecha o ciclo operacional: do `requestId` na resposta do `/chat` até a reconstrução completa do turno.

**Independent Test**: Após um `/chat` persistido, `GET /request/:id` com o id correto devolve 200 com registro + eventos ordenados; id inexistente devolve 404.

**Acceptance Scenarios**:

1. **Given** um `requestId` persistido com métricas e N eventos, **When** `GET /request/:id` é chamado com esse id, **Then** a resposta é 200 com o registro do request (incluindo métricas) e a lista de N eventos na ordem de ocorrência.
2. **Given** um `requestId` desconhecido, **When** `GET /request/:id` é chamado, **Then** a resposta é 404 de domínio traduzido na borda.
3. **Given** eventos gravados fora de ordem de inserção acidental, **When** a consulta monta a resposta, **Then** a lista apresentada ao cliente está ordenada pela ordem lógica do turno (ordem de ocorrência / sequência persistida), não por ordenação alfabética de nó.

---

### User Story 5 - Conferência automatizada (Priority: P1)

Geração de `requestId`, persistência de request/eventos, logger de metadados e `GET /request/:id` têm testes automatizados. `typecheck` e a suíte permanecem verdes.

**Why this priority**: Constituição: lógica nova nasce com teste; tracer incorreto engana diagnóstico de plantão.

**Independent Test**: Rodar a suíte cobrindo correlação HTTP, persistência, ordenação do GET e formato do log sem provedor externo obrigatório.

**Acceptance Scenarios**:

1. **Given** `createApp` / canal com substitutos determinísticos, **When** os testes de `/chat` rodam, **Then** assertem `requestId` no corpo e no header.
2. **Given** banco em memória de teste, **When** os testes de persistência e `GET /request/:id` rodam, **Then** assertem registro, métricas, eventos com nó/payload e ordem.
3. **Given** captura do logger, **When** os testes de observação rodam, **Then** assertem uma linha JSON por evento só com metadados.
4. **Given** a suíte completa do projeto, **When** typecheck e testes rodam, **Then** ambos ficam verdes.

---

### Edge Cases

- `/chat` que falha após gerar `requestId`: header de correlação ainda presente; persistência do request (e eventos parciais, se houver) é best-effort — se a falha ocorrer antes de qualquer gravação, o GET pode 404.
- Payload muito grande em evento de trace: ainda é persistido no armazenamento de eventos; o log JSON continua só com metadados (sem o payload).
- `GET /request/:id` com id malformado ou vazio: tratado como validação de fronteira (4xx), não como 200 com lista vazia.
- Concorrência de vários `/chat` em paralelo: cada um tem `requestId` próprio; eventos de um id não aparecem na consulta de outro.
- Reinício do servidor: dados no banco configurado sobrevivem; banco `:memory:` de teste não.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Todo POST `/chat` MUST gerar (ou associar) um `requestId` único por execução e MUST devolvê-lo no corpo da resposta de sucesso e no header `X-Request-Id`.
- **FR-002**: Respostas de erro do `/chat` MUST incluir o header `X-Request-Id` com o identificador daquela tentativa, sempre que o id já tenha sido atribuído ao ciclo de vida do request.
- **FR-003**: O sistema MUST persistir um registro de **request** por `requestId`, incluindo as métricas do turno quando disponíveis.
- **FR-004**: O sistema MUST persistir os eventos de **trace** do turno associados ao `requestId`, cada um com identificação do **nó** e o **payload** do evento.
- **FR-005**: O módulo de log em `src/obs/logger.ts` MUST emitir **uma linha JSON por evento**, contendo **apenas metadados** de correlação/observação (sem o payload completo).
- **FR-006**: `GET /request/:id` MUST devolver o registro do request (com métricas) e a lista de eventos de trace **ordenada** pela ordem de ocorrência do turno.
- **FR-007**: `GET /request/:id` com id inexistente MUST resultar em erro de domínio traduzido para 404 na borda HTTP.
- **FR-008**: Persistência de request e eventos MUST usar o mesmo banco operacional SQLite já configurável do projeto (`OPSPILOT_DB`; `:memory:` nos testes).
- **FR-009**: Toda lógica nova de correlação, persistência, logger e consulta MUST ter testes automatizados; `npm run typecheck` e `npm test` MUST permanecer verdes.

### Key Entities

- **Request (execução)**: Uma invocação de `/chat` identificada por `requestId`, com métricas do turno e carimbo de ciclo de vida.
- **Trace event**: Um passo observável do grafo/agente (nó + payload), pertencente a um request, com ordem de ocorrência.
- **Metadados de log**: Subconjunto enxuto do evento (ex.: `requestId`, tipo/nó, ordem/tempo) adequado a uma linha JSON, sem payload completo.
- **Consulta de request**: Resposta agregada de `GET /request/:id` = registro do request + eventos ordenados.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos `/chat` 200 de teste, o `requestId` do corpo é idêntico ao valor do header `X-Request-Id` e não é vazio.
- **SC-002**: Em 100% dos turnos de teste com trace, após o `/chat`, `GET /request/:id` devolve o mesmo número de eventos observados no turno, na mesma ordem de ocorrência.
- **SC-003**: Em 100% dos turnos de teste com métricas, o registro persistido consultável inclui essas métricas (valores coerentes com o 200 do `/chat` quando ambos existem).
- **SC-004**: Em 100% das linhas de log de evento emitidas nos testes, o JSON parseia e **não** contém o payload completo do evento (apenas metadados).
- **SC-005**: Em 100% das consultas a ids inexistentes nos testes, a resposta é 404.
- **SC-006**: A suíte de conferência do tracer completa sem provedor externo obrigatório e typecheck + testes do projeto ficam verdes.

## Assumptions

- O canal `/chat`, as métricas de sucesso e o `trace` em memória na resposta já existem; esta feature acrescenta correlação (`requestId`), persistência, log JSON de metadados e consulta HTTP — sem mudar a semântica do grafo.
- O header citado pelo usuário como `X-Request_Id` interpreta-se como o header HTTP convencional `X-Request-Id` (hífen).
- O `requestId` é gerado pelo servidor no início do ciclo de vida do request (cliente não precisa enviar id; se no futuro houver id de cliente, fica fora do escopo desta feature).
- Tabelas lógicas pedidas (`request` para métricas; `trace_events` para nó + payloads) vivem no SQLite operacional existente; schema detalhado fica para o plano.
- O logger dedicado vive em `src/obs/logger.ts` conforme o pedido; detalhes de API interna (assinatura, destino stdout/stderr) ficam para o plano, desde que a saída seja uma linha JSON por evento só com metadados.
- “Só metadados” no log significa: não serializar o payload completo do evento de trace; campos de correlação e classificação (id, nó/tipo, ordem/tempo, talvez status) são permitidos.
- Pode existir uma linha JSON adicional de ciclo de vida do request (início/fim) além das linhas por evento de trace; se existir, também é só metadados e uma linha por ocorrência.
- Autenticação/autorização de `GET /request/:id` segue o mesmo modelo atual das demais rotas HTTP do OpsPilot (sem auth adicional nesta feature).
- Arena e bench não são obrigados a expor `requestId` nem a persistir trace nesta feature; o foco é `/chat` + persistência + logger + `GET /request/:id`.
- Falha de escrita no banco após resposta já enviada ao cliente é tratada como erro operacional observável no log; o contrato do 200 do `/chat` não depende de confirmação síncrona da consulta GET (preferência: persistir antes de responder 200 quando viável — detalhe no plano).
