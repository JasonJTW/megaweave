//* 組織物品（#136，PRD 0001 §5.1 E2-1、E3、E4-1、E6-2；ADR 0003、ADR 0004、ADR 0005）
//* - 物品屬於單位（posts.org_unit_id），posts.user_id 是經手上架的人
//* - 只能是 Share、上架後一律在 Internal；不開放 ECPay 與 Lalamove（paymentService 擋 org 貼文）
//* - 能管哪些單位（OrgAccess.manageableUnits）：Org Admin → 全部單位；Unit Contact → 自己負責的單位
//* - 看得到哪些層級：只來自 membership（scopeFromMemberships）；Platform Admin 不因身分多看到任何東西
//* - 公開熱門排行只收 Public：上架不寫 feed:trending；向量索引照常寫入，scope 由 job 從 MySQL 讀
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { randomUUID } from "crypto";
import dbPool from "../utils/db";
import { HttpError } from "../utils/httpError";
import { withTransaction } from "../utils/transaction";
import { enqueuePostEmbedding, enqueuePostUploadImages } from "../queue/queues";
import { orgNotFound, OrgRole } from "./orgService";
import {
  AccessLevel,
  AudienceTier,
  scopeFromMemberships,
} from "./postVisibility";
import {
  defaultUnitWeightKg,
  OrgItemCategoryId,
  publicCategoryIdOf,
} from "./orgItemCategories";

export const ORG_ITEM_STATUSES = ["active", "inactive"] as const;
export type OrgItemStatus = (typeof ORG_ITEM_STATUSES)[number];

export interface OrgUnitRef {
  id: number;
  name: string;
}

/** 呼叫者在某個組織的身分；`orgId` 是內部 id，只在 server 用 */
export interface OrgAccess {
  orgId: number;
  publicId: string;
  name: string;
  accessLevel: AccessLevel;
  isAdmin: boolean;
  /** 可代表上架、可在後台管理的單位 */
  manageableUnits: OrgUnitRef[];
}

export interface CreateOrgItemInput {
  unitId: number;
  title: string;
  content: string;
  orgCategory: OrgItemCategoryId;
  quantity: number;
  unitWeightKg: number;
  conditionLevel: number;
  assetNumber: string | null;
  estimatedValueTwd: number | null;
  stagingKeys: string[];
}

/** 後台依 Weave 狀態篩選：有這個狀態的申請的物品（requested = 待核可） */
export const ORG_ITEM_WEAVE_STATUSES = ["requested", "approved", "completed"] as const;
export type OrgItemWeaveStatus = (typeof ORG_ITEM_WEAVE_STATUSES)[number];

export interface OrgItemFilters {
  unitId?: number;
  tier?: AudienceTier;
  status?: OrgItemStatus;
  weaveStatus?: OrgItemWeaveStatus;
}

/** 後台：一件物品的申請（#137）。receiver 是經手人，receiverUnit 是流向單位（個人申請為 null） */
export interface OrgItemRequest {
  id: number;
  status: OrgItemWeaveStatus;
  createdAt: string;
  quantity: number;
  receiver: { name: string };
  receiverUnit: OrgUnitRef | null;
}

/** 後台清單的一列：含財產編號、估算價值等管理資訊 */
export interface OrgItem {
  id: string;
  title: string;
  type: string;
  audienceTier: AudienceTier;
  status: OrgItemStatus;
  createdAt: string;
  unit: OrgUnitRef;
  orgCategory: OrgItemCategoryId | null;
  quantity: number | null;
  unitWeightKg: number | null;
  weightIsDefault: boolean | null;
  assetNumber: string | null;
  estimatedValueTwd: number | null;
  s3Keys: string[];
  /** 待核可（requested）的申請數 */
  pendingRequestCount: number;
}

/** 組織頁卡片：不含財產編號與估算價值 */
export type OrgPagePost = Pick<
  OrgItem,
  "id" | "title" | "audienceTier" | "createdAt" | "unit" | "orgCategory" | "quantity" | "s3Keys"
>;

const LIST_LIMIT = 500;

export function unitNotManaged() {
  return new HttpError(
    403,
    "ORG_UNIT_NOT_MANAGED",
    "You are not a Unit Contact of this unit",
  );
}

interface MembershipRow extends RowDataPacket {
  id: number;
  public_id: string;
  name: string;
  membership_id: number;
  access_level: AccessLevel;
  org_role: OrgRole;
}

async function loadAccesses(
  userId: number,
  orgPublicId?: string,
): Promise<OrgAccess[]> {
  const [rows] = await dbPool.query<MembershipRow[]>(
    `SELECT o.id, o.public_id, o.name, m.id AS membership_id, m.access_level, m.org_role
     FROM org_memberships m JOIN organizations o ON o.id = m.org_id
     WHERE m.user_id = ?${orgPublicId ? " AND o.public_id = ?" : ""}
     ORDER BY o.name`,
    orgPublicId ? [userId, orgPublicId] : [userId],
  );
  if (rows.length === 0) return [];

  const contactUnits = new Map<number, OrgUnitRef[]>();
  //* IN (?) 需要 query() 展開陣列
  const [contacts] = await dbPool.query<RowDataPacket[]>(
    `SELECT c.membership_id, u.id, u.name
     FROM org_unit_contacts c JOIN org_units u ON u.id = c.org_unit_id
     WHERE c.membership_id IN (?) ORDER BY u.name`,
    [rows.map((row) => row.membership_id)],
  );
  for (const contact of contacts) {
    const membershipId = Number(contact.membership_id);
    const units = contactUnits.get(membershipId) ?? [];
    units.push({ id: Number(contact.id), name: String(contact.name) });
    contactUnits.set(membershipId, units);
  }

  return Promise.all(
    rows.map(async (row) => {
      const isAdmin = row.org_role === "admin";
      const manageableUnits = isAdmin
        ? await listUnits(Number(row.id))
        : (contactUnits.get(Number(row.membership_id)) ?? []);
      return {
        orgId: Number(row.id),
        publicId: row.public_id,
        name: row.name,
        accessLevel: row.access_level,
        isAdmin,
        manageableUnits,
      };
    }),
  );
}

async function listUnits(orgId: number): Promise<OrgUnitRef[]> {
  const [rows] = await dbPool.query<RowDataPacket[]>(
    "SELECT id, name FROM org_units WHERE org_id = ? ORDER BY name",
    [orgId],
  );
  return rows.map((row) => ({ id: Number(row.id), name: String(row.name) }));
}

/** 檢視者在這個組織看得到的層級：membership 的 Internal／Members，加上 Public */
export function visibleTiers(accessLevel: AccessLevel): AudienceTier[] {
  const [access] = scopeFromMemberships([{ orgId: 0, accessLevel }]).orgs;
  return [...access.tiers, "public"];
}

function assertManages(access: OrgAccess, unitId: number): OrgUnitRef {
  const unit = access.manageableUnits.find((u) => u.id === unitId);
  if (!unit) throw unitNotManaged();
  return unit;
}

function toOrgItem(row: RowDataPacket): OrgItem {
  return {
    id: row.public_id,
    title: row.title,
    type: row.type,
    audienceTier: row.audience_tier,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    unit: { id: Number(row.org_unit_id), name: row.unit_name },
    orgCategory: row.org_category ?? null,
    quantity: row.quantity === null ? null : Number(row.quantity),
    unitWeightKg: row.unit_weight_kg === null ? null : Number(row.unit_weight_kg),
    weightIsDefault:
      row.weight_is_default === null ? null : Boolean(Number(row.weight_is_default)),
    assetNumber: row.asset_number ?? null,
    estimatedValueTwd:
      row.estimated_value_twd === null ? null : Number(row.estimated_value_twd),
    s3Keys: row.s3_keys ? String(row.s3_keys).split(",") : [],
    pendingRequestCount: Number(row.pending_request_count ?? 0),
  };
}

interface ListQuery {
  tiers?: AudienceTier[];
  unitIds?: number[];
  status?: OrgItemStatus;
  weaveStatus?: OrgItemWeaveStatus;
  publicId?: string;
}

/** 組織物品清單（組織頁、後台、上架後回傳共用）；條件都是參數，不拼使用者輸入 */
async function queryItems(orgId: number, filters: ListQuery): Promise<OrgItem[]> {
  let where = "";
  const params: unknown[] = [orgId];
  if (filters.tiers) {
    where += " AND p.audience_tier IN (?)";
    params.push(filters.tiers);
  }
  if (filters.unitIds) {
    where += " AND p.org_unit_id IN (?)";
    params.push(filters.unitIds);
  }
  if (filters.status) {
    where += " AND p.status = ?";
    params.push(filters.status);
  }
  if (filters.weaveStatus) {
    where += " AND EXISTS (SELECT 1 FROM weaves w WHERE w.post_id = p.id AND w.status = ?)";
    params.push(filters.weaveStatus);
  }
  if (filters.publicId) {
    where += " AND p.public_id = ?";
    params.push(filters.publicId);
  }
  const [rows] = await dbPool.query<RowDataPacket[]>(
    `SELECT p.id, p.public_id, p.title, p.type, p.audience_tier, p.status, p.created_at,
            p.org_unit_id, u.name AS unit_name,
            d.org_category, d.quantity, d.unit_weight_kg, d.weight_is_default,
            d.asset_number, d.estimated_value_twd,
            (SELECT GROUP_CONCAT(i.s3_key ORDER BY i.id) FROM images i WHERE i.post_id = p.id) AS s3_keys,
            (SELECT COUNT(*) FROM weaves w WHERE w.post_id = p.id AND w.status = 'requested') AS pending_request_count
     FROM posts p
     JOIN org_units u ON u.id = p.org_unit_id
     LEFT JOIN org_post_details d ON d.post_id = p.id
     WHERE p.org_id = ? AND p.deleted_at IS NULL${where}
     ORDER BY p.created_at DESC, p.id DESC LIMIT ${LIST_LIMIT}`,
    params,
  );
  return rows.map(toOrgItem);
}

export const orgItemService = {
  /** 呼叫者所屬的組織（組織頁切換器）；Platform Admin 身分不算 */
  listAccesses(userId: number): Promise<OrgAccess[]> {
    return loadAccesses(userId);
  },

  /** 呼叫者在這個組織的身分；不是成員回 404 ORG_NOT_FOUND（不洩漏組織存在） */
  async requireAccess(orgPublicId: string, userId: number): Promise<OrgAccess> {
    const [access] = await loadAccesses(userId, orgPublicId);
    if (!access) throw orgNotFound();
    return access;
  },

  /** 組織頁：這個組織中呼叫者層級看得到、仍上架中的物品 */
  async listOrgPagePosts(access: OrgAccess): Promise<OrgPagePost[]> {
    const items = await queryItems(access.orgId, {
      tiers: visibleTiers(access.accessLevel),
      status: "active",
    });
    return items.map(
      ({ id, title, audienceTier, createdAt, unit, orgCategory, quantity, s3Keys }) => ({
        id,
        title,
        audienceTier,
        createdAt,
        unit,
        orgCategory,
        quantity,
        s3Keys,
      }),
    );
  },

  /** 後台清單：Unit Contact 只有自己單位，Org Admin 全組織 */
  async listManagedItems(
    access: OrgAccess,
    filters: OrgItemFilters,
  ): Promise<OrgItem[]> {
    if (access.manageableUnits.length === 0) throw unitNotManaged();
    const unitIds =
      filters.unitId !== undefined
        ? [assertManages(access, filters.unitId).id]
        : access.manageableUnits.map((u) => u.id);
    return queryItems(access.orgId, {
      unitIds,
      tiers: filters.tier ? [filters.tier] : undefined,
      status: filters.status,
      weaveStatus: filters.weaveStatus,
    });
  },

  /**
   * 後台：一件物品的申請，新的在前。只給能管這個單位的人（窗口或 Org Admin）看；
   * 核可／婉拒走 PATCH /api/weaves/:id/status（orgWeaveService.canReviewOrgRequest）
   */
  async listItemRequests(
    access: OrgAccess,
    itemPublicId: string,
  ): Promise<OrgItemRequest[]> {
    if (access.manageableUnits.length === 0) throw unitNotManaged();
    const [posts] = await dbPool.execute<RowDataPacket[]>(
      `SELECT p.id, p.org_unit_id FROM posts p
       WHERE p.org_id = ? AND p.public_id = ? AND p.deleted_at IS NULL`,
      [access.orgId, itemPublicId],
    );
    if (posts.length === 0) {
      throw new HttpError(404, "POST_NOT_FOUND", "Item not found");
    }
    assertManages(access, Number(posts[0].org_unit_id));

    const [rows] = await dbPool.execute<RowDataPacket[]>(
      `SELECT w.id, w.status, w.created_at, w.receiver_org_unit_id,
              ru.name AS receiver_org_unit_name,
              COALESCE(NULLIF(TRIM(up.custom_name), ''), u.username) AS receiver_name,
              (SELECT COALESCE(SUM(wi.quantity), 0) FROM weave_items wi WHERE wi.weave_id = w.id) AS quantity
       FROM weaves w
       JOIN users u ON u.id = w.receiver_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN org_units ru ON ru.id = w.receiver_org_unit_id
       WHERE w.post_id = ? AND w.status IN ('requested', 'approved', 'completed')
       ORDER BY w.created_at DESC, w.id DESC`,
      [posts[0].id],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      quantity: Number(row.quantity),
      receiver: { name: String(row.receiver_name) },
      receiverUnit:
        row.receiver_org_unit_id == null
          ? null
          : { id: Number(row.receiver_org_unit_id), name: String(row.receiver_org_unit_name) },
    }));
  },

  /** 代表單位上架：Share、Internal */
  async createItem(
    access: OrgAccess,
    userId: number,
    input: CreateOrgItemInput,
  ): Promise<OrgItem> {
    assertManages(access, input.unitId);
    const publicId = randomUUID();
    const defaultWeight = defaultUnitWeightKg(input.orgCategory);
    const weightIsDefault =
      defaultWeight !== null && Math.abs(defaultWeight - input.unitWeightKg) < 1e-9;

    const { postId, fileJobs } = await withTransaction(async (connection) => {
      const [post] = await connection.execute<ResultSetHeader>(
        `INSERT INTO posts (public_id, user_id, org_id, org_unit_id, audience_tier, title, content,
                            status, type, category_id, condition_level, expires_at)
         VALUES (?, ?, ?, ?, 'internal', ?, ?, 'active', 'share', ?, ?, NULL)`,
        [
          publicId,
          userId,
          access.orgId,
          input.unitId,
          input.title,
          input.content,
          publicCategoryIdOf(input.orgCategory),
          input.conditionLevel,
        ],
      );
      const postId = post.insertId;

      await connection.execute(
        `INSERT INTO org_post_details (post_id, org_category, quantity, unit_weight_kg,
                                       weight_is_default, asset_number, estimated_value_twd)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          postId,
          input.orgCategory,
          input.quantity,
          input.unitWeightKg,
          weightIsDefault ? 1 : 0,
          input.assetNumber,
          input.estimatedValueTwd,
        ],
      );

      //* Weave 請求以 items 計件數（INSUFFICIENT_STOCK），組織物品一篇一個品項
      await connection.execute(
        "INSERT INTO items (post_id, title, quantity) VALUES (?, ?, ?)",
        [postId, input.title, input.quantity],
      );

      const fileJobs = input.stagingKeys.map((stagingKey) => ({
        stagingKey,
        s3Key: `posts/${Date.now()}-${randomUUID()}.webp`,
      }));
      if (fileJobs.length > 0) {
        await connection.query(
          "INSERT INTO images (post_id, s3_key, alt_text) VALUES ?",
          [fileJobs.map((job) => [postId, job.s3Key, `Image for post ${postId}`])],
        );
      }
      return { postId, fileJobs };
    });

    if (fileJobs.length > 0) {
      await enqueuePostUploadImages({ postId, files: fileJobs });
    }
    await enqueuePostEmbedding({
      postId,
      post: {
        title: input.title,
        content: input.content,
        type: "share",
        categoryId: publicCategoryIdOf(input.orgCategory),
        conditionLevel: input.conditionLevel,
        items: [{ title: input.title, quantity: input.quantity }],
      },
    });

    const [item] = await queryItems(access.orgId, { publicId });
    return item;
  },
};
