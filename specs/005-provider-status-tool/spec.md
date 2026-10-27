# Feature Specification: Status de Provedores Externos

**Feature Branch**: `005-provider-status-tool`

**Created**: 2026-10-26

**Status**: Draft

**Input**: User description: "Tool de status de provedores externos: Tool check_provider_status em src/agents/tools.ts: consulta a status page pública do provedor via API statuspage.io (sem chave): github -> https://www.githubstatus.com/api/v2/status.json; cloudflare -> https://www.cloudflarestatus.com/api/v2/status.json. Parametro provider (enum: github | cloudflare, default \"github\", .describe explicando). Descrição orientada a quando usar: suspeita de problema externo, \"é o nosso ou do provedor?\", dependencia fora do ar. Resiliencia: timeout de 5s via AbortSignal.timeout; falha de rede ou 5xx, UMA nova tentativa; resposta validada com zod {{ status: { indicator, description } }}; qualquer falha final retorna string de erro legivel como resultado da tool (erro é observação - nunca lançar exceção para fora da tool). Retorno compacto (indicador + descrição, uma linha), para não inflar o contexto. Teste: a função de fetch é injetável; testes cobrem sucesso, timeout e resposta inválida sem uso de rede (fake fetch)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Distinguir falha interna de falha do provedor (Priority: P1)

Durante o plantão, o agente suspeita que um sintoma (deploy, CDN, DNS, autenticação via GitHub, etc.) pode ser problema do provedor externo e não do próprio sistema. Ele consulta o status público do provedor e recebe um resultado compacto (indicador + descrição) para orientar a hipótese: “é nosso” versus “é do provedor”.

**Why this priority**: É o valor central da feature — reduzir tempo de triagem quando a dependência externa pode estar degradada.

**Independent Test**: Invocar `check_provider_status` para GitHub e para Cloudflare com respostas de status simuladas e verificar o texto compacto de sucesso, sem rede real.

**Acceptance Scenarios**:

1. **Given** o agente precisa checar se GitHub está saudável, **When** chama `check_provider_status` sem parâmetro (ou com `provider` omitido), **Then** consulta o status de GitHub (default) e devolve uma linha com indicador e descrição.
2. **Given** suspeita de problema na CDN/edge, **When** chama `check_provider_status` com `provider` = `cloudflare`, **Then** consulta o status de Cloudflare e devolve uma linha com indicador e descrição.
3. **Given** uma resposta pública válida de status, **When** a tool conclui com sucesso, **Then** o resultado contém apenas o indicador e a descrição (formato compacto de uma linha), sem payload completo da página de status.

---

### User Story 2 - Falha da consulta vira observação, não quebra o plantão (Priority: P1)

Se a página de status não responde a tempo, a rede falha, o servidor responde com erro, ou o corpo não bate com o formato esperado, a tool ainda devolve um resultado utilizável: uma mensagem de erro legível. O fluxo do agente continua; a falha é tratada como observação da ferramenta, nunca como exceção que escapa da tool.

**Why this priority**: No plantão, uma tool que estoura o grafo é pior do que “não consegui consultar o status”; resiliência é requisito de uso real.

**Independent Test**: Com fetch falso, forçar timeout, falha de rede/5xx após retry, e corpo inválido; assertar string de erro legível e ausência de exceção propagada.

**Acceptance Scenarios**:

1. **Given** a consulta demora além de 5 segundos, **When** o timeout dispara, **Then** a tool devolve string de erro legível (após a política de retry aplicável) e não lança exceção para fora.
2. **Given** falha de rede ou resposta HTTP 5xx na primeira tentativa, **When** a tool executa, **Then** faz exatamente uma nova tentativa; se a segunda também falha, devolve string de erro legível.
3. **Given** corpo de resposta que não contém `status.indicator` e `status.description` válidos, **When** a validação rejeita o payload, **Then** a tool devolve string de erro legível, sem propagar exceção.
4. **Given** qualquer falha final da consulta, **When** o agente recebe o resultado da tool, **Then** o conteúdo é observável no rastro como resultado da tool (erro como observação).

---

### User Story 3 - Desenvolvedor valida a tool sem rede (Priority: P2)

Quem implementa e revisa a feature precisa de testes determinísticos: sucesso, timeout e resposta inválida, todos com fetch injetável (falso), sem chamar as status pages reais.

**Why this priority**: Princípio “teste é parte da tarefa”; garante regressão segura e CI sem dependência externa.

**Independent Test**: Rodar a suíte da tool com fetch falso cobrindo os três cenários; nenhum teste faz HTTP real.

**Acceptance Scenarios**:

1. **Given** um fetch falso que devolve JSON de status válido, **When** o teste de sucesso roda, **Then** o resultado compacto reflete indicador e descrição, sem rede.
2. **Given** um fetch falso que simula timeout, **When** o teste de timeout roda, **Then** a tool devolve erro legível e o teste passa sem rede.
3. **Given** um fetch falso que devolve corpo inválido, **When** o teste de resposta inválida roda, **Then** a tool devolve erro legível e o teste passa sem rede.
4. **Given** a suíte da feature, **When** os testes executam, **Then** a função de fetch usada pela tool é injetável (substituível nos testes).

---

### Edge Cases

- `provider` fora do enum (`github` | `cloudflare`): rejeitado na validação de fronteira do schema da tool, antes de qualquer consulta.
- Resposta HTTP 4xx (exceto política de retry só para rede/5xx): tratada como falha; resultado final é string de erro legível (sem retry obrigatório para 4xx).
- Segunda tentativa bem-sucedida após falha transitória: devolve o resultado compacto de sucesso.
- Indicador ou descrição vazios / ausentes no JSON: validação falha → erro legível.
- Descrição da tool e do parâmetro `provider` devem orientar o modelo sobre *quando* usar (suspeita de problema externo, “é o nosso ou do provedor?”, dependência fora do ar).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST expor a tool `check_provider_status` no conjunto de ferramentas do agente do plantão.
- **FR-002**: A tool MUST aceitar o parâmetro `provider` com enum `github` | `cloudflare`, default `github`, e descrição acionável em cada campo do schema explicando o significado e quando escolher cada valor.
- **FR-003**: A descrição da tool MUST orientar o modelo sobre quando usá-la: suspeita de problema externo, dúvida “é o nosso ou do provedor?”, e dependência fora do ar.
- **FR-004**: Para `github`, a tool MUST consultar a status page pública `https://www.githubstatus.com/api/v2/status.json` sem chave de API.
- **FR-005**: Para `cloudflare`, a tool MUST consultar a status page pública `https://www.cloudflarestatus.com/api/v2/status.json` sem chave de API.
- **FR-006**: Cada tentativa de consulta MUST respeitar timeout de 5 segundos.
- **FR-007**: Em falha de rede ou resposta HTTP 5xx, a tool MUST realizar exatamente uma nova tentativa; esgotadas as tentativas, MUST devolver string de erro legível.
- **FR-008**: A resposta de sucesso MUST ser validada contra o formato `{ status: { indicator, description } }` (validação de fronteira com schema); payload inválido MUST resultar em string de erro legível.
- **FR-009**: Em sucesso, a tool MUST devolver resultado compacto em uma linha contendo indicador e descrição — sem inflar o contexto com o JSON completo.
- **FR-010**: Qualquer falha final MUST retornar string de erro legível como *resultado* da tool (erro como observação). A tool MUST NÃO lançar exceção para fora de sua execução.
- **FR-011**: A função de fetch usada pela tool MUST ser injetável, para testes substituírem a implementação sem rede.
- **FR-012**: Testes MUST cobrir pelo menos: sucesso, timeout e resposta inválida, todos com fetch falso e sem uso de rede.

### Key Entities

- **ProviderStatus**: Retrato público do estado de um provedor suportado. Atributos: `provider` (`github` | `cloudflare`), `indicator` (estado agregado da página de status), `description` (texto curto publicado pelo provedor).
- **ProviderStatusResult**: Resultado da tool — ou a linha compacta de sucesso (`indicator` + `description`), ou a string de erro legível quando a consulta não conclui com payload válido.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em consulta bem-sucedida simulada, o plantonista (via agente) obtém indicador e descrição do provedor em uma única linha de resultado, em menos de 5 segundos por tentativa.
- **SC-002**: Em 100% dos cenários de falha cobertos (timeout, rede/5xx após retry, payload inválido), a tool devolve mensagem legível e nenhuma exceção escapa da execução da tool.
- **SC-003**: 100% dos cenários automatizados de sucesso, timeout e resposta inválida passam sem consultar as páginas de status reais.
- **SC-004**: O agente consegue escolher GitHub (default) ou Cloudflare pelo parâmetro `provider` e a descrição da tool deixa claro o gatilho de uso (suspeita de problema externo / dependência fora do ar).
- **SC-005**: Após uma falha transitória seguida de sucesso na segunda tentativa, o resultado apresentado ao agente é o status compacto válido — não a mensagem de erro da primeira tentativa.

## Assumptions

- A tool vive no mesmo módulo de tools do agente já usado pelo plantão (`src/agents/tools.ts`); detalhe de export/composição fica para o plano.
- Apenas GitHub e Cloudflare entram no escopo desta feature; outros provedores ficam para features futuras.
- As URLs oficiais Statuspage.io `/api/v2/status.json` dos dois provedores permanecem públicas e sem autenticação.
- Timeout de 5s por tentativa usa o mecanismo nativo de aborto da plataforma (equivalente a `AbortSignal.timeout`); detalhe de API fica para o plano.
- Retry aplica-se a falha de rede e HTTP 5xx; respostas 4xx não exigem a mesma política de retry (tratadas como falha com erro legível).
- “Formato compacto de uma linha” significa texto curto com indicador e descrição (ex.: `none — All Systems Operational`), não um objeto JSON multi-linha no resultado da tool.
- A tool integra-se ao conjunto existente de tools do agente; não altera persistência, seed nem outras tools.
- Validação de fronteira do payload e dos argumentos segue a prática do projeto (schema Zod na entrada da tool e no corpo da status page).
- A função de rede (fetch) é injetável para os testes substituírem a implementação; testes não dependem de LLM nem de rede real.
)
