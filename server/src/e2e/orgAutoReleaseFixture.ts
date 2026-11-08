// server/src/e2e/orgAutoReleaseFixture.ts
// #139 Auto Release fixture（client/e2e/orgAutoRelease.spec.ts）：獨立的組織，改設定不影響其他 org spec。
// Org Admin 同時是「E2E Auto Release Unit」的窗口，單位有一件 Internal 物品（含 org_post_details，單件覆寫存在那裡）。
// 不提供時間快轉（PRD 0001 §5.1），E2E 只驗設定與覆寫；計時規則由 server/src/orgAutoRelease.test.ts 驗證

import { randomUUID } from "crypto";
import type { Pool, ResultSetHeader } from "mysql2/promise";
import { seedE2eUser, type E2eUser } from "./seed";

export const AUTO_RELEASE_ORG_NAME = "E2E Auto Release Org";
export const AUTO_RELEASE_ITEM_TITLE = "E2E Auto Release item";

export const AUTO_RELEASE_ADMIN: E2eUser = {
  email: "e2e-auto-release-admin@megaweave.test",
  password: "e2e-auto-release-admin-123",
  username: "E2E Auto Release Admin",
};

export async function seedOrgAutoReleaseFixture(mysql: Pool): Promise<void> {
  const adminId = await seedE2eUser(mysql, AUTO_RELEASE_ADMIN);
  const [org] = await mysql.query<ResultSetHeader>(
    "INSERT INTO organizations (public_id, name) VALUES (?, ?)",
    [randomUUID(), AUTO_RELEASE_ORG_NAME],
  );
  const [unit] = await mysql.query<ResultSetHeader>(
    "INSERT INTO org_units (org_id, name) VALUES (?, ?)",
    [org.insertId, "E2E Auto Release Unit"],
  );
  const [membership] = await mysql.query<ResultSetHeader>(
    `INSERT INTO org_memberships (org_id, user_id, access_level, org_role)
     VALUES (?, ?, 'internal', 'admin')`,
    [org.insertId, adminId],
  );
  await mysql.query(
    "INSERT INTO org_unit_contacts (org_id, org_unit_id, membership_id) VALUES (?, ?, ?)",
    [org.insertId, unit.insertId, membership.insertId],
  );

  const [post] = await mysql.query<ResultSetHeader>(
    `INSERT INTO posts
       (public_id, user_id, org_id, org_unit_id, audience_tier, title, content, type,
        category_id, condition_level, expires_at)
     VALUES (?, ?, ?, ?, 'internal', ?, ?, 'share', 1, 2, NULL)`,
    [
      randomUUID(),
      adminId,
      org.insertId,
      unit.insertId,
      AUTO_RELEASE_ITEM_TITLE,
      "Seeded by the E2E auto release fixture",
    ],
  );
  await mysql.query(
    `INSERT INTO org_post_details (post_id, org_category, quantity, unit_weight_kg, weight_is_default)
     VALUES (?, 'display', 1, 5, 0)`,
    [post.insertId],
  );
  await mysql.query("INSERT INTO items (post_id, title, quantity) VALUES (?, ?, ?)", [
    post.insertId,
    AUTO_RELEASE_ITEM_TITLE,
    1,
  ]);
}
