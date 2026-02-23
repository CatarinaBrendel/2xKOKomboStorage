-- 0001_create_schema.sql

BEGIN;

-- basic champions
CREATE TABLE IF NOT EXISTS champions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  type TEXT DEFAULT NULL,
  hp INTEGER DEFAULT NULL,
  strategy TEXT DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- combos: each stored as a notation string
CREATE TABLE IF NOT EXISTS combos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT DEFAULT NULL,
  notation TEXT NOT NULL,
  normalized TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  author TEXT DEFAULT NULL,
  visibility TEXT DEFAULT 'private',
  rating INTEGER DEFAULT 0,
  metadata JSON DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Full-text search virtual table for combos (FTS5)
CREATE VIRTUAL TABLE IF NOT EXISTS combos_fts USING fts5(
  notation, title, description, content='combos', content_rowid='id'
);

-- tags and many-to-many mapping
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS combo_tags (
  combo_id INTEGER NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (combo_id, tag_id)
);

-- mapping of which champions are referenced by a combo
CREATE TABLE IF NOT EXISTS combo_champions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  combo_id INTEGER NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  champion_id INTEGER NOT NULL REFERENCES champions(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'mention',
  position INTEGER DEFAULT 0,
  raw_token TEXT DEFAULT NULL
);

-- parsed step-by-step rows to enable fine-grained filters
CREATE TABLE IF NOT EXISTS combo_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  combo_id INTEGER NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
  step_index INTEGER NOT NULL,
  raw_step TEXT NOT NULL,
  command TEXT DEFAULT NULL,
  referenced_champion_id INTEGER DEFAULT NULL REFERENCES champions(id),
  is_mash BOOLEAN DEFAULT 0,
  is_jump BOOLEAN DEFAULT 0
);

-- migration/version table
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_champions_code ON champions(code);
CREATE INDEX IF NOT EXISTS idx_combo_champions_champion ON combo_champions(champion_id);
CREATE INDEX IF NOT EXISTS idx_combo_tags_tag ON combo_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_combo_steps_combo ON combo_steps(combo_id);
CREATE INDEX IF NOT EXISTS idx_combos_normalized ON combos(normalized);

COMMIT;

-- Extended domain tables: fuses, team compositions, abilities, matchups

BEGIN;

-- Fuses: reusable named combos or recommended setups
CREATE TABLE IF NOT EXISTS fuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- which champions are best used with a given fuse
CREATE TABLE IF NOT EXISTS fuse_champions (
  fuse_id INTEGER NOT NULL REFERENCES fuses(id) ON DELETE CASCADE,
  champion_id INTEGER NOT NULL REFERENCES champions(id) ON DELETE CASCADE,
  PRIMARY KEY (fuse_id, champion_id)
);

-- Team compositions (named team setups)
CREATE TABLE IF NOT EXISTS team_compositions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL REFERENCES team_compositions(id) ON DELETE CASCADE,
  champion_id INTEGER NOT NULL REFERENCES champions(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member', -- e.g. main, assist
  position INTEGER DEFAULT 0,
  PRIMARY KEY (team_id, champion_id)
);

-- Abilities per champion
CREATE TABLE IF NOT EXISTS abilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  champion_id INTEGER NOT NULL REFERENCES champions(id) ON DELETE CASCADE,
  name TEXT DEFAULT NULL,
  description TEXT NOT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Matchups and strategy notes per champion
CREATE TABLE IF NOT EXISTS matchups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  champion_id INTEGER NOT NULL REFERENCES champions(id) ON DELETE CASCADE,
  versus_champion_id INTEGER DEFAULT NULL REFERENCES champions(id),
  description TEXT NOT NULL,
  metadata JSON DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for the new tables
CREATE INDEX IF NOT EXISTS idx_fuse_champions_fuse ON fuse_champions(fuse_id);
CREATE INDEX IF NOT EXISTS idx_fuse_champions_champion ON fuse_champions(champion_id);
CREATE INDEX IF NOT EXISTS idx_team_members_team ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_champion ON team_members(champion_id);
CREATE INDEX IF NOT EXISTS idx_abilities_champion ON abilities(champion_id);
CREATE INDEX IF NOT EXISTS idx_matchups_champion ON matchups(champion_id);

COMMIT;
