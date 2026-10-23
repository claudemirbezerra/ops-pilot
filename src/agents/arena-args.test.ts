import assert from "node:assert/strict";
import test from "node:test";

import { parseArenaArgs } from "../arena.js";
import {
  EmptyStrategySelectionError,
  InvalidMaxReflectionsError,
  UnknownStrategyError,
} from "../domain/errors.js";

test("arena recusa seleção vazia e estratégia desconhecida", () => {
  assert.throws(() => parseArenaArgs(["--strategies"]), EmptyStrategySelectionError);
  assert.throws(
    () => parseArenaArgs(["--strategies", "desconhecida"]),
    UnknownStrategyError,
  );
});

test("arena aceita estratégias válidas e teto padrão 8", () => {
  const args = parseArenaArgs([
    "--strategies",
    "react,plan-and-execute",
    "--input",
    "listar alertas",
  ]);

  assert.deepEqual(args.strategies, ["react", "plan-and-execute"]);
  assert.equal(args.maxIterations, 8);
  assert.equal(args.maxReflections, 2);
  assert.equal(args.input, "listar alertas");
});

test("arena aceita reflect:* e default max-reflections 2", () => {
  const args = parseArenaArgs([
    "--strategies",
    "reflect:react,reflect:plan-and-execute",
    "--input",
    "listar",
  ]);

  assert.deepEqual(args.strategies, ["reflect:react", "reflect:plan-and-execute"]);
  assert.equal(args.maxReflections, 2);
});

test("arena recusa reflect desconhecido e max-reflections inválido", () => {
  assert.throws(
    () => parseArenaArgs(["--strategies", "reflect:foo", "--input", "ping"]),
    (error: unknown) => {
      assert.ok(error instanceof UnknownStrategyError);
      assert.match(error.message, /reflect:foo/);
      return true;
    },
  );

  assert.throws(
    () =>
      parseArenaArgs([
        "--strategies",
        "reflect:react",
        "--max-reflections",
        "0",
        "--input",
        "ping",
      ]),
    InvalidMaxReflectionsError,
  );
});

test("arena não aceita nomes de estratégia repetidos", () => {
  assert.throws(
    () => parseArenaArgs(["--strategies", "react,react"]),
    EmptyStrategySelectionError,
  );
});
