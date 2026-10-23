# Contract: Arena CLI (extensão Reflection)

Comando: `npm run arena -- <flags>`

Estende [arena-cli de 001](../../001-nucleo-raciocinio/contracts/arena-cli.md). A borda valida com Zod e só então executa. Erro de domínio → stderr e código 1.

## Flags

| Flag | Regra |
|------|--------|
| `--strategies` | Lista separada por vírgula. Aceita `react`, `plan-and-execute`, `reflect:react`, `reflect:plan-and-execute`. Pelo menos um. Sem repetir o mesmo nome. Nome fora desse conjunto: recusa, mensagem inclui o nome rejeitado, **nenhuma** consulta ao modelo. |
| `--max-iterations` | Inteiro ≥ 1. Ausente: 8. Passado à estratégia base (também dentro da reflexão). |
| `--max-reflections` | Inteiro ≥ 1. Ausente: **2**. Usado só por `reflect:*`. Valor &lt; 1 ou não inteiro: código 1, nenhuma consulta. Estratégias base ignoram o valor. |
| `--input` | Pedido. Ausente ou só espaços: pedido vazio (código 0 se estratégias válidas). |

Exemplos:

```text
npm run arena -- --strategies reflect:react --max-reflections 2 --input "Quais alertas estão em disparo?"

npm run arena -- --strategies reflect:react,reflect:plan-and-execute --max-iterations 8 --max-reflections 2 --input "Abra um incidente crítico para o checkout."
```

## Mapeamento de nomes

| Nome na arena | Comportamento |
|---------------|---------------|
| `react` | ReAct sem reflexão (inalterado). |
| `plan-and-execute` | Plan-and-Execute sem reflexão (inalterado). |
| `reflect:react` | ReAct envolvido por reflexão. |
| `reflect:plan-and-execute` | Plan-and-Execute envolvido por reflexão. |

## Saída padrão

Para cada estratégia, nesta ordem:

1. Nome (`strategy=<name>`), incluindo o prefixo `reflect:` quando couber.
2. Rastro formatado (mesmo formatador do núcleo). Em `reflect:*`, o rastro inclui ao menos um `[critique]` quando houve avaliação.
3. `metrics.llmCalls` e `metrics.latencyMs` do ciclo completo.

## Saída de erro (adições)

| Condição | Efeito |
|----------|--------|
| Nome fora do conjunto acima (ex.: `reflect:foo`) | Código 1. Mensagem cita o nome. Nenhuma consulta. |
| `--max-reflections` &lt; 1 ou inválido | Código 1. Nenhuma consulta. |

Demais regras de `001` (seleção vazia, modelo ausente, pedido em branco) permanecem.
