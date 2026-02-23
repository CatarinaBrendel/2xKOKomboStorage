use std::path::PathBuf;

use rusqlite::Connection;

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
