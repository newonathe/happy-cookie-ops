/** A tiny promise wrapper over one IndexedDB object store. No dependency, no magic. */
const DB_NAME = 'hc-ops';
const DB_VERSION = 1;
export const SALE_STORE = 'sale-queue';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SALE_STORE)) {
        const store = db.createObjectStore(SALE_STORE, { keyPath: 'clientId' });
        store.createIndex('by-state', 'state');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(SALE_STORE, mode);
    const request = run(transaction.objectStore(SALE_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const idb = {
  put: <T>(value: T) => tx('readwrite', (store) => store.put(value) as IDBRequest<IDBValidKey>),
  all: <T>() => tx('readonly', (store) => store.getAll() as IDBRequest<T[]>),
  get: <T>(key: string) => tx('readonly', (store) => store.get(key) as IDBRequest<T | undefined>),
  delete: (key: string) => tx('readwrite', (store) => store.delete(key) as IDBRequest<undefined>),
  supported: () => typeof indexedDB !== 'undefined'
};
