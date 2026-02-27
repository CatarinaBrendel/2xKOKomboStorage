-- Migration 0005: DB-level champion delete cascade via trigger
BEGIN TRANSACTION;

-- Keep cleanup centralized in DB so deleting a champion always removes related rows,
-- including tables that don't have FK constraints (or have mixed id types).
CREATE TRIGGER IF NOT EXISTS trg_champions_after_delete_cleanup
AFTER DELETE ON champions
FOR EACH ROW
BEGIN
  -- non-FK / namespaced tables
  DELETE FROM champion_images WHERE champion_id = CAST(OLD.id AS TEXT) OR champion_id = OLD.id;
  DELETE FROM champion_combos WHERE champion_id = CAST(OLD.id AS TEXT) OR champion_id = OLD.id;

  -- legacy and domain tables (safe even if FK cascade already exists)
  DELETE FROM combo_champions WHERE champion_id = OLD.id;
  DELETE FROM combo_steps WHERE referenced_champion_id = OLD.id;
  DELETE FROM abilities WHERE champion_id = OLD.id;
  DELETE FROM matchups WHERE champion_id = OLD.id OR versus_champion_id = OLD.id;
  DELETE FROM fuse_champions WHERE champion_id = OLD.id;
  DELETE FROM team_members WHERE champion_id = OLD.id;
END;

COMMIT;
