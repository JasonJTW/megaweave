import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

// .env.e2e (E2E-only: test account credentials) takes precedence over .env.development
config({ path: ".env.e2e", override: false });
config({ path: ".env.development", override: false });

// E2E tests live in ./e2e and use *.spec.ts to stay separate from
// the node:test unit tests in ./__tests__ (*.test.ts).
const baseURL = process.env.E2E_BASE_URL ?? "https://localhost:3000";
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "html",
  use: {
    baseURL,
    // Dev server runs with --experimental-https (self-signed cert)
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    // Fixed location (Taipei 101) so location-based features are deterministic
    permissions: ["geolocation"],
    geolocation: { latitude: 25.0339, longitude: 121.5645 },
  },
  projects: [
    // Logs in once and saves the session to e2e/.auth/user.json
    { name: "setup", testMatch: "**/*.setup.ts" },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      dependencies: ["setup"],
    },
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 7"] },
      dependencies: ["setup"],
    },
    {
      name: "Mobile Safari",
      use: { ...devices["iPhone 14"] },
      dependencies: ["setup"],
    },
  ],
  // Reuse an already-running `npm run dev`; start one otherwise.
  // Backend (server :8443, worker) + Redis/MySQL must be started separately.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        ignoreHTTPSErrors: true,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
