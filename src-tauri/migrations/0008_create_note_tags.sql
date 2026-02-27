BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS champion_note_tags (
  note_id TEXT NOT NULL REFERENCES champion_notes(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (note_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_champion_note_tags_tag_id ON champion_note_tags(tag_id);

INSERT OR IGNORE INTO champion_note_tags (note_id, tag_id)
SELECT id, tag_id
FROM champion_notes
WHERE tag_id IS NOT NULL;

COMMIT;
