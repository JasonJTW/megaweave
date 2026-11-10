// server/src/utils/gracefulShutdown.ts
//* API 行程收到 SIGINT／SIGTERM 時的關機順序；抽出來讓測試能用假的 server、io 與計時器跑

/** 關機需要的 HTTP(S) server 能力（http.Server 與 https.Server 都有） */
export interface ClosableServer {
  close(callback: () => void): unknown;
  closeIdleConnections(): void;
  closeAllConnections(): void;
}

export interface ShutdownDeps {
  server: ClosableServer;
  io: { close(): unknown };
  /** server.close 回呼後依序執行：Socket.IO 訂閱、inline worker、Redis、資料庫 */
  cleanup: () => Promise<void>;
  exit?: (code: number) => void;
  log?: Pick<Console, "log" | "error">;
}

/** 進行中的請求有這麼久可以回完，之後強制斷掉剩下的連線 */
export const FORCE_CLOSE_CONNECTIONS_MS = 5_000;
/** 關機流程整體上限，超過就強制結束行程 */
export const FORCED_EXIT_MS = 30_000;

/** 回傳訊號處理函式：process.on("SIGINT", createShutdown(deps)) */
export function createShutdown({
  server,
  io,
  cleanup,
  exit = (code) => process.exit(code),
  log = console,
}: ShutdownDeps): (signal: string) => void {
  let shuttingDown = false;

  return (signal) => {
    //* 第二次收到訊號（例如再按一次 Ctrl+C）就不再等，直接結束；
    //* 不然每按一次都重跑一次 server.close，掛上一堆 close listener。
    //* 這是刻意的：直接結束會跳過 cleanup（Redis、資料庫與 inline worker 收尾），
    //* 連線由 OS 收回；要乾淨關閉就只送一次訊號
    if (shuttingDown) {
      log.error(`\n${signal} received again, exiting now`);
      exit(1);
      return;
    }
    shuttingDown = true;
    log.log(`\n${signal} received, shutting down gracefully...`);

    //* 停止接受新請求；server.close 要等每條連線都結束才會回呼
    server.close(async () => {
      log.log("✅ server closed");
      try {
        await cleanup();
        log.log("\n✅ All connections closed successfully");
        log.log("=== Server Shutdown complete ===\n");
        exit(0);
      } catch (error) {
        log.error("\n❌ Error during server shutdown:", error);
        exit(1);
      }
    });

    //* 瀏覽器的 keep-alive 連線與 Socket.IO 的 WebSocket 不會自己斷，server.close 會一直等到逾時：
    //* 先斷閒置連線、關掉 Socket.IO（斷開所有 socket），留 5 秒讓進行中的請求回完，再強制斷掉剩下的
    server.closeIdleConnections();
    void io.close();
    setTimeout(
      () => server.closeAllConnections(),
      FORCE_CLOSE_CONNECTIONS_MS,
    ).unref();

    setTimeout(() => {
      log.error("\n⚠️  Forced shutdown after 30s timeout");
      exit(1);
    }, FORCED_EXIT_MS).unref();
  };
}
