use std::fs;

use base64::{engine::general_purpose, Engine as _};
use rusqlite::{Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::common::default_db_path;

pub fn get_image_data(filename: String) -> Result<String, String> {
  let base = dirs_next::data_dir().ok_or("unable to locate user data dir")?;
  let images_dir = base.join("2xKOKombo").join("images");
  let path = images_dir.join(&filename);
  if !path.exists() {
    return Err(format!("image not found: {}", filename));
  }

  let bytes = fs::read(&path).map_err(|e| format!("failed to read image file: {}", e))?;

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

pub fn save_champion_image(
  champion_id: String,
  image_type: String,
  bytes: Vec<u8>,
  filename_hint: Option<String>,
) -> Result<String, String> {
  let mut hasher = Sha256::new();
  hasher.update(&bytes);
  let checksum = hex::encode(hasher.finalize());

  let base = dirs_next::data_dir().ok_or("unable to locate user data dir")?;
  let images_dir = base.join("2xKOKombo").join("images");
  fs::create_dir_all(&images_dir).map_err(|e| format!("failed to create images dir: {}", e))?;

  let db_path = default_db_path().map_err(|e| format!("db path error: {}", e))?;
  let conn = Connection::open(&db_path).map_err(|e| format!("db open error: {}", e))?;

  let mut stmt = conn
    .prepare("SELECT path FROM champion_images WHERE checksum = ?1 LIMIT 1")
    .map_err(|e| format!("db prepare error: {}", e))?;
  let existing: Option<String> = stmt
    .query_row(rusqlite::params![checksum], |r| r.get(0))
    .optional()
    .map_err(|e| format!("db query error: {}", e))?;

  let stored_filename = if let Some(path) = existing {
    path
  } else {
    let ext = filename_hint
      .and_then(|h| {
        std::path::Path::new(&h)
          .extension()
          .and_then(|e| e.to_str().map(|s| s.to_string()))
      })
      .unwrap_or_else(|| "png".to_string());

    let id = Uuid::new_v4().to_string();
    let filename = format!("{}.{}", id, ext);
    let fullpath = images_dir.join(&filename);

    fs::write(&fullpath, &bytes).map_err(|e| format!("failed to write image file: {}", e))?;

    filename
  };

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
