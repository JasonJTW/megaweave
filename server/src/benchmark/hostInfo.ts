// server/src/benchmark/hostInfo.ts
// 自動記錄 benchmark 執行主機，讓每份結果都能分辨是在開發機還是 EC2 上量測。
// 刻意不記錄 hostname：常含個人名稱，而結果摘要可能被 commit 或公開。

import { execFile } from "child_process";
import { request } from "http";
import { arch, cpus, platform, release, totalmem } from "os";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const GIB = 1024 ** 3;
/** EC2 以外的環境連不到 metadata 服務，必須快速放棄以免拖慢每次執行 */
const IMDS_TIMEOUT_MS = 500;
const IMDS_BASE_URL = "http://169.254.169.254/latest";

export interface HostInfo {
  platform: string;
  osRelease: string;
  arch: string;
  cpuModel: string;
  logicalCpus: number;
  totalMemoryGb: number;
  nodeVersion: string;
  /** 在 EC2 上執行時的機型與區域；其他環境為 null */
  aws: { instanceType: string; region: string | null } | null;
  /** Docker 可用資源；macOS 上容器實際受限於 Docker VM 的 CPU 與記憶體 */
  docker: { serverVersion: string; cpus: number; memoryGb: number } | null;
}

export interface HostInfoDependencies {
  fetch?: typeof fetch;
  runDocker?: (args: string[]) => Promise<string>;
}

const roundGb = (bytes: number) => Math.round((bytes / GIB) * 10) / 10;

/**
 * IMDS 專用的最小 fetch：global fetch 逾時後雖會 reject，但卡住的 TCP 連線要等 undici 的
 * 10 秒連線逾時才釋放，讓 CLI 在非 EC2 主機上遲遲無法結束；這裡逾時即 destroy 連線。
 */
export function imdsFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string> | undefined,
    });
    const abort = () => req.destroy(init.signal?.reason ?? new Error("aborted"));
    if (init.signal?.aborted) return abort();
    init.signal?.addEventListener("abort", abort, { once: true });

    req.on("response", (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        init.signal?.removeEventListener("abort", abort);
        resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 0 }));
      });
      res.on("error", reject);
    });
    req.on("error", (error) => {
      init.signal?.removeEventListener("abort", abort);
      reject(error);
    });
    req.end();
  });
}

async function detectAws(fetchImpl: typeof fetch): Promise<HostInfo["aws"]> {
  try {
    // IMDSv2：先取得 session token 才能讀取 metadata
    const tokenResponse = await fetchImpl(`${IMDS_BASE_URL}/api/token`, {
      method: "PUT",
      headers: { "X-aws-ec2-metadata-token-ttl-seconds": "60" },
      signal: AbortSignal.timeout(IMDS_TIMEOUT_MS),
    });
    if (!tokenResponse.ok) return null;
    const token = await tokenResponse.text();

    const read = async (path: string) => {
      const response = await fetchImpl(`${IMDS_BASE_URL}/meta-data/${path}`, {
        headers: { "X-aws-ec2-metadata-token": token },
        signal: AbortSignal.timeout(IMDS_TIMEOUT_MS),
      });
      return response.ok ? (await response.text()).trim() : null;
    };

    const instanceType = await read("instance-type");
    if (!instanceType) return null;
    return { instanceType, region: await read("placement/region") };
  } catch {
    return null;
  }
}

async function defaultRunDocker(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("docker", args, { timeout: 3000 });
  return stdout;
}

async function detectDocker(
  runDocker: (args: string[]) => Promise<string>,
): Promise<HostInfo["docker"]> {
  try {
    const output = await runDocker([
      "info",
      "--format",
      "{{json .ServerVersion}} {{.NCPU}} {{.MemTotal}}",
    ]);
    const [version, ncpu, memTotal] = output.trim().split(" ");
    const cpuCount = Number(ncpu);
    const memoryBytes = Number(memTotal);
    if (!Number.isFinite(cpuCount) || !Number.isFinite(memoryBytes)) return null;
    return {
      serverVersion: JSON.parse(version) as string,
      cpus: cpuCount,
      memoryGb: roundGb(memoryBytes),
    };
  } catch {
    return null;
  }
}

export async function collectHostInfo(
  dependencies: HostInfoDependencies = {},
): Promise<HostInfo> {
  const processors = cpus();
  const [aws, docker] = await Promise.all([
    detectAws(dependencies.fetch ?? (imdsFetch as typeof fetch)),
    detectDocker(dependencies.runDocker ?? defaultRunDocker),
  ]);

  return {
    platform: platform(),
    osRelease: release(),
    arch: arch(),
    cpuModel: processors[0]?.model.trim() ?? "unknown",
    logicalCpus: processors.length,
    totalMemoryGb: roundGb(totalmem()),
    nodeVersion: process.version,
    aws,
    docker,
  };
}

export function describeHost(host: HostInfo): string {
  const machine = host.aws
    ? `AWS ${host.aws.instanceType}${host.aws.region ? ` (${host.aws.region})` : ""}`
    : "non-EC2 host";
  const docker = host.docker
    ? `; Docker ${host.docker.serverVersion} with ${host.docker.cpus} CPUs / ${host.docker.memoryGb} GB`
    : "";
  return `${machine}, ${host.platform} ${host.osRelease} ${host.arch}, ${host.cpuModel} (${host.logicalCpus} CPUs), ${host.totalMemoryGb} GB, Node ${host.nodeVersion}${docker}`;
}
