import { describe, expect, it } from "vitest";
import { ephemeralDatabaseName, requireTestEnv } from "./index.js";

describe("requireTestEnv", () => {
  it("returns trimmed values and fails loudly when missing or blank", () => {
    expect(requireTestEnv("X", { X: " v " })).toBe("v");
    expect(() => requireTestEnv("X", {})).toThrow(/X is not set.*pnpm infra:up/);
    expect(() => requireTestEnv("X", { X: "  " })).toThrow(/X is not set/);
  });
});

describe("ephemeralDatabaseName", () => {
  it("produces unique, identifier-safe names", () => {
    const names = new Set(Array.from({ length: 50 }, () => ephemeralDatabaseName("civ_test")));
    expect(names.size).toBe(50);
    for (const name of names) expect(name).toMatch(/^civ_test_[0-9a-f]{12}$/);
    expect(() => ephemeralDatabaseName("Bad-Prefix")).toThrow(/invalid database name/);
  });
});
