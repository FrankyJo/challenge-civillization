# Phase 22 — simulated history archive, evidence graph, and search

Read `prompts/PHASE-CONTRACT.md`, `docs/DATA-AND-AI.md`, and `docs/ANALYTICS-ARCHIVE.md`; use `/archive-analytics`.

Implement annual/major-event evidence packet selection, deterministic summary fallback, optional LLM draft generation, claim-support links, automatic numeric/entity/chronology/causality validation, editorial versioning/approval, corrections, entity/event cross-links, search indexing, and stable public URLs. Preserve raw packet, prompt/model/version, draft, edits, review, and publication status.

LLM prose may not add facts. Causal language requires explicit supported relationships or qualified interpretation. AI outage falls back to structured factual summaries and never blocks simulation/analytics.

Acceptance: adversarial drafts with invented numbers/entities/causes are rejected; every published factual paragraph has support IDs; correction history is visible; search results respect stable IDs and permissions; rebuild from ledger/projections reproduces evidence packets; archive works without an AI provider; public pages meet accessibility/performance gates.
