# ADR 0001: Authoritative event-driven modular monolith

- Status: Accepted
- Date: 2026-11-20

## Context

The product needs a headless, deterministic simulation, permanent history, public projections, background AI proposals, and independent scaling without premature distributed-system complexity.

## Decision

Use a TypeScript monorepo with separately deployable API, simulation, worker, and web processes. PostgreSQL stores authoritative current state plus an append-only event ledger transactionally; an outbox drives idempotent projections/jobs. Redis/BullMQ is non-authoritative. Vue/Phaser consumes versioned public projections.

## Consequences

Replay, audit, and archive generation are first-class. Strong module boundaries and contracts are required. Storage volume is higher than state-only persistence. Projection lag/rebuild must be operated. A future service split is possible at process/module boundaries, but requires measured need and a new ADR.
