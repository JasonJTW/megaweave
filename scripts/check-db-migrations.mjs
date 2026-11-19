#!/usr/bin/env node
// DB migration check (ADR 0009), run by .github/workflows/db-migrations.yml and locally:
//
//   node scripts/check-db-migrations.mjs
//
// Compares HEAD with its merge-base on BASE and, when server/db/ changed:
//   1. schema: a database built from the base server/db/schema.sql plus the migrations
//      this branch adds (filename order) must dump the same as one built from the
//      branch's schema.sql;
//   2. destructive statements (DROP, RENAME, MODIFY, CHANGE, TRUNCATE, DELETE without
//      WHERE) in added migrations, and edits to migrations already on BASE, need the
//      `migration-approved` label;
//   3. a change to schema.sql or an added migration needs the `needs-migration` label.
//
// Environment (all optional):
//   BASE_SHA            base commit or ref (default origin/main)
//   HEAD_SHA            branch commit (default HEAD)
//   PR_LABELS           JSON array of label names (default [])
//   MYSQL_CONTAINER     running MySQL 8.0 container to use; when unset a throwaway
//                       mysql:8.0 container with the E2E flags is started and removed
//   MYSQL_ROOT_PASSWORD root password of MYSQL_CONTAINER

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const LABEL_NEEDS_MIGRATION = "needs-migration";
export const LABEL_APPROVED = "migration-approved";

const DB_DIR = "server/db/";
const SCHEMA = "server/db/schema.sql";
const MIGRATIONS_DIR = "server/db/migrations/";
// Same image and flags as docker-compose.e2e.yml
const MYSQL_IMAGE = "mysql:8.0";
const MYSQL_FLAGS = ["--default-time-zone=+00:00", "--max_allowed_packet=64M"];
const DB_BASE = "migration_check_base";
const DB_HEAD = "migration_check_head";

// ---------------------------------------------------------------------------
// SQL scanning (pure; covered by scripts/check-db-migrations.test.mjs)
// ---------------------------------------------------------------------------

/** dbmate files carry both directions; only the up section runs on deploy. */
export function upSection(sql) {
  const up = /^--\s*migrate:up\b.*$/m.exec(sql);
  if (!up) return sql;
  const rest = sql.slice(up.index + up[0].length);
  const down = /^--\s*migrate:down\b/m.exec(rest);
  return down ? rest.slice(0, down.index) : rest;
}

/**
 * Splits SQL into statements without comments. Each has `text` (for messages) and
 * `masked`, where string literals and quoted identifiers are blanked so words inside
 * them (a COMMENT 'drop ...', a column named `change`) never count.
 * Executable comments (/*!80000 ... *\/) keep their body, as MySQL runs it.
 */
export function splitStatements(sql) {
  const statements = [];
  let text = "";
  let masked = "";
  let inExecutable = false;
  const flush = () => {
    const clean = (s) => s.replace(/\s+/g, " ").trim();
    if (clean(masked)) statements.push({ text: clean(text), masked: clean(masked) });
    text = "";
    masked = "";
  };
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if ((c === "-" && next === "-" && (i + 2 >= sql.length || /\s/.test(sql[i + 2]))) || c === "#") {
      while (i < sql.length && sql[i] !== "\n") i++;
    } else if (c === "/" && next === "*" && sql[i + 2] === "!") {
      i += 3;
      while (/\d/.test(sql[i] ?? "")) i++;
      inExecutable = true;
      text += " ";
      masked += " ";
    } else if (c === "*" && next === "/" && inExecutable) {
      inExecutable = false;
      i += 2;
      text += " ";
      masked += " ";
    } else if (c === "/" && next === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      text += " ";
      masked += " ";
    } else if (c === "'" || c === '"' || c === "`") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "\\" && c !== "`") j += 2;
        else if (sql[j] === c && sql[j + 1] === c) j += 2;
        else if (sql[j] === c) break;
        else j++;
      }
      text += sql.slice(i, j + 1);
      masked += c === "`" ? "`x`" : "''";
      i = j + 1;
    } else if (c === ";") {
      flush();
      i++;
    } else {
      text += c;
      masked += c;
      i++;
    }
  }
  flush();
  return statements;
}

const DESTRUCTIVE = [
  { name: "DROP", test: (s) => /\bDROP\b/i.test(s) },
  { name: "RENAME", test: (s) => /\bRENAME\b/i.test(s) },
  { name: "MODIFY", test: (s) => /\bMODIFY\b/i.test(s) },
  { name: "CHANGE", test: (s) => /\bCHANGE\b/i.test(s) },
  { name: "TRUNCATE", test: (s) => /\bTRUNCATE\b/i.test(s) },
  {
    name: "DELETE without WHERE",
    test: (s) => /^DELETE\b/i.test(s) && !/\bWHERE\b/i.test(s),
  },
];

/** Destructive statements in a migration: [{ rule, statement }]. */
export function findDestructive(sql) {
  return splitStatements(upSection(sql)).flatMap(({ text, masked }) =>
    DESTRUCTIVE.filter((rule) => rule.test(masked)).map((rule) => ({ rule: rule.name, statement: text })),
  );
}

/** Drops what differs between two identical schemas: counters and definers. */
export function normalizeDump(dump) {
  return dump
    .replace(/ AUTO_INCREMENT=\d+/g, "")
    .replace(/\/\*!50013 DEFINER=\S+ SQL SECURITY \w+ \*\/\n?/g, "")
    .replace(/ DEFINER=`[^`]*`@`[^`]*`/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

/** Classifies `git diff --name-status` lines for server/db/. */
export function classifyChanges(nameStatus) {
  const result = { touched: false, schemaChanged: false, added: [], editedExisting: [] };
  for (const line of nameStatus.split("\n").filter(Boolean)) {
    const [status, ...paths] = line.split("\t");
    const target = paths[paths.length - 1];
    if (!paths.some((p) => p.startsWith(DB_DIR))) continue;
    result.touched = true;
    if (paths.includes(SCHEMA)) result.schemaChanged = true;
    const inMigrations = paths.filter((p) => p.startsWith(MIGRATIONS_DIR));
    if (inMigrations.length === 0) continue;
    if (status === "A" && target.endsWith(".sql")) {
      result.added.push(target);
    } else if (status !== "A") {
      result.editedExisting.push(...inMigrations.filter((p) => !result.editedExisting.includes(p)));
    }
  }
  result.added.sort((a, b) => basename(a).localeCompare(basename(b)));
  return result;
}

function basename(p) {
  return p.slice(p.lastIndexOf("/") + 1);
}

export function parseLabels(json) {
  if (!json || json.trim() === "") return [];
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed) || parsed.some((l) => typeof l !== "string")) {
    throw new Error("PR_LABELS must be a JSON array of strings");
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// git and MySQL
// ---------------------------------------------------------------------------

function run(cmd, args, { input, allowFail = false } = {}) {
  const res = spawnSync(cmd, args, { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw res.error;
  if (res.status !== 0 && !allowFail) {
    throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed:\n${res.stderr.trim()}`);
  }
  return res;
}

const git = (...args) => run("git", args).stdout;

class MySql {
  constructor() {
    this.owned = !process.env.MYSQL_CONTAINER;
    this.password = this.owned ? "migration-check" : (process.env.MYSQL_ROOT_PASSWORD ?? "");
    this.container = process.env.MYSQL_CONTAINER;
  }

  start() {
    if (this.owned) {
      log(`Starting a throwaway ${MYSQL_IMAGE} container`);
      this.container = run("docker", [
        "run", "-d", "--rm",
        "-e", `MYSQL_ROOT_PASSWORD=${this.password}`,
        MYSQL_IMAGE, ...MYSQL_FLAGS,
      ]).stdout.trim();
    }
    // TCP ping: the entrypoint's init server does not listen on TCP, so this waits for the real one
    for (let attempt = 0; attempt < 90; attempt++) {
      const ping = this.exec("mysqladmin", ["ping", "-h", "127.0.0.1", "--silent"], { allowFail: true });
      if (ping.status === 0) return;
      spawnSync("sleep", ["2"]);
    }
    throw new Error("MySQL did not become ready in 180s");
  }

  stop() {
    if (this.owned && this.container) run("docker", ["rm", "-f", this.container], { allowFail: true });
  }

  exec(tool, args, opts = {}) {
    return run(
      "docker",
      ["exec", "-i", "-e", `MYSQL_PWD=${this.password}`, this.container, tool, "-uroot", ...args],
      opts,
    );
  }

  sql(statement) {
    this.exec("mysql", ["-e", statement]);
  }

  /** Runs a SQL script; returns stderr on failure instead of throwing. */
  apply(db, script) {
    const res = this.exec("mysql", ["--default-character-set=utf8mb4", db], { input: script, allowFail: true });
    return res.status === 0 ? null : res.stderr.trim();
  }

  dump(db) {
    return this.exec("mysqldump", [
      "--no-data", "--skip-comments", "--skip-dump-date", "--no-tablespaces",
      "--routines", "--events", "--triggers", db,
    ]).stdout;
  }

  resetDatabase(db) {
    this.sql(
      `DROP DATABASE IF EXISTS \`${db}\`; CREATE DATABASE \`${db}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const inActions = process.env.GITHUB_ACTIONS === "true";

function log(message) {
  console.log(message);
}

/** PR-controlled text is indented so no line of it can start a workflow command. */
function block(text) {
  return text
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

function summary(markdown) {
  if (inActions && process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function diffText(a, b) {
  const dir = mkdtempSync(join(tmpdir(), "migration-check-"));
  try {
    const left = join(dir, "migrations.sql");
    const right = join(dir, "schema.sql");
    writeFileSync(left, a);
    writeFileSync(right, b);
    const res = run(
      "diff",
      ["-u", "--label", "base schema.sql + added migrations", "--label", "branch schema.sql", left, right],
      { allowFail: true },
    );
    return res.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const baseRef = process.env.BASE_SHA || "origin/main";
  const headRef = process.env.HEAD_SHA || "HEAD";
  const labels = parseLabels(process.env.PR_LABELS);
  const mergeBase = git("merge-base", baseRef, headRef).trim();
  const changes = classifyChanges(git("diff", "--name-status", "-M", mergeBase, headRef, "--", DB_DIR));

  if (!changes.touched) {
    log(inActions ? "::notice::No server/db/ changes; skipping the migration check." : "No server/db/ changes; nothing to check.");
    return 0;
  }

  const failures = [];
  log(`Merge-base ${mergeBase.slice(0, 12)}; added migrations: ${changes.added.length ? changes.added.map(basename).join(", ") : "none"}`);

  // (c) needs-migration label
  if ((changes.schemaChanged || changes.added.length > 0) && !labels.includes(LABEL_NEEDS_MIGRATION)) {
    failures.push(
      `This PR changes ${SCHEMA} or adds a migration: add the \`${LABEL_NEEDS_MIGRATION}\` label (ADR 0009), e.g. gh pr edit <PR> --add-label ${LABEL_NEEDS_MIGRATION}`,
    );
  }

  // (b) destructive statements and edited migrations
  const approved = labels.includes(LABEL_APPROVED);
  const contents = new Map(changes.added.map((file) => [file, git("show", `${headRef}:${file}`)]));
  for (const [file, sql] of contents) {
    for (const hit of findDestructive(sql)) {
      const message = `${basename(file)}: ${hit.rule} in \`${hit.statement.slice(0, 160)}\``;
      if (approved) log(`Approved destructive statement (${LABEL_APPROVED}): ${message}`);
      else failures.push(`Destructive statement needs the \`${LABEL_APPROVED}\` label from a maintainer (ADR 0009 expand/contract): ${message}`);
    }
  }
  for (const file of changes.editedExisting) {
    const message = `${file} already exists on the base branch and was edited, renamed or deleted; deploys never re-run an applied migration, so add a new migration instead`;
    if (approved) log(`Approved (${LABEL_APPROVED}): ${message}`);
    else failures.push(message);
  }

  // (a) schema.sql vs base + added migrations
  const mysql = new MySql();
  try {
    mysql.start();
    mysql.resetDatabase(DB_BASE);
    mysql.resetDatabase(DB_HEAD);
    const baseError = mysql.apply(DB_BASE, git("show", `${mergeBase}:${SCHEMA}`));
    if (baseError) throw new Error(`The base ${SCHEMA} failed to load:\n${baseError}`);
    let applied = true;
    for (const [file, sql] of contents) {
      const error = mysql.apply(DB_BASE, upSection(sql));
      if (error) {
        failures.push(`${basename(file)} failed to apply on the base schema:\n${block(error)}`);
        applied = false;
        break;
      }
      log(`Applied ${basename(file)}`);
    }
    const headError = mysql.apply(DB_HEAD, git("show", `${headRef}:${SCHEMA}`));
    if (headError) failures.push(`The branch's ${SCHEMA} failed to load:\n${block(headError)}`);
    if (applied && !headError) {
      const diff = diffText(normalizeDump(mysql.dump(DB_BASE)), normalizeDump(mysql.dump(DB_HEAD)));
      if (diff) {
        failures.push(
          `The base ${SCHEMA} plus the added migrations does not match the branch's ${SCHEMA}. ` +
            `Every schema change needs both (ADR 0009). Diff (- migrations, + schema.sql):\n${block(diff)}`,
        );
        summary(`### Schema mismatch\n\n\`\`\`diff\n${diff}\n\`\`\``);
      } else {
        log("Schema matches: base schema.sql + added migrations == branch schema.sql");
      }
    }
    mysql.sql(`DROP DATABASE IF EXISTS \`${DB_BASE}\`; DROP DATABASE IF EXISTS \`${DB_HEAD}\`;`);
  } finally {
    mysql.stop();
  }

  if (failures.length === 0) {
    log("DB migration check passed.");
    return 0;
  }
  for (const failure of failures) {
    const [first, ...rest] = failure.split("\n");
    log(`${inActions ? "::error::" : "ERROR: "}${first}`);
    if (rest.length) log(rest.join("\n"));
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`${inActions ? "::error::" : "ERROR: "}${error.message}`);
    process.exitCode = 1;
  }
}
