-- Rollback of 0005 is for development and empty databases only: a stored
-- seed population is part of a world's authoritative launch record. Refuse
-- when any exists (SQLSTATE 55000) and roll forward instead.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM civ.world_populations) THEN
    RAISE EXCEPTION 'refusing to roll back 0005: civ.world_populations contains seed populations (roll forward, or use db:reset in local development)'
      USING ERRCODE = '55000';
  END IF;
END
$$;

DROP TABLE civ.world_populations;
