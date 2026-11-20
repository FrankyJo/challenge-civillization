---
name: quality-gates
description: Derive and run evidence-based acceptance gates for simulation, API, data, UI, performance, security, and operations.
---

# Quality gates

Read `docs/TEST-STRATEGY.md`. Map every acceptance criterion to at least one evidence source: automated test, benchmark, migration verification, manual exploratory check, or documented review. Prefer behavior/invariant tests over snapshots of implementation details.

Run the narrowest useful checks during iteration and the complete relevant gate before declaring success. Record exact commands, environment, counts, exit status, benchmark dataset, percentiles, seed/config/content versions, and unresolved risk. A skipped/flaky test is a failure unless explicitly quarantined with an owner and expiry.

Independent review must inspect the diff/callers and run targeted checks. Resolve critical/high findings; document lower findings. Never change a threshold or assertion merely to make the gate pass.
