//* 組織貼文的發文者顯示（#140，PRD 0001 §5.1「公開層顯示」；ADR 0004）
//* 組織物品對外以組織名義出現：organizations.publisher_display 決定顯示組織名稱（預設）、組織＋單位或匿名。
//* 所有顯示發文者的地方（卡片、詳情、Weave、通知、私訊、SEO metadata）都經過這裡，不出現窗口個人帳號：
//* - 名稱、頭像、email、users.public_id、數字 user_id 都換掉或拿掉（數字 id 也能把組織物品與窗口的個人貼文連起來）
//* - 要私訊或申請時，client 拿到的是「聯絡代號」`org-post:<貼文 public_id>`，server 再解析成經手窗口
//*   （posts.user_id，交接後自動換人）；對話裡的對方則是 `org-conv:<conversation id>`
//* - 公開介面（Feed、搜尋、詳情、個人頁）對所有人遮蔽，只有經手窗口自己看詳情時不遮；
//*   兩人之間的畫面（Weave、通知、私訊）只對不是該組織成員的人遮蔽，同組織的同事照舊看到彼此
import type { RowDataPacket } from "mysql2/promise";

export const PUBLISHER_DISPLAYS = ["org", "org_unit", "anonymous"] as const;
export type PublisherDisplay = (typeof PUBLISHER_DISPLAYS)[number];

export const ANONYMOUS_PUBLISHER_NAME = "匿名";

/** 能執行 query() 的 pool 或 connection（IN (?) 需要 query 展開陣列） */
export interface PublisherDb {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
}

export function publisherName(input: {
  display: PublisherDisplay;
  orgName: string;
  unitName: string | null;
}): string {
  if (input.display === "anonymous") return ANONYMOUS_PUBLISHER_NAME;
  if (input.display === "org_unit" && input.unitName) return `${input.orgName} · ${input.unitName}`;
  return input.orgName;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POST_TOKEN = "org-post:";
const CONVERSATION_TOKEN = "org-conv:";

/** 組織貼文的聯絡代號：私訊、申請時取代窗口的 users.public_id */
export function orgPostContactToken(postPublicId: string): string {
  return `${POST_TOKEN}${postPublicId}`;
}

/** 組織對話裡對方的代號：在這個對話裡回訊息時取代對方的 users.public_id */
export function orgConversationToken(conversationId: number): string {
  return `${CONVERSATION_TOKEN}${conversationId}`;
}

export type ContactToken =
  | { kind: "post"; postPublicId: string }
  | { kind: "conversation"; conversationId: number };

/** 解析聯絡代號；一般的 users.public_id（或格式不對）回 null */
export function parseContactToken(value: string): ContactToken | null {
  if (value.startsWith(POST_TOKEN)) {
    const id = value.slice(POST_TOKEN.length);
    return UUID.test(id) ? { kind: "post", postPublicId: id.toLowerCase() } : null;
  }
  if (value.startsWith(CONVERSATION_TOKEN)) {
    const raw = value.slice(CONVERSATION_TOKEN.length);
    return /^[1-9]\d{0,17}$/.test(raw) ? { kind: "conversation", conversationId: Number(raw) } : null;
  }
  return null;
}

export interface OrgPublisherInfo {
  name: string;
  display: PublisherDisplay;
}

async function rowsOf(db: PublisherDb, sql: string, params: unknown[]): Promise<RowDataPacket[]> {
  const [rows] = (await db.query(sql, params)) as [RowDataPacket[], unknown];
  return rows;
}

/** 一批組織與單位的顯示資訊；key 是 orgId 與 `${orgId}:${unitId}` */
export async function loadPublisherNames(
  db: PublisherDb,
  pairs: ReadonlyArray<{ orgId: number; unitId: number | null }>,
): Promise<{ orgName: (orgId: number) => string; nameOf: (orgId: number, unitId: number | null) => string }> {
  const orgIds = [...new Set(pairs.map((p) => p.orgId))];
  const unitIds = [...new Set(pairs.flatMap((p) => (p.unitId == null ? [] : [p.unitId])))];
  const orgs = new Map<number, { name: string; display: PublisherDisplay }>();
  const units = new Map<number, string>();
  if (orgIds.length > 0) {
    for (const row of await rowsOf(
      db,
      "SELECT id, name, publisher_display FROM organizations WHERE id IN (?)",
      [orgIds],
    )) {
      orgs.set(Number(row.id), {
        name: String(row.name),
        display: row.publisher_display as PublisherDisplay,
      });
    }
  }
  if (unitIds.length > 0) {
    for (const row of await rowsOf(db, "SELECT id, name FROM org_units WHERE id IN (?)", [unitIds])) {
      units.set(Number(row.id), String(row.name));
    }
  }
  const nameOf = (orgId: number, unitId: number | null) => {
    const org = orgs.get(orgId);
    //* 查不到組織（不該發生）也不退回個人名稱
    if (!org) return ANONYMOUS_PUBLISHER_NAME;
    return publisherName({
      display: org.display,
      orgName: org.name,
      unitName: unitId == null ? null : (units.get(unitId) ?? null),
    });
  };
  //* 對話沒有單位脈絡：組織＋單位的設定只顯示組織名稱
  return { orgName: (orgId) => nameOf(orgId, null), nameOf };
}

/** 貼文列的發文者欄位（feed、列表、詳情共用的 SELECT 別名） */
export interface PublisherRow {
  public_id: string;
  org_id?: number | null;
  org_unit_id?: number | null;
  user_id?: number | null;
  author_user_id?: number | null;
  username?: string | null;
  author_public_id?: string | null;
  avatar_url?: string | null;
  email?: string | null;
  [key: string]: unknown;
}

/**
 * 把組織貼文的發文者換成組織名義（就地修改並回傳同一批列）。
 * @param viewerUserId 只有經手窗口本人看自己的物品時不遮
 */
export async function maskOrgPublishers<T extends object>(
  db: PublisherDb,
  input: T[],
  options: { viewerUserId?: number | null } = {},
): Promise<T[]> {
  const rows = input as unknown as PublisherRow[];
  const orgRows = rows.filter(
    (row) =>
      row.org_id != null &&
      !(options.viewerUserId != null && Number(row.user_id) === Number(options.viewerUserId)),
  );
  if (orgRows.length === 0) return input;
  const names = await loadPublisherNames(
    db,
    orgRows.map((row) => ({
      orgId: Number(row.org_id),
      unitId: row.org_unit_id == null ? null : Number(row.org_unit_id),
    })),
  );
  for (const row of orgRows) {
    const name = names.nameOf(Number(row.org_id), row.org_unit_id == null ? null : Number(row.org_unit_id));
    Object.assign(row, {
      username: name,
      author_public_id: orgPostContactToken(row.public_id),
      user_id: null,
      author_user_id: null,
      avatar_url: null,
      publisher: { type: "org", name },
    });
    delete row.email;
  }
  return input;
}

/** 使用者是不是這個組織的成員（同組織的同事在 Weave、通知、私訊裡照舊看到彼此） */
export async function isOrgMember(db: PublisherDb, orgId: number, userId: number): Promise<boolean> {
  const rows = await rowsOf(
    db,
    "SELECT 1 FROM org_memberships WHERE org_id = ? AND user_id = ? LIMIT 1",
    [orgId, userId],
  );
  return rows.length > 0;
}

/**
 * 兩人之間的畫面（通知、Weave）裡，組織方要以什麼名稱出現在這位讀者面前：
 * 貼文是組織物品且讀者不是該組織成員 → 組織顯示名稱；否則 null（照舊顯示個人）
 */
export async function orgSideNameFor(
  db: PublisherDb,
  postId: number,
  viewerUserId: number,
): Promise<string | null> {
  const posts = await rowsOf(db, "SELECT org_id, org_unit_id FROM posts WHERE id = ?", [postId]);
  if (posts.length === 0 || posts[0].org_id == null) return null;
  const orgId = Number(posts[0].org_id);
  if (await isOrgMember(db, orgId, viewerUserId)) return null;
  const names = await loadPublisherNames(db, [
    { orgId, unitId: posts[0].org_unit_id == null ? null : Number(posts[0].org_unit_id) },
  ]);
  return names.nameOf(orgId, posts[0].org_unit_id == null ? null : Number(posts[0].org_unit_id));
}

/**
 * 留言：經手窗口在自己的組織物品下留言或回覆時，同樣以組織名義顯示（就地修改並回傳同一批列）
 */
export async function maskOrgComments<T extends object>(
  db: PublisherDb,
  postId: number,
  comments: T[],
  options: { viewerUserId?: number | null } = {},
): Promise<T[]> {
  if (comments.length === 0) return comments;
  const posts = await rowsOf(
    db,
    "SELECT public_id, user_id, org_id, org_unit_id FROM posts WHERE id = ?",
    [postId],
  );
  if (posts.length === 0 || posts[0].org_id == null) return comments;
  const post = posts[0];
  const handlerId = Number(post.user_id);
  //* 窗口本人看自己的留言時不遮（編輯、刪除依 user_id 判斷）
  if (options.viewerUserId != null && Number(options.viewerUserId) === handlerId) return comments;
  const rows = comments as unknown as Array<Record<string, unknown>>;
  const mine = rows.filter((c) => Number(c.user_id) === handlerId);
  if (mine.length === 0) return comments;
  const orgId = Number(post.org_id);
  const unitId = post.org_unit_id == null ? null : Number(post.org_unit_id);
  const name = (await loadPublisherNames(db, [{ orgId, unitId }])).nameOf(orgId, unitId);
  for (const c of mine) {
    Object.assign(c, {
      username: name,
      avatar_url: null,
      user_id: null,
      public_id: orgPostContactToken(String(post.public_id)),
    });
  }
  return comments;
}
