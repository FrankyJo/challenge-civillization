import { type z } from "zod";
import { apiErrorSchema } from "./api-error.js";
import { checkpointSchema, eventCursorSchema, eventCursorStringSchema } from "./cursor.js";
import { ledgerNotificationSchema } from "./delivery.js";
import { mapParamsSchema, publicMapSnapshotSchema, worldMapSchema } from "./geography.js";
import { contentPackSchema, seedPopulationSchema, worldDataSchema } from "./population.js";
import { healthReportSchema } from "./health.js";
import { commandRegistry, eventRegistry } from "./messages.js";
import { proposalReviewSchema, proposalSchema, sourceRecordSchema } from "./proposal.js";
import { simulationInstantSchema } from "./time.js";
import { versionStampSchema } from "./versions.js";
import { publicSeasonDto, publicWorldDto, seasonRecordSchema, worldRecordSchema } from "./world.js";

export type ContractAudience = "public" | "internal";

export interface ContractEntry {
  /** Stable kebab-case name; used for schema files and fixture manifests. */
  readonly name: string;
  /** Wire/schema version of this contract. */
  readonly version: number;
  readonly audience: ContractAudience;
  readonly description: string;
  readonly schema: z.ZodType;
}

/**
 * Every boundary contract, in documentation order. Schema documents in
 * `packages/contracts/schemas/` are generated from this list and checked in
 * tests, and every entry must have at least one frozen fixture.
 */
export const CONTRACT_CATALOG: readonly ContractEntry[] = Object.freeze([
  {
    name: "world-record",
    version: 1,
    audience: "internal",
    description: "Immutable world identity: seed, CE calendar span, launch versions, audit fields.",
    schema: worldRecordSchema,
  },
  {
    name: "public-world",
    version: 1,
    audience: "public",
    description: `Public world metadata (allowlist: ${publicWorldDto.fields.join(", ")}).`,
    schema: publicWorldDto.schema,
  },
  {
    name: "season-record",
    version: 1,
    audience: "internal",
    description: "Season schedule (UTC window), lifecycle status, public status note, audit fields.",
    schema: seasonRecordSchema,
  },
  {
    name: "public-season",
    version: 1,
    audience: "public",
    description: `Public season metadata (allowlist: ${publicSeasonDto.fields.join(", ")}).`,
    schema: publicSeasonDto.schema,
  },
  {
    name: "simulation-instant",
    version: 1,
    audience: "public",
    description: "Integer tick plus derived CE year and day of year.",
    schema: simulationInstantSchema,
  },
  {
    name: "version-stamp",
    version: 1,
    audience: "public",
    description: "Engine semver plus content and config digests every transition runs under.",
    schema: versionStampSchema,
  },
  {
    name: "command-envelope",
    version: 1,
    audience: "internal",
    description: "Every registered command variant with its audit envelope.",
    schema: commandRegistry.schema,
  },
  {
    name: "event-envelope",
    version: 1,
    audience: "internal",
    description: "Every registered domain event variant with its audit envelope.",
    schema: eventRegistry.schema,
  },
  {
    name: "event-cursor",
    version: 1,
    audience: "public",
    description: "Decoded event ledger cursor: world and number of events consumed.",
    schema: eventCursorSchema,
  },
  {
    name: "event-cursor-string",
    version: 1,
    audience: "public",
    description: "Wire form of an event cursor: v1.<worldId>.<position>.",
    schema: eventCursorStringSchema,
  },
  {
    name: "checkpoint",
    version: 1,
    audience: "internal",
    description: "Canonical state checkpoint metadata: ledger position, instant, state hash, versions.",
    schema: checkpointSchema,
  },
  {
    name: "ledger-notification",
    version: 1,
    audience: "internal",
    description:
      "Outbox/queue notice that a world's ledger grew; consumers read facts from the ledger, not the notice.",
    schema: ledgerNotificationSchema,
  },
  {
    name: "map-params",
    version: 1,
    audience: "internal",
    description:
      "World map generator parameters: grid size and spacing, latitude, temperature, land share, relief, regions.",
    schema: mapParamsSchema,
  },
  {
    name: "world-map",
    version: 1,
    audience: "internal",
    description:
      "Authoritative generated map: per-cell terrain, climate, drainage, resources and hazards with units; regions, water bodies, deposits; content hash.",
    schema: worldMapSchema,
  },
  {
    name: "public-map-snapshot",
    version: 1,
    audience: "public",
    description:
      "Compact renderer-agnostic map projection: terrain, biome, elevation band, coast/river and regions only.",
    schema: publicMapSnapshotSchema,
  },
  {
    name: "content-pack",
    version: 1,
    audience: "internal",
    description:
      "Versioned content pack: fictional cultures and naming systems, constructed-language name datasets with eras and provenance, demography table, citations.",
    schema: contentPackSchema,
  },
  {
    name: "seed-population",
    version: 1,
    audience: "internal",
    description:
      "A world's initial living people with kinship, guardianship, households, settlements, health, capabilities and name provenance.",
    schema: seedPopulationSchema,
  },
  {
    name: "world-data",
    version: 1,
    audience: "internal",
    description: "Simulation-owned world state data: names the seed population by hash.",
    schema: worldDataSchema,
  },
  {
    name: "api-error",
    version: 1,
    audience: "public",
    description: "The single HTTP error body: stable code, safe message, correlation ID, issue details.",
    schema: apiErrorSchema,
  },
  {
    name: "health-report",
    version: 1,
    audience: "public",
    description: "Liveness/readiness report served by every Node process.",
    schema: healthReportSchema,
  },
  {
    name: "proposal",
    version: 1,
    audience: "internal",
    description: "Historical content proposal and its lifecycle state.",
    schema: proposalSchema,
  },
  {
    name: "source-record",
    version: 1,
    audience: "internal",
    description: "Cited source with locator, licence, checksum and verification status.",
    schema: sourceRecordSchema,
  },
  {
    name: "proposal-review",
    version: 1,
    audience: "internal",
    description: "One stage decision on a proposal with reviewer identity and findings.",
    schema: proposalReviewSchema,
  },
]);
