import { Server } from "socket.io";
import { Emitter } from "@socket.io/redis-emitter";

let ioInstance: Server | null = null;
let emitterInstance: Emitter | null = null;

/** Server 和 redis Emitter 共同的最小介面：`.to(room).emit(event, payload)` */
export type SocketBroadcaster = Pick<Server, "to"> | Pick<Emitter, "to">;

export function setSocketIO(io: Server): void {
  ioInstance = io;
}

export function getSocketIO(): Server | null {
  return ioInstance;
}

/**
 * 獨立 worker process 沒有 Socket.IO server（ioInstance 永遠是 null）。
 * Emitter 透過 Redis pub/sub 發到 API process 掛的 redis adapter，再由 API 送給 client。
 * 必須用和 adapter 同一台 Redis（cache）、同一個 key prefix（預設 "socket.io"）。
 */
export function initSocketEmitter(redisClient: ConstructorParameters<typeof Emitter>[0]): void {
  emitterInstance = new Emitter(redisClient);
}

/** API process 回傳 io；worker process 回傳 redis Emitter；都沒有則 null */
export function getSocketBroadcaster(): SocketBroadcaster | null {
  return ioInstance ?? emitterInstance;
}
