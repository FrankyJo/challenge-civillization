import { HOUSEHOLD_FORMS, type Culture, type DemographyTable, type HouseholdForm, type Sex } from "@civ/contracts";
import { type RandomStream } from "../random.js";
import { DAYS_PER_YEAR } from "./time.js";

/**
 * Household reconstruction (docs/POPULATION.md § Synthesis).
 *
 * A household is built around a marriage sampled backwards from today
 * (tick 0): marriage ages from the culture, a current age drawn from the
 * stationary age distribution (∝ l(x)), survival of each spouse since the
 * marriage from the life table, and a birth history from natural marital
 * fertility while both spouses lived. Children survive to today with
 * probability l(age). Births are at least 300 days apart; twins share a day.
 * All ages and kin links are therefore consistent by construction.
 */
export type Role = "head" | "spouse" | "child" | "parent" | "sibling" | "grandchild" | "fosterling";

/** A reference to a parent: another member of this household, an earlier person's ID, or none (died before 1 CE). */
export type ParentRef = { readonly member: number } | { readonly id: string } | null;

export interface DraftPerson {
  sex: Sex;
  birthTick: number;
  role: Role;
  mother: ParentRef;
  father: ParentRef;
  partner: number | null;
  marital: "never_married" | "married" | "widowed";
  /** Index of the guardian member (dependents only) and the relation. */
  guardian: { member: number; kind: "parent" | "kin" | "foster"; relation: GuardianRelation } | null;
  /** Children that share unrecorded parents share inherited names. */
  lineage: string;
}

export type GuardianRelation =
  "mother" | "father" | "grandparent" | "sibling" | "aunt_uncle" | "step_parent" | "foster_parent";

/** An adult child who left a household of this settlement (married), available as a spouse elsewhere. */
export interface PoolEntry {
  readonly sex: Sex;
  readonly birthTick: number;
  readonly motherId: string | null;
  readonly fatherId: string | null;
}

export interface BuildContext {
  readonly culture: Culture;
  readonly table: DemographyTable;
  readonly random: RandomStream;
  readonly pool: PoolEntry[];
}

export interface HouseholdDraft {
  form: HouseholdForm;
  members: DraftPerson[];
  /** Children who left by marriage; added to the settlement pool once IDs exist. */
  leavers: { sex: Sex; birthTick: number; mother: number | null; father: number | null }[];
}

const MAX_AGE = 95;

function triangular(random: RandomStream, range: { min: number; peak: number; max: number }, cap = 200): number {
  const ages: number[] = [];
  const weights: number[] = [];
  for (let age = range.min; age <= Math.min(range.max, cap); age += 1) {
    ages.push(age);
    weights.push(age <= range.peak ? age - range.min + 1 : range.max - age + 1);
  }
  if (ages.length === 0) return Math.min(range.min, cap);
  return ages[random.weightedIndex(weights)] as number;
}

/** Age drawn from the stationary population between `from` and `to` (weights l(x)). */
function stationaryAge(random: RandomStream, table: DemographyTable, from: number, to: number): number {
  const weights: number[] = [];
  for (let age = from; age <= to; age += 1) weights.push(Math.max(1, table.survivorsPpm[Math.min(age, 100)] ?? 0));
  return from + random.weightedIndex(weights);
}

function survives(random: RandomStream, table: DemographyTable, fromAge: number, toAge: number): boolean {
  const from = table.survivorsPpm[Math.min(fromAge, 100)] ?? 0;
  const to = table.survivorsPpm[Math.min(toAge, 100)] ?? 0;
  if (from === 0) return false;
  return random.chance(Math.min(to, from), from);
}

/** Age at death between `fromAge` (inclusive) and `toAge` (exclusive), weighted by deaths d(x). */
function deathAge(random: RandomStream, table: DemographyTable, fromAge: number, toAge: number): number {
  const weights: number[] = [];
  for (let age = fromAge; age < toAge; age += 1) {
    const here = table.survivorsPpm[Math.min(age, 100)] ?? 0;
    const next = table.survivorsPpm[Math.min(age + 1, 100)] ?? 0;
    weights.push(Math.max(1, here - next));
  }
  return weights.length === 0 ? fromAge : fromAge + random.weightedIndex(weights);
}

/** Birth tick of someone exactly `age` completed years old today, on a random day. */
function birthTickForAge(random: RandomStream, age: number): number {
  return -(age * DAYS_PER_YEAR + random.nextInt(1, DAYS_PER_YEAR));
}

/** Completed years at tick 0 (same rule as `ageInYears(birthTick, 0)`). */
const ageToday = (birthTick: number) => Math.floor(-birthTick / DAYS_PER_YEAR);

function sexAtBirth(random: RandomStream, table: DemographyTable): Sex {
  return random.chance(table.sexRatioAtBirth, table.sexRatioAtBirth + 1_000) ? "male" : "female";
}

function person(sex: Sex, birthTick: number, role: Role, lineage: string): DraftPerson {
  return {
    sex,
    birthTick,
    role,
    mother: null,
    father: null,
    partner: null,
    marital: "never_married",
    guardian: null,
    lineage,
  };
}

/** Take the first pool entry matching a filter (deterministic order). */
function takeFromPool(pool: PoolEntry[], match: (entry: PoolEntry) => boolean): PoolEntry | undefined {
  const index = pool.findIndex(match);
  if (index < 0) return undefined;
  return pool.splice(index, 1)[0];
}

interface Marriage {
  wife: DraftPerson;
  husband: DraftPerson;
  wifeAlive: boolean;
  husbandAlive: boolean;
  /** Ages at marriage and at death (null = alive). */
  wifeMarriedAt: number;
  husbandMarriedAt: number;
  wifeDiedAt: number | null;
  husbandDiedAt: number | null;
}

/**
 * Sample a marriage that is still represented today by at least one living
 * spouse. One spouse may be an adult child who left another household of the
 * settlement (the pool), which links kin across households.
 */
function sampleMarriage(ctx: BuildContext, minWifeAge: number, maxWifeAge: number): Marriage {
  const { culture, table, random } = ctx;
  const { female, male } = culture.household.marriageAge;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let wifeTick: number | null = null;
    let husbandTick: number | null = null;
    let wifeParents: PoolEntry | undefined;
    let husbandParents: PoolEntry | undefined;
    if (attempt === 0 && ctx.pool.length > 0) {
      // Married-out children of this settlement are spouses here first, which
      // keeps their age cohort and links them to their parents' records.
      const entry = takeFromPool(ctx.pool, (candidate) => {
        const age = ageToday(candidate.birthTick);
        return candidate.sex === "female"
          ? age >= Math.max(female.min, minWifeAge) && age <= maxWifeAge
          : age >= male.min && age <= MAX_AGE - 10;
      });
      const pickWife = entry?.sex === "female";
      if (entry !== undefined) {
        if (pickWife) {
          wifeTick = entry.birthTick;
          wifeParents = entry;
        } else {
          husbandTick = entry.birthTick;
          husbandParents = entry;
        }
      }
    }
    let wifeAge: number;
    let wifeMarriedAt: number;
    let husbandMarriedAt: number;
    let husbandAge: number;
    if (husbandTick !== null) {
      husbandAge = ageToday(husbandTick);
      husbandMarriedAt = triangular(random, male, husbandAge);
      wifeMarriedAt = triangular(random, female);
      wifeAge = wifeMarriedAt + (husbandAge - husbandMarriedAt);
      if (wifeAge < minWifeAge || wifeAge > maxWifeAge) {
        ctx.pool.unshift(husbandParents as PoolEntry);
        continue;
      }
    } else {
      wifeMarriedAt = triangular(random, female);
      wifeAge =
        wifeTick !== null
          ? ageToday(wifeTick)
          : stationaryAge(random, table, Math.max(wifeMarriedAt, minWifeAge), maxWifeAge);
      if (wifeTick !== null && wifeMarriedAt > wifeAge) wifeMarriedAt = triangular(random, female, wifeAge);
      husbandMarriedAt = triangular(random, male);
      husbandAge = husbandMarriedAt + (wifeAge - wifeMarriedAt);
    }
    if (husbandAge > MAX_AGE || wifeAge > MAX_AGE || wifeAge < wifeMarriedAt) {
      if (wifeParents !== undefined) ctx.pool.unshift(wifeParents);
      if (husbandParents !== undefined) ctx.pool.unshift(husbandParents);
      continue;
    }
    // A pooled spouse is alive by definition; others survive per the life table.
    const wifeAlive = wifeParents !== undefined || survives(random, table, wifeMarriedAt, wifeAge);
    const husbandAlive = husbandParents !== undefined || survives(random, table, husbandMarriedAt, husbandAge);
    if (!wifeAlive && !husbandAlive) continue;
    const wife = person("female", wifeTick ?? birthTickForAge(random, wifeAge), "spouse", "wife");
    const husband = person("male", husbandTick ?? birthTickForAge(random, husbandAge), "spouse", "husband");
    if (wifeParents !== undefined) {
      wife.mother = wifeParents.motherId === null ? null : { id: wifeParents.motherId };
      wife.father = wifeParents.fatherId === null ? null : { id: wifeParents.fatherId };
    }
    if (husbandParents !== undefined) {
      husband.mother = husbandParents.motherId === null ? null : { id: husbandParents.motherId };
      husband.father = husbandParents.fatherId === null ? null : { id: husbandParents.fatherId };
    }
    return {
      wife,
      husband,
      wifeAlive,
      husbandAlive,
      wifeMarriedAt,
      husbandMarriedAt,
      wifeDiedAt: wifeAlive ? null : deathAge(random, table, wifeMarriedAt, wifeAge),
      husbandDiedAt: husbandAlive ? null : deathAge(random, table, husbandMarriedAt, husbandAge),
    };
  }
  throw new Error(`could not sample a marriage for ${culture.cultureId}`);
}

/** Births of a marriage that are alive today, oldest first (natural fertility × culture level M). */
function birthHistory(ctx: BuildContext, marriage: Marriage): { sex: Sex; birthTick: number }[] {
  const { table, random, culture } = ctx;
  const wifeAgeToday = ageToday(marriage.wife.birthTick);
  const years = wifeAgeToday - marriage.wifeMarriedAt;
  const children: { sex: Sex; birthTick: number }[] = [];
  let lastBirth: number | null = null;
  for (let year = 0; year < years; year += 1) {
    const motherAge = marriage.wifeMarriedAt + year;
    const fatherAge = marriage.husbandMarriedAt + year;
    if (motherAge >= 50) break;
    if (marriage.wifeDiedAt !== null && motherAge >= marriage.wifeDiedAt) break;
    if (marriage.husbandDiedAt !== null && fatherAge >= marriage.husbandDiedAt) break;
    const group = Math.min(6, Math.max(0, Math.floor((motherAge - 15) / 5)));
    let rate = Math.floor(((table.naturalFertilityPpm[group] ?? 0) * culture.maritalFertilityPpm) / 1_000_000);
    if (lastBirth !== null && marriage.wife.birthTick + motherAge * DAYS_PER_YEAR - lastBirth < DAYS_PER_YEAR) {
      rate = Math.floor(rate / 2);
    }
    if (!random.chance(Math.min(rate, 1_000_000), 1_000_000)) continue;
    let tick = marriage.wife.birthTick + motherAge * DAYS_PER_YEAR + random.nextInt(0, DAYS_PER_YEAR);
    if (lastBirth !== null && tick - lastBirth < 300) tick = lastBirth + 300;
    if (tick > -1) break;
    lastBirth = tick;
    const deliveries = random.chance(table.twinPpm, 1_000_000) ? 2 : 1;
    for (let child = 0; child < deliveries; child += 1) {
      const age = ageToday(tick);
      if (survives(random, table, 0, age)) children.push({ sex: sexAtBirth(random, table), birthTick: tick });
    }
  }
  return children;
}

function guardianFor(members: DraftPerson[], child: DraftPerson): DraftPerson["guardian"] {
  const mother = child.mother !== null && "member" in child.mother ? child.mother.member : null;
  const father = child.father !== null && "member" in child.father ? child.father.member : null;
  if (mother !== null) return { member: mother, kind: "parent", relation: "mother" };
  if (father !== null) return { member: father, kind: "parent", relation: "father" };
  const grandparent = members.findIndex((member) => member.role === "head" && child.role === "grandchild");
  if (grandparent >= 0) return { member: grandparent, kind: "kin", relation: "grandparent" };
  const head = members.findIndex((member) => member.role === "head");
  if (head < 0) throw new Error("household defect: a dependent's household has no head");
  return { member: head, kind: "foster", relation: "foster_parent" };
}

/** Members of a couple household: living spouses plus their resident children. Returns member indexes. */
function coupleHousehold(
  ctx: BuildContext,
  members: DraftPerson[],
  leavers: HouseholdDraft["leavers"],
  marriage: Marriage,
): void {
  const { culture, random } = ctx;
  const residenceThroughWife =
    culture.household.residence === "matrilocal" || (culture.household.residence === "either" && random.chance(1, 2));
  const spouses: { draft: DraftPerson; alive: boolean }[] = residenceThroughWife
    ? [
        { draft: marriage.wife, alive: marriage.wifeAlive },
        { draft: marriage.husband, alive: marriage.husbandAlive },
      ]
    : [
        { draft: marriage.husband, alive: marriage.husbandAlive },
        { draft: marriage.wife, alive: marriage.wifeAlive },
      ];
  const living = spouses.filter((spouse) => spouse.alive).map((spouse) => spouse.draft);
  const head = living[0] as DraftPerson;
  head.role = "head";
  head.lineage = "head";
  head.marital = living.length === 2 ? "married" : "widowed";
  members.push(head);
  const headIndex = members.length - 1;
  let wifeIndex = marriage.wifeAlive ? (marriage.wife === head ? headIndex : -1) : null;
  let husbandIndex = marriage.husbandAlive ? (marriage.husband === head ? headIndex : -1) : null;
  if (living.length === 2) {
    const spouse = living[1] as DraftPerson;
    spouse.role = "spouse";
    spouse.marital = "married";
    members.push(spouse);
    const spouseIndex = members.length - 1;
    head.partner = spouseIndex;
    spouse.partner = headIndex;
    if (wifeIndex === -1) wifeIndex = spouseIndex;
    if (husbandIndex === -1) husbandIndex = spouseIndex;
  }
  for (const child of birthHistory(ctx, marriage)) {
    const age = ageToday(child.birthTick);
    const marriageRange =
      child.sex === "female" ? culture.household.marriageAge.female : culture.household.marriageAge.male;
    const married =
      age >= culture.household.adultAge &&
      age >= triangular(random, marriageRange) &&
      random.chance(culture.household.everMarriedPpm, 1_000_000);
    if (married) {
      leavers.push({
        sex: child.sex,
        birthTick: child.birthTick,
        mother: wifeIndex ?? null,
        father: husbandIndex ?? null,
      });
      continue;
    }
    const draft = person(child.sex, child.birthTick, "child", "children");
    draft.mother = wifeIndex === null ? null : { member: wifeIndex };
    draft.father = husbandIndex === null ? null : { member: husbandIndex };
    members.push(draft);
  }
}

/** Build one household of a culture-weighted form. */
export function buildHousehold(ctx: BuildContext): HouseholdDraft {
  const { culture, table, random } = ctx;
  const weights = HOUSEHOLD_FORMS.map((form) => culture.household.formWeights[form]);
  let form = HOUSEHOLD_FORMS[random.weightedIndex(weights)] as HouseholdForm;
  const members: DraftPerson[] = [];
  const leavers: HouseholdDraft["leavers"] = [];
  const adultAge = culture.household.adultAge;

  if (form === "solitary") {
    const age = stationaryAge(random, table, adultAge + 5, 85);
    const solo = person(sexAtBirth(random, table), birthTickForAge(random, age), "head", "head");
    solo.marital =
      age >= 25 && random.chance(culture.household.everMarriedPpm, 1_000_000) ? "widowed" : "never_married";
    members.push(solo);
  } else if (form === "kin_care" && !random.chance(culture.household.fosterPpm, 1_000_000)) {
    // A widowed grandparent raising orphaned grandchildren (their parents died before 1 CE).
    const age = stationaryAge(random, table, 45, 78);
    const grandparent = person(sexAtBirth(random, table), birthTickForAge(random, age), "head", "head");
    grandparent.marital = "widowed";
    members.push(grandparent);
    const count = 1 + random.nextInt(0, 3);
    let tick = -(random.nextInt(0, Math.min(adultAge, age - 30)) * DAYS_PER_YEAR + random.nextInt(1, DAYS_PER_YEAR));
    for (let index = 0; index < count; index += 1) {
      if (tick > -1 || ageToday(tick) >= adultAge || age - ageToday(tick) < 30) break;
      const child = person(sexAtBirth(random, table), tick, "grandchild", "grandchildren");
      members.push(child);
      tick += 300 + random.nextInt(0, 3 * DAYS_PER_YEAR);
    }
    if (members.length === 1) form = "solitary";
  } else {
    const fostering = form === "kin_care";
    if (fostering) form = "nuclear";
    const marriage = sampleMarriage(ctx, culture.household.marriageAge.female.min, form === "stem" ? 45 : 75);
    coupleHousehold(ctx, members, leavers, marriage);
    const head = members[0] as DraftPerson;
    const headAge = ageToday(head.birthTick);
    if (form === "stem" && (head.mother !== null || head.father !== null)) {
      // A head who left a household of this settlement already has recorded parents elsewhere.
      form = "nuclear";
    } else if (form === "stem") {
      // The head's parents (one or both still alive) live with the couple.
      const motherGap = 18 + random.nextInt(0, 18);
      const fatherGap = motherGap + 2 + random.nextInt(0, 11);
      const offset = random.nextInt(0, 200);
      const motherAlive = headAge + motherGap <= MAX_AGE && survives(random, table, motherGap, headAge + motherGap);
      const fatherAlive = headAge + fatherGap <= MAX_AGE && survives(random, table, fatherGap, headAge + fatherGap);
      const added: number[] = [];
      for (const [sex, gap, alive] of [
        ["female", motherGap, motherAlive],
        ["male", fatherGap, fatherAlive],
      ] as const) {
        if (!alive) continue;
        const parent = person(sex, head.birthTick - gap * DAYS_PER_YEAR - offset, "parent", "parent");
        parent.marital = motherAlive && fatherAlive ? "married" : "widowed";
        members.push(parent);
        added.push(members.length - 1);
        if (sex === "female") head.mother = { member: members.length - 1 };
        else head.father = { member: members.length - 1 };
      }
      if (added.length === 2) {
        const [first, second] = added as [number, number];
        (members[first] as DraftPerson).partner = second;
        (members[second] as DraftPerson).partner = first;
      }
      if (added.length === 0) form = "nuclear";
    } else if (form === "joint") {
      // Unmarried adult siblings of the head (same unrecorded parents).
      const count = 1 + random.nextInt(0, 2);
      let tick = head.birthTick + 300 + random.nextInt(0, 4 * DAYS_PER_YEAR);
      let added = 0;
      for (let index = 0; index < count; index += 1) {
        if (tick > -1 || ageToday(tick) < adultAge || head.mother !== null || head.father !== null) break;
        const sibling = person(sexAtBirth(random, table), tick, "sibling", "head");
        members.push(sibling);
        added += 1;
        tick += 300 + random.nextInt(0, 4 * DAYS_PER_YEAR);
      }
      if (added === 0) form = "nuclear";
    }
    if (fostering) {
      const age = random.nextInt(1, adultAge);
      const fosterling = person(
        sexAtBirth(random, table),
        birthTickForAge(random, age),
        "fosterling",
        `fosterling-${members.length}`,
      );
      members.push(fosterling);
    }
  }
  return { form, members, leavers };
}

/** Assign guardians to dependents and fix the form label after any truncation. */
export function finishHousehold(draft: HouseholdDraft, adultAge: number): void {
  const { members } = draft;
  for (const member of members) {
    member.guardian = isDependent(member.birthTick, member.marital, adultAge) ? guardianFor(members, member) : null;
  }
  const roles = new Set(members.map((member) => member.role));
  if (members.length === 1) draft.form = "solitary";
  else if (roles.has("grandchild") && !roles.has("spouse") && !roles.has("child")) draft.form = "kin_care";
  else if (roles.has("parent")) draft.form = "stem";
  else if (roles.has("sibling")) draft.form = "joint";
  else draft.form = "nuclear";
}

/**
 * Trim a household to at most `limit` members. Leavers reference only the
 * head and spouse (members 0 and 1), which are never removed. Only members nobody else
 * depends on are removed (the youngest resident without dependents first);
 * if the essential core is still too large, null is returned and the caller
 * builds a solitary household instead.
 */
export function trimHousehold(draft: HouseholdDraft, limit: number): HouseholdDraft | null {
  const members = [...draft.members];
  while (members.length > limit) {
    let removable = -1;
    for (let index = members.length - 1; index > 0; index -= 1) {
      const member = members[index] as DraftPerson;
      if (member.role === "spouse" || member.role === "head") continue;
      const referenced = members.some(
        (other) =>
          (other.mother !== null && "member" in other.mother && other.mother.member === index) ||
          (other.father !== null && "member" in other.father && other.father.member === index),
      );
      if (!referenced) {
        removable = index;
        break;
      }
    }
    if (removable < 0) return null;
    // Re-index references above the removed member.
    members.splice(removable, 1);
    const shift = (ref: ParentRef): ParentRef =>
      ref !== null && "member" in ref && ref.member > removable ? { member: ref.member - 1 } : ref;
    for (const member of members) {
      member.mother = shift(member.mother);
      member.father = shift(member.father);
      if (member.partner !== null && member.partner > removable) member.partner -= 1;
    }
  }
  return { ...draft, members };
}

/** A dependent is younger than the culture's adult age (nobody marries before it). */
export function isDependent(birthTick: number, _marital: DraftPerson["marital"], adultAge: number): boolean {
  return ageToday(birthTick) < adultAge;
}

export { ageToday };
