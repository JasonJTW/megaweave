// supertest 的 request(app) 會用 app.listen(0) 綁在 `::`，卻連到 127.0.0.1。
// macOS 上別的程式仍能指定同一個號碼綁 127.0.0.1，系統會把測試的連線交給它，
// 測試就收到它的 404、Parse Error 或 ECONNRESET（#147）。
// 這裡改成先綁好 127.0.0.1 再送出：綁定位址和連線位址一致，搶占者只會拿到
// EADDRINUSE。用法與 supertest 的 request(app) 相同，每個請求用自己的 server，
// 回應後關閉。
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { RequestListener } from "node:http";
import supertest from "supertest";
import type { CallbackHandler } from "superagent";

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
    server.once("error", (error) => callback?.(error, undefined as never));
    server.listen(0, HOST, () => {
      const { port } = server.address() as AddressInfo;
      this.url = `http://${HOST}:${port}${this.url}`;
      super.end(done);
    });
    return this;
  }
}

/** supertest 的 request(app)，但先綁 127.0.0.1 再送出 */
export function request(app: RequestListener) {
  const test = (method: string) => (path: string) => new LoopbackTest(app, method, path);
  return {
    get: test("get"),
    post: test("post"),
    put: test("put"),
    patch: test("patch"),
    delete: test("delete"),
  };
}
