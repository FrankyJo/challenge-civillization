# Phase 19 — Vue public archive and analytics site

Read `prompts/PHASE-CONTRACT.md`, `docs/PRODUCT.md`, and `docs/ANALYTICS-ARCHIVE.md`. Use `/archive-analytics` and `/phaser-ui` where relevant.

Build the Vue application shell and public routes: home/live status, timeline, year page, event/entity pages, analytics dashboards, methodology/data-quality, global search shell, and map container. Use typed API clients, query caching, error/loading/empty/offline states, shareable URLs, localization-ready formatting, and a cohesive design system.

Every chart has a table/text alternative, definition/units/source version, unknown handling, keyboard navigation, semantic labels, reduced motion, and responsive behavior. Do not fabricate demo numbers outside clearly isolated development fixtures.

Acceptance: representative visitor journeys pass Playwright; automated accessibility checks plus keyboard/screen-reader smoke review pass; route/data errors recover; analytics match API fixtures; JS/LCP/API-call budgets are enforced; no authoritative logic exists in the client.
