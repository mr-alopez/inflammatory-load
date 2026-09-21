/**
 * Storage layer tests — spec v0.6 §11 step 2.
 *
 * Three suites, reported separately:
 *   A. AV-21 — the §8.6a PRE_SCHEMA_2 carve-out
 *   B. Immutability (§8.4) — the property the audit trail rests on
 *   C. Migration (§8.6) — adds fields, alters no value
 */

import { EntryStore, StoreRejection, STORE_ERROR, migrateStore, migrateEntryV1toV2, migrateEntryV2toV3,
  incompleteFields, dayMacroLinePolicy, windowNormalizationStatus } from '../src/store.js';
import { MemoryBackend } from '../src/backends/memory.js';
import { ENTRY_FIELDS, MIGRATION_PROTECTED, STORES, META_KEYS, SCHEMA_VERSION } from '../src/schema.js';
import { scoreEntry } from '../src/scoring.js';
import { buildEntry } from '../src/entry.js';
import { fixtures } from './fixtures.js';

let pass = 0, fail = 0;
const results = { A: [], B: [], C: [] };

function check(suite, label, ok, note = '') {
  ok ? pass++ : fail++;
  results[suite].push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  — ${note}` : ''}`);
}

async function rejects(suite, label, fn, expectedCode) {
  try {
    await fn();
    check(suite, label, false, 'write was ACCEPTED; expected rejection');
  } catch (e) {
    const ok = e instanceof StoreRejection && e.code === expectedCode;
    check(suite, label, ok, ok ? e.code : `threw ${e.code || e.constructor.name}, expected ${expectedCode}`);
  }
}

/* ---------- a real SCHEMA-2 entry, built from the scoring core's output ---------- */

function entryFromScoring(fixtureId, { entry_id, local_date }) {
  const fx = fixtures.find((f) => f.id === fixtureId);
  const r = scoreEntry(fx.record, fx.quantity);
  // buildEntry is the single implementation of §8.4's field list (G1), so a new
  // field cannot be forgotten by one call site and remembered by another.
  return buildEntry(r, fx.record, {
    entry_id,
    product_id: `off:${fixtureId}`,
    food_name: fx.record.name,
    quantity: fx.quantity,
    local_date,
    occasion_category: 'snack',
  });
}

/* ================================================================== *
 * SUITE A — AV-21
 * ================================================================== */

async function suiteA() {
  const backend = new MemoryBackend();
  const store = new EntryStore(backend, { today: '2026-09-15' });

  // A SCHEMA-1 entry: no macros, no basis, no quantity_g, no density.
  const v1 = {
    entry_id: 'e-legacy-1',
    product_id: 'off:legacy',
    source: 'OFF',
    quantity_value: 100,
    quantity_unit: 'g',
    reported: { added_sugar_g: 2.0, sodium_mg: 300, saturated_fat_g: 1.0, fiber_g: 5.0 },
    as_consumed: { added_sugar_g: 2.0, sodium_mg: 300, saturated_fat_g: 1.0, fiber_g: 5.0 },
    occasion_category: 'snack',
    category_map_version: 'CATMAP-1',
    coeff_version: 'COEFF-1',
    score: -0.4,
    local_date: '2026-09-10',
    schema_version: 1,
  };
  await backend.put(STORES.ENTRIES, v1.entry_id, v1);
  await backend.put(STORES.META, META_KEYS.SCHEMA_VERSION, 1);

  const report = await migrateStore(backend);
  const migrated = await store.getEntry('e-legacy-1');

  check('A', 'migration ran', report.from === 1 && report.to === SCHEMA_VERSION && report.migrated === 1,
    `${report.migrated} entry migrated, ${report.from} → ${report.to}`);
  check('A', 'macro_basis stamped PRE_SCHEMA_2', migrated.macro_basis === 'PRE_SCHEMA_2');
  check('A', 'all four macros null', Object.values(migrated.macros).every((v) => v === null));
  check('A', 'source_basis null', migrated.source_basis === null);
  check('A', 'source_basis provenance null', migrated.source_basis_provenance === null);

  // §8.6a: null macros do NOT trigger INCOMPLETE and are not listed in §6.4.
  const inc = incompleteFields(migrated);
  check('A', 'no INCOMPLETE from macro nulls', inc.length === 0, `incompleteFields = [${inc}]`);

  // §8.6a: the day line is OMITTED, not rendered with ` · partial`.
  const policy = dayMacroLinePolicy([migrated]);
  check('A', 'day macro line OMITTED (not PARTIAL)', policy === 'OMIT', `policy = ${policy}`);

  // §4.6 IS still suppressed — the denominator is genuinely absent.
  const norm = windowNormalizationStatus([migrated]);
  check('A', 'window normalization suppressed', norm === 'NO_CALORIE_DATA', `status = ${norm}`);

  // A mixed day (legacy + new) is PARTIAL, not OMIT.
  const fresh = entryFromScoring('AV-1', { entry_id: 'e-new-1', local_date: '2026-09-10' });
  check('A', 'mixed day is PARTIAL not OMIT',
    dayMacroLinePolicy([migrated, fresh]) === 'PARTIAL',
    `policy = ${dayMacroLinePolicy([migrated, fresh])}`);
}

/* ================================================================== *
 * SUITE B — §8.4 immutability
 * ================================================================== */

async function suiteB() {
  const backend = new MemoryBackend();
  const store = new EntryStore(backend, { today: '2026-09-15' });

  const today = entryFromScoring('AV-1', { entry_id: 'e-today', local_date: '2026-09-15' });
  const prior = entryFromScoring('AV-7', { entry_id: 'e-prior', local_date: '2026-09-12' });
  await store.putEntry(today);
  await store.putEntry(prior);

  const before = await store.getEntry('e-today');

  await rejects('B', 'mutate score', () => store.updateEntry('e-today', { score: 99 }), STORE_ERROR.IMMUTABLE_FIELD);
  await rejects('B', 'mutate reported attribute values',
    () => store.updateEntry('e-today', { reported: { added_sugar_g: 0, sodium_mg: 0, saturated_fat_g: 0, fiber_g: 0 } }),
    STORE_ERROR.IMMUTABLE_FIELD);
  await rejects('B', 'mutate as-consumed values',
    () => store.updateEntry('e-today', { as_consumed: { added_sugar_g: 0 } }), STORE_ERROR.IMMUTABLE_FIELD);
  await rejects('B', 'mutate macro values',
    () => store.updateEntry('e-today', { macros: { energy_kcal: 1 } }), STORE_ERROR.IMMUTABLE_FIELD);
  await rejects('B', 'mutate quantity_g', () => store.updateEntry('e-today', { quantity_g: 1 }), STORE_ERROR.IMMUTABLE_FIELD);
  await rejects('B', 'mutate source_basis provenance',
    () => store.updateEntry('e-today', { source_basis_provenance: 'DECLARED' }), STORE_ERROR.IMMUTABLE_FIELD);

  // "Prior days are read-only without exception" — fires before the field check.
  await rejects('B', 'any patch on a prior day', () => store.updateEntry('e-prior', { score: 1 }),
    STORE_ERROR.PRIOR_DAY_READ_ONLY);
  await rejects('B', 'empty patch on a prior day', () => store.updateEntry('e-prior', {}),
    STORE_ERROR.PRIOR_DAY_READ_ONLY);

  await rejects('B', 'overwrite via duplicate entry_id',
    () => store.putEntry({ ...today, score: 0 }), STORE_ERROR.ENTRY_EXISTS);

  // The JS-specific failure mode: a live reference handed back to a caller.
  let threw = false;
  try { before.score = 12345; } catch { threw = true; }
  check('B', 'returned entry is frozen (direct assignment)', threw && before.score !== 12345);

  let nestedThrew = false;
  try { before.macros.energy_kcal = 999; } catch { nestedThrew = true; }
  check('B', 'nested objects frozen (macros)', nestedThrew && before.macros.energy_kcal !== 999);

  const after = await store.getEntry('e-today');
  check('B', 'stored score unchanged after all attempts', after.score === today.score,
    `score = ${after.score}`);
  check('B', 'stored values unchanged after all attempts',
    JSON.stringify(after.reported) === JSON.stringify(today.reported));

  // TREND_EPOCH (§4.5, §8.4)
  const epoch = await store.getTrendEpoch();
  check('B', 'TREND_EPOCH set at first log', epoch === '2026-09-15', `epoch = ${epoch}`);
  await rejects('B', 'TREND_EPOCH cannot be reassigned',
    () => store.setTrendEpoch('2026-01-01'), STORE_ERROR.TREND_EPOCH_IMMUTABLE);
  await store.deleteEntry('e-today');
  check('B', 'deleting first entry does not move TREND_EPOCH',
    (await store.getTrendEpoch()) === '2026-09-15');

  // §8.4 field-list coverage
  const missing = Object.keys(ENTRY_FIELDS).filter((f) => !(f in today));
  check('B', '§8.4 field list fully populated from scoring output', missing.length === 0,
    missing.length ? `missing: ${missing}` : `${Object.keys(ENTRY_FIELDS).length} fields`);
}

/* ================================================================== *
 * SUITE C — §8.6 migration never alters a value
 * ================================================================== */

async function suiteC() {
  const v1 = {
    entry_id: 'e-mig',
    product_id: 'off:mig',
    source: 'OFF',
    quantity_value: 52.7,
    quantity_unit: 'g',
    reported: { added_sugar_g: 27, sodium_mg: 120, saturated_fat_g: 5.0, fiber_g: 1.3 },
    as_consumed: { added_sugar_g: 27, sodium_mg: 120, saturated_fat_g: 5.0, fiber_g: 1.3 },
    occasion_category: 'snack',
    category_map_version: 'CATMAP-1',
    coeff_version: 'COEFF-1',
    score: 4.56,
    local_date: '2026-09-01',
    schema_version: 1,
  };
  const snapshot = JSON.parse(JSON.stringify(v1));
  const migrated = migrateEntryV1toV2(v1);

  for (const field of MIGRATION_PROTECTED) {
    if (field === 'macros') continue;               // added by the migration
    if (field === 'as_consumed') {
      // Macro keys are added as explicit nulls; retrieved values must not move.
      const unchanged = Object.entries(snapshot.as_consumed)
        .every(([k, v]) => migrated.as_consumed[k] === v);
      check('C', `migration preserves ${field}`, unchanged);
      continue;
    }
    check('C', `migration preserves ${field}`,
      JSON.stringify(migrated[field]) === JSON.stringify(snapshot[field]),
      `${JSON.stringify(migrated[field])}`);
  }

  check('C', 'migration adds macros as explicit nulls',
    migrated.macros && Object.values(migrated.macros).every((v) => v === null));
  check('C', 'migration adds quantity_g as null', migrated.quantity_g === null);
  check('C', 'migration adds density fields as null',
    migrated.density_used === null && migrated.density_provenance === null && migrated.density_class === null);
  check('C', 'V1toV2 hop stamps schema_version 2', migrated.schema_version === 2);
  check('C', 'PRE_SCHEMA_2 never set on a new entry',
    entryFromScoring('AV-1', { entry_id: 'x', local_date: '2026-09-15' }).macro_basis === 'SCHEMA_2');
  check('C', 'source record object not mutated in place', v1.macro_basis === undefined);

  /* SCHEMA-2 -> SCHEMA-3 (G1): new fields are ABSENT, not null (D3 precedent). */
  const v3 = migrateEntryV2toV3({ ...snapshot, macro_basis: 'SCHEMA_2', schema_version: 2 });
  check('C', 'SCHEMA-3 migration bumps schema_version', v3.schema_version === 3);
  check('C', 'classification_set is ABSENT, not null', !('classification_set' in v3));
  check('C', 'contributions is ABSENT, not null', !('contributions' in v3));
  check('C', 'migration preserves score across the 2->3 hop', v3.score === snapshot.score);
}

/* ---------------- run ---------------- */

await suiteA();
await suiteB();
await suiteC();

const heads = {
  A: 'SUITE A — AV-21, §8.6a PRE_SCHEMA_2 carve-out',
  B: 'SUITE B — §8.4 immutability (reported separately)',
  C: 'SUITE C — §8.6 migration adds fields, alters no value',
};
for (const k of ['A', 'B', 'C']) {
  console.log(`\n${heads[k]}`);
  console.log('='.repeat(heads[k].length));
  for (const line of results[k]) console.log(line);
}
console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
