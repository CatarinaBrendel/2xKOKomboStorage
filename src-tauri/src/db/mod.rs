pub mod common;
mod migrations;
mod images;
mod combos;
mod champions;
mod notes;
mod tournaments;

pub fn run_migrations() -> Result<usize, Box<dyn std::error::Error>> {
  migrations::run_migrations()
}

#[tauri::command]
pub fn init_db(path: Option<String>) -> Result<String, String> {
  migrations::init_db(path)
}

#[tauri::command]
pub fn run_migrations_cmd() -> Result<String, String> {
  migrations::run_migrations_cmd()
}

#[tauri::command]
pub fn get_logs_dir() -> Result<String, String> {
  migrations::get_logs_dir()
}

#[tauri::command]
pub fn get_image_data(filename: String) -> Result<String, String> {
  images::get_image_data(filename)
}

#[tauri::command]
pub fn save_champion_image(
  champion_id: String,
  image_type: String,
  bytes: Vec<u8>,
  filename_hint: Option<String>,
) -> Result<String, String> {
  images::save_champion_image(champion_id, image_type, bytes, filename_hint)
}

#[tauri::command]
pub fn set_combos(champion_id: String, combos_json: String) -> Result<String, String> {
  combos::set_combos(champion_id, combos_json)
}

#[tauri::command]
pub fn list_top_combo_tags() -> Result<serde_json::Value, String> {
  combos::list_top_combo_tags()
}

#[tauri::command]
pub fn set_champion_notes(champion_id: String, notes_json: String) -> Result<String, String> {
  notes::set_champion_notes(champion_id, notes_json)
}

#[tauri::command]
pub fn list_tags() -> Result<serde_json::Value, String> {
  notes::list_tags()
}

#[tauri::command]
pub fn create_or_get_tag(name: String) -> Result<serde_json::Value, String> {
  notes::create_or_get_tag(name)
}

#[tauri::command]
pub fn rename_champion_note(note_id: String, title: String) -> Result<String, String> {
  notes::rename_champion_note(note_id, title)
}

#[tauri::command]
pub fn duplicate_champion_note(note_id: String) -> Result<serde_json::Value, String> {
  notes::duplicate_champion_note(note_id)
}

#[tauri::command]
pub fn delete_champion_note(note_id: String) -> Result<String, String> {
  notes::delete_champion_note(note_id)
}

#[tauri::command]
pub fn create_tournament(tournament_json: String) -> Result<serde_json::Value, String> {
  tournaments::create_tournament(tournament_json)
}

#[tauri::command]
pub fn list_tournaments() -> Result<serde_json::Value, String> {
  tournaments::list_tournaments()
}

#[tauri::command]
pub fn update_tournament(tournament_id: String, tournament_json: String) -> Result<serde_json::Value, String> {
  tournaments::update_tournament(tournament_id, tournament_json)
}

#[tauri::command]
pub fn delete_tournament(tournament_id: String) -> Result<String, String> {
  tournaments::delete_tournament(tournament_id)
}

#[tauri::command]
pub fn add_tournament_match(tournament_id: String, match_json: String) -> Result<serde_json::Value, String> {
  tournaments::add_tournament_match(tournament_id, match_json)
}

#[tauri::command]
pub fn update_tournament_match(match_id: String, match_json: String) -> Result<serde_json::Value, String> {
  tournaments::update_tournament_match(match_id, match_json)
}

#[tauri::command]
pub fn delete_tournament_match(match_id: String) -> Result<String, String> {
  tournaments::delete_tournament_match(match_id)
}

#[tauri::command]
pub fn list_tournament_matches(tournament_id: String) -> Result<serde_json::Value, String> {
  tournaments::list_tournament_matches(tournament_id)
}

#[tauri::command]
pub fn list_training_matches() -> Result<serde_json::Value, String> {
  tournaments::list_training_matches()
}

#[tauri::command]
pub fn get_tournament_match(match_id: String) -> Result<serde_json::Value, String> {
  tournaments::get_tournament_match(match_id)
}

#[tauri::command]
pub fn add_champion(
  name: String,
  code: String,
  slug: String,
  ctype: Option<String>,
  strategy: Option<String>,
  metadata: Option<String>,
) -> Result<String, String> {
  champions::add_champion(name, code, slug, ctype, strategy, metadata)
}

#[tauri::command]
pub fn get_champion_by_code(code: String) -> Result<serde_json::Value, String> {
  champions::get_champion_by_code(code)
}

#[tauri::command]
pub fn update_champion(
  id: String,
  name: String,
  code: String,
  slug: String,
  ctype: Option<String>,
  strategy: Option<String>,
  metadata: Option<String>,
) -> Result<serde_json::Value, String> {
  champions::update_champion(id, name, code, slug, ctype, strategy, metadata)
}

#[tauri::command]
pub fn delete_champion(id: String) -> Result<String, String> {
  champions::delete_champion(id)
}

#[tauri::command]
pub fn delete_champion_by_code(code: String) -> Result<String, String> {
  champions::delete_champion_by_code(code)
}

#[tauri::command]
pub fn list_champions() -> Result<serde_json::Value, String> {
  champions::list_champions()
}

#[tauri::command]
pub fn backup_db() -> Result<String, String> {
  use std::time::{SystemTime, UNIX_EPOCH};

  let src = common::default_db_path().map_err(|e| format!("{}", e))?;
  if !src.exists() {
    return Err("database file not found".to_string());
  }

  let base = dirs_next::document_dir().or_else(|| dirs_next::data_dir()).ok_or("unable to locate documents or data dir")?;
  let backups = base.join("2xKOKombo Backups");
  std::fs::create_dir_all(&backups).map_err(|e| format!("{}", e))?;

  let ts = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| format!("{}", e))?.as_secs();
  let dest = backups.join(format!("backup-{}.db", ts));

  std::fs::copy(&src, &dest).map_err(|e| format!("{}", e))?;
  
  Ok(dest.to_string_lossy().into_owned())
}

// Note: folder picking is handled in the frontend via `@tauri-apps/api/dialog`.

#[tauri::command]
pub fn backup_db_to(dest: Option<String>) -> Result<String, String> {
  use std::time::{SystemTime, UNIX_EPOCH};

  let src = common::default_db_path().map_err(|e| format!("{}", e))?;
  if !src.exists() {
    return Err("database file not found".to_string());
  }

  // Determine destination file path. If the user provided a destination, prefer
  // treating it as a directory (create it if necessary). If that fails, treat
  // the provided value as a file path.
  let dest_file = if let Some(d) = dest {
    let mut provided = std::path::PathBuf::from(d);
    // Resolve relative paths by prefixing the user's home directory when possible
    if !provided.is_absolute() {
      if let Some(home) = dirs_next::home_dir() {
        provided = home.join(&provided);
        eprintln!("backup_db_to: resolved relative dest to '{}'", provided.display());
      } else {
        eprintln!("backup_db_to: provided relative dest='{}' and home_dir unavailable", provided.display());
      }
    } else {
      eprintln!("backup_db_to: provided dest='{}'", provided.display());
    }
    // If it already exists and is a dir, create a timestamped file inside it.
    if provided.exists() && provided.is_dir() {
      let ts = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| format!("{}", e))?.as_secs();
      provided.join(format!("backup-{}.db", ts))
    } else {
      // Try to create the provided path as a directory (maybe it doesn't exist yet).
      match std::fs::create_dir_all(&provided) {
        Ok(_) => {
          let ts = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| format!("{}", e))?.as_secs();
          provided.join(format!("backup-{}.db", ts))
        }
        Err(_) => {
          // Treat as file path: ensure parent exists and use as-is.
          if let Some(parent) = provided.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("{}", e))?;
          }
          provided
        }
      }
    }
  } else {
    let base = dirs_next::document_dir().or_else(|| dirs_next::data_dir()).ok_or("unable to locate documents or data dir")?;
    let backups = base.join("2xKOKombo Backups");
    std::fs::create_dir_all(&backups).map_err(|e| format!("{}", e))?;
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| format!("{}", e))?.as_secs();
    backups.join(format!("backup-{}.db", ts))
  };

  if let Some(parent) = dest_file.parent() {
    // Validate ancestor components: if any existing component is a file, return a clear error.
    let mut anc = parent.to_path_buf();
    // collect ancestors from root up to parent
    let mut stack = Vec::new();
    loop {
      stack.push(anc.clone());
      if let Some(p) = anc.parent() { anc = p.to_path_buf(); } else { break }
    }
    // check from root downwards so earlier problems surface first
    for p in stack.iter().rev() {
      if p.exists() && !p.is_dir() {
        return Err(format!("path component is not a directory: {}", p.display()));
      }
    }
    std::fs::create_dir_all(parent).map_err(|e| format!("failed to create parent dir {}: {}", parent.display(), e))?;
  }

  std::fs::copy(&src, &dest_file).map_err(|e| format!("failed to copy {} -> {}: {}", src.display(), dest_file.display(), e))?;

  // Ensure backup file mtime/atime reflect creation time (some platforms may
  // preserve the source file's timestamps on copy).
  let now_ft = filetime::FileTime::from_system_time(SystemTime::now());
  let _ = filetime::set_file_times(&dest_file, now_ft, now_ft);

  Ok(dest_file.to_string_lossy().into_owned())
}
