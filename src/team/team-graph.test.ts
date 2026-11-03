import assert from "node:assert/strict";
import test from "node:test";

import { describePendingApproval } from "../agents/approval-gate.js";
import type { TeamNext } from "../agents/strategy.js";
import {
  InvalidTeamDecisionError,
  InvalidTeamRoleError,
} from "../domain/errors.js";
import type { Blackboard } from "./board.js";
import { ceilingAnswer } from "./policy.js";
import {
  runTeamGraph,
  type TeamRole,
  type TeamSupervisor,
} from "./team-graph.js";

const costs = { llmCalls: 1, promptTokens: 2 };

function copyBoard(board: Blackboard): Blackboard {
  return {
    request: board.request,
    findings: board.findings,
    plan: [...board.plan],
    incident: board.incident,
  };
}

function scriptedSupervisor(
  decisions: Array<{ next: TeamNext; brief: string }>,
  seen: Array<{ prompt: string; blackboard: Blackboard }> = [],
): TeamSupervisor & { calls: number } {
  const supervisor = {
    calls: 0,
    async decide(input: { prompt: string; blackboard: Blackboard }) {
      supervisor.calls += 1;
      seen.push({ prompt: input.prompt, blackboard: copyBoard(input.blackboard) });
      const decision = decisions[supervisor.calls - 1];
      if (!decision) {
        throw new Error(`supervisor chamado ${supervisor.calls} vezes`);
      }
      return { ...decision, ...costs };
    },
  };
  return supervisor;
}

function assertNoNextAsk(input: object): void {
  assert.equal(Object.hasOwn(input, "next"), false);
}

function idle(name: string, runs: string[]): TeamRole {
  return {
    async run(input) {
      assertNoNextAsk(input);
      runs.push(name);
      if (name === "analista") {
        return { findings: "fato" };
      }
      if (name === "planejador") {
        return { steps: ["passo"] };
      }
      return { incident: "nota" };
    },
  };
}

test("supervisor conduz analista, planejador e encerrar sobre o quadro", async () => {
  const runs: string[] = [];
  const seen: Array<{ prompt: string; blackboard: Blackboard }> = [];
  const planejadorBoards: Blackboard[] = [];
  const supervisor = scriptedSupervisor(
    [
      { next: "analista", brief: "Ler alertas" },
      { next: "planejador", brief: "Montar plano" },
      { next: "encerrar", brief: "Resposta ao plantonista" },
    ],
    seen,
  );

  const result = await runTeamGraph({
    prompt: "prompt montado",
    requestMessage: "pedido cru",
    supervisor,
    roles: {
      analista: {
        async run(input) {
          assertNoNextAsk(input);
          runs.push("analista");
          return { findings: "alerta firing" };
        },
      },
      planejador: {
        async run(input) {
          assertNoNextAsk(input);
          runs.push("planejador");
          planejadorBoards.push(copyBoard(input.blackboard));
          return { steps: ["Só o plano"], next: "executor" } as {
            steps: string[];
          };
        },
      },
      executor: idle("executor", runs),
    },
  });

  assert.deepEqual(runs, ["analista", "planejador"]);
  assert.equal(supervisor.calls, 3);
  assert.equal(seen[0]?.prompt, "prompt montado");
  assert.equal(planejadorBoards[0]?.request, "pedido cru");
  assert.equal(planejadorBoards[0]?.findings, "alerta firing");
  assert.deepEqual(planejadorBoards[0]?.plan, []);
  assert.equal(seen[2]?.blackboard.findings, "alerta firing");
  assert.deepEqual(seen[2]?.blackboard.plan, ["Só o plano"]);
  assert.equal(result.answer, "Resposta ao plantonista");

  const handoffs = result.trace.filter((event) => event.type === "handoff");
  assert.deepEqual(handoffs, [
    { type: "handoff", next: "analista", brief: "Ler alertas", node: "team" },
    {
      type: "handoff",
      next: "planejador",
      brief: "Montar plano",
      node: "team",
    },
    {
      type: "handoff",
      next: "encerrar",
      brief: "Resposta ao plantonista",
      node: "team",
    },
  ]);

  const analistaAt = result.trace.findIndex(
    (event) => event.type === "handoff" && event.next === "analista",
  );
  const observationAt = result.trace.findIndex(
    (event) => event.type === "observation",
  );
  const planHandoffAt = result.trace.findIndex(
    (event) => event.type === "handoff" && event.next === "planejador",
  );
  const planAt = result.trace.findIndex((event) => event.type === "plan");
  assert.ok(analistaAt >= 0 && observationAt > analistaAt);
  assert.ok(planHandoffAt > observationAt);
  assert.ok(planAt > planHandoffAt);
  assert.equal(
    result.trace[observationAt]?.type === "observation" &&
      result.trace[observationAt].content,
    "alerta firing",
  );
  assert.deepEqual(
    result.trace[planAt]?.type === "plan" ? result.trace[planAt].steps : [],
    ["Só o plano"],
  );
});

test("encerrar na primeira decisão não chama papel", async () => {
  const runs: string[] = [];
  const result = await runTeamGraph({
    prompt: "prompt",
    requestMessage: "pedido",
    supervisor: scriptedSupervisor([{ next: "encerrar", brief: "já era" }]),
    roles: {
      analista: idle("analista", runs),
      planejador: idle("planejador", runs),
      executor: idle("executor", runs),
    },
  });

  assert.deepEqual(runs, []);
  assert.equal(result.answer, "já era");
  assert.deepEqual(result.trace, [
    { type: "handoff", next: "encerrar", brief: "já era", node: "team" },
  ]);
});

test("brief só com espaços não gera handoff", async () => {
  const runs: string[] = [];
  await assert.rejects(
    () =>
      runTeamGraph({
        prompt: "prompt",
        supervisor: {
          async decide() {
            return { next: "analista", brief: "   ", ...costs };
          },
        },
        roles: {
          analista: idle("analista", runs),
          planejador: idle("planejador", runs),
          executor: idle("executor", runs),
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof InvalidTeamDecisionError);
      assert.equal(error.message, "Não foi possível decidir o próximo papel.");
      return true;
    },
  );
  assert.deepEqual(runs, []);
});

test("executor com aprovação encerra o grafo sem observação de sucesso", async () => {
  const supervisor = scriptedSupervisor([
    { next: "executor", brief: "Abrir o incidente do checkout." },
    { next: "encerrar", brief: "não devia chegar" },
  ]);
  const args = { title: "Checkout", service: "checkout", severity: "sev1" };
  let invoked = false;

  const result = await runTeamGraph({
    prompt: "prompt",
    requestMessage: "pedido",
    supervisor,
    roles: {
      analista: idle("analista", []),
      planejador: idle("planejador", []),
      executor: {
        async run(input) {
          assertNoNextAsk(input);
          return {
            pendingApproval: {
              tool: "open_incident",
              args,
              description: "placeholder",
            },
          };
        },
        async invokeTool() {
          invoked = true;
          return "gravou";
        },
      },
    },
  });

  assert.equal(invoked, false);
  assert.equal(supervisor.calls, 1);
  assert.equal(result.pendingApproval?.tool, "open_incident");
  assert.deepEqual(result.pendingApproval?.args, args);
  assert.equal(
    result.pendingApproval?.description,
    describePendingApproval("open_incident", args),
  );
  assert.deepEqual(result.trace, [
    {
      type: "handoff",
      next: "executor",
      brief: "Abrir o incidente do checkout.",
      node: "team",
    },
    { type: "action", tool: "open_incident", args, node: "team" },
  ]);
  assert.equal(
    result.trace.some((event) => event.type === "observation"),
    false,
  );
});

test("ferramenta fora da allowlist não é invocada", async () => {
  let invoked = false;
  const result = await runTeamGraph({
    prompt: "prompt",
    supervisor: scriptedSupervisor([
      { next: "analista", brief: "ler" },
      { next: "encerrar", brief: "fim" },
    ]),
    roles: {
      analista: {
        async run() {
          return {
            toolCalls: [{ name: "forget_preference", args: { description: "x" } }],
          };
        },
        async invokeTool() {
          invoked = true;
          return "chamou";
        },
      },
      planejador: idle("planejador", []),
      executor: idle("executor", []),
    },
  });

  assert.equal(invoked, false);
  assert.ok(
    result.trace.some(
      (event) =>
        event.type === "observation" &&
        event.content === "Ferramenta indisponível para este papel.",
    ),
  );
});

test("planejador publica o plano no quadro e no rastro", async () => {
  const seen: Array<{ prompt: string; blackboard: Blackboard }> = [];
  const steps = ["Ler alertas", "Abrir incidente"];
  const result = await runTeamGraph({
    prompt: "prompt",
    requestMessage: "pedido",
    supervisor: scriptedSupervisor(
      [
        { next: "planejador", brief: "planeje" },
        { next: "encerrar", brief: "feito" },
      ],
      seen,
    ),
    roles: {
      analista: idle("analista", []),
      planejador: {
        async run(input) {
          assertNoNextAsk(input);
          return { steps };
        },
      },
      executor: idle("executor", []),
    },
  });

  assert.deepEqual(seen[1]?.blackboard.plan, steps);
  const handoffAt = result.trace.findIndex(
    (event) => event.type === "handoff" && event.next === "planejador",
  );
  const planAt = result.trace.findIndex((event) => event.type === "plan");
  assert.ok(planAt > handoffAt);
  assert.deepEqual(
    result.trace[planAt]?.type === "plan" ? result.trace[planAt].steps : [],
    steps,
  );
  assert.equal(result.trace[planAt]?.node, "team");
});

test("plano vazio ou passo em branco rejeita o papel", async () => {
  for (const steps of [[], ["ok", "  "]] as string[][]) {
    const supervisor = scriptedSupervisor([
      { next: "planejador", brief: "planeje" },
      { next: "encerrar", brief: "não devia" },
    ]);
    await assert.rejects(
      () =>
        runTeamGraph({
          prompt: "prompt",
          supervisor,
          roles: {
            analista: idle("analista", []),
            planejador: {
              async run() {
                return { steps };
              },
            },
            executor: idle("executor", []),
          },
        }),
      (error: unknown) => {
        assert.ok(error instanceof InvalidTeamRoleError);
        assert.equal(error.message, "Não foi possível cumprir o papel.");
        return true;
      },
    );
    assert.equal(supervisor.calls, 1);
  }
});

test("open_incident pedido pelo executor não chama a ferramenta", async () => {
  const supervisor = scriptedSupervisor([
    { next: "executor", brief: "abra" },
    { next: "encerrar", brief: "não devia" },
  ]);
  const args = { title: "Checkout", service: "checkout", severity: "high" };
  let invoked = false;
  const result = await runTeamGraph({
    prompt: "prompt",
    supervisor,
    roles: {
      analista: idle("analista", []),
      planejador: idle("planejador", []),
      executor: {
        async run() {
          return {
            incident: "não gravar",
            toolCalls: [{ name: "open_incident", args }],
          };
        },
        async invokeTool() {
          invoked = true;
          return "gravou";
        },
      },
    },
  });

  assert.equal(invoked, false);
  assert.equal(supervisor.calls, 1);
  assert.equal(result.pendingApproval?.tool, "open_incident");
  assert.equal(
    result.trace.some((event) => event.type === "observation"),
    false,
  );
});

test("oito papéis sem encerrar batem no teto e não há nona decisão", async () => {
  const decisions = Array.from({ length: 8 }, (_, index) => ({
    next: "analista" as const,
    brief: `vez ${index + 1}`,
  }));
  const supervisor = scriptedSupervisor(decisions);
  let roleRuns = 0;
  const result = await runTeamGraph({
    prompt: "prompt",
    supervisor,
    roles: {
      analista: {
        async run() {
          roleRuns += 1;
          return { findings: `fato ${roleRuns}` };
        },
      },
      planejador: idle("planejador", []),
      executor: idle("executor", []),
    },
  });

  assert.equal(roleRuns, 8);
  assert.equal(supervisor.calls, 8);
  assert.equal(result.answer, ceilingAnswer());
  assert.equal(
    result.trace.filter((event) => event.type === "handoff").length,
    8,
  );
});

test("oitava decisão encerrar devolve o brief e não o teto", async () => {
  const decisions = [
    ...Array.from({ length: 7 }, (_, index) => ({
      next: "analista" as const,
      brief: `vez ${index + 1}`,
    })),
    { next: "encerrar" as const, brief: "fim da oitava" },
  ];
  const supervisor = scriptedSupervisor(decisions);
  let roleRuns = 0;
  const result = await runTeamGraph({
    prompt: "prompt",
    supervisor,
    roles: {
      analista: {
        async run() {
          roleRuns += 1;
          return { findings: "fato" };
        },
      },
      planejador: idle("planejador", []),
      executor: idle("executor", []),
    },
  });

  assert.equal(supervisor.calls, 8);
  assert.equal(roleRuns, 7);
  assert.equal(result.answer, "fim da oitava");
});
