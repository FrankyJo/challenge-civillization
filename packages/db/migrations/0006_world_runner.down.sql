-- Runner leases, schedules and controls are operational state (the ledger
-- and seasons hold the authoritative facts and audit). Rolling back drops
-- them; a re-applied 0006 recreates rows from seasons on the next cycle,
-- but a schedule extension's anchor would be lost, so refuse while any
-- extension was applied.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM civ.runner_controls WHERE action = 'extend' AND status = 'applied') THEN
    RAISE EXCEPTION 'refusing to roll back 0006: applied schedule extensions would be lost (roll forward instead)'
      USING ERRCODE = '55000';
  END IF;
END
$$;

DROP TABLE civ.runner_controls;
DROP FUNCTION civ.guard_runner_control();
DROP TABLE civ.world_runners;
DROP FUNCTION civ.guard_world_runner();
