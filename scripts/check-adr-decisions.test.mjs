// node --test scripts/
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { adrTitle, findReversals, LABEL_ADR_APPROVED } from "./check-adr-decisions.mjs";
import { verifyApproval } from "./check-db-migrations.mjs";

const ADR = "docs/adr/0009-migrations-applied-on-deploy.md";
const titles = (base, head) => ({ base: () => base, head: () => head });

describe("adrTitle", () => {
  it("reads the first H1 and ignores lower headings", () => {
    assert.equal(adrTitle("# Migration 用 dbmate 套用\n\nBody\n\n## Notes\n"), "Migration 用 dbmate 套用");
    assert.equal(adrTitle("intro\n## Not a title\n# Title  \n"), "Title");
    assert.equal(adrTitle("no heading"), null);
  });
});

describe("findReversals", () => {
  it("flags a changed H1 of an existing ADR", () => {
    const found = findReversals(`M\t${ADR}`, titles("用 dbmate", "用 repo 內的 runner"));
    assert.equal(found.length, 1);
    assert.match(found[0].reason, /用 dbmate.*用 repo 內的 runner/);
  });

  it("passes a body-only edit (same H1)", () => {
    assert.deepEqual(findReversals(`M\t${ADR}`, titles("用 dbmate", "用 dbmate")), []);
  });

  it("passes a new ADR", () => {
    assert.deepEqual(findReversals("A\tdocs/adr/0010-new.md", titles(null, "New")), []);
  });

  it("flags a deleted or renamed ADR", () => {
    const found = findReversals(`D\t${ADR}\nR100\tdocs/adr/0001-a.md\tdocs/adr/0001-b.md`, titles("x", "x"));
    assert.deepEqual(
      found.map((r) => r.reason.split(" ")[0]),
      ["deleted", "renamed"],
    );
  });

  it("ignores files that are not numbered ADRs", () => {
    assert.deepEqual(findReversals("D\tdocs/adr/README.md", titles("x", "y")), []);
  });
});

describe("verifyApproval with the adr-approved label", () => {
  const events = [{ event: "labeled", label: { name: LABEL_ADR_APPROVED }, actor: { login: "jason" }, created_at: "2026-11-22T00:00:00Z" }];

  it("counts the label only when an admin added it", async () => {
    const labels = [LABEL_ADR_APPROVED];
    const admin = await verifyApproval({ labels, events, label: LABEL_ADR_APPROVED, permissionOf: async () => "admin" });
    const writer = await verifyApproval({ labels, events, label: LABEL_ADR_APPROVED, permissionOf: async () => "write" });
    assert.equal(admin.approved, true);
    assert.equal(writer.approved, false);
  });

  it("does not accept migration-approved for an ADR change", async () => {
    const labels = ["migration-approved"];
    const result = await verifyApproval({ labels, events, label: LABEL_ADR_APPROVED, permissionOf: async () => "admin" });
    assert.equal(result.approved, false);
  });
});
