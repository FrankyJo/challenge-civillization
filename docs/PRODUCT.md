# Product specification

## Vision

Civilization: Living History is a public experiment in which 10,000 simulated people begin in 1 CE and autonomously develop a world through 2026 CE over a 30-day live season. Visitors watch the current world, explore its recorded past, and understand why it changed.

This is a simulation and archive—not a claim to reproduce real history exactly. Historical grounding constrains available knowledge, institutions, materials, diseases, transport, and techniques. The simulated civilization may diverge because its geography, population, incentives, and stochastic events differ.

## Audiences

- **Visitor:** watches the live map, follows people/places, explores analytics and archive articles, replays earlier years.
- **Research-minded viewer:** downloads documented aggregates and inspects methodology, seeds, content versions, and uncertainty.
- **Operator/editor:** monitors health, pauses/resumes the clock, reviews historical proposals, promotes content, rolls back projections, and publishes archive articles.
- **Developer:** evolves systems using deterministic fixtures, gates, and traceable decisions.

## Season contract

- World starts at year 1 CE and ends after completing year 2026 CE.
- The public season spans exactly 30 × 24 hours between configured UTC instants.
- Baseline mapping: 2026 simulated years / 720 real hours ≈ 2.8139 years/hour. The clock uses rational/integer units and checkpoints; it must not accumulate floating-point drift.
- Maintenance pauses do not silently skip history. The operator chooses catch-up within a configured ceiling, or extends the public end time with a recorded decision.
- The launch seed, config hash, content pack hash, and engine version are public metadata.

## Population and identity

The first committed world contains exactly 10,000 living NPCs. Their ages, households, kinship, locations, culture memberships, health, skills, and possessions must be internally consistent.

An imported subscriber count is a target signal only. The target controller nudges long-horizon incentives and capacity within bounded, reviewable limits. It cannot directly spawn/delete people. If an exceptional reconciliation is necessary, it creates explicit auditable events and never uses subscriber identity data.

Names come from licensed/versioned datasets tagged by culture, language, region, era range, and applicable naming convention. A deterministic fallback chain handles missing data and records dataset/version provenance on each generated name.

## Required simulation themes

Demography and families; health, nutrition, disease, injury, disability, and mortality; agriculture, water, resources, climate, and disasters; labor, skills, professions, production, ownership, markets, trade, taxation, and inequality; housing, settlements, infrastructure, transport, and migration; education, knowledge, science, technology, and diffusion; organizations, law, governance, conflict, diplomacy, and public goods; culture, language, religion, customs, arts, and information; environmental impact and energy.

Not every theme must be microsimulated at equal resolution. Each system documents its abstraction, inputs, outputs, calibration data, and known limitations.

## Public experience

- Live world overview and zoomable map with settlements, borders, routes, movement aggregates, alerts, and current year.
- Historical map replay from stored snapshots plus events.
- Timeline and archive articles linked to cited event IDs, people, places, organizations, and technologies.
- Analytics for population, sex/gender categories (including unknown/not recorded), age bands, births, deaths, fertility, households, migration, occupations, production, prices, inequality, diseases, and causes of death.
- Entity pages for people, families, settlements, organizations, technologies, and major events.
- Methodology and data-quality pages explaining uncertainty and definitions.

## Out of scope for initial launch

- One LLM call per NPC or tick.
- Subscriber avatars or personal-data ingestion.
- Photorealistic individual animation for all 10,000 NPCs.
- Real-money economy, user trading, or competitive multiplayer.
- Unreviewed self-modifying production code.

## Product success

The season completes without lost/duplicated authoritative events; deterministic replays match; visitors can explain major changes from evidence; public APIs remain responsive under launch load; historical proposals cannot bypass review; analytics reconcile to the ledger; and the archive remains browsable after the season ends.
