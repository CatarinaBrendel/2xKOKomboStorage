BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS champion_notes (
  id TEXT PRIMARY KEY,
  champion_id INTEGER NOT NULL REFERENCES champions(id) ON DELETE CASCADE,
  tag_id INTEGER DEFAULT NULL REFERENCES tags(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_champion_notes_champion_id ON champion_notes(champion_id);
CREATE INDEX IF NOT EXISTS idx_champion_notes_tag_id ON champion_notes(tag_id);

COMMIT;
