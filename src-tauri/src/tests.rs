//! Тесты инвариантов учёта.
//!
//! Проверяется не то, что код делает, а то, что он обещает: остаток не уходит
//! в минус, транзакция откатывается целиком, а сумма по журналу всегда равна
//! остаткам. Именно эти обещания прежний слой данных не выполнял — и как раз
//! поэтому расхождения находились уже в живой базе.

use crate::commands::configurations::{self, ConfigurationComponentInput, ConfigurationInput};
use crate::commands::operations::register_on;
use crate::commands::stats::check_integrity_on;
use crate::commands::catalog;
use crate::test_support::*;

// ---------- Схема и миграции ----------

#[test]
fn миграции_создают_схему_и_ставят_версию() {
    let db = db();
    let version: i64 = db
        .with(|conn| Ok(conn.pragma_query_value(None, "user_version", |row| row.get(0))?))
        .unwrap();
    assert_eq!(version, 1, "версия схемы должна быть выставлена");
    assert_eq!(count(&db, "items"), 0, "новая база пуста");
}

#[test]
fn внешние_ключи_включены() {
    let db = db();
    let enabled: i64 = db
        .with(|conn| Ok(conn.pragma_query_value(None, "foreign_keys", |row| row.get(0))?))
        .unwrap();
    assert_eq!(enabled, 1, "без внешних ключей схема не даёт гарантий");
}

// ---------- Остаток ----------

#[test]
fn поступление_увеличивает_остаток() {
    let db = db();
    let (i, l) = (item(&db, "Болт"), location(&db, "Склад А"));
    receive(&db, i, l, 10);
    assert_eq!(stock_at(&db, i, l), 10);
}

#[test]
fn списание_сверх_наличия_отклоняется_и_не_меняет_остаток() {
    let db = db();
    let (i, l) = (item(&db, "Болт"), location(&db, "Склад А"));
    receive(&db, i, l, 5);

    let result = register_on(&db, &operation("writeoff", vec![line(i, Some(l), None, 6)]));

    let error = result.expect_err("списание сверх наличия обязано отклоняться");
    assert!(
        error.0.contains("Недостаточно"),
        "сообщение должно объяснять причину, получено: {}",
        error.0
    );
    assert_eq!(stock_at(&db, i, l), 5, "остаток не должен измениться");
}

#[test]
fn перемещение_не_меняет_общий_остаток() {
    let db = db();
    let i = item(&db, "Болт");
    let (a, b) = (location(&db, "Склад А"), location(&db, "Склад Б"));
    receive(&db, i, a, 10);

    register_on(&db, &operation("transfer", vec![line(i, Some(a), Some(b), 4)])).unwrap();

    assert_eq!(stock_at(&db, i, a), 6);
    assert_eq!(stock_at(&db, i, b), 4);
    assert_eq!(stock_total(&db, i), 10, "перемещение не создаёт и не уничтожает товар");
}

#[test]
fn место_без_остатка_не_хранится() {
    let db = db();
    let (i, l) = (item(&db, "Болт"), location(&db, "Склад А"));
    receive(&db, i, l, 3);
    register_on(&db, &operation("writeoff", vec![line(i, Some(l), None, 3)])).unwrap();

    assert_eq!(
        count(&db, "stock"),
        0,
        "место, где ничего нет, — это отсутствие записи, а не нулевая строка"
    );
}

// ---------- Транзакции ----------

#[test]
fn неудачная_операция_откатывается_целиком() {
    let db = db();
    let (первый, второй) = (item(&db, "Болт"), item(&db, "Гайка"));
    let l = location(&db, "Склад А");
    receive(&db, первый, l, 10);
    receive(&db, второй, l, 1);

    // Первая строка проходит, вторая упирается в нехватку.
    let result = register_on(
        &db,
        &operation(
            "writeoff",
            vec![line(первый, Some(l), None, 5), line(второй, Some(l), None, 99)],
        ),
    );

    assert!(result.is_err(), "операция должна отклониться");
    assert_eq!(
        stock_at(&db, первый, l),
        10,
        "первая строка уже применилась к остатку — откат обязан её вернуть"
    );
    assert_eq!(stock_at(&db, второй, l), 1);
    assert_eq!(count(&db, "operations"), 2, "остаться должны только два поступления");
}

// ---------- Сверка с журналом ----------

#[test]
fn журнал_сходится_с_остатками_после_цепочки_операций() {
    let db = db();
    let i = item(&db, "Болт");
    let (a, b) = (location(&db, "Склад А"), location(&db, "Склад Б"));

    receive(&db, i, a, 100);
    register_on(&db, &operation("transfer", vec![line(i, Some(a), Some(b), 30)])).unwrap();
    register_on(&db, &operation("writeoff", vec![line(i, Some(b), None, 10)])).unwrap();
    register_on(&db, &operation("correction", vec![line(i, None, Some(a), 5)])).unwrap();

    let report = check_integrity_on(&db).unwrap();
    assert!(
        report.stock_drift.is_empty(),
        "остатки разошлись с журналом: {:?}",
        report.stock_drift
    );
    assert_eq!(report.negative_stock, 0);
    assert_eq!(report.foreign_key_violations, 0);
    assert_eq!(stock_total(&db, i), 95);
}

// ---------- Конфигурации ----------

fn конфигурация(db: &crate::db::Db, компоненты: Vec<(i64, i64)>) -> i64 {
    configurations::save(
        db,
        ConfigurationInput {
            id: None,
            name: "Изделие".to_string(),
            description: None,
            category: None,
            components: компоненты
                .into_iter()
                .map(|(item_id, quantity)| ConfigurationComponentInput { item_id, quantity })
                .collect(),
        },
    )
    .expect("конфигурация должна сохраняться")
}

#[test]
fn сборка_списывает_компоненты_и_приходует_изделие() {
    let db = db();
    let (болт, гайка) = (item(&db, "Болт"), item(&db, "Гайка"));
    let l = location(&db, "Склад А");
    receive(&db, болт, l, 10);
    receive(&db, гайка, l, 20);

    let cfg = конфигурация(&db, vec![(болт, 1), (гайка, 2)]);
    configurations::assemble(&db, cfg, 3, l).unwrap();

    assert_eq!(stock_at(&db, болт, l), 7, "на изделие ушло 3 болта");
    assert_eq!(stock_at(&db, гайка, l), 14, "и 6 гаек");

    let view = configurations::list(&db).unwrap();
    let собрано = view.iter().find(|c| c.id == cfg).unwrap().assembled;
    assert_eq!(собрано, 3, "«сколько собрано» — это остаток результирующей позиции");

    let report = check_integrity_on(&db).unwrap();
    assert!(report.stock_drift.is_empty());
}

#[test]
fn сборка_при_нехватке_одного_компонента_не_трогает_остальные() {
    let db = db();
    let (болт, гайка) = (item(&db, "Болт"), item(&db, "Гайка"));
    let l = location(&db, "Склад А");
    receive(&db, болт, l, 10);
    receive(&db, гайка, l, 1);

    let cfg = конфигурация(&db, vec![(болт, 1), (гайка, 2)]);
    let result = configurations::assemble(&db, cfg, 5, l);

    assert!(result.is_err(), "гаек не хватает — сборка невозможна");
    assert_eq!(stock_at(&db, болт, l), 10, "болты не должны быть израсходованы");
    assert_eq!(stock_at(&db, гайка, l), 1);
}

#[test]
fn разборка_возвращает_компоненты() {
    let db = db();
    let болт = item(&db, "Болт");
    let l = location(&db, "Склад А");
    receive(&db, болт, l, 10);

    let cfg = конфигурация(&db, vec![(болт, 2)]);
    configurations::assemble(&db, cfg, 3, l).unwrap();
    assert_eq!(stock_at(&db, болт, l), 4);

    configurations::disassemble(&db, cfg, 2, l).unwrap();
    assert_eq!(stock_at(&db, болт, l), 8, "две единицы изделия вернули 4 болта");

    let собрано = configurations::list(&db)
        .unwrap()
        .iter()
        .find(|c| c.id == cfg)
        .unwrap()
        .assembled;
    assert_eq!(собрано, 1);
    assert!(check_integrity_on(&db).unwrap().stock_drift.is_empty());
}

#[test]
fn сборка_берёт_компоненты_с_нескольких_складов() {
    let db = db();
    let болт = item(&db, "Болт");
    let (a, b) = (location(&db, "Склад А"), location(&db, "Склад Б"));
    receive(&db, болт, a, 3);
    receive(&db, болт, b, 4);

    let cfg = конфигурация(&db, vec![(болт, 5)]);
    configurations::assemble(&db, cfg, 1, a).unwrap();

    assert_eq!(stock_total(&db, болт), 2, "израсходовано 5 из 7");
    assert!(check_integrity_on(&db).unwrap().stock_drift.is_empty());
}

// ---------- Слияние мест хранения ----------

#[test]
fn слияние_складывает_остатки_и_не_теряет_количество() {
    let db = db();
    let болт = item(&db, "Болт");
    let (a, b) = (location(&db, "sklad"), location(&db, "skladв"));
    receive(&db, болт, a, 10);
    receive(&db, болт, b, 5);

    catalog::merge_locations_on(&db, b, a).unwrap();

    assert_eq!(stock_at(&db, болт, a), 15, "остатки должны сложиться");
    assert_eq!(count(&db, "locations"), 1, "исходное место исчезает");
    assert!(check_integrity_on(&db).unwrap().stock_drift.is_empty());
}

#[test]
fn слияние_убирает_перемещения_между_объединяемыми_складами() {
    let db = db();
    let болт = item(&db, "Болт");
    let (a, b) = (location(&db, "sklad"), location(&db, "skladв"));
    receive(&db, болт, a, 10);
    register_on(&db, &operation("transfer", vec![line(болт, Some(a), Some(b), 4)])).unwrap();

    // После слияния такое перемещение стало бы «сам в себя», что запрещено
    // проверкой в схеме — здесь это и проверяется.
    catalog::merge_locations_on(&db, b, a).unwrap();

    assert_eq!(stock_at(&db, болт, a), 10);
    let report = check_integrity_on(&db).unwrap();
    assert!(report.stock_drift.is_empty(), "{:?}", report.stock_drift);
}

// ---------- Проверки ввода ----------

#[test]
fn операция_без_строк_отклоняется() {
    let db = db();
    assert!(register_on(&db, &operation("receipt", vec![])).is_err());
}

#[test]
fn неизвестный_тип_операции_отклоняется() {
    let db = db();
    let (i, l) = (item(&db, "Болт"), location(&db, "Склад А"));
    assert!(register_on(&db, &operation("выдумка", vec![line(i, None, Some(l), 1)])).is_err());
}

#[test]
fn строка_без_обоих_мест_отклоняется() {
    let db = db();
    let i = item(&db, "Болт");
    assert!(register_on(&db, &operation("receipt", vec![line(i, None, None, 1)])).is_err());
}

#[test]
fn конфигурация_без_состава_не_сохраняется() {
    let db = db();
    let result = configurations::save(
        &db,
        ConfigurationInput {
            id: None,
            name: "Пустая".to_string(),
            description: None,
            category: None,
            components: vec![],
        },
    );
    assert!(
        result.is_err(),
        "именно так в старой базе появилась конфигурация с пустым составом"
    );
}
