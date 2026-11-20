// node --test scripts/
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  DBMATE_IMAGE,
  checkMigrationFiles,
  classifyChanges,
  findDestructive,
  normalizeDump,
  parseLabels,
  parseMigration,
  splitStatements,
  verifyApproval,
} from "./check-db-migrations.mjs";

const rules = (sql) => findDestructive(sql).map((hit) => hit.rule);

describe("findDestructive", () => {
  it("passes additive migrations", () => {
    assert.deepEqual(
      rules(`
        ALTER TABLE \`items\` ADD COLUMN \`reserved_quantity\` int NOT NULL DEFAULT '0'
          COMMENT 'drop this when we rename the column; change later';
        CREATE TABLE t (id int, \`change\` int, price_change int);
        UPDATE items SET reserved_quantity = 0 WHERE id > 0;
        DELETE FROM sessions WHERE expires < NOW();
      `),
      [],
    );
  });

  it("flags each destructive statement, case-insensitively", () => {
    assert.deepEqual(
      rules(`
        alter table posts drop index idx_search;
        ALTER TABLE users DROP legacy_flag;
        DROP TABLE old_things;
        RENAME TABLE a TO b;
        ALTER TABLE users MODIFY name varchar(10);
        ALTER TABLE users CHANGE name full_name varchar(10);
        TRUNCATE notifications;
        DELETE FROM notifications;
      `),
      ["DROP", "DROP", "DROP", "RENAME", "MODIFY", "CHANGE", "TRUNCATE", "DELETE without WHERE"],
    );
  });

  it("ignores comments but reads executable comments", () => {
    assert.deepEqual(
      rules(`
        -- DROP TABLE users;
        # TRUNCATE users;
        /* ALTER TABLE users DROP COLUMN x; */
        SELECT 1;
        /*!80000 ALTER TABLE users DROP COLUMN y */;
      `),
      ["DROP"],
    );
  });
});

describe("classifyChanges", () => {
  it("separates added migrations, edited migrations and schema changes", () => {
    const result = classifyChanges(
      [
        "M\tserver/db/schema.sql",
        "A\tserver/db/migrations/20261202000000_b.sql",
        "A\tserver/db/migrations/20261201000000_a.sql",
        "M\tserver/db/migrations/20261108000001_add_organizations.sql",
        "R100\tserver/db/migrations/old.sql\tserver/db/migrations/new.sql",
        "M\tclient/app/page.tsx",
      ].join("\n"),
    );
    assert.equal(result.touched, true);
    assert.equal(result.schemaChanged, true);
    assert.deepEqual(result.added, [
      "server/db/migrations/20261201000000_a.sql",
      "server/db/migrations/20261202000000_b.sql",
    ]);
    assert.deepEqual(result.editedExisting, [
      "server/db/migrations/20261108000001_add_organizations.sql",
      "server/db/migrations/old.sql",
      "server/db/migrations/new.sql",
    ]);
  });

  it("reports nothing outside server/db/", () => {
    assert.equal(classifyChanges("M\tserver/src/api.ts\n").touched, false);
  });
});

describe("normalizeDump", () => {
  it("drops AUTO_INCREMENT counters and definers", () => {
    assert.equal(
      normalizeDump(") ENGINE=InnoDB AUTO_INCREMENT=42 DEFAULT CHARSET=utf8mb4;\n/*!50013 DEFINER=`root`@`%` SQL SECURITY DEFINER */\nVIEW v"),
      ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\nVIEW v",
    );
  });
});

describe("parseLabels", () => {
  it("reads a JSON array and rejects anything else", () => {
    assert.deepEqual(parseLabels('["needs-migration","bug"]'), ["needs-migration", "bug"]);
    assert.deepEqual(parseLabels(""), []);
    assert.throws(() => parseLabels('{"a":1}'));
  });
});

describe("splitStatements", () => {
  it("keeps the original text for messages and ignores semicolons in strings", () => {
    assert.deepEqual(
      splitStatements("ALTER TABLE `t` DROP COLUMN `c`; -- note\nUPDATE t SET a = 'x;y' WHERE id = 1;"),
      [
        { text: "ALTER TABLE `t` DROP COLUMN `c`", masked: "ALTER TABLE `x` DROP COLUMN `x`" },
        { text: "UPDATE t SET a = 'x;y' WHERE id = 1", masked: "UPDATE t SET a = '' WHERE id = 1" },
      ],
    );
  });
});

const up = (body) => `-- migrate:up\n${body}\n-- migrate:down\n-- Never rolled back.\n`;

describe("parseMigration", () => {
  it("returns the up section of a dbmate migration", () => {
    assert.deepEqual(parseMigration(`\n${up("ALTER TABLE t ADD COLUMN c int;")}`), { up: "ALTER TABLE t ADD COLUMN c int;", errors: [] });
    assert.deepEqual(parseMigration("-- migrate:up transaction:false\nCREATE INDEX i ON t (c);\n-- migrate:down\n").errors, []);
  });

  it("rejects missing markers, a down body, DELIMITER and an empty up", () => {
    const errorsOf = (sql) => parseMigration(sql).errors.join(" | ");
    assert.match(errorsOf("ALTER TABLE t ADD COLUMN c int;\n"), /must start with `-- migrate:up`/);
    assert.match(errorsOf("-- note\n" + up("SELECT 1;")), /must start with `-- migrate:up`/);
    assert.match(errorsOf("-- migrate:up\nSELECT 1;\n"), /must start with `-- migrate:up`/);
    assert.match(errorsOf("-- migrate:up\nALTER TABLE t ADD COLUMN c int;\n-- migrate:down\nALTER TABLE t DROP COLUMN c;\n"), /must be empty/);
    assert.match(errorsOf(up("DELIMITER ;;\nCREATE TRIGGER x BEFORE INSERT ON t FOR EACH ROW BEGIN SET NEW.c = 1; END ;;\nDELIMITER ;")), /DELIMITER/);
    assert.match(errorsOf(up("-- nothing yet")), /no statement/);
  });
});

describe("checkMigrationFiles", () => {
  const existing = ["20261108000000_add_org_post_details.sql", "20261114000001_posts_search_ngram.sql"];
  const check = (added, contents = new Map(added.map((name) => [name, up("SELECT 1;")]))) =>
    checkMigrationFiles({ added, existing, contents }).join(" | ");

  it("passes a well-formed file newer than every other migration", () => {
    assert.equal(check(["20261201093000_add_tags.sql"]), "");
  });

  it("rejects bad names, old versions, duplicates and bad contents", () => {
    assert.match(check(["2026-12-01-add-tags.sql"]), /not named YYYYMMDDHHMMSS_slug\.sql/);
    assert.match(check(["20261201093000_add-tags.sql"]), /not named/);
    assert.match(check(["20261110000000_add_tags.sql"]), /not newer than the latest migration \(20261114000001\)/);
    assert.match(check(["20261201093000_a.sql", "20261201093000_b.sql"]), /share the version 20261201093000/);
    assert.match(check(["20261201093000_add_tags.sql"], new Map([["20261201093000_add_tags.sql", "SELECT 1;"]])), /20261201093000_add_tags\.sql: must start/);
  });

  it("checks the names of the existing migrations too", () => {
    assert.match(checkMigrationFiles({ added: [], existing: ["2026-10-23-add-notifications-params.sql"] }).join(), /not named/);
  });

  it("accepts the repository's migrations", () => {
    const names = readdirSync(new URL("../server/db/migrations/", import.meta.url)).filter((n) => n.endsWith(".sql"));
    assert.ok(names.length > 0);
    assert.deepEqual(checkMigrationFiles({ added: [], existing: names }), []);
    for (const name of names) {
      assert.deepEqual(parseMigration(readFileSync(new URL(`../server/db/migrations/${name}`, import.meta.url), "utf8")).errors, [], name);
    }
  });
});

describe("DBMATE_IMAGE", () => {
  it("is the image of the dbmate service in docker-compose.yml, pinned by digest", () => {
    const compose = readFileSync(new URL("../docker-compose.yml", import.meta.url), "utf8");
    assert.match(DBMATE_IMAGE, /^ghcr\.io\/amacneil\/dbmate:[\d.]+@sha256:[0-9a-f]{64}$/);
    assert.ok(compose.includes(`image: ${DBMATE_IMAGE}\n`), "docker-compose.yml dbmate image differs from DBMATE_IMAGE");
  });
});

describe("verifyApproval", () => {
  const labeled = (login, created_at, id, name = "migration-approved") => ({
    id,
    event: "labeled",
    created_at,
    actor: { login },
    label: { name },
  });
  const permissions = { owner: "admin", agent: "write", triager: "triage" };
  const permissionOf = async (login) => permissions[login] ?? "none";
  const decide = (events, labels = ["needs-migration", "migration-approved"]) =>
    verifyApproval({ labels, events, permissionOf });

  it("approves when an admin added the label last", async () => {
    const result = await decide([labeled("agent", "2026-11-20T01:00:00Z", 1), labeled("owner", "2026-11-20T02:00:00Z", 2)]);
    assert.equal(result.approved, true);
  });

  it("ignores the label when a non-admin added it last, even after an admin", async () => {
    const result = await decide([labeled("owner", "2026-11-20T01:00:00Z", 1), labeled("agent", "2026-11-20T02:00:00Z", 2)]);
    assert.equal(result.approved, false);
    assert.match(result.reason, /agent.*write, not admin/);
  });

  it("orders events by time, not by array position", async () => {
    const result = await decide([labeled("owner", "2026-11-20T03:00:00Z", 3), labeled("triager", "2026-11-20T01:00:00Z", 1)]);
    assert.equal(result.approved, true);
  });

  it("ignores other labels and unlabeled events", async () => {
    const result = await decide([
      labeled("triager", "2026-11-20T01:00:00Z", 1),
      labeled("owner", "2026-11-20T02:00:00Z", 2, "needs-migration"),
      { id: 3, event: "unlabeled", created_at: "2026-11-20T03:00:00Z", actor: { login: "owner" }, label: { name: "migration-approved" } },
    ]);
    assert.equal(result.approved, false);
    assert.match(result.reason, /triager/);
  });

  it("is not approved without the label, without an event, or for an unknown user", async () => {
    assert.equal((await decide([labeled("owner", "2026-11-20T01:00:00Z", 1)], ["needs-migration"])).approved, false);
    assert.equal((await decide([])).approved, false);
    assert.equal((await decide([labeled("stranger", "2026-11-20T01:00:00Z", 1)])).approved, false);
    assert.equal((await decide([{ id: 1, event: "labeled", created_at: "x", label: { name: "migration-approved" } }])).approved, false);
  });
});
