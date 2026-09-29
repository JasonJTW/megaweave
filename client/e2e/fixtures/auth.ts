import path from "path";
import { test as base } from "./base";

export const AUTH_FILE = path.join(__dirname, "../.auth/user.json");

// Set by playwright.config.ts: the local E2E API, or E2E_API_URL for a remote run.
export const API_URL = process.env.E2E_API_URL ?? "";

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

export { expect } from "./base";
