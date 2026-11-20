---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.vue"
---

- Keep strict TypeScript; do not weaken compiler options to silence errors.
- Parse external data at the boundary and expose typed domain objects internally.
- Never use ambient `Math.random()` or wall-clock time in simulation domain code.
- Prefer exhaustive tagged unions for commands, events, proposals, and state machines.
- Add focused tests for behavior, invariants, and failure modes—not implementation trivia.
