// node --test scripts/
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyChanges,
  findDestructive,
  normalizeDump,
  parseLabels,
  splitStatements,
  upSection,
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

  it("checks only the up section of a dbmate migration", () => {
    const sql = "-- migrate:up\nALTER TABLE t ADD c int;\n\n-- migrate:down\nALTER TABLE t DROP COLUMN c;\n";
    assert.deepEqual(rules(sql), []);
    assert.match(upSection(sql), /ADD c int/);
    assert.doesNotMatch(upSection(sql), /DROP/);
  });
});

describe("classifyChanges", () => {
  it("separates added migrations, edited migrations and schema changes", () => {
    const result = classifyChanges(
      [
        "M\tserver/db/schema.sql",
        "A\tserver/db/migrations/2026-12-02-b.sql",
        "A\tserver/db/migrations/2026-12-01-a.sql",
        "M\tserver/db/migrations/2026-11-08-add-organizations.sql",
        "R100\tserver/db/migrations/old.sql\tserver/db/migrations/new.sql",
        "M\tclient/app/page.tsx",
      ].join("\n"),
    );
    assert.equal(result.touched, true);
    assert.equal(result.schemaChanged, true);
    assert.deepEqual(result.added, [
      "server/db/migrations/2026-12-01-a.sql",
      "server/db/migrations/2026-12-02-b.sql",
    ]);
    assert.deepEqual(result.editedExisting, [
      "server/db/migrations/2026-11-08-add-organizations.sql",
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
