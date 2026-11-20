#!/usr/bin/env node
// One-time baseline (ADR 0009): records every file in server/db/migrations/ as applied in
// dbmate's `schema_migrations` without running it, so the deploy only runs migrations added
// later.
//
//   DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_DATABASE=... \
//     node scripts/baseline-db.mjs
//
// Refuses (exit 1, nothing written) when dbmate already reports an applied migration, when a
// file is not a dbmate migration, or when scripts/check-prod-schema.mjs finds that the
// target's schema differs from server/db/schema.sql. Only then does it let dbmate apply an
// empty migration under each file's name, which creates the table and records each version.
// The user needs SELECT/SHOW VIEW/TRIGGER (for the check) plus CREATE and INSERT on the
// database (for the table). Connection env as scripts/check-prod-schema.mjs.

import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DBMATE_IMAGE, checkMigrationFiles, run, writeBaselineStubs } from "./check-db-migrations.mjs";
import { checkProdSchema, clientContainer, targetFromEnv } from "./check-prod-schema.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS = join(REPO, "server/db/migrations");

/** Runs scripts/dbmate.sh <args> against the target with the migrations in `dir`. */
export function dbmateCommand(target, args, dir = MIGRATIONS) {
  const { args: dockerArgs, env } = clientContainer(target, {
    image: DBMATE_IMAGE,
    entrypoint: "sh",
    volumes: [`${join(REPO, "scripts")}:/scripts:ro`, `${dir}:/migrations:ro`],
    env: {
      DB_HOST: target.host,
      DB_PORT: String(target.port),
      DB_USER: target.user,
      DB_PASSWORD: target.password,
      DB_DATABASE: target.database,
    },
  });
  return run("docker", [...dockerArgs, "/scripts/dbmate.sh", ...args], { env, allowFail: true });
}

/** The `Applied: N` count from `dbmate status`, or null when the output has none. */
export function appliedCount(statusOutput) {
  const match = /^Applied: (\d+)$/m.exec(statusOutput);
  return match ? Number(match[1]) : null;
}

/** Records `names` as applied without running them. Returns the dbmate result. */
export function recordBaseline(target, names) {
  const dir = mkdtempSync(join(tmpdir(), "dbmate-baseline-"));
  try {
    writeBaselineStubs(dir, names);
    return dbmateCommand(target, ["migrate", "--strict"], dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const target = targetFromEnv();
  const names = readdirSync(MIGRATIONS).filter((name) => name.endsWith(".sql")).sort();
  const invalid = checkMigrationFiles({ added: [], existing: names });
  if (names.length === 0 || invalid.length > 0) {
    console.error(`ERROR: server/db/migrations has no valid dbmate migrations:\n${invalid.join("\n")}`);
    return 1;
  }

  const status = dbmateCommand(target, ["status"]);
  const applied = appliedCount(status.stdout);
  if (status.status !== 0 || applied === null) {
    console.error(`ERROR: dbmate status failed:\n${status.stderr.trim()}`);
    return 1;
  }
  if (applied > 0) {
    console.error(`ERROR: dbmate already reports ${applied} applied migration(s); the baseline runs once.\n${status.stdout}`);
    return 1;
  }

  const { equal, diff } = checkProdSchema(target);
  if (!equal) {
    console.error(`ERROR: the schema differs from server/db/schema.sql; nothing recorded. Diff (- target, + schema.sql):\n${diff}`);
    return 1;
  }
  console.log("Schema matches server/db/schema.sql; recording the baseline.");

  const baseline = recordBaseline(target, names);
  if (baseline.status !== 0) {
    console.error(`ERROR: baseline failed:\n${baseline.stderr.trim()}`);
    return 1;
  }
  const after = dbmateCommand(target, ["status"]);
  process.stdout.write(after.stdout);
  if (appliedCount(after.stdout) !== names.length) {
    console.error("ERROR: dbmate status does not list every migration as applied after the baseline.");
    return 1;
  }
  console.log("Recorded every migration as applied, without running it.");
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
