/**
 * Canonical JSON serialization (RFC 8785, JSON Canonicalization Scheme).
 *
 * - Object keys are sorted by UTF-16 code units; no insignificant whitespace.
 * - Numbers use the ECMAScript shortest round-trip form; `-0` becomes `0`.
 * - Strings use JSON escaping and must be well-formed Unicode.
 *
 * It is stricter than `JSON.stringify` so that ambiguous inputs fail loudly
 * instead of silently producing a different document: non-finite numbers,
 * `undefined` (anywhere), bigint, functions, symbols, cycles, and non-plain
 * objects (Date, Map, class instances) are rejected.
 *
 * Canonical bytes are the input to content digests and state hashes, so the
 * same logical value always yields the same digest on every platform.
 */
export class CanonicalizationError extends Error {
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`Cannot canonicalize value at ${path}: ${reason}`);
    this.name = "CanonicalizationError";
    this.path = path;
  }
}

/** Maximum nesting depth; deeper values are rejected rather than overflowing the stack. */
export const CANONICAL_MAX_DEPTH = 256;

export function canonicalize(value: unknown): string {
  return serialize(value, "$", new Set());
}

export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

export function canonicalEquals(left: unknown, right: unknown): boolean {
  return canonicalize(left) === canonicalize(right);
}

function serialize(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new CanonicalizationError(path, "number is not finite");
      return Object.is(value, -0) ? "0" : String(value);
    case "string":
      if (!isWellFormed(value)) throw new CanonicalizationError(path, "string contains a lone surrogate");
      return JSON.stringify(value);
    case "object":
      return serializeObject(value, path, ancestors);
    default:
      throw new CanonicalizationError(path, `${typeof value} is not a JSON value`);
  }
}

function serializeObject(value: object, path: string, ancestors: Set<object>): string {
  if (ancestors.has(value)) throw new CanonicalizationError(path, "cyclic reference");
  if (ancestors.size >= CANONICAL_MAX_DEPTH) {
    throw new CanonicalizationError(path, `nesting deeper than ${CANONICAL_MAX_DEPTH}`);
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) throw new CanonicalizationError(`${path}[${index}]`, "sparse array hole");
        items.push(serialize(value[index], `${path}[${index}]`, ancestors));
      }
      return `[${items.join(",")}]`;
    }
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new CanonicalizationError(path, "only plain objects and arrays are allowed");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new CanonicalizationError(path, "symbol-keyed properties are not JSON");
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (!keys.every(isWellFormed)) throw new CanonicalizationError(path, "key contains a lone surrogate");
    const members = keys
      .sort(compareCodeUnits)
      .map((key) => `${JSON.stringify(key)}:${serialize(record[key], `${path}.${key}`, ancestors)}`);
    return `{${members.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** Ordering by UTF-16 code units, independent of locale (RFC 8785 §3.2.3). */
export function compareCodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function isWellFormed(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return false;
    }
  }
  return true;
}
