-- Migration 0002: create champion_images table for local image storage
BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS champion_images (
  id TEXT PRIMARY KEY,              -- UUID
  champion_id TEXT NOT NULL,        -- FK -> champions(id)
  type TEXT NOT NULL,               -- e.g. 'icon','splash','portrait','thumbnail'
  storage TEXT NOT NULL DEFAULT 'local', -- 'local' for filesystem-stored images
  path TEXT NOT NULL,               -- relative path under app data images dir
  format TEXT,                      -- 'png','jpg','webp'
  width INTEGER,
  height INTEGER,
  size INTEGER,                     -- bytes
  checksum TEXT,                    -- e.g. sha256 for dedupe
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(champion_id, type)
);

CREATE INDEX IF NOT EXISTS idx_champion_images_champion_id ON champion_images(champion_id);
CREATE INDEX IF NOT EXISTS idx_champion_images_checksum ON champion_images(checksum);

COMMIT;
