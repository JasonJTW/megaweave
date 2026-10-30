import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTranslator } from "next-intl";
import zhTW from "../messages/zh-TW.json";
import en from "../messages/en.json";
import { notificationText } from "../utils/notificationText";

const tZh = createTranslator({
  locale: "zh-TW",
  messages: zhTW,
  namespace: "Notifications",
});
const tEn = createTranslator({
  locale: "en",
  messages: en,
  namespace: "Notifications",
});

const legacy = {
  title: "New Like",
  content: 'Alice liked your post "Old chair"',
};

describe("notificationText", () => {
  it("shows a legacy notification without params exactly as stored", () => {
    for (const t of [tZh, tEn]) {
      assert.deepEqual(
        notificationText(t, { type: "LIKE", params: null, ...legacy }),
        legacy,
      );
      assert.deepEqual(
        notificationText(t, { type: "ORDER_UPDATE", ...legacy }),
        legacy,
      );
    }
  });

  it("renders a like in the reader's language", () => {
    const n = {
      type: "LIKE",
      params: { actorName: "Alice", postTitle: "Wooden chair" },
      ...legacy,
    };

    assert.deepEqual(notificationText(tZh, n), {
      title: "新的按讚",
      content: "Alice 對你的貼文「Wooden chair」按讚",
    });
    assert.deepEqual(notificationText(tEn, n), {
      title: "New Like",
      content: 'Alice liked your post "Wooden chair"',
    });
  });

  const actorName = "Bob";
  const postTitle = "Desk lamp";
  const cases: Array<{
    type: string;
    params: Record<string, string>;
    zh: { title: string; content: string };
    en: { title: string; content: string };
  }> = [
    {
      type: "COMMENT",
      params: { actorName, postTitle },
      zh: { title: "新的留言", content: "Bob 在你的貼文「Desk lamp」留言" },
      en: {
        title: "New Comment",
        content: 'Bob commented on your post "Desk lamp"',
      },
    },
    {
      type: "COMMENT_REPLY",
      params: { actorName },
      zh: { title: "新的回覆", content: "Bob 回覆了你的留言" },
      en: { title: "New Reply", content: "Bob replied to your comment" },
    },
    {
      type: "WEAVE_REQUESTED",
      params: { actorName, postTitle },
      zh: { title: "新的交織請求", content: "Bob 對「Desk lamp」送出交織請求" },
      en: {
        title: "New Weave Request",
        content: 'Bob sent a weave request for "Desk lamp"',
      },
    },
    {
      type: "WEAVE_APPROVED",
      params: { actorName, postTitle },
      zh: {
        title: "交織請求已同意",
        content: "Bob 同意了你對「Desk lamp」的交織請求",
      },
      en: {
        title: "Weave Request Approved",
        content: 'Bob approved your weave request for "Desk lamp"',
      },
    },
    {
      type: "WEAVE_DECLINED",
      params: { actorName, postTitle },
      zh: {
        title: "交織請求已婉拒",
        content: "Bob 婉拒了你對「Desk lamp」的交織請求",
      },
      en: {
        title: "Weave Request Declined",
        content: 'Bob declined your weave request for "Desk lamp"',
      },
    },
    {
      type: "WEAVE_WITHDRAWN",
      params: { actorName, postTitle },
      zh: {
        title: "交織請求已撤回",
        content: "Bob 撤回了對「Desk lamp」的交織請求",
      },
      en: {
        title: "Weave Request Withdrawn",
        content: 'Bob withdrew their weave request for "Desk lamp"',
      },
    },
    {
      type: "WEAVE_CANCELLED",
      params: { actorName, postTitle },
      zh: { title: "交織已取消", content: "Bob 取消了「Desk lamp」的交織" },
      en: {
        title: "Weave Cancelled",
        content: 'Bob cancelled the weave for "Desk lamp"',
      },
    },
    {
      type: "WEAVE_CONFIRMED",
      params: { actorName, postTitle },
      zh: {
        title: "對方已確認交織",
        content: "Bob 已確認「Desk lamp」的交織，等待你確認。",
      },
      en: {
        title: "Weave Confirmed",
        content:
          'Bob confirmed the weave for "Desk lamp". Waiting for your confirmation.',
      },
    },
    {
      type: "WEAVE_COMPLETED",
      params: { postTitle },
      zh: { title: "交織成功", content: "「Desk lamp」的交織成功了！" },
      en: {
        title: "Weave Completed",
        content: 'Weave for "Desk lamp" is successfully completed!',
      },
    },
  ];

  for (const { type, params, zh, en: english } of cases) {
    it(`renders ${type} in both languages`, () => {
      assert.deepEqual(notificationText(tZh, { type, params, ...legacy }), zh);
      assert.deepEqual(
        notificationText(tEn, { type, params, ...legacy }),
        english,
      );
    });
  }

  it("falls back to the stored text when a required param is missing", () => {
    assert.deepEqual(
      notificationText(tZh, {
        type: "WEAVE_APPROVED",
        params: { actorName },
        ...legacy,
      }),
      legacy,
    );
    assert.deepEqual(
      notificationText(tZh, {
        type: "LIKE",
        params: { actorName: "", postTitle },
        ...legacy,
      }),
      legacy,
    );
  });

  it("falls back to the stored text for a type it doesn't know", () => {
    assert.deepEqual(
      notificationText(tEn, {
        type: "SOMETHING_NEW",
        params: { actorName },
        ...legacy,
      }),
      legacy,
    );
  });

  it("inserts user-written titles verbatim, even with ICU syntax in them", () => {
    assert.deepEqual(
      notificationText(tEn, {
        type: "LIKE",
        params: { actorName: "{x}", postTitle: "<b>50% off {free}</b>" },
        ...legacy,
      }),
      {
        title: "New Like",
        content: '{x} liked your post "<b>50% off {free}</b>"',
      },
    );
  });
});
