# Contracts specification

Executable source: `packages/contracts/src`. Generated JSON Schemas: `packages/contracts/SCHEMAS.md`. Frozen fixtures: `packages/contracts/fixtures/`. Decision record: `docs/adr/0003-executable-contracts-and-boundaries.md`.

## Boundary validation

- Every boundary schema is a closed `z.strictObject`: unknown fields are rejected, never stripped or ignored. The one exception is `health-report`, which is read leniently and documented below.
- Each persisted or public document carries a literal `schemaVersion`.
- Validation errors (`ContractValidationError`, `ApiError.details`) report paths and reasons only. They never echo rejected values or caller-chosen key names:
  - unrecognized keys are reported only by count;
  - a path segment that is not a short identifier or an array index is shown as `[key]`.
- Wall-clock timestamps are ISO 8601 UTC with a `Z` suffix and must be real calendar dates. They are used only for operational metadata and never as simulation inputs.

## Stable IDs

The format is `<prefix>_<8–64 chars [0-9a-z]>`. The prefixes are fixed and must never be changed or reused.

| Kind | Prefix |
| --- | --- |
| world | `wld` |
| season | `ssn` |
| command | `cmd` |
| event | `evt` |
| checkpoint | `chk` |
| operator | `opr` |
| proposal | `prp` |
| source | `src` |
| review | `rvw` |

- Each kind has a branded TypeScript type, so passing an ID of the wrong kind is a compile error. At runtime, the wrong kind is a validation error.
- Correlation IDs are log-safe tokens matching `[A-Za-z0-9._:-]{1,128}`, because they may originate outside the system. Telemetry accepts inbound values using this same pattern.
- Idempotency keys match `[A-Za-z0-9._:-]{8,128}`.
- The engine will generate IDs deterministically from named streams (Phase 02).

## Versions and time

- `VersionStamp` contains `{ engineVersion, contentVersion, configVersion }`:
  - `engineVersion` is a semantic version without build metadata;
  - `contentVersion` and `configVersion` are `sha256:<hex>` digests of canonical documents.
- `SimulationInstant` contains `{ tick, year, dayOfYear }`:
  - `tick` is the authoritative non-negative integer;
  - `year` is a CE year from 1 to 9999 (no year 0 and no BCE);
  - `dayOfYear` runs from 1 to 366.
  - The tick→calendar mapping, and the check that these three agree, belong to the Phase 02 clock.

## Canonical serialization

`canonicalize(value)` implements RFC 8785 (JCS):

- object keys are sorted by UTF-16 code units, independent of locale;
- there is no whitespace;
- numbers use the ECMAScript shortest round-trip form, and `-0` becomes `0`;
- strings use JSON escaping.

The following inputs are rejected rather than coerced:

- non-finite numbers;
- `undefined`, including as an object property or array element;
- sparse arrays;
- bigint, functions and symbols;
- cycles;
- non-plain objects such as Date, Map or class instances;
- lone UTF-16 surrogates.

Nesting deeper than `CANONICAL_MAX_DEPTH` (256) is rejected with `CanonicalizationError` rather than overflowing the stack. Content digests and state hashes are computed over these bytes.

## Envelopes

Commands and domain events share one envelope mechanism (`envelope.ts`) and are parsed through registries (`messages.ts`).

| Field | Command | Event | Notes |
| --- | --- | --- | --- |
| `schemaVersion` | ✓ | ✓ | envelope format version (1) |
| `commandId` / `eventId` | ✓ | ✓ | stable ID |
| `type`, `typeVersion` | ✓ | ✓ | dotted lowercase name + payload version |
| `worldId` | ✓ | ✓ | |
| `instant` | ✓ | ✓ | simulation tick/year/day |
| `issuedAt` | ✓ | — | arrival wall time; events carry none, so they replay byte for byte |
| `actor` | ✓ | — | system component or operator; internal audit data |
| `idempotencyKey` | ✓ | — | one effect per (world, key) |
| `expectedVersion` | ✓ (nullable) | — | optimistic concurrency |
| `sequence` | — | ✓ | position in the world's append-only ledger |
| `causationId` | ✓ (null only for external origin) | ✓ (required) | causing command/event; self-causation is rejected |
| `correlationId` | ✓ | ✓ | |
| `versions` | ✓ | ✓ | engine/content/config |
| `payload` | ✓ | ✓ | closed object validated by the registered definition |

How registries parse a message:

1. Parse the envelope.
2. Look up the definition by `type@typeVersion`; unknown types and versions are rejected.
3. Parse the payload with that definition's strict schema.
4. Check variant rules, for example the actor kinds allowed for a command.

The result is a TypeScript tagged union (`Command`, `DomainEvent`) that narrows on `type`.

Defining a variant uses `defineCommand` / `defineEvent`, which require a `z.strictObject` payload, a valid name and version, and, for commands, at least one allowed actor kind.

The only variants registered so far are the world-control pair specified in `docs/SECURITY-OPERATIONS.md` (`world.pause`/`world.resume` and `world.paused`/`world.resumed`). Later phases add variants as their specs define them.

## Evolution and compatibility

### Strictness and rolling compatibility

Strict reads mean that any change to a persisted or exchanged document must be versioned. Adding an optional field is also a change.

- **Additive or breaking change:** bump `schemaVersion` (records) or `typeVersion` (messages), and keep the old version parseable.
- **Order of rollout (expand → migrate → contract):**
  1. Deploy readers that accept both the old and new version.
  2. Only after that, deploy writers that emit the new version.
  3. In a later release, stop writing the old version. Old versions stay readable for as long as data in that form exists, which is forever for ledger events.
- **Exception:** `health-report` is read leniently. Unknown fields are stripped, not rejected, because operational tooling and the web shell may run a different build from the process they probe. It is not persisted.

- A definition that has been persisted is never edited or removed. A non-additive payload change is a new `typeVersion` registered alongside the old one, and readers keep parsing both.
- `fixtures/vN/*.json` are frozen examples of every catalogued contract and every registered message variant. `fixtures/manifest.json` records each fixture's SHA-256. Tests fail when:
  - a fixture is edited or deleted;
  - a fixture no longer parses;
  - parsing a fixture changes its canonical form;
  - a contract or variant has no fixture.
- To add fixtures, write the new files, then run `pnpm --filter @civ/contracts fixtures:freeze`. The script only appends to the manifest.
- Changing a persisted contract follows `.claude/skills/data-contracts`: additive first, dual read/write, backfill, enforce later.

## Public DTOs

- `definePublicDto(name, internalShape, fields)` builds a strict schema from an explicit allowlist. Its `toPublic(record)` copies only allowlisted fields and validates them.
- Fields added to an internal record later are therefore never exposed by default.
- Internal audit fields are excluded and tests assert it: `createdBy`, `updatedBy`, actor/operator identities, reviewer identities, and proposal/review data.
- Current public contracts:
  - `public-world`
  - `public-season`
  - `simulation-instant`
  - `version-stamp`
  - `event-cursor` (decoded and wire forms)
  - `api-error`
  - `health-report`
- Their audiences are listed in `SCHEMAS.md`.

## Cursors and checkpoints

- An event cursor is `{ worldId, position }`, where `position` is the number of ledger events already consumed. The next expected event has `sequence === position`.
- The wire form is `v1.<worldId>.<position>`. Clients treat it as opaque, and decoding rejects anything malformed or unsafe.
- Checkpoint metadata records `eventPosition`, `instant`, a `stateHash` digest and `versions`.

## API errors

- Every HTTP error body is `ApiError`: `{ schemaVersion, error: { code, message, correlationId, details[], retryAfterSeconds? } }`.
- Codes map one-to-one to HTTP statuses (`API_ERROR_STATUS`).
- The API maps Fastify client errors to codes with generic messages:
  - unlisted 4xx statuses become `invalid_request`;
  - errors raised before routing (for example a malformed URL) use `frameworkErrors` and return the same contract.
- Server errors are logged in full and returned only as `internal`.
- The standalone health servers (simulation, worker) also return `ApiError` for 404, 405 and 500.
- `createApiError` never throws: an invalid correlation ID becomes `unknown`, and text that is too long is truncated.

## Proposal, source and review states

- **Proposal states** follow `draft → schema_validated → evidence_reviewed → domain_reviewed → simulated → approved → promoted`.
  - `advance` moves exactly one stage forward.
  - `reject` returns any in-review state to `draft` and requires at least one finding.
  - `promoted` is terminal.
- **Source verification** is `pending | verified | failed`.
- **Source URLs** must:
  - use https on the default port;
  - use a DNS host name with a dot;
  - contain no credentials;
  - not be an IP literal in any notation;
  - not be a `localhost`/`.local`/`.internal`-style name.
  
  Verification fetchers must still re-check the resolved address before connecting (Phase 16).
- **Review records** store the reviewer identity and role. They are internal.

## Dependency boundaries

`scripts/architecture-policy.mjs` defines the allowed workspace graph.

| Workspace | May import |
| --- | --- |
| `contracts` | zod only; browser-safe, no Node built-ins |
| `domain` | contracts and zod only |
| `web` | contracts, vue, phaser and zod |
| `api` | Not `domain`: it appends commands and never runs transitions |
| Any app | Never another app |
| Production code | Never `@civ/testing` |

`scripts/check-architecture.mjs` enforces the policy as a gate step:

- It walks the TypeScript AST of every source file, including Vue `<script>` blocks. It reads static, type-only, `import("x")` type, dynamic, re-export and `require` specifiers.
- In production code it rejects module loading it cannot check statically:
  - `import(expr)` and `require(expr)` with non-literal arguments, everywhere;
  - `createRequire`, `import.meta.glob`, `new URL(…, import.meta.url)` and `<script src>`, in the workspaces that forbid Node built-ins (contracts, domain, content, web).
- Production code means files under a workspace's `src/` that are not `*.test.*` or `*.spec.*`. Root `scripts/` and `tests/` are tooling and are not policy-checked.
- It also checks `package.json` declarations, relative paths that escape a workspace, and undeclared dependencies.
- `tests/architecture.test.mjs` proves each rule fails on a synthetic violation.
- The ESLint determinism guard for `packages/domain` remains in force alongside it.

## Schema documentation

`pnpm --filter @civ/contracts schemas:write` regenerates JSON Schema (draft 2020-12) from `CONTRACT_CATALOG`. `schema-docs.test.ts` fails when the committed files differ from the code or when orphaned schema files remain.
