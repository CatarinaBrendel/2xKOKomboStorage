use std::fs;

use rusqlite::{Connection, OptionalExtension};
use serde_json::json;
use serde_json::Value as JsonValue;

use super::common::default_db_path;
use super::notes::{ensure_champion_notes_table, fetch_champion_notes};

pub fn add_champion(
  name: String,
  code: String,
  slug: String,
  ctype: Option<String>,
  strategy: Option<String>,
  metadata: Option<String>,
) -> Result<String, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;

  conn.execute(
    "INSERT INTO champions (name, code, slug, type, strategy, metadata) VALUES (?1,?2,?3,?4,?5,?6)",
    rusqlite::params![name, code, slug, ctype, strategy, metadata],
  )
  .map_err(|e| format!("db insert error: {}", e))?;

  let id = conn.last_insert_rowid();
  Ok(id.to_string())
}

fn ensure_champion_combos_table(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
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
      ",
    )
    .map_err(|e| format!("failed to ensure champion_combos table: {}", e))
}

fn fetch_champion_combos(conn: &Connection, champion_id: String) -> Result<Vec<JsonValue>, String> {
  let combos_sql_ext = "SELECT id, line, fuse, sort_order, name, ranking, assist, created_at FROM champion_combos WHERE champion_id = ?1 ORDER BY sort_order, created_at";
  let combos_sql_basic = "SELECT id, line, fuse, sort_order, created_at FROM champion_combos WHERE champion_id = ?1 ORDER BY sort_order, created_at";

  let mut combos_stmt = match conn.prepare(combos_sql_ext) {
    Ok(s) => s,
    Err(_) => conn
      .prepare(combos_sql_basic)
      .map_err(|e| format!("db prepare error: {}", e))?,
  };

  let mut combos: Vec<JsonValue> = Vec::new();
  if combos_stmt.column_count() >= 8 {
    let rows = combos_stmt
      .query_map(rusqlite::params![champion_id], |r| {
        Ok(json!({
          "id": r.get::<_, String>(0)?,
          "line": r.get::<_, String>(1)?,
          "fuse": r.get::<_, Option<String>>(2)?,
          "sort_order": r.get::<_, Option<i64>>(3)?,
          "name": r.get::<_, Option<String>>(4)?,
          "ranking": r.get::<_, Option<i64>>(5)?,
          "assist": r.get::<_, Option<String>>(6)?,
          "created_at": r.get::<_, Option<String>>(7)?,
        }))
      })
      .map_err(|e| format!("db query error: {}", e))?;

    for row in rows {
      if let Ok(v) = row {
        combos.push(v)
      }
    }
  } else {
    let rows = combos_stmt
      .query_map(rusqlite::params![champion_id], |r| {
        Ok(json!({
          "id": r.get::<_, String>(0)?,
          "line": r.get::<_, String>(1)?,
          "fuse": r.get::<_, Option<String>>(2)?,
          "sort_order": r.get::<_, Option<i64>>(3)?,
          "name": serde_json::Value::Null,
          "ranking": serde_json::Value::Null,
          "assist": serde_json::Value::Null,
          "created_at": r.get::<_, Option<String>>(4)?,
        }))
      })
      .map_err(|e| format!("db query error: {}", e))?;

    for row in rows {
      if let Ok(v) = row {
        combos.push(v)
      }
    }
  }

  Ok(combos)
}

fn fetch_champion_images(conn: &Connection, champion_id: String) -> Result<Vec<JsonValue>, String> {
  let mut imgs_stmt = conn
    .prepare("SELECT type, storage, path, format, size, checksum, created_at FROM champion_images WHERE champion_id = ?1")
    .map_err(|e| format!("db prepare error: {}", e))?;

  let imgs_iter = imgs_stmt
    .query_map(rusqlite::params![champion_id], |r| {
      Ok(json!({
        "type": r.get::<_, String>(0)?,
        "storage": r.get::<_, String>(1)?,
        "path": r.get::<_, String>(2)?,
        "format": r.get::<_, Option<String>>(3)?,
        "size": r.get::<_, Option<i64>>(4)?,
        "checksum": r.get::<_, Option<String>>(5)?,
        "created_at": r.get::<_, Option<String>>(6)?,
      }))
    })
    .map_err(|e| format!("db query error: {}", e))?;

  let mut images = Vec::new();
  for img_res in imgs_iter {
    if let Ok(v) = img_res {
      images.push(v)
    }
  }
  Ok(images)
}

pub fn get_champion_by_code(code: String) -> Result<JsonValue, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;

  let mut stmt = conn
    .prepare("SELECT id, name, code, slug, type, strategy, metadata FROM champions WHERE code = ?1 LIMIT 1")
    .map_err(|e| format!("db prepare error: {}", e))?;

  let row = stmt
    .query_row(rusqlite::params![code], |r| {
      Ok((
        r.get::<_, i64>(0)?,
        r.get::<_, String>(1)?,
        r.get::<_, String>(2)?,
        r.get::<_, String>(3)?,
        r.get::<_, Option<String>>(4)?,
        r.get::<_, Option<String>>(5)?,
        r.get::<_, Option<String>>(6)?,
      ))
    })
    .optional()
    .map_err(|e| format!("db query error: {}", e))?;

  if let Some((id, name, code, slug, ctype, strategy, metadata)) = row {
    let images = fetch_champion_images(&conn, id.to_string())?;
    ensure_champion_combos_table(&conn)?;
    let combos = fetch_champion_combos(&conn, id.to_string())?;
    ensure_champion_notes_table(&conn)?;
    let notes = fetch_champion_notes(&conn, id.to_string())?;

    let meta_json: Option<JsonValue> = match metadata {
      Some(m) => serde_json::from_str(&m).ok(),
      None => None,
    };

    Ok(json!({
      "id": id.to_string(),
      "name": name,
      "code": code,
      "slug": slug,
      "type": ctype,
      "strategy": strategy,
      "metadata": meta_json,
      "images": images,
      "combos": combos,
      "notes": notes,
    }))
  } else {
    Err(format!("champion not found: {}", code))
  }
}

pub fn update_champion(
  id: String,
  name: String,
  code: String,
  slug: String,
  ctype: Option<String>,
  strategy: Option<String>,
  metadata: Option<String>,
) -> Result<JsonValue, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;

  let id_num: i64 = id.parse().map_err(|e| format!("invalid id: {}", e))?;

  conn.execute(
    "UPDATE champions SET name = ?1, code = ?2, slug = ?3, type = ?4, strategy = ?5, metadata = ?6, updated_at = CURRENT_TIMESTAMP WHERE id = ?7",
    rusqlite::params![name, code, slug, ctype, strategy, metadata, id_num],
  )
  .map_err(|e| format!("db update error: {}", e))?;

  let mut stmt = conn
    .prepare("SELECT id, name, code, slug, type, strategy, metadata FROM champions WHERE id = ?1 LIMIT 1")
    .map_err(|e| format!("db prepare error: {}", e))?;

  let row = stmt
    .query_row(rusqlite::params![id_num], |r| {
      Ok((
        r.get::<_, i64>(0)?,
        r.get::<_, String>(1)?,
        r.get::<_, String>(2)?,
        r.get::<_, String>(3)?,
        r.get::<_, Option<String>>(4)?,
        r.get::<_, Option<String>>(5)?,
        r.get::<_, Option<String>>(6)?,
      ))
    })
    .optional()
    .map_err(|e| format!("db query error: {}", e))?;

  if let Some((id, name, code, slug, ctype, strategy, metadata)) = row {
    let images = fetch_champion_images(&conn, id.to_string())?;
    ensure_champion_combos_table(&conn)?;
    let combos = fetch_champion_combos(&conn, id.to_string())?;
    ensure_champion_notes_table(&conn)?;
    let notes = fetch_champion_notes(&conn, id.to_string())?;

    let meta_json: Option<JsonValue> = match metadata {
      Some(m) => serde_json::from_str(&m).ok(),
      None => None,
    };

    Ok(json!({
      "id": id.to_string(),
      "name": name,
      "code": code,
      "slug": slug,
      "type": ctype,
      "strategy": strategy,
      "metadata": meta_json,
      "images": images,
      "combos": combos,
      "notes": notes,
    }))
  } else {
    Err(format!("champion not found after update: {}", id))
  }
}

pub fn delete_champion(id: String) -> Result<String, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let mut conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;

  let id_num: i64 = id.parse().map_err(|e| format!("invalid id: {}", e))?;

  fn table_exists(conn: &Connection, name: &str) -> Result<bool, String> {
    conn
      .query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?1)",
        rusqlite::params![name],
        |r| r.get::<_, i64>(0),
      )
      .map(|v| v == 1)
      .map_err(|e| format!("table existence check error ({}): {}", name, e))
  }

  ensure_champion_combos_table(&conn)?;

  let champion_id = id_num.to_string();

  let has_champion_combos = table_exists(&conn, "champion_combos")?;
  let has_champion_notes = table_exists(&conn, "champion_notes")?;
  let has_champion_images = table_exists(&conn, "champion_images")?;
  let has_combo_champions = table_exists(&conn, "combo_champions")?;
  let has_combo_steps = table_exists(&conn, "combo_steps")?;
  let has_abilities = table_exists(&conn, "abilities")?;
  let has_matchups = table_exists(&conn, "matchups")?;
  let has_fuse_champions = table_exists(&conn, "fuse_champions")?;
  let has_team_members = table_exists(&conn, "team_members")?;

  let mut image_paths: Vec<String> = Vec::new();
  if has_champion_images {
    let mut stmt = conn
      .prepare("SELECT path FROM champion_images WHERE champion_id = ?1")
      .map_err(|e| format!("db prepare error: {}", e))?;

    let rows = stmt
      .query_map(rusqlite::params![champion_id.clone()], |r| r.get::<_, String>(0))
      .map_err(|e| format!("db query error: {}", e))?;

    for row in rows {
      if let Ok(path) = row {
        image_paths.push(path);
      }
    }
  }

  let tx = conn
    .transaction()
    .map_err(|e| format!("db transaction error: {}", e))?;

  if has_champion_combos {
    tx.execute(
      "DELETE FROM champion_combos WHERE champion_id = ?1",
      rusqlite::params![champion_id.clone()],
    )
    .map_err(|e| format!("db delete champion_combos error: {}", e))?;
  }

  if has_champion_notes {
    tx.execute(
      "DELETE FROM champion_notes WHERE champion_id = ?1",
      rusqlite::params![id_num],
    )
    .map_err(|e| format!("db delete champion_notes error: {}", e))?;
  }

  if has_champion_images {
    tx.execute(
      "DELETE FROM champion_images WHERE champion_id = ?1",
      rusqlite::params![champion_id.clone()],
    )
    .map_err(|e| format!("db delete champion_images error: {}", e))?;
  }

  if has_combo_champions {
    tx.execute(
      "DELETE FROM combo_champions WHERE champion_id = ?1",
      rusqlite::params![id_num],
    )
    .map_err(|e| format!("db delete combo_champions error: {}", e))?;
  }

  if has_combo_steps {
    tx.execute(
      "DELETE FROM combo_steps WHERE referenced_champion_id = ?1",
      rusqlite::params![id_num],
    )
    .map_err(|e| format!("db delete combo_steps error: {}", e))?;
  }

  if has_abilities {
    tx.execute(
      "DELETE FROM abilities WHERE champion_id = ?1",
      rusqlite::params![id_num],
    )
    .map_err(|e| format!("db delete abilities error: {}", e))?;
  }

  if has_matchups {
    tx.execute(
      "DELETE FROM matchups WHERE champion_id = ?1 OR versus_champion_id = ?1",
      rusqlite::params![id_num],
    )
    .map_err(|e| format!("db delete matchups error: {}", e))?;
  }

  if has_fuse_champions {
    tx.execute(
      "DELETE FROM fuse_champions WHERE champion_id = ?1",
      rusqlite::params![id_num],
    )
    .map_err(|e| format!("db delete fuse_champions error: {}", e))?;
  }

  if has_team_members {
    tx.execute(
      "DELETE FROM team_members WHERE champion_id = ?1",
      rusqlite::params![id_num],
    )
    .map_err(|e| format!("db delete team_members error: {}", e))?;
  }

  let affected = tx
    .execute("DELETE FROM champions WHERE id = ?1", rusqlite::params![id_num])
    .map_err(|e| format!("db delete champion error: {}", e))?;

  if affected == 0 {
    return Err(format!("champion not found: {}", id));
  }

  tx.commit().map_err(|e| format!("db commit error: {}", e))?;

  if has_champion_images {
    let base = dirs_next::data_dir().ok_or("unable to locate user data dir")?;
    let images_dir = base.join("2xKOKombo").join("images");
    for path in image_paths {
      let refs: i64 = conn
        .query_row(
          "SELECT COUNT(1) FROM champion_images WHERE path = ?1",
          rusqlite::params![path.clone()],
          |r| r.get(0),
        )
        .map_err(|e| format!("db image refs query error: {}", e))?;

      if refs == 0 {
        let _ = fs::remove_file(images_dir.join(path));
      }
    }
  }

  Ok("ok".to_string())
}

pub fn delete_champion_by_code(code: String) -> Result<String, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;

  let id_num: Option<i64> = conn
    .query_row(
      "SELECT id FROM champions WHERE code = ?1 LIMIT 1",
      rusqlite::params![code.clone()],
      |r| r.get(0),
    )
    .optional()
    .map_err(|e| format!("db query error: {}", e))?;

  if let Some(found_id) = id_num {
    delete_champion(found_id.to_string())
  } else {
    Err(format!("champion not found by code: {}", code))
  }
}

pub fn list_champions() -> Result<JsonValue, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;

  let mut stmt = conn
    .prepare("SELECT id, name, code, slug, type, strategy, metadata FROM champions ORDER BY name COLLATE NOCASE")
    .map_err(|e| format!("db prepare error: {}", e))?;

  let rows = stmt
    .query_map([], |r| {
      Ok((
        r.get::<_, i64>(0)?,
        r.get::<_, String>(1)?,
        r.get::<_, String>(2)?,
        r.get::<_, String>(3)?,
        r.get::<_, Option<String>>(4)?,
        r.get::<_, Option<String>>(5)?,
        r.get::<_, Option<String>>(6)?,
      ))
    })
    .map_err(|e| format!("db query error: {}", e))?;

  let mut out = Vec::new();
  for row_res in rows {
    if let Ok((id, name, code, slug, ctype, strategy, metadata)) = row_res {
      let mut img_stmt = conn
        .prepare("SELECT path, format FROM champion_images WHERE champion_id = ?1 AND type = 'icon' LIMIT 1")
        .map_err(|e| format!("db prepare error: {}", e))?;

      let icon: Option<JsonValue> = img_stmt
        .query_row(rusqlite::params![id.to_string()], |r| {
          Ok(json!({
            "path": r.get::<_, String>(0)?,
            "format": r.get::<_, Option<String>>(1)?,
          }))
        })
        .optional()
        .map_err(|e| format!("db query error: {}", e))?;

      let meta_json: Option<JsonValue> = match metadata {
        Some(m) => serde_json::from_str(&m).ok(),
        None => None,
      };

      out.push(json!({
        "id": id.to_string(),
        "name": name,
        "code": code,
        "slug": slug,
        "type": ctype,
        "strategy": strategy,
        "metadata": meta_json,
        "icon": icon,
      }));
    }
  }

  Ok(json!(out))
}
