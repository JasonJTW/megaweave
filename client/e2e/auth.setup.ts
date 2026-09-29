import { test as setup, expect } from "@playwright/test";
import { API_URL, AUTH_FILE, hasTestUser, testUser } from "./fixtures/auth";

// Sign in via the API instead of the UI: faster, and only hits the
// auth rate limiter once per run.
setup("authenticate", async ({ request }) => {
  setup.skip(!hasTestUser, "E2E_USER_EMAIL / E2E_USER_PASSWORD not set");

  const response = await request.post(`${API_URL}/api/signin`, {
    data: { email: testUser.email, password: testUser.password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();

  await request.storageState({ path: AUTH_FILE });
});
