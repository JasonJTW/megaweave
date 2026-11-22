import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isOrgListingKey, orgItemsKey, orgPostsKey } from "@/lib/orgSwrKeys";

// #136: after listing an item the form navigates back to the org page. Within SWR's
// dedupe window the remounted list would show the cached response without the new
// item, so the form revalidates every key this matcher accepts.
describe("isOrgListingKey", () => {
  const matches = isOrgListingKey("org-a");

  it("accepts the org page list and every back office filter of that org", () => {
    assert.equal(matches(orgPostsKey("org-a")), true);
    assert.equal(matches(orgItemsKey("org-a", "")), true);
    assert.equal(matches(orgItemsKey("org-a", "unitId=3&tier=internal")), true);
  });

  it("rejects other orgs, the org list, categories and non-string keys", () => {
    assert.equal(matches(orgPostsKey("org-ab")), false);
    assert.equal(matches(orgItemsKey("org-b", "")), false);
    assert.equal(matches("/api/orgs"), false);
    assert.equal(matches("/api/orgs/item-categories"), false);
    assert.equal(matches(["tuple", "key"]), false);
    assert.equal(matches(undefined), false);
  });

  it("builds the items key with the query string only when there is one", () => {
    assert.equal(orgItemsKey("org-a", ""), "/api/orgs/org-a/items");
    assert.equal(
      orgItemsKey("org-a", "status=active"),
      "/api/orgs/org-a/items?status=active",
    );
  });
});
