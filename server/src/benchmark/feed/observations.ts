// server/src/benchmark/feed/observations.ts
// 量測視窗前後的資源快照：MySQL global status 與 performance_schema、Redis INFO、API /health 的
// process 與 feed 快取計數。以差值呈現視窗內的工作量；無法取得的指標明確回報為 null。

import type { Pool } from "mysql2/promise";
import { RowDataPacket } from "mysql2";
import type { AppRedisClient } from "../../utils/redis";

const MYSQL_STATUS_VARIABLES = [
  "Questions",
  "Com_select",
  "Innodb_rows_read",
  "Innodb_buffer_pool_read_requests",
  "Innodb_buffer_pool_reads",
  "Bytes_sent",
  "Created_tmp_tables",
  "Created_tmp_disk_tables",
  "Sort_rows",
  "Slow_queries",
  "Threads_connected",
] as const;

export interface MysqlStatementTotals {
  count: number;
  latencyPicoseconds: number;
  rowsExamined: number;
  rowsSent: number;
}

export interface ApiMetrics {
  feedCandidateVectorReads?: { reads: number; failed: number; missing: number; cacheHits: number };
  feedVectorCaches?: { postVectors: number; postVectorCapacity: number; userVectors: number };
  process?: { cpuUserMicros: number; cpuSystemMicros: number; rssBytes: number; heapUsedBytes: number };
}

export interface ResourceSnapshot {
  atMs: number;
  mysqlStatus: Record<string, number>;
  /** performance_schema 不可用（例如權限不足）時為 null */
  mysqlStatements: MysqlStatementTotals | null;
  redis: { cache: Record<string, number>; vector: Record<string, number> };
  api: ApiMetrics;
}

export interface ResourceSources {
  mysql: Pool;
  cacheRedis: AppRedisClient;
  vectorRedis: AppRedisClient;
  targetUrl: string;
}

export function parseRedisInfo(info: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const line of info.split(/\r?\n/)) {
    const match = /^([a-z_]+):(-?\d+(?:\.\d+)?)$/.exec(line.trim());
    if (match) values[match[1]] = Number(match[2]);
  }
  return values;
}

export async function fetchApiMetrics(targetUrl: string): Promise<ApiMetrics> {
  const response = await fetch(new URL("/health", targetUrl), { signal: AbortSignal.timeout(5000) });
  const body = (await response.json()) as { benchmarkMetrics?: ApiMetrics };
  return body.benchmarkMetrics ?? {};
}

async function readMysqlStatements(mysql: Pool): Promise<MysqlStatementTotals | null> {
  try {
    const [[row]] = await mysql.query<RowDataPacket[]>(
      `SELECT SUM(COUNT_STAR) AS count, SUM(SUM_TIMER_WAIT) AS latency,
              SUM(SUM_ROWS_EXAMINED) AS rowsExamined, SUM(SUM_ROWS_SENT) AS rowsSent
       FROM performance_schema.events_statements_summary_global_by_event_name
       WHERE EVENT_NAME LIKE 'statement/%'`,
    );
    return {
      count: Number(row.count),
      latencyPicoseconds: Number(row.latency),
      rowsExamined: Number(row.rowsExamined),
      rowsSent: Number(row.rowsSent),
    };
  } catch {
    return null;
  }
}

export async function takeSnapshot(sources: ResourceSources): Promise<ResourceSnapshot> {
  const [[statusRows], mysqlStatements, cacheInfo, vectorInfo, api] = await Promise.all([
    sources.mysql.query<RowDataPacket[]>("SHOW GLOBAL STATUS WHERE Variable_name IN (?)", [
      MYSQL_STATUS_VARIABLES,
    ]),
    readMysqlStatements(sources.mysql),
    sources.cacheRedis.info(),
    sources.vectorRedis.info(),
    fetchApiMetrics(sources.targetUrl),
  ]);
  return {
    atMs: performance.now(),
    mysqlStatus: Object.fromEntries(
      statusRows.map((row) => [String(row.Variable_name), Number(row.Value)]),
    ),
    mysqlStatements,
    redis: { cache: parseRedisInfo(String(cacheInfo)), vector: parseRedisInfo(String(vectorInfo)) },
    api,
  };
}

/** 量測期間定期讀取 API 記憶體，回報峰值而非只看結束瞬間。 */
export function startApiMemorySampler(
  targetUrl: string,
  intervalMs = 5000,
): { stop(): { rssBytes: number; heapUsedBytes: number }[] } {
  const samples: { rssBytes: number; heapUsedBytes: number }[] = [];
  const timer = setInterval(() => {
    fetchApiMetrics(targetUrl)
      .then((metrics) => {
        if (metrics.process) samples.push(metrics.process);
      })
      .catch(() => {
        // 單次取樣失敗不影響量測；峰值以其他樣本與前後快照計算
      });
  }, intervalMs);
  return {
    stop: () => {
      clearInterval(timer);
      return samples;
    },
  };
}

const delta = (end: Record<string, number>, start: Record<string, number>, key: string) =>
  (end[key] ?? 0) - (start[key] ?? 0);

export function diffSnapshots(
  start: ResourceSnapshot,
  end: ResourceSnapshot,
  apiMemorySamples: readonly { rssBytes: number; heapUsedBytes: number }[],
) {
  const mysql = (key: string) => delta(end.mysqlStatus, start.mysqlStatus, key);
  const redis = (role: "cache" | "vector") => ({
    commands: delta(end.redis[role], start.redis[role], "total_commands_processed"),
    keyspaceHits: delta(end.redis[role], start.redis[role], "keyspace_hits"),
    keyspaceMisses: delta(end.redis[role], start.redis[role], "keyspace_misses"),
    usedMemoryBytesAtEnd: end.redis[role].used_memory ?? null,
  });

  const statements =
    start.mysqlStatements && end.mysqlStatements
      ? {
          count: end.mysqlStatements.count - start.mysqlStatements.count,
          totalLatencyMs:
            Math.round(
              (end.mysqlStatements.latencyPicoseconds - start.mysqlStatements.latencyPicoseconds) / 1e8,
            ) / 10,
          rowsExamined: end.mysqlStatements.rowsExamined - start.mysqlStatements.rowsExamined,
          rowsSent: end.mysqlStatements.rowsSent - start.mysqlStatements.rowsSent,
        }
      : null;

  const windowMs = end.atMs - start.atMs;
  const startProcess = start.api.process;
  const endProcess = end.api.process;
  const memory = [...apiMemorySamples, ...(startProcess ? [startProcess] : []), ...(endProcess ? [endProcess] : [])];
  const cpuMs =
    startProcess && endProcess
      ? (endProcess.cpuUserMicros + endProcess.cpuSystemMicros -
          startProcess.cpuUserMicros - startProcess.cpuSystemMicros) / 1000
      : null;

  const startReads = start.api.feedCandidateVectorReads;
  const endReads = end.api.feedCandidateVectorReads;
  const redisReads = startReads && endReads ? endReads.reads - startReads.reads : null;
  const cacheHits = startReads && endReads ? endReads.cacheHits - startReads.cacheHits : null;
  const lookups = redisReads !== null && cacheHits !== null ? redisReads + cacheHits : null;

  return {
    mysql: {
      queries: mysql("Questions"),
      selects: mysql("Com_select"),
      innodbRowsRead: mysql("Innodb_rows_read"),
      bufferPoolReadRequests: mysql("Innodb_buffer_pool_read_requests"),
      bufferPoolDiskReads: mysql("Innodb_buffer_pool_reads"),
      bytesSent: mysql("Bytes_sent"),
      tmpTables: mysql("Created_tmp_tables"),
      tmpDiskTables: mysql("Created_tmp_disk_tables"),
      sortRows: mysql("Sort_rows"),
      slowQueries: mysql("Slow_queries"),
      threadsConnectedAtEnd: end.mysqlStatus.Threads_connected ?? null,
      statements,
    },
    redisCache: redis("cache"),
    redisVector: redis("vector"),
    api: {
      cpuMs,
      cpuPercent: cpuMs !== null && windowMs > 0 ? Math.round((cpuMs / windowMs) * 1000) / 10 : null,
      rssBytesMax: memory.length ? Math.max(...memory.map((m) => m.rssBytes)) : null,
      heapUsedBytesMax: memory.length ? Math.max(...memory.map((m) => m.heapUsedBytes)) : null,
    },
    feedCaches: {
      candidateVectorLookups: lookups,
      candidateVectorCacheHits: cacheHits,
      candidateVectorCacheHitRate:
        lookups && cacheHits !== null ? Math.round((cacheHits / lookups) * 1000) / 1000 : null,
      candidateVectorRedisReads: redisReads,
      candidateVectorReadFailures: startReads && endReads ? endReads.failed - startReads.failed : null,
      candidateVectorsMissing: startReads && endReads ? endReads.missing - startReads.missing : null,
      postVectorCacheSizeAtEnd: end.api.feedVectorCaches?.postVectors ?? null,
      postVectorCacheCapacity: end.api.feedVectorCaches?.postVectorCapacity ?? null,
      userVectorCacheSizeAtEnd: end.api.feedVectorCaches?.userVectors ?? null,
    },
  };
}

export type ResourceObservations = ReturnType<typeof diffSnapshots>;
