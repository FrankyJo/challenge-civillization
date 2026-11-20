import { z } from "zod";
import { actorSchema } from "./actor.js";
import { seasonIdSchema, worldIdSchema } from "./ids.js";
import { definePublicDto } from "./public-dto.js";
import { ceYearSchema, utcTimestampSchema } from "./time.js";
import { versionStampSchema } from "./versions.js";

export const WORLD_RECORD_SCHEMA_VERSION = 1 as const;
export const SEASON_RECORD_SCHEMA_VERSION = 1 as const;

/** World seed: 64–256 bits as lowercase hex. Public launch metadata. */
export const worldSeedSchema = z
  .string()
  .regex(/^(?:[0-9a-f]{2}){8,32}$/, "must be 16–64 lowercase hex digits (an even count)");

const displayName = z
  .string()
  .min(1)
  .max(120)
  .regex(/^\S(?:.*\S)?$/u, "must not have leading or trailing whitespace");

const worldRecordShape = {
  schemaVersion: z.literal(WORLD_RECORD_SCHEMA_VERSION),
  worldId: worldIdSchema,
  name: displayName,
  seed: worldSeedSchema,
  startYear: ceYearSchema,
  endYear: ceYearSchema,
  versions: versionStampSchema,
  createdAt: utcTimestampSchema,
  /** Internal audit: never public. */
  createdBy: actorSchema,
};

/** Immutable identity of a world: seed, calendar span and launch versions. */
export const worldRecordSchema = z.strictObject(worldRecordShape).refine((world) => world.endYear >= world.startYear, {
  path: ["endYear"],
  message: "must not precede startYear",
});
export type WorldRecord = z.output<typeof worldRecordSchema>;

export const publicWorldDto = definePublicDto("public-world", worldRecordShape, [
  "schemaVersion",
  "worldId",
  "name",
  "seed",
  "startYear",
  "endYear",
  "versions",
]);
export type PublicWorld = z.output<typeof publicWorldDto.schema>;

/** Public lifecycle of a season. Transition rules arrive with the runner (Phase 06). */
export const seasonStatusSchema = z.enum(["scheduled", "live", "paused", "completed", "frozen"]);
export type SeasonStatus = z.output<typeof seasonStatusSchema>;

const seasonRecordShape = {
  schemaVersion: z.literal(SEASON_RECORD_SCHEMA_VERSION),
  seasonId: seasonIdSchema,
  worldId: worldIdSchema,
  number: z.number().int().min(1),
  status: seasonStatusSchema,
  /** Real-time window (UTC) over which the world's calendar span is played. */
  startsAt: utcTimestampSchema,
  endsAt: utcTimestampSchema,
  /** Public status note shown during pauses or schedule changes. */
  statusNote: z.string().min(1).max(500).nullable(),
  updatedAt: utcTimestampSchema,
  /** Internal audit: never public. */
  updatedBy: actorSchema,
};

export const seasonRecordSchema = z
  .strictObject(seasonRecordShape)
  .refine((season) => Date.parse(season.endsAt) > Date.parse(season.startsAt), {
    path: ["endsAt"],
    message: "must be after startsAt",
  });
export type SeasonRecord = z.output<typeof seasonRecordSchema>;

export const publicSeasonDto = definePublicDto("public-season", seasonRecordShape, [
  "schemaVersion",
  "seasonId",
  "worldId",
  "number",
  "status",
  "startsAt",
  "endsAt",
  "statusNote",
]);
export type PublicSeason = z.output<typeof publicSeasonDto.schema>;
