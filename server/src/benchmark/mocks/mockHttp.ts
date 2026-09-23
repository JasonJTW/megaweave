// server/src/benchmark/mocks/mockHttp.ts
// Mock 外部服務共用的 HTTP server 與延遲模擬：只綁定 loopback，延遲由 seed 決定可重現。

import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import { AddressInfo } from "net";
import { createRandom } from "../fixture/random";

export interface LatencyRange {
  min: number;
  max: number;
}

export interface MockServer {
  url: string;
  close(): Promise<void>;
}

export function createLatency(range: LatencyRange, seed: number): () => Promise<void> {
  const random = createRandom(seed);
  return () => {
    const ms = range.min + random.next() * (range.max - range.min);
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  };
}

export function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function listenLoopback(
  port: number,
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
): Promise<MockServer> {
  const server: Server = createServer((req, res) => {
    handler(req, res).catch((error: unknown) => {
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end(error instanceof Error ? error.message : String(error));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const { port: boundPort } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${boundPort}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
