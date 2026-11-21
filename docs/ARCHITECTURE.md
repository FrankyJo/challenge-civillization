# Architecture specification

## Shape

Begin as a modular monorepo with deployable processes, not a fleet of microservices:

```text
apps/web            Vue 3 public site + admin shell; Phaser map embedded as a view
apps/api            Fastify HTTP/WebSocket API and authentication boundary
apps/simulation     headless deterministic tick runner and command processor
apps/worker         projections, snapshots, archive generation, proposal jobs
packages/domain     pure aggregates, policies, commands, events, invariants
packages/contracts  versioned Zod schemas and generated types
packages/content    signed/versioned historical content packs
packages/db         schema, migrations, repositories, outbox/inbox
packages/telemetry  logs, metrics, traces, correlation helpers
packages/testing    deterministic builders, fixtures, model/property checks
```

Processes may be scaled independently. Splitting into services requires measured pressure and an ADR.

The allowed dependency graph between these workspaces is executable policy (`scripts/architecture-policy.mjs`, enforced by `pnpm arch:check`); contract rules are in `docs/CONTRACTS.md`.

## Authority and data flow

1. A scheduler maps real time to due simulation ticks.
2. The simulation process obtains a world lease, reads a checkpoint and ordered commands, then advances pure domain systems.
3. State mutations and immutable domain events commit in one database transaction with an outbox record.
4. Workers project events into current read models, yearly aggregates, map tiles/snapshots, search, and archive candidates.
5. API serves public projections and sends cacheable deltas. It never mutates simulation state directly; accepted commands enter the ordered command log.
6. Vue/Phaser render read models. Reconnecting clients request a snapshot cursor plus subsequent deltas.

PostgreSQL is the source of truth. Redis/BullMQ is a delivery and caching mechanism, never the sole holder of authoritative state. Tables, transaction boundaries, outbox/inbox and recovery are specified in `docs/PERSISTENCE.md`.

## Determinism

- Fixed tick units and stable system order.
- Named, splittable PRNG streams derived from world seed + subsystem + entity/tick scope.
- Canonical serialization and state hashes at checkpoints.
- No wall time, locale-dependent sorting, unordered iteration, floating-point money, or network calls inside domain transitions.
- Content/config/engine versions accompany every transition.
- Replay consumes the original commands and content versions.

## Scale model

Use multi-resolution simulation:

- Individual resolution for lifecycle, household, employment, health, and exceptional actions.
- Cohort/flow resolution for routine commuting, low-salience market matching, disease exposure, and migration pressure when exact agents are unnecessary.
- Aggregate yearly projections for analytics; sampled/keyframe rendering for the map.

Partition first by world, then spatial region where needed. Cross-region transfers use explicit two-stage commands and idempotency. Benchmark with realistic event volume before adding distributed complexity.

## Storage

- `worlds`, `seasons`, `clock_checkpoints`, `command_log`
- normalized current state for people/households/settlements/assets/organizations
- append-only `domain_events` partitioned by world and time
- outbox/inbox and job idempotency tables
- yearly/periodic aggregate tables with definitions and version
- map snapshots and cold archive objects with checksums
- AI proposal/source/review/promotion tables

Retention: events and approved content are permanent for a published season. High-frequency telemetry and disposable projections have explicit TTLs. Backups include verified restore drills.

## API surface

Public APIs are read-only, paginated, versioned, cached, and rate-limited. Admin commands require strong authentication, authorization, CSRF protection where applicable, audit logging, and idempotency. WebSocket messages are resumable with monotonic cursors; clients fall back to HTTP snapshots after gaps.

## Failure behavior

- A single active world lease prevents double advancement.
- Tick execution is transactional and retry-safe.
- Consumers are at-least-once and idempotent.
- Projection lag is visible and does not corrupt authoritative state.
- When due work exceeds the catch-up ceiling, pause and require an operator decision.
- LLM/research outages stop proposal generation only; the simulation continues using approved content.

## Deployment environments

Local Docker → ephemeral CI → staging replay/load environment → production. Production promotion requires immutable artifacts, migration preview, backup verification, canary/health checks, and rollback instructions. No production deployment is authorized by a development prompt.
