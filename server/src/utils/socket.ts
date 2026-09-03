import { Server } from "socket.io";

let ioInstance: Server | null = null;

export function setSocketIO(io: Server): void {
  ioInstance = io;
}

export function getSocketIO(): Server | null {
  return ioInstance;
}
