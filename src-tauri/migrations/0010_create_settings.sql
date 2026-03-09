-- 0010_create_settings.sql

BEGIN;

-- application settings: single-row table storing simple key values
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  user_tag TEXT DEFAULT NULL,
  backups_folder TEXT DEFAULT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
