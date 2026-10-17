import { splitLocalePrefix } from "../i18n/routing";

// Shared by middleware (edge) and the sign-in page (browser), so this module
// must not import anything from next/server.

// Routes only accessible to non-authenticated visitors
export const GUEST_ONLY_ROUTES = ["/signin", "/signup"] as const;

/**
 * Normalizes a pathname by removing trailing slashes (except for root '/')
 */
export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/**
 * Checks whether a given pathname matches a base route (exact or prefix subpath)
 */
export function matchesRoute(pathname: string, route: string): boolean {
  const normalized = normalizePathname(pathname);
  if (route === "/") {
    return normalized === "/";
  }
  return normalized === route || normalized.startsWith(`${route}/`);
}

/**
 * Checks if a pathname matches any route in the provided collection
 */
export function matchesAnyRoute(
  pathname: string,
  routes: readonly string[]
): boolean {
  return routes.some((route) => matchesRoute(pathname, route));
}

/**
 * Validates and sanitizes a returnTo parameter to prevent open redirect vulnerabilities
 * and infinite redirection loops.
 */
export function getSafeReturnTo(
  returnTo: string | null,
  fallback = "/"
): string {
  if (!returnTo) return fallback;

  // Prevent protocol-relative URLs (//evil.com) and backslash bypasses (/\evil.com)
  if (
    !returnTo.startsWith("/") ||
    returnTo.startsWith("//") ||
    returnTo.startsWith("/\\")
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(returnTo, "http://localhost");
    // Do not redirect back to guest-only authentication pages
    const normalizedDest = normalizePathname(
      splitLocalePrefix(parsed.pathname).pathname
    );
    if (matchesAnyRoute(normalizedDest, GUEST_ONLY_ROUTES)) {
      return fallback;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

/**
 * Builds the sign-in URL that brings the user back to the current page.
 * Passes a same-origin path (never the full href) so getSafeReturnTo accepts it.
 */
export function signinUrlForCurrentPage(): string {
  const { pathname, search } = window.location;
  return `/signin?returnTo=${encodeURIComponent(pathname + search)}`;
}
