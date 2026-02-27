-- Migration 0004: backfill tags into combos.tags JSON column
BEGIN TRANSACTION;

-- For existing global combos (legacy), aggregate associated tag slugs into a JSON array
UPDATE combos
SET tags = (
  SELECT json_group_array(t.slug)
  FROM combo_tags ct
  JOIN tags t ON t.id = ct.tag_id
  WHERE ct.combo_id = combos.id
)
WHERE EXISTS (SELECT 1 FROM combo_tags ct WHERE ct.combo_id = combos.id);

COMMIT;
