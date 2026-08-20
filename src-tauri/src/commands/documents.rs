//! Документы: файлы лежат на диске, в базе только метаданные.
//!
//! Раньше содержимое хранилось в base64 прямо в таблице и занимало 94% файла
//! базы, а `getDocuments` тянул все файлы разом в память и кэшировал на пять
//! минут. Здесь содержимое отдаётся только по явному запросу конкретного
//! документа.

use crate::db::{Db, DbError, DbResult};
use base64::Engine;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, Runtime, State};

#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DocumentView {
    #[ts(type = "number")]
    pub id: i64,
    pub name: String,
    /// Расширение файла — «pdf», «xlsx». Раньше поле называлось mime и хранило
    /// то же самое, из-за чего файл на диске получал имя «.bin».
    pub extension: Option<String>,
    #[ts(type = "number")]
    pub size_bytes: i64,
    pub category: Option<String>,
    pub description: Option<String>,
    pub uploaded_by: Option<String>,
    pub uploaded_at: String,
    #[ts(type = "number[]")]
    pub item_ids: Vec<i64>,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DocumentInput {
    pub name: String,
    /// Содержимое файла в base64 — так его отдаёт файловый ввод в браузере.
    pub data_base64: String,
    #[serde(default)]
    pub extension: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub uploaded_by: Option<String>,
    #[serde(default)]
    #[ts(type = "number[]")]
    pub item_ids: Vec<i64>,
    #[serde(default)]
    #[ts(type = "number[]")]
    pub tag_ids: Vec<i64>,
}

fn documents_dir<R: Runtime>(app: &AppHandle<R>) -> DbResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| DbError(format!("Не удалось определить каталог данных: {}", e)))?
        .join("documents");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Расширение для файла на диске.
///
/// Берётся то, что пришло от формы, а не угадывается по MIME-типу: угадывание и
/// было причиной, по которой xlsx оказывался на диске как «.bin». Значение
/// проверяется, потому что попадает в имя файла.
fn extension_for(extension: Option<&str>) -> String {
    let ok = |s: &str| !s.is_empty() && s.len() <= 8 && s.chars().all(|c| c.is_ascii_alphanumeric());
    match extension.map(str::trim) {
        Some(e) if ok(e) => format!(".{}", e.to_ascii_lowercase()),
        _ => ".bin".into(),
    }
}


#[tauri::command]
pub fn list_documents(db: State<'_, Db>) -> DbResult<Vec<DocumentView>> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, extension, size_bytes, category, description, uploaded_by, uploaded_at
               FROM documents ORDER BY uploaded_at DESC",
        )?;
        let mut docs: Vec<DocumentView> = stmt
            .query_map([], |row| {
                Ok(DocumentView {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    extension: row.get(2)?,
                    size_bytes: row.get(3)?,
                    category: row.get(4)?,
                    description: row.get(5)?,
                    uploaded_by: row.get(6)?,
                    uploaded_at: row.get(7)?,
                    item_ids: Vec::new(),
                    tags: Vec::new(),
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        drop(stmt);

        let mut link_stmt = conn.prepare("SELECT document_id, item_id FROM document_items")?;
        let mut links = std::collections::HashMap::<i64, Vec<i64>>::new();
        for row in
            link_stmt.query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))?
        {
            let (document_id, item_id) = row?;
            links.entry(document_id).or_default().push(item_id);
        }
        let mut tag_stmt = conn.prepare(
            "SELECT dt.document_id, t.name FROM document_tags dt JOIN tags t ON t.id = dt.tag_id",
        )?;
        let mut tags = std::collections::HashMap::<i64, Vec<String>>::new();
        for row in tag_stmt
            .query_map([], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)))?
        {
            let (document_id, tag) = row?;
            tags.entry(document_id).or_default().push(tag);
        }
        drop(tag_stmt);

        for doc in &mut docs {
            if let Some(ids) = links.remove(&doc.id) {
                doc.item_ids = ids;
            }
            if let Some(names) = tags.remove(&doc.id) {
                doc.tags = names;
            }
        }
        Ok(docs)
    })
}

#[tauri::command]
pub fn add_document<R: Runtime>(
    input: DocumentInput,
    app: AppHandle<R>,
    db: State<'_, Db>,
) -> DbResult<i64> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(DbError("Название документа обязательно".to_string()));
    }
    if input.item_ids.is_empty() {
        return Err(DbError(
            "Выберите хотя бы одно изделие для привязки документа".to_string(),
        ));
    }

    let payload = input
        .data_base64
        .split_once(";base64,")
        .map(|(_, rest)| rest)
        .unwrap_or(&input.data_base64);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.trim())
        .map_err(|_| DbError("Не удалось прочитать содержимое файла".to_string()))?;
    if bytes.is_empty() {
        return Err(DbError("Файл пуст".to_string()));
    }

    let digest = format!("{:x}", Sha256::digest(&bytes));
    let rel_path = format!("{}{}", digest, extension_for(input.extension.as_deref()));
    let target = documents_dir(&app)?.join(&rel_path);
    // Одинаковое содержимое хранится один раз: в исходной базе половина
    // документов оказалась повторной загрузкой того же файла.
    if !target.exists() {
        std::fs::write(&target, &bytes)?;
    }

    db.transaction(|tx| {
        tx.execute(
            "INSERT INTO documents
                (name, rel_path, extension, size_bytes, sha256, category, description,
                 uploaded_by, uploaded_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                name,
                rel_path,
                input.extension,
                bytes.len() as i64,
                digest,
                input.category,
                input.description,
                input.uploaded_by,
                crate::now_iso()
            ],
        )?;
        let document_id = tx.last_insert_rowid();
        for item_id in &input.item_ids {
            tx.execute(
                "INSERT OR IGNORE INTO document_items (document_id, item_id) VALUES (?1, ?2)",
                params![document_id, item_id],
            )?;
        }
        for tag_id in &input.tag_ids {
            tx.execute(
                "INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?1, ?2)",
                params![document_id, tag_id],
            )?;
        }
        Ok(document_id)
    })
}

#[tauri::command]
pub fn set_document_items(document_id: i64, item_ids: Vec<i64>, db: State<'_, Db>) -> DbResult<()> {
    db.transaction(|tx| {
        tx.execute(
            "DELETE FROM document_items WHERE document_id = ?1",
            params![document_id],
        )?;
        for item_id in item_ids {
            tx.execute(
                "INSERT OR IGNORE INTO document_items (document_id, item_id) VALUES (?1, ?2)",
                params![document_id, item_id],
            )?;
        }
        Ok(())
    })
}

#[tauri::command]
pub fn delete_document<R: Runtime>(
    document_id: i64,
    app: AppHandle<R>,
    db: State<'_, Db>,
) -> DbResult<()> {
    let orphaned = db.transaction(|tx| {
        let rel_path: Option<String> = tx
            .query_row(
                "SELECT rel_path FROM documents WHERE id = ?1",
                params![document_id],
                |row| row.get(0),
            )
            .optional()?;
        tx.execute("DELETE FROM documents WHERE id = ?1", params![document_id])?;

        // Файл удаляем только если на него не ссылается ни одна другая запись:
        // одно и то же содержимое может быть заведено под разными названиями.
        Ok(match rel_path {
            Some(path) => {
                let still_used: i64 = tx.query_row(
                    "SELECT COUNT(*) FROM documents WHERE rel_path = ?1",
                    params![path],
                    |row| row.get(0),
                )?;
                if still_used == 0 {
                    Some(path)
                } else {
                    None
                }
            }
            None => None,
        })
    })?;

    if let Some(path) = orphaned {
        let _ = std::fs::remove_file(documents_dir(&app)?.join(path));
    }
    Ok(())
}

/// Содержимое документа для просмотра или сохранения.
#[tauri::command]
pub fn read_document<R: Runtime>(
    document_id: i64,
    app: AppHandle<R>,
    db: State<'_, Db>,
) -> DbResult<String> {
    let rel_path: String = db.with(|conn| {
        conn.query_row(
            "SELECT rel_path FROM documents WHERE id = ?1",
            params![document_id],
            |row| row.get(0),
        )
        .map_err(Into::into)
    })?;
    let path = documents_dir(&app)?.join(&rel_path);
    if !path.exists() {
        return Err(DbError(format!("Файл документа не найден: {}", rel_path)));
    }
    let bytes = std::fs::read(path)?;
    Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
}

/// Документы, привязанные к позиции номенклатуры.
#[tauri::command]
pub fn item_documents(item_id: i64, db: State<'_, Db>) -> DbResult<Vec<DocumentView>> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT d.id, d.name, d.extension, d.size_bytes, d.category, d.description,
                    d.uploaded_by, d.uploaded_at,
                    (SELECT GROUP_CONCAT(t.name, CHAR(31))
                       FROM document_tags dt JOIN tags t ON t.id = dt.tag_id
                      WHERE dt.document_id = d.id)
               FROM documents d
               JOIN document_items di ON di.document_id = d.id
              WHERE di.item_id = ?1
              ORDER BY d.uploaded_at DESC",
        )?;
        let docs = stmt.query_map(params![item_id], |row| {
            Ok(DocumentView {
                id: row.get(0)?,
                name: row.get(1)?,
                extension: row.get(2)?,
                size_bytes: row.get(3)?,
                category: row.get(4)?,
                description: row.get(5)?,
                uploaded_by: row.get(6)?,
                uploaded_at: row.get(7)?,
                item_ids: vec![item_id],
                // Разделитель — управляющий символ: в названии тега его быть
                // не может, в отличие от запятой.
                tags: row
                    .get::<_, Option<String>>(8)?
                    .map(|s| s.split('\u{1f}').map(str::to_string).collect())
                    .unwrap_or_default(),
            })
        })?;
        Ok(docs.collect::<rusqlite::Result<Vec<_>>>()?)
    })
}

// ---------- Изображения изделий ----------

fn images_dir<R: Runtime>(app: &AppHandle<R>) -> DbResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| DbError(format!("Не удалось определить каталог данных: {}", e)))?
        .join("images");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Сохраняет изображение изделия и возвращает путь к файлу.
///
/// Раньше форма читала выбранный файл в base64 и складывала в поле, которое
/// никуда не отправлялось: пользователь видел предпросмотр и сообщение «файл
/// успешно загружен», сохранял карточку — и изображение молча пропадало.
/// Хранится оно так же, как документы: файл на диске, в базе только путь.
/// Складывать пятимегабайтную картинку строкой в таблицу незачем — от этого
/// в проекте уже уходили, когда содержимое документов занимало 94% файла базы.
#[tauri::command]
pub fn save_item_image<R: Runtime>(app: AppHandle<R>, data_base64: String) -> DbResult<String> {
    let payload = data_base64
        .split_once(";base64,")
        .map(|(_, rest)| rest)
        .unwrap_or(&data_base64);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(payload.trim())
        .map_err(|_| DbError("Не удалось прочитать изображение".to_string()))?;
    if bytes.is_empty() {
        return Err(DbError("Файл изображения пуст".to_string()));
    }

    // Тип определяется по самому содержимому, а не по имени: имени здесь нет,
    // а расширение нужно, чтобы окно потом показало картинку.
    let extension = match bytes.as_slice() {
        [0x89, b'P', b'N', b'G', ..] => ".png",
        [0xFF, 0xD8, 0xFF, ..] => ".jpg",
        [b'G', b'I', b'F', ..] => ".gif",
        [b'R', b'I', b'F', b'F', ..] => ".webp",
        _ => return Err(DbError("Поддерживаются PNG, JPEG, GIF и WebP".to_string())),
    };

    let digest = format!("{:x}", Sha256::digest(&bytes));
    let file_name = format!("{}{}", digest, extension);
    let target = images_dir(&app)?.join(&file_name);
    if !target.exists() {
        std::fs::write(&target, &bytes)?;
    }
    Ok(target.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::extension_for;

    /// Расширение берётся как есть — именно его угадывание и ломало файлы.
    ///
    /// Прежняя версия принимала MIME-тип и сопоставляла его с образцами. Форма
    /// присылала расширение, «xlsx» не подходило ни под одно правило, и файл
    /// оказывался на диске с именем «.bin» — открыть его было нечем.
    #[test]
    fn расширение_берётся_из_переданного() {
        assert_eq!(extension_for(Some("xlsx")), ".xlsx");
        assert_eq!(extension_for(Some("docx")), ".docx");
        assert_eq!(extension_for(Some("PDF")), ".pdf", "регистр приводится к нижнему");
        assert_eq!(extension_for(Some("  png  ")), ".png", "пробелы обрезаются");
    }

    /// Значение попадает в имя файла, поэтому мусор не пропускается.
    #[test]
    fn негодное_расширение_даёт_bin() {
        assert_eq!(extension_for(None), ".bin");
        assert_eq!(extension_for(Some("")), ".bin");
        assert_eq!(extension_for(Some("../secret")), ".bin", "путь не расширение");
        assert_eq!(extension_for(Some("сертификат")), ".bin", "только латиница и цифры");
        assert_eq!(extension_for(Some("verylongextension")), ".bin");
    }
}
