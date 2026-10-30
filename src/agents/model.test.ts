import assert from "node:assert/strict";
import test from "node:test";

import { RunnableLambda } from "@langchain/core/runnables";

import { ModelUnavailableError } from "../domain/errors.js";
import {
  MODEL_RETRY_STOP_AFTER_ATTEMPT,
  buildFallbackEvent,
  composeResilientModel,
  flakyRunnable,
  resolveFallbackModel,
  resolveReportedModelUsed,
} from "./model.js";

test("resolveFallbackModel: absent / empty / whitespace → undefined", () => {
  assert.equal(resolveFallbackModel({}), undefined);
  assert.equal(resolveFallbackModel({ OPENROUTER_MODEL_FALLBACK: "" }), undefined);
  assert.equal(
    resolveFallbackModel({ OPENROUTER_MODEL_FALLBACK: "   " }),
    undefined,
  );
});

test("resolveFallbackModel: trims non-empty id", () => {
  assert.equal(
    resolveFallbackModel({ OPENROUTER_MODEL_FALLBACK: " openai/gpt-4o-mini " }),
    "openai/gpt-4o-mini",
  );
});

test("composeResilientModel: primary ok → reserve not called", async () => {
  let reserveCalls = 0;
  const primary = RunnableLambda.from(async (input: string) => `ok:${input}`);
  const reserve = RunnableLambda.from(async (input: string) => {
    reserveCalls += 1;
    return `reserve:${input}`;
  });

  const chain = composeResilientModel({ primary, reserve });
  const result = await chain.invoke("ping");
  assert.equal(result, "ok:ping");
  assert.equal(reserveCalls, 0);
});

test("composeResilientModel: primary always fails → reserve after retries", async () => {
  let primaryCalls = 0;
  let reserveCalls = 0;
  const primary = RunnableLambda.from(async () => {
    primaryCalls += 1;
    throw new Error("primary down");
  });
  const reserve = RunnableLambda.from(async (input: string) => {
    reserveCalls += 1;
    return `reserve:${input}`;
  });

  const chain = composeResilientModel({ primary, reserve });
  const result = await chain.invoke("ping");
  assert.equal(result, "reserve:ping");
  assert.equal(primaryCalls, MODEL_RETRY_STOP_AFTER_ATTEMPT);
  assert.equal(reserveCalls, 1);
});

test("composeResilientModel: no reserve + primary fails → error after retries", async () => {
  let primaryCalls = 0;
  const primary = RunnableLambda.from(async () => {
    primaryCalls += 1;
    throw new Error("primary down");
  });

  const chain = composeResilientModel({ primary });
  await assert.rejects(() => chain.invoke("ping"), /primary down/);
  assert.equal(primaryCalls, MODEL_RETRY_STOP_AFTER_ATTEMPT);
});

test("composeResilientModel: primary and reserve fail → error", async () => {
  const primary = flakyRunnable({ failuresBeforeSuccess: 100 });
  const reserve = flakyRunnable({ failuresBeforeSuccess: 100 });
  const chain = composeResilientModel({ primary, reserve });
  await assert.rejects(() => chain.invoke("ping"));
});

test("composeResilientModel: primary recovers within stopAfterAttempt → no reserve", async () => {
  let reserveCalls = 0;
  const primary = flakyRunnable({
    failuresBeforeSuccess: 1,
    value: "recovered",
  });
  const reserve = RunnableLambda.from(async () => {
    reserveCalls += 1;
    return "reserve";
  });

  const chain = composeResilientModel({ primary, reserve });
  const result = await chain.invoke("x");
  assert.equal(result, "recovered");
  assert.equal(reserveCalls, 0);
});

test("buildFallbackEvent shape", () => {
  assert.deepEqual(
    buildFallbackEvent({ from: "a", to: "b", node: "react" }),
    { type: "fallback", from: "a", to: "b", node: "react" },
  );
  assert.deepEqual(buildFallbackEvent({ from: "a", to: "b" }), {
    type: "fallback",
    from: "a",
    to: "b",
  });
});

test("resolveReportedModelUsed prefers observed, else primary", () => {
  assert.equal(
    resolveReportedModelUsed("openai/gpt-4o-mini", "openai/gpt-4o"),
    "openai/gpt-4o-mini",
  );
  assert.equal(
    resolveReportedModelUsed(undefined, "openai/gpt-4o"),
    "openai/gpt-4o",
  );
  assert.equal(resolveReportedModelUsed("  ", "openai/gpt-4o"), "openai/gpt-4o");
  assert.equal(
    resolveReportedModelUsed("  openai/gpt-4o-mini  ", "openai/gpt-4o"),
    "openai/gpt-4o-mini",
  );
});

test("ModelUnavailableError default message", () => {
  assert.equal(new ModelUnavailableError().message, "Modelo indisponível.");
});
