import path from "path";
import { test as base } from "@playwright/test";

export const AUTH_FILE = path.join(__dirname, "../.auth/user.json");

// API origin; cookies are set with COOKIE_DOMAIN=localhost, so they are
// shared with the Next.js app on :3000.
export const API_URL =
  process.env.E2E_API_URL ??
  process.env.NEXT_PUBLIC_HOSTNAME ??
  "https://localhost:8443";

export const testUser = {
  email: process.env.E2E_USER_EMAIL ?? "",
  password: process.env.E2E_USER_PASSWORD ?? "",
};

export const hasTestUser = Boolean(testUser.email && testUser.password);

/**
 * `test` for specs that need a signed-in user.
 * Reuses the session saved by auth.setup.ts; skips if no test account is configured.
 */
export const test = base.extend({
  storageState: async ({}, provide, testInfo) => {
    testInfo.skip(!hasTestUser, "E2E_USER_EMAIL / E2E_USER_PASSWORD not set");
    await provide(AUTH_FILE);
  },
});

export { expect } from "@playwright/test";
