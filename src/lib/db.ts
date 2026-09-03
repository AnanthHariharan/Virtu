/**
 * A small IndexedDB wrapper. No dependency, and it does exactly the five
 * things this app needs.
 *
 * IndexedDB is the source of truth for the UI. Writes land here and return;
 * the sync loop pushes them to Supabase whenever the network and the server
 * are both willing. That is what makes a write in a gym basement
 * indistinguishable from a write at a desk.
 */

const DB_NAME = "virtu";
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
    const req = fn(db.transaction(store, mode).objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export const db = {
  async put<T>(store: Store, value: T): Promise<void> {
    await tx(store, "readwrite", s => s.put(value as any));
  },

  async putAll<T>(store: Store, values: T[]): Promise<void> {
    if (!values.length) return;
    const conn = await open();
    await new Promise<void>((resolve, reject) => {
      const t = conn.transaction(store, "readwrite");
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
    const conn = await open();
    return new Promise<T[]>((resolve, reject) => {
      const req = conn.transaction(store, "readonly")
        .objectStore(store).index(index).getAll(value);
      req.onsuccess = () => resolve(req.result as T[]);
      req.onerror = () => reject(req.error);
    });
  },

  async del(store: Store, key: IDBValidKey): Promise<void> {
    await tx(store, "readwrite", s => s.delete(key) as unknown as IDBRequest<undefined>);
  },
};

/**
 * IndexedDB throws in private windows and wherever site data is blocked.
 * A failed read must never break a render, so every call goes through here.
 */
export async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await fn(); } catch { return fallback; }
}

/** Small typed helpers over the meta store, which is where all settings live. */
export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await safe(() => db.get<{ key: string; value: T }>("meta", key), undefined);
  return row?.value ?? fallback;
}

export async function setMeta<T>(key: string, value: T): Promise<void> {
  await safe(() => db.put("meta", { key, value }), undefined);
}
