import { routing, type Locale } from "./routing";

// Remembers that the visitor dismissed the "Switch to English?" prompt.
// Only the prompt reads it; the middleware never redirects on it (ADR 0002).
export const EN_PROMPT_DISMISSED_COOKIE = "en-prompt-dismissed";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Decides whether to invite the visitor to the English site: only on default-locale
 * (unprefixed) pages, only when the browser's first preferred language is English
 * (`navigator.languages` is what the browser sends as Accept-Language), and never
 * again once dismissed.
 */
export function shouldOfferEnglish({
  locale,
  languages,
  cookie,
}: {
  locale: Locale;
  languages: readonly string[];
  cookie: string;
}): boolean {
  if (locale !== routing.defaultLocale) return false;
  const [first] = languages;
  if (!first || first.toLowerCase().split("-")[0] !== "en") return false;
  return !cookie
    .split(";")
    .some((pair) => pair.trim().startsWith(`${EN_PROMPT_DISMISSED_COOKIE}=`));
}

export function dismissEnglishPrompt() {
  document.cookie = `${EN_PROMPT_DISMISSED_COOKIE}=1; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
}
