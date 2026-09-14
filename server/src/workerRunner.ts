import { connectRedis, disconnectRedis } from "./utils/redis";
import { closeDatabase } from "./utils/db";
import { startWorkers, stopWorkers } from "./queue/workers";
import { initHotScoreCron } from "./queue/queues";

export interface WorkerServiceDependencies {
  connectRedis?: () => Promise<void>;
  disconnectRedis?: () => Promise<void>;
  closeDatabase?: () => Promise<void>;
  startWorkers?: () => Promise<void>;
  stopWorkers?: () => Promise<void>;
  initHotScoreCron?: () => Promise<void>;
  exitProcess?: (code: number) => void;
}

export interface WorkerService {
  isRunning: boolean;
  shutdown: (signal: string) => Promise<void>;
}

export async function runWorkerService(
  deps: WorkerServiceDependencies = {},
): Promise<WorkerService> {
  const doConnectRedis = deps.connectRedis ?? connectRedis;
  const doDisconnectRedis = deps.disconnectRedis ?? disconnectRedis;
  const doCloseDatabase = deps.closeDatabase ?? closeDatabase;
  const doStartWorkers = deps.startWorkers ?? startWorkers;
  const doStopWorkers = deps.stopWorkers ?? stopWorkers;
  const doInitHotScoreCron = deps.initHotScoreCron ?? initHotScoreCron;
  const doExitProcess = deps.exitProcess ?? ((code: number) => process.exit(code));

  let shuttingDown = false;

  const state: WorkerService = {
    isRunning: false,
    shutdown: async (_signal: string) => {},
  };

  state.shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    state.isRunning = false;
    console.log(`\n🛑 [Worker] ${signal} received, shutting down gracefully...`);

    try {
      console.log("📍 [Worker] Step 1/3: Stopping BullMQ workers...");
      await doStopWorkers();

      console.log("📍 [Worker] Step 2/3: Disconnecting Redis...");
      await doDisconnectRedis();

      console.log("📍 [Worker] Step 3/3: Closing Database...");
      await doCloseDatabase();

      console.log("✅ [Worker] Shutdown complete");
      doExitProcess(0);
    } catch (err) {
      console.error("❌ [Worker] Error during shutdown:", err);
      doExitProcess(1);
    }
  };

  try {
    console.log("👷 Starting standalone BullMQ Worker service...");
    await doConnectRedis();
    await doStartWorkers();
    await doInitHotScoreCron();
    state.isRunning = true;
    console.log("✅ Worker service is running and ready for jobs");
  } catch (err) {
    console.error("❌ Failed to start worker service:", err);
    doExitProcess(1);
  }

  return state;
}
