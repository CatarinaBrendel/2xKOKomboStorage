use rusqlite::Connection;
use rusqlite::OptionalExtension;
use serde_json::Value as JsonValue;
use serde_json::json;
use std::collections::HashSet;
use uuid::Uuid;

use super::common::default_db_path;

fn slugify_tag_name(input: &str) -> String {
  let mut out = String::new();
  let mut last_dash = false;

  for ch in input.trim().chars() {
    if ch.is_ascii_alphanumeric() {
      out.push(ch.to_ascii_lowercase());
      last_dash = false;
    } else if (ch.is_whitespace() || ch == '-' || ch == '_') && !last_dash && !out.is_empty() {
      out.push('-');
      last_dash = true;
    }
  }

  while out.ends_with('-') {
    out.pop();
  }

  if out.is_empty() {
    "tag".to_string()
  } else {
    out
  }
}

pub fn ensure_champion_notes_table(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "CREATE TABLE IF NOT EXISTS champion_notes (
         id TEXT PRIMARY KEY,
         champion_id INTEGER NOT NULL REFERENCES champions(id) ON DELETE CASCADE,
         tag_id INTEGER DEFAULT NULL REFERENCES tags(id) ON DELETE SET NULL,
         title TEXT DEFAULT NULL,
         content TEXT NOT NULL,
         sort_order INTEGER DEFAULT 0,
         created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
         updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
       );
       CREATE INDEX IF NOT EXISTS idx_champion_notes_champion_id ON champion_notes(champion_id);
       CREATE INDEX IF NOT EXISTS idx_champion_notes_tag_id ON champion_notes(tag_id);
      ",
    )
    .map_err(|e| format!("failed to ensure champion_notes table: {}", e))?;

  let mut pragma_stmt = conn
    .prepare("PRAGMA table_info('champion_notes')")
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

  if !existing_cols.iter().any(|c| c == "title") {
    conn
      .execute("ALTER TABLE champion_notes ADD COLUMN title TEXT DEFAULT NULL", [])
      .map_err(|e| format!("failed to add column 'title' to champion_notes: {}", e))?;
  }

  Ok(())
}

fn ensure_champion_note_tags_table(conn: &Connection) -> Result<(), String> {
  conn
    .execute_batch(
      "CREATE TABLE IF NOT EXISTS champion_note_tags (
         note_id TEXT NOT NULL REFERENCES champion_notes(id) ON DELETE CASCADE,
         tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
         PRIMARY KEY (note_id, tag_id)
       );
       CREATE INDEX IF NOT EXISTS idx_champion_note_tags_tag_id ON champion_note_tags(tag_id);
      ",
    )
    .map_err(|e| format!("failed to ensure champion_note_tags table: {}", e))
}

fn fetch_note_tags(conn: &Connection, note_id: &str) -> Result<Vec<JsonValue>, String> {
  let mut stmt = conn
    .prepare(
      "SELECT t.id, t.name, t.slug
       FROM champion_note_tags nt
       JOIN tags t ON t.id = nt.tag_id
       WHERE nt.note_id = ?1
       ORDER BY t.name COLLATE NOCASE",
    )
    .map_err(|e| format!("db prepare error: {}", e))?;

  let rows = stmt
    .query_map(rusqlite::params![note_id], |r| {
      Ok(json!({
        "id": r.get::<_, i64>(0)?.to_string(),
        "name": r.get::<_, String>(1)?,
        "slug": r.get::<_, String>(2)?,
      }))
    })
    .map_err(|e| format!("db query error: {}", e))?;

  let mut tags = Vec::new();
  for row in rows {
    if let Ok(v) = row {
      tags.push(v)
    }
  }
  Ok(tags)
}

pub fn fetch_champion_notes(conn: &Connection, champion_id: String) -> Result<Vec<JsonValue>, String> {
  ensure_champion_notes_table(conn)?;
  ensure_champion_note_tags_table(conn)?;

  let mut stmt = conn
    .prepare(
      "SELECT n.id, n.title, n.content, n.sort_order, n.tag_id, n.updated_at
       FROM champion_notes n
       WHERE n.champion_id = ?1
       ORDER BY n.sort_order, n.created_at",
    )
    .map_err(|e| format!("db prepare error: {}", e))?;

  let rows = stmt
    .query_map(rusqlite::params![champion_id], |r| {
      Ok((
        r.get::<_, String>(0)?,
        r.get::<_, Option<String>>(1)?,
        r.get::<_, String>(2)?,
        r.get::<_, Option<i64>>(3)?,
        r.get::<_, Option<i64>>(4)?,
        r.get::<_, Option<String>>(5)?,
      ))
    })
    .map_err(|e| format!("db query error: {}", e))?;

  let mut notes = Vec::new();
  for row in rows {
    if let Ok((id, title, content, sort_order, legacy_tag_id, updated_at)) = row {
      let tags = fetch_note_tags(conn, &id)?;
      let first_tag = tags.first();
      let first_tag_id = first_tag
        .and_then(|t| t.get("id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| legacy_tag_id.map(|v| v.to_string()));
      let first_tag_name = first_tag
        .and_then(|t| t.get("name"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

      notes.push(json!({
        "id": id,
        "title": title,
        "content": content,
        "sort_order": sort_order,
        "tag_id": first_tag_id,
        "tag_name": first_tag_name,
        "tag_ids": tags
          .iter()
          .filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string()))
          .collect::<Vec<String>>(),
        "tags": tags,
        "updated_at": updated_at,
      }))
    }
  }
  Ok(notes)
}

pub fn set_champion_notes(champion_id: String, notes_json: String) -> Result<String, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let mut conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;
  ensure_champion_notes_table(&conn)?;
  ensure_champion_note_tags_table(&conn)?;

  let champion_id_num: i64 = champion_id
    .parse()
    .map_err(|e| format!("invalid champion id: {}", e))?;

  let parsed: JsonValue =
    serde_json::from_str(&notes_json).map_err(|e| format!("invalid notes json: {}", e))?;

  let tx = conn
    .transaction()
    .map_err(|e| format!("db transaction error: {}", e))?;

  let mut keep_ids: Vec<String> = Vec::new();

  if let Some(arr) = parsed.as_array() {
    for (idx, item) in arr.iter().enumerate() {
      let incoming_id = item
        .get("id")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

      let title = item
        .get("title")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty());

      let content = item
        .get("content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();

      if content.is_empty() {
        continue;
      }

      let sort_order = item
        .get("sort_order")
        .and_then(|v| v.as_i64())
        .unwrap_or(idx as i64);

      let tag_id = item
        .get("tag_id")
        .and_then(|v| v.as_str())
        .and_then(|s| s.parse::<i64>().ok())
        .or_else(|| item.get("tag_id").and_then(|v| v.as_i64()));

      let mut tag_ids_set: HashSet<i64> = HashSet::new();
      if let Some(arr) = item.get("tag_ids").and_then(|v| v.as_array()) {
        for tv in arr {
          let parsed = tv
            .as_str()
            .and_then(|s| s.parse::<i64>().ok())
            .or_else(|| tv.as_i64());
          if let Some(tag_num) = parsed {
            tag_ids_set.insert(tag_num);
          }
        }
      }
      if let Some(primary) = tag_id {
        tag_ids_set.insert(primary);
      }
      let mut tag_ids: Vec<i64> = tag_ids_set.into_iter().collect();
      tag_ids.sort_unstable();
      let primary_tag_id = tag_ids.first().copied();

      if let Some(existing_id) = incoming_id {
        let affected = tx
          .execute(
            "UPDATE champion_notes
             SET tag_id = ?1, title = ?2, content = ?3, sort_order = ?4, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?5 AND champion_id = ?6",
            rusqlite::params![primary_tag_id, title, content, sort_order, existing_id, champion_id_num],
          )
          .map_err(|e| format!("db update error: {}", e))?;

        let ensured_id = if affected == 0 {
          let new_id = Uuid::new_v4().to_string();
          tx.execute(
            "INSERT INTO champion_notes (id, champion_id, tag_id, title, content, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![new_id, champion_id_num, primary_tag_id, title, content, sort_order],
          )
          .map_err(|e| format!("db insert error: {}", e))?;
          keep_ids.push(new_id.clone());
          new_id
        } else {
          keep_ids.push(existing_id.clone());
          existing_id
        };

        tx.execute(
          "DELETE FROM champion_note_tags WHERE note_id = ?1",
          rusqlite::params![ensured_id.clone()],
        )
        .map_err(|e| format!("db delete note tags error: {}", e))?;

        for tag_num in tag_ids {
          tx.execute(
            "INSERT OR IGNORE INTO champion_note_tags (note_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![ensured_id.clone(), tag_num],
          )
          .map_err(|e| format!("db insert note tag error: {}", e))?;
        }

      } else {
        let id = Uuid::new_v4().to_string();
        tx.execute(
          "INSERT INTO champion_notes (id, champion_id, tag_id, title, content, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
          rusqlite::params![id.clone(), champion_id_num, primary_tag_id, title, content, sort_order],
        )
        .map_err(|e| format!("db insert error: {}", e))?;
        keep_ids.push(id.clone());

        for tag_num in tag_ids {
          tx.execute(
            "INSERT OR IGNORE INTO champion_note_tags (note_id, tag_id) VALUES (?1, ?2)",
            rusqlite::params![id.clone(), tag_num],
          )
          .map_err(|e| format!("db insert note tag error: {}", e))?;
        }
      }

    }
  }

  if keep_ids.is_empty() {
    tx.execute(
      "DELETE FROM champion_notes WHERE champion_id = ?1",
      rusqlite::params![champion_id_num],
    )
    .map_err(|e| format!("db delete error: {}", e))?;
  } else {
    let placeholders = vec!["?"; keep_ids.len()].join(",");
    let sql = format!(
      "DELETE FROM champion_notes WHERE champion_id = ?1 AND id NOT IN ({})",
      placeholders
    );

    let mut params: Vec<&dyn rusqlite::ToSql> = Vec::with_capacity(1 + keep_ids.len());
    params.push(&champion_id_num as &dyn rusqlite::ToSql);
    for id in &keep_ids {
      params.push(id as &dyn rusqlite::ToSql);
    }

    tx.execute(&sql, rusqlite::params_from_iter(params))
      .map_err(|e| format!("db cleanup delete error: {}", e))?;
  }

  tx.commit().map_err(|e| format!("db commit error: {}", e))?;
  Ok("ok".to_string())
}

pub fn list_tags() -> Result<JsonValue, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;

  let mut stmt = conn
    .prepare("SELECT id, name, slug FROM tags ORDER BY name COLLATE NOCASE")
    .map_err(|e| format!("db prepare error: {}", e))?;

  let rows = stmt
    .query_map([], |r| {
      Ok(json!({
        "id": r.get::<_, i64>(0)?.to_string(),
        "name": r.get::<_, String>(1)?,
        "slug": r.get::<_, String>(2)?,
      }))
    })
    .map_err(|e| format!("db query error: {}", e))?;

  let mut out = Vec::new();
  for row in rows {
    if let Ok(v) = row {
      out.push(v)
    }
  }

  Ok(json!(out))
}

pub fn create_or_get_tag(name: String) -> Result<JsonValue, String> {
  let trimmed = name.trim();
  if trimmed.is_empty() {
    return Err("tag name cannot be empty".to_string());
  }

  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;

  let slug = slugify_tag_name(trimmed);

  let existing: Option<(i64, String, String)> = conn
    .query_row(
      "SELECT id, name, slug FROM tags WHERE lower(name) = lower(?1) OR slug = ?2 LIMIT 1",
      rusqlite::params![trimmed, slug],
      |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?)),
    )
    .optional()
    .map_err(|e| format!("db query error: {}", e))?;

  if let Some((id, existing_name, existing_slug)) = existing {
    return Ok(json!({
      "id": id.to_string(),
      "name": existing_name,
      "slug": existing_slug,
    }));
  }

  conn
    .execute(
      "INSERT INTO tags (name, slug) VALUES (?1, ?2)",
      rusqlite::params![trimmed, slug],
    )
    .map_err(|e| format!("db insert error: {}", e))?;

  let id = conn.last_insert_rowid();

  Ok(json!({
    "id": id.to_string(),
    "name": trimmed,
    "slug": slug,
  }))
}

pub fn rename_champion_note(note_id: String, title: String) -> Result<String, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;
  ensure_champion_notes_table(&conn)?;

  let affected = conn
    .execute(
      "UPDATE champion_notes SET title = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
      rusqlite::params![title, note_id],
    )
    .map_err(|e| format!("db update error: {}", e))?;

  if affected == 0 {
    return Err("note not found".to_string());
  }

  Ok("ok".to_string())
}

pub fn duplicate_champion_note(note_id: String) -> Result<JsonValue, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let mut conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;
  ensure_champion_notes_table(&conn)?;
  ensure_champion_note_tags_table(&conn)?;

  let source = conn
    .query_row(
      "SELECT champion_id, tag_id, title, content FROM champion_notes WHERE id = ?1 LIMIT 1",
      rusqlite::params![note_id],
      |r| {
        Ok((
          r.get::<_, i64>(0)?,
          r.get::<_, Option<i64>>(1)?,
          r.get::<_, Option<String>>(2)?,
          r.get::<_, String>(3)?,
        ))
      },
    )
    .map_err(|e| format!("note lookup error: {}", e))?;

  let (champion_id, tag_id, title, content) = source;

  let next_sort: i64 = conn
    .query_row(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM champion_notes WHERE champion_id = ?1",
      rusqlite::params![champion_id],
      |r| r.get(0),
    )
    .map_err(|e| format!("sort order query error: {}", e))?;

  let new_id = Uuid::new_v4().to_string();
  let dup_title = title
    .as_ref()
    .map(|t| {
      let trimmed = t.trim();
      if trimmed.is_empty() {
        "Copy".to_string()
      } else {
        format!("{} (Copy)", trimmed)
      }
    })
    .or(Some("Copy".to_string()));

  let source_tags = fetch_note_tags(&conn, &note_id)?;

  let tx = conn
    .transaction()
    .map_err(|e| format!("db transaction error: {}", e))?;

  tx.execute(
    "INSERT INTO champion_notes (id, champion_id, tag_id, title, content, sort_order) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
    rusqlite::params![new_id, champion_id, tag_id, dup_title, content, next_sort],
  )
  .map_err(|e| format!("db insert error: {}", e))?;

  for tag in source_tags {
    if let Some(tag_num) = tag.get("id").and_then(|v| v.as_str()).and_then(|s| s.parse::<i64>().ok()) {
      tx.execute(
        "INSERT OR IGNORE INTO champion_note_tags (note_id, tag_id) VALUES (?1, ?2)",
        rusqlite::params![new_id.clone(), tag_num],
      )
      .map_err(|e| format!("db insert duplicated note tag error: {}", e))?;
    }
  }

  tx.commit().map_err(|e| format!("db commit error: {}", e))?;

  let out = conn
    .query_row(
      "SELECT n.id, n.title, n.content, n.sort_order, n.updated_at
       FROM champion_notes n
       WHERE n.id = ?1 LIMIT 1",
      rusqlite::params![new_id],
      |r| {
        Ok((
          r.get::<_, String>(0)?,
          r.get::<_, Option<String>>(1)?,
          r.get::<_, String>(2)?,
          r.get::<_, Option<i64>>(3)?,
          r.get::<_, Option<String>>(4)?,
        ))
      },
    )
    .map_err(|e| format!("db fetch duplicated note error: {}", e))?;

  let (id, title, content, sort_order, updated_at) = out;
  let tags = fetch_note_tags(&conn, &id)?;
  let first_tag = tags.first();

  Ok(json!({
    "id": id,
    "title": title,
    "content": content,
    "sort_order": sort_order,
    "tag_id": first_tag.and_then(|t| t.get("id")).and_then(|v| v.as_str()).map(|s| s.to_string()),
    "tag_name": first_tag.and_then(|t| t.get("name")).and_then(|v| v.as_str()).map(|s| s.to_string()),
    "tag_ids": tags.iter().filter_map(|t| t.get("id").and_then(|v| v.as_str()).map(|s| s.to_string())).collect::<Vec<String>>(),
    "tags": tags,
    "updated_at": updated_at,
  }))
}

pub fn delete_champion_note(note_id: String) -> Result<String, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;
  ensure_champion_notes_table(&conn)?;

  let affected = conn
    .execute(
      "DELETE FROM champion_notes WHERE id = ?1",
      rusqlite::params![note_id],
    )
    .map_err(|e| format!("db delete error: {}", e))?;

  if affected == 0 {
    return Err("note not found".to_string());
  }

  Ok("ok".to_string())
}
