# Phase 15 — subscriber-count population target

Read `prompts/PHASE-CONTRACT.md`, `docs/PRODUCT.md`; use `/demographic-model` and request a security/privacy review.

Implement an adapter that ingests only aggregate subscriber counts with source, observed time, retrieval status, and confidence. Do not ingest handles, names, profiles, photos, or follower lists. Add a configurable slow target controller that influences permitted demographic/capacity levers within explicit rate and magnitude bounds.

The target is not a command to overwrite population. Exceptional reconciliation requires an operator-reviewed, append-only correction plan/event and public methodology note. The simulation remains deterministic when the timestamped target input series is replayed.

Acceptance: privacy tests prove identity fields are absent; missing/stale/extreme inputs degrade safely; abrupt target changes do not create implausible births/deaths; controller output is bounded/explainable; disabled controller leaves baseline unchanged; replay with the same series matches; metrics show target, actual, error, controller actions, and source freshness.
