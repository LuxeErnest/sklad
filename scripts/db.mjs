#!/usr/bin/env node
/**
 * Чтение рабочей базы без запуска приложения.
 *
 * Работает всегда с копией: приложение может держать файл открытым, а WAL —
 * содержать ещё не перенесённые данные. Копируются оба файла, поэтому картина
 * получается полной, а оригинал не может пострадать даже случайно.
 *
 * Отдельного клиента SQLite ставить не нужно: используется встроенный в Node
 * модуль node:sqlite.
 *
 *   npm run db                       сводка по базе
 *   npm run db -- check              сверка остатков с журналом
 *   npm run db -- sql "SELECT …"     произвольный запрос
 *   npm run db -- tables             таблицы и число строк
 */

import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const APP_DIR = join(process.env.APPDATA ?? "", "com.yourorg.sklad");
const SOURCE = process.env.DB_PATH ?? join(APP_DIR, "warehouse.db");

if (!existsSync(SOURCE)) {
  console.error(`База не найдена: ${SOURCE}\nЗапустите приложение хотя бы раз.`);
  process.exit(1);
}

// Копия, а не оригинал: приложение может писать в него прямо сейчас.
const dir = mkdtempSync(join(tmpdir(), "sklad-db-"));
const copy = join(dir, "snapshot.db");
copyFileSync(SOURCE, copy);
for (const suffix of ["-wal", "-shm"]) {
  if (existsSync(SOURCE + suffix)) copyFileSync(SOURCE + suffix, copy + suffix);
}

const db = new DatabaseSync(copy);
const all = (sql, ...params) => db.prepare(sql).all(...params);
const one = (sql, ...params) => db.prepare(sql).get(...params);

const [command, ...args] = process.argv.slice(2);

/** Расхождение остатков с суммой по журналу — главный инвариант учёта. */
const DRIFT = `
  WITH journal AS (
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
  SELECT i.name AS item, l.name AS location,
         COALESCE(s.quantity, 0) AS stock,
         COALESCE(j.quantity, 0) AS journal
    FROM keys k
    LEFT JOIN stock   s ON s.item_id = k.item_id AND s.location_id = k.location_id
    LEFT JOIN journal j ON j.item_id = k.item_id AND j.location_id = k.location_id
    JOIN items i     ON i.id = k.item_id
    JOIN locations l ON l.id = k.location_id
   WHERE COALESCE(s.quantity, 0) != COALESCE(j.quantity, 0)`;

switch (command) {
  case "sql": {
    const rows = all(args.join(" "));
    console.log(rows.length ? JSON.stringify(rows, null, 2) : "(пусто)");
    break;
  }

  case "tables": {
    for (const { name } of all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )) {
      const { c } = one(`SELECT COUNT(*) AS c FROM "${name}"`);
      console.log(`  ${String(c).padStart(6)}  ${name}`);
    }
    break;
  }

  case "check": {
    const drift = all(DRIFT);
    console.log("расхождений остатков с журналом:", drift.length || "нет");
    drift.forEach((d) =>
      console.log(`  «${d.item}» на «${d.location}»: остаток ${d.stock}, журнал ${d.journal}`)
    );
    const negative = one("SELECT COUNT(*) AS c FROM stock WHERE quantity < 0").c;
    const fk = all("PRAGMA foreign_key_check").length;
    console.log("отрицательных остатков:", negative);
    console.log("нарушений внешних ключей:", fk);
    console.log("целостность файла:", one("PRAGMA integrity_check").integrity_check);
    break;
  }

  default: {
    console.log("база:", SOURCE);
    console.log("версия схемы:", one("PRAGMA user_version").user_version);
    console.log("\n=== остатки по позициям ===");
    for (const r of all(`
      SELECT i.name, COALESCE(SUM(s.quantity), 0) AS total,
             GROUP_CONCAT(l.name || '=' || s.quantity) AS by_location
        FROM items i
        LEFT JOIN stock s     ON s.item_id = i.id
        LEFT JOIN locations l ON l.id = s.location_id
       WHERE i.archived_at IS NULL
       GROUP BY i.id ORDER BY i.name`)) {
      console.log(
        `  ${String(r.total).padStart(6)}  ${r.name}${r.by_location ? "  [" + r.by_location + "]" : ""}`
      );
    }
    console.log("\n=== операции ===");
    for (const r of all("SELECT kind, COUNT(*) AS c FROM operations GROUP BY kind ORDER BY c DESC")) {
      console.log(`  ${String(r.c).padStart(6)}  ${r.kind}`);
    }
    console.log("\nрасхождений с журналом:", all(DRIFT).length || "нет");
  }
}
