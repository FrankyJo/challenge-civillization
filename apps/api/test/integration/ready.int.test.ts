import { healthReportSchema } from "@civ/contracts";
import { createPool, pingDatabase } from "@civ/db";
import { createLogger } from "@civ/telemetry";
import { requireTestEnv } from "@civ/testing";
import { Redis } from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app.js";

const pool = createPool({ connectionString: requireTestEnv("TEST_DATABASE_URL"), max: 2 });
const redis = new Redis(requireTestEnv("TEST_REDIS_URL"), { maxRetriesPerRequest: 1 });

afterAll(async () => {
  await pool.end();
  redis.disconnect();
});

describe("API readiness against real PostgreSQL and Redis", () => {
  it("reports ok for both dependencies", async () => {
    const app = buildApp({
      logger: createLogger({ service: "api", level: "silent" }),
      probes: {
        postgres: () => pingDatabase(pool),
        redis: async () => {
          expect(await redis.ping()).toBe("PONG");
        },
      },
    });
    try {
      const res = await app.inject("/health/ready");
      const report = healthReportSchema.parse(res.json());
      expect(res.statusCode, JSON.stringify(report)).toBe(200);
      expect(report.checks["postgres"]?.status).toBe("ok");
      expect(report.checks["redis"]?.status).toBe("ok");
    } finally {
      await app.close();
    }
  });
});
