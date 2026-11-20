# Release audit prompt

Evaluate a release candidate without deploying it. Verify immutable artifact and dependency provenance, migration compatibility/lock risk, config/content/schema versions, deterministic replay fixtures, phase gates, security/privacy/accessibility, performance budgets, observability/alerts, backup/restore evidence, rollback, open findings, and operator documentation.

Return go/no-go with evidence. “Go” requires every mandatory gate to have reproducible passing evidence and no critical/high unresolved issue. List manual approvals still required. Never infer production authorization or change production state.
