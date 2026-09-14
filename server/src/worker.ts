// server/src/worker.ts
// Standalone Worker Process Entry Point
import dotenv from "dotenv";
dotenv.config();

import { runWorkerService } from "./workerRunner";

async function main() {
  const service = await runWorkerService();

  process.on("SIGTERM", () => service.shutdown("SIGTERM"));
  process.on("SIGINT", () => service.shutdown("SIGINT"));
}

main();
