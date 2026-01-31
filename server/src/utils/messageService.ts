import dbPool from "./db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export interface Conversation {
  id: number;
  user1_id: number;
  user2_id: number;
  last_message_at: Date;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  other_user_id?: number;
  other_username?: string;
  other_avatar_url?: string;
  last_message_content?: string;
  is_read?: number; // 0 or 1
  unread_count?: number; 
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  is_read: boolean;
  created_at: Date;
  sender_name?: string;
  sender_avatar?: string;
}

export const messageService = {
  // 1. Get or Create Conversation
  getConversationId: async (userA: number, userB: number): Promise<number> => {
    // Ensure order
    const user1 = Math.min(userA, userB);
    const user2 = Math.max(userA, userB);

    // Try to find existing
    const [rows] = await dbPool.query<RowDataPacket[]>(
      "SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?",
      [user1, user2]
    );

    if (rows.length > 0) {
      return rows[0].id;
    }

    // Create new
    const [result] = await dbPool.query<ResultSetHeader>(
      "INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)",
      [user1, user2]
    );
    return result.insertId;
  },

  // 2. Create Message
  createMessage: async (
    conversationId: number,
    senderId: number,
    content: string
  ): Promise<Message> => {
    // Insert message
    const [result] = await dbPool.query<ResultSetHeader>(
      "INSERT INTO messages (conversation_id, sender_id, content) VALUES (?, ?, ?)",
      [conversationId, senderId, content]
    );

    // Update conversation timestamp
    await dbPool.query(
      "UPDATE conversations SET last_message_at = NOW() WHERE id = ?",
      [conversationId]
    );

    return {
      id: result.insertId,
      conversation_id: conversationId,
      sender_id: senderId,
      content,
      is_read: false,
      created_at: new Date(),
    };
  },

  // 3. Get User's Conversations (with other user info and last message)
  getUserConversations: async (userId: number): Promise<Conversation[]> => {
    const query = `
      SELECT 
        c.*,
        u.id as other_user_id,
        u.username as other_username,
        u.avatar_url as other_avatar_url,
        m.content as last_message_content,
        m.is_read as last_message_is_read,
        m.sender_id as last_message_sender_id,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND is_read = 0 AND sender_id != ?) as unread_count
      FROM conversations c
      JOIN users u ON u.id = CASE 
        WHEN c.user1_id = ? THEN c.user2_id 
        ELSE c.user1_id 
      END
      LEFT JOIN messages m ON m.conversation_id = c.id AND m.created_at = c.last_message_at
      WHERE c.user1_id = ? OR c.user2_id = ?
      ORDER BY c.last_message_at DESC
    `;

    // Note: The JOIN for last message based on exact timestamp is slightly risky if multiple messages same second.
    // Ideally we would store last_message_id in conversations table, but for now this works or we can subquery.
    // A more robust way to get last message content:
    const betterQuery = `
      SELECT 
        c.*,
        CASE WHEN c.user1_id = ? THEN u2.username ELSE u1.username END as other_username,
        CASE WHEN c.user1_id = ? THEN u2.avatar_url ELSE u1.avatar_url END as other_avatar_url,
        CASE WHEN c.user1_id = ? THEN u2.id ELSE u1.id END as other_user_id,
        m.content as last_message_content,
        (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND is_read = 0 AND sender_id != ?) as unread_count
      FROM conversations c
      JOIN users u1 ON c.user1_id = u1.id
      JOIN users u2 ON c.user2_id = u2.id
      LEFT JOIN messages m ON m.conversation_id = c.id 
        AND m.id = (SELECT id FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1)
      WHERE c.user1_id = ? OR c.user2_id = ?
      ORDER BY c.last_message_at DESC
    `;

    const [rows] = await dbPool.query<RowDataPacket[]>(betterQuery, [
      userId, userId, userId, // for CASE SELECT
      userId, // for unread_count
      userId, userId // for WHERE
    ]);

    return rows as Conversation[];
  },

  // 4. Get Messages in Conversation
  getMessages: async (
    conversationId: number, 
    limit: number = 20, 
    offset: number = 0
  ): Promise<Message[]> => {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      `SELECT m.*, u.username as sender_name, u.avatar_url as sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.conversation_id = ?
       ORDER BY m.created_at DESC
       LIMIT ? OFFSET ?`,
      [conversationId, limit, offset]
    );

    // Return reversed (oldest first) or keep newest first depending on frontend pref.
    // Usually API returns newest first (desc), and frontend reverses for display (scroll up).
    return rows as Message[];
  },

  // 5. Check if user belongs to conversation
  isUserInConversation: async (conversationId: number, userId: number): Promise<boolean> => {
    const [rows] = await dbPool.query<RowDataPacket[]>(
      "SELECT 1 FROM conversations WHERE id = ? AND (user1_id = ? OR user2_id = ?)",
      [conversationId, userId, userId]
    );
    return rows.length > 0;
  },
  
  // 6. Mark Conversation Read
  markConversationRead: async (conversationId: number, userId: number) => {
      // Set all messages in this conversation NOT sent by me to read
      await dbPool.query(
          "UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ?",
          [conversationId, userId]
      );
  },

  // 7. Get Conversation Details by ID
  getConversationById: async (conversationId: number, userId: number): Promise<Conversation | null> => {
    const query = `
      SELECT 
        c.*,
        CASE WHEN c.user1_id = ? THEN u2.username ELSE u1.username END as other_username,
        CASE WHEN c.user1_id = ? THEN u2.avatar_url ELSE u1.avatar_url END as other_avatar_url,
        CASE WHEN c.user1_id = ? THEN u2.id ELSE u1.id END as other_user_id
      FROM conversations c
      JOIN users u1 ON c.user1_id = u1.id
      JOIN users u2 ON c.user2_id = u2.id
      WHERE c.id = ? AND (c.user1_id = ? OR c.user2_id = ?)
    `;
    
    const [rows] = await dbPool.query<RowDataPacket[]>(query, [
        userId, userId, userId,
        conversationId, userId, userId
    ]);

    return rows.length > 0 ? (rows[0] as Conversation) : null;
  }
};
