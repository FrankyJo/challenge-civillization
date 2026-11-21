#!/usr/bin/env node
// Process-level smoke test over BUILT artifacts:
//   1. create an ephemeral PostgreSQL database
//   2. run the migration CLI (up twice: apply, then no-op) and status
//   3. start api, simulation and worker on free ports
//   4. require GET /health and GET /health/ready to return 200 + a valid report
//   5. SIGTERM every process and require a clean (code 0) shutdown
// Requires `pnpm build` and running infrastructure (TEST_DATABASE_URL, TEST_REDIS_URL).
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { healthReportSchema } from "@civ/contracts";
import { createEphemeralDatabase, requireTestEnv } from "@civ/testing";

const root = resolve(import.meta.dirname, "..");
const READY_TIMEOUT_MS = 30_000;
const EXIT_TIMEOUT_MS = 10_000;

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

function run(script, args, env) {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("close", (code) => resolveRun({ code, output: output.trim() }));
  });
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForReady(name, base) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let last = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${base}/health/ready`);
      const body = await response.json();
      last = `${response.status} ${JSON.stringify(body)}`;
      if (response.status === 200) {
        const report = healthReportSchema.parse(body);
        expect(report.service === name, `${name}: wrong service in report: ${report.service}`);
        expect(report.status === "ok", `${name}: status ${report.status}`);
        return report;
      }
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${name} not ready within ${READY_TIMEOUT_MS}ms (last: ${last})`);
}

const adminUrl = requireTestEnv("TEST_DATABASE_URL");
const redisUrl = requireTestEnv("TEST_REDIS_URL");
const db = await createEphemeralDatabase(adminUrl, "civ_smoke");
const children = [];
let failed = false;

try {
  const baseEnv = {
    PATH: process.env.PATH,
    NODE_ENV: "test",
    LOG_LEVEL: "warn",
    DATABASE_URL: db.url,
    REDIS_URL: redisUrl,
  };
  const cli = "packages/db/dist/cli.js";

  const shipped = readdirSync("packages/db/migrations").filter((file) => file.endsWith(".up.sql")).length;
  const expectedApplied = `applied: ${Array.from({ length: shipped }, (_, i) => i + 1).join(", ")}`;
  const up = await run(cli, ["up"], baseEnv);
  expect(up.code === 0 && up.output === expectedApplied, `migrate up failed: ${up.code} ${up.output}`);
  const again = await run(cli, ["up"], baseEnv);
  expect(again.code === 0 && again.output === "already up to date", `second migrate up not a no-op: ${again.output}`);
  const status = await run(cli, ["status"], baseEnv);
  const statusLines = status.output.split("\n");
  expect(
    status.code === 0 &&
      statusLines.length === shipped &&
      /^0001 baseline\s+\d{4}-/.test(statusLines[0] ?? "") &&
      statusLines.every((line) => /\s\d{4}-\d{2}-\d{2}T/.test(line)),
    `unexpected status: ${status.output}`,
  );
  console.log(`✓ migrations: ${up.output}; rerun: ${again.output}`);

  const [apiPort, simPort, workerPort] = await Promise.all([freePort(), freePort(), freePort()]);
  const services = [
    { name: "api", script: "apps/api/dist/main.js", port: apiPort, env: { API_PORT: String(apiPort) } },
    {
      name: "simulation",
      script: "apps/simulation/dist/main.js",
      port: simPort,
      env: { SIMULATION_HEALTH_PORT: String(simPort) },
    },
    {
      name: "worker",
      script: "apps/worker/dist/main.js",
      port: workerPort,
      env: { WORKER_HEALTH_PORT: String(workerPort) },
    },
  ];

  for (const service of services) {
    const child = spawn(process.execPath, [service.script], {
      cwd: root,
      env: { ...baseEnv, ...service.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    service.child = child;
    service.log = "";
    child.stdout.on("data", (chunk) => (service.log += chunk));
    child.stderr.on("data", (chunk) => (service.log += chunk));
    service.exited = new Promise((r) => child.on("exit", (code, signal) => r({ code, signal })));
    children.push(service);
  }

  for (const service of services) {
    const base = `http://127.0.0.1:${service.port}`;
    const live = await fetch(`${base}/health`).catch(() => null);
    const report = await waitForReady(service.name, base);
    const liveness = live ?? (await fetch(`${base}/health`));
    expect(liveness.status === 200, `${service.name} liveness returned ${liveness.status}`);
    console.log(`✓ ${service.name} ready on :${service.port} (${Object.keys(report.checks).join(", ")})`);
  }

  for (const service of services) {
    service.child.kill("SIGTERM");
    const result = await Promise.race([
      service.exited,
      new Promise((r) => setTimeout(() => r({ code: "timeout" }), EXIT_TIMEOUT_MS)),
    ]);
    expect(result.code === 0, `${service.name} did not shut down cleanly: ${JSON.stringify(result)}\n${service.log}`);
    console.log(`✓ ${service.name} shut down cleanly on SIGTERM`);
  }
} catch (error) {
  failed = true;
  console.error(`✗ smoke failed: ${error instanceof Error ? error.message : error}`);
  for (const service of children) if (service.log) console.error(`--- ${service.name} log ---\n${service.log}`);
} finally {
  for (const service of children) if (service.child.exitCode === null) service.child.kill("SIGKILL");
  await db.drop();
}

if (failed) process.exit(1);
console.log("Smoke test passed.");
