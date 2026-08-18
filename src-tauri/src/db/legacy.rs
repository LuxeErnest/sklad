//! Перенос данных из старой схемы.
//!
//! Старая база (`app.db`) не изменяется — она читается через ATTACH и остаётся
//! запасным вариантом. Весь перенос идёт одной транзакцией.
//!
//! Точную последовательность операций восстановить невозможно: в старой базе
//! журнал перемещений и остатки не сходятся между собой (у одного товара в
//! этапах приход 10 и перемещение 10, при этом групп нет и остаток 0).
//! Поэтому переносятся остатки как факт, а импортированные события помечаются
//! и не пересчитывают остаток.

use super::{Db, DbError, DbResult};
use base64::Engine;
use rusqlite::{params, Transaction};
use sha2::{Digest, Sha256};
use std::path::Path;

#[derive(Debug, Default, serde::Serialize)]
pub struct ImportReport {
    pub locations: usize,
    pub categories: usize,
    pub tags: usize,
    pub items: usize,
    pub stock_rows: usize,
    pub operations: usize,
    pub documents: usize,
    pub configurations: usize,
    pub notes: Vec<String>,
}

/// Проверяет, что старая база выглядит как ожидается.
pub fn is_legacy_database(path: &Path) -> bool {
    if !path.exists() {
        return false;
    }
    match rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    ) {
        Ok(conn) => conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='components'",
                [],
                |r| r.get::<_, i64>(0),
            )
            .map(|n| n > 0)
            .unwrap_or(false),
        Err(_) => false,
    }
}

pub fn import(db: &Db, legacy_path: &Path, documents_dir: &Path) -> DbResult<ImportReport> {
    if !is_legacy_database(legacy_path) {
        return Err(DbError(format!(
            "Файл не похож на старую базу склада: {}",
            legacy_path.display()
        )));
    }
    std::fs::create_dir_all(documents_dir)?;

    // Документы вынимаем до транзакции: запись файлов на диск откатить нельзя,
    // поэтому сначала раскладываем их, а в транзакции пишем только метаданные.
    let extracted = extract_documents(legacy_path, documents_dir)?;

    let legacy = legacy_path.to_string_lossy().to_string();
    let report = db.transaction(|tx| {
        let already: i64 = tx.query_row("SELECT COUNT(*) FROM items", [], |r| r.get(0))?;
        if already > 0 {
            return Err(DbError(
                "База уже содержит номенклатуру — повторный импорт отменён".to_string(),
            ));
        }

        tx.execute("ATTACH DATABASE ?1 AS legacy", params![legacy])?;
        let result = run_import(tx, &extracted);
        // DETACH выполняется в любом случае, иначе соединение останется
        // с подключённой чужой базой.
        let _ = tx.execute("DETACH DATABASE legacy", []);
        result
    })?;

    Ok(report)
}

struct ExtractedDocument {
    legacy_id: i64,
    rel_path: String,
    sha256: String,
    size_bytes: i64,
}

/// Раскладывает содержимое документов из base64 в файлы.
///
/// Одинаковые файлы схлопываются по хешу: в исходной базе четыре документа —
/// это две пары побайтово одинаковых файлов, загруженных дважды.
fn extract_documents(legacy_path: &Path, dir: &Path) -> DbResult<Vec<ExtractedDocument>> {
    let conn = rusqlite::Connection::open_with_flags(
        legacy_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
    )?;
    let mut stmt = conn.prepare("SELECT id, name, type, dataBase64 FROM documents")?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, Option<String>>(2)?.unwrap_or_default(),
            row.get::<_, Option<String>>(3)?.unwrap_or_default(),
        ))
    })?;

    let mut out = Vec::new();
    for row in rows {
        let (id, name, mime, data_b64) = row?;
        if data_b64.trim().is_empty() {
            continue;
        }
        // В базе встречается как чистый base64, так и data-URL.
        let payload = data_b64
            .split_once(";base64,")
            .map(|(_, rest)| rest)
            .unwrap_or(&data_b64);
        let bytes = match base64::engine::general_purpose::STANDARD.decode(payload.trim()) {
            Ok(b) => b,
            Err(_) => continue,
        };

        let digest = format!("{:x}", Sha256::digest(&bytes));
        let ext = extension_for(&name, &mime);
        let file_name = format!("{}{}", digest, ext);
        let target = dir.join(&file_name);
        if !target.exists() {
            std::fs::write(&target, &bytes)?;
        }
        out.push(ExtractedDocument {
            legacy_id: id,
            rel_path: file_name,
            sha256: digest,
            size_bytes: bytes.len() as i64,
        });
    }
    Ok(out)
}

fn extension_for(name: &str, mime: &str) -> String {
    let looks_like_ext =
        |s: &str| !s.is_empty() && s.len() <= 8 && s.chars().all(|c| c.is_ascii_alphanumeric());

    if let Some((_, ext)) = name.rsplit_once('.') {
        if looks_like_ext(ext) {
            return format!(".{}", ext.to_ascii_lowercase());
        }
    }
    // В старой схеме в колонке type лежал не MIME-тип, а расширение:
    // встречаются значения вида «docx», «xlsx», «pdf».
    if looks_like_ext(mime) {
        return format!(".{}", mime.to_ascii_lowercase());
    }
    match mime {
        m if m.contains("pdf") => ".pdf".into(),
        m if m.contains("png") => ".png".into(),
        m if m.contains("jpeg") || m.contains("jpg") => ".jpg".into(),
        m if m.contains("sheet") => ".xlsx".into(),
        m if m.contains("wordprocessing") => ".docx".into(),
        _ => ".bin".into(),
    }
}

fn run_import(tx: &Transaction, extracted: &[ExtractedDocument]) -> DbResult<ImportReport> {
    let mut report = ImportReport::default();
    let now = crate::now_iso();

    // --- Места хранения: собираем все встречающиеся строки из трёх таблиц ---
    tx.execute(
        "INSERT OR IGNORE INTO locations (name)
         SELECT DISTINCT TRIM(location) FROM legacy.components
          WHERE location IS NOT NULL AND TRIM(location) != ''
         UNION
         SELECT DISTINCT TRIM(location) FROM legacy.component_groups
          WHERE location IS NOT NULL AND TRIM(location) != ''
         UNION
         SELECT DISTINCT TRIM(stepLocation) FROM legacy.component_paths
          WHERE stepLocation IS NOT NULL AND TRIM(stepLocation) != ''",
        [],
    )?;
    report.locations = tx.query_row("SELECT COUNT(*) FROM locations", [], |r| r.get::<_, i64>(0))?
        as usize;

    // --- Категории: из справочника и из текстовых значений у товаров ---
    tx.execute(
        "INSERT OR IGNORE INTO categories (name, parent_id)
         SELECT DISTINCT TRIM(name), NULL FROM legacy.categories
          WHERE name IS NOT NULL AND TRIM(name) != ''
         UNION
         SELECT DISTINCT TRIM(category), NULL FROM legacy.components
          WHERE category IS NOT NULL AND TRIM(category) != ''",
        [],
    )?;
    report.categories =
        tx.query_row("SELECT COUNT(*) FROM categories", [], |r| r.get::<_, i64>(0))? as usize;

    // --- Теги ---
    tx.execute(
        "INSERT OR IGNORE INTO tags (id, name)
         SELECT id, TRIM(name) FROM legacy.tags WHERE name IS NOT NULL AND TRIM(name) != ''",
        [],
    )?;
    report.tags = tx.query_row("SELECT COUNT(*) FROM tags", [], |r| r.get::<_, i64>(0))? as usize;

    // --- Номенклатура. Идентификаторы сохраняем: на них ссылаются
    //     привязки документов и составы конфигураций. ---
    tx.execute(
        "INSERT INTO items
            (id, name, category_id, unit, reference_price, min_stock, barcode,
             description, url, archived_at, created_at, updated_at)
         SELECT c.id,
                c.name,
                (SELECT k.id FROM categories k WHERE k.name = TRIM(c.category)),
                'шт',
                c.price,
                COALESCE(c.minStock, 0),
                NULLIF(TRIM(COALESCE(c.barcode, '')), ''),
                c.description,
                c.url,
                c.archivedAt,
                COALESCE(c.lastUpdated, ?1),
                COALESCE(c.lastUpdated, ?1)
           FROM legacy.components c",
        params![now],
    )?;
    report.items = tx.query_row("SELECT COUNT(*) FROM items", [], |r| r.get::<_, i64>(0))? as usize;

    tx.execute(
        "INSERT OR IGNORE INTO item_tags (item_id, tag_id)
         SELECT ct.componentId, ct.tagId FROM legacy.component_tags ct
          WHERE EXISTS (SELECT 1 FROM items i WHERE i.id = ct.componentId)
            AND EXISTS (SELECT 1 FROM tags t WHERE t.id = ct.tagId)",
        [],
    )?;

    // --- Остатки. Старое деление групп по цене схлопывается: цена больше не
    //     часть ключа хранения, она ушла в строки операций. ---
    tx.execute(
        "INSERT INTO stock (item_id, location_id, quantity, updated_at)
         SELECT g.componentId,
                l.id,
                SUM(g.quantity),
                ?1
           FROM legacy.component_groups g
           JOIN locations l ON l.name = TRIM(g.location)
          WHERE EXISTS (SELECT 1 FROM items i WHERE i.id = g.componentId)
          GROUP BY g.componentId, l.id
         HAVING SUM(g.quantity) > 0",
        params![now],
    )?;
    report.stock_rows =
        tx.query_row("SELECT COUNT(*) FROM stock", [], |r| r.get::<_, i64>(0))? as usize;

    // --- Журнал. Импортированные события помечаются в примечании и не
    //     пересчитывают остаток: восстановить достоверную последовательность
    //     из противоречивых данных нельзя. ---
    import_paths(tx)?;
    import_supplies(tx)?;
    import_scrapped(tx)?;
    report.operations =
        tx.query_row("SELECT COUNT(*) FROM operations", [], |r| r.get::<_, i64>(0))? as usize;

    // --- Конфигурации: каждой заводится результирующая позиция номенклатуры ---
    report.configurations = import_configurations(tx, &now)?;

    // --- Документы: метаданные к уже разложенным файлам ---
    report.documents = import_documents(tx, extracted)?;

    // --- Сверка журнала с перенесёнными остатками ---
    let corrected = reconcile_journal_with_stock(tx)?;
    if corrected > 0 {
        report.notes.push(format!(
            "Добавлена корректировка на {} позиций: перенесённые события не сходились \
             с остатками, и без неё сверка показывала бы расхождение по каждой строке",
            corrected
        ));
    }

    if report.operations > 0 {
        report.notes.push(
            "События журнала перенесены как исторические: остаток они не меняют, \
             потому что в старой базе журнал и остатки не сходились"
                .to_string(),
        );
    }
    if report.locations > 0 {
        report.notes.push(format!(
            "Мест хранения перенесено {}. Раньше это была свободная строка, \
             поэтому среди них могут оказаться опечатки одного и того же склада — \
             их стоит объединить в настройках",
            report.locations
        ));
    }

    // component_usage_history намеренно не переносится: это была производная
    // таблица, дублировавшая scrapped_items, и заполнялась она в том числе
    // автосписанием при обычном редактировании количества — то есть событиями,
    // которых на складе не происходило.
    let skipped_history: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM legacy.component_usage_history",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if skipped_history > 0 {
        report.notes.push(format!(
            "Не перенесено записей из component_usage_history: {}. Эта таблица \
             дублировала списания и содержала события, порождённые ошибкой \
             автосписания при редактировании количества",
            skipped_history
        ));
    }

    Ok(report)
}

/// Дописывает одну корректировку, после которой сумма по журналу совпадает
/// с перенесёнными остатками.
///
/// Перенесённые события — это пересказ старой истории, и сойтись с остатками
/// они не могут: в исходной базе журнал и остатки велись независимо и штатно
/// расходились. Остатки при этом достоверны, потому что именно их показывало
/// приложение. Поэтому за истину принимаются остатки, а разница оформляется
/// явной операцией, а не замалчивается.
///
/// Строки пишутся напрямую, без применения к `stock`: остатки уже перенесены,
/// повторно двигать их не нужно.
fn reconcile_journal_with_stock(tx: &Transaction) -> DbResult<usize> {
    let differences: i64 = tx.query_row(
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
         SELECT COUNT(*) FROM keys k
           LEFT JOIN stock   s ON s.item_id = k.item_id AND s.location_id = k.location_id
           LEFT JOIN journal j ON j.item_id = k.item_id AND j.location_id = k.location_id
          WHERE COALESCE(s.quantity, 0) != COALESCE(j.quantity, 0)",
        [],
        |row| row.get(0),
    )?;

    if differences == 0 {
        return Ok(0);
    }

    tx.execute(
        "INSERT INTO operations (kind, performed_at, performed_by, note)
         VALUES ('correction', ?1, 'Импорт',
                 'Приведение журнала в соответствие с перенесёнными остатками')",
        params![crate::now_iso()],
    )?;
    let operation_id = tx.last_insert_rowid();

    // Положительная разница — приход на место, отрицательная — уход с него.
    let inserted = tx.execute(
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
         ),
         diff AS (
             SELECT k.item_id, k.location_id,
                    COALESCE(s.quantity, 0) - COALESCE(j.quantity, 0) AS delta
               FROM keys k
               LEFT JOIN stock   s ON s.item_id = k.item_id AND s.location_id = k.location_id
               LEFT JOIN journal j ON j.item_id = k.item_id AND j.location_id = k.location_id
              WHERE COALESCE(s.quantity, 0) != COALESCE(j.quantity, 0)
         )
         INSERT INTO operation_lines
             (operation_id, item_id, from_location_id, to_location_id, quantity)
         SELECT ?1, item_id,
                CASE WHEN delta < 0 THEN location_id END,
                CASE WHEN delta > 0 THEN location_id END,
                ABS(delta)
           FROM diff",
        params![operation_id],
    )?;

    Ok(inserted)
}

fn import_paths(tx: &Transaction) -> DbResult<()> {
    // stepType: purchase/storage считаем приходом, transfer — перемещением.
    // У перемещения в старой схеме известно только место назначения, поэтому
    // источник остаётся неизвестным и строка пишется как приход на склад.
    tx.execute(
        "INSERT INTO operations (kind, performed_at, performed_by, note)
         SELECT CASE WHEN p.stepType = 'transfer' THEN 'transfer' ELSE 'receipt' END,
                p.stepDate,
                'Импорт',
                'Импортировано из старой базы: ' || COALESCE(p.stepName, 'этап')
           FROM legacy.component_paths p
           JOIN items i ON i.id = p.componentId
          WHERE p.stepLocation IS NOT NULL AND TRIM(p.stepLocation) != ''
            AND COALESCE(p.stepQuantity, 0) > 0
          ORDER BY p.componentId, p.stepOrder",
        [],
    )?;
    // Строки привязываются к только что созданным операциям по порядку.
    tx.execute(
        "INSERT INTO operation_lines
            (operation_id, item_id, from_location_id, to_location_id, quantity, unit_price)
         SELECT o.id, src.item_id, NULL, src.location_id, src.quantity, src.price
           FROM (
             SELECT ROW_NUMBER() OVER (ORDER BY p.componentId, p.stepOrder) AS rn,
                    p.componentId AS item_id,
                    l.id          AS location_id,
                    p.stepQuantity AS quantity,
                    p.stepPrice    AS price
               FROM legacy.component_paths p
               JOIN items i ON i.id = p.componentId
               JOIN locations l ON l.name = TRIM(p.stepLocation)
              WHERE COALESCE(p.stepQuantity, 0) > 0
           ) src
           JOIN (
             SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
               FROM operations WHERE performed_by = 'Импорт'
           ) o ON o.rn = src.rn",
        [],
    )?;
    Ok(())
}

fn import_supplies(tx: &Transaction) -> DbResult<()> {
    tx.execute(
        "INSERT INTO operations (kind, performed_at, performed_by, note)
         SELECT 'receipt', s.suppliedAt, 'Импорт', 'Импортированная поставка'
           FROM legacy.supply_records s
           JOIN items i ON i.id = s.componentId
          WHERE s.quantity > 0",
        [],
    )?;
    tx.execute(
        "INSERT INTO operation_lines
            (operation_id, item_id, from_location_id, to_location_id, quantity)
         SELECT o.id, src.item_id, NULL, src.location_id, src.quantity
           FROM (
             SELECT ROW_NUMBER() OVER (ORDER BY s.id) AS rn,
                    s.componentId AS item_id,
                    COALESCE(l.id, (SELECT MIN(id) FROM locations)) AS location_id,
                    s.quantity AS quantity
               FROM legacy.supply_records s
               JOIN items i ON i.id = s.componentId
               LEFT JOIN locations l ON l.name = TRIM(COALESCE(s.location, ''))
              WHERE s.quantity > 0
           ) src
           JOIN (
             SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
               FROM operations WHERE note = 'Импортированная поставка'
           ) o ON o.rn = src.rn
          WHERE src.location_id IS NOT NULL",
        [],
    )?;
    Ok(())
}

fn import_scrapped(tx: &Transaction) -> DbResult<()> {
    tx.execute(
        "INSERT INTO operations (kind, performed_at, performed_by, note)
         SELECT 'writeoff', s.scrappedAt, 'Импорт',
                'Импортированное списание: ' || COALESCE(s.reason, 'без причины')
           FROM legacy.scrapped_items s
           JOIN items i ON i.id = s.componentId
          WHERE s.quantity > 0",
        [],
    )?;
    tx.execute(
        "INSERT INTO operation_lines
            (operation_id, item_id, from_location_id, to_location_id, quantity)
         SELECT o.id, src.item_id, src.location_id, NULL, src.quantity
           FROM (
             SELECT ROW_NUMBER() OVER (ORDER BY s.id) AS rn,
                    s.componentId AS item_id,
                    (SELECT location_id FROM stock st WHERE st.item_id = s.componentId
                      ORDER BY st.quantity DESC LIMIT 1) AS location_id,
                    s.quantity AS quantity
               FROM legacy.scrapped_items s
               JOIN items i ON i.id = s.componentId
              WHERE s.quantity > 0
           ) src
           JOIN (
             SELECT id, ROW_NUMBER() OVER (ORDER BY id) AS rn
               FROM operations WHERE kind = 'writeoff' AND performed_by = 'Импорт'
           ) o ON o.rn = src.rn
          WHERE src.location_id IS NOT NULL",
        [],
    )?;
    Ok(())
}

fn import_configurations(tx: &Transaction, now: &str) -> DbResult<usize> {
    let mut stmt = tx.prepare(
        "SELECT id, name, description, createdAt, category, location FROM legacy.configurations",
    )?;
    let rows: Vec<(i64, String, Option<String>, Option<String>, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
            ))
        })?
        .collect::<rusqlite::Result<_>>()?;
    drop(stmt);

    let mut count = 0usize;
    for (legacy_id, name, description, created_at, category) in rows {
        let created = created_at.unwrap_or_else(|| now.to_string());
        // Результат сборки — обычная позиция номенклатуры.
        tx.execute(
            "INSERT INTO items (name, category_id, unit, min_stock, description, created_at, updated_at)
             VALUES (?1, (SELECT id FROM categories WHERE name = ?2), 'шт', 0, ?3, ?4, ?4)",
            params![
                name,
                category.unwrap_or_else(|| "Конфигурации".to_string()),
                description,
                created
            ],
        )?;
        let result_item_id = tx.last_insert_rowid();

        tx.execute(
            "INSERT INTO configurations (id, name, description, result_item_id, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![legacy_id, name, description, result_item_id, created],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO configuration_items (configuration_id, item_id, quantity)
             SELECT cc.configurationId, cc.componentId, cc.quantity
               FROM legacy.configuration_components cc
               JOIN items i ON i.id = cc.componentId
              WHERE cc.configurationId = ?1 AND cc.quantity > 0",
            params![legacy_id],
        )?;
        count += 1;
    }
    Ok(count)
}

fn import_documents(tx: &Transaction, extracted: &[ExtractedDocument]) -> DbResult<usize> {
    let mut count = 0usize;
    for doc in extracted {
        let meta = tx.query_row(
            "SELECT name, type, category, description, uploadedBy, uploadedAt
               FROM legacy.documents WHERE id = ?1",
            params![doc.legacy_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        );
        let (name, mime, category, description, uploaded_by, uploaded_at) = match meta {
            Ok(v) => v,
            Err(_) => continue,
        };

        tx.execute(
            "INSERT INTO documents
                (name, rel_path, mime, size_bytes, sha256, category, description, uploaded_by, uploaded_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                name,
                doc.rel_path,
                mime,
                doc.size_bytes,
                doc.sha256,
                category,
                description,
                uploaded_by,
                uploaded_at
            ],
        )?;
        let new_id = tx.last_insert_rowid();

        // Привязки: и через таблицу связей, и через легаси-колонку componentId.
        tx.execute(
            "INSERT OR IGNORE INTO document_items (document_id, item_id)
             SELECT ?1, dc.componentId
               FROM legacy.document_components dc
               JOIN items i ON i.id = dc.componentId
              WHERE dc.documentId = ?2",
            params![new_id, doc.legacy_id],
        )?;
        tx.execute(
            "INSERT OR IGNORE INTO document_items (document_id, item_id)
             SELECT ?1, d.componentId
               FROM legacy.documents d
               JOIN items i ON i.id = d.componentId
              WHERE d.id = ?2 AND d.componentId > 0",
            params![new_id, doc.legacy_id],
        )?;
        count += 1;
    }
    Ok(count)
}
