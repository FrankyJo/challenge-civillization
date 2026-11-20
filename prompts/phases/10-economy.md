# Phase 10 — ownership, money, markets, trade, and taxation

Read `prompts/PHASE-CONTRACT.md`, `docs/DOMAIN.md`, and use `/simulation-domain`.

Implement ownership, double-entry accounts, currencies in integer minor units, pricing/market matching, contracts/credit only if explicitly scoped, local/inter-settlement trade, transport cost, enterprise income/cost, wages, taxation, public treasury, insolvency, and inequality metrics. Barter and non-market allocation remain possible where content/config requires.

Every transaction is atomic and references the physical transfer/obligation it represents. Avoid price formulas that create money/resources or require global perfect knowledge. Document matching resolution and anti-oscillation controls.

Acceptance: ledgers balance per transaction/currency; physical and financial legs reconcile; failed/retried trade is atomic/idempotent; taxes cannot spend twice; price/scarcity scenarios behave monotonically within stated limits; wealth metrics reconcile; market performance at target scale and deterministic replay pass.
