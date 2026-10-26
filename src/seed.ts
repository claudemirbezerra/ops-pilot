import { DomainError } from "./domain/errors.js";
import { createDefaultOpsStore, summarizeOpsStore } from "./agents/store.js";

async function main(): Promise<void> {
  try {
    const path = process.env.OPSPILOT_DB ?? "./data/opspilot.db";
    const store = createDefaultOpsStore(path);
    const summary = summarizeOpsStore(store);
    console.log(
      `Catálogo carregado em ${path}: ${summary.services} serviços, ${summary.alerts} alertas (${summary.firing} em disparo, ${summary.resolved} resolvidos).`,
    );
  } catch (error: unknown) {
    console.error(safeMessage(error));
    process.exitCode = 1;
  }
}

function safeMessage(error: unknown): string {
  if (error instanceof DomainError) {
    return error.message;
  }

  const message = error instanceof Error ? error.message : "erro desconhecido";
  return `Falha ao carregar o catálogo: ${message}`;
}

void main();
