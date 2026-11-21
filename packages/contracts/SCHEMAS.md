# Contract schemas

Generated from `src/catalog.ts` by `pnpm --filter @civ/contracts schemas:write`. Do not edit by hand;
`src/schema-docs.test.ts` fails when these files drift from the code.

Rules: see `docs/CONTRACTS.md`. Public contracts may be returned by public endpoints; internal
contracts must never be, except through an explicit public DTO allowlist.

| Contract | Version | Audience | Schema | Description |
| --- | --- | --- | --- | --- |
| `world-record` | 1 | internal | [schema](schemas/world-record.v1.schema.json) | Immutable world identity: seed, CE calendar span, launch versions, audit fields. |
| `public-world` | 1 | public | [schema](schemas/public-world.v1.schema.json) | Public world metadata (allowlist: schemaVersion, worldId, name, seed, startYear, endYear, versions). |
| `season-record` | 1 | internal | [schema](schemas/season-record.v1.schema.json) | Season schedule (UTC window), lifecycle status, public status note, audit fields. |
| `public-season` | 1 | public | [schema](schemas/public-season.v1.schema.json) | Public season metadata (allowlist: schemaVersion, seasonId, worldId, number, status, startsAt, endsAt, statusNote). |
| `simulation-instant` | 1 | public | [schema](schemas/simulation-instant.v1.schema.json) | Integer tick plus derived CE year and day of year. |
| `version-stamp` | 1 | public | [schema](schemas/version-stamp.v1.schema.json) | Engine semver plus content and config digests every transition runs under. |
| `command-envelope` | 1 | internal | [schema](schemas/command-envelope.v1.schema.json) | Every registered command variant with its audit envelope. |
| `event-envelope` | 1 | internal | [schema](schemas/event-envelope.v1.schema.json) | Every registered domain event variant with its audit envelope. |
| `event-cursor` | 1 | public | [schema](schemas/event-cursor.v1.schema.json) | Decoded event ledger cursor: world and number of events consumed. |
| `event-cursor-string` | 1 | public | [schema](schemas/event-cursor-string.v1.schema.json) | Wire form of an event cursor: v1.<worldId>.<position>. |
| `checkpoint` | 1 | internal | [schema](schemas/checkpoint.v1.schema.json) | Canonical state checkpoint metadata: ledger position, instant, state hash, versions. |
| `ledger-notification` | 1 | internal | [schema](schemas/ledger-notification.v1.schema.json) | Outbox/queue notice that a world's ledger grew; consumers read facts from the ledger, not the notice. |
| `map-params` | 1 | internal | [schema](schemas/map-params.v1.schema.json) | World map generator parameters: grid size and spacing, latitude, temperature, land share, relief, regions. |
| `world-map` | 1 | internal | [schema](schemas/world-map.v1.schema.json) | Authoritative generated map: per-cell terrain, climate, drainage, resources and hazards with units; regions, water bodies, deposits; content hash. |
| `public-map-snapshot` | 1 | public | [schema](schemas/public-map-snapshot.v1.schema.json) | Compact renderer-agnostic map projection: terrain, biome, elevation band, coast/river and regions only. |
| `content-pack` | 1 | internal | [schema](schemas/content-pack.v1.schema.json) | Versioned content pack: fictional cultures and naming systems, constructed-language name datasets with eras and provenance, demography table, citations. |
| `seed-population` | 1 | internal | [schema](schemas/seed-population.v1.schema.json) | A world's initial living people with kinship, guardianship, households, settlements, health, capabilities and name provenance. |
| `world-data` | 1 | internal | [schema](schemas/world-data.v1.schema.json) | Simulation-owned world state data: names the seed population by hash. |
| `api-error` | 1 | public | [schema](schemas/api-error.v1.schema.json) | The single HTTP error body: stable code, safe message, correlation ID, issue details. |
| `health-report` | 1 | public | [schema](schemas/health-report.v1.schema.json) | Liveness/readiness report served by every Node process. |
| `proposal` | 1 | internal | [schema](schemas/proposal.v1.schema.json) | Historical content proposal and its lifecycle state. |
| `source-record` | 1 | internal | [schema](schemas/source-record.v1.schema.json) | Cited source with locator, licence, checksum and verification status. |
| `proposal-review` | 1 | internal | [schema](schemas/proposal-review.v1.schema.json) | One stage decision on a proposal with reviewer identity and findings. |
