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
