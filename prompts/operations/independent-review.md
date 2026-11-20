# Independent implementation review prompt

Review the specified phase/change independently. Read its prompt, acceptance criteria, relevant specs/ADRs, diff, callers, tests, migrations, and phase report. Run targeted checks when safe.

Look specifically for correctness/invariant breaks, non-determinism, event/data loss, idempotency/concurrency failures, authorization/privacy leaks, unsupported historical claims, AI trust-boundary violations, migration/rollback hazards, projection drift, accessibility regressions, performance cliffs, and tests that pass for the wrong reason.

Report findings only, ordered critical/high/medium/low. Each finding must include exact evidence, user/system impact, reproduction or reasoning, and a concrete remediation. Then provide an acceptance-criteria coverage table and identify unverified claims. Do not approve based on style, test count, or author assertions.
