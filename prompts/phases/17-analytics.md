# Phase 17 — analytics projections and reconciliation

Read `prompts/PHASE-CONTRACT.md` and `docs/ANALYTICS-ARCHIVE.md`; use `/archive-analytics`.

Implement versioned metric definitions, live counters, yearly aggregates, occupation/cause-of-death/settlement distributions, demographic and economy series, projection cursors, idempotent event consumers, rebuild/backfill jobs, and scheduled reconciliation against authoritative state/events.

Handle unknown/not-recorded explicitly. Keep life expectancy separate from mean age at death. Provide query APIs/repositories optimized by documented indexes and bounded dimensions. Definition changes create a new version rather than silently rewriting meaning.

Acceptance: duplicate/out-of-order delivery is handled according to contract; clean rebuild equals live projection; every headline total reconciles; mismatch raises an actionable alert; metric fixtures cover unknown categories and empty denominators; yearly queries meet p95 budget at full-season volume; backfill resumes safely and preserves published versions.
