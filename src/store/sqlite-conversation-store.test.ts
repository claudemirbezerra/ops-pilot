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
