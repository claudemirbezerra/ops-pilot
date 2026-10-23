# Quickstart: Camada Reflection

Guia de validação. Detalhe em [data-model.md](./data-model.md) e [contracts/](./contracts/).

## Pré-requisitos

- Node 22 e `npm install`.
- Núcleo `001-nucleo-raciocinio` já implementado (estratégias base + arena).
- Para arena com modelo: `OPENROUTER_API_KEY` e `OPENROUTER_MODEL` no ambiente do processo (código não lê `.env`).

Os testes da reflexão não usam rede nem banco.

## 1. Conferência offline

```text
npm test
npm run typecheck
```

Esperado: sucesso. A suíte cobre (quando a feature estiver implementada):

- crítico que sempre reprova + `maxReflections = 2` → no máximo 2 regenerações após a base inicial; rastros com os `critique` correspondentes; parada sem nova tentativa;
- crítico que aprova na primeira avaliação → sem regeneração;
- mesmo cenário de stubs + teto, formatado duas vezes → texto idêntico incluindo `[critique]`;
- flags: `reflect:react` / `reflect:plan-and-execute` aceitos; `reflect:desconhecida` e `--max-reflections 0` recusados sem modelo.

## 2. Reflexão sobre ReAct

```text
npm run arena -- --strategies reflect:react --max-reflections 2 --input "Quais alertas estão em disparo?"
```

Esperado: código 0; bloco `strategy=reflect:react`; rastro com pelo menos um `[critique]`; `metrics.llmCalls` e `metrics.latencyMs` presentes. `llmCalls` tipicamente maior que a mesma corrida só com `react` no mesmo pedido.

## 3. Reflexão sobre Plan-and-Execute

```text
npm run arena -- --strategies reflect:plan-and-execute --max-iterations 8 --max-reflections 2 --input "Abra um incidente crítico para o checkout."
```

Esperado: código 0; `strategy=reflect:plan-and-execute`; rastro e métricas do ciclo com reflexão (críticas do envoltório além das do replanner, se houver).

## 4. Comparar as duas reflexões

```text
npm run arena -- --strategies reflect:react,reflect:plan-and-execute --input "Liste alertas em disparo e abra um incidente para o checkout."
```

Esperado: dois blocos separados, mesmo pedido, cada um com rastro e métricas próprios.

## 5. Bases sem reflexão e bordas

```text
npm run arena -- --strategies react,reflect:react --input "Quais alertas estão em disparo?"
npm run arena -- --strategies reflect:foo --input "ping"
npm run arena -- --strategies reflect:react --max-reflections 0 --input "ping"
npm run arena -- --strategies reflect:react --input "   "
```

Esperado:

- `react` e `reflect:react` no mesmo comando: ambos rodam; só o segundo usa o crítico.
- `reflect:foo`: código 1, mensagem cita o nome, nenhuma consulta.
- `--max-reflections 0`: código 1, nenhuma consulta.
- Pedido em branco: código 0, `llmCalls` 0, sem crítica inventada.
