import { spawnSync } from "node:child_process";

/**
 * Run steps in order with inherited stdio. Stops at the first failing step and
 * returns its exit status (1 if it was killed or could not start). Returns 0
 * only when every step succeeded.
 */
export function runSteps(steps, { cwd, env = process.env, log = console.log } = {}) {
  for (const step of steps) {
    const started = Date.now();
    log(`\n▶ ${step.name}: ${step.command} ${step.args.join(" ")}`);
    const result = spawnSync(step.command, step.args, { cwd, env, stdio: "inherit" });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (result.error) {
      log(`✗ ${step.name} could not start: ${result.error.message}`);
      return 1;
    }
    if (result.status !== 0) {
      log(`✗ ${step.name} failed (${result.signal ?? `exit ${result.status}`}, ${seconds}s)`);
      return result.status ?? 1;
    }
    log(`✓ ${step.name} (${seconds}s)`);
  }
  return 0;
}
