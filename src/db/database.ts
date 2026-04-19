import initSqlJs from 'sql.js';

type SqlJsDatabase = any;
import { migrations } from './migrations';

const IDB_NAME = 'gym-tracker-db';
const IDB_STORE = 'database';
const IDB_KEY = 'main';

// --- IndexedDB persistence helpers ---

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadFromIDB(): Promise<Uint8Array | null> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const txn = idb.transaction(IDB_STORE, 'readonly');
    const req = txn.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function saveToIDB(data: Uint8Array): Promise<void> {
  const idb = await openIDB();
  return new Promise((resolve, reject) => {
    const txn = idb.transaction(IDB_STORE, 'readwrite');
    txn.objectStore(IDB_STORE).put(data, IDB_KEY);
    txn.oncomplete = () => resolve();
    txn.onerror = () => reject(txn.error);
  });
}

// --- Database adapter matching expo-sqlite API ---

export class WebDatabase {
  private sqlDb: SqlJsDatabase;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sqlDb: SqlJsDatabase) {
    this.sqlDb = sqlDb;
  }

  async execAsync(sql: string): Promise<void> {
    this.sqlDb.run(sql);
    this.schedulePersist();
  }

  async runAsync(sql: string, params?: unknown[]): Promise<{ lastInsertRowId: number }> {
    this.sqlDb.run(sql, params as any[]);
    const result = this.sqlDb.exec('SELECT last_insert_rowid() as id');
    const lastInsertRowId = (result[0]?.values[0]?.[0] as number) ?? 0;
    this.schedulePersist();
    return { lastInsertRowId };
  }

  async getAllAsync<T>(sql: string, params?: unknown[]): Promise<T[]> {
    const stmt = this.sqlDb.prepare(sql);
    if (params) stmt.bind(params as any[]);
    const results: T[] = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }

  async getFirstAsync<T>(sql: string, params?: unknown[]): Promise<T | null> {
    const results = await this.getAllAsync<T>(sql, params);
    return results[0] ?? null;
  }

  async withExclusiveTransactionAsync(callback: (db: WebDatabase) => Promise<void>): Promise<void> {
    this.sqlDb.run('BEGIN EXCLUSIVE');
    try {
      await callback(this);
      this.sqlDb.run('COMMIT');
    } catch (e) {
      this.sqlDb.run('ROLLBACK');
      throw e;
    }
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      const data = this.sqlDb.export();
      saveToIDB(data).catch((e) => console.error('Failed to persist DB:', e));
    }, 500);
  }

  /** Force an immediate persist (call before page unload). */
  async persistNow(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const data = this.sqlDb.export();
    await saveToIDB(data);
  }
}

// --- Singleton ---

let db: WebDatabase | null = null;

export function getDatabase(): WebDatabase {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export async function initDatabase(): Promise<WebDatabase> {
  if (db) return db;

  const SQL = await initSqlJs({
    locateFile: (file: string) => `/${file}`,
  });

  // Try to load existing DB from IndexedDB
  const saved = await loadFromIDB();
  const sqlDb = saved ? new SQL.Database(saved) : new SQL.Database();

  db = new WebDatabase(sqlDb);

  // Enable foreign keys
  await db.execAsync('PRAGMA foreign_keys = ON');

  // Run migrations
  await runMigrations(db);

  // Sync programs from bundled JSON files
  await syncPrograms(db);

  // Request persistent storage
  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {});
  }

  // Persist on page unload
  window.addEventListener('beforeunload', () => {
    db?.persistNow();
  });

  return db;
}

async function runMigrations(database: WebDatabase): Promise<void> {
  // Ensure migrations table exists
  await database.execAsync(
    `CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`
  );

  for (const migration of migrations) {
    const existing = await database.getFirstAsync<{ version: number }>(
      'SELECT version FROM _migrations WHERE version = ?',
      [migration.version]
    );
    if (existing) continue;

    for (const sql of migration.up) {
      await database.execAsync(sql);
    }
    await database.runAsync(
      'INSERT INTO _migrations (version, applied_at) VALUES (?, ?)',
      [migration.version, new Date().toISOString()]
    );
  }
}

async function syncPrograms(database: WebDatabase): Promise<void> {
  const { programs } = await import('../../programs/index');

  for (let i = 0; i < programs.length; i++) {
    const prog = programs[i];
    const existing = await database.getFirstAsync<{ id: number }>(
      'SELECT id FROM programs WHERE name = ?',
      [prog.name]
    );

    if (!existing) {
      // Import as a new program via the program repository
      const { saveProgram } = await import('./repositories/programRepository');
      await saveProgram(prog);
    }
  }
}
