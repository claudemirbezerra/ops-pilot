# Research: Núcleo de raciocínio

Todas as escolhas abaixo fecham o desenho. Não resta `NEEDS CLARIFICATION` no contexto técnico.

## 1. Agente ReAct pré-construído

- **Decision**: `createReactAgent` importado de `@langchain/langgraph/prebuilt`, com as três ferramentas e o modelo da fábrica. Versão do grafo `"v1"` (um nó de tools executa as chamadas da mensagem).
- **Rationale**: O pacote instalado (`@langchain/langgraph` 1.x) exporta `createReactAgent` e `CreateReactAgentParams`. O pedido da feature pede esse agente, não um loop ReAct escrito à mão. O tipo local marca o símbolo como depreciado em favor de `createAgent` do pacote `langchain`, que não está nas dependências nem na constituição.
- **Alternatives considered**: Reimplementar o ciclo agent/tools com `StateGraph` (rejeitado: duplica o pré-construído). Adotar o pacote `langchain` só por causa da depreciação (rejeitado: dependência nova sem ganho para o contrato).

## 2. Teto de iterações no ReAct

- **Decision**: Uma iteração do ReAct é uma consulta ao modelo no laço do agente. Um wrapper em volta do `ChatOpenAI` conta `llmCalls`. Ao atingir `maxIterations`, a consulta seguinte não vai à rede: o wrapper devolve uma mensagem final sem tool call, com o texto de teto atingido. `llmCalls` conta só consultas reais.
- **Rationale**: O pré-construído não recebe um `maxIterations`. Depender do erro interno de recursão do grafo é frágil (o nome não aparece estável nos tipos instalados) e pode cortar a execução no meio de uma ferramenta, sem resposta. O wrapper entrega o contrato da spec: rastro até ali, métricas e resposta que declara o teto.
- **Alternatives considered**: `recursionLimit = 2 * maxIterations` apenas (rejeitado: o limite conta supersteps, não consultas, e o erro não garante o texto de resposta). Callback `handleLLMEnd` só para contar, sem cortar (rejeitado: não impede a consulta extra).

## 3. Plan-and-Execute

- **Decision**: `StateGraph` com três nós. `planner` devolve lista de passos via saída estruturada. `executor` cumpre um passo com as mesmas ferramentas. `replanner` devolve ou o restante dos passos ou o encerramento. A aresta condicional volta ao executor enquanto houver passo, `stepsTaken < 8` e `stepsTaken < maxIterations`. Lista vazia encerra.
- **Rationale**: É o grafo pedido: um passo por vez, revisão do restante, máximo de 8. O teto de iterações da arena, se for menor que 8, chega primeiro (FR-017). Consultas do planner, do executor e do replanner entram em `llmCalls`. Iteração, nesta estratégia, é passo executado, não cada chamada.
- **Alternatives considered**: Aninhar um `createReactAgent` inteiro dentro de cada passo (rejeitado: o teto de iterações fica ambíguo e estoura o máximo de 8 com facilidade). Um único plano sem replanner (rejeitado: a spec exige revisão depois de cada passo).

## 4. Fábrica de modelo

- **Decision**: `src/agents/model.ts` cria um `ChatOpenAI` com `model` = `OPENROUTER_MODEL`, `apiKey` = `OPENROUTER_API_KEY`, `temperature: 0` e `configuration.baseURL = "https://openrouter.ai/api/v1"`. Chave ou modelo ausente vira erro de domínio antes de qualquer consulta. O módulo não abre `.env`.
- **Rationale**: O construtor instalado de `@langchain/openai` documenta `model`, `temperature`, `apiKey` e `configuration.baseURL`. Uma fábrica só garante a configuração estável exigida pela spec. Temperatura 0 favorece comparação entre estratégias.
- **Alternatives considered**: SDK próprio do OpenRouter (rejeitado: a constituição manda `@langchain/openai` sobre OpenRouter). Temperatura default do provedor (rejeitado: a comparação deixa de ser estável).

## 5. Dois armazenamentos do mesmo catálogo

- **Decision**: A definição pura em `src/seed/primary-catalog.ts` é a fonte. `npm run seed` grava serviços e alertas no MySQL (já implementado, Sequelize, dialect `mysql`, driver `mysql2`). As ferramentas recebem uma cópia em memória construída desse mesmo objeto, com `incidents: []`. Testes do store não conectam no banco.
- **Rationale**: A spec pede carga repetível e persistida e, ao mesmo tempo, conferência sem serviço externo. O agente pré-construído precisa de ferramentas síncronas em relação ao catálogo da execução. Misturar cada tool call com MySQL tornaria o teste de store dependente de rede e de banco.
- **Alternatives considered**: Ferramentas lendo MySQL direto (rejeitado: FR-020 deixa de ser offline). Só memória, sem seed (rejeitado: a carga persistida já é requisito e já existe). Sqlite (rejeitado: a constituição fixa MySQL).

## 6. Nomes das ferramentas e do contrato de rastro

- **Decision**: Ferramentas `list_alertas`, `open_incident`, `resolver_incident`. Eventos `thought | action | observation | plan | critique | answer`. `action` carrega `tool` e `args`. Métricas `{ llmCalls, latencyMs }`.
- **Rationale**: É o vocabulário que o plantonista lê na arena e que a spec tornou requisito. O ReAct projeta mensagens do agente nisso: texto do modelo vira `thought` quando há tool call na mesma mensagem e `answer` quando é a mensagem final; cada tool call vira `action`; cada `ToolMessage` vira `observation`. Plan-and-Execute emite `plan` e `critique` nos nós, e reutiliza o mesmo mapeamento de ação/observação.
- **Alternatives considered**: Guardar o rastro só como lista de mensagens LangChain (rejeitado: a arena e o teste de formatação precisam do contrato estável, independente da classe de mensagem).

## 7. Recusa nas ferramentas

- **Decision**: As transições puras lançam erro de domínio e devolvem o estado anterior. O adaptador da ferramenta captura o erro, não substitui o estado e devolve a mensagem como observação. A borda CLI, para estratégia desconhecida ou seleção vazia, traduz o erro em saída de erro e não chama o modelo.
- **Rationale**: A constituição pede classes de erro de domínio. A spec pede que a recusa não altere o catálogo e que o agente ainda possa registrar a observação. São duas bordas diferentes para o mesmo erro.
- **Alternatives considered**: Result type no lugar de exceção (rejeitado: a constituição pede classes). Deixar a exceção estourar o agente (rejeitado: o rastro perderia a observação e a execução inteira cairia).

## 8. Driver MySQL

- **Decision**: Sequelize 6 no dialect `mysql` carrega o módulo `mysql2`. O pacote legado `mysql` já listado no projeto não satisfaz esse carregamento. A carga usa `mysql2`.
- **Rationale**: O connection manager instalado chama `_loadDialectModule("mysql2")`. Sem esse módulo a carga não abre.
- **Alternatives considered**: Passar o pacote `mysql` em `dialectModule` (rejeitado: a API de callback não é a que o dialect Sequelize 6 espera).
