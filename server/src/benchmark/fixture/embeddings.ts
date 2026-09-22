// server/src/benchmark/fixture/embeddings.ts
// 合成語意向量：不呼叫 OpenAI，以「分類中心 + 主題中心 + 貼文雜訊」產生可重現的 1536 維單位向量，
// 讓同主題貼文彼此相近、跨分類貼文彼此無關，使 HNSW KNN 與個人化重排的行為有意義。

import { createRandom, deriveSeed } from "./random";

export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_MODEL_VERSION = "synthetic-clustered-v1";

const CATEGORY_WEIGHT = 1.0;
const TOPIC_WEIGHT = 0.9;
const NOISE_WEIGHT = 0.7;

function normalize(vector: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < vector.length; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface EmbeddablePost {
  id: number;
  category_id: number;
  topic: number;
}

export class SyntheticEmbeddingModel {
  private readonly centroids = new Map<string, Float32Array>();

  constructor(private readonly seed: number) {}

  private centroid(key: string): Float32Array {
    const cached = this.centroids.get(key);
    if (cached) return cached;

    const random = createRandom(deriveSeed(this.seed, "centroid", key));
    const vector = new Float32Array(EMBEDDING_DIMENSIONS);
    for (let i = 0; i < vector.length; i++) vector[i] = random.gaussian();
    normalize(vector);
    this.centroids.set(key, vector);
    return vector;
  }

  postVector(post: EmbeddablePost): Float32Array {
    const category = this.centroid(`category:${post.category_id}`);
    const topic = this.centroid(`topic:${post.category_id}:${post.topic}`);
    const noise = createRandom(deriveSeed(this.seed, "post-vector", post.id));
    const noiseScale = NOISE_WEIGHT / Math.sqrt(EMBEDDING_DIMENSIONS);
    const vector = new Float32Array(EMBEDDING_DIMENSIONS);

    for (let i = 0; i < vector.length; i++) {
      vector[i] =
        CATEGORY_WEIGHT * category[i] +
        TOPIC_WEIGHT * topic[i] +
        noiseScale * noise.gaussian();
    }
    return normalize(vector);
  }

  /** 使用者興趣向量 = 其按讚貼文向量的平均（與 userVector worker 的 EMA 收斂方向一致）。 */
  userVector(likedPosts: readonly EmbeddablePost[]): Float32Array {
    const vector = new Float32Array(EMBEDDING_DIMENSIONS);
    for (const post of likedPosts) {
      const postVector = this.postVector(post);
      for (let i = 0; i < vector.length; i++) vector[i] += postVector[i];
    }
    return normalize(vector);
  }
}

/** 與 postEmbedding worker 相同的 FLOAT32 little-endian 格式 */
export function toFloat32Buffer(vector: Float32Array): Buffer {
  const buffer = Buffer.alloc(vector.length * 4);
  for (let i = 0; i < vector.length; i++) buffer.writeFloatLE(vector[i], i * 4);
  return buffer;
}

/** 與 postEmbedding worker 寫入 posts.embedding 的 JSON 格式一致 */
export function toEmbeddingJson(vector: Float32Array): string {
  return JSON.stringify(Array.from(vector));
}
