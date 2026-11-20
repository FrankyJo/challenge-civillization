#!/usr/bin/env node
// Record new compatibility fixtures in fixtures/manifest.json.
//
// Fixtures are frozen: once listed, a fixture's bytes may never change, and
// it must keep parsing with current code (fixtures.test.ts enforces both).
// This script only ADDS entries for unlisted files; it refuses to run if a
// listed fixture was edited or deleted. The contract name is the part of the
// file name before the first "." (e.g. command-envelope.world-pause.json).
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "fixtures");
const manifestPath = join(root, "manifest.json");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { fixtures: [] };
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const problems = [];
for (const entry of manifest.fixtures) {
  const path = join(root, entry.file);
  if (!existsSync(path)) problems.push(`${entry.file}: listed but missing (fixtures must never be deleted)`);
  else if (sha256(path) !== entry.sha256)
    problems.push(`${entry.file}: edited after freezing (add a new fixture instead)`);
}
if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

const listed = new Set(manifest.fixtures.map((entry) => entry.file));
const added = [];
for (const version of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory())) {
  for (const name of readdirSync(join(root, version.name))
    .filter((n) => n.endsWith(".json"))
    .sort()) {
    const file = `${version.name}/${name}`;
    if (listed.has(file)) continue;
    const entry = { file, contract: name.split(".")[0], sha256: sha256(join(root, file)) };
    manifest.fixtures.push(entry);
    added.push(file);
  }
}
manifest.fixtures.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(added.length === 0 ? "No new fixtures." : `Frozen ${added.length} fixture(s):\n  ${added.join("\n  ")}`);
