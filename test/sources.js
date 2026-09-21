/**
 * Source resolution, manual entry and saved products — spec v0.7 §11 step 3.
 *
 * Suites:
 *   D. Vectors AV-7a, AV-11, AV-12, AV-13
 *   E. §3.3c rule 2 traceability (reported separately)
 *   F. §8.5a saved-product snapshot immutability (reported separately)
 *   G. §8.2 eligibility, §8.5 manual entry, §8.5a local-only
 */

import { resolveFromOFF, resolveFromUSDA, SOURCE_REJECT, resolveGrainMajority } from '../src/sources.js';
import { createManualRecord, saveProduct, recordFromSaved, promoteToProductCache,
  isSwapEligible, ManualRejection, MANUAL_REJECT, ABSENT } from '../src/manual.js';
import { scoreEntry } from '../src/scoring.js';
import { EntryStore } from '../src/store.js';
import { MemoryBackend } from '../src/backends/memory.js';
import { STORES, SCHEMA_VERSION } from '../src/schema.js';
import { buildEntry } from '../src/entry.js';

const TOL = 1e-6;
let pass = 0, fail = 0;
const results = { D: [], E: [], F: [], G: [] };
const discrimination = [];

const fmt = (n) => (typeof n === 'number'
  ? n.toPrecision(12).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : String(n));

function check(suite, label, ok, note = '') {
  ok ? pass++ : fail++;
  results[suite].push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  — ${note}` : ''}`);
}
function near(suite, label, actual, expected) {
  const margin = Math.abs(actual - expected);
  check(suite, label, margin <= TOL,
    `actual ${fmt(actual)}  expected ${fmt(expected)}  margin ${margin.toExponential(2)}`);
}
function throws(suite, label, fn, code) {
  try { fn(); check(suite, label, false, 'ACCEPTED; expected rejection'); }
  catch (e) {
    const ok = e instanceof ManualRejection && e.code === code;
    check(suite, label, ok, ok ? e.code : `threw ${e.code ?? e.message}, expected ${code}`);
  }
}

/* ---------- shared OFF record shape for AV-11/12/13 (rule 3) ---------- */

function offPer100g({ code, sodium_mg, fiber_g, protein_g }) {
  return {
    code,
    product_name: 'Test product',
    nutrition_data_per: '100g',
    quantity: '200 g',              // mass unit → §3.3c rule 3, provenance DECLARED
    serving_size: null,
    nova_group: null,
    ingredients: [],
    nutriments: {
      sugars_added_g: 2.0,
      sodium_mg,
      saturated_fat_g: 1.0,
      fiber_g,
      energy_kcal: 250,
      proteins_g: protein_g,
      carbohydrates_g: 30,
      fat_g: 8,
    },
  };
}

/* ================================================================== *
 * SUITE D — vectors
 * ================================================================== */

function suiteD() {
  /* ---- AV-7a — unknown grain majority, non-creation ---- */
  const av7a = resolveFromOFF({
    code: '0000001',
    product_name: 'Multigrain loaf',
    nutrition_data_per: '100g',
    quantity: '800 g',
    serving_size: '30 g',
    nova_group: 4,
    // Both whole and refined flour, no declared mass ordering (§3.1).
    ingredients: [{ text: 'whole wheat flour' }, { text: 'wheat flour' }, { text: 'water' }],
    nutriments: { sugars_added_g: 3, sodium_mg: 400, saturated_fat_g: 0.5, fiber_g: 6 },
  });
  check('D', 'AV-7a: not resolved from OFF', av7a.resolved === false);
  check('D', 'AV-7a: reason GRAIN_MAJORITY_UNKNOWN',
    av7a.reason === SOURCE_REJECT.GRAIN_MAJORITY_UNKNOWN, av7a.reason);
  check('D', 'AV-7a: MANUAL offered', av7a.offer === 'MANUAL');
  check('D', 'AV-7a: no record produced', av7a.record === undefined);
  discrimination.push(['AV-7a', 'defaulting unknown majority to P4', 'categorical',
    'entry refused vs created — binary']);

  // A declared percentage resolves it; only `percent`, never OFF's percent_estimate.
  check('D', 'AV-7a: declared percent resolves majority',
    resolveGrainMajority([
      { text: 'whole wheat flour', percent: 70 },
      { text: 'wheat flour', percent: 20 },
    ]) === 'whole');

  /* ---- AV-11 — missing pro-inflammatory ---- */
  const av11 = resolveFromOFF(offPer100g({ code: '11', sodium_mg: null, fiber_g: 5.0, protein_g: 10 }));
  check('D', 'AV-11: resolved', av11.resolved === true);
  const r11 = scoreEntry(av11.record, { value: 100, unit: 'g' });
  check('D', 'AV-11: basis per_100g via rule 3', r11.basis === 'per_100g');
  check('D', 'AV-11: provenance DECLARED', r11.basisProvenance === 'DECLARED');
  near('D', 'AV-11: SCORE', r11.score, -0.7);
  check('D', 'AV-11: INCOMPLETE on sodium only',
    r11.incomplete.length === 1 && r11.incomplete[0] === 'P2', `[${r11.incomplete}]`);

  /* ---- AV-12 — missing anti-inflammatory (symmetry) ---- */
  const av12 = resolveFromOFF(offPer100g({ code: '12', sodium_mg: 300, fiber_g: null, protein_g: 10 }));
  const r12 = scoreEntry(av12.record, { value: 100, unit: 'g' });
  near('D', 'AV-12: SCORE', r12.score, 0.6);
  check('D', 'AV-12: INCOMPLETE on fiber only',
    r12.incomplete.length === 1 && r12.incomplete[0] === 'A1', `[${r12.incomplete}]`);
  check('D', 'AV-12: symmetry — marked exactly as AV-11 is',
    r11.isIncomplete === true && r12.isIncomplete === true);

  /* ---- AV-13 — missing macro (symmetry) ---- */
  const av13 = resolveFromOFF(offPer100g({ code: '13', sodium_mg: 300, fiber_g: 5.0, protein_g: null }));
  const r13 = scoreEntry(av13.record, { value: 100, unit: 'g' });
  near('D', 'AV-13: SCORE', r13.score, -0.4);
  check('D', 'AV-13: INCOMPLETE on protein only',
    r13.incomplete.length === 1 && r13.incomplete[0] === 'protein_g', `[${r13.incomplete}]`);
  near('D', 'AV-13: energy_kcal as consumed', r13.asConsumed.energy_kcal, 250);
  near('D', 'AV-13: carbohydrate_g as consumed', r13.asConsumed.carbohydrate_g, 30);
  check('D', 'AV-13: protein null, not zero', r13.asConsumed.protein_g === null);
}

/* ================================================================== *
 * SUITE E — rule 2 traceability (reported separately)
 * ================================================================== */

function suiteE() {
  // The known failure mode: sold by volume, nutrition table genuinely per 100 g.
  const raw = {
    code: 'rule2',
    product_name: 'Dairy drink sold by volume, table per 100 g',
    nutrition_data_per: '100g',
    quantity: '1000 ml',            // volumetric package → rule 2 fires
    serving_size: null,
    nova_group: null,
    ingredients: [],
    density_class: 'milk',          // DMAP-1 → 1.03
    nutriments: { sugars_added_g: 10, sodium_mg: 0, saturated_fat_g: 0, fiber_g: 0 },
  };
  const res = resolveFromOFF(raw);
  const r = scoreEntry(res.record, { value: 200, unit: 'ml' });

  const d = 1.03;
  const truthPer100g = (10 / 100) * (200 * d);   // what the record actually means
  const rule2Value = r.asConsumed.added_sugar_g;  // what rule 2 produces

  check('E', 'rule 2 fired', r.basis === 'per_100ml');
  check('E', 'provenance is DERIVED_RULE_2 — the wrongness is attributable',
    r.basisProvenance === 'DERIVED_RULE_2', r.basisProvenance);
  near('E', 'quantity_g', r.quantity_g, 206);
  near('E', 'rule 2 as-consumed sugar', rule2Value, 20);
  near('E', 'true as-consumed sugar (per_100g)', truthPer100g, 20.6);

  const relError = rule2Value / truthPer100g - 1;
  check('E', 'error magnitude matches 1/d - 1, not (d - 1)',
    Math.abs(relError - (1 / d - 1)) < 1e-12,
    `actual ${(relError * 100).toFixed(4)}%  |  1/d-1 = ${((1 / d - 1) * 100).toFixed(4)}%  |  ` +
    `spec §3.3c says (d-1) = ${((d - 1) * 100).toFixed(4)}%`);
  check('E', 'error is silent — nothing in the record flags it',
    r.created === true && !r.incomplete.includes('P1'),
    'entry is created and complete; only the provenance marks it');

  discrimination.push(['rule2', 'basis derived where table is per 100 g',
    Math.abs(rule2Value - truthPer100g).toExponential(3),
    `discriminates (correct ${fmt(truthPer100g)} vs derived ${fmt(rule2Value)})`]);
}

/* ================================================================== *
 * SUITE F — saved-product snapshot immutability (reported separately)
 * ================================================================== */

async function suiteF() {
  const backend = new MemoryBackend();
  const store = new EntryStore(backend, { today: '2026-09-17' });

  const manual = createManualRecord({
    name: 'Home granola',
    nutrients: { added_sugar_g: 6, sodium_mg: 40, saturated_fat_g: 2, fiber_g: 4 },
    macros: { energy_kcal: 200, protein_g: 5, carbohydrate_g: 24, fat_g: 9 },
    classifications: { A5: true },
    serving_mass_g: 50,
    occasion_category: 'snack',
  });
  const saved = await saveProduct(backend, manual, { saved_id: 'saved:granola', name: 'Home granola' });

  const snapshot = recordFromSaved(saved);
  const scored = scoreEntry(snapshot, { value: 50, unit: 'g' });
  check('F', 'logged from saved: source is SAVED', snapshot.source === 'SAVED');
  check('F', 'logged from saved: basis per_serving inherited',
    scored.basis === 'per_serving', scored.basis);
  const scoreAtLog = scored.score;

  await store.putEntry(buildEntry(scored, snapshot, {
    entry_id: 'e-saved-1', food_name: snapshot.name,
    quantity: { value: 50, unit: 'g' }, local_date: '2026-09-17',
    occasion_category: saved.occasion_category,
    category_map_version: saved.category_map_version,
  }));

  // Now EDIT the saved product — §8.5a says this must not touch a logged entry.
  const editedManual = createManualRecord({
    name: 'Home granola',
    nutrients: { added_sugar_g: 25, sodium_mg: 900, saturated_fat_g: 12, fiber_g: 0 },
    macros: { energy_kcal: 600, protein_g: 1, carbohydrate_g: 70, fat_g: 30 },
    classifications: { P5: true },
    serving_mass_g: 50,
    occasion_category: 'snack',
  });
  await saveProduct(backend, editedManual, { saved_id: 'saved:granola', name: 'Home granola' });

  const after = await store.getEntry('e-saved-1');
  check('F', 'stored score unchanged after saved product edited',
    after.score === scoreAtLog, `${fmt(after.score)} (at log ${fmt(scoreAtLog)})`);
  check('F', 'stored attribute values unchanged',
    after.reported.added_sugar_g === 6 && after.reported.sodium_mg === 40);
  check('F', 'stored macros unchanged', after.macros.energy_kcal === 200);

  const reread = await backend.get(STORES.SAVED_PRODUCTS, 'saved:granola');
  check('F', 'saved product itself did change (edit took effect)',
    reread.record.reported.added_sugar_g === 25);

  // The snapshot handed to the entry is frozen in its own right.
  let froze = false;
  try { snapshot.reported.added_sugar_g = 999; } catch { froze = true; }
  check('F', 'snapshot is frozen at log time',
    froze || snapshot.reported.added_sugar_g === 6);
}

/* ================================================================== *
 * SUITE G — eligibility, manual entry, local-only
 * ================================================================== */

async function suiteG() {
  /* §8.2 dataset eligibility */
  check('G', 'USDA Branded is not eligible',
    resolveFromUSDA({ fdcId: 1, dataType: 'Branded' }).reason === SOURCE_REJECT.DATASET_NOT_ELIGIBLE);
  check('G', 'USDA Foundation resolves',
    resolveFromUSDA({ fdcId: 2, dataType: 'Foundation', description: 'Apple' }).resolved === true);
  check('G', 'USDA SR Legacy resolves',
    resolveFromUSDA({ fdcId: 3, dataType: 'SR Legacy', description: 'Olive oil' }).resolved === true);
  check('G', 'USDA basis is per_100g DECLARED',
    resolveBasisOf(resolveFromUSDA({ fdcId: 4, dataType: 'Foundation', description: 'x' }).record) === 'per_100g');

  /* §3.3c rule 4 */
  const noBasis = resolveFromOFF({
    code: '7b', product_name: 'x', nutrition_data_per: null,
    quantity: '200 g', serving_size: null, ingredients: [], nutriments: {},
  });
  check('G', 'OFF with no nutrition_data_per does not resolve',
    noBasis.reason === SOURCE_REJECT.BASIS_UNRESOLVED);

  /* §3.3a step 3 */
  const noDensity = resolveFromOFF({
    code: 'liq', product_name: 'Mystery liquid', nutrition_data_per: '100g',
    quantity: '500 ml', serving_size: null, ingredients: [], nutriments: {},
  });
  check('G', 'liquid with no density class does not resolve',
    noDensity.reason === SOURCE_REJECT.DENSITY_UNRESOLVED);

  /* §8.5 manual entry */
  throws('G', 'manual: P3 without volume refused',
    () => createManualRecord({
      name: 'Spirit', classifications: { P3: { abv_percent: 40 } },
      serving_mass_g: 40,
      nutrients: { added_sugar_g: ABSENT, sodium_mg: ABSENT, saturated_fat_g: ABSENT, fiber_g: ABSENT },
      macros: { energy_kcal: ABSENT, protein_g: ABSENT, carbohydrate_g: ABSENT, fat_g: ABSENT },
    }), MANUAL_REJECT.P3_REQUIRES_VOLUME);

  throws('G', 'manual: field neither supplied nor marked ABSENT refused',
    () => createManualRecord({
      name: 'x', classifications: {}, serving_mass_g: 10,
      nutrients: { added_sugar_g: 1, sodium_mg: 1, saturated_fat_g: 1 },   // fiber_g omitted
      macros: { energy_kcal: 1, protein_g: 1, carbohydrate_g: 1, fat_g: 1 },
    }), MANUAL_REJECT.FIELD_NOT_STATED);

  const rumRecord = createManualRecord({
    name: 'Rum', classifications: { P3: { abv_percent: 40 } }, volume_ml: 44,
    nutrients: { added_sugar_g: ABSENT, sodium_mg: ABSENT, saturated_fat_g: ABSENT, fiber_g: ABSENT },
    macros: { energy_kcal: ABSENT, protein_g: ABSENT, carbohydrate_g: ABSENT, fat_g: ABSENT },
  });
  const rum = scoreEntry(rumRecord, { value: 44, unit: 'ml' });
  check('G', 'manual P3 + volume: basis NOT_APPLICABLE (B4)',
    rum.basis === 'NOT_APPLICABLE', rum.basis);
  check('G', 'manual P3 + volume: quantity_g null, §3.3b did not run', rum.quantity_g === null);
  near('G', 'manual P3 + volume: SCORE matches AV-6A', rum.score, 1.9837714285714285);

  const complete = createManualRecord({
    name: 'Complete manual', classifications: {}, serving_mass_g: 100,
    nutrients: { added_sugar_g: 1, sodium_mg: 1, saturated_fat_g: 1, fiber_g: 1 },
    macros: { energy_kcal: 1, protein_g: 1, carbohydrate_g: 1, fat_g: 1 },
  });
  check('G', 'manual entry can be COMPLETE (§8.5)',
    scoreEntry(complete, { value: 100, unit: 'g' }).isIncomplete === false);

  /* §8.5a local-only */
  const backend = new MemoryBackend();
  const saved = await saveProduct(backend, complete, {
    saved_id: 'saved:c', name: 'Complete manual', occasion_category: 'snack',
  });
  check('G', 'saved product marked local_only', saved.local_only === true);

  let rejectedManual = false, rejectedSaved = false;
  try { await promoteToProductCache(backend, complete); } catch (e) { rejectedManual = e.code === MANUAL_REJECT.NOT_LOCAL; }
  try { await promoteToProductCache(backend, recordFromSaved(saved)); } catch (e) { rejectedSaved = e.code === MANUAL_REJECT.NOT_LOCAL; }
  check('G', 'MANUAL never promoted to shared/cached record', rejectedManual);
  check('G', 'SAVED never promoted to shared/cached record', rejectedSaved);

  const offRec = resolveFromOFF(offPer100g({ code: 'ok', sodium_mg: 1, fiber_g: 1, protein_g: 1 })).record;
  await promoteToProductCache(backend, offRec);
  const cached = await backend.getAll(STORES.PRODUCT_CACHE);
  check('G', 'OFF records may be cached', cached.length === 1);
  check('G', 'no saved product ever reached the cache',
    cached.every((c) => c.source !== 'MANUAL' && c.source !== 'SAVED'));

  /* §8.5a swap eligibility */
  check('G', 'saved product without override is swap-ineligible',
    isSwapEligible(await saveProduct(backend, createManualRecord({
      name: 'nocat', classifications: {}, serving_mass_g: 10,
      nutrients: { added_sugar_g: 1, sodium_mg: 1, saturated_fat_g: 1, fiber_g: 1 },
      macros: { energy_kcal: 1, protein_g: 1, carbohydrate_g: 1, fat_g: 1 },
    }), { saved_id: 'saved:nocat' })) === false);
  check('G', 'saved product with override is swap-eligible', isSwapEligible(saved) === true);
}

function resolveBasisOf(record) {
  return scoreEntry({ ...record, reported: record.reported ?? {} }, { value: 100, unit: 'g' }).basis;
}

/* ---------------- run ---------------- */

suiteD();
suiteE();
await suiteF();
await suiteG();

const heads = {
  D: 'SUITE D — vectors AV-7a, AV-11, AV-12, AV-13',
  E: 'SUITE E — §3.3c rule 2 traceability (reported separately)',
  F: 'SUITE F — §8.5a saved-product snapshot immutability (reported separately)',
  G: 'SUITE G — §8.2 eligibility, §8.5 manual entry, §8.5a local-only',
};
for (const k of ['D', 'E', 'F', 'G']) {
  console.log(`\n${heads[k]}`);
  console.log('='.repeat(heads[k].length));
  for (const line of results[k]) console.log(line);
}

console.log('\nDISCRIMINATION — §10 convention');
console.log('='.repeat(31));
for (const [id, label, delta, note] of discrimination) {
  console.log(`  ${id.padEnd(7)} ${label.padEnd(46)} ${String(delta).padStart(12)}  ${note}`);
}

console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
