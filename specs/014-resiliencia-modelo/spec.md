# Feature Specification: Resiliência de modelo

**Feature Branch**: `014-resiliencia-modelo`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Resiliência de modelo: env OPENROUTER_MODEL_FALLBACK; fábrica models.ts: withRetry no primário; withFallbacks{[reserva]}; trace: evento fallback; metrics.modelUsed; Caso nada funcione, 503"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Continuar o turno quando o modelo principal falha (Priority: P1)

Quando o provedor recusa ou falha o modelo principal depois das novas tentativas, o copiloto tenta automaticamente um modelo reserva configurado e, se esse atender, o plantonista recebe a resposta do turno normalmente — sem precisar repetir o pedido.

**Why this priority**: Falha transitória do modelo principal sem reserva interrompe o plantão; o valor da feature é manter o turno útil.

**Independent Test**: Simular falha persistente do modelo principal e sucesso do reserva; o turno completa com resposta e indica que usou o reserva.

**Acceptance Scenarios**:

1. **Given** modelo principal e modelo reserva configurados, e o principal falha de forma persistente após as novas tentativas, **When** o turno consulta o modelo, **Then** o sistema tenta o reserva e, se o reserva responder, o plantonista recebe a resposta do turno com sucesso.
2. **Given** o mesmo pedido com o principal saudável, **When** o turno completa, **Then** só o principal é usado para a resposta (o reserva não é consultado).
3. **Given** o principal falha em uma tentativa recuperável, **When** as novas tentativas no principal ainda conseguem resposta, **Then** o turno completa com o principal e o reserva não é consultado.

---

### User Story 2 - Configurar o modelo reserva por ambiente (Priority: P1)

O operador define o identificador do modelo reserva pela variável de ambiente `OPENROUTER_MODEL_FALLBACK`. O modelo principal continua sendo o já configurado (`OPENROUTER_MODEL`). Sem reserva configurada, o comportamento permanece só com o principal (com novas tentativas); não há segundo modelo implícito.

**Why this priority**: Sem superfície configurável, não há como apontar um reserva distinto do principal em cada ambiente.

**Independent Test**: Rodar com e sem `OPENROUTER_MODEL_FALLBACK`; com o valor definido, o reserva é elegível; sem valor (ou só espaços), só o principal existe.

**Acceptance Scenarios**:

1. **Given** `OPENROUTER_MODEL_FALLBACK` com um identificador não vazio, **When** a fábrica de modelo sobe, **Then** esse identificador é o único reserva elegível para o turno.
2. **Given** `OPENROUTER_MODEL_FALLBACK` ausente, vazia ou só espaços, **When** o principal falha após as novas tentativas, **Then** não há segundo modelo a consultar e o turno falha como indisponibilidade do provedor.
3. **Given** principal e reserva configurados com identificadores distintos, **When** um turno usa o reserva, **Then** o modelo efetivamente usado na resposta é o identificador do reserva, não o do principal.

---

### User Story 3 - Ver no rastro e nas métricas qual modelo respondeu (Priority: P1)

Quando o turno troca para o reserva, o rastro ganha um evento `fallback` registrando a troca. Em todo turno bem-sucedido que consultou o modelo, as métricas expõem `modelUsed` com o identificador do modelo que de fato respondeu (principal ou reserva).

**Why this priority**: Sem rastro e métrica, o plantonista e a operação não sabem se a resposta veio do principal ou do reserva, nem quando a troca ocorreu.

**Independent Test**: Forçar um fallback bem-sucedido e ler o evento `fallback` no rastro e `modelUsed` nas métricas; forçar sucesso só no principal e confirmar `modelUsed` do principal sem evento `fallback`.

**Acceptance Scenarios**:

1. **Given** um turno que precisou do reserva e obteve resposta, **When** o plantonista lê o rastro, **Then** existe um evento `fallback` indicando a troca do principal para o reserva.
2. **Given** um turno bem-sucedido só com o principal, **When** o rastro e as métricas são lidos, **Then** não há evento `fallback` e `metrics.modelUsed` é o identificador do principal.
3. **Given** um turno bem-sucedido via reserva, **When** as métricas são lidas, **Then** `metrics.modelUsed` é o identificador do reserva.
4. **Given** um turno que falha antes de qualquer resposta do modelo (ex.: pedido vazio já tratado sem consulta), **When** a resposta é devolvida, **Then** o contrato de `modelUsed` / `fallback` desta feature não se aplica (comportamento atual preservado).

---

### User Story 4 - Indisponibilidade total devolve 503 (Priority: P1)

Se o principal esgota as novas tentativas e o reserva (quando configurado) também falha — ou não há reserva — o canal de chat informa indisponibilidade do serviço de modelo com status HTTP 503 e uma mensagem compreensível, sem fingir uma resposta operacional.

**Why this priority**: Silêncio ou 500 genérico atrapalha o plantão; 503 deixa claro que o copiloto não pôde falar com nenhum modelo.

**Independent Test**: Simular falha do principal e do reserva (ou só do principal sem reserva); a borda HTTP responde 503 com mensagem.

**Acceptance Scenarios**:

1. **Given** principal e reserva configurados e ambos falham, **When** o plantonista envia um pedido que exige o modelo, **Then** a resposta HTTP é 503 e o corpo traz uma mensagem de indisponibilidade (sem `answer` de sucesso).
2. **Given** só o principal configurado (sem reserva) e ele falha após as novas tentativas, **When** o pedido exige o modelo, **Then** a resposta HTTP é 503.
3. **Given** configuração de modelo ausente (chave ou modelo principal faltando), **When** o serviço sobe ou o turno tenta criar o modelo, **Then** o erro de configuração já existente continua a ser tratado na borda como hoje (fora do escopo de “ambos falharam em runtime”).

---

### Edge Cases

- Reserva igual ao principal: o sistema ainda pode tentar a sequência (novas tentativas no “principal”, depois “reserva”); `modelUsed` reflete o identificador configurado; um único evento `fallback` só aparece se a camada de reserva de fato assumiu após falha do principal.
- Reserva configurada mas o principal nunca falha: nenhum evento `fallback`; `modelUsed` é o principal.
- Falha só em parte do turno (várias consultas ao modelo no mesmo turno): a resiliência vale por consulta ao modelo; se em algum momento só o reserva responde, o rastro registra `fallback` na troca e `modelUsed` no fechamento do turno é o modelo que produziu a resposta final observada nas métricas do turno (ver Assumptions).
- Timeout ou erro de rede no principal: conta como falha elegível a nova tentativa e, se esgotado, ao reserva.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST ler o modelo reserva de `OPENROUTER_MODEL_FALLBACK` (string não vazia após trim); ausência ou só espaços significa “sem reserva”.
- **FR-002**: O sistema MUST continuar usando `OPENROUTER_MODEL` como modelo principal.
- **FR-003**: Toda consulta ao modelo principal MUST aplicar novas tentativas antes de considerar o principal esgotado.
- **FR-004**: Quando o principal estiver esgotado e houver reserva configurado, o sistema MUST tentar o reserva automaticamente na mesma consulta.
- **FR-005**: Quando o reserva produzir a resposta, o rastro do turno MUST incluir um evento do tipo `fallback` descrevendo a troca.
- **FR-006**: Em todo turno bem-sucedido que consultou o modelo, as métricas MUST incluir `modelUsed` com o identificador do modelo que respondeu.
- **FR-007**: Se nenhum modelo configurado conseguir responder a uma consulta necessária ao turno, a borda HTTP MUST responder 503 com mensagem de indisponibilidade.
- **FR-008**: Sem reserva configurada, o sistema MUST NÃO inventar um segundo modelo; após esgotar o principal, aplica-se FR-007.
- **FR-009**: A fábrica de modelo (ponto único de criação do cliente de chat) MUST ser o lugar onde principal com novas tentativas e eventual reserva são compostos, de modo que estratégias e canal de chat herdem o comportamento sem cada um reimplementar a troca.

### Key Entities

- **Modelo principal**: Identificador configurado em `OPENROUTER_MODEL`; primeira escolha de toda consulta.
- **Modelo reserva**: Identificador opcional em `OPENROUTER_MODEL_FALLBACK`; só entra após o principal esgotar as novas tentativas.
- **Evento `fallback`**: Entrada no rastro do turno que registra que a resposta (ou a consulta) passou do principal para o reserva.
- **Métrica `modelUsed`**: Campo nas métricas do turno com o identificador do modelo que de fato atendeu.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos testes em que o principal falha de forma persistente e o reserva responde, o plantonista recebe resposta de sucesso do turno sem reenviar o pedido.
- **SC-002**: Em 100% dos turnos bem-sucedidos via reserva, o rastro contém exatamente pelo menos um evento `fallback` e `metrics.modelUsed` igual ao identificador do reserva.
- **SC-003**: Em 100% dos turnos bem-sucedidos só com o principal, `metrics.modelUsed` é o identificador do principal e o rastro não contém evento `fallback`.
- **SC-004**: Em 100% dos casos em que principal (e reserva, se houver) falham na consulta necessária, o canal devolve HTTP 503 (não 200 com resposta operacional falsa).
- **SC-005**: Com `OPENROUTER_MODEL_FALLBACK` ausente, um principal que falha após novas tentativas resulta em 503 em menos de 1 minuto de observação do teste (sem espera indefinida).

## Assumptions

- O arquivo/fábrica atual de modelo (`src/agents/model.ts`) é o ponto a estender; o enunciado “models.ts” refere-se a essa fábrica, não a um segundo módulo obrigatório.
- Há no máximo um reserva (`OPENROUTER_MODEL_FALLBACK` único), não uma lista ordenada de vários reservas nesta feature.
- “Novas tentativas no principal” reutilizam a política de retry já alinhada ao cliente de modelo (ou a envolvem de forma equivalente); o número exato de tentativas permanece o padrão operacional já usado, salvo ajuste pontual no plano.
- `modelUsed` no fechamento do turno reporta o modelo da última consulta bem-sucedida que alimentou a resposta; se o plano precisar de granularidade por etapa, isso fica fora do MVP desta spec.
- Pedidos que hoje não consultam o modelo (ex.: mensagem vazia) não passam a consultar nem a emitir `fallback`/`modelUsed` por causa desta feature.
- O 503 de indisponibilidade de modelo alinha-se ao tratamento de erros de domínio já traduzido na borda HTTP; novos códigos de domínio, se necessários, nascem no plano/tarefas.
- Fora de escopo: balanceamento de custo entre modelos, escolha dinâmica do reserva por tipo de tarefa, e múltiplos reservas em cadeia além do único configurado.
