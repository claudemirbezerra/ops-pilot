# Data Model: Núcleo de raciocínio

Fonte do catálogo primário: [spec.md](./spec.md) FR-012 e FR-013. Contratos de borda: [contracts/](./contracts/).

## Serviço

Identidade estável: `slug`.

| Campo | Regras |
|-------|--------|
| `slug` | `api-gateway`, `checkout`, `payments`, `auth`, `notifications`. Único. |
| `name` | Texto obrigatório. |
| `description` | Texto obrigatório. |

No MySQL o serviço também tem `id` inteiro autoincremento. Nas ferramentas a referência é o `slug`, não o `id`.

## Alerta

Ligado a um serviço.

| Campo | Regras |
|-------|--------|
| `serviceSlug` | Tem de existir no catálogo. No MySQL vira `serviceId`. |
| `title` | Texto obrigatório. Os seis títulos estão na spec. |
| `detail` | Texto obrigatório. |
| `status` | `firing` ou `resolved`. |
| `severity` | `low`, `medium`, `high`, `critical`. |

O catálogo primário tem 6 alertas: 3 `firing`, 3 `resolved`, severidades variadas, e o serviço `checkout` com dois alertas. Nenhuma ferramenta muda a situação de um alerta.

## Incidente

Não entra na carga. Nasce na cópia em memória.

| Campo | Regras |
|-------|--------|
| `id` | Inteiro positivo, único na execução, a partir de 1. |
| `title` | Texto obrigatório. |
| `serviceSlug` | Serviço existente. Serviço desconhecido recusa e não cria registro. |
| `severity` | `low`, `medium`, `high`, `critical`. |
| `status` | Nasce `open`. `resolver_incident` leva a `resolved`. |

### Transição

`open` → `resolved`. `resolved` é terminal: resolver de novo confirma o estado e não cria outro incidente. Identificador ausente recusa e não altera a lista.

## Cópia em memória

```text
Store
├── services: Serviço[]
├── alerts: Alerta[]
├── incidents: Incidente[]
└── nextIncidentId: number   # começa em 1
```

Construída a partir do catálogo primário, com `incidents` vazio. Cada transição pura recebe o store e devolve outro store. Recusa devolve o store recebido.

`list_alertas` não altera o store. Filtra por `status`. Situação fora do enum recusa.

## Carga MySQL

Tabelas `services` e `alerts` (Sequelize, `underscored`, utf8mb4). A carga substitui serviços e alertas e termina de novo com 5 e 6. Não há tabela de incidentes: eles não sobrevivem à carga e não são requisito persistido.

## Rastro

Sequência ordenada. Cada evento tem um tipo.

| Tipo | Campos |
|------|--------|
| `thought` | `content` |
| `action` | `tool`, `args` |
| `observation` | `content` |
| `plan` | `steps` (lista de textos) |
| `critique` | `content` |
| `answer` | `content` |

`tool` é um dos três nomes de ferramenta. `args` é o objeto já validado, ou o objeto recusado quando a ferramenta devolve a observação de erro.

## Métricas

| Campo | Regras |
|-------|--------|
| `llmCalls` | Inteiro ≥ 0. Consultas reais ao modelo. A mensagem sintética de teto não conta. Pedido vazio fica em 0. |
| `latencyMs` | Inteiro ≥ 0. Tempo da execução da estratégia. |

## Execução

| Campo | Regras |
|-------|--------|
| `name` | `react` ou `plan-and-execute` |
| `answer` | Texto. Igual ao último evento `answer`. |
| `trace` | Lista de eventos. |
| `metrics` | Métricas acima. |

Pedido vazio: um evento `answer` pedindo um pedido operacional, métricas com zero consultas, store intacto.

## Plano (só Plan-and-Execute)

Estado do grafo: pedido, `steps` restantes, `stepsTaken`, observações do passo corrente, resposta, rastro, `llmCalls`.

- `planner` preenche `steps` e emite `plan`.
- `executor` consome o primeiro passo, pode emitir `thought`, `action` e `observation`, incrementa `stepsTaken`.
- `replanner` emite `critique` e ou substitui `steps` ou grava a resposta e deixa `steps` vazio.
- Parada quando `steps` está vazio, ou `stepsTaken` atinge 8, ou `stepsTaken` atinge `maxIterations`. O que chegar primeiro.
