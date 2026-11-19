// server/.env.example must list every variable the server reads, and nothing else.
// Reads are found with the TypeScript parser (comments and strings never count):
//   process.env.X, env.X / env?.X (a NodeJS.ProcessEnv parameter named env),
//   process.env["X"], requireEnv("X", ...), and the keys of a z.object schema
//   whose .parse / .safeParse receives process.env or env.
// A template line counts as `X=` or, for a variable that is normally unset, `# X=`.

import fs from "fs";
import path from "path";
import ts from "typescript";

const SERVER_ROOT = path.resolve(__dirname, "..");
const SOURCE_ROOT = path.join(SERVER_ROOT, "src");
const TEMPLATE = path.join(SERVER_ROOT, ".env.example");

// Set by the platform or the test runner, never by a developer's env file.
const PLATFORM_VARS = new Set(["CI", "PATH"]);

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

function isTestFile(file: string): boolean {
  return (
    /\.test\.tsx?$/.test(file) ||
    file.split(path.sep).some((part) => part === "__tests__" || part === "__mocks__") ||
    path.basename(file) === "jest.setup.ts"
  );
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !isTestFile(full) ? [full] : [];
  });
}

function isEnvObject(node: ts.Expression): boolean {
  if (ts.isIdentifier(node)) return node.text === "env";
  return (
    ts.isPropertyAccessExpression(node) &&
    node.name.text === "env" &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "process"
  );
}

function objectKeys(node: ts.Node): string[] {
  // z.object({ ... }) possibly wrapped in .strict() / .passthrough() etc.
  let current: ts.Node = node;
  while (ts.isCallExpression(current)) {
    const callee = current.expression;
    if (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === "object" &&
      current.arguments[0] &&
      ts.isObjectLiteralExpression(current.arguments[0])
    ) {
      return current.arguments[0].properties.flatMap((prop) =>
        prop.name && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))
          ? [prop.name.text]
          : [],
      );
    }
    if (!ts.isPropertyAccessExpression(callee)) break;
    current = callee.expression;
  }
  return [];
}

function readsIn(file: string): string[] {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  const schemas = new Map<string, ts.Node>();
  const parsedSchemas: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && isEnvObject(node.expression)) {
      names.push(node.name.text);
    } else if (
      ts.isElementAccessExpression(node) &&
      isEnvObject(node.expression) &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      names.push(node.argumentExpression.text);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      schemas.set(node.name.text, node.initializer);
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const firstArg = node.arguments[0];
      if (ts.isIdentifier(callee) && callee.text === "requireEnv" && firstArg && ts.isStringLiteralLike(firstArg)) {
        names.push(firstArg.text);
      }
      if (
        ts.isPropertyAccessExpression(callee) &&
        (callee.name.text === "parse" || callee.name.text === "safeParse") &&
        ts.isIdentifier(callee.expression) &&
        firstArg &&
        isEnvObject(firstArg)
      ) {
        parsedSchemas.push(callee.expression.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  for (const schema of parsedSchemas) {
    const init = schemas.get(schema);
    if (init) names.push(...objectKeys(init));
  }
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

describe("server/.env.example", () => {
  const read = new Set(sourceFiles(SOURCE_ROOT).flatMap(readsIn));
  const documented = templateKeys(TEMPLATE);

  it("lists every variable the server reads", () => {
    const missing = [...read].filter((name) => !PLATFORM_VARS.has(name) && !documented.includes(name)).sort();
    expect(missing).toEqual([]);
  });

  it("lists only variables the server reads", () => {
    const unused = documented.filter((name) => !read.has(name)).sort();
    expect(unused).toEqual([]);
  });

  it("lists each variable once", () => {
    const duplicates = documented.filter((name, i) => documented.indexOf(name) !== i);
    expect(duplicates).toEqual([]);
  });
});
