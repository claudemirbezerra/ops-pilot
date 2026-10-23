import {
  resolveChannelStrategy,
  type ChannelRegistry,
} from "../agents/index.js";
import type { Critic } from "../agents/critic.js";
import type { StrategyResult } from "../agents/strategy.js";
import { ChatTimeoutError } from "../domain/errors.js";

export type RunChatInput = {
  message: string;
  strategy?: string;
  reflect?: boolean;
  registry?: ChannelRegistry;
  critic?: Critic;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_MAX_ITERATIONS = 8;
const DEFAULT_MAX_REFLECTIONS = 2;

export async function runChat(input: RunChatInput): Promise<StrategyResult> {
  const strategyName = input.strategy === undefined ? "react" : input.strategy;
  const reflect = input.reflect === true;
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const strategy = resolveChannelStrategy({
    strategy: strategyName,
    reflect,
    registry: input.registry,
    critic: input.critic,
  });

  const runPromise = strategy.run(input.message, {
    maxIterations: DEFAULT_MAX_ITERATIONS,
    maxReflections: DEFAULT_MAX_REFLECTIONS,
  });

  // Avoid unhandled rejection if the timer wins and the strategy settles later.
  void runPromise.catch(() => undefined);

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      runPromise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new ChatTimeoutError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
