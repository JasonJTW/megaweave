// server/src/benchmark/queue/mockEnvironment.ts
// API 與 worker 讀取同一份 benchmark.env；OpenAI 與 S3 端點必須指向 runner 啟動的本機 mock，否則拒絕執行。

import { z } from "zod";
import { BenchmarkSafetyError } from "../errors";

/** mock 只綁定 127.0.0.1；S3 SDK 只對 IP 端點使用 path-style，因此不接受 localhost */
export const MOCK_HOST = "127.0.0.1";

export interface MockEndpoints {
  openAiPort: number;
  s3Port: number;
  bucket: string;
  stagingBucket: string;
}

const mockUrlSchema = z
  .string({ error: "is required; load server/benchmark.env" })
  .transform((value, ctx) => {
    try {
      return new URL(value);
    } catch {
      ctx.addIssue({ code: "custom", message: "must be a URL" });
      return z.NEVER;
    }
  })
  .refine((url) => url.hostname === MOCK_HOST && url.port !== "", {
    message: `must point to a benchmark mock on ${MOCK_HOST} with an explicit port`,
  })
  .transform((url) => Number(url.port));

const mockEnvironmentSchema = z.object({
  OPENAI_BASE_URL: mockUrlSchema,
  AWS_ENDPOINT_URL_S3: mockUrlSchema,
  BUCKET_NAME: z.string({ error: "is required; load server/benchmark.env" }).min(1),
  STAGING_BUCKET_NAME: z.string({ error: "is required; load server/benchmark.env" }).min(1),
});

export function resolveMockEndpoints(env: NodeJS.ProcessEnv = process.env): MockEndpoints {
  const parsed = mockEnvironmentSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ");
    throw new BenchmarkSafetyError(`Unsafe external service configuration: ${issues}`);
  }
  return {
    openAiPort: parsed.data.OPENAI_BASE_URL,
    s3Port: parsed.data.AWS_ENDPOINT_URL_S3,
    bucket: parsed.data.BUCKET_NAME,
    stagingBucket: parsed.data.STAGING_BUCKET_NAME,
  };
}
