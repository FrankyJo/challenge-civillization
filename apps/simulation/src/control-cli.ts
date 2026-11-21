import { createPool, submitControl } from "@civ/db";
import { loadSimulationEnv } from "./env.js";
import { parseControlArgs } from "./control-args.js";

// Queue an operator control for the world runner (docs/RUNNER.md § Operator
// controls). The runner holding the world's lease applies it on its next
// cycle; the request and the decision are audited.
const env = loadSimulationEnv(process.env);
let request;
try {
  request = parseControlArgs(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
const pool = createPool({ connectionString: env.DATABASE_URL, max: 1, applicationName: "civ-runner-control" });
try {
  const control = await submitControl(pool, {
    worldId: request.worldId,
    requestKey: request.requestKey,
    action: request.action,
    ...(request.ticks === undefined ? {} : { ticks: request.ticks }),
    ...(request.extraMs === undefined ? {} : { extraMs: request.extraMs }),
    actor: { kind: "operator", operatorId: request.operatorId as never },
    reason: request.reason,
    correlationId: `runner-control.${request.requestKey}`.slice(0, 128),
  });
  console.log(`control ${control.id} (${control.action}) is ${control.status}`);
} finally {
  await pool.end();
}
