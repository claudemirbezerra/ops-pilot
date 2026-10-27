# Feature Specification: Conversa persistente

**Feature Branch**: `007-conversa-persistente`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Conversa persistente: ConversationStore (append/lastMessages/create) + tabela messages como no SqliteOpsStore; /chat: conversationId opcional, devolvido na resposta; 12 últimas mensagens no prompt via composição; métrica historyMessages; testes \":memory:\""

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Continuar o mesmo plantão (Priority: P1)

O plantonista manda um pedido para `/chat`. A resposta de sucesso traz um identificador de conversa. No pedido seguinte ele devolve esse identificador e o copiloto continua a mesma conversa, em vez de começar do zero. As mensagens permanecem depois que o processo reinicia.

**Why this priority**: O canal hoje esquece o turno anterior. Sem um fio contínuo, o plantonista repete contexto a cada pedido e o copiloto não sustenta o plantão.

**Independent Test**: Enviar um pedido sem identificador, ler o `conversationId` do 200, enviar um segundo pedido com esse identificador e, depois de reiniciar no mesmo arquivo de dados, confirmar que as duas trocas ainda estão na conversa.

**Acceptance Scenarios**:

1. **Given** um pedido operacional válido sem `conversationId`, **When** o plantonista envia para `/chat` e a execução termina dentro do limite, **Then** a resposta é 200 com `answer`, `trace`, `metrics` e um `conversationId` novo.
2. **Given** o `conversationId` devolvido nesse 200, **When** o plantonista envia outro pedido com esse identificador, **Then** a resposta é 200 com o mesmo `conversationId` e a conversa passa a ter as duas trocas (pedido e resposta de cada turno).
3. **Given** uma conversa já gravada, **When** o processo reinicia no mesmo arquivo de dados e o plantonista continua com o mesmo `conversationId`, **Then** as mensagens anteriores continuam disponíveis para esse fio.
4. **Given** duas conversas distintas, **When** o plantonista continua uma delas, **Then** o outro fio não entra no prompt nem muda de conteúdo.
5. **Given** um 200 de turno concluído, **When** se observa o que ficou gravado, **Then** estão o pedido do plantonista e a resposta do copiloto (`answer`), nessa ordem, e o rastro do raciocínio não vira mensagem da conversa.

---

### User Story 2 - Lembrar só a janela recente (Priority: P1)

Em cada turno o copiloto recebe, no texto do pedido, no máximo as 12 mensagens mais recentes da conversa, da mais antiga para a mais nova, incluindo o pedido atual. A resposta informa, em `metrics.historyMessages`, quantas mensagens entraram nesse prompt. Mensagens mais antigas continuam gravadas e ficam de fora desse turno.

**Why this priority**: Continuar a conversa sem limite enche o pedido e mistura plantões longos. A janela de 12 entrega contexto recente e um número conferível.

**Independent Test**: Gravar mais de 12 mensagens numa conversa, enviar mais um pedido com um substituto que revela o texto recebido e conferir que esse texto traz exatamente as 12 mais recentes (incluindo o pedido atual), omite a mais antiga e que `historyMessages` é 12.

**Acceptance Scenarios**:

1. **Given** uma conversa nova e um pedido válido, **When** o turno termina em 200, **Then** o texto entregue à estratégia contém só esse pedido, dá para distinguir que fala o plantonista, e `metrics.historyMessages` é 1.
2. **Given** um turno já concluído (pedido e resposta gravados) e um pedido novo na mesma conversa, **When** o turno termina em 200, **Then** o texto contém as mensagens já gravadas e o pedido atual, em ordem cronológica, com plantonista e copiloto distinguíveis, e `metrics.historyMessages` é 3.
3. **Given** 12 ou mais mensagens já gravadas, **When** chega um pedido novo, **Then** o texto contém exatamente 12 mensagens: o pedido atual e as 11 gravadas mais recentes que cabem; a mais antiga fica de fora; `metrics.historyMessages` é 12.
4. **Given** menos de 12 mensagens contando o pedido atual, **When** o turno termina em 200, **Then** todas entram no texto e `metrics.historyMessages` é essa quantidade.
5. **Given** ReAct, Plan-and-Execute ou reflexão pedida, **When** o turno roda, **Then** a estratégia recebe o mesmo texto já composto e não busca o histórico por conta própria. `historyMessages` conta a janela uma vez no turno, sem multiplicar pelas regenerações da reflexão.
6. **Given** um 200, **When** o plantonista lê `metrics`, **Then** `llmCalls` e `latencyMs` continuam presentes com o sentido que já têm, e `historyMessages` é um inteiro de 0 a 12.

---

### User Story 3 - Recusar fio inexistente ou pedido inválido sem gravar (Priority: P1)

Se o identificador não existe, o canal responde 404 e não cria outra conversa. Corpo inválido continua 400, estratégia desconhecida continua 422 e tempo esgotado continua 504. Nenhum desses desfechos grava mensagem nem conversa nova.

**Why this priority**: Um identificador errado não pode abrir um fio paralelo em silêncio, nem uma falha pode deixar pedido sem resposta no histórico.

**Independent Test**: Enviar um `conversationId` que não existe e observar 404 sem execução e sem conversa nova; repetir corpo inválido, nome desconhecido e tempo esgotado e confirmar que o histórico não muda.

**Acceptance Scenarios**:

1. **Given** um `conversationId` em texto que não identifica conversa nenhuma, **When** o plantonista envia um pedido válido, **Then** o canal responde 404, não executa estratégia e não cria conversa nem mensagem.
2. **Given** `conversationId` ausente no pedido, **When** o corpo é válido e o turno termina em 200, **Then** o canal cria a conversa e devolve o identificador novo. Isso não é 404.
3. **Given** `conversationId` com tipo que não é texto, texto vazio ou só espaços, **When** o canal valida o pedido, **Then** responde 400 com `issues` e não grava nada.
4. **Given** um nome de estratégia fora do catálogo, com ou sem `conversationId` existente, **When** o canal valida o nome, **Then** responde 422, não executa e não grava nada.
5. **Given** uma execução que não fica pronta em 180 segundos, **When** o limite é atingido, **Then** a resposta é 504 e a conversa permanece como estava antes do pedido, sem `conversationId` novo.
6. **Given** um pedido que falha em mais de uma regra, **When** o canal responde, **Then** vale a primeira da ordem: 400 (corpo), depois 422 (estratégia), depois 404 (conversa), e só então a execução.

---

### User Story 4 - Conferir histórico sem arquivo e sem rede (Priority: P2)

Quem revisa a feature confirma o guarda de conversa e o contrato do canal num banco em memória, com estratégia substituta determinística, sem arquivo de dados e sem contato externo.

**Why this priority**: O fio contínuo e a janela de 12 precisam ser regressão segura. O plantão real pode esperar essa conferência.

**Independent Test**: Exercer criar conversa, acrescentar mensagem, ler as últimas e o `/chat` (identificador novo, continuação, janela de 12, `historyMessages`, 400, 404 e pedido em branco) só com banco em memória e substituto sem rede.

**Acceptance Scenarios**:

1. **Given** um guarda de conversa em memória, **When** se cria uma conversa, se acrescentam mensagens e se leem as últimas com um limite, **Then** a conversa nasce vazia, o identificador é estável e a leitura devolve no máximo o limite pedido, só as mais recentes, da mais antiga para a mais nova.
2. **Given** duas conversas no mesmo guarda em memória, **When** se leem as últimas de uma, **Then** a outra não aparece.
3. **Given** um falante que não é o plantonista nem o copiloto, **When** se tenta acrescentar a mensagem, **Then** o guarda rejeita.
4. **Given** o canal apontando para esse guarda e para um substituto determinístico, **When** a suíte cobre sucesso, continuação, janela, métrica, 400 e 404, **Then** tudo passa sem arquivo de dados e sem contato externo.
5. **Given** o mesmo ensaio, **When** a mensagem é só espaços, **Then** o 200 segue o pedido vazio já existente, `historyMessages` é 0, nada é gravado e, se não havia `conversationId`, a resposta não inventa um.

---

### Edge Cases

- Mensagem em branco ou só com espaços: continua um 200 de pedido vazio, sem consulta ao modelo, sem gravar conversa nem mensagem. `historyMessages` é 0. Se veio um `conversationId` existente, a resposta o devolve e não acrescenta nada. Se o identificador não existe, a resposta é 404. Se o identificador foi omitido, a resposta não traz `conversationId`.
- `conversationId` omitido cria conversa só quando o turno termina em 200. `null`, número, texto vazio ou só espaços é 400.
- Identificador desconhecido não cria conversa substituta.
- A janela conta o pedido atual mais as mensagens já gravadas que couberem, até 12. A resposta que ainda está sendo produzida não entra no próprio prompt; entra na conversa depois do 200 e só aparece num turno seguinte.
- Com 12 mensagens já gravadas, o pedido novo expulsa a mais antiga do prompt. Ela continua gravada.
- Reflexão pedida não muda a janela nem soma `historyMessages` por regeneração. O limite de 180 segundos continua valendo para a espera inteira.
- Resposta 200 da própria estratégia quando o modelo está indisponível ou o teto de iterações estoura: é turno concluído, grava pedido e `answer`, e leva a `historyMessages` da janela. Isso é distinto de 504.
- 400, 422 e 504 não gravam e não devolvem conversa nova. Os contratos já existentes desses desfechos permanecem.
- Dois pedidos ao mesmo tempo na mesma conversa só enxergam mensagens já gravadas quando cada um começou. Os dois 200 gravam as duas trocas. Nenhum apaga o outro.
- Abrir o guarda de novo no mesmo arquivo não apaga mensagens nem as tabelas operacionais já existentes. Duas aberturas não duplicam a conversa.
- Mensagem de uma conversa não aparece na leitura nem no prompt de outra.
- Arena e bench continuam um pedido único, sem identificador de conversa e sem esta janela.
- Campos extras no pedido são ignorados, como no canal atual.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O canal MUST aceitar em `/chat` um `conversationId` opcional, além da mensagem, da estratégia opcional e da reflexão opcional já existentes.
- **FR-002**: Quando `conversationId` é omitido e o turno termina em 200, o canal MUST criar uma conversa nova e devolver o identificador em `conversationId`.
- **FR-003**: Quando `conversationId` identifica uma conversa existente e o turno termina em 200, o canal MUST continuar essa conversa e devolver o mesmo identificador.
- **FR-004**: Um `conversationId` em texto que não identifica conversa MUST responder 404, sem executar estratégia, sem criar conversa e sem gravar mensagem.
- **FR-005**: `conversationId` que não é texto, vazio ou só com espaços MUST responder 400 com `issues`, sem gravar. Mensagem ausente ou de tipo errado, estratégia de tipo errado, reflexão que não é sim/não, corpo ausente ou pedido ilegível MUST continuar 400, como no canal atual.
- **FR-006**: Nome de estratégia fora do catálogo MUST continuar 422, sem executar e sem gravar, com ou sem `conversationId`.
- **FR-007**: Se a execução não produz resultado até 180 segundos, o canal MUST responder 504 e MUST deixar conversas e mensagens como estavam antes do pedido.
- **FR-008**: A ordem dos desfechos MUST ser 400, depois 422, depois 404, e só então a execução. Mensagens da conversa MUST ser gravadas só num 200 de turno executado. O 200 de pedido vazio MUST NOT gravar (FR-014).
- **FR-009**: Cada turno gravado MUST acrescentar, nesta ordem, a mensagem do plantonista e a resposta do copiloto. A resposta gravada MUST ser o `answer`. O rastro MUST NOT entrar na conversa.
- **FR-010**: O guarda de conversa MUST oferecer três operações: criar uma conversa vazia e devolver o identificador; acrescentar uma mensagem a uma conversa; ler até um limite das mensagens mais recentes, da mais antiga para a mais nova.
- **FR-011**: Antes de executar a estratégia, a composição do turno MUST montar o texto do pedido com no máximo as 12 mensagens mais recentes da conversa, incluindo o pedido atual e excluindo a resposta ainda não produzida. Mensagens além dessas 12 MUST permanecer gravadas e MUST NOT entrar nesse prompt.
- **FR-012**: O texto composto MUST estar em ordem cronológica e MUST distinguir plantonista de copiloto. ReAct, Plan-and-Execute e a reflexão MUST receber esse texto já composto. A estratégia MUST NOT carregar o histórico por conta própria.
- **FR-013**: O 200 MUST incluir `metrics.historyMessages`, inteiro de 0 a 12, igual à quantidade de mensagens que entraram no texto composto. O valor MUST ser contado uma vez por turno. `metrics.llmCalls` e `metrics.latencyMs` MUST permanecer.
- **FR-014**: Mensagem em branco ou só com espaços MUST manter o 200 de pedido vazio, com `historyMessages` 0, sem gravar. Se o `conversationId` informado existe, MUST ser devolvido sem nova mensagem. Se não existe, MUST ser 404. Se foi omitido, a resposta MUST NOT trazer `conversationId`.
- **FR-015**: Conversas distintas MUST ser isoladas: leitura e prompt de uma MUST NOT incluir mensagens da outra.
- **FR-016**: As mensagens MUST persistir no mesmo arquivo de dados das operações, lido de `OPSPILOT_DB`, com default `./data/opspilot.db`, na coleção `messages`, no mesmo padrão do guarda operacional: criação idempotente que não apaga dados já existentes, consultas parametrizadas e sem texto de consulta montado por concatenação com entrada. Testes MUST usar `:memory:`.
- **FR-017**: O falante da mensagem MUST ser só plantonista ou copiloto. Qualquer outro falante MUST ser rejeitado pelo guarda.
- **FR-018**: A conferência do guarda (criar, acrescentar, ler com limite, isolamento e falante inválido) e do canal (200 com identificador, continuação, janela de 12, `historyMessages`, 400, 404 e pedido vazio) MUST ser possível sem arquivo de dados e sem contato com serviços externos.
- **FR-019**: Arena e bench MUST continuar sem conversa persistente e sem a janela de 12.

### Key Entities

- **Conversa**: Fio contínuo do plantão, com identificador estável devolvido em `conversationId`. Nasce vazia. Não tem dono nem nome nesta feature.
- **Mensagem**: Um turno de fala dentro de uma conversa. Tem falante (plantonista ou copiloto), texto e posição no tempo. O pedido gravado usa o texto enviado; a resposta gravada usa o `answer`.
- **Janela do prompt**: As no máximo 12 mensagens mais recentes usadas na composição do turno, sempre incluindo o pedido atual quando o turno vai executar, em ordem cronológica.
- **Resultado de sucesso (200)**: `answer`, `trace`, `metrics` (`llmCalls`, `latencyMs`, `historyMessages`) e `conversationId` quando há conversa criada ou continuada.
- **Recusas já existentes**: 400 com `issues`, 422 com o nome rejeitado, 504 quando a espera de 180 segundos se esgota.
- **Conversa inexistente (404)**: O identificador em texto não aponta para conversa nenhuma. Nada é executado nem gravado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos pedidos válidos sem `conversationId` que terminam dentro do limite, o plantonista recebe 200 com um `conversationId` que, reenviado, continua a mesma conversa.
- **SC-002**: Depois de reiniciar no mesmo arquivo de dados, 100% das mensagens já gravadas da conversa seguem disponíveis para o turno seguinte, e uma segunda conversa não recebe essas mensagens.
- **SC-003**: Com mais de 12 mensagens na conversa, o texto do turno contém exatamente 12, `historyMessages` é 12 e a mensagem mais antiga permanece gravada fora desse prompt. Com menos, `historyMessages` é igual à quantidade incluída, contando o pedido atual.
- **SC-004**: Em 100% dos corpos inválidos a resposta é 400; em 100% dos nomes fora do catálogo, 422; em 100% dos identificadores desconhecidos, 404; em 100% das esperas além de 3 minutos, 504. Nenhum desses casos altera conversas ou mensagens.
- **SC-005**: Dois turnos concluídos na mesma conversa deixam quatro mensagens gravadas (pedido e resposta de cada um), e o segundo prompt mostra o primeiro pedido, a primeira resposta e o segundo pedido.
- **SC-006**: A conferência do guarda e do canal, incluindo a janela e `historyMessages`, completa sem arquivo de dados e sem contato com serviços externos.

## Assumptions

- O canal de chat já existente permanece: `message`, `strategy` opcional com padrão `react`, `reflect` opcional, catálogo `react` e `plan-and-execute`, 200 com `answer`, `trace` e `metrics`, 400 com `issues`, 422 para nome desconhecido e 504 aos 180 segundos. Esta feature acrescenta conversa, janela e `historyMessages`.
- `conversationId` no pedido e na resposta é texto. O formato interno do identificador fica para o planejamento, desde que seja estável e o cliente possa devolvê-lo sem alteração. Número, `null`, vazio ou só espaços não são identificador.
- O 404 informa que a conversa não existe e não reutiliza `issues` do 400 nem o aviso do 422. O texto exato fica para o planejamento, desde que o desfecho seja distinguível.
- A resposta do copiloto gravada é o `answer` do turno, não o rastro, as métricas nem o texto composto.
- A janela de 12 é fixa nesta feature. Não há parâmetro no pedido para outro tamanho. `historyMessages` conta mensagens incluídas no texto composto, não tokens, e inclui o pedido atual. No primeiro turno concluído o valor é 1.
- O texto exato da composição fica para o planejamento, desde que a ordem seja cronológica, os dois falantes sejam distinguíveis e só a janela entre.
- Pedido vazio segue a regra já existente: resposta orientativa, sem consulta ao modelo. Não grava histórico.
- Não há, nesta feature, listagem, exclusão, edição ou título de conversa, nem separação por plantonista. Quem conhece o `conversationId` continua o fio. Não há autenticação nova.
- As mensagens ficam no mesmo arquivo das operações e sobrevivem ao reinício com ele. Não há prazo de retenção: permanecem até o arquivo ser removido. A coleção nova não apaga serviços, alertas, incidentes nem runbooks.
- Os nomes persistidos dos falantes ficam para o planejamento, desde que só existam os dois e qualquer outro seja rejeitado.
- Arena e bench permanecem de turno único, no store operacional em memória que já usam, sem este histórico.
- Dois pedidos simultâneos não exigem fila além de gravar as duas trocas quando ambos terminam em 200, cada prompt só com o que já estava gravado no início daquele pedido.
