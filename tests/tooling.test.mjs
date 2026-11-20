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
