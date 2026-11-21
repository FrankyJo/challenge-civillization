import { idPattern } from "@civ/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DERIVED_ID_BODY_LENGTH, deriveId } from "./ids.js";

describe("deriveId", () => {
  it("is stable and satisfies the contract", () => {
    const id = deriveId("event", "wld_season001", 0);
    expect(id).toBe(deriveId("event", "wld_season001", 0));
    expect(id).toMatch(idPattern("event"));
    expect(id).toHaveLength(4 + DERIVED_ID_BODY_LENGTH);
    expect(id).toMatchInlineSnapshot(`"evt_21j59avuia67fket"`);
  });

  it("separates kinds, scopes and label types", () => {
    expect(deriveId("event", "w", 1).slice(4)).not.toBe(deriveId("checkpoint", "w", 1).slice(4));
    expect(deriveId("event", "w", 1)).not.toBe(deriveId("event", "w", "1"));
    expect(deriveId("event", "ab", "c")).not.toBe(deriveId("event", "a", "bc"));
  });

  it("does not collide over many sequential scopes", () => {
    const ids = new Set(Array.from({ length: 20_000 }, (_, sequence) => deriveId("event", "wld_x", sequence)));
    expect(ids.size).toBe(20_000);
  });

  it("always yields a valid ID for any scope", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.string({ minLength: 1 }), fc.integer()), { minLength: 1, maxLength: 4 }),
        (scope) => {
          expect(deriveId("world", ...scope)).toMatch(idPattern("world"));
        },
      ),
    );
  });

  it("rejects empty or non-integer labels", () => {
    expect(() => deriveId("event")).toThrow(TypeError);
    expect(() => deriveId("event", "")).toThrow(TypeError);
    expect(() => deriveId("event", 0.5)).toThrow(TypeError);
  });
});
