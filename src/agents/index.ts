import { UnknownStrategyError } from "../domain/errors.js";
import type { Critic } from "./critic.js";
import { createLlmCritic } from "./critic.js";
import { planAndExecuteStrategy } from "./plan-and-execute.js";
import { reactStrategy } from "./react.js";
import { wrapWithReflection } from "./reflection.js";
import type { ReasoningStrategy, StrategyName } from "./strategy.js";

export type ChannelStrategyName = "react" | "plan-and-execute";

export type ChannelRegistry = Record<string, ReasoningStrategy>;

export const channelStrategies: ChannelRegistry = {
  react: reactStrategy,
  "plan-and-execute": planAndExecuteStrategy,
};

const REFLECT_NAMES: Record<
  ChannelStrategyName,
  Extract<StrategyName, "reflect:react" | "reflect:plan-and-execute">
> = {
  react: "reflect:react",
  "plan-and-execute": "reflect:plan-and-execute",
};

export function resolveChannelStrategy(params: {
  strategy: string;
  reflect: boolean;
  registry?: ChannelRegistry;
  critic?: Critic;
}): ReasoningStrategy {
  const registry = params.registry ?? channelStrategies;
  const base = registry[params.strategy];

  if (!base) {
    throw new UnknownStrategyError(
      `Estratégia desconhecida: ${params.strategy}.`,
    );
  }

  if (!params.reflect) {
    return base;
  }

  if (params.strategy !== "react" && params.strategy !== "plan-and-execute") {
    throw new UnknownStrategyError(
      `Estratégia desconhecida: ${params.strategy}.`,
    );
  }

  const critic = params.critic ?? createLlmCritic();
  return wrapWithReflection({
    base,
    critic,
    name: REFLECT_NAMES[params.strategy],
  });
}
