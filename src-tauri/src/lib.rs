mod commands;
mod db;

use commands::database::{
  create_backup, get_db_path, list_backups, prepare_backup_path, record_backup, restart_app,
  restore_db_backup,
};
use db::Db;
use tauri::Manager;

/// Текущее время в том же виде, в каком его писал прежний код на TS.
pub fn now_iso() -> String {
  chrono::Utc::now().to_rfc3339()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      get_db_path,
      create_backup,
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

      let data_dir = app.path().app_data_dir()?;
      std::fs::create_dir_all(&data_dir)?;

      // Новая база — отдельный файл. Старая app.db не изменяется и остаётся
      // запасным вариантом на случай, если с переносом что-то пойдёт не так.
      let database = Db::open(&data_dir.join("warehouse.db"))
        .map_err(|e| std::io::Error::other(e.to_string()))?;

      import_legacy_if_needed(&database, &data_dir);

      app.manage(database);
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

/// Переносит данные из старой базы, если новая пуста.
///
/// Выполняется один раз: повторный импорт отклоняется самим переносом при
/// непустой номенклатуре. Неудача не мешает приложению запуститься — база
/// просто останется пустой, а причина попадёт в журнал.
fn import_legacy_if_needed(database: &Db, data_dir: &std::path::Path) {
  let legacy_path = data_dir.join("app.db");
  if !db::legacy::is_legacy_database(&legacy_path) {
    return;
  }

  let has_items = database
    .with(|conn| {
      conn
        .query_row("SELECT COUNT(*) FROM items", [], |row| row.get::<_, i64>(0))
        .map_err(Into::into)
    })
    .unwrap_or(0);
  if has_items > 0 {
    return;
  }

  match db::legacy::import(database, &legacy_path, &data_dir.join("documents")) {
    Ok(report) => {
      log::info!(
        "Перенос из старой базы: номенклатуры {}, мест хранения {}, остатков {}, \
         операций {}, документов {}, конфигураций {}",
        report.items,
        report.locations,
        report.stock_rows,
        report.operations,
        report.documents,
        report.configurations
      );
      for note in &report.notes {
        log::info!("Перенос: {}", note);
      }
    }
    Err(e) => log::error!("Перенос из старой базы не удался: {}", e),
  }
}
