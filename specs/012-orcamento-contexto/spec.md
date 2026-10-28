# Feature Specification: Orçamento de contexto por seção

**Feature Branch**: `012-orcamento-contexto`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "ContextBuilder com orçamento por seção: src/context/context-builder.ts monta o prompt de TODAS as estratégias com teto por seção via env CONTEXT_BUDGET_*: system e mensagem intocáveis, resumo 200, janela 1200 (corta as mais antigas), memória 300 (corta menor score). Teste: tetos baixos cortam na ordem certa."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Montar o prompt de qualquer estratégia com tetos por seção (Priority: P1)

Quem opera o copiloto (qualquer estratégia de raciocínio) recebe um prompt composto pelas seções de contexto — instruções de sistema, mensagem atual do plantonista, resumo da conversa (quando houver), janela de mensagens recentes e bloco de memória semântica (quando houver). Cada seção configurável respeita um teto próprio de tamanho estimado; o montador é o mesmo caminho usado por todas as estratégias.

**Why this priority**: Sem um montador único com tetos, o contexto cresce de forma diferente por estratégia e estoura o que o modelo aguenta de forma imprevisível.

**Independent Test**: Montar o contexto para duas estratégias distintas com as mesmas seções e os mesmos tetos; confirmar que ambas passam pelo mesmo montador e que o texto final respeita os tetos configuráveis.

**Acceptance Scenarios**:

1. **Given** qualquer estratégia registrada no canal de chat, **When** um turno monta o prompt, **Then** o texto composto passa pelo montador de contexto com orçamento por seção (não por um caminho paralelo sem tetos).
2. **Given** seções de resumo, janela e memória presentes, **When** o montador aplica os tetos padrão, **Then** o resumo cabe em até 200 unidades estimadas, a janela em até 1200 e a memória em até 300.
3. **Given** tetos reconfigurados via variáveis de ambiente `CONTEXT_BUDGET_*`, **When** o montador roda, **Then** usa esses valores em vez dos padrões (sem reiniciar o código-fonte).

---

### User Story 2 - Preservar sistema e mensagem atual (Priority: P1)

As instruções de sistema e a mensagem atual do plantonista nunca são truncadas nem removidas pelo orçamento. O corte só atinge resumo, janela e memória.

**Why this priority**: Cortar o pedido atual ou as regras do copiloto quebra o turno; o orçamento existe para enxugar histórico e memória, não o núcleo do pedido.

**Independent Test**: Forçar conteúdo grande em sistema e mensagem atual junto com seções cortáveis acima do teto; assertir que sistema e mensagem permanecem íntegros e que só as seções orçadas encolheram.

**Acceptance Scenarios**:

1. **Given** instruções de sistema de qualquer tamanho e uma mensagem atual longa, **When** o montador aplica orçamentos baixos nas demais seções, **Then** sistema e mensagem atual aparecem completos no prompt composto.
2. **Given** resumo, janela ou memória que excedem seus tetos, **When** o montador corta, **Then** o corte não altera o texto de sistema nem o da mensagem atual.
3. **Given** ausência de resumo e/ou de memória, **When** o montador roda, **Then** sistema e mensagem atual ainda entram intactos e as seções ausentes simplesmente não contribuem.

---

### User Story 3 - Cortar janela (mais antigas) e memória (menor score) (Priority: P1)

Quando a janela de mensagens recentes excede o teto, o montador remove as mensagens mais antigas até caber. Quando o bloco de memória excede o teto, remove primeiro os itens de menor score de relevância até caber. O resumo, se exceder o teto, é enxugado para caber no orçamento da seção (sem tocar sistema/mensagem).

**Why this priority**: A ordem de corte é o contrato observável do orçamento; errar a ordem deixa no prompt o que menos importa e descarta o que mais importa.

**Independent Test**: Com tetos artificialmente baixos e fixtures com idades/scores conhecidos, montar o contexto e verificar quais itens permaneceram e quais saíram.

**Acceptance Scenarios**:

1. **Given** uma janela cuja estimativa total supera o teto configurado, **When** o montador aplica o orçamento da janela, **Then** as mensagens mais antigas saem primeiro e as mais recentes que ainda cabem permanecem, sem ultrapassar o teto.
2. **Given** um bloco de memória com vários itens e scores distintos cuja estimativa total supera o teto, **When** o montador aplica o orçamento da memória, **Then** os itens de menor score saem primeiro e os de maior score que ainda cabem permanecem, sem ultrapassar o teto.
3. **Given** um resumo cuja estimativa supera o teto da seção, **When** o montador aplica o orçamento do resumo, **Then** o texto de resumo no prompt não excede o teto.
4. **Given** seções já dentro do teto, **When** o montador roda, **Then** nenhum item é removido só por precaução.

---

### User Story 4 - Conferência automatizada da ordem de corte (Priority: P1)

Existe teste automatizado que configura tetos baixos e prova que o corte segue a ordem certa: sistema e mensagem intactos; janela descarta as mais antigas; memória descarta o menor score; seções respeitam os tetos. Typecheck e a suíte permanecem verdes.

**Why this priority**: Constituição do projeto — lógica nova nasce com teste; regressão na ordem de corte é silenciosa e cara em plantão.

**Independent Test**: Rodar o teste dedicado com tetos baixos e fixtures determinísticas; typecheck + suíte verdes.

**Acceptance Scenarios**:

1. **Given** fixtures com idades e scores conhecidos e tetos baixos via configuração de orçamento, **When** o teste do montador roda, **Then** passa somente se o corte na janela for do mais antigo e na memória do menor score, com sistema e mensagem intactos.
2. **Given** a suíte completa do projeto, **When** typecheck e testes rodam, **Then** ambos ficam verdes.

---

### Edge Cases

- Seção ausente (sem resumo, sem memória, janela vazia além da mensagem atual): montador não falha; só aplica orçamento às seções presentes.
- Item único de janela ou memória maior que o teto da seção: o montador não ultrapassa o teto; se um único item não cabe, ele não entra (mensagem atual e sistema continuam intocáveis mesmo que grandes).
- Empate de score na memória: desempate estável e determinístico (mesma entrada → mesma saída).
- Tetos inválidos ou não numéricos nas variáveis de ambiente: cai nos padrões documentados (200 / 1200 / 300) sem derrubar o turno.
- Estratégia sem uso explícito de memória ou resumo: ainda assim o prompt passa pelo montador; seções vazias não inventam conteúdo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST montar o prompt de contexto de todas as estratégias de raciocínio pelo mesmo montador com orçamento por seção.
- **FR-002**: O sistema MUST expor tetos configuráveis por seção via variáveis de ambiente com prefixo `CONTEXT_BUDGET_*`, com padrões: resumo 200, janela 1200, memória 300 (unidades de tamanho estimado, mesma regra de estimativa já usada no produto).
- **FR-003**: O sistema MUST tratar as seções de instruções de sistema e de mensagem atual do plantonista como intocáveis: nunca truncar, remover ou reordenar por orçamento.
- **FR-004**: Quando a janela de mensagens recentes exceder o teto, o sistema MUST remover mensagens da mais antiga para a mais recente até a estimativa da seção caber no teto.
- **FR-005**: Quando o bloco de memória exceder o teto, o sistema MUST remover itens do menor score para o maior até a estimativa da seção caber no teto.
- **FR-006**: Quando o resumo exceder o teto, o sistema MUST reduzir o texto de resumo incluído no prompt para não ultrapassar o teto da seção.
- **FR-007**: O montador MUST ser determinístico: mesma entrada (seções + tetos) produz o mesmo prompt composto.
- **FR-008**: A lógica de orçamento e a ordem de corte MUST ter cobertura de teste automatizado com tetos baixos que falhe se a ordem de corte estiver errada.
- **FR-009**: Seções ausentes ou vazias MUST ser omitidas sem erro e sem inventar conteúdo.

### Key Entities

- **Seção de contexto**: Bloco nomeado do prompt (sistema, mensagem atual, resumo, janela, memória), com texto e, quando aplicável, itens ordenáveis (mensagens por idade; memórias por score).
- **Orçamento por seção**: Teto numérico de tamanho estimado aplicável a uma seção cortável; configurável por ambiente com padrão fixo.
- **Prompt composto**: Resultado do montador após aplicar orçamentos; entrada comum a todas as estratégias.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos turnos de qualquer estratégia, o prompt composto passa pelo montador com orçamento por seção.
- **SC-002**: Com conteúdo acima dos tetos, a estimativa de resumo / janela / memória no prompt composto fica ≤ 200 / 1200 / 300 (ou ≤ aos tetos configurados), em 100% dos casos de teste.
- **SC-003**: Em testes com tetos baixos, 100% das remoções na janela são das mensagens mais antigas primeiro; 100% das remoções na memória são dos menores scores primeiro; sistema e mensagem atual permanecem idênticos à entrada.
- **SC-004**: O teste dedicado à ordem de corte passa de forma determinística (mesma fixture → mesmo resultado) e a suíte completa + typecheck ficam verdes.

## Assumptions

- A unidade dos tetos é a mesma estimativa de tamanho já adotada na medição de contexto do produto (caracteres ÷ 4), não o usage real do provedor.
- Os padrões 200 / 1200 / 300 aplicam-se a resumo, janela e memória respectivamente; sistema e mensagem atual não têm teto de corte.
- Nomes concretos das variáveis seguem o prefixo `CONTEXT_BUDGET_*` (ex.: por seção); valores inválidos revertem aos padrões.
- O montador vive no caminho de contexto do produto (`context-builder`); esta feature define o comportamento de orçamento, não redesenha sumarização nem recall de memória.
- Empate de score: ordenação estável (ex.: preservar ordem de entrada entre iguais) para garantir determinismo.
- Truncar o texto do resumo para caber no teto é suficiente nesta feature; não exige re-sumarizar via modelo só por causa do orçamento.
- Fora de escopo: orçamento global único somando todas as seções; UI para editar tetos; alterar a política de “8 mensagens” da sumarização (o teto da janela é adicional ao que já entra nessa seção).
