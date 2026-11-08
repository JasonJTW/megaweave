import { test, expect } from "./fixtures/base";
import { API_URL } from "./fixtures/auth";
import zhTW from "../messages/zh-TW.json";

// #139 (PRD 0001 §5.1 E2-3, ADR 0003): the Org Admin of "E2E Auto Release Org"
// (server/src/e2e/orgAutoReleaseFixture.ts) switches the org's Auto Release to manual and back
// to 14 days in /org-admin, then overrides one Internal item in /org/items: manual, then 7 days.
// There is no time fast-forward (PRD 0001 §5.1), so the timer rules are covered by
// server/src/orgAutoRelease.test.ts, not here.
const ITEM = "E2E Auto Release item";
const admin = {
  email: "e2e-auto-release-admin@megaweave.test",
  password: "e2e-auto-release-admin-123",
};
const t = zhTW.OrgAdmin.settings;
const m = zhTW.Org.manage;

test.describe("Org Admin sets up Auto Release", () => {
  test.skip(!!process.env.E2E_BASE_URL, "relies on the local seed fixture");
  // The auth rate limiter (10/min per IP) is shared with the other org specs
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "single-project spec",
  );

  test("changes the org setting and overrides one item", async ({ page }) => {
    const signin = await page.request.post(`${API_URL}/api/signin`, {
      data: admin,
    });
    expect(signin.ok(), await signin.text()).toBeTruthy();
    const orgsRes = await page.request.get(`${API_URL}/api/org-admin/orgs`);
    const orgId = ((await orgsRes.json()) as { orgs: Array<{ id: string }> })
      .orgs[0]?.id;
    expect(orgId).toBeTruthy();
    const settings = async () => {
      const res = await page.request.get(
        `${API_URL}/api/org-admin/orgs/${orgId}/settings`,
      );
      expect(res.ok(), await res.text()).toBeTruthy();
      return ((await res.json()) as { settings: unknown }).settings;
    };

    // Org setting: manual, then automatic after 14 days
    await page.goto("/org-admin");
    const enabled = page.getByRole("switch", { name: t.enabledLabel });
    await expect(enabled).toBeChecked();
    await enabled.click();
    await expect(page.getByText(t.manualHint)).toBeVisible();
    await page.getByRole("button", { name: t.save }).click();
    await expect(page.getByText(t.saved)).toBeVisible();
    await expect
      .poll(settings)
      .toMatchObject({ autoReleaseEnabled: false, autoReleaseDays: 30 });

    await enabled.click();
    await page.getByLabel(t.daysLabel).fill("14");
    await page.getByRole("button", { name: t.save }).click();
    await expect
      .poll(settings)
      .toMatchObject({ autoReleaseEnabled: true, autoReleaseDays: 14 });

    // One item: manual, then its own 7 days
    const itemAutoRelease = async () => {
      const res = await page.request.get(`${API_URL}/api/orgs/${orgId}/items`);
      expect(res.ok(), await res.text()).toBeTruthy();
      const { items } = (await res.json()) as {
        items: Array<{ title: string; autoRelease: unknown }>;
      };
      return items.find((i) => i.title === ITEM)?.autoRelease;
    };
    await page.goto(`/org/items?org=${orgId}`);
    const select = page.getByRole("combobox", {
      name: m.autoReleaseLabel.replace("{title}", ITEM),
    });
    // The org's new setting shows as the default
    await expect(select).toContainText(
      m.autoReleaseFollowOrg.replace(
        "{setting}",
        m.autoReleaseOrgAuto.replace("{days}", "14"),
      ),
    );

    await select.click();
    await page.getByRole("option", { name: m.autoReleaseManual }).click();
    await expect(page.getByText(m.autoReleaseSaved)).toBeVisible();
    await expect
      .poll(itemAutoRelease)
      .toEqual({ override: "manual", days: null });

    await select.click();
    await page.getByRole("option", { name: m.autoReleaseAuto }).click();
    await page
      .getByLabel(m.autoReleaseDaysLabel.replace("{title}", ITEM))
      .fill("7");
    await page.getByRole("button", { name: m.autoReleaseSave }).click();
    await expect.poll(itemAutoRelease).toEqual({ override: "auto", days: 7 });
  });
});
