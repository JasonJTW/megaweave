// server/src/e2e/orgPublicFixture.ts
// #140 升到 Public fixture（client/e2e/orgPublic.spec.ts）：獨立的演示組織（is_demo），公開不影響其他 org spec。
// Org Admin 負責公開；物品由另一位 Unit Contact 上架（posts.user_id），E2E 檢查公開後到處都看不到這位窗口。
// 演示組織的管理員可以跳過 10 分鐘待公開期，所以 E2E 不必等 10 分鐘；時間到的排程由
// server/src/orgPendingPublicRoute.test.ts 驗證

import { randomUUID } from "crypto";
import type { Pool, ResultSetHeader } from "mysql2/promise";
import { seedE2eUser, type E2eUser } from "./seed";

export const PUBLIC_ORG_NAME = "E2E Public Org";
export const PUBLIC_ITEM_TITLE = "E2E Org Public item";
export const PUBLIC_ITEM_ASSET = "E2E-ASSET-140";
/** 待公開後取消用的第二件物品 */
export const PUBLIC_CANCEL_TITLE = "E2E Org Public cancel item";

export const PUBLIC_ADMIN: E2eUser = {
  email: "e2e-public-admin@megaweave.test",
  password: "e2e-public-admin-123",
  username: "E2E Public Admin",
};

/** 上架的窗口；名稱刻意獨特，E2E 在公開頁面上搜尋它必須找不到 */
export const PUBLIC_CONTACT: E2eUser = {
  email: "e2e-public-contact@megaweave.test",
  password: "e2e-public-contact-123",
  username: "E2E Hidden Contact Person",
};

async function seedItem(
  mysql: Pool,
  ids: { orgId: number; unitId: number; userId: number },
  title: string,
  assetNumber: string | null,
): Promise<void> {
  const [post] = await mysql.query<ResultSetHeader>(
    `INSERT INTO posts
       (public_id, user_id, org_id, org_unit_id, audience_tier, title, content, type,
        category_id, condition_level, expires_at)
     VALUES (?, ?, ?, ?, 'members', ?, ?, 'share', 1, 2, NULL)`,
    [randomUUID(), ids.userId, ids.orgId, ids.unitId, title, "Seeded by the E2E public fixture"],
  );
  await mysql.query(
    `INSERT INTO org_post_details (post_id, org_category, quantity, unit_weight_kg, weight_is_default, asset_number)
     VALUES (?, 'display', 1, 5, 0, ?)`,
    [post.insertId, assetNumber],
  );
  await mysql.query("INSERT INTO items (post_id, title, quantity) VALUES (?, ?, ?)", [
    post.insertId,
    title,
    1,
  ]);
}

export async function seedOrgPublicFixture(mysql: Pool): Promise<void> {
  const adminId = await seedE2eUser(mysql, PUBLIC_ADMIN);
  const contactId = await seedE2eUser(mysql, PUBLIC_CONTACT);
  const [org] = await mysql.query<ResultSetHeader>(
    "INSERT INTO organizations (public_id, name, publisher_display, is_demo) VALUES (?, ?, 'org', 1)",
    [randomUUID(), PUBLIC_ORG_NAME],
  );
  const [unit] = await mysql.query<ResultSetHeader>(
    "INSERT INTO org_units (org_id, name) VALUES (?, ?)",
    [org.insertId, "E2E Public Unit"],
  );
  await mysql.query(
    `INSERT INTO org_memberships (org_id, user_id, access_level, org_role)
     VALUES (?, ?, 'internal', 'admin')`,
    [org.insertId, adminId],
  );
  const [contact] = await mysql.query<ResultSetHeader>(
    `INSERT INTO org_memberships (org_id, user_id, access_level, org_role)
     VALUES (?, ?, 'internal', 'member')`,
    [org.insertId, contactId],
  );
  await mysql.query(
    "INSERT INTO org_unit_contacts (org_id, org_unit_id, membership_id) VALUES (?, ?, ?)",
    [org.insertId, unit.insertId, contact.insertId],
  );
  const ids = { orgId: org.insertId, unitId: unit.insertId, userId: contactId };
  await seedItem(mysql, ids, PUBLIC_ITEM_TITLE, PUBLIC_ITEM_ASSET);
  await seedItem(mysql, ids, PUBLIC_CANCEL_TITLE, null);
}
