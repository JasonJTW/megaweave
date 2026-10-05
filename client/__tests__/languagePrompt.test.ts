import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  shouldOfferEnglish,
  EN_PROMPT_DISMISSED_COOKIE,
} from "../i18n/languagePrompt";

const dismissed = `${EN_PROMPT_DISMISSED_COOKIE}=1`;

describe("shouldOfferEnglish", () => {
  it("offers English on zh-TW pages when the browser's first language is English", () => {
    assert.equal(
      shouldOfferEnglish({ locale: "zh-TW", languages: ["en-US", "zh-TW"], cookie: "" }),
      true,
    );
    assert.equal(
      shouldOfferEnglish({ locale: "zh-TW", languages: ["en"], cookie: "" }),
      true,
    );
  });

  it("does not offer English when English is not the first language", () => {
    assert.equal(
      shouldOfferEnglish({ locale: "zh-TW", languages: ["zh-TW", "en-US"], cookie: "" }),
      false,
    );
    assert.equal(
      shouldOfferEnglish({ locale: "zh-TW", languages: [], cookie: "" }),
      false,
    );
  });

  it("does not match languages that merely start with 'en'", () => {
    assert.equal(
      shouldOfferEnglish({ locale: "zh-TW", languages: ["enx"], cookie: "" }),
      false,
    );
  });

  it("never offers the reverse prompt on English pages", () => {
    assert.equal(
      shouldOfferEnglish({ locale: "en", languages: ["en-US"], cookie: "" }),
      false,
    );
    assert.equal(
      shouldOfferEnglish({ locale: "en", languages: ["zh-TW"], cookie: "" }),
      false,
    );
  });

  it("stays hidden once dismissed", () => {
    assert.equal(
      shouldOfferEnglish({ locale: "zh-TW", languages: ["en-US"], cookie: dismissed }),
      false,
    );
    assert.equal(
      shouldOfferEnglish({
        locale: "zh-TW",
        languages: ["en-US"],
        cookie: `session-id=abc; ${dismissed}; other=x`,
      }),
      false,
    );
  });

  it("ignores other cookies whose name merely contains the dismissal cookie name", () => {
    assert.equal(
      shouldOfferEnglish({
        locale: "zh-TW",
        languages: ["en-US"],
        cookie: `x-${EN_PROMPT_DISMISSED_COOKIE}=1`,
      }),
      true,
    );
  });
});
