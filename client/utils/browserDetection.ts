/**
 * User-Agent Client Hints (UA-CH) interface definitions
 */
interface NavigatorUAData {
  brands: Array<{ brand: string; version: string }>;
  mobile: boolean;
  platform: string;
}

/**
 * Detects whether the current browser engine is Chromium (Blink).
 *
 * @hashintel/refractive relies on SVG displacement filters applied via CSS
 * `backdrop-filter: url(#...)`. This feature is currently only supported by
 * Chromium-based browsers (Chrome, Edge, Opera, Samsung Internet on Android/desktop).
 *
 * WebKit (Safari on macOS and ALL browsers on iOS, including Chrome/CriOS) does NOT
 * support SVG displacement map filters in backdrop-filter and will render completely
 * transparent without fallback.
 *
 * Detection strategy:
 * 1. UA-CH (User-Agent Client Hints) via `navigator.userAgentData?.brands`
 * 2. Fallback to `navigator.userAgent` string analysis, explicitly ruling out iOS/WebKit
 */
export function isChromiumSupported(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  // 1. Primary check: User-Agent Client Hints (UA-CH)
  const nav = navigator as Navigator & { userAgentData?: NavigatorUAData };
  if (nav.userAgentData?.brands && Array.isArray(nav.userAgentData.brands)) {
    const isChromiumBrand = nav.userAgentData.brands.some((b) =>
      /Chromium|Google Chrome|Microsoft Edge/i.test(b.brand),
    );
    if (isChromiumBrand) {
      return true;
    }
  }

  // 2. Fallback check: navigator.userAgent
  const ua = navigator.userAgent || "";

  // All iOS browsers (Safari, Chrome for iOS / CriOS, Firefox for iOS / FxiOS)
  // are forced by Apple to use WebKit, where SVG backdrop-filter is unsupported.
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  if (isIOS) {
    return false;
  }

  // Check for Chromium browsers on desktop or Android
  const isChrome = /Chrome|Chromium|Edg|OPR|SamsungBrowser/i.test(ua);
  const isSafariOnly =
    /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|SamsungBrowser/i.test(ua);
  const isFirefox = /Firefox/i.test(ua);

  return isChrome && !isSafariOnly && !isFirefox;
}
