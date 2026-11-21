import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RandomRoot, xoshiro128StarStar } from "./random.js";

const SEED = "9e3779b97f4a7c15";

describe("xoshiro128**", () => {
  it("matches the reference generator for state {1, 2, 3, 4}", () => {
    // First outputs of the reference C implementation (xoshiro128starstar.c).
    expect(xoshiro128StarStar([1, 2, 3, 4], 3)).toEqual([11520, 0, 5927040]);
  });
});

describe("named streams", () => {
  it("are reproducible: the same seed and path give the same sequence", () => {
    const a = new RandomRoot(SEED).stream("system", "births", 42);
    const b = new RandomRoot(SEED).stream("system", "births", 42);
    const draws = (stream: typeof a) => Array.from({ length: 50 }, () => stream.nextUint32());
    expect(draws(a)).toEqual(draws(b));
  });

  it("are isolated: draws in one stream never perturb another", () => {
    fc.assert(
      fc.property(fc.nat({ max: 500 }), (extraDraws) => {
        const root = new RandomRoot(SEED);
        const reference = root.stream("system", "deaths", 7);
        const expected = Array.from({ length: 20 }, () => reference.nextUint32());
        const noisy = new RandomRoot(SEED);
        const other = noisy.stream("system", "births", 7);
        for (let i = 0; i < extraDraws; i += 1) other.nextUint32();
        const deaths = noisy.stream("system", "deaths", 7);
        expect(Array.from({ length: 20 }, () => deaths.nextUint32())).toEqual(expected);
      }),
    );
  });

  it("split children depend on labels, not on how much the parent drew", () => {
    const fresh = new RandomRoot(SEED).stream("people");
    const used = new RandomRoot(SEED).stream("people");
    for (let i = 0; i < 100; i += 1) used.nextUint32();
    expect(fresh.split("per_1").nextUint32()).toBe(used.split("per_1").nextUint32());
    expect(fresh.split("per_1").nextUint32()).not.toBe(fresh.split("per_2").nextUint32());
    expect(fresh.split("per_1").path).toEqual(["people", "per_1"]);
  });

  it("distinguish label types and boundaries", () => {
    const root = new RandomRoot(SEED);
    const first = (...path: (string | number)[]) => root.stream(...path).nextUint32();
    expect(first("a", 1)).not.toBe(first("a", "1"));
    expect(first("ab", "c")).not.toBe(first("a", "bc"));
  });

  it("diverge for different seeds", () => {
    const a = new RandomRoot(SEED).stream("x");
    const b = new RandomRoot("9e3779b97f4a7c16").stream("x");
    const draws = (stream: typeof a) => Array.from({ length: 8 }, () => stream.nextUint32());
    expect(draws(a)).not.toEqual(draws(b));
  });

  it("produce a frozen golden sequence (cross-platform determinism)", () => {
    const stream = new RandomRoot(SEED).stream("golden", 1);
    const values = [
      ...Array.from({ length: 4 }, () => stream.nextUint32()),
      stream.nextInt(-5, 5),
      stream.nextInt(0, 2 ** 40),
      stream.chance(1, 3),
      stream.weightedIndex([1, 0, 5, 2]),
    ];
    expect(values).toMatchInlineSnapshot(`
      [
        631765567,
        4188731579,
        4194591422,
        2847051951,
        2,
        168905016084,
        false,
        3,
      ]
    `);
  });

  it("validate seeds and labels", () => {
    expect(() => new RandomRoot("ABCDEF0123456789")).toThrow(TypeError);
    expect(() => new RandomRoot("abc")).toThrow(TypeError);
    const root = new RandomRoot(SEED);
    expect(() => root.stream()).toThrow(TypeError);
    expect(() => root.stream("")).toThrow(TypeError);
    expect(() => root.stream(1.5)).toThrow(TypeError);
  });
});

describe("integer draws", () => {
  const stream = () => new RandomRoot(SEED).stream("draws");

  it("nextInt stays within [min, max) for any range up to 2^53", () => {
    fc.assert(
      fc.property(fc.integer({ min: -(2 ** 52), max: 2 ** 52 }), fc.integer({ min: 1, max: 2 ** 52 }), (min, width) => {
        const s = stream();
        for (let i = 0; i < 5; i += 1) {
          const value = s.nextInt(min, min + width);
          expect(value).toBeGreaterThanOrEqual(min);
          expect(value).toBeLessThan(min + width);
        }
      }),
    );
  });

  it("is close to uniform (fixed seed, so the check is deterministic)", () => {
    const t = stream();
    const buckets = new Array<number>(6).fill(0);
    for (let i = 0; i < 60_000; i += 1) {
      const index = t.nextInt(0, 6);
      buckets[index] = (buckets[index] ?? 0) + 1;
    }
    // ±4% of the expected 10,000 per bucket (≈4.4σ).
    for (const bucket of buckets) expect(Math.abs(bucket - 10_000)).toBeLessThan(400);
  });

  it("chance and weightedIndex honour their edge cases", () => {
    const s = stream();
    expect(s.chance(0, 7)).toBe(false);
    expect(s.chance(7, 7)).toBe(true);
    expect(() => s.chance(8, 7)).toThrow(RangeError);
    expect(() => s.chance(1, 0)).toThrow(RangeError);
    for (let i = 0; i < 100; i += 1) expect(s.weightedIndex([0, 3, 0])).toBe(1);
    expect(() => s.weightedIndex([0, 0])).toThrow(RangeError);
    expect(() => s.weightedIndex([1.5])).toThrow(RangeError);
    expect(() => s.nextInt(3, 3)).toThrow(RangeError);
    expect(() => s.pick([])).toThrow(RangeError);
  });

  it("shuffled returns a permutation without mutating the input", () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
    const output = stream().shuffled(input);
    expect([...output].sort((a, b) => a - b)).toEqual([...input]);
    expect(output).not.toEqual([...input]);
  });

  it("counts draws for audit", () => {
    const s = stream();
    s.nextUint32();
    s.nextInt(0, 2 ** 40);
    expect(s.draws).toBeGreaterThanOrEqual(3);
  });
});
