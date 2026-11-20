# Civilization: Living History — standing instructions

You are the repository orchestrator. Deliver working, tested increments of a deterministic civilization simulation; do not merely propose them.

## Read first

1. `README.md`
2. `docs/PRODUCT.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DOMAIN.md`
5. `docs/IMPLEMENTATION-PLAN.md`
6. The active phase prompt and only the skills/references it names

## Product invariants

- Season 1 starts at 1 CE with exactly 10,000 living NPCs and ends at 2026 CE after 30 real days.
- Subscriber count supplies only a population target. Never use subscriber identities, handles, photos, or names.
- Births, deaths, families, migration, and reconciliation events explain every population change.
- Names are sampled deterministically from versioned culture/era datasets with provenance and fallback rules.
- The headless Node/TypeScript engine is authoritative and runs without a browser.
- Vue/Phaser is a projection. It does not contain authoritative simulation rules.
- The append-only event ledger is the source for archives, analytics, replay, and audits.
- LLM output is always an untrusted proposal: cite sources, validate schema, review, simulate, approve, then promote.
- Archive prose may only state facts supported by event IDs or aggregates.
- Same seed + config + content version + command stream must produce the same canonical state hash.

## Workflow

- Inspect before editing. Reuse existing contracts and patterns.
- For a numbered phase, invoke `/implement-phase` or follow its contract exactly.
- Record decisions in `docs/adr/`; update specs when behavior changes.
- Prefer vertical slices and reversible migrations. Do not add speculative abstractions.
- No placeholders, fake success, swallowed errors, skipped tests, or hardcoded outputs that only satisfy fixtures.
- Run the narrowest relevant checks while iterating, then the full phase gate before completion.
- Report changed files, commands run, evidence, risks, and remaining work.

## Delegation policy

Work directly for single-file edits, small fixes, or tasks requiring tight shared context. Delegate only for parallel independent work, high-volume discovery, specialist analysis, or independent review.

- Default: at most 2 concurrent workers; maximum 3 without explicit user direction.
- Use `haiku` for bounded discovery/inventory; `sonnet` for implementation, tests, research synthesis, and review; `opus` only for consequential architecture or hard cross-system failures.
- Give workers a narrow objective, exact files, constraints, expected output, and stop condition.
- Workers return evidence and file paths, not long narrative.
- Never let two workers edit the same files concurrently.
- Verify all worker output yourself. The main session owns integration.

## Engineering rules

- TypeScript strict mode; validate all boundary data.
- Keep domain logic pure where practical; isolate time, randomness, persistence, queues, and network I/O behind ports.
- Use integer minor units/fixed-point math for money and quantities. No floating-point equality for invariants.
- All random draws come from named deterministic streams. Never call ambient `Math.random()` in simulation code.
- Every mutation carries world ID, tick/year, causation ID, correlation ID, and content/config version.
- Use idempotency keys for commands/jobs and transactional outbox/inbox patterns for asynchronous effects.
- Never expose private/admin data through public APIs. Rate-limit and cache public endpoints.
- Keep migrations backward compatible across rolling deployment unless an approved maintenance window says otherwise.

## Completion standard

A phase is not complete until its acceptance criteria, tests, lint/type checks, migrations, documentation, observability, and rollback notes are satisfied. If blocked, leave the repository in a coherent state and record the exact blocker—never mark the phase complete.
