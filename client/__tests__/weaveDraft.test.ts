import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Post } from "@/app/types/schema";
import {
  createInitialDraft,
  getWeaveSubmitPayload,
  requestableQuantity,
} from "@/app/types/weaveDraft";

function postWith(
  items: Array<{ quantity: number; reserved_quantity?: number }>,
) {
  return {
    id: 1,
    title: "Chairs",
    items: items.map((it, i) => ({
      id: 100 + i,
      post_id: 1,
      title: `Item ${i}`,
      created_at: "",
      updated_at: "",
      ...it,
    })),
  } as unknown as Post;
}

describe("requestableQuantity", () => {
  it("subtracts what approved weaves reserved", () => {
    assert.equal(requestableQuantity({ quantity: 5, reserved_quantity: 3 }), 2);
  });

  it("treats a missing reservation as none", () => {
    assert.equal(requestableQuantity({ quantity: 5 }), 5);
  });

  it("never goes below zero", () => {
    assert.equal(requestableQuantity({ quantity: 2, reserved_quantity: 3 }), 0);
  });
});

describe("createInitialDraft with reserved stock", () => {
  it("'all' asks for what is still requestable, not the stock on hand", () => {
    const draft = createInitialDraft(
      postWith([{ quantity: 5, reserved_quantity: 3 }]),
    );
    assert.equal(draft.mode, "all_items");
    assert.deepEqual(getWeaveSubmitPayload(draft), [
      { itemId: 100, quantity: 2, title: "Item 0" },
    ]);
  });

  it("leaves a fully reserved item unselected", () => {
    const draft = createInitialDraft(
      postWith([{ quantity: 3, reserved_quantity: 3 }, { quantity: 2 }]),
    );
    assert.deepEqual(
      draft.items.map((it) => [it.selected, it.quantityLeft]),
      [
        [false, 0],
        [true, 2],
      ],
    );
  });
});
