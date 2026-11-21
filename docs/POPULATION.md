# Population specification: cultures, names and the seed

Executable source:

- **Content:**
  - `packages/content/scripts/build-season-one.mjs` (authoring generator);
  - `packages/content/src/packs/season-one.json` (the generated, frozen pack);
  - `packages/content/src/{index,validate}.ts`.
- **Domain:** `packages/domain/src/population/`:
  - `synthesize.ts`;
  - `households.ts`;
  - `homeland.ts`;
  - `names.ts`;
  - `validate.ts`;
  - `report.ts`.
- **Contracts:** `packages/contracts/src/population.ts`, with the contracts `content-pack`, `seed-population` and `world-data`.
- **Storage and launch:**
  - `packages/db/src/populations.ts` and `packages/db/migrations/0005_world_populations.*.sql`;
  - `apps/simulation/src/launch.ts`.

Decision record: `docs/adr/0007-seed-population-and-constructed-cultures.md`.

## Content pack `civ.season_one@1.0.0`

The whole pack is authored for this project and licensed CC0-1.0.
- `scripts/build-season-one.mjs` generates it, and a test fails if the committed JSON differs from the script's output.
- Its canonical digest is the world's `contentVersion` (`contentVersionOf`). Any change to a culture, name or table gives a new content version.

### Cultures

There are five **fictional** cultures, each with a constructed language. Their naming *systems* are common in the ancient world:
- patronymics and matronymics;
- patrilineal and matrilineal clan names;
- place bynames.

No real people, language, ethnonym or name list is reproduced. Culture descriptions state economy and naming only; they carry no claims about character, appearance or behaviour.

| Culture | Language | Seed share | Homeland preference | Naming | Notes |
|---|---|---:|---|---|---|
| Velani | Velan | 30% | coast, river, lowland | given + patronymic (`-an` / `-ith`) | fishing and farming |
| Sukeru | Suker | 20% | river, lowland | given + matronymic (`-ko` / `-nai`) | matrilocal; records a third gender category `kahnu` (0.3% of adults) |
| Orvathi | Orvath | 20% | upland, forest | given + patrilineal clan | herding; more joint households |
| Daethi | Daeth | 15% | grassland, lowland | given + home-settlement name | no sibling-uniqueness rule |
| Ilunai | Ilun | 15% | forest, river | given + matrilineal clan | matrilocal; third category `wenai` (0.2%) |

Each culture's parameters live in data:
- **Adulthood:** age 15. Nobody marries before adulthood; the contract enforces this.
- **Marriage ages:** a triangular `min/peak/max` distribution for each sex.
- **Marriage:** the ever-married share.
- **Households:**
  - household form weights;
  - residence rule (which side's parents a stem household keeps);
  - the share of orphans fostered outside kin.
- **Gender:** recorded gender categories.
- **Economy:** skill emphasis, never tied to sex or gender.
- **Fertility:** marital fertility level *M*.

### Name datasets and the fallback chain

There are eight datasets with 1,606 entries.
- **Per language:** one dataset for each of the five languages.
- **Family:** one each for the coastal and highland families.
- **Shared:** one pan-regional `names.shared`.

Every entry records:
- the normalised form (lowercase romanisation, which is the original script of these languages) and its display form;
- usage (`given`, `clan`, `place`) and applicability (`female`, `male`, `any`);
- its era as astronomical years (null means open);
- a frequency weight (Zipf-like) and an uncertainty.

Each dataset records its generator, a digest of its phonology spec, and its licence. Eras are authored fashion intervals of the fictional world:
- most names are always in use;
- about 15% are archaic, only for people born before about 60–15 BCE;
- about 15% become fashionable from 60–360 CE, so none can appear in the 1 CE seed.

Transliteration is a separate future display layer; the original form is kept.

**Sampling** (`NameSampler.sample`) is a deterministic weighted draw from a named PRNG stream:
1. Walk the culture's `naming.datasets` in order. The first dataset with an eligible entry is used, and its position is recorded as `fallbackLevel`. An entry is eligible when it has the right usage, matches the applicability or is `any`, and is in era for the birth year.
2. Siblings avoid each other's given names (`uniqueAmongSiblings`), but avoidance never causes a fallback.
3. Content validation requires the **last** dataset of every chain to have an open-era entry for every usage and applicability, so sampling cannot fail. Example: Velan has no place names, so Velani settlements are named from `names.coastal_family` at fallback level 1.

**Name parts** depend on the culture's pattern:

| Pattern | Name |
|---|---|
| Patronymic or matronymic | Given name, plus the parent's given name with the bearer's suffix. |
| Clan | Given name, plus the clan inherited from the father or mother. |
| Place | Given name, plus the home settlement's name. |

**Provenance** is recorded for every part:
- A dataset part records `{ dataset, version, entryId, fallbackLevel }`.
- A derived part records the relative's person ID. If that relative died before 1 CE, it records the sampled base entry instead. Such a base is shared by the lineage, so it must be in era for every member's birth year.
- A place part records its settlement.

### Demography table `demography.preindustrial_e25`

| Component | Specification |
|---|---|
| **Mortality** | Siler competing hazards μ(x) = a₁e^(−b₁x) + a₂ + a₃e^(b₃x), with a₁ = 0.48, b₁ = 1.15, a₂ = 0.0155, a₃ = 0.0004, b₃ = 0.085. This gives **e₀ ≈ 24.7 years** and ₁q₀ ≈ 0.26. Survivors l(x) are stored in ppm for ages 0–100. |
| **Fertility** | Coale–Trussell natural marital fertility n(a) for 15–19 … 45–49: 0.411, 0.460, 0.431, 0.395, 0.322, 0.167, 0.024, scaled by each culture's *M* (0.80–0.85). |
| **Births** | Twins 1.2% of deliveries; sex ratio at birth 1,050 males per 1,000 females. |
| **Disability** | Prevalence by age band (0–14, 15–39, 40–59, 60+): 1.5%, 4%, 9%, 22%. |

The Siler parameters were **chosen** to fall within the pre-modern range that the cited works discuss (Coale–Demeny Model West levels 2–4; e₀ of roughly 20–30 for the early Roman Empire). They are **not fitted** to a dataset. Disability prevalence, frailty spread and the skill model are uncalibrated defaults. Phase 08 (health) calibrates them.

Citations are bibliographic references only; no text is reproduced:
- Coale & Demeny (1983);
- Bagnall & Frier (1994);
- Frier (2000);
- Coale & Trussell (1974);
- Hammel & Laslett (1974).

## Synthesis (`civ-popgen` 1.0.0)

The inputs are the world ID and seed, the world map, the content pack and its version, and the params. The defaults are 10,000 people, 60 settlements and a spacing of 3. All randomness comes from the streams `["population", <step>, …]` of the world seed. All arithmetic is integer.

1. **Homelands.**
   - Each culture's seed region best matches its preferred environments. Preferences are weighted 4/3/2/1 over the region's shares of coast, river, lowland, upland, grassland and forest cells.
   - Cultures then grow in turn over region adjacency towards region counts proportional to their shares.
   - Unreached regions (islands) join the culture whose seed region is nearest.
2. **Settlements.**
   - Habitable land cells are scored by arable potential, river (+600), coast (+300), flood and drought. High mountains and glaciers are uninhabitable.
   - The settlement count is allocated by share. Each culture takes its best cells at least `settlementSpacing` steps from every other settlement; the spacing relaxes only when room runs out.
   - Cultures with no habitable land (possible only on tiny maps) are absent from the seed, and their share goes to the others.
   - Settlement sizes are allocated exactly by Zipf rank within each culture.
3. **Households.** These fill each settlement exactly. The form is drawn by the culture's weights:
   - **Nuclear:** a marriage reconstructed backwards from today.
     - Marriage ages come from the culture.
     - The current age is drawn from the stationary distribution, ∝ l(x).
     - Each spouse survives since the marriage with probability l(now)/l(marriage); deaths are timed by d(x).
     - Births follow natural fertility × *M* while both spouses lived, at least 300 days apart (with a postpartum halving within a year). Twins share a day.
     - Children survive to today with probability l(age).
     - Married children leave and enter the settlement's **pool**, which supplies spouses of later households first. This links adults to their parents' records across households.
   - **Stem:** a nuclear household plus the head's surviving parent or parents, with plausible ages at the head's birth. A head who came from the pool already has recorded parents elsewhere, so the household stays nuclear.
   - **Joint:** a nuclear household plus unmarried adult siblings of the head, at least 300 days apart.
   - **Solitary:** one adult, never married or widowed.
   - **Kin care** (the `kin_care` weight covers all orphan care): a widowed grandparent raising orphaned grandchildren. With the culture's `fosterPpm`, the orphan is instead a fosterling in a non-kin couple household, which is labelled nuclear.
   - **Trimming to fit.** When a household is larger than the settlement's remaining places, members nobody depends on are removed, youngest first. If even the core does not fit, a solitary household is built instead. The count is therefore exact.
4. **People.**
   - IDs are derived from `(world, settlement, household, member)`.
   - **Gender:** recorded as `woman`, `man` or a culture category. It is `not_recorded` for infants under 1. A culture's extra categories are assigned to adults by one draw against their cumulative prevalence. This is a **modelling placeholder**: the categories show that the record model is open, not a model of how gender is lived or assigned.
   - **Guardianship:** every dependent (under the culture's adult age) has a guardianship state. The guardian is the mother, else the father, else the grandparent (kin), else the household head (foster).
   - **Health:** frailty (relative risk, ppm) and a disability drawn by age band.
   - **Capabilities:**
     - work capacity by age and disability;
     - seven skills from culture emphasis × environment (fishing needs coast or river) × experience × individual aptitude.
5. **Validation.** The output is audited before it is returned; any defect throws `PopulationValidationError`.

## Validation (`validatePopulation`)

The validator returns a report (`ok`, the first 50 issues, `issueCount`) and never throws. It checks:

- **Shape and identity:**
  - the contract shape;
  - the population belongs to this map;
  - the living count equals `params.size` exactly;
  - person, household and settlement IDs are unique;
  - every region has a known culture.
- **Settlements:**
  - on land, at a valid cell;
  - in a region of their own culture;
  - names drawn from the dataset with correct provenance and era.
- **Households:**
  - a partition of people;
  - the first member is the head;
  - one settlement each;
  - the form matches the roles (solitary = 1 member, stem has a parent, joint has a sibling, kin care has a grandchild).
- **References:** every person's household, settlement, cell and culture agree.
- **Kinship:**
  - parents are existing records of the right sex;
  - mother aged 13–50 at birth, father 14–80, parent born before child;
  - one mother's births are at least 270 days apart, or multiples (at most 3) on one day.
- **Partnerships:** reciprocal, same household, status `married` ⇔ partner present. Nobody is married or widowed before the culture's adult age. When both parents of a person are recorded, they are each other's partners.
- **Guardianship:**
  - every dependent has one, adults have none;
  - the guardian exists, lives in the same household and is not itself a dependent;
  - a `parent` guardian is that parent, and a parent is never recorded as a kin or foster guardian;
  - a grandparent guardian is at least 30 years older.
- **Household roles against kinship:**
  - a spouse is the head's partner;
  - a child is a child of the head or the head's partner;
  - a parent is a parent of the head;
  - a grandchild is in the head's care as grandparent;
  - a fosterling has a foster guardian and is not the head couple's child;
  - a sibling is born at least 270 days from the head, or on the same day.
- **Gender:** the category is valid for the culture; `not_recorded` ⇔ no category.
- **Names:**
  - the parts follow the culture's pattern;
  - dataset parts resolve to an existing `dataset@version/entry` with the same form, usage and applicability;
  - the entry is **in era** for the bearer's birth year;
  - the `fallbackLevel` matches the chain, and no earlier dataset had an eligible entry;
  - derived parts match their recorded relative, or their base entry, plus the culture's suffix;
  - siblings who share a recorded parent use the same base name for their unrecorded other parent.

## Report and plausibility

`populationReport` gives:
- the age pyramid by sex, in five-year bands;
- mean age, the shares under 15 and over 65, and the sex ratio;
- household count, mean size, size histogram and forms;
- the ever-married share of women by age band;
- the mean mother age at birth;
- dependents and their guardianship kinds;
- culture and settlement sizes;
- gender categories, including `not_recorded`;
- disabilities;
- name fallback levels and name diversity;
- plausibility checks with their basis.

The checks are screening bounds for defects, not calibration targets. Default params on the golden map (seed `9e3779b97f4a7c15`):

| Check | Range | Value | Comment |
|---|---|---:|---|
| Under 15 | 28–45% | 33.2% | stationary e₀ ≈ 25 gives ≈ 33–37% |
| 65+ | 0.5–8% | 1.3% | below the stationary ≈ 2–4% (see limitations) |
| Sex ratio | 930–1,070 | 985 | |
| Mean age | 20–32 | 25.7 | |
| Mean household size | 3.0–6.0 | 3.2 | low end of pre-industrial observations (see limitations) |
| Women 20–24 ever married | 40–98% | 75.7% | |
| Mean mother age at birth | 22–34 | 28.0 | |
| Dependents without a parent guardian | 1–25% | 8.8% | orphans in kin care or fostered |
| Smallest settlement | ≥ 10 people | 48 | |

The same checks pass for seeds `0123456789abcdef` and `fedcba9876543210` (test and bench) and for nine more seeds in a sweep.

Other figures for the golden population:
- 3,088 households: nuclear 1,760, joint 464, solitary 428, stem 298, kin care 138;
- 230 infants with unrecorded gender, and 7 adults in the third categories;
- 132–157 distinct given names per culture; the most common name in each culture is borne by 9.5% of its people combined;
- disabilities: 482 people (cognitive 171, sensory 165, mobility 146).

## Abstraction limits

- **Household members.** Households contain kin and fosterlings only, with no servants, lodgers or slaves. Married children of nuclear households leave. Mean household size is therefore about 3.2, at the low end of pre-industrial observations (often 4–5). The elderly are under-represented (1.4% are 65+), because old people appear only as stem parents, kin-care heads, solitary adults and couples. Phase 07 household dynamics revisits both.
- **Records.** Parents who died before 1 CE have no records. Their names survive only as provenance bases. Adult siblings are linked through shared recorded parents, or by household role when their parents are unrecorded.
- **Partnerships.** All seed partnerships are monogamous marriages between a woman and a man in one household. Family rules beyond this are data-driven from Phase 07, within product ethics.
- **Static attributes.** Skills and health are a static baseline; Phases 08–09 model change. There are no occupations yet.
- **Closed population.** The seed is closed: everyone lives in one of the world's settlements.

## Storage and launch

- **`civ.world_populations`** (migration 0005): one append-only row per world.
  - **Columns:** population hash, content version, map hash, living count and the full document as jsonb (about 10 MB, TOAST-compressed).
  - **CHECK constraints** tie the document's world, content version and map to the row, and require `living` to equal the number of stored persons.
  - **`createWorld({ population })`** stores it in the world's creation transaction. The population must be on the map stored with it and must use the world's `contentVersion`; the hash is recomputed with `node:crypto`.
- **World state.** `data` is `{ schemaVersion: 1, seedPopulationHash }` (contract `world-data`). Population is the set of living records, never a counter. Keeping the 10 MB document out of the per-command state keeps commits small. Phase 07 decides how people become mutable state (ADR 0007).
- **`launchWorld`** (simulation) runs, in one transaction:
  - the map;
  - the population;
  - an engine bound to the map and the season-one content;
  - the initial state and checkpoint, the world, the map and the population rows.
- **`loadSeedPopulation`** checks, in order:
  - the stored hash;
  - that the state names this population;
  - the semantic audit against the map and content;
  - for the current generator version, that re-synthesis gives the same hash.
- **Rollback.** `0005 down` refuses once any population is stored (SQLSTATE 55000); production rolls forward.

## Budget

`pnpm --filter @civ/domain bench:population` (macOS arm64, Node 22) synthesizes, audits and reports three seeds. It fails if the budget is exceeded or a population is implausible.

| Measure | Budget | Measured |
|---|---|---|
| Synthesis (including its audit) | ≤ 3,000 ms | ≈ 0.9 s |
| Separate audit | — | ≈ 0.1 s |
| Heap | ≤ 256 MB | ≈ 78 MB |
| Document | ≤ 16 MB | ≈ 10 MB |

A full `launchWorld` (map, population, store, reload, audit, regenerate) took ≈ 3.6 s in the integration test.
