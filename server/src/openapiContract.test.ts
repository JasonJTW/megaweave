/**
 * `server/openapi.yaml` is the API contract (AGENTS.md "API contract").
 *
 * 1. The spec is a valid OpenAPI 3.1 document.
 * 2. Every (method, path) the Express app registers is in the spec, and every
 *    spec operation is a registered route. Routes are read from the router
 *    stack of the app `createApp()` builds; no handler runs and nothing listens.
 */
import path from "path";
import SwaggerParser from "@apidevtools/swagger-parser";
import type { Express } from "express";

const SPEC_PATH = path.join(__dirname, "..", "openapi.yaml");
const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

//* Express 4 內部結構：只讀 route 與 router 型別的 layer
interface Layer {
  name: string;
  regexp: RegExp & { fast_slash?: boolean };
  keys: { name: string }[];
  route?: { path: string | string[]; methods: Record<string, boolean> };
  handle: { stack?: Layer[]; _router?: { stack: Layer[] } };
}

//* 把 router.use("/:postId/like") 編出來的 regexp 還原成 OpenAPI 路徑
function mountPathFromLayer(layer: Layer): string {
  if (layer.regexp.fast_slash) return "";
  let keyIndex = 0;
  const source = layer.regexp.source
    .replace(/^\^/, "")
    .replace(/\\\/\?\(\?=\\\/\|\$\)$/, "")
    //* 參數段：path-to-regexp 0.1.x 編成 (?:\/([^/]+?))
    .replace(/\(\?:(\\\/)?\(\[\^\\?\/\]\+\?\)\)/g, (_m, slash?: string) => `${slash ? "/" : ""}{${layer.keys[keyIndex++].name}}`)
    .replace(/\\\//g, "/")
    .replace(/\\-/g, "-")
    .replace(/\\\./g, ".");
  if (!/^[\w/{}.-]*$/.test(source)) {
    throw new Error(`Cannot decode mount path from ${layer.regexp}`);
  }
  return source;
}

function toOpenApiPath(expressPath: string): string {
  return expressPath.replace(/:(\w+)/g, "{$1}");
}

function collectRoutes(stack: Layer[], prefix: string, out: Set<string>): void {
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      for (const routePath of paths) {
        const full = toOpenApiPath(prefix + routePath).replace(/(.)\/$/, "$1");
        for (const method of Object.keys(layer.route.methods)) {
          if (method === "_all") throw new Error(`router.all() at ${full}: list its methods instead`);
          out.add(`${method.toUpperCase()} ${full}`);
        }
      }
    } else if (layer.name === "router" && layer.handle.stack) {
      collectRoutes(layer.handle.stack, prefix + mountPathFromLayer(layer), out);
    } else if (layer.handle._router) {
      //* `import Router from "express"` 的模組其實建立的是子 app，不是 Router
      collectRoutes(layer.handle._router.stack, prefix + mountPathFromLayer(layer), out);
    }
  }
}

function specOperations(spec: { paths?: Record<string, Record<string, unknown>> }): Set<string> {
  const out = new Set<string>();
  for (const [specPath, item] of Object.entries(spec.paths ?? {})) {
    for (const method of Object.keys(item)) {
      if (HTTP_METHODS.includes(method)) out.add(`${method.toUpperCase()} ${specPath}`);
    }
  }
  return out;
}

describe("openapi.yaml", () => {
  let app: Express;

  beforeAll(async () => {
    //* 各路由模組載入時的 fail-fast 檢查；benchmark 路由只在帶標記時掛載，契約要涵蓋它
    process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "test-client-id";
    process.env.BENCHMARK_TARGET_MARKER = "megaweave-isolated";
    const { createApp } = await import("./app");
    app = createApp({ corsOrigins: [], enableHttps: false });
  });

  afterAll(() => {
    delete process.env.BENCHMARK_TARGET_MARKER;
  });

  it("is a valid OpenAPI 3.1 document", async () => {
    const spec = await SwaggerParser.validate(SPEC_PATH);
    expect((spec as { openapi?: string }).openapi).toMatch(/^3\.1\./);
  });

  it("lists exactly the routes the server registers", async () => {
    const registered = new Set<string>();
    const router = (app as unknown as { _router: { stack: Layer[] } })._router;
    collectRoutes(router.stack, "", registered);

    const spec = await SwaggerParser.parse(SPEC_PATH);
    const documented = specOperations(spec as { paths?: Record<string, Record<string, unknown>> });

    const missingFromSpec = [...registered].filter((op) => !documented.has(op)).sort();
    const notRegistered = [...documented].filter((op) => !registered.has(op)).sort();
    const list = (ops: string[]) => (ops.length ? ops.map((op) => `  ${op}`).join("\n") : "  (none)");
    const report =
      missingFromSpec.length || notRegistered.length
        ? `server/openapi.yaml does not match the registered routes.\n` +
          `Registered but missing from the spec (${missingFromSpec.length}):\n${list(missingFromSpec)}\n` +
          `In the spec but not registered (${notRegistered.length}):\n${list(notRegistered)}`
        : "";
    expect(report).toBe("");
    expect(registered.size).toBeGreaterThan(0);
  });
});
