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
    /// Сколько единиц списано за всё время.
    ///
    /// Раньше это число фронтенд подставлял нулём: в сводке из Rust его не
    /// было, а на экране статистики оно показывалось как «Списано компонентов».
    /// При семи списаниях в журнале там стоял ноль.
    #[ts(type = "number")]
    pub scrapped_units: i64,
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
               (SELECT COUNT(*) FROM operations),
               (SELECT COALESCE(SUM(ol.quantity), 0)
                  FROM operation_lines ol JOIN operations o ON o.id = ol.operation_id
                 WHERE o.kind = 'writeoff')",
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
                    scrapped_units: row.get(9)?,
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

// ---------- Отчёты для экрана статистики ----------

/// Движение за период, сгруппированное по виду операции.
#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct MovementByKind {
    pub kind: String,
    /// Сколько операций такого вида.
    #[ts(type = "number")]
    pub operations: i64,
    /// Сколько единиц прошло через них.
    #[ts(type = "number")]
    pub units: i64,
}

/// Сколько поступило, списано и перемещено начиная с указанного момента.
///
/// Считается по журналу, а не по остаткам: остаток отвечает на «сколько есть
/// сейчас», а этот отчёт — на «что происходило», и второе из первого не
/// выводится. Экран статистики раньше не показывал этого вовсе.
#[tauri::command]
pub fn movement_summary(since: String, db: State<'_, Db>) -> DbResult<Vec<MovementByKind>> {
    movement_summary_on(&db, &since)
}

pub fn movement_summary_on(db: &Db, since: &str) -> DbResult<Vec<MovementByKind>> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT o.kind, COUNT(DISTINCT o.id), COALESCE(SUM(ol.quantity), 0)
               FROM operations o
               JOIN operation_lines ol ON ol.operation_id = o.id
              WHERE o.performed_at >= ?1
              GROUP BY o.kind
              ORDER BY 3 DESC",
        )?;
        let rows = stmt.query_map(rusqlite::params![since], |row| {
            Ok(MovementByKind {
                kind: row.get(0)?,
                operations: row.get(1)?,
                units: row.get(2)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    })
}

/// Сколько единиц и на какую сумму лежит на каждом складе.
#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct LocationValue {
    #[ts(type = "number")]
    pub location_id: i64,
    pub location: String,
    #[ts(type = "number")]
    pub items: i64,
    #[ts(type = "number")]
    pub units: i64,
    pub value: f64,
}

/// Где лежат деньги.
///
/// Общая стоимость склада одним числом скрывает главное: она может почти целиком
/// приходиться на одну позицию на одном складе, и по экрану этого было не видно.
#[tauri::command]
pub fn value_by_location(db: State<'_, Db>) -> DbResult<Vec<LocationValue>> {
    value_by_location_on(&db)
}

pub fn value_by_location_on(db: &Db) -> DbResult<Vec<LocationValue>> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "SELECT l.id, l.name, COUNT(*), COALESCE(SUM(s.quantity), 0),
                    COALESCE(SUM(s.quantity * COALESCE(i.reference_price, 0)), 0)
               FROM stock s
               JOIN locations l ON l.id = s.location_id
               JOIN items i     ON i.id = s.item_id
              WHERE i.archived_at IS NULL AND s.quantity > 0
              GROUP BY l.id, l.name
              ORDER BY 5 DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(LocationValue {
                location_id: row.get(0)?,
                location: row.get(1)?,
                items: row.get(2)?,
                units: row.get(3)?,
                value: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    })
}

/// Позиция, по которой давно не было движений.
#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct DeadStockItem {
    #[ts(type = "number")]
    pub item_id: i64,
    pub name: String,
    #[ts(type = "number")]
    pub quantity: i64,
    pub value: f64,
    /// Когда последний раз двигалось. Пусто — не двигалось ни разу.
    pub last_movement_at: Option<String>,
}

/// Что лежит без движения с указанного момента.
///
/// Берутся только позиции с непустым остатком: пустая ничего не занимает и
/// мёртвым запасом не является. Позиции без единой записи в журнале попадают
/// сюда тоже — они лежат неизвестно с каких пор.
#[tauri::command]
pub fn dead_stock(before: String, db: State<'_, Db>) -> DbResult<Vec<DeadStockItem>> {
    dead_stock_on(&db, &before)
}

pub fn dead_stock_on(db: &Db, before: &str) -> DbResult<Vec<DeadStockItem>> {
    db.with(|conn| {
        let mut stmt = conn.prepare(
            "WITH totals AS (
                 SELECT item_id, SUM(quantity) AS quantity
                   FROM stock GROUP BY item_id
             ),
             last_move AS (
                 SELECT ol.item_id, MAX(o.performed_at) AS at
                   FROM operation_lines ol
                   JOIN operations o ON o.id = ol.operation_id
                  GROUP BY ol.item_id
             )
             SELECT i.id, i.name, t.quantity,
                    t.quantity * COALESCE(i.reference_price, 0), m.at
               FROM items i
               JOIN totals t    ON t.item_id = i.id
               LEFT JOIN last_move m ON m.item_id = i.id
              WHERE i.archived_at IS NULL
                AND t.quantity > 0
                AND (m.at IS NULL OR m.at < ?1)
              ORDER BY 4 DESC, i.name COLLATE NOCASE",
        )?;
        let rows = stmt.query_map(rusqlite::params![before], |row| {
            Ok(DeadStockItem {
                item_id: row.get(0)?,
                name: row.get(1)?,
                quantity: row.get(2)?,
                value: row.get(3)?,
                last_movement_at: row.get(4)?,
            })
        })?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    })
}
