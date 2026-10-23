import { DomainError } from "./domain/errors.js";
import { OPS_STORE_JSON, seedJsonStore } from "./seed/json-db.js";

async function main(): Promise<void> {
  try {
    const summary = seedJsonStore();
    console.log(
      `Catálogo carregado em ${OPS_STORE_JSON}: ${summary.services} serviços, ${summary.alerts} alertas (${summary.firing} em disparo, ${summary.resolved} resolvidos).`,
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
