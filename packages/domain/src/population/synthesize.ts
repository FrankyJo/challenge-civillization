import {
  CELL_FLAGS,
  contentPackSchema,
  DISABILITIES,
  parseContract,
  populationParamsSchema,
  POPULATION_SCHEMA_VERSION,
  SKILLS,
  worldIdSchema,
  worldMapSchema,
  worldSeedSchema,
  type ContentPack,
  type Culture,
  type DatasetNameSource,
  type Digest,
  type Household,
  type NameProvenance,
  type Person,
  type PersonName,
  type PopulationParams,
  type SeedPopulation,
  type Settlement,
  type Skill,
  type WorldMap,
} from "@civ/contracts";
import { canonicalHash } from "../hash.js";
import { deriveId } from "../ids.js";
import { RandomRoot, type RandomStream } from "../random.js";
import { allocate } from "../units.js";
import { cellColRow } from "../geography/grid.js";
import { assignHomelands, chooseSettlementSites } from "./homeland.js";
import {
  ageToday,
  buildHousehold,
  finishHousehold,
  isDependent,
  trimHousehold,
  type DraftPerson,
  type HouseholdDraft,
  type PoolEntry,
} from "./households.js";
import { displayForm, NameSampler } from "./names.js";
import { yearOfTick } from "./time.js";
import { assertValidPopulation } from "./validate.js";

/**
 * Seed population synthesis (docs/POPULATION.md).
 *
 * Inputs: world ID and seed, the world map, the content pack and params.
 * Output: a validated `SeedPopulation` with exactly `params.size` living
 * people. Every random choice comes from streams
 * `["population", <step>, …]` of the world seed, so the same inputs give
 * the same population hash on every platform.
 */
export const POPULATION_GENERATOR = Object.freeze({ id: "civ-popgen" as const, version: "1.0.0" });

export const DEFAULT_POPULATION_PARAMS: PopulationParams = Object.freeze({
  size: 10_000,
  settlementCount: 60,
  settlementSpacing: 3,
});

export interface SynthesizeInput {
  readonly worldId: string;
  readonly seed: string;
  readonly map: WorldMap;
  readonly pack: ContentPack;
  /** Digest of the content pack set (`contentVersionOf`). */
  readonly contentVersion: Digest;
  readonly params?: PopulationParams;
}

/** Zipf rank-size weights for the settlements of one culture. */
function rankWeights(count: number): number[] {
  return Array.from({ length: count }, (_, index) => Math.floor(1_000_000 / (index + 1)));
}

interface PersonSlot {
  readonly id: string;
  readonly draft: DraftPerson;
  readonly householdId: string;
  readonly settlement: number;
  readonly memberIndex: number;
  readonly household: readonly string[];
}

export function synthesizePopulation(input: SynthesizeInput): SeedPopulation {
  const worldId = parseContract("world id", worldIdSchema, input.worldId) as string;
  const seed = parseContract("world seed", worldSeedSchema, input.seed);
  const map = parseContract("world map", worldMapSchema, input.map);
  const pack = parseContract("content pack", contentPackSchema, input.pack);
  const params = parseContract("population params", populationParamsSchema, input.params ?? DEFAULT_POPULATION_PARAMS);
  const root = new RandomRoot(seed);
  const sampler = new NameSampler(pack);
  const table = pack.demography;

  // 1. Homelands and settlement sites.
  const regionCulture = assignHomelands(map, pack);
  const sites = chooseSettlementSites(map, pack, regionCulture, params.settlementCount, params.settlementSpacing);
  // Shares of cultures absent from the seed (no sites) go to the others.
  const cultureTotals = allocate(
    params.size,
    pack.cultures.map((culture, index) => (sites.some((site) => site.culture === index) ? culture.seedSharePpm : 0)),
  );
  const siteSizes = new Array<number>(sites.length).fill(0);
  pack.cultures.forEach((_, culture) => {
    const mine = sites.map((site, index) => ({ site, index })).filter((entry) => entry.site.culture === culture);
    if (mine.length === 0) return;
    const sizes = allocate(cultureTotals[culture] as number, rankWeights(mine.length));
    mine.forEach((entry, rank) => {
      siteSizes[entry.index] = sizes[rank] as number;
    });
  });

  // 2. Settlement names (unique within a culture where the datasets allow).
  const usedPlace = pack.cultures.map(() => new Set<string>());
  const settlements: Settlement[] = sites.map((site, index) => {
    const culture = pack.cultures[site.culture] as Culture;
    const sampled = sampler.sample(
      culture,
      "place",
      "any",
      0,
      root.stream("population", "settlement-name", index),
      usedPlace[site.culture],
    );
    usedPlace[site.culture]?.add(`${sampled.source.dataset}/${sampled.entry.entryId}`);
    const settlementId = deriveId("settlement", worldId, ...cellColRow(map.grid, site.cell));
    return {
      settlementId: settlementId as Settlement["settlementId"],
      cell: site.cell,
      regionId: map.regions[site.region]?.regionId as Settlement["regionId"],
      cultureId: culture.cultureId,
      name: {
        parts: [{ role: "place", form: sampled.entry.form, provenance: sampled.source }],
        display: sampled.entry.display,
      },
    };
  });

  // 3. Households, settlement by settlement, filling each site exactly.
  const households: Household[] = [];
  const slots: PersonSlot[] = [];
  sites.forEach((site, settlementIndex) => {
    const culture = pack.cultures[site.culture] as Culture;
    const settlement = settlements[settlementIndex] as Settlement;
    const pool: PoolEntry[] = [];
    let remaining = siteSizes[settlementIndex] as number;
    for (let householdIndex = 0; remaining > 0; householdIndex += 1) {
      const random = root.stream("population", "household", settlementIndex, householdIndex);
      let draft: HouseholdDraft | null = trimHousehold(buildHousehold({ culture, table, random, pool }), remaining);
      if (draft === null) {
        const solo = buildSolitary(culture, random.split("solitary"), table);
        draft = { form: "solitary", members: [solo], leavers: [] };
      }
      finishHousehold(draft, culture.household.adultAge);
      const householdId = deriveId("household", worldId, settlementIndex, householdIndex);
      const ids = draft.members.map((_, member) =>
        deriveId("person", worldId, settlementIndex, householdIndex, member),
      );
      draft.members.forEach((member, index) => {
        slots.push({
          id: ids[index] as string,
          draft: member,
          householdId,
          settlement: settlementIndex,
          memberIndex: index,
          household: ids,
        });
      });
      for (const leaver of draft.leavers) {
        pool.push({
          sex: leaver.sex,
          birthTick: leaver.birthTick,
          motherId: leaver.mother === null ? null : (ids[leaver.mother] ?? null),
          fatherId: leaver.father === null ? null : (ids[leaver.father] ?? null),
        });
      }
      households.push({
        householdId: householdId as Household["householdId"],
        settlementId: settlement.settlementId,
        form: draft.form,
        headId: ids[0] as Household["headId"],
        members: draft.members.map((member, index) => ({
          personId: ids[index] as Household["members"][number]["personId"],
          role: member.role,
        })),
      });
      remaining -= draft.members.length;
    }
  });

  // 4. People: resolve references, then names, gender, health and capabilities.
  const resolve = (slot: PersonSlot, ref: DraftPerson["mother"]): string | null =>
    ref === null ? null : "member" in ref ? (slot.household[ref.member] ?? null) : ref.id;
  const byId = new Map(slots.map((slot) => [slot.id, slot]));
  const names = new Map<string, PersonName>();
  const lineageNames = new Map<string, { form: string; source: DatasetNameSource }>();
  const siblingNames = new Map<string, Set<string>>();

  // The name of an unrecorded (pre-1 CE) relative is shared by everyone it
  // belongs to: all children of the recorded other parent (in any
  // household), or else a household lineage. It must be in use throughout
  // their birth years.
  type RelativeLabel = "father-given" | "mother-given" | "clan";
  const relativeKey = (slot: PersonSlot, label: RelativeLabel): string => {
    const culture = pack.cultures[sites[slot.settlement]?.culture ?? 0] as Culture;
    const from = label === "father-given" ? "father" : label === "mother-given" ? "mother" : culture.naming.clanFrom;
    const other = resolve(slot, from === "father" ? slot.draft.mother : slot.draft.father);
    return other !== null ? `parent:${other}:${label}` : `${slot.householdId}:${slot.draft.lineage}:${label}`;
  };
  const relativeYears = new Map<string, [number, number]>();
  for (const slot of slots) {
    const year = yearOfTick(slot.draft.birthTick);
    for (const label of ["father-given", "mother-given", "clan"] as const) {
      const key = relativeKey(slot, label);
      const range = relativeYears.get(key);
      relativeYears.set(key, range === undefined ? [year, year] : [Math.min(range[0], year), Math.max(range[1], year)]);
    }
  }

  const nameOf = (slot: PersonSlot): PersonName => {
    const known = names.get(slot.id);
    if (known !== undefined) return known;
    const settlement = settlements[slot.settlement] as Settlement;
    const culture = pack.cultures[sites[slot.settlement]?.culture ?? 0] as Culture;
    const random = root.stream("population", "name", slot.settlement, slot.householdId, slot.memberIndex);
    const year = yearOfTick(slot.draft.birthTick);
    const motherId = resolve(slot, slot.draft.mother);
    const fatherId = resolve(slot, slot.draft.father);
    // Siblings (same recorded mother, or the same unrecorded lineage in a household) get distinct given names.
    const siblingKey = motherId ?? fatherId ?? `${slot.householdId}:${slot.draft.lineage}`;
    const avoid = culture.naming.uniqueAmongSiblings
      ? (siblingNames.get(siblingKey) ?? new Set<string>())
      : new Set<string>();
    const given = sampler.sample(culture, "given", slot.draft.sex, year, random.split("given"), avoid);
    avoid.add(`${given.source.dataset}/${given.entry.entryId}`);
    siblingNames.set(siblingKey, avoid);
    const parts: PersonName["parts"][number][] = [{ role: "given", form: given.entry.form, provenance: given.source }];
    const unrecorded = (usage: "given" | "clan", sex: "female" | "male" | "any", label: RelativeLabel) => {
      const key = relativeKey(slot, label);
      let entry = lineageNames.get(key);
      if (entry === undefined) {
        const [from, until] = relativeYears.get(key) ?? [year, year];
        const sampled = sampler.sample(culture, usage, sex, from, random.split(label), new Set(), until);
        entry = { form: sampled.entry.form, source: sampled.source };
        lineageNames.set(key, entry);
      }
      return entry;
    };
    const { pattern, derivedSuffix, clanFrom } = culture.naming;
    if (pattern === "given_patronymic" || pattern === "given_matronymic") {
      const from = pattern === "given_patronymic" ? "father" : "mother";
      const parentId = from === "father" ? fatherId : motherId;
      const suffix = derivedSuffix[slot.draft.sex];
      let baseForm: string;
      let provenance: NameProvenance;
      const parent = parentId === null ? undefined : byId.get(parentId);
      if (parent !== undefined && parentId !== null) {
        baseForm = nameOf(parent).parts[0]?.form ?? "";
        provenance = {
          rule: pattern === "given_patronymic" ? "patronymic" : "matronymic",
          from,
          personId: parentId as Person["personId"],
          base: null,
        };
      } else {
        const sampled = unrecorded("given", from === "father" ? "male" : "female", `${from}-given`);
        baseForm = sampled.form;
        provenance = {
          rule: pattern === "given_patronymic" ? "patronymic" : "matronymic",
          from,
          personId: null,
          base: sampled.source,
        };
      }
      parts.push({
        role: pattern === "given_patronymic" ? "patronymic" : "matronymic",
        form: `${baseForm}${suffix}`,
        provenance,
      });
    } else if (pattern === "given_clan") {
      const parentId = clanFrom === "father" ? fatherId : motherId;
      const parent = parentId === null ? undefined : byId.get(parentId);
      const parentClan = parent === undefined ? undefined : nameOf(parent).parts.find((part) => part.role === "clan");
      if (parent !== undefined && parentId !== null && parentClan !== undefined) {
        parts.push({
          role: "clan",
          form: parentClan.form,
          provenance: { rule: "clan", from: clanFrom, personId: parentId as Person["personId"], base: null },
        });
      } else {
        const sampled = unrecorded("clan", "any", "clan");
        parts.push({
          role: "clan",
          form: sampled.form,
          provenance: { rule: "clan", from: clanFrom, personId: null, base: sampled.source },
        });
      }
    } else {
      const place = settlement.name.parts[0];
      parts.push({
        role: "place",
        form: place?.form ?? "",
        provenance: { rule: "place", settlementId: settlement.settlementId },
      });
    }
    const name: PersonName = {
      parts,
      display: parts.map((part) => displayForm(part.form)).join(" "),
    };
    names.set(slot.id, name);
    return name;
  };

  const persons: Person[] = slots.map((slot) => {
    const site = sites[slot.settlement];
    const settlement = settlements[slot.settlement] as Settlement;
    const culture = pack.cultures[site?.culture ?? 0] as Culture;
    const random = root.stream("population", "person", slot.settlement, slot.householdId, slot.memberIndex);
    const age = ageToday(slot.draft.birthTick);
    const guardian = slot.draft.guardian;
    return {
      personId: slot.id as Person["personId"],
      birthTick: slot.draft.birthTick,
      sex: slot.draft.sex,
      gender: genderOf(culture, slot.draft.sex, age, random.split("gender")),
      cultureId: culture.cultureId,
      householdId: slot.householdId as Person["householdId"],
      settlementId: settlement.settlementId,
      cell: settlement.cell,
      motherId: resolve(slot, slot.draft.mother) as Person["motherId"],
      fatherId: resolve(slot, slot.draft.father) as Person["fatherId"],
      partnerId: (slot.draft.partner === null ? null : slot.household[slot.draft.partner]) as Person["partnerId"],
      maritalStatus: slot.draft.marital,
      guardian:
        guardian === null || !isDependent(slot.draft.birthTick, slot.draft.marital, culture.household.adultAge)
          ? null
          : {
              kind: guardian.kind,
              guardianId: slot.household[guardian.member] as Person["personId"],
              relation: guardian.relation,
            },
      ...healthAndCapabilities(culture, table.disabilityPpm, map, settlement.cell, age, random.split("health")),
      name: nameOf(slot),
    };
  });

  const population: SeedPopulation = {
    schemaVersion: POPULATION_SCHEMA_VERSION,
    worldId: worldId as SeedPopulation["worldId"],
    contentVersion: input.contentVersion,
    mapHash: map.mapHash,
    params: { ...params },
    regionCultures: regionCulture.map((culture) => pack.cultures[culture]?.cultureId ?? ""),
    settlements,
    households,
    persons,
  };
  assertValidPopulation(population, { map, pack });
  return population;
}

function buildSolitary(culture: Culture, random: RandomStream, table: ContentPack["demography"]): DraftPerson {
  const ageWeights: number[] = [];
  for (let age = culture.household.adultAge + 5; age <= 85; age += 1)
    ageWeights.push(Math.max(1, table.survivorsPpm[age] ?? 0));
  const age = culture.household.adultAge + 5 + random.weightedIndex(ageWeights);
  return {
    sex: random.chance(table.sexRatioAtBirth, table.sexRatioAtBirth + 1_000) ? "male" : "female",
    birthTick: -(age * 365 + random.nextInt(1, 365)),
    role: "head",
    mother: null,
    father: null,
    partner: null,
    marital: age >= 25 && random.chance(culture.household.everMarriedPpm, 1_000_000) ? "widowed" : "never_married",
    guardian: null,
    lineage: "head",
  };
}

/** Gender as recorded by the culture; infants' gender is not yet recorded. */
function genderOf(culture: Culture, sex: "female" | "male", age: number, random: RandomStream): Person["gender"] {
  if (age < 1) return { category: null, status: "not_recorded" };
  if (age >= culture.household.adultAge) {
    // One draw over the cumulative prevalences, so every category keeps its own rate.
    const roll = random.nextInt(0, 1_000_000);
    let cumulative = 0;
    for (const category of culture.genders) {
      if (category.sexBasis !== "any" && category.sexBasis !== sex) continue;
      cumulative += category.prevalencePpm;
      if (roll < cumulative) return { category: category.category, status: "recorded" };
    }
  }
  return { category: sex === "female" ? "woman" : "man", status: "recorded" };
}

const WORK_BY_AGE: readonly [number, number][] = [
  [5, 0],
  [10, 150_000],
  [15, 450_000],
  [50, 1_000_000],
  [60, 800_000],
  [200, 550_000],
];
const DISABILITY_WORK: Readonly<Record<(typeof DISABILITIES)[number], number>> = {
  none: 1_000_000,
  mobility: 500_000,
  sensory: 800_000,
  cognitive: 600_000,
};

/**
 * Health baseline and capabilities. Skills depend on culture emphasis, the
 * settlement's environment, age (experience) and individual aptitude; never
 * on sex or gender. Disability prevalence by age band comes from the pack.
 */
function healthAndCapabilities(
  culture: Culture,
  disabilityPpm: readonly number[],
  map: WorldMap,
  cell: number,
  age: number,
  random: RandomStream,
): Pick<Person, "health" | "capabilities"> {
  const band = age < 15 ? 0 : age < 40 ? 1 : age < 60 ? 2 : 3;
  const disability = random.chance(disabilityPpm[band] ?? 0, 1_000_000)
    ? (DISABILITIES[1 + random.nextInt(0, 3)] as (typeof DISABILITIES)[number])
    : "none";
  const frailtyPpm = random.nextInt(600_000, 1_600_001) + (disability === "none" ? 0 : 300_000);
  const base = WORK_BY_AGE.find(([limit]) => age < limit)?.[1] ?? 0;
  const workCapacityPpm = Math.floor((base * DISABILITY_WORK[disability]) / 1_000_000);
  const flags = map.cells.flags[cell] as number;
  const waterside = (flags & (CELL_FLAGS.coast | CELL_FLAGS.river)) !== 0;
  const experience = Math.min(25, Math.max(0, age - 6));
  const skills = Object.fromEntries(
    SKILLS.map((skill: Skill) => {
      const environment = skill === "fishing" && !waterside ? 250 : 1_000;
      const aptitude = random.nextInt(0, 101);
      const level = Math.floor((aptitude * culture.economy[skill] * environment * experience) / (1_000 * 1_000 * 25));
      return [skill, Math.min(100, level)];
    }),
  ) as Record<Skill, number>;
  return { health: { frailtyPpm, disability }, capabilities: { workCapacityPpm, skills } };
}

/** Synthesize and hash: the population hash is the canonical hash of the document. */
export function seedPopulation(input: SynthesizeInput): { population: SeedPopulation; populationHash: Digest } {
  const population = synthesizePopulation(input);
  return { population, populationHash: canonicalHash(population) };
}
