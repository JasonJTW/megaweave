// server/src/e2e/orgHandoverFixture.ts
// #142 交接 fixture（client/e2e/orgHandover.spec.ts）：獨立的組織，移除成員不影響其他 org spec。
// - 「E2E Handover Unit」有兩位窗口：即將離職的 leaver（不登入）與接手的 successor
// - 「E2E Receiving Unit」的窗口 requester 代表自己的單位申請 leaver 上架的物品，已核可
// - leaver 也代表自己的單位申請 requester 上架的物品，還在待核可：移除後應自動婉拒

import { randomUUID } from "crypto";
import type { Pool, ResultSetHeader } from "mysql2/promise";
import { seedE2eUser, type E2eUser } from "./seed";

export const HANDOVER_ORG_NAME = "E2E Handover Org";
export const HANDOVER_ITEM_TITLE = "E2E Handover item";
export const HANDOVER_RECEIVING_ITEM_TITLE = "E2E Handover receiving item";

export const HANDOVER_ADMIN: E2eUser = {
  email: "e2e-handover-admin@megaweave.test",
  password: "e2e-handover-admin-123",
  username: "E2E Handover Admin",
};
export const HANDOVER_LEAVER: E2eUser = {
  email: "e2e-handover-leaver@megaweave.test",
  password: "e2e-handover-leaver-123",
  username: "E2E Handover Leaver",
};
export const HANDOVER_SUCCESSOR: E2eUser = {
  email: "e2e-handover-successor@megaweave.test",
  password: "e2e-handover-successor-123",
  username: "E2E Handover Successor",
};
export const HANDOVER_REQUESTER: E2eUser = {
  email: "e2e-handover-requester@megaweave.test",
  password: "e2e-handover-requester-123",
  username: "E2E Handover Requester",
};

async function addMember(
  mysql: Pool,
  orgId: number,
  userId: number,
  role: "admin" | "member",
  unitId: number | null,
): Promise<void> {
  const [membership] = await mysql.query<ResultSetHeader>(
    `INSERT INTO org_memberships (org_id, user_id, access_level, org_role)
     VALUES (?, ?, ?, ?)`,
    [orgId, userId, role === "admin" || unitId !== null ? "internal" : "member", role],
  );
  if (unitId !== null) {
    await mysql.query(
      "INSERT INTO org_unit_contacts (org_id, org_unit_id, membership_id) VALUES (?, ?, ?)",
      [orgId, unitId, membership.insertId],
    );
  }
}

async function listItem(
  mysql: Pool,
  orgId: number,
  unitId: number,
  userId: number,
  title: string,
): Promise<number> {
  const [post] = await mysql.query<ResultSetHeader>(
    `INSERT INTO posts
       (public_id, user_id, org_id, org_unit_id, audience_tier, title, content, type,
        category_id, condition_level, expires_at)
     VALUES (?, ?, ?, ?, 'internal', ?, ?, 'share', 1, 2, NULL)`,
    [randomUUID(), userId, orgId, unitId, title, "Seeded by the E2E handover fixture"],
  );
  await mysql.query("INSERT INTO items (post_id, title, quantity) VALUES (?, ?, ?)", [
    post.insertId,
    title,
    1,
  ]);
  return post.insertId;
}

/** 與 messageService.getConversationId 相同的一對一對話 */
async function conversationOf(mysql: Pool, a: number, b: number): Promise<number> {
  const [conversation] = await mysql.query<ResultSetHeader>(
    "INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)",
    [Math.min(a, b), Math.max(a, b)],
  );
  await mysql.query(
    "INSERT INTO conversation_users (conversation_id, user_id) VALUES (?, ?), (?, ?)",
    [conversation.insertId, a, conversation.insertId, b],
  );
  return conversation.insertId;
}

export async function seedOrgHandoverFixture(mysql: Pool): Promise<void> {
  const admin = await seedE2eUser(mysql, HANDOVER_ADMIN);
  const leaver = await seedE2eUser(mysql, HANDOVER_LEAVER);
  const successor = await seedE2eUser(mysql, HANDOVER_SUCCESSOR);
  const requester = await seedE2eUser(mysql, HANDOVER_REQUESTER);

  const [org] = await mysql.query<ResultSetHeader>(
    "INSERT INTO organizations (public_id, name) VALUES (?, ?)",
    [randomUUID(), HANDOVER_ORG_NAME],
  );
  const orgId = org.insertId;
  const [handoverUnit] = await mysql.query<ResultSetHeader>(
    "INSERT INTO org_units (org_id, name) VALUES (?, ?)",
    [orgId, "E2E Handover Unit"],
  );
  const [receivingUnit] = await mysql.query<ResultSetHeader>(
    "INSERT INTO org_units (org_id, name) VALUES (?, ?)",
    [orgId, "E2E Receiving Unit"],
  );
  await addMember(mysql, orgId, admin, "admin", null);
  await addMember(mysql, orgId, leaver, "member", handoverUnit.insertId);
  await addMember(mysql, orgId, successor, "member", handoverUnit.insertId);
  await addMember(mysql, orgId, requester, "member", receivingUnit.insertId);

  const item = await listItem(mysql, orgId, handoverUnit.insertId, leaver, HANDOVER_ITEM_TITLE);
  const [approved] = await mysql.query<ResultSetHeader>(
    `INSERT INTO weaves (post_id, giver_id, receiver_id, receiver_org_unit_id, conversation_id, status)
     VALUES (?, ?, ?, ?, ?, 'approved')`,
    [item, leaver, requester, receivingUnit.insertId, await conversationOf(mysql, leaver, requester)],
  );
  // 組織物品的申請一定指定品項（requestWeave）
  await mysql.query(
    "INSERT INTO weave_items (weave_id, item_id, quantity) SELECT ?, id, 1 FROM items WHERE post_id = ?",
    [approved.insertId, item],
  );

  const receivingItem = await listItem(
    mysql,
    orgId,
    receivingUnit.insertId,
    requester,
    HANDOVER_RECEIVING_ITEM_TITLE,
  );
  const [pending] = await mysql.query<ResultSetHeader>(
    `INSERT INTO weaves (post_id, giver_id, receiver_id, receiver_org_unit_id, status)
     VALUES (?, ?, ?, ?, 'requested')`,
    [receivingItem, requester, leaver, handoverUnit.insertId],
  );
  await mysql.query(
    "INSERT INTO weave_items (weave_id, item_id, quantity) SELECT ?, id, 1 FROM items WHERE post_id = ?",
    [pending.insertId, receivingItem],
  );
}
