import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing, splitLocalePrefix, localizePath } from "./i18n/routing";

export { splitLocalePrefix };

export type UserRole = "user" | "admin" | "contributor";

export const VALID_ROLES: ReadonlySet<string> = new Set<UserRole>([
  "user",
  "admin",
  "contributor",
]);

/**
 * Route Taxonomy Definitions
 */
// Routes only accessible to non-authenticated visitors
export const GUEST_ONLY_ROUTES = ["/signin", "/signup"] as const;

// Routes reserved strictly for admin users
export const ADMIN_ROUTES = ["/admin"] as const;

// Protected routes requiring authentication (valid session-id and allowed role)
export const PROTECTED_ROUTES = [
  "/messages",
  "/user",
  "/history",
  "/posts",
  "/delivery",
  "/notifications",
] as const;

// Public routes freely browseable by anyone
export const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/install",
  "/earthday",
  "/item",
  "/profile",
  "/Card",
  "/promote",
  "/tinder",
  "/members",
] as const;

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

const handleI18nRouting = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  // 1. Locale routing: rewrites unprefixed paths to the default locale and
  // redirects the redundant /zh-TW prefix. Its redirects take precedence.
  const i18nResponse = handleI18nRouting(request);
  if (i18nResponse.headers.has("location")) {
    return i18nResponse;
  }

  // 2. Only guard navigation requests (GET / HEAD), pass background methods through
  if (request.method !== "GET" && request.method !== "HEAD") {
    return i18nResponse;
  }

  const { pathname, search } = request.nextUrl;
  const { locale, pathname: localePath } = splitLocalePrefix(pathname);
  const normalizedPath = normalizePathname(localePath);
  const home = localizePath(locale, "/");
  const signInUrl = () => {
    const returnTo = encodeURIComponent(`${pathname}${search}`);
    return new URL(
      `${localizePath(locale, "/signin")}?returnTo=${returnTo}`,
      request.url
    );
  };

  // 3. Read and validate session cookies
  const sessionId = request.cookies.get("session-id")?.value;
  const userRole = request.cookies.get("user-role")?.value;

  const isAuthenticated =
    Boolean(sessionId) &&
    typeof userRole === "string" &&
    VALID_ROLES.has(userRole);

  const isAdmin = isAuthenticated && userRole === "admin";

  // 4. Guest-only routes (/signin, /signup)
  // Authenticated users are redirected back to their returnTo destination or home
  if (matchesAnyRoute(normalizedPath, GUEST_ONLY_ROUTES)) {
    if (isAuthenticated) {
      const rawReturnTo = request.nextUrl.searchParams.get("returnTo");
      const destination = getSafeReturnTo(rawReturnTo, home);
      return NextResponse.redirect(new URL(destination, request.url), {
        status: 307,
      });
    }
    return i18nResponse;
  }

  // 5. Admin routes
  if (matchesAnyRoute(normalizedPath, ADMIN_ROUTES)) {
    if (!isAuthenticated) {
      return NextResponse.redirect(signInUrl(), { status: 307 });
    }
    if (!isAdmin) {
      return NextResponse.redirect(new URL(home, request.url), { status: 307 });
    }
    return i18nResponse;
  }

  // 6. Protected routes (/messages, /user, /history, /posts, /delivery, /notifications)
  if (matchesAnyRoute(normalizedPath, PROTECTED_ROUTES)) {
    if (!isAuthenticated) {
      return NextResponse.redirect(signInUrl(), { status: 307 });
    }
    return i18nResponse;
  }

  // 7. Public routes and other paths default to allowed
  return i18nResponse;
}

// Configure paths intercepted by Next.js middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - monitoring (Sentry tunnel route)
     * - _next/static, _next/image (static files / images)
     * - static assets (.svg, .png, .jpg, .json, etc.)
     */
    "/((?!api|monitoring|_next/static|_next/image|favicon.ico|manifest.json|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|json|txt)$).*)",
  ],
};
