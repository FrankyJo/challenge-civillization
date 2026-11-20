---
name: archive-analytics
description: Build reconciled analytics, historical projections, evidence-backed archive articles, entity pages, and accessible charts.
---

# Archive and analytics

Read `docs/ANALYTICS-ARCHIVE.md` and `docs/DATA-AND-AI.md`.

Define metrics before implementation, including unknown handling and version. Projection consumers are idempotent and rebuildable; a scheduled reconciler compares projections with authoritative state/events. Metric definition changes create new versions and controlled backfills.

Archive generation receives a closed evidence packet. Every factual paragraph and numeric claim must link to supplied event/entity/aggregate IDs. Reject unsupported entities, chronology, causality, or values. Preserve raw evidence, generated draft, review edits, and versions.

Charts need text/table equivalents, keyboard access, semantic labels, and transparent definitions. Historical URLs and IDs remain stable after corrections.
