import assert from "node:assert/strict";
import test from "node:test";

import { InvalidDatabaseConfigError } from "../domain/errors.js";
import { readDatabaseConfig } from "./config.js";

test("config de banco usa o padrão local quando o ambiente está vazio", () => {
  const config = readDatabaseConfig({});

  assert.deepEqual(config, {
    host: "127.0.0.1",
    port: 3306,
    database: "opspilot",
    username: "root",
    password: "",
  });
});

test("config de banco aceita host, porta, nome, usuário e senha vazia", () => {
  const config = readDatabaseConfig({
    DB_HOST: "db.interno",
    DB_PORT: "3307",
    DB_NAME: "ops_pilot",
    DB_USER: "plantao",
    DB_PASSWORD: "",
  });

  assert.equal(config.host, "db.interno");
  assert.equal(config.port, 3307);
  assert.equal(config.database, "ops_pilot");
  assert.equal(config.username, "plantao");
  assert.equal(config.password, "");
});

test("config de banco recusa porta e nome inválidos", () => {
  assert.throws(
    () => readDatabaseConfig({ DB_PORT: "abc" }),
    InvalidDatabaseConfigError,
  );
  assert.throws(
    () => readDatabaseConfig({ DB_NAME: "ops-pilot" }),
    InvalidDatabaseConfigError,
  );
});
