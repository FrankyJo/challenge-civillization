import { canonicalDigestBytes } from "./hash.js";

/**
 * Named, splittable deterministic random streams.
 *
 * A stream is identified by a label path, e.g. `["system", "births", tick]`.
 * Its generator state is derived from SHA-256 of the canonical
 * `[namespace, seed, ...path]`, never from how many numbers other streams
 * have drawn. Adding, removing or reordering draws in one stream therefore
 * cannot change any other stream's output.
 *
 * Generator: xoshiro128** 1.1 (Blackman & Vigna), 128-bit state, 32-bit
 * outputs, using only integer operations ECMAScript defines exactly.
 *
 * The API is integer-only by design. There is no float draw: transcendental
 * Math functions are not bit-identical across engines, and probabilities are
 * expressed as integer ratios (`chance(numerator, denominator)`).
 */
export type StreamLabel = string | number;

const NAMESPACE = "civ.prng.v1";

function assertLabel(label: StreamLabel): void {
  if (typeof label === "number" ? !Number.isSafeInteger(label) : label.length === 0) {
    throw new TypeError(`stream labels must be non-empty strings or safe integers, got ${String(label)}`);
  }
}

/** Root of all streams for one world seed. */
export class RandomRoot {
  readonly #seed: string;

  constructor(seed: string) {
    if (!/^(?:[0-9a-f]{2}){8,32}$/.test(seed)) {
      throw new TypeError("seed must be 16–64 lowercase hex digits (an even count)");
    }
    this.#seed = seed;
  }

  /** The stream at a label path. The same path always yields an identical fresh stream. */
  stream(...path: readonly StreamLabel[]): RandomStream {
    if (path.length === 0) throw new TypeError("a stream needs at least one label");
    path.forEach(assertLabel);
    return new RandomStream(this.#seed, path);
  }
}

export class RandomStream {
  readonly #seed: string;
  readonly path: readonly StreamLabel[];
  readonly #state: Uint32Array;
  #draws = 0;

  constructor(seed: string, path: readonly StreamLabel[]) {
    this.#seed = seed;
    this.path = Object.freeze([...path]);
    const digest = canonicalDigestBytes([NAMESPACE, seed, ...path]);
    const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
    this.#state = new Uint32Array([view.getUint32(0), view.getUint32(4), view.getUint32(8), view.getUint32(12)]);
    // xoshiro must not start from the all-zero state (probability 2^-128).
    if (this.#state.every((word) => word === 0)) this.#state[0] = 0x9e3779b9;
  }

  /** A child stream keyed by this stream's path plus labels; independent of draws made here. */
  split(...labels: readonly StreamLabel[]): RandomStream {
    if (labels.length === 0) throw new TypeError("split needs at least one label");
    labels.forEach(assertLabel);
    return new RandomStream(this.#seed, [...this.path, ...labels]);
  }

  /** Number of 32-bit words drawn so far (for diagnostics/audit). */
  get draws(): number {
    return this.#draws;
  }

  /** Next uniformly distributed integer in [0, 2^32). */
  nextUint32(): number {
    this.#draws += 1;
    return step(this.#state);
  }

  /**
   * Uniform integer in [min, max). Unbiased (rejection sampling); the range
   * may span up to 2^53 values.
   */
  nextInt(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || max <= min) {
      throw new RangeError(`nextInt needs safe integers with min < max, got [${min}, ${max})`);
    }
    const range = max - min;
    if (!Number.isSafeInteger(range)) throw new RangeError("nextInt range exceeds 2^53");
    if (range <= 0x1_0000_0000) {
      // Largest multiple of range not above 2^32; reject draws beyond it.
      const limit = 0x1_0000_0000 - (0x1_0000_0000 % range);
      let draw = this.nextUint32();
      while (draw >= limit) draw = this.nextUint32();
      return min + (draw % range);
    }
    const bigRange = BigInt(range);
    const space = 1n << 64n;
    const limit = space - (space % bigRange);
    for (;;) {
      const draw = (BigInt(this.nextUint32()) << 32n) | BigInt(this.nextUint32());
      if (draw < limit) return min + Number(draw % bigRange);
    }
  }

  /** True with probability exactly numerator/denominator (0 ≤ numerator ≤ denominator). */
  chance(numerator: number, denominator: number): boolean {
    if (!Number.isSafeInteger(numerator) || !Number.isSafeInteger(denominator) || denominator < 1) {
      throw new RangeError("chance needs safe integers with denominator ≥ 1");
    }
    if (numerator < 0 || numerator > denominator) throw new RangeError("chance needs 0 ≤ numerator ≤ denominator");
    if (numerator === 0) return false;
    if (numerator === denominator) return true;
    return this.nextInt(0, denominator) < numerator;
  }

  /** Index drawn with probability proportional to non-negative integer weights. */
  weightedIndex(weights: readonly number[]): number {
    let total = 0;
    for (const weight of weights) {
      if (!Number.isSafeInteger(weight) || weight < 0)
        throw new RangeError("weights must be non-negative safe integers");
      total += weight;
      if (!Number.isSafeInteger(total)) throw new RangeError("total weight exceeds 2^53");
    }
    if (total === 0) throw new RangeError("at least one weight must be positive");
    let target = this.nextInt(0, total);
    for (let index = 0; index < weights.length; index += 1) {
      target -= weights[index] as number;
      if (target < 0) return index;
    }
    throw new Error("unreachable: weighted draw exceeded total");
  }

  /** Uniformly chosen element. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new RangeError("cannot pick from an empty list");
    return items[this.nextInt(0, items.length)] as T;
  }

  /** A new array with the elements in uniformly random order (Fisher–Yates). */
  shuffled<T>(items: readonly T[]): T[] {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const other = this.nextInt(0, index + 1);
      const held = result[index] as T;
      result[index] = result[other] as T;
      result[other] = held;
    }
    return result;
  }
}

function rotl(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0;
}

/** One xoshiro128** step: returns the output and advances `s` in place. */
function step(s: Uint32Array): number {
  const s0 = s[0] as number;
  const s1 = s[1] as number;
  const s2 = s[2] as number;
  const s3 = s[3] as number;
  const result = Math.imul(rotl(Math.imul(s1, 5), 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  const n2 = (s2 ^ s0) >>> 0;
  const n3 = (s3 ^ s1) >>> 0;
  s[1] = (s1 ^ n2) >>> 0;
  s[0] = (s0 ^ n3) >>> 0;
  s[2] = (n2 ^ t) >>> 0;
  s[3] = rotl(n3, 11);
  return result;
}

/** Raw xoshiro128** outputs from an explicit state, for verification against reference vectors. */
export function xoshiro128StarStar(state: readonly [number, number, number, number], count: number): number[] {
  const s = new Uint32Array(state);
  return Array.from({ length: count }, () => step(s));
}
