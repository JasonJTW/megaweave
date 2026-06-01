import dbPool from "./db";
import { RowDataPacket, ResultSetHeader } from "mysql2";

export interface Conversation {
  id: number;
  user1_id: number;
  user2_id: number;
  last_message_id?: number | null;
  last_message_at: Date;
  created_at: Date;
  updated_at: Date;
  // Joined fields
  other_user_id?: number; // Keep for internal use, but we might want to hide it from JSON
  other_public_id?: string;
  other_username?: string;
  other_avatar_url?: string;
  last_message_content?: string;
  is_read?: number; // 0 or 1
  unread_count?: number; 
}

export interface Attachment {
  id: number;
  message_id: number;
  file_url: string;
  file_type: 'image' | 'video' | 'file';
  created_at: Date;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_public_id?: string;
  content: string;
  is_read: boolean;
  message_type?: string;
  metadata?: any;
  created_at: Date;
  sender_name?: string;
  sender_avatar?: string;
  attachments?: Attachment[];
}

export type ConversationDTO = Omit<Conversation, 'user1_id' | 'user2_id' | 'other_user_id'>;

export type MessageDTO = Omit<Message, 'sender_id'>;

export const messageService = {
  // 1. Get or Create Conversation
  getConversationId: async (userA: number, userB: number): Promise<number> => {
    // Try to find existing
    const user1 = Math.min(userA, userB);
    const user2 = Math.max(userA, userB);

    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT id FROM conversations WHERE user1_id = ? AND user2_id = ?",
      [user1, user2]
    );

    if (rows.length > 0) {
      return rows[0].id;
    }

    // Create new
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();
        
        const [result] = await connection.execute<ResultSetHeader>(
            "INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)",
            [user1, user2]
        );
        const conversationId = result.insertId;

        // Insert into conversation_users
        await connection.execute(
            "INSERT INTO conversation_users (conversation_id, user_id) VALUES (?, ?), (?, ?)",
            [conversationId, userA, conversationId, userB]
        );

        await connection.commit();
        return conversationId;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
  },

  createMessage: async (
    conversationId: number,
    senderId: number,
    content: string,
    attachments?: Array<{ url: string; type: 'image' | 'video' | 'file' }>,
    messageType: string = 'text',
    metadata: any = null
  ): Promise<Message> => {
    const connection = await dbPool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Insert message
        const [result] = await connection.execute<ResultSetHeader>(
            "INSERT INTO messages (conversation_id, sender_id, content, message_type, metadata) VALUES (?, ?, ?, ?, ?)",
            [conversationId, senderId, content, messageType, metadata ? JSON.stringify(metadata) : null]
        );
        const messageId = result.insertId;

        // 2. Insert attachments if any
        const insertedAttachments: Attachment[] = [];
        if (attachments && attachments.length > 0) {
            for (const att of attachments) {
                const [attResult] = await connection.execute<ResultSetHeader>(
                    "INSERT INTO message_attachments (message_id, file_url, file_type) VALUES (?, ?, ?)",
                    [messageId, att.url, att.type]
                );
                insertedAttachments.push({
                    id: attResult.insertId,
                    message_id: messageId,
                    file_url: att.url,
                    file_type: att.type,
                    created_at: new Date()
                });
            }
        }

        // 3. Update conversation timestamp and last_message_id
        await connection.execute(
            "UPDATE conversations SET last_message_at = NOW(), last_message_id = ? WHERE id = ?",
            [messageId, conversationId]
        );
        
        // 4. Update sender's last_read_message_id in conversation_users
        await connection.execute(
            "UPDATE conversation_users SET last_read_message_id = ? WHERE conversation_id = ? AND user_id = ?",
            [messageId, conversationId, senderId]
        );

        await connection.commit();

        return {
            id: messageId,
            conversation_id: conversationId,
            sender_id: senderId,
            content,
            is_read: false,
            message_type: messageType,
            metadata,
            created_at: new Date(),
            attachments: insertedAttachments
        };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
  },

  // 3. Get User's Conversations (with other user info and last message)
  getUserConversations: async (userId: number): Promise<Conversation[]> => {
    const query = `
      SELECT 
        c.*,
        u.public_id as other_public_id,
        u.username as other_username,
        u.avatar_url as other_avatar_url,
        u.id as other_user_id,
        m.content as last_message_content,
        m.sender_id as last_message_sender_id,
        (
          SELECT COUNT(*) 
          FROM messages msg
          WHERE msg.conversation_id = c.id 
            AND msg.sender_id != cu1.user_id
            AND (cu1.last_read_message_id IS NULL OR msg.id > cu1.last_read_message_id)
        ) as unread_count,
        (
          SELECT COUNT(*)
          FROM message_attachments
          WHERE message_id = c.last_message_id
        ) as last_message_attachment_count
      FROM conversation_users cu1
      JOIN conversations c ON cu1.conversation_id = c.id
      JOIN conversation_users cu2 ON c.id = cu2.conversation_id AND cu2.user_id != cu1.user_id
      JOIN users u ON cu2.user_id = u.id
      LEFT JOIN messages m ON m.id = c.last_message_id
      WHERE cu1.user_id = ?
      ORDER BY c.last_message_at DESC
    `;

    const [rows] = await dbPool.execute<RowDataPacket[]>(query, [userId]);

    return rows as Conversation[];
  },

  getMessages: async (
    conversationId: number, 
    limit: number = 20, 
    beforeId?: number
  ): Promise<Message[]> => {
    let query = `
      SELECT 
        m.id, m.conversation_id, m.sender_id, m.content, m.message_type, m.metadata, m.created_at,
        IF(m.id <= cu.last_read_message_id, 1, 0) as is_read,
        u.username as sender_name, u.avatar_url as sender_avatar, u.public_id as sender_public_id
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN conversation_users cu 
        ON cu.conversation_id = m.conversation_id 
        AND cu.user_id != m.sender_id
      WHERE m.conversation_id = ?
    `;
    const params: any[] = [conversationId];

    if (beforeId) {
      query += ` AND m.id < ?`;
      params.push(beforeId);
    }

    query += ` ORDER BY m.id DESC LIMIT ?`;
    params.push(limit);

    const [rows] = await dbPool.query<RowDataPacket[]>(query, params);
    const messages = rows as Message[];

    messages.forEach(m => {
        m.is_read = !!m.is_read;
    });

    if (messages.length > 0) {
        const messageIds = messages.map(m => m.id);
        const [attachmentRows] = await dbPool.query<RowDataPacket[]>(
            "SELECT * FROM message_attachments WHERE message_id IN (?)",
            [messageIds]
        );
        const attachments = attachmentRows as Attachment[];
        
        messages.forEach(m => {
            m.attachments = attachments.filter(a => a.message_id === m.id);
        });
    }

    return messages;
  },

  // 5. Check if user belongs to conversation
  isUserInConversation: async (conversationId: number, userId: number): Promise<boolean> => {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT 1 FROM conversation_users WHERE conversation_id = ? AND user_id = ?",
      [conversationId, userId]
    );
    return rows.length > 0;
  },
  
  // 6. Mark Conversation Read
  markConversationRead: async (conversationId: number, userId: number) => {
      // Update last_read_message_id to the most recent message in the conversation
      await dbPool.execute(
          `UPDATE conversation_users 
           SET last_read_message_id = (SELECT last_message_id FROM conversations WHERE id = ?) 
           WHERE conversation_id = ? AND user_id = ?`,
          [conversationId, conversationId, userId]
      );
  },

  hasRecentSystemMessage: async (conversationId: number, messageType: string, itemId: number): Promise<boolean> => {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT id FROM messages WHERE conversation_id = ? AND message_type = ? AND JSON_EXTRACT(metadata, '$.item_id') = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)",
      [conversationId, messageType, itemId]
    );
    return rows.length > 0;
  },

  // 7. Get Conversation Details by ID
  getConversationById: async (conversationId: number, userId: number): Promise<Conversation | null> => {
    const query = `
      SELECT 
        c.*,
        u.public_id as other_public_id,
        u.username as other_username,
        u.avatar_url as other_avatar_url,
        u.id as other_user_id
      FROM conversation_users cu1
      JOIN conversations c ON cu1.conversation_id = c.id
      JOIN conversation_users cu2 ON c.id = cu2.conversation_id AND cu2.user_id != cu1.user_id
      JOIN users u ON cu2.user_id = u.id
      WHERE c.id = ? AND cu1.user_id = ?
    `;
    
    const [rows] = await dbPool.execute<RowDataPacket[]>(query, [conversationId, userId]);

    return rows.length > 0 ? (rows[0] as Conversation) : null;
  },

  // 8. Get User ID by Public ID
  getUserIdByPublicId: async (publicId: string): Promise<number | null> => {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT id FROM users WHERE public_id = ?",
      [publicId]
    );
    return rows.length > 0 ? (rows[0].id as number) : null;
  },

  getPublicIdByUserId: async (userId: number): Promise<string | null> => {
    const [rows] = await dbPool.execute<RowDataPacket[]>(
      "SELECT public_id FROM users WHERE id = ?",
      [userId]
    );
    return rows.length > 0 ? (rows[0].public_id as string) : null;
  },

  // 10. DTO Mappers
  toConversationDTO: (conv: Conversation): ConversationDTO => {
    const { user1_id, user2_id, other_user_id, ...dto } = conv;
    return dto as ConversationDTO;
  },

  toMessageDTO: (msg: Message, fallbackSenderPublicId?: string): MessageDTO => {
    const { sender_id, ...dto } = msg;
    if (!dto.sender_public_id && fallbackSenderPublicId) {
        dto.sender_public_id = fallbackSenderPublicId;
    }
    return dto as MessageDTO;
  }
};
