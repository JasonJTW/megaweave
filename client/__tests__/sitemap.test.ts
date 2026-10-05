import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  PROTECTED_ROUTES,
  GUEST_ONLY_ROUTES,
  ADMIN_ROUTES,
  PUBLIC_ROUTES,
  matchesAnyRoute,
} from "../middleware";

const SITE_URL = "https://megaweaving.test";
// sitemap and seo read the site URL lazily, so setting it here is enough
process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;

import sitemap from "../app/sitemap";
import {
  DYNAMIC_PUBLIC_PATHS,
  STATIC_PUBLIC_PATHS,
  UNTRANSLATED_PATHS,
} from "@/lib/seo";

describe("sitemap", () => {
  it("lists every public page in both languages", () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const path of [
      "",
      "/about",
      "/install",
      "/earthday",
      "/promote",
      "/tinder",
    ]) {
      assert.ok(
        urls.includes(`${SITE_URL}${path}`),
        `missing zh-TW ${path || "/"}`,
      );
      assert.ok(
        urls.includes(`${SITE_URL}/en${path}`),
        `missing en ${path || "/"}`,
      );
    }
  });

  it("gives every entry zh-TW, en and x-default alternates", () => {
    for (const entry of sitemap()) {
      assert.deepEqual(
        Object.keys(entry.alternates?.languages ?? {}).sort(),
        ["en", "x-default", "zh-TW"],
        `missing alternates for ${entry.url}`,
      );
    }
  });

  it("leaves out protected, guest-only and admin pages", () => {
    const offLimits = [
      ...PROTECTED_ROUTES,
      ...GUEST_ONLY_ROUTES,
      ...ADMIN_ROUTES,
    ];
    for (const entry of sitemap()) {
      const path = new URL(entry.url).pathname.replace(/^\/en/, "") || "/";
      assert.ok(
        !matchesAnyRoute(path, offLimits),
        `${entry.url} must not be in the sitemap`,
      );
    }
  });

  it("leaves out pages that are not translated", () => {
    for (const entry of sitemap()) {
      const path = new URL(entry.url).pathname.replace(/^\/en/, "") || "/";
      assert.ok(
        !matchesAnyRoute(path, UNTRANSLATED_PATHS),
        `${entry.url} is untranslated and must not be in the sitemap`,
      );
    }
  });

  it("has no duplicate URLs", () => {
    const urls = sitemap().map((entry) => entry.url);
    assert.equal(new Set(urls).size, urls.length);
  });

  it("covers every public route, as a static page or a dynamic one", () => {
    assert.deepEqual(
      [...PUBLIC_ROUTES].sort(),
      [...STATIC_PUBLIC_PATHS, ...DYNAMIC_PUBLIC_PATHS].sort(),
    );
  });
});
