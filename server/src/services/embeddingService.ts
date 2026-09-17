import OpenAI from "openai";

let openaiClient: OpenAI | null = null;
const QUERY_EMBEDDING_CACHE_TTL_MS = 5 * 60 * 1000;
const QUERY_EMBEDDING_CACHE_MAX = 200;
const queryEmbeddingCache = new Map<string, { buffer: Buffer; expiresAt: number }>();

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("Configuration Error: Missing OPENAI_API_KEY environment variable.");
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * 將文字轉為與 posts.embedding 相同模型、相同維度的 FLOAT32 向量。
 * 貼文建立、重建與查詢皆經由此 module，避免模型或二進位格式漂移。
 */
export async function fetchEmbedding(text: string): Promise<{
  buffer: Buffer;
  vector: number[];
  dimensions: number;
  byteLength: number;
}> {
  const response = await getOpenAIClient().embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  const vector = response.data[0].embedding;
  const buffer = Buffer.alloc(vector.length * 4);
  for (let i = 0; i < vector.length; i++) {
    buffer.writeFloatLE(vector[i], i * 4);
  }

  return {
    buffer,
    vector,
    dimensions: vector.length,
    byteLength: buffer.length,
  };
}

/** Query embedding 會在使用者輸入期間被重複請求；以短 TTL 降低重試與重複搜尋成本。 */
export async function fetchQueryEmbedding(query: string): Promise<Buffer> {
  const cacheKey = query.trim().normalize("NFKC").toLocaleLowerCase();
  const cached = queryEmbeddingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.buffer;
  }

  const { buffer } = await fetchEmbedding(query);
  if (queryEmbeddingCache.size >= QUERY_EMBEDDING_CACHE_MAX) {
    const oldestKey = queryEmbeddingCache.keys().next().value;
    if (oldestKey) queryEmbeddingCache.delete(oldestKey);
  }
  queryEmbeddingCache.set(cacheKey, {
    buffer,
    expiresAt: Date.now() + QUERY_EMBEDDING_CACHE_TTL_MS,
  });
  return buffer;
}
