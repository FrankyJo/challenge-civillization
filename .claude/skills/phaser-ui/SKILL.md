---
name: phaser-ui
description: Implement a scalable Vue/Phaser live and historical map as a non-authoritative, accessible projection client.
---

# Phaser UI

Vue owns routing, page state, data fetching, accessibility, overlays, and admin/public shells. Phaser owns the high-frequency canvas map. Communicate through a narrow typed adapter; never duplicate simulation logic in either client.

Use snapshot cursor + ordered deltas, with gap detection and HTTP resync. Aggregate/clustering depends on zoom and viewport. Pool render objects, batch layers, cap animations, avoid per-frame allocation, and degrade detail before frame rate. The browser never downloads every private field or every event.

Historical replay loads nearest snapshot then deltas to target cursor. Add reduced motion, keyboard/list alternatives, focus management, contrast, screen-reader summaries, and deterministic visual fixtures. Test representative low/mid devices and enforce payload/frame/JS budgets.
