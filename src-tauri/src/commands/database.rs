use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime};

#[derive(Debug, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub version: i32,
    pub last_backup: Option<String>,
}

impl Default for DatabaseConfig {
    fn default() -> Self {
        Self {
            version: 0,
            last_backup: None,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub created_at: String,
}

/// Каталог данных приложения.
///
/// Важно: путь берётся у самого Tauri, а не собирается вручную. Именно сюда
/// `tauri-plugin-sql` кладёт `app.db` (каталог определяется идентификатором
/// приложения из tauri.conf.json). Раньше здесь использовался
/// `dirs::data_dir().join("sklad")` — каталог, которого не существует, из-за
/// чего бэкап всегда падал на проверке наличия файла базы.
fn app_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Не удалось определить каталог данных приложения: {}", e))?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Не удалось создать каталог данных приложения: {}", e))?;
    Ok(dir)
}

fn db_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("app.db"))
}

fn config_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app_dir(app)?.join("db_config.json"))
}

fn backups_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let dir = app_dir(app)?.join("backups");
    fs::create_dir_all(&dir).map_err(|e| format!("Не удалось создать каталог бэкапов: {}", e))?;
    Ok(dir)
}

fn load_config<R: Runtime>(app: &AppHandle<R>) -> Result<DatabaseConfig, String> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(DatabaseConfig::default());
    }
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Не удалось прочитать конфигурацию БД: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Не удалось разобрать конфигурацию БД: {}", e))
}

fn save_config<R: Runtime>(app: &AppHandle<R>, config: &DatabaseConfig) -> Result<(), String> {
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Не удалось сериализовать конфигурацию БД: {}", e))?;
    fs::write(config_path(app)?, content)
        .map_err(|e| format!("Не удалось записать конфигурацию БД: {}", e))
}

#[tauri::command]
pub async fn get_db_version<R: Runtime>(app: AppHandle<R>) -> Result<i32, String> {
    Ok(load_config(&app)?.version)
}

#[tauri::command]
pub async fn set_db_version<R: Runtime>(version: i32, app: AppHandle<R>) -> Result<(), String> {
    let mut config = load_config(&app).unwrap_or_default();
    config.version = version;
    save_config(&app, &config)
}

/// Готовит место под резервную копию и возвращает путь к будущему файлу.
///
/// Сам снимок делает фронтенд запросом `VACUUM INTO`. Копировать файл базы
/// средствами файловой системы нельзя: в режиме WAL часть данных лежит в
/// `app.db-wal`, и копия одного `app.db` окажется неполной. `VACUUM INTO`
/// создаёт согласованный снимок штатными средствами SQLite.
#[tauri::command]
pub async fn prepare_backup_path<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    let db = db_path(&app)?;
    if !db.exists() {
        return Err(format!("Файл базы данных не найден: {}", db.display()));
    }
    let name = format!("sklad_backup_{}.db", Utc::now().format("%Y%m%d_%H%M%S"));
    let path = backups_dir(&app)?.join(name);
    if path.exists() {
        // VACUUM INTO отказывается писать в существующий файл.
        return Err("Резервная копия с такой меткой времени уже существует".to_string());
    }
    Ok(path.to_string_lossy().to_string())
}

/// Отмечает успешно созданную копию в конфигурации.
#[tauri::command]
pub async fn record_backup<R: Runtime>(path: String, app: AppHandle<R>) -> Result<(), String> {
    if !PathBuf::from(&path).exists() {
        return Err(format!("Резервная копия не создана: {}", path));
    }
    let mut config = load_config(&app).unwrap_or_default();
    config.last_backup = Some(path);
    save_config(&app, &config)
}

#[tauri::command]
pub async fn list_backups<R: Runtime>(app: AppHandle<R>) -> Result<Vec<BackupInfo>, String> {
    let dir = backups_dir(&app)?;
    let mut out = Vec::new();
    let entries =
        fs::read_dir(&dir).map_err(|e| format!("Не удалось прочитать каталог бэкапов: {}", e))?;
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
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
/// Соединение должно быть закрыто вызывающей стороной до вызова. Побочные файлы
/// WAL удаляются: иначе SQLite при следующем открытии накатит журнал поверх
/// восстановленного файла и вернёт данные, от которых мы уходим.
#[tauri::command]
pub async fn restore_db_backup<R: Runtime>(
    backup_path: String,
    app: AppHandle<R>,
) -> Result<(), String> {
    let source = PathBuf::from(&backup_path);
    if !source.exists() {
        return Err(format!("Файл резервной копии не найден: {}", backup_path));
    }

    let db = db_path(&app)?;

    // Перед перезаписью сохраняем текущее состояние — если копия окажется
    // испорченной, будет к чему вернуться.
    if db.exists() {
        let safety = backups_dir(&app)?.join(format!(
            "before_restore_{}.db",
            Utc::now().format("%Y%m%d_%H%M%S")
        ));
        fs::copy(&db, &safety)
            .map_err(|e| format!("Не удалось сохранить текущую базу перед восстановлением: {}", e))?;
    }

    fs::copy(&source, &db).map_err(|e| format!("Не удалось восстановить базу: {}", e))?;

    for suffix in ["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{}", db.to_string_lossy(), suffix));
        if side.exists() {
            let _ = fs::remove_file(side);
        }
    }

    Ok(())
}

/// Перезапускает приложение — используется после восстановления базы.
#[tauri::command]
pub async fn restart_app<R: Runtime>(app: AppHandle<R>) {
    app.restart();
}

/// Путь к файлу базы — для отображения в настройках.
#[tauri::command]
pub async fn get_db_path<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    Ok(db_path(&app)?.to_string_lossy().to_string())
}
