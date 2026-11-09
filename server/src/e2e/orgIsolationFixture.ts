// server/src/e2e/orgIsolationFixture.ts
// E2E 組織隔離 fixture：一個組織的 Internal／Members／Public 貼文各一篇，加一篇個人貼文。
// 檢視者是該組織 Internal 權限的 Unit Contact，興趣向量與 fixture 貼文相同，
// 讓 Feed、搜尋、熱門排行與向量推薦都會優先撈到這些貼文（client/e2e/orgIsolation.spec.ts）。

import { randomUUID } from "crypto";
import type { Pool, ResultSetHeader } from "mysql2/promise";
import { z } from "zod";
import type { AppRedisClient } from "../utils/redis";
import type { AudienceTier } from "../services/postVisibility";
import { vectorScopeOf } from "../services/postVectorScope";
import { seedE2eUser, type E2eUser } from "./seed";

export const ORG_ISOLATION_TITLE_PREFIX = "E2E Org Isolation";

/** #137：另一個單位上架的 Internal 物品，檢視者代表自己的單位申請（client/e2e/orgClaim.spec.ts） */
export const ORG_CLAIM_TITLE = "E2E Org Claim internal";

/** 「E2E Supply Unit」的窗口：申請檢視者單位的物品，讓檢視者在後台核可（只存在於 E2E 資料庫） */
export const ORG_LISTER = {
  email: "e2e-org-lister@megaweave.test",
  password: "e2e-org-lister-123",
  username: "E2E Org Lister",
};

/** #138：檢視者單位（E2E Unit）的 Internal 物品，檢視者在後台升到 Members（client/e2e/orgTier.spec.ts） */
export const ORG_TIER_TITLE = "E2E Org Tier internal";

/** #138：只有 Org Member 身分（access_level = member），在 Members 層看到並申請物品 */
export const ORG_MEMBER = {
  email: "e2e-org-member@megaweave.test",
  password: "e2e-org-member-123",
  username: "E2E Org Member",
};

const orgViewerSchema = z.object({
  E2E_ORG_VIEWER_EMAIL: z.email(),
  E2E_ORG_VIEWER_PASSWORD: z.string().min(8),
});

export function resolveOrgViewer(env: NodeJS.ProcessEnv = process.env): E2eUser {
  const parsed = orgViewerSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(
      `Invalid E2E org viewer configuration; load server/e2e.env: ${z.prettifyError(parsed.error)}`,
    );
  }
  return {
    email: parsed.data.E2E_ORG_VIEWER_EMAIL,
    password: parsed.data.E2E_ORG_VIEWER_PASSWORD,
    username: "E2E Org Viewer",
  };
}

const DIM = 1536;

/** 所有 fixture 貼文與檢視者共用的單位向量，與 mock OpenAI 產生的其他貼文幾乎正交 */
function fixtureVector(): number[] {
  return new Array<number>(DIM).fill(1 / Math.sqrt(DIM));
}

function toFloat32Buffer(vec: number[]): Buffer {
  const buf = Buffer.alloc(vec.length * 4);
  vec.forEach((value, i) => buf.writeFloatLE(value, i * 4));
  return buf;
}

export async function seedOrgIsolationFixture(
  mysql: Pool,
  vectorRedis: AppRedisClient,
  viewer: E2eUser,
): Promise<void> {
  const viewerId = await seedE2eUser(mysql, viewer);
  const vector = fixtureVector();
  const vectorJson = JSON.stringify(vector);

  const [org] = await mysql.query<ResultSetHeader>(
    "INSERT INTO organizations (public_id, name) VALUES (?, ?)",
    [randomUUID(), "E2E Org"],
  );
  const orgId = org.insertId;
  const [unit] = await mysql.query<ResultSetHeader>(
    "INSERT INTO org_units (org_id, name) VALUES (?, ?)",
    [orgId, "E2E Unit"],
  );
  const [membership] = await mysql.query<ResultSetHeader>(
    `INSERT INTO org_memberships (org_id, user_id, access_level, org_role)
     VALUES (?, ?, 'internal', 'member')`,
    [orgId, viewerId],
  );
  await mysql.query(
    "INSERT INTO org_unit_contacts (org_id, org_unit_id, membership_id) VALUES (?, ?, ?)",
    [orgId, unit.insertId, membership.insertId],
  );

  const posts: Array<{ label: string; tier: AudienceTier; org: boolean }> = [
    { label: "internal", tier: "internal", org: true },
    { label: "members", tier: "members", org: true },
    { label: "public", tier: "public", org: true },
    { label: "personal", tier: "public", org: false },
  ];
  for (const post of posts) {
    const [result] = await mysql.query<ResultSetHeader>(
      `INSERT INTO posts
         (public_id, user_id, org_id, org_unit_id, audience_tier, title, content, type,
          category_id, condition_level, expires_at, embedding)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'share', 1, 2, DATE_ADD(NOW(), INTERVAL 30 DAY), ?)`,
      [
        randomUUID(),
        viewerId,
        post.org ? orgId : null,
        post.org ? unit.insertId : null,
        post.tier,
        `${ORG_ISOLATION_TITLE_PREFIX} ${post.label}`,
        "Seeded by the E2E org isolation fixture",
        vectorJson,
      ],
    );
    // 組織物品一定要按品項申請（requestWeave），跟上架 API 一樣建一個品項
    if (post.org) {
      await mysql.query("INSERT INTO items (post_id, title, quantity) VALUES (?, ?, ?)", [
        result.insertId,
        `${ORG_ISOLATION_TITLE_PREFIX} ${post.label}`,
        1,
      ]);
    }
    // 與 postEmbedding job 相同的索引格式（含 scope TAG）。非公開貼文照樣進索引：隔離要在讀取端成立
    await vectorRedis.hSet(`post:${result.insertId}`, {
      v: toFloat32Buffer(vector),
      post_id: result.insertId,
      status: "share",
      scope: vectorScopeOf({ orgId: post.org ? orgId : null, audienceTier: post.tier }),
    });
  }

  // #137：「E2E Supply Unit」的窗口（不登入）上架一件 Internal 物品，檢視者（E2E Unit 窗口）可代表單位申請
  const listerId = await seedE2eUser(mysql, ORG_LISTER);
  const [supplyUnit] = await mysql.query<ResultSetHeader>(
    "INSERT INTO org_units (org_id, name) VALUES (?, ?)",
    [orgId, "E2E Supply Unit"],
  );
  const [listerMembership] = await mysql.query<ResultSetHeader>(
    `INSERT INTO org_memberships (org_id, user_id, access_level, org_role)
     VALUES (?, ?, 'internal', 'member')`,
    [orgId, listerId],
  );
  await mysql.query(
    "INSERT INTO org_unit_contacts (org_id, org_unit_id, membership_id) VALUES (?, ?, ?)",
    [orgId, supplyUnit.insertId, listerMembership.insertId],
  );
  const [claimPost] = await mysql.query<ResultSetHeader>(
    `INSERT INTO posts
       (public_id, user_id, org_id, org_unit_id, audience_tier, title, content, type,
        category_id, condition_level, expires_at)
     VALUES (?, ?, ?, ?, 'internal', ?, ?, 'share', 1, 2, NULL)`,
    [
      randomUUID(),
      listerId,
      orgId,
      supplyUnit.insertId,
      ORG_CLAIM_TITLE,
      "Seeded by the E2E org claim fixture",
    ],
  );
  await mysql.query("INSERT INTO items (post_id, title, quantity) VALUES (?, ?, ?)", [
    claimPost.insertId,
    ORG_CLAIM_TITLE,
    2,
  ]);

  // #138：檢視者單位的 Internal 物品（待升到 Members），與只有 Org Member 身分的帳號
  const [tierPost] = await mysql.query<ResultSetHeader>(
    `INSERT INTO posts
       (public_id, user_id, org_id, org_unit_id, audience_tier, title, content, type,
        category_id, condition_level, expires_at)
     VALUES (?, ?, ?, ?, 'internal', ?, ?, 'share', 1, 2, NULL)`,
    [
      randomUUID(),
      viewerId,
      orgId,
      unit.insertId,
      ORG_TIER_TITLE,
      "Seeded by the E2E org tier fixture",
    ],
  );
  await mysql.query("INSERT INTO items (post_id, title, quantity) VALUES (?, ?, ?)", [
    tierPost.insertId,
    ORG_TIER_TITLE,
    1,
  ]);
  const memberId = await seedE2eUser(mysql, ORG_MEMBER);
  await mysql.query(
    `INSERT INTO org_memberships (org_id, user_id, access_level, org_role)
     VALUES (?, ?, 'member', 'member')`,
    [orgId, memberId],
  );

  await mysql.query("UPDATE user_profiles SET interest_vector = ? WHERE user_id = ?", [
    vectorJson,
    viewerId,
  ]);
}
