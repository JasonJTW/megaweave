import { describe, it } from "node:test";
import assert from "node:assert/strict";
import zhTW from "../messages/zh-TW.json";
import en from "../messages/en.json";
import { WEAVE_HINT_KEYS, WEAVE_STATUS_KEYS } from "../utils/weaveViewModel";

type MessageTree = { [key: string]: string | MessageTree };

const catalogs: Record<string, MessageTree> = { "zh-TW": zhTW, en };

function lookup(tree: MessageTree, path: string): string | undefined {
  let node: string | MessageTree | undefined = tree;
  for (const segment of path.split(".")) {
    if (typeof node !== "object") return undefined;
    node = node[segment];
  }
  return typeof node === "string" ? node : undefined;
}

describe("Weave card messages", () => {
  for (const [locale, catalog] of Object.entries(catalogs)) {
    it(`translates every view-model status key in ${locale}`, () => {
      for (const key of WEAVE_STATUS_KEYS) {
        assert.ok(
          lookup(catalog, `WeaveCard.status.${key}`),
          `Missing ${locale}:WeaveCard.status.${key}`,
        );
      }
    });

    it(`translates every view-model hint key in ${locale}`, () => {
      for (const key of WEAVE_HINT_KEYS) {
        assert.ok(
          lookup(catalog, `WeaveCard.hint.${key}`),
          `Missing ${locale}:WeaveCard.hint.${key}`,
        );
      }
    });
  }

  it("uses the CONTEXT.md names for Weave states and roles", () => {
    const expected = {
      "status.weaving": ["交織中", "Weaving"],
      "status.weaved": ["交織成功", "Weaved"],
      "status.declined": ["已婉拒", "Declined"],
      "status.withdrawn": ["已撤回", "Withdrawn"],
      "status.cancelled": ["已取消", "Cancelled"],
      "role.giver": ["提供者", "Giver"],
      "role.receiver": ["接收者", "Receiver"],
    };
    for (const [key, [zh, english]] of Object.entries(expected)) {
      assert.equal(lookup(zhTW, `WeaveCard.${key}`), zh);
      assert.equal(lookup(en, `WeaveCard.${key}`), english);
    }
  });

  it("names the other party through an ICU variable in name-bearing hints", () => {
    const named = [
      "approved.waitingForReceiver",
      "approved.waitingForGiver",
      "approved.receiverConfirmedPleaseConfirmHandover",
      "approved.giverConfirmedPleaseConfirmReceipt",
    ];
    for (const catalog of Object.values(catalogs)) {
      for (const key of named) {
        assert.match(
          lookup(catalog, `WeaveCard.hint.${key}`) ?? "",
          /\{name\}/,
        );
      }
    }
  });
});
