# Contract: Logger JSON (`src/obs/logger.ts`)

Observabilidade linha a linha. Modelo de metadados: [data-model.md](../data-model.md).

## Responsabilidade

Emitir **exatamente uma linha** por chamada, contendo um único objeto JSON **sem** payload completo de trace.

## API (forma)

```ts
type LogWriter = (line: string) => void;

type TraceLogMeta = {
  requestId: string;
  seq: number;
  type: string;
  node?: string;
  ts: number;
};

type RequestLifeMeta = {
  requestId: string;
  event: "request_start" | "request_end";
  status?: "ok" | "error";
  ts: number;
  type?: string; // pode espelhar event
};

function createLogger(writer?: LogWriter): {
  logTraceEvent(meta: TraceLogMeta): void;
  logRequestLife(meta: RequestLifeMeta): void;
};
```

Default `writer`: escreve em `process.stdout` a string `JSON.stringify(meta) + "\n"`.

## Regras

| Regra | Detalhe |
|-------|---------|
| Uma linha | Nenhum `\n` dentro do JSON; um objeto por write |
| Só metadados | Sem `content`, `args`, `steps`, `reason` longo como payload, sem `payload` |
| Correlação | Todo evento de trace inclui `requestId`, `seq`, `type`, `ts` |
| Trace vazio | Não emitir `logTraceEvent`; `logRequestLife` opcional ainda permitido |
| Testes | Injetar writer que acumula strings; parse + assert chaves |

## Mapeamento a partir de `TraceEvent`

| Fonte | Meta |
|-------|------|
| índice no array | `seq` |
| `event.type` | `type` |
| `event.node` se definido | `node` |
| `requestId` do turno | `requestId` |
| `Date.now()` (ou clock injetável) | `ts` |

## Fora de escopo

- Níveis debug/info/error além do JSON único
- Rotação de arquivo / destinos remotos
- Correlação com LangSmith
