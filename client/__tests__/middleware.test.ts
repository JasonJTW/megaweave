import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import {
  middleware,
  matchesRoute,
  matchesAnyRoute,
  getSafeReturnTo,
  normalizePathname,
  VALID_ROLES,
  PROTECTED_ROUTES,
  GUEST_ONLY_ROUTES,
  ADMIN_ROUTES,
  PUBLIC_ROUTES,
} from "../middleware";

function createMockRequest(
  url: string,
  options: {
    method?: string;
    cookies?: Record<string, string>;
  } = {}
): NextRequest {
  const headers = new Headers();
  if (options.cookies) {
    const cookieHeader = Object.entries(options.cookies)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("; ");
    headers.set("cookie", cookieHeader);
  }

  return new NextRequest(new URL(url, "https://megaweave.test"), {
    method: options.method || "GET",
    headers,
  });
}

describe("Middleware Route Guard & Route Taxonomy", () => {
  describe("Taxonomy Constants and Role Validation", () => {
    it("defines valid user roles including user, admin, and contributor", () => {
      assert.ok(VALID_ROLES.has("user"));
      assert.ok(VALID_ROLES.has("admin"));
      assert.ok(VALID_ROLES.has("contributor"));
      assert.equal(VALID_ROLES.has("hacker"), false);
    });

    it("defines admin routes correctly", () => {
      assert.ok(ADMIN_ROUTES.includes("/admin"));
    });
  });

  describe("Path Normalization and Route Matching", () => {
    it("normalizes pathnames by removing trailing slashes except for root", () => {
      assert.equal(normalizePathname("/"), "/");
      assert.equal(normalizePathname("/messages/"), "/messages");
      assert.equal(normalizePathname("/user/profile/"), "/user/profile");
      assert.equal(normalizePathname(""), "/");
    });

    it("matches root '/' strictly", () => {
      assert.equal(matchesRoute("/", "/"), true);
      assert.equal(matchesRoute("/about", "/"), false);
      assert.equal(matchesRoute("/messages", "/"), false);
    });

    it("matches exact routes and subpaths without prefix bleeding", () => {
      assert.equal(matchesRoute("/messages", "/messages"), true);
      assert.equal(matchesRoute("/messages/123", "/messages"), true);
      assert.equal(matchesRoute("/messages/", "/messages"), true);
      assert.equal(matchesRoute("/messages-extra", "/messages"), false);
      assert.equal(matchesRoute("/message", "/messages"), false);
    });

    it("matches any route in list", () => {
      assert.equal(matchesAnyRoute("/messages", PROTECTED_ROUTES), true);
      assert.equal(matchesAnyRoute("/user/settings", PROTECTED_ROUTES), true);
      assert.equal(matchesAnyRoute("/delivery/ord-123", PROTECTED_ROUTES), true);
      assert.equal(matchesAnyRoute("/signin", GUEST_ONLY_ROUTES), true);
      assert.equal(matchesAnyRoute("/signup", GUEST_ONLY_ROUTES), true);
      assert.equal(matchesAnyRoute("/about", PUBLIC_ROUTES), true);
    });
  });

  describe("getSafeReturnTo", () => {
    it("returns '/' for null, empty, or undefined returnTo", () => {
      assert.equal(getSafeReturnTo(null), "/");
      assert.equal(getSafeReturnTo(""), "/");
    });

    it("blocks open redirect attempts", () => {
      assert.equal(getSafeReturnTo("https://evil.com"), "/");
      assert.equal(getSafeReturnTo("http://evil.com"), "/");
      assert.equal(getSafeReturnTo("//evil.com"), "/");
      assert.equal(getSafeReturnTo("/\\evil.com"), "/");
      assert.equal(getSafeReturnTo("javascript:alert(1)"), "/");
    });

    it("prevents redirect loops back to auth pages", () => {
      assert.equal(getSafeReturnTo("/signin"), "/");
      assert.equal(getSafeReturnTo("/signin/"), "/");
      assert.equal(getSafeReturnTo("/signup"), "/");
    });

    it("allows safe relative paths with query parameters", () => {
      assert.equal(getSafeReturnTo("/messages?unread=true"), "/messages?unread=true");
      assert.equal(getSafeReturnTo("/item/uuid-456"), "/item/uuid-456");
      assert.equal(getSafeReturnTo("/user"), "/user");
    });
  });

  describe("Unauthenticated Visitors", () => {
    it("allows access to public routes freely", async () => {
      const publicPaths = [
        "/",
        "/about",
        "/install",
        "/earthday",
        "/item/some-id",
        "/profile/user-uuid",
        "/Card",
        "/promote",
        "/tinder",
        "/members/4",
      ];

      for (const path of publicPaths) {
        const req = createMockRequest(path);
        const res = await middleware(req);
        assert.equal(res.status, 200, `Expected 200 for public route ${path}`);
        assert.equal(res.headers.get("location"), null);
      }
    });

    it("allows unauthenticated visitors to visit guest-only routes (/signin, /signup)", async () => {
      for (const path of ["/signin", "/signup"]) {
        const req = createMockRequest(path);
        const res = await middleware(req);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("location"), null);
      }
    });

    it("307-redirects unauthenticated visitors accessing protected routes with returnTo", async () => {
      const protectedPaths = [
        "/messages",
        "/messages/thread-1",
        "/user",
        "/history",
        "/posts",
        "/delivery/order-1",
        "/notifications",
      ];

      for (const path of protectedPaths) {
        const req = createMockRequest(path);
        const res = await middleware(req);
        assert.equal(res.status, 307);
        const location = res.headers.get("location");
        assert.ok(location, `Expected location header for ${path}`);
        const expectedReturnTo = encodeURIComponent(path);
        assert.ok(
          location.includes(`/signin?returnTo=${expectedReturnTo}`),
          `Expected redirect to include returnTo=${expectedReturnTo}, got: ${location}`
        );
      }
    });

    it("preserves query parameters in returnTo when redirecting", async () => {
      const req = createMockRequest("/messages?page=2&filter=unread");
      const res = await middleware(req);
      assert.equal(res.status, 307);
      const location = res.headers.get("location");
      const expectedReturnTo = encodeURIComponent("/messages?page=2&filter=unread");
      assert.ok(location?.includes(`/signin?returnTo=${expectedReturnTo}`));
    });

    it("redirects unauthenticated visitors trying to access /admin", async () => {
      const req = createMockRequest("/admin/dashboard");
      const res = await middleware(req);
      assert.equal(res.status, 307);
      const location = res.headers.get("location");
      const expectedReturnTo = encodeURIComponent("/admin/dashboard");
      assert.ok(location?.includes(`/signin?returnTo=${expectedReturnTo}`));
    });
  });

  describe("Authenticated Users", () => {
    it("allows 'user' role to access protected routes (fixes legacy /earthday bug)", async () => {
      const req = createMockRequest("/messages", {
        cookies: {
          "session-id": "valid-session",
          "user-role": "user",
        },
      });
      const res = await middleware(req);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("location"), null);
    });

    it("allows 'admin' and 'contributor' roles to access protected routes", async () => {
      for (const role of ["admin", "contributor"]) {
        const req = createMockRequest("/delivery/order-99", {
          cookies: {
            "session-id": "valid-session",
            "user-role": role,
          },
        });
        const res = await middleware(req);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get("location"), null);
      }
    });

    it("redirects authenticated user on /signin to returnTo destination", async () => {
      const req = createMockRequest("/signin?returnTo=%2Fmessages%3Fthread%3D1", {
        cookies: {
          "session-id": "valid-session",
          "user-role": "user",
        },
      });
      const res = await middleware(req);
      assert.equal(res.status, 307);
      const location = res.headers.get("location");
      assert.ok(location?.endsWith("/messages?thread=1"));
    });

    it("redirects authenticated user on /signup without returnTo to '/'", async () => {
      const req = createMockRequest("/signup", {
        cookies: {
          "session-id": "valid-session",
          "user-role": "user",
        },
      });
      const res = await middleware(req);
      assert.equal(res.status, 307);
      const location = res.headers.get("location");
      assert.equal(new URL(location!).pathname, "/");
    });

    it("allows 'admin' role to access /admin routes", async () => {
      const req = createMockRequest("/admin", {
        cookies: {
          "session-id": "valid-session",
          "user-role": "admin",
        },
      });
      const res = await middleware(req);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("location"), null);
    });

    it("redirects non-admin authenticated users away from /admin to '/'", async () => {
      const req = createMockRequest("/admin", {
        cookies: {
          "session-id": "valid-session",
          "user-role": "user",
        },
      });
      const res = await middleware(req);
      assert.equal(res.status, 307);
      const location = res.headers.get("location");
      assert.equal(new URL(location!).pathname, "/");
    });
  });

  describe("Security: Cookie Role Tampering", () => {
    it("blocks request with tampered/invalid role even if session-id exists", async () => {
      const req = createMockRequest("/user", {
        cookies: {
          "session-id": "valid-session",
          "user-role": "superadmin_hacked",
        },
      });
      const res = await middleware(req);
      assert.equal(res.status, 307);
      const location = res.headers.get("location");
      assert.ok(location?.includes("/signin?returnTo=%2Fuser"));
    });

    it("blocks request with role but missing session-id", async () => {
      const req = createMockRequest("/user", {
        cookies: {
          "user-role": "admin",
        },
      });
      const res = await middleware(req);
      assert.equal(res.status, 307);
      const location = res.headers.get("location");
      assert.ok(location?.includes("/signin?returnTo=%2Fuser"));
    });
  });

  describe("Non-GET / Background Requests", () => {
    it("passes non-GET/HEAD methods through without redirection", async () => {
      const req = createMockRequest("/messages", { method: "POST" });
      const res = await middleware(req);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("location"), null);
    });
  });
});
