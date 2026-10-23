import { pathToFileURL } from "node:url";

import { z } from "zod";

import { planAndExecuteStrategy } from "./agents/plan-and-execute.js";
import { reactStrategy } from "./agents/react.js";
import type { ReasoningStrategy } from "./agents/strategy.js";
import { formatTrace } from "./agents/trace.js";
import {
  DomainError,
  EmptyStrategySelectionError,
  MissingModelConfigError,
  UnknownStrategyError,
} from "./domain/errors.js";

const strategyNameSchema = z.enum(["react", "plan-and-execute"]);

const arenaArgsSchema = z.object({
  strategies: z
    .array(strategyNameSchema)
    .min(1, "Informe ao menos uma estratégia.")
    .refine((names) => new Set(names).size === names.length, {
      message: "Não repita o mesmo nome de estratégia.",
    }),
  maxIterations: z.number().int().min(1).default(8),
  input: z.string().default(""),
});

const strategiesByName: Record<z.infer<typeof strategyNameSchema>, ReasoningStrategy> = {
  react: reactStrategy,
  "plan-and-execute": planAndExecuteStrategy,
};

export type ArenaArgs = z.infer<typeof arenaArgsSchema>;

export function parseArenaArgs(argv: string[]): ArenaArgs {
  const flags = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, "");
      continue;
    }

    flags.set(key, next);
    index += 1;
  }

  if (!flags.has("strategies")) {
    throw new EmptyStrategySelectionError(
      "Informe ao menos uma estratégia com --strategies.",
    );
  }

  const rawStrategies = (flags.get("strategies") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (rawStrategies.length === 0) {
    throw new EmptyStrategySelectionError(
      "Informe ao menos uma estratégia com --strategies.",
    );
  }

  for (const name of rawStrategies) {
    if (name !== "react" && name !== "plan-and-execute") {
      throw new UnknownStrategyError(`Estratégia desconhecida: ${name}.`);
    }
  }

  const maxRaw = flags.get("max-iterations");
  const maxIterations =
    maxRaw === undefined || maxRaw === "" ? 8 : Number(maxRaw);

  const parsed = arenaArgsSchema.safeParse({
    strategies: rawStrategies,
    maxIterations,
    input: flags.get("input") ?? "",
  });

  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join("; ");
    throw new EmptyStrategySelectionError(message);
  }

  return parsed.data;
}

export async function runArena(args: ArenaArgs): Promise<string> {
  const blocks: string[] = [];

  for (const name of args.strategies) {
    const strategy = strategiesByName[name];
    const result = await strategy.run(args.input, {
      maxIterations: args.maxIterations,
    });

    blocks.push(
      [
        `strategy=${strategy.name}`,
        formatTrace(result.trace),
        `metrics.llmCalls=${result.metrics.llmCalls}`,
        `metrics.latencyMs=${result.metrics.latencyMs}`,
      ].join("\n"),
    );
  }

  return blocks.join("\n\n---\n\n");
}

async function main(): Promise<void> {
  try {
    const args = parseArenaArgs(process.argv.slice(2));
    const output = await runArena(args);
    console.log(output);
  } catch (error: unknown) {
    if (
      error instanceof EmptyStrategySelectionError ||
      error instanceof UnknownStrategyError ||
      error instanceof MissingModelConfigError ||
      error instanceof DomainError
    ) {
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
