// server/src/benchmark/mocks/mockS3.ts
// 記憶體內的 S3 替身：支援 image worker 與瀏覽器上傳使用的 path-style GetObject / PutObject / DeleteObject，
// 讓 benchmark 執行真實的 AWS SDK 與 sharp 路徑，而不存取任何真實 bucket。
// API 與 worker 透過 benchmark.env 的 AWS_ENDPOINT_URL_S3 連到此 server。

import { createLatency, LatencyRange, listenLoopback, readBody } from "./mockHttp";

export interface MockS3Options {
  port: number;
  latencyMs: LatencyRange;
  seed: number;
  /** 是否保留物件內容；只有之後會被讀取的物件（staging）需要，避免上傳結果佔用記憶體 */
  retainBody?: (bucket: string, key: string) => boolean;
}

export interface MockS3Stats {
  get: number;
  put: number;
  delete: number;
  notFound: number;
}

export interface MockS3 {
  url: string;
  /** 直接放入物件，不經過 HTTP；runner 用於準備 staging 原圖 */
  putObject(bucket: string, key: string, body: Buffer): void;
  hasObject(bucket: string, key: string): boolean;
  /** 每個 key 被 PutObject 的次數 */
  uploads(bucket: string): Map<string, number>;
  stats(): MockS3Stats;
  close(): Promise<void>;
}

const objectId = (bucket: string, key: string) => `${bucket}/${key}`;

function parsePath(url: string): { bucket: string; key: string } | null {
  const path = new URL(url, "http://mock").pathname;
  const [, bucket, ...rest] = path.split("/");
  if (!bucket || rest.length === 0) return null;
  return { bucket, key: rest.map(decodeURIComponent).join("/") };
}

function noSuchKey(key: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message><Key>${key}</Key></Error>`;
}

export async function startMockS3(options: MockS3Options): Promise<MockS3> {
  const objects = new Map<string, Buffer | null>();
  const uploadCounts = new Map<string, Map<string, number>>();
  const counters: MockS3Stats = { get: 0, put: 0, delete: 0, notFound: 0 };
  const latency = createLatency(options.latencyMs, options.seed);
  const retainBody = options.retainBody ?? (() => true);

  const store = (bucket: string, key: string, body: Buffer) => {
    objects.set(objectId(bucket, key), retainBody(bucket, key) ? body : null);
  };

  const server = await listenLoopback(options.port, async (req, res) => {
    const body = await readBody(req);
    await latency();
    const target = req.url ? parsePath(req.url) : null;
    if (!target) {
      res.writeHead(400).end();
      return;
    }
    const { bucket, key } = target;
    const id = objectId(bucket, key);

    switch (req.method) {
      case "GET": {
        counters.get++;
        const object = objects.get(id);
        if (!object) {
          counters.notFound++;
          res.writeHead(404, { "content-type": "application/xml" }).end(noSuchKey(key));
          return;
        }
        res.writeHead(200, { "content-length": String(object.length), etag: '"benchmark"' }).end(object);
        return;
      }
      case "PUT": {
        counters.put++;
        store(bucket, key, body);
        const counts = uploadCounts.get(bucket) ?? new Map<string, number>();
        counts.set(key, (counts.get(key) ?? 0) + 1);
        uploadCounts.set(bucket, counts);
        res.writeHead(200, { etag: '"benchmark"' }).end();
        return;
      }
      case "DELETE":
        counters.delete++;
        objects.delete(id);
        res.writeHead(204).end();
        return;
      default:
        res.writeHead(405).end();
    }
  });

  return {
    url: server.url,
    putObject: store,
    hasObject: (bucket, key) => objects.has(objectId(bucket, key)),
    uploads: (bucket) => new Map(uploadCounts.get(bucket) ?? []),
    stats: () => ({ ...counters }),
    close: server.close,
  };
}
