import { request as playwrightRequest } from "@playwright/test";
import { test, expect } from "./fixtures/base";
import { API_URL, AUTH_FILE } from "./fixtures/auth";
import zhTW from "../messages/zh-TW.json";

// #143 (PRD 0001 §5.1 E6-1, E6-2; ADR 0005): the Org Admin of the seeded "E2E Auto Release
// Org" (server/src/e2e/orgAutoReleaseFixture.ts) opens the report from /org-admin. The page
// shows the circulation numbers and the disclosures the avoided-emissions model requires
// (replacement rate and its "assumed" status, factor table version, footnote). Someone who
// isn't an Org Admin gets 404 ORG_NOT_FOUND from the report API.
const admin = {
  email: "e2e-auto-release-admin@megaweave.test",
  password: "e2e-auto-release-admin-123",
};
const ORG_NAME = "E2E Auto Release Org";
const t = zhTW.OrgReport;

test.describe("Org report", () => {
  test.skip(!!process.env.E2E_BASE_URL, "relies on the local seed fixture");
  // The auth rate limiter (10/min per IP) is shared with the other org specs
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "single-project spec",
  );

  test("the Org Admin sees circulation, the formula and the disclosures", async ({
    page,
  }) => {
    const signin = await page.request.post(`${API_URL}/api/signin`, {
      data: admin,
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();
    const orgsRes = await page.request.get(`${API_URL}/api/orgs`);
    const org = (
      (await orgsRes.json()) as { orgs: Array<{ id: string; name: string }> }
    ).orgs.find((o) => o.name === ORG_NAME);
    expect(org).toBeTruthy();

    const api = await page.request.get(
      `${API_URL}/api/org-admin/orgs/${org!.id}/report`,
    );
    expect(api.ok(), await api.text()).toBeTruthy();
    const { report } = (await api.json()) as {
      report: {
        listing: { itemCount: number; quantity: number };
        emissions: {
          factorTableVersion: string;
          replacementRate: { value: number; status: string };
        };
      };
    };
    expect(report.listing.itemCount).toBeGreaterThanOrEqual(1);
    expect(report.emissions.replacementRate).toMatchObject({
      value: 0.5,
      status: "assumed",
    });

    await page.goto(`/org-admin?org=${org!.id}`);
    await page
      .getByRole("navigation", { name: zhTW.Org.nav.label })
      .getByRole("link", { name: zhTW.Org.nav.report })
      .click();
    await expect(
      page.getByRole("heading", { name: t.title, level: 1 }),
    ).toBeVisible();
    await expect(page.getByTestId("report-listed")).toHaveText(
      t.pieces.replace("{count}", String(report.listing.quantity)),
    );
    await expect(page.getByTestId("report-factor-version")).toHaveText(
      report.emissions.factorTableVersion,
    );
    await expect(page.getByTestId("report-replacement-rate")).toContainText(
      t.rateStatus.assumed,
    );
    await expect(page.getByText(t.formulaEstimated)).toBeVisible();
    await expect(page.getByTestId("report-footnote")).toContainText("非碳權");
    await expect(page.getByTestId("report-footnote")).toContainText(
      `係數表版本 ${report.emissions.factorTableVersion}`,
    );
  });

  test("anyone else gets ORG_NOT_FOUND", async ({ page }) => {
    const signin = await page.request.post(`${API_URL}/api/signin`, {
      data: admin,
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();
    const orgsRes = await page.request.get(`${API_URL}/api/orgs`);
    const orgId = (
      (await orgsRes.json()) as { orgs: Array<{ id: string; name: string }> }
    ).orgs.find((o) => o.name === ORG_NAME)!.id;

    // The default signed-in E2E user belongs to no org
    const outsider = await playwrightRequest.newContext({
      ignoreHTTPSErrors: true,
      storageState: AUTH_FILE,
    });
    try {
      const res = await outsider.get(
        `${API_URL}/api/org-admin/orgs/${orgId}/report`,
      );
      expect(res.status()).toBe(404);
      expect(((await res.json()) as { code: string }).code).toBe(
        "ORG_NOT_FOUND",
      );
    } finally {
      await outsider.dispose();
    }
  });
});
