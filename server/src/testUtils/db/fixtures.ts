//* test:db 的資料建構：只寫測試需要的欄位，其餘用 schema 預設值
import { randomUUID } from "node:crypto";
import type { ResultSetHeader } from "mysql2/promise";
import dbPool from "../../utils/db";

async function insert(sql: string, params: Array<string | number | null>): Promise<number> {
  const [result] = await dbPool.execute<ResultSetHeader>(sql, params);
  return result.insertId;
}

export interface TestUser {
  id: number;
  publicId: string;
  name: string;
}

export async function createUser(
  name: string,
  { role = "user" }: { role?: "user" | "admin" } = {},
): Promise<TestUser> {
  const publicId = randomUUID();
  const id = await insert(
    "INSERT INTO users (username, email, public_id, role) VALUES (?, ?, ?, ?)",
    [name, `${name}-${publicId}@test.local`, publicId, role],
  );
  return { id, publicId, name };
}

export interface TestPost {
  id: number;
  publicId: string;
  itemIds: number[];
}

export async function createPost(
  author: TestUser,
  {
    type = "share",
    items = [{ title: "Chair", quantity: 1 }],
    org,
    audienceTier = "public",
  }: {
    type?: "share" | "wish" | "commons";
    items?: Array<{ title: string; quantity: number }>;
    org?: { orgId: number; unitId: number };
    audienceTier?: "internal" | "members" | "public";
  } = {},
): Promise<TestPost> {
  const publicId = randomUUID();
  const id = await insert(
    `INSERT INTO posts (public_id, user_id, title, content, type, category_id, condition_level, org_id, org_unit_id, audience_tier)
     VALUES (?, ?, ?, '', ?, 1, 3, ?, ?, ?)`,
    [publicId, author.id, `${type} post`, type, org?.orgId ?? null, org?.unitId ?? null, audienceTier],
  );
  const itemIds: number[] = [];
  for (const item of items) {
    itemIds.push(
      await insert("INSERT INTO items (post_id, title, quantity) VALUES (?, ?, ?)", [
        id,
        item.title,
        item.quantity,
      ]),
    );
  }
  return { id, publicId, itemIds };
}

export interface TestOrg {
  id: number;
  publicId: string;
  name: string;
}

export async function createOrg(name: string): Promise<TestOrg> {
  const publicId = randomUUID();
  const id = await insert("INSERT INTO organizations (public_id, name) VALUES (?, ?)", [
    publicId,
    name,
  ]);
  return { id, publicId, name };
}

export async function createUnit(org: TestOrg, name: string): Promise<number> {
  return insert("INSERT INTO org_units (org_id, name) VALUES (?, ?)", [org.id, name]);
}

/** Org Admin 與 Unit Contact 彼此獨立（ADR 0003）；兩者皆非就是 Org Member */
export async function addMember(
  org: TestOrg,
  user: TestUser,
  { admin = false, contactOf = [] }: { admin?: boolean; contactOf?: number[] } = {},
): Promise<number> {
  const internal = admin || contactOf.length > 0;
  const membershipId = await insert(
    "INSERT INTO org_memberships (org_id, user_id, access_level, org_role) VALUES (?, ?, ?, ?)",
    [org.id, user.id, internal ? "internal" : "member", admin ? "admin" : "member"],
  );
  for (const unitId of contactOf) {
    await dbPool.execute(
      "INSERT INTO org_unit_contacts (org_id, org_unit_id, membership_id) VALUES (?, ?, ?)",
      [org.id, unitId, membershipId],
    );
  }
  return membershipId;
}
