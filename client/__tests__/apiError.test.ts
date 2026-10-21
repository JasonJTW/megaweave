import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTranslator } from "next-intl";
import zhTW from "../messages/zh-TW.json";
import en from "../messages/en.json";
import { ApiError, translateApiError } from "../lib/apiError";

const tZh = createTranslator({
  locale: "zh-TW",
  messages: zhTW,
  namespace: "Errors",
});
const tEn = createTranslator({
  locale: "en",
  messages: en,
  namespace: "Errors",
});

describe("translateApiError", () => {
  it("shows the translation for a known code, not the server's errorMessage", () => {
    const body = { code: "POST_NOT_FOUND", errorMessage: "Post not found" };

    assert.equal(
      translateApiError(tZh, body),
      "找不到這則貼文，可能已被刪除。",
    );
    assert.equal(
      translateApiError(tEn, body),
      "This post couldn't be found. It may have been deleted.",
    );
  });

  it("fills the translation with the error's params", () => {
    const body = {
      code: "USE_SOCIAL_SIGNIN",
      errorMessage: "This email is registered with Google.",
      params: { providers: "Google" },
    };

    assert.equal(
      translateApiError(tZh, body),
      "這個 Email 是用 Google 註冊的，請改用 Google 登入。",
    );
  });

  it("falls back to the generic message for an unknown code", () => {
    assert.equal(
      translateApiError(tEn, { code: "SOMETHING_NEW", errorMessage: "x" }),
      "Something went wrong. Please try again.",
    );
  });

  it("falls back to the generic message when the body has no code", () => {
    for (const body of [{ errorMessage: "legacy" }, null, "oops", undefined]) {
      assert.equal(translateApiError(tZh, body), "發生錯誤，請稍後再試。");
    }
  });

  it("uses the caller's fallback when the error carries no code", () => {
    for (const error of [
      new Error("Failed to fetch"),
      null,
      { success: false },
    ]) {
      assert.equal(
        translateApiError(tZh, error, "留言送出失敗"),
        "留言送出失敗",
      );
    }
  });

  it("still translates an ApiError's code when a fallback is given", () => {
    const error = new ApiError(
      { code: "COMMENT_EMPTY", errorMessage: "x" },
      400,
    );

    assert.equal(
      translateApiError(tEn, error, "fallback"),
      "Comments can't be empty.",
    );
  });

  it("prefers the generic message over the fallback for an unknown code", () => {
    assert.equal(
      translateApiError(tEn, { code: "SOMETHING_NEW" }, "fallback"),
      "Something went wrong. Please try again.",
    );
  });
});
