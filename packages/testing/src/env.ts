/**
 * Read a variable that an integration suite cannot run without. Integration
 * suites must FAIL (not skip) when infrastructure is not configured, so a
 * missing variable throws with setup instructions.
 */
export function requireTestEnv(
  name: string,
  source: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const value = source[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is not set. Integration tests need real infrastructure: run \`pnpm infra:up\` ` +
        `and export ${name} (see .env.example).`,
    );
  }
  return value;
}
