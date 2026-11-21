import { describe, expect, it } from "vitest";
import { parseControlArgs } from "./control-args.js";

const common = ["--operator", "opr_00000001", "--reason", "planned maintenance", "--key", "maint-2027-01-02"];

describe("runner-control arguments", () => {
  it("parses every action", () => {
    expect(parseControlArgs(["wld_world0001", "pause", ...common])).toMatchObject({
      action: "pause",
      operatorId: "opr_00000001",
    });
    expect(parseControlArgs(["wld_world0001", "step", "5", ...common])).toMatchObject({ action: "step", ticks: 5 });
    expect(parseControlArgs(["wld_world0001", "extend", "90", ...common])).toMatchObject({
      action: "extend",
      extraMs: 5_400_000,
    });
    expect(parseControlArgs(["wld_world0001", "approve_catch_up", ...common])).toMatchObject({
      action: "approve_catch_up",
    });
  });

  it("rejects missing or malformed input", () => {
    expect(() => parseControlArgs(["wld_world0001", "pause"])).toThrow(/usage/);
    expect(() => parseControlArgs(["nope", "pause", ...common])).toThrow(/world ID/);
    expect(() => parseControlArgs(["wld_world0001", "step", "0", ...common])).toThrow(/positive integer/);
    expect(() => parseControlArgs(["wld_world0001", "pause", "3", ...common])).toThrow(/no amount/);
    expect(() => parseControlArgs(["wld_world0001", "rewind", ...common])).toThrow(/unknown action/);
    expect(() =>
      parseControlArgs([
        "wld_world0001",
        "pause",
        "--operator",
        "opr_00000001",
        "--reason",
        "x",
        "--key",
        "k-12345678",
      ]),
    ).toThrow(/reason/);
  });
});
