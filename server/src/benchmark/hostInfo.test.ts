import { createServer } from "http";
import { AddressInfo } from "net";
import { hostname } from "os";
import { collectHostInfo, describeHost, imdsFetch } from "./hostInfo";

function response(status: number, body = ""): Response {
  return new Response(body, { status });
}

describe("benchmark host info", () => {
  it("records the EC2 instance type and region through IMDSv2", async () => {
    const fetchImpl = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/api/token")) {
        expect(init?.method).toBe("PUT");
        return response(200, "session-token");
      }
      expect((init?.headers as Record<string, string>)["X-aws-ec2-metadata-token"]).toBe(
        "session-token",
      );
      if (path.endsWith("/instance-type")) return response(200, "t3.small\n");
      if (path.endsWith("/placement/region")) return response(200, "ap-northeast-1");
      return response(404);
    }) as unknown as typeof fetch;

    const host = await collectHostInfo({
      fetch: fetchImpl,
      runDocker: async () => '"27.3.1" 2 2084122624\n',
    });

    expect(host.aws).toEqual({ instanceType: "t3.small", region: "ap-northeast-1" });
    expect(host.docker).toEqual({ serverVersion: "27.3.1", cpus: 2, memoryGb: 1.9 });
    expect(describeHost(host)).toMatch(
      /^AWS t3\.small \(ap-northeast-1\), .+; Docker 27\.3\.1 with 2 CPUs \/ 1\.9 GB$/,
    );
  });

  it("reports a non-EC2 host without Docker when neither is reachable", async () => {
    const host = await collectHostInfo({
      fetch: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
      runDocker: async () => {
        throw new Error("docker: command not found");
      },
    });

    expect(host.aws).toBeNull();
    expect(host.docker).toBeNull();
    expect(host.logicalCpus).toBeGreaterThan(0);
    expect(host.totalMemoryGb).toBeGreaterThan(0);
    expect(host.nodeVersion).toBe(process.version);
    expect(describeHost(host)).toMatch(/^non-EC2 host, /);
  });

  it("does not record the machine's hostname", async () => {
    const host = await collectHostInfo({
      fetch: (async () => response(404)) as unknown as typeof fetch,
      runDocker: async () => {
        throw new Error("unavailable");
      },
    });

    expect(JSON.stringify(host)).not.toContain(hostname());
  });

  it("closes the metadata connection when a request times out", async () => {
    // 非 EC2 主機上 metadata 請求可能卡住；逾時後必須斷開連線，否則 CLI 會多等約 10 秒才結束
    let closed: Promise<void> = Promise.resolve();
    const server = createServer((req) => {
      closed = new Promise((resolve) => req.socket.on("close", () => resolve()));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    await expect(
      imdsFetch(`http://127.0.0.1:${port}/latest/api/token`, {
        method: "PUT",
        signal: AbortSignal.timeout(100),
      }),
    ).rejects.toThrow();
    await closed;

    await new Promise((resolve) => server.close(resolve));
  });

  it("returns the metadata response body and status", async () => {
    const server = createServer((req, res) => {
      res.writeHead(req.headers["x-aws-ec2-metadata-token"] === "token" ? 200 : 401);
      res.end("t3.small");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    const ok = await imdsFetch(`http://127.0.0.1:${port}/`, { headers: { "X-aws-ec2-metadata-token": "token" } });
    const denied = await imdsFetch(`http://127.0.0.1:${port}/`);

    expect([ok.status, await ok.text()]).toEqual([200, "t3.small"]);
    expect(denied.ok).toBe(false);
    await new Promise((resolve) => server.close(resolve));
  });
});
