# Implementation plan

Execute in order. A later phase may begin only when prerequisites are complete or the deviation is recorded in an ADR.

| Phase | Outcome | Primary gate |
|---:|---|---|
| 00 | Repository/tooling bootstrap | clean install + base CI |
| 01 | Executable contracts and architecture tests | schemas/types compile |
| 02 | Deterministic clock, IDs, PRNG, units | replay primitives pass |
| 03 | PostgreSQL event/state/outbox foundation | retry/idempotency integration |
| 04 | Geography, environment, resources, map generation | seeded map reproducibility |
| 05 | 10k population, cultures, era-aware names | exact/valid seed audit |
| 06 | Time runner, leases, checkpoints, 30-day schedule | no duplicate/missed tick |
| 07 | Birth, aging, death, kinship, households | lifecycle properties pass |
| 08 | Needs, health, disease, nutrition, mortality | conservation/calibration gates |
| 09 | Labor, skills, occupations, production/inventory | resource balance |
| 10 | Money, ownership, markets, trade, taxation | ledger balance/idempotency |
| 11 | Settlements, buildings, infrastructure, migration | capacity/spatial invariants |
| 12 | Governance, law, organizations, conflict | authority/state-machine tests |
| 13 | Knowledge, education, technology, diffusion | prerequisite/diffusion tests |
| 14 | Culture, language, religion, information | provenance/bounded influence |
| 15 | Subscriber target adapter/controller | privacy + bounded response |
| 16 | Historical content + AI proposal pipeline | injection/evidence/promotion gates |
| 17 | Analytics projections and reconciler | rebuild/reconcile equality |
| 18 | Public API, WebSocket cursors, caching | contract/load/security gates |
| 19 | Vue application and accessible analytics/archive | Playwright/a11y budgets |
| 20 | Phaser live/historical map | FPS/delta/replay equality |
| 21 | Admin review and world operations | RBAC/audit/approval tests |
| 22 | Archive article generation/search/entity graph | claim-support verifier |
| 23 | Performance, partitioning, soak and failure tests | accelerated season budget |
| 24 | Security, privacy, observability, backup/restore | operational readiness |
| 25 | Staging dress rehearsal and content audit | launch checklist sign-off |
| 26 | Production launch and 30-day season operations | monitored launch approval |
| 27 | Season completion, freeze, export, retrospective | archive reproducibility |

## Cross-phase rules

Each phase adds production behavior, tests, telemetry, and documentation together. Use feature flags for incomplete public behavior. Preserve backward compatibility of committed events/content. Any metric or model abstraction must document definition and limitations. Phase reports live under `docs/phase-reports/NN.md` once implementation begins.
