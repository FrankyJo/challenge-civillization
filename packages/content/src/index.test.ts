import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { contentPackSchema, type ContentPack } from "@civ/contracts";
import { describe, expect, it } from "vitest";
import {
  BUNDLED_CONTENT_PACKS,
  contentPackIssues,
  contentVersionOf,
  SEASON_ONE_CONTENT_VERSION,
  SEASON_ONE_PACK,
} from "./index.js";

const clone = (): ContentPack => contentPackSchema.parse(structuredClone(SEASON_ONE_PACK));
function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("expected a value");
  return value;
}

describe("season-one content pack", () => {
  it("is bundled, frozen and versioned by its canonical digest", () => {
    expect(BUNDLED_CONTENT_PACKS).toEqual(["civ.season_one@1.0.0"]);
    expect(Object.isFrozen(BUNDLED_CONTENT_PACKS)).toBe(true);
    expect(SEASON_ONE_CONTENT_VERSION).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(contentVersionOf([clone()])).toBe(SEASON_ONE_CONTENT_VERSION);
    const changed = clone();
    defined(defined(changed.nameDatasets[0]).entries[0]).weight += 1;
    expect(contentVersionOf([changed])).not.toBe(SEASON_ONE_CONTENT_VERSION);
  });

  it("is exactly what its generator script produces", () => {
    const script = resolve(import.meta.dirname, "..", "scripts", "build-season-one.mjs");
    expect(execFileSync(process.execPath, [script, "--check"], { encoding: "utf8" })).toContain("up to date");
  });

  it("passes content validation with plausible demography", () => {
    expect(contentPackIssues(SEASON_ONE_PACK)).toEqual([]);
    const lx = SEASON_ONE_PACK.demography.survivorsPpm;
    let personYears = 0;
    for (let age = 0; age < 100; age += 1) personYears += ((lx[age] ?? 0) + (lx[age + 1] ?? 0)) / 2;
    const e0 = personYears / 1_000_000;
    expect(e0).toBeGreaterThan(20);
    expect(e0).toBeLessThan(30);
    expect(1_000_000 - (lx[1] ?? 0)).toBeGreaterThan(200_000);
    expect(SEASON_ONE_PACK.cultures).toHaveLength(5);
  });

  it("rejects broken fallback chains, shares and duplicates", () => {
    const noFallback = clone();
    const last = defined(noFallback.nameDatasets.at(-1));
    last.entries = last.entries.filter((entry) => entry.usage !== "place");
    expect(contentPackIssues(noFallback).join("\n")).toMatch(/lacks an open-era place\/any/);
    const shares = clone();
    defined(shares.cultures[0]).seedSharePpm += 1;
    expect(contentPackIssues(shares).join("\n")).toMatch(/seed shares/);
    const unknown = clone();
    defined(unknown.cultures[0]).naming.datasets = ["names.missing"];
    expect(contentPackIssues(unknown).join("\n")).toMatch(/unknown dataset/);
    const duplicate = clone();
    const first = defined(duplicate.nameDatasets[0]);
    first.entries.push({ ...defined(first.entries[0]) });
    expect(contentPackIssues(duplicate).join("\n")).toMatch(/duplicate entry/);
  });
});
