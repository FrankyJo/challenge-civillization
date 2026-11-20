# Phase 21 — admin review and world operations

Read `prompts/PHASE-CONTRACT.md`, `docs/DATA-AND-AI.md`, and `docs/SECURITY-OPERATIONS.md`. Request a security review.

Implement authenticated/authorized admin functions for proposal/source/domain review, sandbox results, content promotion/rollback, archive review, world status, safe pause/resume, bounded catch-up/single-step where permitted, projection rebuild, incident notes, and audit-log viewing. Separate visitor/editor/operator/admin permissions.

Sensitive actions require server authorization, recent authentication, reason, confirmation, idempotency, audit event, and clear outcome. Production deploy, destructive event mutation, secret access, and unattended AI approval remain unavailable. CSRF/session/cookie and rate-limit protections must match the chosen auth design.

Acceptance: privilege matrix tests deny cross-role actions; UI hiding is not authorization; duplicate sensitive requests have one effect; every action is attributable and reviewable; approval separation is enforced; pause/resume preserves tick integrity; threat model and operator runbooks are updated; accessibility and error recovery pass.
