import Database from "@tauri-apps/plugin-sql";

// Simple runtime check: available only inside Tauri desktop runtime
function isTauriRuntime(): boolean {
  try {
    // @ts-ignore
    return typeof window !== "undefined" && !!(window as any).__TAURI__;
  } catch {
    return false;
  }
}

const LS_KEY = "components_v1";

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
  } catch {}
}

let dbPromise: Promise<Database> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:app.db");
  }
  return dbPromise;
}

export async function initDb() {
  if (!isTauriRuntime()) return; // no-op in browser
  try {
    const db = await getDb();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS components (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        location TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL,
        lastUpdated TEXT
      );
      CREATE TABLE IF NOT EXISTS configurations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        totalValue REAL NOT NULL,
        totalItems INTEGER NOT NULL,
        createdAt TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS configuration_components (
        configurationId INTEGER NOT NULL,
        componentId INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        PRIMARY KEY (configurationId, componentId)
      );
    `);
  } catch {
    // ignore in non-tauri
  }
}

export async function getComponents() {
  if (!isTauriRuntime()) {
    return readComponentsFromLocalStorage();
  }
  try {
    const db = await getDb();
    return await db.select<any[]>("SELECT * FROM components ORDER BY name ASC");
  } catch {
    return readComponentsFromLocalStorage();
  }
}

export async function upsertComponent(c: {
  id?: number; name: string; category: string; location: string;
  quantity: number; price?: number; lastUpdated?: string;
}) {
  const now = new Date().toISOString().split("T")[0];
  if (!isTauriRuntime()) {
    // localStorage fallback
    const list = readComponentsFromLocalStorage();
    if (c.id) {
      const idx = list.findIndex((r) => r.id === c.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...c, lastUpdated: now };
      writeComponentsToLocalStorage(list);
      return c.id;
    } else {
      const newId = (list.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1) || Date.now();
      list.push({ id: newId, ...c, lastUpdated: now });
      writeComponentsToLocalStorage(list);
      return newId;
    }
  }
  const db = await getDb();
  if (c.id) {
    await db.execute(
      "UPDATE components SET name=?, category=?, location=?, quantity=?, price=?, lastUpdated=? WHERE id=?",
      [c.name, c.category, c.location, c.quantity, c.price ?? null, now, c.id]
    );
    return c.id;
  } else {
    await db.execute(
      "INSERT INTO components (name, category, location, quantity, price, lastUpdated) VALUES (?,?,?,?,?,?)",
      [c.name, c.category, c.location, c.quantity, c.price ?? null, now]
    );
    const row = await db.select<{ id: number }[]>("SELECT last_insert_rowid() as id");
    return row[0].id;
  }
}

export async function deleteComponent(id: number) {
  if (!isTauriRuntime()) {
    const list = readComponentsFromLocalStorage();
    writeComponentsToLocalStorage(list.filter((r) => r.id !== id));
    return;
  }
  const db = await getDb();
  await db.execute("DELETE FROM configuration_components WHERE componentId=?", [id]);
  await db.execute("DELETE FROM components WHERE id=?", [id]);
}

// Configurations persistence
export async function getConfigurations() {
  if (!isTauriRuntime()) return [];
  const db = await getDb();
  return db.select<any[]>(
    "SELECT id, name, description, totalValue, totalItems, createdAt FROM configurations ORDER BY createdAt DESC"
  );
}

export async function getConfigurationComponents(configurationId: number) {
  if (!isTauriRuntime()) return [];
  const db = await getDb();
  return db.select<any[]>(
    "SELECT configurationId, componentId, quantity FROM configuration_components WHERE configurationId=?",
    [configurationId]
  );
}

export async function createConfiguration(payload: {
  name: string;
  description?: string;
  components: { componentId: number; quantity: number }[];
  totalValue: number;
  totalItems: number;
}) {
  if (!isTauriRuntime()) return Date.now();
  const db = await getDb();
  const createdAt = new Date().toISOString().split("T")[0];
  await db.execute(
    "INSERT INTO configurations (name, description, totalValue, totalItems, createdAt) VALUES (?,?,?,?,?)",
    [payload.name, payload.description ?? null, payload.totalValue, payload.totalItems, createdAt]
  );
  const row = await db.select<{ id: number }[]>("SELECT last_insert_rowid() as id");
  const configId = row[0].id;
  for (const comp of payload.components) {
    await db.execute(
      "INSERT INTO configuration_components (configurationId, componentId, quantity) VALUES (?,?,?)",
      [configId, comp.componentId, comp.quantity]
    );
  }
  return configId;
}

export async function deleteConfiguration(id: number) {
  if (!isTauriRuntime()) return;
  const db = await getDb();
  await db.execute("DELETE FROM configuration_components WHERE configurationId=?", [id]);
  await db.execute("DELETE FROM configurations WHERE id=?", [id]);
}


