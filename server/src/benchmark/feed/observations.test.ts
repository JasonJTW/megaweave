import { diffSnapshots, parseRedisInfo, ResourceSnapshot } from "./observations";

function snapshot(overrides: Partial<ResourceSnapshot> = {}): ResourceSnapshot {
  return {
    atMs: 0,
    mysqlStatus: {
      Questions: 100,
      Com_select: 80,
      Innodb_rows_read: 1_000,
      Innodb_buffer_pool_read_requests: 5_000,
      Innodb_buffer_pool_reads: 10,
      Bytes_sent: 20_000,
      Created_tmp_tables: 3,
      Created_tmp_disk_tables: 0,
      Sort_rows: 40,
      Slow_queries: 0,
      Threads_connected: 4,
    },
    mysqlStatements: { count: 90, latencyPicoseconds: 2_000_000_000, rowsExamined: 900, rowsSent: 300 },
    redis: {
      cache: { total_commands_processed: 50, keyspace_hits: 10, keyspace_misses: 5, used_memory: 1_000_000 },
      vector: { total_commands_processed: 70, keyspace_hits: 20, keyspace_misses: 0, used_memory: 90_000_000 },
    },
    api: {
      feedCandidateVectorReads: { reads: 100, failed: 0, missing: 0, cacheHits: 50 },
      feedVectorCaches: { postVectors: 100, postVectorCapacity: 2000, userVectors: 3 },
      process: { cpuUserMicros: 1_000_000, cpuSystemMicros: 500_000, rssBytes: 200_000_000, heapUsedBytes: 80_000_000 },
    },
    ...overrides,
  };
}

describe("feed benchmark resource observations", () => {
  it("parses numeric fields from Redis INFO output", () => {
    expect(
      parseRedisInfo("# Stats\r\ntotal_commands_processed:42\r\nkeyspace_hits:7\r\nrole:master\r\n"),
    ).toEqual({ total_commands_processed: 42, keyspace_hits: 7 });
  });

  it("reports MySQL, Redis, API, and feed-cache activity during the measurement window", () => {
    const start = snapshot();
    const end = snapshot({
      atMs: 10_000,
      mysqlStatus: {
        ...start.mysqlStatus,
        Questions: 400,
        Com_select: 360,
        Innodb_rows_read: 91_000,
        Innodb_buffer_pool_read_requests: 45_000,
        Innodb_buffer_pool_reads: 12,
        Bytes_sent: 5_020_000,
        Threads_connected: 6,
      },
      mysqlStatements: { count: 390, latencyPicoseconds: 602_000_000_000, rowsExamined: 90_900, rowsSent: 3_300 },
      redis: {
        cache: { total_commands_processed: 350, keyspace_hits: 310, keyspace_misses: 5, used_memory: 1_100_000 },
        vector: { total_commands_processed: 1_070, keyspace_hits: 920, keyspace_misses: 0, used_memory: 90_000_000 },
      },
      api: {
        feedCandidateVectorReads: { reads: 400, failed: 1, missing: 2, cacheHits: 950 },
        feedVectorCaches: { postVectors: 400, postVectorCapacity: 2000, userVectors: 5 },
        process: { cpuUserMicros: 4_000_000, cpuSystemMicros: 1_500_000, rssBytes: 210_000_000, heapUsedBytes: 90_000_000 },
      },
    });
    const apiSamples = [
      { rssBytes: 205_000_000, heapUsedBytes: 95_000_000 },
      { rssBytes: 220_000_000, heapUsedBytes: 85_000_000 },
    ];

    expect(diffSnapshots(start, end, apiSamples)).toEqual({
      mysql: {
        queries: 300,
        selects: 280,
        innodbRowsRead: 90_000,
        bufferPoolReadRequests: 40_000,
        bufferPoolDiskReads: 2,
        bytesSent: 5_000_000,
        tmpTables: 0,
        tmpDiskTables: 0,
        sortRows: 0,
        slowQueries: 0,
        threadsConnectedAtEnd: 6,
        statements: { count: 300, totalLatencyMs: 600, rowsExamined: 90_000, rowsSent: 3_000 },
      },
      redisCache: { commands: 300, keyspaceHits: 300, keyspaceMisses: 0, usedMemoryBytesAtEnd: 1_100_000 },
      redisVector: { commands: 1_000, keyspaceHits: 900, keyspaceMisses: 0, usedMemoryBytesAtEnd: 90_000_000 },
      api: {
        cpuMs: 4_000,
        // 以單一核心為 100%
        cpuPercent: 40,
        rssBytesMax: 220_000_000,
        heapUsedBytesMax: 95_000_000,
      },
      feedCaches: {
        candidateVectorLookups: 1_200,
        candidateVectorCacheHits: 900,
        candidateVectorCacheHitRate: 0.75,
        candidateVectorRedisReads: 300,
        candidateVectorReadFailures: 1,
        candidateVectorsMissing: 2,
        postVectorCacheSizeAtEnd: 400,
        postVectorCacheCapacity: 2000,
        userVectorCacheSizeAtEnd: 5,
      },
    });
  });

  it("marks MySQL statement metrics unavailable instead of reporting zeros", () => {
    const observations = diffSnapshots(
      snapshot({ mysqlStatements: null }),
      snapshot({ atMs: 1000, mysqlStatements: null }),
      [],
    );

    expect(observations.mysql.statements).toBeNull();
    expect(observations.feedCaches.candidateVectorCacheHitRate).toBeNull();
  });
});
