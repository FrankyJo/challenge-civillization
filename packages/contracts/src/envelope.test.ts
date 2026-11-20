import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fixture } from "../test/fixtures.js";
import { createCommandRegistry, createEventRegistry, defineCommand, defineEvent } from "./envelope.js";
import { commandRegistry, eventRegistry, type Command, type DomainEvent } from "./messages.js";
import { ContractValidationError } from "./validation.js";

const pause = () => fixture("v1/command-envelope.world-pause.json");
const paused = () => fixture("v1/event-envelope.world-paused.json");

function issuesOf(result: ReturnType<typeof commandRegistry.safeParse> | ReturnType<typeof eventRegistry.safeParse>) {
  if (result.success) throw new Error("expected rejection");
  return result.error.issues;
}

/** Audit/version fields the phase requires on every envelope. */
const COMMAND_AUDIT_FIELDS = [
  "schemaVersion",
  "commandId",
  "type",
  "typeVersion",
  "worldId",
  "instant",
  "issuedAt",
  "actor",
  "idempotencyKey",
  "expectedVersion",
  "causationId",
  "correlationId",
  "versions",
  "payload",
];
const EVENT_AUDIT_FIELDS = [
  "schemaVersion",
  "eventId",
  "type",
  "typeVersion",
  "worldId",
  "sequence",
  "instant",
  "causationId",
  "correlationId",
  "versions",
  "payload",
];

describe("command envelopes", () => {
  it("parse into a typed union narrowed by type", () => {
    const command: Command = commandRegistry.parse(pause());
    expect(command.type).toBe("world.pause");
    if (command.type === "world.pause") expect(command.payload.reason).toBe("Database maintenance window");
  });

  it.each(COMMAND_AUDIT_FIELDS)("require %s", (field) => {
    const { [field]: _removed, ...raw } = pause();
    expect(commandRegistry.safeParse(raw).success).toBe(false);
  });

  it.each([
    [
      "versions.engineVersion",
      (raw: Record<string, unknown>) => delete (raw["versions"] as Record<string, unknown>)["engineVersion"],
    ],
    [
      "versions.contentVersion",
      (raw: Record<string, unknown>) => delete (raw["versions"] as Record<string, unknown>)["contentVersion"],
    ],
    [
      "versions.configVersion",
      (raw: Record<string, unknown>) => delete (raw["versions"] as Record<string, unknown>)["configVersion"],
    ],
    ["instant.tick", (raw: Record<string, unknown>) => delete (raw["instant"] as Record<string, unknown>)["tick"]],
    ["instant.year", (raw: Record<string, unknown>) => delete (raw["instant"] as Record<string, unknown>)["year"]],
  ])("require nested %s", (path, mutate) => {
    const raw = pause();
    mutate(raw);
    expect(issuesOf(commandRegistry.safeParse(raw)).map((issue) => issue.path)).toContain(path);
  });

  it("reject unknown envelope and payload fields", () => {
    expect(issuesOf(commandRegistry.safeParse({ ...pause(), extra: 1 }))[0]?.message).toMatch(/unrecognized key/i);
    const raw = pause();
    raw["payload"] = { reason: "ok", force: true };
    expect(issuesOf(commandRegistry.safeParse(raw))[0]?.path).toBe("payload");
  });

  it("reject unknown types and unknown versions of known types", () => {
    expect(issuesOf(commandRegistry.safeParse({ ...pause(), type: "world.delete" }))[0]?.message).toMatch(
      /unknown command type world\.delete@1/,
    );
    expect(commandRegistry.safeParse({ ...pause(), typeVersion: 2 }).success).toBe(false);
  });

  it("reject invalid payload, wrong ID kinds, BCE years and bad digests", () => {
    expect(commandRegistry.safeParse({ ...pause(), payload: { reason: "" } }).success).toBe(false);
    expect(commandRegistry.safeParse({ ...pause(), payload: { reason: " padded" } }).success).toBe(false);
    for (const reason of ["a\u0000b", "a\u202eb", "a\u200bb", "a\u001bb"]) {
      expect(commandRegistry.safeParse({ ...pause(), payload: { reason } }).success, JSON.stringify(reason)).toBe(
        false,
      );
    }
    expect(commandRegistry.safeParse({ ...pause(), payload: { reason: "line one\nline two" } }).success).toBe(true);
    expect(commandRegistry.safeParse({ ...pause(), commandId: "evt_00000001" }).success).toBe(false);
    expect(commandRegistry.safeParse({ ...pause(), worldId: "wld_UPPER123" }).success).toBe(false);
    expect(commandRegistry.safeParse({ ...pause(), instant: { tick: 0, year: 0, dayOfYear: 1 } }).success).toBe(false);
    expect(commandRegistry.safeParse({ ...pause(), instant: { tick: -1, year: 1, dayOfYear: 1 } }).success).toBe(false);
    expect(commandRegistry.safeParse({ ...pause(), issuedAt: "2027-02-30T00:00:00Z" }).success).toBe(false);
    expect(commandRegistry.safeParse({ ...pause(), issuedAt: "2027-01-02T03:04:05+02:00" }).success).toBe(false);
    const raw = pause();
    (raw["versions"] as Record<string, unknown>)["contentVersion"] = "sha256:abc";
    expect(commandRegistry.safeParse(raw).success).toBe(false);
  });

  it("enforce the actor kinds a command allows", () => {
    const raw = { ...pause(), actor: { kind: "system", component: "scheduler" } };
    expect(issuesOf(commandRegistry.safeParse(raw))).toEqual([
      { path: "actor.kind", message: "world.pause cannot be issued by actor kind system" },
    ]);
  });

  it("reject a command that names itself as its cause", () => {
    expect(commandRegistry.safeParse({ ...pause(), causationId: "cmd_00000001" }).success).toBe(false);
    expect(commandRegistry.safeParse({ ...pause(), causationId: "evt_00000009" }).success).toBe(true);
  });

  it("never echo rejected values in errors", () => {
    const result = commandRegistry.safeParse({ ...pause(), idempotencyKey: "secret value!" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeInstanceOf(ContractValidationError);
      expect(result.error.message).not.toContain("secret value!");
    }
  });
});

describe("event envelopes", () => {
  it("parse into a typed union", () => {
    const event: DomainEvent = eventRegistry.parse(paused());
    expect(event).toMatchObject({ type: "world.paused", sequence: 0, causationId: "cmd_00000001" });
  });

  it.each(EVENT_AUDIT_FIELDS)("require %s", (field) => {
    const { [field]: _removed, ...raw } = paused();
    expect(eventRegistry.safeParse(raw).success).toBe(false);
  });

  it("forbid null causation, self-causation and wall-clock fields", () => {
    expect(eventRegistry.safeParse({ ...paused(), causationId: null }).success).toBe(false);
    expect(eventRegistry.safeParse({ ...paused(), causationId: "evt_00000001" }).success).toBe(false);
    expect(eventRegistry.safeParse({ ...paused(), issuedAt: "2027-01-02T03:04:05Z" }).success).toBe(false);
  });

  it("reject command types in the event registry and vice versa", () => {
    expect(eventRegistry.safeParse({ ...paused(), type: "world.pause" }).success).toBe(false);
    expect(commandRegistry.has("world.paused", 1)).toBe(false);
  });
});

describe("message definitions", () => {
  const strictPayload = z.strictObject({ value: z.number().int() });

  it("require strict object payloads", () => {
    expect(() =>
      defineEvent({ type: "test.loose", typeVersion: 1, description: "x", payload: z.object({}) as never }),
    ).toThrow(/must be a z.strictObject/);
    expect(() =>
      defineEvent({ type: "test.loose", typeVersion: 1, description: "x", payload: z.looseObject({}) as never }),
    ).toThrow(/must be a z.strictObject/);
  });

  it("validate names, versions and actor lists", () => {
    expect(() => defineEvent({ type: "Bad.Name", typeVersion: 1, description: "x", payload: strictPayload })).toThrow();
    expect(() => defineEvent({ type: "test.ok", typeVersion: 0, description: "x", payload: strictPayload })).toThrow();
    expect(() =>
      defineCommand({ type: "test.ok", typeVersion: 1, description: "x", actorKinds: [], payload: strictPayload }),
    ).toThrow(/no actor kinds/);
  });

  it("reject duplicate registrations but allow several versions of one type", () => {
    const v1 = defineEvent({ type: "test.thing", typeVersion: 1, description: "v1", payload: strictPayload });
    const v2 = defineEvent({
      type: "test.thing",
      typeVersion: 2,
      description: "v2",
      payload: z.strictObject({ value: z.string() }),
    });
    expect(() => createEventRegistry([v1, v1])).toThrow(/Duplicate event definition test\.thing@1/);
    const registry = createEventRegistry([v1, v2]);
    const base = { ...paused(), type: "test.thing" };
    expect(registry.parse({ ...base, typeVersion: 1, payload: { value: 3 } }).payload).toEqual({ value: 3 });
    expect(registry.parse({ ...base, typeVersion: 2, payload: { value: "x" } }).payload).toEqual({ value: "x" });
    expect(registry.safeParse({ ...base, typeVersion: 2, payload: { value: 3 } }).success).toBe(false);
  });

  it("reject mixing commands into an event registry", () => {
    const command = defineCommand({
      type: "test.cmd",
      typeVersion: 1,
      description: "x",
      actorKinds: ["operator"],
      payload: strictPayload,
    });
    expect(() => createEventRegistry([command as never])).toThrow(/not a event definition/);
    expect(() => createCommandRegistry([])).toThrow(/at least one/);
  });
});
