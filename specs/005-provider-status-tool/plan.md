# Implementation Plan: Status de Provedores Externos

**Branch**: `005-provider-status-tool` | **Date**: 2026-10-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-provider-status-tool/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Adicionar a tool `check_provider_status` ao conjunto do plantão em `src/agents/tools.ts`: consulta pública Statuspage.io (GitHub / Cloudflare, sem chave), parâmetro `provider` enum com default `github`, descrição com quando usar / não usar (6 regras). Resiliência: timeout 5s por tentativa (`AbortSignal.timeout`), exatamente um retry em rede/5xx/timeout, validação Zod de `{ status: { indicator, description } }`, retorno compacto em uma linha; falha final vira string de observação (nunca exceção para fora). Fetch injetável para testes sem rede (sucesso, timeout, payload inválido). Atualizar `ToolName` / prompts / trace para incluir a sexta tool.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript ESM `strict: true`

**Primary Dependencies**: Zod (schema da tool + payload Statuspage), `@langchain/core/tools` (`tool()`), `globalThis.fetch` (ou injetado)

**Storage**: N/A — sem persistência; só HTTP de leitura a status pages públicas

**Testing**: `node:test` via `tsx`; fetch falso injetado; sem rede real

**Target Platform**: Node.js processo local (dev / arena / bench / HTTP)

**Project Type**: Agente + web service; esta feature é uma tool de observação externa no grafo

**Performance Goals**: Cada tentativa ≤ 5s (timeout); resultado compacto (1 linha) para não inflar contexto LLM

**Constraints**: Sem API key; erro = observação; 1 retry só em rede/5xx/timeout; 4xx sem retry; camadas: lógica de fetch/parse isolável e testável; constitution V (teste) e III (Zod na fronteira)

**Scale/Scope**: 2 provedores; 1 tool nova; ~4–6 arquivos tocados (`tools.ts`, `tools.test.ts`, `strategy.ts` ToolName, `plan-and-execute` prompt, `trace.ts` set)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Princípio | Status | Evidência |
|---|-----------|--------|-----------|
| I | **Camadas explícitas** | ✅ PASS | Tool em `agents/`; sem HTTP em controller; store intacto |
| II | **Funções puras** | ✅ PASS | Formatação compacta + parse Zod do payload como funções puras; I/O só no helper de fetch com deps injetáveis |
| III | **Validações na fronteira** | ✅ PASS | Zod no schema da tool (`provider`) e no corpo Statuspage (`status.indicator` / `description`) |
| IV | **Erros de domínio** | ✅ PASS | Falhas de rede/HTTP/parse → string via `asObservation` / retorno direto; sem throw para o grafo |
| V | **Teste é parte da tarefa** | ✅ PASS | FR-011/FR-012 — fake fetch: sucesso, timeout, inválido |
| VI | **Segurança por padrão** | ✅ PASS | Sem secrets; URLs públicas; `.env` não lido |
| VII | **Spec antes de código** | ✅ PASS | specify → plan (esta fase) |
| VIII | **Pequeno e reversível** | ✅ PASS | Uma tool + tipos/prompt/trace; commitável em fatia única |

**Stack**: ✅ Node 22 + Zod + LangChain tools; sem storage novo.

**Gate result: ALL PASS** — Complexity Tracking não necessário.

**Re-check pós Phase 1**: [data-model.md](./data-model.md) + [contracts/check-provider-status.md](./contracts/check-provider-status.md) mantêm tool atrás de fetch injetável e erros como observação. Gate permanece PASS.

## Project Structure

### Documentation (this feature)

```text
specs/005-provider-status-tool/
├── plan.md                              # Este arquivo
├── research.md                          # Phase 0
├── data-model.md                        # Phase 1
├── quickstart.md                        # Phase 1
├── contracts/
│   └── check-provider-status.md         # Contrato da tool + Statuspage
└── tasks.md                             # Phase 2 (/speckit-tasks — NÃO gerado aqui)
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── tools.ts              # ← + check_provider_status; deps.fetch opcional em createOpsTools
│   ├── tools.test.ts         # ← + fake fetch: sucesso / timeout / inválido (+ retry smoke)
│   ├── strategy.ts           # ← ToolName inclui check_provider_status
│   ├── plan-and-execute.ts   # ← prompt lista a nova tool
│   └── trace.ts              # ← TOOL_NAMES inclui check_provider_status
└── (opcional, se extrair)
    domain/ ou agents/
      provider-status.ts      # helper: URL map, Zod body, formatCompact, fetchWithRetry
```

**Structure Decision**: Projeto único. Preferência: helper co-localizado ou módulo fino `src/agents/provider-status.ts` (funções de URL/parse/format + `fetchProviderStatus`) importado por `tools.ts`, para manter `tools.ts` legível e testar o helper sem LangChain. Testes co-localizados `src/**/*.test.ts`. Sem pasta `tests/` separada. Sem mudanças em store/SQLite.

## Complexity Tracking

> Nenhuma violação — seção vazia de propósito.
