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
    pub mime: Option<String>,
    #[ts(type = "number")]
    pub size_bytes: i64,
    pub category: Option<String>,
    pub description: Option<String>,
    pub uploaded_by: Option<String>,
    pub uploaded_at: String,
    #[ts(type = "number[]")]
    pub item_ids: Vec<i64>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DocumentInput {
    pub name: String,
    /// Содержимое файла в base64 — так его отдаёт файловый ввод в браузере.
    pub data_base64: String,
    #[serde(default)]
    pub mime: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub uploaded_by: Option<String>,
    #[serde(default)]
    #[ts(type = "number[]")]
    pub item_ids: Vec<i64>,
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

fn extension_for(name: &str, mime: Option<&str>) -> String {
    let ok =
        |s: &str| !s.is_empty() && s.len() <= 8 && s.chars().all(|c| c.is_ascii_alphanumeric());
    if let Some((_, ext)) = name.rsplit_once('.') {
        if ok(ext) {
            return format!(".{}", ext.to_ascii_lowercase());
        }
    }
    match mime {
        Some(m) if m.contains("pdf") => ".pdf".into(),
        Some(m) if m.contains("png") => ".png".into(),
        Some(m) if m.contains("jpeg") => ".jpg".into(),
        Some(m) if m.contains("sheet") => ".xlsx".into(),
        Some(m) if m.contains("wordprocessing") => ".docx".into(),
        _ => ".bin".into(),
    }
}

#[tauri::command]
pub fn list_documents(db: State<'_, Db>) -> DbResult<Vec<DocumentView>> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT id, name, mime, size_bytes, category, description, uploaded_by, uploaded_at
               FROM documents ORDER BY uploaded_at DESC",
        )?;
        let mut docs: Vec<DocumentView> = stmt
            .query_map([], |row| {
                Ok(DocumentView {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    mime: row.get(2)?,
                    size_bytes: row.get(3)?,
                    category: row.get(4)?,
                    description: row.get(5)?,
                    uploaded_by: row.get(6)?,
                    uploaded_at: row.get(7)?,
                    item_ids: Vec::new(),
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
        for doc in &mut docs {
            if let Some(ids) = links.remove(&doc.id) {
                doc.item_ids = ids;
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
    let rel_path = format!("{}{}", digest, extension_for(&name, input.mime.as_deref()));
    let target = documents_dir(&app)?.join(&rel_path);
    // Одинаковое содержимое хранится один раз: в исходной базе половина
    // документов оказалась повторной загрузкой того же файла.
    if !target.exists() {
        std::fs::write(&target, &bytes)?;
    }

    db.transaction(|tx| {
        tx.execute(
            "INSERT INTO documents
                (name, rel_path, mime, size_bytes, sha256, category, description,
                 uploaded_by, uploaded_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                name,
                rel_path,
                input.mime,
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
            "SELECT d.id, d.name, d.mime, d.size_bytes, d.category, d.description,
                    d.uploaded_by, d.uploaded_at
               FROM documents d
               JOIN document_items di ON di.document_id = d.id
              WHERE di.item_id = ?1
              ORDER BY d.uploaded_at DESC",
        )?;
        let docs = stmt.query_map(params![item_id], |row| {
            Ok(DocumentView {
                id: row.get(0)?,
                name: row.get(1)?,
                mime: row.get(2)?,
                size_bytes: row.get(3)?,
                category: row.get(4)?,
                description: row.get(5)?,
                uploaded_by: row.get(6)?,
                uploaded_at: row.get(7)?,
                item_ids: vec![item_id],
            })
        })?;
        Ok(docs.collect::<rusqlite::Result<Vec<_>>>()?)
    })
}
