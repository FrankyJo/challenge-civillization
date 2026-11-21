-- Rollback of 0002 is for development and empty databases only. Authoritative
-- facts are never destroyed by a migration: if any world exists, refuse and
-- point to the development reset (`pnpm db:reset`), which is itself refused
-- outside local development. In production, roll forward instead.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM civ.worlds) THEN
    RAISE EXCEPTION 'refusing to roll back 0002: civ.worlds contains authoritative data (roll forward, or use db:reset in local development)'
      USING ERRCODE = '55000';
  END IF;
END
$$;

DROP TABLE civ.audit_log;
DROP TABLE civ.consumer_offsets;
DROP TABLE civ.inbox;
DROP TABLE civ.outbox;
DROP TABLE civ.checkpoints;
DROP FUNCTION civ.ensure_event_partition(text);
DROP TABLE civ.domain_events;
DROP TABLE civ.command_log;
DROP TABLE civ.world_state;
DROP FUNCTION civ.guard_world_state();
DROP TABLE civ.seasons;
DROP TABLE civ.worlds;
DROP FUNCTION civ.reject_mutation();
