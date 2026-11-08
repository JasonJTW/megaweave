import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handoverNotice } from "@/utils/handoverMessage";

const meta = {
  handover: "moved_out",
  weave_id: 5,
  post_id: 9,
  item_title: "27 吋螢幕",
  other_conversation_id: 3007,
};

describe("handoverNotice", () => {
  it("points the requester to the other conversation", () => {
    assert.deepEqual(
      handoverNotice(
        {
          message_type: "system_handover",
          metadata: JSON.stringify(meta),
          sender_public_id: "org-conv:2003",
        },
        "requester-id",
      ),
      { kind: "movedOut", title: "27 吋螢幕", otherConversationId: 3007 },
    );
  });

  it("gives the contact who wrote it no link: they are not in the other conversation", () => {
    assert.deepEqual(
      handoverNotice(
        {
          message_type: "system_handover",
          metadata: { ...meta, handover: "moved_in" },
          sender_public_id: "contact-id",
        },
        "contact-id",
      ),
      { kind: "movedIn", title: "27 吋螢幕", otherConversationId: null },
    );
  });

  it("ignores other messages and broken metadata", () => {
    assert.equal(
      handoverNotice({ message_type: "text", metadata: meta }, "x"),
      null,
    );
    assert.equal(
      handoverNotice({ message_type: "system_handover", metadata: "{" }, "x"),
      null,
    );
    assert.equal(
      handoverNotice(
        { message_type: "system_handover", metadata: { handover: "other" } },
        "x",
      ),
      null,
    );
  });
});
