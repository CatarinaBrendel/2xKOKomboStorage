use rusqlite::Connection;
use uuid::Uuid;

use super::common::default_db_path;

pub fn set_combos(champion_id: String, combos_json: String) -> Result<String, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;

  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;

  conn.execute_batch(
    "CREATE TABLE IF NOT EXISTS champion_combos (
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
    "
  ).map_err(|e| format!("failed to ensure champion_combos table: {}", e))?;

  let mut pragma_stmt = conn
    .prepare("PRAGMA table_info('champion_combos')")
    .map_err(|e| format!("pragma prepare error: {}", e))?;
  let pragma_iter = pragma_stmt
    .query_map([], |r| Ok(r.get::<_, String>(1)?))
    .map_err(|e| format!("pragma query error: {}", e))?;
  let mut existing_cols: Vec<String> = Vec::new();
  for col_res in pragma_iter {
    if let Ok(col) = col_res {
      existing_cols.push(col)
    }
  }

  if !existing_cols.iter().any(|c| c == "name") {
    conn.execute("ALTER TABLE champion_combos ADD COLUMN name TEXT DEFAULT NULL", [])
      .map_err(|e| format!("failed to add column 'name' to champion_combos: {}", e))?;
  }
  if !existing_cols.iter().any(|c| c == "ranking") {
    conn.execute(
      "ALTER TABLE champion_combos ADD COLUMN ranking INTEGER DEFAULT NULL",
      [],
    )
    .map_err(|e| format!("failed to add column 'ranking' to champion_combos: {}", e))?;
  }
  if !existing_cols.iter().any(|c| c == "assist") {
    conn.execute("ALTER TABLE champion_combos ADD COLUMN assist TEXT DEFAULT NULL", [])
      .map_err(|e| format!("failed to add column 'assist' to champion_combos: {}", e))?;
  }
  if !existing_cols.iter().any(|c| c == "tags") {
    conn.execute("ALTER TABLE champion_combos ADD COLUMN tags JSON DEFAULT NULL", [])
      .map_err(|e| format!("failed to add column 'tags' to champion_combos: {}", e))?;
  }

  conn.execute(
    "DELETE FROM champion_combos WHERE champion_id = ?1",
    rusqlite::params![champion_id],
  )
  .map_err(|e| format!("db delete error: {}", e))?;

  let parsed: serde_json::Value =
    serde_json::from_str(&combos_json).map_err(|e| format!("invalid combos json: {}", e))?;
  if let Some(arr) = parsed.as_array() {
    for (i, item) in arr.iter().enumerate() {
      let line = item
        .get("line")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
      if line.trim().is_empty() {
        continue;
      }
      let fuse = item.get("fuse").and_then(|v| v.as_str()).map(|s| s.to_string());
      let sort_order = item
        .get("sort_order")
        .and_then(|v| v.as_i64())
        .unwrap_or(i as i64);
      let name = item.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
      let ranking = item.get("ranking").and_then(|v| v.as_i64());
      let assist = item
        .get("assist")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
      let tags_json = if let Some(t) = item.get("tags") {
        match serde_json::to_string(t) {
          Ok(s) => Some(s),
          Err(_) => None,
        }
      } else {
        None
      };

      let id = Uuid::new_v4().to_string();
      conn.execute(
        "INSERT INTO champion_combos (id, champion_id, line, fuse, sort_order, name, ranking, tags, assist) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)",
        rusqlite::params![id, champion_id, line, fuse, sort_order, name, ranking, tags_json, assist],
      )
      .map_err(|e| format!("db insert error: {}", e))?;
    }
  }

  Ok("ok".to_string())
}
