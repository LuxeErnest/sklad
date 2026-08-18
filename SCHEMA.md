# Схема данных — проект под Фазу 2

Черновик для согласования. Код по нему ещё не написан.

## Что не так с текущей схемой

16 таблиц, из которых пять описывают одно и то же событие с разных сторон и расходятся между собой.

**Места хранения — свободный текст.** В живой базе одновременно встречаются `sklad` и `skladв`, `1`, `11`, `111`, `12`, `22`, `33`, `321в`. Отличить опечатку от настоящего склада нельзя ни программно, ни глазами. Переименовать склад невозможно — придётся искать строку по трём таблицам.

**Количество в двух местах.** `components.quantity` и сумма `component_groups.quantity`. В Фазе 1 появилась кнопка, которая их сверяет, но сама причина осталась.

**Журнал и остатки живут независимо.** У товара 1 в `component_paths` записаны приход 10 и перемещение 10, при этом групп у него нет и остаток 0. У товара 6 в этапах приход 23 и перемещение 2, а в группах 16 и 10. Ни одно число не выводится из другого.

**Пять таблиц об одном.** `component_paths`, `supply_records`, `scrapped_items`, `component_usage_history`, `configuration_builds` — это всё «что произошло с товаром». Каждая пишется своим кодом, по своим правилам, и ни одна не полна.

**Цена в двух местах** — `components.price` и `component_groups.price`, причём группы различаются по паре «место, цена». Отсюда же росли группы-дубли.

---

## Принципы новой схемы

1. **Остаток — производная от операций.** Ничего не «устанавливается», всё «происходит». Изменить остаток можно только зарегистрировав операцию.
2. **Одно событие — одна запись.** Приход, перемещение, списание и сборка — строки одного журнала, различающиеся тем, откуда и куда двигался товар.
3. **Места хранения — справочник**, а не строка.
4. **Файлы — на диске**, в базе только метаданные.

---

## Таблицы

### Справочники

```sql
-- Места хранения. Раньше это была строка в трёх разных таблицах.
CREATE TABLE locations (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  archived_at TEXT
);

CREATE TABLE categories (
  id        INTEGER PRIMARY KEY,
  name      TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  UNIQUE (name, parent_id)
);

CREATE TABLE tags (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
```

### Номенклатура

```sql
-- Ни количества, ни места хранения здесь нет: и то и другое — в stock.
CREATE TABLE items (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  unit            TEXT NOT NULL DEFAULT 'шт',
  reference_price REAL,                     -- справочная; фактическая — в строке операции
  min_stock       INTEGER NOT NULL DEFAULT 0,
  barcode         TEXT,
  description     TEXT,
  url             TEXT,
  image_path      TEXT,                     -- файл на диске, не base64
  archived_at     TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE UNIQUE INDEX items_barcode ON items(barcode) WHERE barcode IS NOT NULL;
CREATE INDEX items_active ON items(archived_at) WHERE archived_at IS NULL;

CREATE TABLE item_tags (
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (item_id, tag_id)
);
```

### Остатки

```sql
-- Единственный источник правды по количеству.
-- Общий остаток товара = SUM(quantity) по его строкам.
CREATE TABLE stock (
  item_id     INTEGER NOT NULL REFERENCES items(id)     ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  quantity    INTEGER NOT NULL CHECK (quantity >= 0),
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (item_id, location_id)
);
```

Таблица поддерживается операциями в той же транзакции, что и запись в журнал. Считать остаток каждый раз суммой по журналу было бы честнее, но медленнее; вместо этого проверка целостности сверяет `stock` с журналом — это развитие того, что уже сделано в Фазе 1.

### Журнал операций

Заменяет `component_paths`, `supply_records`, `scrapped_items`, `component_usage_history`, `configuration_builds` и `configuration_assembled`.

```sql
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

CREATE TABLE operation_lines (
  id               INTEGER PRIMARY KEY,
  operation_id     INTEGER NOT NULL REFERENCES operations(id) ON DELETE CASCADE,
  item_id          INTEGER NOT NULL REFERENCES items(id)      ON DELETE RESTRICT,
  from_location_id INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
  to_location_id   INTEGER REFERENCES locations(id) ON DELETE RESTRICT,
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price       REAL,
  CHECK (from_location_id IS NOT NULL OR to_location_id IS NOT NULL)
);

CREATE INDEX lines_item ON operation_lines(item_id);
CREATE INDEX lines_from ON operation_lines(from_location_id);
CREATE INDEX lines_to   ON operation_lines(to_location_id);
```

Смысл строки задаётся тем, что заполнено:

| Событие | `from_location_id` | `to_location_id` | Действие над остатком |
|---|---|---|---|
| Поступление | NULL | склад | + на складе назначения |
| Перемещение | склад А | склад Б | − у А, + у Б |
| Списание | склад | NULL | − на складе |
| Сборка | склад компонентов | NULL | − компоненты… |
| Сборка (результат) | NULL | склад | …+ готовое изделие |
| Корректировка | любое | любое | явное исправление учёта |

**Маршрутный лист склада** — это просто выборка из журнала по месту:

```sql
SELECT * FROM operation_lines
WHERE from_location_id = ?1 OR to_location_id = ?1
ORDER BY operation_id DESC;
```

Ровно то, что просилось: склад знает только про то, что происходило у него, и не зависит от того, одна там штука или тысяча.

### Конфигурации

```sql
-- Рецепт: из каких товаров собирается результат.
-- Результат — обычная позиция номенклатуры, она лежит на складе как всё остальное.
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
```

Сборка — одна операция `kind='assembly'`: строки списания компонентов плюс строка прихода готового изделия. Разборка — обратная операция.

Из этого следует, что таблицы `configuration_assembled` и `configuration_builds` не нужны: **сколько собрано — это остаток результирующего товара**, обычный `stock`. Резервирование исчезает вместе с ними: компоненты не «заняты», они израсходованы.

### Документы

```sql
CREATE TABLE documents (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  rel_path    TEXT NOT NULL,      -- относительно <app_data>/documents
  mime        TEXT,
  size_bytes  INTEGER NOT NULL,
  sha256      TEXT NOT NULL,      -- для распознавания повторной загрузки
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
```

Хеш нужен не ради красоты: в текущей базе четыре документа — это две пары побайтово одинаковых файлов, загруженных дважды. 94% базы сейчас занято их base64.

Легаси-колонка `documents.componentId`, объявленная `NOT NULL` и мешавшая удалению товаров, исчезает — связь только через `document_items`.

---

## Итог по таблицам

| Было (16) | Стало (12) |
|---|---|
| components | items |
| component_groups | stock |
| component_paths, supply_records, scrapped_items, component_usage_history, configuration_builds, configuration_assembled | operations + operation_lines |
| configurations, configuration_components | configurations + configuration_items |
| documents, document_components | documents + document_items |
| categories, tags, component_tags | categories, tags, item_tags |
| — | locations |
| purchase_recommendations | **удаляется** — 0 строк, в интерфейсе не используется |

---

## Миграция

Данные тестовые и их разрешено заводить заново, но перенос всё равно делается — терять их незачем.

1. **locations** — из различных значений `location` в `components`, `component_groups` и `component_paths`. Опечатки не склеиваются автоматически: после переноса в настройках можно объединить `sklad` и `skladв` вручную, уже осмысленно.
2. **items** — из `components` без `quantity` и `location`. `imageBase64` выгружается в файл.
3. **stock** — из `component_groups`, суммированием по паре «товар, место» (текущее деление по цене схлопывается).
4. **operations** — из `component_paths`, `supply_records` и `scrapped_items`, помечаются как импортированные. Восстановить настоящую последовательность нельзя: журнал и остатки в текущей базе не сходятся. Поэтому после импорта добавляется одна операция `correction`, приводящая журнал в соответствие с перенесёнными остатками.
5. **documents** — base64 выгружается в `<app_data>/documents`, дубли по хешу схлопываются в один файл.
6. **configurations** — каждой конфигурации заводится результирующая позиция номенклатуры с её названием.

Миграция идёт в одной транзакции, автоматический бэкап снимается перед началом.

---

## Принятые решения

Согласовано 2026-08-18.

1. **Количества целые.** На складе только штучные позиции, `quantity` остаётся `INTEGER`. Дробные единицы не закладываются — если понадобятся, это будет отдельная миграция.
2. **Цена: справочная плюс фактическая.** У номенклатуры `reference_price`, у каждой строки операции `unit_price`. Остаток цены не несёт. Партионная себестоимость не ведётся.
3. **Отрицательный остаток запрещён.** `CHECK (quantity >= 0)` остаётся: списать больше, чем есть, база не даст. Расхождения вскрываются в момент возникновения, а не накапливаются.

---

## Как это реализуется

Слой данных целиком переезжает в Rust. Вместе с ним уходит `tauri-plugin-sql`: он больше не нужен, а его наличие означало бы две библиотеки SQLite в одном бинарнике.

Вместо него `rusqlite` со встроенной SQLite и единственным соединением под `Mutex`. Это разом снимает то, ради чего в JS были написаны пул, очередь, мьютекс и ретраи: соединение одно, владеет им Rust, доступ к нему сериализован языком, а не самодельной обвязкой.

Транзакция в `rusqlite` — `tx.commit()` с откатом по `Drop`. Забыть про откат невозможно: если функция вернула ошибку раньше `commit`, транзакция отменяется сама. Это и есть главное, чего не хватало: сейчас `executeTransaction` не открывает транзакцию вовсе.

Миграции — по `user_version` базы, в одном файле, применяются по порядку при старте.

Функции в `src/lib/db.ts` становятся тонкими обёртками над `invoke` с прежними сигнатурами, поэтому страницы переписываются только там, где действительно изменилась модель: конфигурации и журнал перемещений.
