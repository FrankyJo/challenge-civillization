-- Rollback of 0004 is for development and empty databases only: a stored map
-- is part of a world's authoritative launch record. Refuse when any exists
-- (SQLSTATE 55000) and roll forward instead.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM civ.world_maps) THEN
    RAISE EXCEPTION 'refusing to roll back 0004: civ.world_maps contains authoritative maps (roll forward, or use db:reset in local development)'
      USING ERRCODE = '55000';
  END IF;
END
$$;

DROP TABLE civ.world_maps;
