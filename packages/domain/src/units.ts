/**
 * Integer quantities, fixed-point rates and unit conversion.
 *
 * Specification:
 * - Every amount is a JavaScript safe integer in a unit's smallest
 *   representable step: |amount| ≤ 2^53 − 1. Floats are never accepted.
 * - Any operation whose exact result falls outside the safe range throws
 *   `UnitOverflowError`. Nothing ever wraps, saturates or loses precision
 *   silently.
 * - Division, rate application and unit conversion compute the exact
 *   rational result with BigInt, then round with an explicit mode:
 *     floor      toward −∞
 *     ceil       toward +∞
 *     trunc      toward 0
 *     half_even  nearest; ties to the even neighbour (banker's rounding)
 *     half_up    nearest; ties away from 0
 *     exact      throw `InexactResultError` unless the result is an integer
 *   No mode is a default: every call site states its rounding.
 * - `allocate` splits an integer total by integer weights so that the parts
 *   sum exactly to the total (largest remainder; ties go to the lower index).
 */
export type RoundingMode = "floor" | "ceil" | "trunc" | "half_even" | "half_up" | "exact";

export class UnitOverflowError extends RangeError {
  constructor(operation: string) {
    super(`${operation} result is outside the safe integer range (±(2^53 − 1))`);
    this.name = "UnitOverflowError";
  }
}

export class InexactResultError extends RangeError {
  constructor(operation: string) {
    super(`${operation} has no exact integer result`);
    this.name = "InexactResultError";
  }
}

export class UnitMismatchError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "UnitMismatchError";
  }
}

const MAX = BigInt(Number.MAX_SAFE_INTEGER);

function assertInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer, got ${value}`);
}

function toSafe(operation: string, value: bigint): number {
  if (value > MAX || value < -MAX) throw new UnitOverflowError(operation);
  return Number(value);
}

export function checkedAdd(a: number, b: number): number {
  assertInteger("a", a);
  assertInteger("b", b);
  return toSafe("add", BigInt(a) + BigInt(b));
}

export function checkedSub(a: number, b: number): number {
  assertInteger("a", a);
  assertInteger("b", b);
  return toSafe("subtract", BigInt(a) - BigInt(b));
}

export function checkedMul(a: number, b: number): number {
  assertInteger("a", a);
  assertInteger("b", b);
  return toSafe("multiply", BigInt(a) * BigInt(b));
}

/** Exact integer division of BigInts with an explicit rounding mode. */
export function divideRounded(numerator: bigint, denominator: bigint, rounding: RoundingMode): bigint {
  if (denominator === 0n) throw new RangeError("division by zero");
  let n = numerator;
  let d = denominator;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const quotient = n / d;
  const remainder = n % d;
  if (remainder === 0n) return quotient;
  const away = n < 0n ? quotient - 1n : quotient + 1n;
  switch (rounding) {
    case "exact":
      throw new InexactResultError(`${numerator}/${denominator}`);
    case "trunc":
      return quotient;
    case "floor":
      return n < 0n ? away : quotient;
    case "ceil":
      return n > 0n ? away : quotient;
    case "half_up":
    case "half_even": {
      const twice = 2n * (remainder < 0n ? -remainder : remainder);
      if (twice > d) return away;
      if (twice < d) return quotient;
      if (rounding === "half_up") return away;
      return quotient % 2n === 0n ? quotient : away;
    }
  }
}

/** value × numerator / denominator, computed exactly and rounded once. */
export function mulDiv(value: number, numerator: number, denominator: number, rounding: RoundingMode): number {
  assertInteger("value", value);
  assertInteger("numerator", numerator);
  assertInteger("denominator", denominator);
  return toSafe("mulDiv", divideRounded(BigInt(value) * BigInt(numerator), BigInt(denominator), rounding));
}

export function divide(value: number, divisor: number, rounding: RoundingMode): number {
  return mulDiv(value, 1, divisor, rounding);
}

/** Parts per million: the fixed-point scale for rates and probabilities. */
export const PPM = 1_000_000;

/** Apply a rate given in parts per million (may exceed 1,000,000 or be negative). */
export function applyPpm(value: number, ratePpm: number, rounding: RoundingMode): number {
  return mulDiv(value, ratePpm, PPM, rounding);
}

/** Split a non-negative total by non-negative integer weights; parts sum exactly to the total. */
export function allocate(total: number, weights: readonly number[]): number[] {
  assertInteger("total", total);
  if (total < 0) throw new RangeError("total must be non-negative");
  let weightSum = 0n;
  for (const weight of weights) {
    assertInteger("weight", weight);
    if (weight < 0) throw new RangeError("weights must be non-negative");
    weightSum += BigInt(weight);
  }
  if (weightSum === 0n) throw new RangeError("at least one weight must be positive");
  const big = BigInt(total);
  const parts = weights.map((weight) => (big * BigInt(weight)) / weightSum);
  const remainders = weights.map((weight, index) => ({ index, remainder: (big * BigInt(weight)) % weightSum }));
  let left = big - parts.reduce((sum, part) => sum + part, 0n);
  remainders.sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  for (const { index } of remainders) {
    if (left === 0n) break;
    parts[index] = (parts[index] as bigint) + 1n;
    left -= 1n;
  }
  return parts.map((part) => Number(part));
}

/**
 * Units. `perBase` is how many base-unit steps one step of the unit is.
 * Amounts are integers in the unit's own steps, so choose the finest unit
 * a system needs (e.g. grams, not kilograms) to avoid rounding.
 */
export const UNITS = Object.freeze({
  count: { dimension: "count", perBase: 1 },
  gram: { dimension: "mass", perBase: 1 },
  kilogram: { dimension: "mass", perBase: 1_000 },
  tonne: { dimension: "mass", perBase: 1_000_000 },
  millilitre: { dimension: "volume", perBase: 1 },
  litre: { dimension: "volume", perBase: 1_000 },
  cubic_metre: { dimension: "volume", perBase: 1_000_000 },
  metre: { dimension: "length", perBase: 1 },
  kilometre: { dimension: "length", perBase: 1_000 },
  square_metre: { dimension: "area", perBase: 1 },
  hectare: { dimension: "area", perBase: 10_000 },
  kilocalorie: { dimension: "food_energy", perBase: 1 },
  day: { dimension: "time", perBase: 1 },
  year: { dimension: "time", perBase: 365 },
} as const);

export type UnitId = keyof typeof UNITS;
export type Dimension = (typeof UNITS)[UnitId]["dimension"];

export interface Quantity<U extends UnitId = UnitId> {
  readonly unit: U;
  readonly amount: number;
}

export function quantity<U extends UnitId>(unit: U, amount: number): Quantity<U> {
  if (!Object.hasOwn(UNITS, unit)) throw new UnitMismatchError(`unknown unit ${String(unit)}`);
  assertInteger("amount", amount);
  return Object.freeze({ unit, amount });
}

function sameUnit(operation: string, a: Quantity, b: Quantity): void {
  if (a.unit !== b.unit) {
    throw new UnitMismatchError(`${operation} needs equal units (${a.unit} vs ${b.unit}); convert explicitly first`);
  }
}

export function addQuantities<U extends UnitId>(a: Quantity<U>, b: Quantity<U>): Quantity<U> {
  sameUnit("add", a, b);
  return quantity(a.unit, checkedAdd(a.amount, b.amount));
}

export function subtractQuantities<U extends UnitId>(a: Quantity<U>, b: Quantity<U>): Quantity<U> {
  sameUnit("subtract", a, b);
  return quantity(a.unit, checkedSub(a.amount, b.amount));
}

export function convert<To extends UnitId>(value: Quantity, to: To, rounding: RoundingMode): Quantity<To> {
  const from = UNITS[value.unit];
  const target = UNITS[to];
  if (from.dimension !== target.dimension) {
    throw new UnitMismatchError(`cannot convert ${from.dimension} (${value.unit}) to ${target.dimension} (${to})`);
  }
  return quantity(to, mulDiv(value.amount, from.perBase, target.perBase, rounding));
}
