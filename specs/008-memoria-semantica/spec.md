# Feature Specification: Memória semântica

**Feature Branch**: `008-memoria-semantica`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Memória semantica: MemoryStore por userId - remember (dedup > 0.92), recall top-3 por produto e escalar (min 0.3), forget; tabela memories, embedding all-MiniLM-L6-v2 local em BLOB; /chat ganha userId e injea o recall no prompt; teste: recal acha fato sem palavra em comum. user: @huggingface/transformers com pooling: mean + normalize: true e lazy singleton src/memory/embeddings.ts e src/memory/memory-story.ts. As colunas de memories (id, user_id, fact, embedding, created_at)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Guardar um fato do plantonista (Priority: P1)

O plantonista identifica-se no canal e pede para lembrar um fato operacional (ex.: “o produto Pagamentos usa o cluster azul”). O sistema grava esse fato na memória daquele plantonista. Se o fato for quase idêntico a outro já guardado (semelhança acima de 0,92), o sistema não duplica — mantém o que já existe.

**Why this priority**: Sem lembrar fatos entre turnos e conversas, o copiloto força o plantonista a repetir contexto que já foi dito.

**Independent Test**: Lembrar um fato para um `userId`, listar/recuperar a memória desse usuário e confirmar que o fato está lá; lembrar o mesmo sentido com texto quase igual e confirmar que não nasce segunda cópia.

**Acceptance Scenarios**:

1. **Given** um `userId` e um fato novo em texto, **When** o sistema executa *remember*, **Then** o fato fica associado só a esse `userId` e pode ser recuperado depois.
2. **Given** um fato já guardado, **When** chega outro fato cuja semelhança com o existente é maior que 0,92, **Then** o sistema não cria um segundo registro; o fato anterior permanece.
3. **Given** um fato já guardado, **When** chega outro fato com semelhança ≤ 0,92, **Then** o sistema grava o novo fato como entrada distinta.
4. **Given** dois `userId` distintos, **When** cada um lembra um fato, **Then** a memória de um não aparece na do outro.

---

### User Story 2 - Recuperar fatos relevantes no chat (Priority: P1)

No `/chat`, o plantonista envia `userId` junto com a mensagem. Antes de montar a resposta, o sistema recupera até 3 fatos da memória desse usuário, ordenados pela relevância semântica com a mensagem (produto interno dos vetores normalizados), descartando qualquer fato com pontuação abaixo de 0,3. Esses fatos entram no texto do pedido entregue à estratégia, para o copiloto usar no raciocínio.

**Why this priority**: A memória só gera valor se o canal a injeta no turno certo, sem o plantonista colar o histórico de fatos.

**Independent Test**: Guardar um fato, enviar um `/chat` com o mesmo `userId` e uma mensagem semanticamente relacionada (sem precisar das mesmas palavras) e confirmar que o fato recuperado aparece no texto composto do turno.

**Acceptance Scenarios**:

1. **Given** um `userId` com fatos guardados e uma mensagem de `/chat` relacionada, **When** o turno vai executar, **Then** o texto composto inclui até 3 fatos daquele usuário com pontuação ≥ 0,3, do mais relevante para o menos.
2. **Given** mais de 3 fatos acima do mínimo, **When** o recall roda, **Then** só os 3 de maior pontuação entram no prompt.
3. **Given** fatos com pontuação abaixo de 0,3, **When** o recall roda, **Then** esses fatos não entram no prompt.
4. **Given** um `userId` sem fatos, ou nenhum fato acima de 0,3, **When** o turno executa, **Then** o prompt segue sem bloco de memória e o chat funciona normalmente.
5. **Given** `userId` omitido no `/chat`, **When** o turno executa, **Then** não há recall nem injeção de memória; o restante do canal (conversa, estratégias, reflexão) permanece como já existe.
6. **Given** um fato guardado com palavras diferentes da mensagem do turno, **When** a mensagem e o fato têm o mesmo sentido, **Then** o recall ainda encontra o fato (semelhança semântica, não por palavra em comum).

---

### User Story 3 - Esquecer um fato (Priority: P2)

O plantonista (ou a lógica de plantão) pede para esquecer um fato específico da memória de um `userId`. Depois do *forget*, aquele fato deixa de aparecer em recalls futuros.

**Why this priority**: Fatos errados ou desatualizados precisam sair; sem *forget*, a memória envenena o prompt.

**Independent Test**: Lembrar um fato, esquecê-lo pelo identificador, confirmar que recall e listagens daquele usuário não o devolvem mais.

**Acceptance Scenarios**:

1. **Given** um fato existente de um `userId`, **When** o sistema executa *forget* com o identificador desse fato, **Then** o registro some e recalls seguintes não o incluem.
2. **Given** um identificador que não existe (ou não pertence ao `userId` informado), **When** *forget* é chamado, **Then** a operação falha de forma previsível sem apagar outros fatos.
3. **Given** vários fatos do mesmo usuário, **When** um é esquecido, **Then** os demais permanecem.

---

### User Story 4 - Conferir memória sem arquivo e sem rede de modelo de chat (Priority: P2)

Quem revisa a feature confere *remember*, deduplicação, *recall* (incluindo achar fato sem palavra em comum), *forget* e a injeção no `/chat` com banco em memória. O modelo de embedding pode carregar localmente no processo de teste; o chat do LLM continua substituível por um substituto determinístico sem rede.

**Why this priority**: O limiar de dedup, o top-3 e o recall semântico precisam de regressão estável antes do plantão real.

**Independent Test**: Exercer MemoryStore e um `/chat` com `userId` só com banco `:memory:` e estratégia substituta; o ensaio de recall sem palavra em comum passa.

**Acceptance Scenarios**:

1. **Given** um MemoryStore em memória, **When** se lembra, se deduplica, se recupera top-3 com mínimo 0,3 e se esquece, **Then** o comportamento acima se confirma.
2. **Given** um fato “o cluster de pagamentos é o azul” e uma consulta “qual cor do ambiente de payments?”, **When** o recall roda, **Then** o fato entra no top (mesmo sem palavra em comum).
3. **Given** o canal apontando para esse store e um substituto determinístico, **When** a suíte cobre `/chat` com e sem `userId`, **Then** tudo passa sem arquivo de dados e sem chamar o LLM de chat externo.

---

### Edge Cases

- `userId` omitido: `/chat` não faz recall nem *remember* automático; comportamento atual do canal permanece.
- `userId` vazio ou só espaços: tratado como inválido na validação do pedido (400), sem executar nem gravar memória.
- Fato em branco ou só espaços em *remember*: rejeitado; nada é gravado.
- Deduplicação compara só fatos do mesmo `userId`; fatos de outros usuários não contam para o limiar 0,92.
- Empate de pontuação no top-3: desempate estável (ex.: mais antigo primeiro); o planejamento fixa a regra desde que seja determinística.
- Mais de 3 fatos acima de 0,3: só os 3 melhores entram; o restante permanece guardado.
- *Forget* de fato de outro `userId`: não apaga; falha previsível.
- Reinício no mesmo arquivo de dados: fatos e vetores persistem; a coleção `memories` não apaga conversas, mensagens nem o store operacional.
- Arena e bench: fora do escopo de injeção de memória nesta feature (permanecem turno único sem `userId`), salvo se o planejamento reutilizar o store em memória para testes unitários.
- Falha ao carregar o modelo de embedding local: erro de domínio na borda; o turno de chat que dependeria do embedding não deve gravar memória parcial nem inventar fatos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer um MemoryStore com operações *remember*, *recall* e *forget*, sempre escopadas por `userId`.
- **FR-002**: *remember* MUST gravar um fato em texto para o `userId` informado, gerando e persistindo o vetor semântico do fato.
- **FR-003**: Antes de gravar, *remember* MUST comparar o novo fato com os fatos já existentes do mesmo `userId`. Se a semelhança (produto interno dos vetores normalizados) for **maior que 0,92**, MUST NOT criar registro duplicado.
- **FR-004**: *recall* MUST devolver no máximo **3** fatos do `userId`, ordenados por pontuação decrescente (produto interno com o vetor da consulta), e MUST excluir qualquer fato com pontuação **menor que 0,3**.
- **FR-005**: *forget* MUST remover o fato pelo identificador dentro do escopo do `userId`; identificador inexistente ou de outro usuário MUST falhar de forma previsível sem efeitos colaterais.
- **FR-006**: Os fatos MUST persistir na coleção `memories` no mesmo arquivo de dados do OpsPilot (`OPSPILOT_DB`, default `./data/opspilot.db`), com criação idempotente que não apaga dados já existentes. Testes MUST poder usar `:memory:`.
- **FR-007**: Cada registro de memória MUST ter: identificador estável (`id`), `user_id`, texto do fato (`fact`), vetor semântico opaco (`embedding`) e instante de criação (`created_at`).
- **FR-008**: O vetor semântico MUST ser produzido localmente pelo modelo **all-MiniLM-L6-v2**, com agregação por média e normalização unitária, de modo que o produto interno equivalha à semelhança de cosseno.
- **FR-009**: O canal `/chat` MUST aceitar `userId` opcional (texto), além dos campos já existentes (`message`, `strategy`, `reflect`, `conversationId` quando aplicável).
- **FR-010**: Quando `userId` está presente e o turno vai executar, o canal MUST chamar *recall* com a mensagem do turno e MUST injetar os fatos recuperados no texto composto entregue à estratégia, de forma distinguível do restante do prompt.
- **FR-011**: Quando `userId` está ausente, o canal MUST NOT chamar *recall* nem injetar memória.
- **FR-012**: `userId` vazio, só espaços ou tipo inválido MUST responder 400 com `issues`, sem executar e sem alterar memória.
- **FR-013**: A conferência MUST incluir um ensaio em que *recall* encontra um fato semanticamente relacionado **sem palavra em comum** entre a consulta e o texto do fato.
- **FR-014**: Isolamento: *recall*, *remember* (dedup) e *forget* de um `userId` MUST NOT ler nem alterar fatos de outro `userId`.
- **FR-015**: Arena e bench MUST continuar sem exigir `userId` nem injeção de memória no fluxo padrão desta feature.

### Key Entities

- **Memória (fato)**: Afirmação operacional lembrada para um plantonista. Atributos: identificador, dono (`user_id`), texto (`fact`), vetor semântico, instante de criação.
- **MemoryStore**: Guarda de fatos por `userId`, com *remember* (com deduplicação), *recall* (top-3, mínimo 0,3) e *forget*.
- **Vetor semântico**: Representação numérica do texto do fato ou da consulta, normalizada, usada só para comparar semelhança.
- **userId**: Identificador do plantonista no pedido de `/chat` e chave de escopo da memória. Distinto de `conversationId` (fio de mensagens).
- **Bloco de recall no prompt**: Trecho injetado no texto composto do turno com os até 3 fatos recuperados, quando houver.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos *remember* com semelhança > 0,92 a um fato já existente do mesmo usuário, nenhum registro duplicado é criado.
- **SC-002**: Em 100% dos *recall* com candidatos acima e abaixo de 0,3, só entram fatos com pontuação ≥ 0,3, no máximo 3, em ordem decrescente de relevância.
- **SC-003**: Um ensaio fixo em que a consulta e o fato não compartilham palavras ainda assim recupera o fato no top-3 com pontuação ≥ 0,3.
- **SC-004**: Em 100% dos `/chat` com `userId` válido e fatos relevantes, os fatos do recall aparecem no texto entregue à estratégia antes da execução.
- **SC-005**: Em 100% dos `/chat` sem `userId`, nenhum fato de memória entra no prompt e o canal permanece funcional.
- **SC-006**: Depois de *forget*, 100% dos recalls seguintes daquele usuário não devolvem o fato removido; fatos de outros usuários permanecem intactos.
- **SC-007**: Depois de reiniciar no mesmo arquivo de dados, 100% dos fatos já gravados do `userId` continuam disponíveis para *recall*.
- **SC-008**: A suíte de conferência do MemoryStore e da injeção no `/chat` completa com banco em memória e sem chamar o LLM de chat externo.

## Assumptions

- O canal de chat e a conversa persistente (quando já implementados) permanecem; esta feature acrescenta `userId` opcional, MemoryStore e injeção de recall no prompt. Não redefine a janela de 12 mensagens nem o contrato de `conversationId`.
- Limiares fixos nesta feature: deduplicação **> 0,92**; recall **top-3** com mínimo **0,3**; pontuação = produto interno de vetores unitários. Não há parâmetros no pedido de `/chat` para alterar esses números.
- O modelo de embedding é local (**all-MiniLM-L6-v2**), via `@huggingface/transformers`, com `pooling: "mean"` e `normalize: true`, carregado em *lazy singleton* (módulo de embeddings sob `src/memory/`). O vetor persiste como BLOB na coluna `embedding`.
- O módulo do MemoryStore vive sob `src/memory/` (nome de arquivo a confirmar no planejamento; o pedido citou `memory-story.ts` — interpretar como o store de memória, tipicamente `memory-store.ts`).
- `userId` é texto estável fornecido pelo cliente. Não há autenticação nova nesta feature: quem envia o `userId` acessa a memória daquele identificador.
- Não há, nesta feature, *remember* automático a partir de cada mensagem do chat: a gravação é via MemoryStore (*remember*). A injeção no `/chat` é só de *recall*.
- Não há listagem administrativa completa de memórias no canal HTTP nesta feature, além do necessário para testes do store.
- A coleção `memories` convive com `messages` e o store operacional no mesmo arquivo; migração/criação de tabela é idempotente e não apaga dados existentes.
- Arena e bench ficam fora da injeção de memória no fluxo padrão; testes unitários do store usam `:memory:`.
- O texto exato do bloco de memória no prompt fica para o planejamento, desde que os fatos injetados sejam distinguíveis e a estratégia os receba já compostos (a estratégia não busca memória por conta própria).
