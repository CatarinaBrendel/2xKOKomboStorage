CREATE TABLE IF NOT EXISTS training_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  happened_on DATE NOT NULL,
  mode TEXT NOT NULL DEFAULT 'offline' CHECK (mode IN ('online','offline')),
  notes TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Groups within a session (a ranked run, or a casual block)
CREATE TABLE IF NOT EXISTS match_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  training_session_id INTEGER NOT NULL
    REFERENCES training_sessions(id) ON DELETE CASCADE,

  kind TEXT NOT NULL CHECK (kind IN ('ranked','casual')),
  -- optional: to preserve ordering inside the session
  sort_order INTEGER NOT NULL DEFAULT 0,

  notes TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_match_groups_session
  ON match_groups(training_session_id);

CREATE TABLE IF NOT EXISTS tournaments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  happened_on DATE DEFAULT NULL,
  sponsor TEXT DEFAULT NULL,
  mode TEXT NOT NULL DEFAULT 'offline' CHECK (mode IN ('online','offline')),
  final_placement TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tournament_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tournament_id INTEGER NOT NULL
    REFERENCES tournaments(id) ON DELETE CASCADE,

  label TEXT DEFAULT NULL,              -- e.g. "Pools", "Top 8"
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tournament_runs_tournament
  ON tournament_runs(tournament_id);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,

  match_group_id INTEGER DEFAULT NULL
    REFERENCES match_groups(id) ON DELETE CASCADE,

  tournament_run_id INTEGER DEFAULT NULL
    REFERENCES tournament_runs(id) ON DELETE CASCADE,

  our_main_champion_id INTEGER NOT NULL REFERENCES champions(id) ON DELETE RESTRICT,
  our_assist_champion_id INTEGER DEFAULT NULL REFERENCES champions(id) ON DELETE SET NULL,

  opponent_name TEXT NOT NULL,
  opponent_main_champion_id INTEGER DEFAULT NULL REFERENCES champions(id) ON DELETE SET NULL,
  opponent_assist_champion_id INTEGER DEFAULT NULL REFERENCES champions(id) ON DELETE SET NULL,

  -- match-level outcome; can be derived from sets, but storing is fine if consistent
  result TEXT DEFAULT NULL CHECK (result IN ('win','loss')),

  played_at DATE DEFAULT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  notes TEXT DEFAULT NULL,

  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  -- Enforce: belongs to exactly one context (training OR tournament)
  CHECK (
    (match_group_id IS NOT NULL AND tournament_run_id IS NULL)
    OR
    (match_group_id IS NULL AND tournament_run_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_matches_group
  ON matches(match_group_id);

CREATE INDEX IF NOT EXISTS idx_matches_tournament_run
  ON matches(tournament_run_id);

CREATE TABLE IF NOT EXISTS match_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,

  set_number INTEGER NOT NULL, -- 1..3
  result TEXT NOT NULL CHECK (result IN ('win','loss')),
  notes TEXT DEFAULT NULL,

  UNIQUE(match_id, set_number)
);

CREATE INDEX IF NOT EXISTS idx_match_sets_match
  ON match_sets(match_id);