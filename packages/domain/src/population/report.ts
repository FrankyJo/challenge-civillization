import { type SeedPopulation } from "@civ/contracts";
import { ageInYears } from "./time.js";

/**
 * Distribution report of a seed population (docs/POPULATION.md § Report).
 * Integer statistics only; shares are ppm, means are in tenths.
 */
export interface PlausibilityCheck {
  readonly check: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly ok: boolean;
  /** Why this range is plausible. */
  readonly basis: string;
}

export interface PopulationReport {
  readonly living: number;
  readonly bySex: { readonly female: number; readonly male: number };
  /** Five-year bands 0–4 … 75–79 and 80+. */
  readonly ageBands: readonly { readonly band: string; readonly female: number; readonly male: number }[];
  readonly meanAgeTenths: number;
  readonly under15Ppm: number;
  readonly over65Ppm: number;
  readonly sexRatioPer1000Females: number;
  readonly households: {
    readonly count: number;
    readonly meanSizeTenths: number;
    readonly sizeHistogram: Readonly<Record<string, number>>;
    readonly forms: Readonly<Record<string, number>>;
  };
  readonly everMarriedWomenPpm: readonly { readonly band: string; readonly ppm: number }[];
  readonly meanMotherAgeAtBirthTenths: number;
  readonly dependents: {
    readonly count: number;
    readonly guardians: Readonly<Record<string, number>>;
    readonly withoutParentPpm: number;
  };
  readonly cultures: Readonly<Record<string, number>>;
  readonly settlements: { readonly count: number; readonly min: number; readonly median: number; readonly max: number };
  readonly gender: Readonly<Record<string, number>>;
  readonly disabilities: Readonly<Record<string, number>>;
  readonly names: {
    readonly fallbackLevels: Readonly<Record<string, number>>;
    readonly distinctGivenByCulture: Readonly<Record<string, number>>;
    /** Share of people bearing their culture's most common given name. */
    readonly topGivenSharePpm: number;
  };
  readonly plausibility: readonly PlausibilityCheck[];
}

const count = (record: Record<string, number>, key: string) => {
  record[key] = (record[key] ?? 0) + 1;
};
const ppm = (part: number, whole: number) => (whole === 0 ? 0 : Math.floor((part * 1_000_000) / whole));

export function populationReport(population: SeedPopulation): PopulationReport {
  const persons = population.persons;
  const ages = new Map(persons.map((person) => [person.personId as string, ageInYears(person.birthTick, 0)]));
  const age = (id: string) => ages.get(id) ?? 0;
  const bands = Array.from({ length: 17 }, (_, index) => ({
    band: index === 16 ? "80+" : `${index * 5}-${index * 5 + 4}`,
    female: 0,
    male: 0,
  }));
  let ageTotal = 0;
  let under15 = 0;
  let over65 = 0;
  for (const person of persons) {
    const years = age(person.personId);
    ageTotal += years;
    if (years < 15) under15 += 1;
    if (years >= 65) over65 += 1;
    const band = bands[Math.min(16, Math.floor(years / 5))];
    if (band !== undefined) band[person.sex] += 1;
  }
  const female = persons.filter((person) => person.sex === "female").length;
  const male = persons.length - female;

  const sizeHistogram: Record<string, number> = {};
  const forms: Record<string, number> = {};
  for (const household of population.households) {
    count(sizeHistogram, String(Math.min(household.members.length, 10)));
    count(forms, household.form);
  }

  const married = Array.from({ length: 7 }, (_, index) => ({
    band: `${15 + index * 5}-${19 + index * 5}`,
    women: 0,
    ever: 0,
  }));
  for (const person of persons) {
    const years = age(person.personId);
    if (person.sex !== "female" || years < 15 || years >= 50) continue;
    const entry = married[Math.floor((years - 15) / 5)];
    if (entry === undefined) continue;
    entry.women += 1;
    if (person.maritalStatus !== "never_married") entry.ever += 1;
  }

  const byId = new Map(persons.map((person) => [person.personId as string, person]));
  let motherAgeSum = 0;
  let motherAgeCount = 0;
  for (const person of persons) {
    const mother = person.motherId === null ? undefined : byId.get(person.motherId);
    if (mother === undefined) continue;
    motherAgeSum += person.birthTick - mother.birthTick;
    motherAgeCount += 1;
  }

  const guardians: Record<string, number> = {};
  let dependents = 0;
  let withoutParent = 0;
  for (const person of persons) {
    if (person.guardian === null) continue;
    dependents += 1;
    count(guardians, person.guardian.kind);
    if (person.guardian.kind !== "parent") withoutParent += 1;
  }

  const cultures: Record<string, number> = {};
  const gender: Record<string, number> = {};
  const disabilities: Record<string, number> = {};
  const fallbackLevels: Record<string, number> = {};
  const givenByCulture = new Map<string, Map<string, number>>();
  for (const person of persons) {
    count(cultures, person.cultureId);
    count(gender, person.gender.status === "not_recorded" ? "not_recorded" : (person.gender.category ?? "unknown"));
    count(disabilities, person.health.disability);
    for (const part of person.name.parts) {
      const source =
        "dataset" in part.provenance ? part.provenance : "base" in part.provenance ? part.provenance.base : null;
      if (source !== null) count(fallbackLevels, `level${source.fallbackLevel}`);
    }
    const given = person.name.parts[0]?.form ?? "";
    const names = givenByCulture.get(person.cultureId) ?? new Map<string, number>();
    names.set(given, (names.get(given) ?? 0) + 1);
    givenByCulture.set(person.cultureId, names);
  }
  let topGiven = 0;
  for (const names of givenByCulture.values()) topGiven += Math.max(0, ...names.values());

  const sizes = population.settlements
    .map((settlement) => persons.filter((person) => person.settlementId === settlement.settlementId).length)
    .sort((a, b) => a - b);

  const report = {
    living: persons.length,
    bySex: { female, male },
    ageBands: bands,
    meanAgeTenths: Math.floor((ageTotal * 10) / Math.max(1, persons.length)),
    under15Ppm: ppm(under15, persons.length),
    over65Ppm: ppm(over65, persons.length),
    sexRatioPer1000Females: female === 0 ? 0 : Math.floor((male * 1_000) / female),
    households: {
      count: population.households.length,
      meanSizeTenths: Math.floor((persons.length * 10) / Math.max(1, population.households.length)),
      sizeHistogram,
      forms,
    },
    everMarriedWomenPpm: married.map((entry) => ({ band: entry.band, ppm: ppm(entry.ever, entry.women) })),
    meanMotherAgeAtBirthTenths: motherAgeCount === 0 ? 0 : Math.floor((motherAgeSum * 10) / (motherAgeCount * 365)),
    dependents: { count: dependents, guardians, withoutParentPpm: ppm(withoutParent, dependents) },
    cultures,
    settlements: {
      count: sizes.length,
      min: sizes[0] ?? 0,
      median: sizes[Math.floor(sizes.length / 2)] ?? 0,
      max: sizes.at(-1) ?? 0,
    },
    gender,
    disabilities,
    names: {
      fallbackLevels,
      distinctGivenByCulture: Object.fromEntries([...givenByCulture].map(([culture, names]) => [culture, names.size])),
      topGivenSharePpm: ppm(topGiven, persons.length),
    },
  };
  return { ...report, plausibility: plausibilityChecks(report) };
}

type ReportBody = Omit<PopulationReport, "plausibility">;

/**
 * Ranges a pre-industrial population at e0 ≈ 25 should fall in. They are
 * broad screening bounds for defects, not calibration targets.
 */
export function plausibilityChecks(report: ReportBody): PlausibilityCheck[] {
  const check = (name: string, value: number, min: number, max: number, basis: string): PlausibilityCheck => ({
    check: name,
    value,
    min,
    max,
    ok: value >= min && value <= max,
    basis,
  });
  const women20to24 = report.everMarriedWomenPpm[1]?.ppm ?? 0;
  return [
    check(
      "under-15 share (ppm)",
      report.under15Ppm,
      280_000,
      450_000,
      "Stationary/near-stationary populations with e0 20–30 have roughly 30–40% under 15 (Coale–Demeny Model West levels 2–4).",
    ),
    check(
      "65+ share (ppm)",
      report.over65Ppm,
      5_000,
      80_000,
      "At e0 ≈ 25 few survive to 65; model populations give about 2–6%.",
    ),
    check(
      "sex ratio (males per 1,000 females)",
      report.sexRatioPer1000Females,
      930,
      1_070,
      "Sex ratio at birth ≈ 1,050 with similar male and female mortality.",
    ),
    check(
      "mean age (tenths of years)",
      report.meanAgeTenths,
      200,
      320,
      "Mean age of a population with e0 ≈ 25 is in the twenties.",
    ),
    check(
      "mean household size (tenths)",
      report.households.meanSizeTenths,
      30,
      60,
      "Pre-industrial household studies report means of roughly 3–6 persons (Hammel & Laslett 1974; Bagnall & Frier 1994).",
    ),
    check(
      "women 20–24 ever married (ppm)",
      women20to24,
      400_000,
      980_000,
      "Early, near-universal female marriage in the configured cultures (peak age 18–20).",
    ),
    check(
      "mean mother age at birth (tenths)",
      report.meanMotherAgeAtBirthTenths,
      220,
      340,
      "Natural fertility from about age 15–49 gives mean maternal ages around 26–30.",
    ),
    check(
      "dependents without a parent guardian (ppm)",
      report.dependents.withoutParentPpm,
      10_000,
      250_000,
      "High adult mortality orphans a substantial minority of children.",
    ),
    check(
      "smallest settlement (people)",
      report.settlements.min,
      10,
      100_000,
      "Every settlement is a viable community.",
    ),
  ];
}
