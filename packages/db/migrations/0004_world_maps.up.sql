-- Phase 04: the generated world map, stored once per world.
-- The map is a deterministic function of the world seed, generator version
-- and params (docs/GEOGRAPHY.md). Storing it keeps the exact document the
-- world was launched with (auditable even after the generator changes) and
-- lets readers serve the compact public snapshot without regenerating.
-- Immutable: same append-only guard as the other fact tables.
CREATE TABLE civ.world_maps (
  world_id          text        PRIMARY KEY REFERENCES civ.worlds (world_id),
  schema_version    smallint    NOT NULL CHECK (schema_version = 1),
  generator         text        NOT NULL,
  generator_version text        NOT NULL,
  map_version       text        NOT NULL CHECK (map_version ~ '^sha256:[0-9a-f]{64}$'),
  map_hash          text        NOT NULL CHECK (map_hash ~ '^sha256:[0-9a-f]{64}$'),
  document          jsonb       NOT NULL,
  snapshot          jsonb       NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (document ->> 'mapHash' = map_hash),
  CHECK (document ->> 'worldId' = world_id),
  CHECK (snapshot ->> 'worldId' = world_id),
  CHECK (snapshot ->> 'mapHash' = map_hash)
);

CREATE TRIGGER world_maps_append_only BEFORE UPDATE OR DELETE ON civ.world_maps
  FOR EACH ROW EXECUTE FUNCTION civ.reject_mutation();
CREATE TRIGGER world_maps_no_truncate BEFORE TRUNCATE ON civ.world_maps
  FOR EACH STATEMENT EXECUTE FUNCTION civ.reject_mutation();
