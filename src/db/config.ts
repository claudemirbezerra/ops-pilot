import { z } from "zod";

import { InvalidDatabaseConfigError } from "../domain/errors.js";

const databaseConfigSchema = z.object({
  host: z.string().trim().min(1),
  port: z.coerce.number().int().min(1).max(65535),
  database: z.string().trim().regex(/^[A-Za-z0-9_]+$/),
  username: z.string().trim().min(1),
  password: z.string(),
});

export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;

export type DatabaseEnv = {
  DB_HOST?: string;
  DB_PORT?: string;
  DB_NAME?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
};

function present(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function readDatabaseConfig(env: DatabaseEnv): DatabaseConfig {
  const parsed = databaseConfigSchema.safeParse({
    host: present(env.DB_HOST, "127.0.0.1"),
    port: present(env.DB_PORT, "3306"),
    database: present(env.DB_NAME, "opspilot"),
    username: present(env.DB_USER, "root"),
    password: env.DB_PASSWORD ?? "",
  });

  if (!parsed.success) {
    throw new InvalidDatabaseConfigError(formatIssues(parsed.error.issues));
  }

  return parsed.data;
}

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.map(String).join(".") : "config";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
