// client/.env.example must list every variable the client reads, and nothing else.
// Reads (process.env.X and process.env["X"]) are found with the TypeScript parser, so
// comments and strings never count. Tests, the Playwright config and e2e/ are excluded:
// the E2E harness has its own e2e.env.
// A template line counts as `X=` or, for a variable that is normally unset, `# X=`.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const CLIENT_ROOT = fileURLToPath(new URL("..", import.meta.url));
const TEMPLATE = path.join(CLIENT_ROOT, ".env.example");

// Set by Node, Next.js or the CI runner, never by a developer's env file.
const PLATFORM_VARS = new Set(["NODE_ENV", "NEXT_RUNTIME", "CI"]);

const SKIPPED = new Set([
  "node_modules",
  "public",
  "e2e",
  "__tests__",
  "playwright-report",
  "test-results",
  "playwright.config.ts",
]);

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIPPED.has(entry.name) || entry.name.startsWith(".")) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name) &&
      !entry.name.endsWith(".d.ts")
      ? [full]
      : [];
  });
}

function isProcessEnv(node: ts.Expression): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "env" &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process"
  );
}

function readsIn(file: string): string[] {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const names: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && isProcessEnv(node.expression)) {
      names.push(node.name.text);
    } else if (
      ts.isElementAccessExpression(node) &&
      isProcessEnv(node.expression) &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      names.push(node.argumentExpression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names.filter((name) => ENV_NAME.test(name));
}

function templateKeys(file: string): string[] {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line) => {
      const match = /^(?:#\s*)?([A-Z][A-Z0-9_]*)=/.exec(line);
      return match ? [match[1]] : [];
    });
}

describe("client/.env.example", () => {
  const read = new Set(sourceFiles(CLIENT_ROOT).flatMap(readsIn));
  const documented = templateKeys(TEMPLATE);

  it("lists every variable the client reads", () => {
    const missing = [...read]
      .filter((name) => !PLATFORM_VARS.has(name) && !documented.includes(name))
      .sort();
    assert.deepEqual(missing, []);
  });

  it("lists only variables the client reads", () => {
    const unused = documented.filter((name) => !read.has(name)).sort();
    assert.deepEqual(unused, []);
  });

  it("lists each variable once", () => {
    const duplicates = documented.filter(
      (name, i) => documented.indexOf(name) !== i,
    );
    assert.deepEqual(duplicates, []);
  });
});
