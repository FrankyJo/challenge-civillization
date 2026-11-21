import { readFileSync } from "node:fs";
import { contentPackSchema, type ContentPack, type Culture, type Person, type SeedPopulation } from "@civ/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalHash } from "../hash.js";
import { RandomRoot } from "../random.js";
import { DEFAULT_MAP_PARAMS, generateWorldMap } from "../geography/generate.js";
import { eligibleEntries, entryInEra, NameSampler } from "./names.js";
import { populationReport } from "./report.js";
import { DEFAULT_POPULATION_PARAMS, POPULATION_GENERATOR, seedPopulation } from "./synthesize.js";
import { ageInYears, yearOfTick } from "./time.js";
import { validatePopulation } from "./validate.js";

// The season-one pack is data; the domain reads it as a file because it may
// not import @civ/content (dependency policy).
const pack: ContentPack = contentPackSchema.parse(
  JSON.parse(readFileSync(new URL("../../../content/src/packs/season-one.json", import.meta.url), "utf8")),
);
const CONTENT = `sha256:${"c".repeat(64)}` as const;
const WORLD = "wld_golden0001";
const SEED = "9e3779b97f4a7c15";
const map = generateWorldMap({ worldId: WORLD, seed: SEED });
const golden = seedPopulation({ worldId: WORLD, seed: SEED, map, pack, contentVersion: CONTENT });

// Frozen: a change means the synthesis output changed, which requires a
// POPULATION_GENERATOR.version bump (docs/POPULATION.md).
const GOLDEN_POPULATION_HASH = "sha256:03f047b9c35de4b35f7859559a673921c1a9231fbee6d2ed4e8838e0a7ca6e82";

function defined<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("expected a value");
  return value;
}
const culture = (id: string): Culture => defined(pack.cultures.find((entry) => entry.cultureId === id));

describe("seed population synthesis", () => {
  it("creates exactly 10,000 living people with a golden, reproducible hash", () => {
    expect(golden.population.persons).toHaveLength(10_000);
    expect(golden.population.params).toEqual(DEFAULT_POPULATION_PARAMS);
    expect(POPULATION_GENERATOR).toEqual({ id: "civ-popgen", version: "1.0.0" });
    expect(golden.populationHash).toBe(GOLDEN_POPULATION_HASH);
    expect(canonicalHash(golden.population)).toBe(golden.populationHash);
    const again = seedPopulation({ worldId: WORLD, seed: SEED, map, pack, contentVersion: CONTENT });
    expect(again.populationHash).toBe(golden.populationHash);
  });

  it("passes the full audit and plausibility screen", () => {
    expect(validatePopulation(golden.population, { map, pack })).toEqual({ ok: true, issues: [], issueCount: 0 });
    const report = populationReport(golden.population);
    for (const check of report.plausibility) expect(check, check.check).toMatchObject({ ok: true });
    expect(Object.keys(report.cultures).sort()).toEqual(pack.cultures.map((entry) => entry.cultureId).sort());
    expect(report.dependents.guardians.parent).toBeGreaterThan(0);
    expect(report.dependents.guardians.kin).toBeGreaterThan(0);
    expect(report.dependents.guardians.foster).toBeGreaterThan(0);
    expect(report.gender.not_recorded).toBeGreaterThan(0);
  });

  it("diverges for other seeds while keeping every invariant", () => {
    const seed = "0123456789abcdef";
    const otherMap = generateWorldMap({ worldId: WORLD, seed });
    const other = seedPopulation({ worldId: WORLD, seed, map: otherMap, pack, contentVersion: CONTENT });
    expect(other.populationHash).not.toBe(golden.populationHash);
    expect(other.population.persons).toHaveLength(10_000);
    expect(populationReport(other.population).plausibility.every((check) => check.ok)).toBe(true);
  });

  it("fills any requested size exactly on any map (property)", () => {
    const small = generateWorldMap({
      worldId: WORLD,
      seed: SEED,
      params: { ...DEFAULT_MAP_PARAMS, width: 30, height: 24, regionTargetCells: 25 },
    });
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 400 }),
        fc.integer({ min: 5, max: 12 }),
        fc.constantFrom("00112233445566778899aabbccddeeff", "0f1e2d3c4b5a6978", "9e3779b97f4a7c15"),
        (size, settlementCount, seed) => {
          const result = seedPopulation({
            worldId: WORLD,
            seed,
            map: small,
            pack,
            contentVersion: CONTENT,
            params: { size, settlementCount, settlementSpacing: 2 },
          });
          expect(result.population.persons).toHaveLength(size);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("links kin across households and records every name's provenance", () => {
    const persons = golden.population.persons;
    const linkedAcrossHouseholds = persons.filter((person) => {
      const mother = persons.find((candidate) => candidate.personId === person.motherId);
      return mother !== undefined && mother.householdId !== person.householdId;
    });
    expect(linkedAcrossHouseholds.length).toBeGreaterThan(100);
    for (const person of persons) {
      for (const part of person.name.parts) expect(part.provenance).toBeDefined();
    }
    const placeFallback = golden.population.settlements.filter(
      (settlement) => settlement.cultureId === "culture.velani",
    );
    // Velan has no place names: its settlements use the next dataset in the chain.
    for (const settlement of placeFallback) {
      expect(settlement.name.parts[0]?.provenance).toMatchObject({ dataset: "names.coastal_family", fallbackLevel: 1 });
    }
  });
});

describe("population audit", () => {
  const clone = (): SeedPopulation => structuredClone(golden.population);
  const find = (population: SeedPopulation, test: (person: Person) => boolean) =>
    defined(population.persons.find(test));
  const ageOf = (person: Person) => ageInYears(person.birthTick, 0);

  const corruptions: [string, (population: SeedPopulation) => void, RegExp][] = [
    ["a missing person", (p) => void p.persons.pop(), /living count|unknown person/],
    [
      "a duplicate identity",
      (p) => void (p.persons[1] = { ...defined(p.persons[1]), personId: defined(p.persons[0]).personId }),
      /duplicate person ID/,
    ],
    [
      "an impossible mother age",
      (p) => {
        const child = find(p, (person) => person.motherId !== null);
        const mother = find(p, (person) => person.personId === child.motherId);
        mother.birthTick = child.birthTick - 5 * 365;
      },
      /impossible mother age/,
    ],
    [
      "a mother younger than her child",
      (p) => {
        const child = find(p, (person) => person.motherId !== null);
        const mother = find(p, (person) => person.personId === child.motherId);
        mother.birthTick = child.birthTick + 10;
      },
      /impossible mother age/,
    ],
    [
      "births too close together",
      (p) => {
        const child = find(p, (person) => person.motherId !== null && ageOf(person) > 3);
        const sibling = { ...child, personId: "per_siblingx1" as Person["personId"], birthTick: child.birthTick + 100 };
        p.persons.push(sibling);
        p.params.size += 1;
        defined(p.households.find((household) => household.householdId === child.householdId)).members.push({
          personId: sibling.personId,
          role: "child",
        });
      },
      /births 100 days apart/,
    ],
    [
      "a dependent without guardianship",
      (p) => void (find(p, (person) => person.guardian !== null).guardian = null),
      /without a guardianship state/,
    ],
    [
      "a guardian in another household",
      (p) => {
        const child = find(p, (person) => person.guardian !== null);
        const stranger = find(p, (person) => person.householdId !== child.householdId && ageOf(person) > 30);
        child.guardian = { kind: "foster", guardianId: stranger.personId, relation: "foster_parent" };
      },
      /guardian lives elsewhere/,
    ],
    [
      "an invalid household reference",
      (p) => void (defined(p.persons[0]).householdId = "hhd_doesnotexist" as Person["householdId"]),
      /names another household|no household/,
    ],
    ["an invalid location", (p) => void (defined(p.persons[0]).cell = 0), /cell differs/],
    [
      "an out-of-era name",
      (p) => {
        const person = find(
          p,
          (candidate) => candidate.name.parts[0] !== undefined && "dataset" in candidate.name.parts[0].provenance,
        );
        const datasetId = (defined(person.name.parts[0]).provenance as { dataset: string }).dataset;
        const dataset = defined(pack.nameDatasets.find((entry) => entry.datasetId === datasetId));
        const late = defined(
          dataset.entries.find(
            (entry) =>
              entry.usage === "given" &&
              (entry.applicability === person.sex || entry.applicability === "any") &&
              entry.eraFrom !== null &&
              entry.eraFrom > yearOfTick(person.birthTick),
          ),
        );
        person.name.parts[0] = {
          role: "given",
          form: late.form,
          provenance: { dataset: dataset.datasetId, version: dataset.version, entryId: late.entryId, fallbackLevel: 0 },
        };
      },
      /out-of-era name/,
    ],
    [
      "a wrong fallback level",
      (p) => {
        const person = find(p, (candidate) => "dataset" in defined(candidate.name.parts[0]).provenance);
        const provenance = defined(person.name.parts[0]).provenance as { fallbackLevel: number };
        provenance.fallbackLevel = 1;
      },
      /fallback level/,
    ],
    [
      "a patronymic that does not match the father",
      (p) => {
        const person = find(
          p,
          (candidate) => candidate.name.parts[1]?.role === "patronymic" && candidate.fatherId !== null,
        );
        defined(person.name.parts[1]).form = "wrongan";
      },
      /does not match its source/,
    ],
    [
      "a non-reciprocal partnership",
      (p) => void (find(p, (person) => person.partnerId !== null).partnerId = defined(p.persons[0]).personId),
      /not reciprocal/,
    ],
    [
      "parents who are not partners (stem parents over a pooled head)",
      (p) => {
        const child = find(p, (person) => person.motherId !== null && person.fatherId !== null);
        const stranger = find(
          p,
          (person) => person.sex === "male" && person.personId !== child.fatherId && ageOf(person) > ageOf(child) + 20,
        );
        child.fatherId = stranger.personId;
      },
      /mother and father are not partners/,
    ],
    [
      "a married minor",
      (p) => {
        const person = find(p, (candidate) => candidate.partnerId !== null);
        person.birthTick = -14 * 365 - 10;
      },
      /before the adult age/,
    ],
    [
      "a household role that contradicts kinship",
      (p) => {
        const household = defined(
          p.households.find((entry) => entry.members.some((member) => member.role === "child")),
        );
        const member = defined(household.members.find((entry) => entry.role === "child"));
        member.role = "parent";
      },
      /is not a parent of the head/,
    ],
    [
      "siblings with different names for the same unrecorded parent",
      (p) => {
        const groups = new Map<string, Person[]>();
        for (const person of p.persons) {
          const part = person.name.parts[1];
          if (
            part === undefined ||
            "dataset" in part.provenance ||
            part.provenance.rule === "place" ||
            part.provenance.personId !== null
          )
            continue;
          const recorded = part.provenance.from === "father" ? person.motherId : person.fatherId;
          if (recorded !== null) groups.set(recorded, [...(groups.get(recorded) ?? []), person]);
        }
        const siblings = defined([...groups.values()].find((group) => group.length > 1));
        const provenance = defined(defined(siblings[1]).name.parts[1]).provenance as {
          base: { entryId: string } | null;
        };
        provenance.base = { ...defined(provenance.base), entryId: "zzz.g.m.9999" };
      },
      /siblings disagree/,
    ],
  ];

  it.each(corruptions)("detects %s", (_name, corrupt, message) => {
    const population = clone();
    corrupt(population);
    const report = validatePopulation(population, { map, pack });
    expect(report.ok).toBe(false);
    expect(report.issues.join("\n")).toMatch(message);
  });

  it("rejects a population for another map and malformed input", () => {
    const otherMap = generateWorldMap({ worldId: WORLD, seed: "0123456789abcdef" });
    expect(validatePopulation(golden.population, { map: otherMap, pack }).issues.join("\n")).toMatch(/another map/);
    expect(validatePopulation({ ...golden.population, persons: [] }, { map, pack }).ok).toBe(false);
  });
});

describe("name sampling", () => {
  const sampler = new NameSampler(pack);
  const velani = culture("culture.velani");

  it("honours era and applicability, deterministically", () => {
    const random = () => new RandomRoot(SEED).stream("test", "names");
    for (const year of [-80, 0, 300, 900]) {
      const first = sampler.sample(velani, "given", "female", year, random());
      const second = sampler.sample(velani, "given", "female", year, random());
      expect(first).toEqual(second);
      expect(entryInEra(first.entry, year)).toBe(true);
      expect(["female", "any"]).toContain(first.entry.applicability);
    }
  });

  it("falls back along the culture's chain and records the level", () => {
    const random = new RandomRoot(SEED).stream("test", "fallback");
    expect(sampler.sample(velani, "place", "any", 0, random).source.fallbackLevel).toBe(1);
    expect(sampler.sample(velani, "clan", "any", 0, random).source).toMatchObject({ dataset: "names.coastal_family" });
    const [primary] = sampler.chain(velani);
    expect(eligibleEntries(defined(primary), "place", "any", 0)).toHaveLength(0);
    // Nothing in any dataset: the chain is incomplete and sampling fails loudly.
    const broken: Culture = { ...velani, naming: { ...velani.naming, datasets: ["names.velan"] } };
    expect(() => sampler.sample(broken, "place", "any", 0, random)).toThrow(/fallback chain is incomplete/);
  });

  it("avoids sibling names without falling back", () => {
    const random = new RandomRoot(SEED).stream("test", "avoid");
    const used = new Set<string>();
    for (let index = 0; index < 20; index += 1) {
      const name = sampler.sample(velani, "given", "male", 0, random, used);
      expect(used.has(`${name.source.dataset}/${name.entry.entryId}`)).toBe(false);
      expect(name.source.fallbackLevel).toBe(0);
      used.add(`${name.source.dataset}/${name.entry.entryId}`);
    }
  });
});
