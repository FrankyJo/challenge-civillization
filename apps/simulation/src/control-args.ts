import { idempotencyKeySchema, operatorIdSchema, worldIdSchema } from "@civ/contracts";
import { type RunnerControlAction } from "@civ/db";

export interface ControlRequest {
  readonly worldId: string;
  readonly action: RunnerControlAction;
  readonly ticks?: number;
  readonly extraMs?: number;
  readonly operatorId: string;
  readonly reason: string;
  readonly requestKey: string;
}

export const CONTROL_USAGE =
  "usage: runner-control <worldId> <pause|resume|step <ticks>|extend <minutes>|approve_catch_up> " +
  "--operator <opr_…> --reason <text> --key <request key>";

/**
 * Parse `runner-control` arguments. The request key is required so a retried
 * submission never queues a control twice.
 */
export function parseControlArgs(argv: readonly string[]): ControlRequest {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg.startsWith("--")) {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${arg} needs a value\n${CONTROL_USAGE}`);
      flags.set(arg.slice(2), value);
      index += 1;
    } else positional.push(arg);
  }
  const [worldId, action, amount] = positional;
  const operatorId = flags.get("operator");
  const reason = flags.get("reason");
  const requestKey = flags.get("key");
  if (
    worldId === undefined ||
    action === undefined ||
    operatorId === undefined ||
    reason === undefined ||
    requestKey === undefined
  ) {
    throw new Error(CONTROL_USAGE);
  }
  if (!worldIdSchema.safeParse(worldId).success) throw new Error(`invalid world ID ${worldId}`);
  if (!operatorIdSchema.safeParse(operatorId).success) throw new Error(`invalid operator ID ${operatorId}`);
  if (!idempotencyKeySchema.safeParse(requestKey).success)
    throw new Error("the request key must be 8–128 characters [A-Za-z0-9._:-]");
  if (reason.trim().length < 3) throw new Error("a reason of at least 3 characters is required");
  const integer = (text: string | undefined, what: string) => {
    const value = Number(text);
    if (text === undefined || !Number.isSafeInteger(value) || value < 1)
      throw new Error(`${what} must be a positive integer`);
    return value;
  };
  const base = { worldId, operatorId, reason: reason.trim(), requestKey };
  switch (action) {
    case "pause":
    case "resume":
    case "approve_catch_up":
      if (amount !== undefined) throw new Error(`${action} takes no amount`);
      return { ...base, action };
    case "step":
      return { ...base, action, ticks: integer(amount, "ticks") };
    case "extend":
      return { ...base, action, extraMs: integer(amount, "minutes") * 60_000 };
    default:
      throw new Error(`unknown action ${action}\n${CONTROL_USAGE}`);
  }
}
