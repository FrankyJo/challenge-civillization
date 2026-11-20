import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { aggregateStatus, healthReportSchema, type DependencyCheck } from "./health.js";

const check = fc.record({
  status: fc.constantFrom("ok" as const, "down" as const),
  latencyMs: fc.nat(),
});

describe("aggregateStatus", () => {
  it("is ok iff every check is ok (and ok for no checks)", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), check), (checks: Record<string, DependencyCheck>) => {
        const allOk = Object.values(checks).every((entry) => entry.status === "ok");
        expect(aggregateStatus(checks)).toBe(allOk ? "ok" : "down");
      }),
    );
  });
});

describe("healthReportSchema", () => {
  it("accepts a well-formed report and rejects unknown services", () => {
    const report = {
      schemaVersion: 1,
      service: "api",
      version: "0.1.0",
      status: "down",
      checks: { postgres: { status: "down", latencyMs: 3, error: "ECONNREFUSED" } },
    };
    expect(healthReportSchema.parse(report)).toEqual(report);
    expect(healthReportSchema.safeParse({ ...report, service: "browser" }).success).toBe(false);
    expect(healthReportSchema.safeParse({ ...report, schemaVersion: 2 }).success).toBe(false);
  });
});
