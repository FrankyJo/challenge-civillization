# Phase 00 — repository and tooling bootstrap

Read `prompts/PHASE-CONTRACT.md`. Build the executable monorepo skeleton without implementing game features.

Create `apps/web`, `apps/api`, `apps/simulation`, `apps/worker` and the packages named in `docs/ARCHITECTURE.md`. Configure current stable Vue/Vite/Phaser, Fastify, TypeScript strict mode, Zod, PostgreSQL access/migrations, Redis/BullMQ, Vitest, property testing, Playwright, lint/format, Turborepo, Docker, and structured environment parsing. Pin a lockfile. Avoid dependency overlap and unnecessary frameworks.

Each app/package must build and expose a minimal health or import smoke path. Add local setup, database lifecycle, test, and CI commands. CI must install from lockfile, lint, typecheck, unit-test, build, and run starter verification. Secrets stay in environment variables; `.env.example` contains no usable secret.

Acceptance: clean clone + documented prerequisites can install, start infrastructure, run migrations, build all workspaces, execute tests, and start health endpoints. `pnpm gates` is real (not a no-op), failing checks propagate nonzero exit, and no TODO placeholder is presented as functionality. Record versions and any platform caveats in the phase report.
