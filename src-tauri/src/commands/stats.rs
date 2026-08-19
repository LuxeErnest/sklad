//! Сводка по складу и проверка целостности.

use crate::db::{Db, DbResult};
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct WarehouseStatistics {
    #[ts(type = "number")]
    pub total_items: i64,
    #[ts(type = "number")]
    pub total_units: i64,
    pub total_value: f64,
    #[ts(type = "number")]
    pub low_stock_items: i64,
    #[ts(type = "number")]
    pub out_of_stock_items: i64,
    #[ts(type = "number")]
    pub total_locations: i64,
    #[ts(type = "number")]
    pub total_configurations: i64,
    #[ts(type = "number")]
    pub assembled_units: i64,
    #[ts(type = "number")]
    pub operations_total: i64,
}

#[tauri::command]
pub fn warehouse_statistics(db: State<'_, Db>) -> DbResult<WarehouseStatistics> {
    warehouse_statistics_on(&db)
}

pub fn warehouse_statistics_on(db: &Db) -> DbResult<WarehouseStatistics> {
    db.with(|conn| {
        // Остаток берётся из stock, а не из поля у позиции: поля больше нет.
        let row = conn.query_row(
            "SELECT
               (SELECT COUNT(*) FROM items WHERE archived_at IS NULL),
               (SELECT COALESCE(SUM(s.quantity), 0)
                  FROM stock s JOIN items i ON i.id = s.item_id
                 WHERE i.archived_at IS NULL),
               (SELECT COALESCE(SUM(s.quantity * COALESCE(i.reference_price, 0)), 0)
                  FROM stock s JOIN items i ON i.id = s.item_id
                 WHERE i.archived_at IS NULL),
               (SELECT COUNT(*) FROM items i
                 WHERE i.archived_at IS NULL AND i.min_stock > 0
                   AND COALESCE((SELECT SUM(quantity) FROM stock WHERE item_id = i.id), 0)
                       <= i.min_stock),
               (SELECT COUNT(*) FROM items i
                 WHERE i.archived_at IS NULL
                   AND COALESCE((SELECT SUM(quantity) FROM stock WHERE item_id = i.id), 0) = 0),
               (SELECT COUNT(*) FROM locations WHERE archived_at IS NULL),
               (SELECT COUNT(*) FROM configurations WHERE archived_at IS NULL),
               (SELECT COALESCE(SUM(s.quantity), 0)
                  FROM stock s
                 WHERE s.item_id IN (SELECT result_item_id FROM configurations)),
               (SELECT COUNT(*) FROM operations)",
            [],
            |row| {
                Ok(WarehouseStatistics {
                    total_items: row.get(0)?,
                    total_units: row.get(1)?,
                    total_value: row.get(2)?,
                    low_stock_items: row.get(3)?,
                    out_of_stock_items: row.get(4)?,
                    total_locations: row.get(5)?,
                    total_configurations: row.get(6)?,
                    assembled_units: row.get(7)?,
                    operations_total: row.get(8)?,
                })
            },
        )?;
        Ok(row)
    })
}

#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct StockDrift {
    #[ts(type = "number")]
    pub item_id: i64,
    pub item_name: String,
    #[ts(type = "number")]
    pub location_id: i64,
    pub location: String,
    #[ts(type = "number")]
    pub stock_quantity: i64,
    #[ts(type = "number")]
    pub journal_quantity: i64,
}

#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct IntegrityReport {
    /// Расхождения между таблицей остатков и суммой по журналу.
    pub stock_drift: Vec<StockDrift>,
    #[ts(type = "number")]
    pub negative_stock: i64,
    #[ts(type = "number")]
    pub foreign_key_violations: i64,
    #[ts(type = "number")]
    pub orphan_operations: i64,
    pub checked_at: String,
}

/// Сверяет остатки с журналом операций.
///
/// Таблица `stock` — это свёртка журнала, поддерживаемая в той же транзакции,
/// что и сама операция. Поэтому расхождение означает либо ошибку в коде, либо
/// правку базы в обход приложения. В прежней схеме сверять было не с чем:
/// журнал и остатки заполнялись независимо и расходились штатно.
#[tauri::command]
pub fn check_integrity(db: State<'_, Db>) -> DbResult<IntegrityReport> {
    check_integrity_on(&db)
}

pub fn check_integrity_on(db: &Db) -> DbResult<IntegrityReport> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "WITH journal AS (
                 SELECT item_id, location_id, SUM(delta) AS quantity FROM (
                     SELECT item_id, to_location_id   AS location_id,  quantity AS delta
                       FROM operation_lines WHERE to_location_id IS NOT NULL
                     UNION ALL
                     SELECT item_id, from_location_id AS location_id, -quantity AS delta
                       FROM operation_lines WHERE from_location_id IS NOT NULL
                 ) GROUP BY item_id, location_id
             ),
             keys AS (
                 SELECT item_id, location_id FROM stock
                 UNION
                 SELECT item_id, location_id FROM journal
             )
             SELECT k.item_id, i.name, k.location_id, l.name,
                    COALESCE(s.quantity, 0), COALESCE(j.quantity, 0)
               FROM keys k
               LEFT JOIN stock   s ON s.item_id = k.item_id AND s.location_id = k.location_id
               LEFT JOIN journal j ON j.item_id = k.item_id AND j.location_id = k.location_id
               JOIN items i     ON i.id = k.item_id
               JOIN locations l ON l.id = k.location_id
              WHERE COALESCE(s.quantity, 0) != COALESCE(j.quantity, 0)
              ORDER BY i.name",
        )?;
        let stock_drift: Vec<StockDrift> = stmt
            .query_map([], |row| {
                Ok(StockDrift {
                    item_id: row.get(0)?,
                    item_name: row.get(1)?,
                    location_id: row.get(2)?,
                    location: row.get(3)?,
                    stock_quantity: row.get(4)?,
                    journal_quantity: row.get(5)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        drop(stmt);

        let negative_stock: i64 =
            conn.query_row("SELECT COUNT(*) FROM stock WHERE quantity < 0", [], |r| {
                r.get(0)
            })?;
        let orphan_operations: i64 = conn.query_row(
            "SELECT COUNT(*) FROM operations o
              WHERE NOT EXISTS (SELECT 1 FROM operation_lines l WHERE l.operation_id = o.id)",
            [],
            |r| r.get(0),
        )?;
        let mut fk_stmt = conn.prepare("PRAGMA foreign_key_check")?;
        let foreign_key_violations = fk_stmt.query_map([], |_| Ok(()))?.count() as i64;

        Ok(IntegrityReport {
            stock_drift,
            negative_stock,
            foreign_key_violations,
            orphan_operations,
            checked_at: crate::now_iso(),
        })
    })
}

/// Приводит остатки в соответствие с журналом.
///
/// Направление исправления выбрано осознанно: журнал — первичен, потому что
/// каждая его строка объясняет, почему количество изменилось. Молча подгонять
/// журнал под остатки значило бы придумывать события, которых не было.
#[tauri::command]
pub fn repair_integrity(db: State<'_, Db>) -> DbResult<usize> {
    db.transaction(|tx| {
        tx.execute(
            "DELETE FROM operations
              WHERE NOT EXISTS (SELECT 1 FROM operation_lines l WHERE l.operation_id = operations.id)",
            [],
        )?;

        let changed = tx.execute(
            "WITH journal AS (
                 SELECT item_id, location_id, SUM(delta) AS quantity FROM (
                     SELECT item_id, to_location_id   AS location_id,  quantity AS delta
                       FROM operation_lines WHERE to_location_id IS NOT NULL
                     UNION ALL
                     SELECT item_id, from_location_id AS location_id, -quantity AS delta
                       FROM operation_lines WHERE from_location_id IS NOT NULL
                 ) GROUP BY item_id, location_id
             )
             INSERT INTO stock (item_id, location_id, quantity, updated_at)
             SELECT item_id, location_id, quantity, ?1 FROM journal WHERE quantity > 0
             ON CONFLICT(item_id, location_id)
             DO UPDATE SET quantity = excluded.quantity, updated_at = excluded.updated_at",
            rusqlite::params![crate::now_iso()],
        )?;

        // Строки, которых в журнале нет вовсе, обнулять нельзя вслепую:
        // они могли появиться при переносе из старой базы, где журнала не было.
        Ok(changed)
    })
}
