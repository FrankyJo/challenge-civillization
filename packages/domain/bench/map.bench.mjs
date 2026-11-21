#!/usr/bin/env node
// Map generation budget (run after `pnpm --filter @civ/domain build`):
//   pnpm --filter @civ/domain bench:map
// Generates, validates and projects maps of increasing size and reports wall
// time, heap growth and document/snapshot sizes against the recorded budget
// (docs/GEOGRAPHY.md § Budget). Exits non-zero if the default map breaks it.
import { performance } from "node:perf_hooks";
import { DEFAULT_MAP_PARAMS, generateWorldMap, mapSnapshot, validateWorldMap } from "../dist/index.js";

const BUDGET = { generateMs: 1_000, heapMb: 64, documentKb: 1_024, snapshotKb: 64 };
const SIZES = [
  { label: "default 80×60 @5 km", params: DEFAULT_MAP_PARAMS },
  {
    label: "256×192 @2.5 km",
    params: { ...DEFAULT_MAP_PARAMS, width: 256, height: 192, cellSpacingM: 2_500, regionTargetCells: 240 },
  },
  {
    label: "256×256 @2 km (max cells)",
    params: { ...DEFAULT_MAP_PARAMS, width: 256, height: 256, cellSpacingM: 2_000, regionTargetCells: 240 },
  },
];
const gc = globalThis.gc ?? (() => {});
const rows = [];
for (const { label, params } of SIZES) {
  generateWorldMap({ worldId: "wld_bench0001", seed: "00112233445566778899aabbccddeeff", params }); // warm-up
  const times = [];
  let heap = 0;
  let map;
  for (let run = 0; run < 3; run += 1) {
    gc();
    const before = process.memoryUsage().heapUsed;
    const start = performance.now();
    map = generateWorldMap({ worldId: "wld_bench0001", seed: "00112233445566778899aabbccddeeff", params });
    times.push(performance.now() - start);
    heap = Math.max(heap, process.memoryUsage().heapUsed - before);
  }
  const validateStart = performance.now();
  validateWorldMap(map);
  const validateMs = performance.now() - validateStart;
  const snapshot = mapSnapshot(map);
  times.sort((a, b) => a - b);
  rows.push({
    label,
    cells: params.width * params.height,
    generateMs: Math.round(times[1]),
    validateMs: Math.round(validateMs),
    heapMb: Math.round(heap / 1e5) / 10,
    documentKb: Math.round(Buffer.byteLength(JSON.stringify(map)) / 1024),
    snapshotKb: Math.round(Buffer.byteLength(JSON.stringify(snapshot)) / 1024),
  });
}
console.table(rows);
const [first] = rows;
const over = Object.entries(BUDGET).filter(([key, limit]) => first[key] > limit);
if (over.length > 0) {
  console.error(
    `default map exceeds its budget: ${over.map(([key, limit]) => `${key} ${first[key]} > ${limit}`).join(", ")}`,
  );
  process.exit(1);
}
console.log(`default map within budget ${JSON.stringify(BUDGET)}`);
