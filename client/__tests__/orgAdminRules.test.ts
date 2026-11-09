import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addAdminRequest,
  demoteAdminRequest,
  orgNavHref,
  pickOrg,
  type OrgMemberIdentity,
} from "@/lib/orgAdminRules";

// ADR 0003: a Platform Admin acts as Org Admin in every org. These rules back the
// navbar org entry, `?org=` on /org-admin and the report, and the Org Admin editor
// on /admin/orgs.

describe("orgNavHref", () => {
  const none = { isOrgAdmin: false, isMember: false, isPlatformAdmin: false };

  it("sends anyone who can manage an org to the org back office", () => {
    assert.equal(
      orgNavHref({ ...none, isOrgAdmin: true, isMember: true }),
      "/org-admin",
    );
    assert.equal(
      orgNavHref({ isOrgAdmin: true, isMember: true, isPlatformAdmin: true }),
      "/org-admin",
    );
  });

  it("sends a plain member to the org page", () => {
    assert.equal(orgNavHref({ ...none, isMember: true }), "/org");
  });

  it("sends a Platform Admin with no org yet to org setup", () => {
    assert.equal(orgNavHref({ ...none, isPlatformAdmin: true }), "/admin/orgs");
  });

  it("shows no entry to someone outside every org", () => {
    assert.equal(orgNavHref(none), null);
  });
});

describe("pickOrg", () => {
  const orgs = [
    { id: "org-a", name: "甲" },
    { id: "org-b", name: "乙" },
  ];

  it("selects the org named by ?org=", () => {
    assert.equal(pickOrg(orgs, "org-b")?.id, "org-b");
  });

  it("falls back to the first org without ?org= or for an org the caller cannot manage", () => {
    assert.equal(pickOrg(orgs, null)?.id, "org-a");
    assert.equal(pickOrg(orgs, "org-elsewhere")?.id, "org-a");
  });

  it("is null when there is no org", () => {
    assert.equal(pickOrg([], "org-a"), null);
  });
});

describe("addAdminRequest", () => {
  const members: OrgMemberIdentity[] = [
    { id: 11, email: "Contact@School.edu.tw", role: "member", unitIds: [3, 5] },
    { id: 12, email: "admin@school.edu.tw", role: "admin", unitIds: [] },
  ];

  it("promotes an existing member and keeps their units, matching email case-insensitively", () => {
    assert.deepEqual(addAdminRequest(members, "  contact@school.edu.tw "), {
      method: "PATCH",
      path: "/members/11",
      body: { role: "admin", unitIds: [3, 5] },
    });
  });

  it("adds someone new as an Org Admin with no units", () => {
    assert.deepEqual(addAdminRequest(members, " new@school.edu.tw "), {
      method: "POST",
      path: "/members",
      body: { email: "new@school.edu.tw", role: "admin", unitIds: [] },
    });
  });
});

describe("demoteAdminRequest", () => {
  it("turns an Org Admin into an Org Member and keeps their units", () => {
    assert.deepEqual(
      demoteAdminRequest({
        id: 12,
        email: "a@b.tw",
        role: "admin",
        unitIds: [7],
      }),
      {
        method: "PATCH",
        path: "/members/12",
        body: { role: "member", unitIds: [7] },
      },
    );
  });
});
