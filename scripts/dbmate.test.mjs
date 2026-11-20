// Integration test of scripts/dbmate.sh, scripts/deploy-migrate.sh, the baseline
// (scripts/baseline-db.mjs) and scripts/backup-db.sh against a throwaway mysql:8.0 container.
// Needs Docker, so it runs only with DB_SCRIPTS_IT=1 (CI: .github/workflows/db-migrations.yml):
//
//   DB_SCRIPTS_IT=1 node --test scripts/dbmate.test.mjs
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import { DBMATE_IMAGE } from "./check-db-migrations.mjs";
import { appliedCount, dbmateCommand, recordBaseline } from "./baseline-db.mjs";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
// URL syntax in the password: dbmate.sh must percent-encode it
const PASSWORD = "p@ss:w/rd%#?é";
const skip = process.env.DB_SCRIPTS_IT === "1" ? false : "set DB_SCRIPTS_IT=1 to run (needs Docker)";

let container;
let migrations;
let backups;

const docker = (args, input) => spawnSync("docker", args, { input, encoding: "utf8" });

function sql(statement) {
  const res = docker(["exec", "-e", `MYSQL_PWD=${PASSWORD}`, container, "mysql", "-uroot", "-N", "-B", "app", "-e", statement]);
  assert.equal(res.status, 0, res.stderr);
  return res.stdout.trim();
}

const tableExists = (name) =>
  sql(`SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='app' AND TABLE_NAME='${name}'`) === "1";
const recorded = () => sql("SELECT version FROM schema_migrations ORDER BY version").split("\n").filter(Boolean);

const target = () => ({ host: "127.0.0.1", port: "3306", user: "root", password: PASSWORD, database: "app", network: `container:${container}` });

/** The deploy's DBMATE and DB_TOOLS, pointed at the test container; DB_PASSWORD passes by name. */
const env = () => ({
  ...process.env,
  DB_PASSWORD: PASSWORD,
  DBMATE: `docker run --rm --network container:${container} -v ${SCRIPTS}:/scripts:ro -v ${migrations}:/migrations:ro -e DB_HOST=127.0.0.1 -e DB_USER=root -e DB_PASSWORD -e DB_DATABASE=app --entrypoint sh ${DBMATE_IMAGE} /scripts/dbmate.sh`,
  DB_TOOLS: `docker exec -i -e DB_HOST=127.0.0.1 -e DB_USER=root -e DB_PASSWORD -e DB_DATABASE=app ${container}`,
  BACKUP_DIR: backups,
  BACKUP_MIN_FREE_MB: "1",
});

function script(name, extra = {}) {
  return spawnSync("bash", [join(SCRIPTS, name)], { encoding: "utf8", env: { ...env(), ...extra } });
}

const backupFiles = () => (existsSync(backups) ? readdirSync(backups).filter((f) => f.endsWith(".sql.gz")).sort() : []);
const write = (name, body) => writeFileSync(join(migrations, name), `-- migrate:up\n${body}\n-- migrate:down\n`);
const remove = (name) => rmSync(join(migrations, name));

describe("dbmate migrations", { skip }, () => {
  before(() => {
    migrations = mkdtempSync(join(tmpdir(), "dbmate-test-"));
    backups = join(mkdtempSync(join(tmpdir(), "db-backup-test-")), "backups");
    const res = docker([
      "run", "-d", "--rm", "-e", `MYSQL_ROOT_PASSWORD=${PASSWORD}`, "-e", "MYSQL_DATABASE=app",
      "mysql:8.0", "--default-time-zone=+00:00",
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
    write("20260101000000_add_things.sql", "CREATE TABLE things (id int PRIMARY KEY);");
    write("20260102000000_add_notes.sql", "CREATE TABLE notes (id int PRIMARY KEY, body text);");
  });

  after(() => {
    if (container) docker(["rm", "-f", container]);
    if (migrations) rmSync(migrations, { recursive: true, force: true });
    if (backups) rmSync(dirname(backups), { recursive: true, force: true });
  });

  it("dbmate status reads the database without creating the table", () => {
    const res = dbmateCommand(target(), ["status"], migrations);
    assert.equal(res.status, 0, res.stderr);
    assert.equal(appliedCount(res.stdout), 0);
    assert.ok(!tableExists("schema_migrations"));
  });

  it("deploy-migrate refuses before the baseline, without a backup or a migration", () => {
    const res = script("deploy-migrate.sh");
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stdout, /::error title=Migrations refused::/);
    assert.deepEqual(backupFiles(), []);
    assert.ok(!tableExists("schema_migrations"));
  });

  it("the baseline records every file without running it", () => {
    // Running them would fail: the tables exist already
    const res = recordBaseline(target(), readdirSync(migrations).sort());
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(recorded(), ["20260101000000", "20260102000000"]);
    assert.equal(appliedCount(dbmateCommand(target(), ["status"], migrations).stdout), 2);
  });

  it("deploy-migrate does nothing, not even a backup, when nothing is pending", () => {
    const res = script("deploy-migrate.sh");
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /No pending migrations/);
    assert.deepEqual(backupFiles(), []);
  });

  it("deploy-migrate backs up, then applies pending files in version order, once", () => {
    write("20260202000000_add_things_label.sql", "ALTER TABLE things ADD COLUMN label varchar(10) NULL;");
    write("20260201000000_add_tags.sql", "CREATE TABLE tags (id int PRIMARY KEY);\nINSERT INTO tags VALUES (1);");
    const res = script("deploy-migrate.sh");
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /Backup written[\s\S]*Applied: 20260201000000_add_tags\.sql[\s\S]*Applied: 20260202000000_add_things_label\.sql/);
    const files = backupFiles();
    assert.equal(files.length, 1);
    const dump = gunzipSync(readFileSync(join(backups, files[0]))).toString();
    assert.match(dump, /CREATE TABLE `things`/);
    assert.doesNotMatch(dump, /CREATE TABLE `tags`/, "the backup is taken before the migration");
    assert.match(dump, /-- Dump completed/);
    assert.deepEqual(recorded().slice(2), ["20260201000000", "20260202000000"]);
    // A second run would fail on the duplicate column if it re-ran anything
    const again = script("deploy-migrate.sh");
    assert.equal(again.status, 0, again.stdout + again.stderr);
    assert.match(again.stdout, /No pending migrations/);
  });

  it("stops at the first failing file: later files do not run, the failed one is not recorded", () => {
    write("20260301000000_add_colors.sql", "CREATE TABLE colors (id int PRIMARY KEY);");
    // DML only, so the transaction rolls back the first insert
    write("20260302000000_broken.sql", "INSERT INTO tags VALUES (2);\nINSERT INTO no_such_table VALUES (1);");
    write("20260303000000_add_sizes.sql", "CREATE TABLE sizes (id int PRIMARY KEY);");
    spawnSync("sleep", ["1"]); // backup names have one-second resolution
    const res = script("deploy-migrate.sh");
    assert.equal(res.status, 1);
    assert.match(res.stdout, /::error title=Migration failed::/);
    // MySQL's error text is indented, so it cannot start a workflow command
    assert.match(res.stdout, /^ {4}.*no_such_table/m);
    assert.equal(backupFiles().length, 2);
    assert.ok(recorded().includes("20260301000000"));
    assert.ok(!recorded().includes("20260302000000") && !recorded().includes("20260303000000"));
    assert.equal(sql("SELECT COUNT(*) FROM tags WHERE id = 2"), "0");
    assert.ok(!tableExists("sizes"));
    remove("20260302000000_broken.sql");
    remove("20260303000000_add_sizes.sql");
  });

  it("refuses a pending file older than the newest applied one, before applying anything", () => {
    write("20260201500000_add_shapes.sql", "CREATE TABLE shapes (id int PRIMARY KEY);");
    write("20260401000000_add_sizes.sql", "CREATE TABLE sizes (id int PRIMARY KEY);");
    spawnSync("sleep", ["1"]);
    const res = script("deploy-migrate.sh");
    assert.equal(res.status, 1);
    assert.match(res.stdout, /out of order/);
    assert.ok(!tableExists("shapes") && !tableExists("sizes"));
    remove("20260201500000_add_shapes.sql");
    remove("20260401000000_add_sizes.sql");
  });

  it("creates a trigger without DELIMITER, stored with the mysql client's collation", () => {
    write(
      "20260501000000_add_trigger.sql",
      "CREATE TRIGGER tags_ai AFTER INSERT ON tags FOR EACH ROW BEGIN\n  INSERT IGNORE INTO colors VALUES (NEW.id);\nEND;",
    );
    const res = dbmateCommand(target(), ["migrate", "--strict"], migrations);
    assert.equal(res.status, 0, res.stderr);
    sql("INSERT INTO tags VALUES (7)");
    assert.equal(sql("SELECT COUNT(*) FROM colors WHERE id = 7"), "1");
    assert.equal(sql("SELECT COLLATION_CONNECTION FROM information_schema.TRIGGERS WHERE TRIGGER_NAME = 'tags_ai'"), "utf8mb4_0900_ai_ci");
  });

  it("backup-db keeps the newest BACKUP_KEEP and refuses a directory inside the checkout", () => {
    spawnSync("sleep", ["1"]);
    const res = script("backup-db.sh", { BACKUP_KEEP: "2" });
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Removed old backup/);
    assert.equal(backupFiles().length, 2);

    const inside = join(SCRIPTS, "..", ".backup-test-inside");
    try {
      const refused = script("backup-db.sh", { BACKUP_DIR: inside });
      assert.equal(refused.status, 1);
      assert.match(refused.stderr, /inside the repo checkout/);
    } finally {
      rmSync(inside, { recursive: true, force: true });
    }

    const tooSmall = script("backup-db.sh", { BACKUP_MIN_FREE_MB: "999999999" });
    assert.equal(tooSmall.status, 1);
    assert.match(tooSmall.stderr, /MB free/);
  });
});
