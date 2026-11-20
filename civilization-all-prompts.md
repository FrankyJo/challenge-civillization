# Civilization — всі промпти Claude Code

**Важливо:** це довідковий зведений файл. Для запуску краще ZIP-проєкт: кожну фазу виконуй окремо, а не вставляй увесь файл одночасно.



---

## 00-bootstrap.md

# PROMPT 00: Налаштування команди агентів

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **00 Налаштування команди агентів**.

## Outcome
Validate Claude Code repo agents/skills setup, bootstrap monorepo and CI without gameplay.

## Scope and non-negotiable requirements
Check Claude Code version and available features; create pnpm workspace package boundaries, TypeScript strict, eslint/formatter, Vitest and CI. Make agent routing demonstration (scout read-only, implementer small change, reviewer); write actual phase ledger; no secrets.

## Delegation and cost
Recommended roles: scout,implementation-engineer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-00.md`.

## Required acceptance gate
pnpm install, typecheck, lint, build and smoke test pass; agents discoverable; CI runs.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 01-requirements.md

# PROMPT 01: Повний PRD і матриця вимог

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **01 Повний PRD і матриця вимог**.

## Outcome
Produce rigorous acceptance-driven spec for public historical civilization simulator.

## Scope and non-negotiable requirements
Read all product decisions; enumerate user journeys for viewer, admin, season runner, researcher; partition must-have vs aspirational. Create requirement IDs, operational risks, dependency graph, source-of-truth glossary and success metrics; map every requirement to test/phase; add contradiction register.

## Delegation and cost
Recommended roles: domain-architect,documentarian. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-01.md`.

## Required acceptance gate
Traceability matrix, ambiguous choices ADR defaults, no silent change to constitution.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 02-ontology.md

# PROMPT 02: Онтологія світу та контракти

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **02 Онтологія світу та контракти**.

## Outcome
Design versioned ontology of people, households, places, assets, organizations, technology, government and events.

## Scope and non-negotiable requirements
Separate entity ID, identity history, membership, parentage, geographic/time state and actions. Data schemas with constraints; taxonomies for sex/gender as modeled, occupations, unknown causes of death, skills, property, institutions. Design extensions without exploding schema.

## Delegation and cost
Recommended roles: domain-architect,data-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-02.md`.

## Required acceptance gate
Schema examples, relationship constraints, migration strategy, cross-domain interface tests.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 03-time.md

# PROMPT 03: Час, сезон і відтворюваність

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **03 Час, сезон і відтворюваність**.

## Outcome
Build authoritative game clock from 1 to 2026 CE over 30 real days.

## Scope and non-negotiable requirements
Use fixed-point simulation time; accurate 2025/30 advancement, timezone independence, pause/resume, catch-up after downtime, accelerated dry-run, leap/year mapping explicitly defined; events ordered deterministically.

## Delegation and cost
Recommended roles: implementation-engineer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-03.md`.

## Required acceptance gate
Boundary and drift tests, same seed produces same hashes, no double advance on restart.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 04-event-store.md

# PROMPT 04: Журнал подій і знімки

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **04 Журнал подій і знімки**.

## Outcome
Implement transactional append-only event history, checkpoints and replay.

## Scope and non-negotiable requirements
PostgreSQL event schema with worldId/seasonId/sequence/simTimestamp, causation, idempotency, partition/index; materialized projections, snapshot versioning, crash recovery, repair strategy.

## Delegation and cost
Recommended roles: data-engineer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-04.md`.

## Required acceptance gate
Rebuild projections from ledger, restore snapshot, duplicates fail idempotently, integrity checks.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 05-geography.md

# PROMPT 05: Географія й ресурси

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **05 Географія й ресурси**.

## Outcome
Create deterministic world regions and terrain with spatial indexing.

## Scope and non-negotiable requirements
Seeded regional maps: biomes, water, mountains, climate, minerals, agriculture; procedural chunks immutable base plus mutable deltas, environmental carrying capacity, hazards and discovery map. Generate multiple regions, no mandatory real Earth geography.

## Delegation and cost
Recommended roles: domain-architect,implementation-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-05.md`.

## Required acceptance gate
Seed replay, no impossible terrain/negative deposits, boundary/path tests, measured generation time.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 06-society-initializer.md

# PROMPT 06: Початкові 10 000 NPC

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **06 Початкові 10 000 NPC**.

## Outcome
Populate historically plausible 1 CE society with households, cities, ages and skills.

## Scope and non-negotiable requirements
Baseline pre-existing 1 CE goods, roads, farming, trade, writing etc by region; seeded name generator by culture/time; mixed age distributions, homes, resources, employment roles, family links. Do not claim historical fidelity beyond evidence; no follower identities.

## Delegation and cost
Recommended roles: historian,implementation-engineer,simulation-scientist. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-06.md`.

## Required acceptance gate
Exactly 10k live at initial snapshot, no invalid relationships, resource needs covered, repeatable setup.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 07-agent-model.md

# PROMPT 07: Особистість, потреби і пам’ять

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **07 Особистість, потреби і пам’ять**.

## Outcome
Implement expressive NPC state without per-tick LLM.

## Scope and non-negotiable requirements
Age, energy, hunger, thirst, health, preferences, personality, goals, money, work, skills, inventory, relationships, memories, knowledge constraints; state schemas with event updates.

## Delegation and cost
Recommended roles: domain-architect,implementation-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-07.md`.

## Required acceptance gate
Type tests and state validation, invalid action rejection, stable needs over tick resolution.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 08-planning.md

# PROMPT 08: Utility AI + планувальник

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **08 Utility AI + планувальник**.

## Outcome
Give agents autonomy and multi-step goal execution.

## Scope and non-negotiable requirements
Utility goal prioritization, action preconditions/effects, GOAP or HTN planner, path/stock/price preconditions, interruptions and retry policy, bounded CPU budget. Include go grocery, work, seek care, rest, socialize end-to-end.

## Delegation and cost
Recommended roles: simulation-scientist,implementation-engineer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-08.md`.

## Required acceptance gate
Deterministic action outcomes, no endless loops, starvation and failure recovery, benchmark 10k.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 09-demography.md

# PROMPT 09: Народжуваність, смертність, сім’ї

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **09 Народжуваність, смертність, сім’ї**.

## Outcome
Implement full population lifecycle and demographic feedback.

## Scope and non-negotiable requirements
Parents and lineage graph, couple/partnership, multiple births twins/triplets, marriage/child care, age distribution, lifecycle stage, inheritance, deaths by cause, orphans, immigration option. Follower target != actual. Control population gap smoothly via modeled behavior without forced deaths/spawns.

## Delegation and cost
Recommended roles: simulation-scientist,implementation-engineer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-09.md`.

## Required acceptance gate
1000 years accelerated test with >10 generations, conservation and no invalid ancestry, target convergence report.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 10-health.md

# PROMPT 10: Здоров’я і хвороби

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **10 Здоров’я і хвороби**.

## Outcome
Model era-sensitive illness, care availability and death causes.

## Scope and non-negotiable requirements
Exposure/sanitation, injury, natural aging, infection dynamics; service capacity, medicine, staff, diagnosis and costs, disease diffusion in settlement; treat cause-of-death classification and uncertain/unknown.

## Delegation and cost
Recommended roles: simulation-scientist,implementation-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-10.md`.

## Required acceptance gate
Health demand leads to visits, low supply affects outcomes, no magical treatment, mortality reconcilable.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 11-resources.md

# PROMPT 11: Речі, ресурси й виробництво

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **11 Речі, ресурси й виробництво**.

## Outcome
Build modular materials, tools, durable goods, decay and production.

## Scope and non-negotiable requirements
Recipes with quantities, inputs/outputs, energy/labor/location/tool requirements, durability, spoilage, depletion, stocks, transport constraints; linked physical ownership.

## Delegation and cost
Recommended roles: domain-architect,implementation-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-11.md`.

## Required acceptance gate
Mass/resource accounting, no negatives, supply outages propagate, deterministic production.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 12-economy.md

# PROMPT 12: Гроші, бюджети і ринки

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **12 Гроші, бюджети і ринки**.

## Outcome
Create coherent local economy with prices, wages, supply/demand.

## Scope and non-negotiable requirements
Ledger double-entry or reconciled balances, wages, bills, business costs, credit as optional later, price formation, hoarding, shortages, taxation policy, exchange across cities; currency era adaptation.

## Delegation and cost
Recommended roles: simulation-scientist,data-engineer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-12.md`.

## Required acceptance gate
No currency fabrication, transaction atomicity, shortages affect prices, bankruptcy and household budgets tested.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 13-jobs.md

# PROMPT 13: Професії, навички і кар’єра

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **13 Професії, навички і кар’єра**.

## Outcome
Make professions data-driven and skill-qualified.

## Scope and non-negotiable requirements
Occupation templates, prerequisites, apprenticeship/education, career switches, job board, wages, skill accumulation, business ownership. Many professions through capability composability not separate AI per profession.

## Delegation and cost
Recommended roles: implementation-engineer,simulation-scientist. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-13.md`.

## Required acceptance gate
20+ baseline functioning professions, unemployment/job matching, workplace requirements, no impossible hires.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 14-organizations.md

# PROMPT 14: Бізнеси та інституції

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **14 Бізнеси та інституції**.

## Outcome
Model firms, farms, markets, schools and administrations.

## Scope and non-negotiable requirements
Organizations with owners, workers, budgets, inventory and operations; school and guild type institutions, local policy, service contracts, business lifecycle. Support independently run shops, hiring/firing, capacity and queues.

## Delegation and cost
Recommended roles: domain-architect,implementation-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-14.md`.

## Required acceptance gate
Business lifecycles and employer insolvency tested; no phantom goods or payroll.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 15-relationships.md

# PROMPT 15: Соціальні зв’язки, культура і родини

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **15 Соціальні зв’язки, культура і родини**.

## Outcome
Model realistic bounded social behavior, cultural variation and memory.

## Scope and non-negotiable requirements
Friendship, conflicts, partnerships, family responsibility, social networks, trust, cultural transmission, language abstraction, social institutions, migration integration; avoid stereotypes and determinism by protected traits.

## Delegation and cost
Recommended roles: simulation-scientist,implementation-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-15.md`.

## Required acceptance gate
Causal interpersonal events stored, relationship consistency, social interaction scales.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 16-knowledge.md

# PROMPT 16: Знання, освіта і дослідження

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **16 Знання, освіта і дослідження**.

## Outcome
Separate global possible technologies from locally known and usable skills.

## Scope and non-negotiable requirements
Tech prerequisite graph, domain research points, knowledge carriers, learning, scholar/guild/school institutions, publications and diffusion; invention candidate availability vs usable adoption.

## Delegation and cost
Recommended roles: historian,domain-architect,implementation-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-16.md`.

## Required acceptance gate
Unknown technology cannot be used, adoption requires skills and materials, diffusion traceable.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 17-buildings.md

# PROMPT 17: Будівництво та інфраструктура

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **17 Будівництво та інфраструктура**.

## Outcome
Make settlements grow through real projects.

## Scope and non-negotiable requirements
Buildings, plots, materials, construction labor, structural types, durability, repair/upgrade, roads, aqueduct and public facilities as tech permits; construction queue and financing; no automatic replacement of all homes.

## Delegation and cost
Recommended roles: implementation-engineer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-17.md`.

## Required acceptance gate
Projects consume materials and workers, state changes visualized, tech preconditions enforced.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 18-cities.md

# PROMPT 18: Міста, урбанізація та міграція

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **18 Міста, урбанізація та міграція**.

## Outcome
Settlement creation, services, density, growth and decline.

## Scope and non-negotiable requirements
Found cities based on geography/logistics/agents/governance; housing, sanitation, labor, land prices, crowding, urban migration, abandonment and regional governance.

## Delegation and cost
Recommended roles: simulation-scientist,implementation-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-18.md`.

## Required acceptance gate
Cities can found, prosper, decline; population totals reconcile across cities and regions.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 19-transport.md

# PROMPT 19: Логістика, шопінг і подорожі

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **19 Логістика, шопінг і подорожі**.

## Outcome
NPC can travel, trade and vacation in existing mapped places.

## Scope and non-negotiable requirements
Transport modes by period (walk, horse, ship, rail, car, plane), speed/cost/capacity, routes/timetables, hotel inventory, tourist sites, shopping and travel preferences, booking, failure, cargo movement.

## Delegation and cost
Recommended roles: implementation-engineer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-19.md`.

## Required acceptance gate
Travel chain money/time/capacity/route validated; no teleportation; unloading region safe.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 20-policy.md

# PROMPT 20: Держави, закони, конфлікти й торгівля

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **20 Держави, закони, конфлікти й торгівля**.

## Outcome
Implement constrained political structures and policy effects.

## Scope and non-negotiable requirements
Leadership, legal rules, taxation, security, civic infrastructure, land rights, trade restrictions, conflict and displacement at abstract safe level. Allow change via endogenous institutions rather than prescriptive reenactment.

## Delegation and cost
Recommended roles: domain-architect,simulation-scientist. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-20.md`.

## Required acceptance gate
Policies have verifiable costs and outcomes; stress tests migration/revenue and unrest.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 21-population-integration.md

# PROMPT 21: Instagram target integration

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **21 Instagram target integration**.

## Outcome
Integrate official follower count when available with conservative fallback.

## Scope and non-negotiable requirements
Provider adapter with credentials and scopes documented, account type/permissions check, rate-limit, audit snapshots, no identity queries. Distinguish follower net difference and missing data. Admin manual target with provenance; do not fabricate followers.

## Delegation and cost
Recommended roles: implementation-engineer,security-reviewer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-21.md`.

## Required acceptance gate
Fake adapter integration tests, expiry/rate-limit/no-permission paths, no personally identifying data stored.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 22-history-corpus.md

# PROMPT 22: Історична база 1–2026

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **22 Історична база 1–2026**.

## Outcome
Create evidence-rich historical facts corpus by periods and geography.

## Scope and non-negotiable requirements
Prioritize authoritative sources, approximate vs exact dating, original invention vs spread vs improved use, before 1 CE baseline, contradictions, human-readable fact provenance and coverage ledger, large periods all candidates.

## Delegation and cost
Recommended roles: historian,data-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-22.md`.

## Required acceptance gate
Unit tests date bounds/duplicate claims/source records; no unsourced exact-year claims; coverage reports.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 23-history-pipeline.md

# PROMPT 23: Щоденний historical LLM pipeline

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **23 Щоденний historical LLM pipeline**.

## Outcome
Schedule one daily batch for 67.5 simulated years while honoring timestamp ordering.

## Scope and non-negotiable requirements
Research queue, retrieval/source validation, structured proposals, dedupe, dependency checking, retries, confidence gates, idempotency by interval+source, status states every candidate included, no code injection. If data cannot be found, record no verified additions.

## Delegation and cost
Recommended roles: historian,implementation-engineer,security-reviewer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-23.md`.

## Required acceptance gate
Mock LLM tests malformed/hostile text, retries, same interval idempotent, all proposals captured.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 24-content-engine.md

# PROMPT 24: Автоматичні розширення через дані

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **24 Автоматичні розширення через дані**.

## Outcome
Deliver safe versioned content loader and proposed mechanics workflow.

## Scope and non-negotiable requirements
Schemas for professions, materials, recipes, buildings, institutions, tools and knowledge; review lifecycle draft→validated→approved→scheduled→active; activation by sim year and local research. Engine change creates PR task, never executes output directly.

## Delegation and cost
Recommended roles: domain-architect,implementation-engineer,security-reviewer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-24.md`.

## Required acceptance gate
Safe validation rejects invalid dependencies, rollback/activation/replay, no live schema mutation.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 25-development-automation.md

# PROMPT 25: AI-generated pull requests and review

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **25 AI-generated pull requests and review**.

## Outcome
Connect approved proposals with coding agent tasks and independent checks.

## Scope and non-negotiable requirements
Issue generation with contracts and sources, isolated worktree/branch, lint/tests/schema/seeded regressions, reviewer escalation, PR with diff/evidence, human merge gate; avoid generated shell injection.

## Delegation and cost
Recommended roles: orchestrator,security-reviewer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-25.md`.

## Required acceptance gate
End-to-end sandboxed mock PR lifecycle, failed tests block merge, owner gate verified.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 26-public-api.md

# PROMPT 26: Публічне API і проєкції

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **26 Публічне API і проєкції**.

## Outcome
Serve real read-only state/history/analytics with cache and pagination.

## Scope and non-negotiable requirements
API for dashboard, year, regions, cities, professions, deaths, census, events, tech, map, article and NPC (privacy protected). Versioned contracts, rate limits, cache, query budgets, consistency markers and unknown data.

## Delegation and cost
Recommended roles: data-engineer,implementation-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-26.md`.

## Required acceptance gate
Contract + auth/rate-limit/error tests, real fixture counts reconcile to event history.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 27-renderer.md

# PROMPT 27: Жива 2D-мапа Phaser

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **27 Жива 2D-мапа Phaser**.

## Outcome
Implement observer view over server simulation, not local authoritative AI.

## Scope and non-negotiable requirements
Tile/chunk renderer, region/city zoom, movement animations at active LOD, landmarks, historical epoch visual styles, visible filters, selected NPC info, sockets for updates and recovery from disconnect.

## Delegation and cost
Recommended roles: frontend-engineer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-27.md`.

## Required acceptance gate
Playwright+visual smoke, no >target resource issues, no hardcoded fake data, offline/online state.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 28-web-archive.md

# PROMPT 28: Публічний сайт і хроніка

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **28 Публічний сайт і хроніка**.

## Outcome
Build interactive historical encyclopedia, geography, analytics and timelines.

## Scope and non-negotiable requirements
Vue site dashboard, age/sex distribution, population, death causes, jobs, economics, cities, innovations, event links, date slider and comparator. Loading and uncertainty/unknown labels; localization UA/EN optionally RU.

## Delegation and cost
Recommended roles: frontend-engineer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-28.md`.

## Required acceptance gate
Responsive accessibility tests, all numbers from API, historic year snapshots consistent.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 29-narratives.md

# PROMPT 29: AI-літописець і журналіст

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **29 AI-літописець і журналіст**.

## Outcome
Generate readable daily/yearly stories grounded exclusively in event store.

## Scope and non-negotiable requirements
Event evidence IDs, aggregate metric sources, anti-hallucination checker, summarization prompts for headlines, article, chronology and Reels script; cite underlying simulated event, separate historical real-world references.

## Delegation and cost
Recommended roles: historian,implementation-engineer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-29.md`.

## Required acceptance gate
Synthetic benchmark fabricated events rejected, every statement traceable, regenerate stable on same input.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 30-admin.md

# PROMPT 30: Адмінпанель, контроль і модерація

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **30 Адмінпанель, контроль і модерація**.

## Outcome
Owner dashboard to approve historical proposals, releases, season ops.

## Scope and non-negotiable requirements
RBAC admin login, proposal statuses all/all deferred reasons, audit log, season pause/resume, backups, release notes, forecast follower target; no automatic destructive operations.

## Delegation and cost
Recommended roles: frontend-engineer,security-reviewer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-30.md`.

## Required acceptance gate
E2E admin permission tests, approval required for risky operations, audit accurate.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 31-scale.md

# PROMPT 31: Масштабування і рівні деталізації

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **31 Масштабування і рівні деталізації**.

## Outcome
Optimize for 10k+ residents and 2k years with bounded server costs.

## Scope and non-negotiable requirements
LOD active/distant aggregate, event scheduling, memory compression, spatial indexes, predictable stepping, batching, profiling, caching projections, db partitioning, multi-year accelerated throughput; reconciliation across LOD promotion.

## Delegation and cost
Recommended roles: simulation-scientist,data-engineer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-31.md`.

## Required acceptance gate
Benchmark on named hardware, measured p50/p95 and cost, deterministic scenario preserved.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 32-resilience.md

# PROMPT 32: Надійність і спостережуваність

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **32 Надійність і спостережуваність**.

## Outcome
Recover from outages, drift, queue duplicates, research failures.

## Scope and non-negotiable requirements
Telemetry, OpenTelemetry if useful, structured logs, alerts, dead letters, retries, backup restore drills, disaster recovery, rate-limits, access controls, anomaly gates for population and economy.

## Delegation and cost
Recommended roles: data-engineer,security-reviewer,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-32.md`.

## Required acceptance gate
Fault injection and restore from backup; reproducible restart and integrity; alerts test.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 33-calibration.md

# PROMPT 33: Калібрування й довгі симуляції

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **33 Калібрування й довгі симуляції**.

## Outcome
Compare model outputs to reference qualitative/historical constraints, not claim exact realism.

## Scope and non-negotiable requirements
100/500/2025 year dry runs across many seeds, sensitivity to fertility, disease, market shocks and transport; statistical metric definitions; identify unrealistic outcomes and balance changes.

## Delegation and cost
Recommended roles: simulation-scientist,qa-engineer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-33.md`.

## Required acceptance gate
Report distributions, seeds, failures, assumptions and limitations; zero critical invariant breaks.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 34-full-rehearsal.md

# PROMPT 34: Генеральна репетиція 30-денного сезону

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **34 Генеральна репетиція 30-денного сезону**.

## Outcome
Rehearse 1–2026 simulation faster than real time with historical batch proposals.

## Scope and non-negotiable requirements
Backfill source corpus, scripted stress tests 10k population, all yearly metrics, research status, snapshots, web dashboard, rollback and backup; compare clock progression.

## Delegation and cost
Recommended roles: orchestrator,qa-engineer,security-reviewer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-34.md`.

## Required acceptance gate
Signed checklist: no blockers, real performance numbers, historical coverage ledger, release readiness.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 35-production.md

# PROMPT 35: Production launch and rollback

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **35 Production launch and rollback**.

## Outcome
Deploy audited build with owner approval only.

## Scope and non-negotiable requirements
Reproducible Docker build; infrastructure plan, managed DB, secrets, domain/TLS, observability, backups, feature flags, rollout phases, staged season start, owner runbook.

## Delegation and cost
Recommended roles: orchestrator,security-reviewer. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-35.md`.

## Required acceptance gate
Staging pass, approved migration, smoke/rollback validated, no automatic production changes.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 36-post-launch.md

# PROMPT 36: Післярелізна робота і сезони

> Copy everything below into Claude Code after prior phases are COMPLETE. Do not launch multiple numbered phases in one turn.

Ти — Orchestrator проєкту Civilization. Прочитай `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/ARCHITECTURE_DECISIONS.md`, `docs/PHASE_LEDGER.md`, поточний код і наявні тести. Ця фаза — **36 Післярелізна робота і сезони**.

## Outcome
Monitor, publish public daily reports, fix issues without corrupting world history.

## Scope and non-negotiable requirements
Daily data-quality and historical agent status, feature flags, versioned retroactive correction protocol, archive snapshots, retention, first season end and future scenarios; non-destructive history corrections.

## Delegation and cost
Recommended roles: orchestrator,documentarian. Use Haiku for bounded scouting/documentation, Sonnet for typical implementation/test tasks, Opus for difficult cross-system architecture/science. Do not launch agents when unnecessary. Give each subagent an explicit task contract, file ownership, required output and compact context. Track actual token usage where supported; never invent savings or measured costs.

## Execution instructions
1. First audit the repo and identify prerequisites and any incompatible preexisting behavior. If prerequisites incomplete, fix or mark blocking issue rather than pretending this phase is complete.
2. Draft an actionable subtask plan with file ownership, schema contracts, rollback, deterministic fixtures and test cases. Make sensible assumptions, record them in ADR rather than interrupting for minor questions.
3. Implement **real** functioning capability and tests, including all relevant edge cases. Keep cross-domain schemas stable and versioned. Use migrations for persistent changes.
4. Independently verify against `docs/PRODUCT_CONSTITUTION.md`, run real commands, fix failures, and check for race/data/security/performance issues.
5. Record exact commands, outputs, changes, unresolved limitations and next prompt in `docs/PHASE_LEDGER.md` and `templates/PHASE_REPORT.md` copy under `docs/reports/phase-36.md`.

## Required acceptance gate
Runbook tested, first week monitoring, published known limitations and postmortem template.

## Cross-cutting non-negotiable checks
No follower identities, no fabricated history or analytics, no arbitrary runtime AI-written production code, no silent changes to 1–2026/30-day time, no forced instant adoption of technologies, no implausible forced population exactness. Every stored event must remain traceable, replayable and deterministic where specified. If this phase is not relevant to some constraints, state 'not applicable' explicitly.

## Final response
Report DONE / BLOCKED with evidence, changed files, actual tests and benchmark (if relevant), known limitations, next file `docs/PHASE_INDEX.md` indicates. Never mark done merely because code compiles.



---

## 90-repair.md

# 90-repair: Reusable Orchestrator prompt
Ти — Orchestrator Civilization. Read product constitution, current ledger, ADRs and the relevant skills. Investigate CURRENT failing phase without progressing. Read latest report + error logs, reproduce, identify root cause, fix with minimal bounded change, add regression test, rerun exact failed gate, request independent review, update ledger. Never hide failing tests or relax invariants solely to pass.
Return actions taken, test evidence, exact changed files, open risks and recommended next step. Use constrained delegation and NEVER self-deploy.



---

## 91-gap-audit.md

# 91-gap-audit: Reusable Orchestrator prompt
Ти — Orchestrator Civilization. Read product constitution, current ledger, ADRs and the relevant skills. Perform hostile systematic product-completeness audit. Examine constitution and actual implementation. Build coverage matrix for all domains and flows: age, households, women/men and unknown cases, fertility, twins, diseases, crime, economy, professions, education, trade, research, wars/policy, travel, climate, language/culture, housing, disasters, migration, aging, death, archival data, historical evidence, privacy, scale, 30-day clock, follower target, public analytics. Find contradictions, missing events, false assumptions, untested edge cases; rank by risk and create executable prompts for missing work. Save docs/GAP_REGISTER.md. Do not implement unrelated features or claim completeness.
Return actions taken, test evidence, exact changed files, open risks and recommended next step. Use constrained delegation and NEVER self-deploy.



---

## 92-cost-audit.md

# 92-cost-audit: Reusable Orchestrator prompt
Ти — Orchestrator Civilization. Read product constitution, current ledger, ADRs and the relevant skills. Audit Claude Code delegation usage from actual available session logs/usage metadata. Compare costly opus calls, redundant subagent retries, excessive context loading, unnecessary agent parallelism. Propose measured optimizations: scoped files, cacheable research, haiku scout, sonnet implementation, opus architecture only. No invented token/cost figures.
Return actions taken, test evidence, exact changed files, open risks and recommended next step. Use constrained delegation and NEVER self-deploy.



---

## 93-review-release.md

# 93-review-release: Reusable Orchestrator prompt
Ти — Orchestrator Civilization. Read product constitution, current ledger, ADRs and the relevant skills. Independently challenge release candidate. Check all phase gates, dependency graph, security, DB integrity, deterministic replay, backups, failover, LLM output injection, historic sources, public analytics validity, performance benchmark and rollback. Produce signed GO/NO-GO with blockers. Do not deploy.
Return actions taken, test evidence, exact changed files, open risks and recommended next step. Use constrained delegation and NEVER self-deploy.



---

## 94-new-domain.md

# 94-new-domain: Reusable Orchestrator prompt
Ти — Orchestrator Civilization. Read product constitution, current ledger, ADRs and the relevant skills. A new capability is requested. Create a structured feature proposal: scope, ontology/schema extension, affected systems, UI, invariants, historical constraints, tests, data migration, performance, security, story/analytics updates and rollback. Compare content-only vs engine-code; develop small implementation prompt, update traceability matrix. Do not code until dependencies identified.
Return actions taken, test evidence, exact changed files, open risks and recommended next step. Use constrained delegation and NEVER self-deploy.



---

## 95-historical-batch.md

# 95-historical-batch: Reusable Orchestrator prompt
Ти — Orchestrator Civilization. Read product constitution, current ledger, ADRs and the relevant skills. Run one **sandbox/staging** historical intake for requested sim interval. Collect ALL credible relevant candidate facts (not artificially top-N); include exact/approx dates and location, alternative citations, independent confidence, prerequisites, diffusions, dedupe and coverage ledger, no forced inventions. Produce JSON proposals matching versioned schema. Report NONE VERIFIED if so. Never auto-deploy or execute generated code.
Return actions taken, test evidence, exact changed files, open risks and recommended next step. Use constrained delegation and NEVER self-deploy.



---

## 96-world-integrity.md

# 96-world-integrity: Reusable Orchestrator prompt
Ти — Orchestrator Civilization. Read product constitution, current ledger, ADRs and the relevant skills. Perform a 2025-year accelerated integrity audit across multiple seeds, focusing on conservation of money/materials, population nonnegative, family lineage DAG, age and life stage, shortage logic, no teleportation, knowledge gate, geographic routes, immortal event ledger and snapshot restoration. Summarize metrics and reproducible seeds; fail if broken.
Return actions taken, test evidence, exact changed files, open risks and recommended next step. Use constrained delegation and NEVER self-deploy.



---

## 97-session-handoff.md

# 97-session-handoff: Reusable Orchestrator prompt
Ти — Orchestrator Civilization. Read product constitution, current ledger, ADRs and the relevant skills. Create compact handoff under docs/HANDOFF.md with exact current git status, completed/blocked phases, changed files, known issues, tests last run, next prompt and state of keys/infra without secrets. Ensure future Claude session can proceed without rereading huge chats.
Return actions taken, test evidence, exact changed files, open risks and recommended next step. Use constrained delegation and NEVER self-deploy.



---

## 98-contradiction-audit.md

# 98-contradiction-audit: Reusable Orchestrator prompt
Ти — Orchestrator Civilization. Read product constitution, current ledger, ADRs and the relevant skills. Identify mutually inconsistent goals and edge constraints: population exactness vs organic births, real historical year vs alternate tech adoption, 30 day clock vs long lifetimes, source coverage vs incomplete historical records, every topic implemented vs build capacity. Recommend explicit tradeoffs and acceptance criteria; ask owner only for material policy changes.
Return actions taken, test evidence, exact changed files, open risks and recommended next step. Use constrained delegation and NEVER self-deploy.



---

## 99-incident-response.md

# 99-incident-response: Reusable Orchestrator prompt
Ти — Orchestrator Civilization. Read product constitution, current ledger, ADRs and the relevant skills. Incident in staging/production: freeze unsafe changes, snapshot facts/logs, protect integrity, quantify impact, run read-only diagnostics, propose reversible repair and verification. Never delete world history or retroactively rewrite without owner-approved correction record.
Return actions taken, test evidence, exact changed files, open risks and recommended next step. Use constrained delegation and NEVER self-deploy.



---

## START-HERE.md

# First message for Claude Code
Read `CLAUDE.md`, `docs/PRODUCT_CONSTITUTION.md`, `docs/WORKFLOW.md`, `docs/PHASE_INDEX.md`. You are lead Orchestrator of a fully AI-coded Civilization project. Verify custom subagents and skills can be discovered in this installed Claude Code version. Never silently reframe requirements. Begin now with `prompts/00-bootstrap.md`. Work until that phase passes its measurable acceptance gates, then STOP and summarize evidence and next prompt. Do not auto-advance to later phases without human decision, do not deploy production.

