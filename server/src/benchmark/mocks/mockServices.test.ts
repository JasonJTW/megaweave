import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import OpenAI from "openai";
import { MockOpenAi, startMockOpenAi } from "./mockOpenAi";
import { MockS3, startMockS3 } from "./mockS3";

const noLatency = { min: 0, max: 0 };

describe("mock S3", () => {
  let s3: MockS3;
  let client: S3Client;

  beforeEach(async () => {
    s3 = await startMockS3({ port: 0, latencyMs: noLatency, seed: 1, retainBody: (bucket) => bucket === "staging" });
    client = new S3Client({
      region: "us-east-1",
      endpoint: s3.url,
      credentials: { accessKeyId: "benchmark", secretAccessKey: "benchmark" },
    });
  });

  afterEach(async () => {
    client.destroy();
    await s3.close();
  });

  it("serves the staging-to-destination flow the image worker performs through the AWS SDK", async () => {
    s3.putObject("staging", "staging/posts/a.jpg", Buffer.from("raw-image"));

    const object = await client.send(new GetObjectCommand({ Bucket: "staging", Key: "staging/posts/a.jpg" }));
    expect(Buffer.from(await object.Body!.transformToByteArray()).toString()).toBe("raw-image");

    await client.send(new PutObjectCommand({ Bucket: "images", Key: "posts/a.webp", Body: Buffer.alloc(64), ContentType: "image/webp" }));
    await client.send(new PutObjectCommand({ Bucket: "images", Key: "posts/a.webp", Body: Buffer.alloc(64), ContentType: "image/webp" }));
    await client.send(new DeleteObjectCommand({ Bucket: "staging", Key: "staging/posts/a.jpg" }));

    expect(s3.uploads("images")).toEqual(new Map([["posts/a.webp", 2]]));
    expect(s3.hasObject("staging", "staging/posts/a.jpg")).toBe(false);
    expect(s3.stats()).toMatchObject({ get: 1, put: 2, delete: 1, notFound: 0 });
  });

  it("accepts browser uploads to presigned URLs", async () => {
    const url = await getSignedUrl(client, new PutObjectCommand({ Bucket: "staging", Key: "staging/posts/b.jpg", ContentType: "image/jpeg" }), {
      expiresIn: 300,
    });

    const response = await fetch(url, { method: "PUT", body: Buffer.from("jpeg"), headers: { "content-type": "image/jpeg" } });

    expect(response.status).toBe(200);
    expect(s3.hasObject("staging", "staging/posts/b.jpg")).toBe(true);
  });

  it("returns NoSuchKey for missing objects so SDK callers fail the way they would against S3", async () => {
    await expect(client.send(new GetObjectCommand({ Bucket: "staging", Key: "missing.jpg" }))).rejects.toMatchObject({
      name: "NoSuchKey",
    });
    expect(s3.stats().notFound).toBe(1);
  });
});

describe("mock OpenAI embeddings", () => {
  let openAi: MockOpenAi;
  let client: OpenAI;

  beforeEach(async () => {
    openAi = await startMockOpenAi({ port: 0, latencyMs: noLatency, seed: 1 });
    client = new OpenAI({ apiKey: "benchmark-mock-key", baseURL: `${openAi.url}/v1`, maxRetries: 0 });
  });

  afterEach(async () => {
    await openAi.close();
  });

  it("returns deterministic 1536-dimension unit vectors through the OpenAI SDK", async () => {
    const first = await client.embeddings.create({ model: "text-embedding-3-small", input: "二手書桌" });
    const again = await client.embeddings.create({ model: "text-embedding-3-small", input: "二手書桌" });
    const other = await client.embeddings.create({ model: "text-embedding-3-small", input: "嬰兒推車" });

    const vector = first.data[0].embedding;
    expect(vector).toHaveLength(1536);
    expect(Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0))).toBeCloseTo(1, 4);
    expect(again.data[0].embedding).toEqual(vector);
    expect(other.data[0].embedding).not.toEqual(vector);
    expect(openAi.stats()).toEqual({ requests: 3, embeddings: 3 });
  });

  it("supports float encoding when a caller requests it", async () => {
    const response = await client.embeddings.create({ model: "text-embedding-3-small", input: "椅子", encoding_format: "float" });

    expect(response.data[0].embedding).toHaveLength(1536);
  });
});
