import assert from "node:assert/strict";
import test from "node:test";

import {
  ConversationNotFoundError,
  InvalidConversationMessageError,
} from "../domain/errors.js";
import type { ConversationRole } from "../domain/types.js";
import { SqliteConversationStore } from "./sqlite-conversation-store.js";

function memoryStore(): SqliteConversationStore {
  return new SqliteConversationStore(":memory:");
}

test("create devolve id e a conversa nasce vazia", () => {
  const store = memoryStore();
  const id = store.create();
  assert.equal(typeof id, "string");
  assert.ok(id.length > 0);
  assert.deepEqual(store.lastMessages(id, 12), []);
});

test("dois create devolvem ids diferentes", () => {
  const store = memoryStore();
  assert.notEqual(store.create(), store.create());
});

test("append preserva o texto e lastMessages volta em ordem cronológica", () => {
  const store = memoryStore();
  const id = store.create();
  store.append(id, { role: "user", content: "  oi  " });
  store.append(id, { role: "assistant", content: "olá" });
  assert.deepEqual(store.lastMessages(id, 12), [
    { role: "user", content: "  oi  " },
    { role: "assistant", content: "olá" },
  ]);
});

test("lastMessages respeita o limite e devolve as mais recentes", () => {
  const store = memoryStore();
  const id = store.create();
  for (let index = 0; index < 4; index += 1) {
    store.append(id, {
      role: index % 2 === 0 ? "user" : "assistant",
      content: `m${index}`,
    });
  }
  assert.deepEqual(store.lastMessages(id, 2), [
    { role: "user", content: "m2" },
    { role: "assistant", content: "m3" },
  ]);
});

test("conversas não misturam mensagens", () => {
  const store = memoryStore();
  const first = store.create();
  const second = store.create();
  store.append(first, { role: "user", content: "só na primeira" });
  store.append(second, { role: "assistant", content: "só na segunda" });
  assert.deepEqual(store.lastMessages(first, 12), [
    { role: "user", content: "só na primeira" },
  ]);
  assert.deepEqual(store.lastMessages(second, 12), [
    { role: "assistant", content: "só na segunda" },
  ]);
});

test("id ausente não insere mensagem", () => {
  const store = memoryStore();
  assert.throws(
    () => store.append("ausente", { role: "user", content: "oi" }),
    ConversationNotFoundError,
  );
  assert.throws(
    () => store.lastMessages("ausente", 12),
    ConversationNotFoundError,
  );
  const created = store.create();
  assert.deepEqual(store.lastMessages(created, 12), []);
});

test("texto em branco ou falante inválido não insere", () => {
  const store = memoryStore();
  const id = store.create();
  assert.throws(
    () => store.append(id, { role: "user", content: "" }),
    InvalidConversationMessageError,
  );
  assert.throws(
    () => store.append(id, { role: "user", content: "   " }),
    InvalidConversationMessageError,
  );
  assert.throws(
    () =>
      store.append(id, {
        role: "plantonista" as ConversationRole,
        content: "oi",
      }),
    InvalidConversationMessageError,
  );
  assert.deepEqual(store.lastMessages(id, 12), []);
});

test("limite que não é inteiro maior ou igual a 1 é rejeitado", () => {
  const store = memoryStore();
  const id = store.create();
  assert.throws(
    () => store.lastMessages(id, 0),
    InvalidConversationMessageError,
  );
  assert.throws(
    () => store.lastMessages(id, -1),
    InvalidConversationMessageError,
  );
  assert.throws(
    () => store.lastMessages(id, 1.5),
    InvalidConversationMessageError,
  );
});

test("CHECK rejeita role fora de user e assistant", () => {
  const store = memoryStore();
  const id = store.create();
  assert.throws(() => {
    store.database
      .prepare(
        `INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)`,
      )
      .run(id, "plantonista", "oi", Date.now());
  });
});

test("getSummary é null até upsert; upsert substitui e isola conversas", () => {
  const store = memoryStore();
  const first = store.create();
  const second = store.create();
  assert.equal(store.getSummary(first), null);

  store.append(first, { role: "user", content: "a" });
  store.append(first, { role: "assistant", content: "b" });
  const messages = store.lastMessages(first, 10);
  assert.equal(messages.length, 2);

  store.upsertSummary(first, "resumo-1", 2);
  assert.deepEqual(store.getSummary(first), {
    text: "resumo-1",
    coveredThroughId: 2,
  });
  assert.equal(store.getSummary(second), null);

  store.upsertSummary(first, "resumo-2", 2);
  assert.equal(store.getSummary(first)?.text, "resumo-2");

  assert.throws(
    () => store.upsertSummary(first, "   ", 2),
    InvalidConversationMessageError,
  );
  assert.throws(
    () => store.getSummary("ausente"),
    ConversationNotFoundError,
  );
});

test("listUnsummarizedOutsideWindow devolve só egressos além do cursor e fora da janela", () => {
  const store = memoryStore();
  const id = store.create();
  for (let index = 0; index < 12; index += 1) {
    store.append(id, {
      role: index % 2 === 0 ? "user" : "assistant",
      content: `m${index}`,
    });
  }

  const pending = store.listUnsummarizedOutsideWindow(id, 8, 0);
  assert.equal(pending.length, 4);
  assert.equal(pending[0]?.content, "m0");
  assert.equal(pending.at(-1)?.content, "m3");

  const afterCover = store.listUnsummarizedOutsideWindow(id, 8, 2);
  assert.equal(afterCover[0]?.content, "m2");
  assert.deepEqual(store.listUnsummarizedOutsideWindow(id, 8, 12), []);
});
