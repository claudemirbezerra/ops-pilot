# Contract: Ferramentas do plantão

Três ferramentas. Argumentos validados com Zod antes da transição. Recusa vira observação e não muda o store.

Estado inicial da execução: catálogo primário de [spec.md](../spec.md) (FR-012, FR-013) e nenhum incidente.

## list_alertas

Entrada:

| Campo | Regra |
|-------|--------|
| `status` | `"firing"` ou `"resolved"`. Obrigatório. |

Sucesso: lista só os alertas daquela situação. No catálogo primário, cada situação devolve 3 itens, com `title`, `serviceSlug`, `severity` e `status`.

Recusa: qualquer outro `status`. Store intacto.

## open_incident

Entrada:

| Campo | Regra |
|-------|--------|
| `title` | string não vazia |
| `service` | slug de serviço existente |
| `severity` | `low`, `medium`, `high` ou `critical` |

Sucesso: incidente `open` com `id` novo (1 na primeira abertura da execução) e o store passa a contê-lo.

Recusa: serviço desconhecido, título vazio ou severidade fora da escala. Nenhum incidente novo.

## resolver_incident

Entrada:

| Campo | Regra |
|-------|--------|
| `id` | inteiro positivo |

Sucesso em incidente `open`: passa a `resolved`.

Sucesso em incidente já `resolved`: continua `resolved`, sem segundo registro. A observação confirma o estado.

Recusa: id ausente. Store intacto.

## Fora do contrato

As ferramentas não alteram alertas, não persistem incidente no MySQL e não chamam sistema externo.
