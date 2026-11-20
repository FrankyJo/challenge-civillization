# Phase 09 — labor, skills, occupations, production, and inventory

Read `prompts/PHASE-CONTRACT.md` and use `/simulation-domain`.

Implement skills/learning hooks, labor availability, occupation assignment, workplaces, recipes, tools, production capacity, quality, inventory, spoilage/loss/waste, and consumption allocation. Technologies/content enable recipes but cannot bypass materials, labor, tools, knowledge, or infrastructure.

Use explicit units and conserved transformations. Support unemployment/inactivity reasons and age/health constraints. Keep allocation algorithms deterministic and explainable; cohort matching is allowed when documented and reconciled to individuals.

Acceptance: inventories never silently go negative; every transformation balances inputs/outputs/loss; dead/incapable people do not work; unavailable skills/tools block production; concurrent/retried jobs have one effect; starvation/resource-shortage scenarios connect to Phase 08; production at 10k scale meets benchmark and replay gates.
