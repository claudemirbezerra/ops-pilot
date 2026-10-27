import assert from "node:assert/strict";
import test from "node:test";

import type { LearningExtractor } from "../agents/learning-extractor.js";
import type { MemoryRecord, MemoryStore } from "../domain/types.js";
import { scheduleLearning, shouldRemember } from "./learning-reflector.js";

async function flushLearning(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function stubExtractor(
  decision: { hasLearning: boolean; fact: string },
  calls: string[] = [],
): LearningExtractor {
  return {
    async extract(userMessage: string) {
      calls.push(userMessage);
      return decision;
    },
  };
}

function recordingStore(): MemoryStore & {
  remembers: { userId: string; fact: string }[];
  rememberImpl: MemoryStore["remember"];
} {
  const remembers: { userId: string; fact: string }[] = [];
  const store: MemoryStore & {
    remembers: { userId: string; fact: string }[];
    rememberImpl: MemoryStore["remember"];
  } = {
    remembers,
    rememberImpl: async (userId, fact) => {
      remembers.push({ userId, fact });
      return {
        id: `id-${remembers.length}`,
        userId,
        fact,
        createdAt: Date.now(),
      };
    },
    async remember(userId, fact) {
      return store.rememberImpl(userId, fact);
    },
    async recall() {
      return [];
    },
    forget() {
      /* no-op */
    },
  };
  return store;
}

test("shouldRemember returns null when hasLearning is false", () => {
  assert.equal(
    shouldRemember({ hasLearning: false, fact: "cluster azul" }),
    null,
  );
});

test("shouldRemember returns null for blank fact when hasLearning true", () => {
  assert.equal(shouldRemember({ hasLearning: true, fact: "" }), null);
  assert.equal(shouldRemember({ hasLearning: true, fact: "   " }), null);
});

test("shouldRemember trims durable fact", () => {
  assert.equal(
    shouldRemember({ hasLearning: true, fact: "  cluster azul  " }),
    "cluster azul",
  );
});

test("scheduleLearning remembers durable fact for userId", async () => {
  const store = recordingStore();
  scheduleLearning({
    userId: "u1",
    userMessage: "prefiro o cluster azul",
    memoryStore: store,
    extractor: stubExtractor({
      hasLearning: true,
      fact: "  Prefiro o cluster azul  ",
    }),
  });
  await flushLearning();
  assert.deepEqual(store.remembers, [
    { userId: "u1", fact: "Prefiro o cluster azul" },
  ]);
});

test("scheduleLearning skips remember when hasLearning false even with fact", async () => {
  const store = recordingStore();
  scheduleLearning({
    userId: "u1",
    userMessage: "abre um incidente",
    memoryStore: store,
    extractor: stubExtractor({
      hasLearning: false,
      fact: "não deveria gravar",
    }),
  });
  await flushLearning();
  assert.equal(store.remembers.length, 0);
});

test("scheduleLearning one-off and secret fixtures insert nothing", async () => {
  for (const decision of [
    { hasLearning: false, fact: "" },
    { hasLearning: false, fact: "sk-secret" },
  ]) {
    const store = recordingStore();
    scheduleLearning({
      userId: "u1",
      userMessage: "msg",
      memoryStore: store,
      extractor: stubExtractor(decision),
    });
    await flushLearning();
    assert.equal(store.remembers.length, 0);
  }
});

test("scheduleLearning mixed stub remembers only clean durable fact", async () => {
  const store = recordingStore();
  scheduleLearning({
    userId: "u1",
    userMessage: "abre incidente e prefiro o cluster azul",
    memoryStore: store,
    extractor: stubExtractor({
      hasLearning: true,
      fact: "Prefiro o cluster azul",
    }),
  });
  await flushLearning();
  assert.deepEqual(store.remembers, [
    { userId: "u1", fact: "Prefiro o cluster azul" },
  ]);
});

test("scheduleLearning swallows extractor errors", async () => {
  const store = recordingStore();
  const extractor: LearningExtractor = {
    async extract() {
      throw new Error("boom extract");
    },
  };
  scheduleLearning({
    userId: "u1",
    userMessage: "x",
    memoryStore: store,
    extractor,
  });
  await flushLearning();
  assert.equal(store.remembers.length, 0);
});

test("scheduleLearning does not block caller before remember resolves", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const store = recordingStore();
  store.rememberImpl = async (userId, fact) => {
    await gate;
    store.remembers.push({ userId, fact });
    return {
      id: "deferred",
      userId,
      fact,
      createdAt: 1,
    } satisfies MemoryRecord;
  };

  scheduleLearning({
    userId: "u1",
    userMessage: "prefiro azul",
    memoryStore: store,
    extractor: stubExtractor({ hasLearning: true, fact: "prefiro azul" }),
  });
  assert.equal(store.remembers.length, 0);

  release();
  await flushLearning();
  assert.equal(store.remembers.length, 1);
});

test("scheduleLearning remember rejection does not throw to caller", async () => {
  const errors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    const store = recordingStore();
    store.rememberImpl = async () => {
      throw new Error("remember failed");
    };
    scheduleLearning({
      userId: "u1",
      userMessage: "prefiro azul",
      memoryStore: store,
      extractor: stubExtractor({ hasLearning: true, fact: "prefiro azul" }),
    });
    await flushLearning();
    assert.ok(
      errors.some(
        (entry) =>
          Array.isArray(entry) &&
          entry[0] === "[learning-reflector]",
      ),
    );
  } finally {
    console.error = original;
  }
});
