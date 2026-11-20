import { canonicalize, ContractValidationError, publicWorldDto } from "@civ/contracts";
import { describe, expect, it } from "vitest";
import { createContractBuilders } from "./builders.js";

describe("contract builders", () => {
  it("are deterministic for the same call sequence", () => {
    const run = () => {
      const build = createContractBuilders();
      return canonicalize([build.world(), build.season(), build.command(), build.event()]);
    };
    expect(run()).toBe(run());
  });

  it("produce envelopes with every audit field and unique IDs", () => {
    const build = createContractBuilders();
    const first = build.command();
    const second = build.command({ type: "world.resume", payload: { reason: "done" } });
    expect(first.commandId).not.toBe(second.commandId);
    expect(second.type).toBe("world.resume");
    expect(first.worldId).toBe(build.world().worldId);
    expect(build.event({ causationId: first.commandId, sequence: 3 })).toMatchObject({ sequence: 3 });
  });

  it("reject overrides that violate the production contract", () => {
    const build = createContractBuilders();
    expect(() => build.command({ actor: { kind: "system", component: "scheduler" } })).toThrow(ContractValidationError);
    expect(() => build.command({ payload: { reason: "x", extra: true } })).toThrow(ContractValidationError);
    expect(() => build.event({ causationId: null })).toThrow(ContractValidationError);
    expect(() => build.world({ startYear: 0 })).toThrow(ContractValidationError);
    expect(() => build.versions({ engineVersion: "1" })).toThrow(ContractValidationError);
  });

  it("feed public projections", () => {
    const world = createContractBuilders().world();
    expect(Object.keys(publicWorldDto.toPublic(world))).not.toContain("createdBy");
  });
});
