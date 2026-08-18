mod commands;
mod db;

#[cfg(test)]
mod test_support;
#[cfg(test)]
mod tests;

use commands::{catalog, configurations, database, documents, operations, stats};
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
      // Обслуживание базы
      database::get_db_path,
      database::database_info,
      database::create_backup,
      database::prepare_backup_path,
      database::record_backup,
      database::list_backups,
      database::restore_db_backup,
      database::restart_app,
      // Номенклатура
      catalog::list_items,
      catalog::list_archived_items,
      catalog::save_item,
      catalog::archive_item,
      catalog::restore_item,
      catalog::delete_item,
      catalog::item_reference_counts,
      // Места хранения
      catalog::list_locations,
      catalog::create_location,
      catalog::rename_location,
      catalog::merge_locations,
      // Категории и теги
      catalog::list_categories,
      catalog::create_category,
      catalog::update_category,
      catalog::delete_category,
      catalog::list_tags,
      catalog::create_tag,
      catalog::update_tag,
      catalog::delete_tag,
      catalog::set_item_tags,
      catalog::item_tag_ids,
      // Журнал операций
      operations::register_operation,
      operations::item_history,
      operations::location_journal,
      operations::list_operations,
      // Конфигурации
      configurations::list_configurations,
      configurations::save_configuration,
      configurations::delete_configuration,
      configurations::assemble_configuration,
      configurations::disassemble_configuration,
      // Документы
      documents::list_documents,
      documents::add_document,
      documents::set_document_items,
      documents::delete_document,
      documents::read_document,
      documents::item_documents,
      // Сводка и целостность
      stats::warehouse_statistics,
      stats::check_integrity,
      stats::repair_integrity
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
