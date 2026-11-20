# ADR 0002: Phase 00 tooling baseline

- Status: Accepted
- Date: 2026-11-20

## Context

Phase 00 must produce an executable monorepo (apps/web, api, simulation, worker; packages domain, contracts, content, db, telemetry, testing) with current stable tooling, a pinned lockfile, real gates, and no game features. Several choices were not dictated by the specs and are recorded here.

## Decisions

1. **TypeScript 6.0.x, not 7.0.** TypeScript 7.0.2 (native port) is the npm `latest`, but `typescript-eslint` 8.73 declares `typescript >=4.8.4 <6.1.0`, and we run `strict-peer-dependencies`. Revisit when typescript-eslint supports 7.x.
2. **Packages compile to `dist/` with `tsc`; consumers import built output.** Turborepo orders `typecheck`/`test`/`build` after `^build`. This avoids custom resolution conditions and keeps published types identical to what runs.
3. **ESLint (flat config, `typescript-eslint` strict, non-type-aware) + Prettier.** Type-aware rules were not enabled because they require dependent packages to be built before linting; reconsider when lint moves into per-package Turbo tasks. A determinism guard is enforced for `packages/domain/src`: no `Math.random`, `Date`, `performance`, `process`, timers, `fetch`, `crypto`, Node I/O modules, or infrastructure/UI packages.
4. **Own SQL migration runner (`@civ/db`) on `pg`.** Plain `NNNN_name.up.sql`/`.down.sql` files; sha256 checksums detect edited history; a PostgreSQL advisory lock serialises concurrent migrators; each migration runs in its own transaction; the runner refuses to run when the database is ahead of the code. No ORM/query builder is introduced until a phase needs one. Bookkeeping lives in `public.schema_migrations`; application tables live in schema `civ` (baseline migration 0001).
5. **Structured environment parsing with Zod at every process boundary** (`@civ/contracts` `parseEnv`). Blank values count as unset; error messages name variables but never echo values.
6. **Health contract.** Every Node process serves `GET /health` (liveness, no dependency calls) and `GET /health/ready` (dependency probes with per-probe timeout; 200 or 503) returning the versioned `healthReportSchema`. Failed probes expose only a stable code (`timeout` | `unavailable`); raw driver errors are logged server-side, never returned. API uses Fastify; simulation/worker use a small `node:http` server from `@civ/telemetry`.
7. **Redis client: ioredis 5.11 for BullMQ 6.** BullMQ 6 accepts `ioredis >=5`; 5.11 is the mature line. Worker connections use `maxRetriesPerRequest: null` as BullMQ requires.
8. **Web reaches the API through a same-origin `/api` proxy** (Vite dev/preview), so the API exposes no CORS surface in Phase 00. Phaser is lazy-loaded; its ~1.4 MB chunk is expected and isolated from the shell bundle.
9. **Integration tests require real infrastructure and fail (never skip) without it.** Each DB suite creates and force-drops its own ephemeral database; queue suites use a unique queue name.
10. **Install scripts denied by default (pnpm 10).** `msgpackr-extract` (optional native accelerator) is explicitly ignored; BullMQ uses the JS fallback.
11. **One Docker image definition for Node processes**; the command selects api/simulation/worker/migrate. pnpm is pinned in the image (Corepack otherwise floats to the newest major). Compose binds infrastructure to loopback only and keeps app containers (with readiness healthchecks) behind the `apps` profile; `scripts/container-smoke.sh` gates this path in a separate CI job.

## Consequences

Gates exercise real PostgreSQL, Redis, built processes and a real browser, so `pnpm gates` needs Docker (or CI services) and a Playwright Chromium install. Moving to TypeScript 7 or type-aware lint is a contained follow-up. The migration runner is small enough to audit but must keep its integration tests as the contract.
