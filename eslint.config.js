// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import vue from "eslint-plugin-vue";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Determinism guard for the pure simulation domain. Ambient randomness, wall
 * clock, timers, environment and I/O must enter through ports (CLAUDE.md).
 */
const DOMAIN_RESTRICTED_GLOBALS = [
  { name: "Date", message: "Domain code must not read wall-clock time; take ticks/time from the clock port." },
  { name: "performance", message: "Domain code must not read timers." },
  { name: "process", message: "Domain code must not read process state or environment." },
  { name: "setTimeout", message: "Domain code must not schedule work." },
  { name: "setInterval", message: "Domain code must not schedule work." },
  { name: "fetch", message: "Domain code must not perform network I/O." },
  { name: "crypto", message: "Use named deterministic PRNG streams, not crypto randomness." },
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/.turbo/**",
      "**/playwright-report/**",
      "**/test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...vue.configs["flat/recommended"],
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      "no-console": "off",
      eqeqeq: ["error", "always"],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.vue"],
    languageOptions: { parserOptions: { parser: tseslint.parser }, globals: { ...globals.browser } },
  },
  {
    files: ["apps/web/src/**/*.ts"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ["packages/domain/src/**/*.ts"],
    ignores: ["packages/domain/src/**/*.test.ts"],
    rules: {
      "no-restricted-globals": ["error", ...DOMAIN_RESTRICTED_GLOBALS],
      "no-restricted-properties": [
        "error",
        { object: "Math", property: "random", message: "Use a named deterministic PRNG stream (CLAUDE.md)." },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*", "fs", "path", "os", "http", "https", "net", "crypto", "child_process"],
              message: "Domain code is pure: no Node I/O modules.",
            },
            {
              group: ["@civ/db", "@civ/telemetry", "pg", "ioredis", "bullmq", "fastify", "vue", "phaser"],
              message: "Domain code must not depend on infrastructure or UI.",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
