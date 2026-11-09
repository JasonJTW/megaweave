// supertest 的 request(app) 會用 app.listen(0) 綁在 `::`，卻連到 127.0.0.1。
// macOS 上別的程式仍能指定同一個號碼綁 127.0.0.1，系統會把測試的連線交給它，
// 測試就收到它的 404、Parse Error 或 ECONNRESET（#147）。
// 這裡改成先綁好 127.0.0.1 再送出：綁定位址和連線位址一致，搶占者只會拿到
// EADDRINUSE。用法與 supertest 的 request(app) 相同，每個請求用自己的 server，
// 回應後關閉。
// 依賴 supertest 7 的行為：base URL 傳字串時建構子不會 listen，且 url 可改寫。
// 升級 supertest 後要重跑 testApi.test.ts。
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { RequestListener } from "node:http";
import supertest from "supertest";
import type { CallbackHandler } from "superagent";

export type { Response } from "supertest";

const HOST = "127.0.0.1";

class LoopbackTest extends supertest.Test {
  private readonly server: http.Server;

  constructor(listener: RequestListener, method: string, path: string) {
    //* 傳字串 base URL，supertest 就不會自己 listen；真正的位址在 end() 補上
    super("", method, path);
    this.server = http.createServer(listener);
  }

  end(callback?: CallbackHandler): this {
    const server = this.server;
    const done: CallbackHandler = (err, res) => {
      server.close(() => callback?.(err, res));
    };
    const onListenError = (error: Error) => callback?.(error, undefined as never);
    server.once("error", onListenError);
    server.listen(0, HOST, () => {
      server.off("error", onListenError);
      const { port } = server.address() as AddressInfo;
      this.url = `http://${HOST}:${port}${this.url}`;
      super.end(done);
    });
    return this;
  }
}

/** supertest 的 request(app)，但先綁 127.0.0.1 再送出 */
export function request(app: RequestListener) {
  const forMethod = (method: string) => (path: string) => new LoopbackTest(app, method, path);
  return {
    get: forMethod("get"),
    post: forMethod("post"),
    put: forMethod("put"),
    patch: forMethod("patch"),
    delete: forMethod("delete"),
  };
}
