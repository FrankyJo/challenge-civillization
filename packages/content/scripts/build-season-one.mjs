#!/usr/bin/env node
// Build the season-one content pack (packages/content/src/packs/season-one.json).
//
//   node packages/content/scripts/build-season-one.mjs [--check]
//
// Everything here is authored. The five cultures and their languages are
// fictional; their naming *systems* (patronymic, matronymic, clan, place
// bynames) are common in the ancient world, but no real people, language or
// name list is reproduced. Name lists are generated from each language's
// phonology spec below with a seeded PRNG, so the output is a pure function
// of this file. The demography table is derived from a Siler mortality model
// and the Coale–Trussell natural fertility schedule (see citations).
//
// --check regenerates in memory and fails if the committed pack differs
// (run by the content tests through `buildSeasonOne`).
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonicalize } from "@civ/contracts";

export const GENERATOR = "civ-namegen 1.0.0 (packages/content/scripts/build-season-one.mjs)";

/** mulberry32: small seeded PRNG for offline authoring only (never used by the engine). */
function prng(seedText) {
  let state = Number.parseInt(createHash("sha256").update(seedText).digest("hex").slice(0, 8), 16);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const weighted = (random, items) => {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let target = random() * total;
  for (const [value, weight] of items) {
    target -= weight;
    if (target < 0) return value;
  }
  return items.at(-1)[0];
};

/**
 * Phonology specs. `syllables` = [min, max] by usage; endings constrain the
 * final syllable by applicability (a grammatical-gender marker of the
 * language, not a claim about the bearer).
 */
export const LANGUAGES = {
  velan: {
    languageId: "language.velan",
    code: "vel",
    onsets: [
      ["v", 5],
      ["l", 6],
      ["n", 5],
      ["r", 4],
      ["s", 4],
      ["m", 4],
      ["t", 3],
      ["d", 3],
      ["th", 2],
      ["", 3],
    ],
    nuclei: [
      ["a", 6],
      ["e", 5],
      ["i", 4],
      ["o", 4],
      ["ae", 1],
      ["ei", 1],
    ],
    codas: [
      ["", 10],
      ["n", 3],
      ["l", 2],
      ["r", 2],
      ["s", 1],
    ],
    endings: { female: ["a", "e", "ia", "ene"], male: ["o", "an", "ir", "el"], any: ["i", "es"] },
    syllables: { given: [2, 3], clan: [2, 3], place: [2, 4] },
    forbidden: ["aa", "ee", "ii", "oo", "thth", "nn"],
  },
  suker: {
    languageId: "language.suker",
    code: "suk",
    onsets: [
      ["s", 5],
      ["k", 6],
      ["r", 4],
      ["m", 4],
      ["n", 4],
      ["h", 3],
      ["t", 4],
      ["y", 2],
      ["", 2],
    ],
    nuclei: [
      ["a", 6],
      ["u", 6],
      ["e", 3],
      ["i", 4],
      ["o", 3],
    ],
    codas: [
      ["", 14],
      ["n", 2],
      ["k", 1],
    ],
    endings: { female: ["ri", "ya", "mi", "ne"], male: ["ru", "ko", "tan", "su"], any: ["ki", "un"] },
    syllables: { given: [2, 3], clan: [2, 3], place: [2, 3] },
    forbidden: ["yi", "uu", "kk", "nn", "hu"],
  },
  orvath: {
    languageId: "language.orvath",
    code: "orv",
    onsets: [
      ["k", 5],
      ["g", 4],
      ["r", 4],
      ["v", 4],
      ["th", 3],
      ["d", 4],
      ["br", 2],
      ["kr", 2],
      ["", 3],
    ],
    nuclei: [
      ["o", 6],
      ["a", 5],
      ["u", 4],
      ["e", 3],
      ["y", 1],
    ],
    codas: [
      ["", 4],
      ["r", 4],
      ["k", 3],
      ["th", 2],
      ["n", 3],
      ["g", 2],
      ["d", 2],
    ],
    endings: { female: ["ra", "eth", "una", "via"], male: ["ok", "ar", "oth", "un"], any: ["ek", "uv"] },
    syllables: { given: [2, 3], clan: [2, 3], place: [2, 3] },
    forbidden: ["kk", "rr", "thth", "gk", "kg", "yy", "dd", "gg"],
  },
  daeth: {
    languageId: "language.daeth",
    code: "dae",
    onsets: [
      ["d", 5],
      ["h", 4],
      ["sh", 3],
      ["z", 2],
      ["b", 4],
      ["m", 3],
      ["n", 3],
      ["l", 3],
      ["", 3],
    ],
    nuclei: [
      ["a", 6],
      ["ae", 3],
      ["e", 4],
      ["i", 3],
      ["o", 3],
      ["ai", 2],
    ],
    codas: [
      ["", 6],
      ["sh", 2],
      ["m", 2],
      ["n", 3],
      ["l", 2],
      ["z", 1],
    ],
    endings: { female: ["ai", "ish", "ela", "ma"], male: ["om", "esh", "ar", "id"], any: ["en", "o"] },
    syllables: { given: [2, 3], clan: [2, 3], place: [2, 3] },
    forbidden: ["shsh", "zz", "aeae", "aia", "aiai", "nn", "mm"],
  },
  ilun: {
    languageId: "language.ilun",
    code: "ilu",
    onsets: [
      ["l", 5],
      ["w", 3],
      ["n", 4],
      ["p", 3],
      ["t", 4],
      ["f", 3],
      ["", 5],
    ],
    nuclei: [
      ["i", 6],
      ["u", 5],
      ["a", 5],
      ["e", 3],
      ["o", 2],
    ],
    codas: [
      ["", 9],
      ["n", 3],
      ["l", 2],
      ["w", 1],
    ],
    endings: { female: ["ui", "ana", "ile", "wen"], male: ["un", "ap", "ito", "el"], any: ["i", "awa"] },
    syllables: { given: [2, 3], clan: [2, 3], place: [2, 4] },
    forbidden: ["ww", "wu", "uu", "ii", "nn", "ll"],
  },
  coastal: {
    languageId: "language.coastal_family",
    code: "cof",
    onsets: [
      ["l", 4],
      ["s", 4],
      ["m", 4],
      ["n", 4],
      ["r", 4],
      ["k", 3],
      ["t", 3],
      ["", 3],
    ],
    nuclei: [
      ["a", 6],
      ["e", 4],
      ["i", 4],
      ["o", 3],
      ["u", 3],
    ],
    codas: [
      ["", 12],
      ["n", 2],
      ["l", 1],
    ],
    endings: { female: ["a", "i", "ene"], male: ["o", "u", "an"], any: ["e", "in"] },
    syllables: { given: [2, 3], clan: [2, 3], place: [2, 3] },
    forbidden: ["aa", "ee", "ii", "oo", "uu", "nn"],
  },
  highland: {
    languageId: "language.highland_family",
    code: "hif",
    onsets: [
      ["d", 4],
      ["k", 4],
      ["r", 4],
      ["v", 3],
      ["b", 3],
      ["h", 3],
      ["", 3],
    ],
    nuclei: [
      ["a", 6],
      ["o", 5],
      ["e", 4],
      ["u", 3],
    ],
    codas: [
      ["", 6],
      ["r", 3],
      ["n", 3],
      ["k", 2],
      ["d", 2],
    ],
    endings: { female: ["ra", "ae", "una"], male: ["or", "ak", "ud"], any: ["en", "o"] },
    syllables: { given: [2, 3], clan: [2, 3], place: [2, 3] },
    forbidden: ["kk", "rr", "dd", "aeae", "nn", "oo"],
  },
  shared: {
    languageId: "language.shared",
    code: "shr",
    onsets: [
      ["m", 4],
      ["n", 4],
      ["t", 4],
      ["k", 4],
      ["l", 4],
      ["s", 3],
      ["", 3],
    ],
    nuclei: [
      ["a", 6],
      ["e", 4],
      ["i", 4],
      ["o", 4],
      ["u", 3],
    ],
    codas: [
      ["", 14],
      ["n", 2],
    ],
    endings: { female: ["a", "i"], male: ["o", "an"], any: ["e", "u"] },
    syllables: { given: [2, 3], clan: [2, 3], place: [2, 3] },
    forbidden: ["aa", "ee", "ii", "oo", "uu", "nn"],
  },
};

/** Dataset plans: counts by usage/applicability and how eras are assigned. */
const DATASETS = [
  {
    key: "velan",
    title: "Velan personal names",
    counts: { given: { female: 90, male: 90, any: 14 }, clan: {}, place: {} },
  },
  {
    key: "suker",
    title: "Suker personal names",
    counts: { given: { female: 90, male: 90, any: 14 }, clan: {}, place: { any: 30 } },
  },
  {
    key: "orvath",
    title: "Orvath personal and clan names",
    counts: { given: { female: 80, male: 80, any: 10 }, clan: { any: 50 }, place: { any: 30 } },
  },
  {
    key: "daeth",
    title: "Daeth personal and place names",
    counts: { given: { female: 80, male: 80, any: 12 }, clan: {}, place: { any: 45 } },
  },
  {
    key: "ilun",
    title: "Ilun personal and clan names",
    counts: { given: { female: 85, male: 85, any: 16 }, clan: { any: 45 }, place: { any: 30 } },
  },
  {
    key: "coastal",
    title: "Coastal family shared names",
    counts: { given: { female: 40, male: 40, any: 10 }, clan: { any: 30 }, place: { any: 40 } },
    open: true,
  },
  {
    key: "highland",
    title: "Highland family shared names",
    counts: { given: { female: 40, male: 40, any: 10 }, clan: { any: 30 }, place: { any: 40 } },
    open: true,
  },
  {
    key: "shared",
    title: "Pan-regional fallback names",
    counts: { given: { female: 30, male: 30, any: 20 }, clan: { any: 25 }, place: { any: 25 } },
    open: true,
  },
];

function makeName(random, spec, usage, applicability) {
  const [min, max] = spec.syllables[usage];
  const syllableCount = min + Math.floor(random() * (max - min + 1));
  let form = "";
  for (let index = 0; index < syllableCount - 1; index += 1) {
    form += weighted(random, spec.onsets) + weighted(random, spec.nuclei);
    if (index < syllableCount - 2) form += weighted(random, spec.codas);
  }
  const endings =
    usage === "given" ? spec.endings[applicability] : [...spec.endings.any, ...spec.endings.female.slice(0, 1)];
  form +=
    weighted(
      random,
      spec.onsets.filter(([onset]) => onset !== ""),
    ) + endings[Math.floor(random() * endings.length)];
  return form;
}

function buildDataset(plan) {
  const spec = LANGUAGES[plan.key];
  const random = prng(`civ.names.${plan.key}`);
  const seen = new Set();
  const entries = [];
  for (const usage of ["given", "clan", "place"]) {
    for (const applicability of ["female", "male", "any"]) {
      const count = plan.counts[usage][applicability] ?? 0;
      let made = 0;
      for (let attempt = 0; made < count && attempt < count * 200; attempt += 1) {
        const form = makeName(random, spec, usage, applicability);
        if (form.length < 3 || form.length > 14 || seen.has(form) || spec.forbidden.some((bad) => form.includes(bad)))
          continue;
        seen.add(form);
        // Eras: most names are in use throughout; some are archaic (only for
        // people born before the cut-off), some only become fashionable later.
        const roll = random();
        let eraFrom = null;
        let eraTo = null;
        if (!plan.open && usage === "given") {
          if (roll < 0.15) eraTo = -60 + Math.floor(random() * 45);
          else if (roll < 0.3) eraFrom = 60 + Math.floor(random() * 300);
          else if (roll < 0.6) eraTo = 400 + Math.floor(random() * 600);
        }
        const rank = made + 1;
        entries.push({
          entryId: `${spec.code}.${usage[0]}.${applicability[0]}.${String(rank).padStart(4, "0")}`,
          form,
          display: form[0].toUpperCase() + form.slice(1),
          usage,
          applicability,
          eraFrom,
          eraTo,
          weight: Math.max(1, Math.round(1000 / Math.pow(rank, 0.8))),
          uncertainty: "low",
        });
        made += 1;
      }
      if (made < count)
        throw new Error(`${plan.key}: could only make ${made}/${count} ${usage}/${applicability} names`);
    }
  }
  const specDigest = `sha256:${createHash("sha256").update(canonicalize(spec)).digest("hex")}`;
  return {
    datasetId: `names.${plan.key === "coastal" ? "coastal_family" : plan.key === "highland" ? "highland_family" : plan.key}`,
    version: "1.0.0",
    languageId: spec.languageId,
    title: plan.title,
    license: "CC0-1.0 (authored for this project)",
    provenance: {
      kind: "authored",
      generator: GENERATOR,
      specDigest,
      notes:
        "Constructed language; names generated from the phonology spec and frozen. Eras are authored fashion intervals of the fictional world, not historical attestations.",
    },
    entries,
  };
}

/**
 * Siler competing-hazards mortality μ(x) = a1·e^(−b1·x) + a2 + a3·e^(b3·x).
 * Parameters chosen to give e0 ≈ 25 years and infant mortality ≈ 0.26,
 * within the pre-modern range discussed by Frier (2000) and Bagnall & Frier
 * (1994) for Roman Egypt (Coale–Demeny Model West levels 2–4). Chosen, not
 * fitted to data.
 */
export const SILER = { a1: 0.48, b1: 1.15, a2: 0.0155, a3: 0.0004, b3: 0.085 };

export function lifeTable() {
  const { a1, b1, a2, a3, b3 } = SILER;
  const cumulative = (x) => (a1 / b1) * (1 - Math.exp(-b1 * x)) + a2 * x + (a3 / b3) * (Math.exp(b3 * x) - 1);
  const survivors = Array.from({ length: 101 }, (_, age) => Math.round(1_000_000 * Math.exp(-cumulative(age))));
  survivors[0] = 1_000_000;
  // e0 by trapezoidal person-years plus an open interval at 100.
  let personYears = 0;
  for (let age = 0; age < 100; age += 1) personYears += (survivors[age] + survivors[age + 1]) / 2;
  return { survivors, e0: personYears / 1_000_000 };
}

const CITATIONS = [
  {
    sourceId: "src_coaledemeny1983",
    citation:
      "Coale, A. J., & Demeny, P. (1983). Regional Model Life Tables and Stable Populations (2nd ed.). Academic Press.",
    usedFor:
      "Range of pre-modern mortality levels (Model West levels 2–4) that the Siler parameters are chosen within.",
  },
  {
    sourceId: "src_bagnallfrier1994",
    citation: "Bagnall, R. S., & Frier, B. W. (1994). The Demography of Roman Egypt. Cambridge University Press.",
    usedFor:
      "Plausible ancient life expectancy, household size and household composition used to check the seed report.",
  },
  {
    sourceId: "src_frier2000",
    citation:
      "Frier, B. W. (2000). Demography. In The Cambridge Ancient History, Vol. XI (2nd ed., pp. 787–816). Cambridge University Press.",
    usedFor: "Life expectancy at birth of roughly 20–30 years for the early Roman Empire.",
  },
  {
    sourceId: "src_coaletrussell1974",
    citation: "Coale, A. J., & Trussell, T. J. (1974). Model fertility schedules. Population Index, 40(2), 185–258.",
    usedFor: "Natural marital fertility schedule n(a) by five-year age group, scaled by each culture's level M.",
  },
  {
    sourceId: "src_hammellaslett1974",
    citation:
      "Hammel, E. A., & Laslett, P. (1974). Comparing household structure over time and between cultures. Comparative Studies in Society and History, 16(1), 73–109.",
    usedFor: "Household form categories (solitary, nuclear, extended/stem, multiple/joint).",
  },
];

const household = (overrides) => ({
  adultAge: 15,
  marriageAge: { female: { min: 15, peak: 18, max: 30 }, male: { min: 17, peak: 25, max: 40 } },
  everMarriedPpm: 930_000,
  formWeights: { nuclear: 520, stem: 300, joint: 150, solitary: 35, kin_care: 60 },
  residence: "patrilocal",
  fosterPpm: 250_000,
  ...overrides,
});

const CULTURES = [
  {
    cultureId: "culture.velani",
    name: "Velani",
    languageId: "language.velan",
    description: "Coastal and estuary farmers and fishers; children carry a patronymic.",
    seedSharePpm: 300_000,
    prefers: ["coast", "river", "lowland"],
    naming: {
      pattern: "given_patronymic",
      datasets: ["names.velan", "names.coastal_family", "names.shared"],
      derivedSuffix: { female: "ith", male: "an" },
      clanFrom: "father",
      uniqueAmongSiblings: true,
    },
    household: household({}),
    genders: [],
    economy: { cultivation: 700, herding: 250, fishing: 700, craft: 400, building: 300, trade: 450, healing: 150 },
    maritalFertilityPpm: 820_000,
  },
  {
    cultureId: "culture.sukeru",
    name: "Sukeru",
    languageId: "language.suker",
    description: "River-valley cultivators; descent and names follow the mother.",
    seedSharePpm: 200_000,
    prefers: ["river", "lowland"],
    naming: {
      pattern: "given_matronymic",
      datasets: ["names.suker", "names.coastal_family", "names.shared"],
      derivedSuffix: { female: "nai", male: "ko" },
      clanFrom: "mother",
      uniqueAmongSiblings: true,
    },
    household: household({
      residence: "matrilocal",
      formWeights: { nuclear: 420, stem: 360, joint: 160, solitary: 30, kin_care: 70 },
    }),
    genders: [{ category: "kahnu", sexBasis: "any", prevalencePpm: 3_000 }],
    economy: { cultivation: 900, herding: 200, fishing: 400, craft: 450, building: 350, trade: 300, healing: 250 },
    maritalFertilityPpm: 850_000,
  },
  {
    cultureId: "culture.orvathi",
    name: "Orvathi",
    languageId: "language.orvath",
    description: "Upland herders and miners organised in patrilineal clans.",
    seedSharePpm: 200_000,
    prefers: ["upland", "forest"],
    naming: {
      pattern: "given_clan",
      datasets: ["names.orvath", "names.highland_family", "names.shared"],
      derivedSuffix: { female: "eth", male: "ok" },
      clanFrom: "father",
      uniqueAmongSiblings: true,
    },
    household: household({
      marriageAge: { female: { min: 15, peak: 20, max: 32 }, male: { min: 18, peak: 26, max: 42 } },
      formWeights: { nuclear: 360, stem: 320, joint: 240, solitary: 30, kin_care: 60 },
    }),
    genders: [],
    economy: { cultivation: 350, herding: 900, fishing: 100, craft: 500, building: 500, trade: 250, healing: 150 },
    maritalFertilityPpm: 800_000,
  },
  {
    cultureId: "culture.daethi",
    name: "Daethi",
    languageId: "language.daeth",
    description: "Grassland herders and cultivators who name people after their home settlement.",
    seedSharePpm: 150_000,
    prefers: ["grassland", "lowland"],
    naming: {
      pattern: "given_place",
      datasets: ["names.daeth", "names.highland_family", "names.shared"],
      derivedSuffix: { female: "ai", male: "om" },
      clanFrom: "father",
      uniqueAmongSiblings: false,
    },
    household: household({
      residence: "either",
      formWeights: { nuclear: 560, stem: 260, joint: 130, solitary: 40, kin_care: 60 },
    }),
    genders: [],
    economy: { cultivation: 600, herding: 800, fishing: 100, craft: 350, building: 300, trade: 550, healing: 150 },
    maritalFertilityPpm: 830_000,
  },
  {
    cultureId: "culture.ilunai",
    name: "Ilunai",
    languageId: "language.ilun",
    description: "Forest-edge cultivators, foragers and woodworkers with matrilineal clans.",
    seedSharePpm: 150_000,
    prefers: ["forest", "river"],
    naming: {
      pattern: "given_clan",
      datasets: ["names.ilun", "names.coastal_family", "names.shared"],
      derivedSuffix: { female: "wen", male: "un" },
      clanFrom: "mother",
      uniqueAmongSiblings: true,
    },
    household: household({
      residence: "matrilocal",
      marriageAge: { female: { min: 15, peak: 19, max: 30 }, male: { min: 17, peak: 23, max: 38 } },
    }),
    genders: [{ category: "wenai", sexBasis: "any", prevalencePpm: 2_000 }],
    economy: { cultivation: 550, herding: 150, fishing: 350, craft: 700, building: 550, trade: 300, healing: 300 },
    maritalFertilityPpm: 800_000,
  },
];

export function buildSeasonOne() {
  const { survivors, e0 } = lifeTable();
  return {
    schemaVersion: 1,
    packId: "civ.season_one",
    version: "1.0.0",
    title: "Season one: cultures, names and demography at 1 CE",
    license: "CC0-1.0 (authored for this project; citations are references only)",
    cultures: CULTURES,
    nameDatasets: DATASETS.map(buildDataset),
    demography: {
      tableId: "demography.preindustrial_e25",
      description: `Siler mortality (${Object.entries(SILER)
        .map(([key, value]) => `${key}=${value}`)
        .join(
          ", ",
        )}) giving e0 ≈ ${e0.toFixed(1)} years; Coale–Trussell natural fertility schedule; twin rate 1.2% and sex ratio at birth 1,050. All values are chosen defaults screened for plausibility, not fitted to data; disability prevalence is an uncalibrated default.`,
      survivorsPpm: survivors,
      naturalFertilityPpm: [411_000, 460_000, 431_000, 395_000, 322_000, 167_000, 24_000],
      twinPpm: 12_000,
      sexRatioAtBirth: 1_050,
      disabilityPpm: [15_000, 40_000, 90_000, 220_000],
      citations: ["src_coaledemeny1983", "src_bagnallfrier1994", "src_frier2000", "src_coaletrussell1974"],
    },
    citations: CITATIONS,
  };
}

const target = resolve(import.meta.dirname, "..", "src", "packs", "season-one.json");
if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const text = `${JSON.stringify(buildSeasonOne(), null, 2)}\n`;
  if (process.argv.includes("--check")) {
    const current = readFileSync(target, "utf8");
    if (current !== text) {
      console.error("season-one.json is out of date with build-season-one.mjs; rerun without --check");
      process.exit(1);
    }
    console.log("season-one.json is up to date");
  } else {
    writeFileSync(target, text);
    console.log(`wrote ${target} (e0 = ${lifeTable().e0.toFixed(2)})`);
  }
}
