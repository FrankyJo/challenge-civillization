import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_MAX_DEPTH,
  CanonicalizationError,
  canonicalBytes,
  canonicalEquals,
  canonicalize,
  compareCodeUnits,
} from "./canonical.js";

describe("canonicalize (RFC 8785)", () => {
  it("matches the RFC 8785 §3.2.2 example", () => {
    const input = JSON.parse(
      '{"numbers":[333333333.33333329,1E30,4.50,2e-3,0.000000000000000000000000001],' +
        '"string":"\\u20ac$\\u000F\\u000aA\'\\u0042\\u0022\\u005c\\\\\\"\\/",' +
        '"literals":[null,true,false]}',
    ) as unknown;
    expect(canonicalize(input)).toBe(
      '{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],' +
        '"string":"€$\\u000f\\nA\'B\\"\\\\\\\\\\"/"}',
    );
  });

  it("sorts keys by UTF-16 code units, not locale", () => {
    const value = { "\u20ac": 1, "\r": 2, "\ud83d\ude00": 3, "1": 4, "\u00f6": 5, "\u0080": 6, a: 7, B: 8 };
    expect(canonicalize(value)).toBe('{"\\r":2,"1":4,"B":8,"a":7,"\u0080":6,"ö":5,"€":1,"😀":3}');
  });

  it("is independent of key insertion order and stable under round-trip", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const once = canonicalize(value);
        expect(canonicalize(JSON.parse(once))).toBe(once);
        expect(canonicalize(reverseKeys(value))).toBe(once);
      }),
    );
  });

  it("orders keys consistently with code-unit comparison", () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (left, right) => {
        const sign = Math.sign(compareCodeUnits(left, right));
        expect(sign).toBe(left < right ? -1 : left > right ? 1 : 0);
      }),
    );
  });

  it("normalises -0 and encodes UTF-8 bytes", () => {
    expect(canonicalize({ zero: -0 })).toBe('{"zero":0}');
    expect([...canonicalBytes("é")]).toEqual([0x22, 0xc3, 0xa9, 0x22]);
    expect(canonicalEquals({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true);
  });

  it.each([
    ["NaN", { x: Number.NaN }, "$.x"],
    ["Infinity", [Number.POSITIVE_INFINITY], "$[0]"],
    ["undefined property", { x: undefined }, "$.x"],
    ["undefined element", [undefined], "$[0]"],
    // eslint-disable-next-line no-sparse-arrays -- the hole is the input under test
    ["sparse array", [1, , 3], "$[1]"],
    ["bigint", { n: 1n }, "$.n"],
    ["function", { f: () => 1 }, "$.f"],
    ["Date", { d: new Date(0) }, "$.d"],
    ["Map", new Map(), "$"],
    ["lone surrogate", { s: "\ud800" }, "$.s"],
    ["lone surrogate key", { "\udc00": 1 }, "$"],
    ["symbol key", { [Symbol("k")]: 1 }, "$"],
  ])("rejects %s", (_label, value, path) => {
    let caught: unknown;
    try {
      canonicalize(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(CanonicalizationError);
    expect((caught as CanonicalizationError).path).toBe(path);
  });

  it("rejects excessive nesting with a typed error instead of overflowing the stack", () => {
    const deep = (depth: number) => {
      let value: unknown = 0;
      for (let index = 0; index < depth; index += 1) value = [value];
      return value;
    };
    expect(() => canonicalize(deep(CANONICAL_MAX_DEPTH))).not.toThrow();
    expect(() => canonicalize(deep(CANONICAL_MAX_DEPTH + 1))).toThrow(CanonicalizationError);
    expect(() => canonicalize(deep(20_000))).toThrow(CanonicalizationError);
  });

  it("rejects cycles but allows shared (acyclic) references", () => {
    const shared = { v: 1 };
    expect(canonicalize({ a: shared, b: shared })).toBe('{"a":{"v":1},"b":{"v":1}}');
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(() => canonicalize(cyclic)).toThrow(CanonicalizationError);
  });
});

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, reverseKeys(item)]),
    );
  }
  return value;
}
