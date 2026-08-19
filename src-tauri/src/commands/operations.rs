//! Журнал операций — единственный способ изменить остаток.
//!
//! Ни одна другая часть приложения не трогает таблицу `stock` напрямую.
//! Благодаря этому у любого изменения количества есть объяснение в журнале,
//! чего в прежней схеме не было: остатки правились из десятка мест, а история
//! велась отдельно и с ними не сходилась.

use crate::db::ids::{ConfigurationId, ItemId, LocationId, OperationId, Quantity};
use crate::db::{Db, DbError, DbResult};
use rusqlite::{params, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct OperationLineInput {
    pub item_id: ItemId,
    #[serde(default)]
    pub from_location_id: Option<LocationId>,
    #[serde(default)]
    pub to_location_id: Option<LocationId>,
    pub quantity: Quantity,
    #[serde(default)]
    pub unit_price: Option<f64>,
}

#[derive(Debug, Deserialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct OperationInput {
    pub kind: String,
    #[serde(default)]
    pub performed_by: Option<String>,
    #[serde(default)]
    pub note: Option<String>,
    #[serde(default)]
    pub configuration_id: Option<ConfigurationId>,
    pub lines: Vec<OperationLineInput>,
}

#[derive(Debug, Serialize, ts_rs::TS)]
#[ts(export, export_to = "../../src/lib/generated/")]
#[serde(rename_all = "camelCase")]
pub struct OperationLineView {
    #[ts(type = "number")]
    pub id: i64,
    pub operation_id: OperationId,
    pub kind: String,
    pub performed_at: String,
    pub performed_by: Option<String>,
    pub note: Option<String>,
    pub item_id: ItemId,
    pub item_name: String,
    pub from_location_id: Option<LocationId>,
    pub from_location: Option<String>,
    pub to_location_id: Option<LocationId>,
    pub to_location: Option<String>,
    pub quantity: Quantity,
    pub unit_price: Option<f64>,
}

const VALID_KINDS: &[&str] = &[
    "receipt",
    "transfer",
    "writeoff",
    "assembly",
    "disassembly",
    "correction",
];

/// Записывает операцию и применяет её к остаткам в одной транзакции.
///
/// Вызывается и напрямую из команды, и из сборки конфигураций.
pub fn register(tx: &Transaction, input: &OperationInput) -> DbResult<i64> {
    if !VALID_KINDS.contains(&input.kind.as_str()) {
        return Err(DbError(format!("Неизвестный тип операции: {}", input.kind)));
    }
    if input.lines.is_empty() {
        return Err(DbError("Операция без строк не имеет смысла".to_string()));
    }

    let performed_at = crate::now_iso();
    tx.execute(
        "INSERT INTO operations (kind, performed_at, performed_by, note, configuration_id)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            input.kind,
            performed_at,
            input.performed_by,
            input.note,
            input.configuration_id
        ],
    )?;
    let operation_id = tx.last_insert_rowid();

    for line in &input.lines {
        if !line.quantity.is_positive() {
            return Err(DbError(
                "Количество в строке операции должно быть больше нуля".to_string(),
            ));
        }
        if line.from_location_id.is_none() && line.to_location_id.is_none() {
            return Err(DbError(
                "В строке операции не указано ни откуда, ни куда".to_string(),
            ));
        }

        tx.execute(
            "INSERT INTO operation_lines
                (operation_id, item_id, from_location_id, to_location_id, quantity, unit_price)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                operation_id,
                line.item_id,
                line.from_location_id,
                line.to_location_id,
                line.quantity,
                line.unit_price
            ],
        )?;

        if let Some(from) = line.from_location_id {
            take_from(tx, line.item_id, from, line.quantity)?;
        }
        if let Some(to) = line.to_location_id {
            put_to(tx, line.item_id, to, line.quantity)?;
        }
    }

    Ok(operation_id)
}

/// Снимает количество с места хранения.
///
/// Проверка выполняется до изменения, чтобы сообщение было осмысленным.
/// `CHECK (quantity >= 0)` в схеме остаётся страховкой на случай, если сюда
/// когда-нибудь придут в обход этой функции.
fn take_from(
    tx: &Transaction,
    item_id: ItemId,
    location_id: LocationId,
    quantity: Quantity,
) -> DbResult<()> {
    let available: Quantity = tx
        .query_row(
            "SELECT quantity FROM stock WHERE item_id = ?1 AND location_id = ?2",
            params![item_id, location_id],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(Quantity::ZERO);

    if available < quantity {
        let item_name = name_of(tx, "items", item_id.get())?;
        let location_name = name_of(tx, "locations", location_id.get())?;
        return Err(DbError(format!(
            "Недостаточно «{}» на складе «{}»: есть {}, требуется {}",
            item_name, location_name, available, quantity
        )));
    }

    tx.execute(
        "UPDATE stock SET quantity = quantity - ?1, updated_at = ?2
          WHERE item_id = ?3 AND location_id = ?4",
        params![quantity, crate::now_iso(), item_id, location_id],
    )?;
    // Нулевые строки не храним: место, где ничего нет, — это отсутствие записи.
    tx.execute(
        "DELETE FROM stock WHERE item_id = ?1 AND location_id = ?2 AND quantity = 0",
        params![item_id, location_id],
    )?;
    Ok(())
}

fn put_to(
    tx: &Transaction,
    item_id: ItemId,
    location_id: LocationId,
    quantity: Quantity,
) -> DbResult<()> {
    tx.execute(
        "INSERT INTO stock (item_id, location_id, quantity, updated_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(item_id, location_id)
         DO UPDATE SET quantity = quantity + excluded.quantity, updated_at = excluded.updated_at",
        params![item_id, location_id, quantity, crate::now_iso()],
    )?;
    Ok(())
}

/// Название записи для сообщения об ошибке.
///
/// Принимает уже готовое число: сюда приходят идентификаторы разных видов, и
/// смысл различать их здесь пропадает — запись только читается по имени.
fn name_of(tx: &Transaction, table: &str, id: i64) -> DbResult<String> {
    let sql = format!("SELECT name FROM {} WHERE id = ?1", table);
    Ok(tx
        .query_row(&sql, params![id], |row| row.get::<_, String>(0))
        .optional()?
        .unwrap_or_else(|| format!("#{}", id)))
}

// ---------- Команды ----------

#[tauri::command]
pub fn register_operation(input: OperationInput, db: State<'_, Db>) -> DbResult<i64> {
    register_on(&db, &input)
}

pub fn register_on(db: &Db, input: &OperationInput) -> DbResult<i64> {
    db.transaction(|tx| register(tx, input))
}

/// Порядок журнала — от новых записей к старым.
///
/// Сортировка идёт по времени, а не по идентификатору операции: идентификаторы
/// выдаются при вставке, а записи, перенесённые из старой базы, несут своё
/// прежнее время и получили новые номера не в хронологическом порядке. Я успел
/// на этом ошибиться: сортировка по номеру быстрее, но на перенесённой истории
/// переставляла записи местами.
///
/// Скорость обеспечивается не порядком, а тем, как ограничивается выборка, —
/// см. `list_operations_on`.
const JOURNAL_ORDER: &str = " ORDER BY o.performed_at DESC, ol.id DESC";

const LINE_QUERY: &str = "
    SELECT ol.id, ol.operation_id, o.kind, o.performed_at, o.performed_by, o.note,
           ol.item_id, i.name,
           ol.from_location_id, lf.name,
           ol.to_location_id,   lt.name,
           ol.quantity, ol.unit_price
      FROM operation_lines ol
      JOIN operations o ON o.id = ol.operation_id
      JOIN items i      ON i.id = ol.item_id
      LEFT JOIN locations lf ON lf.id = ol.from_location_id
      LEFT JOIN locations lt ON lt.id = ol.to_location_id
";

fn map_line(row: &rusqlite::Row) -> rusqlite::Result<OperationLineView> {
    Ok(OperationLineView {
        id: row.get(0)?,
        operation_id: row.get(1)?,
        kind: row.get(2)?,
        performed_at: row.get(3)?,
        performed_by: row.get(4)?,
        note: row.get(5)?,
        item_id: row.get(6)?,
        item_name: row.get(7)?,
        from_location_id: row.get(8)?,
        from_location: row.get(9)?,
        to_location_id: row.get(10)?,
        to_location: row.get(11)?,
        quantity: row.get(12)?,
        unit_price: row.get(13)?,
    })
}

/// История по одной позиции номенклатуры.
#[tauri::command]
pub fn item_history(item_id: i64, db: State<'_, Db>) -> DbResult<Vec<OperationLineView>> {
    item_history_on(&db, item_id)
}

pub fn item_history_on(db: &Db, item_id: i64) -> DbResult<Vec<OperationLineView>> {
    db.with(|conn| {
        let sql = format!(
            "{} WHERE ol.item_id = ?1{}",
            LINE_QUERY, JOURNAL_ORDER
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![item_id], map_line)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    })
}

/// Маршрутный лист склада: всё, что приходило к нему и уходило от него.
///
/// Ровно то, ради чего журнал перенесён с изделий на склады: складу не нужно
/// знать про маршрут каждой отдельной штуки, ему нужно знать, что происходило
/// у него.
#[tauri::command]
pub fn location_journal(
    location_id: i64,
    limit: Option<i64>,
    db: State<'_, Db>,
) -> DbResult<Vec<OperationLineView>> {
    location_journal_on(&db, location_id, limit)
}

pub fn location_journal_on(
    db: &Db,
    location_id: i64,
    limit: Option<i64>,
) -> DbResult<Vec<OperationLineView>> {
    db.with(|conn| {
        let sql = format!(
            "{} WHERE ol.from_location_id = ?1 OR ol.to_location_id = ?1{} LIMIT ?2",
            LINE_QUERY, JOURNAL_ORDER
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![location_id, limit.unwrap_or(500)], map_line)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    })
}

/// Общий журнал, при необходимости отфильтрованный по типу операции.
#[tauri::command]
pub fn list_operations(
    kind: Option<String>,
    limit: Option<i64>,
    db: State<'_, Db>,
) -> DbResult<Vec<OperationLineView>> {
    list_operations_on(&db, kind, limit)
}

pub fn list_operations_on(
    db: &Db,
    kind: Option<String>,
    limit: Option<i64>,
) -> DbResult<Vec<OperationLineView>> {
    db.with(|conn| {
        // Сначала выбираются сами операции — их немного и они уже лежат в
        // нужном порядке в индексе, поэтому LIMIT останавливает перебор сразу.
        // Прямая сортировка соединения заставляла SQLite прочитать все строки
        // журнала и построить временное дерево ради последних пятисот: на ста
        // двадцати тысячах операций это триста миллисекунд на каждый показ.
        let sql = format!(
            "{} WHERE ol.operation_id IN (
                    SELECT id FROM operations
                     WHERE (?1 IS NULL OR kind = ?1)
                     ORDER BY performed_at DESC, id DESC
                     LIMIT ?2
                 ){}",
            LINE_QUERY, JOURNAL_ORDER
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = stmt.query_map(params![kind, limit.unwrap_or(500)], map_line)?;
        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    })
}
