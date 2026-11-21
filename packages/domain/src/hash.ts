import { canonicalBytes, type Digest } from "@civ/contracts";
import { sha256, toHex } from "./sha256.js";

/**
 * `sha256:<hex>` digest of the RFC 8785 canonical form of a value. This is
 * the only way the engine hashes state, events, config and checkpoints, so a
 * hash depends on content, never on key insertion order or platform.
 */
export function canonicalHash(value: unknown): Digest {
  return `sha256:${toHex(sha256(canonicalBytes(value)))}`;
}

/** Raw SHA-256 of a value's canonical bytes. */
export function canonicalDigestBytes(value: unknown): Uint8Array {
  return sha256(canonicalBytes(value));
}
