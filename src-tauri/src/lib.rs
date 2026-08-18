mod commands;

use commands::database::{
  get_db_path, get_db_version, list_backups, prepare_backup_path, record_backup, restart_app,
  restore_db_backup, set_db_version,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().build())
    .invoke_handler(tauri::generate_handler![
      get_db_version,
      set_db_version,
      get_db_path,
      prepare_backup_path,
      record_backup,
      list_backups,
      restore_db_backup,
      restart_app
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
