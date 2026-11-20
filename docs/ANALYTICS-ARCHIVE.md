# Analytics, map, and archive specification

## Definitions before dashboards

Each metric has a versioned definition, grain, dimensions, numerator/denominator, inclusion rules, unknown handling, unit, source events, and reconciliation query. Never silently map unknown sex/gender, occupation, location, or cause of death into a known category.

Required yearly and rolling metrics include living population; births/deaths and crude rates; age distribution; recorded sex/gender categories; households and dependency; migration; mean age at death; separately modeled life expectancy; structured causes of death; disease burden; occupation and unemployment; production/consumption; prices and real wages; wealth/income distribution; settlement populations; education; technology adoption; conflict and disaster impacts.

## Projection strategy

- Streaming/event-driven current counters for the live dashboard.
- Idempotent yearly aggregates for historical charts.
- Periodic reconciler recomputes from authoritative data and raises discrepancies.
- Definition changes create a new metric version and backfill job; published values remain reproducible.

## Public map

Phaser renders vector/tile layers, clustered population, settlements, routes, borders, environment, alerts, and sampled movement. At low zoom, show aggregates; at high zoom, show a bounded sample or viewport-relevant entities. Never send all 10,000 detailed NPC records on every tick.

Historical replay loads the nearest immutable map snapshot and applies ordered spatial deltas to the requested cursor/year. Public URLs can deep-link to year, location, entity, and selected layers.

## Archive information architecture

- `/timeline` for chronological discovery
- `/years/:year` annual summary and statistics
- `/events/:id` evidence-backed event page
- `/people/:id`, `/families/:id`, `/places/:id`, `/organizations/:id`, `/technologies/:id`
- `/analytics/*` definitions and charts
- `/map?year=` live or historical map
- `/methodology` model limits, uncertainty, and content provenance

Search indexes projections and article text, but canonical links resolve to stable IDs. Corrections preserve prior versions and show a public correction note.

## Accessibility and performance

Every chart has a table/text equivalent, keyboard navigation, semantic labels, sufficient contrast, and reduced-motion behavior. Map-only facts have a list alternative. Set budgets for initial JS, API p95, WebSocket delta size, and frame rate on target low/mid devices; enforce them in CI/staging.
