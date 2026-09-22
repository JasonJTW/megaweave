import { describe, it, afterEach } from "node:test";
import assert from "node:assert";
import { isChromiumSupported } from "../utils/browserDetection";

describe("browserDetection: isChromiumSupported", () => {
  const originalWindow = global.window;
  const originalNavigator = global.navigator;

  afterEach(() => {
    Object.defineProperty(global, "window", {
      value: originalWindow,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it("returns false in SSR environment (window/navigator undefined)", () => {
    Object.defineProperty(global, "window", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    assert.strictEqual(isChromiumSupported(), false);
  });

  it("returns true when UA-CH brands include Chromium", () => {
    Object.defineProperty(global, "window", {
      value: {},
      configurable: true,
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: {
        userAgentData: {
          brands: [
            { brand: "Not A(Brand", version: "99" },
            { brand: "Chromium", version: "130" },
            { brand: "Google Chrome", version: "130" },
          ],
          mobile: false,
          platform: "macOS",
        },
        userAgent: "Mozilla/5.0 Chrome/130.0.0.0",
      },
      configurable: true,
      writable: true,
    });
    assert.strictEqual(isChromiumSupported(), true);
  });

  it("returns true when UA-CH brands include Microsoft Edge", () => {
    Object.defineProperty(global, "window", {
      value: {},
      configurable: true,
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: {
        userAgentData: {
          brands: [
            { brand: "Chromium", version: "130" },
            { brand: "Microsoft Edge", version: "130" },
          ],
          mobile: false,
          platform: "Windows",
        },
        userAgent: "Mozilla/5.0 Edg/130.0.0.0",
      },
      configurable: true,
      writable: true,
    });
    assert.strictEqual(isChromiumSupported(), true);
  });

  it("returns false for Safari on macOS (no UA-CH, Safari UA)", () => {
    Object.defineProperty(global, "window", {
      value: {},
      configurable: true,
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: {
        userAgentData: undefined,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 0,
      },
      configurable: true,
      writable: true,
    });
    assert.strictEqual(isChromiumSupported(), false);
  });

  it("returns false for iOS Safari on iPhone", () => {
    Object.defineProperty(global, "window", {
      value: {},
      configurable: true,
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: {
        userAgentData: undefined,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
      },
      configurable: true,
      writable: true,
    });
    assert.strictEqual(isChromiumSupported(), false);
  });

  it("returns false for Chrome on iOS (CriOS - WebKit engine)", () => {
    Object.defineProperty(global, "window", {
      value: {},
      configurable: true,
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: {
        userAgentData: undefined,
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1",
        platform: "iPhone",
        maxTouchPoints: 5,
      },
      configurable: true,
      writable: true,
    });
    assert.strictEqual(isChromiumSupported(), false);
  });

  it("returns false for iPadOS Safari with touch points", () => {
    Object.defineProperty(global, "window", {
      value: {},
      configurable: true,
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: {
        userAgentData: undefined,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
        platform: "MacIntel",
        maxTouchPoints: 5,
      },
      configurable: true,
      writable: true,
    });
    assert.strictEqual(isChromiumSupported(), false);
  });

  it("returns false for Firefox desktop", () => {
    Object.defineProperty(global, "window", {
      value: {},
      configurable: true,
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: {
        userAgentData: undefined,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0",
        platform: "MacIntel",
        maxTouchPoints: 0,
      },
      configurable: true,
      writable: true,
    });
    assert.strictEqual(isChromiumSupported(), false);
  });

  it("returns true for Android Chrome via userAgent fallback if UA-CH is absent", () => {
    Object.defineProperty(global, "window", {
      value: {},
      configurable: true,
      writable: true,
    });
    Object.defineProperty(global, "navigator", {
      value: {
        userAgentData: undefined,
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
      },
      configurable: true,
      writable: true,
    });
    assert.strictEqual(isChromiumSupported(), true);
  });
});
