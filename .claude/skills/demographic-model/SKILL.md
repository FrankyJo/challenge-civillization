---
name: demographic-model
description: Implement births, deaths, aging, families, households, migration, names, and population targeting with demographic consistency.
---

# Demographic model

Read `docs/PRODUCT.md`, `docs/DOMAIN.md`, and `docs/TEST-STRATEGY.md` scenarios 1–9.

- Population is derived from living people. Every delta reconciles to birth, death, arrival/departure, or explicit reviewed correction events.
- Initialization must jointly generate ages, kinship, household roles, guardianship, culture/location, health, and names; do not independently sample fields that create contradictions.
- Model conception/pregnancy/birth cadence at an abstraction justified in the spec. Bound fertility by age/health/partnership/culture/resources and avoid deterministic stereotypes.
- Death stores structured cause, uncertainty, contributing factors, and dependent/estate consequences.
- Keep biological sex, gender identity/role, and recording status distinct if modeled; analytics must preserve unknown/not-recorded.
- Subscriber target input changes incentives/capacity slowly and within tested bounds. Never ingest identities or directly overwrite population.
- Era/culture name selection uses approved versioned datasets and records provenance/fallback.

Test orphaning, twins/multiple births, empty settlements, last specialist death, migration during route closure, target shocks, and deterministic replays.
