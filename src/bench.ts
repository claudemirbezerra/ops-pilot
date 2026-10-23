import { pathToFileURL } from "node:url";

import { z } from "zod";

import { planAndExecuteStrategy } from "./agents/plan-and-execute.js";
import { reactStrategy } from "./agents/react.js";
import {
  createStoreFromPrimaryCatalog,
  createStoreHolder,
  listAlerts,
  type Store,
} from "./agents/store.js";
import type { ReasoningStrategy, StrategyResult } from "./agents/strategy.js";
import {
  DomainError,
  EmptyStrategySelectionError,
} from "./domain/errors.js";

const scenarioIdSchema = z.enum(["C1", "C2", "C3"]);
type ScenarioId = z.infer<typeof scenarioIdSchema>;

const benchArgsSchema = z.object({
  scenarios: z.array(scenarioIdSchema).min(1),
  noReplanner: z.boolean().default(false),
  maxIterations: z.number().int().min(1).default(8),
});

export type BenchArgs = z.infer<typeof benchArgsSchema>;

type BenchScenario = {
  id: ScenarioId;
  prompt: string;
  check: (store: Store, result: StrategyResult) => boolean;
};

/** sev2 → high (SEV-2). */
const SEV2 = "high" as const;

function answerMentionsCount(answer: string, count: number): boolean {
  const normalized = answer.replace(/[^\d]+/g, " ");
  return normalized.split(/\s+/).includes(String(count));
}

function isSev2(severity: string): boolean {
  return severity === SEV2 || severity === "medium";
}

function normalizeServiceSlug(slug: string): string {
  const key = slug.trim().toLowerCase();
  if (key === "payment" || key === "payments") {
    return "payments";
  }
  return key;
}

const scenarios: Record<ScenarioId, BenchScenario> = {
  C1: {
    id: "C1",
    prompt: "quantos alertas críticos estão disparando?",
    check(store, result) {
      const criticalFiring = listAlerts(store, "firing").filter(
        (alert) => alert.severity === "critical",
      ).length;
      return (
        criticalFiring === 1 &&
        store.incidents.length === 0 &&
        answerMentionsCount(result.answer, 1)
      );
    },
  },
  C2: {
    id: "C2",
    prompt:
      "abra três incidentes sev2 para checkout, payment e catalog, nessa mesma ordem, e resolva o primeiro.",
    check(store) {
      const ordered = [...store.incidents].sort((a, b) => a.id - b.id);
      if (ordered.length < 3) {
        return false;
      }

      const [first, second, third] = ordered;
      if (!first || !second || !third) {
        return false;
      }

      if (normalizeServiceSlug(first.serviceSlug) !== "checkout") {
        return false;
      }
      if (first.status !== "resolved") {
        return false;
      }
      if (!isSev2(first.severity)) {
        return false;
      }

      if (normalizeServiceSlug(second.serviceSlug) !== "payments") {
        return false;
      }
      if (!isSev2(second.severity) || second.status !== "open") {
        return false;
      }

      // catalog não existe no catálogo; aceita terceiro slug distinto sev2 em aberto
      const thirdSlug = normalizeServiceSlug(third.serviceSlug);
      if (thirdSlug === "checkout" || thirdSlug === "payments") {
        return false;
      }
      if (!isSev2(third.severity) || third.status !== "open") {
        return false;
      }

      return true;
    },
  },
  C3: {
    id: "C3",
    prompt:
      "dos alertas disparando, abra um incidente para o mais antigo e diga quantos sobraram.",
    check(store, result) {
      const firing = listAlerts(store, "firing");
      const oldest = firing[0];
      if (!oldest) {
        return false;
      }

      const openForOldest = store.incidents.filter(
        (incident) =>
          incident.serviceSlug === oldest.serviceSlug && incident.status === "open",
      );
      if (openForOldest.length !== 1 || store.incidents.length !== 1) {
        return false;
      }

      const remainingWithoutIncident = firing.filter(
        (alert) =>
          !store.incidents.some(
            (incident) => incident.serviceSlug === alert.serviceSlug,
          ),
      ).length;

      return answerMentionsCount(result.answer, remainingWithoutIncident);
    },
  },
};

const strategies: ReasoningStrategy[] = [reactStrategy, planAndExecuteStrategy];

export function parseBenchArgs(argv: string[]): BenchArgs {
  const flags = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    if (key === "no-replanner") {
      flags.set(key, true);
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, "");
      continue;
    }

    flags.set(key, next);
    index += 1;
  }

  const rawScenario = flags.get("scenario");
  const scenarioList =
    rawScenario === undefined || rawScenario === "" || rawScenario === true
      ? (["C1", "C2", "C3"] as ScenarioId[])
      : String(rawScenario)
          .split(",")
          .map((part) => part.trim().toUpperCase())
          .filter((part) => part.length > 0);

  if (scenarioList.length === 0) {
    throw new EmptyStrategySelectionError(
      "Informe ao menos um cenário com --scenario (C1, C2, C3).",
    );
  }

  for (const id of scenarioList) {
    if (id !== "C1" && id !== "C2" && id !== "C3") {
      throw new EmptyStrategySelectionError(`Cenário desconhecido: ${id}. Use C1, C2 ou C3.`);
    }
  }

  const maxRaw = flags.get("max-iterations");
  const maxIterations =
    maxRaw === undefined || maxRaw === "" || maxRaw === true ? 8 : Number(maxRaw);

  const parsed = benchArgsSchema.safeParse({
    scenarios: scenarioList,
    noReplanner: flags.get("no-replanner") === true,
    maxIterations,
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new EmptyStrategySelectionError(message);
  }

  return parsed.data;
}

export type BenchRow = {
  cenário: ScenarioId;
  estratégia: string;
  acerto: boolean;
  llCalls: number;
  latenchMs: number;
};

function pad(value: string, width: number): string {
  return value.length >= width ? value : `${value}${" ".repeat(width - value.length)}`;
}

export function formatBenchTable(rows: BenchRow[]): string {
  const headers = ["cenário", "estratégia", "acerto", "llCalls", "latenchMs"] as const;
  const stringRows = rows.map((row) => [
    row.cenário,
    row.estratégia,
    row.acerto ? "sim" : "não",
    String(row.llCalls),
    String(row.latenchMs),
  ]);

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...stringRows.map((cells) => cells[index]!.length)),
  );

  const line = (cells: string[]) =>
    cells.map((cell, index) => pad(cell, widths[index]!)).join("  ");

  return [line([...headers]), ...stringRows.map(line)].join("\n");
}

export async function runBench(args: BenchArgs): Promise<BenchRow[]> {
  const rows: BenchRow[] = [];
  const total = args.scenarios.length * strategies.length;
  let step = 0;

  for (const scenarioId of args.scenarios) {
    const scenario = scenarios[scenarioId];

    for (const strategy of strategies) {
      step += 1;
      console.error(
        `[bench ${step}/${total}] ${scenarioId} × ${strategy.name}…`,
      );

      const holder = createStoreHolder(createStoreFromPrimaryCatalog(), {
        persist: false,
      });

      const result = await strategy.run(scenario.prompt, {
        maxIterations: args.maxIterations,
        storeHolder: holder,
        noReplanner:
          strategy.name === "plan-and-execute" ? args.noReplanner : false,
      });

      const acerto = scenario.check(holder.current, result);

      rows.push({
        cenário: scenarioId,
        estratégia: strategy.name,
        acerto,
        llCalls: result.metrics.llmCalls,
        latenchMs: result.metrics.latencyMs,
      });

      console.error(
        `[bench ${step}/${total}] acerto=${acerto ? "sim" : "não"} llCalls=${result.metrics.llmCalls} latenchMs=${result.metrics.latencyMs}`,
      );
    }
  }

  return rows;
}

async function main(): Promise<void> {
  try {
    const args = parseBenchArgs(process.argv.slice(2));
    const rows = await runBench(args);
    console.log(formatBenchTable(rows));
  } catch (error: unknown) {
    if (error instanceof DomainError) {
      console.error(error.message);
      process.exitCode = 1;
      return;
    }

    const message = error instanceof Error ? error.message : "erro desconhecido";
    console.error(message);
    process.exitCode = 1;
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  void main();
}
