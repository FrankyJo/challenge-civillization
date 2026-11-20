#!/usr/bin/env node
// Full Phase gate. Every step must pass; the first failure stops the run and
// its exit status propagates. Integration, smoke and e2e steps need running
// infrastructure (`pnpm infra:up`) and TEST_DATABASE_URL / TEST_REDIS_URL,
// which are read from the environment or a local `.env` file.
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runSteps } from "./lib/run-steps.mjs";

const root = resolve(import.meta.dirname, "..");
const envFile = resolve(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

if (!existsSync(resolve(root, "pnpm-lock.yaml"))) {
  console.error("pnpm-lock.yaml is missing: dependencies must be pinned before gates can run.");
  process.exit(1);
}

const node = process.execPath;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const steps = [
  { name: "starter verification", command: node, args: ["scripts/verify-kit.mjs"] },
  { name: "repository meta-tests", command: node, args: ["--test", "tests/*.test.mjs"] },
  { name: "lint + format", command: pnpm, args: ["run", "lint"] },
  { name: "typecheck, unit tests, build", command: pnpm, args: ["exec", "turbo", "run", "typecheck", "test", "build"] },
  { name: "integration tests", command: pnpm, args: ["exec", "turbo", "run", "test:integration", "--concurrency=1"] },
  { name: "process smoke test", command: node, args: ["scripts/smoke.mjs"] },
  { name: "browser e2e", command: pnpm, args: ["exec", "turbo", "run", "test:e2e"] },
];

const status = runSteps(steps, { cwd: root });
if (status !== 0) {
  console.error(`\nGates FAILED (exit ${status}).`);
  process.exit(status);
}
console.log("\nAll gates passed.");
