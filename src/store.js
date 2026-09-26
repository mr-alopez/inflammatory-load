/**
 * Storage layer — spec v0.6 §11 step 2: §8.4, §8.6 SCHEMA-2, §8.6a carve-out.
 *
 * Backend-agnostic. The IndexedDB backend is src/backends/indexeddb.js; the
 * in-memory backend is src/backends/memory.js and is what the tests drive.
 * Separating them keeps §8.4's invariants testable without a browser, and the
 * invariants are the point of this layer.
 *
 * Out of scope and deliberately absent: display strings, banding, trend
 * rendering, normalization arithmetic, swaps, network, UI.
 */

import {
  SCHEMA_VERSION, STORES, META_KEYS,
  ENTRY_FIELDS, REPORTED_FIELDS, MACRO_FIELDS,
  SCHEMA_2_ADDED_FIELDS,
} from './schema.js';

export const STORE_ERROR = {
  ENTRY_EXISTS: 'ENTRY_EXISTS',
  IMMUTABLE_FIELD: 'IMMUTABLE_FIELD',
  PRIOR_DAY_READ_ONLY: 'PRIOR_DAY_READ_ONLY',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  UNKNOWN_FIELD: 'UNKNOWN_FIELD',
  TREND_EPOCH_IMMUTABLE: 'TREND_EPOCH_IMMUTABLE',
  NO_SUCH_ENTRY: 'NO_SUCH_ENTRY',
  COMBO_COMPONENT_FAILED: 'COMBO_COMPONENT_FAILED',   // §8.5b
};

export class StoreRejection extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.code = code;
    this.detail = detail;
  }
}

/** Deep freeze, applied on write and on read. See README "Storage decisions". */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  for (const k of Object.keys(value)) deepFreeze(value[k]);
  return Object.freeze(value);
}

function deepClone(value) {
  // structuredClone, not a JSON round-trip (E6): JSON maps NaN and Infinity to
  // null and drops undefined. That is a silent corruption path through a store
  // whose whole purpose is an audit trail (§8.4).
  return value === null || typeof value !== 'object' ? value : structuredClone(value);
}

export class EntryStore {
  /**
   * @param backend   see src/backends/memory.js for the interface
   * @param options.today  'YYYY-MM-DD' — injected so the prior-day guard is testable
   */
  constructor(backend, { today } = {}) {
    this.backend = backend;
    this.today = today;
  }

  /* ---------------- §8.4 create ---------------- */

  async putEntry(entry) {
    for (const [field, def] of Object.entries(ENTRY_FIELDS)) {
      if (def.required && (entry[field] === undefined)) {
        throw new StoreRejection(STORE_ERROR.MISSING_REQUIRED_FIELD, field);
      }
    }
    for (const field of Object.keys(entry)) {
      if (!ENTRY_FIELDS[field]) throw new StoreRejection(STORE_ERROR.UNKNOWN_FIELD, field);
    }

    const existing = await this.backend.get(STORES.ENTRIES, entry.entry_id);
    if (existing) throw new StoreRejection(STORE_ERROR.ENTRY_EXISTS, entry.entry_id);

    const record = deepFreeze(deepClone({ ...entry, schema_version: SCHEMA_VERSION }));
    await this.backend.put(STORES.ENTRIES, entry.entry_id, record);

    // §8.4: TREND_EPOCH is written once, at first log, and never moves.
    await this.#initTrendEpochIfUnset(entry.local_date);
    return record;
  }

  async getEntry(entryId) {
    const e = await this.backend.get(STORES.ENTRIES, entryId);
    return e ? deepFreeze(e) : undefined;
  }

  async allEntries() {
    return (await this.backend.getAll(STORES.ENTRIES)).map(deepFreeze);
  }

  /* ---------------- §8.4 immutability ---------------- */

  /**
   * Exists to enforce and prove the rejection. §8.4 names no mutable field, so
   * every patch is refused; the guard reports which rule fired first.
   */
  async updateEntry(entryId, patch) {
    const entry = await this.backend.get(STORES.ENTRIES, entryId);
    if (!entry) throw new StoreRejection(STORE_ERROR.UNKNOWN_FIELD, `no entry ${entryId}`);

    // "Prior days are read-only without exception" — checked before field class,
    // because it refuses even a patch that touched nothing immutable.
    if (this.today && entry.local_date < this.today) {
      throw new StoreRejection(
        STORE_ERROR.PRIOR_DAY_READ_ONLY,
        `entry ${entryId} is dated ${entry.local_date}, before ${this.today}`
      );
    }
    for (const field of Object.keys(patch)) {
      const def = ENTRY_FIELDS[field];
      if (!def) throw new StoreRejection(STORE_ERROR.UNKNOWN_FIELD, field);
      if (def.immutable) {
        throw new StoreRejection(
          STORE_ERROR.IMMUTABLE_FIELD,
          `${field} is immutable once written (§8.4)`
        );
      }
    }
    throw new StoreRejection(STORE_ERROR.IMMUTABLE_FIELD, 'entries are append-only (§8.4)');
  }

  /* ---------------- §8.4 TREND_EPOCH ---------------- */

  async #initTrendEpochIfUnset(localDate) {
    const current = await this.backend.get(STORES.META, META_KEYS.TREND_EPOCH);
    if (current === undefined) {
      await this.backend.put(STORES.META, META_KEYS.TREND_EPOCH, localDate);
    }
  }

  async getTrendEpoch() {
    return this.backend.get(STORES.META, META_KEYS.TREND_EPOCH);
  }

  /** §4.5: immutable, never recomputed, and deleting the first entry does not move it. */
  async setTrendEpoch(date) {
    const current = await this.backend.get(STORES.META, META_KEYS.TREND_EPOCH);
    if (current !== undefined) {
      throw new StoreRejection(
        STORE_ERROR.TREND_EPOCH_IMMUTABLE,
        `TREND_EPOCH is already ${current} and never moves (§4.5, §8.4)`
      );
    }
    await this.backend.put(STORES.META, META_KEYS.TREND_EPOCH, date);
  }

  /**
   * Remove an entry logged today. NOT an edit path — §8.4 stands: no field of a
   * stored entry is mutable, and a correction is still a new entry. This exists
   * for the accidental add, removed on the day it was made.
   *
   * **Today only.** §8.4's "prior days are read-only without exception" governs
   * removal as well as mutation, and removal is the stronger operation. A
   * completed day's `DAY_LOAD`, its §6.3 summary, its band, its §4.6
   * normalization and its §4.5 block are all read from stored entries, so
   * deleting one rewrites a day the user has already been shown a figure for.
   *
   * §4.5 is unchanged: `TREND_EPOCH` is deliberately untouched. The guard does
   * narrow when that clause can fire — a first entry is now deletable only on
   * the day it was logged — but it does not alter what it guarantees.
   */
  async deleteEntry(entryId) {
    const entry = await this.backend.get(STORES.ENTRIES, entryId);

    // §8.4 "Rejection is loud": deleting nothing must not report success. A
    // caller that believes it removed an entry and did not is the same
    // audit-trail failure the write path refuses.
    if (!entry) throw new StoreRejection(STORE_ERROR.NO_SUCH_ENTRY, `no entry ${entryId}`);

    if (this.today && entry.local_date < this.today) {
      throw new StoreRejection(
        STORE_ERROR.PRIOR_DAY_READ_ONLY,
        `entry ${entryId} is dated ${entry.local_date}, before ${this.today} (§8.4)`
      );
    }

    await this.backend.delete(STORES.ENTRIES, entryId);
    // TREND_EPOCH deliberately untouched (§4.5).
  }
}

/* ------------------------------------------------------------------ *
 * §8.5b combos
 * ------------------------------------------------------------------ */

/**
 * A combo is a named list of components. It is NOT a source and NOT a composite
 * record: logging one writes an ordinary entry per component (§3.7 holds).
 *
 * Each component carries the resolved record it was built from, snapshotted at
 * creation as a saved product is (§8.5a), so logging needs no network and
 * produces the same entries every time. Snapshots are deep (§8.4).
 */
export function buildCombo({ combo_id, name, components }) {
  if (!name) throw new StoreRejection(STORE_ERROR.MISSING_REQUIRED_FIELD, 'combo name');
  if (!Array.isArray(components) || components.length === 0) {
    throw new StoreRejection(STORE_ERROR.MISSING_REQUIRED_FIELD, 'combo components');
  }
  for (const c of components) {
    if (!c.record || !c.quantity || !c.food_name) {
      throw new StoreRejection(STORE_ERROR.MISSING_REQUIRED_FIELD,
        'each component needs a record, a quantity and a food_name');
    }
  }
  return deepFreeze(deepClone({
    combo_id: combo_id ?? `combo:${name}`,
    name,
    // §8.5b: the component's ORIGINAL source and product_id are kept. A combo
    // is not a source, so nothing here is restamped SAVED.
    components: components.map((c) => ({
      food_name: c.food_name,
      product_id: c.product_id ?? c.record.product_id ?? `local:${c.food_name}`,
      quantity: { value: c.quantity.value, unit: c.quantity.unit },
      occasion_category: c.occasion_category ?? c.record.occasion_category ?? 'UNCATEGORIZED',
      category_map_version: c.category_map_version ?? c.record.category_map_version ?? 'CATMAP-1',
      record: c.record,
    })),
  }));
}

export class ComboStore {
  constructor(backend) { this.backend = backend; }

  async put(combo) {
    await this.backend.put(STORES.COMBOS, combo.combo_id, combo);
    return combo;
  }

  async get(comboId) {
    const c = await this.backend.get(STORES.COMBOS, comboId);
    return c ? deepFreeze(c) : undefined;
  }

  async all() {
    return (await this.backend.getAll(STORES.COMBOS)).map(deepFreeze);
  }

  async remove(comboId) {
    await this.backend.delete(STORES.COMBOS, comboId);
  }
}

/**
 * §8.5b: logging a combo is ATOMIC — if any component fails to write, none are.
 *
 * The backend has no multi-store transaction across an await boundary we can
 * rely on, so atomicity is achieved by building and validating every entry
 * first, then writing. A partially written combo is a silently wrong day total
 * that §8.4 cannot correct afterwards: entries are immutable, and only today's
 * may be removed. That is why this refuses rather than writes what it can.
 *
 * @param scoreAndBuild (component, meta) => entry — injected so the store stays
 *        free of the scoring core, which it has never imported.
 */
export async function logCombo(store, combo, { local_date, entryId, scoreAndBuild }) {
  const built = [];
  for (const [i, component] of combo.components.entries()) {
    const entry = scoreAndBuild(component, {
      entry_id: entryId(component, i),
      local_date,
      combo_id: combo.combo_id,
      combo_name: combo.name,
    });
    // A component that will not score refuses the whole combo (§8.5b).
    if (!entry) {
      throw new StoreRejection(STORE_ERROR.COMBO_COMPONENT_FAILED,
        `component ${i + 1} (${component.food_name}) did not resolve; no entries written`);
    }
    built.push(entry);
  }

  // Pre-flight every write against the rules that can refuse one, so a refusal
  // lands before anything is stored rather than halfway through.
  const seen = new Set();
  for (const e of built) {
    if (seen.has(e.entry_id) || (await store.getEntry(e.entry_id))) {
      throw new StoreRejection(STORE_ERROR.ENTRY_EXISTS,
        `${e.entry_id} already exists; no entries written (§8.5b)`);
    }
    seen.add(e.entry_id);
  }

  const written = [];
  try {
    for (const e of built) written.push(await store.putEntry(e));
  } catch (err) {
    // Belt and braces: if a write still fails, undo the ones that landed. The
    // pre-flight above should make this unreachable, and it is tested anyway —
    // "should be unreachable" is not a guarantee (§2.5).
    for (const e of written) await store.backend.delete(STORES.ENTRIES, e.entry_id);
    throw err;
  }
  return written;
}

/* ------------------------------------------------------------------ *
 * §8.6 migration
 * ------------------------------------------------------------------ */

/**
 * SCHEMA-1 → SCHEMA-2. Adds fields; alters no stored score, attribute value,
 * or macro value (§8.4, §8.6). Entries it touches are stamped PRE_SCHEMA_2.
 */
export function migrateEntryV1toV2(v1Entry) {
  const migrated = { ...deepClone(v1Entry) };
  for (const field of SCHEMA_2_ADDED_FIELDS) {
    if (migrated[field] === undefined) {
      migrated[field] = field === 'macros'
        ? Object.fromEntries(MACRO_FIELDS.map((f) => [f, null]))
        : null;
    }
  }
  // as_consumed gains macro keys as explicit nulls; retrieved values untouched.
  migrated.as_consumed = { ...migrated.as_consumed };
  for (const f of MACRO_FIELDS) {
    if (migrated.as_consumed[f] === undefined) migrated.as_consumed[f] = null;
  }
  migrated.macro_basis = 'PRE_SCHEMA_2';   // §8.6a; set only by migration
  // Stamp 2, not SCHEMA_VERSION: each hop reports the version it produces, so
  // migrateStore can chain hops and a future SCHEMA-4 does not silently make
  // this one claim to have produced a shape it knows nothing about.
  migrated.schema_version = 2;
  return deepFreeze(migrated);
}

/**
 * SCHEMA-2 → SCHEMA-3 (G1). The three new fields are added as ABSENT, not null,
 * following D3's precedent: `SCHEMA-2` had no concept of them, and a null would
 * assert that the value is unknown rather than that it never existed.
 *
 * §8.6: a migration cannot populate a field whose value is not reconstructible
 * from what was stored. `classification_set` is exactly that — it is gone. Such
 * an entry is permanently unable to render a driver line, and is identifiable
 * as legacy rather than rendering as though it had no drivers (§6.1).
 */
export function migrateEntryV2toV3(v2Entry) {
  const migrated = deepClone(v2Entry);
  // No classification_set, contributions or incomplete key is added. Absence is
  // the signal; see displayable() in src/display.js.
  //
  // Stamps 3, NOT SCHEMA_VERSION. A hop that stamps the current version claims a
  // shape it knows nothing about and causes every later hop to be skipped — the
  // same defect the V1→V2 hop carried. Latent while SCHEMA_VERSION was 3; live
  // the moment SCHEMA-4 landed.
  migrated.schema_version = 3;
  return deepFreeze(migrated);
}

/**
 * SCHEMA-3 → SCHEMA-4 (§8.5b). Adds no key.
 *
 * `combo_id` and `combo_name` are present only on an entry written through a
 * combo. Their ABSENCE is the signal that an entry was not, so a migration that
 * added them as null would assert something about entries logged before combos
 * existed. §8.6: a migration may add a field, but it may not invent a value.
 */
export function migrateEntryV3toV4(v3Entry) {
  const migrated = deepClone(v3Entry);
  migrated.schema_version = 4;
  return deepFreeze(migrated);
}

/**
 * SCHEMA-4 → SCHEMA-5 (§8.5, v2.0). Adds no key: `prefilled_from` and
 * `prefill_changed` are present only on a prefilled manual entry, and their
 * absence is what says an entry was not. Stamps the literal 5 (§8.6).
 */
export function migrateEntryV4toV5(v4Entry) {
  const migrated = deepClone(v4Entry);
  migrated.schema_version = 5;
  return deepFreeze(migrated);
}

export async function migrateStore(backend) {
  const from = (await backend.get(STORES.META, META_KEYS.SCHEMA_VERSION)) ?? 1;
  if (from >= SCHEMA_VERSION) return { migrated: 0, from, to: SCHEMA_VERSION };

  const entries = await backend.getAll(STORES.ENTRIES);
  for (const e of entries) {
    let m = e;
    if ((m.schema_version ?? 1) < 2) m = migrateEntryV1toV2(m);
    if ((m.schema_version ?? 2) < 3) m = migrateEntryV2toV3(m);
    if ((m.schema_version ?? 3) < 4) m = migrateEntryV3toV4(m);
    if ((m.schema_version ?? 4) < 5) m = migrateEntryV4toV5(m);
    await backend.put(STORES.ENTRIES, e.entry_id, m);
  }
  await backend.put(STORES.META, META_KEYS.SCHEMA_VERSION, SCHEMA_VERSION);
  return { migrated: entries.length, from, to: SCHEMA_VERSION };
}

/* ------------------------------------------------------------------ *
 * §8.6a carve-out — decisions, not rendered strings
 * ------------------------------------------------------------------ */

/**
 * §3.2 / §8.6a. Returns the field names that mark an entry INCOMPLETE.
 * A PRE_SCHEMA_2 entry's null macros do not count, and are not listed in §6.4.
 */
export function incompleteFields(entry) {
  const out = [];
  for (const f of REPORTED_FIELDS) {
    if (entry.reported?.[f] === null || entry.reported?.[f] === undefined) out.push(f);
  }
  if (entry.macro_basis !== 'PRE_SCHEMA_2') {
    for (const f of MACRO_FIELDS) {
      if (entry.macros?.[f] === null || entry.macros?.[f] === undefined) out.push(f);
    }
  }
  return out;
}

/**
 * §6.2b / §8.6a. Which day macro line a day's entries call for.
 * Returns a decision, not a string — §6 rendering is §11 step 5.
 *
 *   OMIT    — every entry is PRE_SCHEMA_2; the line is omitted entirely
 *   PARTIAL — at least one entry is missing a macro field
 *   FULL    — all macro fields present on all entries
 */
export function dayMacroLinePolicy(entries) {
  if (entries.length === 0) return 'OMIT';
  if (entries.every((e) => e.macro_basis === 'PRE_SCHEMA_2')) return 'OMIT';
  const anyMissing = entries.some((e) =>
    e.macro_basis === 'PRE_SCHEMA_2' ||
    MACRO_FIELDS.some((f) => e.macros?.[f] === null || e.macros?.[f] === undefined));
  return anyMissing ? 'PARTIAL' : 'FULL';
}

/**
 * §4.6 / §8.6a. Whether a window can be normalized.
 *
 * Step 2 stubbed this (E5); step 4 owns the real implementation, so it is
 * re-exported from src/macros.js rather than duplicated here. A PRE_SCHEMA_2
 * entry (§8.6a) and a NOT_APPLICABLE entry (§3.3c) both suppress it: the
 * denominator is genuinely absent and is never imputed.
 */
export { windowNormalizationStatus } from './macros.js';

/* ------------------------------------------------------------------ *
 * [OPEN-9] — TREND_EPOCH after a full data wipe
 * ------------------------------------------------------------------ */

/**
 * DECIDED (v1.2): a full wipe clears TREND_EPOCH atomically with the entries.
 *
 * §4.5 makes TREND_EPOCH immutable and says deleting the FIRST entry does not
 * move it. A wipe is a different act: it does not move the anchor of a series,
 * it ends the series. The epoch is a property of the entry set, not of the
 * device, so it cannot outlive the set it anchors.
 *
 * Atomicity is the part that matters. Clearing entries while keeping the epoch
 * leaves an anchor with nothing to anchor, and the next log would produce a
 * trend whose leading blocks are all gapped back to a date the user has no
 * memory of. Keeping entries while clearing the epoch is worse.
 *
 * KNOWN ASYMMETRY, reported rather than resolved: deleting every entry one by
 * one is not a wipe, so it leaves TREND_EPOCH standing. Two routes to an empty
 * store therefore yield different epochs. §4.5 makes that correct — the first
 * entry's deletion explicitly does not move the epoch — but it is worth a
 * deliberate decision rather than an emergent one.
 */
export async function wipeAll(backend) {
  const entries = await backend.getAll(STORES.ENTRIES);
  for (const e of entries) await backend.delete(STORES.ENTRIES, e.entry_id);
  await backend.delete(STORES.META, META_KEYS.TREND_EPOCH);
  return { entriesDeleted: entries.length, trendEpochCleared: true };
}
