import { createHash } from "node:crypto";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { canonicalHash } from "./hash.js";
import { sha256, toHex } from "./sha256.js";

const nodeSha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

describe("sha256", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
  ])("matches the FIPS 180-4 vector for %j", (text, expected) => {
    expect(toHex(sha256(new TextEncoder().encode(text)))).toBe(expected);
  });

  it("agrees with Node's crypto for arbitrary inputs, including block boundaries", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
        expect(toHex(sha256(bytes))).toBe(nodeSha(bytes));
      }),
      { numRuns: 500 },
    );
    for (const length of [55, 56, 63, 64, 65, 119, 120, 128]) {
      const bytes = new Uint8Array(length).fill(length);
      expect(toHex(sha256(bytes))).toBe(nodeSha(bytes));
    }
  });

  it("hashes values canonically, independent of key order", () => {
    expect(canonicalHash({ a: 1, b: [true, null] })).toBe(canonicalHash({ b: [true, null], a: 1 }));
    expect(canonicalHash({ a: 1 })).toBe(`sha256:${nodeSha(new TextEncoder().encode('{"a":1}'))}`);
    expect(canonicalHash({ a: 1 })).not.toBe(canonicalHash({ a: 2 }));
  });
});
