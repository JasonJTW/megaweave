import Router, { Request, Response, NextFunction } from "express";
import { requireAuth } from "./middleware/auth";
import { messageService } from "./utils/messageService";
import { Server } from "socket.io";
import { memoryUpload } from "./upload";
import { defaultImageStorage } from "./storage/ImageStorage";
import { randomUUID } from "crypto";
import { RowDataPacket } from "mysql2";
import dbPool from "./utils/db";
import { HttpError } from "./utils/httpError";
import { isPostVisibleTo } from "./services/postVisibility";
import { PostIdSchema } from "./utils/idSchemas";
import { parseContactToken } from "./services/orgPublisher";
import { z } from "zod";
import {
  emitNewMessage,
  loadConversationMask,
  loadConversationMasks,
  OrgContext,
  presentConversation,
  presentMessage,
  resolveContactToken,
} from "./services/orgConversation";

//* 收件人由 client 從 API 回應帶入（users.public_id 或組織聯絡代號）→ 格式錯是 client bug
const RecipientIdSchema = z.string().trim().min(1).max(64);

/**
 * 收件人：一般是 users.public_id；組織物品是聯絡代號（#140、ADR 0004），
 * `org-post:<貼文>` 寄給經手窗口並開組織對話，`org-conv:<對話>` 回到既有的組織對話。查不到 → null
 */
async function resolveRecipient(
  senderId: number,
  recipientPublicId: string,
): Promise<{ recipientId: number; org?: OrgContext; conversationId?: number } | null> {
  const token = parseContactToken(recipientPublicId);
  if (token) return resolveContactToken(dbPool, senderId, token);
  if (recipientPublicId.startsWith("org-")) return null;
  const recipientId = await messageService.getUserIdByPublicId(recipientPublicId);
  return recipientId ? { recipientId } : null;
}

const router = Router();

// GET /api/messages/conversations - List all conversations
router.get(
  "/conversations",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    // console.log(`[GET /conversations] Fetching for userId: ${userId}`);
    try {
      const conversations = await messageService.getUserConversations(userId);
      //* 組織對話的組織方對不是成員的人顯示為組織（#140）
      const masks = await loadConversationMasks(dbPool, userId, conversations);
      const dtos = conversations.map((c) =>
        messageService.toConversationDTO(presentConversation(c, masks.get(c.id))),
      );
      // console.log(
      //   `[GET /conversations] Found ${conversations.length} conversations`,
      // );
      return res.json({ conversations: dtos });
    } catch (error) {
      return next(error);
    }
  },
);

// GET /api/messages/conversations/:id - Get history
router.get(
  "/conversations/:id",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const conversationId = parseInt(req.params.id);
    const beforeId = req.query.before_id
      ? parseInt(req.query.before_id as string)
      : undefined;
    const limit = 20;

    try {
      // Security check
      const isMember = await messageService.isUserInConversation(
        conversationId,
        userId,
      );
      if (!isMember) {
        return next(
          new HttpError(
            403,
            "FORBIDDEN",
            "Not authorized to view this conversation",
          ),
        );
      }

      const messages = await messageService.getMessages(
        conversationId,
        limit,
        beforeId,
      );
      const conversation = await messageService.getConversationById(
        conversationId,
        userId,
      );

      const mask = await loadConversationMask(dbPool, userId, conversationId);
      return res.json({
        messages: messages.map((m) =>
          messageService.toMessageDTO(presentMessage(m, mask)),
        ),
        conversation: conversation
          ? messageService.toConversationDTO(presentConversation(conversation, mask))
          : null,
        hasMore: messages.length === limit,
      });
    } catch (error) {
      return next(error);
    }
  },
);

// POST /api/messages - Send message (Supports optional image attachments)
router.post(
  "/",
  requireAuth,
  memoryUpload.array("images", 10),
  async (req: Request, res: Response, next: NextFunction) => {
    const senderId = req.user!.userId;
    const senderPublicId = req.user!.public_id;
    const { recipient_public_id, content, item_id, item_title, post_id } =
      req.body;

    if (
      !recipient_public_id ||
      (!content &&
        (!req.files || (req.files as Express.Multer.File[]).length === 0))
    ) {
      return next(
        new HttpError(
          400,
          "MESSAGE_EMPTY",
          "Recipient and content or image are required",
        ),
      );
    }
    const recipientPublicId = RecipientIdSchema.safeParse(recipient_public_id);
    if (!recipientPublicId.success) {
      return next(new HttpError(400, "INVALID_REQUEST", "Invalid recipient"));
    }

    //* post_id 只要帶了就要合法；空字串視為沒帶
    let postId: number | undefined;
    if (post_id !== undefined && post_id !== "") {
      const parsed = PostIdSchema.safeParse(post_id);
      if (!parsed.success) {
        return next(new HttpError(400, "INVALID_REQUEST", "Invalid post id"));
      }
      postId = parsed.data;
    }

    try {
      // SECURITY: Map public_id (or an org contact token) to internal ID
      const recipient = await resolveRecipient(senderId, recipientPublicId.data);
      if (!recipient) {
        return next(
          new HttpError(404, "USER_NOT_FOUND", "Recipient not found"),
        );
      }
      const { recipientId } = recipient;

      // 私訊本身不受組織限制，但附帶的貼文資訊會讓雙方都看到，所以寄件人與收件人都要看得到（ADR 0003）；
      // 只要帶了 post_id 就檢查，並在上傳附件與寫入任何訊息前擋下。任一方看不到都回同一個 404，不洩漏是哪一方
      if (postId !== undefined) {
        const [senderSees, recipientSees] = await Promise.all([
          isPostVisibleTo(dbPool, postId, senderId),
          isPostVisibleTo(dbPool, postId, recipientId),
        ]);
        if (!senderSees || !recipientSees) {
          return next(new HttpError(404, "POST_NOT_FOUND", "Post not found"));
        }
      }

      // 0. Process Attachments if any
      const attachments: Array<{
        url: string;
        type: "image" | "video" | "file";
      }> = [];
      if (req.files && Array.isArray(req.files)) {
        const files = req.files as Express.Multer.File[];
        for (const file of files) {
          const { url } = await defaultImageStorage.upload(
            file.buffer,
            "messages",
            `${Date.now()}-${randomUUID()}.webp`,
          );
          attachments.push({ url, type: "image" });
        }
      }

      // 1. Get or Create Conversation（組織物品是組織對話，#140）
      const conversationId =
        recipient.conversationId ??
        (await messageService.getConversationId(senderId, recipientId, recipient.org));

      const io: Server = res.locals.io;

      // 2. If the user had a pending weaving intent, persist it as a system message first.
      //    This only happens on the FIRST real message sent for a given item.
      if (item_id && item_title) {
        let postType: string | undefined;
        let postAuthorPublicId: string | undefined;
        if (postId !== undefined) {
          const [postRows] = await dbPool.execute<RowDataPacket[]>(
            "SELECT p.type, u.public_id FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?",
            [postId],
          );
          if (postRows.length > 0) {
            postType = postRows[0].type;
            postAuthorPublicId = postRows[0].public_id;
          }
        }
        const sysMsg = await messageService.createMessage(
          conversationId,
          senderId,
          "Start Weaving",
          undefined,
          "system_start_weaving",
          {
            item_id,
            item_title,
            post_id: postId,
            post_type: postType,
            post_author_public_id: postAuthorPublicId,
          },
        );
        //* 推播依各自的視角遮蔽組織方（#140）
        if (io) {
          await emitNewMessage(io, dbPool, sysMsg, [recipientId, senderId], senderPublicId);
        }
      }

      // 3. Create the user's actual message
      const message = await messageService.createMessage(
        conversationId,
        senderId,
        content || "",
        attachments,
      );

      // 4. Socket Push
      const messageDTO = messageService.toMessageDTO(message, senderPublicId);

      console.log(
        `[POST /messages] res.locals.io instance:`,
        io ? "EXISTS" : "UNDEFINED",
      );
      if (io) {
        console.log(
          `[POST /messages] Emitting new_message to user_${recipientId} and user_${senderId}`,
        );
        // Push to the recipient and to the sender (multi-device sync), each masked for their view
        await emitNewMessage(io, dbPool, message, [recipientId, senderId], senderPublicId);
        console.log(`[POST /messages] Emission complete.`);
      } else {
        console.warn(
          `[POST /messages] WARNING: io is undefined, socket events not sent!`,
        );
      }

      res.status(201).json({ message: messageDTO, conversationId });
    } catch (error) {
      return next(error);
    }
  },
);

// POST /api/messages/start - Get or create conversation (no DB message written here)
router.post(
  "/start",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const senderId = req.user!.userId;
    const recipientPublicId = RecipientIdSchema.safeParse(req.body?.recipient_public_id);
    if (!recipientPublicId.success) {
      return next(
        new HttpError(400, "INVALID_REQUEST", "Recipient Public ID required"),
      );
    }

    try {
      const recipient = await resolveRecipient(senderId, recipientPublicId.data);
      if (!recipient) {
        return next(
          new HttpError(404, "USER_NOT_FOUND", "Recipient not found"),
        );
      }
      const conversationId =
        recipient.conversationId ??
        (await messageService.getConversationId(
          senderId,
          recipient.recipientId,
          recipient.org,
        ));

      return res.json({ conversationId });
    } catch (error) {
      return next(error);
    }
  },
);

// PATCH /api/messages/conversations/:id/read - Mark as read
router.patch(
  "/conversations/:id/read",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.user!.userId;
    const conversationId = parseInt(req.params.id);

    try {
      const isMember = await messageService.isUserInConversation(
        conversationId,
        userId,
      );
      if (!isMember) {
        return next(new HttpError(403, "FORBIDDEN", "Not authorized"));
      }

      await messageService.markConversationRead(conversationId, userId);

      // Notify both participants that messages have been read
      const io: Server = res.locals.io;
      if (io) {
        const conversation = await messageService.getConversationById(
          conversationId,
          userId,
        );
        if (conversation) {
          const otherUserId = conversation.other_user_id;
          console.log(
            `[PATCH /read] Notifying user_${otherUserId} and user_${userId} that messages are read in conv_${conversationId}`,
          );

          // Notify the other user (the sender)；組織方讀取時，不是成員的對方只看到組織代號（#140）
          const otherMask = otherUserId
            ? await loadConversationMask(dbPool, otherUserId, conversationId)
            : undefined;
          io.to(`user_${otherUserId}`).emit("messages_read", {
            conversation_id: conversationId,
            reader_public_id:
              otherMask?.maskedUserId === userId ? otherMask.token : req.user!.public_id,
          });

          // Notify the current user's other devices
          io.to(`user_${userId}`).emit("messages_read", {
            conversation_id: conversationId,
            reader_public_id: req.user!.public_id,
          });
        }
      }

      res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
