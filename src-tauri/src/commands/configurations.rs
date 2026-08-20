//! Конфигурации: рецепт сборки изделия из других позиций.
//!
//! Результат сборки — обычная позиция номенклатуры, поэтому «сколько собрано»
//! это её остаток на складе, а не отдельная таблица. Прежняя модель хранила
//! счётчик собранных единиц отдельно и «резервировала» компоненты, не списывая
//! их: остаток при этом не менялся, и склад показывал то, чего уже нет.

use super::operations::{self, OperationInput, OperationLineInput};
use crate::db::ids::{ConfigurationId, ItemId, LocationId, Quantity};
use crate::db::{Db, DbError, DbResult};
use rusqlite::{params, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use tauri::State;

/// Строка заголовка конфигурации в том виде, в каком её отдаёт запрос:
/// идентификатор, название, описание, результирующая позиция и её название,
/// дата создания, дата архивирования, количество собранного.
type ConfigurationRow = (
    ConfigurationId,
    String,
    Option<String>,
    ItemId,
    String,
    String,
    Option<String>,
    Quantity,
    Option<String>,
    Option<String>,
);

#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationComponent {
    pub item_id: ItemId,
    pub name: String,
    #[ts(type = "number")]
    pub quantity: i64,
    /// Сколько такого компонента сейчас на складах.
    #[ts(type = "number")]
    pub available: i64,
}

#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationView {
    pub id: ConfigurationId,
    pub name: String,
    pub description: Option<String>,
    pub result_item_id: ItemId,
    pub result_item_name: String,
    pub created_at: String,
    pub archived_at: Option<String>,
    /// Остаток результирующей позиции — он же количество собранных единиц.
    #[ts(type = "number")]
    pub assembled: i64,
    /// Сколько ещё можно собрать из того, что есть на складах.
    #[ts(type = "number")]
    pub can_assemble: i64,
    pub components: Vec<ConfigurationComponent>,
    pub total_value: f64,
    /// Категория результирующего изделия.
    ///
    /// У самой конфигурации категории нет и быть не может: категория — свойство
    /// номенклатуры, а конфигурация это рецепт. Раньше фронтенд подставлял здесь
    /// строку «Конфигурации» для всех сразу, и форма сборки предлагала её же
    /// вместо настоящей.
    pub result_category: Option<String>,
    /// Место с наибольшим остатком результирующего изделия.
    pub result_location: Option<String>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationComponentInput {
    pub item_id: ItemId,
    #[ts(type = "number")]
    pub quantity: i64,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct ConfigurationInput {
    #[serde(default)]
    pub id: Option<ConfigurationId>,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    pub components: Vec<ConfigurationComponentInput>,
}

#[tauri::command]
pub fn list_configurations(db: State<'_, Db>) -> DbResult<Vec<ConfigurationView>> {
    list(&db)
}

pub fn list(db: &Db) -> DbResult<Vec<ConfigurationView>> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT c.id, c.name, c.description, c.result_item_id, ri.name, c.created_at,
                    c.archived_at,
                    COALESCE((SELECT SUM(s.quantity) FROM stock s
                               WHERE s.item_id = c.result_item_id), 0),
                    (SELECT cat.name FROM categories cat WHERE cat.id = ri.category_id),
                    (SELECT l.name FROM stock s JOIN locations l ON l.id = s.location_id
                      WHERE s.item_id = c.result_item_id
                      ORDER BY s.quantity DESC LIMIT 1)
               FROM configurations c
               JOIN items ri ON ri.id = c.result_item_id
              ORDER BY c.name COLLATE NOCASE",
        )?;
        let heads: Vec<ConfigurationRow> =
            stmt.query_map([], |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                    row.get(7)?,
                    row.get(8)?,
                    row.get(9)?,
                ))
            })?
            .collect::<rusqlite::Result<_>>()?;
        drop(stmt);

        // Состав всех конфигураций забирается одним запросом и раскладывается
        // по конфигурациям в памяти. Раньше на каждую конфигурацию готовился и
        // выполнялся отдельный запрос — время росло вместе со списком.
        //
        // Остаток по-прежнему считается подзапросом на строку, а не общей
        // группировкой по всей таблице stock: первичный ключ начинается с
        // item_id, поэтому это точечный поиск по индексу. Группировка всей
        // таблицы обошлась бы дороже самой выборки — на десятке конфигураций
        // она замедляла запрос на порядок, что я и намерил, попробовав.
        let mut comp_stmt = conn.prepare(
            "SELECT ci.configuration_id, ci.item_id, i.name, ci.quantity,
                    COALESCE((SELECT SUM(s.quantity) FROM stock s WHERE s.item_id = ci.item_id), 0),
                    COALESCE(i.reference_price, 0)
               FROM configuration_items ci
               JOIN items i ON i.id = ci.item_id
              ORDER BY i.name COLLATE NOCASE",
        )?;
        let mut by_configuration =
            std::collections::HashMap::<i64, Vec<(ItemId, String, Quantity, Quantity, f64)>>::new();
        for row in comp_stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                (
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                ),
            ))
        })? {
            let (configuration_id, component) = row?;
            by_configuration
                .entry(configuration_id)
                .or_default()
                .push(component);
        }
        drop(comp_stmt);

        let mut out = Vec::new();
        for (id, name, description, result_item_id, result_name, created_at, archived_at, assembled, result_category, result_location) in
            heads
        {
            let rows = by_configuration.remove(&id.get()).unwrap_or_default();

            let mut components = Vec::new();
            let mut total_value = 0.0;
            let mut can_assemble = if rows.is_empty() { 0 } else { i64::MAX };
            for (item_id, item_name, quantity, available, price) in rows {
                let (quantity, available) = (quantity.get(), available.get());
                total_value += price * quantity as f64;
                can_assemble = can_assemble.min(available / quantity.max(1));
                components.push(ConfigurationComponent {
                    item_id,
                    name: item_name,
                    quantity,
                    available,
                });
            }
            if can_assemble == i64::MAX {
                can_assemble = 0;
            }

            out.push(ConfigurationView {
                id,
                name,
                description,
                result_item_id,
                result_item_name: result_name,
                created_at,
                archived_at,
                assembled: assembled.get(),
                can_assemble,
                components,
                total_value,
                result_category,
                result_location,
            });
        }
        Ok(out)
    })
}

#[tauri::command]
pub fn save_configuration(
    input: ConfigurationInput,
    db: State<'_, Db>,
) -> DbResult<ConfigurationId> {
    save(&db, input)
}

pub fn save(db: &Db, input: ConfigurationInput) -> DbResult<ConfigurationId> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err(DbError("Название конфигурации обязательно".to_string()));
    }
    if input.components.is_empty() {
        return Err(DbError(
            "Конфигурация должна содержать хотя бы один компонент".to_string(),
        ));
    }

    db.transaction(|tx| {
        let now = crate::now_iso();
        let configuration_id = match input.id {
            Some(id) => {
                tx.execute(
                    "UPDATE configurations SET name = ?1, description = ?2 WHERE id = ?3",
                    params![name, input.description, id],
                )?;
                // Название результирующей позиции держим в согласии с конфигурацией.
                tx.execute(
                    "UPDATE items SET name = ?1, updated_at = ?2
                      WHERE id = (SELECT result_item_id FROM configurations WHERE id = ?3)",
                    params![name, now, id],
                )?;

                // Категория относится к результирующему изделию. При правке она
                // прежде не применялась вовсе: поле в форме сборки требовалось
                // заполнить, а на данные оно не влияло.
                if let Some(category) = input
                    .category
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                {
                    tx.execute(
                        "INSERT OR IGNORE INTO categories (name, parent_id) VALUES (?1, NULL)",
                        params![category],
                    )?;
                    tx.execute(
                        "UPDATE items SET category_id = (
                             SELECT id FROM categories WHERE name = ?1 AND parent_id IS NULL
                         ), updated_at = ?2
                          WHERE id = (SELECT result_item_id FROM configurations WHERE id = ?3)",
                        params![category, now, id],
                    )?;
                }
                tx.execute(
                    "DELETE FROM configuration_items WHERE configuration_id = ?1",
                    params![id],
                )?;
                id
            }
            None => {
                let category = input
                    .category
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .unwrap_or("Конфигурации");
                tx.execute(
                    "INSERT OR IGNORE INTO categories (name, parent_id) VALUES (?1, NULL)",
                    params![category],
                )?;
                let category_id: Option<i64> = tx
                    .query_row(
                        "SELECT id FROM categories WHERE name = ?1 AND parent_id IS NULL",
                        params![category],
                        |row| row.get(0),
                    )
                    .optional()?;

                tx.execute(
                    "INSERT INTO items (name, category_id, unit, min_stock, description,
                                        created_at, updated_at)
                     VALUES (?1, ?2, 'шт', 0, ?3, ?4, ?4)",
                    params![name, category_id, input.description, now],
                )?;
                let result_item_id = tx.last_insert_rowid();

                tx.execute(
                    "INSERT INTO configurations (name, description, result_item_id, created_at)
                     VALUES (?1, ?2, ?3, ?4)",
                    params![name, input.description, result_item_id, now],
                )?;
                ConfigurationId(tx.last_insert_rowid())
            }
        };

        for component in &input.components {
            if component.quantity <= 0 {
                return Err(DbError(
                    "Количество компонента должно быть больше нуля".to_string(),
                ));
            }
            tx.execute(
                "INSERT INTO configuration_items (configuration_id, item_id, quantity)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(configuration_id, item_id)
                 DO UPDATE SET quantity = excluded.quantity",
                params![configuration_id, component.item_id, component.quantity],
            )?;
        }
        Ok(configuration_id)
    })
}

#[tauri::command]
pub fn delete_configuration(configuration_id: i64, db: State<'_, Db>) -> DbResult<()> {
    db.transaction(|tx| {
        let result_item_id: Option<i64> = tx
            .query_row(
                "SELECT result_item_id FROM configurations WHERE id = ?1",
                params![configuration_id],
                |row| row.get(0),
            )
            .optional()?;

        tx.execute(
            "DELETE FROM configuration_items WHERE configuration_id = ?1",
            params![configuration_id],
        )?;
        tx.execute(
            "DELETE FROM configurations WHERE id = ?1",
            params![configuration_id],
        )?;

        // Результирующую позицию убираем только если она нигде не всплыла:
        // ни на складе, ни в журнале. Иначе это уже часть учёта.
        if let Some(item_id) = result_item_id {
            let used: i64 = tx.query_row(
                "SELECT (SELECT COUNT(*) FROM stock WHERE item_id = ?1)
                      + (SELECT COUNT(*) FROM operation_lines WHERE item_id = ?1)",
                params![item_id],
                |row| row.get(0),
            )?;
            if used == 0 {
                tx.execute("DELETE FROM items WHERE id = ?1", params![item_id])?;
            } else {
                tx.execute(
                    "UPDATE items SET archived_at = ?1 WHERE id = ?2 AND archived_at IS NULL",
                    params![crate::now_iso(), item_id],
                )?;
            }
        }
        Ok(())
    })
}

/// Подбирает, с каких мест хранения взять нужное количество.
///
/// Берём с самых наполненных мест: так реже дробится остаток. Каждая порция
/// становится отдельной строкой журнала, поэтому видно, откуда что ушло.
fn allocate(
    tx: &Transaction,
    item_id: ItemId,
    needed: Quantity,
    preferred: Option<LocationId>,
) -> DbResult<Vec<(LocationId, Quantity)>> {
    let mut stmt = tx.prepare(
        "SELECT location_id, quantity FROM stock
          WHERE item_id = ?1 AND quantity > 0
          ORDER BY (location_id = ?2) DESC, quantity DESC",
    )?;
    let rows: Vec<(LocationId, Quantity)> = stmt
        .query_map(
            params![item_id, preferred.unwrap_or(LocationId(-1))],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?
        .collect::<rusqlite::Result<_>>()?;

    let mut remaining = needed;
    let mut plan = Vec::new();
    for (location_id, available) in rows {
        if !remaining.is_positive() {
            break;
        }
        let take = remaining.min(available);
        plan.push((location_id, take));
        remaining = remaining - take;
    }

    if remaining.is_positive() {
        let name: String = tx
            .query_row(
                "SELECT name FROM items WHERE id = ?1",
                params![item_id],
                |row| row.get(0),
            )
            .optional()?
            .unwrap_or_else(|| format!("#{}", item_id));
        return Err(DbError(format!(
            "Недостаточно «{}»: не хватает {} шт.",
            name, remaining
        )));
    }
    Ok(plan)
}

/// Сборка: компоненты списываются со складов, готовое изделие приходуется.
#[tauri::command]
pub fn assemble_configuration(
    configuration_id: ConfigurationId,
    quantity: Quantity,
    location_id: LocationId,
    db: State<'_, Db>,
) -> DbResult<i64> {
    assemble(&db, configuration_id, quantity, location_id)
}

pub fn assemble(
    db: &Db,
    configuration_id: ConfigurationId,
    quantity: Quantity,
    location_id: LocationId,
) -> DbResult<i64> {
    if !quantity.is_positive() {
        return Err(DbError("Количество должно быть больше нуля".to_string()));
    }
    db.transaction(|tx| {
        let (result_item_id, name): (ItemId, String) = tx.query_row(
            "SELECT result_item_id, name FROM configurations WHERE id = ?1",
            params![configuration_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let mut stmt = tx.prepare(
            "SELECT item_id, quantity FROM configuration_items WHERE configuration_id = ?1",
        )?;
        let recipe: Vec<(ItemId, Quantity)> = stmt
            .query_map(params![configuration_id], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<rusqlite::Result<_>>()?;
        drop(stmt);

        if recipe.is_empty() {
            return Err(DbError(format!(
                "У конфигурации «{}» не задан состав",
                name
            )));
        }

        let mut lines = Vec::new();
        for (item_id, per_unit) in recipe {
            for (from, take) in allocate(tx, item_id, per_unit * quantity.get(), Some(location_id))?
            {
                lines.push(OperationLineInput {
                    item_id,
                    from_location_id: Some(from),
                    to_location_id: None,
                    quantity: take,
                    unit_price: None,
                });
            }
        }
        lines.push(OperationLineInput {
            item_id: result_item_id,
            from_location_id: None,
            to_location_id: Some(location_id),
            quantity,
            unit_price: None,
        });

        operations::register(
            tx,
            &OperationInput {
                kind: "assembly".to_string(),
                performed_by: Some("Пользователь".to_string()),
                note: Some(format!("Сборка «{}»", name)),
                configuration_id: Some(configuration_id),
                lines,
            },
        )
    })
}

/// Разборка: изделие списывается, компоненты возвращаются на склад.
#[tauri::command]
pub fn disassemble_configuration(
    configuration_id: ConfigurationId,
    quantity: Quantity,
    location_id: LocationId,
    db: State<'_, Db>,
) -> DbResult<i64> {
    disassemble(&db, configuration_id, quantity, location_id)
}

pub fn disassemble(
    db: &Db,
    configuration_id: ConfigurationId,
    quantity: Quantity,
    location_id: LocationId,
) -> DbResult<i64> {
    if !quantity.is_positive() {
        return Err(DbError("Количество должно быть больше нуля".to_string()));
    }
    db.transaction(|tx| {
        let (result_item_id, name): (ItemId, String) = tx.query_row(
            "SELECT result_item_id, name FROM configurations WHERE id = ?1",
            params![configuration_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;

        let mut stmt = tx.prepare(
            "SELECT item_id, quantity FROM configuration_items WHERE configuration_id = ?1",
        )?;
        let recipe: Vec<(ItemId, Quantity)> = stmt
            .query_map(params![configuration_id], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })?
            .collect::<rusqlite::Result<_>>()?;
        drop(stmt);

        let mut lines = Vec::new();
        for (from, take) in allocate(tx, result_item_id, quantity, Some(location_id))? {
            lines.push(OperationLineInput {
                item_id: result_item_id,
                from_location_id: Some(from),
                to_location_id: None,
                quantity: take,
                unit_price: None,
            });
        }
        for (item_id, per_unit) in recipe {
            lines.push(OperationLineInput {
                item_id,
                from_location_id: None,
                to_location_id: Some(location_id),
                quantity: per_unit * quantity.get(),
                unit_price: None,
            });
        }

        operations::register(
            tx,
            &OperationInput {
                kind: "disassembly".to_string(),
                performed_by: Some("Пользователь".to_string()),
                note: Some(format!("Разборка «{}»", name)),
                configuration_id: Some(configuration_id),
                lines,
            },
        )
    })
}
