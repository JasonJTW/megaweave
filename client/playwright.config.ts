import { readFileSync } from "fs";
import path from "path";
import { defineConfig, devices } from "@playwright/test";
import { parse } from "dotenv";

// By default the suite runs against the local E2E stack (docker-compose.e2e.yml,
// server/e2e.env; see docs/e2e.md), which Playwright starts below.
// Set E2E_BASE_URL + E2E_API_URL (+ E2E_USER_*) to test a deployed environment instead.
const isRemote = Boolean(process.env.E2E_BASE_URL);
const serverDir = path.join(__dirname, "../server");
const e2eEnv = parse(readFileSync(path.join(serverDir, "e2e.env")));

const baseURL = process.env.E2E_BASE_URL ?? "https://localhost:3100";
// Shared with the fixtures, which run in worker processes that load this config too
process.env.E2E_API_URL ??= `https://localhost:${e2eEnv.PORT}`;
if (!isRemote) {
  process.env.E2E_USER_EMAIL ??= e2eEnv.E2E_USER_EMAIL;
  process.env.E2E_USER_PASSWORD ??= e2eEnv.E2E_USER_PASSWORD;
}

const reuseExistingServer = !process.env.CI;

// E2E tests live in ./e2e and use *.spec.ts to stay separate from
// the node:test unit tests in ./__tests__ (*.test.ts).
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
    // Dev servers run with self-signed certificates
    ignoreHTTPSErrors: true,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    // Fixed location (Taipei 101) so location-based features are deterministic
    permissions: ["geolocation"],
    geolocation: { latitude: 25.0339, longitude: 121.5645 },
  },
  projects: [
    // Resets the local E2E stack (skipped for remote targets)
    { name: "seed", testMatch: "**/seed.setup.ts" },
    // Logs in once and saves the session to e2e/.auth/user.json
    { name: "setup", testMatch: "**/auth.setup.ts", dependencies: ["seed"] },
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
  // Requires `make e2e-up` (MySQL, Redis, S3 mock). Reuses servers that are already running locally.
  webServer: isRemote
    ? undefined
    : [
        {
          name: "openai-mock",
          command: "npm run e2e:mock-openai",
          cwd: serverDir,
          port: Number(new URL(e2eEnv.OPENAI_BASE_URL).port),
          reuseExistingServer,
        },
        {
          name: "api",
          command: "npm run e2e:api",
          cwd: serverDir,
          url: `${process.env.E2E_API_URL}/health`,
          ignoreHTTPSErrors: true,
          reuseExistingServer,
          timeout: 120_000,
        },
        {
          name: "worker",
          command: "npm run e2e:worker",
          cwd: serverDir,
          wait: { stdout: /Worker service is running/ },
          timeout: 120_000,
        },
        {
          name: "client",
          // CI tests the production build; locally the dev server starts faster
          command: process.env.CI
            ? "npm run build:e2e && npm run start:e2e"
            : "npm run dev:e2e",
          url: baseURL,
          ignoreHTTPSErrors: true,
          reuseExistingServer,
          timeout: process.env.CI ? 600_000 : 120_000,
        },
      ],
});
