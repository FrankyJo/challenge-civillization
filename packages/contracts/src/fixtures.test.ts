import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixture, fixturesRoot, readManifest } from "../test/fixtures.js";
import { CONTRACT_CATALOG } from "./catalog.js";
import { canonicalize } from "./canonical.js";
import { commandRegistry, eventRegistry } from "./messages.js";

const manifest = readManifest();

function parserFor(contract: string): (value: unknown) => unknown {
  if (contract === "command-envelope") return (value) => commandRegistry.parse(value);
  if (contract === "event-envelope") return (value) => eventRegistry.parse(value);
  const entry = CONTRACT_CATALOG.find((candidate) => candidate.name === contract);
  if (entry === undefined) throw new Error(`fixture names unknown contract ${contract}`);
  return (value) => entry.schema.parse(value);
}

describe("frozen compatibility fixtures", () => {
  it("are listed in the manifest with unchanged bytes (never edited or deleted)", () => {
    const onDisk = readdirSync(fixturesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((dir) =>
        readdirSync(join(fixturesRoot, dir.name))
          .filter((name) => name.endsWith(".json"))
          .map((name) => `${dir.name}/${name}`),
      )
      .sort();
    expect(manifest.map((entry) => entry.file).sort()).toEqual(onDisk);
    for (const entry of manifest) {
      const digest = createHash("sha256")
        .update(readFileSync(join(fixturesRoot, entry.file)))
        .digest("hex");
      expect(digest, `${entry.file} was edited after it was frozen`).toBe(entry.sha256);
    }
  });

  it.each(manifest.map((entry) => [entry.file, entry.contract] as const))(
    "%s still parses as %s without being altered",
    (file, contract) => {
      const raw = fixture(file);
      const parsed = parserFor(contract)(raw);
      expect(canonicalize(parsed)).toBe(canonicalize(raw));
    },
  );

  it("cover every catalogued contract", () => {
    const covered = new Set(manifest.map((entry) => entry.contract));
    const missing = CONTRACT_CATALOG.map((entry) => entry.name).filter((name) => !covered.has(name));
    expect(missing).toEqual([]);
  });

  it("cover every registered command and event variant", () => {
    const seen = new Set(
      manifest
        .filter((entry) => entry.contract.endsWith("-envelope"))
        .map((entry) => {
          const raw = fixture(entry.file) as { type: string; typeVersion: number };
          return `${raw.type}@${raw.typeVersion}`;
        }),
    );
    const registered = [...commandRegistry.definitions, ...eventRegistry.definitions].map(
      (definition) => `${definition.type}@${definition.typeVersion}`,
    );
    expect(registered.filter((id) => !seen.has(id))).toEqual([]);
  });
});
