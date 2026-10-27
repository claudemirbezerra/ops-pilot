# Data Model: Refletor de aprendizado

**Phase 1 output for** `specs/009-refletor-aprendizado/plan.md`

Persistência física: **inalterada** — tabela `memories` e tipos `MemoryRecord` / `RecalledMemory` / `MemoryStore` da feature 008. Este documento modela as entidades de **comportamento** introduzidas pelo refletor e pela tool.

---

## Entidades

### LearningDecision

Resultado de uma extração sobre a última mensagem do usuário do turno.

| Campo | Tipo | Regras |
|-------|------|--------|
| `hasLearning` | boolean | Obrigatório |
| `fact` | string | Obrigatório no schema; pode ser `""` |

**Validação pós-extração** (`shouldRemember`):

| `hasLearning` | `fact.trim()` | Efeito |
|---------------|---------------|--------|
| `false` | qualquer | Não grava |
| `true` | vazio | Não grava |
| `true` | não vazio | *remember*(userId, fact trimado) |

Máximo **um** fato candidato por turno (o schema não é array).

---

### LearningJob (efêmero)

Agendamento pós-resposta; **não** persistido.

| Campo | Descrição |
|-------|-----------|
| `userId` | Escopo do *remember* |
| `userMessage` | Última mensagem do usuário do turno |
| `memoryStore` | Mesma instância do `/chat` |
| `extractor` | `LearningExtractor` |

Ciclo de vida: criado no sucesso de `runChat` → extract → gate → remember opcional → termina. Falhas não reabrem o turno HTTP.

---

### ForgetPreferenceRequest

Entrada da tool de agente.

| Campo | Tipo | Regras |
|-------|------|--------|
| `description` | string | Trim, min length 1 |

Contexto implícito (não no schema da tool): `userId`, `memoryStore` vindos de `StrategyOptions`.

---

### ForgetPreferenceResult

Saída serializada da tool (JSON string na observação).

| Campo | Tipo | Quando |
|-------|------|--------|
| `forgotten` | boolean | Sempre |
| `id` | string | Se `forgotten: true` |
| `fact` | string | Se `forgotten: true` |

Se `forgotten: false`: nenhum fato removido (recall vazio / score &lt; 0,3).  
Sem `userId`/`memoryStore`: não é este resultado — observação de erro de domínio.

---

## Relacionamentos

```text
UserMessage (turno)
    └── LearningExtractor.extract → LearningDecision
            └── shouldRemember? → MemoryStore.remember → MemoryRecord (008)

ForgetPreferenceRequest + userId
    └── MemoryStore.recall (top, ≥ 0,3)
            └── MemoryStore.forget(id) → remove MemoryRecord
```

Isolamento por `userId` idêntico ao 008: o refletor e a tool nunca cruzam usuários.

---

## Transições de estado

Não há máquina de estados nova para o fato. Estados do registro em `memories` continuam: **inexistente → presente → removido** (*forget* / `forget_preference`).

O LearningJob é fire-and-forget: `scheduled → succeeded | failed-logged`.

---

## Fora deste modelo

- Colunas/tabelas novas
- Histórico de decisões de aprendizado
- Soft-delete / auditoria de preferências
- Múltiplos fatos por turno
