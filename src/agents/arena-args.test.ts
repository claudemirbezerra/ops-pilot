import assert from "node:assert/strict";
import test from "node:test";

import { parseArenaArgs } from "../arena.js";
import {
  EmptyStrategySelectionError,
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
  assert.equal(args.input, "listar alertas");
});
