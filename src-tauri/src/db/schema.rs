//! Миграции схемы.
//!
//! Применяются по порядку, номер версии хранится в `PRAGMA user_version`.
//! Каждая миграция выполняется в собственной транзакции. Менять уже
//! выпущенную миграцию нельзя — только добавлять следующую.

pub static MIGRATIONS: &[&str] = &[V1_INITIAL, V2_NORMALIZE_TIMESTAMPS, V3_DOCUMENT_EXTENSION_AND_TAGS];

const V1_INITIAL: &str = r#"
-- ---------- Справочники ----------

-- Места хранения. Раньше это была свободная строка сразу в трёх таблицах,
-- из-за чего опечатку было не отличить от настоящего склада.
CREATE TABLE locations (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    archived_at TEXT
);

CREATE TABLE categories (
    id        INTEGER PRIMARY KEY,
    name      TEXT NOT NULL,
    parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX categories_unique_name
    ON categories(name, IFNULL(parent_id, -1));

CREATE TABLE tags (
    id   INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

-- ---------- Номенклатура ----------

-- Ни количества, ни места хранения здесь нет: и то и другое живёт в stock.
CREATE TABLE items (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL,
    category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    unit            TEXT NOT NULL DEFAULT 'шт',
    reference_price REAL,
    min_stock       INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    barcode         TEXT,
    description     TEXT,
    url             TEXT,
    image_path      TEXT,
    archived_at     TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX items_barcode ON items(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX items_category ON items(category_id);

CREATE TABLE item_tags (
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
    PRIMARY KEY (item_id, tag_id)
);

-- ---------- Остатки ----------

-- Единственный источник правды по количеству.
-- Общий остаток товара — это SUM(quantity) по его строкам, отдельного поля нет.
CREATE TABLE stock (
    item_id     INTEGER NOT NULL REFERENCES items(id)     ON DELETE CASCADE,
    location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
    quantity    INTEGER NOT NULL CHECK (quantity >= 0),
    updated_at  TEXT NOT NULL,
    PRIMARY KEY (item_id, location_id)
);
CREATE INDEX stock_location ON stock(location_id);

-- ---------- Конфигурации ----------

-- Рецепт: из каких позиций собирается результат. Результат — обычная позиция
-- номенклатуры и лежит на складе как всё остальное, поэтому «сколько собрано»
-- это просто её остаток.
CREATE TABLE configurations (
    id             INTEGER PRIMARY KEY,
    name           TEXT NOT NULL,
    description    TEXT,
    result_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
    archived_at    TEXT,
    created_at     TEXT NOT NULL
);

CREATE TABLE configuration_items (
    configuration_id INTEGER NOT NULL REFERENCES configurations(id) ON DELETE CASCADE,
    item_id          INTEGER NOT NULL REFERENCES items(id)          ON DELETE RESTRICT,
    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (configuration_id, item_id)
);

-- ---------- Журнал операций ----------

-- Заменяет component_paths, supply_records, scrapped_items,
-- component_usage_history, configuration_builds и configuration_assembled:
-- всё это описывало одно и то же событие с разных сторон.
CREATE TABLE operations (
    id               INTEGER PRIMARY KEY,
    kind             TEXT NOT NULL CHECK (kind IN
                       ('receipt','transfer','writeoff','assembly','disassembly','correction')),
    performed_at     TEXT NOT NULL,
    performed_by     TEXT,
    note             TEXT,
    configuration_id INTEGER REFERENCES configurations(id) ON DELETE SET NULL
);
CREATE INDEX operations_at ON operations(performed_at DESC);
CREATE INDEX operations_kind ON operations(kind);

-- Смысл строки задаётся тем, какие места заполнены:
--   приход      from IS NULL, to = склад
--   перемещение from = склад А, to = склад Б
--   списание    from = склад, to IS NULL
CREATE TABLE operation_lines (
    id               INTEGER PRIMARY KEY,
    operation_id     INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
    item_id          INTEGER NOT NULL REFERENCES items(id)      ON DELETE RESTRICT,
    from_location_id INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
    to_location_id   INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    unit_price       REAL,
    CHECK (from_location_id IS NOT NULL OR to_location_id IS NOT NULL),
    CHECK (from_location_id IS NULL OR to_location_id IS NULL
           OR from_location_id != to_location_id)
);
CREATE INDEX lines_operation ON operation_lines(operation_id);
CREATE INDEX lines_item      ON operation_lines(item_id);
CREATE INDEX lines_from      ON operation_lines(from_location_id);
CREATE INDEX lines_to        ON operation_lines(to_location_id);

-- ---------- Документы ----------

-- Файлы лежат на диске в <app_data>/documents, в базе только метаданные.
-- Раньше содержимое хранилось в base64 прямо в таблице и занимало 94% файла БД.
CREATE TABLE documents (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL,
    rel_path    TEXT NOT NULL,
    mime        TEXT,
    size_bytes  INTEGER NOT NULL,
    sha256      TEXT NOT NULL,
    category    TEXT,
    description TEXT,
    uploaded_by TEXT,
    uploaded_at TEXT NOT NULL
);
CREATE INDEX documents_hash ON documents(sha256);

CREATE TABLE document_items (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    item_id     INTEGER NOT NULL REFERENCES items(id)     ON DELETE CASCADE,
    PRIMARY KEY (document_id, item_id)
);
"#;

/// Приведение отметок времени к одному виду.
///
/// В колонках сошлись три формата: «2026-02-05» из совсем старых записей,
/// «2026-02-05T07:05:30.052Z» из прежней версии приложения и
/// «2026-08-19T04:37:56.965878600+00:00» из Rust. Сравниваются они между собой
/// неправильно, а журнал сортируется именно сравнением строк — из-за чего
/// записи разных эпох вставали не в том порядке. Здесь всё сводится к
/// «YYYY-MM-DDTHH:MM:SS.sssZ», который now_iso пишет и дальше.
const V2_NORMALIZE_TIMESTAMPS: &str = r#"
UPDATE operations SET performed_at = CASE
    WHEN length(performed_at) = 10   THEN performed_at || 'T00:00:00.000Z'
    WHEN performed_at LIKE '%+00:00' THEN substr(performed_at, 1, 23) || 'Z'
    ELSE performed_at END;

UPDATE items SET
    created_at = CASE
        WHEN length(created_at) = 10   THEN created_at || 'T00:00:00.000Z'
        WHEN created_at LIKE '%+00:00' THEN substr(created_at, 1, 23) || 'Z'
        ELSE created_at END,
    updated_at = CASE
        WHEN length(updated_at) = 10   THEN updated_at || 'T00:00:00.000Z'
        WHEN updated_at LIKE '%+00:00' THEN substr(updated_at, 1, 23) || 'Z'
        ELSE updated_at END;

UPDATE stock SET updated_at = CASE
    WHEN length(updated_at) = 10   THEN updated_at || 'T00:00:00.000Z'
    WHEN updated_at LIKE '%+00:00' THEN substr(updated_at, 1, 23) || 'Z'
    ELSE updated_at END;

UPDATE configurations SET created_at = CASE
    WHEN length(created_at) = 10   THEN created_at || 'T00:00:00.000Z'
    WHEN created_at LIKE '%+00:00' THEN substr(created_at, 1, 23) || 'Z'
    ELSE created_at END;

UPDATE documents SET uploaded_at = CASE
    WHEN length(uploaded_at) = 10   THEN uploaded_at || 'T00:00:00.000Z'
    WHEN uploaded_at LIKE '%+00:00' THEN substr(uploaded_at, 1, 23) || 'Z'
    ELSE uploaded_at END;

-- Журнал показывается от новых к старым, и выборка ограничена: без этого
-- индекса SQLite перебирает все строки журнала и строит временное дерево
-- сортировки, чтобы отдать последние пятьсот.
CREATE INDEX IF NOT EXISTS operations_at_id ON operations(performed_at DESC, id DESC);
"#;

/// Расширение файла вместо мнимого MIME и теги для документов.
///
/// Колонка называлась `mime`, а хранила расширение — «xlsx», «docx». Rust по
/// ней же определял имя файла на диске, ожидая настоящий MIME-тип: «xlsx» не
/// подходило ни под одно правило, и загруженный файл получал имя `.bin`.
/// Колонка переименована по тому, что в ней на самом деле лежит.
///
/// Теги документов до сих пор были заглушкой: поле в форме заполнялось, но
/// хранить их было негде. Связь устроена так же, как у изделий, и опирается на
/// ту же таблицу тегов.
const V3_DOCUMENT_EXTENSION_AND_TAGS: &str = r#"
ALTER TABLE documents RENAME COLUMN mime TO extension;

CREATE TABLE document_tags (
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    tag_id      INTEGER NOT NULL REFERENCES tags(id)      ON DELETE CASCADE,
    PRIMARY KEY (document_id, tag_id)
);
"#;
