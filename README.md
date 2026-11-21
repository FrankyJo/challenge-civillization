# Civilization: Living History — Claude Code starter kit

This repository is a specification-first starter for building a public, headless civilization simulation with Claude Code. It contains the product contract, architecture, domain rules, agent definitions, reusable skills, implementation prompts, quality gates, and verification scripts. It deliberately does **not** pretend that the full game is already implemented.

## Non-negotiable product rules

- Start the first season at **1 CE** with exactly **10,000 living NPCs**.
- Advance through **2026 CE in 30 real days**. Use an explicit schedule and a deterministic simulation clock; do not tie progress to browser traffic.
- NPC names are generated from era-, culture-, language-, sex/gender-, and region-appropriate datasets. They are never copied from subscribers.
- An external subscriber count affects only a configurable population target. It does not create named subscriber avatars or erase demographic causality.
- Population changes through births, deaths, family formation, migration, and explicit administrative reconciliation events—not silent counter edits.
- The server owns the world. Vue and Phaser render projections and send permitted commands; they never advance authoritative state.
- Every historical claim or AI-generated proposal is sourced, schema-validated, reviewed, tested, and explicitly approved before promotion.
- The event ledger is append-only. Public archive prose may summarize facts but may not invent facts or numbers.
- The public product includes a live map, replayable historical map, analytics, entity pages, and a simulated history archive.

## Start here

1. Install current Node.js LTS, pnpm, Docker, and Claude Code.
2. Open the repository root in Claude Code.
3. Read [CLAUDE.md](CLAUDE.md), then paste [prompts/START-HERE.md](prompts/START-HERE.md).
4. Execute one numbered phase at a time. A phase is complete only when its acceptance gate passes and its evidence is recorded.
5. Run `node scripts/verify-kit.mjs` to validate this starter. After bootstrap, use `pnpm gates` for implementation gates.

Detailed Claude Code setup and the model-routing policy are in [docs/CLAUDE-CODE-SETUP.md](docs/CLAUDE-CODE-SETUP.md).

## Local development

Prerequisites: Node.js ≥ 22.13 (see `.nvmrc`), pnpm 10 (`corepack enable`), Docker with Compose v2.

```bash
cp .env.example .env                                   # local, non-secret defaults
pnpm install --frozen-lockfile
pnpm infra:up                                          # PostgreSQL 17 + Redis 7 on 127.0.0.1
pnpm build
pnpm db:migrate                                        # also: pnpm db:status, pnpm db:rollback, pnpm db:reset
pnpm --filter @civ/web exec playwright install chromium   # once, for e2e
pnpm gates                                             # full gate (see below)
```

Run processes (after `pnpm build`): `pnpm --filter @civ/api start` (:3000), `pnpm --filter @civ/simulation start` (:3001), `pnpm --filter @civ/worker start` (:3002), `pnpm --filter @civ/web dev` (:5173, proxies `/api`). Each Node process serves `GET /health` (liveness) and `GET /health/ready` (dependency readiness, 200/503).

`pnpm gates` runs, failing fast with a nonzero exit: starter verification → repository meta-tests → ESLint + Prettier → typecheck + unit tests + build → integration tests (real PostgreSQL/Redis) → process smoke test (migrations + all three health endpoints + graceful shutdown) → Playwright e2e. Individual steps: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, `pnpm smoke`, `pnpm test:e2e`. Reset local data with `pnpm db:reset` (drops and re-migrates the `civ` schema; refused outside local development) or `pnpm infra:reset` (destroys the local Docker volume). Storage, outbox and recovery: [docs/PERSISTENCE.md](docs/PERSISTENCE.md). World map generation, units and budgets: [docs/GEOGRAPHY.md](docs/GEOGRAPHY.md); preview a map with `pnpm --filter @civ/domain exec node bench/map-preview.mjs <seed> map.png` and check its budget with `pnpm --filter @civ/domain bench:map`.

Containers: `docker compose --profile apps up --build` builds one image (`Dockerfile`) and runs migrate, api, simulation and worker against the compose infrastructure.

## Repository map

```text
.claude/agents/        specialist subagents with bounded responsibilities
.claude/skills/        on-demand domain and workflow instructions
.claude/rules/         path-specific implementation rules
docs/                  product, architecture, domain, data, testing, operations
prompts/phases/        one executable prompt per implementation phase
prompts/operations/    audits, historical proposals, incidents, releases
scripts/               starter and quality-gate automation
tests/                 meta-tests for this kit; later, system suites
apps/                  web (Vue/Phaser), api (Fastify), simulation, worker (BullMQ)
packages/              domain, contracts, content, db, telemetry, testing
```

## Operating model

The main Claude Code session is the orchestrator. It works directly for small, local tasks and delegates only when a separate context materially helps. The default worker budget is two concurrent subagents; three is allowed for clearly independent workstreams. The orchestrator owns integration and never accepts a worker claim without checking files and running relevant gates.

Use model aliases rather than dated model IDs. `haiku` is reserved for bounded discovery and documentation inventories, `sonnet` for normal implementation and tests, and `opus` for high-consequence architecture or cross-system reasoning. Availability and aliases vary by Claude Code installation, so verify with `/agents` and project settings.

## What “verified” means here

The bundled verifier checks repository completeness, phase numbering, agent/skill frontmatter, required product invariants, shell syntax, JSON syntax, and accidental placeholders. It cannot prove that a future implementation is historically accurate or production-safe. Those claims require the phase gates, simulation invariants, performance tests, source review, and human release approval defined in `docs/`.

## Licensing

The starter kit is provided under the MIT license. Historical datasets, map assets, fonts, and generated media must each have compatible provenance recorded before use.
