import { describe, expect, it } from "vitest";
import { BUNDLED_CONTENT_PACKS } from "./index.js";

describe("@civ/content public surface", () => {
  it("ships no content packs before the content pipeline exists", () => {
    expect(BUNDLED_CONTENT_PACKS).toEqual([]);
    expect(Object.isFrozen(BUNDLED_CONTENT_PACKS)).toBe(true);
  });
});
