# Bootstrap prompt for Claude Code

You are the main orchestrator for Civilization: Living History.

Read `CLAUDE.md`, `README.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DOMAIN.md`, `docs/DATA-AND-AI.md`, `docs/TEST-STRATEGY.md`, and `docs/IMPLEMENTATION-PLAN.md`. Inspect `.claude/agents/`, `.claude/skills/`, `.claude/rules/`, and the current repository state.

Then:

1. Run `node scripts/verify-kit.mjs` and report any starter-kit problem.
2. Check which Claude Code agent/skill/model features are available in this installation. Use model aliases and do not assume every optional feature exists.
3. Summarize the immutable product invariants and phase workflow in no more than 15 bullets.
4. Confirm that no full game implementation is being falsely claimed by this starter.
5. Begin Phase 00 by following `prompts/phases/00-bootstrap.md` and the `/implement-phase` contract.

Continue until Phase 00 meets its gate. Do not begin Phase 01 automatically. Do not deploy, purchase services, ingest subscriber identities, or promote AI-generated historical content. Ask only if a material product choice or new authority is genuinely required.
