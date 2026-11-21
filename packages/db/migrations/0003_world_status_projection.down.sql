-- A projection is rebuildable from the ledger, so dropping it loses nothing
-- authoritative. Also remove its consumer cursors so a re-applied 0003
-- rebuilds from position 0.
DELETE FROM civ.consumer_offsets WHERE consumer = 'world-status';
DROP TABLE civ.proj_world_status;
