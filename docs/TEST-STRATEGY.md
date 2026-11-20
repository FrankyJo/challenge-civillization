# Test strategy and acceptance gates

## Pyramid

- Pure unit tests for policies, clocks, PRNG streams, units, and state transitions.
- Property/model-based tests for demographic, kinship, accounting, inventory, technology, and spatial invariants.
- Contract tests for commands/events/APIs/content schemas and backward compatibility.
- Repository/integration tests with real PostgreSQL/Redis for transactions, idempotency, leases, outbox, retries, and migrations.
- Deterministic replay/golden tests using canonical event/state hashes.
- Scenario tests spanning families, economy, health, technology, conflict, and archive projections.
- Playwright accessibility and public/admin journey tests.
- Load, soak, chaos, backup/restore, and security tests before launch.

## Mandatory scenarios

1. Seed exactly 10,000 consistent living NPCs at 1 CE.
2. Same inputs replay to identical event and state hashes.
3. Different seeds diverge without violating invariants.
4. Birth creates person, kinship, guardianship, household effects, and analytics.
5. Parent death triggers estate/dependent handling; no orphan has an undefined guardian state.
6. Death stops future behavior and reconciles cause-of-death aggregates.
7. Subscriber target change produces bounded causal responses, never direct silent population edits.
8. Name selection honors era/culture and deterministic fallback/provenance.
9. Food/water scarcity changes health, migration, prices, and deaths without negative stock.
10. Epidemic progression respects exposure/treatment capabilities and conserves population accounting.
11. Double-entry transactions balance; failed trades do not partially transfer goods/money.
12. Technology cannot be used before prerequisites/materials/skills/diffusion.
13. Cross-region movement is idempotent under retry and partial consumer failure.
14. Duplicate command/job delivery produces one effect.
15. Losing/reacquiring a world lease never advances a tick twice.
16. Projection rebuild equals live projection and reconciles to authoritative state.
17. Historical map snapshot+deltas equals the canonical spatial state for the same cursor.
18. Archive generator rejects unsupported numbers, entities, chronology, and causal claims.
19. Malicious research content cannot alter prompts, code, approvals, or secrets.
20. Public API enforces pagination/rate limits and never leaks admin/private fields.
21. WebSocket reconnect resumes or falls back cleanly after a cursor gap.
22. Migration from the previous release preserves events and supports rolling compatibility.
23. Backup restores into a clean environment and replay continues from the checkpoint.
24. Accelerated 1–2026 CE run completes within launch budget with no invariant violation or unbounded memory growth.

## Gates

**Per change:** formatting, lint, typecheck, focused tests, changed-contract/migration checks.

**Per phase:** all above plus relevant integration/scenario suites, documentation, telemetry, threat/risk notes, and an independent review with critical/high findings resolved.

**Pre-launch:** full deterministic accelerated season; load/soak; security/privacy; accessibility; backup/restore; disaster rehearsal; historical content provenance audit; production runbook; rollback; operator sign-off.

## Evidence

Every phase report records commit/hash, environment, command lines, exit status, test counts, benchmark inputs/results, known flakes, coverage of acceptance criteria, and unresolved risks. “Tests passed” without reproducible evidence is insufficient.
