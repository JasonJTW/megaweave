import Router, { Request, Response } from "express";
import { requireAuth } from "./middleware/auth";
import { messageService } from "./utils/messageService";
import { Server } from "socket.io";

const router = Router();

// GET /api/messages/conversations - List all conversations
router.get("/conversations", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  console.log(`[GET /conversations] Fetching for userId: ${userId}`);
  try {
    const conversations = await messageService.getUserConversations(userId);
    console.log(`[GET /conversations] Found ${conversations.length} conversations`);
    res.json({ conversations });
  } catch (error) {
    console.error("Get conversations error:", error);
    res.status(500).json({ errorMessage: "Internal server error" });
  }
});

// GET /api/messages/conversations/:id - Get history
router.get("/conversations/:id", requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const conversationId = parseInt(req.params.id);
  const page = parseInt(req.query.page as string) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    // Security check
    const isMember = await messageService.isUserInConversation(conversationId, userId);
    if (!isMember) {
       res.status(403).json({ errorMessage: "Not authorized to view this conversation" });
       return;
    }

    const messages = await messageService.getMessages(conversationId, limit, offset);
    // Also fetch conversation details to ensure we have participant info (even if not in list yet)
    const conversation = await messageService.getConversationById(conversationId, userId);
    
    res.json({ messages, conversation, hasMore: messages.length === limit });
  } catch (error) {
    console.error("Get message history error:", error);
    res.status(500).json({ errorMessage: "Internal server error" });
  }
});

// POST /api/messages - Send message
router.post("/", requireAuth, async (req: Request, res: Response) => {
  const senderId = req.user!.userId;
  const { recipientId, content } = req.body;

  if (!recipientId || !content) {
     res.status(400).json({ errorMessage: "Recipient and content are required" });
     return;
  }

  try {
    // 1. Get or Create Conversation
    const conversationId = await messageService.getConversationId(senderId, recipientId);

    // 2. Create Message
    const message = await messageService.createMessage(conversationId, senderId, content);

    // 3. Socket Push
    const io: Server = req.app.get("io");
    if (io) {
        // Push to recipient's personal room
        io.to(`user_${recipientId}`).emit("new_message", {
            ...message,
            conversation_id: conversationId
        });
        
        // Push to sender (for multi-device sync)
        io.to(`user_${senderId}`).emit("new_message", {
            ...message,
            conversation_id: conversationId
        });
    }

    res.status(201).json({ message, conversationId });
  } catch (error) {
    console.error("Send message error:", error);
    res.status(500).json({ errorMessage: "Internal server error" });
  }
});

// POST /api/messages/start - Start conversation (get or create)
router.post("/start", requireAuth, async (req: Request, res: Response) => {
    const senderId = req.user!.userId;
    const { recipientId } = req.body;

    if (!recipientId) {
         res.status(400).json({ errorMessage: "Recipient ID required" });
         return;
    }

    try {
        const conversationId = await messageService.getConversationId(senderId, recipientId);
        res.json({ conversationId });
    } catch (error) {
        console.error("Start conversation error:", error);
        res.status(500).json({ errorMessage: "Internal server error" });
    }
});

// PATCH /api/messages/conversations/:id/read - Mark as read
router.patch("/conversations/:id/read", requireAuth, async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const conversationId = parseInt(req.params.id);

    try {
        const isMember = await messageService.isUserInConversation(conversationId, userId);
        if (!isMember) {
             res.status(403).json({ errorMessage: "Not authorized" });
             return;
        }

        await messageService.markConversationRead(conversationId, userId);
        res.json({ success: true });
    } catch (error) {
        console.error("Mark read error:", error);
        res.status(500).json({ errorMessage: "Internal server error" });
    }
});

export default router;
