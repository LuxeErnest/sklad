pub mod ids;
pub mod legacy;
pub mod schema;

use rusqlite::Connection;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// Ошибка слоя данных в виде, пригодном для отправки во фронтенд.
///
/// Tauri требует, чтобы тип ошибки команды сериализовался. rusqlite::Error
/// этого не умеет, поэтому всё сводится к сообщению.
#[derive(Debug)]
pub struct DbError(pub String);

impl std::fmt::Display for DbError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for DbError {}

impl From<rusqlite::Error> for DbError {
    fn from(e: rusqlite::Error) -> Self {
        DbError(friendly_message(&e))
    }
}

impl From<std::io::Error> for DbError {
    fn from(e: std::io::Error) -> Self {
        DbError(format!("Ошибка файловой системы: {}", e))
    }
}

impl serde::Serialize for DbError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.0)
    }
}

pub type DbResult<T> = Result<T, DbError>;

/// Переводит типовые ошибки SQLite в понятный пользователю текст.
///
/// Нарушение CHECK по остатку и нарушение внешнего ключа — не технические
/// сбои, а осмысленные отказы: они означают «так делать нельзя». Показывать
/// в этих случаях сырой текст SQLite бесполезно.
fn friendly_message(e: &rusqlite::Error) -> String {
    let raw = e.to_string();
    if raw.contains("CHECK constraint failed") && raw.contains("quantity") {
        return "Недостаточно товара: остаток не может стать отрицательным".to_string();
    }
    if raw.contains("FOREIGN KEY constraint failed") {
        return "Запись связана с другими данными и не может быть изменена".to_string();
    }
    if raw.contains("UNIQUE constraint failed") {
        return format!("Такая запись уже существует ({})", raw);
    }
    raw
}

/// Единственное соединение с базой под мьютексом.
///
/// Здесь же — причина, по которой в TS больше не нужны пул, очередь, мьютекс
/// и ретраи: соединение одно, владеет им Rust, а доступ сериализуется языком.
/// Для однопользовательского настольного приложения этого достаточно, и это
/// на порядок надёжнее самодельной обвязки поверх асинхронного пула.
pub struct Db {
    conn: Mutex<Connection>,
    path: PathBuf,
}

impl Db {
    pub fn open(path: &Path) -> DbResult<Self> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        // journal_mode = WAL применим только к базе в файле: для базы в памяти
        // журнал не нужен и SQLite такую настройку не принимает.
        Self::from_connection(Connection::open(path)?, path.to_path_buf(), true)
    }

    /// База в памяти — для тестов.
    ///
    /// Каждый вызов даёт отдельную чистую базу с применёнными миграциями,
    /// ничего не остаётся на диске и тесты не мешают друг другу.
    #[cfg(test)]
    pub fn open_in_memory() -> DbResult<Self> {
        Self::from_connection(
            Connection::open_in_memory()?,
            PathBuf::from(":memory:"),
            false,
        )
    }

    fn from_connection(conn: Connection, path: PathBuf, wal: bool) -> DbResult<Self> {
        // foreign_keys включаем явно: в SQLite они по умолчанию выключены.
        conn.execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA synchronous = NORMAL;
             PRAGMA busy_timeout = 5000;",
        )?;
        if wal {
            // Настройка хранится в самом файле базы, поэтому достаточно
            // выставить её один раз при открытии.
            conn.execute_batch("PRAGMA journal_mode = WAL;")?;
        }

        let db = Self {
            conn: Mutex::new(conn),
            path,
        };
        db.migrate()?;
        Ok(db)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Выполняет операцию на соединении.
    ///
    /// Отравленный мьютекс (паника в другом потоке) не должен ронять всё
    /// приложение: соединение остаётся пригодным, поэтому блокировка
    /// восстанавливается.
    pub fn with<T>(&self, f: impl FnOnce(&Connection) -> DbResult<T>) -> DbResult<T> {
        let guard = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        f(&guard)
    }

    /// Выполняет операцию в транзакции.
    ///
    /// Откат происходит сам при выходе из области видимости без commit —
    /// забыть про него невозможно. Ровно этого не хватало прежнему
    /// executeTransaction в TS, который транзакцию вообще не открывал.
    pub fn transaction<T>(
        &self,
        f: impl FnOnce(&rusqlite::Transaction) -> DbResult<T>,
    ) -> DbResult<T> {
        let mut guard = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let tx = guard.transaction()?;
        let out = f(&tx)?;
        tx.commit()?;
        Ok(out)
    }

    fn migrate(&self) -> DbResult<()> {
        let mut guard = self.conn.lock().unwrap_or_else(|e| e.into_inner());
        let current: i64 = guard.pragma_query_value(None, "user_version", |row| row.get(0))?;
        let target = schema::MIGRATIONS.len() as i64;

        if current > target {
            return Err(DbError(format!(
                "База создана более новой версией приложения (схема {} против {})",
                current, target
            )));
        }
        if current == target {
            return Ok(());
        }

        for (index, sql) in schema::MIGRATIONS.iter().enumerate() {
            let version = index as i64 + 1;
            if version <= current {
                continue;
            }
            let tx = guard.transaction()?;
            tx.execute_batch(sql)?;
            tx.pragma_update(None, "user_version", version)?;
            tx.commit()?;
            log::info!("Схема БД обновлена до версии {}", version);
        }
        Ok(())
    }
}
