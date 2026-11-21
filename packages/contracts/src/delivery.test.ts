import { describe, expect, it } from "vitest";
import { ledgerNotificationSchema } from "./delivery.js";

describe("ledger notification", () => {
  const base = { schemaVersion: 1, worldId: "wld_season001", fromPosition: 3, toPosition: 4 };

  it("accepts a non-empty range", () => {
    expect(ledgerNotificationSchema.parse(base)).toEqual(base);
  });

  it("rejects empty or inverted ranges, unknown fields and bad ids", () => {
    expect(ledgerNotificationSchema.safeParse({ ...base, toPosition: 3 }).success).toBe(false);
    expect(ledgerNotificationSchema.safeParse({ ...base, toPosition: 2 }).success).toBe(false);
    expect(ledgerNotificationSchema.safeParse({ ...base, events: [] }).success).toBe(false);
    expect(ledgerNotificationSchema.safeParse({ ...base, worldId: "evt_season001" }).success).toBe(false);
    expect(ledgerNotificationSchema.safeParse({ ...base, fromPosition: -1 }).success).toBe(false);
  });
});
