//! Номенклатура и справочники: позиции, места хранения, категории, теги.

use crate::db::{Db, DbError, DbResult};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

// ---------- Номенклатура ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StockAtLocation {
    pub location_id: i64,
    pub location: String,
    pub quantity: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemView {
    pub id: i64,
    pub name: String,
    pub category: Option<String>,
    pub category_id: Option<i64>,
    pub unit: String,
    pub price: Option<f64>,
    pub min_stock: i64,
    pub barcode: Option<String>,
    pub description: Option<String>,
    pub url: Option<String>,
    pub image_path: Option<String>,
    pub archived_at: Option<String>,
    pub updated_at: String,
    /// Суммарный остаток по всем местам хранения. Поля в базе нет — это сумма.
    pub quantity: i64,
    /// Место с наибольшим остатком: интерфейс местами показывает одно.
    pub location: Option<String>,
    pub locations: Vec<StockAtLocation>,
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemInput {
    #[serde(default)]
    pub id: Option<i64>,
    pub name: String,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub unit: Option<String>,
    #[serde(default)]
    pub price: Option<f64>,
    #[serde(default)]
    pub min_stock: Option<i64>,
    #[serde(default)]
    pub barcode: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub image_path: Option<String>,
}

fn load_items(conn: &rusqlite::Connection, archived: bool) -> DbResult<Vec<ItemView>> {
    let mut stmt = conn.prepare(
        "SELECT i.id, i.name, c.name, i.category_id, i.unit, i.reference_price, i.min_stock,
                i.barcode, i.description, i.url, i.image_path, i.archived_at, i.updated_at
           FROM items i
           LEFT JOIN categories c ON c.id = i.category_id
          WHERE (?1 = 1) = (i.archived_at IS NOT NULL)
          ORDER BY i.name COLLATE NOCASE",
    )?;
    let base = stmt.query_map(params![archived as i64], |row| {
        Ok(ItemView {
            id: row.get(0)?,
            name: row.get(1)?,
            category: row.get(2)?,
            category_id: row.get(3)?,
            unit: row.get(4)?,
            price: row.get(5)?,
            min_stock: row.get(6)?,
            barcode: row.get(7)?,
            description: row.get(8)?,
            url: row.get(9)?,
            image_path: row.get(10)?,
            archived_at: row.get(11)?,
            updated_at: row.get(12)?,
            quantity: 0,
            location: None,
            locations: Vec::new(),
            tags: Vec::new(),
        })
    })?;
    let mut items: Vec<ItemView> = base.collect::<rusqlite::Result<_>>()?;

    // Остатки и теги подтягиваются одним запросом на всё, а не по запросу на
    // позицию: прежний код делал именно так и упирался в это на каждой загрузке.
    let mut stock_stmt = conn.prepare(
        "SELECT s.item_id, s.location_id, l.name, s.quantity
           FROM stock s JOIN locations l ON l.id = s.location_id
          ORDER BY s.quantity DESC",
    )?;
    let mut stock_rows = std::collections::HashMap::<i64, Vec<StockAtLocation>>::new();
    for row in stock_stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            StockAtLocation {
                location_id: row.get(1)?,
                location: row.get(2)?,
                quantity: row.get(3)?,
            },
        ))
    })? {
        let (item_id, entry) = row?;
        stock_rows.entry(item_id).or_default().push(entry);
    }

    let mut tag_stmt = conn.prepare(
        "SELECT it.item_id, t.name FROM item_tags it JOIN tags t ON t.id = it.tag_id",
    )?;
    let mut tag_rows = std::collections::HashMap::<i64, Vec<String>>::new();
    for row in tag_stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
    })? {
        let (item_id, tag) = row?;
        tag_rows.entry(item_id).or_default().push(tag);
    }

    for item in &mut items {
        if let Some(entries) = stock_rows.remove(&item.id) {
            item.quantity = entries.iter().map(|e| e.quantity).sum();
            item.location = entries.first().map(|e| e.location.clone());
            item.locations = entries;
        }
        if let Some(tags) = tag_rows.remove(&item.id) {
            item.tags = tags;
        }
    }
    Ok(items)
}

#[tauri::command]
pub fn list_items(db: State<'_, Db>) -> DbResult<Vec<ItemView>> {
    list_items_on(&db)
}

pub fn list_items_on(db: &Db) -> DbResult<Vec<ItemView>> {
    db.with(|conn| load_items(conn, false))
}

#[tauri::command]
pub fn list_archived_items(db: State<'_, Db>) -> DbResult<Vec<ItemView>> {
    db.with(|conn| load_items(conn, true))
}

#[tauri::command]
pub fn save_item(input: ItemInput, db: State<'_, Db>) -> DbResult<i64> {
    save_item_on(&db, input)
}

pub fn save_item_on(db: &Db, input: ItemInput) -> DbResult<i64> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(DbError("Название изделия обязательно".to_string()));
    }
    if input.min_stock.unwrap_or(0) < 0 {
        return Err(DbError("Минимальный запас не может быть отрицательным".to_string()));
    }
    if input.price.is_some_and(|p| p < 0.0) {
        return Err(DbError("Цена не может быть отрицательной".to_string()));
    }

    db.transaction(|tx| {
        let category_id = match input.category.as_deref().map(str::trim) {
            Some(c) if !c.is_empty() => {
                tx.execute(
                    "INSERT OR IGNORE INTO categories (name, parent_id) VALUES (?1, NULL)",
                    params![c],
                )?;
                tx.query_row(
                    "SELECT id FROM categories WHERE name = ?1 AND parent_id IS NULL",
                    params![c],
                    |row| row.get::<_, i64>(0),
                )
                .optional()?
            }
            _ => None,
        };
        let barcode = input
            .barcode
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty());
        let now = crate::now_iso();

        match input.id {
            Some(id) => {
                // Количество здесь не трогается намеренно: остаток меняется
                // только операциями. Раньше правка карточки писала остаток
                // напрямую и попутно создавала фиктивные записи о списании.
                tx.execute(
                    "UPDATE items SET name = ?1, category_id = ?2, unit = ?3,
                            reference_price = ?4, min_stock = ?5, barcode = ?6,
                            description = ?7, url = ?8, image_path = COALESCE(?9, image_path),
                            updated_at = ?10
                      WHERE id = ?11",
                    params![
                        name,
                        category_id,
                        input.unit.clone().unwrap_or_else(|| "шт".into()),
                        input.price,
                        input.min_stock.unwrap_or(0),
                        barcode,
                        input.description,
                        input.url,
                        input.image_path,
                        now,
                        id
                    ],
                )?;
                Ok(id)
            }
            None => {
                tx.execute(
                    "INSERT INTO items (name, category_id, unit, reference_price, min_stock,
                                        barcode, description, url, image_path, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
                    params![
                        name,
                        category_id,
                        input.unit.clone().unwrap_or_else(|| "шт".into()),
                        input.price,
                        input.min_stock.unwrap_or(0),
                        barcode,
                        input.description,
                        input.url,
                        input.image_path,
                        now
                    ],
                )?;
                Ok(tx.last_insert_rowid())
            }
        }
    })
}

#[tauri::command]
pub fn archive_item(item_id: i64, db: State<'_, Db>) -> DbResult<()> {
    db.with(|conn| {
        conn.execute(
            "UPDATE items SET archived_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![crate::now_iso(), item_id],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn restore_item(item_id: i64, db: State<'_, Db>) -> DbResult<()> {
    db.with(|conn| {
        conn.execute(
            "UPDATE items SET archived_at = NULL, updated_at = ?1 WHERE id = ?2",
            params![crate::now_iso(), item_id],
        )?;
        Ok(())
    })
}

/// Сколько связанных записей исчезнет при безвозвратном удалении.
#[tauri::command]
pub fn item_reference_counts(
    item_id: i64,
    db: State<'_, Db>,
) -> DbResult<std::collections::BTreeMap<String, i64>> {
    db.with(|conn| {
        let mut out = std::collections::BTreeMap::new();
        for (label, sql) in [
            ("stock", "SELECT COUNT(*) FROM stock WHERE item_id = ?1"),
            (
                "operations",
                "SELECT COUNT(*) FROM operation_lines WHERE item_id = ?1",
            ),
            (
                "configurations",
                "SELECT COUNT(*) FROM configuration_items WHERE item_id = ?1",
            ),
            (
                "documents",
                "SELECT COUNT(*) FROM document_items WHERE item_id = ?1",
            ),
            ("tags", "SELECT COUNT(*) FROM item_tags WHERE item_id = ?1"),
        ] {
            let n: i64 = conn.query_row(sql, params![item_id], |row| row.get(0))?;
            if n > 0 {
                out.insert(label.to_string(), n);
            }
        }
        Ok(out)
    })
}

#[tauri::command]
pub fn delete_item(item_id: i64, db: State<'_, Db>) -> DbResult<()> {
    db.transaction(|tx| {
        let used_in: i64 = tx.query_row(
            "SELECT COUNT(*) FROM configurations WHERE result_item_id = ?1",
            params![item_id],
            |row| row.get(0),
        )?;
        if used_in > 0 {
            return Err(DbError(
                "Изделие является результатом конфигурации — сначала удалите её".to_string(),
            ));
        }
        // Порядок важен: строки журнала ссылаются на позицию с ON DELETE RESTRICT.
        tx.execute("DELETE FROM item_tags WHERE item_id = ?1", params![item_id])?;
        tx.execute(
            "DELETE FROM document_items WHERE item_id = ?1",
            params![item_id],
        )?;
        tx.execute(
            "DELETE FROM configuration_items WHERE item_id = ?1",
            params![item_id],
        )?;
        tx.execute(
            "DELETE FROM operation_lines WHERE item_id = ?1",
            params![item_id],
        )?;
        tx.execute("DELETE FROM stock WHERE item_id = ?1", params![item_id])?;
        // Операции, оставшиеся без единой строки, тоже удаляем.
        tx.execute(
            "DELETE FROM operations WHERE id NOT IN (SELECT operation_id FROM operation_lines)",
            [],
        )?;
        tx.execute("DELETE FROM items WHERE id = ?1", params![item_id])?;
        Ok(())
    })
}

// ---------- Места хранения ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationView {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub archived_at: Option<String>,
    pub item_count: i64,
    pub total_quantity: i64,
}

#[tauri::command]
pub fn list_locations(db: State<'_, Db>) -> DbResult<Vec<LocationView>> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT l.id, l.name, l.description, l.archived_at,
                    COUNT(s.item_id), COALESCE(SUM(s.quantity), 0)
               FROM locations l
               LEFT JOIN stock s ON s.location_id = l.id
              GROUP BY l.id
              ORDER BY l.name COLLATE NOCASE",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(LocationView {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                archived_at: row.get(3)?,
                item_count: row.get(4)?,
                total_quantity: row.get(5)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    })
}

#[tauri::command]
pub fn create_location(name: String, db: State<'_, Db>) -> DbResult<i64> {
    create_location_on(&db, name)
}

pub fn create_location_on(db: &Db, name: String) -> DbResult<i64> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(DbError("Название места хранения обязательно".to_string()));
    }
    db.with(|conn| {
        conn.execute("INSERT INTO locations (name) VALUES (?1)", params![name])?;
        Ok(conn.last_insert_rowid())
    })
}

#[tauri::command]
pub fn rename_location(location_id: i64, name: String, db: State<'_, Db>) -> DbResult<()> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(DbError("Название места хранения обязательно".to_string()));
    }
    db.with(|conn| {
        conn.execute(
            "UPDATE locations SET name = ?1 WHERE id = ?2",
            params![name, location_id],
        )?;
        Ok(())
    })
}

/// Объединяет два места хранения.
///
/// Нужно потому, что раньше место было свободной строкой: в базе оказались и
/// «sklad», и «skladв». Отличить опечатку от отдельного склада может только
/// человек, поэтому объединение — ручное действие.
#[tauri::command]
pub fn merge_locations(source_id: i64, target_id: i64, db: State<'_, Db>) -> DbResult<()> {
    merge_locations_on(&db, source_id, target_id)
}

pub fn merge_locations_on(db: &Db, source_id: i64, target_id: i64) -> DbResult<()> {
    if source_id == target_id {
        return Err(DbError("Выбрано одно и то же место хранения".to_string()));
    }
    db.transaction(|tx| {
        // Остатки складываются, а не затирают друг друга.
        tx.execute(
            "INSERT INTO stock (item_id, location_id, quantity, updated_at)
             SELECT item_id, ?2, quantity, ?3 FROM stock WHERE location_id = ?1
             ON CONFLICT(item_id, location_id)
             DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at",
            params![source_id, target_id, crate::now_iso()],
        )?;
        tx.execute("DELETE FROM stock WHERE location_id = ?1", params![source_id])?;

        // Перемещения между объединяемыми местами убираются ДО переписывания
        // истории. После слияния это стало бы перемещением «сам в себя», что
        // запрещено проверкой в схеме — и она сработала бы прямо на UPDATE.
        // На суммы это не влияет: такая строка даёт минус и плюс на одном и том
        // же месте, то есть ноль.
        tx.execute(
            "DELETE FROM operation_lines
              WHERE (from_location_id = ?1 AND to_location_id = ?2)
                 OR (from_location_id = ?2 AND to_location_id = ?1)",
            params![source_id, target_id],
        )?;

        // История переписывается на новое место, иначе журнал осиротеет.
        tx.execute(
            "UPDATE operation_lines SET from_location_id = ?2 WHERE from_location_id = ?1",
            params![source_id, target_id],
        )?;
        tx.execute(
            "UPDATE operation_lines SET to_location_id = ?2 WHERE to_location_id = ?1",
            params![source_id, target_id],
        )?;

        // Операции, оставшиеся вовсе без строк, смысла не несут.
        tx.execute(
            "DELETE FROM operations
              WHERE NOT EXISTS (SELECT 1 FROM operation_lines l WHERE l.operation_id = operations.id)",
            [],
        )?;
        tx.execute("DELETE FROM locations WHERE id = ?1", params![source_id])?;
        Ok(())
    })
}

// ---------- Категории ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CategoryView {
    pub id: i64,
    pub name: String,
    pub parent_id: Option<i64>,
}

#[tauri::command]
pub fn list_categories(db: State<'_, Db>) -> DbResult<Vec<CategoryView>> {
    db.with(|conn| {
        let mut stmt =
            conn.prepare("SELECT id, name, parent_id FROM categories ORDER BY name COLLATE NOCASE")?;
        let rows = stmt.query_map([], |row| {
            Ok(CategoryView {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    })
}

#[tauri::command]
pub fn create_category(name: String, parent_id: Option<i64>, db: State<'_, Db>) -> DbResult<i64> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(DbError("Название категории обязательно".to_string()));
    }
    db.with(|conn| {
        conn.execute(
            "INSERT INTO categories (name, parent_id) VALUES (?1, ?2)",
            params![name, parent_id],
        )?;
        Ok(conn.last_insert_rowid())
    })
}

#[tauri::command]
pub fn update_category(category_id: i64, name: String, db: State<'_, Db>) -> DbResult<()> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(DbError("Название категории обязательно".to_string()));
    }
    db.with(|conn| {
        conn.execute(
            "UPDATE categories SET name = ?1 WHERE id = ?2",
            params![name, category_id],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn delete_category(category_id: i64, db: State<'_, Db>) -> DbResult<()> {
    db.transaction(|tx| {
        // Позиции не теряются: они просто остаются без категории.
        tx.execute(
            "UPDATE items SET category_id = NULL WHERE category_id = ?1",
            params![category_id],
        )?;
        tx.execute(
            "UPDATE categories SET parent_id = NULL WHERE parent_id = ?1",
            params![category_id],
        )?;
        tx.execute("DELETE FROM categories WHERE id = ?1", params![category_id])?;
        Ok(())
    })
}

// ---------- Теги ----------

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagView {
    pub id: i64,
    pub name: String,
}

#[tauri::command]
pub fn list_tags(db: State<'_, Db>) -> DbResult<Vec<TagView>> {
    db.with(|conn| {
        let mut stmt = conn.prepare("SELECT id, name FROM tags ORDER BY name COLLATE NOCASE")?;
        let rows = stmt.query_map([], |row| {
            Ok(TagView {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    })
}

#[tauri::command]
pub fn create_tag(name: String, db: State<'_, Db>) -> DbResult<i64> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(DbError("Название тега обязательно".to_string()));
    }
    db.with(|conn| {
        conn.execute("INSERT INTO tags (name) VALUES (?1)", params![name])?;
        Ok(conn.last_insert_rowid())
    })
}

#[tauri::command]
pub fn update_tag(tag_id: i64, name: String, db: State<'_, Db>) -> DbResult<()> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(DbError("Название тега обязательно".to_string()));
    }
    db.with(|conn| {
        conn.execute(
            "UPDATE tags SET name = ?1 WHERE id = ?2",
            params![name, tag_id],
        )?;
        Ok(())
    })
}

#[tauri::command]
pub fn delete_tag(tag_id: i64, db: State<'_, Db>) -> DbResult<()> {
    db.with(|conn| {
        conn.execute("DELETE FROM tags WHERE id = ?1", params![tag_id])?;
        Ok(())
    })
}

#[tauri::command]
pub fn set_item_tags(item_id: i64, tag_ids: Vec<i64>, db: State<'_, Db>) -> DbResult<()> {
    db.transaction(|tx| {
        tx.execute("DELETE FROM item_tags WHERE item_id = ?1", params![item_id])?;
        for tag_id in tag_ids {
            tx.execute(
                "INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?1, ?2)",
                params![item_id, tag_id],
            )?;
        }
        Ok(())
    })
}

#[tauri::command]
pub fn item_tag_ids(item_id: i64, db: State<'_, Db>) -> DbResult<Vec<i64>> {
    db.with(|conn| {
        let mut stmt = conn.prepare("SELECT tag_id FROM item_tags WHERE item_id = ?1")?;
        let rows = stmt.query_map(params![item_id], |row| row.get::<_, i64>(0))?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    })
}
