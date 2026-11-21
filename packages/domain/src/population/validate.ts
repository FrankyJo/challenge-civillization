import {
  CELL_FLAGS,
  seedPopulationSchema,
  type ContentPack,
  type Culture,
  type DatasetNameSource,
  type NameEntry,
  type Person,
  type SeedPopulation,
  type WorldMap,
} from "@civ/contracts";
import { eligibleEntries, entryInEra, NameSampler } from "./names.js";
import { ageInYears, DAYS_PER_YEAR, yearOfTick } from "./time.js";

/**
 * Seed population audit (docs/POPULATION.md § Validation). Recomputes every
 * invariant from the records; never trusts derived fields.
 */
export interface PopulationValidationReport {
  readonly ok: boolean;
  readonly issues: readonly string[];
  readonly issueCount: number;
}

export class PopulationValidationError extends Error {
  readonly report: PopulationValidationReport;
  constructor(report: PopulationValidationReport) {
    super(`invalid seed population (${report.issueCount} issues): ${report.issues.slice(0, 5).join("; ")}`);
    this.name = "PopulationValidationError";
    this.report = report;
  }
}

/** Mother's age at a birth must lie in this range (years); father's at least the minimum. */
export const MOTHER_AGE_AT_BIRTH = Object.freeze({ min: 13, max: 50 });
export const FATHER_AGE_AT_BIRTH = Object.freeze({ min: 14, max: 80 });
/** Two births of one mother are at least this many days apart, or on the same day (multiples, at most 3). */
export const MIN_BIRTH_INTERVAL_DAYS = 270;

export function validatePopulation(
  input: unknown,
  context: { readonly map: WorldMap; readonly pack: ContentPack },
): PopulationValidationReport {
  const issues: string[] = [];
  let issueCount = 0;
  const issue = (message: string) => {
    issueCount += 1;
    if (issues.length < 50) issues.push(message);
  };
  const parsed = seedPopulationSchema.safeParse(input);
  if (!parsed.success) {
    for (const problem of parsed.error.issues) issue(`${problem.path.join(".")}: ${problem.message}`);
    return { ok: false, issues, issueCount };
  }
  const population = parsed.data;
  const { map, pack } = context;
  const cultures = new Map(pack.cultures.map((culture) => [culture.cultureId, culture]));
  const sampler = new NameSampler(pack);

  if (population.mapHash !== map.mapHash) issue("population was synthesized for another map");
  if (population.persons.length !== population.params.size) {
    issue(`living count ${population.persons.length} ≠ required ${population.params.size}`);
  }
  if (population.regionCultures.length !== map.regions.length) issue("regionCultures does not cover every map region");
  for (const cultureId of population.regionCultures)
    if (!cultures.has(cultureId)) issue(`unknown culture ${cultureId}`);

  // Unique identities.
  const unique = (label: string, ids: readonly string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) issue(`duplicate ${label} ID ${id}`);
      seen.add(id);
    }
  };
  unique(
    "person",
    population.persons.map((person) => person.personId),
  );
  unique(
    "household",
    population.households.map((household) => household.householdId),
  );
  unique(
    "settlement",
    population.settlements.map((settlement) => settlement.settlementId),
  );

  // Settlements on habitable land in a region of their culture.
  const settlements = new Map(population.settlements.map((settlement) => [settlement.settlementId, settlement]));
  const regionIndex = new Map(map.regions.map((region, index) => [region.regionId as string, index]));
  for (const settlement of population.settlements) {
    const { cell } = settlement;
    if (cell >= map.cells.flags.length) {
      issue(`settlement ${settlement.settlementId} at impossible cell ${cell}`);
      continue;
    }
    if (((map.cells.flags[cell] as number) & CELL_FLAGS.water) !== 0)
      issue(`settlement ${settlement.settlementId} is on water`);
    const region = regionIndex.get(settlement.regionId);
    if (region === undefined || map.cells.region[cell] !== region)
      issue(`settlement ${settlement.settlementId} region mismatch`);
    else if (population.regionCultures[region] !== settlement.cultureId)
      issue(`settlement ${settlement.settlementId} is outside its culture's regions`);
    const culture = cultures.get(settlement.cultureId);
    const place = settlement.name.parts[0];
    if (culture === undefined || place === undefined || settlement.name.parts.length !== 1 || place.role !== "place") {
      issue(`settlement ${settlement.settlementId} has a malformed name`);
    } else if (!("dataset" in place.provenance)) {
      issue(`settlement ${settlement.settlementId} name lacks dataset provenance`);
    } else {
      checkDatasetName(
        culture,
        place.provenance,
        place.form,
        "place",
        "any",
        0,
        `settlement ${settlement.settlementId}`,
      );
    }
  }

  // Households: membership is a partition of people, in one settlement each.
  const persons = new Map(population.persons.map((person) => [person.personId as string, person]));
  const householdsById = new Map(
    population.households.map((household) => [household.householdId as string, household]),
  );
  const memberOf = new Map<string, string>();
  for (const household of population.households) {
    if (!settlements.has(household.settlementId)) issue(`household ${household.householdId} has an unknown settlement`);
    if (household.members[0]?.personId !== household.headId || household.members[0]?.role !== "head") {
      issue(`household ${household.householdId}: the first member must be its head`);
    }
    for (const member of household.members) {
      if (memberOf.has(member.personId)) issue(`person ${member.personId} belongs to two households`);
      memberOf.set(member.personId, household.householdId);
      const person = persons.get(member.personId);
      if (person === undefined) issue(`household ${household.householdId} lists unknown person ${member.personId}`);
      else if (person.householdId !== household.householdId) issue(`person ${member.personId} names another household`);
    }
    const roles = household.members.map((member) => member.role);
    const formOk =
      household.form === "solitary"
        ? household.members.length === 1
        : household.form === "stem"
          ? roles.includes("parent")
          : household.form === "joint"
            ? roles.includes("sibling")
            : household.form === "kin_care"
              ? roles.includes("grandchild")
              : household.members.length >= 1;
    if (!formOk) issue(`household ${household.householdId}: form ${household.form} does not match its members`);
  }

  // Household roles agree with kin links.
  for (const household of population.households) {
    const head = persons.get(household.headId);
    if (head === undefined) continue;
    const parentIn = (ids: readonly (string | null)[]) =>
      ids.some((id) => id !== null && (id === head.personId || id === head.partnerId));
    for (const member of household.members) {
      const person = persons.get(member.personId);
      if (person === undefined) continue;
      const where = `household ${household.householdId} ${member.role} ${member.personId}`;
      switch (member.role) {
        case "spouse":
          if (head.partnerId !== person.personId) issue(`${where} is not the head's partner`);
          break;
        case "child":
          if (!parentIn([person.motherId, person.fatherId])) issue(`${where} is not a child of the head or partner`);
          break;
        case "parent":
          if (head.motherId !== person.personId && head.fatherId !== person.personId)
            issue(`${where} is not a parent of the head`);
          break;
        case "grandchild":
          if (person.guardian?.guardianId !== head.personId || person.guardian.relation !== "grandparent") {
            issue(`${where} is not in the head's care as a grandchild`);
          }
          break;
        case "fosterling":
          if (person.guardian?.kind !== "foster" || parentIn([person.motherId, person.fatherId])) {
            issue(`${where} is not a fosterling`);
          }
          break;
        case "sibling": {
          const gap = Math.abs(person.birthTick - head.birthTick);
          if (gap !== 0 && gap < MIN_BIRTH_INTERVAL_DAYS) issue(`${where} was born ${gap} days from the head`);
          break;
        }
        case "head":
          break;
      }
    }
  }

  // Siblings with one recorded parent share the name derived from their unrecorded other parent.
  const derivedByParent = new Map<string, string>();
  for (const person of population.persons) {
    const part = person.name.parts[1];
    if (part === undefined || "dataset" in part.provenance || part.provenance.rule === "place") continue;
    if (part.provenance.personId !== null) continue;
    const recorded = part.provenance.from === "father" ? person.motherId : person.fatherId;
    if (recorded === null) continue;
    const key = `${recorded}:${part.provenance.rule}`;
    const base = part.provenance.base?.entryId ?? "";
    const known = derivedByParent.get(key);
    if (known === undefined) derivedByParent.set(key, base);
    else if (known !== base)
      issue(`person ${person.personId}: siblings disagree on their unrecorded ${part.provenance.from}'s name`);
  }

  // People.
  const birthsByMother = new Map<string, number[]>();
  for (const person of population.persons) {
    const where = `person ${person.personId}`;
    if (!memberOf.has(person.personId)) issue(`${where} is in no household`);
    const settlement = settlements.get(person.settlementId);
    if (settlement === undefined) issue(`${where} lives in an unknown settlement`);
    else {
      if (person.cell !== settlement.cell) issue(`${where} cell differs from its settlement`);
      if (person.cultureId !== settlement.cultureId) issue(`${where} culture differs from its settlement`);
    }
    const household = householdsById.get(person.householdId);
    if (household !== undefined && household.settlementId !== person.settlementId)
      issue(`${where} household is in another settlement`);
    const culture = cultures.get(person.cultureId);
    if (culture === undefined) {
      issue(`${where} has an unknown culture`);
      continue;
    }
    if (person.birthTick > -1) issue(`${where} is not born before the season starts`);
    const age = ageInYears(Math.min(person.birthTick, 0), 0);

    // Parents: living records of the right sex at plausible ages.
    for (const [key, sex, range] of [
      ["motherId", "female", MOTHER_AGE_AT_BIRTH],
      ["fatherId", "male", FATHER_AGE_AT_BIRTH],
    ] as const) {
      const parentId = person[key];
      if (parentId === null) continue;
      const parent = persons.get(parentId);
      if (parent === undefined) {
        issue(`${where} ${key} ${parentId} does not exist`);
        continue;
      }
      if (parent.sex !== sex) issue(`${where} ${key} has sex ${parent.sex}`);
      const ageAtBirth = Math.floor((person.birthTick - parent.birthTick) / DAYS_PER_YEAR);
      if (person.birthTick <= parent.birthTick || ageAtBirth < range.min || ageAtBirth > range.max) {
        issue(`${where}: impossible ${key === "motherId" ? "mother" : "father"} age at birth (${ageAtBirth})`);
      }
      if (key === "motherId") birthsByMother.set(parentId, [...(birthsByMother.get(parentId) ?? []), person.birthTick]);
    }

    // Partnership: reciprocal, same household, married adults.
    if (person.partnerId !== null) {
      const partner = persons.get(person.partnerId);
      if (partner === undefined || partner.partnerId !== person.personId)
        issue(`${where} partnership is not reciprocal`);
      else if (partner.householdId !== person.householdId) issue(`${where} lives apart from its partner`);
      if (person.maritalStatus !== "married") issue(`${where} has a partner but is ${person.maritalStatus}`);
    } else if (person.maritalStatus === "married") issue(`${where} is married without a partner`);
    if (person.maritalStatus !== "never_married" && age < culture.household.adultAge) {
      issue(`${where} is ${person.maritalStatus} at ${age}, before the adult age ${culture.household.adultAge}`);
    }
    // Both parents recorded: in a closed, monogamous seed they are each other's partners.
    if (person.motherId !== null && person.fatherId !== null) {
      const mother = persons.get(person.motherId);
      if (mother !== undefined && mother.partnerId !== person.fatherId)
        issue(`${where}: its mother and father are not partners`);
    }

    // Guardianship: every dependent has one; adults have none.
    const dependent = age < culture.household.adultAge;
    if (dependent && person.guardian === null) issue(`${where} is a dependent without a guardianship state`);
    if (!dependent && person.guardian !== null) issue(`${where} is not a dependent but has a guardian`);
    if (person.guardian !== null) {
      const guardian = persons.get(person.guardian.guardianId);
      if (guardian === undefined) issue(`${where} guardian does not exist`);
      else {
        if (guardian.householdId !== person.householdId) issue(`${where} guardian lives elsewhere`);
        const guardianAge = ageInYears(Math.min(guardian.birthTick, 0), 0);
        const guardianCulture = cultures.get(guardian.cultureId);
        if (guardianAge < (guardianCulture?.household.adultAge ?? 15) && guardian.maritalStatus === "never_married") {
          issue(`${where} guardian is itself a dependent`);
        }
        const isParent =
          person.guardian.guardianId === person.motherId || person.guardian.guardianId === person.fatherId;
        if (person.guardian.kind === "parent") {
          const expected = person.guardian.relation === "mother" ? person.motherId : person.fatherId;
          if (expected !== person.guardian.guardianId)
            issue(`${where} parent guardian is not its ${person.guardian.relation}`);
        } else if (isParent) {
          issue(`${where}: a parent is recorded as a ${person.guardian.kind} guardian`);
        }
        if (person.guardian.relation === "grandparent" && guardianAge - age < 30) {
          issue(`${where}: grandparent guardian is only ${guardianAge - age} years older`);
        }
      }
    }

    // Gender record.
    const categories = new Set(["woman", "man", ...culture.genders.map((gender) => gender.category)]);
    if (
      person.gender.status === "not_recorded"
        ? person.gender.category !== null
        : !categories.has(person.gender.category ?? "")
    ) {
      issue(`${where} has an invalid gender record`);
    }

    checkPersonName(culture, person, persons, where);
  }

  // Birth spacing per mother: ≥ MIN_BIRTH_INTERVAL_DAYS apart, or multiples (≤ 3) on one day.
  for (const [motherId, births] of birthsByMother) {
    births.sort((a, b) => a - b);
    let sameDay = 1;
    for (let index = 1; index < births.length; index += 1) {
      const gap = (births[index] as number) - (births[index - 1] as number);
      sameDay = gap === 0 ? sameDay + 1 : 1;
      if ((gap !== 0 && gap < MIN_BIRTH_INTERVAL_DAYS) || sameDay > 3) {
        issue(`mother ${motherId}: births ${gap} days apart`);
      }
    }
  }

  return { ok: issueCount === 0, issues, issueCount };

  function checkDatasetName(
    culture: Culture,
    source: DatasetNameSource,
    form: string | null,
    usage: NameEntry["usage"],
    applicability: NameEntry["applicability"],
    year: number,
    where: string,
  ): NameEntry | undefined {
    const entry = sampler.resolve(source);
    const chain = culture.naming.datasets;
    if (entry === undefined) {
      issue(`${where}: name entry ${source.dataset}/${source.entryId} does not exist`);
      return undefined;
    }
    if (chain[source.fallbackLevel] !== source.dataset)
      issue(`${where}: fallback level does not match the culture's chain`);
    if (form !== null && entry.form !== form) issue(`${where}: name form differs from its dataset entry`);
    if (entry.usage !== usage) issue(`${where}: ${usage} name drawn from a ${entry.usage} entry`);
    if (entry.applicability !== applicability && entry.applicability !== "any")
      issue(`${where}: name applicability mismatch`);
    if (!entryInEra(entry, year)) issue(`${where}: out-of-era name ${entry.form} for year ${year}`);
    // The fallback chain was followed: no earlier dataset could have answered.
    for (let level = 0; level < source.fallbackLevel; level += 1) {
      const dataset = sampler.chain(culture)[level];
      if (dataset !== undefined && eligibleEntries(dataset, usage, applicability, year).length > 0) {
        issue(`${where}: fell back to level ${source.fallbackLevel} although level ${level} had names`);
      }
    }
    return entry;
  }

  function checkPersonName(culture: Culture, person: Person, people: Map<string, Person>, where: string) {
    const year = yearOfTick(person.birthTick);
    const [given, second, ...rest] = person.name.parts;
    const pattern = culture.naming.pattern;
    const expectedRole =
      pattern === "given_patronymic"
        ? "patronymic"
        : pattern === "given_matronymic"
          ? "matronymic"
          : pattern === "given_clan"
            ? "clan"
            : "place";
    if (
      given === undefined ||
      given.role !== "given" ||
      second === undefined ||
      second.role !== expectedRole ||
      rest.length > 0
    ) {
      issue(`${where}: name parts do not follow ${pattern}`);
      return;
    }
    if (!("dataset" in given.provenance)) issue(`${where}: given name lacks dataset provenance`);
    else checkDatasetName(culture, given.provenance, given.form, "given", person.sex, year, `${where} given name`);
    const provenance = second.provenance;
    if ("dataset" in provenance) {
      issue(`${where}: ${second.role} must record how it was derived`);
      return;
    }
    if (provenance.rule === "place") {
      const settlement = settlements.get(provenance.settlementId);
      if (provenance.settlementId !== person.settlementId || settlement?.name.parts[0]?.form !== second.form) {
        issue(`${where}: place name is not its settlement's`);
      }
    } else {
      const parentId = provenance.from === "father" ? person.fatherId : person.motherId;
      if (provenance.personId !== parentId)
        issue(`${where}: name derives from someone other than its ${provenance.from}`);
      let base: string | undefined;
      if (provenance.personId !== null) {
        const parent = people.get(provenance.personId);
        base =
          provenance.rule === "clan"
            ? parent?.name.parts.find((part) => part.role === "clan")?.form
            : parent?.name.parts[0]?.form;
      } else if (provenance.base === null) {
        issue(`${where}: an unrecorded relative's name needs a dataset base`);
      } else {
        const usage = provenance.rule === "clan" ? "clan" : "given";
        const applicability = provenance.rule === "clan" ? "any" : provenance.from === "father" ? "male" : "female";
        base = checkDatasetName(
          culture,
          provenance.base,
          null,
          usage,
          applicability,
          year,
          `${where} ${second.role} base`,
        )?.form;
      }
      const suffix = provenance.rule === "clan" ? "" : culture.naming.derivedSuffix[person.sex];
      if (base === undefined || second.form !== `${base}${suffix}`)
        issue(`${where}: ${second.role} does not match its source`);
    }
  }
}

export function assertValidPopulation(
  population: SeedPopulation,
  context: { readonly map: WorldMap; readonly pack: ContentPack },
): void {
  const report = validatePopulation(population, context);
  if (!report.ok) throw new PopulationValidationError(report);
}
