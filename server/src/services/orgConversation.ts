//* 組織對話（#140、ADR 0004）：民眾私訊或申請組織物品時，對話由經手窗口的個人帳號接收，
//* 但民眾只看到組織名義。對話以 (兩人, 組織) 為單位，和兩人原本的個人對話分開（conversations.org_id），
//* 否則用窗口的個人帳號私訊時會落到同一個對話，等於揭露窗口是誰。
//* - 遮蔽：對話的組織方（conversations.org_user_id）在不是該組織成員的人面前顯示為組織，
//*   名稱、頭像、users.public_id 都換掉（含訊息的寄件人、系統訊息 metadata、Socket 推播）
//* - 回訊息：組織對話裡的對方一律是 `org-conv:<id>`，兩邊回訊息都留在這個對話裡
import type { RowDataPacket } from "mysql2/promise";
import type { SocketBroadcaster } from "../utils/socket";
import { Message, messageService } from "../utils/messageService";
import { viewerVisibility, SqlExecutor } from "./postVisibility";
import {
  ContactToken,
  loadPublisherNames,
  memberOrgIds,
  orgConversationToken,
  PublisherDb,
} from "./orgPublisher";

export interface OrgContext {
  orgId: number;
  /** 組織方（經手窗口） */
  orgUserId: number;
}

export interface ConversationOrgRow {
  id: number;
  org_id?: number | null;
  org_user_id?: number | null;
}

/** 這位檢視者在某個組織對話裡看到的組織方 */
export interface ConversationMask {
  maskedUserId: number;
  maskedPublicId: string | null;
  token: string;
  name: string;
}

type Db = PublisherDb & Pick<SqlExecutor, "execute">;

async function rowsOf(db: PublisherDb, sql: string, params: unknown[]): Promise<RowDataPacket[]> {
  const [rows] = (await db.query(sql, params)) as [RowDataPacket[], unknown];
  return rows;
}

/**
 * 這批對話裡，檢視者面前要遮蔽的組織方；key 是 conversation id。
 * 個人對話、檢視者自己就是組織方、或檢視者是該組織成員 → 不遮
 */
export async function loadConversationMasks(
  db: PublisherDb,
  viewerId: number,
  conversations: readonly ConversationOrgRow[],
): Promise<Map<number, ConversationMask>> {
  const masks = new Map<number, ConversationMask>();
  const candidates = conversations.filter(
    (c) => c.org_id != null && c.org_user_id != null && Number(c.org_user_id) !== viewerId,
  );
  if (candidates.length === 0) return masks;
  const orgIds = [...new Set(candidates.map((c) => Number(c.org_id)))];
  const memberOf = await memberOrgIds(db, viewerId, orgIds);
  const masked = candidates.filter((c) => !memberOf.has(Number(c.org_id)));
  if (masked.length === 0) return masks;
  const names = await loadPublisherNames(
    db,
    masked.map((c) => ({ orgId: Number(c.org_id), unitId: null })),
  );
  const userIds = [...new Set(masked.map((c) => Number(c.org_user_id)))];
  const publicIds = new Map(
    (await rowsOf(db, "SELECT id, public_id FROM users WHERE id IN (?)", [userIds])).map((r) => [
      Number(r.id),
      String(r.public_id),
    ]),
  );
  for (const c of masked) {
    const userId = Number(c.org_user_id);
    masks.set(Number(c.id), {
      maskedUserId: userId,
      maskedPublicId: publicIds.get(userId) ?? null,
      token: orgConversationToken(Number(c.id)),
      name: names.orgName(Number(c.org_id)),
    });
  }
  return masks;
}

/** 對話列表／標頭的對方欄位 */
export interface ConversationView extends ConversationOrgRow {
  other_public_id?: string;
  other_username?: string;
  other_avatar_url?: string | null;
}

/** 組織對話的對方改成 `org-conv:<id>`（回訊息不會落到個人對話）；要遮的再換名稱與頭像 */
export function presentConversation<T extends ConversationView>(
  conversation: T,
  mask: ConversationMask | undefined,
): T {
  const shown = { ...conversation };
  if (shown.org_id != null) shown.other_public_id = orgConversationToken(Number(shown.id));
  if (mask) {
    shown.other_username = mask.name;
    shown.other_avatar_url = null;
  }
  delete shown.org_user_id;
  return shown;
}

export interface MessageView {
  sender_id?: number;
  sender_public_id?: string;
  sender_name?: string;
  sender_avatar?: string | null;
  metadata?: unknown;
}

/** 組織方寄的訊息在不是成員的人面前換成組織；系統訊息裡的發文者 public_id 也換掉 */
export function presentMessage<T extends MessageView>(message: T, mask: ConversationMask | undefined): T {
  if (!mask) return message;
  const shown = { ...message };
  if (Number(shown.sender_id) === mask.maskedUserId) {
    shown.sender_public_id = mask.token;
    shown.sender_name = mask.name;
    shown.sender_avatar = null;
  }
  if (shown.metadata) {
    const metadata =
      typeof shown.metadata === "string" ? safeParse(shown.metadata) : { ...(shown.metadata as object) };
    if (metadata && typeof metadata === "object") {
      const meta = metadata as Record<string, unknown>;
      if (meta.post_author_public_id && meta.post_author_public_id === mask.maskedPublicId) {
        meta.post_author_public_id = mask.token;
      }
      shown.metadata = meta;
    }
  }
  return shown;
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** 檢視者在這個對話裡要遮蔽的組織方（單一對話：訊息歷史、Socket 推播） */
export async function loadConversationMask(
  db: PublisherDb,
  viewerId: number,
  conversationId: number,
): Promise<ConversationMask | undefined> {
  const rows = await rowsOf(db, "SELECT id, org_id, org_user_id FROM conversations WHERE id = ?", [
    conversationId,
  ]);
  if (rows.length === 0) return undefined;
  const masks = await loadConversationMasks(db, viewerId, [
    { id: Number(rows[0].id), org_id: rows[0].org_id, org_user_id: rows[0].org_user_id },
  ]);
  return masks.get(conversationId);
}

/**
 * 把一則訊息以 `new_message` 推給對話裡的每位檢視者，各自依視角遮蔽組織方（#140）。
 * `fallbackSenderPublicId`：剛寫入的訊息沒有 join 寄件人的 public_id，由呼叫端補上
 */
export async function emitNewMessage(
  io: SocketBroadcaster,
  db: PublisherDb,
  message: Message,
  viewerIds: readonly number[],
  fallbackSenderPublicId?: string,
): Promise<void> {
  const conversationId = message.conversation_id;
  for (const viewerId of new Set(viewerIds)) {
    const mask = await loadConversationMask(db, viewerId, conversationId);
    io.to(`user_${viewerId}`).emit("new_message", {
      ...messageService.toMessageDTO(presentMessage(message, mask), fallbackSenderPublicId),
      conversation_id: conversationId,
    });
  }
}

/** 聯絡代號解析的結果：收件人、要開的組織對話，或既有的對話 */
export type ResolvedRecipient =
  | { recipientId: number; org: OrgContext; conversationId?: undefined }
  | { recipientId: number; org?: undefined; conversationId: number };

/**
 * 解析私訊的聯絡代號；看不到、不存在或不是自己的對話 → null（由呼叫端回 404）
 * - `org-post:<貼文>`：寄給這件組織物品現在的經手窗口，開 (寄件人, 窗口, 組織) 的組織對話
 * - `org-conv:<對話>`：寄件人必須在這個對話裡，收件人是另一方
 */
export async function resolveContactToken(
  db: Db,
  senderId: number,
  token: ContactToken,
): Promise<ResolvedRecipient | null> {
  if (token.kind === "post") {
    const visibility = await viewerVisibility(db, senderId);
    const [rows] = await db.execute<RowDataPacket[]>(
      `SELECT p.user_id, p.org_id FROM posts p WHERE p.public_id = ? AND p.deleted_at IS NULL AND ${visibility.sql}`,
      [token.postPublicId, ...visibility.params],
    );
    if (rows.length === 0 || rows[0].org_id == null) return null;
    const recipientId = Number(rows[0].user_id);
    if (recipientId === senderId) return null;
    return { recipientId, org: { orgId: Number(rows[0].org_id), orgUserId: recipientId } };
  }
  const rows = await rowsOf(db, "SELECT user1_id, user2_id FROM conversations WHERE id = ?", [
    token.conversationId,
  ]);
  if (rows.length === 0) return null;
  const [a, b] = [Number(rows[0].user1_id), Number(rows[0].user2_id)];
  if (senderId !== a && senderId !== b) return null;
  return { recipientId: senderId === a ? b : a, conversationId: token.conversationId };
}
