# Contract: Carga do catálogo

Comando: `npm run seed`

Já implementado em `src/seed.ts`. Este contrato fixa o comportamento que a arena e os testes podem assumir.

## Ambiente

Lido de `process.env`. O processo não abre arquivo `.env`.

| Variável | Padrão se vazia |
|----------|-----------------|
| `DB_HOST` | `127.0.0.1` |
| `DB_PORT` | `3306` |
| `DB_NAME` | `opspilot` |
| `DB_USER` | `root` |
| `DB_PASSWORD` | string vazia |

`DB_NAME` só aceita letras, dígitos e `_`. `DB_PORT` é inteiro de 1 a 65535. Valor inválido é erro de domínio, código de saída 1, sem senha no texto.

## Efeito

1. Cria o banco se ele não existir (utf8mb4).
2. Garante as tabelas `services` e `alerts`.
3. Substitui serviços e alertas pelo catálogo primário.

Sucesso, código 0, uma linha:

```text
Catálogo carregado: 5 serviços, 6 alertas (3 em disparo, 3 resolvidos).
```

Segunda execução imprime a mesma linha e deixa as mesmas contagens, sem duplicar.

Falha de conexão: código 1, mensagem sem a senha.

## Fora do contrato

A carga não cria incidentes e não é chamada pela arena. As ferramentas não leem estas tabelas durante o raciocínio; leem a cópia em memória do mesmo catálogo.
