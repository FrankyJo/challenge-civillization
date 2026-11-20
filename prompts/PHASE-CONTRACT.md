# Contract shared by every implementation phase

When executing a phase, first read `CLAUDE.md`, the numbered prompt, its referenced specs, the previous phase report, and actual code. Treat suggested paths as a target architecture, not permission to overwrite working equivalents.

Deliver a coherent vertical increment: production code, schemas/migrations, tests, telemetry, documentation, rollback/compatibility notes, and `docs/phase-reports/NN.md`. Preserve determinism, append-only history, strict authority boundaries, idempotency, privacy, and accessibility.

Use subagents only under `CLAUDE.md` policy. Run focused checks while iterating and the full phase gate at the end. Commission independent review for production behavior, resolve critical/high findings, and record exact evidence. Never mark a phase complete with placeholders, failing/skipped gates, unsupported historical claims, or manual state edits.
