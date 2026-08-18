import Database from "@tauri-apps/plugin-sql";
import { dbConfig, DatabaseMigration } from './db-config';
import { dbPool } from './db-pool';
// Revert to existing db-pool implementation; remove modernConnectionManager to avoid vite import errors
import { dbCache, DatabaseCache } from './db-cache';
import { withDatabaseRetry } from './db-retry';
import { batchProcessor } from './db-batch';
import { dbQueue } from './db-queue';

// Simple runtime check: available only inside Tauri desktop runtime
function isTauriRuntime(): boolean {
  try {
    // Check for Tauri v2 API
  if (typeof window !== "undefined" && (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__) {
      console.log('✅ Tauri runtime detected via __TAURI_INTERNALS__');
      return true;
    }
    // Fallback to v1 check
    if (typeof window !== "undefined" && (window as unknown as { __TAURI__?: unknown }).__TAURI__) {
      console.log('✅ Tauri runtime detected via __TAURI__');
      return true;
    }
    console.log('⚠️ Tauri runtime NOT detected');
    return false;
  } catch (error) {
    console.error('❌ Error checking Tauri runtime:', error);
    return false;
  }
}

const LS_KEY = "components_v1";
const LS_CONFIG_KEY = "configurations_v1";
const LS_DOCS_KEY = "documents_v1";

function readComponentsFromLocalStorage(): any[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeComponentsToLocalStorage(rows: any[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(rows));
  } catch (error) {
    console.warn('Failed to write to localStorage:', error);
  }
}

function readConfigurationsFromLocalStorage(): any[] {
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeConfigurationsToLocalStorage(configs: any[]) {
  try {
    localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(configs));
  } catch (error) {
    console.warn('Failed to write to localStorage:', error);
  }
}

function readDocumentsFromLocalStorage(): any[] {
  try {
    const raw = localStorage.getItem(LS_DOCS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeDocumentsToLocalStorage(rows: any[]) {
  try {
    localStorage.setItem(LS_DOCS_KEY, JSON.stringify(rows));
  } catch (error) {
    console.warn('Failed to write to localStorage:', error);
  }
}

// Modern database connection management with pooling
let isPoolInitialized = false;

// Mutex for database operations
let mutexLocked = false;
const mutexQueue: Array<() => void> = [];

async function waitForMutex(): Promise<void> {
  return new Promise((resolve) => {
    if (!mutexLocked) {
      resolve();
    } else {
      mutexQueue.push(resolve);
    }
  });
}

function acquireMutex(): void {
  mutexLocked = true;
}

function releaseMutex(): void {
  mutexLocked = false;
  const next = mutexQueue.shift();
  if (next) {
    next();
  }
}

async function ensurePoolInitialized() {
  if (!isPoolInitialized && isTauriRuntime()) {
    await dbPool.initialize();
    isPoolInitialized = true;
  }
}

export async function getDb(): Promise<Database> {
  if (!isTauriRuntime()) {
    throw new Error('Database is only available in Tauri desktop runtime');
  }
  await ensurePoolInitialized();
  return await dbPool.acquireConnection();
}

export function releaseDb(connection: Database): void {
  dbPool.releaseConnection(connection);
}

/** Выполняет операцию с соединением и гарантированно освобождает его */
async function withDb<T>(fn: (db: Database) => Promise<T>): Promise<T> {
  const db = await getDb();
  try {
    return await fn(db);
  } finally {
    releaseDb(db);
  }
}

export async function initDb() {
  if (!isTauriRuntime()) {
    return; // Browser: use localStorage fallback, do not touch Tauri SQL
  }
  let db: Database | undefined;
  try {
    console.log('🚀 Attempting to initialize database...');

    // Run database migrations
    await DatabaseMigration.checkAndMigrate();

    db = await getDb();
    console.log('✅ Database connection established');

    // Журнал WAL. Настройка хранится в самом файле базы, поэтому достаточно
    // выставить её один раз — дальше она действует для всех соединений.
    // foreign_keys и busy_timeout не трогаем: sqlx, на котором работает
    // tauri-plugin-sql, включает их сам (foreign_keys = ON, busy_timeout = 5s).
    try {
      const journal = await db.select<{ journal_mode: string }[]>("PRAGMA journal_mode = WAL");
      console.log(`✅ Режим журнала: ${journal?.[0]?.journal_mode ?? 'неизвестен'}`);
    } catch (error) {
      console.warn('⚠️ Не удалось включить WAL:', error);
    }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS components (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        location TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL,
        minStock INTEGER DEFAULT 0,
        lastUpdated TEXT,
        imageUrl TEXT,
        imageBase64 TEXT,
        barcode TEXT,
        groupId INTEGER
      );
    `);
    
    // Add optional columns if they don't exist (migration)
    try {
      const tableInfo = await db.select("PRAGMA table_info(components)");
      const cols = (tableInfo as { name: string }[]).map((col) => col.name);
      for (const { col, sql } of [
        { col: 'barcode', sql: 'ALTER TABLE components ADD COLUMN barcode TEXT' },
        { col: 'description', sql: 'ALTER TABLE components ADD COLUMN description TEXT' },
        { col: 'url', sql: 'ALTER TABLE components ADD COLUMN url TEXT' },
        { col: 'archivedAt', sql: 'ALTER TABLE components ADD COLUMN archivedAt TEXT' },
      ]) {
        if (!cols.includes(col)) {
          await db.execute(sql);
          console.log(`✅ Added ${col} column to components table`);
        }
      }
    } catch (error) {
      console.warn('⚠️ Could not check/add component columns:', error);
    }
    
    await db.execute(`
      CREATE TABLE IF NOT EXISTS component_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        componentId INTEGER NOT NULL,
        name TEXT NOT NULL,
        location TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (componentId) REFERENCES components(id)
      );
      CREATE TABLE IF NOT EXISTS component_paths (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        componentId INTEGER NOT NULL,
        stepOrder INTEGER NOT NULL,
        stepName TEXT NOT NULL,
        stepDescription TEXT,
        stepLocation TEXT,
        stepQuantity INTEGER,
        stepPrice REAL,
        stepDate TEXT NOT NULL,
        stepType TEXT NOT NULL, -- 'purchase', 'transfer', 'processing', 'storage'
        FOREIGN KEY (componentId) REFERENCES components(id)
      );
      CREATE TABLE IF NOT EXISTS configurations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        totalValue REAL NOT NULL,
        totalItems INTEGER NOT NULL,
        priority TEXT DEFAULT 'medium',
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS configuration_components (
        configurationId INTEGER NOT NULL,
        componentId INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        PRIMARY KEY (configurationId, componentId)
      );
      CREATE TABLE IF NOT EXISTS scrapped_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        componentId INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        reason TEXT,
        scrappedAt TEXT NOT NULL,
        scrappedBy TEXT,
        FOREIGN KEY (componentId) REFERENCES components(id)
      );
      CREATE TABLE IF NOT EXISTS purchase_recommendations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        componentId INTEGER NOT NULL,
        recommendedQuantity INTEGER NOT NULL,
        priority TEXT DEFAULT 'medium',
        reason TEXT,
        createdAt TEXT NOT NULL,
        isUrgent BOOLEAN DEFAULT 0,
        FOREIGN KEY (componentId) REFERENCES components(id)
      );
      CREATE TABLE IF NOT EXISTS component_usage_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        componentId INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        operationType TEXT NOT NULL, -- 'used', 'purchased', 'scrapped'
        configurationId INTEGER,
        notes TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (componentId) REFERENCES components(id),
        FOREIGN KEY (configurationId) REFERENCES configurations(id)
      );
      CREATE TABLE IF NOT EXISTS configuration_builds (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        configurationId INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        builtAt TEXT NOT NULL,
        builtBy TEXT,
        notes TEXT,
        FOREIGN KEY (configurationId) REFERENCES configurations(id)
      );
      CREATE TABLE IF NOT EXISTS configuration_assembled (
        configurationId INTEGER PRIMARY KEY,
        quantity INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (configurationId) REFERENCES configurations(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        sizeBytes INTEGER NOT NULL,
        componentId INTEGER NOT NULL,
        category TEXT NOT NULL,
        description TEXT,
        tags TEXT,
        uploadedBy TEXT,
        uploadedAt TEXT NOT NULL,
        dataBase64 TEXT NOT NULL,
        FOREIGN KEY (componentId) REFERENCES components(id)
      );
      CREATE TABLE IF NOT EXISTS document_components (
        documentId INTEGER NOT NULL,
        componentId INTEGER NOT NULL,
        PRIMARY KEY (documentId, componentId),
        FOREIGN KEY (documentId) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (componentId) REFERENCES components(id)
      );
      CREATE TABLE IF NOT EXISTS supply_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        componentId INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        suppliedAt TEXT NOT NULL,
        suppliedBy TEXT,
        location TEXT,
        FOREIGN KEY (componentId) REFERENCES components(id)
      );
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parentId INTEGER,
        FOREIGN KEY (parentId) REFERENCES categories(id) ON DELETE SET NULL
      );
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS component_tags (
        componentId INTEGER NOT NULL,
        tagId INTEGER NOT NULL,
        PRIMARY KEY (componentId, tagId),
        FOREIGN KEY (componentId) REFERENCES components(id) ON DELETE CASCADE,
        FOREIGN KEY (tagId) REFERENCES tags(id) ON DELETE CASCADE
      );
    `);
    console.log('✅ All database tables created/verified successfully');

    // Migration: add category and location to configurations (for assembled units on warehouse)
    try {
      const info = await db.select<{ name: string }[]>("PRAGMA table_info(configurations)");
      const hasCategory = info?.some((c) => c.name === "category");
      const hasLocation = info?.some((c) => c.name === "location");
      if (!hasCategory) await db.execute("ALTER TABLE configurations ADD COLUMN category TEXT");
      if (!hasLocation) await db.execute("ALTER TABLE configurations ADD COLUMN location TEXT");
      if (!hasCategory || !hasLocation) console.log("✅ configurations: added category/location columns");
    } catch (e) {
      console.warn("Configurations migration:", e);
    }

    // Seed categories from existing component categories if empty
    try {
      const count = await db.select<{ c: number }[]>("SELECT COUNT(*) as c FROM categories");
      if (count?.[0]?.c === 0) {
        const distinct = await db.select<{ category: string }[]>("SELECT DISTINCT category FROM components WHERE category IS NOT NULL AND category != ''");
        for (const row of distinct || []) {
          if (row.category) await db.execute("INSERT OR IGNORE INTO categories (name, parentId) VALUES (?, NULL)", [row.category]);
        }
        console.log('✅ Seeded categories from components');
      }
    } catch (e) { console.warn('Categories seed:', e); }
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    // ignore in non-tauri
  } finally {
    // Соединение возвращается в пул в любом случае. Раньше освобождение стояло
    // в конце try, и любая ошибка выше навсегда забирала единственное
    // соединение пула — дальше всё упиралось в ожидание и падало.
    if (db) releaseDb(db);
  }
}

export async function getComponents() {
  if (!isTauriRuntime()) {
    return readComponentsFromLocalStorage();
  }
  
  // Check cache first
  const cacheKey = DatabaseCache.getComponentsKey();
  const cached = dbCache.get<any[]>(cacheKey);
  if (cached) {
    console.log(`📦 Loaded ${cached.length} components from cache`);
    return cached;
  }
  
  await waitForMutex();
  acquireMutex();
  let db: Database | undefined;
  try {
    db = await getDb();
    const result = await db.select<any[]>("SELECT * FROM components WHERE archivedAt IS NULL ORDER BY name ASC");
    console.log(`✅ Loaded ${result.length} components`);
    dbCache.set(cacheKey, result, 2 * 60 * 1000);
    return result;
  } catch (error) {
    console.error('❌ Error loading components:', error);
    return readComponentsFromLocalStorage();
  } finally {
    if (db) releaseDb(db);
    releaseMutex();
  }
}

export async function upsertComponent(c: {
  id?: number; name: string; category: string; location: string;
  quantity: number; price?: number; minStock?: number; lastUpdated?: string; barcode?: string;
  description?: string; url?: string; imageUrl?: string; imageBase64?: string;
}) {
  try {
    console.log('🔄 upsertComponent called with:', c);
    
    // Validate data before processing
    const validation = validateComponent(c);
    if (!validation.isValid) {
      console.error('❌ Validation failed:', validation.errors);
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }
    
    console.log('✅ Validation passed');
    const now = new Date().toISOString().split("T")[0];
    if (!isTauriRuntime()) {
      // localStorage fallback
      const list = readComponentsFromLocalStorage();
      if (c.id) {
        const idx = list.findIndex((r) => r.id === c.id);
        if (idx >= 0) list[idx] = { ...list[idx], ...c, lastUpdated: now };
        writeComponentsToLocalStorage(list);
        try { window.dispatchEvent(new CustomEvent('componentsUpdated')); } catch {}
        return c.id;
      } else {
        const newId = (list.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1) || Date.now();
        list.push({ id: newId, ...c, lastUpdated: now });
        writeComponentsToLocalStorage(list);
        try { window.dispatchEvent(new CustomEvent('componentsUpdated')); } catch {}
        return newId;
      }
    }

    // Use queue for database operations to prevent locking
    return await dbQueue.addOperation(async () => {
      return await _upsertComponentInternal(c, now);
    }, c.id ? 1 : 0); // New items have higher priority
  } catch (error) {
    console.error('❌ Error in upsertComponent:', error);
    throw error;
  }
}

// Internal function for upserting components (used by queue)
async function _upsertComponentInternal(c: {
  id?: number; name: string; category: string; location: string;
  quantity: number; price?: number; minStock?: number; lastUpdated?: string; barcode?: string;
  description?: string; url?: string; imageUrl?: string; imageBase64?: string;
}, now: string) {
  if (c.id) {
    // Update existing component
    return await executeTransaction(async (db) => {
      const oldComponent = await db.select<{ quantity: number; name: string; location: string }[]>(
        "SELECT quantity, name, location FROM components WHERE id=?",
        [c.id]
      );

      const oldQuantity = oldComponent?.[0]?.quantity ?? 0;
      const oldLocation = oldComponent?.[0]?.location ?? c.location;
      const supplyDiff = c.quantity - oldQuantity;

      // Уменьшение количества при редактировании больше НЕ считается списанием.
      // Раньше сюда автоматически писалась строка в scrapped_items, из-за чего
      // исправление опечатки попадало в отчёт по списаниям наравне с настоящим
      // выбытием товара. Списание выполняется отдельным действием
      // (scrapFromLocation / scrapAllFromAllLocations + addScrappedItem).

      // If quantity increased, add to supply records
      if (supplyDiff > 0) {
        await db.execute(
          "INSERT INTO supply_records (componentId, quantity, suppliedAt, suppliedBy, location) VALUES (?,?,?,?,?)",
          [c.id, supplyDiff, new Date().toISOString(), 'Пользователь', c.location || oldLocation]
        );
        console.log(`📦 Added supply record: +${supplyDiff} units`);
      }

      await db.execute(
        "UPDATE components SET name=?, category=?, location=?, quantity=?, price=?, minStock=?, lastUpdated=?, barcode=?, description=?, url=?, imageUrl=?, imageBase64=? WHERE id=?",
        [c.name, c.category, c.location, c.quantity, c.price ?? null, c.minStock ?? 0, now, c.barcode ?? null, c.description ?? null, c.url ?? null, c.imageUrl ?? null, c.imageBase64 ?? null, c.id]
      );
      // Invalidate cache
      dbCache.invalidateComponent(c.id);
      dbCache.invalidate('components_list');
      
      try { window.dispatchEvent(new CustomEvent('componentsUpdated')); } catch {}
      console.log(`✅ Component updated with ID: ${c.id}`);
      return c.id;
    });
  } else {
    // Create new component with initial path and group
    return await executeTransaction(async (db) => {
      const insertResult = await db.execute(
        "INSERT INTO components (name, category, location, quantity, price, minStock, lastUpdated, barcode, description, url, imageUrl, imageBase64) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        [c.name, c.category, c.location, c.quantity, c.price ?? null, c.minStock ?? 0, now, c.barcode ?? null, c.description ?? null, c.url ?? null, c.imageUrl ?? null, c.imageBase64 ?? null]
      );
      const newId = insertResult.lastInsertId;
      
      if (!newId) {
        throw new Error('Failed to get component ID');
      }
      
      // Create initial path and group within the same transaction
      console.log('🎯 Creating initial path and group for new component:', newId);
      
      // Insert initial path
      const pathResult = await db.execute(
        "INSERT INTO component_paths (componentId, stepOrder, stepName, stepDescription, stepLocation, stepQuantity, stepPrice, stepDate, stepType) VALUES (?,?,?,?,?,?,?,?,?)",
        [newId, 1, `Поступление на ${c.location}`, 'Начальное размещение товара', c.location, c.quantity, c.price ?? null, now, 'storage']
      );
      
      // Create initial group
      const groupResult = await db.execute(
        "INSERT INTO component_groups (componentId, name, location, quantity, price, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?)",
        [newId, `Поступление на ${c.location}`, c.location, c.quantity, c.price ?? null, now, now]
      );
      // Initial supply record for new component
      await db.execute(
        "INSERT INTO supply_records (componentId, quantity, suppliedAt, suppliedBy, location) VALUES (?,?,?,?,?)",
        [newId, c.quantity, new Date().toISOString(), 'Пользователь', c.location]
      );
      
      console.log('✅ Initial path and group created successfully');
      
      // Invalidate cache
      dbCache.invalidate('components_list');
      
      try { window.dispatchEvent(new CustomEvent('componentsUpdated')); } catch {}
      console.log(`✅ Component created with ID: ${newId}`);
      return newId;
    });
  }
}

/**
 * Убирает товар из оборота, сохраняя всю историю.
 *
 * Физическое удаление для товара с историей невозможно: внешние ключи включены
 * (sqlx выставляет foreign_keys = ON), а перемещения, поставки, списания и
 * документы ссылаются на товар без ON DELETE. Прежняя deleteComponent чистила
 * только configuration_components и падала на любом товаре, у которого есть
 * хоть один этап — то есть на любом, заведённом обычным путём.
 */
export async function archiveComponent(id: number) {
  const archivedAt = new Date().toISOString();
  await withDb((db) =>
    db.execute("UPDATE components SET archivedAt = ? WHERE id = ?", [archivedAt, id])
  );
  dbCache.invalidateComponent(id);
  dbCache.invalidate('components_list');
  try { window.dispatchEvent(new CustomEvent('componentsUpdated')); } catch {}
}

export async function restoreComponent(id: number) {
  await withDb((db) => db.execute("UPDATE components SET archivedAt = NULL WHERE id = ?", [id]));
  dbCache.invalidateComponent(id);
  dbCache.invalidate('components_list');
  try { window.dispatchEvent(new CustomEvent('componentsUpdated')); } catch {}
}

export async function getArchivedComponents() {
  return await withDb((db) =>
    db.select<any[]>("SELECT * FROM components WHERE archivedAt IS NOT NULL ORDER BY archivedAt DESC")
  );
}

/** Сколько записей истории потеряется при безвозвратном удалении товара. */
export async function getComponentReferenceCounts(id: number): Promise<Record<string, number>> {
  const tables = [
    'component_groups', 'component_paths', 'scrapped_items', 'supply_records',
    'component_usage_history', 'purchase_recommendations', 'configuration_components',
    'documents', 'component_tags', 'document_components',
  ];
  return await withDb(async (db) => {
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const rows = await db.select<{ n: number }[]>(
        `SELECT COUNT(*) as n FROM ${table} WHERE componentId = ?`, [id]
      );
      const n = rows?.[0]?.n ?? 0;
      if (n > 0) counts[table] = n;
    }
    return counts;
  });
}

/**
 * Безвозвратно удаляет товар вместе со всей историей.
 *
 * Порядок обязателен: дочерние строки удаляются раньше родительской, иначе
 * внешние ключи не дадут удалить товар.
 */
export async function deleteComponentPermanently(id: number) {
  await withDb(async (db) => {
    // documents.componentId объявлен NOT NULL со ссылкой на товар, поэтому
    // документ нельзя просто отвязать. Если документ привязан ещё к кому-то
    // через document_components — переносим на него, иначе удаляем документ.
    const owned = await db.select<{ id: number }[]>(
      "SELECT id FROM documents WHERE componentId = ?", [id]
    );
    for (const doc of owned || []) {
      const other = await db.select<{ componentId: number }[]>(
        "SELECT componentId FROM document_components WHERE documentId = ? AND componentId != ? LIMIT 1",
        [doc.id, id]
      );
      const heir = other?.[0]?.componentId;
      if (heir) {
        await db.execute("UPDATE documents SET componentId = ? WHERE id = ?", [heir, doc.id]);
      } else {
        await db.execute("DELETE FROM document_components WHERE documentId = ?", [doc.id]);
        await db.execute("DELETE FROM documents WHERE id = ?", [doc.id]);
      }
    }

    for (const sql of [
      "DELETE FROM component_tags WHERE componentId = ?",
      "DELETE FROM document_components WHERE componentId = ?",
      "DELETE FROM configuration_components WHERE componentId = ?",
      "DELETE FROM component_usage_history WHERE componentId = ?",
      "DELETE FROM scrapped_items WHERE componentId = ?",
      "DELETE FROM purchase_recommendations WHERE componentId = ?",
      "DELETE FROM supply_records WHERE componentId = ?",
      "DELETE FROM component_paths WHERE componentId = ?",
      "DELETE FROM component_groups WHERE componentId = ?",
      "DELETE FROM components WHERE id = ?",
    ]) {
      await db.execute(sql, [id]);
    }
  });
  dbCache.invalidateComponent(id);
  dbCache.invalidate('components_list');
  dbCache.invalidate('documents_list');
  try { window.dispatchEvent(new CustomEvent('componentsUpdated')); } catch {}
}

// Configurations persistence
export async function getConfigurations() {
  if (!isTauriRuntime()) {
    return readConfigurationsFromLocalStorage();
  }
  
  // Check cache first
  const cacheKey = DatabaseCache.getConfigurationsKey();
  const cached = dbCache.get<any[]>(cacheKey);
  if (cached) {
    console.log(`📦 Loaded ${cached.length} configurations from cache`);
    return cached;
  }
  
  let db: Database | undefined;
  try {
    db = await getDb();
    const result = await db.select<any[]>(
      "SELECT id, name, description, totalValue, totalItems, createdAt, category, location FROM configurations ORDER BY createdAt DESC"
    );
    dbCache.set(cacheKey, result, 3 * 60 * 1000);
    return result;
  } finally {
    if (db) releaseDb(db);
  }
}

export async function getConfigurationComponents(configurationId: number) {
  if (!isTauriRuntime()) {
    // In browser mode, we need to get components from the configuration object
    const configs = readConfigurationsFromLocalStorage();
    const config = configs.find(c => c.id === configurationId);
    return config ? config.components || [] : [];
  }
  let db: Database | undefined;
  try {
    db = await getDb();
    return await db.select<any[]>(
      "SELECT configurationId, componentId, quantity FROM configuration_components WHERE configurationId=?",
      [configurationId]
    );
  } finally {
    if (db) releaseDb(db);
  }
}

export async function createConfiguration(payload: {
  name: string;
  description?: string;
  components: { componentId: number; quantity: number }[];
  totalValue: number;
  totalItems: number;
}) {
  try {
    // Validate data before processing
    const validation = validateConfiguration(payload);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }
    
    if (!isTauriRuntime()) {
      // Browser mode - save to localStorage
      const configs = readConfigurationsFromLocalStorage();
      const newId = Date.now();
      const createdAt = new Date().toISOString().split("T")[0];
      const newConfig = {
        id: newId,
        name: payload.name,
        description: payload.description || null,
        totalValue: payload.totalValue,
        totalItems: payload.totalItems,
        createdAt,
        components: payload.components
      };
      configs.push(newConfig);
      writeConfigurationsToLocalStorage(configs);
      try { window.dispatchEvent(new CustomEvent('configurationsUpdated')); } catch {}
      return newId;
    }
    
    return await withDb(async (db) => {
      const createdAt = new Date().toISOString().split("T")[0];
      const insertResult = await db.execute(
        "INSERT INTO configurations (name, description, totalValue, totalItems, createdAt) VALUES (?,?,?,?,?)",
        [payload.name, payload.description ?? null, payload.totalValue, payload.totalItems, createdAt]
      );
      const configId = insertResult.lastInsertId;
      if (!configId) throw new Error('Failed to get configuration ID');
      for (const comp of payload.components) {
        await db.execute(
          "INSERT INTO configuration_components (configurationId, componentId, quantity) VALUES (?,?,?)",
          [configId, comp.componentId, comp.quantity]
        );
      }
      dbCache.invalidate('configurations_list');
      try { window.dispatchEvent(new CustomEvent('configurationsUpdated')); } catch {}
      console.log(`✅ Configuration created with ID: ${configId}`);
      return configId;
    });
  } catch (error) {
    console.error('❌ Error creating configuration:', error);
    throw error;
  }
}

export async function deleteConfiguration(id: number) {
  try {
    if (!isTauriRuntime()) {
      // Browser mode - remove from localStorage
      const configs = readConfigurationsFromLocalStorage();
      const filtered = configs.filter(c => c.id !== id);
      writeConfigurationsToLocalStorage(filtered);
      try { window.dispatchEvent(new CustomEvent('configurationsUpdated')); } catch {}
      return;
    }

    await withDb(async (db) => {
      // Порядок важен: сначала удалить/обнулить все зависимые записи, затем саму конфигурацию
      await db.execute("DELETE FROM configuration_assembled WHERE configurationId = ?", [id]);
      await db.execute("DELETE FROM configuration_builds WHERE configurationId = ?", [id]);
      await db.execute("DELETE FROM configuration_components WHERE configurationId = ?", [id]);
      await db.execute("UPDATE component_usage_history SET configurationId = NULL WHERE configurationId = ?", [id]);
      await db.execute("DELETE FROM configurations WHERE id = ?", [id]);
      dbCache.invalidate("configurations_list");
      try {
        window.dispatchEvent(new CustomEvent("configurationsUpdated"));
        window.dispatchEvent(new CustomEvent("componentsUpdated"));
      } catch {}
      console.log(`✅ Configuration deleted with ID: ${id}`);
    });
  } catch (error) {
    console.error("❌ Error deleting configuration:", error);
    throw error;
  }
}

/** Обновить категорию и/или расположение конфигурации (для отображения на складе) */
export async function updateConfiguration(
  id: number,
  updates: { category?: string; location?: string }
) {
  if (!isTauriRuntime()) return;
  const set: string[] = [];
  const values: (string | null)[] = [];
  if (updates.category !== undefined) {
    set.push("category = ?");
    values.push(updates.category?.trim() || null);
  }
  if (updates.location !== undefined) {
    set.push("location = ?");
    values.push(updates.location?.trim() || null);
  }
  if (set.length === 0) return;
  values.push(String(id));
  await withDb((db) =>
    db.execute(`UPDATE configurations SET ${set.join(", ")} WHERE id = ?`, values)
  );
  dbCache.invalidate("configurations_list");
  try {
    window.dispatchEvent(new CustomEvent("configurationsUpdated"));
  } catch {}
}

// Scrapped items functions
export async function getScrappedItems() {
  if (!isTauriRuntime()) return [];
  return await withDb((db) => db.select<any[]>(`
    SELECT s.*, c.name as componentName, c.category, c.price 
    FROM scrapped_items s 
    JOIN components c ON s.componentId = c.id 
    ORDER BY s.scrappedAt DESC
  `));
}

export async function getScrappedItemsByComponentId(componentId: number) {
  if (!isTauriRuntime()) return [];
  return await withDb((db) => db.select<any[]>(`
    SELECT s.*, c.name as componentName, c.category, c.price 
    FROM scrapped_items s 
    JOIN components c ON s.componentId = c.id 
    WHERE s.componentId = ?
    ORDER BY s.scrappedAt DESC
  `, [componentId]));
}

export async function getSupplyRecordsByComponentId(componentId: number) {
  if (!isTauriRuntime()) return [];
  return await withDb((db) => db.select<any[]>(
    `SELECT * FROM supply_records WHERE componentId = ? ORDER BY suppliedAt DESC`,
    [componentId]
  ));
}

// --- Categories (tree) ---
const LS_CATEGORIES_KEY = "categories_v1";

function readCategoriesFromLocalStorage(): { id: number; name: string; parentId: number | null }[] {
  try {
    const raw = localStorage.getItem(LS_CATEGORIES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function writeCategoriesToLocalStorage(rows: { id: number; name: string; parentId: number | null }[]) {
  try { localStorage.setItem(LS_CATEGORIES_KEY, JSON.stringify(rows)); } catch {}
}

export interface CategoryNode {
  id: number;
  name: string;
  parentId: number | null;
  children: CategoryNode[];
}

export async function getCategoriesTree(): Promise<CategoryNode[]> {
  if (!isTauriRuntime()) {
    const list = readCategoriesFromLocalStorage();
    const byId = new Map<number, CategoryNode>();
    list.forEach((c) => byId.set(c.id, { ...c, children: [] }));
    byId.forEach((n) => {
      if (n.parentId != null && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(n);
    });
    return [...byId.values()].filter((n) => n.parentId == null);
  }
  return await withDb(async (db) => {
    const rows = await db.select<{ id: number; name: string; parentId: number | null }[]>(
      "SELECT id, name, parentId FROM categories ORDER BY name"
    );
    const list = rows || [];
    const byId = new Map<number, CategoryNode>();
    list.forEach((c) => byId.set(c.id, { ...c, parentId: c.parentId ?? null, children: [] }));
    byId.forEach((n) => {
      if (n.parentId != null && byId.has(n.parentId)) byId.get(n.parentId)!.children.push(n);
    });
    return [...byId.values()].filter((n) => n.parentId == null).sort((a, b) => a.name.localeCompare(b.name));
  });
}

/** All category names (flat), and for each id the list of names that are this category or any descendant (for filter) */
export async function getCategoryNamesForFilter(selectedId: number | null): Promise<string[] | null> {
  if (selectedId == null) return null;
  const tree = await getCategoriesTree();
  const collect = (node: CategoryNode): string[] => {
    const names = [node.name];
    node.children.forEach((c) => names.push(...collect(c)));
    return names;
  };
  const find = (nodes: CategoryNode[], id: number): CategoryNode | null => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const inChild = find(n.children, id);
      if (inChild) return inChild;
    }
    return null;
  };
  const node = find(tree, selectedId);
  return node ? collect(node) : null;
}

export async function getAllCategoryNames(): Promise<string[]> {
  if (!isTauriRuntime()) return readCategoriesFromLocalStorage().map((c) => c.name);
  return await withDb(async (db) => {
    const rows = await db.select<{ name: string }[]>("SELECT name FROM categories ORDER BY name");
    return (rows || []).map((r) => r.name);
  });
}

export async function createCategory(name: string, parentId: number | null): Promise<number> {
  const n = name.trim();
  if (!n) throw new Error("Название категории обязательно");
  if (!isTauriRuntime()) {
    const list = readCategoriesFromLocalStorage();
    const id = (list.reduce((m, r) => Math.max(m, r.id), 0) + 1) || Date.now();
    list.push({ id, name: n, parentId });
    writeCategoriesToLocalStorage(list);
    return id;
  }
  return await dbPool.executeWithConnection(async (db) => {
    await db.execute("INSERT INTO categories (name, parentId) VALUES (?, ?)", [n, parentId]);
    const res = await db.select<{ id: number }[]>("SELECT last_insert_rowid() as id");
    return res?.[0]?.id ?? 0;
  });
}

export async function updateCategory(id: number, name: string): Promise<void> {
  const n = name.trim();
  if (!n) throw new Error("Название категории обязательно");
  if (!isTauriRuntime()) {
    const list = readCategoriesFromLocalStorage();
    const idx = list.findIndex((c) => c.id === id);
    if (idx < 0) throw new Error("Категория не найдена");
    list[idx] = { ...list[idx], name: n };
    writeCategoriesToLocalStorage(list);
    return;
  }
  await withDb(async (db) => {
    await db.execute("UPDATE categories SET name = ? WHERE id = ?", [n, id]);
    dbCache.invalidate("components_list");
  });
}

export async function deleteCategory(id: number, reassignToName: string | null): Promise<void> {
  if (!isTauriRuntime()) {
    const list = readCategoriesFromLocalStorage();
    const cat = list.find((c) => c.id === id);
    if (!cat) return;
    const newName = reassignToName?.trim() || "Без категории";
    const rest = list.filter((c) => c.id !== id);
    writeCategoriesToLocalStorage(rest);
    const comps = readComponentsFromLocalStorage();
    comps.forEach((c: any) => { if (c.category === cat.name) c.category = newName; });
    writeComponentsToLocalStorage(comps);
    return;
  }
  await withDb(async (db) => {
    const row = await db.select<{ name: string }[]>("SELECT name FROM categories WHERE id = ?", [id]);
    const oldName = row?.[0]?.name;
    const newName = (reassignToName?.trim() || "Без категории");
    await db.execute("UPDATE components SET category = ? WHERE category = ?", [newName, oldName]);
    await db.execute("UPDATE categories SET parentId = NULL WHERE parentId = ?", [id]);
    await db.execute("DELETE FROM categories WHERE id = ?", [id]);
    dbCache.invalidate("components_list");
  });
}

// --- Tags ---
const LS_TAGS_KEY = "tags_v1";
const LS_COMPONENT_TAGS_KEY = "component_tags_v1";

function readTagsFromLocalStorage(): { id: number; name: string }[] {
  try {
    const raw = localStorage.getItem(LS_TAGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function writeTagsToLocalStorage(rows: { id: number; name: string }[]) {
  try { localStorage.setItem(LS_TAGS_KEY, JSON.stringify(rows)); } catch {}
}
function readComponentTagsFromLocalStorage(): { componentId: number; tagId: number }[] {
  try {
    const raw = localStorage.getItem(LS_COMPONENT_TAGS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function writeComponentTagsToLocalStorage(rows: { componentId: number; tagId: number }[]) {
  try { localStorage.setItem(LS_COMPONENT_TAGS_KEY, JSON.stringify(rows)); } catch {}
}

export async function getTags(): Promise<{ id: number; name: string }[]> {
  if (!isTauriRuntime()) return readTagsFromLocalStorage();
  return await withDb((db) => db.select<any[]>("SELECT id, name FROM tags ORDER BY name").then((rows) => rows || []));
}

export async function createTag(name: string): Promise<number> {
  const n = name.trim();
  if (!n) throw new Error("Название тега обязательно");
  if (!isTauriRuntime()) {
    const list = readTagsFromLocalStorage();
    const exists = list.some((t) => t.name.toLowerCase() === n.toLowerCase());
    if (exists) throw new Error("Тег с таким названием уже есть");
    const id = (list.reduce((m, r) => Math.max(m, r.id), 0) + 1) || Date.now();
    list.push({ id, name: n });
    writeTagsToLocalStorage(list);
    return id;
  }
  return await dbPool.executeWithConnection(async (db) => {
    await db.execute("INSERT INTO tags (name) VALUES (?)", [n]);
    const res = await db.select<{ id: number }[]>("SELECT last_insert_rowid() as id");
    return res?.[0]?.id ?? 0;
  });
}

export async function updateTag(id: number, name: string): Promise<void> {
  const n = name.trim();
  if (!n) throw new Error("Название тега обязательно");
  if (!isTauriRuntime()) {
    const list = readTagsFromLocalStorage();
    const idx = list.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error("Тег не найден");
    list[idx] = { ...list[idx], name: n };
    writeTagsToLocalStorage(list);
    return;
  }
  await withDb((db) => db.execute("UPDATE tags SET name = ? WHERE id = ?", [n, id]));
}

export async function deleteTag(id: number): Promise<void> {
  if (!isTauriRuntime()) {
    const list = readTagsFromLocalStorage().filter((t) => t.id !== id);
    writeTagsToLocalStorage(list);
    const ct = readComponentTagsFromLocalStorage().filter((r) => r.tagId !== id);
    writeComponentTagsToLocalStorage(ct);
    return;
  }
  await withDb(async (db) => {
    await db.execute("DELETE FROM component_tags WHERE tagId = ?", [id]);
    await db.execute("DELETE FROM tags WHERE id = ?", [id]);
  });
}

export async function getComponentTagIds(componentId: number): Promise<number[]> {
  if (!isTauriRuntime()) {
    return readComponentTagsFromLocalStorage()
      .filter((r) => r.componentId === componentId)
      .map((r) => r.tagId);
  }
  return await withDb(async (db) => {
    const rows = await db.select<{ tagId: number }[]>("SELECT tagId FROM component_tags WHERE componentId = ?", [componentId]);
    return (rows || []).map((r) => r.tagId);
  });
}

export async function setComponentTags(componentId: number, tagIds: number[]): Promise<void> {
  if (!isTauriRuntime()) {
    const ct = readComponentTagsFromLocalStorage().filter((r) => r.componentId !== componentId);
    tagIds.forEach((tagId) => ct.push({ componentId, tagId }));
    writeComponentTagsToLocalStorage(ct);
    return;
  }
  await withDb(async (db) => {
    await db.execute("DELETE FROM component_tags WHERE componentId = ?", [componentId]);
    for (const tagId of tagIds) {
      await db.execute("INSERT OR IGNORE INTO component_tags (componentId, tagId) VALUES (?,?)", [componentId, tagId]);
    }
    dbCache.invalidateComponent(componentId);
    dbCache.invalidate("components_list");
  });
}

/** Returns map componentId -> tag names for all components */
export async function getComponentTagsMap(): Promise<Record<number, string[]>> {
  const map: Record<number, string[]> = {};
  if (!isTauriRuntime()) {
    const tags = readTagsFromLocalStorage();
    const ct = readComponentTagsFromLocalStorage();
    ct.forEach(({ componentId, tagId }) => {
      const name = tags.find((t) => t.id === tagId)?.name;
      if (name) {
        if (!map[componentId]) map[componentId] = [];
        map[componentId].push(name);
      }
    });
    return map;
  }
  return await withDb(async (db) => {
    const rows = await db.select<{ componentId: number; name: string }[]>(
      `SELECT ct.componentId, t.name FROM component_tags ct JOIN tags t ON t.id = ct.tagId`
    );
    (rows || []).forEach((r) => {
      if (!map[r.componentId]) map[r.componentId] = [];
      map[r.componentId].push(r.name);
    });
    return map;
  });
}

export async function getConfigurationsByComponentId(componentId: number) {
  if (!isTauriRuntime()) return [];
  return await withDb((db) => db.select<any[]>(`
    SELECT cfg.id, cfg.name, cfg.description, cfg.totalValue, cfg.totalItems, cc.quantity
    FROM configuration_components cc
    JOIN configurations cfg ON cfg.id = cc.configurationId
    WHERE cc.componentId = ?
    ORDER BY cfg.name
  `, [componentId]));
}

/** Возвращает только документы-сертификаты, привязанные к изделию */
export async function getCertificatesByComponentId(componentId: number): Promise<Array<{id:number; name:string; type:string; category:string; dataBase64:string}>> {
  if (!isTauriRuntime()) {
    const list = readDocumentsFromLocalStorage();
    const certCat = (c: string) => (c || '').toLowerCase().includes('сертификат') || (c || '').toLowerCase() === 'certificate';
    return list.filter((d: any) => {
      const ids = d.componentIds || (d.legacyComponentId ? [d.legacyComponentId] : []);
      const linked = Array.isArray(ids) ? ids.includes(componentId) : Number(d.componentId) === componentId;
      return linked && certCat(d.category || '');
    }).map((d: any) => ({ id: d.id, name: d.name, type: d.type, category: d.category, dataBase64: d.dataBase64 || '' }));
  }
  return await withDb(async (db) => {
    const rows = await db.select<any[]>(`
      SELECT d.id, d.name, d.type, d.category, d.dataBase64
      FROM documents d
      JOIN document_components dc ON dc.documentId = d.id AND dc.componentId = ?
      WHERE LOWER(d.category) LIKE '%сертификат%' OR LOWER(d.category) = 'certificate'
      ORDER BY d.uploadedAt DESC
    `, [componentId]);
    return rows || [];
  });
}

// Component paths functions
export async function getComponentPaths(componentId: number) {
  if (!isTauriRuntime()) return [];
  
  // Check cache first
  const cacheKey = DatabaseCache.getComponentPathsKey(componentId);
  const cached = dbCache.get<any[]>(cacheKey);
  if (cached) {
    console.log(`📦 Loaded ${cached.length} paths from cache for component ${componentId}`);
    return cached;
  }
  
  await waitForMutex();
  acquireMutex();
  let db: Database | undefined;
  try {
    db = await getDb();
    const result = await db.select<any[]>(`
      SELECT * FROM component_paths 
      WHERE componentId = ? 
      ORDER BY stepOrder ASC
    `, [componentId]);
    dbCache.set(cacheKey, result, 5 * 60 * 1000);
    return result;
  } catch (error) {
    console.error('❌ Error getting component paths:', error);
    return [];
  } finally {
    if (db) releaseDb(db);
    releaseMutex();
  }
}

export async function addComponentPath(payload: {
  componentId: number;
  stepName: string;
  stepDescription?: string;
  stepLocation?: string;
  stepQuantity?: number;
  stepPrice?: number;
  stepType: 'purchase' | 'transfer' | 'processing' | 'storage';
}) {
  return await withDb(async (db) => {
    const existingPaths = await db.select<any[]>(`
      SELECT stepOrder FROM component_paths
      WHERE componentId = ?
      ORDER BY stepOrder DESC LIMIT 1
    `, [payload.componentId]);
    const nextOrder = existingPaths.length > 0 ? existingPaths[0].stepOrder + 1 : 1;
    const stepDate = new Date().toISOString();
    const inserted = await db.execute(`
      INSERT INTO component_paths (componentId, stepOrder, stepName, stepDescription, stepLocation, stepQuantity, stepPrice, stepDate, stepType)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      payload.componentId, nextOrder, payload.stepName, payload.stepDescription || null,
      payload.stepLocation || null, payload.stepQuantity || null, payload.stepPrice || null,
      stepDate, payload.stepType
    ]);
    if (payload.stepLocation && payload.stepQuantity && payload.stepQuantity > 0) {
      const existingGroups = await db.select<any[]>(`
        SELECT * FROM component_groups
        WHERE componentId = ? AND location = ? AND (price = ? OR (price IS NULL AND ? IS NULL))
      `, [payload.componentId, payload.stepLocation, payload.stepPrice, payload.stepPrice]);
      if (existingGroups.length === 0) {
        // Раньше здесь вызывалась публичная addComponentGroup, которая берёт
        // соединение своим withDb. В пуле одно соединение, и оно уже занято
        // текущим вызовом — внутренний уходил в ожидание на 100 попыток,
        // падал, а catch возвращал Date.now() как признак успеха. Итог:
        // несколько секунд подвисания и молча не созданная группа.
        await addComponentGroupOn(db, {
          componentId: payload.componentId,
          name: `${payload.stepName} - ${payload.stepLocation}`,
          location: payload.stepLocation,
          quantity: payload.stepQuantity,
          price: payload.stepPrice
        });
      } else {
        await db.execute(`
          UPDATE component_groups SET quantity = quantity + ?, updatedAt = ? WHERE id = ?
        `, [payload.stepQuantity, stepDate, existingGroups[0].id]);
      }
    }
    dbCache.invalidate(`component_${payload.componentId}_paths`);
    dbCache.invalidate(`component_${payload.componentId}_groups`);
    return inserted.lastInsertId;
  });
}

// Component groups functions
export async function getComponentGroups(componentId: number) {
  if (!isTauriRuntime()) return [];
  
  // Check cache first
  const cacheKey = DatabaseCache.getComponentGroupsKey(componentId);
  const cached = dbCache.get<any[]>(cacheKey);
  if (cached) {
    console.log(`📦 Loaded ${cached.length} groups from cache for component ${componentId}`);
    return cached;
  }
  
  // Wait for mutex and acquire it
  await waitForMutex();
  acquireMutex();
  
  let db: Database | undefined;
  try {
    db = await getDb();
    const result = await db.select<any[]>(`
      SELECT * FROM component_groups 
      WHERE componentId = ? 
      ORDER BY createdAt DESC
    `, [componentId]);
    dbCache.set(cacheKey, result, 5 * 60 * 1000);
    return result;
  } catch (error) {
    console.error('❌ Error getting component groups:', error);
    return [];
  } finally {
    if (db) releaseDb(db);
    releaseMutex();
  }
}

/**
 * Схлопывает группы-дубли по паре «место хранения, цена».
 *
 * Количество из удаляемых групп переносится в остающуюся. Раньше лишние группы
 * просто удалялись, и их количество пропадало со склада — каждый вызов молча
 * уменьшал остатки.
 */
export async function cleanupDuplicateGroups(componentId: number) {
  return await withDb(async (db) => {
    const duplicates = await db.select<{ ids: string; total: number }[]>(`
      SELECT GROUP_CONCAT(id) as ids, SUM(quantity) as total
      FROM component_groups
      WHERE componentId = ?
      GROUP BY location, price
      HAVING COUNT(*) > 1
    `, [componentId]);

    let merged = 0;
    for (const duplicate of duplicates || []) {
      const ids = String(duplicate.ids)
        .split(',')
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => Number.isFinite(id));
      if (ids.length < 2) continue;

      const [keep, ...drop] = ids;
      await db.execute(
        'UPDATE component_groups SET quantity = ?, updatedAt = ? WHERE id = ?',
        [duplicate.total, new Date().toISOString(), keep]
      );
      for (const idToDelete of drop) {
        await db.execute('DELETE FROM component_groups WHERE id = ?', [idToDelete]);
      }
      merged += drop.length;
    }

    dbCache.invalidate(`component_${componentId}_groups`);
    return merged;
  });
}

// Scrap from specific location
export async function scrapFromLocation(componentId: number, location: string, quantity: number) {
  return await withDb(async (db) => {
    const groups = await db.select<any[]>(
      'SELECT * FROM component_groups WHERE componentId = ? AND location = ?',
      [componentId, location]
    );
    if (groups.length === 0) throw new Error(`No group found for location: ${location}`);
    const group = groups[0];
    const newQuantity = Math.max(0, group.quantity - quantity);
    if (newQuantity === 0) {
      await db.execute('DELETE FROM component_groups WHERE id = ?', [group.id]);
    } else {
      const now = new Date().toISOString();
      await db.execute(
        'UPDATE component_groups SET quantity = ?, updatedAt = ? WHERE id = ?',
        [newQuantity, now, group.id]
      );
    }
    const allGroups = await db.select<any[]>(
      'SELECT SUM(quantity) as total FROM component_groups WHERE componentId = ?',
      [componentId]
    );
    const totalQuantity = allGroups[0]?.total || 0;
    await db.execute('UPDATE components SET quantity = ? WHERE id = ?', [totalQuantity, componentId]);
    return newQuantity;
  });
}

// Scrap all from all locations
export async function scrapAllFromAllLocations(componentId: number) {
  await withDb(async (db) => {
    await db.execute('DELETE FROM component_groups WHERE componentId = ?', [componentId]);
    await db.execute('UPDATE components SET quantity = 0 WHERE id = ?', [componentId]);
  });
}

interface ComponentGroupPayload {
  componentId: number;
  name: string;
  location: string;
  quantity: number;
  price?: number;
}

/**
 * Вариант для работы на уже открытом соединении.
 *
 * В пуле одно соединение, поэтому функция, вызванная изнутри другой функции,
 * не может взять своё — получится взаимоблокировка. Все операции, которые
 * нужно выполнять в связке, должны идти через такие внутренние варианты.
 */
async function addComponentGroupOn(db: Database, payload: ComponentGroupPayload) {
  const now = new Date().toISOString();
  const inserted = await db.execute(`
    INSERT INTO component_groups (componentId, name, location, quantity, price, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    payload.componentId, payload.name, payload.location, payload.quantity,
    payload.price ?? null, now, now
  ]);
  dbCache.invalidate(`component_${payload.componentId}_paths`);
  dbCache.invalidate(`component_${payload.componentId}_groups`);
  return inserted.lastInsertId;
}

export async function addComponentGroup(payload: ComponentGroupPayload) {
  return await withDb((db) => addComponentGroupOn(db, payload));
}

export async function updateComponentGroup(payload: {
  groupId: number;
  name?: string;
  location?: string;
  quantity?: number;
  price?: number;
}) {
  return await withDb(async (db) => {
    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: (string | number)[] = [];
    if (payload.name !== undefined) { updates.push('name = ?'); values.push(payload.name); }
    if (payload.location !== undefined) { updates.push('location = ?'); values.push(payload.location); }
    if (payload.quantity !== undefined) { updates.push('quantity = ?'); values.push(payload.quantity); }
    if (payload.price !== undefined) { updates.push('price = ?'); values.push(payload.price); }
    updates.push('updatedAt = ?');
    values.push(now, payload.groupId);
    const result = await db.execute(`UPDATE component_groups SET ${updates.join(', ')} WHERE id = ?`, values);
    dbCache.invalidate('component_');
    return result.rowsAffected;
  });
}

// Documents persistence
export async function getDocuments() {
  try {
    if (!isTauriRuntime()) {
      return readDocumentsFromLocalStorage();
    }
    
    // Check cache first
    const cacheKey = DatabaseCache.getDocumentsKey();
    const cached = dbCache.get<any[]>(cacheKey);
    if (cached) {
      console.log(`📦 Loaded ${cached.length} documents from cache`);
      return cached;
    }
    
    return await withDb(async (db) => {
      const documents = await db.select<any[]>(
        `SELECT d.id, d.name, d.type, d.sizeBytes, d.category, d.description, d.tags, d.uploadedBy, d.uploadedAt, d.dataBase64,
                GROUP_CONCAT(dc.componentId) AS componentIds,
                d.componentId as legacyComponentId
         FROM documents d
         LEFT JOIN document_components dc ON dc.documentId = d.id
         GROUP BY d.id
         ORDER BY d.uploadedAt DESC`
      );
      dbCache.set(cacheKey, documents, 5 * 60 * 1000);
      return documents;
    });
  } catch (error) {
    console.error('❌ Error loading documents:', error);
    return [];
  }
}

export async function addDocument(payload: {
  name: string;
  type: string;
  sizeBytes: number;
  componentIds: number[];
  category: string;
  description?: string;
  tags?: string[];
  uploadedBy?: string;
  dataBase64: string; // base64 without data: prefix
}) {
  try {
    // Validate data before processing
    const validation = validateDocument({
      ...payload,
      componentId: payload.componentIds?.[0] ?? 0,
      componentIds: payload.componentIds,
    } as any);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }
    
    const now = new Date().toISOString();
    if (!isTauriRuntime()) {
      const list = readDocumentsFromLocalStorage();
      const newId = (list.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1) || Date.now();
      list.push({
        id: newId,
        name: payload.name,
        type: payload.type,
        sizeBytes: payload.sizeBytes,
        componentIds: payload.componentIds,
        category: payload.category,
        description: payload.description || "",
        tags: payload.tags || [],
        uploadedBy: payload.uploadedBy || "Пользователь",
        uploadedAt: now.split("T")[0],
        dataBase64: payload.dataBase64,
      });
      writeDocumentsToLocalStorage(list);
      try { window.dispatchEvent(new CustomEvent('documentsUpdated')); } catch {}
      return newId;
    }
    
    return await withDb(async (db) => {
      const primaryComponentId = (payload.componentIds && payload.componentIds.length > 0)
        ? payload.componentIds[0]
        : 0;
      const insertResult = await db.execute(
        `INSERT INTO documents (name, type, sizeBytes, componentId, category, description, tags, uploadedBy, uploadedAt, dataBase64)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          payload.name, payload.type, payload.sizeBytes, primaryComponentId,
          payload.category, payload.description ?? null, (payload.tags || []).join(','),
          payload.uploadedBy || null, now, payload.dataBase64,
        ]
      );
      const documentId = insertResult.lastInsertId;
      if (!documentId) throw new Error('Failed to get document ID');
      for (const cid of payload.componentIds || []) {
        await db.execute(`INSERT OR IGNORE INTO document_components (documentId, componentId) VALUES (?,?)`, [documentId, cid]);
      }
      dbCache.invalidate('documents_list');
      try { window.dispatchEvent(new CustomEvent('documentsUpdated')); } catch {}
      return documentId;
    });
  } catch (error) {
    console.error('❌ Error adding document:', error);
    throw error;
  }
}

export async function getDocumentLinks(documentId: number): Promise<number[]> {
  if (!isTauriRuntime()) {
    const list = readDocumentsFromLocalStorage();
    const doc: any = list.find((d: any) => d.id === documentId);
    return doc?.componentIds || [];
  }
  return await withDb(async (db) => {
    const rows = await db.select<any[]>(`SELECT componentId FROM document_components WHERE documentId = ?`, [documentId]);
    return (rows || []).map(r => Number(r.componentId));
  });
}

export async function updateDocumentLinks(documentId: number, componentIds: number[]) {
  if (!isTauriRuntime()) {
    const list = readDocumentsFromLocalStorage();
    const idx = list.findIndex((d: any) => d.id === documentId);
    if (idx >= 0) {
      (list[idx] as any).componentIds = componentIds;
      writeDocumentsToLocalStorage(list);
    }
    try { window.dispatchEvent(new CustomEvent('documentsUpdated')); } catch {}
    return;
  }
  await withDb(async (db) => {
    await db.execute(`DELETE FROM document_components WHERE documentId = ?`, [documentId]);
    for (const cid of componentIds) {
      await db.execute(`INSERT OR IGNORE INTO document_components (documentId, componentId) VALUES (?,?)`, [documentId, cid]);
    }
    dbCache.invalidate('documents_list');
    try { window.dispatchEvent(new CustomEvent('documentsUpdated')); } catch {}
  });
}

export async function deleteDocument(id: number) {
  try {
    if (!isTauriRuntime()) {
      const list = readDocumentsFromLocalStorage();
      writeDocumentsToLocalStorage(list.filter((d) => d.id !== id));
      try { window.dispatchEvent(new CustomEvent('documentsUpdated')); } catch {}
      return;
    }
    
    await withDb((db) => db.execute("DELETE FROM documents WHERE id=?", [id]));
    dbCache.invalidate('documents_list');
    try { window.dispatchEvent(new CustomEvent('documentsUpdated')); } catch {}
  } catch (error) {
    console.error('❌ Error deleting document:', error);
    throw error;
  }
}

export async function addScrappedItem(payload: {
  componentId: number;
  quantity: number;
  reason?: string;
  scrappedBy?: string;
  updateQuantity?: boolean; // Optional flag to control quantity update
}) {
  const scrappedId = await withDb(async (db) => {
    const scrappedAt = new Date().toISOString();
    const inserted = await db.execute(
      "INSERT INTO scrapped_items (componentId, quantity, reason, scrappedAt, scrappedBy) VALUES (?,?,?,?,?)",
      [payload.componentId, payload.quantity, payload.reason || null, scrappedAt, payload.scrappedBy || null]
    );
    if (payload.updateQuantity === true) {
      await db.execute(
        "UPDATE components SET quantity = quantity - ? WHERE id = ?",
        [payload.quantity, payload.componentId]
      );
    }
    return inserted.lastInsertId;
  });
  await addComponentUsageHistory({
    componentId: payload.componentId,
    quantity: payload.quantity,
    operationType: 'scrapped',
    notes: payload.reason
  });
  dbCache.invalidateComponent(payload.componentId);
  dbCache.invalidate('components_list');
  try { window.dispatchEvent(new CustomEvent('componentsUpdated')); } catch {}
  return scrappedId;
}

// Purchase recommendations functions
export async function getPurchaseRecommendations() {
  if (!isTauriRuntime()) return [];
  return await withDb((db) => db.select<any[]>(`
    SELECT p.*, c.name as componentName, c.category, c.price, c.quantity as currentStock
    FROM purchase_recommendations p 
    JOIN components c ON p.componentId = c.id 
    ORDER BY p.isUrgent DESC, p.priority DESC, p.createdAt DESC
  `));
}

export async function addPurchaseRecommendation(payload: {
  componentId: number;
  recommendedQuantity: number;
  priority?: string;
  reason?: string;
  isUrgent?: boolean;
}) {
  return await withDb(async (db) => {
    const createdAt = new Date().toISOString();
    const inserted = await db.execute(
      "INSERT INTO purchase_recommendations (componentId, recommendedQuantity, priority, reason, createdAt, isUrgent) VALUES (?,?,?,?,?,?)",
      [payload.componentId, payload.recommendedQuantity, payload.priority || 'medium', payload.reason || null, createdAt, payload.isUrgent ? 1 : 0]
    );
    return inserted.lastInsertId;
  });
}

// Component usage history functions
export async function getComponentUsageHistory(componentId?: number) {
  if (!isTauriRuntime()) return [];
  return await withDb(async (db) => {
    let query = `
      SELECT h.*, c.name as componentName, c.category, cfg.name as configurationName
      FROM component_usage_history h 
      JOIN components c ON h.componentId = c.id 
      LEFT JOIN configurations cfg ON h.configurationId = cfg.id
    `;
    const params: number[] = [];
    if (componentId) { query += " WHERE h.componentId = ?"; params.push(componentId); }
    query += " ORDER BY h.createdAt DESC";
    return db.select<any[]>(query, params);
  });
}

export async function addComponentUsageHistory(payload: {
  componentId: number;
  quantity: number;
  operationType: 'used' | 'purchased' | 'scrapped';
  configurationId?: number;
  notes?: string;
}) {
  return await withDb(async (db) => {
    const createdAt = new Date().toISOString();
    const inserted = await db.execute(
      "INSERT INTO component_usage_history (componentId, quantity, operationType, configurationId, notes, createdAt) VALUES (?,?,?,?,?,?)",
      [payload.componentId, payload.quantity, payload.operationType, payload.configurationId || null, payload.notes || null, createdAt]
    );
    return inserted.lastInsertId;
  });
}

// Configuration builds functions
export async function getConfigurationBuilds() {
  if (!isTauriRuntime()) return [];
  return await withDb((db) => db.select<any[]>(`
    SELECT b.*, c.name as configurationName, c.totalValue
    FROM configuration_builds b 
    JOIN configurations c ON b.configurationId = c.id 
    ORDER BY b.builtAt DESC
  `));
}

export async function addConfigurationBuild(payload: {
  configurationId: number;
  quantity: number;
  builtBy?: string;
  notes?: string;
}) {
  return await withDb(async (db) => {
    const builtAt = new Date().toISOString();
    const inserted = await db.execute(
      "INSERT INTO configuration_builds (configurationId, quantity, builtAt, builtBy, notes) VALUES (?,?,?,?,?)",
      [payload.configurationId, payload.quantity, builtAt, payload.builtBy || null, payload.notes || null]
    );
    return inserted.lastInsertId;
  });
}

/** Текущее количество собранных единиц по конфигурациям (configurationId -> quantity) */
export async function getAssembledCounts(): Promise<{ configurationId: number; quantity: number }[]> {
  if (!isTauriRuntime()) return [];
  const rows = await withDb((db) =>
    db.select<any[]>("SELECT configurationId, quantity FROM configuration_assembled WHERE quantity > 0")
  );
  return (rows || []).map((r) => ({ configurationId: r.configurationId, quantity: r.quantity }));
}

/** Зарезервировано под конфигурации по componentId (сколько штук "занято" в собранных конфигурациях) */
export async function getReservedQuantities(): Promise<Record<number, number>> {
  if (!isTauriRuntime()) return {};
  const assembled = await getAssembledCounts();
  if (assembled.length === 0) return {};
  const reserved: Record<number, number> = {};
  for (const { configurationId, quantity: assembledQty } of assembled) {
    const recipe = await getConfigurationComponents(configurationId);
    for (const row of recipe as { componentId: number; quantity: number }[]) {
      reserved[row.componentId] = (reserved[row.componentId] || 0) + row.quantity * assembledQty;
    }
  }
  return reserved;
}

/** Общее количество собранных единиц конфигураций (для блока на главной) */
export async function getTotalAssembledCount(): Promise<number> {
  if (!isTauriRuntime()) return 0;
  const rows = await withDb((db) =>
    db.select<{ total: number }[]>("SELECT COALESCE(SUM(quantity), 0) as total FROM configuration_assembled")
  );
  return rows?.[0]?.total ?? 0;
}

/** Сборка конфигурации: резервирует компоненты (увеличивает assembled), без списания со склада. */
export async function assembleConfiguration(payload: {
  configurationId: number;
  quantity: number;
  builtBy?: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!isTauriRuntime()) return { success: false, error: "Только в приложении" };
  const recipe = await getConfigurationComponents(payload.configurationId);
  if (!recipe?.length) return { success: false, error: "У конфигурации нет состава" };
  const reserved = await getReservedQuantities();
  const components = await getComponents();
  for (const row of recipe as { componentId: number; quantity: number }[]) {
    const comp = (components as any[]).find((c: any) => c.id === row.componentId);
    const onStock = comp?.quantity ?? 0;
    const alreadyReserved = reserved[row.componentId] ?? 0;
    const available = onStock - alreadyReserved;
    const need = row.quantity * payload.quantity;
    if (available < need) {
      return {
        success: false,
        error: `Недостаточно "${comp?.name ?? row.componentId}": доступно ${available}, нужно ${need}`,
      };
    }
  }
  await withDb(async (db) => {
    const now = new Date().toISOString();
    await db.execute(
      `INSERT INTO configuration_assembled (configurationId, quantity) VALUES (?, ?)
       ON CONFLICT(configurationId) DO UPDATE SET quantity = quantity + ?`,
      [payload.configurationId, payload.quantity, payload.quantity]
    );
    await db.execute(
      "INSERT INTO configuration_builds (configurationId, quantity, builtAt, builtBy, notes) VALUES (?,?,?,?,?)",
      [payload.configurationId, payload.quantity, now, payload.builtBy ?? null, payload.notes ?? "Сборка"]
    );
  });
  dbCache.invalidate("configurations_list");
  try {
    window.dispatchEvent(new CustomEvent("configurationsUpdated"));
    window.dispatchEvent(new CustomEvent("componentsUpdated"));
  } catch {}
  return { success: true };
}

/** Разборка конфигурации: возвращает компоненты «на склад» (уменьшает assembled). */
export async function disassembleConfiguration(configurationId: number, quantity: number): Promise<{ success: boolean; error?: string }> {
  if (!isTauriRuntime()) return { success: false, error: "Только в приложении" };
  const rows = await withDb((db) =>
    db.select<{ quantity: number }[]>("SELECT quantity FROM configuration_assembled WHERE configurationId = ?", [
      configurationId,
    ])
  );
  const current = rows?.[0]?.quantity ?? 0;
  if (current < quantity) {
    return { success: false, error: `Собрано только ${current}, нельзя разобрать ${quantity}` };
  }
  await withDb(async (db) => {
    if (current === quantity) {
      await db.execute("DELETE FROM configuration_assembled WHERE configurationId = ?", [configurationId]);
    } else {
      await db.execute("UPDATE configuration_assembled SET quantity = quantity - ? WHERE configurationId = ?", [
        quantity,
        configurationId,
      ]);
    }
  });
  dbCache.invalidate("configurations_list");
  try {
    window.dispatchEvent(new CustomEvent("configurationsUpdated"));
    window.dispatchEvent(new CustomEvent("componentsUpdated"));
  } catch {}
  return { success: true };
}

/** Списание конфигурации: уменьшает assembled и списывает компоненты со склада. */
export async function writeOffConfiguration(configurationId: number, quantity: number): Promise<{ success: boolean; error?: string }> {
  if (!isTauriRuntime()) return { success: false, error: "Только в приложении" };
  const rows = await withDb((db) =>
    db.select<{ quantity: number }[]>("SELECT quantity FROM configuration_assembled WHERE configurationId = ?", [
      configurationId,
    ])
  );
  const current = rows?.[0]?.quantity ?? 0;
  if (current < quantity) {
    return { success: false, error: `Собрано только ${current}, нельзя списать ${quantity}` };
  }
  const recipe = await getConfigurationComponents(configurationId) as { componentId: number; quantity: number }[];
  if (!recipe?.length) return { success: false, error: "Нет состава конфигурации" };
  await withDb(async (db) => {
    for (const row of recipe) {
      const toScrap = row.quantity * quantity;
      const compRows = await db.select<{ quantity: number }[]>("SELECT quantity FROM components WHERE id = ?", [
        row.componentId,
      ]);
      const nowQty = compRows?.[0]?.quantity ?? 0;
      const newQty = Math.max(0, nowQty - toScrap);
      await db.execute("UPDATE components SET quantity = ?, lastUpdated = ? WHERE id = ?", [
        newQty,
        new Date().toISOString(),
        row.componentId,
      ]);
    }
    if (current === quantity) {
      await db.execute("DELETE FROM configuration_assembled WHERE configurationId = ?", [configurationId]);
    } else {
      await db.execute("UPDATE configuration_assembled SET quantity = quantity - ? WHERE configurationId = ?", [
        quantity,
        configurationId,
      ]);
    }
  });
  dbCache.invalidate("configurations_list");
  try {
    window.dispatchEvent(new CustomEvent("configurationsUpdated"));
    window.dispatchEvent(new CustomEvent("componentsUpdated"));
  } catch {}
  return { success: true };
}

// Data validation helpers
export function validateComponent(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Название товара обязательно');
  }
  
  if (!data.category || typeof data.category !== 'string' || data.category.trim().length === 0) {
    errors.push('Категория обязательна');
  }
  
  if (!data.location || typeof data.location !== 'string' || data.location.trim().length === 0) {
    errors.push('Расположение обязательно');
  }
  
  if (typeof data.quantity !== 'number' || data.quantity < 0) {
    errors.push('Количество должно быть неотрицательным числом');
  }
  
  if (data.price !== undefined && data.price !== null && (typeof data.price !== 'number' || data.price < 0)) {
    errors.push('Цена должна быть неотрицательным числом');
  }
  
  if (data.minStock !== undefined && data.minStock !== null && (typeof data.minStock !== 'number' || data.minStock < 0)) {
    errors.push('Минимальный запас должен быть неотрицательным числом');
  }
  
  if (data.barcode !== undefined && data.barcode !== null && typeof data.barcode !== 'string') {
    errors.push('Штрихкод должен быть строкой');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateConfiguration(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Название конфигурации обязательно');
  }
  
  if (!Array.isArray(data.components) || data.components.length === 0) {
    errors.push('Конфигурация должна содержать хотя бы один компонент');
  } else {
    data.components.forEach((comp: any, index: number) => {
      if (!comp.componentId || typeof comp.componentId !== 'number') {
        errors.push(`Компонент ${index + 1}: ID компонента обязателен`);
      }
      if (typeof comp.quantity !== 'number' || comp.quantity <= 0) {
        errors.push(`Компонент ${index + 1}: Количество должно быть положительным числом`);
      }
    });
  }
  
  if (typeof data.totalValue !== 'number' || data.totalValue < 0) {
    errors.push('Общая стоимость должна быть неотрицательным числом');
  }
  
  if (typeof data.totalItems !== 'number' || data.totalItems < 0) {
    errors.push('Общее количество должно быть неотрицательным числом');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export function validateDocument(data: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Название документа обязательно');
  }
  
  if (!data.type || typeof data.type !== 'string' || data.type.trim().length === 0) {
    errors.push('Тип документа обязателен');
  }
  
  if (typeof data.sizeBytes !== 'number' || data.sizeBytes <= 0) {
    errors.push('Размер файла должен быть положительным числом');
  }
  
  const hasComponent = (data.componentIds && Array.isArray(data.componentIds) && data.componentIds.length > 0)
    || (data.componentId && typeof data.componentId === 'number' && data.componentId > 0);
  if (!hasComponent) {
    errors.push('Выберите хотя бы одно изделие для привязки документа');
  }
  
  if (!data.category || typeof data.category !== 'string' || data.category.trim().length === 0) {
    errors.push('Категория документа обязательна');
  }
  
  if (!data.dataBase64 || typeof data.dataBase64 !== 'string' || data.dataBase64.trim().length === 0) {
    errors.push('Данные файла обязательны');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// Transaction helper - optimized for SQLite
export async function executeTransaction<T>(operations: (db: Database) => Promise<T>): Promise<T> {
  if (!isTauriRuntime()) {
    return await withDb(operations);
  }
  
  // Не используем явный BEGIN/COMMIT — плагин Tauri SQL уже работает в неявной транзакции,
  // иначе возникает "cannot start a transaction within a transaction"
  return withDatabaseRetry(async () => {
    return dbPool.executeWithConnection(operations);
  });
}

// Clear scrapped items
export async function clearScrappedItems() {
  if (!isTauriRuntime()) return;
  
  try {
    await withDb((db) => db.execute('DELETE FROM scrapped_items'));
    console.log('✅ All scrapped items cleared');
    
    // Dispatch event to update UI
    try { 
      window.dispatchEvent(new CustomEvent('componentsUpdated')); 
    } catch (error) {
    console.warn('Failed to write to localStorage:', error);
  }
  } catch (error) {
    console.error('❌ Error clearing scrapped items:', error);
    throw error;
  }
}

// Cache management functions
export function clearAllCache() {
  dbCache.invalidate();
  console.log('🧹 All cache cleared');
}

export function getCacheStats() {
  return dbCache.getStats();
}

// Force refresh data (bypass cache)
export async function refreshComponents() {
  dbCache.invalidate('components_list');
  return await getComponents();
}

export async function refreshConfigurations() {
  dbCache.invalidate('configurations_list');
  return await getConfigurations();
}

export async function refreshDocuments() {
  dbCache.invalidate('documents_list');
  return await getDocuments();
}

// Database health check
// --- Проверка целостности ---

export interface QuantityMismatch {
  id: number;
  name: string;
  /** Значение в components.quantity */
  total: number;
  /** Сумма по component_groups */
  byLocation: number;
}

export interface MissingLocation {
  id: number;
  name: string;
  quantity: number;
  location: string;
}

export interface IntegrityReport {
  /** Остаток не совпадает с суммой по местам хранения */
  quantityMismatches: QuantityMismatch[];
  /** Ненулевой остаток без единого места хранения */
  missingLocations: MissingLocation[];
  /** Товары, у которых есть группы-дубли по паре «место, цена» */
  duplicateGroupComponents: number[];
  /** Нарушения внешних ключей (штатная проверка SQLite) */
  foreignKeyViolations: number;
  checkedAt: string;
}

/**
 * Ищет расхождения в учёте.
 *
 * Источником правды считается распределение по местам хранения: операции идут
 * над местами, а общий остаток товара их суммирует. Поэтому расхождение — это
 * повод исправить components.quantity, а не наоборот.
 */
export async function checkIntegrity(): Promise<IntegrityReport> {
  return await withDb(async (db) => {
    const mismatches = await db.select<QuantityMismatch[]>(`
      SELECT c.id, c.name, c.quantity AS total,
             COALESCE(SUM(g.quantity), 0) AS byLocation
      FROM components c
      JOIN component_groups g ON g.componentId = c.id
      GROUP BY c.id, c.name, c.quantity
      HAVING c.quantity != COALESCE(SUM(g.quantity), 0)
      ORDER BY c.name
    `);

    const missing = await db.select<MissingLocation[]>(`
      SELECT c.id, c.name, c.quantity, COALESCE(c.location, '') AS location
      FROM components c
      WHERE c.quantity > 0
        AND c.archivedAt IS NULL
        AND NOT EXISTS (SELECT 1 FROM component_groups g WHERE g.componentId = c.id)
      ORDER BY c.name
    `);

    const duplicates = await db.select<{ componentId: number }[]>(`
      SELECT componentId FROM component_groups
      GROUP BY componentId, location, price
      HAVING COUNT(*) > 1
    `);

    const fkRows = await db.select<any[]>("PRAGMA foreign_key_check");

    return {
      quantityMismatches: mismatches || [],
      missingLocations: missing || [],
      duplicateGroupComponents: [...new Set((duplicates || []).map((d) => d.componentId))],
      foreignKeyViolations: (fkRows || []).length,
      checkedAt: new Date().toISOString(),
    };
  });
}

/**
 * Устраняет найденные расхождения, ничего не теряя.
 *
 * Расхождение остатка выравнивается по сумме мест хранения. Товар с остатком,
 * но без мест хранения, не обнуляется — вместо этого ему заводится место по
 * его полю location, чтобы данные пришли к общему виду без потерь.
 */
export async function repairIntegrity(): Promise<{
  quantitiesFixed: number;
  locationsCreated: number;
  duplicatesMerged: number;
}> {
  const report = await checkIntegrity();

  let quantitiesFixed = 0;
  let locationsCreated = 0;
  let duplicatesMerged = 0;

  for (const componentId of report.duplicateGroupComponents) {
    duplicatesMerged += (await cleanupDuplicateGroups(componentId)) ?? 0;
  }

  await withDb(async (db) => {
    for (const item of report.missingLocations) {
      const now = new Date().toISOString();
      await db.execute(`
        INSERT INTO component_groups (componentId, name, location, quantity, price, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, NULL, ?, ?)
      `, [
        item.id,
        `Восстановлено при проверке — ${item.location || 'без места'}`,
        item.location || 'Не указано',
        item.quantity,
        now, now,
      ]);
      locationsCreated += 1;
    }
  });

  // Пересчитываем после схлопывания дублей и создания недостающих мест.
  const afterMerge = await checkIntegrity();
  await withDb(async (db) => {
    for (const item of afterMerge.quantityMismatches) {
      await db.execute(
        "UPDATE components SET quantity = ?, lastUpdated = ? WHERE id = ?",
        [item.byLocation, new Date().toISOString().split("T")[0], item.id]
      );
      quantitiesFixed += 1;
    }
  });

  clearAllCache();
  try { window.dispatchEvent(new CustomEvent('componentsUpdated')); } catch {}

  return { quantitiesFixed, locationsCreated, duplicatesMerged };
}

export async function getDatabaseHealth() {
  try {
    if (!isTauriRuntime()) {
    return {
      status: 'browser_mode',
      message: 'Running in browser mode with localStorage',
      poolStats: null,
      cacheStats: getCacheStats(),
      batchStats: batchProcessor.getStats(),
      queueStats: getQueueStats()
    };
    }

    return await withDb(async (db) => {
      await db.select("SELECT 1 as test");
      return {
        status: 'healthy',
        message: 'Database connection is working properly',
        poolStats: dbPool.getStats(),
        cacheStats: getCacheStats(),
        batchStats: batchProcessor.getStats(),
        queueStats: getQueueStats(),
        timestamp: new Date().toISOString()
      };
    });
  } catch (error) {
    return {
      status: 'error',
      message: `Database error: ${error}`,
      poolStats: null,
      cacheStats: getCacheStats(),
      batchStats: batchProcessor.getStats(),
      queueStats: getQueueStats(),
      timestamp: new Date().toISOString()
    };
  }
}

// Emergency reset function
export async function emergencyReset() {
  console.log('🚨 Performing emergency database reset...');
  
  try {
    // Clear all caches
    clearAllCache();
    
    // Clear all batch operations
    batchProcessor.clearAll();
    
    // Clear operation queue
    dbQueue.clearQueue();
    
    // Reset pool if in Tauri mode
    if (isTauriRuntime()) {
      // Note: Pool reset would require recreating the pool instance
      console.log('⚠️ Pool reset not implemented - restart application if needed');
    }
    
    console.log('✅ Emergency reset completed');
    return true;
  } catch (error) {
    console.error('❌ Emergency reset failed:', error);
    return false;
  }
}

// Queue management functions
export function getQueueStats() {
  return dbQueue.getQueueStats();
}

export async function waitForQueueCompletion() {
  return await dbQueue.waitForCompletion();
}

// Statistics functions
export async function getWarehouseStatistics() {
  if (!isTauriRuntime()) return {
    totalComponents: 0,
    totalValue: 0,
    lowStockItems: 0,
    outOfStockItems: 0,
    totalConfigurations: 0,
    totalBuilds: 0,
    totalScrapped: 0
  };
  
  return await withDb(async (db) => {
    const [components, configurations, builds, scrapped] = await Promise.all([
      db.select<{count: number, totalValue: number, lowStock: number, outOfStock: number}[]>(`
        SELECT 
          COUNT(*) as count,
          COALESCE(SUM(price * quantity), 0) as totalValue,
          SUM(CASE WHEN quantity <= minStock THEN 1 ELSE 0 END) as lowStock,
          SUM(CASE WHEN quantity = 0 THEN 1 ELSE 0 END) as outOfStock
        FROM components
        WHERE archivedAt IS NULL
      `),
      db.select<{count: number}[]>("SELECT COUNT(*) as count FROM configurations"),
      db.select<{count: number}[]>("SELECT COUNT(*) as count FROM configuration_builds"),
      db.select<{count: number}[]>("SELECT COUNT(*) as count FROM scrapped_items")
    ]);
    return {
      totalComponents: components[0]?.count || 0,
      totalValue: components[0]?.totalValue || 0,
      lowStockItems: components[0]?.lowStock || 0,
      outOfStockItems: components[0]?.outOfStock || 0,
      totalConfigurations: configurations[0]?.count || 0,
      totalBuilds: builds[0]?.count || 0,
      totalScrapped: scrapped[0]?.count || 0
    };
  });
}


