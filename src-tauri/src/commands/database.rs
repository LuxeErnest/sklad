use crate::db::{Db, DbError, DbResult};
use chrono::Utc;
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime, State};

#[derive(Debug, Serialize)]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub created_at: String,
}

/// Каталог данных приложения.
///
/// Путь берётся у Tauri, а не собирается вручную: раньше здесь был
/// `dirs::data_dir().join("sklad")` — каталог, которого не существует, из-за
/// чего резервное копирование не работало ни разу.
fn app_dir<R: Runtime>(app: &AppHandle<R>) -> DbResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| DbError(format!("Не удалось определить каталог данных: {}", e)))?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn backups_dir<R: Runtime>(app: &AppHandle<R>) -> DbResult<PathBuf> {
    let dir = app_dir(app)?.join("backups");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[tauri::command]
pub fn get_db_path(db: State<'_, Db>) -> String {
    db.path().to_string_lossy().to_string()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInfo {
    pub path: String,
    pub size_bytes: u64,
    /// Размер журнала WAL. Данные, ещё не перенесённые в основной файл,
    /// лежат здесь, поэтому без него размер базы выглядит меньше реального.
    pub wal_bytes: u64,
    pub documents_bytes: u64,
    pub backups_count: usize,
}

/// Сведения о хранилище для раздела настроек.
#[tauri::command]
pub fn database_info<R: Runtime>(app: AppHandle<R>, db: State<'_, Db>) -> DbResult<DatabaseInfo> {
    let path = db.path().to_path_buf();
    let size_of = |p: PathBuf| fs::metadata(p).map(|m| m.len()).unwrap_or(0);

    let documents_bytes = fs::read_dir(app_dir(&app)?.join("documents"))
        .map(|entries| {
            entries
                .flatten()
                .filter_map(|e| e.metadata().ok())
                .filter(|m| m.is_file())
                .map(|m| m.len())
                .sum()
        })
        .unwrap_or(0);

    let backups_count = fs::read_dir(backups_dir(&app)?)
        .map(|entries| entries.flatten().filter(|e| e.path().is_file()).count())
        .unwrap_or(0);

    Ok(DatabaseInfo {
        size_bytes: size_of(path.clone()),
        wal_bytes: size_of(PathBuf::from(format!("{}-wal", path.to_string_lossy()))),
        documents_bytes,
        backups_count,
        path: path.to_string_lossy().to_string(),
    })
}

fn timestamped_backup_path<R: Runtime>(app: &AppHandle<R>) -> DbResult<PathBuf> {
    let name = format!("sklad_backup_{}.db", Utc::now().format("%Y%m%d_%H%M%S"));
    let path = backups_dir(app)?.join(name);
    if path.exists() {
        return Err(DbError(
            "Резервная копия с такой меткой времени уже существует".to_string(),
        ));
    }
    Ok(path)
}

/// Оставлено для совместимости с интерфейсом: возвращает путь будущей копии.
#[tauri::command]
pub fn prepare_backup_path<R: Runtime>(app: AppHandle<R>) -> DbResult<String> {
    Ok(timestamped_backup_path(&app)?.to_string_lossy().to_string())
}

/// Создаёт резервную копию через `VACUUM INTO`.
///
/// Копировать файл базы средствами файловой системы нельзя: в режиме WAL часть
/// данных находится в `warehouse.db-wal`, и копия одного файла окажется
/// неполной. `VACUUM INTO` делает согласованный снимок силами самой SQLite.
#[tauri::command]
pub fn create_backup<R: Runtime>(app: AppHandle<R>, db: State<'_, Db>) -> DbResult<String> {
    let target = timestamped_backup_path(&app)?;
    let target_str = target.to_string_lossy().to_string();
    db.with(|conn| {
        conn.execute("VACUUM INTO ?1", [&target_str])?;
        Ok(())
    })?;
    Ok(target_str)
}

/// Оставлено для совместимости: сам факт создания копии фиксируется её файлом.
#[tauri::command]
pub fn record_backup(path: String) -> DbResult<()> {
    if !PathBuf::from(&path).exists() {
        return Err(DbError(format!("Резервная копия не создана: {}", path)));
    }
    Ok(())
}

#[tauri::command]
pub fn list_backups<R: Runtime>(app: AppHandle<R>) -> DbResult<Vec<BackupInfo>> {
    let dir = backups_dir(&app)?;
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir)?.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        let created_at = meta
            .modified()
            .ok()
            .map(|t| chrono::DateTime::<Utc>::from(t).to_rfc3339())
            .unwrap_or_default();
        out.push(BackupInfo {
            name: entry.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            size_bytes: meta.len(),
            created_at,
        });
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

/// Восстанавливает базу из резервной копии.
///
/// Побочные файлы WAL удаляются: иначе SQLite при следующем открытии накатит
/// журнал поверх восстановленного файла и вернёт данные, от которых мы уходим.
/// Соединение при этом остаётся открытым, поэтому после восстановления
/// обязателен перезапуск — его выполняет вызывающая сторона.
#[tauri::command]
pub fn restore_db_backup<R: Runtime>(
    backup_path: String,
    app: AppHandle<R>,
    db: State<'_, Db>,
) -> DbResult<()> {
    let source = PathBuf::from(&backup_path);
    if !source.exists() {
        return Err(DbError(format!(
            "Файл резервной копии не найден: {}",
            backup_path
        )));
    }

    let target = db.path().to_path_buf();

    // Перед перезаписью сохраняем текущее состояние: если копия окажется
    // испорченной, будет к чему вернуться.
    if target.exists() {
        let safety = backups_dir(&app)?.join(format!(
            "before_restore_{}.db",
            Utc::now().format("%Y%m%d_%H%M%S")
        ));
        db.with(|conn| {
            conn.execute("VACUUM INTO ?1", [&safety.to_string_lossy().to_string()])?;
            Ok(())
        })?;
    }

    fs::copy(&source, &target)?;
    for suffix in ["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{}", target.to_string_lossy(), suffix));
        if side.exists() {
            let _ = fs::remove_file(side);
        }
    }
    Ok(())
}

#[tauri::command]
pub fn restart_app<R: Runtime>(app: AppHandle<R>) {
    app.restart();
}
