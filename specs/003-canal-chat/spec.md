# Feature Specification: Canal de chat

**Feature Branch**: `003-canal-chat`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "POST /chat em src/http/server.ts (ou padrão do express) : body { message, strategy?, reflect? } validado com zod; default react. 200 { answer, trace, metrics }; 400 body inváliddo { issues do zod }; 422 estratégia desconhecida; timeout 180s -> 504. Registry em src/agent/index.ts (nome -> estratégia; reflect aplica withReflection). Teste de integração com estratégia fake deeterministica, sem rede"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conversar com o copiloto (Priority: P1)

O plantonista envia um pedido operacional para `/chat` e recebe, juntos, a resposta, o rastro do raciocínio e as métricas de custo. Se não escolhe uma estratégia, o copiloto usa ReAct.

**Why this priority**: Sem esse envio bem-sucedido o canal não entrega o plantão; os demais desfechos só fazem sentido em volta dele.

**Independent Test**: Enviar só a mensagem de um pedido para `/chat` e ler `answer`, `trace` e `metrics` produzidos por ReAct.

**Acceptance Scenarios**:

1. **Given** um pedido operacional em texto, **When** o plantonista envia a conversa para `/chat` sem nome de estratégia e sem pedir reflexão, **Then** o canal responde 200, executa ReAct e devolve `answer`, `trace` e `metrics`.
2. **Given** um envio aceito, **When** o plantonista lê o resultado, **Then** `answer` é o texto final, `trace` é a sequência de eventos da execução e `metrics` informa quantas consultas ao modelo ocorreram e quanto tempo a execução levou.
3. **Given** o mesmo pedido e a mesma estratégia, **When** a execução termina dentro do limite de espera, **Then** o desfecho é 200 e não tempo esgotado.
4. **Given** dois envios aceitos, **When** ambos terminam, **Then** cada 200 traz só o `trace` e as `metrics` da própria execução.

---

### User Story 2 - Escolher a estratégia e a reflexão (Priority: P1)

O plantonista nomeia a estratégia e pode pedir que a camada de reflexão envolva essa estratégia. A reflexão é um sim ou não à parte do nome: não se escolhe pelo nome composto usado na arena.

**Why this priority**: O valor do canal é comparar o mesmo pedido em ReAct ou Plan-and-Execute, com ou sem revisão, sem abrir a arena.

**Independent Test**: Enviar o mesmo pedido para `/chat` com `plan-and-execute` e sem reflexão, e de novo com `react` e reflexão pedida. Cada envio devolve o próprio 200 e não depende do outro.

**Acceptance Scenarios**:

1. **Given** a estratégia `plan-and-execute` e reflexão não pedida, **When** o plantonista envia o pedido para `/chat`, **Then** responde 200, executa Plan-and-Execute sem a camada de reflexão e devolve `answer`, `trace` e `metrics` dessa execução.
2. **Given** a estratégia `react` e reflexão pedida, **When** o plantonista envia o pedido para `/chat`, **Then** responde 200, executa ReAct envolvido pela camada de reflexão já existente e devolve `answer`, `trace` e `metrics` do ciclo completo.
3. **Given** reflexão pedida e nenhum nome de estratégia, **When** o plantonista envia o pedido para `/chat`, **Then** a base envolvida é ReAct e o desfecho de sucesso é 200.
4. **Given** reflexão omitida ou recusada, **When** o plantonista envia um nome conhecido, **Then** a estratégia base responde sozinha, sem crítica nem regeneração.

---

### User Story 3 - Recusar um envio malformado (Priority: P1)

Se o envio não traz uma mensagem em texto, ou se estratégia ou reflexão vêm com o tipo errado, o canal responde 400 antes de raciocinar e devolve `issues`, a lista de problemas encontrados.

**Why this priority**: Um pedido ilegível não pode disparar estratégia nem parecer uma resposta do plantão.

**Independent Test**: Omitir a mensagem, ou enviar estratégia como número, e confirmar 400 com `issues` e nenhuma execução.

**Acceptance Scenarios**:

1. **Given** um envio sem mensagem, **When** o canal valida o pedido, **Then** responde 400 com `issues` e não executa estratégia nenhuma.
2. **Given** mensagem que não é texto, estratégia que não é texto ou reflexão que não é sim/não, **When** o canal valida o pedido, **Then** responde 400 e `issues` cita cada problema encontrado.
3. **Given** um envio que não é um pedido reconhecível (corpo ausente ou ilegível), **When** o canal valida, **Then** responde 400 com `issues`.
4. **Given** uma recusa 400, **When** o plantonista observa o resultado, **Then** não há `answer`, `trace` nem `metrics` de uma estratégia executada.

---

### User Story 4 - Recusar estratégia desconhecida (Priority: P1)

Se o nome informado não está no catálogo do canal, o canal responde 422 e identifica o nome, mesmo que a reflexão tenha sido pedida.

**Why this priority**: Rodar um nome inexistente gastaria consulta ao modelo e devolveria um erro opaco no meio do rastro.

**Independent Test**: Enviar `strategy` com um nome que não é `react` nem `plan-and-execute` e confirmar 422 citando esse nome, sem execução.

**Acceptance Scenarios**:

1. **Given** um nome de estratégia fora do catálogo, **When** o plantonista envia um pedido com mensagem válida, **Then** o canal responde 422, informa o nome rejeitado e não executa estratégia nem reflexão.
2. **Given** um nome desconhecido e reflexão pedida, **When** o canal valida o nome, **Then** o 422 acontece antes de envolver qualquer estratégia com reflexão.
3. **Given** o nome composto da arena (`reflect:react` ou `reflect:plan-and-execute`), **When** esse nome é enviado no campo de estratégia, **Then** o canal responde 422, porque a reflexão se pede no campo próprio.

---

### User Story 5 - Encerrar a espera aos três minutos (Priority: P2)

Se a resposta não fica pronta em três minutos (180 segundos), o canal encerra a espera e responde 504. O plantonista não recebe esse atraso como sucesso.

**Why this priority**: Protege o plantão de uma espera indefinida; o caminho feliz já entrega valor antes deste limite.

**Independent Test**: Usar um substituto que não conclui dentro do limite e observar 504, distinto de 400 e de 422.

**Acceptance Scenarios**:

1. **Given** uma execução que não produz resposta até 180 segundos, **When** o limite é atingido, **Then** o canal responde 504 e não devolve `answer`, `trace` e `metrics` como sucesso.
2. **Given** uma execução que termina antes de 180 segundos, **When** o resultado fica pronto, **Then** o canal responde 200 com `answer`, `trace` e `metrics`.
3. **Given** reflexão pedida, **When** o ciclo de crítica e regeneração ultrapassa 180 segundos, **Then** o limite vale para a espera inteira e o desfecho é 504.

---

### User Story 6 - Conferir o canal sem rede (Priority: P2)

Quem revisa o copiloto confirma o contrato do canal com uma estratégia substituta, determinística, sem contato com serviços externos.

**Why this priority**: Garante o contrato de aceitar, recusar e devolver o resultado; pode esperar o uso real com ReAct.

**Independent Test**: Apontar o catálogo do canal para um substituto que devolve sempre a mesma resposta para a mesma mensagem e exercer sucesso, corpo inválido, nome desconhecido e o pedido de reflexão, sem rede.

**Acceptance Scenarios**:

1. **Given** um substituto determinístico registrado sob um nome conhecido do ensaio, **When** a mesma mensagem válida é enviada duas vezes para `/chat` sem reflexão, **Then** as duas respostas 200 são idênticas em `answer` e o `trace` e as `metrics` vêm desse substituto, sem contato externo.
2. **Given** o mesmo substituto, **When** o envio omite a mensagem ou usa um tipo inválido, **Then** a resposta é 400 com `issues` e o substituto não executa.
3. **Given** o mesmo ensaio, **When** o nome enviado não está no catálogo, **Then** a resposta é 422 citando o nome e não há contato externo.
4. **Given** o substituto e um crítico substituto que também não usa rede, **When** a reflexão é pedida, **Then** o 200 é o do substituto envolvido pela reflexão; **When** a reflexão não é pedida, **Then** o 200 é o do substituto sozinho.

---

### Edge Cases

- Mensagem presente, porém em branco ou só com espaços: o envio é estruturalmente válido e segue a regra já existente de pedido vazio (resposta orientando a informar um pedido operacional, sem consulta ao modelo). Não é corpo inválido.
- Estratégia omitida: vale `react`. Reflexão omitida: a estratégia base roda sem reflexão.
- Reflexão pedida com estratégia omitida: ReAct envolvido pela camada de reflexão.
- Nome desconhecido com reflexão pedida: 422, sem aplicar reflexão.
- Nome com capitalização diferente de `react` ou `plan-and-execute`: é desconhecido.
- Estratégia informada como texto vazio: 422, não 400. O 400 fica para tipo errado, mensagem ausente ou pedido ilegível.
- Campos extras no pedido: são ignorados. Não invalidam o envio quando mensagem, estratégia e reflexão, se presentes, estão bem formados.
- Pedido ilegível ou corpo ausente: 400 com `issues`.
- O limite de 180 segundos inclui a reflexão inteira. Uma resposta que fica pronta no limite ainda é 200; ultrapassar o limite é 504.
- Um resultado que só ficaria pronto depois do limite não é entregue depois como sucesso nesse mesmo envio.
- Falha já conhecida da estratégia (modelo indisponível, teto de iterações, serviço fora do catálogo): continua sendo o resultado da própria estratégia quando ela termina dentro do limite, distinta de corpo inválido, nome desconhecido e tempo esgotado.
- Dois envios ao mesmo tempo não compartilham rastro nem métricas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O canal MUST aceitar o envio em `/chat` com mensagem em texto, nome de estratégia opcional e pedido de reflexão opcional (sim ou não).
- **FR-002**: Quando o nome de estratégia é omitido, o canal MUST executar `react` (ReAct).
- **FR-003**: Quando a reflexão é omitida ou recusada, o canal MUST executar a estratégia escolhida sem a camada de reflexão.
- **FR-004**: Quando a reflexão é pedida e o nome é conhecido, o canal MUST envolver a estratégia resolvida com a camada de reflexão já existente e devolver o resultado desse ciclo.
- **FR-005**: O catálogo do canal MUST reconhecer os nomes `react` e `plan-and-execute`. A reflexão MUST ser pedida no campo próprio, não por um nome composto.
- **FR-006**: Um envio aceito que termina dentro do limite MUST responder 200 com `answer`, `trace` e `metrics`. `answer` é o texto final, `trace` é o rastro de eventos e `metrics` traz as consultas ao modelo e o tempo decorrido.
- **FR-007**: O canal MUST validar o pedido antes de executar. Mensagem ausente, mensagem que não é texto, estratégia que não é texto, reflexão que não é sim/não, corpo ausente ou pedido ilegível MUST responder 400.
- **FR-008**: O 400 MUST incluir `issues`, a lista de problemas encontrados, um problema por falha, e MUST ocorrer sem executar estratégia.
- **FR-009**: Um nome de estratégia que não está no catálogo MUST responder 422, citando o nome rejeitado, sem executar estratégia e sem aplicar reflexão.
- **FR-010**: 400 e 422 MUST ser desfechos distintos. Texto vazio no nome da estratégia MUST responder 422.
- **FR-011**: Se a execução não produz o resultado até 180 segundos, o canal MUST responder 504 e MUST NOT apresentar `answer`, `trace` e `metrics` como sucesso.
- **FR-012**: O limite de 180 segundos MUST cobrir a espera inteira, inclusive quando a reflexão está pedida.
- **FR-013**: Mensagem em branco ou só com espaços MUST permanecer um envio válido e MUST preservar o comportamento de pedido vazio já definido para as estratégias, com desfecho 200.
- **FR-014**: O contrato do canal (200 com substituto determinístico, 400, 422 e reflexão ligada ou desligada sobre esse substituto) MUST ser conferível sem contato com serviços externos.
- **FR-015**: Cada envio MUST ser independente: rastro e métricas pertencem só àquela execução.

### Key Entities

- **Pedido de conversa**: Mensagem operacional em texto, nome opcional da estratégia e indicador opcional de reflexão.
- **Catálogo de estratégias**: Associação entre o nome que o plantonista envia e a estratégia que executa. Nomes de canal: `react` e `plan-and-execute`. O padrão, quando o nome falta, é `react`.
- **Execução com reflexão**: A estratégia resolvida envolvida pela camada de reflexão existente, usada só quando a reflexão é pedida.
- **Resultado de sucesso (200)**: `answer`, `trace` e `metrics` da execução.
- **Recusa de corpo inválido (400)**: Desfecho anterior à execução, com `issues`.
- **Recusa de estratégia desconhecida (422)**: Desfecho anterior à execução, identificando o nome que não está no catálogo.
- **Tempo esgotado (504)**: Desfecho quando o resultado não fica pronto em 180 segundos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos envios para `/chat` que trazem só uma mensagem válida e terminam dentro do limite, o plantonista recebe 200 com `answer`, `trace` e `metrics` produzidos por ReAct.
- **SC-002**: Em 100% dos envios malformados, a resposta é 400 antes de qualquer execução e `issues` cobre cada falha encontrada no pedido.
- **SC-003**: Em 100% dos envios com nome fora do catálogo, a resposta é 422, cita esse nome e nenhuma consulta ao modelo é feita por causa desse envio.
- **SC-004**: Com reflexão pedida numa estratégia conhecida, o 200 é o do ciclo de reflexão; sem reflexão pedida, a mesma estratégia responde sem crítica nem regeneração.
- **SC-005**: Quando a resposta não fica pronta em 3 minutos, o plantonista recebe 504 e não um 200. Execuções que terminam antes desse limite devolvem 200.
- **SC-006**: Duas conferências seguidas, com o mesmo substituto determinístico e a mesma mensagem, devolvem o mesmo `answer`. As conferências de 400, 422 e reflexão ligada ou desligada completam sem contato com serviços externos.

## Assumptions

- O canal é um único turno: uma mensagem entra, um resultado sai. Não há histórico de conversa nem sessão entre envios.
- O catálogo exposto ao plantonista contém as estratégias base já existentes, `react` e `plan-and-execute`. Os nomes `reflect:react` e `reflect:plan-and-execute` continuam válidos na arena e não são nomes deste canal.
- Pedir reflexão reutiliza a camada de reflexão já especificada, inclusive o teto padrão de reflexões (2). Este canal não aceita um teto diferente no pedido.
- Mensagem em branco segue o pedido vazio do núcleo de raciocínio: resposta orientativa, sem consulta ao modelo e sem chamar o crítico.
- Campos que o pedido não prevê são ignorados.
- O texto vazio no nome da estratégia não é um nome do catálogo e cai na recusa de estratégia desconhecida. Tipo errado cai na recusa de corpo inválido.
- `issues` no 400 é o relatório da validação de fronteira, com um item por problema, suficiente para corrigir o pedido. O formato interno de cada item fica para o planejamento, desde que cada problema permaneça identificável.
- O 422 informa o nome rejeitado e não reutiliza `issues` do 400. O formato exato desse aviso fica para o planejamento, desde que o nome rejeitado apareça.
- O 504 informa que a espera de 180 segundos se encerrou e não entrega `answer`, `trace` e `metrics` como sucesso nesse envio. Não se exige cancelar trabalho que ainda esteja em andamento fora dessa resposta. O texto exato do 504 fica para o planejamento.
- Falhas já definidas da estratégia, quando a execução termina dentro do limite, permanecem resultado da estratégia. Esta feature não cria desfechos novos para elas.
- O ensaio sem rede usa substitutos controlados da estratégia e, quando a reflexão é conferida, do crítico. O catálogo de produção do plantonista não passa a publicar o nome do substituto.
- Ficam fora desta feature: autenticação nova, histórico de chat, teto de reflexão configurável no pedido, novas estratégias base e mudança do contrato de rastro ou de métricas já definido.
