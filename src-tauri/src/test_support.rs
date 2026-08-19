//! Общая подготовка для тестов слоя данных.
//!
//! Каждый тест получает свою базу в памяти с уже применёнными миграциями:
//! на диск ничего не пишется, тесты не мешают друг другу и не зависят от
//! порядка запуска.

use crate::commands::catalog::{self, ItemInput};
use crate::commands::operations::{OperationInput, OperationLineInput};
use crate::db::Db;

pub fn db() -> Db {
    Db::open_in_memory().expect("база в памяти должна открываться")
}

pub fn item(db: &Db, name: &str) -> i64 {
    catalog::save_item_on(
        db,
        ItemInput {
            id: None,
            name: name.to_string(),
            category: None,
            unit: None,
            price: Some(100.0),
            min_stock: None,
            barcode: None,
            description: None,
            url: None,
            image_path: None,
        },
    )
    .expect("позиция должна создаваться")
}

pub fn location(db: &Db, name: &str) -> i64 {
    catalog::create_location_on(db, name.to_string()).expect("место хранения должно создаваться")
}

pub fn line(item_id: i64, from: Option<i64>, to: Option<i64>, quantity: i64) -> OperationLineInput {
    OperationLineInput {
        item_id,
        from_location_id: from,
        to_location_id: to,
        quantity,
        unit_price: None,
    }
}

pub fn operation(kind: &str, lines: Vec<OperationLineInput>) -> OperationInput {
    OperationInput {
        kind: kind.to_string(),
        performed_by: Some("Тест".to_string()),
        note: None,
        configuration_id: None,
        lines,
    }
}

/// Приходует товар на склад — обычная стартовая точка для теста.
pub fn receive(db: &Db, item_id: i64, location_id: i64, quantity: i64) {
    crate::commands::operations::register_on(
        db,
        &operation(
            "receipt",
            vec![line(item_id, None, Some(location_id), quantity)],
        ),
    )
    .expect("поступление должно проходить");
}

/// Остаток позиции на конкретном месте хранения.
pub fn stock_at(db: &Db, item_id: i64, location_id: i64) -> i64 {
    db.with(|conn| {
        Ok(conn
            .query_row(
                "SELECT quantity FROM stock WHERE item_id = ?1 AND location_id = ?2",
                rusqlite::params![item_id, location_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0))
    })
    .unwrap()
}

/// Суммарный остаток позиции по всем местам хранения.
pub fn stock_total(db: &Db, item_id: i64) -> i64 {
    db.with(|conn| {
        Ok(conn
            .query_row(
                "SELECT COALESCE(SUM(quantity), 0) FROM stock WHERE item_id = ?1",
                rusqlite::params![item_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0))
    })
    .unwrap()
}

pub fn count(db: &Db, table: &str) -> i64 {
    let sql = format!("SELECT COUNT(*) FROM {}", table);
    db.with(|conn| Ok(conn.query_row(&sql, [], |row| row.get::<_, i64>(0))?))
        .unwrap()
}
