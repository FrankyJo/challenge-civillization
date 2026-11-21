# ADR 0007: Seed population and constructed cultures

- Status: Accepted
- Date: 2026-11-21

## Context

Phase 05 must create exactly 10,000 internally consistent people at 1 CE. Each person needs:
- age, recorded sex and gender, kinship, guardianship, household, culture and location;
- health and capabilities;
- a name with provenance.

Names must come from licensed, versioned culture/era datasets with a fallback chain. The prompt forbids implying that a fictional culture caricatures a real group, and forbids any use of subscriber identities.

## Decisions

1. **Fictional cultures with constructed languages.** The user chose this.
   - The five cultures and their languages are authored.
   - Name lists are generated from per-language phonology specs by a seeded offline script, then frozen.
   - The licence is CC0.
   - Historical grounding sits in naming *systems*, demography and household forms, which carry citations, not in real attested names.
   - Rejected: real 1st-century name lists, because of sourcing and licensing work and because a fictional people would read as a copy of a real one; a mix, because it complicates provenance.
   - Gender category labels are invented words, not borrowed real-world terms.
2. **The content pack is generated, then frozen, and its digest is the content version.**
   - A test regenerates the pack and requires byte equality.
   - Any edit changes `contentVersion`, so the engine's version stamp changes too.
3. **Joint synthesis by household reconstruction.**
   - Households are built around marriages sampled backwards from today, using the life table, natural fertility and culture marriage ages.
   - Married-out children are pooled as spouses for later households. Kinship, ages, guardianship and household roles are consistent by construction, and an independent audit verifies them.
   - Rejected: independent marginal sampling (age, then household, then kin), which creates contradictions the skill warns about; and forward simulation from an earlier year, which costs much more and needs migration and mortality systems not built yet.
4. **The exact count comes from exact allocation and trimming.** `allocate` gives exact culture and settlement totals. Households fill each settlement exactly by trimming non-essential members, falling back to a solitary household. A property test covers sizes 1–400.
5. **The seed population is an immutable launch record, referenced by hash from world state.**
   - The 10 MB document is stored once in `civ.world_populations` (append-only), next to the map.
   - World state `data` is `{ schemaVersion, seedPopulationHash }`.
   - Putting 10,000 people into the jsonb state would rewrite about 10 MB on every command and checkpoint.
   - How people become mutable authoritative state is decided in **Phase 07**, which first mutates them: normalised entity tables with per-entity hashing, or chunked state. This ADR does not presuppose either.
6. **Unrecorded relatives.**
   - Parents who died before 1 CE have no records. Names derived from them carry a sampled base entry that is valid for every member of the lineage.
   - A null parent ID means "died before 1 CE", because the seed population is closed.
7. **Dependents and marriage.** Nobody marries before the culture's adult age; the contract and the audit both enforce this, so no seed person is a married minor. A dependent is anyone under the adult age, and every dependent has an explicit guardianship kind: parent, kin or foster.

## Consequences

- **Reproducibility.** Launching a world is reproducible from seed, map and content: about 0.9 s of synthesis and about 78 MB of heap. `loadSeedPopulation` re-synthesizes and compares the hash.
- **Known deviations.** Mean household size is about 3.2 and only about 1.3% are 65+. Both are recorded with their causes in `docs/POPULATION.md`, and Phase 07 revisits them.
- **Calibration.** Disability, frailty and skill parameters are uncalibrated defaults, labelled as such; health calibration is Phase 08.
