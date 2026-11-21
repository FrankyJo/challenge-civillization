import { ID_PREFIXES, idPattern, type IdKind } from "@civ/contracts";
import { canonicalDigestBytes } from "./hash.js";
import { type StreamLabel } from "./random.js";

/**
 * Stable ID derivation: `<prefix>_<16 base-36 chars>` from the first 80 bits
 * of SHA-256 over the canonical `["civ.id.v1", kind, ...scope]`.
 *
 * The same kind and scope always produce the same ID, on every platform and
 * regardless of creation order, so replay reproduces IDs without a counter.
 * Scopes must be globally unique for the entity (include the world ID and a
 * stable natural key such as the creating event ID or a sequence).
 *
 * 80 bits keeps collisions negligible: ~4·10⁻¹³ for 10⁶ IDs of one kind.
 */
const NAMESPACE = "civ.id.v1";
export const DERIVED_ID_BODY_LENGTH = 16;

export function deriveId(kind: IdKind, ...scope: readonly StreamLabel[]): string {
  if (scope.length === 0) throw new TypeError("an ID scope needs at least one label");
  for (const label of scope) {
    if (typeof label === "number" ? !Number.isSafeInteger(label) : label.length === 0) {
      throw new TypeError(`ID scope labels must be non-empty strings or safe integers, got ${String(label)}`);
    }
  }
  const digest = canonicalDigestBytes([NAMESPACE, kind, ...scope]);
  let value = 0n;
  for (let index = 0; index < 10; index += 1) value = (value << 8n) | BigInt(digest[index] as number);
  const id = `${ID_PREFIXES[kind]}_${value.toString(36).padStart(DERIVED_ID_BODY_LENGTH, "0")}`;
  if (!idPattern(kind).test(id)) throw new Error(`derived ID ${id} violates the ${kind} ID contract`);
  return id;
}
