#!/usr/bin/env node
// Read-only production schema check (ADR 0009). Before the migration runner takes over,
// production must already have exactly the schema server/db/schema.sql builds:
//
//   DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... DB_DATABASE=... \
//     node scripts/check-prod-schema.mjs
//
// 1. dumps the target's schema with `mysqldump --no-data --single-transaction` (one
//    consistent read; no LOCK TABLES, no FLUSH; reads only, so a read-only user works);
// 2. loads server/db/schema.sql (the working tree) into a throwaway mysql:8.0 container;
// 3. normalises both dumps (AUTO_INCREMENT counters, definers, index order) and diffs them.
// Exit 0 only when they are equal; 1 when they differ; 2 on an error.
//
// mysqldump runs in a mysql:8.0 container with host.docker.internal mapped to the host,
// so a target on the host (an SSH tunnel, the dev or E2E MySQL) is DB_HOST=host.docker.internal.
// DB_DOCKER_NETWORK joins a Docker network instead (e.g. to reach a MySQL container by name).
// The password reaches mysqldump through MYSQL_PWD, never on a command line.
// `schema_migrations` (dbmate's tracking table) is left out of the comparison.
// Steps and the read-only grants: docs/deployment.md "Turning on automatic migrations".

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MySql, TRACKING_TABLE, diffText, normalizeDump, run } from "./check-db-migrations.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = join(REPO, "server/db/schema.sql");
const MYSQL_IMAGE = "mysql:8.0";
// Same on both sides. --events is left out: it needs the EVENT privilege and the schema has none.
const DUMP_FLAGS = ["--routines", "--triggers", "--column-statistics=0", "--set-gtid-purged=OFF"];
const THROWAWAY_DB = "prod_schema_check";

const INDEX_LINE = /^\s+(?:UNIQUE |FULLTEXT |SPATIAL )?KEY /;

/**
 * Sorts each table's secondary index lines. SHOW CREATE TABLE lists indexes in creation
 * order, so a migration that adds an index lists it last while schema.sql may list it
 * elsewhere; the order has no effect on the schema.
 */
export function normalizeIndexOrder(dump) {
  const lines = dump.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; ) {
    if (!INDEX_LINE.test(lines[i])) {
      out.push(lines[i++]);
      continue;
    }
    const run = [];
    while (i < lines.length && INDEX_LINE.test(lines[i])) run.push(lines[i++]);
    const lastHadComma = run[run.length - 1].endsWith(",");
    const sorted = run.map((line) => line.replace(/,$/, "")).sort();
    sorted.forEach((line, k) => out.push(k < sorted.length - 1 || lastHadComma ? `${line},` : line));
  }
  return out.join("\n");
}

const normalize = (dump) => normalizeIndexOrder(normalizeDump(dump));

/** Connection settings from env; throws when one is missing. */
export function targetFromEnv(env = process.env) {
  const missing = ["DB_HOST", "DB_USER", "DB_DATABASE"].filter((key) => !env[key]);
  if (missing.length) throw new Error(`${missing.join(", ")} not set`);
  if (!/^[\w$-]+$/.test(env.DB_DATABASE)) throw new Error("DB_DATABASE has unexpected characters");
  return {
    host: env.DB_HOST,
    port: env.DB_PORT || "3306",
    user: env.DB_USER,
    password: env.DB_PASSWORD ?? "",
    database: env.DB_DATABASE,
    network: env.DB_DOCKER_NETWORK || "",
  };
}

/**
 * `docker run` arguments for a container (mysql:8.0 unless `image`) that reaches the target.
 * Secrets go in `env` (passed by name with -e), never in the arguments.
 */
export function clientContainer(target, { volumes = [], env = {}, image = MYSQL_IMAGE, entrypoint } = {}) {
  const args = ["run", "--rm", "-i"];
  // A container's network namespace (tests) already has its hosts; Docker rejects --add-host there
  if (!target.network.startsWith("container:")) args.push("--add-host=host.docker.internal:host-gateway");
  if (target.network) args.push("--network", target.network);
  for (const volume of volumes) args.push("-v", volume);
  for (const key of Object.keys(env)) args.push("-e", key);
  if (entrypoint) args.push("--entrypoint", entrypoint);
  args.push(image);
  return { args, env: { ...process.env, ...env } };
}

/** The target's schema: one consistent snapshot, no locks, no data. */
export function dumpTarget(target) {
  const { args, env } = clientContainer(target, { env: { MYSQL_PWD: target.password } });
  const res = run(
    "docker",
    [
      ...args,
      "mysqldump", "--protocol=TCP", "-h", target.host, "-P", String(target.port), "-u", target.user,
      "--single-transaction", "--skip-lock-tables", "--no-data", "--skip-comments", "--skip-dump-date",
      "--no-tablespaces", ...DUMP_FLAGS, `--ignore-table=${target.database}.${TRACKING_TABLE}`, target.database,
    ],
    { env, allowFail: true },
  );
  if (res.status !== 0) throw new Error(`mysqldump of ${target.database}@${target.host} failed:\n${res.stderr.trim()}`);
  return res.stdout;
}

/** The schema server/db/schema.sql builds, dumped from a throwaway MySQL 8.0. */
export function dumpSchemaSql() {
  const mysql = new MySql();
  try {
    mysql.start();
    mysql.resetDatabase(THROWAWAY_DB);
    const error = mysql.apply(THROWAWAY_DB, readFileSync(SCHEMA, "utf8"));
    if (error) throw new Error(`server/db/schema.sql failed to load:\n${error}`);
    return mysql.dump(THROWAWAY_DB, DUMP_FLAGS);
  } finally {
    mysql.stop();
  }
}

/** { equal, diff }: the target's schema against schema.sql. Never writes to the target. */
export function checkProdSchema(target) {
  console.log(`Dumping the schema of ${target.database} at ${target.host}:${target.port} as ${target.user} (mysqldump --no-data, reads only)`);
  const actual = normalize(dumpTarget(target));
  if (!/CREATE TABLE/.test(actual)) throw new Error(`the dump of ${target.database} has no tables; wrong database?`);
  console.log("Building server/db/schema.sql in a throwaway MySQL 8.0");
  const expected = normalize(dumpSchemaSql());
  const diff = diffText(actual, expected, [`${target.database} (target)`, "server/db/schema.sql"]);
  return { equal: diff === "", diff };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { equal, diff } = checkProdSchema(targetFromEnv());
    if (equal) {
      console.log("Schema matches server/db/schema.sql.");
      process.exitCode = 0;
    } else {
      console.log(`Schema differs from server/db/schema.sql (- target, + schema.sql):\n${diff}`);
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 2;
  }
}
