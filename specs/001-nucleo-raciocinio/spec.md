# Feature Specification: Núcleo de raciocínio

**Feature Branch**: `001-nucleo-raciocinio`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "O copiloto de plantão precisa de um núcleo de raciocínio com um contrato comum de resposta, rastro e custo. Duas estratégias — passo a passo com ferramentas (ReAct) e planejar, executar e revisar (Plan-and-Execute, no máximo 8 passos) — operam sobre o mesmo pedido, respeitam um teto de iterações e contam as consultas ao modelo. O plantonista lista alertas por situação, abre incidente e resolve incidente sobre um catálogo inicial de 5 serviços e 6 alertas (3 em disparo e 3 resolvidos), recarregável por um comando repetível. Uma arena compara uma ou mais estratégias e mostra rastro e métricas. A forma do catálogo e a formatação do rastro podem ser conferidas de novo, com o mesmo resultado, sem contato com serviços externos."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Carregar o retrato do plantão (Priority: P1)

O plantonista carrega um retrato inicial da produção e consulta os alertas pela situação. O retrato tem cinco serviços e seis alertas variados: três ainda em disparo e três já resolvidos, com severidades diferentes e pelo menos um serviço com mais de um alerta.

**Why this priority**: Sem esse retrato, o copiloto não tem um plantão concreto para observar nem para agir.

**Independent Test**: Carregar o catálogo e listar os alertas em disparo e os resolvidos. O valor aparece mesmo sem escolher uma estratégia de raciocínio.

**Acceptance Scenarios**:

1. **Given** o catálogo primário ainda não foi carregado, **When** o plantonista executa a carga, **Then** ficam disponíveis 5 serviços e 6 alertas, sendo 3 em disparo e 3 resolvidos.
2. **Given** o catálogo carregado, **When** o plantonista lista alertas com situação `firing`, **Then** recebe só os 3 alertas em disparo, cada um ligado a um serviço do catálogo.
3. **Given** o catálogo carregado, **When** o plantonista lista alertas com situação `resolved`, **Then** recebe só os 3 alertas resolvidos.
4. **Given** o catálogo já carregado, **When** o plantonista executa a carga de novo, **Then** a contagem permanece 5 serviços e 6 alertas, sem linhas duplicadas.

---

### User Story 2 - Abrir e resolver um incidente (Priority: P1)

O plantonista transforma um problema de um serviço conhecido em incidente e, depois, encerra esse incidente pelo identificador.

**Why this priority**: O trabalho do plantão é abrir e encerrar incidente, não só ler alertas.

**Independent Test**: Abrir um incidente no serviço `checkout` e resolvê-lo em seguida, sem passar por uma estratégia de raciocínio.

**Acceptance Scenarios**:

1. **Given** o serviço `checkout` no catálogo, **When** o plantonista abre um incidente com título, serviço e severidade, **Then** o incidente nasce aberto e devolve um identificador.
2. **Given** um incidente aberto, **When** o plantonista resolve esse identificador, **Then** o incidente passa a resolvido.
3. **Given** um incidente já resolvido, **When** o plantonista resolve o mesmo identificador, **Then** ele continua resolvido e a ação confirma o estado, sem criar outro incidente.
4. **Given** um serviço que não está no catálogo, **When** o plantonista tenta abrir incidente, **Then** a ação é recusada e nenhum incidente novo aparece.
5. **Given** um identificador que não existe, **When** o plantonista tenta resolver, **Then** a ação é recusada.

---

### User Story 3 - Receber resposta, rastro e custo (Priority: P2)

O plantonista faz um pedido e recebe três coisas juntas: a resposta, o rastro do raciocínio e o custo da consulta. O rastro é uma sequência de eventos com tipo explícito. O custo informa quantas vezes o modelo foi consultado e quanto tempo a consulta levou.

**Why this priority**: A resposta sozinha não permite confiar no copiloto nem comparar duas formas de raciocinar.

**Independent Test**: Executar uma estratégia sobre um pedido e ler a resposta, os eventos do rastro e as duas métricas.

**Acceptance Scenarios**:

1. **Given** um pedido e uma estratégia, **When** a execução termina, **Then** o resultado traz resposta, rastro e métricas de consultas ao modelo e tempo decorrido.
2. **Given** um evento de ação no rastro, **When** o plantonista o lê, **Then** vê o nome da ferramenta e os argumentos usados.
3. **Given** um teto de iterações atingido antes de uma conclusão espontânea, **When** a execução para, **Then** ainda devolve o rastro produzido até ali, as métricas e uma resposta que informa o teto atingido.
4. **Given** duas execuções com o mesmo pedido, a mesma estratégia e o mesmo teto, **When** ambas terminam, **Then** as duas usam a mesma configuração estável de modelo.

---

### User Story 4 - Raciocinar passo a passo com ferramentas (Priority: P2)

A estratégia ReAct alterna pensamento, uso de ferramenta e observação até a resposta, e grava esse ciclo inteiro no rastro.

**Why this priority**: É a forma de raciocínio que investiga o plantão aos poucos, usando as ações operacionais no meio do caminho.

**Independent Test**: Pedir a lista de alertas em disparo pela estratégia ReAct e verificar ação, observação e resposta no rastro, sem depender da outra estratégia.

**Acceptance Scenarios**:

1. **Given** um pedido que exige consultar alertas, **When** o plantonista roda ReAct, **Then** o rastro contém pensamento, uma ação com ferramenta e argumentos, a observação correspondente e a resposta.
2. **Given** um teto de 2 iterações para um pedido que exigiria mais voltas, **When** ReAct executa, **Then** para ao atingir o teto, contabiliza as consultas ao modelo e devolve o rastro parcial com a resposta de limite atingido.

---

### User Story 5 - Planejar, executar um passo e revisar o resto (Priority: P2)

A estratégia Plan-and-Execute publica uma lista de passos, executa um passo por vez com as ferramentas, revisa o que ainda falta e encerra quando não resta passo. A execução não passa de 8 passos.

**Why this priority**: É a segunda forma de raciocínio que a arena precisa comparar com o passo a passo.

**Independent Test**: Rodar só Plan-and-Execute sobre um pedido, ler o plano, os passos executados e a revisão, e confirmar que a contagem de passos fica entre 1 e 8.

**Acceptance Scenarios**:

1. **Given** um pedido, **When** o plantonista roda Plan-and-Execute, **Then** o rastro inclui um plano em lista de passos, a execução de um passo por vez e uma revisão do restante.
2. **Given** uma revisão que não deixa passos, **When** essa revisão ocorre, **Then** a estratégia encerra com resposta, rastro e métricas.
3. **Given** um plano que seguiria além de 8 passos, **When** a execução avança, **Then** o nono passo não acontece.
4. **Given** um teto de iterações menor que 8, **When** Plan-and-Execute executa, **Then** para no teto de iterações, mesmo que ainda houvesse passos dentro do máximo de 8.

---

### User Story 6 - Comparar estratégias no mesmo pedido (Priority: P2)

O plantonista escolhe uma ou mais estratégias e um teto de iterações, aplica todas ao mesmo pedido e lê o rastro e as métricas de cada uma.

**Why this priority**: A comparação lado a lado é o modo de avaliar qual raciocínio serve ao plantão.

**Independent Test**: Comparar ReAct e Plan-and-Execute com o mesmo pedido e o mesmo teto, e ler dois rastros e dois conjuntos de métricas.

**Acceptance Scenarios**:

1. **Given** um pedido, as estratégias ReAct e Plan-and-Execute e um teto de iterações, **When** o plantonista compara, **Then** cada estratégia devolve seu rastro e suas métricas para esse mesmo pedido.
2. **Given** nenhuma estratégia escolhida, **When** o plantonista tenta comparar, **Then** a comparação não começa e informa que é preciso escolher ao menos uma.
3. **Given** um nome de estratégia desconhecido, **When** o plantonista tenta comparar, **Then** a comparação não começa e informa o nome rejeitado.

---

### User Story 7 - Conferir catálogo e rastro sem sair do ambiente (Priority: P3)

Quem revisa o copiloto confere a forma do catálogo primário e a formatação do rastro duas vezes, com resultado idêntico, sem contatar serviços externos.

**Why this priority**: Essas conferências protegem o contrato do rastro e do catálogo, e podem esperar as histórias de uso do plantão.

**Independent Test**: Repetir a conferência do catálogo e a conferência de um rastro fixo e observar o mesmo texto nas duas vezes, sem rede.

**Acceptance Scenarios**:

1. **Given** a definição do catálogo primário, **When** a conferência roda duas vezes, **Then** as duas apontam 5 serviços, 6 alertas, 3 em disparo e 3 resolvidos, com o mesmo resultado e sem contato externo.
2. **Given** um rastro com eventos dos tipos previstos, **When** a formatação roda duas vezes, **Then** o texto é idêntico nas duas vezes e inclui, na ação, ferramenta e argumentos.

---

### Edge Cases

- Situação de alerta fora de `firing` e `resolved`: a listagem é recusada e o catálogo permanece igual.
- Serviço ausente ao abrir incidente: a ação é recusada e nenhum incidente é criado.
- Identificador ausente ao resolver incidente: a ação é recusada.
- Incidente já resolvido: a segunda resolução confirma o estado e não duplica o registro.
- Teto de iterações atingido no meio de uma ferramenta: a execução para, conserva o rastro até ali e informa o limite na resposta.
- Plano com mais de 8 passos: só os 8 primeiros podem ser executados.
- Revisão sem passos restantes: a estratégia Plan-and-Execute encerra.
- Teto de iterações abaixo de 8: esse teto vale para as duas estratégias e chega antes do máximo de 8 passos.
- Nenhuma estratégia escolhida, ou nome desconhecido: a comparação não dispara consultas ao modelo.
- Carga repetida do catálogo: serviços e alertas permanecem nos mesmos seis alertas e cinco serviços.
- Pedido vazio: a execução devolve uma resposta pedindo um pedido operacional, com rastro e métricas, sem alterar o catálogo.
- Falha ao consultar o modelo: a execução encerra com o rastro produzido até ali, as métricas do que chegou a ocorrer e uma resposta que informa a indisponibilidade.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer estratégias de raciocínio sob o mesmo contrato: nome da estratégia e uma execução que, dado um pedido, devolve resposta, rastro e métricas.
- **FR-002**: O rastro MUST ser uma sequência ordenada de eventos com um destes tipos: `thought`, `action`, `observation`, `plan`, `critique`, `answer`.
- **FR-003**: Cada evento `action` MUST identificar a ferramenta e os argumentos usados.
- **FR-004**: As métricas MUST informar o número de consultas ao modelo e o tempo decorrido da execução.
- **FR-005**: Toda estratégia MUST parar ao atingir o teto de iterações escolhido pelo plantonista e MUST contar cada consulta ao modelo.
- **FR-006**: Quando o teto de iterações encerra a execução antes de uma conclusão espontânea, o resultado MUST incluir o rastro até ali, as métricas e uma resposta que declara o teto atingido.
- **FR-007**: Todas as estratégias MUST compartilhar uma única configuração de modelo, estável entre execuções do mesmo pedido.
- **FR-008**: O sistema MUST listar alertas filtrados por situação, aceitando somente `firing` ou `resolved`.
- **FR-009**: O sistema MUST abrir incidente com título, serviço e severidade, ligado a um serviço do catálogo, nascendo aberto e com identificador.
- **FR-010**: O sistema MUST resolver incidente pelo identificador. Um incidente já resolvido MUST permanecer resolvido, sem um segundo registro.
- **FR-011**: Listar com situação inválida, abrir incidente para serviço desconhecido ou resolver identificador desconhecido MUST ser recusado, sem alterar o catálogo.
- **FR-012**: Um comando de carga repetível MUST deixar o catálogo primário com exatamente estes serviços:
  - `api-gateway` — API Gateway — entrada HTTP do produto
  - `checkout` — Checkout — fechamento de pedido
  - `payments` — Pagamentos — autorização e captura
  - `auth` — Autenticação — login e sessão
  - `notifications` — Notificações — e-mail e push
- **FR-013**: O mesmo comando MUST deixar exatamente estes alertas, cada um ligado ao serviço indicado:
  - `checkout` / `firing` / `critical` — Taxa de erro 5xx no checkout
  - `payments` / `firing` / `high` — Latência p99 de autorização
  - `auth` / `firing` / `medium` — Pico de falhas de login
  - `api-gateway` / `resolved` / `low` — Certificado renovado
  - `notifications` / `resolved` / `high` — Fila de e-mail normalizada
  - `checkout` / `resolved` / `critical` — Checkout indisponível recuperado
- **FR-014**: Uma nova carga MUST substituir o catálogo primário anterior e MUST terminar de novo com 5 serviços e 6 alertas, sendo 3 `firing` e 3 `resolved`.
- **FR-015**: A estratégia ReAct MUST registrar no rastro o ciclo de pensamento, ação e observação até a resposta, incluindo ferramenta e argumentos em cada ação.
- **FR-016**: A estratégia Plan-and-Execute MUST produzir um plano como lista de passos, executar um passo por vez com as ferramentas disponíveis, revisar o restante depois de cada passo e encerrar quando a revisão não deixar passos.
- **FR-017**: Plan-and-Execute MUST executar no máximo 8 passos. O teto de iterações, quando menor que 8, MUST encerrar a estratégia antes desse máximo.
- **FR-018**: A comparação MUST aceitar uma ou mais estratégias entre ReAct e Plan-and-Execute, aplicar todas ao mesmo pedido e apresentar o rastro e as métricas de cada uma.
- **FR-019**: A comparação MUST recusar seleção vazia e nome de estratégia desconhecido antes de consultar o modelo.
- **FR-020**: A forma do catálogo primário e a formatação de um rastro MUST ser conferíveis de modo repetível, com o mesmo resultado em execuções seguidas e sem contato com serviços externos.
- **FR-021**: A severidade de alerta e de incidente MUST ser uma de: `low`, `medium`, `high`, `critical`.

### Key Entities

- **Serviço**: Item do catálogo com identificador estável (`api-gateway`, `checkout`, `payments`, `auth`, `notifications`), nome e descrição. Um serviço reúne alertas e incidentes.
- **Alerta**: Sinal operacional ligado a um serviço, com título, detalhe, situação (`firing` ou `resolved`) e severidade. O catálogo primário tem seis alertas.
- **Incidente**: Registro aberto pelo plantonista com título, serviço, severidade e identificador. Nasce aberto e pode ficar resolvido. O catálogo primário não traz incidentes prontos.
- **Estratégia de raciocínio**: Forma nomeada de chegar a uma resposta. Nesta feature: ReAct e Plan-and-Execute.
- **Rastro**: Sequência ordenada de eventos `thought`, `action`, `observation`, `plan`, `critique` e `answer`. A ação guarda ferramenta e argumentos.
- **Métricas**: Consultas ao modelo realizadas na execução e tempo decorrido.
- **Plano**: Lista ordenada de passos produzida por Plan-and-Execute e revista depois de cada passo executado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Depois da carga, o plantonista vê 5 serviços e 6 alertas, dos quais exatamente 3 estão em disparo e 3 estão resolvidos.
- **SC-002**: Uma nova carga, feita em seguida, mantém essas mesmas contagens, sem alertas ou serviços repetidos.
- **SC-003**: O plantonista abre um incidente em um serviço conhecido e o resolve em uma passagem, ficando o incidente resolvido ao final.
- **SC-004**: Cada execução de estratégia devolve resposta, rastro completo do que ocorreu e as duas métricas: consultas ao modelo e tempo decorrido.
- **SC-005**: Em 100% das ações registradas no rastro, o plantonista identifica a ferramenta e os argumentos sem informação fora do evento.
- **SC-006**: Plan-and-Execute nunca executa mais de 8 passos. Com teto de iterações menor, para nesse teto.
- **SC-007**: Ao comparar duas estratégias no mesmo pedido, o plantonista vê dois rastros e dois conjuntos de métricas referentes a esse pedido.
- **SC-008**: Duas conferências seguidas do catálogo e da formatação de um mesmo rastro produzem o mesmo resultado e não dependem de serviço externo.

## Assumptions

- O usuário desta feature é o plantonista que opera o copiloto e compara estratégias. Não há papéis separados de permissão.
- A severidade usa a escala `low`, `medium`, `high`, `critical`. O pedido original não fixou a escala.
- Situação de alerta é somente `firing` ou `resolved`. Incidente nasce aberto e passa a resolvido.
- O teto de iterações padrão, quando o plantonista não informa outro, é 8. O plantonista pode informar um teto diferente. Plan-and-Execute também obedece ao máximo de 8 passos, valendo o limite que chegar primeiro.
- A carga do catálogo substitui serviços e alertas do catálogo primário. Incidentes criados depois da carga não fazem parte desse retrato inicial; uma nova carga não precisa preservá-los.
- As ações de listar, abrir e resolver atuam no catálogo do copiloto. Elas não disparam efeitos em sistemas externos de produção.
- As estratégias compartilham uma configuração de modelo definida fora do material versionado, estável o bastante para que o mesmo pedido seja comparável. Segredos não entram no repositório.
- Pedido vazio recebe uma resposta pedindo um pedido operacional, sem mudar o catálogo.
- Ficam fora desta feature o benchmark de modelos, a borda HTTP do produto e qualquer canal real de acionamento de pessoas.
- Os nomes ReAct e Plan-and-Execute são os nomes que o plantonista escolhe ao comparar. Não há outras estratégias nesta feature.
