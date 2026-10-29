# Feature Specification: Grafo unificado de produção

**Feature Branch**: `013-grafo-unificado`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "Grafo unificado: production-graph.ts: nós contexto, roteador, as 3 estratégias como nós e resposta. Roteador: withStructuredOutput (route, reason); tabela no prompt; evento "route" e campo node em todo evento de trace. /chat: strategy opcional (se vier, é override no trace)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Um único caminho para todo turno de chat (Priority: P1)

Todo pedido não vazio enviado ao canal de chat percorre o mesmo caminho de produção, nesta ordem: preparar o contexto, decidir a rota, executar exatamente uma das três estratégias já existentes e devolver a resposta. As três estratégias são ReAct (`react`), Plan-and-Execute (`plan-and-execute`) e Reflexão (`reflection`). As outras duas não executam no mesmo turno.

**Why this priority**: Hoje o canal escolhe uma estratégia antes de um caminho único. Sem o caminho único, o plantonista não vê a mesma sequência de etapas em todo turno e o roteamento automático não tem onde encaixar.

**Independent Test**: Enviar um pedido não vazio com um roteador e estratégias substitutos. Confirmar que o contexto foi preparado, que só a estratégia da rota executou e que a resposta do turno é a resposta dessa estratégia.

**Acceptance Scenarios**:

1. **Given** um pedido operacional não vazio e nenhuma estratégia informada pelo plantonista, **When** o turno termina com sucesso, **Then** as etapas ocorrem nesta ordem: contexto preparado, rota decidida, exatamente uma estratégia entre `react`, `plan-and-execute` e `reflection`, resposta entregue.
2. **Given** a rota escolhida, **When** o turno executa, **Then** as outras duas estratégias não executam e a resposta vista pelo plantonista é a resposta da estratégia escolhida, sem uma segunda consulta só para reescrevê-la.
3. **Given** o mesmo pedido que hoje já monta contexto (instruções, mensagem atual, resumo, janela e memória, com os tetos já definidos), **When** o turno percorre o caminho único, **Then** a estratégia escolhida recebe esse contexto montado e não um atalho sem essas seções.
4. **Given** um pedido em branco ou só com espaços, **When** o plantonista envia o chat, **Then** o turno não percorre o caminho (não há roteamento nem estratégia) e devolve o aviso já existente pedindo um pedido operacional.

---

### User Story 2 - O roteador explica a rota (Priority: P1)

Quando o plantonista não informa estratégia, um roteador escolhe uma das três rotas e devolve uma decisão estruturada com dois campos: a rota (`route`) e o motivo (`reason`). As instruções do roteador contêm uma tabela que associa o tipo de pedido à rota. O rastro do turno ganha um evento `route` com essa decisão antes dos eventos da estratégia.

**Why this priority**: Sem rota e motivo visíveis, o plantonista não sabe por que o copiloto usou ReAct, planejamento ou reflexão.

**Independent Test**: Substituir o roteador por uma decisão fixa (`route` + `reason`) e ler o evento `route` no rastro, conferindo também que as instruções usadas pelo roteador automático contêm a tabela de rotas.

**Acceptance Scenarios**:

1. **Given** um pedido não vazio sem estratégia informada, **When** o roteador decide, **Then** a decisão tem `route` igual a `react`, `plan-and-execute` ou `reflection`, e `reason` é um texto não vazio.
2. **Given** essa decisão válida, **When** o plantonista lê o rastro, **Then** existe um evento `route` antes de qualquer evento da estratégia, com a mesma rota, o mesmo motivo, a etapa `router` e a indicação de que não foi override.
3. **Given** as instruções do roteador automático, **When** alguém as lê, **Then** elas incluem a tabela abaixo, com as três associações, e nenhuma quarta rota.

| Pedido do plantonista | Rota |
| --- | --- |
| Uma consulta ou uma ação direta (listar alertas, consultar status ou runbook, abrir ou resolver um incidente isolado, esquecer uma preferência) | `react` |
| Uma sequência de passos dependentes (investigar e então agir em mais de uma etapa) | `plan-and-execute` |
| Pedido de revisão, conferência ou maior confiança antes de aceitar a resposta | `reflection` |

4. **Given** um substituto do roteador que devolve `plan-and-execute` e um motivo fixo, **When** o turno termina, **Then** só Plan-and-Execute executa e o evento `route` repete essa rota e esse motivo.
5. **Given** um turno bem-sucedido sem `strategy`, **When** o plantonista lê o custo do turno, **Then** a decisão automática conta como uma consulta a mais (e o tamanho do pedido dessa decisão entra no total de tokens de prompt), além do custo da estratégia. **Given** um override, **When** o custo é lido, **Then** essa consulta automática não entra.

---

### User Story 3 - Cada evento do rastro diz a etapa (Priority: P1)

Todo evento do rastro de um turno de chat, inclusive os que já existiam (`thought`, `action`, `observation`, `plan`, `critique`, `answer`, `summarize`) e o novo `route`, traz o campo `node` com o nome da etapa que o produziu.

**Why this priority**: O rastro misturado sem etapa impede o plantonista de saber se um pensamento veio do roteador, de ReAct, do planejamento, da reflexão ou do fechamento da resposta.

**Independent Test**: Rodar um turno com substitutos que emitem pelo menos um evento de estratégia e um `route`. Todo item do rastro tem `node` preenchido com a etapa correta.

**Acceptance Scenarios**:

1. **Given** um turno bem-sucedido sem override, **When** o plantonista lê o rastro, **Then** cada evento tem `node`, o evento `route` tem `node` `router`, e os eventos emitidos pela estratégia têm `node` igual à rota executada (`react`, `plan-and-execute` ou `reflection`).
2. **Given** um evento `summarize` acrescentado ao fechar o turno, como já ocorre hoje, **When** ele entra no rastro, **Then** o `node` desse evento é `response`.
3. **Given** o aviso de pedido vazio, **When** o rastro traz o evento `answer` desse aviso, **Then** esse evento tem `node` `response` e não existe evento `route`.
4. **Given** qualquer evento do rastro do chat, **When** o campo `node` é lido, **Then** o valor é um destes: `context`, `router`, `react`, `plan-and-execute`, `reflection`, `response`. Não há evento sem `node`.

---

### User Story 4 - Estratégia informada é override no rastro (Priority: P1)

O campo `strategy` do chat continua opcional. Se o plantonista não envia, o roteador decide. Se envia um nome conhecido, essa estratégia é a rota do turno: o roteador automático não é consultado, as outras estratégias não rodam, e o rastro marca a escolha como override.

**Why this priority**: O plantonista precisa forçar uma estratégia sem pagar uma decisão automática e sem perder o registro de que a escolha foi dele.

**Independent Test**: Enviar o mesmo pedido com `strategy` igual a cada uma das três rotas, usando substitutos. O evento `route` marca override, o motivo é o texto fixo de override, e só a estratégia nomeada executa. Um nome fora da lista continua recusado antes de qualquer execução.

**Acceptance Scenarios**:

1. **Given** um pedido não vazio com `strategy` `react`, `plan-and-execute` ou `reflection`, **When** o turno termina com sucesso, **Then** o evento `route` traz essa rota, `override` verdadeiro, motivo `Estratégia informada no pedido.` e `node` `router`, e o roteador automático não é consultado.
2. **Given** esse override, **When** a execução segue, **Then** só a estratégia nomeada roda e a resposta do turno é a resposta dela.
3. **Given** uma mensagem não vazia e um nome que não é uma das três rotas (incluindo texto vazio, maiúsculas diferentes e os nomes compostos da arena), **When** o plantonista envia o pedido, **Then** o canal responde 422 citando esse nome, não executa estratégia, não consulta o roteador e não devolve rastro de rota.
4. **Given** o mesmo pedido sem `strategy` e com `strategy` conhecida, **When** os dois turnos terminam, **Then** só o segundo marca override e só o primeiro consulta o roteador automático.

---

### Edge Cases

- Decisão automática ilegível, sem `route`, sem `reason`, com motivo vazio ou com rota fora das três: nenhuma estratégia executa, não há evento `route` de sucesso, e o canal responde 502 `{ message }` com o texto `Não foi possível decidir a rota.` Esse desfecho é distinto de 400, de 422 e de 504.
- `strategy` com tipo errado (não é texto) continua 400, como hoje, e não entra no caminho.
- Pedido vazio não roteia, não consulta o roteador e não executa estratégia, mesmo se `strategy` vier preenchida com um nome conhecido ou desconhecido. O aviso de pedido vazio prevalece e não há 422 nesse caso.
- Tempo esgotado (limite já existente do chat) vale para o turno inteiro, inclusive a decisão automática, e continua 504. No override, o limite vale para a estratégia escolhida.
- `reflect` verdadeiro com rota efetiva `react` ou `plan-and-execute` continua envolvendo essa base com a camada de reflexão já existente (teto de 2), e os eventos dessa execução, inclusive `critique`, usam o `node` da rota efetiva (`react` ou `plan-and-execute`), não um quarto nome.
- `reflect` verdadeiro não cria um segundo ciclo quando a rota efetiva já é `reflection`.
- `reflect` omitido ou falso não acrescenta reflexão por conta própria. Omitir `strategy` não volta mais a forçar ReAct: quem escolhe é o roteador, e `reflect` só envolve a base se a rota efetiva for `react` ou `plan-and-execute`.
- Rota `reflection`: a etapa executa a camada de reflexão já existente sobre ReAct, com o crítico e o teto de 2 já usados no canal.
- Arena e comparação direta de estratégias ficam fora deste caminho. Os nomes compostos da arena não passam a ser aceitos no chat.
- Persistência da conversa, resumo de histórico e aprendizado depois de uma resposta bem-sucedida continuam como já estão; só passam a carregar `node` nos eventos de rastro que publicam.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Todo turno de chat com mensagem não vazia MUST percorrer um único caminho de produção, nesta ordem: contexto, roteador, exatamente uma estratégia, resposta.
- **FR-002**: As únicas rotas de estratégia MUST ser `react`, `plan-and-execute` e `reflection`. Em um turno bem-sucedido, as outras duas MUST NOT executar.
- **FR-003**: A etapa de contexto MUST montar o prompt da estratégia com as mesmas seções e tetos já vigentes. A etapa de resposta MUST entregar a resposta da estratégia escolhida sem uma consulta extra só para reescrevê-la.
- **FR-004**: Mensagem vazia ou só com espaços MUST NOT entrar nesse caminho e MUST devolver o aviso operacional já existente, com o evento `answer` marcado com `node` `response` e sem evento `route`.
- **FR-005**: Sem `strategy` no pedido, o roteador MUST produzir uma decisão estruturada com `route` (uma das três rotas) e `reason` (texto não vazio). As instruções desse roteador MUST incluir a tabela de rotas da User Story 2.
- **FR-006**: Todo turno bem-sucedido MUST incluir no rastro, antes dos eventos da estratégia, um evento `route` com `route`, `reason`, `override` e `node` `router`. Sem override, `override` MUST ser falso e `reason` MUST ser o motivo da decisão automática.
- **FR-007**: Todo evento do rastro do chat MUST ter `node` com um destes valores: `context`, `router`, `react`, `plan-and-execute`, `reflection`, `response`. Eventos gerados pela estratégia MUST usar o nome da rota efetiva. Eventos `summarize` do fechamento do turno MUST usar `response`.
- **FR-008**: `strategy` MUST continuar opcional. Quando o valor é `react`, `plan-and-execute` ou `reflection`, essa rota MUST ser a rota efetiva, o roteador automático MUST NOT ser consultado, e o evento `route` MUST ter `override` verdadeiro e `reason` exatamente `Estratégia informada no pedido.`
- **FR-009**: Um `strategy` que não é uma das três rotas MUST responder 422 citando o nome rejeitado, sem executar estratégia e sem consultar o roteador, nas mesmas condições em que o canal já recusa nome desconhecido. Texto vazio MUST continuar 422 e não 400. Nomes compostos da arena MUST continuar 422 no chat.
- **FR-010**: Decisão automática inválida (rota fora das três, campos ausentes ou motivo vazio) MUST NOT executar estratégia e MUST responder 502 `{ message: "Não foi possível decidir a rota." }`, distinto de 400, 422 e 504.
- **FR-011**: A consulta ao roteador automático MUST entrar nas métricas de custo do turno (consultas ao modelo e tokens de prompt). O override MUST NOT acrescentar essa consulta.
- **FR-012**: `reflect` verdadeiro MUST envolver com a reflexão já existente (teto 2) somente quando a rota efetiva for `react` ou `plan-and-execute`. A rota `reflection` MUST ser a reflexão sobre ReAct, sem segundo ciclo se `reflect` também for verdadeiro. Omitir `strategy` MUST NOT forçar ReAct.
- **FR-013**: O limite de espera já existente do chat MUST cobrir o turno inteiro. O pedido vazio MUST prevalecer sobre `strategy` presente e MUST NOT produzir 422.
- **FR-014**: O contrato deste caminho (uma estratégia, evento `route`, `node` em todo evento, override, 422 e 502) MUST ser conferível com substitutos determinísticos, sem contato com serviços externos. Arena e bench ficam fora deste caminho.

### Key Entities

- **Caminho de produção**: Sequência fixa de um turno de chat não vazio: contexto, roteador, uma estratégia, resposta.
- **Decisão de rota**: Rota escolhida (`react`, `plan-and-execute` ou `reflection`), motivo não vazio, e se a escolha foi override do plantonista ou decisão automática.
- **Evento de rastro**: Registro já existente do raciocínio, mais o evento `route`. Cada evento identifica a etapa em `node`.
- **Override de estratégia**: `strategy` opcional do pedido de chat. Quando presente e conhecida, substitui a decisão automática e fica visível no evento `route`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos turnos de chat bem-sucedidos com mensagem não vazia, exatamente uma das três estratégias executa, depois do contexto e da rota, e a resposta entregue é a dessa estratégia.
- **SC-002**: Em 100% dos eventos de rastro desses turnos, o plantonista identifica a etapa pelo campo `node`, e o evento `route` aparece antes dos eventos da estratégia.
- **SC-003**: Em 100% dos turnos sem `strategy`, a decisão automática traz rota e motivo, o rastro marca que não houve override, e o custo do turno inclui essa decisão.
- **SC-004**: Em 100% dos turnos com `strategy` conhecida, o rastro marca override com o motivo fixo, a estratégia nomeada é a única que executa, e nenhuma decisão automática entra no custo.
- **SC-005**: Em 100% dos envios com nome de estratégia fora das três rotas e mensagem não vazia, a resposta é 422, cita o nome e não há execução nem decisão automática. Em 100% das decisões automáticas inválidas, a resposta é 502 com a mensagem fixa e nenhuma estratégia executa.
- **SC-006**: Uma conferência repetível, com substitutos determinísticos e a mesma mensagem, observa o mesmo `answer`, o mesmo evento `route` e `node` em todos os eventos, sem contato com serviços externos.

## Assumptions

- As três estratégias do caminho são as já entregues no copiloto: ReAct, Plan-and-Execute e Reflexão. A rota `reflection` usa a camada de reflexão sobre ReAct, com o mesmo teto de 2 reflexões do canal. Não há quarta estratégia neste escopo.
- A tabela da User Story 2 é a política de roteamento desta feature. O roteador automático recebe essa tabela nas instruções; a conferência automatizada usa substituto determinístico e não depende de o modelo real acertar a tabela.
- Override não consulta o roteador automático: a escolha do plantonista já é a rota, e o evento `route` existe para deixar isso visível.
- O roteador olha a mensagem atual do plantonista para aplicar a tabela. O contexto montado (resumo, janela, memória, tetos) segue para a estratégia, não precisa ser recontado pelo roteador.
- `reflect` permanece no pedido com o significado atual de envolver uma base, e não vira um quarto valor de `strategy`. Os nomes `reflect:react` e `reflect:plan-and-execute` continuam só na arena.
- Quando a mensagem é vazia, o canal não valida a estratégia: o aviso de pedido vazio sai na frente, inclusive se `strategy` for desconhecida.
- Arena, bench, orçamento de contexto, memória, resumo e aprendizado não mudam de regra; apenas os eventos de rastro publicados no chat passam a identificar a etapa.
- Nenhum marcador de esclarecimento ficou em aberto: os defaults acima fecham rota, override, reflexão e erro de decisão inválida.
