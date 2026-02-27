use rusqlite::Connection;

use super::common::{default_db_path, migrations_dir};

const MIGRATION_SQL: &str = include_str!("../../migrations/0001_create_schema.sql");

pub fn run_migrations_at(path: Option<String>) -> Result<(), Box<dyn std::error::Error>> {
  let db_path = match path {
    Some(p) => std::path::PathBuf::from(p),
    None => default_db_path()?,
  };

  let conn = Connection::open(db_path)?;
  conn.execute_batch(MIGRATION_SQL)?;
  Ok(())
}

pub fn run_migrations() -> Result<usize, Box<dyn std::error::Error>> {
  let db_path = default_db_path()?;
  let conn = Connection::open(&db_path)?;

  conn.execute_batch(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP);",
  )?;

  {
    let mut pragma_stmt = conn.prepare("PRAGMA table_info('combos')")?;
    let pragma_iter = pragma_stmt.query_map([], |r| Ok(r.get::<_, String>(1)?))?;
    let mut existing_cols: Vec<String> = Vec::new();
    for col_res in pragma_iter {
      if let Ok(col) = col_res {
        existing_cols.push(col)
      }
    }

    if !existing_cols.iter().any(|c| c == "tags") {
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
        continue;
      }
    }
  }

  Ok(applied)
}

pub fn init_db(path: Option<String>) -> Result<String, String> {
  run_migrations_at(path)
    .map(|_| "ok".to_string())
    .map_err(|e| format!("migration error: {}", e))
}

pub fn run_migrations_cmd() -> Result<String, String> {
  match run_migrations() {
    Ok(n) => Ok(format!("applied {} migrations", n)),
    Err(e) => Err(format!("migration runner error: {}", e)),
  }
}

pub fn get_logs_dir() -> Result<String, String> {
  match default_db_path() {
    Ok(mut p) => {
      p.pop();
      p.push("logs");
      let _ = std::fs::create_dir_all(&p);
      p.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "unable to determine logs dir".to_string())
    }
    Err(e) => Err(format!("unable to compute logs dir: {}", e)),
  }
}
