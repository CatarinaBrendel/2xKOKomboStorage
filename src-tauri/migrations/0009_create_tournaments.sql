-- 0009_create_tournaments.sql

BEGIN;

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  happened_on DATE DEFAULT NULL,
  sponsor TEXT DEFAULT NULL,
  mode TEXT NOT NULL DEFAULT 'offline' CHECK (mode IN ('online', 'offline')),
  final_placement TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournament_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,

  our_main_champion_id INTEGER NOT NULL REFERENCES champions(id) ON DELETE RESTRICT,
  our_assist_champion_id INTEGER DEFAULT NULL REFERENCES champions(id) ON DELETE SET NULL,

  result TEXT NOT NULL CHECK (result IN ('win', 'loss')),

  opponent_name TEXT NOT NULL,
  opponent_main_champion_id INTEGER DEFAULT NULL REFERENCES champions(id) ON DELETE SET NULL,
  opponent_assist_champion_id INTEGER DEFAULT NULL REFERENCES champions(id) ON DELETE SET NULL,

  notes TEXT DEFAULT NULL,
  played_at DATE DEFAULT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_tournament_id
  ON tournament_matches(tournament_id);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_our_main
  ON tournament_matches(our_main_champion_id);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_our_assist
  ON tournament_matches(our_assist_champion_id);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_opp_main
  ON tournament_matches(opponent_main_champion_id);

CREATE INDEX IF NOT EXISTS idx_tournament_matches_opp_assist
  ON tournament_matches(opponent_assist_champion_id);

COMMIT;
