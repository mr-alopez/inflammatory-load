/**
 * Combos — spec v1.8 §8.5b. Vectors AV-26, AV-27.
 *
 * A combo is a saved shortcut that writes several ORDINARY entries. It is not a
 * composite record and not a source: §3.7 holds, and each component entry is
 * scored, stored and audited exactly as if it had been logged alone.
 *
 * Suites:
 *   AD. AV-26 — a combo writes N ordinary entries, and its components share a
 *       product history with the same product logged directly
 *   AE. AV-27 — a combo write is atomic
 *   AF. §8.5b snapshots, grouping and removal
 */

import { EntryStore, StoreRejection, STORE_ERROR, ComboStore, buildCombo, logCombo }
  from '../src/store.js';
import { MemoryBackend } from '../src/backends/memory.js';
import { scoreEntry } from '../src/scoring.js';
import { buildEntry } from '../src/entry.js';
import { buildCorpus } from '../src/swap.js';
import { SCHEMA_VERSION } from '../src/schema.js';

let pass = 0, fail = 0;
const results = { AD: [], AE: [], AF: [] };
const discrimination = [];

function check(s, label, ok, note = '') {
  ok ? pass++ : fail++;
  results[s].push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  — ${note}` : ''}`);
}
function eq(s, label, actual, expected) {
  check(s, label, actual === expected, `actual ${JSON.stringify(actual)}  expected ${JSON.stringify(expected)}`);
}
async function rejects(s, label, fn, expectedCode) {
  try {
    await fn();
    check(s, label, false, 'ACCEPTED; expected rejection');
    return null;
  } catch (e) {
    const ok = e instanceof StoreRejection && e.code === expectedCode;
    check(s, label, ok, ok ? e.code : `threw ${e.code || e.constructor.name}, expected ${expectedCode}`);
    return e;
  }
}

/* ---------- the worked case from the v1.8 handoff ---------- */

const coffeeRecord = {
  name: 'Coffee, brewed', source: 'USDA', product_id: 'usda:171890', classifications: {},
  density_class: null, bulk_class: null,
  derived_density: { mass_g: 237, volume_ml: 236.5882365 },   // §3.3a step 1, USDA foodPortions
  reported: { added_sugar_g: 0, sodium_mg: 2, saturated_fat_g: 0, fiber_g: 0,
    energy_kcal: 1, protein_g: 0.1, carbohydrate_g: 0, fat_g: 0 },
};
const sugarRecord = {
  name: 'Sugar, granulated', source: 'USDA', product_id: 'usda:169655', classifications: {},
  density_class: null, bulk_class: null,
  derived_density: { mass_g: 200, volume_ml: 236.5882365 },
  reported: { added_sugar_g: 100, sodium_mg: 0, saturated_fat_g: 0, fiber_g: 0,
    energy_kcal: 387, protein_g: 0, carbohydrate_g: 100, fat_g: 0 },
};
const milkRecord = {
  name: 'Lactaid milk', source: 'OFF', product_id: 'off:0041383096014', classifications: {},
  density_class: 'milk', bulk_class: null,
  off: { nutrition_data_per: '100g', quantity: { value: 1890, unit: 'ml' }, serving_size: null },
  reported: { added_sugar_g: 0, sodium_mg: 50, saturated_fat_g: 1.5, fiber_g: 0,
    energy_kcal: 50, protein_g: 3.3, carbohydrate_g: 5, fat_g: 2 },
};

const MORNING = buildCombo({
  combo_id: 'combo:morning-coffee',
  name: 'Morning coffee',
  components: [
    { food_name: 'Coffee, brewed', quantity: { value: 12, unit: 'fl oz' }, record: coffeeRecord, occasion_category: 'beverage' },
    { food_name: 'Sugar, granulated', quantity: { value: 2 / 3, unit: 'tbsp' }, record: sugarRecord, occasion_category: 'beverage' },
    { food_name: 'Lactaid milk', quantity: { value: 2, unit: 'fl oz' }, record: milkRecord, occasion_category: 'beverage' },
  ],
});

/** The injected scorer §8.5b's logCombo takes, so the store never imports scoring. */
function makeScoreAndBuild(idPrefix = 'c') {
  let seq = 0;
  return (component, meta) => {
    const scored = scoreEntry(component.record, component.quantity);
    if (!scored.created) return null;
    return buildEntry(scored, component.record, {
      entry_id: meta.entry_id,
      product_id: component.product_id,
      food_name: component.food_name,
      quantity: component.quantity,
      local_date: meta.local_date,
      occasion_category: component.occasion_category,
      category_map_version: component.category_map_version,
      combo_id: meta.combo_id,
      combo_name: meta.combo_name,
    });
  };
}
const entryId = (prefix) => (component, i) => `${prefix}-${i}`;

/* ================================================================== *
 * SUITE AD — AV-26
 * ================================================================== */

async function suiteAD() {
  const backend = new MemoryBackend();
  const store = new EntryStore(backend, { today: '2026-09-23' });

  // A coffee logged DIRECTLY first, so the combo's coffee can join its history.
  const direct = buildEntry(scoreEntry(coffeeRecord, { value: 8, unit: 'fl oz' }), coffeeRecord, {
    entry_id: 'direct-coffee', product_id: 'usda:171890', food_name: 'Coffee, brewed',
    quantity: { value: 8, unit: 'fl oz' }, local_date: '2026-09-23', occasion_category: 'beverage',
  });
  await store.putEntry(direct);

  const written = await logCombo(store, MORNING, {
    local_date: '2026-09-23', entryId: entryId('m'), scoreAndBuild: makeScoreAndBuild(),
  });

  eq('AD', 'AV-26: three components write THREE entries, not one', written.length, 3);
  const all = await store.allEntries();
  eq('AD', 'AV-26: the store holds four entries (one direct + three)', all.length, 4);

  // §8.5b: ordinary entries. Same shape as anything else.
  check('AD', 'AV-26: every component entry is a full SCHEMA-4 entry',
    written.every((e) => e.schema_version === SCHEMA_VERSION && Number.isFinite(e.score)));
  check('AD', 'AV-26: all three share one local_date',
    new Set(written.map((e) => e.local_date)).size === 1, written[0].local_date);
  check('AD', 'AV-26: all three carry the same combo_id',
    new Set(written.map((e) => e.combo_id)).size === 1, written[0].combo_id);
  eq('AD', 'AV-26: the combo name is stamped at log time', written[0].combo_name, 'Morning coffee');

  // §8.5b: the component's ORIGINAL source survives. A combo is not a source.
  eq('AD', 'AV-26: component sources are USDA, USDA, OFF',
    written.map((e) => e.source).join(','), 'USDA,USDA,OFF');
  check('AD', 'AV-26: no component is restamped SAVED',
    written.every((e) => e.source !== 'SAVED'));
  eq('AD', "AV-26: the coffee keeps its own product_id", written[0].product_id, 'usda:171890');

  // ...which is what lets it join the directly logged coffee's history (§7.2).
  const coffeeEntries = all.filter((e) => e.product_id === 'usda:171890');
  eq('AD', 'AV-26: the coffee product now has TWO stored entries', coffeeEntries.length, 2);
  const corpus = buildCorpus(all, [], { category: 'beverage' });
  check('AD', 'AV-26: two entries put the coffee into §7.2\'s corpus',
    corpus.some((c) => c.product_id === 'usda:171890'),
    corpus.map((c) => c.product_id).join(', ') || '(empty)');

  // The quantities are the component's own, converted per §3.3/§3.3a.
  eq('AD', 'AV-26: the coffee entry stores 12 fl oz as entered',
    `${written[0].quantity_value} ${written[0].quantity_unit}`, '12 fl oz');
  check('AD', 'AV-26: the sugar converts through its USDA-derived density',
    Math.abs(written[1].quantity_g - (14.78676478125 * 2 / 3) * (200 / 236.5882365)) < 1e-9,
    `quantity_g = ${written[1].quantity_g}`);

  discrimination.push(['AV-26', 'a combo implemented as one composite entry', 'categorical',
    '1 entry written vs 3; the coffee product keeps 1 entry vs 2, so §7.2 never offers a swap']);
  discrimination.push(['AV-26', 'restamping components SAVED or with a combo product_id', 'categorical',
    '3 entries either way, but the coffee has 1 entry under its own id vs 2 — corpus still excludes it']);
}

/* ================================================================== *
 * SUITE AE — AV-27
 * ================================================================== */

async function suiteAE() {
  const backend = new MemoryBackend();
  const store = new EntryStore(backend, { today: '2026-09-23' });

  // The third component's entry_id already exists, so §8.4 refuses it.
  await store.putEntry(buildEntry(scoreEntry(milkRecord, { value: 1, unit: 'fl oz' }), milkRecord, {
    entry_id: 'x-2', product_id: 'off:0041383096014', food_name: 'Lactaid milk',
    quantity: { value: 1, unit: 'fl oz' }, local_date: '2026-09-23', occasion_category: 'beverage',
  }));
  const before = (await store.allEntries()).length;

  await rejects('AE', 'AV-27: the combo is refused when one component cannot be written',
    () => logCombo(store, MORNING, {
      local_date: '2026-09-23', entryId: entryId('x'), scoreAndBuild: makeScoreAndBuild(),
    }), STORE_ERROR.ENTRY_EXISTS);

  const after = (await store.allEntries()).length;
  eq('AE', 'AV-27: ZERO new entries were written — not two', after - before, 0);
  eq('AE', 'AV-27: the pre-existing entry is untouched', after, 1);

  // A component that will not SCORE refuses the whole combo too.
  const bad = buildCombo({
    combo_id: 'combo:bad', name: 'Bad combo',
    components: [
      { food_name: 'Coffee, brewed', quantity: { value: 12, unit: 'fl oz' }, record: coffeeRecord },
      // No density class, no derivation, entered by volume: §3.3a refuses it.
      { food_name: 'Mystery', quantity: { value: 1, unit: 'tbsp' },
        record: { ...sugarRecord, product_id: 'off:mystery', derived_density: undefined } },
    ],
  });
  const b2 = new MemoryBackend();
  const s2 = new EntryStore(b2, { today: '2026-09-23' });
  await rejects('AE', 'AV-27: a component that will not score refuses the whole combo',
    () => logCombo(s2, bad, {
      local_date: '2026-09-23', entryId: entryId('b'), scoreAndBuild: makeScoreAndBuild(),
    }), STORE_ERROR.COMBO_COMPONENT_FAILED);
  eq('AE', 'AV-27: nothing was written for the unscoreable combo',
    (await s2.allEntries()).length, 0);

  // §4.5: a refused combo on an empty store sets no TREND_EPOCH, because no
  // entry was written and therefore none was first.
  eq('AE', 'AV-27: a refused combo sets no TREND_EPOCH', await s2.getTrendEpoch(), undefined);

  discrimination.push(['AV-27', 'writing components until one fails', 'categorical',
    '0 entries written vs 2 — a partial combo is a silently wrong day total §8.4 cannot correct']);
}

/* ================================================================== *
 * SUITE AF — §8.5b snapshots, grouping, removal
 * ================================================================== */

async function suiteAF() {
  const backend = new MemoryBackend();
  const store = new EntryStore(backend, { today: '2026-09-23' });
  const combos = new ComboStore(backend);
  await combos.put(MORNING);

  const round = await combos.get('combo:morning-coffee');
  eq('AF', '§8.5b: a combo round-trips through its own store', round.name, 'Morning coffee');
  eq('AF', '§8.5b: it keeps its three components', round.components.length, 3);

  // §8.4/§8.5a: snapshots are DEEP. A shallow freeze leaves this mutable.
  let threw = false;
  try { round.components[0].record.reported.added_sugar_g = 999; } catch { threw = true; }
  check('AF', '§8.5b: the component snapshot is deeply frozen',
    threw && round.components[0].record.reported.added_sugar_g !== 999);

  // Editing a combo affects FUTURE logs only.
  const written = await logCombo(store, MORNING, {
    local_date: '2026-09-23', entryId: entryId('f'), scoreAndBuild: makeScoreAndBuild(),
  });
  const edited = buildCombo({
    combo_id: 'combo:morning-coffee', name: 'Morning coffee',
    components: [{ food_name: 'Coffee, brewed', quantity: { value: 20, unit: 'fl oz' }, record: coffeeRecord }],
  });
  await combos.put(edited);
  const reread = await store.getEntry('f-0');
  eq('AF', '§8.5b: editing a combo does not alter an entry already logged',
    reread.quantity_value, 12);
  eq('AF', '§8.5b: the edit applies to the stored combo', (await combos.get('combo:morning-coffee')).components.length, 1);

  // §8.5b removal: one component, or the whole group, entry by entry.
  await store.deleteEntry('f-1');
  eq('AF', '§8.5b: removing one component removes that entry alone',
    (await store.allEntries()).length, 2);
  const group = (await store.allEntries()).filter((e) => e.combo_id === 'combo:morning-coffee');
  for (const e of group) await store.deleteEntry(e.entry_id);
  eq('AF', '§8.5b: removing the group removes each remaining component',
    (await store.allEntries()).length, 0);

  // Grouping is presentational: it reads combo_id off ordinary entries.
  check('AF', '§8.5b: grouping needs no field beyond combo_id',
    written.every((e) => e.combo_id === 'combo:morning-coffee'));

  // buildCombo refuses an incomplete component rather than storing a stub.
  let comboThrew = null;
  try {
    buildCombo({ name: 'Broken', components: [{ food_name: 'x', quantity: { value: 1, unit: 'g' } }] });
  } catch (e) { comboThrew = e.code; }
  eq('AF', '§8.5b: a component without a record is refused', comboThrew, STORE_ERROR.MISSING_REQUIRED_FIELD);
  let emptyThrew = null;
  try { buildCombo({ name: 'Empty', components: [] }); } catch (e) { emptyThrew = e.code; }
  eq('AF', '§8.5b: a combo with no components is refused', emptyThrew, STORE_ERROR.MISSING_REQUIRED_FIELD);
}

/* ---------------- run ---------------- */

await suiteAD();
await suiteAE();
await suiteAF();

const heads = {
  AD: 'SUITE AD — AV-26, a combo writes ordinary entries',
  AE: 'SUITE AE — AV-27, a combo write is atomic',
  AF: 'SUITE AF — §8.5b snapshots, grouping, removal',
};
for (const k of ['AD', 'AE', 'AF']) {
  console.log(`\n${heads[k]}`);
  console.log('='.repeat(heads[k].length));
  for (const line of results[k]) console.log(line);
}

console.log('\nDISCRIMINATION — §10 convention');
console.log('='.repeat(31));
for (const [id, defect, delta, note] of discrimination) {
  console.log(`  ${id.padEnd(6)} ${defect.padEnd(56)} ${String(delta).padStart(12)}  ${note}`);
}

console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
