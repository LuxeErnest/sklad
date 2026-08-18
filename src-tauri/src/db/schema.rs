//! Миграции схемы.
//!
//! Применяются по порядку, номер версии хранится в `PRAGMA user_version`.
//! Каждая миграция выполняется в собственной транзакции. Менять уже
//! выпущенную миграцию нельзя — только добавлять следующую.

pub static MIGRATIONS: &[&str] = &[V1_INITIAL];

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
