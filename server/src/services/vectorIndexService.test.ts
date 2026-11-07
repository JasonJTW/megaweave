import {
  ensureVectorIndexExists,
  autoSyncVectorsIfEmpty,
  syncVectorsFromMySQL,
  getNumDocsFromFtInfo,
} from "./vectorIndexService";
import { getVectorRedisClient } from "../utils/redis";
import dbPool from "../utils/db";

jest.mock("../utils/redis");
jest.mock("../utils/db");

describe("vectorIndexService", () => {
  let mockRedis: {
    sendCommand: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
    hSet: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis = {
      sendCommand: jest.fn(),
      set: jest.fn().mockResolvedValue("OK"),
      del: jest.fn().mockResolvedValue(1),
      hSet: jest.fn().mockResolvedValue(1),
    };
    (getVectorRedisClient as jest.Mock).mockReturnValue(mockRedis);
  });

  describe("getNumDocsFromFtInfo", () => {
    it("parses num_docs correctly from FT.INFO array", () => {
      const rawInfo = [
        "index_name",
        "idx:posts_v",
        "num_docs",
        "42",
        "max_doc_id",
        "100",
      ];
      expect(getNumDocsFromFtInfo(rawInfo)).toBe(42);
    });

    it("returns 0 if rawInfo is not an array or missing num_docs", () => {
      expect(getNumDocsFromFtInfo(null)).toBe(0);
      expect(getNumDocsFromFtInfo(["index_name", "idx:posts_v"])).toBe(0);
    });
  });

  describe("syncVectorsFromMySQL", () => {
    it("reads embeddings from MySQL and writes Float32 buffers to Redis", async () => {
      const sampleVector = [0.1, 0.2, 0.3];
      (dbPool.query as jest.Mock).mockResolvedValue([
        [
          {
            id: 101,
            type: "giveaway",
            org_id: null,
            audience_tier: "public",
            embedding: JSON.stringify(sampleVector),
          },
          {
            id: 102,
            type: "request",
            org_id: 7,
            audience_tier: "internal",
            embedding: sampleVector,
          },
        ],
      ]);

      const count = await syncVectorsFromMySQL();
      expect(count).toBe(2);
      expect(mockRedis.hSet).toHaveBeenCalledTimes(2);
      expect(mockRedis.hSet).toHaveBeenCalledWith("post:101", {
        v: expect.any(Buffer),
        post_id: 101,
        status: "giveaway",
        scope: "public",
      });
      expect(mockRedis.hSet).toHaveBeenCalledWith("post:102", {
        v: expect.any(Buffer),
        post_id: 102,
        status: "request",
        scope: "org:7:internal",
      });
    });

    it("handles empty MySQL results gracefully", async () => {
      (dbPool.query as jest.Mock).mockResolvedValue([[]]);
      const count = await syncVectorsFromMySQL();
      expect(count).toBe(0);
      expect(mockRedis.hSet).not.toHaveBeenCalled();
    });

    it("handles database query errors gracefully without throwing", async () => {
      (dbPool.query as jest.Mock).mockRejectedValue(new Error("DB_DISCONNECTED"));
      const count = await syncVectorsFromMySQL();
      expect(count).toBe(0);
    });
  });

  describe("autoSyncVectorsIfEmpty", () => {
    it("acquires distributed lock and syncs vectors", async () => {
      mockRedis.set.mockResolvedValue("OK");
      (dbPool.query as jest.Mock).mockResolvedValue([[]]);

      const count = await autoSyncVectorsIfEmpty();
      expect(count).toBe(0);
      expect(mockRedis.set).toHaveBeenCalledWith(
        "lock:vector_boot_sync",
        "1",
        { NX: true, EX: 120 },
      );
      expect(mockRedis.del).toHaveBeenCalledWith("lock:vector_boot_sync");
    });

    it("skips sync if another instance already holds the lock", async () => {
      mockRedis.set.mockResolvedValue(null);

      const count = await autoSyncVectorsIfEmpty();
      expect(count).toBe(0);
      expect(dbPool.query).not.toHaveBeenCalled();
    });
  });

  describe("ensureVectorIndexExists", () => {
    //* FT.INFO 的 attributes：每個欄位一個 [identifier, ..., attribute, ..., type, ...] 陣列
    const attribute = (name: string, type: string) => [
      "identifier",
      name,
      "attribute",
      name,
      "type",
      type,
    ];
    const ftInfo = (numDocs: number, fields: string[][]) => [
      "index_name",
      "idx:posts_v",
      "attributes",
      fields,
      "num_docs",
      String(numDocs),
    ];
    const FIELDS_BEFORE_SCOPE = [
      attribute("v", "VECTOR"),
      attribute("post_id", "NUMERIC"),
      attribute("status", "TAG"),
    ];

    it("adds the scope TAG to an existing index that lacks it, then backfills scopes", async () => {
      mockRedis.sendCommand.mockImplementation(async (args: string[]) =>
        args[0] === "FT.INFO" ? ftInfo(10, FIELDS_BEFORE_SCOPE) : "OK",
      );
      (dbPool.execute as jest.Mock).mockResolvedValue([[]]);

      await ensureVectorIndexExists();

      expect(mockRedis.sendCommand).toHaveBeenCalledWith([
        "FT.ALTER",
        "idx:posts_v",
        "SCHEMA",
        "ADD",
        "scope",
        "TAG",
      ]);
      expect(dbPool.execute).toHaveBeenCalledWith(
        expect.stringContaining("SELECT id, org_id, audience_tier FROM posts"),
        [0],
      );
    });

    it("leaves an index that already has the scope TAG alone", async () => {
      mockRedis.sendCommand.mockResolvedValue(
        ftInfo(10, [...FIELDS_BEFORE_SCOPE, attribute("scope", "TAG")]),
      );

      await ensureVectorIndexExists();

      expect(mockRedis.sendCommand).toHaveBeenCalledTimes(1);
      expect(dbPool.execute).not.toHaveBeenCalled();
    });

    it("checks existing index and triggers autoSync when num_docs is 0", async () => {
      mockRedis.sendCommand.mockResolvedValue(
        ftInfo(0, [...FIELDS_BEFORE_SCOPE, attribute("scope", "TAG")]),
      );
      (dbPool.query as jest.Mock).mockResolvedValue([[]]);

      await ensureVectorIndexExists();
      expect(mockRedis.sendCommand).toHaveBeenCalledWith(["FT.INFO", "idx:posts_v"]);
      expect(mockRedis.set).toHaveBeenCalledWith(
        "lock:vector_boot_sync",
        "1",
        expect.any(Object),
      );
    });

    it("creates index with FT.CREATE when index does not exist, then triggers autoSync", async () => {
      mockRedis.sendCommand
        .mockRejectedValueOnce(new Error("Unknown Index name"))
        .mockResolvedValueOnce("OK");
      (dbPool.query as jest.Mock).mockResolvedValue([[]]);

      await ensureVectorIndexExists();
      expect(mockRedis.sendCommand).toHaveBeenCalledWith([
        "FT.CREATE",
        "idx:posts_v",
        "ON",
        "HASH",
        "PREFIX",
        "1",
        "post:",
        "SCHEMA",
        "v",
        "VECTOR",
        "HNSW",
        "6",
        "TYPE",
        "FLOAT32",
        "DIM",
        "1536",
        "DISTANCE_METRIC",
        "COSINE",
        "post_id",
        "NUMERIC",
        "status",
        "TAG",
        "scope",
        "TAG",
      ]);
    });
  });
});
