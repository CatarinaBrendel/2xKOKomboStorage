mod db;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // initialize a robust file logger before the app starts
  if let Some(base) = dirs_next::data_dir() {
    let logs_dir = base.join("2xKOKombo").join("logs");
    let _ = std::fs::create_dir_all(&logs_dir);
    let _ = flexi_logger::Logger::try_with_str("info").and_then(|l| {
      l.log_to_file(flexi_logger::FileSpec::default().directory(logs_dir))
        .duplicate_to_stderr(flexi_logger::Duplicate::Info)
        .rotate(
          flexi_logger::Criterion::Size(20_000_000),
          flexi_logger::Naming::Numbers,
          flexi_logger::Cleanup::KeepLogFiles(10),
        )
        .start()
    });
  }

  tauri::Builder::default()
    .setup(|app| {
      // attempt to run any pending migrations on startup (non-fatal)
      match db::run_migrations() {
        Ok(n) => log::info!("applied {} migrations on startup", n),
        Err(e) => log::error!("migration runner error on startup: {}", e),
      }

      // create a simple tray icon and handle clicks to open the logs folder
      let _ = tauri::tray::TrayIconBuilder::new()
        .on_tray_icon_event(|_tray, ev| match ev {
          tauri::tray::TrayIconEvent::Click { .. } => {
            if let Ok(path) = db::get_logs_dir() {
              let _ = open::that(path);
            }
          }
          _ => {}
        })
        .build(app.handle());

      Ok(())
    })
    .invoke_handler(tauri::generate_handler![db::init_db, db::run_migrations_cmd, db::get_logs_dir, db::save_champion_image])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");

  }
