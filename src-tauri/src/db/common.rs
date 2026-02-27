use std::path::PathBuf;

pub fn default_db_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
  let base = dirs_next::data_dir().ok_or("unable to locate user data dir")?;
  let dir = base.join("2xKOKombo");
  std::fs::create_dir_all(&dir)?;
  Ok(dir.join("app.db"))
}

pub fn migrations_dir() -> PathBuf {
  let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  manifest.join("migrations")
}
