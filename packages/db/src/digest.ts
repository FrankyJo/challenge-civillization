import { createHash } from "node:crypto";
import { canonicalBytes, type Digest } from "@civ/contracts";

/**
 * `sha256:<hex>` over RFC 8785 canonical JSON. Byte-identical to the domain's
 * pure-TypeScript `canonicalHash`; the store recomputes it independently to
 * verify every state it writes or reads.
 */
export function canonicalDigest(value: unknown): Digest {
  return `sha256:${createHash("sha256").update(canonicalBytes(value)).digest("hex")}` as Digest;
}
