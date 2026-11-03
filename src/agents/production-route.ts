import type { Critic } from "./critic.js";
import { createLlmCritic } from "./critic.js";
import { wrapWithReflection } from "./reflection.js";
import type {
  ProductionRoute,
  ReasoningStrategy,
  TraceEvent,
  TraceNode,
} from "./strategy.js";

export type { ProductionRoute, TraceNode };

export type ProductionRegistry = Record<string, ReasoningStrategy>;

export const PRODUCTION_ROUTES = [
  "react",
  "plan-and-execute",
  "reflection",
  "team",
] as const satisfies readonly ProductionRoute[];

export const OVERRIDE_REASON = "Estratégia informada no pedido.";

export const ROUTER_PROMPT = `Você é o roteador do OpsPilot. Escolha exatamente uma rota para o pedido do plantonista.

Tabela de rotas:

| Pedido do plantonista | Rota |
| --- | --- |
| Uma consulta ou uma ação direta (listar alertas, consultar status ou runbook, abrir ou resolver um incidente isolado, esquecer uma preferência) | react |
| Uma sequência de passos dependentes feita pelo mesmo agente (investigar e então agir em mais de uma etapa) | plan-and-execute |
| Pedido de revisão, conferência ou maior confiança antes de aceitar a resposta | reflection |
| Diagnóstico, plano e ação sobre incidentes que devem passar por papéis separados (leitura, plano sem ferramentas, execução de incidente) | team |

Responda só com uma dessas quatro rotas e um motivo em uma frase. Não invente uma quinta rota.`;

export function isProductionRoute(value: string): value is ProductionRoute {
  return (PRODUCTION_ROUTES as readonly string[]).includes(value);
}

export function stampTrace(
  events: readonly TraceEvent[],
  node: TraceNode,
): TraceEvent[] {
  return events.map((event) => ({ ...event, node }));
}

export function buildRouteEvent(params: {
  route: ProductionRoute;
  reason: string;
  override: boolean;
}): Extract<TraceEvent, { type: "route" }> {
  return {
    type: "route",
    route: params.route,
    reason: params.reason,
    override: params.override,
    node: "router",
  };
}

export type ResolveProductionStrategyParams = {
  route: ProductionRoute;
  reflect: boolean;
  registry: ProductionRegistry;
  critic?: Critic;
};

export function resolveProductionStrategy(
  params: ResolveProductionStrategyParams,
): ReasoningStrategy {
  const { route, reflect, registry } = params;

  if (route === "reflection") {
    const base = registry.react;
    if (!base) {
      throw new Error(
        "Registry de produção sem estratégia base 'react' para a rota reflection.",
      );
    }
    const critic = params.critic ?? createLlmCritic();
    return wrapWithReflection({
      base,
      critic,
      name: "reflect:react",
    });
  }

  if (route === "team") {
    const team = registry.team;
    if (!team) {
      throw new Error("Registry de produção sem estratégia base 'team'.");
    }
    return team;
  }

  const base = registry[route];
  if (!base) {
    throw new Error(
      `Registry de produção sem estratégia base '${route}'.`,
    );
  }

  if (!reflect) {
    return base;
  }

  const critic = params.critic ?? createLlmCritic();
  return wrapWithReflection({
    base,
    critic,
    name: route === "react" ? "reflect:react" : "reflect:plan-and-execute",
  });
}
