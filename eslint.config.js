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
  { name: "Intl", message: "Locale-dependent formatting/collation is not deterministic across platforms." },
  ...["globalThis", "global", "window", "self"].map((name) => ({
    name,
    message: "Domain code must not reach host globals (it would bypass the determinism guard).",
  })),
  ...["setImmediate", "queueMicrotask", "requestAnimationFrame"].map((name) => ({
    name,
    message: "Domain code must not schedule work.",
  })),
  ...["WeakRef", "FinalizationRegistry"].map((name) => ({
    name,
    message: "Garbage-collector timing is not deterministic.",
  })),
  ...["WebSocket", "XMLHttpRequest", "EventSource", "navigator", "location", "Temporal", "require", "Atomics"].map(
    (name) => ({ name, message: "Domain code is pure: no I/O, host, time or module-loading APIs." }),
  ),
];

/**
 * Math functions whose results ECMAScript leaves implementation-approximated
 * (they may differ between engines/platforms), plus Math.random.
 */
const NON_DETERMINISTIC_MATH = [
  "random",
  "exp",
  "expm1",
  "log",
  "log1p",
  "log2",
  "log10",
  "pow",
  "cbrt",
  "hypot",
  "sin",
  "cos",
  "tan",
  "asin",
  "acos",
  "atan",
  "atan2",
  "sinh",
  "cosh",
  "tanh",
  "asinh",
  "acosh",
  "atanh",
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
        ...NON_DETERMINISTIC_MATH.map((property) => ({
          object: "Math",
          property,
          message:
            property === "random"
              ? "Use a named deterministic PRNG stream (CLAUDE.md)."
              : `Math.${property} is not bit-identical across engines; use integer/fixed-point helpers.`,
        })),
        { property: "localeCompare", message: "Locale collation is platform-dependent; compare code units." },
        { property: "toLocaleString", message: "Locale formatting is platform-dependent." },
        { property: "toLocaleUpperCase", message: "Locale case mapping is platform-dependent." },
        { property: "toLocaleLowerCase", message: "Locale case mapping is platform-dependent." },
        { property: "toLocaleDateString", message: "Domain code must not format wall-clock dates." },
        { property: "toLocaleTimeString", message: "Domain code must not format wall-clock dates." },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportExpression",
          message: "Dynamic import() cannot be checked by the determinism guard; use static imports.",
        },
        {
          selector: "MemberExpression[object.name='Math'][computed=true]",
          message: "Computed Math access bypasses the determinism guard; call allowed Math functions directly.",
        },
        {
          selector: "VariableDeclarator[init.name='Math'], AssignmentExpression[right.name='Math']",
          message: "Aliasing or destructuring Math bypasses the determinism guard.",
        },
        {
          selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']",
          message: "`**` is implementation-approximated for Numbers; multiply explicitly or use BigInt helpers.",
        },
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "node:*",
                "fs",
                "fs/*",
                "path",
                "os",
                "http",
                "https",
                "http2",
                "net",
                "dgram",
                "dns",
                "tls",
                "crypto",
                "child_process",
                "cluster",
                "worker_threads",
                "perf_hooks",
                "timers",
                "timers/*",
                "util",
                "zlib",
                "stream",
                "buffer",
                "url",
                "vm",
                "v8",
                "process",
                "async_hooks",
              ],
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
