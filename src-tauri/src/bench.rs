//! Замеры на объёме, а не на трёх записях.
//!
//! Запускается вручную: `cargo test --release bench -- --ignored --nocapture`.
//! Смысл не в точных числах, а в том, как время растёт с числом записей:
//! линейно — терпимо, квадратично — узкое место.

use crate::commands::{catalog, configurations, operations, stats};
use crate::db::ids::{ItemId, LocationId};
use crate::db::Db;
use crate::test_support::*;
use std::time::Instant;

fn ms(f: impl FnOnce()) -> f64 {
    let t = Instant::now();
    f();
    t.elapsed().as_secs_f64() * 1000.0
}

/// Наполняет базу так, как её наполнила бы реальная работа склада.
fn seed(db: &Db, items_n: usize, locations_n: usize, ops_n: usize, configs_n: usize) {
    let locs: Vec<LocationId> = (0..locations_n)
        .map(|i| location(db, &format!("Склад {}", i)))
        .collect();

    let items: Vec<ItemId> = db
        .transaction(|tx| {
            let now = crate::now_iso();
            let mut ids = Vec::with_capacity(items_n);
            for i in 0..items_n {
                tx.execute(
                    "INSERT INTO items (name, unit, min_stock, reference_price, created_at, updated_at)
                     VALUES (?1, 'шт', 5, ?2, ?3, ?3)",
                    rusqlite::params![format!("Позиция {:06}", i), (i % 500) as f64, now],
                )?;
                ids.push(ItemId(tx.last_insert_rowid()));
            }
            Ok(ids)
        })
        .expect("наполнение номенклатуры");

    // Приход: каждая позиция ложится на два места хранения.
    db.transaction(|tx| {
        for (n, item) in items.iter().enumerate() {
            let a = locs[n % locations_n];
            let b = locs[(n + 1) % locations_n];
            operations::register(
                tx,
                &operation(
                    "receipt",
                    vec![
                        line(*item, None, Some(a), 500),
                        line(*item, None, Some(b), 500),
                    ],
                ),
            )?;
        }
        Ok(())
    })
    .expect("приход");

    // Перемещения — основная масса журнала за время жизни склада.
    db.transaction(|tx| {
        for n in 0..ops_n {
            let item = items[n % items.len()];
            let a = locs[n % locations_n];
            let b = locs[(n + 1) % locations_n];
            operations::register(
                tx,
                &operation("transfer", vec![line(item, Some(a), Some(b), 1)]),
            )?;
        }
        Ok(())
    })
    .expect("перемещения");

    for c in 0..configs_n {
        let comps: Vec<configurations::ConfigurationComponentInput> = (0..8)
            .map(|k| configurations::ConfigurationComponentInput {
                item_id: items[(c * 8 + k) % items.len()],
                quantity: 1 + (k as i64 % 3),
            })
            .collect();
        configurations::save(
            db,
            configurations::ConfigurationInput {
                id: None,
                name: format!("Конфигурация {:04}", c),
                description: None,
                category: None,
                components: comps,
            },
        )
        .expect("конфигурация");
    }
}

fn report(scale: &str, db: &Db) {
    let list = ms(|| {
        catalog::list_items_on(db).unwrap();
    });
    let confs = ms(|| {
        configurations::list(db).unwrap();
    });
    let stat = ms(|| {
        stats::warehouse_statistics_on(db).unwrap();
    });
    let integ = ms(|| {
        stats::check_integrity_on(db).unwrap();
    });
    let journal = ms(|| {
        operations::list_operations_on(db, None, Some(500)).unwrap();
    });
    // Журнал склада и история позиции фильтруются по строкам операций, а не по
    // самим операциям, поэтому приёма с ограничением по операциям к ним не
    // применить — их стоит держать на виду отдельно.
    let by_location = ms(|| {
        operations::location_journal_on(db, 1, Some(500)).unwrap();
    });
    let by_item = ms(|| {
        operations::item_history_on(db, 1).unwrap();
    });
    println!(
        "{:<28} список {:>7.1}  конфиг {:>6.1}  сводка {:>6.1}  целостность {:>7.1}  журнал {:>6.1}  склад {:>7.1}  позиция {:>6.1}",
        scale, list, confs, stat, integ, journal, by_location, by_item
    );
}

#[test]
#[ignore]
fn замер_роста() {
    println!("\nвремя в миллисекундах\n");
    for &(items_n, ops_n, configs_n) in &[
        (100usize, 500usize, 5usize),
        (1_000, 5_000, 25),
        (5_000, 30_000, 100),
        (20_000, 120_000, 300),
    ] {
        let db = db();
        let build = ms(|| seed(&db, items_n, 20, ops_n, configs_n));
        let label = format!("{} позиций, {} операций", items_n, ops_n);
        println!("{:<28} наполнение {:.0} мс", label, build);
        report(&label, &db);
    }
}

/// План выполнения тяжёлых запросов — чтобы видеть, где сортируется всё.
#[test]
#[ignore]
fn планы_запросов() {
    let db = db();
    seed(&db, 5_000, 20, 30_000, 100);
    let queries: &[(&str, &str)] = &[
        ("журнал", "SELECT ol.id FROM operation_lines ol JOIN operations o ON o.id = ol.operation_id JOIN items i ON i.id = ol.item_id LEFT JOIN locations lf ON lf.id = ol.from_location_id LEFT JOIN locations lt ON lt.id = ol.to_location_id WHERE (NULL IS NULL OR o.kind = NULL) ORDER BY o.performed_at DESC, ol.id DESC LIMIT 500"),
        ("журнал склада", "SELECT ol.id FROM operation_lines ol JOIN operations o ON o.id = ol.operation_id WHERE ol.from_location_id = 1 OR ol.to_location_id = 1 ORDER BY o.performed_at DESC, ol.id DESC LIMIT 500"),
        ("история позиции", "SELECT ol.id FROM operation_lines ol JOIN operations o ON o.id = ol.operation_id WHERE ol.item_id = 5 ORDER BY o.performed_at DESC, ol.id DESC"),
    ];
    db.with(|conn| {
        for (name, sql) in queries {
            println!("
--- {} ---", name);
            let mut stmt = conn.prepare(&format!("EXPLAIN QUERY PLAN {}", sql))?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(3))?;
            for r in rows {
                println!("  {}", r?);
            }
        }
        Ok(())
    })
    .unwrap();
}

/// Во что обходится передача всего списка во фронтенд.
#[test]
#[ignore]
fn размер_ответа() {
    for &n in &[1_000usize, 5_000, 20_000] {
        let db = db();
        seed(&db, n, 20, n * 2, 20);
        let items = catalog::list_items_on(&db).unwrap();
        let t = Instant::now();
        let json = serde_json::to_string(&items).unwrap();
        let ser = t.elapsed().as_secs_f64() * 1000.0;
        println!(
            "{:>6} позиций: JSON {:>7.2} МБ, сериализация {:>6.1} мс",
            n,
            json.len() as f64 / 1_048_576.0,
            ser
        );
    }
}

