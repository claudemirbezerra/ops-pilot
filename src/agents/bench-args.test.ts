import assert from "node:assert/strict";
import test from "node:test";

import {
  formatBenchTable,
  parseBenchArgs,
  type BenchRow,
} from "../bench.js";
import { EmptyStrategySelectionError } from "../domain/errors.js";

test("bench parse: cenários padrão e --no-replanner", () => {
  const all = parseBenchArgs([]);
  assert.deepEqual(all.scenarios, ["C1", "C2", "C3"]);
  assert.equal(all.noReplanner, false);

  const one = parseBenchArgs(["--scenario", "C2", "--no-replanner"]);
  assert.deepEqual(one.scenarios, ["C2"]);
  assert.equal(one.noReplanner, true);
});

test("bench parse: cenário desconhecido", () => {
  assert.throws(
    () => parseBenchArgs(["--scenario", "C9"]),
    EmptyStrategySelectionError,
  );
});

test("bench table headers batem com o contrato pedido", () => {
  const rows: BenchRow[] = [
    {
      cenário: "C1",
      estratégia: "react",
      acerto: true,
      llCalls: 3,
      latenchMs: 120,
    },
  ];
  const text = formatBenchTable(rows);
  assert.match(text, /^cenário\s+estratégia\s+acerto\s+llCalls\s+latenchMs/m);
  assert.match(text, /C1\s+react\s+sim\s+3\s+120/);
});
