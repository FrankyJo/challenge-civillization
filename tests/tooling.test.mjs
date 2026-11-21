import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { runSteps } from "../scripts/lib/run-steps.mjs";

const root = resolve(import.meta.dirname, "..");
const eslint = new ESLint({ cwd: root });

async function ruleIds(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath: resolve(root, filePath) });
  return result.messages.map((message) => message.ruleId);
}

test("domain lint guard rejects ambient randomness, wall clock and I/O", async () => {
  const domainFile = "packages/domain/src/probe.ts";
  assert.ok((await ruleIds("export const r = Math.random();\n", domainFile)).includes("no-restricted-properties"));
  assert.ok((await ruleIds("export const t = Date.now();\n", domainFile)).includes("no-restricted-globals"));
  assert.ok((await ruleIds("export const e = process.env;\n", domainFile)).includes("no-restricted-globals"));
  assert.ok(
    (await ruleIds('import { readFileSync } from "node:fs";\nexport const f = readFileSync;\n', domainFile)).includes(
      "no-restricted-imports",
    ),
  );
  assert.ok(
    (await ruleIds('import pg from "pg";\nexport const p = pg;\n', domainFile)).includes("no-restricted-imports"),
  );
});

test("domain lint guard rejects locale APIs, approximate Math and ** on numbers", async () => {
  const domainFile = "packages/domain/src/probe.ts";
  const cases = [
    ['export const a = "b".localeCompare("a");\n', "no-restricted-properties"],
    ["export const a = (1).toLocaleString();\n", "no-restricted-properties"],
    ["export const c = new Intl.Collator();\n", "no-restricted-globals"],
    ["export const e = Math.exp(1);\n", "no-restricted-properties"],
    ["export const l = Math.log(2);\n", "no-restricted-properties"],
    ["export const p = Math.pow(2, 3);\n", "no-restricted-properties"],
    ["export const q = 2 ** 3;\n", "no-restricted-syntax"],
    ["let r = 2;\nr **= 3;\nexport { r };\n", "no-restricted-syntax"],
    ["export const d = globalThis.Date.now();\n", "no-restricted-globals"],
    ["const { random } = Math;\nexport const x = random();\n", "no-restricted-syntax"],
    ["const M = Math;\nexport const x = M.exp(1);\n", "no-restricted-syntax"],
    ['export const x = Math["pow"](2, 3);\n', "no-restricted-syntax"],
    ['export const m = () => import("node:fs");\n', "no-restricted-syntax"],
    ["export const q = queueMicrotask;\n", "no-restricted-globals"],
    ["export const w = new WeakRef({});\n", "no-restricted-globals"],
    ['import { inspect } from "util";\nexport { inspect };\n', "no-restricted-imports"],
    ['import { Worker } from "worker_threads";\nexport { Worker };\n', "no-restricted-imports"],
  ];
  for (const [code, rule] of cases) assert.ok((await ruleIds(code, domainFile)).includes(rule), code);
  assert.deepEqual(await ruleIds("export const f = Math.floor(2.5) + Math.imul(3, 4);\n", domainFile), []);
});

test("domain lint guard does not apply outside the domain package", async () => {
  assert.deepEqual(await ruleIds("export const t = Date.now();\n", "apps/api/src/probe.ts"), []);
});

test("gate runner stops at the first failure and propagates its exit status", () => {
  const ran = [];
  const log = (line) => ran.push(line);
  const status = runSteps(
    [
      { name: "ok", command: process.execPath, args: ["-e", "process.exit(0)"] },
      { name: "bad", command: process.execPath, args: ["-e", "process.exit(3)"] },
      { name: "never", command: process.execPath, args: ["-e", "process.exit(0)"] },
    ],
    { cwd: root, log },
  );
  assert.equal(status, 3);
  assert.ok(ran.some((line) => line.startsWith("✓ ok")));
  assert.ok(ran.some((line) => line.startsWith("✗ bad failed (exit 3")));
  assert.ok(!ran.some((line) => line.includes("never")));
});

test("gate runner fails when a command cannot start", () => {
  const status = runSteps([{ name: "missing", command: "definitely-not-a-command-civ", args: [] }], {
    cwd: root,
    log: () => {},
  });
  assert.equal(status, 1);
});

test("gate runner succeeds only when all steps succeed", () => {
  const steps = [{ name: "ok", command: process.execPath, args: ["-e", ""] }];
  assert.equal(runSteps(steps, { cwd: root, log: () => {} }), 0);
});
