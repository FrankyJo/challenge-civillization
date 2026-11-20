import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { TEST_SUPPORT, TEST_SUPPORT_EXCLUDED, WORKSPACE_POLICY } from "../scripts/architecture-policy.mjs";
import { checkArchitecture, discoverWorkspaces, moduleSpecifiers } from "../scripts/lib/architecture.mjs";

const root = resolve(import.meta.dirname, "..");
const policy = { policy: WORKSPACE_POLICY, testSupport: TEST_SUPPORT, testSupportExcluded: TEST_SUPPORT_EXCLUDED };

/** Build a throwaway repository: { "path/file": contents | object (JSON) }. */
function fixtureRepo(files) {
  const dir = mkdtempSync(join(tmpdir(), "civ-arch-"));
  const all = {
    "package.json": { name: "root", devDependencies: { vitest: "x" } },
    "packages/contracts/package.json": { name: "@civ/contracts", dependencies: { zod: "x" } },
    "packages/contracts/src/index.ts": 'import { z } from "zod";\nexport const s = z.string();\n',
    ...files,
  };
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), typeof content === "string" ? content : JSON.stringify(content));
  }
  return dir;
}

function violationsIn(files) {
  const dir = fixtureRepo(files);
  try {
    return checkArchitecture(dir, policy).map(({ rule, file, specifier }) => ({ rule, file, specifier }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the repository respects its architecture policy", () => {
  assert.deepEqual(checkArchitecture(root, policy), []);
});

test("every workspace has a policy entry and every policy entry a workspace", () => {
  const names = discoverWorkspaces(root).map((workspace) => workspace.name);
  assert.deepEqual([...names].sort(), Object.keys(WORKSPACE_POLICY).sort());
});

test("the domain may not import infrastructure, UI, or Node I/O", () => {
  const violations = violationsIn({
    "packages/db/package.json": { name: "@civ/db" },
    "packages/domain/package.json": { name: "@civ/domain", dependencies: { "@civ/db": "workspace:*", pg: "x" } },
    "packages/domain/src/index.ts": [
      'import { pool } from "@civ/db";',
      'import pg from "pg";',
      'import { readFileSync } from "node:fs";',
      'import type { App } from "vue";',
      'export const lazy = () => import("fastify");',
      "export { pool, pg, readFileSync };",
    ].join("\n"),
  });
  const rules = violations.filter((v) => v.file.startsWith("packages/domain")).map((v) => `${v.rule}:${v.specifier}`);
  assert.deepEqual(rules.sort(), [
    "forbidden-external-dependency:pg",
    "forbidden-external-import:fastify",
    "forbidden-external-import:pg",
    "forbidden-external-import:vue",
    "forbidden-node-builtin:node:fs",
    "forbidden-workspace-dependency:@civ/db",
    "forbidden-workspace-import:@civ/db",
  ]);
});

test("contracts stay browser-safe and dependency-free", () => {
  const violations = violationsIn({
    "packages/contracts/src/hash.ts": 'import { createHash } from "crypto";\nexport { createHash };\n',
  });
  assert.deepEqual(violations, [
    { rule: "forbidden-node-builtin", file: "packages/contracts/src/hash.ts", specifier: "crypto" },
  ]);
});

test("the web projection may not reach server code, even via relative paths or .vue scripts", () => {
  const violations = violationsIn({
    "packages/db/package.json": { name: "@civ/db" },
    "packages/domain/package.json": { name: "@civ/domain" },
    "apps/web/package.json": { name: "@civ/web", dependencies: { vue: "x", "@civ/contracts": "workspace:*" } },
    "apps/web/src/App.vue":
      '<template><div /></template>\n<script setup lang="ts">\nimport { tick } from "@civ/domain";\n</script>\n',
    "apps/web/src/sneaky.ts": 'export * from "../../../packages/db/src/index.js";\n',
  });
  assert.deepEqual(violations.map((v) => `${v.rule}:${v.file}`).sort(), [
    "forbidden-workspace-import:apps/web/src/App.vue",
    "relative-escape:apps/web/src/sneaky.ts",
  ]);
});

test("apps may not import each other and the API may not run domain transitions", () => {
  const violations = violationsIn({
    "packages/domain/package.json": { name: "@civ/domain" },
    "apps/worker/package.json": { name: "@civ/worker" },
    "apps/api/package.json": { name: "@civ/api", dependencies: { "@civ/contracts": "workspace:*" } },
    "apps/api/src/a.ts": 'import "@civ/worker";\nimport { apply } from "@civ/domain/transitions";\nexport { apply };\n',
  });
  assert.deepEqual(violations.map((v) => `${v.rule}:${v.specifier}`).sort(), [
    "forbidden-workspace-import:@civ/domain/transitions",
    "forbidden-workspace-import:@civ/worker",
  ]);
});

test("imports must be declared; test support is for tests only", () => {
  const violations = violationsIn({
    "packages/testing/package.json": { name: "@civ/testing" },
    "packages/domain/package.json": { name: "@civ/domain", devDependencies: { "@civ/testing": "workspace:*" } },
    "packages/domain/src/a.ts": 'import { z } from "zod";\nexport const s = z.string();\n',
    "packages/domain/src/b.ts":
      'import { createContractBuilders } from "@civ/testing";\nexport { createContractBuilders };\n',
    "packages/domain/src/a.test.ts":
      'import { createContractBuilders } from "@civ/testing";\nimport { it } from "vitest";\nimport fc from "fast-check";\n',
  });
  assert.deepEqual(violations.map((v) => `${v.rule}:${v.file}:${v.specifier}`).sort(), [
    "forbidden-workspace-import:packages/domain/src/b.ts:@civ/testing",
    "undeclared-dependency:packages/domain/src/a.test.ts:fast-check",
    "undeclared-dependency:packages/domain/src/a.ts:zod",
  ]);
});

test("contracts tests may not depend on test support (it depends on contracts)", () => {
  const violations = violationsIn({
    "packages/testing/package.json": { name: "@civ/testing" },
    "packages/contracts/src/x.test.ts": 'import "@civ/testing";\n',
  });
  assert.deepEqual(
    violations.map((v) => v.rule),
    ["forbidden-workspace-import"],
  );
});

test("a workspace missing from the policy fails", () => {
  const violations = violationsIn({ "apps/admin/package.json": { name: "@civ/admin" } });
  assert.deepEqual(
    violations.map((v) => v.rule),
    ["unknown-workspace"],
  );
});

test("specifier extraction covers every import form", () => {
  const code = [
    'import a from "a";',
    'import type { B } from "b";',
    'import "c";',
    'export * from "d";',
    'export { e } from "e";',
    'const f = await import("f");',
    'const g = require("g");',
    'import h = require("h");',
    'type I = import("i").I;',
    "const j = await import(`j`);",
  ].join("\n");
  assert.deepEqual(moduleSpecifiers("x.ts", code).sort(), ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]);
});

test("module loading that cannot be checked statically is rejected in production code", () => {
  const violations = violationsIn({
    "packages/domain/package.json": { name: "@civ/domain" },
    "packages/domain/src/a.ts": [
      "const name = 'pg';",
      "export const a = () => import(name);",
      "export const b = () => import('p' + 'g');",
      'import { createRequire } from "node:module";',
      "export const c = createRequire(import.meta.url);",
      'export const d = import.meta.glob("../../db/**");',
      'export const e = new Worker(new URL("./w.js", import.meta.url));',
    ].join("\n"),
    "packages/domain/src/a.test.ts": "export const ok = (n: string) => import(n);\n",
    "apps/web/package.json": { name: "@civ/web" },
    "apps/web/src/App.vue": '<script src="../../../packages/db/src/index.ts"></script>\n',
    "packages/telemetry/package.json": { name: "@civ/telemetry" },
    "packages/telemetry/src/a.ts": [
      'export const dir = new URL("../migrations/", import.meta.url);',
      "export const load = (n: string) => import(n);",
    ].join("\n"),
  });
  assert.deepEqual(
    violations
      .filter((v) => v.rule === "unanalyzable-import")
      .map((v) => `${v.file}:${v.specifier}`)
      .sort(),
    [
      "apps/web/src/App.vue:<script src>",
      "packages/domain/src/a.ts:createRequire()",
      "packages/domain/src/a.ts:import(<expression>)",
      "packages/domain/src/a.ts:import(<expression>)",
      "packages/domain/src/a.ts:import.meta.glob()",
      "packages/domain/src/a.ts:new URL(…, import.meta.url)",
      "packages/telemetry/src/a.ts:import(<expression>)",
    ],
  );
});

test("optional dependencies are subject to the same policy", () => {
  const violations = violationsIn({
    "packages/domain/package.json": { name: "@civ/domain", optionalDependencies: { pg: "x" } },
  });
  assert.deepEqual(
    violations.map((v) => `${v.rule}:${v.specifier}`),
    ["forbidden-external-dependency:pg"],
  );
});
