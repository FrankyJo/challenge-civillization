-- Phase 06: world runner lease, schedule and operator controls.
--
-- world_runners: one row per scheduled world.
--   * Lease with a fencing token: the token only ever increases; a commit
--     that carries an old token is rejected inside its transaction.
--   * Schedule segment (anchor tick, anchor time, end time): an audited
--     extension re-anchors it; the anchor never moves backwards.
--   * Catch-up ceiling and the operator-approved catch-up target.
--   * Runner status for operations (state, backlog, last cycle, last error).
CREATE TABLE civ.world_runners (
  world_id               text        PRIMARY KEY REFERENCES civ.worlds (world_id),
  lease_holder           text,
  lease_token            bigint      NOT NULL DEFAULT 0 CHECK (lease_token >= 0),
  lease_expires_at       timestamptz,
  schedule_anchor_tick   bigint      NOT NULL CHECK (schedule_anchor_tick >= 0),
  schedule_anchor_at     timestamptz NOT NULL,
  schedule_ends_at       timestamptz NOT NULL,
  catch_up_ceiling_ticks integer     NOT NULL CHECK (catch_up_ceiling_ticks >= 0),
  catch_up_approved_to   bigint,
  state                  text        NOT NULL DEFAULT 'standby'
                         CHECK (state IN ('standby', 'idle', 'running', 'held', 'paused', 'completed', 'failed')),
  backlog_ticks          bigint      NOT NULL DEFAULT 0,
  last_cycle_at          timestamptz,
  last_error             text,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (schedule_ends_at > schedule_anchor_at),
  CHECK ((lease_holder IS NULL) = (lease_expires_at IS NULL))
);

-- Fencing tokens and schedule anchors only move forward; rows are never deleted.
CREATE FUNCTION civ.guard_world_runner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'world_runners rows are never deleted' USING ERRCODE = '23001';
  END IF;
  IF NEW.world_id <> OLD.world_id
     OR NEW.lease_token < OLD.lease_token
     OR NEW.schedule_anchor_tick < OLD.schedule_anchor_tick
     OR NEW.schedule_anchor_at < OLD.schedule_anchor_at THEN
    RAISE EXCEPTION 'world_runners may only move forward' USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER world_runners_forward_only BEFORE UPDATE OR DELETE ON civ.world_runners
  FOR EACH ROW EXECUTE FUNCTION civ.guard_world_runner();
CREATE TRIGGER world_runners_no_truncate BEFORE TRUNCATE ON civ.world_runners
  FOR EACH STATEMENT EXECUTE FUNCTION civ.guard_world_runner();

-- Operator controls, processed in order by the lease holder. A request key
-- makes submission idempotent; the decision (applied/rejected) is recorded
-- once and never changed.
CREATE TABLE civ.runner_controls (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  world_id      text        NOT NULL REFERENCES civ.worlds (world_id),
  request_key   text        NOT NULL CHECK (request_key ~ '^[A-Za-z0-9._:-]{8,128}$'),
  action        text        NOT NULL CHECK (action IN ('pause', 'resume', 'step', 'extend', 'approve_catch_up')),
  ticks         integer     CHECK (ticks IS NULL OR ticks > 0),
  extra_ms      bigint      CHECK (extra_ms IS NULL OR extra_ms BETWEEN 0 AND 2592000000),
  requested_by  jsonb       NOT NULL,
  reason        text        NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'rejected')),
  result        text,
  decided_at    timestamptz,
  decided_token bigint,
  UNIQUE (world_id, request_key)
);
CREATE INDEX runner_controls_pending ON civ.runner_controls (world_id, id) WHERE status = 'pending';

-- A decision is final: pending → applied|rejected once; nothing else changes.
CREATE FUNCTION civ.guard_runner_control() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'runner_controls rows are never deleted' USING ERRCODE = '23001';
  END IF;
  IF OLD.status <> 'pending'
     OR (NEW.world_id, NEW.request_key, NEW.action, NEW.ticks, NEW.extra_ms, NEW.requested_by, NEW.reason, NEW.requested_at)
        IS DISTINCT FROM
        (OLD.world_id, OLD.request_key, OLD.action, OLD.ticks, OLD.extra_ms, OLD.requested_by, OLD.reason, OLD.requested_at) THEN
    RAISE EXCEPTION 'runner control decisions are final' USING ERRCODE = '23001';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER runner_controls_decide_once BEFORE UPDATE OR DELETE ON civ.runner_controls
  FOR EACH ROW EXECUTE FUNCTION civ.guard_runner_control();
CREATE TRIGGER runner_controls_no_truncate BEFORE TRUNCATE ON civ.runner_controls
  FOR EACH STATEMENT EXECUTE FUNCTION civ.guard_runner_control();
