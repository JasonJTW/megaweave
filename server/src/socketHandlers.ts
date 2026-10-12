// server/src/socketHandlers.ts
import type { IncomingMessage } from "http";
import type { Server, Socket } from "socket.io";
import cookieParser from "cookie-parser";
import { RowDataPacket } from "mysql2";
import { z } from "zod";
import dbPool from "./utils/db";
import { getUserFromCookies } from "./session";
import { UserSession } from "./schema";

const orderIdSchema = z.string().trim().min(1).max(64);

type JoinDeliveryAck = (response: { ok: boolean; error?: string }) => void;

export function userRoom(userId: number): string {
  return `user_${userId}`;
}

export function deliveryRoom(orderId: string): string {
  return `delivery_${orderId}`;
}

/**
 * Handshake 驗證：從 session cookie 取得身分，存進 socket.data.user。
 * 身分只認 server 端 Redis session，不信任 client 傳來的任何 userId。
 */
export async function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const cookies = (socket.request as IncomingMessage & {
      cookies?: Record<string, string>;
    }).cookies;
    const user = await getUserFromCookies(cookies);

    if (!user || !user.userId) {
      next(new Error("Unauthorized"));
      return;
    }

    socket.data.user = user;
    next();
  } catch (error) {
    console.error("Socket auth error:", error);
    next(new Error("Authentication service error"));
  }
}

//* 與 GET /lalamove/orders/:orderId 相同的權限：買方、賣方或管理員
export async function canAccessDeliveryOrder(
  orderId: string,
  user: UserSession,
): Promise<boolean> {
  if (user.role === "admin") return true;

  const [rows] = await dbPool.query<RowDataPacket[]>(
    `SELECT d.user_id, p.user_id AS seller_user_id
     FROM delivery_orders d
     LEFT JOIN posts p ON d.post_id = p.id
     WHERE d.lalamove_order_id = ? OR d.id = ?
     LIMIT 1`,
    [orderId, orderId],
  );

  if (!rows || rows.length === 0) return false;
  const row = rows[0];
  return row.user_id === user.userId || row.seller_user_id === user.userId;
}

export async function handleJoinDelivery(
  socket: Socket,
  rawOrderId: unknown,
  ack?: JoinDeliveryAck,
): Promise<void> {
  const reply = typeof ack === "function" ? ack : () => {};
  const user = socket.data.user as UserSession | undefined;
  if (!user) {
    reply({ ok: false, error: "Unauthorized" });
    return;
  }

  const parsed = orderIdSchema.safeParse(rawOrderId);
  if (!parsed.success) {
    reply({ ok: false, error: "Invalid orderId" });
    return;
  }
  const orderId = parsed.data;

  try {
    if (!(await canAccessDeliveryOrder(orderId, user))) {
      console.warn(
        `📦 Socket ${socket.id} (user ${user.userId}) denied delivery room for order ${orderId}`,
      );
      reply({ ok: false, error: "Forbidden" });
      return;
    }

    await socket.join(deliveryRoom(orderId));
    console.log(`📦 Socket ${socket.id} joined delivery room: ${deliveryRoom(orderId)}`);
    reply({ ok: true });
  } catch (error) {
    console.error("join_delivery error:", error);
    reply({ ok: false, error: "Internal server error" });
  }
}

export function registerSocketHandlers(io: Server): void {
  //* 讓 handshake request 也能用 req.cookies 讀 session cookie
  io.engine.use(cookieParser());
  io.use(authenticateSocket);

  io.on("connection", (socket) => {
    const user = socket.data.user as UserSession;

    //* 個人 room 只依 session 身分自動加入，client 無法指定別人的 userId
    socket.join(userRoom(user.userId));

    //* 加入特定訂單的配送即時追蹤 Room（需為該訂單買方、賣方或管理員）
    socket.on("join_delivery", (orderId: unknown, ack?: JoinDeliveryAck) => {
      void handleJoinDelivery(socket, orderId, ack);
    });
    socket.on("leave_delivery", (orderId: unknown) => {
      const parsed = orderIdSchema.safeParse(orderId);
      if (!parsed.success) return;
      socket.leave(deliveryRoom(parsed.data));
      console.log(`📦 Socket ${socket.id} left delivery room: ${deliveryRoom(parsed.data)}`);
    });
    socket.on("disconnect", () => {
      console.log(`❌ Client disconnected: ${socket.id}`);
    });
  });
}
