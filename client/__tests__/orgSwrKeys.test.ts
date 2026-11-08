import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isOrgListingKey, orgItemsKey, orgPostsKey } from "@/lib/orgSwrKeys";

// #136: after listing an item the form navigates back to the org page. Within SWR's
// dedupe window the remounted list would show the cached response without the new
// item, so the form revalidates every key this matcher accepts.
describe("isOrgListingKey", () => {
  const host = "https://api.example.test";
  const matches = isOrgListingKey(host, "org-a");

  it("accepts the org page list and every back office filter of that org", () => {
    assert.equal(matches(orgPostsKey(host, "org-a")), true);
    assert.equal(matches(orgItemsKey(host, "org-a", "")), true);
    assert.equal(
      matches(orgItemsKey(host, "org-a", "unitId=3&tier=internal")),
      true,
    );
  });

  it("rejects other orgs, the org list, categories and non-string keys", () => {
    assert.equal(matches(orgPostsKey(host, "org-ab")), false);
    assert.equal(matches(orgItemsKey(host, "org-b", "")), false);
    assert.equal(matches(`${host}/api/orgs`), false);
    assert.equal(matches(`${host}/api/orgs/item-categories`), false);
    assert.equal(matches(["tuple", "key"]), false);
    assert.equal(matches(undefined), false);
  });

  it("builds the items key with the query string only when there is one", () => {
    assert.equal(
      orgItemsKey(host, "org-a", ""),
      `${host}/api/orgs/org-a/items`,
    );
    assert.equal(
      orgItemsKey(host, "org-a", "status=active"),
      `${host}/api/orgs/org-a/items?status=active`,
    );
  });
});
