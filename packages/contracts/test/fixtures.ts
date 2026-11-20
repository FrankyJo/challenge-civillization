import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const packageRoot = resolve(import.meta.dirname, "..");
export const fixturesRoot = join(packageRoot, "fixtures");

export interface ManifestEntry {
  readonly file: string;
  readonly contract: string;
  readonly sha256: string;
}

export function readManifest(): ManifestEntry[] {
  return (JSON.parse(readFileSync(join(fixturesRoot, "manifest.json"), "utf8")) as { fixtures: ManifestEntry[] })
    .fixtures;
}

/** A fresh, mutable copy of a frozen fixture (e.g. `v1/world-record.json`). */
export function fixture(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(fixturesRoot, file), "utf8")) as Record<string, unknown>;
}
