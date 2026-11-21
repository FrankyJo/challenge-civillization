import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addQuantities,
  allocate,
  applyPpm,
  checkedAdd,
  checkedMul,
  checkedSub,
  convert,
  divide,
  divideRounded,
  InexactResultError,
  mulDiv,
  quantity,
  UnitMismatchError,
  UnitOverflowError,
  type RoundingMode,
} from "./units.js";

const MAX = Number.MAX_SAFE_INTEGER;

describe("rounding modes (specified table)", () => {
  // value / 2 for values -3..3, i.e. -1.5, -1, -0.5, 0, 0.5, 1, 1.5
  const table: Record<Exclude<RoundingMode, "exact">, number[]> = {
    floor: [-2, -1, -1, 0, 0, 1, 1],
    ceil: [-1, -1, 0, 0, 1, 1, 2],
    trunc: [-1, -1, 0, 0, 0, 1, 1],
    half_even: [-2, -1, 0, 0, 0, 1, 2],
    half_up: [-2, -1, -1, 0, 1, 1, 2],
  };
  it.each(Object.entries(table))("%s", (mode, expected) => {
    expect([-3, -2, -1, 0, 1, 2, 3].map((value) => divide(value, 2, mode as RoundingMode))).toEqual(expected);
  });

  it("half modes round non-ties to nearest, and negative divisors are normalised", () => {
    expect(divide(7, 3, "half_even")).toBe(2);
    expect(divide(8, 3, "half_even")).toBe(3);
    expect(divide(-8, 3, "half_up")).toBe(-3);
    expect(divide(5, -2, "floor")).toBe(-3);
    expect(divide(5, -2, "half_even")).toBe(-2);
  });

  it("exact throws unless divisible", () => {
    expect(divide(6, 3, "exact")).toBe(2);
    expect(() => divide(7, 3, "exact")).toThrow(InexactResultError);
  });

  it("agree with exact rational arithmetic for arbitrary inputs", () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: -(10n ** 20n), max: 10n ** 20n }),
        fc.bigInt({ min: 1n, max: 10n ** 12n }),
        (n, d) => {
          const floor = divideRounded(n, d, "floor");
          expect(floor * d <= n && n < (floor + 1n) * d).toBe(true);
          const ceil = divideRounded(n, d, "ceil");
          expect(ceil - floor).toBe(n % d === 0n ? 0n : 1n);
          const nearest = divideRounded(n, d, "half_even");
          const error = n - nearest * d;
          expect(2n * (error < 0n ? -error : error) <= d).toBe(true);
        },
      ),
    );
  });

  it("rejects division by zero", () => {
    expect(() => divide(1, 0, "floor")).toThrow(RangeError);
  });
});

describe("overflow", () => {
  it("throws instead of wrapping or losing precision", () => {
    expect(checkedAdd(MAX - 1, 1)).toBe(MAX);
    expect(() => checkedAdd(MAX, 1)).toThrow(UnitOverflowError);
    expect(() => checkedSub(-MAX, 1)).toThrow(UnitOverflowError);
    expect(() => checkedMul(2 ** 27, 2 ** 27)).toThrow(UnitOverflowError);
    expect(checkedMul(2 ** 26, 2 ** 26)).toBe(2 ** 52);
  });

  it("mulDiv keeps exact intermediates beyond 2^53", () => {
    expect(mulDiv(MAX, MAX, MAX, "exact")).toBe(MAX);
    expect(mulDiv(2 ** 52, 3, 4, "exact")).toBe(3 * 2 ** 50);
    expect(() => mulDiv(MAX, 2, 1, "floor")).toThrow(UnitOverflowError);
  });

  it("rejects non-integer and unsafe inputs", () => {
    expect(() => checkedAdd(0.5, 1)).toThrow(RangeError);
    expect(() => checkedAdd(MAX + 1, 0)).toThrow(RangeError);
    expect(() => mulDiv(1, Number.NaN, 1, "floor")).toThrow(RangeError);
  });
});

describe("rates and allocation", () => {
  it("applies parts-per-million rates", () => {
    expect(applyPpm(1_000, 250_000, "exact")).toBe(250);
    expect(applyPpm(3, 500_000, "half_even")).toBe(2);
    expect(applyPpm(3, 500_000, "floor")).toBe(1);
  });

  it("allocate conserves the total exactly with deterministic tie-breaks", () => {
    expect(allocate(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(allocate(100, [0, 1, 3])).toEqual([0, 25, 75]);
    fc.assert(
      fc.property(
        fc.nat({ max: 1_000_000_000 }),
        fc.array(fc.nat({ max: 1_000_000 }), { minLength: 1, maxLength: 20 }).filter((w) => w.some((x) => x > 0)),
        (total, weights) => {
          const parts = allocate(total, weights);
          expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total);
          parts.forEach((part, index) => {
            const exact = (total * (weights[index] ?? 0)) / weights.reduce((a, b) => a + b, 0);
            expect(Math.abs(part - exact)).toBeLessThan(1 + 1e-9);
            if (weights[index] === 0) expect(part).toBe(0);
          });
        },
      ),
    );
    expect(() => allocate(5, [0, 0])).toThrow(RangeError);
    expect(() => allocate(-1, [1])).toThrow(RangeError);
  });
});

describe("quantities and units", () => {
  it("convert within a dimension with explicit rounding", () => {
    expect(convert(quantity("kilogram", 3), "gram", "exact")).toEqual({ unit: "gram", amount: 3_000 });
    expect(convert(quantity("gram", 1_500), "kilogram", "half_even")).toEqual({ unit: "kilogram", amount: 2 });
    expect(convert(quantity("gram", 2_500), "kilogram", "half_even")).toEqual({ unit: "kilogram", amount: 2 });
    expect(() => convert(quantity("gram", 1_500), "kilogram", "exact")).toThrow(InexactResultError);
    expect(convert(quantity("year", 2), "day", "exact").amount).toBe(730);
  });

  it("refuse cross-dimension conversion and implicit unit mixing", () => {
    expect(() => convert(quantity("gram", 1), "litre", "floor")).toThrow(UnitMismatchError);
    expect(() => addQuantities(quantity("gram", 1), quantity("kilogram", 1) as never)).toThrow(UnitMismatchError);
    expect(addQuantities(quantity("litre", 2), quantity("litre", 3))).toEqual({ unit: "litre", amount: 5 });
    expect(() => quantity("furlong" as never, 1)).toThrow(UnitMismatchError);
    expect(() => quantity("gram", 0.1)).toThrow(RangeError);
  });

  it("detect overflow in conversions", () => {
    expect(() => convert(quantity("tonne", MAX), "gram", "exact")).toThrow(UnitOverflowError);
  });
});
