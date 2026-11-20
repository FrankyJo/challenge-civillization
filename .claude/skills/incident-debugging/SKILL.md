---
name: incident-debugging
description: Diagnose and safely fix hard simulation, data-integrity, concurrency, replay, or performance failures with evidence and regression tests.
---

# Incident debugging

First classify whether continued writes threaten authoritative integrity. If yes, recommend/execute only an authorized safe pause; never delete, rewrite, or reset evidence.

Capture symptom, first/last known good cursor, engine/config/content versions, seed, correlation IDs, environment, and minimal reproduction. Build ranked hypotheses with discriminating checks. Instrument narrowly, reproduce, and identify the causal chain before editing. Fix the smallest responsible layer, add a regression test, replay/reconcile affected projections, and run surrounding gates.

If authoritative correction is required, design append-only compensating events and an audited operator procedure. Record customer/public impact, recovery, and preventive action in a postmortem.
