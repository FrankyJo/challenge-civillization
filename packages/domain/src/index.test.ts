import { describe, expect, it } from "vitest";
import * as domain from "./index.js";

describe("@civ/domain public surface", () => {
  it("exposes the kernel building blocks and a semver engine version", () => {
    expect(domain.ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    for (const name of [
      "createEngine",
      "replay",
      "createSystemSchedule",
      "RandomRoot",
      "deriveId",
      "canonicalHash",
      "instantAt",
      "ticksDueAt",
      "mulDiv",
      "allocate",
    ]) {
      expect(domain, name).toHaveProperty(name);
    }
  });
});
