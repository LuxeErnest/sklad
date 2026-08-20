//! Тесты инвариантов учёта.
//!
//! Проверяется не то, что код делает, а то, что он обещает: остаток не уходит
//! в минус, транзакция откатывается целиком, а сумма по журналу всегда равна
//! остаткам. Именно эти обещания прежний слой данных не выполнял — и как раз
//! поэтому расхождения находились уже в живой базе.

use crate::commands::catalog;
use crate::commands::configurations::{self, ConfigurationComponentInput, ConfigurationInput};
use crate::commands::operations::register_on;
use crate::commands::stats::check_integrity_on;
use crate::db::ids::{ConfigurationId, ItemId, Quantity};
use crate::test_support::*;

// ---------- Схема и миграции ----------

#[test]
fn миграции_создают_схему_и_ставят_версию() {
    let db = db();
    let version: i64 = db
        .with(|conn| Ok(conn.pragma_query_value(None, "user_version", |row| row.get(0))?))
        .unwrap();
    assert_eq!(
        version,
        crate::db::schema::MIGRATIONS.len() as i64,
        "версия схемы должна совпадать с числом применённых миграций"
    );
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

    register_on(
        &db,
        &operation("transfer", vec![line(i, Some(a), Some(b), 4)]),
    )
    .unwrap();

    assert_eq!(stock_at(&db, i, a), 6);
    assert_eq!(stock_at(&db, i, b), 4);
    assert_eq!(
        stock_total(&db, i),
        10,
        "перемещение не создаёт и не уничтожает товар"
    );
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
            vec![
                line(первый, Some(l), None, 5),
                line(второй, Some(l), None, 99),
            ],
        ),
    );

    assert!(result.is_err(), "операция должна отклониться");
    assert_eq!(
        stock_at(&db, первый, l),
        10,
        "первая строка уже применилась к остатку — откат обязан её вернуть"
    );
    assert_eq!(stock_at(&db, второй, l), 1);
    assert_eq!(
        count(&db, "operations"),
        2,
        "остаться должны только два поступления"
    );
}

// ---------- Сверка с журналом ----------

#[test]
fn журнал_сходится_с_остатками_после_цепочки_операций() {
    let db = db();
    let i = item(&db, "Болт");
    let (a, b) = (location(&db, "Склад А"), location(&db, "Склад Б"));

    receive(&db, i, a, 100);
    register_on(
        &db,
        &operation("transfer", vec![line(i, Some(a), Some(b), 30)]),
    )
    .unwrap();
    register_on(
        &db,
        &operation("writeoff", vec![line(i, Some(b), None, 10)]),
    )
    .unwrap();
    register_on(
        &db,
        &operation("correction", vec![line(i, None, Some(a), 5)]),
    )
    .unwrap();

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

fn конфигурация(
    db: &crate::db::Db, компоненты: Vec<(ItemId, i64)>
) -> ConfigurationId {
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
    configurations::assemble(&db, cfg, Quantity(3), l).unwrap();

    assert_eq!(stock_at(&db, болт, l), 7, "на изделие ушло 3 болта");
    assert_eq!(stock_at(&db, гайка, l), 14, "и 6 гаек");

    let view = configurations::list(&db).unwrap();
    let собрано = view.iter().find(|c| c.id == cfg).unwrap().assembled;
    assert_eq!(
        собрано, 3,
        "«сколько собрано» — это остаток результирующей позиции"
    );

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
    let result = configurations::assemble(&db, cfg, Quantity(5), l);

    assert!(result.is_err(), "гаек не хватает — сборка невозможна");
    assert_eq!(
        stock_at(&db, болт, l),
        10,
        "болты не должны быть израсходованы"
    );
    assert_eq!(stock_at(&db, гайка, l), 1);
}

#[test]
fn разборка_возвращает_компоненты() {
    let db = db();
    let болт = item(&db, "Болт");
    let l = location(&db, "Склад А");
    receive(&db, болт, l, 10);

    let cfg = конфигурация(&db, vec![(болт, 2)]);
    configurations::assemble(&db, cfg, Quantity(3), l).unwrap();
    assert_eq!(stock_at(&db, болт, l), 4);

    configurations::disassemble(&db, cfg, Quantity(2), l).unwrap();
    assert_eq!(
        stock_at(&db, болт, l),
        8,
        "две единицы изделия вернули 4 болта"
    );

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
    configurations::assemble(&db, cfg, Quantity(1), a).unwrap();

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
    register_on(
        &db,
        &operation("transfer", vec![line(болт, Some(a), Some(b), 4)]),
    )
    .unwrap();

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

// ---------- Порядок журнала ----------

/// Журнал показывается от новых записей к старым.
///
/// Проверка появилась не из осторожности: я оптимизировал журнал сортировкой по
/// номеру операции вместо времени, и на записях, перенесённых из старой базы,
/// порядок поехал — номера там выданы заново и хронологии не следуют. Тест
/// воспроизводит именно этот случай.
#[test]
fn журнал_отдаётся_от_новых_записей_к_старым() {
    let db = db();
    let item_id = item(&db, "Болт");
    let place = location(&db, "Склад");
    receive(&db, item_id, place, 10);

    // Записи с временем вразнобой относительно порядка вставки — так выглядит
    // история, перенесённая из прежней версии приложения.
    db.transaction(|tx| {
        for (id, at) in [(1_i64, "2024-05-01T10:00:00.000Z"), (2, "2020-01-01T00:00:00.000Z")] {
            tx.execute(
                "INSERT INTO operations (id, kind, performed_at) VALUES (?1, 'correction', ?2)",
                rusqlite::params![1000 + id, at],
            )?;
            tx.execute(
                "INSERT INTO operation_lines (operation_id, item_id, to_location_id, quantity)
                 VALUES (?1, ?2, ?3, 1)",
                rusqlite::params![1000 + id, item_id, place],
            )?;
        }
        Ok(())
    })
    .unwrap();

    let rows = crate::commands::operations::list_operations_on(&db, None, Some(500)).unwrap();
    let times: Vec<&str> = rows.iter().map(|r| r.performed_at.as_str()).collect();
    let mut sorted = times.clone();
    sorted.sort_by(|a, b| b.cmp(a));
    assert_eq!(times, sorted, "журнал должен идти от новых записей к старым");

    // Строка 2020 года вставлена последней, но показаться должна в конце.
    assert_eq!(
        times.last(),
        Some(&"2020-01-01T00:00:00.000Z"),
        "самая старая запись должна оказаться внизу, а не там, где её вставили"
    );
}

/// Время пишется в одном виде — иначе сравнение строк даёт неверный порядок.
#[test]
fn отметки_времени_в_одном_формате() {
    let stamp = crate::now_iso();
    assert_eq!(stamp.len(), 24, "ожидается YYYY-MM-DDTHH:MM:SS.sssZ: {}", stamp);
    assert!(stamp.ends_with('Z'), "время должно заканчиваться на Z: {}", stamp);
    assert!(!stamp.contains('+'), "смещение вместо Z ломает сравнение: {}", stamp);
}

// ---------- Освобождённые теги и категории ----------

/// Тег исчезает, когда его отпустила последняя позиция.
///
/// Отдельного места, где теги удаляют вручную, больше нет: страница «Изменить»
/// убрана, а её кнопки переехали в панель товара.
#[test]
fn тег_удаляется_когда_его_отпустила_последняя_позиция() {
    let db = db();
    let первый = item(&db, "Болт");
    let второй = item(&db, "Гайка");
    let тег = catalog::create_tag_on(&db, "метиз".to_string()).unwrap();

    catalog::set_item_tags_on(&db, первый.get(), vec![тег]).unwrap();
    catalog::set_item_tags_on(&db, второй.get(), vec![тег]).unwrap();
    assert_eq!(count(&db, "tags"), 1);

    // Первая позиция отпустила тег — вторая ещё держит, удалять нельзя.
    catalog::set_item_tags_on(&db, первый.get(), vec![]).unwrap();
    assert_eq!(count(&db, "tags"), 1, "тег ещё используется второй позицией");

    catalog::set_item_tags_on(&db, второй.get(), vec![]).unwrap();
    assert_eq!(count(&db, "tags"), 0, "тег отпущен всеми и должен исчезнуть");
}

/// Тег, созданный впрок и ни разу не назначенный, остаётся.
#[test]
fn неназначенный_тег_не_удаляется() {
    let db = db();
    let item_id = item(&db, "Болт");
    let впрок = catalog::create_tag_on(&db, "на будущее".to_string()).unwrap();
    let рабочий = catalog::create_tag_on(&db, "метиз".to_string()).unwrap();

    catalog::set_item_tags_on(&db, item_id.get(), vec![рабочий]).unwrap();
    catalog::set_item_tags_on(&db, item_id.get(), vec![]).unwrap();

    assert_eq!(
        count(&db, "tags"),
        1,
        "назначенный тег отпущен и удалён, созданный впрок остался"
    );
    let остался: i64 = db
        .with(|conn| Ok(conn.query_row("SELECT id FROM tags", [], |r| r.get(0))?))
        .unwrap();
    assert_eq!(остался, впрок, "остаться должен именно созданный впрок");
}

/// Категория исчезает, когда её покинула последняя позиция.
#[test]
fn категория_удаляется_когда_её_покинула_последняя_позиция() {
    let db = db();
    let id = catalog::save_item_on(
        &db,
        catalog::ItemInput {
            id: None,
            name: "Болт".to_string(),
            category: Some("Метизы".to_string()),
            unit: None,
            price: None,
            min_stock: None,
            barcode: None,
            description: None,
            url: None,
            image_path: None,
        },
    )
    .unwrap();
    assert_eq!(count(&db, "categories"), 1);

    // Позиция переехала в другую категорию — прежняя опустела.
    catalog::save_item_on(
        &db,
        catalog::ItemInput {
            id: Some(id),
            name: "Болт".to_string(),
            category: Some("Крепёж".to_string()),
            unit: None,
            price: None,
            min_stock: None,
            barcode: None,
            description: None,
            url: None,
            image_path: None,
        },
    )
    .unwrap();

    let имена: Vec<String> = db
        .with(|conn| {
            let mut st = conn.prepare("SELECT name FROM categories ORDER BY name")?;
            let rows = st.query_map([], |r| r.get::<_, String>(0))?;
            Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
        })
        .unwrap();
    assert_eq!(имена, vec!["Крепёж".to_string()], "опустевшая категория должна исчезнуть");
}

// ---------- Отчёты экрана статистики ----------

#[test]
fn движение_за_период_считается_по_журналу() {
    let db = db();
    let болт = item(&db, "Болт");
    let склад_а = location(&db, "Склад А");
    let склад_б = location(&db, "Склад Б");

    receive(&db, болт, склад_а, 100);
    register_on(
        &db,
        &operation("transfer", vec![line(болт, Some(склад_а), Some(склад_б), 30)]),
    )
    .unwrap();
    register_on(
        &db,
        &operation("writeoff", vec![line(болт, Some(склад_а), None, 5)]),
    )
    .unwrap();

    let отчёт =
        crate::commands::stats::movement_summary_on(&db, "2000-01-01T00:00:00.000Z").unwrap();
    let найти = |вид: &str| отчёт.iter().find(|r| r.kind == вид);

    assert_eq!(найти("receipt").map(|r| r.units), Some(100));
    assert_eq!(найти("transfer").map(|r| r.units), Some(30));
    assert_eq!(найти("writeoff").map(|r| r.units), Some(5));
    assert_eq!(найти("receipt").map(|r| r.operations), Some(1));

    // Срез по времени: за период после всех операций не должно быть ничего.
    let пусто = crate::commands::stats::movement_summary_on(&db, "2999-01-01T00:00:00.000Z").unwrap();
    assert!(пусто.is_empty(), "за будущий период движений быть не может");
}

#[test]
fn стоимость_раскладывается_по_складам() {
    let db = db();
    let болт = item(&db, "Болт"); // цена 100 задана в test_support
    let гайка = item(&db, "Гайка");
    let склад_а = location(&db, "Склад А");
    let склад_б = location(&db, "Склад Б");

    receive(&db, болт, склад_а, 3); // 300
    receive(&db, гайка, склад_а, 2); // 200
    receive(&db, болт, склад_б, 1); // 100

    let по_складам = crate::commands::stats::value_by_location_on(&db).unwrap();
    let найти = |имя: &str| по_складам.iter().find(|r| r.location == имя).unwrap();

    assert_eq!(найти("Склад А").value, 500.0);
    assert_eq!(найти("Склад А").units, 5);
    assert_eq!(найти("Склад А").items, 2, "на складе А две разные позиции");
    assert_eq!(найти("Склад Б").value, 100.0);

    // Сумма по складам обязана совпадать с общей стоимостью склада.
    let всего: f64 = по_складам.iter().map(|r| r.value).sum();
    let сводка = crate::commands::stats::warehouse_statistics_on(&db).unwrap();
    assert_eq!(всего, сводка.total_value);
}

#[test]
fn мёртвый_запас_это_остаток_без_движения() {
    let db = db();
    let лежит = item(&db, "Лежит давно");
    let двигался = item(&db, "Двигался");
    let пустой = item(&db, "Пустой");
    let склад = location(&db, "Склад");

    // Обе позиции приходуются сейчас, поэтому по свежей границе мёртвых нет.
    receive(&db, лежит, склад, 10);
    receive(&db, двигался, склад, 10);
    let _ = пустой;

    let свежий = crate::commands::stats::dead_stock_on(&db, "2000-01-01T00:00:00.000Z").unwrap();
    assert!(свежий.is_empty(), "только что поступившее мёртвым не считается");

    // По границе в будущем без движения оказывается всё, у чего есть остаток.
    let всё = crate::commands::stats::dead_stock_on(&db, "2999-01-01T00:00:00.000Z").unwrap();
    let имена: Vec<&str> = всё.iter().map(|r| r.name.as_str()).collect();
    assert!(имена.contains(&"Лежит давно"));
    assert!(имена.contains(&"Двигался"));
    assert!(
        !имена.contains(&"Пустой"),
        "позиция без остатка места не занимает и мёртвым запасом не является"
    );

    let запись = всё.iter().find(|r| r.name == "Лежит давно").unwrap();
    assert_eq!(запись.quantity, 10);
    assert_eq!(запись.value, 1000.0, "10 штук по 100");
    assert!(запись.last_movement_at.is_some(), "поступление — это движение");
}

/// Категория конфигурации применяется к её результирующему изделию и при правке.
///
/// Раньше она учитывалась только при создании: форма сборки требовала заполнить
/// поле «Категория», а на данные это не влияло.
#[test]
fn правка_конфигурации_меняет_категорию_результата() {
    let db = db();
    let комплектующая = item(&db, "Плата");
    let склад = location(&db, "Склад");
    receive(&db, комплектующая, склад, 10);

    let id = configurations::save(
        &db,
        ConfigurationInput {
            id: None,
            name: "Блок".to_string(),
            description: None,
            category: Some("Сборки".to_string()),
            components: vec![ConfigurationComponentInput {
                item_id: комплектующая,
                quantity: 1,
            }],
        },
    )
    .unwrap();

    let категория = |db: &crate::db::Db| {
        configurations::list(db)
            .unwrap()
            .into_iter()
            .find(|c| c.id == id)
            .unwrap()
            .result_category
    };
    assert_eq!(категория(&db).as_deref(), Some("Сборки"));

    configurations::save(
        &db,
        ConfigurationInput {
            id: Some(id),
            name: "Блок".to_string(),
            description: None,
            category: Some("Готовые изделия".to_string()),
            components: vec![ConfigurationComponentInput {
                item_id: комплектующая,
                quantity: 1,
            }],
        },
    )
    .unwrap();
    assert_eq!(
        категория(&db).as_deref(),
        Some("Готовые изделия"),
        "правка должна менять категорию результата"
    );
}

/// Документы: колонка расширения и связь с тегами.
#[test]
fn схема_документов_знает_расширение_и_теги() {
    let db = db();
    db.with(|conn| {
        // Колонка переименована: раньше называлась mime и хранила расширение.
        let есть_extension: i64 = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('documents') WHERE name = 'extension'",
            [],
            |r| r.get(0),
        )?;
        assert_eq!(есть_extension, 1, "у документов должна быть колонка extension");

        let остался_mime: i64 = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('documents') WHERE name = 'mime'",
            [],
            |r| r.get(0),
        )?;
        assert_eq!(остался_mime, 0, "колонки mime больше быть не должно");

        let есть_теги: i64 = conn.query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'document_tags'",
            [],
            |r| r.get(0),
        )?;
        assert_eq!(есть_теги, 1, "теги документов должно быть где хранить");
        Ok(())
    })
    .unwrap();
}
