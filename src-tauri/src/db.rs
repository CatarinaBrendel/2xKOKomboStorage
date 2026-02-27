use std::path::PathBuf;
use std::fs;

use rusqlite::{Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use hex;
use base64::{engine::general_purpose, Engine as _};
use serde_json::json;
use serde_json::Value as JsonValue;

const MIGRATION_SQL: &str = include_str!("../migrations/0001_create_schema.sql");

fn default_db_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
  let base = dirs_next::data_dir().ok_or("unable to locate user data dir")?;
  let dir = base.join("2xKOKombo");
  std::fs::create_dir_all(&dir)?;
  Ok(dir.join("app.db"))
}

/// Read a runtime-stored image file (by stored filename) and return a data URL (base64).
#[tauri::command]
pub fn get_image_data(filename: String) -> Result<String, String> {
  let base = dirs_next::data_dir().ok_or("unable to locate user data dir")?;
  let images_dir = base.join("2xKOKombo").join("images");
  let path = images_dir.join(&filename);
  if !path.exists() {
    return Err(format!("image not found: {}", filename));
  }

  let bytes = fs::read(&path).map_err(|e| format!("failed to read image file: {}", e))?;

  // derive mime from extension
  let ext = std::path::Path::new(&filename)
    .extension()
    .and_then(|e| e.to_str())
    .unwrap_or("png")
    .to_lowercase();

  let mime = match ext.as_str() {
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "webp" => "image/webp",
    "svg" => "image/svg+xml",
    _ => "application/octet-stream",
  };

  let b64 = general_purpose::STANDARD.encode(&bytes);
  let data_url = format!("data:{};base64,{}", mime, b64);
  Ok(data_url)
}

fn migrations_dir() -> PathBuf {
  let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  manifest.join("migrations")
}

pub fn run_migrations_at(path: Option<String>) -> Result<(), Box<dyn std::error::Error>> {
  // Backwards-compatible single-batch run (keeps existing behavior)
  let db_path = match path {
    Some(p) => PathBuf::from(p),
    None => default_db_path()?,
  };

  let conn = Connection::open(db_path)?;
  conn.execute_batch(MIGRATION_SQL)?;
  Ok(())
}

/// Scan `migrations/` directory for numbered .sql files and apply any not yet applied.
pub fn run_migrations() -> Result<usize, Box<dyn std::error::Error>> {
  let db_path = default_db_path()?;
  let conn = Connection::open(&db_path)?;

  // ensure migrations table exists
  conn.execute_batch(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP);",
  )?;

  // Ensure `combos` table has a `tags` column so backfill migrations can run.
  // This is defensive: older databases may not have the column and applying
  // a backfill UPDATE would fail with "no such column: tags".
  {
    let mut pragma_stmt = conn.prepare("PRAGMA table_info('combos')")?;
    let pragma_iter = pragma_stmt.query_map([], |r| Ok(r.get::<_, String>(1)?))?;
    let mut existing_cols: Vec<String> = Vec::new();
    for col_res in pragma_iter {
      if let Ok(col) = col_res { existing_cols.push(col) }
    }

    if !existing_cols.iter().any(|c| c == "tags") {
      // Try to add the column; if it fails, log a warning and continue.
      match conn.execute("ALTER TABLE combos ADD COLUMN tags JSON DEFAULT NULL", []) {
        Ok(_) => {
          log::info!("added 'tags' column to combos table")
        }
        Err(e) => {
          log::warn!("failed to add 'tags' column to combos: {}", e);
        }
      }
    }
  }

  let mut entries: Vec<_> = std::fs::read_dir(migrations_dir())?
    .filter_map(Result::ok)
    .filter(|e| {
      if let Some(ext) = e.path().extension() {
        ext == "sql"
      } else {
        false
      }
    })
    .collect();

  // sort by filename (assumes numeric prefix like 0001_...)
  entries.sort_by_key(|e| e.file_name());

  let mut applied = 0usize;
  for entry in entries {
    let fname = entry.file_name().into_string().unwrap_or_default();
    let version_str = fname.split('_').next().unwrap_or("0");
    let version: i64 = version_str.parse().unwrap_or(0);

    let mut stmt = conn.prepare("SELECT 1 FROM schema_migrations WHERE version = ?1")?;
    let already = stmt.exists(rusqlite::params![version])?;
    if already {
      continue;
    }

    let sql = std::fs::read_to_string(entry.path())?;
    // Try to apply migration; if it fails, log and skip it to avoid blocking startup on
    // schema differences from older installs. This keeps the app usable while allowing
    // manual migration inspection later.
    match conn.execute_batch(&sql) {
      Ok(_) => {
        conn.execute(
          "INSERT INTO schema_migrations(version) VALUES (?1)",
          rusqlite::params![version],
        )?;
        applied += 1;
      }
      Err(e) => {
        log::warn!("failed to apply migration {}: {}", fname, e);
        // do not return error; continue to next migration
        continue;
      }
    }
  }

  Ok(applied)
}

#[tauri::command]
pub fn init_db(path: Option<String>) -> Result<String, String> {
  run_migrations_at(path)
    .map(|_| "ok".to_string())
    .map_err(|e| format!("migration error: {}", e))
}

#[tauri::command]
pub fn run_migrations_cmd() -> Result<String, String> {
  match run_migrations() {
    Ok(n) => Ok(format!("applied {} migrations", n)),
    Err(e) => Err(format!("migration runner error: {}", e)),
  }
}

/// Return the logs directory path so a frontend can open it or display to user
#[tauri::command]
pub fn get_logs_dir() -> Result<String, String> {
  match default_db_path() {
    Ok(mut p) => {
      p.pop(); // remove app.db
      p.push("logs");
      let _ = std::fs::create_dir_all(&p);
      p.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "unable to determine logs dir".to_string())
    }
    Err(e) => Err(format!("unable to compute logs dir: {}", e)),
  }
}

/// Add a champion to the `champions` table. Returns the new row id as string.
#[tauri::command]
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

/// Save image bytes to the app's local images directory, compute checksum, dedupe, and
/// insert or update a `champion_images` record. Returns the stored relative path.
#[tauri::command]
pub fn save_champion_image(
  champion_id: String,
  image_type: String,
  bytes: Vec<u8>,
  filename_hint: Option<String>,
) -> Result<String, String> {
  // compute checksum
  let mut hasher = Sha256::new();
  hasher.update(&bytes);
  let checksum = hex::encode(hasher.finalize());

  // prepare images directory
  let base = dirs_next::data_dir().ok_or("unable to locate user data dir")?;
  let images_dir = base.join("2xKOKombo").join("images");
  fs::create_dir_all(&images_dir).map_err(|e| format!("failed to create images dir: {}", e))?;

  // open DB
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;

  // check for existing file with same checksum
  let mut stmt = conn
    .prepare("SELECT path FROM champion_images WHERE checksum = ?1 LIMIT 1")
    .map_err(|e| format!("db prepare error: {}", e))?;
  let existing: Option<String> = stmt
    .query_row(rusqlite::params![checksum], |r| r.get(0))
    .optional()
    .map_err(|e| format!("db query error: {}", e))?;

  let stored_filename = if let Some(path) = existing {
    // an identical image already exists; reuse its path
    path
  } else {
    // choose extension from filename hint or default to png
    let ext = filename_hint
      .and_then(|h| std::path::Path::new(&h).extension().and_then(|e| e.to_str().map(|s| s.to_string())))
      .unwrap_or_else(|| "png".to_string());

    let id = Uuid::new_v4().to_string();
    let filename = format!("{}.{}", id, ext);
    let fullpath = images_dir.join(&filename);

    fs::write(&fullpath, &bytes).map_err(|e| format!("failed to write image file: {}", e))?;

    filename
  };

  // insert or upsert metadata for this champion/type
  let id = Uuid::new_v4().to_string();
  let format = std::path::Path::new(&stored_filename)
    .extension()
    .and_then(|e| e.to_str())
    .map(|s| s.to_string());

  let size: Option<i64> = match fs::metadata(images_dir.join(&stored_filename)) {
    Ok(m) => Some(m.len() as i64),
    Err(_) => None,
  };

  let sql = "INSERT INTO champion_images (id, champion_id, type, storage, path, format, size, checksum) \
               VALUES (?1,?2,?3,?4,?5,?6,?7,?8) \
               ON CONFLICT(champion_id, type) DO UPDATE SET id=excluded.id, storage=excluded.storage, path=excluded.path, format=excluded.format, size=excluded.size, checksum=excluded.checksum, created_at=CURRENT_TIMESTAMP;";

  conn.execute(
    sql,
    rusqlite::params![
      id,
      champion_id,
      image_type,
      "local",
      stored_filename,
      format,
      size,
      checksum
    ],
  )
  .map_err(|e| format!("db insert error: {}", e))?;

  Ok(stored_filename)
}

/// Replace combos for a champion. `combos_json` should be a JSON array of objects: { line, fuse, sort_order }
#[tauri::command]
pub fn set_combos(champion_id: String, combos_json: String) -> Result<String, String> {
  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;

  // Open DB
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;

  // Create a namespaced table for champion-specific combos if it doesn't exist.
  // Some older installations created a global `combos` table with different schema,
  // so we avoid colliding with that by using `champion_combos`.
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

  // Ensure older DBs that already had champion_combos created without the
  // new metadata columns get updated. Use PRAGMA table_info to detect
  // missing columns and ALTER TABLE to add them if necessary.
  let mut pragma_stmt = conn.prepare("PRAGMA table_info('champion_combos')").map_err(|e| format!("pragma prepare error: {}", e))?;
  let pragma_iter = pragma_stmt.query_map([], |r| Ok(r.get::<_, String>(1)?)).map_err(|e| format!("pragma query error: {}", e))?;
  let mut existing_cols: Vec<String> = Vec::new();
  for col_res in pragma_iter {
    if let Ok(col) = col_res { existing_cols.push(col) }
  }

  if !existing_cols.iter().any(|c| c == "name") {
    conn.execute("ALTER TABLE champion_combos ADD COLUMN name TEXT DEFAULT NULL", [])
      .map_err(|e| format!("failed to add column 'name' to champion_combos: {}", e))?;
  }
  if !existing_cols.iter().any(|c| c == "ranking") {
    conn.execute("ALTER TABLE champion_combos ADD COLUMN ranking INTEGER DEFAULT NULL", [])
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

  // delete existing combos for this champion (in our namespaced table)
  conn.execute("DELETE FROM champion_combos WHERE champion_id = ?1", rusqlite::params![champion_id])
    .map_err(|e| format!("db delete error: {}", e))?;

  // parse incoming JSON
  let parsed: serde_json::Value = serde_json::from_str(&combos_json).map_err(|e| format!("invalid combos json: {}", e))?;
  if let Some(arr) = parsed.as_array() {
    for (i, item) in arr.iter().enumerate() {
      let line = item.get("line").and_then(|v| v.as_str()).unwrap_or("").to_string();
      if line.trim().is_empty() {
        // skip empty lines (defensive check)
        continue;
      }
      let fuse = item.get("fuse").and_then(|v| v.as_str()).map(|s| s.to_string());
      let sort_order = item.get("sort_order").and_then(|v| v.as_i64()).unwrap_or(i as i64);
      let name = item.get("name").and_then(|v| v.as_str()).map(|s| s.to_string());
      let ranking = item.get("ranking").and_then(|v| v.as_i64());
      let assist = item.get("assist").and_then(|v| v.as_str()).map(|s| s.to_string());
      // tags may be an array or string; store as JSON text
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

/// Fetch champion by `code` (unique). Returns champion fields and associated images.
#[tauri::command]
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
    // fetch images
    let mut imgs_stmt = conn
      .prepare("SELECT type, storage, path, format, size, checksum, created_at FROM champion_images WHERE champion_id = ?1")
      .map_err(|e| format!("db prepare error: {}", e))?;

    let imgs_iter = imgs_stmt
      .query_map(rusqlite::params![id.to_string()], |r| {
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
      if let Ok(v) = img_res { images.push(v) }
    }

    // ensure our namespaced combos table exists (avoid colliding with legacy `combos` table)
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

    // fetch combos from our namespaced table (try extended SELECT, fallback if columns missing)
    let combos_sql_ext = "SELECT id, line, fuse, sort_order, name, ranking, assist, created_at FROM champion_combos WHERE champion_id = ?1 ORDER BY sort_order, created_at";
    let combos_sql_basic = "SELECT id, line, fuse, sort_order, created_at FROM champion_combos WHERE champion_id = ?1 ORDER BY sort_order, created_at";

    let mut combos_stmt = match conn.prepare(combos_sql_ext) {
      Ok(s) => s,
      Err(_) => conn.prepare(combos_sql_basic).map_err(|e| format!("db prepare error: {}", e))?,
    };

    let mut combos: Vec<JsonValue> = Vec::new();
    if combos_stmt.column_count() >= 8 {
      let rows = combos_stmt
        .query_map(rusqlite::params![id.to_string()], |r| {
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
        if let Ok(v) = row { combos.push(v) }
      }
    } else {
      let rows = combos_stmt
        .query_map(rusqlite::params![id.to_string()], |r| {
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
        if let Ok(v) = row { combos.push(v) }
      }
    }

    // Try to parse metadata as JSON
    let meta_json: Option<JsonValue> = match metadata {
      Some(m) => serde_json::from_str(&m).ok(),
      None => None,
    };

    let out = json!({
      "id": id.to_string(),
      "name": name,
      "code": code,
      "slug": slug,
      "type": ctype,
      "strategy": strategy,
      "metadata": meta_json,
      "images": images,
      "combos": combos,
    });

    Ok(out)
  } else {
    Err(format!("champion not found: {}", code))
  }
}

/// Update an existing champion by id. Returns the updated champion JSON on success.
#[tauri::command]
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

  // parse id to integer
  let id_num: i64 = id.parse().map_err(|e| format!("invalid id: {}", e))?;

  conn.execute(
    "UPDATE champions SET name = ?1, code = ?2, slug = ?3, type = ?4, strategy = ?5, metadata = ?6, updated_at = CURRENT_TIMESTAMP WHERE id = ?7",
    rusqlite::params![name, code, slug, ctype, strategy, metadata, id_num],
  )
  .map_err(|e| format!("db update error: {}", e))?;

  // Now fetch the updated champion and return JSON similar to `get_champion_by_code`.
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
    // fetch images
    let mut imgs_stmt = conn
      .prepare("SELECT type, storage, path, format, size, checksum, created_at FROM champion_images WHERE champion_id = ?1")
      .map_err(|e| format!("db prepare error: {}", e))?;

    let imgs_iter = imgs_stmt
      .query_map(rusqlite::params![id.to_string()], |r| {
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
      match img_res {
        Ok(v) => images.push(v),
        Err(_) => {}
      }
    }

    // ensure our namespaced combos table exists before querying
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

    // fetch combos for updated champion from namespaced table
    let combos_sql_ext = "SELECT id, line, fuse, sort_order, name, ranking, assist, created_at FROM champion_combos WHERE champion_id = ?1 ORDER BY sort_order, created_at";
    let combos_sql_basic = "SELECT id, line, fuse, sort_order, created_at FROM champion_combos WHERE champion_id = ?1 ORDER BY sort_order, created_at";

    let mut combos_stmt = match conn.prepare(combos_sql_ext) {
      Ok(s) => s,
      Err(_) => conn.prepare(combos_sql_basic).map_err(|e| format!("db prepare error: {}", e))?,
    };

    let mut combos: Vec<JsonValue> = Vec::new();
    if combos_stmt.column_count() >= 8 {
      let rows = combos_stmt
        .query_map(rusqlite::params![id.to_string()], |r| {
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
        if let Ok(v) = row { combos.push(v) }
      }
    } else {
      let rows = combos_stmt
        .query_map(rusqlite::params![id.to_string()], |r| {
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
        if let Ok(v) = row { combos.push(v) }
      }
    }

    // Try to parse metadata as JSON
    let meta_json: Option<JsonValue> = match metadata {
      Some(m) => serde_json::from_str(&m).ok(),
      None => None,
    };

    let out = json!({
      "id": id.to_string(),
      "name": name,
      "code": code,
      "slug": slug,
      "type": ctype,
      "strategy": strategy,
      "metadata": meta_json,
      "images": images,
      "combos": combos,
    });

    Ok(out)
  } else {
    Err(format!("champion not found after update: {}", id))
  }
}

/// List all champions with a lightweight payload (includes optional icon image metadata).
#[tauri::command]
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
      // try to fetch an icon image for this champion
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
