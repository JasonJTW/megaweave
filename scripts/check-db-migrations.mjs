#!/usr/bin/env node
// DB migration check (ADR 0009), run by .github/workflows/db-migrations.yml and locally:
//
//   node scripts/check-db-migrations.mjs
//
// Compares HEAD with its merge-base on BASE and, when server/db/ changed:
//   0. format: every migration is a dbmate file named YYYYMMDDHHMMSS_slug.sql with an
//      `-- migrate:up` section and an empty `-- migrate:down`, and an added one's version is
//      newer than every other migration's (the deploy runs `dbmate migrate --strict`);
//   1. schema: a database built from the base server/db/schema.sql, with the other
//      migrations recorded as applied and the added ones applied by dbmate (as the deploy
//      does), must dump the same as one built from the branch's schema.sql;
//   2. destructive statements (DROP, RENAME, MODIFY, CHANGE, TRUNCATE, DELETE without
//      WHERE) in added migrations, and edits to migrations already on BASE, need the
//      `migration-approved` label, and in Actions it counts only when its latest `labeled`
//      event was by a repository admin (verifyApproval);
//   3. a change to schema.sql or an added migration needs the `needs-migration` label.
//
// Environment (all optional):
//   BASE_SHA            base commit or ref (default origin/main)
//   HEAD_SHA            branch commit (default HEAD)
//   PR_LABELS           JSON array of label names (default [])
//   GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER
//                       verify who added `migration-approved` (required in Actions; a local
//                       run without them trusts PR_LABELS)
//   MYSQL_CONTAINER     running MySQL 8.0 container to use; when unset a throwaway
//                       mysql:8.0 container with the E2E flags is started and removed
//   MYSQL_ROOT_PASSWORD root password of MYSQL_CONTAINER

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
const SCRIPTS = dirname(fileURLToPath(import.meta.url));

// Must equal the `dbmate` service image in docker-compose.yml (check-db-migrations.test.mjs)
export const DBMATE_IMAGE =
  "ghcr.io/amacneil/dbmate:2.37.0@sha256:0101fcc9999596f4a6930e5627296cd91f3bfa225e3e8c1699fc00881e439cc6";
export const TRACKING_TABLE = "schema_migrations";
/** dbmate reads the version from the leading digits; the slug is lowercase words joined by `_`. */
export const MIGRATION_NAME = /^(\d{14})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

// ---------------------------------------------------------------------------
// SQL scanning (pure; covered by scripts/check-db-migrations.test.mjs)
// ---------------------------------------------------------------------------

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
  return splitStatements(sql).flatMap(({ text, masked }) =>
    DESTRUCTIVE.filter((rule) => rule.test(masked)).map((rule) => ({ rule: rule.name, statement: text })),
  );
}

const MARKER = /^--\s*migrate:(up|down)\b/;

/**
 * Reads a dbmate migration: { up, errors }. The file starts with `-- migrate:up` (options such
 * as `transaction:false` may follow on that line) and ends with an `-- migrate:down` section
 * holding only comments: migrations are fixed forward, never rolled back.
 */
export function parseMigration(sql) {
  const errors = [];
  const lines = sql.split("\n");
  const markers = lines.flatMap((line, index) => {
    const match = MARKER.exec(line);
    return match ? [{ kind: match[1], index }] : [];
  });
  const firstLine = lines.findIndex((line) => line.trim() !== "");
  const ups = markers.filter((m) => m.kind === "up");
  const downs = markers.filter((m) => m.kind === "down");
  if (ups.length !== 1 || downs.length !== 1 || ups[0].index !== firstLine || downs[0].index < ups[0].index) {
    errors.push("must start with `-- migrate:up` and have one `-- migrate:down` section after it");
    return { up: "", errors };
  }
  const up = lines.slice(ups[0].index + 1, downs[0].index).join("\n");
  const down = lines.slice(downs[0].index + 1).join("\n");
  if (splitStatements(down).length > 0) errors.push("the `-- migrate:down` section must be empty: fix forward with a new migration instead");
  if (/^\s*DELIMITER\b/im.test(up)) {
    errors.push("dbmate sends the file to MySQL as is, so `DELIMITER` fails; write the trigger or routine without it (BEGIN ... END with plain `;` works)");
  }
  if (splitStatements(up).length === 0) errors.push("the `-- migrate:up` section has no statement");
  return { up, errors };
}

/**
 * Format and order rules for the branch's migrations. `added` are this branch's new files,
 * `existing` every other migration on the branch (basenames). Returns failure messages.
 */
export function checkMigrationFiles({ added, existing, contents = new Map() }) {
  const failures = [];
  const versionOf = (name) => MIGRATION_NAME.exec(name)?.[1];
  for (const name of [...existing, ...added]) {
    if (!versionOf(name)) {
      failures.push(`${name} is not named YYYYMMDDHHMMSS_slug.sql (lowercase slug words joined by _); create one with: date -u +%Y%m%d%H%M%S`);
    }
  }
  const seen = new Map();
  for (const name of [...existing, ...added]) {
    const version = versionOf(name);
    if (!version) continue;
    if (seen.has(version)) failures.push(`${name} and ${seen.get(version)} share the version ${version}; dbmate needs a unique one`);
    else seen.set(version, name);
  }
  const newest = existing.map(versionOf).filter(Boolean).sort(byteOrder).pop();
  for (const name of added) {
    const version = versionOf(name);
    if (version && newest && byteOrder(version, newest) <= 0) {
      failures.push(
        `${name} is not newer than the latest migration (${newest}); the deploy applies with dbmate --strict and refuses it. Rename it with a current timestamp: date -u +%Y%m%d%H%M%S`,
      );
    }
    for (const error of parseMigration(contents.get(name) ?? "").errors) failures.push(`${name}: ${error}`);
  }
  return failures;
}

/** Writes a migration per name that records the version without running anything (the baseline). */
export function writeBaselineStubs(dir, names) {
  for (const name of names) writeFileSync(join(dir, name), "-- migrate:up\n-- migrate:down\n");
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
  result.added.sort((a, b) => byteOrder(basename(a), basename(b)));
  return result;
}

/** Plain code-point order; for migration names it is dbmate's version order. */
export function byteOrder(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
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

/**
 * Decides whether a maintainer-approval label counts: `migration-approved` (ADR 0009) by
 * default, `adr-approved` for scripts/check-adr-decisions.mjs. Anyone with triage rights can
 * add a label, so it counts only when its most recent `labeled` event was by a user whose
 * repository permission is `admin`.
 *
 *   events        issue events of the PR (GET /repos/{repo}/issues/{n}/events)
 *   permissionOf  async (login) => "admin" | "write" | "read" | "none" | ...
 *
 * Returns { approved, reason }.
 */
export async function verifyApproval({ labels, events, permissionOf, label = LABEL_APPROVED }) {
  if (!labels.includes(label)) return { approved: false, reason: `the PR has no \`${label}\` label` };
  const labeled = events
    .filter((e) => e?.event === "labeled" && e.label?.name === label)
    .sort((a, b) => byteOrder(String(a.created_at), String(b.created_at)) || (a.id ?? 0) - (b.id ?? 0));
  const last = labeled[labeled.length - 1];
  if (!last) return { approved: false, reason: `no \`labeled\` event found for \`${label}\`` };
  const login = last.actor?.login;
  if (!login) return { approved: false, reason: `the latest \`${label}\` event has no actor` };
  const permission = await permissionOf(login);
  if (permission !== "admin") {
    return {
      approved: false,
      reason: `\`${label}\` was last added by ${login}, whose repository permission is ${permission}, not admin; ask a maintainer to remove and re-add it`,
    };
  }
  return { approved: true, reason: `\`${label}\` added by admin ${login}` };
}

async function githubGet(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  return res;
}

/** Fetches the PR's issue events and checks the label's actor; any failure means "not approved". */
export async function approvalFromGitHub(labels, label = LABEL_APPROVED) {
  if (!labels.includes(label)) return { approved: false, reason: "label absent" };
  const { GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER } = process.env;
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY || !PR_NUMBER) {
    if (inActions) return { approved: false, reason: "GITHUB_TOKEN, GITHUB_REPOSITORY or PR_NUMBER is not set, so the label cannot be verified" };
    return { approved: true, reason: "local run: PR_LABELS trusted without verification" };
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(GITHUB_REPOSITORY) || !/^\d+$/.test(PR_NUMBER)) {
    return { approved: false, reason: "GITHUB_REPOSITORY or PR_NUMBER is malformed" };
  }
  try {
    const events = [];
    for (let page = 1; page <= 30; page++) {
      const res = await githubGet(`/repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/events?per_page=100&page=${page}`);
      if (!res.ok) throw new Error(`listing issue events returned HTTP ${res.status}`);
      const batch = await res.json();
      events.push(...batch);
      if (batch.length < 100) break;
    }
    return await verifyApproval({
      labels,
      label,
      events,
      permissionOf: async (login) => {
        const res = await githubGet(`/repos/${GITHUB_REPOSITORY}/collaborators/${encodeURIComponent(login)}/permission`);
        if (res.status === 404) return "none";
        if (!res.ok) throw new Error(`reading the permission of ${login} returned HTTP ${res.status}`);
        return (await res.json()).permission ?? "none";
      },
    });
  } catch (error) {
    return { approved: false, reason: `the label could not be verified (${error.message})` };
  }
}

// ---------------------------------------------------------------------------
// git and MySQL
// ---------------------------------------------------------------------------

export function run(cmd, args, { input, allowFail = false, env } = {}) {
  const res = spawnSync(cmd, args, { input, env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.error) throw res.error;
  if (res.status !== 0 && !allowFail) {
    throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed:\n${res.stderr.trim()}`);
  }
  return res;
}

const git = (...args) => run("git", args).stdout;

/** A MySQL 8.0 in Docker: a throwaway container, or MYSQL_CONTAINER when set. */
export class MySql {
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

  dump(db, flags = ["--routines", "--events", "--triggers"]) {
    return this.exec("mysqldump", [
      "--no-data", "--skip-comments", "--skip-dump-date", "--no-tablespaces", ...flags,
      `--ignore-table=${db}.${TRACKING_TABLE}`, db,
    ]).stdout;
  }

  /** Runs scripts/dbmate.sh against `db` with the migrations in `dir`; returns { status, stdout, stderr }. */
  dbmate(db, dir, args) {
    return run(
      "docker",
      [
        "run", "--rm", "--network", `container:${this.container}`,
        "-v", `${SCRIPTS}:/scripts:ro`, "-v", `${dir}:/migrations:ro`,
        "-e", "DB_HOST=127.0.0.1", "-e", "DB_USER=root", "-e", "DB_PASSWORD", "-e", `DB_DATABASE=${db}`,
        "--entrypoint", "sh", DBMATE_IMAGE, "/scripts/dbmate.sh", ...args,
      ],
      { env: { ...process.env, DB_PASSWORD: this.password }, allowFail: true },
    );
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

export function diffText(a, b, labels = ["base schema.sql + added migrations", "branch schema.sql"]) {
  const dir = mkdtempSync(join(tmpdir(), "migration-check-"));
  try {
    const left = join(dir, "migrations.sql");
    const right = join(dir, "schema.sql");
    writeFileSync(left, a);
    writeFileSync(right, b);
    const res = run(
      "diff",
      ["-u", "--label", labels[0], "--label", labels[1], left, right],
      { allowFail: true },
    );
    return res.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
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

  // (0) dbmate format and version order
  const contents = new Map(changes.added.map((file) => [basename(file), git("show", `${headRef}:${file}`)]));
  const addedNames = [...contents.keys()];
  const existingNames = git("ls-tree", "--name-only", `${headRef}:${MIGRATIONS_DIR}`)
    .split("\n")
    .filter((name) => name.endsWith(".sql") && !contents.has(name));
  const formatFailures = checkMigrationFiles({ added: addedNames, existing: existingNames, contents });
  failures.push(...formatFailures);
  const ups = new Map(addedNames.map((name) => [name, parseMigration(contents.get(name)).up]));

  // (b) destructive statements and edited migrations
  const needsApproval = changes.editedExisting.length > 0 || [...ups.values()].some((up) => findDestructive(up).length > 0);
  const approval = needsApproval ? await approvalFromGitHub(labels) : { approved: false, reason: "not needed" };
  const approved = approval.approved;
  if (needsApproval && labels.includes(LABEL_APPROVED)) {
    log(approved ? `Approval verified: ${approval.reason}` : `${inActions ? "::warning::" : "WARNING: "}\`${LABEL_APPROVED}\` ignored: ${approval.reason}`);
  }
  for (const [name, up] of ups) {
    for (const hit of findDestructive(up)) {
      const message = `${name}: ${hit.rule} in \`${hit.statement.slice(0, 160)}\``;
      if (approved) log(`Approved destructive statement (${LABEL_APPROVED}): ${message}`);
      else failures.push(`Destructive statement needs the \`${LABEL_APPROVED}\` label from a maintainer (ADR 0009 expand/contract): ${message}`);
    }
  }
  for (const file of changes.editedExisting) {
    const message = `${file} already exists on the base branch and was edited, renamed or deleted; deploys never re-run an applied migration, so add a new migration instead`;
    if (approved) log(`Approved (${LABEL_APPROVED}): ${message}`);
    else failures.push(message);
  }

  // (a) schema.sql vs base + added migrations, applied by dbmate as the deploy does
  if (formatFailures.length > 0) {
    log("Skipping the schema comparison until the migration files are valid dbmate migrations.");
    return report(failures);
  }
  const mysql = new MySql();
  const dir = mkdtempSync(join(tmpdir(), "migration-check-dbmate-"));
  try {
    mysql.start();
    mysql.resetDatabase(DB_BASE);
    mysql.resetDatabase(DB_HEAD);
    const baseError = mysql.apply(DB_BASE, git("show", `${mergeBase}:${SCHEMA}`));
    if (baseError) throw new Error(`The base ${SCHEMA} failed to load:\n${baseError}`);
    // The base schema already has every other migration: record them, as the production baseline does
    writeBaselineStubs(dir, existingNames);
    const baseline = mysql.dbmate(DB_BASE, dir, ["migrate"]);
    if (baseline.status !== 0) throw new Error(`Recording the existing migrations failed:\n${baseline.stderr.trim()}`);
    let applied = true;
    if (addedNames.length > 0) {
      for (const [name, sql] of contents) writeFileSync(join(dir, name), sql);
      const res = mysql.dbmate(DB_BASE, dir, ["migrate", "--strict"]);
      log(block(res.stdout.trim()));
      if (res.status !== 0) {
        failures.push(`dbmate could not apply the added migrations on the base schema:\n${block(res.stderr.trim())}`);
        applied = false;
      }
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
    rmSync(dir, { recursive: true, force: true });
  }
  return report(failures);
}

function report(failures) {
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
    process.exitCode = await main();
  } catch (error) {
    console.error(`${inActions ? "::error::" : "ERROR: "}${error.message}`);
    process.exitCode = 1;
  }
}
