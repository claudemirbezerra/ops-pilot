# Feature Specification: Refletor de aprendizado

**Feature Branch**: `009-refletor-aprendizado`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Refletor de aprendizado: após cada resposta, um withStructuredOutput({hasLearning, fact }) le a ultima mensagem do usuário e desfila fatos duráveis (nunca pedido pontual, nunca segredo) -> memories.remember assíncrono; tool forget_preference"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aprender fato durável após a resposta (Priority: P1)

O plantonista conversa no chat com um `userId`. Em alguma mensagem ele revela um fato estável sobre o ambiente ou a forma de trabalhar (ex.: “prefiro que incidentes de Pagamentos vão para o time azul”). Depois que o copiloto já devolveu a resposta do turno, o sistema analisa só a última mensagem do plantonista, decide se há aprendizado durável e, se houver, grava o fato na memória daquele `userId` sem o plantonista pedir “lembre disso” explicitamente.

**Why this priority**: Sem aprendizado automático, a memória semântica só cresce quando alguém chama *remember* à mão; o valor do recall no próximo turno some.

**Independent Test**: Enviar um `/chat` com `userId` e uma mensagem que contenha uma preferência durável; após a resposta, confirmar que um fato correspondente aparece na memória daquele usuário (via recall ou inspeção do store), sem a resposta do turno ter esperado a gravação.

**Acceptance Scenarios**:

1. **Given** um `/chat` com `userId` válido e uma mensagem contendo fato durável, **When** o turno conclui a resposta ao plantonista, **Then** o sistema extrai um fato e o associa à memória desse `userId`.
2. **Given** a mesma mensagem com fato durável, **When** a resposta do turno é entregue, **Then** a entrega da resposta não espera a conclusão da gravação na memória (aprendizado assíncrono).
3. **Given** um fato já quase idêntico na memória do mesmo `userId`, **When** o refletor extrai o mesmo sentido, **Then** a deduplicação já existente do MemoryStore evita segunda cópia.
4. **Given** dois `userId` distintos, **When** cada um revela um fato durável, **Then** cada fato fica só na memória do respectivo usuário.

---

### User Story 2 - Ignorar pedido pontual e segredo (Priority: P1)

O plantonista manda um pedido só daquele turno (“abre um incidente para o alerta X agora”) ou cola um segredo (token, senha, chave). O refletor **não** marca aprendizado e **não** grava nada na memória.

**Why this priority**: Gravar pedido pontual envenena recalls futuros; gravar segredo viola a segurança por padrão do produto.

**Independent Test**: Rodar o refletor (ou o fluxo pós-resposta) com mensagens de pedido pontual e com mensagens contendo segredo; confirmar `hasLearning` falso e zero novas memórias.

**Acceptance Scenarios**:

1. **Given** uma mensagem que é só pedido pontual daquele turno (abrir/resolver incidente, listar alertas, status de provedor), **When** o refletor analisa, **Then** `hasLearning` é falso e nenhum fato é gravado.
2. **Given** uma mensagem que contém segredo (API key, token, senha, credencial), **When** o refletor analisa, **Then** `hasLearning` é falso e nenhum trecho da mensagem é persistido como fato.
3. **Given** uma mensagem mista (fato durável + pedido pontual), **When** o refletor analisa, **Then** só o fato durável pode ser gravado; o pedido pontual e qualquer segredo ficam de fora do texto do fato.
4. **Given** uma mensagem sem fato durável nem segredo relevante, **When** o refletor analisa, **Then** `hasLearning` é falso e a memória não muda.

---

### User Story 3 - Esquecer preferência via ferramenta (Priority: P2)

O plantonista pede ao copiloto para esquecer uma preferência ou fato aprendido (“esquece que eu preferia o cluster azul”). O agente usa a ferramenta `forget_preference` no escopo do `userId` do turno; depois disso, recalls futuros não devolvem aquele fato.

**Why this priority**: Preferências mudam; sem esquecer, o recall injeta orientação errada.

**Independent Test**: Ter um fato na memória, acionar `forget_preference` com descrição suficiente para localizar o fato do `userId`, confirmar que o fato some dos recalls seguintes.

**Acceptance Scenarios**:

1. **Given** um `userId` com pelo menos um fato/preferência guardado, **When** o agente chama `forget_preference` com texto que identifica essa preferência, **Then** o fato correspondente é removido e recalls seguintes não o incluem.
2. **Given** nenhum fato do `userId` semanticamente alinhado ao pedido de esquecer, **When** `forget_preference` roda, **Then** a operação comunica que nada foi removido, sem apagar fatos não relacionados.
3. **Given** fatos de outro `userId`, **When** `forget_preference` roda no escopo do usuário atual, **Then** as memórias do outro usuário permanecem intactas.
4. **Given** turno de `/chat` sem `userId`, **When** o agente tentaria usar `forget_preference`, **Then** a ferramenta falha de forma previsível sem alterar memória.

---

### User Story 4 - Conferir refletor sem travar o plantão (Priority: P2)

Quem revisa a feature confirma: (a) fato durável vira memória após a resposta; (b) pedido pontual e segredo não viram memória; (c) a resposta do chat não fica bloqueada pela gravação; (d) `forget_preference` remove o alvo certo. Tudo com banco em memória e estratégia/LLM substituíveis onde o projeto já permite.

**Why this priority**: O aprendizado automático é fácil de regressar (gravar demais ou demais tarde); precisa de regressão estável.

**Independent Test**: Suíte que força o refletor com mensagens fixas (durável / pontual / segredo) e verifica memória e não-bloqueio da resposta; mais um caso de `forget_preference`.

**Acceptance Scenarios**:

1. **Given** mensagens de fixture (durável, pontual, segredo), **When** o refletor roda, **Then** só a durável resulta em *remember*.
2. **Given** o fluxo de `/chat` com `userId`, **When** o aprendizado é disparado, **Then** a resposta do turno completa mesmo se a gravação ainda não terminou (ou se a gravação falhar depois).
3. **Given** falha na gravação assíncrona, **When** o plantonista já recebeu a resposta, **Then** o turno de chat não é reaberto como erro para o cliente; a falha fica observável no lado do servidor/log de domínio sem corromper o store.
4. **Given** banco `:memory:` e substitutos determinísticos onde aplicável, **When** a suíte do refletor e de `forget_preference` roda, **Then** passa sem arquivo de dados persistente obrigatório.

---

### Edge Cases

- `userId` ausente no `/chat`: refletor **não** roda; nenhuma tentativa de *remember* automático.
- `userId` inválido (vazio/só espaços): continua 400 na borda do chat; refletor não entra.
- Extração com `hasLearning: true` e `fact` vazio ou só espaços: tratado como sem aprendizado; nada é gravado.
- Extração com `hasLearning: false` e `fact` preenchido: o fato é ignorado; nada é gravado.
- Mensagem do usuário vazia (já rejeitada na borda): refletor não roda.
- Falha do passo de extração estruturada (modelo indisponível, saída inválida): nenhum fato é gravado; a resposta já entregue ao plantonista permanece válida.
- Várias preferências na mesma mensagem: o refletor desta feature extrai **no máximo um** fato por turno (o mais claro/durável); fatos adicionais ficam para turnos futuros ou pedido explícito — documentado em Assumptions.
- `forget_preference` com texto ambíguo que casa com vários fatos: remove o de maior semelhança acima do limiar de recall existente (mín. 0,3); se nenhum ≥ 0,3, nada remove.
- Concorrência: dois turnos do mesmo `userId` em paralelo podem ambos tentar *remember*; a deduplicação do MemoryStore continua a regra de verdade.
- Arena e bench: fora do fluxo padrão do refletor nesta feature (permanecem sem aprendizado automático), salvo reuso em testes unitários.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Após a resposta de um turno de `/chat` com `userId` válido, o sistema MUST executar um passo de refletor de aprendizado que analisa a **última mensagem do usuário** daquele turno.
- **FR-002**: O refletor MUST produzir uma decisão estruturada com exatamente dois campos: `hasLearning` (booleano) e `fact` (texto).
- **FR-003**: Quando `hasLearning` é verdadeiro e `fact` é texto não vazio, o sistema MUST chamar *remember* do MemoryStore para aquele `userId` com o texto de `fact`.
- **FR-004**: A chamada a *remember* MUST ser assíncrona em relação à resposta do turno: a entrega da resposta ao cliente MUST NOT esperar a conclusão do *remember*.
- **FR-005**: Quando `hasLearning` é falso, o sistema MUST NOT gravar fato (mesmo que `fact` venha preenchido).
- **FR-006**: O refletor MUST NOT classificar como aprendizado: pedidos pontuais daquele turno (ações de plantão de uso único) nem conteúdo secreto (credenciais, tokens, senhas, chaves de API).
- **FR-007**: Fatos gravados pelo refletor MUST ser apenas afirmações ou preferências **duráveis** (válidas além do turno corrente).
- **FR-008**: Quando `userId` está ausente no turno, o sistema MUST NOT executar o refletor nem *remember* automático.
- **FR-009**: Falha na extração ou no *remember* assíncrono MUST NOT invalidar nem reabrir a resposta já enviada ao cliente; MUST NOT gravar fato parcial inválido.
- **FR-010**: O sistema MUST expor a ferramenta de agente `forget_preference`, escopada ao `userId` do turno, para remover uma preferência/fato da memória com base em descrição em texto.
- **FR-011**: `forget_preference` MUST localizar o fato do mesmo `userId` pela relevância semântica da descrição; MUST remover o melhor candidato com pontuação ≥ 0,3; se nenhum atingir o mínimo, MUST reportar que nada foi removido sem apagar outros fatos.
- **FR-012**: `forget_preference` sem `userId` no contexto do turno MUST falhar de forma previsível sem alterar memória.
- **FR-013**: O refletor MUST usar a mesma MemoryStore e as mesmas regras de deduplicação/isolamento por `userId` da memória semântica já especificada; MUST NOT criar um segundo silo de fatos.
- **FR-014**: A conferência MUST cobrir: fato durável gravado; pedido pontual não gravado; segredo não gravado; não-bloqueio da resposta; `forget_preference` remove o alvo certo.

### Key Entities

- **Decisão de aprendizado**: Resultado do refletor por turno. Atributos: `hasLearning`, `fact` (texto candidato).
- **Fato durável**: Preferência ou afirmação operacional que permanece útil além do turno (ex.: dono de produto, cluster preferido, horário de handoff).
- **Pedido pontual**: Solicitação de ação ou consulta só daquele turno, sem valor como memória de longo prazo.
- **Segredo**: Credencial ou dado sensível que nunca deve ser persistido como fato.
- **forget_preference**: Ferramenta do agente para apagar uma preferência/fato do `userId` corrente a partir de uma descrição em texto.
- **MemoryStore / Memória (fato)**: Mesmas entidades da feature de memória semântica; o refletor só alimenta *remember* e `forget_preference` usa a remoção no mesmo escopo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos turnos de `/chat` com `userId` e mensagem de fixture marcada como “fato durável”, após a resposta existe pelo menos um fato recuperável na memória daquele usuário alinhado ao conteúdo durável.
- **SC-002**: Em 100% dos turnos com fixtures “pedido pontual” ou “segredo”, zero novos registros de memória são criados para aquele usuário.
- **SC-003**: Em 100% das medições, o tempo até a resposta do turno ao cliente não inclui a espera pela conclusão do *remember* do refletor (aprendizado pós-resposta).
- **SC-004**: Em 100% das falhas simuladas de *remember* assíncrono, o cliente ainda recebe a resposta de sucesso do turno de chat (quando o raciocínio do turno em si teve sucesso).
- **SC-005**: Depois de `forget_preference` bem-sucedida, 100% dos recalls seguintes daquele `userId` não devolvem o fato removido; fatos não alvo permanecem.
- **SC-006**: Em 100% dos `/chat` sem `userId`, o refletor não grava memória e `forget_preference` não altera o store.
- **SC-007**: A suíte de conferência do refletor e de `forget_preference` completa com banco em memória e sem depender de plantão real.

## Assumptions

- Esta feature depende da memória semântica já especificada (MemoryStore com *remember* / *recall* / *forget*, `userId` no `/chat`, dedup > 0,92, recall top-3 mín. 0,3). O refletor **não** redefine limiares nem o modelo de embedding.
- O aprendizado automático preenche a lacuna deixada pela memória semântica, que assumiu *remember* apenas explícito via store; aqui o *remember* passa a ser disparado pelo refletor pós-resposta.
- O passo de extração usa saída estruturada com o esquema `{ hasLearning, fact }` (nomes de campo fixos do contrato de comportamento). Detalhe de provedor/SDK fica para o planejamento.
- O refletor analisa apenas a última mensagem do usuário do turno, não o histórico completo nem a resposta do assistente, salvo se o planejamento justificar contexto mínimo adicional sem mudar o escopo.
- No máximo **um** fato por turno nesta versão; mensagens com vários aprendizados dependem de turnos seguintes ou de *remember* explícito fora desta feature.
- “Segredo” inclui no mínimo: senhas, tokens, API keys, connection strings com credencial, e trechos que o extrator reconhecer como credencial. Pedidos do tipo “não lembre X” são tratados via `forget_preference`, não via gravação.
- `forget_preference` é ferramenta do agente (disponível no raciocínio do plantão), distinta da operação *forget* por identificador interno do store; por baixo reutiliza a remoção no mesmo MemoryStore.
- Arena e bench ficam fora do refletor no fluxo padrão; testes unitários/integração do refletor usam `:memory:` e substitutos onde o projeto já permite.
- Falhas assíncronas de *remember* são registradas de forma observável no servidor; não há retry obrigatório nesta feature (pode ser adicionado depois sem mudar o contrato do chat).
