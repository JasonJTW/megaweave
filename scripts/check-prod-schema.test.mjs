// node --test scripts/
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientContainer, normalizeIndexOrder, targetFromEnv } from "./check-prod-schema.mjs";

describe("normalizeIndexOrder", () => {
  it("sorts index lines inside a table and keeps the commas valid", () => {
    const migrated = [
      "  PRIMARY KEY (`id`),",
      "  KEY `b` (`b`),",
      "  UNIQUE KEY `a` (`a`),",
      "  KEY `c` (`c`),",
      "  CONSTRAINT `fk` FOREIGN KEY (`b`) REFERENCES `t` (`id`)",
      ") ENGINE=InnoDB;",
    ].join("\n");
    const fromSchema = [
      "  PRIMARY KEY (`id`),",
      "  KEY `c` (`c`),",
      "  UNIQUE KEY `a` (`a`),",
      "  KEY `b` (`b`),",
      "  CONSTRAINT `fk` FOREIGN KEY (`b`) REFERENCES `t` (`id`)",
      ") ENGINE=InnoDB;",
    ].join("\n");
    assert.equal(normalizeIndexOrder(migrated), normalizeIndexOrder(fromSchema));
  });

  it("keeps the last index line without a comma when it closes the table", () => {
    assert.equal(
      normalizeIndexOrder("  PRIMARY KEY (`id`),\n  KEY `z` (`z`),\n  KEY `a` (`a`)\n) ENGINE=InnoDB;"),
      "  PRIMARY KEY (`id`),\n  KEY `a` (`a`),\n  KEY `z` (`z`)\n) ENGINE=InnoDB;",
    );
  });

  it("still sees a changed index", () => {
    assert.notEqual(normalizeIndexOrder("  KEY `a` (`a`),\n"), normalizeIndexOrder("  KEY `a` (`a`,`b`),\n"));
  });
});

describe("targetFromEnv / clientContainer", () => {
  const env = { DB_HOST: "host.docker.internal", DB_USER: "ro", DB_PASSWORD: "s3cret", DB_DATABASE: "megaweave" };

  it("requires host, user and database", () => {
    assert.throws(() => targetFromEnv({ DB_HOST: "h", DB_USER: "u" }), /DB_DATABASE/);
    assert.throws(() => targetFromEnv({ ...env, DB_DATABASE: "a`; DROP" }), /unexpected/);
    assert.equal(targetFromEnv(env).port, "3306");
  });

  it("passes the password by name only, never as an argument", () => {
    const target = targetFromEnv(env);
    const { args, env: childEnv } = clientContainer(target, { env: { MYSQL_PWD: target.password } });
    assert.ok(!args.some((arg) => arg.includes("s3cret")));
    assert.deepEqual(args.slice(args.indexOf("-e"), args.indexOf("-e") + 2), ["-e", "MYSQL_PWD"]);
    assert.equal(childEnv.MYSQL_PWD, "s3cret");
  });
});
