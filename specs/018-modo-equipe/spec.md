# Feature Specification: Modo equipe

**Feature Branch**: `018-modo-equipe`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "Modo equipe em src/team/: supervisor com withStructuredOutput({ next, brief}) sobre um blackboard no estado. Papéis: analista (só leitura, não propõe), planejador (sem tools), executor (incidentes, sem bypass). Evento "handoff" no trace, renderizado no "ver raciocionio". Rota "team", teto 8"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - O supervisor conduz a equipe sobre um quadro (Priority: P1)

Quando a rota do turno é `team`, um supervisor lê um quadro compartilhado daquele turno e decide o próximo passo. A decisão tem exatamente dois campos visíveis: `next` (quem segue) e `brief` (a instrução, texto não vazio). `next` é um destes: `analista`, `planejador`, `executor` ou `encerrar`. O quadro começa sem achados, sem plano e sem registro de incidente, e carrega o pedido do plantonista. Cada papel escreve só a sua parte. Só o supervisor escolhe o próximo papel. `encerrar` não chama papel: o `brief` dessa decisão é a resposta do turno.

**Why this priority**: Sem supervisor e quadro, os três papéis não têm um turno único nem uma memória comum do que já foi lido, planejado ou feito.

**Independent Test**: Rodar um turno `team` com um supervisor substituto que devolve uma sequência fixa (`analista`, depois `planejador`, depois `encerrar`). Conferir que cada papel vê o que o anterior escreveu, que ninguém além do supervisor escolhe o próximo, e que a resposta é o `brief` de `encerrar`.

**Acceptance Scenarios**:

1. **Given** um pedido operacional não vazio na rota `team` e um quadro ainda sem achados, plano ou registro de incidente, **When** o turno começa, **Then** o supervisor decide antes de qualquer papel e a decisão traz `next` e `brief` não vazio.
2. **Given** `next` igual a `analista`, `planejador` ou `executor`, **When** essa decisão é aceita, **Then** só esse papel executa uma vez, com o `brief` e o quadro atual, e em seguida o supervisor decide de novo.
3. **Given** o analista já escreveu achados e o planejador já escreveu o plano, **When** o papel seguinte começa, **Then** ele lê essas partes no mesmo quadro do turno. O analista só altera achados, o planejador só altera o plano, o executor só altera o registro de incidente, e o supervisor não escreve nenhuma dessas três partes.
4. **Given** `next` igual a `encerrar` e um `brief` não vazio, **When** o turno termina, **Then** nenhum papel executa nessa decisão e a resposta vista pelo plantonista é exatamente esse `brief`.
5. **Given** a mesma rota `team`, **When** um papel termina, **Then** ele não escolhe o próximo papel nem chama outro papel por conta própria.

---

### User Story 2 - Cada papel só faz a sua parte (Priority: P1)

O analista só lê a operação e não propõe o que fazer. O planejador não usa ferramentas: só escreve o plano no quadro. O executor só mexe em incidentes e não contorna a aprovação humana já exigida para abrir ou resolver.

**Why this priority**: Se um papel ler e agir ao mesmo tempo, ou se o executor gravar incidente sem o plantonista, o modo equipe deixa de separar diagnóstico, plano e ação.

**Independent Test**: Oferecer a cada papel um substituto que tenta sair da sua função. O analista não dispõe de ferramenta que abra, resolva ou apague preferência, nem escreve o plano. O planejador não dispõe de ferramenta alguma. O executor, ao pedir abertura ou resolução, pausa para aprovação e não grava o incidente antes do sim do plantonista.

**Acceptance Scenarios**:

1. **Given** o analista em um turno `team`, **When** as ferramentas disponíveis são listadas, **Then** só existem `list_alertas`, `list_incidents`, `consultar_runbook` e `check_provider_status`. Não existem `open_incident`, `resolver_incident` nem `forget_preference`.
2. **Given** as instruções do analista, **When** alguém as lê, **Then** elas dizem que o papel relata fatos no quadro e não propõe abertura, resolução, plano de passos nem próxima ação. **Given** o analista termina, **When** o quadro é lido, **Then** o plano permanece como estava antes desse papel.
3. **Given** o planejador, **When** ele executa, **Then** nenhuma ferramenta é chamada e o plano do quadro passa a ser a lista ordenada de passos que ele produziu.
4. **Given** o executor, **When** as ferramentas disponíveis são listadas, **Then** só existem `open_incident` e `resolver_incident`.
5. **Given** o executor pede `open_incident` ou `resolver_incident`, **When** o turno reage, **Then** o plantonista vê o cartão de aprovar ou negar já usado no chat, o rastro inclui o `handoff` que chamou o executor, e o incidente não é aberto nem resolvido antes da aprovação. Não há caminho da equipe que grave o incidente sem essa espera.
6. **Given** o plantonista nega a aprovação, **When** a decisão é registrada, **Then** o incidente continua sem essa abertura ou resolução, como já ocorre fora do modo equipe.

---

### User Story 3 - A passagem de bastão aparece em ver raciocínio (Priority: P1)

Cada decisão do supervisor entra no rastro como um evento `handoff`, com o próximo papel e o `brief`, antes do papel executar. Em ver raciocínio o plantonista vê o tipo `handoff` e o texto do papel seguido do brief, na ordem em que aconteceram.

**Why this priority**: Sem o evento na tela, o plantonista não distingue quem recebeu o turno nem qual foi a instrução.

**Independent Test**: Produzir dois handoffs com substitutos e abrir ver raciocínio. Os dois aparecem na ordem, com o tipo `handoff` e a linha `papel: brief`.

**Acceptance Scenarios**:

1. **Given** uma decisão válida do supervisor, **When** ela é aceita, **Then** o rastro ganha um evento `handoff` com o mesmo `next`, o mesmo `brief` e `node` `team`, antes de o papel correspondente executar. A decisão `encerrar` também gera `handoff` e não é seguida de papel.
2. **Given** esse evento, **When** o plantonista abre ver raciocínio, **Then** a linha mostra o tipo `handoff` e o texto `{next}: {brief}` (por exemplo `analista: Ler os alertas em disparo.`), e não um bloco opaco em que papel e brief fiquem de fora.
3. **Given** vários handoffs no mesmo turno, **When** ver raciocínio abre, **Then** eles aparecem na ordem das decisões, junto dos eventos já conhecidos do turno.
4. **Given** o analista usou uma ferramenta de leitura, **When** o rastro é lido, **Then** a chamada e o resultado aparecem como os eventos de ação e observação já usados no copiloto, com `node` `team`, e os achados ficam no quadro.
5. **Given** o planejador escreveu o plano, **When** o rastro é lido, **Then** existe um evento de plano com esses passos e `node` `team`.

---

### User Story 4 - A rota team entra no plantão com teto 8 (Priority: P1)

`team` passa a ser uma rota de produção, ao lado de `react`, `plan-and-execute` e `reflection`. O plantonista pode pedi-la pelo nome. Se não pedir estratégia, o roteador pode escolhê-la quando o pedido pede diagnóstico, plano e ação de incidente em papéis separados. O turno aceita no máximo 8 decisões do supervisor. Na nona, ninguém é chamado.

**Why this priority**: Sem a rota e sem o teto, o modo não entra no caminho do chat ou pode repetir papéis sem fim.

**Independent Test**: Enviar `strategy` `team` e um supervisor substituto. O roteador automático não é consultado, o evento de rota marca override, e um substituto que sempre devolve `analista` para na oitava passagem com o aviso de teto. Um nome fora das quatro rotas continua recusado.

**Acceptance Scenarios**:

1. **Given** um pedido não vazio com `strategy` `team`, **When** o turno termina, **Then** a rota efetiva é `team`, o evento de rota marca override com o motivo já usado para estratégia informada, o roteador automático não é consultado, e as rotas `react`, `plan-and-execute` e `reflection` não executam.
2. **Given** um pedido não vazio sem `strategy` e um roteador substituto que devolve `team`, **When** o turno executa, **Then** só o modo equipe roda e o evento de rota traz `team`, o motivo do substituto e override falso.
3. **Given** as instruções do roteador automático, **When** alguém as lê, **Then** elas incluem a tabela abaixo e não citam uma quinta rota.

| Pedido do plantonista | Rota |
| --- | --- |
| Uma consulta ou uma ação direta (listar alertas, consultar status ou runbook, abrir ou resolver um incidente isolado, esquecer uma preferência) | `react` |
| Uma sequência de passos dependentes feita pelo mesmo agente (investigar e então agir em mais de uma etapa) | `plan-and-execute` |
| Pedido de revisão, conferência ou maior confiança antes de aceitar a resposta | `reflection` |
| Diagnóstico, plano e ação sobre incidentes que devem passar por papéis separados (leitura, plano sem ferramentas, execução de incidente) | `team` |

4. **Given** a oitava decisão chama um papel e nenhuma das oito foi `encerrar`, **When** esse papel termina, **Then** ele executa, não há nona decisão, e a resposta é `Teto de iterações atingido antes de concluir o raciocínio. (máximo: 8).`
5. **Given** a oitava decisão é `encerrar` com brief não vazio, **When** o turno acaba, **Then** a resposta é esse brief e não o aviso de teto.
6. **Given** uma decisão sem `next`, sem `brief`, com `brief` vazio ou com `next` fora dos quatro valores, **When** o supervisor responde, **Then** nenhum papel executa por causa dessa decisão, não há `handoff` de sucesso para ela, e o canal responde 502 `{ message: "Não foi possível decidir o próximo papel." }`.

---

### Edge Cases

- Pedido vazio ou só com espaços não entra no modo equipe, não consulta o roteador e devolve o aviso operacional já existente, mesmo se `strategy` for `team`.
- `strategy` `Team`, `TEAM` ou texto vazio continua recusado (422), como os outros nomes que não são exatamente uma rota. Nomes compostos da arena continuam recusados no chat.
- `strategy` com tipo que não é texto continua 400, como hoje.
- `reflect` verdadeiro com rota efetiva `team` não acrescenta outro ciclo de revisão por cima da equipe. O teto do turno equipe é 8 decisões do supervisor, não o teto de revisão das outras rotas.
- Aprovar ou negar no meio da equipe encerra esse turno no ponto da espera, do mesmo modo que as outras rotas. O executor não segue para outro papel na mesma ida ao canal. Depois da decisão humana, o fluxo de aprovação já existente responde; a equipe não retoma o quadro sozinha.
- Como abrir e resolver sempre esperam aprovação, uma decisão inválida do supervisor não deixa incidente novo aberto ou resolvido por essa equipe.
- O mesmo papel pode ser escolhido de novo. Cada escolha conta uma decisão no teto de 8.
- A primeira decisão já pode ser `encerrar`: um único `handoff`, nenhum papel, resposta igual ao brief.
- Tempo esgotado do chat continua valendo para o turno inteiro, inclusive supervisor e papéis, e continua 504.
- Eventos do modo equipe usam `node` `team`. O evento de rota continua com `node` `router`. Os `node` aceitos no chat passam a incluir `team`, sem tirar os que já existiam.
- Arena e bench não ganham o modo equipe. As outras três rotas, a aprovação humana e o aviso de pedido vazio permanecem como já estão quando a rota efetiva não é `team`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: `team` MUST ser uma rota de produção, junto de `react`, `plan-and-execute` e `reflection`. Um turno de chat bem-sucedido com mensagem não vazia MUST executar exatamente uma dessas quatro.
- **FR-002**: Na rota `team`, o supervisor MUST decidir antes de cada papel, a partir do quadro daquele turno. A decisão MUST ter `next` (`analista`, `planejador`, `executor` ou `encerrar`) e `brief` (texto não vazio).
- **FR-003**: O quadro MUST ser a memória compartilhada do turno, visível ao supervisor e aos três papéis. MUST começar sem achados, sem plano e sem registro de incidente, e MUST mostrar o pedido do plantonista. O analista MUST escrever só achados, o planejador só o plano, o executor só o registro de incidente. O supervisor MUST NOT escrever essas três partes. O quadro não é uma conversa nova gravada para o turno seguinte.
- **FR-004**: O analista MUST dispor só de `list_alertas`, `list_incidents`, `consultar_runbook` e `check_provider_status`. As instruções do analista MUST proibir propor abertura, resolução, plano ou próxima ação. O analista MUST NOT alterar o plano do quadro.
- **FR-005**: O planejador MUST NOT chamar ferramentas. MUST escrever no quadro uma lista ordenada de passos e MUST publicar esses passos no rastro com `node` `team`.
- **FR-006**: O executor MUST dispor só de `open_incident` e `resolver_incident`. As duas MUST continuar exigindo aprovação humana antes de gravar. O modo equipe MUST NOT oferecer caminho que abra ou resolva incidente sem essa espera. Negar MUST continuar sem gravar a ação.
- **FR-007**: Cada decisão válida do supervisor MUST gerar um evento `handoff` com esse `next`, esse `brief` e `node` `team`, antes do papel executar. `encerrar` MUST gerar `handoff`, MUST NOT executar papel, e o `brief` MUST ser a resposta do turno.
- **FR-008**: Ver raciocínio MUST mostrar cada `handoff` com o tipo `handoff` e o texto `{next}: {brief}`, na ordem das decisões, na mesma lista dos outros eventos do turno.
- **FR-009**: O turno `team` MUST parar com no máximo 8 decisões do supervisor. Se nenhuma das 8 for `encerrar`, a resposta MUST ser exatamente `Teto de iterações atingido antes de concluir o raciocínio. (máximo: 8).` e MUST NOT haver nona decisão. Se a oitava for `encerrar`, a resposta MUST ser o `brief`.
- **FR-010**: Decisão ilegível (campo ausente, `brief` vazio ou `next` fora dos quatro valores) MUST NOT executar papel, MUST NOT gerar `handoff` de sucesso, e MUST responder 502 `{ message: "Não foi possível decidir o próximo papel." }`, distinto de 400, 422 e 504.
- **FR-011**: `strategy` `team` MUST ser override: roteador automático não consultado, evento de rota com override verdadeiro e o motivo já usado quando a estratégia vem no pedido. Sem `strategy`, o roteador MAY devolver `team`. As instruções do roteador MUST incluir a tabela da User Story 4 e MUST NOT oferecer uma quinta rota.
- **FR-012**: Eventos produzidos pelo modo equipe MUST usar `node` `team`. Chamadas de ferramenta MUST continuar nos eventos de ação e observação já existentes, com esse `node`. O conjunto de `node` do chat MUST incluir `team` e os valores já aceitos.
- **FR-013**: `reflect` verdadeiro MUST NOT envolver a rota `team` com um ciclo extra de revisão. Pedido vazio, 422 para nome desconhecido, 400 para `strategy` que não é texto, e 504 de tempo esgotado MUST permanecer como já estão.
- **FR-014**: Espera de aprovação no executor MUST encerrar a ida ao canal como as outras rotas, com o `handoff` que chamou o executor já no rastro, sem outro papel depois disso na mesma ida.
- **FR-015**: Cada decisão do supervisor e cada consulta de papel ao modelo MUST entrar nas métricas de custo do turno. O override `team` MUST NOT acrescentar a consulta do roteador automático.
- **FR-016**: O contrato (papéis, quadro, `handoff`, teto 8, override, 502) MUST ser conferível com substitutos determinísticos, sem contato com serviços externos. Arena e bench ficam fora deste modo.

### Key Entities

- **Quadro do turno**: Memória comum da rota `team`. Partes: pedido do plantonista, achados, plano e registro de incidente. Vive só naquele turno.
- **Decisão do supervisor**: Par `next` e `brief`. `next` escolhe um papel ou encerra. `brief` é a instrução ou, no encerramento, a resposta.
- **Papel**: `analista` (leitura, sem proposta), `planejador` (plano, sem ferramentas) ou `executor` (abrir ou resolver incidente, com aprovação humana).
- **Evento handoff**: Registro no rastro de uma decisão válida, com o próximo passo, o brief e a etapa `team`.
- **Rota team**: Quarta rota do chat. Pode ser pedida pelo plantonista ou escolhida pelo roteador segundo a tabela da User Story 4.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos turnos `team` que terminam com `encerrar`, a resposta é o `brief` dessa decisão, há no máximo 8 handoffs, e cada papel chamado escreveu só a sua parte do quadro.
- **SC-002**: Em 100% dos handoffs de um turno exibido, ver raciocínio mostra o tipo `handoff` e o texto `{next}: {brief}` na ordem em que o supervisor decidiu.
- **SC-003**: Em 100% das passagens do analista, as únicas ferramentas disponíveis são as quatro de leitura, e o plano do quadro não muda nessa passagem. Em 100% das passagens do planejador, nenhuma ferramenta é chamada.
- **SC-004**: Em 100% dos pedidos do executor para abrir ou resolver incidente, o plantonista vê a espera de aprovação e o incidente não muda antes do sim. Em 100% das negações, a abertura ou resolução pedida não fica gravada.
- **SC-005**: Em 100% dos turnos que completam 8 decisões sem `encerrar`, a resposta é o aviso de teto com máximo 8 e não existe nona decisão. Em 100% das decisões ilegíveis, a resposta é 502 com a mensagem fixa e não há handoff dessa decisão.
- **SC-006**: Em 100% dos pedidos com `strategy` `team` e mensagem não vazia, só o modo equipe executa, o rastro marca override e o roteador automático não entra no custo. Uma conferência com substitutos e a mesma mensagem observa os mesmos handoffs, o mesmo quadro e a mesma resposta, sem contato com serviços externos.

## Assumptions

- A decisão do supervisor é um par fechado `next` e `brief`. O valor que encerra o turno é exatamente `encerrar`. Os nomes dos papéis são exatamente `analista`, `planejador` e `executor`.
- "Não propõe" vale para o analista: ele relata fatos e não escreve plano nem próxima ação. Quem propõe passos é o planejador. Quem age sobre incidente é o executor.
- "Sem bypass" vale para o executor: abrir e resolver continuam na espera de aprovação já existente. Não há atalho da equipe. Os papéis também não passam o bastão entre si.
- A tabela da User Story 4 é a política do roteador automático. A conferência usa substituto determinístico e não depende de o modelo real acertar a linha.
- O motivo de override permanece o texto já usado no canal: `Estratégia informada no pedido.`
- O quadro não substitui o contexto já montado para o chat (instruções, resumo, janela, memória). Esse contexto segue disponível no turno; o quadro é a memória extra entre os papéis da rota `team`.
- Um turno seguinte começa com quadro novo. O histórico da conversa continua pelo caminho já existente.
- `reflect` com as rotas `react` e `plan-and-execute` não muda. A rota `reflection` não muda.
- Nenhum marcador de esclarecimento ficou em aberto: os defaults acima fecham papéis, encerramento, teto, aprovação e a quarta linha da tabela.
