# Quickstart: Núcleo de raciocínio

Guia de validação. Detalhe de campos em [data-model.md](./data-model.md). Comportamento esperado em [contracts/](./contracts/).

## Pré-requisitos

- Node 22.
- Dependências instaladas (`npm install`).
- Para a carga: MySQL acessível e variáveis `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` no ambiente do processo. Nomes e padrões estão em [contracts/seed-cli.md](./contracts/seed-cli.md) e em `.env.example`. O código não lê o arquivo `.env`.
- Para a arena com modelo: `OPENROUTER_API_KEY` e `OPENROUTER_MODEL` no ambiente.

Os testes abaixo não usam banco nem modelo.

## 1. Conferência offline

```text
npm test
npm run typecheck
```

Esperado: os dois comandos terminam com sucesso. Os testes do catálogo primário conferem 5 serviços, 6 alertas, 3 em disparo e 3 resolvidos. Quando o store e a formatação do rastro existirem, a mesma suíte cobre:

- listar `firing` e `resolved` devolve 3 cada;
- abrir incidente em `checkout` e resolver muda só esse incidente para `resolved`;
- serviço desconhecido e id desconhecido deixam o store igual;
- o mesmo rastro formatado duas vezes produz o mesmo texto, com `tool` e `args` na ação.

Nenhuma dessas conferências abre conexão externa.

## 2. Carga do catálogo

Com o MySQL no ambiente:

```text
npm run seed
npm run seed
```

Esperado, nas duas vezes, código 0 e a linha:

```text
Catálogo carregado: 5 serviços, 6 alertas (3 em disparo, 3 resolvidos).
```

Sem MySQL escutando, o comando termina com código 1 e não imprime a senha.

## 3. Uma estratégia

```text
npm run arena -- --strategies react --max-iterations 4 --input "Quais alertas estão em disparo?"
```

Esperado: código 0, rastro de `react` com ao menos uma `action` de `list_alertas` e argumentos de situação, uma `observation`, um `answer`, e as métricas `llmCalls` e `latencyMs`. `llmCalls` não passa de 4.

## 4. As duas estratégias no mesmo pedido

```text
npm run arena -- --strategies react,plan-and-execute --max-iterations 8 --input "Abra um incidente crítico para o checkout e depois resolva."
```

Esperado: dois blocos, um por estratégia, cada um com rastro e métricas do mesmo pedido. No bloco `plan-and-execute`, há um `plan`, passos um a um e `critique` depois de cada passo. O número de passos executados não passa de 8.

## 5. Bordas da arena

```text
npm run arena -- --strategies --input "ping"
npm run arena -- --strategies desconhecida --input "ping"
npm run arena -- --strategies react --input "   "
```

Esperado:

- Seleção vazia: código 1, nenhuma consulta.
- Nome `desconhecida`: código 1, a mensagem cita esse nome, nenhuma consulta.
- Pedido em branco: código 0, resposta pedindo um pedido operacional, `llmCalls` 0.

Sem `OPENROUTER_API_KEY` ou `OPENROUTER_MODEL`, um pedido não vazio termina com código 1 antes de consultar o modelo.
