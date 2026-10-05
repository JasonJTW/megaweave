import { describe, it } from "node:test";
import assert from "node:assert/strict";

const SITE_URL = "https://megaweaving.test";
// seo reads the site URL lazily, so setting it before the first call is enough
process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;

import * as seo from "@/lib/seo";

describe("siteUrl", () => {
  it("trims a trailing slash off the configured value", () => {
    process.env.NEXT_PUBLIC_SITE_URL = `${SITE_URL}/`;
    try {
      assert.equal(seo.siteUrl(), SITE_URL);
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;
    }
  });

  it("falls back to the canonical origin when the value is not a URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "megaweaving";
    try {
      assert.equal(seo.siteUrl(), "https://megaweaving.net");
    } finally {
      process.env.NEXT_PUBLIC_SITE_URL = SITE_URL;
    }
  });
});

describe("absoluteUrl", () => {
  it("joins a path onto the configured site URL", () => {
    assert.equal(seo.absoluteUrl("/about"), `${SITE_URL}/about`);
  });

  it("keeps the root path free of a trailing slash", () => {
    assert.equal(seo.absoluteUrl("/"), SITE_URL);
  });
});

describe("localeAlternates", () => {
  it("declares zh-TW, en and x-default for every page", () => {
    const alternates = seo.localeAlternates("zh-TW", "/about");
    assert.deepEqual(alternates.languages, {
      "zh-TW": `${SITE_URL}/about`,
      en: `${SITE_URL}/en/about`,
      "x-default": `${SITE_URL}/about`,
    });
  });

  it("points x-default at the unprefixed zh-TW URL on English pages too", () => {
    const alternates = seo.localeAlternates("en", "/about");
    assert.equal(alternates.languages?.["x-default"], `${SITE_URL}/about`);
  });

  it("canonicalises to the current locale's URL", () => {
    assert.equal(
      seo.localeAlternates("zh-TW", "/about").canonical,
      `${SITE_URL}/about`,
    );
    assert.equal(
      seo.localeAlternates("en", "/about").canonical,
      `${SITE_URL}/en/about`,
    );
  });

  it("handles the home page of both locales", () => {
    assert.deepEqual(seo.localeAlternates("en", "/").languages, {
      "zh-TW": SITE_URL,
      en: `${SITE_URL}/en`,
      "x-default": SITE_URL,
    });
    assert.equal(seo.localeAlternates("en", "/").canonical, `${SITE_URL}/en`);
  });
});

describe("buildMetadata", () => {
  const metadata = () =>
    seo.buildMetadata({
      locale: "en",
      path: "/about",
      title: "About us",
      description: "Who we are",
    });

  it("uses the localized title and description, in Open Graph too", () => {
    const meta = metadata();
    assert.equal(meta.title, "About us");
    assert.equal(meta.description, "Who we are");
    assert.equal(meta.openGraph?.title, "About us");
    assert.equal(meta.openGraph?.description, "Who we are");
  });

  it("sets the Open Graph URL and locale for the page's language", () => {
    const meta = metadata();
    assert.equal(meta.openGraph?.url, `${SITE_URL}/en/about`);
    assert.equal((meta.openGraph as { locale?: string }).locale, "en_US");
    assert.equal(
      (
        seo.buildMetadata({
          locale: "zh-TW",
          path: "/about",
          title: "關於我們",
          description: "我們是誰",
        }).openGraph as { locale?: string }
      ).locale,
      "zh_TW",
    );
  });

  it("carries the hreflang alternates", () => {
    assert.deepEqual(
      metadata().alternates,
      seo.localeAlternates("en", "/about"),
    );
  });

  it("is indexable by default and noindex on request", () => {
    assert.equal(metadata().robots, undefined);
    const hidden = seo.buildMetadata({
      locale: "en",
      path: "/Card",
      title: "Card",
      description: "Card",
      noindex: true,
    });
    assert.deepEqual(hidden.robots, { index: false, follow: false });
  });

  it("passes Open Graph images through", () => {
    const meta = seo.buildMetadata({
      locale: "en",
      path: "/item/7",
      title: "A chair",
      description: "A nice chair",
      images: [
        {
          url: `${SITE_URL}/api/og?id=7`,
          width: 900,
          height: 1200,
          alt: "A chair",
        },
      ],
    });
    assert.deepEqual(meta.openGraph?.images, [
      {
        url: `${SITE_URL}/api/og?id=7`,
        width: 900,
        height: 1200,
        alt: "A chair",
      },
    ]);
  });
});
