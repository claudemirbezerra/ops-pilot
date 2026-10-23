# Feature Specification: Camada Reflection

**Feature Branch**: `002-camada-reflection`

**Created**: 2026-10-22

**Status**: Draft

**Input**: User description: "O plantonista precisa de uma camada de reflexão que envolve qualquer estratégia de raciocínio já existente: a base responde; um crítico avalia a resposta à luz das observações do rastro e decide se aprova ou devolve feedback; se reprovar, a estratégia regenera com esse feedback no contexto. O ciclo para quando o crítico aprova ou quando se atinge o teto de reflexões (padrão 2). Cada crítica entra no rastro; o custo soma as consultas extras do crítico e das regenerações. Na arena, o plantonista escolhe reflexão sobre ReAct ou sobre Plan-and-Execute."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Revisar a resposta antes de confiar nela (Priority: P1)

O plantonista roda uma estratégia com reflexão. Depois da resposta base, um crítico confronta essa resposta com as observações já registradas no rastro e marca aprovação ou feedback.

**Why this priority**: Sem a revisão, a reflexão não entrega valor; o restante do ciclo depende dela.

**Independent Test**: Rodar uma estratégia envolvida por reflexão e ver no rastro ao menos um evento de crítica com aprovação ou feedback, além da resposta final.

**Acceptance Scenarios**:

1. **Given** uma estratégia base disponível e um pedido, **When** o plantonista executa com reflexão, **Then** a base roda primeiro e o resultado inclui a resposta, o rastro e as métricas.
2. **Given** a resposta base e as observações do rastro, **When** o crítico avalia, **Then** devolve aprovação ou feedback explícito.
3. **Given** uma crítica concluída, **When** o plantonista lê o rastro, **Then** há um evento `critique` com o conteúdo dessa avaliação.

---

### User Story 2 - Regenerar quando a crítica reprova (Priority: P1)

Se o crítico reprova, a estratégia base roda de novo com o feedback no contexto. O ciclo repete até aprovação ou até o teto de reflexões.

**Why this priority**: A regeneração é o que transforma a crítica em resposta melhor, não só em comentário.

**Independent Test**: Forçar ou observar uma reprovação e confirmar que uma nova execução da base ocorre com o feedback considerado, sem ultrapassar o teto.

**Acceptance Scenarios**:

1. **Given** uma crítica que reprova com feedback, **When** ainda há reflexões disponíveis, **Then** a estratégia base executa de novo levando esse feedback no contexto do pedido.
2. **Given** uma crítica que aprova, **When** a avaliação termina, **Then** não há nova regeneração e a resposta aprovada é a final.
3. **Given** o teto de reflexões atingido sem aprovação, **When** o ciclo encerra, **Then** a resposta devolvida é a da última tentativa e o rastro contém todas as críticas feitas até ali.

---

### User Story 3 - Contar o custo da reflexão (Priority: P2)

O plantonista vê nas métricas o custo total da execução com reflexão, incluindo as consultas do crítico e as regenerações, não só as da primeira passagem.

**Why this priority**: Comparar estratégias na arena exige custo honesto; a reflexão não pode esconder consultas.

**Independent Test**: Comparar métricas de uma execução sem reflexão com a mesma estratégia com reflexão e verificar que as consultas extras aparecem na soma.

**Acceptance Scenarios**:

1. **Given** uma execução com reflexão que fez ao menos uma crítica, **When** as métricas são lidas, **Then** o número de consultas ao modelo inclui as da base e as do crítico (e regenerações, se houver).
2. **Given** o tempo decorrido da execução com reflexão, **When** as métricas são lidas, **Then** o tempo cobre o ciclo inteiro até a resposta final.

---

### User Story 4 - Escolher reflexão na arena (Priority: P2)

Na arena, o plantonista seleciona `reflect:react` ou `reflect:plan-and-execute` (ou ambas) sobre o mesmo pedido e vê rastros e métricas de cada uma, incluindo os eventos de crítica.

**Why this priority**: A arena é o modo de comparar; sem esses nomes a reflexão não entra no fluxo de avaliação do plantão.

**Independent Test**: Rodar a arena com `reflect:react` e um pedido; ver um bloco com crítica e métricas. Repetir com `reflect:plan-and-execute` sem depender da outra.

**Acceptance Scenarios**:

1. **Given** `--strategies reflect:react`, **When** a arena executa, **Then** usa ReAct envolvido por reflexão e imprime rastro (com `critique`) e métricas.
2. **Given** `--strategies reflect:plan-and-execute`, **When** a arena executa, **Then** usa Plan-and-Execute envolvido por reflexão e imprime rastro e métricas.
3. **Given** `--strategies reflect:react,reflect:plan-and-execute`, **When** a arena executa, **Then** cada uma roda sobre o mesmo pedido e apresenta seu próprio rastro e métricas.
4. **Given** um nome de estratégia de reflexão desconhecido, **When** a arena valida as flags, **Then** recusa antes de consultar o modelo e informa o nome rejeitado.

---

### User Story 5 - Conferir o ciclo de reflexão sem rede (Priority: P3)

Quem revisa o copiloto confere, de forma repetível e sem contato externo, que o teto de reflexões encerra o ciclo e que críticas e métricas somadas aparecem no resultado formatado.

**Why this priority**: Protege o contrato da reflexão; pode esperar as histórias de uso na arena.

**Independent Test**: Com um crítico e uma base simulados, rodar o envoltório duas vezes com o mesmo teto e obter o mesmo formato de rastro e a mesma regra de parada, sem rede.

**Acceptance Scenarios**:

1. **Given** um crítico que sempre reprova e um teto de 2, **When** o envoltório executa, **Then** há no máximo 2 ciclos de reflexão após a base inicial conforme a regra do teto, o rastro traz os eventos `critique` correspondentes e a execução encerra sem nova tentativa.
2. **Given** o mesmo cenário de entrada e o mesmo teto, **When** a formatação do rastro roda duas vezes, **Then** o texto é idêntico e inclui os eventos `critique`.

---

### Edge Cases

- Pedido vazio: o envoltório devolve o mesmo resultado de pedido vazio da estratégia base, sem consultar o crítico.
- Estratégia base falha antes da primeira resposta: a reflexão não inventa crítica; devolve a falha da base com o rastro e as métricas já produzidos.
- Crítico indisponível: o ciclo encerra com a última resposta da base, registra a indisponibilidade de forma legível e preserva o rastro até ali.
- Feedback vazio numa reprovação: a regeneração ainda ocorre, usando um aviso padrão de que a resposta foi reprovada sem detalhe.
- Teto de reflexões menor que 1: a borda recusa a configuração antes de executar.
- Estratégias base `react` e `plan-and-execute` continuam disponíveis sem reflexão; a reflexão não as substitui, só acrescenta variantes nomeadas.
- Observações ausentes no rastro: o crítico ainda avalia a resposta contra o pedido e o que houver no rastro; a ausência de observações não impede a crítica.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir envolver qualquer estratégia de raciocínio existente com uma camada de reflexão que preserva o contrato comum: nome, resposta, rastro e métricas.
- **FR-002**: A reflexão MUST executar primeiro a estratégia base e só então solicitar a avaliação do crítico.
- **FR-003**: O crítico MUST devolver uma decisão binária de aprovação e, quando reprovar, um feedback textual.
- **FR-004**: O crítico MUST considerar a resposta candidata e as observações presentes no rastro ao decidir.
- **FR-005**: Quando o crítico aprova, a reflexão MUST encerrar e devolver essa resposta como final.
- **FR-006**: Quando o crítico reprova e ainda há reflexões disponíveis, a reflexão MUST regenerar executando de novo a estratégia base com o feedback no contexto.
- **FR-007**: A reflexão MUST parar ao atingir o teto de reflexões configurado, mesmo sem aprovação. O teto padrão, quando não informado, MUST ser 2.
- **FR-008**: Cada avaliação do crítico MUST aparecer no rastro como evento do tipo `critique`.
- **FR-009**: As métricas da execução com reflexão MUST somar as consultas ao modelo da base, do crítico e das regenerações, e MUST medir o tempo do ciclo completo.
- **FR-010**: A arena MUST aceitar as estratégias nomeadas `reflect:react` e `reflect:plan-and-execute`, além das estratégias base já existentes.
- **FR-011**: `reflect:react` MUST ser ReAct envolvido por reflexão. `reflect:plan-and-execute` MUST ser Plan-and-Execute envolvido por reflexão.
- **FR-012**: A arena MUST recusar nomes de reflexão desconhecidos e teto de reflexões inválido (menor que 1) antes de consultar o modelo.
- **FR-013**: Pedido vazio MUST curto-circuitar sem chamar o crítico, preservando o comportamento da estratégia base.
- **FR-014**: O ciclo de reflexão (teto, eventos `critique`, soma de consultas) MUST ser conferível de modo determinístico, sem contato com serviços externos, mediante substitutos controlados da base e do crítico.

### Key Entities

- **Camada de reflexão**: Envoltório que aplica crítica e regeneração sobre uma estratégia base sem alterar o contrato de resultado.
- **Crítica**: Avaliação com aprovação (`approved`) e feedback opcional; materializada no rastro como evento `critique`.
- **Teto de reflexões**: Limite de ciclos de regeneração após críticas reprovadas; padrão 2.
- **Estratégia com reflexão**: Variante nomeada na arena (`reflect:react`, `reflect:plan-and-execute`) que combina uma base com a camada de reflexão.
- **Métricas acumuladas**: Contagem de consultas e tempo que incluem base, crítico e regenerações.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% das execuções com reflexão que completam ao menos uma crítica, o rastro contém um evento `critique` por avaliação realizada.
- **SC-002**: Quando o crítico aprova na primeira avaliação, não ocorre regeneração adicional.
- **SC-003**: Com teto 2 e crítico que sempre reprova, o número de regenerações após a resposta inicial não ultrapassa 2.
- **SC-004**: As métricas de uma execução com reflexão que fez crítica e regeneração mostram mais consultas ao modelo do que a mesma estratégia sem reflexão no mesmo pedido (quando ambas completam).
- **SC-005**: O plantonista consegue selecionar `reflect:react` e `reflect:plan-and-execute` na arena e obter, para cada uma, rastro e métricas do mesmo pedido em uma única comparação.
- **SC-006**: Duas conferências offline seguidas do ciclo de reflexão (mesmo teto, mesmos substitutos) produzem o mesmo formato de rastro e a mesma regra de parada.

## Assumptions

- A camada de reflexão reutiliza o mesmo modelo já configurado para as estratégias base; não há seleção separada de modelo para o crítico.
- O teto padrão de reflexões é 2 quando o plantonista não informa outro valor.
- “Reflexão” conta ciclos de regeneração após reprovação; a primeira execução da base não consome o teto. Com teto 2, cabem a passagem inicial mais até 2 regenerações (até 3 execuções da base no pior caso), além das avaliações do crítico.
- Feedback vazio em reprovação usa um texto padrão de reprovação sem detalhe, para a regeneração não ficar sem contexto.
- As estratégias base `react` e `plan-and-execute` permanecem selecionáveis sem reflexão.
- O vocabulário `reflect:react` e `reflect:plan-and-execute` é o que o plantonista usa na arena.
- Pedido vazio e falhas da base seguem as regras já estabelecidas no núcleo de raciocínio; esta feature não as redefine além do curto-circuito do crítico.
- Ficam fora desta feature: novos tipos de estratégia base, mudança do contrato de rastro além do uso de `critique`, e qualquer canal HTTP novo.
