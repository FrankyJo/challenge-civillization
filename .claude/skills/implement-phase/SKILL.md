---
name: implement-phase
description: Execute one numbered implementation phase end to end, including code, tests, docs, evidence, independent review, and acceptance gates.
argument-hint: "<phase number or prompt path>"
disable-model-invocation: true
---

# Implement a phase

Resolve the phase from `$ARGUMENTS`; if omitted, ask for the phase number. Read the corresponding file in `prompts/phases/`, its prerequisite specs, and the current repository state.

1. Confirm prerequisites and restate the measurable acceptance gate in a short working note.
2. Inspect existing code/contracts/tests; do not assume the prompt's suggested file layout is still exact.
3. Plan a vertical, reviewable implementation. Identify migrations, compatibility, telemetry, and rollback needs.
4. Work directly unless a subagent offers real context isolation or independent parallel work. Follow `CLAUDE.md` delegation limits.
5. Implement production behavior and tests together. No stubs, fake adapters, or test-only branches.
6. Run focused checks, then the full relevant gate. Fix failures rather than weakening gates.
7. Ask the `reviewer` subagent for an independent review when the phase changes production behavior; fix critical/high findings and rerun gates.
8. Update specs/ADR/runbook and create `docs/phase-reports/NN.md` with acceptance mapping, commands/results, benchmarks, migrations, risks, and rollback.

Stop and request a decision only for missing authority, destructive production action, an unresolved product choice that materially changes behavior, or a prerequisite that cannot be satisfied. Otherwise continue until the gate passes.
