/**
 * Prefill from a refused record — spec v2.0 §8.5. Vectors AV-31 … AV-34.
 *
 * Suites:
 *   AG. AV-31 — a grain refusal arrives prefilled; the grain is the only question
 *   AH. AV-32 — a basis refusal prefills nothing, and a double refusal is a basis one
 *   AI. AV-33 — a partly declared record prefills only what it declares
 *   AJ. AV-34 — provenance, and change detection against what the form showed
 *   AK. J4/J5 at the surface — the form reader, and the defect it replaces
 */

import { resolveFromOFF, resolveFromUSDA } from '../src/sources.js';
import { prefillFromRefusal, parseServing, roundForForm, changedFromPrefill } from '../src/prefill.js';
import {
  createManualRecord, readFormValue, findSavedForProduct, ABSENT, MANUAL_REJECT, ManualRejection,
} from '../src/manual.js';
import { scoreEntry } from '../src/scoring.js';
import { buildEntry } from '../src/entry.js';
import { REFUSAL_COPY } from '../src/disclosures.js';

const TOL = 1e-9;
let pass = 0, fail = 0;
const results = { AG: [], AH: [], AI: [], AJ: [], AK: [] };
const discrimination = [];

function check(s, label, ok, note = '') {
  ok ? pass++ : fail++;
  results[s].push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  — ${note}` : ''}`);
}
const eq = (s, label, a, e) => check(s, label, a === e, `actual ${JSON.stringify(a)}  expected ${JSON.stringify(e)}`);
const near = (s, label, a, e) => check(s, label, Math.abs(a - e) < TOL, `actual ${a}  expected ${e}`);
function refusedWith(s, label, fn, code) {
  try { fn(); check(s, label, false, 'ACCEPTED; expected refusal'); return null; }
  catch (e) {
    const ok = e instanceof ManualRejection && e.code === code;
    check(s, label, ok, ok ? e.code : `threw ${e.code ?? e.message}, expected ${code}`);
    return e;
  }
}

/* ---------- AV-31's bread, as the OFF shaper hands it to the resolver ---------- */

const PER_100 = {
  added_sugar_g: 7.9, sodium_mg: 447, saturated_fat_g: 0.5, fiber_g: 5.3,
  energy_kcal: 263, protein_g: 10.5, carbohydrate_g: 47.4, fat_g: 3.9,
};
const bread = {
  code: '0000000000031', product_name: 'Multigrain Sandwich Bread',
  nutrition_data_per: '100g', quantity: '567 g', serving_size: '1 slice (38 g)',
  nova_group: 4, categories_tags: ['en:breads'], density_class: null, bulk_class: null,
  ingredients: [{ text: 'whole wheat flour' }, { text: 'enriched wheat flour' }, { text: 'water' }],
  nutriments: {
    sugars_added_g: 7.9, sodium_mg: 447, saturated_fat_g: 0.5, fiber_g: 5.3,
    energy_kcal: 263, proteins_g: 10.5, carbohydrates_g: 47.4, fat_g: 3.9,
  },
};
const EXPECT_38 = Object.fromEntries(Object.entries(PER_100).map(([k, v]) => [k, roundForForm(v * 0.38)]));

/** What the shell hands createManualRecord for an untouched prefilled form. */
function formFrom(prefill, overrides = {}) {
  const nutrients = {}, macros = {};
  for (const f of ['added_sugar_g', 'sodium_mg', 'saturated_fat_g', 'fiber_g']) {
    if (f in prefill.values) nutrients[f] = prefill.values[f];
  }
  for (const f of ['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g']) {
    if (f in prefill.values) macros[f] = prefill.values[f];
  }
  return {
    name: prefill.name, nutrients, macros,
    classifications: { ...prefill.classifications },
    serving_mass_g: prefill.serving_mass_g, volume_ml: prefill.volume_ml,
    grain_required: prefill.needs.includes('grain'),
    prefill,
    ...overrides,
  };
}

/* ================================================================== *
 * AG — AV-31
 * ================================================================== */

function suiteAG() {
  const r = resolveFromOFF(bread);
  eq('AG', 'AV-31: the bread refuses', r.resolved, false);
  eq('AG', 'AV-31: …on the grain majority', r.reason, 'GRAIN_MAJORITY_UNKNOWN');
  check('AG', 'AV-31: …and carries a prefill', r.prefill !== null && typeof r.prefill === 'object');

  const p = r.prefill;
  eq('AG', 'AV-31: serving mass is the declared 38 g, read from "1 slice (38 g)"', p.serving_mass_g, 38);
  eq('AG', 'AV-31: all eight fields are prefilled', p.declaredCount, 8);
  for (const [f, v] of Object.entries(EXPECT_38)) near('AG', `AV-31: ${f} converted to one 38 g serving`, p.values[f], v);
  near('AG', 'AV-31: sodium is 169.86, not the per-100 g 447', p.values.sodium_mg, 169.86);
  eq('AG', 'AV-31: the grain is the only thing asked', JSON.stringify(p.needs), '["grain"]');
  eq('AG', 'AV-31: P5 is prefilled from nova_group 4', p.classifications.P5, true);
  check('AG', 'AV-31: neither P4 nor A7 is prefilled — that is the question',
    !p.classifications.P4 && !p.classifications.A7);
  eq('AG', 'AV-31: provenance names the refused record',
    JSON.stringify(p.from), JSON.stringify({ source: 'OFF', product_id: 'off:0000000000031' }));

  // The choice, both ways.
  const whole = createManualRecord(formFrom(p, { classifications: { ...p.classifications, A7: true } }));
  const refined = createManualRecord(formFrom(p, { classifications: { ...p.classifications, P4: true } }));
  eq('AG', 'AV-31: whole grain produces A7', whole.classifications.A7, true);
  eq('AG', 'AV-31: refined produces P4', refined.classifications.P4, true);
  check('AG', 'AV-31: …and never both', !whole.classifications.P4 && !refined.classifications.A7);
  refusedWith('AG', 'AV-31: submitting with no grain chosen is refused',
    () => createManualRecord(formFrom(p)), MANUAL_REJECT.GRAIN_NOT_CHOSEN);

  // End to end: it scores, and scores A7.
  const scored = scoreEntry(whole, { value: whole.manual.serving_mass_g, unit: 'g' });
  eq('AG', 'AV-31: the prefilled whole-grain entry scores', scored.created, true);
  check('AG', 'AV-31: …with A7 contributing', scored.contributions.A7 !== undefined,
    `A7 = ${scored.contributions.A7}`);

  // §13.5 copy, as specified.
  eq('AG', '§13.5: the grain copy says what is needed, not what failed',
    REFUSAL_COPY.GRAIN_MAJORITY_UNKNOWN.replace(/\s+/g, ' ').trim(),
    "This label doesn't say which flour is used. Everything else is filled in — just choose whole grain or refined.");

  discrimination.push(['AV-31', 'per-100 g values carried unconverted', (447 - 169.86).toExponential(3),
    'sodium 447 vs 169.86 mg — a factor of 2.63 on every field']);
  discrimination.push(['AV-31', 'no prefill at all', 'categorical', '0 fields filled vs 8']);
  discrimination.push(['AV-31', 'accepting the form with no grain chosen', 'categorical',
    'an entry with neither P4 nor A7 vs a refusal']);
}

/* ================================================================== *
 * AH — AV-32
 * ================================================================== */

function suiteAH() {
  const noBasis = { ...bread, nutrition_data_per: undefined };
  const r = resolveFromOFF(noBasis);
  eq('AH', 'AV-32: a record with no basis refuses on the basis', r.reason, 'BASIS_UNRESOLVED');
  eq('AH', 'AV-32: …and prefills nothing', r.prefill, null);

  // The same record ALSO fails the grain majority. Before v2.0 the grain check
  // ran first and would have reported GRAIN_MAJORITY_UNKNOWN — whose copy says
  // "Everything else is filled in" — over an empty form.
  check('AH', 'AV-32: the record genuinely fails both checks',
    r.reason === 'BASIS_UNRESOLVED' && resolveFromOFF(bread).reason === 'GRAIN_MAJORITY_UNKNOWN');
  check('AH', 'AV-32: the double refusal is reported as the basis, not the grain',
    r.reason !== 'GRAIN_MAJORITY_UNKNOWN');

  // prefillFromRefusal itself refuses a basis reason, whatever it is handed.
  eq('AH', 'AV-32: prefillFromRefusal never prefills BASIS_UNRESOLVED',
    prefillFromRefusal({ record: { reported: PER_100 }, reason: 'BASIS_UNRESOLVED' }), null);

  discrimination.push(['AV-32', 'prefilling a basis refusal', 'categorical',
    '8 unitless numbers carried forward vs 0']);
  discrimination.push(['AV-32', 'reporting a double refusal as the grain', 'categorical',
    '"Everything else is filled in" rendered over an empty form']);
}

/* ================================================================== *
 * AI — AV-33
 * ================================================================== */

function suiteAI() {
  const six = { ...bread, code: '0000000000033',
    nutriments: { ...bread.nutriments, sugars_added_g: undefined, fiber_g: undefined } };
  const r = resolveFromOFF(six);
  eq('AI', 'AV-33: refuses on the grain, with the basis resolved', r.reason, 'GRAIN_MAJORITY_UNKNOWN');
  eq('AI', 'AV-33: six of eight fields are prefilled', r.prefill.declaredCount, 6);
  check('AI', 'AV-33: the two undeclared fields are absent — blank, never 0',
    !('added_sugar_g' in r.prefill.values) && !('fiber_g' in r.prefill.values));

  // Submitting without addressing them: the shell omits a blank field, so the
  // record refuses with FIELD_NOT_STATED.
  const input = formFrom(r.prefill, {
    classifications: { ...r.prefill.classifications, A7: true },
  });
  refusedWith('AI', 'AV-33: submitting with the two left blank is FIELD_NOT_STATED',
    () => createManualRecord(input), MANUAL_REJECT.FIELD_NOT_STATED);

  // Marking them "not stated" is a statement, and the entry is INCOMPLETE.
  const marked = createManualRecord({
    ...input,
    nutrients: { ...input.nutrients, added_sugar_g: ABSENT, fiber_g: ABSENT },
  });
  const scored = scoreEntry(marked, { value: marked.manual.serving_mass_g, unit: 'g' });
  eq('AI', 'AV-33: marked absent, the entry is created', scored.created, true);
  eq('AI', 'AV-33: …INCOMPLETE', scored.isIncomplete, true);
  check('AI', '§6.4: …listing both', scored.incomplete.includes('P1') && scored.incomplete.includes('A1'),
    `incomplete = ${scored.incomplete.join(', ')}`);

  // The defect this vector exists to catch, exercised rather than described:
  // the reader the shell used until v2.0.
  const oldReader = (text) => { const v = Number(text); return Number.isFinite(v) ? v : ABSENT; };
  const oldInput = {
    ...input,
    nutrients: { ...input.nutrients, added_sugar_g: oldReader(''), fiber_g: oldReader('') },
  };
  const oldRecord = createManualRecord(oldInput);
  const oldScored = scoreEntry(oldRecord, { value: oldRecord.manual.serving_mass_g, unit: 'g' });
  check('AI', 'AV-33 DISCRIMINATES: the old reader creates a COMPLETE entry claiming zeros',
    oldScored.created && !oldScored.isIncomplete && oldRecord.reported.added_sugar_g === 0,
    `old: created=${oldScored.created}, incomplete=${oldScored.isIncomplete}, added sugar=${oldRecord.reported.added_sugar_g}`);

  discrimination.push(['AV-33', 'a blank field read as 0', 'categorical',
    'a COMPLETE entry claiming 0 g added sugar and 0 g fibre vs FIELD_NOT_STATED']);
}

/* ================================================================== *
 * AJ — AV-34
 * ================================================================== */

function suiteAJ() {
  const p = resolveFromOFF(bread).prefill;
  const untouched = createManualRecord(formFrom(p, { classifications: { ...p.classifications, A7: true } }));
  eq('AJ', 'AV-34: source stays MANUAL', untouched.source, 'MANUAL');
  eq('AJ', 'AV-34: prefilled_from names the refused record',
    JSON.stringify(untouched.prefilled_from), JSON.stringify({ source: 'OFF', product_id: 'off:0000000000031' }));
  eq('AJ', 'AV-34: nothing edited → prefill_changed is empty', JSON.stringify(untouched.prefill_changed), '[]');
  check('AJ', 'AV-34: the grain choice is not a change — it was never prefilled',
    !untouched.prefill_changed.includes('A7'));
  check('AJ', '§8.5a: the product id is still local — provenance, not identity',
    untouched.product_id.startsWith('manual:'), untouched.product_id);

  const edited = createManualRecord(formFrom(p, {
    classifications: { ...p.classifications, A7: true },
    nutrients: { ...formFrom(p).nutrients, sodium_mg: 170 },
  }));
  eq('AJ', 'AV-34: editing sodium records exactly sodium', JSON.stringify(edited.prefill_changed), '["sodium_mg"]');

  const unticked = createManualRecord(formFrom(p, { classifications: { A7: true } }));
  eq('AJ', 'AV-34: un-ticking a prefilled P5 is a change', JSON.stringify(unticked.prefill_changed), '["P5"]');

  const absent = createManualRecord(formFrom(p, {
    classifications: { ...p.classifications, A7: true },
    nutrients: { ...formFrom(p).nutrients, fiber_g: ABSENT },
  }));
  eq('AJ', 'AV-34: marking a prefilled value "not stated" is a change', JSON.stringify(absent.prefill_changed), '["fiber_g"]');

  // It reaches the stored entry, through the single §8.4 builder.
  const scored = scoreEntry(untouched, { value: 38, unit: 'g' });
  const entry = buildEntry(scored, untouched, {
    entry_id: 'p-1', food_name: untouched.name, quantity: { value: 38, unit: 'g' }, local_date: '2026-09-26',
  });
  eq('AJ', 'AV-34: the stored entry carries prefilled_from', entry.prefilled_from?.product_id, 'off:0000000000031');
  eq('AJ', 'AV-34: …and prefill_changed', JSON.stringify(entry.prefill_changed), '[]');

  // Discrimination: compare against the UNROUNDED value and count false edits.
  const unrounded = { ...p, values: Object.fromEntries(Object.entries(PER_100).map(([k, v]) => [k, v * 0.38])) };
  const falseEdits = changedFromPrefill(
    { reported: untouched.reported, serving_mass_g: 38, classifications: untouched.classifications }, unrounded
  ).filter((f) => f in PER_100);
  eq('AJ', 'AV-34 DISCRIMINATES: against the unrounded value, 4 untouched fields register as edited',
    falseEdits.length, 4);
  eq('AJ', 'AV-34: …exactly the four whose conversion is inexact',
    falseEdits.sort().join(','), ['added_sugar_g', 'carbohydrate_g', 'fat_g', 'fiber_g'].join(','));

  discrimination.push(['AV-34', 'omitting prefilled_from', 'categorical', 'indistinguishable from a label typed by hand']);
  discrimination.push(['AV-34', 'comparing against the unrounded value', 'categorical',
    '4 false edits vs 0 — added sugar, fibre, carbohydrate, fat']);
}

/* ================================================================== *
 * AK — J4/J5 at the surface, other refusal reasons, rescan
 * ================================================================== */

function suiteAK() {
  eq('AK', 'J4/J5: a blank field is unfinished — undefined, never 0', readFormValue(''), undefined);
  eq('AK', 'J4/J5: whitespace is blank too', readFormValue('   '), undefined);
  eq('AK', 'J4/J5: an explicit 0 is 0', readFormValue('0'), 0);
  eq('AK', 'J4/J5: a number is the number', readFormValue('12.5'), 12.5);
  eq('AK', 'J4/J5: ".5" is 0.5', readFormValue('.5'), 0.5);
  eq('AK', 'J4/J5: the absent box wins over any text', readFormValue('12', true), ABSENT);
  for (const bad of ['abc', '1,5', '1.2.3', '-1', '12g']) {
    refusedWith('AK', `J4/J5: "${bad}" is refused, not read as "not stated"`,
      () => readFormValue(bad, false, 'Sodium'), MANUAL_REJECT.NOT_A_NUMBER);
  }

  // The declared-serving parser the form uses.
  eq('AK', 'parseServing: "1 slice (38 g)"', JSON.stringify(parseServing('1 slice (38 g)')), '{"value":38,"unit":"g"}');
  eq('AK', 'parseServing: "1 can (355 ml)"', JSON.stringify(parseServing('1 can (355 ml)')), '{"value":355,"unit":"ml"}');
  eq('AK', 'parseServing: "30 g"', JSON.stringify(parseServing('30 g')), '{"value":30,"unit":"g"}');
  eq('AK', 'parseServing: "2 cookies" has no mass and returns null', parseServing('2 cookies'), null);

  // DENSITY_UNRESOLVED: the volume is declared, the density is the question.
  const drink = {
    code: '0000000000035', product_name: 'Sparkling Tonic', nutrition_data_per: '100g',
    quantity: '1 l', serving_size: '1 can (355 ml)', nova_group: 4,
    categories_tags: ['en:beverages'], density_class: null, bulk_class: null, ingredients: [],
    nutriments: { sugars_added_g: 8.5, sodium_mg: 12, saturated_fat_g: 0, fiber_g: 0,
      energy_kcal: 34, proteins_g: 0, carbohydrates_g: 8.5, fat_g: 0 },
  };
  const d = resolveFromOFF(drink);
  eq('AK', '§3.3a: a liquid with no class refuses on density', d.reason, 'DENSITY_UNRESOLVED');
  eq('AK', '§8.5: …prefilled with the declared 355 ml serving', d.prefill?.volume_ml, 355);
  eq('AK', '§8.5: …and no mass, which is what the density would give', d.prefill?.serving_mass_g, undefined);
  // 8.5 × 3.55 is 30.174999… in binary, so the form shows 30.17, not a
  // hand-rounded 30.18. The form's own rounding is the reference, because it is
  // what change detection compares against (AV-34).
  near('AK', '§8.5: …added sugar per can, 8.5 × 3.55 as the form rounds it',
    d.prefill?.values.added_sugar_g, roundForForm(8.5 * 3.55));
  eq('AK', '§8.5: …the density is what is asked', JSON.stringify(d.prefill?.needs), '["density"]');

  // DATASET_NOT_ELIGIBLE (USDA Branded). Unreachable from search today; tested anyway.
  const branded = resolveFromUSDA({ fdcId: 99, dataType: 'Branded', description: 'Branded Bar',
    nutrients: { added_sugar_g: 20, sodium_mg: 150, saturated_fat_g: 3, fiber_g: 2,
      energy_kcal: 400, protein_g: 6, carbohydrate_g: 60, fat_g: 15 } });
  eq('AK', '§8.2: USDA Branded refuses', branded.reason, 'DATASET_NOT_ELIGIBLE');
  eq('AK', '§8.5: …and prefills per 100 g, the USDA basis', branded.prefill?.serving_mass_g, 100);
  eq('AK', '§8.5: …all eight declared', branded.prefill?.declaredCount, 8);

  // §8.5a rescan: a saved product built from this record is offered first.
  const saved = [
    { saved_id: 'saved:Other', record: { prefilled_from: { product_id: 'off:111' } } },
    { saved_id: 'saved:Bread', record: { prefilled_from: { product_id: 'off:0000000000031' } } },
    { saved_id: 'saved:Typed', record: {} },
  ];
  eq('AK', '§8.5a: rescanning finds the saved product built from that barcode',
    findSavedForProduct(saved, 'off:0000000000031')?.saved_id, 'saved:Bread');
  eq('AK', '§8.5a: …and nothing for a barcode never saved', findSavedForProduct(saved, 'off:999'), null);
  eq('AK', '§8.5a: …and a saved product typed by hand is never matched to a barcode',
    findSavedForProduct(saved, undefined), null);
}

/* ---------------- run ---------------- */

suiteAG(); suiteAH(); suiteAI(); suiteAJ(); suiteAK();

const heads = {
  AG: 'SUITE AG — AV-31, a grain refusal arrives prefilled',
  AH: 'SUITE AH — AV-32, a basis refusal prefills nothing',
  AI: 'SUITE AI — AV-33, only what the record declares',
  AJ: 'SUITE AJ — AV-34, provenance and change detection',
  AK: 'SUITE AK — J4/J5 at the surface, other refusals, rescan',
};
for (const k of Object.keys(heads)) {
  console.log(`\n${heads[k]}`);
  console.log('='.repeat(heads[k].length));
  for (const line of results[k]) console.log(line);
}
console.log('\nDISCRIMINATION — §10 convention');
console.log('='.repeat(31));
for (const [id, defect, delta, note] of discrimination) {
  console.log(`  ${id.padEnd(6)} ${defect.padEnd(48)} ${String(delta).padStart(12)}  ${note}`);
}
console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
