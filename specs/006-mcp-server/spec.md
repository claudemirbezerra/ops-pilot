# Feature Specification: Servidor MCP OpsPilot

**Feature Branch**: `006-mcp-server`

**Created**: 2026-10-27

**Status**: Draft

**Input**: User description: "MCP server do OpsPilot: src/mcp/server.ts com @modelcontextprotocol/sdk, transport stdio expondo list_alerts, open_incident resolve_incident - reutilizando o mesmo OpsStore e os mesmo schemas zod das tools existentes (uma unica fonte de verdade). Nome do server: opspilot. Script npm: mcp = \"tsx src/mcp/server.ts\" (se precisar de env, alterar o script e carregar elas antes). Regra Critica: nenhum console.log no server - no stdio o stdout é o canal do protocolo; diagnóstico vai para o stderr. Test: sobre o server e valida o list de tools"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cliente MCP descobre e lista as ferramentas operacionais (Priority: P1)

Um host compatível com MCP (por exemplo, um agente ou IDE) inicia o servidor OpsPilot via stdio e pergunta quais ferramentas estão disponíveis. O servidor se identifica como `opspilot` e anuncia exatamente três ferramentas de plantão: `list_alerts`, `open_incident` e `resolve_incident`, com schemas de entrada alinhados às tools já usadas pelo agente interno.

**Why this priority**: Sem descoberta correta das tools, nenhum fluxo operacional via MCP funciona; é o contrato mínimo do servidor.

**Independent Test**: Subir o servidor (ou exercitar a superfície de listagem em teste) e validar que a lista de tools contém exatamente esses três nomes e schemas coerentes com a fonte de verdade existente.

**Acceptance Scenarios**:

1. **Given** o servidor MCP OpsPilot está em execução via stdio, **When** o cliente solicita a listagem de tools, **Then** a resposta inclui `list_alerts`, `open_incident` e `resolve_incident`.
2. **Given** a listagem de tools, **When** o cliente inspeciona o servidor, **Then** o nome do servidor é `opspilot`.
3. **Given** as tools anunciadas, **When** o cliente inspeciona os schemas de entrada, **Then** eles coincidem com os schemas Zod já usados pelas tools equivalentes do agente (mesma fonte de verdade — sem cópia divergente).

---

### User Story 2 - Operador externo lista alertas, abre e resolve incidentes via MCP (Priority: P1)

Um cliente MCP usa as três tools para o ciclo básico de plantão: consultar alertas abertos, abrir um incidente a partir de um alerta (ou contexto operacional) e marcar um incidente como resolvido. As operações leem e gravam no mesmo armazenamento operacional (`OpsStore`) que o restante do OpsPilot, de modo que estado via MCP e via agente interno permanecem consistentes.

**Why this priority**: É o valor de negócio — expor o plantão a hosts MCP sem duplicar persistência nem regras de validação.

**Independent Test**: Com store em memória (ou equivalente de teste), invocar as três tools via a superfície MCP e verificar efeitos e respostas equivalentes às tools internas sobre o mesmo store.

**Acceptance Scenarios**:

1. **Given** alertas existentes no store operacional, **When** o cliente chama `list_alerts`, **Then** recebe a lista de alertas coerente com o que o store contém.
2. **Given** um alerta elegível, **When** o cliente chama `open_incident` com argumentos válidos segundo o schema compartilhado, **Then** um incidente é criado/aberto no mesmo OpsStore e o resultado confirma a operação.
3. **Given** um incidente aberto, **When** o cliente chama `resolve_incident` com argumentos válidos, **Then** o incidente passa a resolvido no mesmo OpsStore e o resultado confirma a operação.
4. **Given** argumentos inválidos segundo o schema Zod compartilhado, **When** o cliente invoca qualquer das três tools, **Then** a chamada é rejeitada na fronteira (validação) sem corromper o store.

---

### User Story 3 - Desenvolvedor sobe o servidor sem poluir o canal do protocolo (Priority: P1)

Quem integra o OpsPilot como processo MCP precisa de um comando npm estável (`mcp`) que inicia o servidor em stdio. Em transporte stdio, a saída padrão (stdout) é reservada exclusivamente às mensagens do protocolo MCP. Qualquer diagnóstico, log ou mensagem de depuragem do processo do servidor deve ir para stderr. Em particular, o código do servidor não usa `console.log` (que escreveria em stdout e quebraria o protocolo).

**Why this priority**: Regra crítica de integração — um único `console.log` no stdout torna o servidor inutilizável para clientes MCP.

**Independent Test**: Inspecionar/rodar o servidor e a suíte de teste do MCP garantindo ausência de escrita diagnóstica em stdout e presença do script `npm run mcp`.

**Acceptance Scenarios**:

1. **Given** o repositório configurado, **When** o desenvolvedor executa `npm run mcp`, **Then** o processo inicia o servidor MCP em `src/mcp/server.ts` via stdio.
2. **Given** o servidor em execução, **When** ocorre diagnóstico interno (startup, erro operacional, etc.), **Then** essa mensagem vai para stderr, nunca para stdout.
3. **Given** o código do servidor MCP, **When** revisado ou testado, **Then** não há `console.log` (nem equivalente que escreva diagnóstico em stdout) no caminho do servidor.

---

### User Story 4 - Teste garante o contrato de listagem de tools (Priority: P2)

A suíte automatizada cobre o servidor MCP e valida que a listagem de tools expõe as três ferramentas esperadas, evitando regressão silenciosa do contrato com hosts MCP.

**Why this priority**: Princípio “teste é parte da tarefa”; o contrato de descoberta é o primeiro ponto de falha em integração.

**Independent Test**: Rodar o teste do servidor MCP e assertar a lista de nomes das tools.

**Acceptance Scenarios**:

1. **Given** a suíte de testes do projeto, **When** o teste do servidor MCP executa, **Then** valida a listagem de tools e confirma a presença de `list_alerts`, `open_incident` e `resolve_incident`.
2. **Given** o teste, **When** executa, **Then** não depende de rede externa e permanece determinístico (store de teste / injeção adequada).

---

### Edge Cases

- Entrada inválida em qualquer tool: rejeitada pela validação Zod compartilhada; store inalterado.
- Incidente ou alerta inexistente em `open_incident` / `resolve_incident`: comportamento alinhado às tools internas existentes (mesma regra de domínio / mensagem de erro).
- Cliente solicita listagem antes de qualquer chamada: lista completa das três tools ainda assim.
- Processo do servidor emite aviso ou erro: somente stderr; stdout permanece limpo para o protocolo.
- Variáveis de ambiente necessárias ao store (ex.: caminho do banco): carregadas antes/junto ao script `mcp`, sem ler `.env` no código da aplicação (conforme constituição); se o script precisar exportar/carregar env, isso fica no script npm, não em `console.log` no servidor.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST expor um servidor MCP chamado `opspilot`, iniciado via transporte stdio.
- **FR-002**: O servidor MUST ser iniciável por um único comando de projeto `npm run mcp`; se o ambiente exigir variáveis para o store, elas MUST estar disponíveis antes do processo aceitar o protocolo, sem o servidor emitir diagnóstico em stdout.
- **FR-003**: O servidor MUST anunciar e implementar exatamente as tools `list_alerts`, `open_incident` e `resolve_incident` nesta feature (sem outras tools MCP obrigatórias neste escopo).
- **FR-004**: As três tools MCP MUST ler e gravar no mesmo armazenamento operacional (OpsStore) usado pelo restante do OpsPilot, de modo que estado via MCP e via agente interno permaneçam consistentes.
- **FR-005**: Os schemas de entrada das tools MCP MUST ser a mesma fonte de verdade já usada pelas tools equivalentes do agente — sem definições duplicadas que possam divergir.
- **FR-006**: O servidor MUST falar o protocolo MCP sobre transporte stdio (entrada/saída padrão do processo).
- **FR-007**: O processo do servidor MUST NÃO escrever diagnóstico ou logs em stdout; stdout é exclusivo do protocolo MCP; qualquer diagnóstico MUST ir para stderr (incluindo proibição de `console.log` no servidor).
- **FR-008**: A suíte de testes MUST incluir cobertura do servidor MCP que valida a listagem de tools (`list_alerts`, `open_incident`, `resolve_incident`).
- **FR-009**: Entradas das tools MCP MUST ser validadas na fronteira com os schemas compartilhados antes de afetar o domínio/store.
- **FR-010**: Erros previsíveis de domínio nas tools MCP MUST seguir o mesmo tratamento observável das tools internas (resultado/erro utilizável pelo cliente, sem quebrar o canal stdio do protocolo).

### Key Entities

- **Servidor MCP OpsPilot**: processo nomeado `opspilot` que fala MCP sobre stdio e expõe tools de plantão.
- **Tool MCP**: operação anunciável (`list_alerts`, `open_incident`, `resolve_incident`) com schema de entrada compartilhado e efeito no OpsStore.
- **OpsStore**: armazenamento operacional de alertas e incidentes compartilhado entre agente interno e servidor MCP.
- **Schema Zod compartilhado**: definição única de validação de argumentos das tools, reutilizada por agente e MCP.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um cliente MCP consegue descobrir as três tools (`list_alerts`, `open_incident`, `resolve_incident`) em uma única listagem, com servidor identificado como `opspilot`, em menos de 5 segundos após o processo estar pronto.
- **SC-002**: 100% das chamadas com argumentos válidos às três tools refletem no mesmo armazenamento operacional usado pelo restante do OpsPilot (estado visível de forma cruzada agente ↔ MCP).
- **SC-003**: 100% das execuções de teste do servidor MCP que cobrem listagem de tools passam de forma determinística, sem rede externa.
- **SC-004**: Em operação normal e em falhas de diagnóstico, nenhuma mensagem de log do servidor aparece no canal stdout (protocolo permanece parseável pelo cliente).
- **SC-005**: Um desenvolvedor sobe o servidor com um único comando (`npm run mcp`) sem passos manuais extras além do já exigido pelo ambiente do projeto.

## Assumptions

- As tools internas equivalentes já existem e possuem schemas de validação e efeitos sobre OpsStore; esta feature as expõe via MCP com nomes `list_alerts`, `open_incident` e `resolve_incident` (mapeamento 1:1 conceitual, mesmo que o nome interno do agente use variante linguística).
- Entrypoint do processo: `src/mcp/server.ts`; script npm `mcp` = `tsx src/mcp/server.ts` (ajustável se precisar carregar env antes). Implementação com `@modelcontextprotocol/sdk` — detalhe de plano/implementação, não de valor de negócio.
- Autenticação/autorização MCP e transporte HTTP/SSE ficam fora do escopo desta feature (somente stdio).
- Não é obrigatório expor via MCP nesta entrega tools além das três citadas (ex.: `list_incidents`, `consultar_runbook`, `check_provider_status`).
- Configuração de caminho do banco segue o padrão do produto (`OPSPILOT_DB` / default do OpsStore); testes usam store em memória ou equivalente isolado.
- Segredos não entram no repositório; o código da aplicação não lê `.env` (constituição); qualquer necessidade de env no script `mcp` é responsabilidade do script npm / ambiente do operador.
