// server/src/scripts/e2eMockOpenAi.ts
// npm run e2e:mock-openai：在 OPENAI_BASE_URL 指定的 loopback port 啟動 OpenAI embeddings 替身（Playwright 會自動啟動）。

import { startMockOpenAi } from "../benchmark/mocks/mockOpenAi";

async function main(): Promise<void> {
  const baseUrl = new URL(process.env.OPENAI_BASE_URL ?? "");
  if (baseUrl.hostname !== "127.0.0.1" || !baseUrl.port) {
    throw new Error("OPENAI_BASE_URL must point to 127.0.0.1 with an explicit port; load server/e2e.env");
  }

  const mock = await startMockOpenAi({
    port: Number(baseUrl.port),
    latencyMs: { min: 0, max: 0 },
    seed: 1,
  });
  console.log(`Mock OpenAI listening on ${mock.url}`);

  const shutdown = () => {
    void mock.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("❌ Mock OpenAI failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
