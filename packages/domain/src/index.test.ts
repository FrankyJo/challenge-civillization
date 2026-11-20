import { describe, expect, it } from "vitest";
import * as domain from "./index.js";

describe("@civ/domain public surface", () => {
  it("exposes a semver engine version and nothing else yet", () => {
    expect(domain.ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Object.keys(domain)).toEqual(["ENGINE_VERSION"]);
  });
});
