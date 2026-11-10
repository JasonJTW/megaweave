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
/** 沒填過公開資訊的物品：E2E 檢查缺地點時不能送出 */
export const PUBLIC_INCOMPLETE_TITLE = "E2E Org Public incomplete item";
/**
 * 公開資訊（orgPublicListing）的地點：E2E 沒有 Google 地點建議可選，所以先寫進 fixture，
 * 確認框會預填它；到期日、標籤同樣預填
 */
export const PUBLIC_ITEM_ADDRESS = "110台北市信義區信義路五段7號";
export const PUBLIC_ITEM_TAGS = "螢幕, E2E";

type SeedListing = { locationId: number; tags: string; expiresAt: Date } | null;

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
  listing: SeedListing,
): Promise<void> {
  const [post] = await mysql.query<ResultSetHeader>(
    `INSERT INTO posts
       (public_id, user_id, org_id, org_unit_id, audience_tier, title, content, type,
        category_id, condition_level, expires_at, location_id, tags)
     VALUES (?, ?, ?, ?, 'members', ?, ?, 'share', 1, 2, ?, ?, ?)`,
    [
      randomUUID(),
      ids.userId,
      ids.orgId,
      ids.unitId,
      title,
      "Seeded by the E2E public fixture",
      listing?.expiresAt ?? null,
      listing?.locationId ?? null,
      listing?.tags ?? null,
    ],
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
  //* 同一個 place_id 已存在時取回它的 id（重跑 seed、其他 fixture 用過）
  const [location] = await mysql.query<ResultSetHeader>(
    `INSERT INTO locations (place_id, name, full_address, province, city, route, zip_code, lat, lng)
     VALUES ('e2e-public-org-place', '台北101', ?, '台北市', '信義區', '信義路五段', '110', 25.033976, 121.5645389)
     ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)`,
    [PUBLIC_ITEM_ADDRESS],
  );
  const listing: SeedListing = {
    locationId: location.insertId,
    tags: PUBLIC_ITEM_TAGS,
    expiresAt: new Date(Date.now() + 60 * 24 * 3600_000),
  };
  await seedItem(mysql, ids, PUBLIC_ITEM_TITLE, PUBLIC_ITEM_ASSET, listing);
  await seedItem(mysql, ids, PUBLIC_CANCEL_TITLE, null, listing);
  await seedItem(mysql, ids, PUBLIC_INCOMPLETE_TITLE, null, null);
}
