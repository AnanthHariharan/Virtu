/**
 * A very small IndexedDB wrapper. No dependency, ~100 lines, and it does
 * exactly the four things this app needs.
 *
 * IndexedDB is the source of truth for the UI. Writes land here first and
 * return immediately; the sync worker pushes them to Supabase whenever the
 * network and the server are both willing. That is what makes a write in a
 * gym basement indistinguishable from a write at a desk.
 */

const DB_NAME = "nitya";
const DB_VERSION = 1;

export type Store = "events" | "entities" | "meta";

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("events")) {
        const s = db.createObjectStore("events", { keyPath: "client_id" });
        s.createIndex("by_date", "local_date");
        s.createIndex("by_kind", "kind");
        s.createIndex("by_sync", "_sync");
      }
      if (!db.objectStoreNames.contains("entities")) {
        const s = db.createObjectStore("entities", { keyPath: "id" });
        s.createIndex("by_kind", "kind");
        s.createIndex("by_slug", ["kind", "slug"], { unique: false });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: Store, mode: IDBTransactionMode,
               fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const idb = {
  async put<T>(store: Store, value: T): Promise<void> {
    await tx(store, "readwrite", s => s.put(value as any));
  },

  async putAll<T>(store: Store, values: T[]): Promise<void> {
    if (!values.length) return;
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(store, "readwrite");
      const os = t.objectStore(store);
      values.forEach(v => os.put(v as any));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },

  get<T>(store: Store, key: IDBValidKey): Promise<T | undefined> {
    return tx<T | undefined>(store, "readonly", s => s.get(key) as IDBRequest<T | undefined>);
  },

  all<T>(store: Store): Promise<T[]> {
    return tx<T[]>(store, "readonly", s => s.getAll() as IDBRequest<T[]>);
  },

  async byIndex<T>(store: Store, index: string, value: IDBValidKey): Promise<T[]> {
    const db = await open();
    return new Promise<T[]>((resolve, reject) => {
      const req = db.transaction(store, "readonly")
        .objectStore(store).index(index).getAll(value);
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  },

  async del(store: Store, key: IDBValidKey): Promise<void> {
    await tx(store, "readwrite", s => s.delete(key) as unknown as IDBRequest<undefined>);
  },
};

/** IndexedDB throws in private windows and when site data is blocked. Never let that break a render. */
export async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}
