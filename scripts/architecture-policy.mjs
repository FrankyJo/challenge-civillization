// Allowed dependency graph between workspaces (docs/CONTRACTS.md, ADR 0003).
//
// For each workspace:
// - `workspace`: internal packages its production code (src/, non-test) may import.
// - `external`: third-party packages its production code may import; `null`
//   means any package declared in its package.json `dependencies`.
// - `nodeBuiltins`: whether production code may import Node built-in modules.
//
// Test and tooling files may additionally import TEST_SUPPORT packages and
// any dependency declared in the workspace or root package.json, but never
// another app or a workspace outside the allowed graph. Changing this file
// changes the architecture: record the reason in an ADR.

/** @typedef {{ workspace: string[], external: string[] | null, nodeBuiltins: boolean }} WorkspacePolicy */

/** @type {Record<string, WorkspacePolicy>} */
export const WORKSPACE_POLICY = {
  // Browser-safe schemas shared by every process and the web client.
  "@civ/contracts": { workspace: [], external: ["zod"], nodeBuiltins: false },
  // Pure deterministic domain: contracts only, no I/O, no infrastructure, no UI.
  "@civ/domain": { workspace: ["@civ/contracts"], external: ["zod"], nodeBuiltins: false },
  // Versioned content packs consumed by the engine.
  "@civ/content": { workspace: ["@civ/contracts", "@civ/domain"], external: ["zod"], nodeBuiltins: false },
  "@civ/telemetry": { workspace: ["@civ/contracts"], external: null, nodeBuiltins: true },
  "@civ/db": { workspace: ["@civ/contracts", "@civ/telemetry"], external: null, nodeBuiltins: true },
  "@civ/testing": { workspace: ["@civ/contracts"], external: null, nodeBuiltins: true },
  // The API serves projections and appends commands; it never runs domain transitions.
  "@civ/api": { workspace: ["@civ/contracts", "@civ/db", "@civ/telemetry"], external: null, nodeBuiltins: true },
  "@civ/simulation": {
    workspace: ["@civ/contracts", "@civ/content", "@civ/db", "@civ/domain", "@civ/telemetry"],
    external: null,
    nodeBuiltins: true,
  },
  "@civ/worker": {
    workspace: ["@civ/contracts", "@civ/content", "@civ/db", "@civ/domain", "@civ/telemetry"],
    external: null,
    nodeBuiltins: true,
  },
  // Vue/Phaser projection: reads contracts only; no authoritative rules, no server code.
  "@civ/web": { workspace: ["@civ/contracts"], external: ["phaser", "vue", "zod"], nodeBuiltins: false },
};

/** Workspaces that tests (never production code) may import. */
export const TEST_SUPPORT = ["@civ/testing"];

/** Workspaces whose tests may not use TEST_SUPPORT (it depends on them). */
export const TEST_SUPPORT_EXCLUDED = ["@civ/contracts", "@civ/testing"];
