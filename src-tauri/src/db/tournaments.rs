use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Value as JsonValue};

use super::common::default_db_path;

fn parse_optional_i64(v: Option<&JsonValue>) -> Option<i64> {
  match v {
    Some(JsonValue::Number(n)) => n.as_i64(),
    Some(JsonValue::String(s)) => s.parse::<i64>().ok(),
    _ => None,
  }
}

fn parse_required_i64(v: Option<&JsonValue>, field: &str) -> Result<i64, String> {
  parse_optional_i64(v).ok_or_else(|| format!("missing or invalid field: {}", field))
}

fn ensure_tournament_tables(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "CREATE TABLE IF NOT EXISTS tournaments (
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
      ",
    )
    .map_err(|e| format!("failed to ensure tournament tables: {}", e))
}

fn champion_json(id: Option<i64>, name: Option<String>, code: Option<String>) -> JsonValue {
  if let Some(cid) = id {
    json!({
      "id": cid.to_string(),
      "name": name,
      "code": code,
    })
  } else {
    JsonValue::Null
  }
}

fn list_tournament_matches_for_conn(conn: &Connection, tournament_id: i64) -> Result<Vec<JsonValue>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT
         tm.id,
         tm.tournament_id,
         tm.our_main_champion_id,
         tm.our_assist_champion_id,
         tm.result,
         tm.opponent_name,
         tm.opponent_main_champion_id,
         tm.opponent_assist_champion_id,
         tm.notes,
         tm.played_at,
         tm.sort_order,
         tm.created_at,
         om.name,
         om.code,
         oa.name,
         oa.code,
         xm.name,
         xm.code,
         xa.name,
         xa.code
       FROM tournament_matches tm
       LEFT JOIN champions om ON om.id = tm.our_main_champion_id
       LEFT JOIN champions oa ON oa.id = tm.our_assist_champion_id
       LEFT JOIN champions xm ON xm.id = tm.opponent_main_champion_id
       LEFT JOIN champions xa ON xa.id = tm.opponent_assist_champion_id
       WHERE tm.tournament_id = ?1
       ORDER BY tm.sort_order, tm.created_at",
    )
    .map_err(|e| format!("db prepare error: {}", e))?;

  let rows = stmt
    .query_map(rusqlite::params![tournament_id], |r| {
      let id = r.get::<_, i64>(0)?;
      let t_id = r.get::<_, i64>(1)?;
      let our_main_id = r.get::<_, i64>(2)?;
      let our_assist_id = r.get::<_, Option<i64>>(3)?;
      let result = r.get::<_, String>(4)?;
      let opponent_name = r.get::<_, String>(5)?;
      let opp_main_id = r.get::<_, Option<i64>>(6)?;
      let opp_assist_id = r.get::<_, Option<i64>>(7)?;
      let notes = r.get::<_, Option<String>>(8)?;
      let played_at = r.get::<_, Option<String>>(9)?;
      let sort_order = r.get::<_, Option<i64>>(10)?;
      let created_at = r.get::<_, Option<String>>(11)?;

      let our_main_name = r.get::<_, Option<String>>(12)?;
      let our_main_code = r.get::<_, Option<String>>(13)?;
      let our_assist_name = r.get::<_, Option<String>>(14)?;
      let our_assist_code = r.get::<_, Option<String>>(15)?;
      let opp_main_name = r.get::<_, Option<String>>(16)?;
      let opp_main_code = r.get::<_, Option<String>>(17)?;
      let opp_assist_name = r.get::<_, Option<String>>(18)?;
      let opp_assist_code = r.get::<_, Option<String>>(19)?;

      Ok(json!({
        "id": id.to_string(),
        "tournament_id": t_id.to_string(),
        "our_main_champion_id": our_main_id.to_string(),
        "our_assist_champion_id": our_assist_id.map(|v| v.to_string()),
        "result": result,
        "opponent_name": opponent_name,
        "opponent_main_champion_id": opp_main_id.map(|v| v.to_string()),
        "opponent_assist_champion_id": opp_assist_id.map(|v| v.to_string()),
        "notes": notes,
        "played_at": played_at,
        "sort_order": sort_order,
        "created_at": created_at,
        "our_main_champion": champion_json(Some(our_main_id), our_main_name, our_main_code),
        "our_assist_champion": champion_json(our_assist_id, our_assist_name, our_assist_code),
        "opponent_main_champion": champion_json(opp_main_id, opp_main_name, opp_main_code),
        "opponent_assist_champion": champion_json(opp_assist_id, opp_assist_name, opp_assist_code),
      }))
    })
    .map_err(|e| format!("db query error: {}", e))?;

  let mut out = Vec::new();
  for row in rows {
    if let Ok(v) = row {
      out.push(v)
    }
  }
  Ok(out)
}

fn fetch_tournament_by_id(conn: &Connection, tournament_id: i64) -> Result<JsonValue, String> {
  let mut stmt = conn
    .prepare(
      "SELECT id, title, happened_on, sponsor, mode, final_placement, notes, created_at, updated_at
       FROM tournaments
       WHERE id = ?1
       LIMIT 1",
    )
    .map_err(|e| format!("db prepare error: {}", e))?;

  let row = stmt
    .query_row(rusqlite::params![tournament_id], |r| {
      Ok(json!({
        "id": r.get::<_, i64>(0)?.to_string(),
        "title": r.get::<_, String>(1)?,
        "happened_on": r.get::<_, Option<String>>(2)?,
        "sponsor": r.get::<_, Option<String>>(3)?,
        "mode": r.get::<_, String>(4)?,
        "final_placement": r.get::<_, Option<String>>(5)?,
        "notes": r.get::<_, Option<String>>(6)?,
        "created_at": r.get::<_, Option<String>>(7)?,
        "updated_at": r.get::<_, Option<String>>(8)?,
      }))
    })
    .optional()
    .map_err(|e| format!("db query error: {}", e))?;

  let mut tournament = row.ok_or_else(|| format!("tournament not found: {}", tournament_id))?;
  let matches = list_tournament_matches_for_conn(conn, tournament_id)?;
  if let Some(obj) = tournament.as_object_mut() {
    obj.insert("matches".to_string(), JsonValue::Array(matches));
  }

  Ok(tournament)
}

pub fn create_tournament(tournament_json: String) -> Result<JsonValue, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;
  ensure_tournament_tables(&conn)?;

  let parsed: JsonValue =
    serde_json::from_str(&tournament_json).map_err(|e| format!("invalid tournament json: {}", e))?;

  let title = parsed
    .get("title")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .ok_or_else(|| "missing or invalid field: title".to_string())?;

  let happened_on = parsed
    .get("happened_on")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  let sponsor = parsed
    .get("sponsor")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  let mode = parsed
    .get("mode")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_lowercase())
    .filter(|s| s == "online" || s == "offline")
    .unwrap_or_else(|| "offline".to_string());

  let final_placement = parsed
    .get("final_placement")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  let notes = parsed
    .get("notes")
    .and_then(|v| v.as_str())
    .map(|s| s.to_string())
    .filter(|s| !s.is_empty());

  conn.execute(
    "INSERT INTO tournaments (title, happened_on, sponsor, mode, final_placement, notes)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    rusqlite::params![title, happened_on, sponsor, mode, final_placement, notes],
  )
  .map_err(|e| format!("db insert error: {}", e))?;

  let tournament_id = conn.last_insert_rowid();
  fetch_tournament_by_id(&conn, tournament_id)
}

pub fn list_tournaments() -> Result<JsonValue, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;
  ensure_tournament_tables(&conn)?;

  let mut stmt = conn
    .prepare(
      "SELECT id
       FROM tournaments
       ORDER BY COALESCE(happened_on, '0000-00-00') DESC, created_at DESC",
    )
    .map_err(|e| format!("db prepare error: {}", e))?;

  let ids = stmt
    .query_map([], |r| r.get::<_, i64>(0))
    .map_err(|e| format!("db query error: {}", e))?;

  let mut out = Vec::new();
  for id in ids {
    if let Ok(tournament_id) = id {
      if let Ok(t) = fetch_tournament_by_id(&conn, tournament_id) {
        out.push(t)
      }
    }
  }

  Ok(JsonValue::Array(out))
}

pub fn update_tournament(tournament_id: String, tournament_json: String) -> Result<JsonValue, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;
  ensure_tournament_tables(&conn)?;

  let id_num: i64 = tournament_id
    .parse()
    .map_err(|e| format!("invalid tournament id: {}", e))?;

  let parsed: JsonValue =
    serde_json::from_str(&tournament_json).map_err(|e| format!("invalid tournament json: {}", e))?;

  let title = parsed
    .get("title")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .ok_or_else(|| "missing or invalid field: title".to_string())?;

  let happened_on = parsed
    .get("happened_on")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  let sponsor = parsed
    .get("sponsor")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  let mode = parsed
    .get("mode")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_lowercase())
    .filter(|s| s == "online" || s == "offline")
    .unwrap_or_else(|| "offline".to_string());

  let final_placement = parsed
    .get("final_placement")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  let notes = parsed
    .get("notes")
    .and_then(|v| v.as_str())
    .map(|s| s.to_string())
    .filter(|s| !s.is_empty());

  conn.execute(
    "UPDATE tournaments
     SET title = ?1, happened_on = ?2, sponsor = ?3, mode = ?4, final_placement = ?5, notes = ?6, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?7",
    rusqlite::params![title, happened_on, sponsor, mode, final_placement, notes, id_num],
  )
  .map_err(|e| format!("db update error: {}", e))?;

  fetch_tournament_by_id(&conn, id_num)
}

pub fn delete_tournament(tournament_id: String) -> Result<String, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;
  ensure_tournament_tables(&conn)?;

  let id_num: i64 = tournament_id
    .parse()
    .map_err(|e| format!("invalid tournament id: {}", e))?;

  conn.execute(
    "DELETE FROM tournaments WHERE id = ?1",
    rusqlite::params![id_num],
  )
  .map_err(|e| format!("db delete error: {}", e))?;

  Ok("ok".to_string())
}

pub fn add_tournament_match(tournament_id: String, match_json: String) -> Result<JsonValue, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;
  ensure_tournament_tables(&conn)?;

  let tournament_id_num: i64 = tournament_id
    .parse()
    .map_err(|e| format!("invalid tournament id: {}", e))?;

  let parsed: JsonValue =
    serde_json::from_str(&match_json).map_err(|e| format!("invalid match json: {}", e))?;

  let our_main_champion_id = parse_required_i64(parsed.get("our_main_champion_id"), "our_main_champion_id")?;
  let our_assist_champion_id = parse_optional_i64(parsed.get("our_assist_champion_id"));

  let result = parsed
    .get("result")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_lowercase())
    .filter(|s| s == "win" || s == "loss")
    .ok_or_else(|| "missing or invalid field: result".to_string())?;

  let opponent_name = parsed
    .get("opponent_name")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .ok_or_else(|| "missing or invalid field: opponent_name".to_string())?;

  let opponent_main_champion_id = parse_optional_i64(parsed.get("opponent_main_champion_id"));
  let opponent_assist_champion_id = parse_optional_i64(parsed.get("opponent_assist_champion_id"));

  let notes = parsed
    .get("notes")
    .and_then(|v| v.as_str())
    .map(|s| s.to_string())
    .filter(|s| !s.is_empty());

  let played_at = parsed
    .get("played_at")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  let sort_order = parse_optional_i64(parsed.get("sort_order")).unwrap_or(0);

  conn.execute(
    "INSERT INTO tournament_matches (
       tournament_id,
       our_main_champion_id,
       our_assist_champion_id,
       result,
       opponent_name,
       opponent_main_champion_id,
       opponent_assist_champion_id,
       notes,
       played_at,
       sort_order
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
    rusqlite::params![
      tournament_id_num,
      our_main_champion_id,
      our_assist_champion_id,
      result,
      opponent_name,
      opponent_main_champion_id,
      opponent_assist_champion_id,
      notes,
      played_at,
      sort_order,
    ],
  )
  .map_err(|e| format!("db insert error: {}", e))?;

  let match_id = conn.last_insert_rowid();
  get_tournament_match(match_id.to_string())
}

pub fn update_tournament_match(match_id: String, match_json: String) -> Result<JsonValue, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;
  ensure_tournament_tables(&conn)?;

  let match_id_num: i64 = match_id
    .parse()
    .map_err(|e| format!("invalid match id: {}", e))?;

  let parsed: JsonValue =
    serde_json::from_str(&match_json).map_err(|e| format!("invalid match json: {}", e))?;

  let our_main_champion_id = parse_required_i64(parsed.get("our_main_champion_id"), "our_main_champion_id")?;
  let our_assist_champion_id = parse_optional_i64(parsed.get("our_assist_champion_id"));

  let result = parsed
    .get("result")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_lowercase())
    .filter(|s| s == "win" || s == "loss")
    .ok_or_else(|| "missing or invalid field: result".to_string())?;

  let opponent_name = parsed
    .get("opponent_name")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .ok_or_else(|| "missing or invalid field: opponent_name".to_string())?;

  let opponent_main_champion_id = parse_optional_i64(parsed.get("opponent_main_champion_id"));
  let opponent_assist_champion_id = parse_optional_i64(parsed.get("opponent_assist_champion_id"));

  let notes = parsed
    .get("notes")
    .and_then(|v| v.as_str())
    .map(|s| s.to_string())
    .filter(|s| !s.is_empty());

  let played_at = parsed
    .get("played_at")
    .and_then(|v| v.as_str())
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());

  let sort_order = parse_optional_i64(parsed.get("sort_order")).unwrap_or(0);

  conn.execute(
    "UPDATE tournament_matches
     SET our_main_champion_id = ?1,
         our_assist_champion_id = ?2,
         result = ?3,
         opponent_name = ?4,
         opponent_main_champion_id = ?5,
         opponent_assist_champion_id = ?6,
         notes = ?7,
         played_at = ?8,
         sort_order = ?9
     WHERE id = ?10",
    rusqlite::params![
      our_main_champion_id,
      our_assist_champion_id,
      result,
      opponent_name,
      opponent_main_champion_id,
      opponent_assist_champion_id,
      notes,
      played_at,
      sort_order,
      match_id_num,
    ],
  )
  .map_err(|e| format!("db update error: {}", e))?;

  get_tournament_match(match_id_num.to_string())
}

pub fn delete_tournament_match(match_id: String) -> Result<String, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;
  ensure_tournament_tables(&conn)?;

  let id_num: i64 = match_id
    .parse()
    .map_err(|e| format!("invalid match id: {}", e))?;

  conn.execute(
    "DELETE FROM tournament_matches WHERE id = ?1",
    rusqlite::params![id_num],
  )
  .map_err(|e| format!("db delete error: {}", e))?;

  Ok("ok".to_string())
}

pub fn list_tournament_matches(tournament_id: String) -> Result<JsonValue, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;
  ensure_tournament_tables(&conn)?;

  let id_num: i64 = tournament_id
    .parse()
    .map_err(|e| format!("invalid tournament id: {}", e))?;

  Ok(JsonValue::Array(list_tournament_matches_for_conn(&conn, id_num)?))
}

pub fn get_tournament_match(match_id: String) -> Result<JsonValue, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;
  ensure_tournament_tables(&conn)?;

  let id_num: i64 = match_id
    .parse()
    .map_err(|e| format!("invalid match id: {}", e))?;

  let mut stmt = conn
    .prepare("SELECT tournament_id FROM tournament_matches WHERE id = ?1 LIMIT 1")
    .map_err(|e| format!("db prepare error: {}", e))?;

  let tournament_id = stmt
    .query_row(rusqlite::params![id_num], |r| r.get::<_, i64>(0))
    .optional()
    .map_err(|e| format!("db query error: {}", e))?
    .ok_or_else(|| format!("match not found: {}", id_num))?;

  let matches = list_tournament_matches_for_conn(&conn, tournament_id)?;
  matches
    .into_iter()
    .find(|m| m.get("id").and_then(|v| v.as_str()) == Some(&id_num.to_string()))
    .ok_or_else(|| format!("match not found: {}", id_num))
}
