import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { api, apiFetcher } from "../lib/api";
import { ApiError } from "../lib/apiError";

interface Call {
  url: string;
  init: RequestInit;
}

const realFetch = globalThis.fetch;
let calls: Call[] = [];
let respond: () => Response;

beforeEach(() => {
  calls = [];
  respond = () => Response.json({ ok: true });
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("api", () => {
  it("always sends cookies and skips the HTTP cache", async () => {
    await api("/api/me");

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/api\/me$/);
    assert.equal(calls[0].init.credentials, "include");
    assert.equal(calls[0].init.cache, "no-store");
  });

  it("sends an object body as JSON", async () => {
    await api("/api/weaves", { method: "POST", body: { postId: 1 } });

    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.body, JSON.stringify({ postId: 1 }));
    assert.deepEqual(calls[0].init.headers, {
      "Content-Type": "application/json",
    });
  });

  it("sends FormData as-is so the browser sets the multipart boundary", async () => {
    const form = new FormData();
    form.append("content", "hi");

    await api("/api/messages", { method: "POST", body: form });

    assert.equal(calls[0].init.body, form);
    assert.equal(calls[0].init.headers, undefined);
  });

  it("returns the parsed JSON body on success", async () => {
    respond = () => Response.json({ weaves: [1, 2] });

    assert.deepEqual(await api("/api/weaves"), { weaves: [1, 2] });
  });

  it("returns undefined for 204 No Content", async () => {
    respond = () => new Response(null, { status: 204 });

    assert.equal(await api("/api/weaves/1", { method: "DELETE" }), undefined);
  });

  it("throws ApiError carrying the server's code and status", async () => {
    respond = () =>
      Response.json(
        { code: "POST_NOT_FOUND", errorMessage: "Post not found" },
        { status: 404 },
      );

    await assert.rejects(api("/api/posts/x"), (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 404);
      assert.deepEqual(err.body, {
        code: "POST_NOT_FOUND",
        errorMessage: "Post not found",
      });
      return true;
    });
  });

  it("throws ApiError without a code when the error body is not JSON", async () => {
    respond = () => new Response("Bad Gateway", { status: 502 });

    await assert.rejects(api("/api/feed"), (err: unknown) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.status, 502);
      assert.equal(err.body, null);
      return true;
    });
  });
});

describe("apiFetcher", () => {
  it("GETs the SWR key and throws on a non-2xx response", async () => {
    respond = () => Response.json({ code: "UNAUTHORIZED" }, { status: 401 });

    await assert.rejects(apiFetcher("/api/notifications"), ApiError);
    assert.equal(calls[0].init.method, undefined);
  });
});
