-- Migration 0003: create combos table for champion combos with optional fuse tag
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS combos (
  id TEXT PRIMARY KEY,
  champion_id TEXT NOT NULL,
  line TEXT NOT NULL,
  fuse TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_combos_champion_id ON combos(champion_id);

COMMIT;
