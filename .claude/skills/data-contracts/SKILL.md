---
name: data-contracts
description: Design versioned commands, events, API schemas, content packs, migrations, idempotency, and compatibility boundaries.
---

# Data contracts

Use closed schemas at trust boundaries and discriminated unions for variants. Each persisted/public message carries `schemaVersion`; domain events also carry world, time, causation/correlation, content/config/engine version, and stable entity IDs.

Validate before side effects. Separate write commands from read DTOs. Public DTOs are explicit allowlists. Add contract fixtures and backward-compatibility tests before changing published/persisted schemas.

For schema evolution prefer additive fields, dual read/write when needed, backfill with checkpoints, then enforcement/removal in a later release. Event corrections are new events, never mutation. Migrations include locking/rewrite analysis, rollback or roll-forward, and verification queries.

Queues are at-least-once: require stable job/idempotency keys, transactional outbox, inbox/processed marker, bounded retry, poison handling, and observable lag.
