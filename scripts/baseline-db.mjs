#!/usr/bin/env node
// One-time baseline (ADR 0009): records every file in server/db/migrations/ as applied in
// `schema_migrations` without running it, so the deploy only runs migrations added later.
//
//   DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_DATABASE=... \
//     node scripts/baseline-db.mjs
//
// Refuses (exit 1, nothing written) when `schema_migrations` already has rows, or when
// scripts/check-prod-schema.mjs finds that the target's schema differs from
// server/db/schema.sql. Only then does it run `scripts/db-migrate.sh baseline`, which
// creates the table and inserts the rows in one transaction.
// The user needs SELECT/SHOW VIEW/TRIGGER (for the check) plus CREATE and INSERT on the
// database (for the table). Connection env as scripts/check-prod-schema.mjs.

import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { run } from "./check-db-migrations.mjs";
import { checkProdSchema, clientContainer, targetFromEnv } from "./check-prod-schema.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Runs scripts/db-migrate.sh <command> against the target in a mysql:8.0 container. */
export function migrateCommand(target, command) {
  const { args, env } = clientContainer(target, {
    volumes: [`${join(REPO, "scripts")}:/scripts:ro`, `${join(REPO, "server/db/migrations")}:/migrations:ro`],
    env: {
      DB_HOST: target.host,
      DB_PORT: String(target.port),
      DB_USER: target.user,
      DB_PASSWORD: target.password,
      DB_DATABASE: target.database,
    },
  });
  return run("docker", [...args, "sh", "/scripts/db-migrate.sh", command], { env, allowFail: true });
}

function main() {
  const target = targetFromEnv();

  const status = migrateCommand(target, "status");
  if (status.status === 0) {
    console.error(`ERROR: schema_migrations already has rows; the baseline runs once.\n${status.stdout}`);
    return 1;
  }
  if (status.status !== 2) {
    console.error(`ERROR: could not read schema_migrations:\n${status.stderr.trim()}`);
    return 1;
  }

  const { equal, diff } = checkProdSchema(target);
  if (!equal) {
    console.error(`ERROR: the schema differs from server/db/schema.sql; nothing recorded. Diff (- target, + schema.sql):\n${diff}`);
    return 1;
  }
  console.log("Schema matches server/db/schema.sql; recording the baseline.");

  const baseline = migrateCommand(target, "baseline");
  process.stdout.write(baseline.stdout);
  if (baseline.status !== 0) {
    console.error(`ERROR: baseline failed:\n${baseline.stderr.trim()}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
