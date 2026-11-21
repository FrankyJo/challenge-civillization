-- Phase 05: the seed population, stored once per world.
-- The population is a deterministic function of the world seed, map,
-- content version and params (docs/POPULATION.md). It is the world's launch
-- record of its 10,000 initial people; the world state references it by
-- hash. Immutable: same append-only guard as the other fact tables.
CREATE TABLE civ.world_populations (
  world_id          text        PRIMARY KEY REFERENCES civ.worlds (world_id),
  schema_version    smallint    NOT NULL CHECK (schema_version = 1),
  population_hash   text        NOT NULL CHECK (population_hash ~ '^sha256:[0-9a-f]{64}$'),
  content_version   text        NOT NULL CHECK (content_version ~ '^sha256:[0-9a-f]{64}$'),
  map_hash          text        NOT NULL CHECK (map_hash ~ '^sha256:[0-9a-f]{64}$'),
  living            integer     NOT NULL CHECK (living > 0),
  document          jsonb       NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (document ->> 'worldId' = world_id),
  CHECK (document ->> 'contentVersion' = content_version),
  CHECK (document ->> 'mapHash' = map_hash),
  CHECK (jsonb_array_length(document -> 'persons') = living)
);

CREATE TRIGGER world_populations_append_only BEFORE UPDATE OR DELETE ON civ.world_populations
  FOR EACH ROW EXECUTE FUNCTION civ.reject_mutation();
CREATE TRIGGER world_populations_no_truncate BEFORE TRUNCATE ON civ.world_populations
  FOR EACH STATEMENT EXECUTE FUNCTION civ.reject_mutation();
