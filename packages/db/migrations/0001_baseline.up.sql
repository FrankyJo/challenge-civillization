-- Baseline: dedicated schema for all Civilization-owned tables.
-- Later phases create their tables inside `civ`; `public` holds only the
-- migration bookkeeping table managed by the runner.
CREATE SCHEMA IF NOT EXISTS civ;
COMMENT ON SCHEMA civ IS 'Civilization: Living History authoritative and projection storage';
