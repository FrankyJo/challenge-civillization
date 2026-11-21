-- Phase 03: authoritative store (docs/PERSISTENCE.md, ADR 0005).
--
-- Every table here is either append-only (worlds, command_log,
-- domain_events, checkpoints, audit_log: UPDATE/DELETE/TRUNCATE raise) or a
-- single current-value row guarded by optimistic version checks
-- (world_state, seasons, consumer_offsets) or delivery bookkeeping (outbox,
-- inbox). Lock/rewrite analysis: all objects are new, so the migration takes
-- no lock on existing data and rewrites nothing.

-- Shared guard for append-only tables. 23001 = restrict_violation.
CREATE FUNCTION civ.reject_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'civ.% is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '23001';
END
$$;

-- World identity. Immutable once created.
CREATE TABLE civ.worlds (
  world_id       text        PRIMARY KEY CHECK (world_id ~ '^wld_[0-9a-z]{8,64}$'),
  schema_version smallint    NOT NULL CHECK (schema_version = 1),
  name           text        NOT NULL,
  seed           text        NOT NULL,
  start_year     integer     NOT NULL CHECK (start_year BETWEEN 1 AND 9999),
  end_year       integer     NOT NULL CHECK (end_year BETWEEN 1 AND 9999),
  versions       jsonb       NOT NULL,
  created_at     timestamptz NOT NULL,
  created_by     jsonb       NOT NULL,
  CHECK (end_year >= start_year)
);
CREATE TRIGGER worlds_append_only BEFORE UPDATE OR DELETE ON civ.worlds
  FOR EACH ROW EXECUTE FUNCTION civ.reject_mutation();
CREATE TRIGGER worlds_no_truncate BEFORE TRUNCATE ON civ.worlds
  FOR EACH STATEMENT EXECUTE FUNCTION civ.reject_mutation();

-- Season schedule and lifecycle. Mutable through revision-checked updates;
-- every change writes an audit_log row in the same transaction.
CREATE TABLE civ.seasons (
  season_id      text        PRIMARY KEY CHECK (season_id ~ '^ssn_[0-9a-z]{8,64}$'),
  world_id       text        NOT NULL REFERENCES civ.worlds (world_id),
  number         integer     NOT NULL CHECK (number >= 1),
  status         text        NOT NULL CHECK (status IN ('scheduled', 'live', 'paused', 'completed', 'frozen')),
  starts_at      timestamptz NOT NULL,
  ends_at        timestamptz NOT NULL,
  status_note    text        CHECK (char_length(status_note) BETWEEN 1 AND 500),
  updated_at     timestamptz NOT NULL,
  updated_by     jsonb       NOT NULL,
  revision       integer     NOT NULL DEFAULT 0 CHECK (revision >= 0),
  CHECK (ends_at > starts_at),
  -- Serves "season N of world W" and listing a world's seasons in order.
  UNIQUE (world_id, number)
);

-- Current aggregate state: one row per world, replaced by every accepted
-- command under an optimistic (version, event_position) check.
CREATE TABLE civ.world_state (
  world_id         text        PRIMARY KEY REFERENCES civ.worlds (world_id),
  schema_version   smallint    NOT NULL CHECK (schema_version = 1),
  clock            bigint      NOT NULL CHECK (clock >= 0),
  status           text        NOT NULL CHECK (status IN ('running', 'paused')),
  version          bigint      NOT NULL CHECK (version >= 0),
  event_position   bigint      NOT NULL CHECK (event_position >= 0),
  command_position bigint      NOT NULL CHECK (command_position >= 0),
  data             jsonb       NOT NULL,
  state_hash       text        NOT NULL CHECK (state_hash ~ '^sha256:[0-9a-f]{64}$'),
  versions         jsonb       NOT NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- The current state only moves forward: version, ledger position, command
-- position and clock never decrease, the world never changes, and the row
-- is never deleted. Recovery replays the ledger; it never rewinds this row.
CREATE FUNCTION civ.guard_world_state() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'civ.world_state rows cannot be removed (%)', TG_OP USING ERRCODE = '23001';
  END IF;
  IF NEW.world_id <> OLD.world_id
     OR NEW.version < OLD.version
     OR NEW.event_position < OLD.event_position
     OR NEW.command_position < OLD.command_position
     OR NEW.clock < OLD.clock THEN
    RAISE EXCEPTION 'civ.world_state of % may only move forward', OLD.world_id USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER world_state_forward_only BEFORE UPDATE OR DELETE ON civ.world_state
  FOR EACH ROW EXECUTE FUNCTION civ.guard_world_state();
CREATE TRIGGER world_state_no_truncate BEFORE TRUNCATE ON civ.world_state
  FOR EACH STATEMENT EXECUTE FUNCTION civ.guard_world_state();

-- Ordered, deduplicated command log: one row per processed command
-- (accepted or rejected), written in the same transaction as its effects.
CREATE TABLE civ.command_log (
  world_id          text        NOT NULL REFERENCES civ.worlds (world_id),
  position          bigint      NOT NULL CHECK (position >= 0),
  command_id        text        NOT NULL,
  idempotency_key   text        NOT NULL,
  request_digest    text        NOT NULL CHECK (request_digest ~ '^sha256:[0-9a-f]{64}$'),
  type              text        NOT NULL,
  command           jsonb       NOT NULL,
  outcome           text        NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
  rejection_code    text,
  rejection_message text,
  -- Ledger range [event_from, event_to) produced by this command.
  event_from        bigint      NOT NULL CHECK (event_from >= 0),
  event_to          bigint      NOT NULL,
  recorded_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, position),
  -- One effect per (world, key): the deduplication guarantee.
  UNIQUE (world_id, idempotency_key),
  UNIQUE (command_id),
  CHECK ((outcome = 'rejected') = (rejection_code IS NOT NULL)),
  CHECK (event_to >= event_from),
  CHECK (outcome = 'accepted' OR event_to = event_from)
);
CREATE TRIGGER command_log_append_only BEFORE UPDATE OR DELETE ON civ.command_log
  FOR EACH ROW EXECUTE FUNCTION civ.reject_mutation();
CREATE TRIGGER command_log_no_truncate BEFORE TRUNCATE ON civ.command_log
  FOR EACH STATEMENT EXECUTE FUNCTION civ.reject_mutation();

-- Append-only event ledger, list-partitioned by world. Each world gets its
-- own partition (civ.ensure_event_partition) so per-world scans, archival and
-- retention touch one partition; a later migration may sub-partition a large
-- world by tick range. The primary key (world_id, sequence) serves every
-- cursor read ("events after position P, in order").
CREATE TABLE civ.domain_events (
  world_id         text        NOT NULL REFERENCES civ.worlds (world_id),
  sequence         bigint      NOT NULL CHECK (sequence >= 0),
  event_id         text        NOT NULL CHECK (event_id ~ '^evt_[0-9a-z]{8,64}$'),
  type             text        NOT NULL,
  type_version     integer     NOT NULL CHECK (type_version >= 1),
  tick             bigint      NOT NULL CHECK (tick >= 0),
  year             integer     NOT NULL,
  day_of_year      smallint    NOT NULL,
  causation_id     text        NOT NULL,
  correlation_id   text        NOT NULL,
  command_position bigint      NOT NULL,
  engine_version   text        NOT NULL,
  content_version  text        NOT NULL,
  config_version   text        NOT NULL,
  payload          jsonb       NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (world_id, sequence),
  -- Serves archive citations: "fetch event evt_… of world W".
  UNIQUE (world_id, event_id)
) PARTITION BY LIST (world_id);

-- No DEFAULT partition: an event for a world without its own partition fails
-- loudly instead of landing somewhere that blocks creating the partition later.

-- Row triggers on a partitioned table are cloned onto every partition.
CREATE TRIGGER domain_events_append_only BEFORE UPDATE OR DELETE ON civ.domain_events
  FOR EACH ROW EXECUTE FUNCTION civ.reject_mutation();
-- Statement (TRUNCATE) triggers are not cloned: each partition gets its own.
CREATE TRIGGER domain_events_no_truncate BEFORE TRUNCATE ON civ.domain_events
  FOR EACH STATEMENT EXECUTE FUNCTION civ.reject_mutation();

-- Create (idempotently) the ledger partition of one world. Identifiers are
-- derived from md5(world_id) because world IDs may exceed 63 characters.
CREATE FUNCTION civ.ensure_event_partition(p_world_id text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  partition_name text := 'domain_events_' || substr(md5(p_world_id), 1, 16);
BEGIN
  IF p_world_id !~ '^wld_[0-9a-z]{8,64}$' THEN
    RAISE EXCEPTION 'invalid world id' USING ERRCODE = '22023';
  END IF;
  IF to_regclass('civ.' || partition_name) IS NULL THEN
    EXECUTE format('CREATE TABLE civ.%I PARTITION OF civ.domain_events FOR VALUES IN (%L)',
                   partition_name, p_world_id);
    EXECUTE format('CREATE TRIGGER domain_events_no_truncate BEFORE TRUNCATE ON civ.%I '
                   'FOR EACH STATEMENT EXECUTE FUNCTION civ.reject_mutation()', partition_name);
  END IF;
  RETURN partition_name;
END
$$;

-- Canonical state checkpoints with the full state snapshot for restore.
CREATE TABLE civ.checkpoints (
  checkpoint_id  text        PRIMARY KEY CHECK (checkpoint_id ~ '^chk_[0-9a-z]{8,64}$'),
  world_id       text        NOT NULL REFERENCES civ.worlds (world_id),
  schema_version smallint    NOT NULL CHECK (schema_version = 1),
  event_position bigint      NOT NULL CHECK (event_position >= 0),
  tick           bigint      NOT NULL CHECK (tick >= 0),
  year           integer     NOT NULL,
  day_of_year    smallint    NOT NULL,
  state_hash     text        NOT NULL CHECK (state_hash ~ '^sha256:[0-9a-f]{64}$'),
  versions       jsonb       NOT NULL,
  state          jsonb       NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Serves "latest checkpoint at or before position P" (restore, replay).
  UNIQUE (world_id, event_position)
);
CREATE TRIGGER checkpoints_append_only BEFORE UPDATE OR DELETE ON civ.checkpoints
  FOR EACH ROW EXECUTE FUNCTION civ.reject_mutation();
CREATE TRIGGER checkpoints_no_truncate BEFORE TRUNCATE ON civ.checkpoints
  FOR EACH STATEMENT EXECUTE FUNCTION civ.reject_mutation();

-- Transactional outbox: written in the command's transaction, relayed to
-- Redis/BullMQ afterwards. Rows are notifications, never the only copy of a
-- fact: the ledger above is authoritative.
CREATE TABLE civ.outbox (
  id              bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_key     text        NOT NULL UNIQUE,
  topic           text        NOT NULL,
  world_id        text        NOT NULL REFERENCES civ.worlds (world_id),
  payload         jsonb       NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  attempts        integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  published_at    timestamptz
);
-- Serves the relay's claim query: pending rows in id order.
CREATE INDEX outbox_pending ON civ.outbox (id) WHERE published_at IS NULL;

-- Consumer inbox: processed markers for jobs with side effects.
CREATE TABLE civ.inbox (
  consumer     text        NOT NULL,
  message_key  text        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, message_key)
);

-- Ledger consumers' durable cursors, advanced in the same transaction as
-- the consumer's own writes (exactly-once effect over at-least-once delivery).
CREATE TABLE civ.consumer_offsets (
  consumer   text        NOT NULL,
  world_id   text        NOT NULL REFERENCES civ.worlds (world_id),
  position   bigint      NOT NULL CHECK (position >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, world_id)
);

-- Immutable audit trail of administrative actions (world/season changes,
-- operator commands). Internal only; never exposed by public APIs.
CREATE TABLE civ.audit_log (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  actor          jsonb       NOT NULL,
  action         text        NOT NULL,
  world_id       text        REFERENCES civ.worlds (world_id),
  subject_id     text,
  correlation_id text        NOT NULL,
  reason         text,
  details        jsonb       NOT NULL DEFAULT '{}'::jsonb
);
-- Serves "audit trail of world W, newest first".
CREATE INDEX audit_log_world ON civ.audit_log (world_id, id);
CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON civ.audit_log
  FOR EACH ROW EXECUTE FUNCTION civ.reject_mutation();
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON civ.audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION civ.reject_mutation();
