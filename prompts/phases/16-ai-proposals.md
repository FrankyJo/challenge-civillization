# Phase 16 — historical content and AI proposal pipeline

Read `prompts/PHASE-CONTRACT.md` and `docs/DATA-AND-AI.md`; use `/historical-research`, `/data-contracts`, and a security review.

Implement immutable content-pack schemas, source/claim records, proposal state machine, research job sandbox, structured LLM output validation, citation verification workflow, domain/chronology/unit/effect validators, sandbox simulations, review records, approval separation, signed promotion manifests, rollback to prior content version, cost/rate controls, and complete audit provenance.

Retrieved/source text is untrusted and cannot issue instructions. Research agents have no code, secret, approval, or production mutation capability. Simulation continues if AI providers are unavailable. Use provider abstraction and deterministic fixtures; live calls are opt-in and excluded from default tests.

Acceptance: malicious prompt-injection sources cannot alter scope/tools/approval; invalid/unsupported proposals cannot progress; proposer cannot self-approve; promotion is explicit and immutable; every promoted claim has verified support/uncertainty/license notes; sandbox regression detects broken invariants; provider outage has no simulation impact.
