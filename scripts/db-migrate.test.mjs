// Integration test of scripts/db-migrate.sh against a throwaway mysql:8.0 container.
// Needs Docker, so it runs only with DB_SCRIPTS_IT=1 (CI: .github/workflows/db-migrations.yml):
//
//   DB_SCRIPTS_IT=1 node --test scripts/db-migrate.test.mjs
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const PASSWORD = "runner-test";
const skip = process.env.DB_SCRIPTS_IT === "1" ? false : "set DB_SCRIPTS_IT=1 to run (needs Docker)";

let container;
let migrations;

const docker = (args, input) => spawnSync("docker", args, { input, encoding: "utf8" });

/** Runs the runner inside the container; returns { status, stdout, stderr }. */
function runner(command) {
  return docker([
    "exec", "-e", "DB_HOST=127.0.0.1", "-e", "DB_USER=root", "-e", `DB_PASSWORD=${PASSWORD}`,
    "-e", "DB_DATABASE=app", "-e", "MIGRATIONS_DIR=/m", container, "sh", "/scripts/db-migrate.sh", command,
  ]);
}

function sql(statement) {
  const res = docker(["exec", "-e", `MYSQL_PWD=${PASSWORD}`, container, "mysql", "-uroot", "-N", "-B", "app", "-e", statement]);
  assert.equal(res.status, 0, res.stderr);
  return res.stdout.trim();
}

const write = (name, body) => writeFileSync(join(migrations, name), body);
const recorded = () => sql("SELECT CONCAT(filename, ':', method) FROM schema_migrations ORDER BY filename").split("\n").filter(Boolean);

describe("db-migrate.sh", { skip }, () => {
  before(() => {
    migrations = mkdtempSync(join(tmpdir(), "db-migrate-test-"));
    const res = docker([
      "run", "-d", "--rm", "-e", `MYSQL_ROOT_PASSWORD=${PASSWORD}`, "-e", "MYSQL_DATABASE=app",
      "-v", `${SCRIPTS}:/scripts:ro`, "-v", `${migrations}:/m:ro`, "mysql:8.0", "--default-time-zone=+00:00",
    ]);
    assert.equal(res.status, 0, res.stderr);
    container = res.stdout.trim();
    for (let i = 0; i < 90; i++) {
      const ping = docker(["exec", "-e", `MYSQL_PWD=${PASSWORD}`, container, "mysqladmin", "ping", "-h", "127.0.0.1", "-uroot", "--silent"]);
      if (ping.status === 0) break;
      spawnSync("sleep", ["2"]);
    }
    // An "existing" production schema with two migrations already applied by hand
    sql("CREATE TABLE things (id int PRIMARY KEY); CREATE TABLE notes (id int PRIMARY KEY, body text)");
    write("2026-01-01-add-things.sql", "CREATE TABLE things (id int PRIMARY KEY);\n");
    write("2026-01-02-add-notes.sql", "-- notes\nCREATE TABLE notes (id int PRIMARY KEY, body text);\n");
  });

  after(() => {
    if (container) docker(["rm", "-f", container]);
    if (migrations) rmSync(migrations, { recursive: true, force: true });
  });

  it("refuses up, pending and status before the baseline", () => {
    for (const command of ["up", "pending", "status"]) {
      const res = runner(command);
      assert.equal(res.status, 2, `${command}: ${res.stdout}${res.stderr}`);
    }
    assert.equal(sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='app' AND TABLE_NAME='schema_migrations'"), "0");
  });

  it("refuses up while the tracking table is empty", () => {
    sql("CREATE TABLE schema_migrations (filename varchar(255) PRIMARY KEY, method enum('applied','baseline') NOT NULL, applied_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)");
    const res = runner("up");
    assert.equal(res.status, 2);
    assert.match(res.stderr, /is empty: run the baseline first/);
  });

  it("baseline records every file without running it, and runs once", () => {
    const res = runner("baseline");
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(recorded(), ["2026-01-01-add-things.sql:baseline", "2026-01-02-add-notes.sql:baseline"]);
    const again = runner("baseline");
    assert.equal(again.status, 2);
    assert.match(again.stderr, /already has rows/);
  });

  it("applies pending files in filename order and never re-runs a recorded one", () => {
    write("2026-02-02-add-things-label.sql", "ALTER TABLE things ADD COLUMN label varchar(10) NULL;\n");
    write("2026-02-01-add-tags.sql", "CREATE TABLE tags (id int PRIMARY KEY);\nINSERT INTO tags VALUES (1);\n");
    assert.equal(runner("pending").stdout, "2026-02-01-add-tags.sql\n2026-02-02-add-things-label.sql\n");
    const res = runner("up");
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Applied 2026-02-01-add-tags\.sql\n[\s\S]*Applied 2026-02-02-add-things-label\.sql/);
    assert.deepEqual(recorded().slice(2), ["2026-02-01-add-tags.sql:applied", "2026-02-02-add-things-label.sql:applied"]);
    // A second run would fail on the duplicate column if it re-ran anything
    const again = runner("up");
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /No pending migrations/);
    assert.equal(runner("pending").stdout, "");
  });

  it("stops at the first failing file: later files do not run, the failed one is not recorded", () => {
    write("2026-03-01-add-colors.sql", "CREATE TABLE colors (id int PRIMARY KEY);\n");
    // DML only, so the transaction rolls back the first insert
    write("2026-03-02-broken.sql", "INSERT INTO tags VALUES (2);\nINSERT INTO no_such_table VALUES (1);\n");
    write("2026-03-03-add-sizes.sql", "CREATE TABLE sizes (id int PRIMARY KEY);\n");
    const res = runner("up");
    assert.equal(res.status, 1);
    assert.match(res.stderr, /2026-03-02-broken\.sql failed/);
    assert.ok(recorded().includes("2026-03-01-add-colors.sql:applied"));
    assert.ok(!recorded().some((row) => row.startsWith("2026-03-02") || row.startsWith("2026-03-03")));
    assert.equal(sql("SELECT COUNT(*) FROM tags WHERE id = 2"), "0");
    assert.equal(sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='app' AND TABLE_NAME='sizes'"), "0");
    rmSync(join(migrations, "2026-03-02-broken.sql"));
    rmSync(join(migrations, "2026-03-03-add-sizes.sql"));
  });

  it("rejects a misnamed file or an unterminated last statement before applying anything", () => {
    write("2026-04-01-add-shapes.sql", "CREATE TABLE shapes (id int PRIMARY KEY)\n-- trailing comment\n");
    const unterminated = runner("up");
    assert.equal(unterminated.status, 1);
    assert.match(unterminated.stderr, /does not end with ';'/);
    rmSync(join(migrations, "2026-04-01-add-shapes.sql"));

    write("20260401_add_shapes.sql", "CREATE TABLE shapes (id int PRIMARY KEY);\n");
    const misnamed = runner("up");
    assert.equal(misnamed.status, 1);
    assert.match(misnamed.stderr, /does not match YYYY-MM-DD-slug\.sql/);
    rmSync(join(migrations, "20260401_add_shapes.sql"));
    assert.equal(sql("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='app' AND TABLE_NAME='shapes'"), "0");
  });

  it("runs a file with DELIMITER and session settings like the CI check does", () => {
    write(
      "2026-05-01-add-trigger.sql",
      "SET SESSION sql_mode = 'STRICT_ALL_TABLES';\nDELIMITER ;;\nCREATE TRIGGER tags_ai AFTER INSERT ON tags FOR EACH ROW BEGIN\n  INSERT IGNORE INTO colors VALUES (NEW.id);\nEND ;;\nDELIMITER ;\n",
    );
    const res = runner("up");
    assert.equal(res.status, 0, res.stderr);
    assert.ok(recorded().includes("2026-05-01-add-trigger.sql:applied"));
  });
});
