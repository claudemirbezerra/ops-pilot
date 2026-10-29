import assert from "node:assert/strict";
import test from "node:test";

import type { TraceEvent } from "./strategy.js";
import { formatTrace } from "./trace.js";

const fixture: TraceEvent[] = [
  { type: "thought", content: "Vou listar os alertas em disparo." },
  {
    type: "action",
    tool: "list_alertas",
    args: { status: "firing" },
  },
  { type: "observation", content: '[{"title":"Taxa de erro 5xx no checkout"}]' },
  {
    type: "plan",
    steps: ["Listar alertas firing", "Abrir incidente no checkout"],
  },
  { type: "critique", content: "Falta abrir o incidente." },
  { type: "answer", content: "Há 3 alertas em disparo." },
  {
    type: "route",
    route: "react",
    reason: "consulta direta",
    override: false,
    node: "router",
  },
];

test("formatTrace é determinístico e inclui tool e args na ação", () => {
  const first = formatTrace(fixture);
  const second = formatTrace(fixture);

  assert.equal(first, second);
  assert.match(first, /\[action\]/);
  assert.match(first, /tool=list_alertas/);
  assert.match(first, /args=\{"status":"firing"\}/);
  assert.match(first, /\[thought\]/);
  assert.match(first, /\[observation\]/);
  assert.match(first, /\[plan\]/);
  assert.match(first, /\[critique\]/);
  assert.match(first, /\[answer\]/);
  assert.match(first, /\[route\]/);
  assert.match(first, /route=react/);
  assert.match(first, /override=false/);
});

test("formatTrace inclui evento fallback", () => {
  const text = formatTrace([
    {
      type: "fallback",
      from: "openai/gpt-4o",
      to: "openai/gpt-4o-mini",
      node: "react",
    },
  ]);
  assert.match(text, /\[fallback\]/);
  assert.match(text, /from=openai\/gpt-4o/);
  assert.match(text, /to=openai\/gpt-4o-mini/);
});
