# Incident diagnosis prompt

Follow `.claude/skills/incident-debugging/SKILL.md` and `docs/SECURITY-OPERATIONS.md`. Protect authoritative history first. Establish severity, impact, first/last known-good cursor, versions, seed/config/content, correlations, and whether continued writes are dangerous. Recommend an authorized pause if necessary.

Reproduce or gather evidence; rank hypotheses; run discriminating checks; identify root cause; implement the smallest safe fix only if authorized; add regression tests; reconcile/rebuild projections; verify replay/state hashes; and draft incident timeline, recovery, user communication facts, and prevention. Never delete/rewrite events or hide discrepancies.
