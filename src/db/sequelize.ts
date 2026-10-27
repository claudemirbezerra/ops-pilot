import { Sequelize } from "sequelize";

import type { DatabaseConfig } from "./config.js";

const commonOptions = {
  dialect: "mysql",
  logging: false,
  define: {
    charset: "utf8mb4",
    collate: "utf8mb4_unicode_ci",
  },
} as const;

export function createAdminSequelize(config: DatabaseConfig): Sequelize {
  return new Sequelize({
    ...commonOptions,
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
  });
}

export function createSequelize(config: DatabaseConfig): Sequelize {
  return new Sequelize({
    ...commonOptions,
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
  });
}

export async function ensureDatabase(config: DatabaseConfig): Promise<void> {
  const admin = createAdminSequelize(config);
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await admin.close();
  }
}
