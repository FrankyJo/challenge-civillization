# Phase 07 — lifecycle, families, and households

Read `prompts/PHASE-CONTRACT.md`; use `/demographic-model` and `/simulation-domain`.

Implement aging, partnerships/family formation as culturally configured, conception/pregnancy/birth abstraction, multiple births, kinship, household formation/split/merge, guardianship, migration intent hooks, death, inheritance/estate hooks, and structured lifecycle events. Preserve a distinction between family/kinship and co-resident household.

Policies must be explainable, bounded, deterministic for the same streams, and avoid encoding stereotypes as universal biology. Add yearly demographic projections but keep the person records authoritative.

Acceptance: property/scenario tests cover birth through death, infertility/health constraints, twins, parental death, orphan/community guardianship, household dissolution, empty settlement, and retry/replay; population reconciles exactly from lifecycle/migration events; no deceased person acts; kinship graph remains valid; metrics distinguish mean age at death from life expectancy.
