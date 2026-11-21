-- Phase 03: first ledger projection (non-authoritative, rebuildable).
-- World clock/status as seen by public readers, maintained by the worker's
-- `world-status` consumer from `world.*` events. Dropping and replaying it
-- from the ledger is the recovery procedure; it is never a source of truth.
CREATE TABLE civ.proj_world_status (
  world_id       text        PRIMARY KEY REFERENCES civ.worlds (world_id),
  clock          bigint      NOT NULL CHECK (clock >= 0),
  year           integer     NOT NULL,
  day_of_year    smallint    NOT NULL,
  status         text        NOT NULL CHECK (status IN ('running', 'paused')),
  event_position bigint      NOT NULL CHECK (event_position >= 0),
  last_event_id  text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
