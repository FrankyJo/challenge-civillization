import { describe, expect, it } from "vitest";
import { ResetRefusedError } from "./errors.js";
import { assertResetAllowed } from "./reset.js";

const local = "postgresql://u:p@127.0.0.1:5432/civ";

describe("assertResetAllowed", () => {
  it("allows only opted-in, non-production, loopback resets", () => {
    expect(() => assertResetAllowed({ nodeEnv: "development", allowFlag: "1", databaseUrl: local })).not.toThrow();
    expect(() =>
      assertResetAllowed({ nodeEnv: undefined, allowFlag: "1", databaseUrl: "postgres://u@localhost/civ" }),
    ).not.toThrow();
  });

  it.each([
    [{ nodeEnv: "production", allowFlag: "1", databaseUrl: local }, /NODE_ENV=production/],
    [{ nodeEnv: "development", allowFlag: undefined, databaseUrl: local }, /CIV_ALLOW_DB_RESET=1/],
    [{ nodeEnv: "development", allowFlag: "yes", databaseUrl: local }, /CIV_ALLOW_DB_RESET=1/],
    [{ nodeEnv: "test", allowFlag: "1", databaseUrl: "postgresql://u@db.internal:5432/civ" }, /loopback/],
    [{ nodeEnv: "test", allowFlag: "1", databaseUrl: "not a url" }, /valid DATABASE_URL/],
    [{ nodeEnv: "test", allowFlag: "1", databaseUrl: `${local}?host=db.internal` }, /query parameters/],
    [{ nodeEnv: "test", allowFlag: "1", databaseUrl: `${local}?hostaddr=10.0.0.5` }, /query parameters/],
    [{ nodeEnv: "test", allowFlag: "1", databaseUrl: "postgresql://u@localhost/civ?service=prod" }, /query parameters/],
    [{ nodeEnv: "test", allowFlag: "1", databaseUrl: "postgresql://u@[::2]/civ" }, /loopback/],
  ])("refuses %#", (env, message) => {
    expect(() => assertResetAllowed(env)).toThrow(message);
    expect(() => assertResetAllowed(env)).toThrow(ResetRefusedError);
  });
});
