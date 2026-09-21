/**
 * IndexedDB backend — §8.6. Same interface as MemoryBackend.
 *
 * Node has no IndexedDB, so the invariants in src/store.js are exercised
 * against MemoryBackend. This file carries the schema creation and the
 * SCHEMA-1 -> SCHEMA-2 upgrade path only.
 */
import { SCHEMA_VERSION, STORES } from '../schema.js';
import { migrateEntryV1toV2 } from '../store.js';

export const DB_NAME = 'inflammatory-load';

export function openDatabase(indexedDB = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, SCHEMA_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const tx = req.transaction;
      const from = event.oldVersion;

      if (from < 1) {
        db.createObjectStore(STORES.ENTRIES, { keyPath: 'entry_id' });
        db.createObjectStore(STORES.META);
      }
      if (from < 2) {
        if (!db.objectStoreNames.contains(STORES.SAVED_PRODUCTS)) {
          db.createObjectStore(STORES.SAVED_PRODUCTS, { keyPath: 'saved_id' });
        }
        // Add fields to existing entries. Never alters a stored score,
        // attribute value, or macro value (§8.4).
        if (from >= 1) {
          const entries = tx.objectStore(STORES.ENTRIES);
          entries.openCursor().onsuccess = (e) => {
            const cursor = e.target.result;
            if (!cursor) return;
            cursor.update(migrateEntryV1toV2(cursor.value));
            cursor.continue();
          };
        }
      }
    };

    req.onsuccess = () => resolve(new IndexedDbBackend(req.result));
    req.onerror = () => reject(req.error);
  });
}

export class IndexedDbBackend {
  constructor(db) { this.db = db; }

  #tx(store, mode) {
    return this.db.transaction(store, mode).objectStore(store);
  }
  #wrap(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async get(store, key) { return this.#wrap(this.#tx(store, 'readonly').get(key)); }
  async getAll(store) { return this.#wrap(this.#tx(store, 'readonly').getAll()); }
  async delete(store, key) { return this.#wrap(this.#tx(store, 'readwrite').delete(key)); }
  async put(store, key, value) {
    const os = this.#tx(store, 'readwrite');
    // ENTRIES/SAVED_PRODUCTS use an inline keyPath; META is keyed externally.
    return this.#wrap(os.keyPath ? os.put(value) : os.put(value, key));
  }
}
