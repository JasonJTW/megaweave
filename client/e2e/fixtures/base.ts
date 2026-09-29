import { test as base } from "@playwright/test";

/**
 * Third-party requests E2E must never make: ads and analytics add noise and
 * flakiness, Google Maps bills per load, and Sentry would receive test errors.
 */
const BLOCKED_HOSTS = [
  "pagead2.googlesyndication.com",
  "googleads.g.doubleclick.net",
  "www.googletagmanager.com",
  "www.google-analytics.com",
  "maps.googleapis.com",
  "connect.facebook.net",
];

// The local stack must never reach production; remote runs target it on purpose
const blockProduction = !process.env.E2E_BASE_URL;

function isBlocked(url: URL): boolean {
  const { hostname } = url;
  return (
    BLOCKED_HOSTS.includes(hostname) ||
    hostname.endsWith(".sentry.io") ||
    hostname === "plausible.io" ||
    (blockProduction &&
      (hostname === "megaweaving.net" || hostname.endsWith(".megaweaving.net")))
  );
}

/** `test` for every spec: blocks third parties and skips first-visit overlays. */
export const test = base.extend({
  context: async ({ context }, provide) => {
    await context.route(
      (url) => isBlocked(url),
      (route) => route.abort("blockedbyclient"),
    );
    await context.addInitScript(() => {
      window.localStorage.setItem("megaweave_tour_seen", "true");
    });
    await provide(context);
  },
});

export { expect } from "@playwright/test";
