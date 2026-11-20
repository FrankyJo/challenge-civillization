# Domain model and invariants

## Core concepts

- **World:** immutable seed and identity plus evolving state.
- **Season:** real-time schedule and public lifecycle for a world.
- **Simulation instant:** integer tick and derived CE year/day; no BCE in season 1.
- **Person:** biological/social lifecycle, identities, kinship, capabilities, health, location, occupation, assets, and event history.
- **Household/family:** related but distinct. A household shares residence/economy; kinship persists across households.
- **Settlement/region:** spatial containers with environment, capacity, institutions, and infrastructure.
- **Organization:** enterprise, guild, school, religious body, government, army, or association.
- **Resource/good/service:** conserved or intentionally transformed quantities with units and quality.
- **Knowledge/technology:** prerequisites, discovery, validation, diffusion, decay, and enabled capabilities.
- **Command:** requested change with actor, idempotency, causation, and expected version.
- **Domain event:** immutable fact emitted after a valid transition.
- **Projection:** rebuildable view derived from events/current state.

## Universal invariants

1. Population equals living person records, never a standalone mutable counter.
2. A person has at most one birth and one death; death follows birth and prevents later active behavior.
3. Parent-child age, birth time, and kinship relations are plausible under configured cultural/biological rules.
4. Every dependent child has a guardianship state, including orphan/community/institution arrangements.
5. A household cannot consume more physical stock than it possesses unless a recorded credit/transfer mechanism supplies it.
6. Double-entry ledgers balance by transaction and currency; money uses integer minor units.
7. Physical resource transformations balance inputs, outputs, losses, waste, and unit conversions.
8. Location changes follow reachable routes/capabilities or record exceptional displacement.
9. A technology can be used only when prerequisites, local knowledge diffusion, skills, and material/infrastructure requirements are satisfied.
10. Era constraints are capabilities, not arbitrary labels: a year alone never grants technology.
11. Same replay inputs produce the same ordered event stream and canonical state hash.
12. Events are never edited or deleted after publication; corrections are new linked events.

## Lifecycle

Birth derives from conception/pregnancy or another explicitly modeled pathway, creates kinship/guardianship, and assigns a culturally appropriate name from an approved dataset. Aging advances through the clock. Family/partnership rules are data-driven by culture and era while respecting explicit product ethics. Death records a structured primary cause, contributing causes, location, age, uncertainty, and dependent/estate consequences.

Health uses bounded states and risk factors rather than LLM improvisation. Disease models document transmission abstraction, immunity, treatment availability, and calibration. “Life expectancy” and “mean age at death” are separately defined metrics.

## Population target controller

The subscriber-derived target is an external observation with timestamp, source, and confidence. A slow controller may influence fertility intentions, migration attractiveness, housing/infrastructure policy, or operator-reviewed reconciliation. Rate limits and bounds prevent demographic shocks. The controller is disabled in deterministic benchmark fixtures unless its input series is part of replay.

## Decisions and AI

Routine NPC behavior uses deterministic policies, utility scoring, state machines, planners, and bounded stochastic choice. LLMs may generate offline narrative or reviewed content proposals, not per-person authoritative choices. Any future LLM-mediated rare event must be recorded as an external command with full input/output/version provenance and a deterministic fallback.

## Historical grounding

Approved content declares earliest plausible date range, geography/cultures, prerequisites, resources, institutions, diffusion parameters, confidence, sources, and counterfactual notes. Real-world dates are evidence, not automatic unlock dates. The simulated world can discover later, earlier within defensible uncertainty, or not at all.
