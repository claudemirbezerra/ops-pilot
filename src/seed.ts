import { readDatabaseConfig } from "./db/config.js";
import { DomainError } from "./domain/errors.js";
import { seedPrimaryCatalog } from "./services/catalog-seed-service.js";

async function main(): Promise<void> {
  let password = "";

  try {
    const config = readDatabaseConfig(process.env);
    password = config.password;
    const summary = await seedPrimaryCatalog(config);
    console.log(
      `Catálogo carregado: ${summary.services} serviços, ${summary.alerts} alertas (${summary.firing} em disparo, ${summary.resolved} resolvidos).`,
    );
  } catch (error: unknown) {
    console.error(safeMessage(error, password));
    process.exitCode = 1;
  }
}

function safeMessage(error: unknown, password: string): string {
  if (error instanceof DomainError) {
    return error.message;
  }

  const message = error instanceof Error ? error.message : "erro desconhecido";
  const redacted = password.length > 0 ? message.replaceAll(password, "***") : message;
  return `Falha ao carregar o catálogo: ${redacted}`;
}

void main();
