# Feature Specification: Sumarização de histórico (pruning)

**Feature Branch**: `011-sumarizacao-historico`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Sumarização de histórico (pruning): tabela conversation_summaries; o que sai das 8 mensagens recentes vira resumo de ~150 tokens preservando decisões, fatos e pendencias, mesclado ao resumo anterior e persistido - refeito só quando 8 novas saem da janela, nunca a cada request. Resumo entra no contexto; evento \"summarize\". Com teste fake"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manter o fio longo sem perder o essencial (Priority: P1)

O plantonista continua uma conversa longa no `/chat`. Só as 8 mensagens mais recentes entram no contexto como texto integral. O que já saiu dessa janela não some: vira (ou atualiza) um resumo compacto da conversa, que também entra no contexto. Em turnos seguintes o copiloto ainda enxerga decisões, fatos e pendências antigas via esse resumo, sem carregar o histórico bruto completo.

**Why this priority**: Sem pruning, o contexto cresce sem teto útil; sem resumo, o plantão perde o fio do que ficou para trás da janela. Juntos, janela curta + resumo entregam continuidade operacional.

**Independent Test**: Gravar uma conversa com mais de 8 mensagens, disparar um turno com substituto que revela o texto composto, e confirmar que o prompt traz o resumo persistido mais no máximo 8 mensagens recentes (incluindo o pedido atual), e que decisões/fatos/pendências do trecho podado aparecem no resumo — não nas 8 brutas.

**Acceptance Scenarios**:

1. **Given** uma conversa com 8 ou menos mensagens já gravadas (contando o pedido atual), **When** o turno termina em 200, **Then** o contexto inclui essas mensagens recentes e não exige resumo (resumo ausente ou vazio não inventa conteúdo).
2. **Given** mensagens que já saíram da janela de 8 e um resumo persistido para a conversa, **When** chega um pedido novo, **Then** o texto composto inclui o resumo atual e as no máximo 8 mensagens mais recentes (pedido atual + gravadas que couberem), em ordem que deixe claro o que é resumo e o que é mensagem recente.
3. **Given** um resumo que preserva decisões, fatos e pendências do trecho podado, **When** o plantonista pergunta algo que depende desse conteúdo antigo, **Then** o contexto do turno contém esse material no bloco de resumo (não exige as mensagens brutas fora da janela).
4. **Given** duas conversas distintas, **When** uma é continuada, **Then** o resumo e a janela da outra não entram no contexto.

---

### User Story 2 - Resumir em lote, não a cada pedido (Priority: P1)

A sumarização só roda quando 8 mensagens novas saíram da janela desde a última consolidação — nunca a cada request. O trecho que saiu é condensado em um resumo de cerca de 150 tokens, mesclado ao resumo anterior (se houver), e o resultado é persistido. Enquanto o lote de 8 ainda não fechou, turnos usam o resumo já gravado (ou nenhum) sem refazer a consolidação.

**Why this priority**: Resumir em todo turno custa tempo, tokens e risco de oscilação do texto; o lote de 8 torna o comportamento previsível e barato.

**Independent Test**: Avançar a conversa mensagem a mensagem com sumarizador substituto contável; assertir zero chamadas de sumarização até o 8º egresso da janela; naquele ponto, exatamente uma consolidação; mais turnos sem nova consolidação até o próximo lote de 8.

**Acceptance Scenarios**:

1. **Given** nenhuma mensagem ainda saiu da janela desde o início (ou desde a última consolidação), **When** o plantonista envia pedidos que só preenchem ou renovam as 8 recentes sem completar um lote de 8 egressos, **Then** a sumarização não roda e o resumo persistido (se existir) permanece inalterado.
2. **Given** exatamente 8 mensagens novas saíram da janela desde a última consolidação (ou desde o início sem resumo), **When** o turno que completa esse lote é processado, **Then** a sumarização roda uma vez, produz um resumo de cerca de 150 tokens preservando decisões, fatos e pendências do trecho + resumo anterior, e persiste o resultado na coleção de resumos da conversa.
3. **Given** um resumo já persistido e um novo lote de 8 egressos, **When** a consolidação roda, **Then** o novo texto é o merge do resumo anterior com o lote, não um resumo só do lote isolado, e substitui o anterior para essa conversa.
4. **Given** turnos após uma consolidação com menos de 8 novos egressos, **When** cada request é atendido, **Then** nenhuma nova sumarização ocorre nesses turnos.
5. **Given** pedido vazio, 400, 422, 404 ou 504, **When** o canal responde, **Then** a sumarização não roda e o resumo não muda.

---

### User Story 3 - Observar a consolidação no rastro (Priority: P2)

Quando a sumarização de fato roda num turno, o rastro (ou eventos observáveis do turno) registra um evento `summarize`, permitindo distinguir turnos que só reutilizaram o resumo daqueles que consolidaram um lote novo.

**Why this priority**: Sem sinal explícito, plantão e testes não sabem se o custo/latência veio da consolidação ou só do chat.

**Independent Test**: Forçar um turno que completa o lote de 8 egressos e outro que não; no primeiro o rastro/eventos incluem `summarize`; no segundo, não.

**Acceptance Scenarios**:

1. **Given** um turno em que a consolidação roda, **When** a resposta é 200, **Then** o rastro (ou lista de eventos do turno) inclui um evento identificável como `summarize`.
2. **Given** um turno em que a consolidação não roda, **When** a resposta é 200, **Then** não há evento `summarize` inventado para esse turno.
3. **Given** o evento `summarize` presente, **When** se inspeciona o rastro, **Then** ele é distinguível dos demais eventos/passos já existentes do turno (ferramentas, raciocínio, etc.).

---

### User Story 4 - Conferência com substituto fake (Priority: P1)

Quem valida a feature confere janela de 8, gatilho de lote, merge, persistência do resumo, inclusão no contexto e evento `summarize` com banco em memória e sumarizador/estratégia substitutos determinísticos (fake), sem arquivo de dados e sem contato com provedor externo.

**Why this priority**: Constituição: lógica nova nasce com teste; dependência de modelo real tornaria o pruning não-regressável.

**Independent Test**: Rodar a suíte com `:memory:` e fakes; cobrir “sem resumo”, “lote incompleto”, “lote de 8 dispara merge + persistência + summarize”, “resumo no contexto”, isolamento entre conversas.

**Acceptance Scenarios**:

1. **Given** guarda/resumo em memória e sumarizador fake que devolve texto fixo/contável, **When** se exercita o fluxo de lote, **Then** a contagem de chamadas ao fake respeita “só no fechamento de 8 egressos”.
2. **Given** o mesmo arranjo, **When** se lê o resumo persistido após a consolidação, **Then** ele reflete o merge esperado (entrada do fake + política de ~150 tokens documentada no teste) e sobrevive a uma nova abertura do mesmo store em memória na mesma suíte, conforme o contrato do store.
3. **Given** canal com estratégia fake que ecoa o prompt, **When** há resumo + janela, **Then** o eco contém o resumo e no máximo 8 mensagens recentes.
4. **Given** a suíte completa do projeto, **When** typecheck e testes rodam, **Then** ambos ficam verdes.

---

### Edge Cases

- Conversas curtas (≤ 8 mensagens no contexto, sem egressos): sem consolidação; sem obrigação de criar linha de resumo.
- Mensagens podadas mas lote ainda incompleto (< 8 egressos desde a última consolidação): usam o resumo já persistido (se houver); não disparam nova sumarização.
- Primeira consolidação sem resumo anterior: o resumo novo deriva só do lote de 8 egressos (ainda visando ~150 tokens e o trio decisões/fatos/pendências).
- Pedido atual conta na janela de 8 recentes do prompt; a resposta ainda não produzida não entra no próprio prompt (mesmo padrão da conversa persistente).
- Pedido vazio / só espaços: sem gravação, sem sumarização, sem evento `summarize`.
- 400, 422, 404, 504: não alteram mensagens nem resumo; não emitem `summarize`.
- Falha do sumarizador no turno que deveria consolidar: o turno não deve corromper o resumo anterior; o desfecho concreto (falha visível vs. seguir sem atualizar) fica para o plano, desde que o resumo prévio permaneça intacto se a consolidação não completar com sucesso.
- Duas conversas: resumos isolados; consolidação de uma não toca a outra.
- Reinício no mesmo arquivo de dados: o resumo persistido continua disponível para a conversa.
- Arena e bench: fora do escopo desta feature (permanecem turno único sem este pruning).
- Relação com a janela anterior de 12 mensagens brutas: para composição do contexto desta feature, a janela bruta efetiva passa a ser 8 recentes + resumo do restante; `historyMessages` continua a refletir quantas mensagens brutas entraram no prompt (teto 8), não o tamanho do resumo em tokens.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A composição do turno MUST incluir no contexto no máximo as 8 mensagens mais recentes da conversa (incluindo o pedido atual quando o turno executa), em ordem cronológica, distinguindo plantonista de copiloto.
- **FR-002**: Mensagens que saíram dessa janela de 8 MUST permanecer gravadas na conversa e MUST NOT entrar como texto integral no prompt; o conteúdo operacional relevante delas MUST ser representado pelo resumo da conversa, quando existir.
- **FR-003**: Quando existir resumo persistido para a conversa, a composição MUST incluí-lo no contexto do turno, de forma distinguível do bloco das mensagens recentes.
- **FR-004**: A sumarização MUST rodar somente quando 8 mensagens novas tiverem saído da janela desde a última consolidação bem-sucedida (ou desde o início, se nunca houve consolidação). MUST NOT resumir a cada request.
- **FR-005**: Ao consolidar, o sistema MUST gerar um resumo de cerca de 150 tokens que preserve decisões, fatos e pendências, mesclando o resumo anterior (se houver) com o lote de mensagens que saiu da janela, e MUST persistir o resultado associado à conversa.
- **FR-006**: Resumos MUST ser persistidos na coleção `conversation_summaries`, no mesmo arquivo de dados operacional (`OPSPILOT_DB`, default `./data/opspilot.db`), com criação idempotente que não apaga dados já existentes; testes MUST usar `:memory:`.
- **FR-007**: Cada conversa MUST ter no máximo um resumo ativo vigente (a consolidação substitui o texto anterior dessa conversa). Conversas distintas MUST ter resumos isolados.
- **FR-008**: Quando a consolidação roda com sucesso num turno, o rastro/eventos do turno MUST incluir um evento `summarize`. Turnos sem consolidação MUST NOT emitir esse evento.
- **FR-009**: Pedido vazio, 400, 422, 404 e 504 MUST NOT disparar sumarização nem alterar o resumo persistido.
- **FR-010**: `metrics.historyMessages` MUST refletir a quantidade de mensagens brutas incluídas no texto composto (0 a 8), contada uma vez por turno; métricas já existentes do canal MUST permanecer.
- **FR-011**: A conferência de janela, gatilho de lote, merge, persistência, inclusão no contexto e evento `summarize` MUST ser possível com store em memória e sumarizador/estratégia fake, sem arquivo de dados e sem provedor externo.
- **FR-012**: Arena e bench MUST permanecer sem esta sumarização/pruning de histórico.

### Key Entities

- **Janela recente**: As no máximo 8 mensagens mais recentes usadas como texto integral no prompt (incluindo o pedido atual no turno em execução).
- **Egresso / lote de pruning**: Mensagens que deixaram a janela recente; a consolidação espera um lote de 8 novos egressos desde a última consolidação.
- **Resumo de conversa**: Texto compacto (~150 tokens) associado a uma conversa, preservando decisões, fatos e pendências do histórico fora da janela; resultado do merge com o resumo anterior; persistido em `conversation_summaries`.
- **Evento `summarize`**: Sinal observável no rastro do turno indicando que a consolidação rodou naquele request.
- **Conversa / Mensagem**: Mesmos significados da conversa persistente; esta feature não redefine falantes nem gravação pedido/`answer`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em conversas com mais de 8 mensagens no contexto composto, 100% dos turnos 200 incluem no máximo 8 mensagens brutas e, quando há resumo vigente, esse resumo também entra no contexto.
- **SC-002**: Em 100% dos turnos em que menos de 8 novos egressos ocorreram desde a última consolidação, a sumarização não roda e o resumo persistido permanece idêntico.
- **SC-003**: No turno que completa o lote de 8 egressos, a consolidação ocorre uma vez, o resumo persistido é atualizado (merge com o anterior quando houver) e o evento `summarize` aparece no rastro; o tamanho alvo do resumo é da ordem de 150 tokens.
- **SC-004**: Após reinício no mesmo arquivo de dados, 100% dos resumos já persistidos continuam disponíveis para a conversa correspondente; resumo de uma conversa nunca aparece no contexto de outra.
- **SC-005**: A suíte com fakes e `:memory:` cobre janela, gatilho, merge, persistência, contexto e `summarize`, e `typecheck` + testes do projeto permanecem verdes.

## Assumptions

- A conversa persistente (identificador, gravação pedido/`answer`, isolamento, recusas 400/422/404/504, pedido vazio) permanece; esta feature altera a composição do contexto (janela bruta 8 + resumo) e adiciona consolidação sob demanda de lote.
- A janela bruta efetiva para o prompt passa de 12 (feature de conversa persistente) para 8 nesta evolução; o teto de `historyMessages` acompanha 8. Mensagens além da janela continuam gravadas.
- “Cerca de 150 tokens” é o alvo do texto do resumo (estimativa chars÷4 ou contagem equivalente já usada no projeto); variação pequena em torno do alvo é aceitável desde que o teste fake possa fixar/verificar o contrato.
- O sumarizador em produção pode usar o modelo; em teste MUST haver substituto fake determinístico. O plano detalha a interface do substituto.
- O merge “resumo anterior + lote” é responsabilidade do passo de sumarização; o formato exato do prompt de merge fica para o plano, desde que decisões, fatos e pendências sejam o conteúdo preservado.
- Contagem de egressos é por mensagens gravadas que deixaram a janela, não por turnos HTTP; um turno que grava pedido+resposta pode contribuir com até dois egressos ao longo do tempo conforme a janela desliza.
- Um resumo ativo por conversa; não há histórico versionado de resumos nesta feature.
- Memória semântica e demais fontes de contexto já existentes, se presentes, continuam a compor o prompt; esta feature não as remove. O breakdown de tokens (se existir) pode passar a distinguir a fonte do resumo no plano, sem ser obrigatório nesta spec.
- Arena e bench fora de escopo; sem API nova só para ler/editar resumos; quem continua o `conversationId` recebe o efeito automaticamente.
