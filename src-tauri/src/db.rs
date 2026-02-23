use std::path::PathBuf;
use std::fs;

use rusqlite::{Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use hex;

const MIGRATION_SQL: &str = include_str!("../migrations/0001_create_schema.sql");

fn default_db_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
  let base = dirs_next::data_dir().ok_or("unable to locate user data dir")?;
  let dir = base.join("2xKOKombo");
  std::fs::create_dir_all(&dir)?;
  Ok(dir.join("app.db"))
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
    conn.execute_batch(&sql)?;
    conn.execute(
      "INSERT INTO schema_migrations(version) VALUES (?1)",
      rusqlite::params![version],
    )?;
    applied += 1;
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
