# Security, observability, and operations

## Threat boundaries

Treat public input, historical sources, LLM output, uploaded content, WebSocket clients, admin commands, and queue payloads as untrusted. Validate size/schema, authorize at the server, escape output, and keep secrets out of prompts/logs.

Roles: visitor (read-only), editor (article/proposal review), operator (world controls), administrator (access/config). Sensitive operations require recent authentication, least privilege, reason text, idempotency, and an immutable audit event. Production content promotion and clock manipulation are never delegated to an unattended agent.

## Observability

Structured logs include world, season, tick/year, process, correlation/causation, content/engine version, and error class. Metrics cover tick duration/backlog, lease state, event rate, queue depth/retries, projection lag, API latency/error/cache hit, WebSocket clients/gaps, DB/Redis health, population/invariant sentinels, LLM cost/failure, and proposal state age. Traces join API/admin commands, ticks, outbox, workers, and projections.

Alerts are symptom-based and actionable. Every page links to a runbook. Avoid high-cardinality person IDs in metrics; use logs/traces with retention controls.

## World controls

Pause stops new tick claims after the current transaction. Resume checks lease/checkpoint/queue consistency. Single-step and bounded catch-up are staging/operator actions. Any clock schedule change produces an audit event and a public status note during a live season.

## Recovery objectives

Define and test RPO/RTO before launch. Back up PostgreSQL plus content/object manifests. Redis is rebuildable. Restoration verifies checksums, event continuity, projection rebuild, and deterministic continuation. A corrupted projection is dropped/rebuilt; authoritative event deletion is never the recovery method.

## Incident levels

- SEV-1: double advancement, event loss/corruption, unauthorized privileged action, secret exposure.
- SEV-2: season clock materially behind, public outage, projection/archive inconsistency, severe performance degradation.
- SEV-3: bounded feature failure or inaccurate non-authoritative display.

During incidents: protect authority, pause when continued writes risk integrity, preserve evidence, communicate status, restore/reconcile, then write a blameless postmortem with preventive tests.
