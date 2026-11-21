#!/usr/bin/env node
// Kernel micro-benchmarks (run after `pnpm --filter @civ/domain build`):
//   pnpm --filter @civ/domain bench
// Reports throughput of the primitives every tick depends on and the cost
// of advancing a full 1–2026 CE season with no systems (kernel overhead).
import { performance } from "node:perf_hooks";
import { commandRegistry } from "@civ/contracts";
import {
  canonicalHash,
  createEngine,
  createSystemSchedule,
  deriveId,
  instantAt,
  RandomRoot,
  SEASON_ONE_SPAN,
  sha256,
} from "../dist/index.js";

function measure(label, unit, iterations, fn) {
  fn(Math.min(iterations, 1000)); // warm-up
  const start = performance.now();
  fn(iterations);
  const ms = performance.now() - start;
  const rate = (iterations / ms) * 1000;
  console.log(`${label.padEnd(44)} ${rate.toFixed(0).padStart(12)} ${unit}/s  (${ms.toFixed(1)} ms)`);
  return ms;
}

const block = new Uint8Array(1024 * 1024).fill(7);
measure("sha256 (1 MiB blocks)", "MiB", 20, (n) => {
  for (let i = 0; i < n; i += 1) sha256(block);
});

const root = new RandomRoot("9e3779b97f4a7c15");
const stream = root.stream("bench");
measure("prng nextUint32", "draws", 5_000_000, (n) => {
  for (let i = 0; i < n; i += 1) stream.nextUint32();
});
measure("prng nextInt(0, 1000)", "draws", 5_000_000, (n) => {
  for (let i = 0; i < n; i += 1) stream.nextInt(0, 1000);
});
measure("prng stream derivation (hash per stream)", "streams", 100_000, (n) => {
  for (let i = 0; i < n; i += 1) root.stream("system", "births", i);
});
measure("deriveId", "ids", 100_000, (n) => {
  for (let i = 0; i < n; i += 1) deriveId("event", "wld_bench0001", i);
});

const people = Array.from({ length: 10_000 }, (_, i) => ({
  id: `per_${String(i).padStart(8, "0")}`,
  age: i % 90,
  alive: true,
}));
measure("canonicalHash of 10,000 small records", "hashes", 20, (n) => {
  for (let i = 0; i < n; i += 1) canonicalHash(people);
});

const engine = createEngine({
  worldId: "wld_bench0001",
  seed: "9e3779b97f4a7c15",
  span: SEASON_ONE_SPAN,
  contentVersion: `sha256:${"0".repeat(64)}`,
  schedule: createSystemSchedule([]),
});
const advance = (n, fromTick, toTick) =>
  commandRegistry.parse({
    schemaVersion: 1,
    commandId: `cmd_bench${String(n).padStart(6, "0")}`,
    type: "world.advance",
    typeVersion: 1,
    worldId: "wld_bench0001",
    instant: instantAt(SEASON_ONE_SPAN, fromTick),
    issuedAt: "2027-01-01T00:00:00Z",
    actor: { kind: "system", component: "scheduler" },
    idempotencyKey: `bench-advance-${n}`,
    expectedVersion: null,
    causationId: null,
    correlationId: "bench",
    versions: engine.versions,
    payload: { fromTick, toTick },
  });
// One season in maximum-size batches (3,650 ticks = 10 years per command).
const start = performance.now();
let state = engine.initialState({});
let commands = 0;
for (let from = 0; from < engine.endTick;) {
  const to = Math.min(from + 3_650, engine.endTick);
  const result = engine.apply(state, advance(++commands, from, to));
  if (!result.accepted) throw new Error(result.rejection.message);
  state = result.state;
  from = to;
}
const ms = performance.now() - start;
console.log(
  `${"full season advance, no systems".padEnd(44)} ${String(engine.endTick).padStart(12)} ticks    (${ms.toFixed(1)} ms, ${commands} commands)`,
);
