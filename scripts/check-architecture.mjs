#!/usr/bin/env node
// Fail when any workspace imports or declares a dependency the architecture
// policy (scripts/architecture-policy.mjs) does not allow.
import { resolve } from "node:path";
import { TEST_SUPPORT, TEST_SUPPORT_EXCLUDED, WORKSPACE_POLICY } from "./architecture-policy.mjs";
import { checkArchitecture } from "./lib/architecture.mjs";

const root = resolve(import.meta.dirname, "..");
const violations = checkArchitecture(root, {
  policy: WORKSPACE_POLICY,
  testSupport: TEST_SUPPORT,
  testSupportExcluded: TEST_SUPPORT_EXCLUDED,
});
if (violations.length > 0) {
  for (const violation of violations) {
    const where = violation.specifier === undefined ? violation.file : `${violation.file} → ${violation.specifier}`;
    console.error(`✗ [${violation.rule}] ${where}: ${violation.message}`);
  }
  console.error(`\n${violations.length} architecture violation(s).`);
  process.exit(1);
}
console.log(`Architecture boundaries respected (${Object.keys(WORKSPACE_POLICY).length} workspaces).`);
