import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getWeaveViewModel,
  type WeaveViewStatus,
} from "@/utils/weaveViewModel";
import type { WeaveViewer } from "@/lib/weave";

// Which commands a viewer may send comes from the server's transition table
// (server/src/services/weave/weave.db.test.ts). Here: labels and hints for a given viewer.
const reviewer: WeaveViewer = {
  role: "receiver",
  isInitiator: false,
  isReviewer: true,
  commands: ["approve", "decline"],
};
const initiator: WeaveViewer = {
  role: "giver",
  isInitiator: true,
  isReviewer: false,
  commands: ["withdraw"],
};
const party = (role: "giver" | "receiver"): WeaveViewer => ({
  role,
  isInitiator: false,
  isReviewer: false,
  commands: ["cancel", "confirm"],
});

function view(
  status: WeaveViewStatus,
  viewer: WeaveViewer | undefined,
  confirmed: { giver?: boolean; receiver?: boolean } = {},
) {
  return getWeaveViewModel({
    status,
    viewer,
    giverConfirmed: confirmed.giver ?? false,
    receiverConfirmed: confirmed.receiver ?? false,
  });
}

describe("getWeaveViewModel", () => {
  it("takes the actions from the server's viewer commands", () => {
    assert.deepEqual(
      [...view("requested", reviewer).actions],
      ["approve", "decline"],
    );
    assert.deepEqual([...view("requested", initiator).actions], ["withdraw"]);
    assert.equal(view("requested", undefined).actions.size, 0);
  });

  it("requested: the Reviewer sees New Request, the Initiator sees Request Sent", () => {
    assert.deepEqual(
      {
        statusKey: view("requested", reviewer).statusKey,
        hintKey: view("requested", reviewer).hintKey,
      },
      { statusKey: "newRequest", hintKey: "requested.decideOnRequest" },
    );
    assert.deepEqual(
      {
        statusKey: view("requested", initiator).statusKey,
        hintKey: view("requested", initiator).hintKey,
      },
      { statusKey: "requestSent", hintKey: "requested.awaitingAuthor" },
    );
  });

  it("approved: hints follow Giver / Receiver and confirmation state", () => {
    const hint = (
      role: "giver" | "receiver",
      c: { giver?: boolean; receiver?: boolean },
    ) => view("approved", party(role), c).hintKey;
    assert.equal(hint("giver", {}), "approved.confirmHandover");
    assert.equal(hint("receiver", {}), "approved.confirmReceipt");
    assert.equal(hint("giver", { giver: true }), "approved.waitingForReceiver");
    assert.equal(
      hint("receiver", { receiver: true }),
      "approved.waitingForGiver",
    );
    assert.equal(
      hint("giver", { receiver: true }),
      "approved.receiverConfirmedPleaseConfirmHandover",
    );
    assert.equal(
      hint("receiver", { giver: true }),
      "approved.giverConfirmedPleaseConfirmReceipt",
    );
    assert.equal(view("approved", party("giver")).statusKey, "weaving");
  });

  const terminal: [WeaveViewStatus, string][] = [
    ["completed", "weaved"],
    ["declined", "declined"],
    ["withdrawn", "withdrawn"],
    ["cancelled", "cancelled"],
  ];
  for (const [status, key] of terminal) {
    it(`${status}: shows ${key} with no hint`, () => {
      const closed = { ...party("giver"), commands: [] };
      assert.equal(view(status, closed).statusKey, key);
      assert.equal(view(status, closed).hintKey, null);
    });
  }
});
