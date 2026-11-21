#!/usr/bin/env node
// Seed population budget (run after `pnpm --filter @civ/domain build`):
//   pnpm --filter @civ/domain bench:population
// Synthesizes the 10,000-person season-one population (including its full
// audit) and reports wall time, heap growth and document size against the
// recorded budget (docs/POPULATION.md § Budget). Exits non-zero over budget.
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { contentPackSchema } from "@civ/contracts";
import {
  canonicalHash,
  generateWorldMap,
  populationReport,
  seedPopulation,
  validatePopulation,
} from "../dist/index.js";

const BUDGET = { synthesizeMs: 3_000, heapMb: 256, documentMb: 16 };
const pack = contentPackSchema.parse(
  JSON.parse(readFileSync(new URL("../../content/src/packs/season-one.json", import.meta.url), "utf8")),
);
const contentVersion = canonicalHash(pack);
const gc = globalThis.gc ?? (() => {});
const rows = [];
for (const seed of ["9e3779b97f4a7c15", "0123456789abcdef", "fedcba9876543210"]) {
  const map = generateWorldMap({ worldId: "wld_bench0001", seed });
  seedPopulation({ worldId: "wld_bench0001", seed, map, pack, contentVersion }); // warm-up
  gc();
  const before = process.memoryUsage().heapUsed;
  const start = performance.now();
  const { population } = seedPopulation({ worldId: "wld_bench0001", seed, map, pack, contentVersion });
  const synthesizeMs = performance.now() - start;
  const heap = process.memoryUsage().heapUsed - before;
  const auditStart = performance.now();
  validatePopulation(population, { map, pack });
  const auditMs = performance.now() - auditStart;
  const report = populationReport(population);
  rows.push({
    seed,
    people: population.persons.length,
    households: population.households.length,
    synthesizeMs: Math.round(synthesizeMs),
    auditMs: Math.round(auditMs),
    heapMb: Math.round(heap / 1e5) / 10,
    documentMb: Math.round(Buffer.byteLength(JSON.stringify(population)) / 1e5) / 10,
    plausible: report.plausibility.every((check) => check.ok),
  });
}
console.table(rows);
const over = rows.flatMap((row) =>
  Object.entries(BUDGET)
    .filter(([key, limit]) => row[key] > limit)
    .map(([key, limit]) => `${row.seed} ${key} ${row[key]} > ${limit}`),
);
if (over.length > 0 || rows.some((row) => !row.plausible)) {
  console.error(`over budget or implausible: ${over.join(", ")}`);
  process.exit(1);
}
console.log(`within budget ${JSON.stringify(BUDGET)}`);
