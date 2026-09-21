/**
 * In-memory backend. Implements the backend interface EntryStore expects.
 * Used by the tests; not shipped in the PWA.
 */
export class MemoryBackend {
  constructor() { this.stores = new Map(); }
  #store(name) {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    return this.stores.get(name);
  }
  async get(store, key) { return this.#store(store).get(key); }
  async put(store, key, value) { this.#store(store).set(key, value); }
  async delete(store, key) { this.#store(store).delete(key); }
  async getAll(store) { return [...this.#store(store).values()]; }
}
