# Phase 24 — security, privacy, observability, and recovery

Read `prompts/PHASE-CONTRACT.md` and `docs/SECURITY-OPERATIONS.md`. Commission independent security review.

Complete threat model, data inventory/retention, dependency/secret scanning, auth/session hardening, network/security headers, input and output limits, audit integrity, prompt-injection defenses, least-privilege deployment identities, and production-safe configuration. Implement structured logs, metrics, traces, dashboards, SLOs/alerts, and runbooks.

Implement backups and an automated restore rehearsal into a clean environment, with checksums, event continuity, projection rebuild, and deterministic continuation verification. Define RPO/RTO and incident roles/status communication.

Acceptance: critical/high security findings resolved; no subscriber identity or secret leakage paths; alerts map to runbooks and are tested; backup restore meets RPO/RTO and state/event hashes; corrupted projections rebuild; access/audit tests pass; dependency licenses/provenance are documented; production readiness review is evidence-backed.
