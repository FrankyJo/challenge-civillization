import { createContractBuilders } from "@civ/testing";
import { describe, expect, it } from "vitest";
import { canonicalDigest } from "./digest.js";
import { ledgerMessageKey, requestDigest } from "./ledger.js";
import { outboxBackoffMs } from "./outbox.js";
import { toSafeInt } from "./transaction.js";

describe("requestDigest", () => {
  const builders = createContractBuilders();
  const command = builders.command();

  it("ignores delivery identity (commandId, issuedAt) but not intent", () => {
    const redelivered = {
      ...command,
      commandId: "cmd_zzzzzzzz",
      issuedAt: "2030-01-01T00:00:00.000Z",
      correlationId: "retry-trace-2",
    };
    expect(requestDigest(redelivered as typeof command)).toBe(requestDigest(command));
    const changed = { ...command, payload: { reason: "other" } };
    expect(requestDigest(changed as typeof command)).not.toBe(requestDigest(command));
    expect(requestDigest({ ...command, expectedVersion: 3 })).not.toBe(requestDigest(command));
    expect(requestDigest({ ...command, idempotencyKey: "other-key-1" })).not.toBe(requestDigest(command));
  });
});

describe("helpers", () => {
  it("canonicalDigest is key-order independent", () => {
    expect(canonicalDigest({ a: 1, b: [2, { c: 3 }] })).toBe(canonicalDigest({ b: [2, { c: 3 }], a: 1 }));
    expect(canonicalDigest({})).toBe("sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a");
  });

  it("ledger message keys are stable and BullMQ-safe", () => {
    expect(ledgerMessageKey("wld_season001", 42)).toBe("ledger.wld_season001.42");
    expect(ledgerMessageKey("wld_season001", 42)).not.toContain(":");
  });

  it("outbox backoff doubles from 1 s and is capped", () => {
    expect([1, 2, 3, 4].map((n) => outboxBackoffMs(n, 300_000))).toEqual([1_000, 2_000, 4_000, 8_000]);
    expect(outboxBackoffMs(40, 300_000)).toBe(300_000);
    expect(outboxBackoffMs(0, 300_000)).toBe(1_000);
  });

  it("toSafeInt parses bigint text and rejects unsafe values", () => {
    expect(toSafeInt("9007199254740991", "x")).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => toSafeInt("9007199254740992", "x")).toThrow(RangeError);
    expect(() => toSafeInt(null, "x")).toThrow(RangeError);
  });
});
