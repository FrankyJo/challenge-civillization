import { describe, expect, it } from "vitest";
import { loadSimulationEnv } from "./env.js";

describe("simulation env", () => {
  it("requires DATABASE_URL and defaults the health port", () => {
    expect(() => loadSimulationEnv({})).toThrow(/DATABASE_URL: is required/);
    const env = loadSimulationEnv({ DATABASE_URL: "postgresql://u@localhost/db" });
    expect(env.SIMULATION_HEALTH_PORT).toBe(3001);
  });

  it("rejects a non-postgres database URL", () => {
    expect(() => loadSimulationEnv({ DATABASE_URL: "redis://localhost" })).toThrow(/DATABASE_URL/);
  });
});
