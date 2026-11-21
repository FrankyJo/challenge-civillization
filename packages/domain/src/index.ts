/**
 * @civ/domain — pure deterministic simulation kernel.
 *
 * Boundaries are enforced twice: the ESLint determinism guard (no
 * Math.random, Date, timers, process, Intl/locale APIs, transcendental Math
 * or `**`) and the dependency policy in scripts/architecture-policy.mjs
 * (production code may import only @civ/contracts and zod).
 */
export * from "./calendar.js";
export * from "./data-guard.js";
export * from "./geography/index.js";
export * from "./hash.js";
export * from "./ids.js";
export * from "./kernel.js";
export * from "./random.js";
export * from "./schedule.js";
export * from "./sha256.js";
export * from "./systems.js";
export * from "./units.js";
export * from "./version.js";
