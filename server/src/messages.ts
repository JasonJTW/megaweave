import Router, { Request, Response } from "express";
import { requireAuth } from "./middleware/auth";
import { messageService } from "./utils/messageService";
import { Server } from "socket.io";
import { memoryUpload } from "./upload";
import { defaultImageStorage } from "./storage/ImageStorage";
import { randomUUID } from "crypto";
import { RowDataPacket } from "mysql2";
import dbPool from "./utils/db";

const router = Router();

// GET /api/messages/conversations - List all conversations
router.get(
  "/conversations",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    console.log(`[GET /conversations] Fetching for userId: ${userId}`);
    try {
      const conversations = await messageService.getUserConversations(userId);
      const dtos = conversations.map((c) =>
        messageService.toConversationDTO(c),
      );
      console.log(
        `[GET /conversations] Found ${conversations.length} conversations`,
      );
      return res.json({ conversations: dtos });
    } catch (error) {
      console.error("Get conversations error:", error);
      return res.status(500).json({ errorMessage: "Internal server error" });
    }
  },
);

// GET /api/messages/conversations/:id - Get history
router.get(
  "/conversations/:id",
  requireAuth,
  async (req: Request, res: Response) => {
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
        return res
          .status(403)
          .json({ errorMessage: "Not authorized to view this conversation" });
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

      return res.json({
        messages: messages.map((m) => messageService.toMessageDTO(m)),
        conversation: conversation
          ? messageService.toConversationDTO(conversation)
          : null,
        hasMore: messages.length === limit,
      });
    } catch (error) {
      console.error("Get message history error:", error);
      return res.status(500).json({ errorMessage: "Internal server error" });
    }
  },
);

// POST /api/messages - Send message (Supports optional image attachments)
router.post(
  "/",
  requireAuth,
  memoryUpload.array("images", 10),
  async (req: Request, res: Response) => {
    const senderId = req.user!.userId;
    const senderPublicId = req.user!.public_id;
    const { recipient_public_id, content, item_id, item_title, post_id } = req.body;

    if (
      !recipient_public_id ||
      (!content &&
        (!req.files || (req.files as Express.Multer.File[]).length === 0))
    ) {
      return res
        .status(400)
        .json({ errorMessage: "Recipient and content or image are required" });
    }

    try {
      // SECURITY: Map public_id to internal ID
      const recipientId =
        await messageService.getUserIdByPublicId(recipient_public_id);
      if (!recipientId) {
        return res.status(404).json({ errorMessage: "Recipient not found" });
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

      // 1. Get or Create Conversation
      const conversationId = await messageService.getConversationId(
        senderId,
        recipientId,
      );

      const io: Server = res.locals.io;

      // 2. If the user had a pending weaving intent, persist it as a system message first.
      //    This only happens on the FIRST real message sent for a given item.
      if (item_id && item_title) {
        const parsedPostId = post_id ? parseInt(post_id as string) : undefined;
        let postType: string | undefined;
        let postAuthorPublicId: string | undefined;
        if (parsedPostId) {
          const [postRows] = await dbPool.execute<RowDataPacket[]>(
            "SELECT p.type, u.public_id FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?",
            [parsedPostId]
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
            post_id: parsedPostId,
            post_type: postType,
            post_author_public_id: postAuthorPublicId,
          },
        );
        if (io) {
          const sysMsgDTO = messageService.toMessageDTO(sysMsg, senderPublicId);
          const sysPayload = { ...sysMsgDTO, conversation_id: conversationId };
          io.to(`user_${recipientId}`).emit("new_message", sysPayload);
          io.to(`user_${senderId}`).emit("new_message", sysPayload);
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
        const payload = {
          ...messageDTO,
          conversation_id: conversationId,
        };
        // Push to recipient's personal room
        io.to(`user_${recipientId}`).emit("new_message", payload);

        // Push to sender (for multi-device sync)
        io.to(`user_${senderId}`).emit("new_message", payload);
        console.log(`[POST /messages] Emission complete.`);
      } else {
        console.warn(
          `[POST /messages] WARNING: io is undefined, socket events not sent!`,
        );
      }

      res.status(201).json({ message: messageDTO, conversationId });
    } catch (error) {
      console.error("Send message error:", error);
      return res.status(500).json({ errorMessage: "Internal server error" });
    }
  },
);

// POST /api/messages/start - Get or create conversation (no DB message written here)
router.post("/start", requireAuth, async (req: Request, res: Response) => {
  const senderId = req.user!.userId;
  const { recipient_public_id } = req.body;

  if (!recipient_public_id) {
    return res
      .status(400)
      .json({ errorMessage: "Recipient Public ID required" });
  }

  try {
    const recipientId =
      await messageService.getUserIdByPublicId(recipient_public_id);
    if (!recipientId) {
      return res.status(404).json({ errorMessage: "Recipient not found" });
    }
    const conversationId = await messageService.getConversationId(
      senderId,
      recipientId,
    );

    return res.json({ conversationId });
  } catch (error) {
    console.error("Start conversation error:", error);
    return res.status(500).json({ errorMessage: "Internal server error" });
  }
});

// PATCH /api/messages/conversations/:id/read - Mark as read
router.patch(
  "/conversations/:id/read",
  requireAuth,
  async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const conversationId = parseInt(req.params.id);

    try {
      const isMember = await messageService.isUserInConversation(
        conversationId,
        userId,
      );
      if (!isMember) {
        return res.status(403).json({ errorMessage: "Not authorized" });
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

          // Notify the other user (the sender)
          io.to(`user_${otherUserId}`).emit("messages_read", {
            conversation_id: conversationId,
            reader_public_id: req.user!.public_id,
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
      console.error("Mark read error:", error);
      res.status(500).json({ errorMessage: "Internal server error" });
    }
  },
);

export default router;
