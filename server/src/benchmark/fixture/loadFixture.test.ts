import { IsolationSafetyError } from "../../isolation/errors";
import { createFakeStores } from "../../isolation/fakeStores.test-utils";
import { generateFixture } from "./generateFixture";
import { loadFixture } from "./loadFixture";

describe("loadFixture", () => {
  it("loads nothing when the target is not an isolated database", async () => {
    const { stores, writes } = createFakeStores({ mysqlMarker: { errorCode: "ER_NO_SUCH_TABLE" } });
    const dataset = generateFixture({ seed: 1, posts: 100 });

    await expect(loadFixture(stores, dataset)).rejects.toBeInstanceOf(IsolationSafetyError);
    expect(writes()).toEqual([]);
  });
});
