# Contract: Arena CLI

Comando: `npm run arena -- <flags>`

A borda valida as flags com Zod e só então chama as estratégias. Erro de domínio vai para a saída de erro e o processo termina com código 1. Sucesso termina com código 0.

## Flags

| Flag | Regra |
|------|--------|
| `--strategies` | Lista separada por vírgula. Aceita `react` e `plan-and-execute`. Pelo menos um. Repetir o mesmo nome é inválido. Nome desconhecido recusa e não consulta o modelo. |
| `--max-iterations` | Inteiro ≥ 1. Ausente: 8. |
| `--input` | Pedido do plantonista. Ausente ou só espaços: tratado como pedido vazio, sem erro de processo. |

Exemplo:

```text
npm run arena -- --strategies react,plan-and-execute --max-iterations 8 --input "Quais alertas estão em disparo?"
```

## Saída padrão

Para cada estratégia, nesta ordem:

1. Nome (`react` ou `plan-and-execute`).
2. Rastro formatado, um evento por bloco, na ordem do contrato [reasoning-strategy.md](./reasoning-strategy.md).
3. Métricas `llmCalls` e `latencyMs`.

A formatação é função pura. O mesmo rastro produz o mesmo texto. Cada `action` mostra `tool` e `args`.

## Saída de erro

| Condição | Efeito |
|----------|--------|
| `--strategies` ausente ou vazio | Código 1. Mensagem de que falta ao menos uma estratégia. Nenhuma consulta. |
| Nome fora de `react` e `plan-and-execute` | Código 1. A mensagem inclui o nome rejeitado. Nenhuma consulta. |
| `--max-iterations` menor que 1 ou não inteiro | Código 1. Nenhuma consulta. |
| `OPENROUTER_API_KEY` ou `OPENROUTER_MODEL` ausente, e o pedido não é vazio | Código 1. Erro de domínio da fábrica. |

Pedido vazio com estratégias válidas é sucesso (código 0), com a resposta pedindo um pedido operacional e `llmCalls` 0.
