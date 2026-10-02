import { IsolationSafetyError } from "./errors";
import { assertIsolatedDataStores } from "./dataStoreGuard";
import { createFakeStores, FakeStoreOptions } from "./fakeStores.test-utils";
import { resetIsolatedStores } from "./resetStores";

describe("isolated data store guard", () => {
  it("accepts data stores that all carry the isolation marker", async () => {
    const { stores } = createFakeStores();

    await expect(assertIsolatedDataStores(stores)).resolves.toBeUndefined();
  });

  it.each<[string, FakeStoreOptions]>([
    ["MySQL has no marker table", { mysqlMarker: { errorCode: "ER_NO_SUCH_TABLE" } }],
    ["MySQL cannot be queried", { mysqlMarker: { errorCode: "ECONNREFUSED" } }],
    ["the MySQL marker table is empty", { mysqlMarker: { rows: [] } }],
    ["the MySQL marker has another value", { mysqlMarker: { rows: [{ marker: "production" }] } }],
    [
      "the MySQL marker table has extra rows",
      { mysqlMarker: { rows: [{ marker: "megaweave-isolated" }, { marker: "production" }] } },
    ],
    ["cache Redis has no marker", { cacheMarker: null }],
    ["vector Redis has another marker", { vectorMarker: "production" }],
  ])("refuses when %s", async (_label, options) => {
    const { stores } = createFakeStores(options);

    await expect(assertIsolatedDataStores(stores)).rejects.toBeInstanceOf(IsolationSafetyError);
  });

  it.each<[string, FakeStoreOptions]>([
    ["MySQL is not an isolated database", { mysqlMarker: { errorCode: "ER_NO_SUCH_TABLE" } }],
    ["cache Redis is not an isolated instance", { cacheMarker: null }],
    ["vector Redis is not an isolated instance", { vectorMarker: null }],
    ["queue Redis is not an isolated instance", { queueMarker: null }],
    ["queue Redis has another marker", { queueMarker: "production" }],
  ])("resets nothing when %s", async (_label, options) => {
    const { stores, queueRedis, writes } = createFakeStores(options);

    await expect(resetIsolatedStores(stores, queueRedis)).rejects.toBeInstanceOf(
      IsolationSafetyError,
    );
    expect(writes()).toEqual([]);
  });
});
