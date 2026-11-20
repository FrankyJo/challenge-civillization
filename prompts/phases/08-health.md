# Phase 08 — needs, nutrition, health, disease, and mortality

Read `prompts/PHASE-CONTRACT.md`, `docs/DOMAIN.md`, and `docs/DATA-AND-AI.md`. Use research only for bounded calibrated content.

Implement water/food/shelter needs, nutrition, injury, disease exposure/progression/recovery/immunity, disability/functional effects, treatment capability, epidemics, and mortality risk. Choose and document individual/cohort resolution per mechanism. Health transitions must use approved content/config rather than LLM calls.

Causes of death are structured with primary/contributing causes and uncertainty. Resource consumption and population accounting reconcile. Add calibration fixtures and sensitivity tests; do not claim medical realism beyond the model.

Acceptance: scarcity and epidemics affect health/economy/demography causally; unavailable treatments cannot be used; duplicate exposure/tick processing is idempotent; bounded probabilities and state transitions hold; deterministic scenarios and statistical property tests pass; performance remains within the recorded 10k-NPC budget.
