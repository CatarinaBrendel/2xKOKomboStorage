-- Migration 0003: create combos table for champion combos with optional fuse tag
BEGIN TRANSACTION;

-- Create a namespaced `champion_combos` table to avoid colliding with older
-- installations that already have a global `combos` table with a different
-- schema. The app uses `champion_combos` for per-champion combos.
CREATE TABLE IF NOT EXISTS champion_combos (
  id TEXT PRIMARY KEY,
  champion_id TEXT NOT NULL,
  line TEXT NOT NULL,
  fuse TEXT,
  sort_order INTEGER DEFAULT 0,
  name TEXT DEFAULT NULL,
  ranking INTEGER DEFAULT NULL,
  assist TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_champion_combos_champion_id ON champion_combos(champion_id);

COMMIT;
