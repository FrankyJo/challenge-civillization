import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fixture } from "../test/fixtures.js";
import { API_ERROR_STATUS, apiErrorSchema, apiErrorStatus, createApiError } from "./api-error.js";
import { checkpointSchema, decodeEventCursor, encodeEventCursor, eventCursorStringSchema } from "./cursor.js";
import { ID_PREFIXES, idPattern, type IdKind } from "./ids.js";
import {
  PROPOSAL_NEXT_STATE,
  PROPOSAL_STATES,
  isProposalTransitionAllowed,
  proposalReviewSchema,
  sourceRecordSchema,
} from "./proposal.js";
import { definePublicDto } from "./public-dto.js";
import { ContractValidationError, parseContract } from "./validation.js";
import { z } from "zod";
import { publicSeasonDto, publicWorldDto, seasonRecordSchema, worldRecordSchema } from "./world.js";

const idBody = fc.stringMatching(/^[0-9a-z]{8,64}$/);

describe("stable IDs", () => {
  it("use unique three-letter prefixes", () => {
    const prefixes = Object.values(ID_PREFIXES);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    for (const prefix of prefixes) expect(prefix).toMatch(/^[a-z]{3}$/);
  });

  it("accept only their own kind", () => {
    const kinds = Object.keys(ID_PREFIXES) as IdKind[];
    fc.assert(
      fc.property(fc.constantFrom(...kinds), fc.constantFrom(...kinds), idBody, (kind, other, body) => {
        expect(idPattern(kind).test(`${ID_PREFIXES[other]}_${body}`)).toBe(kind === other);
      }),
    );
  });

  it("reject malformed bodies", () => {
    for (const bad of [
      "wld_short",
      "wld_UPPERCASE1",
      "wld-00000001",
      "wld_0000000_1",
      `wld_${"a".repeat(65)}`,
      " wld_00000001",
    ]) {
      expect(idPattern("world").test(bad)).toBe(false);
    }
  });
});

describe("world and season records", () => {
  it("reject an end year before the start year and BCE years", () => {
    expect(worldRecordSchema.safeParse({ ...fixture("v1/world-record.json"), endYear: 0 }).success).toBe(false);
    const issues = worldRecordSchema.safeParse({ ...fixture("v1/world-record.json"), startYear: 30, endYear: 29 });
    expect(issues.success).toBe(false);
  });

  it("reject malformed seeds and names", () => {
    for (const seed of ["9E3779B97F4A7C15", "abc", "9e3779b97f4a7c1", "zz3779b97f4a7c15"]) {
      expect(worldRecordSchema.safeParse({ ...fixture("v1/world-record.json"), seed }).success).toBe(false);
    }
    expect(worldRecordSchema.safeParse({ ...fixture("v1/world-record.json"), name: " x" }).success).toBe(false);
  });

  it("reject a season window that ends before it starts", () => {
    const season = { ...fixture("v1/season-record.json"), endsAt: "2026-12-31T00:00:00Z" };
    expect(seasonRecordSchema.safeParse(season).success).toBe(false);
  });
});

describe("public DTO allowlists", () => {
  const internalWorld: Record<string, unknown> = {
    ...fixture("v1/world-record.json"),
    operatorNotes: "private",
    leaseOwner: "host-1",
  };

  it("are exactly the declared fields", () => {
    expect(Object.keys(publicWorldDto.schema.shape).sort()).toEqual([...publicWorldDto.fields].sort());
    expect(Object.keys(publicSeasonDto.schema.shape).sort()).toEqual([...publicSeasonDto.fields].sort());
  });

  it("exclude internal audit and admin fields", () => {
    expect(publicWorldDto.fields).not.toContain("createdBy");
    expect(publicWorldDto.fields).not.toContain("createdAt");
    expect(publicSeasonDto.fields).not.toContain("updatedBy");
    const projected = publicWorldDto.toPublic(internalWorld);
    expect(projected).toEqual(fixture("v1/public-world.json"));
    expect(JSON.stringify(projected)).not.toMatch(/opr_|private|host-1/);
  });

  it("never leak fields outside the allowlist, whatever the record contains", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string({ minLength: 1 }), fc.jsonValue()), (extra) => {
        const record = { ...extra, ...fixture("v1/season-record.json") };
        expect(Object.keys(publicSeasonDto.toPublic(record)).sort()).toEqual([...publicSeasonDto.fields].sort());
      }),
    );
  });

  it("reject internal fields when a public payload is parsed", () => {
    expect(publicWorldDto.schema.safeParse({ ...fixture("v1/public-world.json"), createdBy: {} }).success).toBe(false);
  });

  it("reject unknown or duplicate allowlist entries at definition time", () => {
    const shape = worldRecordSchema.shape;
    expect(() => definePublicDto("x", shape, ["worldId", "worldId"])).toThrow(/twice/);
    expect(() => definePublicDto("x", shape, ["nope" as never])).toThrow(/unknown field/);
  });
});

describe("event cursors", () => {
  it("round-trip through the wire form", () => {
    fc.assert(
      fc.property(idBody, fc.nat({ max: Number.MAX_SAFE_INTEGER }), (body, position) => {
        const cursor = { worldId: `wld_${body}`, position };
        expect(decodeEventCursor(encodeEventCursor(cursor as never))).toEqual(cursor);
      }),
    );
  });

  it("reject malformed or out-of-range cursors without echoing them", () => {
    for (const wire of [
      "",
      "v2.wld_season001.1",
      "v1.wld_season001.-1",
      "v1.wld_season001.01",
      "v1.wld_season001.9007199254740993",
      "v1.evt_season001.1",
    ]) {
      expect(() => decodeEventCursor(wire)).toThrow(ContractValidationError);
    }
    expect(() => decodeEventCursor("v1.x.<script>")).toThrow(/malformed cursor/);
  });

  it("the wire-string schema agrees with the decoder on range", () => {
    expect(eventCursorStringSchema.safeParse("v1.wld_abcdefgh.9007199254740991").success).toBe(true);
    expect(eventCursorStringSchema.safeParse("v1.wld_abcdefgh.9999999999999999").success).toBe(false);
    expect(() => decodeEventCursor("v1.wld_abcdefgh.9999999999999999")).toThrow(ContractValidationError);
  });

  it("checkpoints require a state digest and versions", () => {
    const { stateHash: _stateHash, ...rest } = fixture("v1/checkpoint.json");
    expect(checkpointSchema.safeParse(rest).success).toBe(false);
  });
});

describe("API errors", () => {
  it("map every code to its HTTP status", () => {
    expect(apiErrorStatus("not_found")).toBe(404);
    expect(new Set(Object.values(API_ERROR_STATUS)).size).toBe(Object.keys(API_ERROR_STATUS).length);
  });

  it("build valid bodies with safe default messages and bounded details", () => {
    const body = createApiError({
      code: "invalid_request",
      correlationId: "abc",
      details: Array.from({ length: 80 }, (_, index) => ({ path: `f${index}`, message: "bad" })),
    });
    expect(apiErrorSchema.parse(body).error.details).toHaveLength(50);
    expect(body.error.message).toBe("The request is invalid.");
  });

  it("never throw while reporting an error", () => {
    const body = createApiError({
      code: "internal",
      correlationId: "has spaces <script>",
      message: "   ",
      details: [{ path: "", message: "" }],
      retryAfterSeconds: 1.5,
    });
    expect(body.error).toEqual({
      code: "internal",
      message: "An internal error occurred.",
      correlationId: "unknown",
      details: [],
    });
  });

  it("reject unknown codes and extra fields", () => {
    const valid = fixture("v1/api-error.json");
    expect(apiErrorSchema.safeParse({ ...valid, stack: "at x" }).success).toBe(false);
    expect(
      apiErrorSchema.safeParse({ schemaVersion: 1, error: { ...(valid["error"] as object), code: "teapot" } }).success,
    ).toBe(false);
  });
});

describe("proposal lifecycle", () => {
  it("advances exactly one stage at a time and stops at promoted", () => {
    for (const from of PROPOSAL_STATES) {
      for (const to of PROPOSAL_STATES) {
        expect(isProposalTransitionAllowed(from, to, "advance")).toBe(PROPOSAL_NEXT_STATE[from] === to);
      }
    }
    expect(PROPOSAL_STATES.filter((state) => PROPOSAL_NEXT_STATE[state] === null)).toEqual(["promoted"]);
  });

  it("rejection returns any in-review state to draft, never a promoted one", () => {
    for (const from of PROPOSAL_STATES) {
      for (const to of PROPOSAL_STATES) {
        const expected = to === "draft" && from !== "draft" && from !== "promoted";
        expect(isProposalTransitionAllowed(from, to, "reject")).toBe(expected);
      }
    }
  });

  it("review records enforce transitions and findings on rejection", () => {
    const rejection = fixture("v1/proposal-review.rejection.json");
    expect(proposalReviewSchema.safeParse({ ...rejection, findings: [] }).success).toBe(false);
    expect(proposalReviewSchema.safeParse({ ...rejection, to: "simulated" }).success).toBe(false);
    const advance = fixture("v1/proposal-review.json");
    expect(proposalReviewSchema.safeParse({ ...advance, to: "approved" }).success).toBe(false);
    expect(proposalReviewSchema.safeParse({ ...advance, from: "promoted", to: "draft" }).success).toBe(false);
  });

  it("source URLs must be public https hosts (no SSRF targets or credentials)", () => {
    const source = fixture("v1/source-record.json");
    const withUrl = (url: string) => sourceRecordSchema.safeParse({ ...source, locator: { kind: "url", url } }).success;
    expect(withUrl("https://example.org/irrigation-survey?page=2#fig1")).toBe(true);
    expect(withUrl("https://www.bl.uk:443/collection")).toBe(true);
    for (const url of [
      "https://user:pw@example.com/x",
      "https://user@example.com/x",
      "https://localhost/",
      "https://api.localhost/",
      "https://127.0.0.1/",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/",
      "https://2130706433/",
      "https://0x7f.0.0.1/",
      "https://intranet/",
      "https://printer.local/",
      "https://metadata.google.internal/",
      "https://example.com:8443/",
      `https://example.com/${"a".repeat(2050)}`,
    ]) {
      expect(withUrl(url), url).toBe(false);
    }
  });

  it("sources require https locators and well-formed partial dates", () => {
    const source = fixture("v1/source-record.json");
    expect(
      sourceRecordSchema.safeParse({ ...source, locator: { kind: "url", url: "http://example.org" } }).success,
    ).toBe(false);
    expect(
      sourceRecordSchema.safeParse({ ...source, locator: { kind: "url", url: "javascript:alert(1)" } }).success,
    ).toBe(false);
    expect(sourceRecordSchema.safeParse({ ...source, publishedOn: "1998-13" }).success).toBe(false);
    expect(sourceRecordSchema.safeParse({ ...source, authors: [] }).success).toBe(false);
  });
});

describe("validation errors", () => {
  it("never echo caller-controlled keys or values", () => {
    let caught: unknown;
    try {
      parseContract("probe", z.strictObject({ tags: z.record(z.string(), z.number()) }), {
        "<script>alert(1)</script>": 1,
        tags: { "evil key\u202e": "x", ok: 1 },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ContractValidationError);
    const error = caught as ContractValidationError;
    expect([...error.issues].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      { path: "(root)", message: "1 unrecognized key" },
      { path: "tags.[key]", message: expect.any(String) },
    ]);
    expect(error.message).not.toMatch(/script|evil|\u202e/);
  });
});
