# Feature Specification: War room web

**Feature Branch**: `016-war-room-web`

**Created**: 2026-10-30

**Status**: Draft

**Input**: User description: "War room web/ (vite+react+TS) com as instructions de design: chat -> /chat, com \"ver raciocinio\" abrindo o trace tipado. 202 vira cartão aprovar/negar, engrenagem com URL da API; base /opspilot; CORS"

## Clarifications

### Session 2026-10-30

- Q: Esta feature deve incluir o contrato HTTP de pendência 202 e o envio de aprovar/negar na API, ou só a war room consumindo um contrato já existente? → A: API + UI — definir e implementar 202 + decisão de aprovar/negar sob `/opspilot`, e a war room
- Q: Como a war room deve enviar a decisão aprovar/negar de volta à API? → A: Endpoint dedicado sob /opspilot (ex.: POST /opspilot/approvals/:id com { decision: approve | deny })
- Q: Qual política CORS a API /opspilot deve aplicar para a war room? → A: Refletir a Origin do pedido (ou allowlist curta configurável por ambiente)
- Q: Em que situação o `POST /opspilot/chat` deve responder 202 (pendência humana) em vez de 200? → A: Só quando a execução atingir um gate explícito "requer aprovação humana" (ferramenta/ação marcada)
- Q: As rotas HTTP atuais na raiz (ex.: `/chat`) devem continuar existindo além do prefixo `/opspilot`? → A: Sim — raiz e `/opspilot` (war room usa só o prefixo)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conversar com o copiloto na war room (Priority: P1)

O plantonista abre a war room, envia um pedido operacional pelo chat e vê a resposta do copiloto na conversa. O envio usa o canal de chat do OpsPilot sob o prefixo de API `/opspilot` (rota efetiva de chat: `/opspilot/chat`).

**Why this priority**: Sem o loop de conversa a war room não entrega valor de plantão; o restante (trace, aprovação, configuração) gira em torno dele.

**Independent Test**: Com a API acessível e a URL configurada, enviar uma mensagem e receber a resposta final na timeline do chat.

**Acceptance Scenarios**:

1. **Given** a war room aberta e a URL da API válida, **When** o plantonista envia um pedido em texto, **Then** a war room chama o chat do OpsPilot e exibe a resposta do copiloto na conversa.
2. **Given** um turno bem-sucedido, **When** a resposta chega, **Then** a mensagem do plantonista e a do copiloto permanecem visíveis na ordem do turno.
3. **Given** a war room sem mensagens ainda, **When** a tela carrega, **Then** aparece estado vazio orientativo (não tela em branco), com indicação de que o chat está pronto para o primeiro pedido.
4. **Given** falha de rede ou erro de operação do chat, **When** o envio termina com erro, **Then** a war room mostra mensagem acionável (o que falhou + o que tentar) sem apagar o histórico já útil.

---

### User Story 2 - Ver o raciocínio tipado do turno (Priority: P1)

Após uma resposta que traz rastro de execução, o plantonista aciona **Ver raciocínio** e inspeciona o trace tipado daquele turno (eventos com tipo reconhecível e conteúdo associado), sem sair do contexto da conversa.

**Why this priority**: O diferencial operacional da war room é auditar o que o agente fez, não só ler a resposta final.

**Independent Test**: Em um turno com trace, abrir **Ver raciocínio** e confirmar lista/painel de eventos tipados daquele turno.

**Acceptance Scenarios**:

1. **Given** um turno com resposta e trace, **When** o plantonista escolhe **Ver raciocínio**, **Then** a war room abre uma visão do trace daquele turno com eventos tipados (tipo + conteúdo/payload legível).
2. **Given** a visão de raciocínio aberta, **When** o plantonista fecha ou volta, **Then** retorna ao chat sem perder o histórico da conversa.
3. **Given** um turno sem eventos de trace, **When** **Ver raciocínio** estaria disponível, **Then** a ação fica indisponível ou mostra estado vazio específico (“sem eventos neste turno”), sem erro genérico.
4. **Given** o painel de raciocínio, **When** o plantonista navega por teclado, **Then** consegue abrir, percorrer e fechar a visão com foco visível (acessibilidade básica do overlay/painel).

---

### User Story 3 - Aprovar ou negar quando o chat responde 202 (Priority: P1)

Quando o canal de chat responde **202** porque a execução atingiu um gate explícito de aprovação humana, a war room não trata isso como erro: apresenta um **cartão de aprovar/negar**. O plantonista decide; a decisão é enviada de volta à API e o fluxo do turno continua ou encerra conforme o desfecho.

**Why this priority**: Gates humanos no plantão exigem UI explícita; confundir 202 com falha quebraria o fluxo operacional.

**Independent Test**: Simular (ou receber) uma resposta 202 do chat e completar aprovar e, em outro caso, negar, observando o cartão e o desfecho na conversa.

**Acceptance Scenarios**:

1. **Given** um envio de chat que retorna 202 com pendência de decisão, **When** a war room interpreta a resposta, **Then** exibe um cartão de **Aprovar** / **Negar** (ações claras; uma primária por convenção de hierarquia) em vez de banner de erro de falha.
2. **Given** o cartão visível com id de pendência, **When** o plantonista aprova, **Then** a war room chama o endpoint dedicado de aprovação sob `/opspilot` com decisão `approve` e atualiza a conversa com o desfecho (sem deixar o cartão “preso” como pendente).
3. **Given** o cartão visível com id de pendência, **When** o plantonista nega, **Then** a war room chama o mesmo endpoint dedicado com decisão `deny` e atualiza a conversa com o desfecho correspondente.
4. **Given** o cartão pendente, **When** o plantonista tenta enviar outra mensagem de chat no mesmo fluxo sem decidir, **Then** a UI impede ou avisa que há decisão pendente (não silencia o 202).

---

### User Story 4 - Configurar a URL da API na engrenagem (Priority: P1)

O plantonista abre a **engrenagem** (configurações), informa a URL base da API OpsPilot e salva. Os pedidos de chat (e demais chamadas da war room) usam essa URL, respeitando o prefixo `/opspilot`.

**Why this priority**: Sem apontar para a API correta, a war room não opera em dev local nem contra outro host.

**Independent Test**: Alterar a URL na engrenagem, salvar, enviar um chat e verificar que a chamada vai para o host configurado sob `/opspilot`.

**Acceptance Scenarios**:

1. **Given** a war room aberta, **When** o plantonista abre a engrenagem, **Then** vê um campo para a URL da API (valor atual pré-preenchido se já houver).
2. **Given** uma URL válida salva, **When** o plantonista envia um chat, **Then** a requisição usa essa base + caminho sob `/opspilot` (chat em `/opspilot/chat`).
3. **Given** URL inválida ou vazia ao salvar, **When** a validação roda, **Then** a UI mostra erro inline no campo e não persiste o valor inválido.
4. **Given** URL salva em uma sessão anterior, **When** o plantonista reabre a war room, **Then** a URL configurada ainda está disponível (persistência local da preferência).

---

### User Story 5 - API sob `/opspilot` com CORS para a war room (Priority: P1)

O servidor HTTP do OpsPilot expõe as rotas sob o prefixo **`/opspilot`** (espelhando as da raiz) e permite origem do front (CORS), para que o navegador consiga chamar o chat e correlatos a partir da war room.

**Why this priority**: Sem prefixo e CORS, o front no navegador não integra com a API de forma utilizável.

**Independent Test**: A partir da origem da war room, um pedido de chat para `/opspilot/chat` completa com headers CORS adequados; caminho sem o prefixo não é o contrato da war room.

**Acceptance Scenarios**:

1. **Given** o servidor OpsPilot em execução, **When** um cliente chama o chat em `/opspilot/chat`, **Then** o canal responde conforme o contrato de chat já existente (sucesso ou erros de domínio).
2. **Given** a war room servida em origem distinta da API, **When** o navegador faz a requisição prévia/efetiva ao chat, **Then** a API responde com CORS que reflete essa Origin (ou a inclui na allowlist configurada), com métodos e headers necessários ao chat e à decisão 202.
3. **Given** o servidor com montagem dual, **When** um cliente legado chama `/chat` na raiz e a war room chama `/opspilot/chat`, **Then** ambos alcançam o canal; a war room permanece só no caminho prefixado.

---

### User Story 6 - Design operacional da war room (Priority: P2)

A interface segue as instruções de design do projeto para `web/**`: hierarquia tipográfica, escala de espaçamento, estados vazios/erro, dark mode e acessibilidade básica.

**Why this priority**: Consistência e legibilidade no plantão; não bloqueia o MVP de conversa, mas é critério de aceite da superfície web.

**Independent Test**: Revisar a war room contra a checklist de design (hierarquia, tokens de espaço, empty/error, tema escuro, foco/teclado).

**Acceptance Scenarios**:

1. **Given** a war room em tema claro ou escuro, **When** o plantonista lê chat, cartão 202 e painel de raciocínio, **Then** contraste e tokens semânticos permanecem legíveis nos dois temas.
2. **Given** lista/conversa vazia ou falha de envio, **When** esses estados aparecem, **Then** empty e error seguem o padrão (título + frase + CTA/retry quando couber), sem copy genérica inútil.
3. **Given** uso só por teclado, **When** o plantonista envia mensagem, abre raciocínio e decide no cartão 202, **Then** todas as ações são alcançáveis com foco visível.

---

### Edge Cases

- API indisponível ou CORS rejeitado: erro de operação com retry; histórico local da conversa na sessão não é apagado.
- Resposta 200 com `answer` mas sem `trace`: chat ok; **Ver raciocínio** indisponível ou vazio específico.
- Resposta 4xx/5xx do chat: não confundir com 202; mostrar erro de operação (não cartão de aprovação).
- Turno sem gate de aprovação: resposta de sucesso (200), nunca 202 só por ter tool calls não marcadas.
- 202 sem payload suficiente para decidir: estado de erro no cartão (“pendência incompleta”) + opção de descartar/retry conforme contrato.
- URL da API com barra final ou sem: normalização para montar `/opspilot/...` sem caminho duplicado ou quebrado.
- Dois cartões 202: no máximo uma pendência ativa por conversa na UI; nova 202 substitui ou bloqueia até resolver a atual (comportamento documentado nas Assumptions).
- Tema do sistema `prefers-color-scheme` / reduced motion: dark mode e animações respeitam preferência do usuário.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A war room MUST permitir ao plantonista enviar mensagens de chat ao OpsPilot e exibir as respostas na conversa.
- **FR-002**: As chamadas de chat da war room MUST usar o caminho **`/opspilot/chat`** relativo à URL base configurada.
- **FR-003**: Após um turno com trace, a war room MUST oferecer **Ver raciocínio**, abrindo uma visão do trace **tipado** (eventos com tipo e conteúdo) daquele turno.
- **FR-004**: Quando a resposta do chat for **HTTP 202**, a war room MUST renderizar um cartão com ações **Aprovar** e **Negar**, e MUST NOT tratar 202 como falha genérica de rede/servidor.
- **FR-005**: Aprovar e Negar MUST enviar a decisão humana via **endpoint dedicado** sob `/opspilot` (não via `POST .../chat` nem mensagem de texto livre) e MUST atualizar a UI com o desfecho (cartão deixa de ficar pendente).
- **FR-006**: A war room MUST expor configuração via **engrenagem** para definir e persistir a URL base da API.
- **FR-007**: O servidor HTTP OpsPilot MUST servir o canal de chat (e endpoints da decisão 202) sob o prefixo **`/opspilot`**; a war room MUST usar apenas caminhos prefixados.
- **FR-008**: O servidor HTTP OpsPilot MUST habilitar **CORS** refletindo a Origin do pedido (ou allowlist curta configurável por ambiente), cobrindo métodos e headers do chat e da decisão de aprovação/negação; MUST NOT depender de Access-Control-Allow-Origin: * como política única do MVP.
- **FR-009**: A war room MUST seguir as instruções de design em `.cursor/rules/design.instructions.mdc` (hierarquia, escala de espaçamento, empty/error, dark mode, acessibilidade).
- **FR-010**: Estados vazios e de erro na war room MUST ser explícitos e acionáveis; falhas MUST distinguir rede/API de validação de URL e de pendência 202.
- **FR-011**: A war room MUST permanecer utilizável por teclado para envio de chat, abertura/fechamento do raciocínio e decisão no cartão 202.
- **FR-012**: Preferências de URL da API MUST persistir entre sessões no mesmo navegador/dispositivo do plantonista.
- **FR-013**: Esta feature MUST definir e implementar o contrato HTTP de **pendência 202** no canal de chat (quando houver gate humano) e um **endpoint dedicado** sob `/opspilot` para submeter **aprovar** ou **negar** (identificador da pendência + decisão), não apenas a UI consumidora.
- **FR-014**: A resposta **202** do chat MUST incluir identificador de pendência usável pelo endpoint de aprovação; `POST /opspilot/chat` MUST NOT ser o veículo da decisão humana.
- **FR-015**: `POST /opspilot/chat` MUST responder **202** somente quando a execução atingir um **gate explícito** de aprovação humana (ferramenta ou ação marcada); turnos sem esse gate MUST concluir com o contrato de sucesso existente (tipicamente 200), não com 202.
- **FR-016**: Rotas HTTP já existentes na **raiz** (ex.: `/chat`) MUST permanecer disponíveis em paralelo ao espelho sob `/opspilot`, para não quebrar clientes e testes atuais; a war room MUST NOT depender das rotas sem prefixo.

### Key Entities

- **War room**: Superfície web de plantão; conversa, inspeção de raciocínio, decisão humana e configuração da API.
- **Turno de chat**: Um envio do plantonista e o desfecho correspondente (resposta final, erro ou pendência 202).
- **Trace tipado**: Sequência ordenada de eventos de raciocínio, cada um com tipo reconhecível e conteúdo/payload associado ao turno.
- **Pendência 202**: Estado em que um **gate explícito** de aprovação humana foi atingido e o copiloto aguarda aprovar/negar; possui identificador próprio referenciado pelo endpoint dedicado de decisão.
- **Configuração da API**: URL base persistida localmente; caminhos da war room são resolvidos sob `/opspilot`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em ambiente com API saudável, o plantonista completa “abrir war room → enviar pedido → ler resposta” em menos de 2 minutos na primeira vez (excluindo tempo de raciocínio do modelo).
- **SC-002**: Em 100% dos turnos com trace disponível, **Ver raciocínio** mostra os eventos tipados daquele turno sem exigir ferramenta externa.
- **SC-003**: Em 100% das respostas 202 de chat, a UI apresenta cartão aprovar/negar (0% classificadas apenas como erro genérico).
- **SC-004**: Após salvar uma URL válida na engrenagem, o próximo chat usa essa base; a URL permanece após recarregar a war room.
- **SC-005**: Chamadas do navegador da war room a /opspilot/chat concluem a integração CORS com Origin refletida ou allowlist (sem bloqueio do browser) no setup documentado do projeto.
- **SC-006**: Revisão de aceite confirma conformidade com hierarquia, espaçamento em escala, empty/error, dark mode e teclado/foco nas jornadas P1.

## Assumptions

- A superfície fica em `web/`, entregue como aplicação web moderna (Vite + React + TypeScript), alinhada às design instructions do repositório.
- O contrato de chat existente (mensagem, resposta com `answer`/`trace`/`metrics`, códigos 4xx/5xx conhecidos) permanece a base; esta feature acrescenta consumo na UI, prefixo `/opspilot`, CORS e o **contrato completo de pendência 202** (emissão + decisão) na API e na war room.
- Resposta **202** significa gate explícito "requer aprovação humana" atingido; o corpo inclui id de pendência (e texto/contexto do cartão). Decisão via endpoint dedicado sob `/opspilot` (ex. shape no plan: `POST /opspilot/approvals/:id` com `{ decision: approve | deny }`); `POST /chat` não carrega a decisão (FR-005, FR-013, FR-014, FR-015).
- No MVP, no máximo **uma** pendência 202 ativa por conversa na UI; nova 202 só após resolver ou descartar a atual.
- Autenticação de usuários da war room fica fora do escopo do MVP (uso local/confiável de plantão).
- Montagem dual: rotas na raiz e sob `/opspilot` no MVP; war room só `/opspilot` (FR-007, FR-016).
- CORS: refletir Origin ou allowlist curta via configuração de ambiente; não depender de * como política única (FR-008).
- Persistência da URL da API é local ao cliente (ex.: armazenamento do navegador); não exige conta.
- Consulta de trace via `GET /request/:id` (tracer persistido) é opcional nesta feature se o `trace` já vier no corpo do chat; **Ver raciocínio** prioriza o trace do turno já recebido.
- Mobile otimizado não é meta do MVP; layout desktop/laptop de plantão é o alvo.
- Dark mode pode seguir preferência do sistema e/ou alternância simples; tokens semânticos são obrigatórios.
