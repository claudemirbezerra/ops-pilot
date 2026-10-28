# Feature Specification: Medição de contexto

**Feature Branch**: `010-medicao-contexto`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "Instrumente a medição de contexto: src/context/tokens.ts com estimateTokens (chars/4) e o usage real do LangChain; métricas do /chat com promptTokens real e contextBreakdown estimado por fontes; conversa-longa.sh imprime o prompTokens por turno. Com testes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Estimar e ler uso real de tokens (Priority: P1)

Quem opera ou desenvolve o copiloto precisa de duas leituras complementares do tamanho do contexto: uma estimativa barata a partir do texto (caracteres ÷ 4) e o uso real de tokens de prompt reportado pela chamada ao modelo, quando houver. Ambas ficam disponíveis como funções/utilitários de medição de contexto, com comportamento estável e testável.

**Why this priority**: Sem uma estimativa previsível e sem o número real do provedor, o restante das métricas de `/chat` e o ensaio de conversa longa não têm base confiável.

**Independent Test**: Chamar a estimativa com textos de tamanho conhecido e confirmar o resultado chars÷4; com um retorno de uso do modelo (ou substituto), confirmar que o valor real de prompt tokens é lido corretamente; cobrir ausência de uso.

**Acceptance Scenarios**:

1. **Given** um texto com N caracteres, **When** a estimativa de tokens roda, **Then** o resultado é o inteiro correspondente a N÷4 (divisão inteira por caracteres).
2. **Given** um texto vazio, **When** a estimativa roda, **Then** o resultado é 0.
3. **Given** um resultado de chamada ao modelo que inclui usage de prompt tokens, **When** a leitura do uso real roda, **Then** devolve exatamente esse número de prompt tokens.
4. **Given** ausência de usage (chamada sem metadados ou sem chamada ao modelo), **When** a leitura do uso real roda, **Then** devolve 0 (ou equivalente explícito de “indisponível” tratado como zero nas métricas do canal).

---

### User Story 2 - Ver promptTokens e breakdown no `/chat` (Priority: P1)

Após um turno bem-sucedido de `/chat`, o plantonista (ou quem inspeciona a resposta) vê em `metrics` o `promptTokens` real do turno e um `contextBreakdown` estimado por fontes do contexto composto — no mínimo o bloco de histórico da conversa e o bloco de memória semântica (quando houver). As métricas já existentes (`llmCalls`, `latencyMs`, `historyMessages`) permanecem.

**Why this priority**: É a superfície observável do produto: sem esses campos no 200, a instrumentação não entrega valor operacional.

**Independent Test**: POST `/chat` com estratégia/substituto controlado; assertir presença e tipos de `promptTokens` e `contextBreakdown`; com e sem memória; pedido em branco não inventa tokens positivos indevidos.

**Acceptance Scenarios**:

1. **Given** um turno que executa o modelo e recebe usage de prompt, **When** a resposta é 200, **Then** `metrics.promptTokens` é o valor real reportado (soma do turno, se houver mais de uma chamada) e `metrics.llmCalls` / `latencyMs` / `historyMessages` continuam presentes.
2. **Given** um turno cujo prompt composto tem histórico e bloco de memória, **When** a resposta é 200, **Then** `metrics.contextBreakdown` lista estimativas por fonte (pelo menos `history` e `memory`) usando a regra chars÷4 sobre o texto de cada fonte.
3. **Given** um turno sem `userId` (sem recall), **When** a resposta é 200, **Then** a fonte de memória no breakdown é 0 (ou ausente de contribuição) e o histórico reflete só a janela da conversa.
4. **Given** pedido em branco que devolve a resposta orientativa sem chamar o modelo, **When** a resposta é 200, **Then** `promptTokens` é 0 e o breakdown estimado não atribui tokens positivos indevidos às fontes.
5. **Given** um 4xx/504 do canal, **When** o cliente lê o corpo de erro, **Then** não há obrigação de incluir `promptTokens` / `contextBreakdown` (mesmo padrão das demais métricas de sucesso).

---

### User Story 3 - Ensaio de conversa longa com tokens por turno (Priority: P2)

Quem valida o crescimento de contexto roda o script `conversa-longa.sh`, que dispara vários turnos na mesma conversa e imprime o `promptTokens` de cada turno, permitindo observar a evolução do uso real ao longo do fio.

**Why this priority**: Fecha o ciclo de observabilidade fora do teste unitário: demonstra na prática o efeito de histórico (e memória, se configurada) no tamanho do prompt.

**Independent Test**: Executar o script (ou o fluxo que ele encapsula) contra um servidor local; conferir uma linha/registro por turno contendo o `promptTokens` daquele turno.

**Acceptance Scenarios**:

1. **Given** o servidor de chat disponível e o script configurado para N turnos (N ≥ 2) na mesma conversa, **When** o script termina com sucesso, **Then** a saída mostra o `promptTokens` de cada turno, na ordem dos turnos.
2. **Given** turnos sucessivos com histórico crescente (até o teto da janela), **When** o script imprime os valores, **Then** cada valor corresponde ao `metrics.promptTokens` daquele 200 (não um total acumulado inventado pelo script).
3. **Given** falha de rede ou resposta não-200 em um turno, **When** o script detecta o erro, **Then** a falha fica visível na saída/exit code sem silenciar turnos anteriores já impressos.

---

### User Story 4 - Conferência automatizada (Priority: P1)

A lógica nova de estimativa, leitura de usage, exposição das métricas no `/chat` e o comportamento esperado do breakdown têm testes automatizados. `typecheck` e a suíte de testes permanecem verdes.

**Why this priority**: Constituição do projeto: lógica nova nasce com teste; métricas erradas enganam plantão e ensaios.

**Independent Test**: Rodar a suíte cobrindo estimativa, parsing de usage, campos de métricas no canal e casos sem usage / sem memória.

**Acceptance Scenarios**:

1. **Given** fixtures de texto com tamanhos fixos, **When** os testes de estimativa rodam, **Then** passam com o resultado chars÷4.
2. **Given** fixtures de usage presente e ausente, **When** os testes de leitura real rodam, **Then** passam com o número esperado ou 0.
3. **Given** `createApp` / `runChat` com substitutos determinísticos, **When** os testes de métricas do `/chat` rodam, **Then** assertem `promptTokens` e `contextBreakdown` sem depender de provedor externo obrigatório.
4. **Given** a suíte completa do projeto, **When** typecheck e testes rodam, **Then** ambos ficam verdes.

---

### Edge Cases

- Texto com caracteres multibyte: a estimativa conta caracteres da string (length da linguagem), não bytes UTF-8.
- Usage parcial (só completion tokens, sem prompt): tratar prompt como 0.
- Várias chamadas ao modelo no mesmo turno: `promptTokens` do `/chat` é a soma dos prompt tokens reais das chamadas daquele turno.
- Breakdown estimado pode divergir do `promptTokens` real (heurística vs. tokenizer do provedor); isso é esperado e não é erro.
- Fonte de memória vazia (recall sem fatos): contribuição 0 no breakdown.
- Script `conversa-longa.sh` sem servidor no ar: falha explícita, sem loop infinito.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer estimativa de tokens a partir de texto pela regra **caracteres ÷ 4** (divisão inteira), com resultado 0 para texto vazio.
- **FR-002**: O sistema MUST oferecer leitura do uso real de prompt tokens a partir do usage devolvido pela chamada ao modelo; MUST devolver 0 quando o usage estiver ausente ou sem prompt tokens.
- **FR-003**: Em todo 200 de `/chat` que já inclui `metrics`, a resposta MUST incluir `metrics.promptTokens` (inteiro ≥ 0) com o uso real do turno (soma das chamadas ao modelo daquele turno).
- **FR-004**: Em todo 200 de `/chat` que já inclui `metrics`, a resposta MUST incluir `metrics.contextBreakdown`: estimativas por fonte do contexto composto do turno, usando a regra de FR-001 sobre o texto de cada fonte.
- **FR-005**: As fontes do breakdown MUST incluir pelo menos **history** (janela/histórico composto entregue no prompt) e **memory** (bloco de recall, 0 quando não houver injeção).
- **FR-006**: `metrics.llmCalls`, `metrics.latencyMs` e `metrics.historyMessages` MUST permanecer com o sentido já estabelecido; esta feature só acrescenta `promptTokens` e `contextBreakdown`.
- **FR-007**: Pedido em branco (resposta orientativa sem execução do modelo) MUST reportar `promptTokens` 0 e breakdown sem inflar fontes.
- **FR-008**: O repositório MUST incluir o script `conversa-longa.sh` que executa múltiplos turnos na mesma conversa e imprime o `promptTokens` de cada turno.
- **FR-009**: Toda lógica nova de estimativa, leitura de usage e exposição das métricas MUST ter testes automatizados; `npm run typecheck` e `npm test` MUST permanecer verdes.

### Key Entities

- **Estimativa de tokens**: Número derivado só do texto (chars÷4), barato e determinístico.
- **Uso real de prompt tokens**: Número reportado pelo provedor/modelo para o(s) prompt(s) do turno.
- **contextBreakdown**: Mapa/objeto de fontes → tokens estimados (`history`, `memory`, …).
- **Métricas de chat**: Extensão das métricas do 200 com `promptTokens` e `contextBreakdown`, além das já existentes.
- **Ensaio de conversa longa**: Script que encadeia turnos e torna o `promptTokens` por turno observável na saída.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos textos de fixture, a estimativa de tokens coincide com caracteres÷4 (inteiro).
- **SC-002**: Em 100% dos 200 de `/chat` com métricas, `promptTokens` está presente como inteiro ≥ 0 e reflete o usage real do turno (0 quando não houve usage).
- **SC-003**: Em 100% dos 200 com contexto composto, `contextBreakdown` expõe estimativas para `history` e `memory` coerentes com os textos realmente injetados (chars÷4).
- **SC-004**: Em 100% dos pedidos em branco bem-sucedidos, `promptTokens` é 0.
- **SC-005**: O ensaio `conversa-longa.sh` com N≥2 turnos bem-sucedidos imprime exatamente N valores de `promptTokens` (um por turno), alinhados aos 200 correspondentes.
- **SC-006**: A suíte de conferência da medição completa sem provedor externo obrigatório (substitutos/fixtures) e typecheck + testes do projeto ficam verdes.

## Assumptions

- O canal `/chat`, a janela de histórico e a injeção de memória semântica já existem; esta feature só instrumenta medição e exposição, sem mudar a composição do prompt nem a janela de 12.
- “Usage real” significa o campo de prompt tokens devolvido pela integração com o modelo (via a pilha LangChain já usada no projeto). Em testes, um substituto pode injetar usage fixo.
- A heurística chars÷4 é intencional e pode divergir do tokenizer do provedor; o breakdown é sempre estimado; `promptTokens` é sempre o real (ou 0).
- Fontes mínimas do breakdown: `history` e `memory`. Outras fontes (system interno da estratégia, ferramentas) ficam fora do escopo desta feature, salvo se já forem parte distinta do texto composto pelo canal antes da estratégia.
- `promptTokens` no `/chat` agrega o turno completo (soma), não só a última chamada ao modelo.
- Arena e bench não são obrigados a expor `contextBreakdown` nesta feature; o foco é `/chat` + utilitário de tokens + script de conversa longa.
- O typo “prompTokens” no pedido do usuário interpreta-se como `promptTokens`.
- O módulo de medição vive sob `src/context/` (ex.: `tokens.ts`), conforme o pedido; detalhes de API interna ficam para o plano.
- O script `conversa-longa.sh` assume servidor local já no ar (ou documenta como subir); não substitui a suíte `npm test`.
