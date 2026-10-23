# Research: Camada Reflection

Todas as escolhas abaixo fecham o desenho. Não resta `NEEDS CLARIFICATION` no contexto técnico.

## 1. Padrão evaluator-optimizer sem grafo novo

- **Decision**: Implementar a reflexão como laço imperativo em `src/agents/reflection.ts` que (1) chama `base.run`, (2) chama o crítico, (3) se reprovar e houver teto restante, remonta o pedido com feedback e repete. Não compilar um `StateGraph` só para a reflexão.
- **Rationale**: A spec pede envolver *qualquer* estratégia existente sem alterar o contrato comum. Um laço sobre `ReasoningStrategy.run` reutiliza ReAct e Plan-and-Execute como caixas pretas, facilita injetar base/crítico simulados (FR-014) e evita aninhar grafos LangGraph (limites de recursão e estado ambíguos). O padrão evaluator-optimizer da documentação LangGraph JS (`withStructuredOutput` + rota approve/reject) é o mesmo fluxo semântico; só a orquestração é um serviço puro de controle.
- **Alternatives considered**: `StateGraph` generator/evaluator com a base como subgraph (rejeitado: complexidade e acoplamento ao runtime do grafo para um ciclo que a spec já descreve de forma linear). Reescrever ReAct/Plan-and-Execute com reflexão embutida (rejeitado: FR-001 exige envoltório genérico; bases devem permanecer selecionáveis sem reflexão).

## 2. Crítico com saída estruturada Zod

- **Decision**: Crítico de produção em `src/agents/critic.ts` usa `createModel().withStructuredOutput` com schema Zod `{ approved: boolean, feedback: string }`. Uma chamada = uma consulta ao modelo (`llmCalls += 1`). Prompt inclui o pedido original, a resposta candidata e os textos dos eventos `observation` do rastro da passagem corrente (ou do rastro acumulado daquela execução da base).
- **Rationale**: A documentação LangGraph JS (workflow evaluator-optimizer) recomenda structured output para a avaliação binária + feedback. Boolean + string mapeia direto a FR-003. Mesma fábrica OpenRouter / temperatura 0 (assumptions da spec). Observações ausentes não bloqueiam: o crítico ainda vê pedido e resposta (edge case da spec).
- **Alternatives considered**: Crítico com texto livre e parser heurístico (rejeitado: frágil). Segundo modelo/`OPENROUTER_*` dedicado (rejeitado: assumption “mesmo modelo”). Criticar só a resposta sem o rastro (rejeitado: FR-004).

## 3. Contagem do teto de reflexões

- **Decision**: `maxReflections` (padrão 2) conta **regenerações após reprovação**, não a passagem inicial da base. Com teto 2: até 1 execução inicial + 2 regenerações (≤ 3 `base.run`) e até 3 avaliações do crítico no pior caso. Aprovação encerra sem nova regeneração. Teto esgotado devolve a última resposta da base.
- **Rationale**: Alinha SC-003 e a assumption explícita da spec. Separar de `maxIterations` (teto interno da base) evita colidir dois significados no mesmo número.
- **Alternatives considered**: Contar a passagem inicial no teto (rejeitado: contradiz a assumption). Reutilizar `--max-iterations` para reflexões (rejeitado: ambíguo e quebra o significado já documentado em `001`).

## 4. Injeção de feedback no pedido

- **Decision**: Função pura monta o input da regeneração concatenando o pedido original do plantonista com um bloco de feedback do crítico (texto padrão se feedback vazio na reprovação). A base recebe esse string como `input`; não há novo campo no contrato `run`.
- **Rationale**: Estratégias base já só aceitam `input: string`. Prefixo/sufixo estável e testável sem mudar ReAct/Plan-and-Execute. Feedback vazio → aviso padrão cumpre o edge case da spec.
- **Alternatives considered**: Estender `StrategyOptions` com `feedback` (rejeitado: força mudança nas duas bases). Mensagens LangChain fora do contrato (rejeitado: quebra o envoltório genérico).

## 5. Rastro acumulado e último evento `answer`

- **Decision**: O resultado da reflexão concatena, em ordem: eventos de cada execução da base; após cada crítica bem-sucedida (ou registro de indisponibilidade), um evento `type: "critique"` com o conteúdo da avaliação; ao encerrar o ciclo, garante-se que o último evento é `answer` com o mesmo texto de `result.answer` (reanexa o `answer` se o último for `critique`). Pedido vazio: devolve o resultado da base sem crítico e sem evento extra. Falha/indisponibilidade da base antes da primeira resposta útil: propaga o resultado da base sem inventar crítica.
- **Rationale**: FR-008 exige `critique` no rastro; o contrato de `001` exige último evento `answer`. Reanexar o answer final preserva os dois. Críticas do replanner em Plan-and-Execute já usam `critique`; a reflexão acrescenta mais eventos do mesmo tipo — o plantonista lê o conteúdo, não um subtipo novo (assumption: sem mudar o vocabulário de tipos além do uso de `critique`).
- **Alternatives considered**: Novo tipo `reflection_critique` (rejeitado: fora do escopo / assumption). Omitir o answer final após critique (rejeitado: quebra contrato `001`).

## 6. Métricas acumuladas

- **Decision**: `llmCalls` = soma de `metrics.llmCalls` de cada `base.run` + 1 por invocação real do crítico. `latencyMs` = tempo de parede do envoltório inteiro (um único `Date.now()` em volta do laço), não a soma dos `latencyMs` das bases.
- **Rationale**: FR-009 e SC-004 pedem consultas extras visíveis e tempo do ciclo completo. Somar latências das bases subcontaria o crítico e gaps entre chamadas.
- **Alternatives considered**: Só latência da última base (rejeitado: FR-009). Contar structured output como zero (rejeitado: é consulta real).

## 7. Nomes na arena e flag `--max-reflections`

- **Decision**: Estender o enum Zod da arena com `reflect:react` e `reflect:plan-and-execute`. Cada um é `wrapWithReflection(base)` com `name` igual ao nome da arena. Nova flag `--max-reflections` (inteiro ≥ 1, padrão 2). Nome desconhecido ou teto inválido → erro de domínio antes do modelo. Bases sem prefixo permanecem.
- **Rationale**: FR-010–FR-012 e US4. Validação na fronteira (Zod + classes de domínio).
- **Alternatives considered**: Flag booleana `--reflect` aplicada a todas as estratégias selecionadas (rejeitado: a spec fixa os nomes compostos). Aceitar qualquer `reflect:*` dinâmico (rejeitado: só duas bases existem).

## 8. Porta do crítico para testes offline

- **Decision**: Tipo `Critic` com `evaluate(input) → Promise<CritiqueDecision>` injetável no envoltório. Produção: implementação LLM. Testes: stubs que sempre aprovam, sempre reprovam, ou falham (indisponível).
- **Rationale**: FR-014 / US5 / SC-006. Constituição: lógica de parada e mescla testáveis sem rede.
- **Alternatives considered**: Mockar só `ChatOpenAI` (rejeitado: mais frágil e acoplado). Testar só na arena com rede (rejeitado: FR-014).
