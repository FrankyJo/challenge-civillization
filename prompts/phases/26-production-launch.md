# Phase 26 — production launch and 30-day season operations

This phase requires explicit human production authorization. Read the approved launch record, `prompts/PHASE-CONTRACT.md`, and operations runbooks. Do not infer permission from earlier development work.

Promote only the frozen, signed engine/config/content artifacts. Verify backup, migrations, environment, secrets, initial world hash, exact 10,000 living NPCs, year 1, subscriber aggregate adapter privacy, public status, dashboards, alerts, and rollback before opening traffic. Record the configured UTC start/end and season mapping.

During the season, monitor tick lag, leases, invariants, event/projection cursors, API/map performance, storage, queues, AI proposal isolation, and public status. Use audited pause/catch-up/schedule-change procedures. Do not hot-edit events/content or let AI auto-promote changes.

Acceptance: authorized launch checklist is signed; public metadata exposes seed/config/content/engine and methodology; first checkpoints/replays reconcile; monitoring/on-call function; changes follow controlled release; incidents and public corrections are recorded. Continue operations through the season under the runbook, not an unbounded agent loop.
