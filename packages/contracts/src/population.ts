import { z } from "zod";
import { idPattern, sourceIdSchema, worldIdSchema } from "./ids.js";
import { regionIdSchema } from "./geography.js";
import { digestSchema, SEMVER_PATTERN } from "./versions.js";

/**
 * Cultures, name datasets, demographic tables and the seed population
 * (docs/POPULATION.md).
 *
 * Content (cultures, names, demography) is versioned data: a pack is
 * immutable once a world used it, and its canonical digest is the world's
 * `contentVersion`. People, households and settlements are world state.
 */
export const CONTENT_PACK_SCHEMA_VERSION = 1 as const;
export const POPULATION_SCHEMA_VERSION = 1 as const;

const id = (kind: Parameters<typeof idPattern>[0], brand: string) =>
  z.string().regex(idPattern(kind), `must be a ${kind} ID`).brand(brand);
export const personIdSchema = id("person", "PersonId");
export const householdIdSchema = id("household", "HouseholdId");
export const settlementIdSchema = id("settlement", "SettlementId");
export type PersonId = z.output<typeof personIdSchema>;
export type HouseholdId = z.output<typeof householdIdSchema>;
export type SettlementId = z.output<typeof settlementIdSchema>;

const contentKey = (prefix: string) =>
  z
    .string()
    .regex(new RegExp(`^${prefix}\\.[a-z][a-z0-9_]{1,31}$`), `must be "${prefix}." followed by a snake_case key`);
export const cultureIdSchema = contentKey("culture");
export const languageIdSchema = contentKey("language");
export const nameDatasetIdSchema = contentKey("names");
export const demographyTableIdSchema = contentKey("demography");

const int = (min: number, max: number) => z.number().int().min(min).max(max);
const ppm = int(0, 1_000_000);
/** Astronomical year (0 = 1 BCE, −99 = 100 BCE); null = open interval. */
const eraYear = int(-5_000, 9_999).nullable();

export const SEXES = Object.freeze(["female", "male"] as const);
export const sexSchema = z.enum(SEXES);
export type Sex = z.output<typeof sexSchema>;

export const SKILLS = Object.freeze([
  "cultivation",
  "herding",
  "fishing",
  "craft",
  "building",
  "trade",
  "healing",
] as const);
export type Skill = (typeof SKILLS)[number];

export const NAMING_PATTERNS = Object.freeze([
  "given_patronymic",
  "given_matronymic",
  "given_clan",
  "given_place",
] as const);
export const HOUSEHOLD_FORMS = Object.freeze(["nuclear", "stem", "joint", "solitary", "kin_care"] as const);
export type HouseholdForm = (typeof HOUSEHOLD_FORMS)[number];
export const ENVIRONMENTS = Object.freeze(["coast", "river", "lowland", "upland", "grassland", "forest"] as const);

/** A cited work behind a content parameter (bibliographic; no text reproduced). */
export const contentCitationSchema = z.strictObject({
  sourceId: sourceIdSchema,
  citation: z.string().min(10).max(500),
  usedFor: z.string().min(5).max(500),
});

const ageRange = z
  .strictObject({ min: int(10, 60), peak: int(10, 60), max: int(10, 70) })
  .refine((range) => range.min <= range.peak && range.peak <= range.max, { message: "must satisfy min ≤ peak ≤ max" });

const genderCategory = z.strictObject({
  /** Category label recorded by this culture. */
  category: z.string().regex(/^[a-z][a-z_]{1,31}$/),
  /** The sex this category is usually recorded for, or "any". */
  sexBasis: z.enum(["female", "male", "any"]),
  /** Share of people of that basis recorded in this category instead of the default. */
  prevalencePpm: ppm,
});

export const cultureSchema = z
  .strictObject({
    cultureId: cultureIdSchema,
    /** Display name (constructed endonym); fictional, not a real people. */
    name: z.string().min(2).max(40),
    languageId: languageIdSchema,
    description: z.string().min(10).max(1_000),
    /** Share of the seed population (all cultures sum to 1,000,000). */
    seedSharePpm: int(1, 1_000_000),
    /** Environments its homeland is drawn towards, strongest first. */
    prefers: z.array(z.enum(ENVIRONMENTS)).min(1).max(4),
    naming: z.strictObject({
      pattern: z.enum(NAMING_PATTERNS),
      /** Datasets searched in order (the fallback chain); the last must cover every usage. */
      datasets: z.array(nameDatasetIdSchema).min(1).max(5),
      /** Suffixes for derived patronymic/matronymic names, by the bearer's sex. */
      derivedSuffix: z.strictObject({
        female: z.string().regex(/^[a-z]{1,8}$/),
        male: z.string().regex(/^[a-z]{1,8}$/),
      }),
      /** Clan inheritance for `given_clan`: from the father or the mother. */
      clanFrom: z.enum(["father", "mother"]),
      /** Given names must differ between living siblings. */
      uniqueAmongSiblings: z.boolean(),
    }),
    household: z.strictObject({
      /** Age from which a person is an adult (no guardian needed). */
      adultAge: int(12, 21),
      marriageAge: z.strictObject({ female: ageRange, male: ageRange }),
      /** Ever-married share by the end of the marriage window. */
      everMarriedPpm: ppm,
      /**
       * Relative weights of household forms for new households. `kin_care`
       * covers orphan care: a grandparent raising grandchildren or, with
       * `fosterPpm`, a fosterling placed in a non-kin couple household.
       */
      formWeights: z.strictObject(
        Object.fromEntries(HOUSEHOLD_FORMS.map((form) => [form, int(0, 1_000)])) as Record<
          HouseholdForm,
          ReturnType<typeof int>
        >,
      ),
      /** Which spouse's widowed parent joins a stem household. */
      residence: z.enum(["patrilocal", "matrilocal", "either"]),
      /** Chance that a child whose parents both died is fostered by a non-kin household. */
      fosterPpm: ppm,
    }),
    genders: z.array(genderCategory).max(4),
    /** Relative emphasis on skills (not tied to sex or gender). */
    economy: z.strictObject(
      Object.fromEntries(SKILLS.map((skill) => [skill, int(0, 1_000)])) as Record<Skill, ReturnType<typeof int>>,
    ),
    /** Marital fertility level M (Coale–Trussell), ppm of the natural schedule. */
    maritalFertilityPpm: int(100_000, 1_200_000),
  })
  .refine(
    (culture) =>
      culture.household.marriageAge.female.min >= culture.household.adultAge &&
      culture.household.marriageAge.male.min >= culture.household.adultAge,
    { path: ["household", "marriageAge"], message: "nobody may marry before the culture's adult age" },
  );

export type Culture = z.output<typeof cultureSchema>;

export const NAME_USAGES = Object.freeze(["given", "clan", "place"] as const);
export type NameUsage = (typeof NAME_USAGES)[number];
export const NAME_APPLICABILITY = Object.freeze(["female", "male", "any"] as const);

export const nameEntrySchema = z
  .strictObject({
    entryId: z.string().regex(/^[a-z]{2,6}\.[a-z]\.[a-z]\.\d{4}$/, "must be <lang>.<usage>.<applicability>.<nnnn>"),
    /** Normalised form: lowercase romanisation (the original script of these constructed languages). */
    form: z.string().regex(/^[a-z]{2,16}$/),
    /** Display form (capitalised); transliteration layers are separate. */
    display: z.string().regex(/^[A-Z][a-z]{1,15}$/),
    usage: z.enum(NAME_USAGES),
    applicability: z.enum(NAME_APPLICABILITY),
    /** Era of use as astronomical years, inclusive; null = open. */
    eraFrom: eraYear,
    eraTo: eraYear,
    /** Relative frequency within its usage and applicability. */
    weight: int(1, 1_000),
    uncertainty: z.enum(["low", "medium", "high"]),
  })
  .refine((entry) => entry.eraFrom === null || entry.eraTo === null || entry.eraFrom <= entry.eraTo, {
    message: "eraFrom must not follow eraTo",
  })
  .refine((entry) => entry.display.toLowerCase() === entry.form, { message: "display must be the capitalised form" });
export type NameEntry = z.output<typeof nameEntrySchema>;

export const nameDatasetSchema = z.strictObject({
  datasetId: nameDatasetIdSchema,
  version: z.string().regex(SEMVER_PATTERN),
  languageId: languageIdSchema,
  title: z.string().min(3).max(200),
  license: z.string().min(3).max(200),
  /** Constructed names: the generator, its version and the digest of its phonology spec. */
  provenance: z.strictObject({
    kind: z.literal("authored"),
    generator: z.string().min(3).max(120),
    specDigest: digestSchema,
    notes: z.string().min(3).max(1_000),
  }),
  entries: z.array(nameEntrySchema).min(1).max(5_000),
});
export type NameDataset = z.output<typeof nameDatasetSchema>;

export const demographyTableSchema = z
  .strictObject({
    tableId: demographyTableIdSchema,
    description: z.string().min(10).max(1_000),
    /** Survivors to exact age x per 1,000,000 births, x = 0…100; l(100) is the open interval start. */
    survivorsPpm: z.array(ppm).length(101),
    /** Natural marital fertility n(a) per five-year age group 15–19 … 45–49, births per woman-year in ppm. */
    naturalFertilityPpm: z.array(ppm).length(7),
    /** Twin deliveries per 1,000,000 deliveries. */
    twinPpm: ppm,
    /** Male births per 1,000 female births. */
    sexRatioAtBirth: int(900, 1_200),
    /** Annual chance (ppm) that a person of an age band lives with a disability, bands 0–14, 15–39, 40–59, 60+. */
    disabilityPpm: z.array(ppm).length(4),
    citations: z.array(sourceIdSchema).min(1),
  })
  .refine((table) => table.survivorsPpm[0] === 1_000_000, { path: ["survivorsPpm"], message: "l(0) must be 1,000,000" })
  .refine(
    (table) => table.survivorsPpm.every((value, age) => age === 0 || value <= (table.survivorsPpm[age - 1] ?? 0)),
    {
      path: ["survivorsPpm"],
      message: "survivors must not increase with age",
    },
  );
export type DemographyTable = z.output<typeof demographyTableSchema>;

export const contentPackSchema = z.strictObject({
  schemaVersion: z.literal(CONTENT_PACK_SCHEMA_VERSION),
  packId: z.string().regex(/^[a-z][a-z0-9_.]{2,63}$/),
  version: z.string().regex(SEMVER_PATTERN),
  title: z.string().min(3).max(200),
  license: z.string().min(3).max(200),
  cultures: z.array(cultureSchema).min(1).max(32),
  nameDatasets: z.array(nameDatasetSchema).min(1).max(64),
  demography: demographyTableSchema,
  citations: z.array(contentCitationSchema).max(200),
});
export type ContentPack = z.output<typeof contentPackSchema>;

// ---------------------------------------------------------------- population

/** A name drawn from a dataset entry. */
export const datasetNameSourceSchema = z.strictObject({
  dataset: nameDatasetIdSchema,
  version: z.string().regex(SEMVER_PATTERN),
  entryId: z.string().min(1).max(40),
  /** Position in the culture's dataset chain; 0 = primary dataset. */
  fallbackLevel: int(0, 4),
});
export type DatasetNameSource = z.output<typeof datasetNameSourceSchema>;

/**
 * Where a name part comes from: a dataset entry, a relative's name, or the
 * home settlement. When the relative has no record (died before 1 CE), the
 * name used is sampled and its dataset entry kept in `base`.
 */
export const nameProvenanceSchema = z.union([
  datasetNameSourceSchema,
  z.strictObject({
    rule: z.enum(["patronymic", "matronymic", "clan"]),
    from: z.enum(["father", "mother"]),
    personId: personIdSchema.nullable(),
    base: datasetNameSourceSchema.nullable(),
  }),
  z.strictObject({ rule: z.literal("place"), settlementId: settlementIdSchema }),
]);
export type NameProvenance = z.output<typeof nameProvenanceSchema>;

export const NAME_PART_ROLES = Object.freeze(["given", "patronymic", "matronymic", "clan", "place"] as const);
export const namePartSchema = z.strictObject({
  role: z.enum(NAME_PART_ROLES),
  /** Normalised form of this part. */
  form: z.string().regex(/^[a-z]{2,32}$/),
  provenance: nameProvenanceSchema,
});
export const personNameSchema = z.strictObject({
  parts: z.array(namePartSchema).min(1).max(4),
  display: z.string().min(2).max(120),
});
export type PersonName = z.output<typeof personNameSchema>;

export const GUARDIAN_KINDS = Object.freeze(["parent", "kin", "foster"] as const);
export const KIN_RELATIONS = Object.freeze(["grandparent", "sibling", "aunt_uncle", "step_parent"] as const);
export const HOUSEHOLD_ROLES = Object.freeze([
  "head",
  "spouse",
  "child",
  "parent",
  "sibling",
  "grandchild",
  "fosterling",
] as const);
export const DISABILITIES = Object.freeze(["none", "mobility", "sensory", "cognitive"] as const);

export const personSchema = z.strictObject({
  personId: personIdSchema,
  /** Tick of birth (0 = first day of the season's first year); negative = before the season. */
  birthTick: z
    .number()
    .int()
    .min(-120 * 365)
    .max(Number.MAX_SAFE_INTEGER),
  sex: sexSchema,
  /** Gender as the person's culture records it; `not_recorded` keeps unknowns distinct. */
  gender: z.strictObject({
    category: z
      .string()
      .regex(/^[a-z][a-z_]{1,31}$/)
      .nullable(),
    status: z.enum(["recorded", "not_recorded"]),
  }),
  cultureId: cultureIdSchema,
  householdId: householdIdSchema,
  settlementId: settlementIdSchema,
  /** Map cell of residence (the settlement's cell). */
  cell: z.number().int().nonnegative(),
  /** Living parent's record; null = died before 1 CE. */
  motherId: personIdSchema.nullable(),
  fatherId: personIdSchema.nullable(),
  partnerId: personIdSchema.nullable(),
  maritalStatus: z.enum(["never_married", "married", "widowed"]),
  /** Required for every dependent (younger than the culture's adult age); null for adults. */
  guardian: z
    .strictObject({
      kind: z.enum(GUARDIAN_KINDS),
      guardianId: personIdSchema,
      relation: z.enum(["mother", "father", ...KIN_RELATIONS, "foster_parent"]),
    })
    .nullable(),
  health: z.strictObject({
    /** Baseline frailty: relative mortality risk multiplier in ppm (1,000,000 = average). */
    frailtyPpm: int(100_000, 5_000_000),
    disability: z.enum(DISABILITIES),
  }),
  capabilities: z.strictObject({
    /** Share of full adult work capacity (age and health). */
    workCapacityPpm: ppm,
    skills: z.strictObject(
      Object.fromEntries(SKILLS.map((skill) => [skill, int(0, 100)])) as Record<Skill, ReturnType<typeof int>>,
    ),
  }),
  name: personNameSchema,
});
export type Person = z.output<typeof personSchema>;

export const householdSchema = z.strictObject({
  householdId: householdIdSchema,
  settlementId: settlementIdSchema,
  form: z.enum(HOUSEHOLD_FORMS),
  headId: personIdSchema,
  members: z
    .array(z.strictObject({ personId: personIdSchema, role: z.enum(HOUSEHOLD_ROLES) }))
    .min(1)
    .max(40),
});
export type Household = z.output<typeof householdSchema>;

export const settlementSchema = z.strictObject({
  settlementId: settlementIdSchema,
  cell: z.number().int().nonnegative(),
  regionId: regionIdSchema,
  cultureId: cultureIdSchema,
  name: personNameSchema,
});
export type Settlement = z.output<typeof settlementSchema>;

export const populationParamsSchema = z.strictObject({
  /** Exact number of living people to create. */
  size: int(1, 1_000_000),
  settlementCount: int(1, 10_000),
  /** Minimum grid distance between settlements. */
  settlementSpacing: int(1, 20),
});
export type PopulationParams = z.output<typeof populationParamsSchema>;

/** The seed population: the world's initial living people and their households and settlements. */
export const seedPopulationSchema = z.strictObject({
  schemaVersion: z.literal(POPULATION_SCHEMA_VERSION),
  worldId: worldIdSchema,
  contentVersion: digestSchema,
  mapHash: digestSchema,
  params: populationParamsSchema,
  /** Culture of each map region (index aligned with the map's regions). */
  regionCultures: z.array(cultureIdSchema),
  settlements: z.array(settlementSchema).min(1),
  households: z.array(householdSchema).min(1),
  persons: z.array(personSchema).min(1),
});
export type SeedPopulation = z.output<typeof seedPopulationSchema>;

export const WORLD_DATA_SCHEMA_VERSION = 1 as const;

/**
 * The simulation-owned `data` of a world's state (season one, Phase 05).
 * The seed population is an immutable launch record stored beside the world
 * (`civ.world_populations`); the state names it by hash so replay and
 * checkpoints bind to exactly that population. Population is never a counter
 * here: it is the set of living person records.
 */
export const worldDataSchema = z.strictObject({
  schemaVersion: z.literal(WORLD_DATA_SCHEMA_VERSION),
  seedPopulationHash: digestSchema,
});
export type WorldData = z.output<typeof worldDataSchema>;
