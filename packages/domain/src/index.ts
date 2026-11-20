/**
 * @civ/domain — pure simulation domain.
 *
 * Phase 00 establishes only the package boundary and its determinism lint
 * guard (see eslint.config.js: no Math.random, Date, performance, process,
 * timers or I/O imports here). Aggregates, commands, events and invariants
 * arrive from Phase 01 onward.
 */

/** Engine version stamped on health reports and, later, on every transition. */
export const ENGINE_VERSION = "0.1.0";
