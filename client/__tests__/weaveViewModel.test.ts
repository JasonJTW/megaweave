import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getWeaveViewModel,
  type WeaveAction,
  type WeaveViewStatus,
} from "@/utils/weaveViewModel";

const AUTHOR = 1;
const INITIATOR = 2;
const STRANGER = 3;

type PostType = "share" | "wish";

// ADR 0001: Share -> author gives; Wish -> initiator gives.
function parties(postType: PostType) {
  return postType === "share"
    ? { giverId: AUTHOR, receiverId: INITIATOR }
    : { giverId: INITIATOR, receiverId: AUTHOR };
}

function actions(
  postType: PostType,
  status: WeaveViewStatus,
  viewerId: number,
  confirmed: { giver?: boolean; receiver?: boolean } = {},
): WeaveAction[] {
  return [
    ...getWeaveViewModel({
      status,
      viewerId,
      postAuthorId: AUTHOR,
      ...parties(postType),
      giverConfirmed: confirmed.giver ?? false,
      receiverConfirmed: confirmed.receiver ?? false,
    }).actions,
  ].sort();
}

describe("getWeaveViewModel actions", () => {
  for (const postType of ["share", "wish"] as PostType[]) {
    describe(postType, () => {
      it("requested: Post Author can approve and decline, not withdraw", () => {
        assert.deepEqual(actions(postType, "requested", AUTHOR), [
          "approve",
          "decline",
        ]);
      });

      it("requested: Initiator can only withdraw (never approve own request)", () => {
        assert.deepEqual(actions(postType, "requested", INITIATOR), [
          "withdraw",
        ]);
      });

      it("requested: non-party has no actions", () => {
        assert.deepEqual(actions(postType, "requested", STRANGER), []);
      });

      for (const viewer of [AUTHOR, INITIATOR]) {
        const who = viewer === AUTHOR ? "Post Author" : "Initiator";
        it(`approved: ${who} can confirm and cancel when nobody confirmed`, () => {
          assert.deepEqual(actions(postType, "approved", viewer), [
            "cancel",
            "confirm",
          ]);
        });

        it(`approved: ${who} can only cancel after confirming own side`, () => {
          const { giverId } = parties(postType);
          const mine =
            viewer === giverId ? { giver: true } : { receiver: true };
          assert.deepEqual(actions(postType, "approved", viewer, mine), [
            "cancel",
          ]);
        });

        it(`approved: ${who} can still confirm when only the other side confirmed`, () => {
          const { giverId } = parties(postType);
          const theirs =
            viewer === giverId ? { receiver: true } : { giver: true };
          assert.deepEqual(actions(postType, "approved", viewer, theirs), [
            "cancel",
            "confirm",
          ]);
        });

        it(`approved: ${who} can only cancel when both confirmed`, () => {
          assert.deepEqual(
            actions(postType, "approved", viewer, {
              giver: true,
              receiver: true,
            }),
            ["cancel"],
          );
        });
      }

      it("approved: non-party has no actions", () => {
        assert.deepEqual(actions(postType, "approved", STRANGER), []);
      });

      for (const status of [
        "completed",
        "declined",
        "withdrawn",
        "cancelled",
      ] as WeaveViewStatus[]) {
        it(`${status}: nobody has actions`, () => {
          for (const viewer of [AUTHOR, INITIATOR, STRANGER])
            assert.deepEqual(actions(postType, status, viewer), []);
        });
      }
    });
  }

  it("requested with unknown Post Author yields no actions", () => {
    const { actions } = getWeaveViewModel({
      status: "requested",
      viewerId: AUTHOR,
      postAuthorId: undefined,
      giverId: AUTHOR,
      receiverId: INITIATOR,
      giverConfirmed: false,
      receiverConfirmed: false,
    });
    assert.equal(actions.size, 0);
  });

  it("undefined status or viewer yields no actions", () => {
    assert.deepEqual(
      getWeaveViewModel({
        status: undefined,
        viewerId: undefined,
        postAuthorId: AUTHOR,
        giverId: AUTHOR,
        receiverId: INITIATOR,
        giverConfirmed: false,
        receiverConfirmed: false,
      }).actions.size,
      0,
    );
  });
});
