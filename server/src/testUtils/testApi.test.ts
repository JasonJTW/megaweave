import express from "express";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { request } from "./testApi";

/** 試著指定同一個號碼綁 127.0.0.1，模擬本機其他程式搶連接埠（#147） */
function squat(port: number): Promise<NodeJS.ErrnoException | null> {
  return new Promise((resolve) => {
    const squatter = net.createServer();
    squatter.once("error", (error) => resolve(error));
    squatter.listen(port, "127.0.0.1", () => squatter.close(() => resolve(null)));
  });
}

describe("testApi request()", () => {
  it("binds 127.0.0.1, so another program cannot bind the same port there and take the request", async () => {
    const app = express();
    app.get("/where", async (req, res) => {
      const { port } = req.socket.address() as AddressInfo;
      const squatError = await squat(port);
      res.json({ port, squatCode: squatError?.code ?? null });
    });

    const res = await request(app).get("/where");

    expect(res.status).toBe(200);
    expect(res.body.squatCode).toBe("EADDRINUSE");
  });

  it("closes the server once the response arrives", async () => {
    const app = express();
    app.get("/port", (req, res) => {
      res.json({ port: (req.socket.address() as AddressInfo).port });
    });

    const res = await request(app).get("/port");

    const connectError = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
      const socket = net.connect(res.body.port, "127.0.0.1", () => {
        socket.destroy();
        resolve(null);
      });
      socket.once("error", resolve);
    });
    expect(connectError?.code).toBe("ECONNREFUSED");
  });
});
