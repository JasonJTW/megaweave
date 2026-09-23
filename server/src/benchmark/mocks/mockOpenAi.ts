// server/src/benchmark/mocks/mockOpenAi.ts
// OpenAI embeddings API 替身：同一段文字永遠回傳同一個 1536 維單位向量，延遲在設定範圍內，
// 讓 queue burst 量測 worker 的處理能力而不花費真實額度。
// API 與 worker 透過 benchmark.env 的 OPENAI_BASE_URL 連到此 server。

import { EMBEDDING_DIMENSIONS } from "../fixture/embeddings";
import { createRandom, deriveSeed } from "../fixture/random";
import { createLatency, LatencyRange, listenLoopback, readBody } from "./mockHttp";

export interface MockOpenAiOptions {
  port: number;
  latencyMs: LatencyRange;
  seed: number;
}

export interface MockOpenAiStats {
  requests: number;
  embeddings: number;
}

export interface MockOpenAi {
  url: string;
  stats(): MockOpenAiStats;
  close(): Promise<void>;
}

function embed(text: string): Float32Array {
  const random = createRandom(deriveSeed("mock-openai", text));
  const vector = new Float32Array(EMBEDDING_DIMENSIONS);
  let norm = 0;
  for (let i = 0; i < vector.length; i++) {
    vector[i] = random.gaussian();
    norm += vector[i] * vector[i];
  }
  norm = Math.sqrt(norm);
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

export async function startMockOpenAi(options: MockOpenAiOptions): Promise<MockOpenAi> {
  const counters: MockOpenAiStats = { requests: 0, embeddings: 0 };
  const latency = createLatency(options.latencyMs, options.seed);

  const server = await listenLoopback(options.port, async (req, res) => {
    counters.requests++;
    const body = await readBody(req);
    await latency();
    if (req.method !== "POST" || !req.url?.endsWith("/embeddings")) {
      res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "Not found" } }));
      return;
    }

    const request = JSON.parse(body.toString("utf8")) as { model: string; input: string | string[]; encoding_format?: string };
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    counters.embeddings += inputs.length;
    const data = inputs.map((input, index) => {
      const vector = embed(input);
      return {
        object: "embedding",
        index,
        embedding:
          request.encoding_format === "base64"
            ? Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength).toString("base64")
            : Array.from(vector),
      };
    });
    const tokens = inputs.reduce((sum, input) => sum + input.length, 0);
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({ object: "list", data, model: request.model, usage: { prompt_tokens: tokens, total_tokens: tokens } }),
    );
  });

  return { url: server.url, stats: () => ({ ...counters }), close: server.close };
}
