import { z } from "zod";

/** Semantic version (no build metadata: it must not affect equality). */
export const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
export const engineVersionSchema = z.string().regex(SEMVER_PATTERN, "must be a semantic version, e.g. 1.2.3");

/** Content-addressed digest of a canonical document (content pack set, config). */
export const digestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/, 'must be "sha256:" followed by 64 hex digits');
export type Digest = z.output<typeof digestSchema>;

/**
 * The versions every transition, checkpoint and world is evaluated under.
 * Replay must use exactly these to reproduce a state hash.
 */
export const versionStampSchema = z.strictObject({
  engineVersion: engineVersionSchema,
  contentVersion: digestSchema,
  configVersion: digestSchema,
});
export type VersionStamp = z.output<typeof versionStampSchema>;
