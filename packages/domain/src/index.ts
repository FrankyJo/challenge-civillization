/**
 * @civ/domain — pure simulation domain.
 *
 * Boundaries are enforced twice: the ESLint determinism guard (no
 * Math.random, Date, performance, process, timers or I/O here) and the
 * dependency policy in scripts/architecture-policy.mjs (production code may
 * import only @civ/contracts and zod). Command/event envelopes live in
 * @civ/contracts; aggregates and transitions arrive from Phase 02 onward.
 */

/** Engine version stamped on health reports and, later, on every transition. */
export const ENGINE_VERSION = "0.1.0";
