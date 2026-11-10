//* 組織物品（#136，PRD 0001 §5.1 E2-1、E3、E4-1、E6-2；ADR 0003、ADR 0004、ADR 0005）
//* - 物品屬於單位（posts.org_unit_id），posts.user_id 是經手上架的人
//* - 只能是 Share、上架後一律在 Internal；不開放 ECPay 與 Lalamove（paymentService 擋 org 貼文）
//* - 能管哪些單位（OrgAccess.manageableUnits）：Org Admin 與 Platform Admin → 全部單位；Unit Contact → 自己負責的單位
//* - 看得到哪些層級：membership 推導（scopeFromMemberships）；Platform Admin 在每個組織都是 Internal
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
  afterTierChange,
  changePostTier,
  listTierEvents,
  TierEvent,
} from "./orgTierService";
import type { Server } from "socket.io";
import type { AutoReleaseOverride } from "./orgAutoReleaseService";
import {
  cancelPendingPublic,
  getPublicListing,
  itemPendingPublic,
  lockPendingRow,
  skipPendingPublic,
  startPendingPublic,
} from "./orgPendingPublicService";
import type { PublicListing, PublicListingInput } from "./orgPublicListing";
import { buildTimeline, findTimelinePost, TimelineEntry } from "./orgTimelineService";
import {
  defaultUnitWeightKg,
  OrgItemCategoryId,
  publicCategoryIdOf,
} from "./orgItemCategories";
import { displayNameSql } from "../utils/displayName";
import { tierNotAllowed, unitNotManaged } from "./orgErrors";

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
  /** 是全站 Platform Admin（isAdmin 也為 true）；不一定是這個組織的成員 */
  isPlatformAdmin: boolean;
  /** 可代表上架、可在後台管理的單位 */
  manageableUnits: OrgUnitRef[];
  /** 組織的 Auto Release 設定（#139）；單件可覆寫 */
  autoRelease: { enabled: boolean; days: number };
  /** 演示組織（#140）：管理員可跳過 10 分鐘待公開期 */
  isDemo: boolean;
}

/** 單件 Auto Release 覆寫（#139）：org = 跟組織設定；auto 帶天數；manual = 不自動升級 */
export type ItemAutoReleaseInput =
  | { mode: "org" }
  | { mode: "manual" }
  | { mode: "auto"; days: number };

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
  /** 上架時登記的數量（報表用）；交織完成後不變 */
  quantity: number | null;
  /** 目前還能交織的數量：items 的庫存加總，交織完成時扣減；沒有 items 列為 null */
  remainingQuantity: number | null;
  unitWeightKg: number | null;
  weightIsDefault: boolean | null;
  assetNumber: string | null;
  estimatedValueTwd: number | null;
  s3Keys: string[];
  /** 待核可（requested）的申請數 */
  pendingRequestCount: number;
  /** 單件 Auto Release 覆寫；override 為 null 表示跟組織設定，days 只在 auto 時有值 */
  autoRelease: { override: AutoReleaseOverride | null; days: number | null };
  /** 待公開期（#140）：到 dueAt 才正式升到 Public；沒有待公開為 null */
  pendingPublic: { dueAt: string } | null;
}

/** 去向（E9-3）：一筆完成的 Weave 把物品交給了哪個單位或個人（receiverUnit 為 null 是個人領取） */
export interface OrgItemOutcome {
  weaveId: number;
  completedAt: string;
  quantity: number;
  receiver: { name: string };
  receiverUnit: OrgUnitRef | null;
}

/** 後台清單（閒置清單）的一列：加上去向 */
export interface ManagedOrgItem extends OrgItem {
  outcomes: OrgItemOutcome[];
}

/** 組織頁卡片：不含財產編號與估算價值 */
export type OrgPagePost = Pick<
  OrgItem,
  "id" | "title" | "audienceTier" | "createdAt" | "unit" | "orgCategory" | "quantity" | "remainingQuantity" | "s3Keys"
>;

const LIST_LIMIT = 500;


interface MembershipRow extends RowDataPacket {
  id: number;
  public_id: string;
  name: string;
  auto_release_enabled: boolean | number;
  auto_release_days: number;
  is_demo: boolean | number;
  /** Platform Admin 不是成員的組織：membership 欄位都是 null */
  membership_id: number | null;
  access_level: AccessLevel | null;
  org_role: OrgRole | null;
  is_platform_admin: boolean | number;
}

async function loadAccesses(
  userId: number,
  orgPublicId?: string,
): Promise<OrgAccess[]> {
  //* Platform Admin（users.role = 'admin'）在每個組織都等同 Org Admin（ADR 0003，2026-11-09），不必是成員
  const [rows] = await dbPool.query<MembershipRow[]>(
    `SELECT o.id, o.public_id, o.name, o.auto_release_enabled, o.auto_release_days, o.is_demo, m.id AS membership_id, m.access_level, m.org_role, u.role = 'admin' AS is_platform_admin
     FROM organizations o
     JOIN users u ON u.id = ?
     LEFT JOIN org_memberships m ON m.org_id = o.id AND m.user_id = u.id
     WHERE (m.id IS NOT NULL OR u.role = 'admin')${orgPublicId ? " AND o.public_id = ?" : ""}
     ORDER BY o.name`,
    orgPublicId ? [userId, orgPublicId] : [userId],
  );
  if (rows.length === 0) return [];

  const contactUnits = new Map<number, OrgUnitRef[]>();
  const membershipIds = rows
    .map((row) => row.membership_id)
    .filter((id): id is number => id != null);
  //* IN (?) 需要 query() 展開陣列；空陣列會變成 IN ()，所以沒有 membership 就不查
  const [contacts] = membershipIds.length
    ? await dbPool.query<RowDataPacket[]>(
        `SELECT c.membership_id, u.id, u.name
     FROM org_unit_contacts c JOIN org_units u ON u.id = c.org_unit_id
     WHERE c.membership_id IN (?) ORDER BY u.name`,
        [membershipIds],
      )
    : [[] as RowDataPacket[]];
  for (const contact of contacts) {
    const membershipId = Number(contact.membership_id);
    const units = contactUnits.get(membershipId) ?? [];
    units.push({ id: Number(contact.id), name: String(contact.name) });
    contactUnits.set(membershipId, units);
  }

  const isAdminRow = (row: MembershipRow) =>
    row.org_role === "admin" || Boolean(Number(row.is_platform_admin));
  //* Org Admin 能管全部單位：所有管理的組織一次查完，Platform Admin 有很多組織時也只多一次查詢
  const unitsByOrg = await listUnitsByOrg(
    rows.filter(isAdminRow).map((row) => Number(row.id)),
  );

  return rows.map((row) => {
    const isPlatformAdmin = Boolean(Number(row.is_platform_admin));
    const isAdmin = isAdminRow(row);
    const manageableUnits = isAdmin
      ? (unitsByOrg.get(Number(row.id)) ?? [])
      : (contactUnits.get(Number(row.membership_id)) ?? []);
    return {
      orgId: Number(row.id),
      publicId: row.public_id,
      name: row.name,
      accessLevel: isPlatformAdmin ? "internal" : row.access_level!,
      isPlatformAdmin,
      isAdmin,
      manageableUnits,
      autoRelease: {
        enabled: Boolean(Number(row.auto_release_enabled)),
        days: Number(row.auto_release_days),
      },
      isDemo: Boolean(Number(row.is_demo)),
    };
  });
}

/** 這些組織各自的全部單位，依名稱排序。IN (?) 需要 query() 展開陣列，空陣列就不查 */
async function listUnitsByOrg(orgIds: number[]): Promise<Map<number, OrgUnitRef[]>> {
  const byOrg = new Map<number, OrgUnitRef[]>();
  if (orgIds.length === 0) return byOrg;
  const [rows] = await dbPool.query<RowDataPacket[]>(
    "SELECT id, name, org_id FROM org_units WHERE org_id IN (?) ORDER BY name",
    [orgIds],
  );
  for (const row of rows) {
    const orgId = Number(row.org_id);
    const units = byOrg.get(orgId) ?? [];
    units.push({ id: Number(row.id), name: String(row.name) });
    byOrg.set(orgId, units);
  }
  return byOrg;
}

/** 檢視者在這個組織看得到的層級：membership 的 Internal／Members，加上 Public */
export function visibleTiers(accessLevel: AccessLevel): AudienceTier[] {
  const [access] = scopeFromMemberships([{ orgId: 0, accessLevel }]).orgs;
  return [...access.tiers, "public"];
}


/**
 * 誰能改成哪一層（PRD 0001 §5.1）：Unit Contact 只能把自己單位的物品從 Internal 升到 Members；
 * Org Admin 可升降任何單位的物品，含從 Public 降級。升到 Public 一律走待公開流程（#140，
 * orgPendingPublicService），這裡拒絕。
 */
function assertTierChangeAllowed(
  access: OrgAccess,
  post: { fromTier: AudienceTier; orgUnitId: number },
  toTier: AudienceTier,
) {
  assertManages(access, post.orgUnitId);
  if (toTier === "public") throw tierNotAllowed();
  if (access.isAdmin) return;
  if (!(post.fromTier === "internal" && toTier === "members")) throw tierNotAllowed();
}

/** 後台：能管這件物品所屬單位的人才找得到它，否則 404／403 */
async function findManagedPost(access: OrgAccess, itemPublicId: string): Promise<number> {
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
  return Number(posts[0].id);
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
    remainingQuantity:
      row.remaining_quantity == null ? null : Number(row.remaining_quantity),
    unitWeightKg: row.unit_weight_kg === null ? null : Number(row.unit_weight_kg),
    weightIsDefault:
      row.weight_is_default === null ? null : Boolean(Number(row.weight_is_default)),
    assetNumber: row.asset_number ?? null,
    estimatedValueTwd:
      row.estimated_value_twd === null ? null : Number(row.estimated_value_twd),
    s3Keys: row.s3_keys ? String(row.s3_keys).split(",") : [],
    pendingRequestCount: Number(row.pending_request_count ?? 0),
    autoRelease: {
      override: row.auto_release_override ?? null,
      days: row.auto_release_days == null ? null : Number(row.auto_release_days),
    },
    pendingPublic: row.pending_public_due_at
      ? { dueAt: new Date(row.pending_public_due_at).toISOString() }
      : null,
  };
}

/** 這些貼文完成的 Weave，依完成時間排；key 是 posts.id */
async function queryOutcomes(postIds: number[]): Promise<Map<number, OrgItemOutcome[]>> {
  const byPost = new Map<number, OrgItemOutcome[]>();
  if (postIds.length === 0) return byPost;
  //* IN (?) 需要 query() 展開陣列
  const [rows] = await dbPool.query<RowDataPacket[]>(
    `SELECT w.id, w.post_id, w.completed_at, w.receiver_org_unit_id,
            ru.name AS receiver_org_unit_name,
            ${displayNameSql()} AS receiver_name,
            (SELECT COALESCE(SUM(wi.quantity), 0) FROM weave_items wi WHERE wi.weave_id = w.id) AS quantity
     FROM weaves w
     JOIN users u ON u.id = w.receiver_id
     LEFT JOIN user_profiles up ON up.user_id = u.id
     LEFT JOIN org_units ru ON ru.id = w.receiver_org_unit_id
     WHERE w.post_id IN (?) AND w.status = 'completed'
     ORDER BY w.completed_at, w.id`,
    [postIds],
  );
  for (const row of rows) {
    const postId = Number(row.post_id);
    const list = byPost.get(postId) ?? [];
    list.push({
      weaveId: Number(row.id),
      completedAt: new Date(row.completed_at).toISOString(),
      quantity: Number(row.quantity),
      receiver: { name: String(row.receiver_name) },
      receiverUnit:
        row.receiver_org_unit_id == null
          ? null
          : { id: Number(row.receiver_org_unit_id), name: String(row.receiver_org_unit_name) },
    });
    byPost.set(postId, list);
  }
  return byPost;
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
  return (await queryItemRows(orgId, filters)).map((row) => row.item);
}

/** 同 queryItems，另附 posts.id（只在 server 用，不回給 client） */
async function queryItemRows(
  orgId: number,
  filters: ListQuery,
): Promise<{ postId: number; item: OrgItem }[]> {
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
            d.asset_number, d.estimated_value_twd, d.auto_release_override, d.auto_release_days, d.pending_public_due_at,
            (SELECT GROUP_CONCAT(i.s3_key ORDER BY i.id) FROM images i WHERE i.post_id = p.id) AS s3_keys,
            (SELECT SUM(GREATEST(it.quantity - it.reserved_quantity, 0)) FROM items it WHERE it.post_id = p.id) AS remaining_quantity,
            (SELECT COUNT(*) FROM weaves w WHERE w.post_id = p.id AND w.status = 'requested') AS pending_request_count
     FROM posts p
     JOIN org_units u ON u.id = p.org_unit_id
     LEFT JOIN org_post_details d ON d.post_id = p.id
     WHERE p.org_id = ? AND p.deleted_at IS NULL${where}
     ORDER BY p.created_at DESC, p.id DESC LIMIT ${LIST_LIMIT}`,
    params,
  );
  return rows.map((row) => ({ postId: Number(row.id), item: toOrgItem(row) }));
}

export const orgItemService = {
  /** 呼叫者所屬的組織（組織頁切換器）；Platform Admin 得到每個組織 */
  listAccesses(userId: number): Promise<OrgAccess[]> {
    return loadAccesses(userId);
  },

  /** 呼叫者在這個組織的身分；不是成員也不是 Platform Admin 回 404 ORG_NOT_FOUND（不洩漏組織存在） */
  async requireAccess(orgPublicId: string, userId: number): Promise<OrgAccess> {
    const [access] = await loadAccesses(userId, orgPublicId);
    if (!access) throw orgNotFound();
    return access;
  },

  /**
   * 組織頁：這個組織中呼叫者層級看得到、仍上架中、還有剩的物品。
   * 拿完的（剩餘 0）只留在後台清單；沒有 items 列的（remainingQuantity 為 null）照常列出
   */
  async listOrgPagePosts(access: OrgAccess): Promise<OrgPagePost[]> {
    const items = await queryItems(access.orgId, {
      tiers: visibleTiers(access.accessLevel),
      status: "active",
    });
    return items.filter((item) => item.remainingQuantity !== 0).map(
      ({
        id,
        title,
        audienceTier,
        createdAt,
        unit,
        orgCategory,
        quantity,
        remainingQuantity,
        s3Keys,
      }) => ({
        id,
        title,
        audienceTier,
        createdAt,
        unit,
        orgCategory,
        quantity,
        remainingQuantity,
        s3Keys,
      }),
    );
  },

  /**
   * 後台清單（全組織閒置物品清單與去向，E3、E9-3）：Unit Contact 只有自己單位，Org Admin 全組織；
   * 每件附上去向（完成的 Weave 交給了哪個單位或個人）
   */
  async listManagedItems(
    access: OrgAccess,
    filters: OrgItemFilters,
  ): Promise<ManagedOrgItem[]> {
    if (access.manageableUnits.length === 0) throw unitNotManaged();
    const unitIds =
      filters.unitId !== undefined
        ? [assertManages(access, filters.unitId).id]
        : access.manageableUnits.map((u) => u.id);
    const rows = await queryItemRows(access.orgId, {
      unitIds,
      tiers: filters.tier ? [filters.tier] : undefined,
      status: filters.status,
      weaveStatus: filters.weaveStatus,
    });
    const outcomes = await queryOutcomes(rows.map((row) => row.postId));
    return rows.map(({ postId, item }) => ({
      ...item,
      outcomes: outcomes.get(postId) ?? [],
    }));
  },

  /**
   * 後台：一件物品的申請，新的在前。只給能管這個單位的人（窗口或 Org Admin）看；
   * 核可／婉拒走 PATCH /api/weaves/:id/status（orgWeaveService.canReviewOrgRequest）
   */
  async listItemRequests(
    access: OrgAccess,
    itemPublicId: string,
  ): Promise<OrgItemRequest[]> {
    const postId = await findManagedPost(access, itemPublicId);

    const [rows] = await dbPool.execute<RowDataPacket[]>(
      `SELECT w.id, w.status, w.created_at, w.receiver_org_unit_id,
              ru.name AS receiver_org_unit_name,
              ${displayNameSql()} AS receiver_name,
              (SELECT COALESCE(SUM(wi.quantity), 0) FROM weave_items wi WHERE wi.weave_id = w.id) AS quantity
       FROM weaves w
       JOIN users u ON u.id = w.receiver_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN org_units ru ON ru.id = w.receiver_org_unit_id
       WHERE w.post_id = ? AND w.status IN ('requested', 'approved', 'completed')
       ORDER BY w.created_at DESC, w.id DESC`,
      [postId],
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

  /**
   * 後台：改物品層級（升到 Members、降回 Internal）。降級時看不到新層級的人的 Requested 請求自動婉拒。
   * 權限見 assertTierChangeAllowed；貼文鎖住後才判斷，同時升降不會互相覆蓋
   */
  async changeItemTier(
    access: OrgAccess,
    userId: number,
    itemPublicId: string,
    toTier: AudienceTier,
    io: Server | null,
  ): Promise<OrgItem> {
    if (access.manageableUnits.length === 0) throw unitNotManaged();
    const result = await withTransaction(async (connection) => {
      //* 待公開期間不能改層級，要先取消（否則時間到時會從新的層級直接公開）
      const pending = await lockPendingRow(connection, access.orgId, itemPublicId);
      if (pending.dueAt) {
        assertManages(access, pending.orgUnitId);
        throw itemPendingPublic();
      }
      return changePostTier(connection, {
        orgId: access.orgId,
        postPublicId: itemPublicId,
        toTier,
        actor: { type: "user", userId },
        authorize: (post) => assertTierChangeAllowed(access, post, toTier),
      });
    });
    await afterTierChange(result, { io, actorName: access.name, actorUserId: userId });
    const [item] = await queryItems(access.orgId, { publicId: itemPublicId });
    return item;
  },

  /**
   * 後台：單件 Auto Release 覆寫（#139）。該單位的窗口或 Org Admin 可設；
   * 只影響 Internal → Members 的自動升級，其他層級存著也不會動作
   */
  async setItemAutoRelease(
    access: OrgAccess,
    itemPublicId: string,
    input: ItemAutoReleaseInput,
  ): Promise<OrgItem> {
    const postId = await findManagedPost(access, itemPublicId);
    await dbPool.execute(
      "UPDATE org_post_details SET auto_release_override = ?, auto_release_days = ? WHERE post_id = ?",
      [
        input.mode === "org" ? null : input.mode,
        input.mode === "auto" ? input.days : null,
        postId,
      ],
    );
    const [item] = await queryItems(access.orgId, { publicId: itemPublicId });
    return item;
  },

  /** 後台：公開確認框預填目前的公開資訊（地點、到期日、分類、標籤）；只給 Org Admin */
  getPublicListing(access: OrgAccess, itemPublicId: string): Promise<PublicListing> {
    return getPublicListing(access, itemPublicId);
  },

  /**
   * 後台：Org Admin 把物品送進待公開（#140），同時寫入公開資訊。有財產編號的要帶 assetDisposalConfirmed: true
   */
  async startPendingPublic(
    access: OrgAccess,
    userId: number,
    itemPublicId: string,
    input: { assetDisposalConfirmed: boolean; listing: PublicListingInput },
  ): Promise<OrgItem> {
    await startPendingPublic(access, userId, itemPublicId, input);
    const [item] = await queryItems(access.orgId, { publicId: itemPublicId });
    return item;
  },

  /** 後台：取消待公開，維持原層級 */
  async cancelPendingPublic(
    access: OrgAccess,
    userId: number,
    itemPublicId: string,
  ): Promise<OrgItem> {
    await cancelPendingPublic(access, userId, itemPublicId);
    const [item] = await queryItems(access.orgId, { publicId: itemPublicId });
    return item;
  },

  /** 後台：演示組織的管理員跳過待公開期，立即公開 */
  async skipPendingPublic(
    access: OrgAccess,
    userId: number,
    itemPublicId: string,
    io: Server | null,
  ): Promise<OrgItem> {
    await skipPendingPublic(access, userId, itemPublicId, io);
    const [item] = await queryItems(access.orgId, { publicId: itemPublicId });
    return item;
  },

  /** 後台：一件物品的層級紀錄（誰、何時、從哪層到哪層），舊的在前 */
  async listItemTierEvents(access: OrgAccess, itemPublicId: string): Promise<TierEvent[]> {
    const postId = await findManagedPost(access, itemPublicId);
    return listTierEvents(dbPool, postId);
  },

  /**
   * 後台：一件物品的流轉時間軸（E9-1），舊的在前。只給能管這個單位的窗口或 Org Admin；
   * 已刪除的物品也查得到，紀錄不因刪除而消失
   */
  async listItemTimeline(access: OrgAccess, itemPublicId: string): Promise<TimelineEntry[]> {
    if (access.manageableUnits.length === 0) throw unitNotManaged();
    const post = await findTimelinePost(dbPool, access.orgId, itemPublicId);
    if (!post) throw new HttpError(404, "POST_NOT_FOUND", "Item not found");
    assertManages(access, post.orgUnitId);
    return buildTimeline(dbPool, post);
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
