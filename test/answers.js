/**
 * Spec v2.3: the answers to the v2.2 report. Vectors AV-41 to AV-44.
 *
 * Suites:
 *   AR. AV-41 — P5's fixed serving (COEFF-2): the cooking spray
 *   AS. AV-42 — a declared per-100 ml basis (§3.3c rule 2)
 *   AT. AV-43 — §3.1 declared bounds: "N% or less"
 *   AU. AV-44 — §6.1b shortcut entries, stored and rendered as entered
 */

import { resolveFromOFF, quantityShortcuts, enteredShortcut, declaredBoundSettlesWhole,
  resolveGrainMajority } from '../src/sources.js';
import { shapeOFF } from '../src/client.js';
import { scoreEntry } from '../src/scoring.js';
import { buildEntry } from '../src/entry.js';
import { quantityAsEntered } from '../src/display.js';
import { COEFF_VERSION } from '../src/coefficients.js';
import { EntryStore as Store } from '../src/store.js';
import { MemoryBackend } from '../src/backends/memory.js';

const TOL = 1e-9;
let pass = 0, fail = 0;
const results = { AR: [], AS: [], AT: [], AU: [] };
const discrimination = [];
function check(s, label, ok, note = '') {
  ok ? pass++ : fail++;
  results[s].push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  — ${note}` : ''}`);
}
const eq = (s, label, a, e) => check(s, label, a === e, `actual ${JSON.stringify(a)}  expected ${JSON.stringify(e)}`);
const near = (s, label, a, e) => check(s, label, Math.abs(a - e) < TOL, `actual ${a}  expected ${e}`);

const off = (over = {}) => ({
  code: '0000000000041', product_name: 'Test', nutrition_data_per: '100g', quantity: '200 g',
  serving_size: null, nova_group: 4, categories_tags: ['en:crackers'], ingredients: [],
  nutriments: { sodium_100g: 0, 'added-sugars_100g': 0, 'saturated-fat_100g': 0, fiber_100g: 0,
    'energy-kcal_100g': 800, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 90 },
  ...over,
});

/* ================================================================== *
 * AR — AV-41: P5's fixed serving
 * ================================================================== */

function suiteAR() {
  eq('AR', 'COEFF-2 is the current coefficient version', COEFF_VERSION, 'COEFF-2');
  // A cooking spray labelled at a fraction of a gram, so it can declare 0 kcal.
  const spray = resolveFromOFF(shapeOFF(off({ serving_size: '6 spray (1.2 g)', quantity: '170 g' })));
  eq('AR', 'AV-41: the spray resolves', spray.resolved, true);
  const s = scoreEntry(spray.record, { value: 30, unit: 'g' });
  near('AR', 'AV-41: 30 g of spray is 0.3 P5 servings (fixed 100 g)', s.servings.P5, 0.3);
  near('AR', 'AV-41: …contribution +0.45', s.contributions.P5, 0.45);
  eq('AR', 'AV-41: the labelled 1.2 g is still the serving SHORTCUT', quantityShortcuts(spray.record).find((x) => x.id === 'serving')?.label, '1 serving (1.2 g)');
  // The shortcut is a quantity convenience: one labelled serving is 1.2 g, 0.012 P5 servings.
  const one = scoreEntry(spray.record, enteredShortcut(quantityShortcuts(spray.record).find((x) => x.id === 'serving'), 1));
  near('AR', 'AV-41: 1 serving (1.2 g) scores P5 at 0.012 of its unit', one.servings.P5, 0.012);

  // Same grams, different labels, same P5: the food is scored, not the label.
  const bread = resolveFromOFF(shapeOFF(off({ serving_size: '1 slice (34 g)' })));
  near('AR', 'AV-41: 30 g of a bread labelled at 34 g also gives 0.3 P5 servings',
    scoreEntry(bread.record, { value: 30, unit: 'g' }).servings.P5, 0.3);

  /* ---- discrimination ---- */
  const labelSet = 30 / 1.2;                                  // COEFF-1: the label sets the unit
  near('AR', 'AV-41 DISCRIMINATES: a label-set P5 serving gives 25 servings', labelSet, 25);
  check('AR', 'AV-41 DISCRIMINATES: …where the rule gives 0.3', Math.abs(s.servings.P5 - labelSet) > 24);
  discrimination.push(['AV-41', 'P5 unit set by the labelled serving (COEFF-1)', (25 - 0.3).toExponential(3), '25 servings vs 0.3 — +37.5 vs +0.45']);
}

/* ================================================================== *
 * AS — AV-42: nutrition_data_per "100ml"
 * ================================================================== */

function suiteAS() {
  // The live shape: an oil declaring per 100 ml, sold by MASS ("14 g" typo-packages exist).
  const oil = resolveFromOFF(shapeOFF(off({ nutrition_data_per: '100ml', quantity: '500 ml',
    serving_size: '1 tbsp (14 g)', categories_tags: ['en:vegetable-oils'] })));
  eq('AS', 'AV-42: "100ml" resolves', oil.resolved, true);
  const s = oil.resolved && scoreEntry(oil.record, { value: 15, unit: 'ml' });
  eq('AS', 'AV-42: …basis per_100ml', s.basis, 'per_100ml');
  eq('AS', 'AV-42: …provenance DECLARED, not DERIVED_RULE_2', s.basisProvenance, 'DECLARED');
  // The package is not consulted: a mass package does not turn it into per_100g.
  const massPkg = resolveFromOFF(shapeOFF(off({ nutrition_data_per: '100ml', quantity: '14 g',
    serving_size: '1 tbsp (14 g)', categories_tags: ['en:vegetable-oils'] })));
  eq('AS', 'AV-42: a mass package does not change a declared per_100ml',
    massPkg.resolved && scoreEntry(massPkg.record, { value: 14, unit: 'g' }).basis, 'per_100ml');
  // Rule 3 is unchanged and keeps its historical provenance value.
  const drink = resolveFromOFF(shapeOFF(off({ quantity: '355 ml', categories_tags: ['en:sodas'] })));
  eq('AS', 'rule 3 (was 2): a "100g" record sold by volume keeps DERIVED_RULE_2',
    drink.resolved && scoreEntry(drink.record, { value: 355, unit: 'ml' }).basisProvenance, 'DERIVED_RULE_2');

  /* ---- discrimination ---- */
  const v22 = (per) => (per === '100g' || per === 'serving' ? 'resolves' : 'refuses');
  check('AS', 'AV-42 DISCRIMINATES: v2.2 refused every "100ml" record; the rule resolves it',
    v22('100ml') === 'refuses' && oil.resolved);
  discrimination.push(['AV-42', '"100ml" treated as unresolved (v2.2)', 'categorical', 'refused vs per_100ml DECLARED — 68 of 100 oils']);
}

/* ================================================================== *
 * AT — AV-43: declared bounds
 * ================================================================== */

// The live label: Nature's Own 100% Whole Wheat, 0072250037129 (typos as printed).
const NATURES_OWN = 'WHOLE WHEAT FLOWER, WATER, YEAST, BROWN SUGAR, WHEAT GLUTEN, 2% OR LESS: SALT, '
  + 'EXPELLER PRESSED CANOLA OIL, CULTURED WHEAT FLOUR, VINEGAR, FLAX SEAD MEAL, ENZYMES, '
  + 'ACEROLA CHERRY POWDER, *MAY BE TOPPED WITH WHEAT BRAN*';
const PARSED = [{ text: 'WHOLE WHEAT FLOWER' }, { text: 'WATER' }, { text: 'WHEAT FLOUR' }];

function suiteAT() {
  eq('AT', 'AV-43: Nature\'s Own — refined flour only inside "2% OR LESS" → whole',
    resolveGrainMajority(PARSED, NATURES_OWN), 'whole');
  const r = resolveFromOFF(shapeOFF(off({ nova_group: 3, serving_size: '1 slice (26 g)', ingredients: PARSED,
    ingredients_text: NATURES_OWN, categories_tags: ['en:breads'] })));
  eq('AT', 'AV-43: …the record resolves outright, no grain refusal', r.resolved, true);
  eq('AT', 'AV-43: …with A7 and without P4', r.record && `${!!r.record.classifications.A7}/${!!r.record.classifications.P4}`, 'true/false');
  check('AT', '"Contains 2% or less of:" is the same bound',
    declaredBoundSettlesWhole('Whole wheat flour, water, contains 2% or less of: salt, enriched wheat flour.'));

  // Must-reject: each is outside the rule.
  const rejects = [
    ['a refined flour outside the clause', 'Whole wheat flour, enriched wheat flour, water, 2% or less of: salt'],
    ['the first ingredient is refined', 'Enriched wheat flour, whole wheat flour, 2% or less of: salt'],
    ['no bound clause at all', 'Whole wheat flour, water, wheat flour'],
    ['"less than 2%" is not the stated form', 'Whole wheat flour, water, less than 2% of: wheat flour'],
    ['the clause ended at a sentence stop', 'Whole wheat flour, 2% or less of: salt. Wheat flour, water'],
  ];
  for (const [why, text] of rejects) check('AT', `AV-43 must-reject: ${why}`, !declaredBoundSettlesWhole(text));
  eq('AT', 'AV-43: a text-less record still refuses', resolveGrainMajority(PARSED, null), 'unknown');

  /* ---- discrimination ---- */
  check('AT', 'AV-43 DISCRIMINATES: without the rule the loaf refuses on grain; with it, whole',
    resolveGrainMajority(PARSED) === 'unknown' && resolveGrainMajority(PARSED, NATURES_OWN) === 'whole');
  discrimination.push(['AV-43', 'the "N% or less" bound ignored', 'categorical', 'GRAIN_MAJORITY_UNKNOWN vs whole (A7)']);
}

/* ================================================================== *
 * AU — AV-44: shortcut entries, as entered
 * ================================================================== */

async function suiteAU() {
  const crackers = resolveFromOFF(shapeOFF(off({ quantity: null, serving_size: '5 crackers (30 g)', nova_group: 3 })));
  const serving = quantityShortcuts(crackers.record).find((x) => x.id === 'serving');
  const bread = resolveFromOFF(shapeOFF(off({ quantity: '20 oz (567 g)', nova_group: 3, categories_tags: ['en:breads'] })));
  const pkg = quantityShortcuts(bread.record).find((x) => x.id === 'package');
  const cans = resolveFromOFF(shapeOFF(off({ quantity: '10 x 222 mL', categories_tags: ['en:sodas'] })));
  const item = quantityShortcuts(cans.record).find((x) => x.id === 'package');

  const entryOf = (record, q) => {
    const s = scoreEntry(record, q);
    return buildEntry(s, record, { entry_id: `e-${Math.random()}`, food_name: 'x', quantity: q, local_date: '2026-09-27' });
  };
  const cases = [
    [crackers.record, enteredShortcut(serving, 2), '2 servings (60 g)'],
    [bread.record, enteredShortcut(pkg, 1), '1 package (567 g)'],
    [cans.record, enteredShortcut(item, 1), '1 of 10 (222 ml)'],
    [crackers.record, enteredShortcut(serving, 1 / 2), '1/2 serving (15 g)'],
  ];
  for (const [rec, q, want] of cases) eq('AU', `AV-44: renders "${want}"`, quantityAsEntered(entryOf(rec, q)), want);

  const two = entryOf(crackers.record, enteredShortcut(serving, 2));
  eq('AU', 'AV-44: stores the multiple and the shortcut unit', `${two.quantity_value} ${two.quantity_unit}`, '2 serving');
  eq('AU', 'AV-44: …and the declared size', JSON.stringify([two.quantity_shortcut.size_value, two.quantity_shortcut.size_unit]), '[30,"g"]');
  near('AU', 'AV-44: quantity_g is 60 — scoring resolved it', two.quantity_g, 60);
  near('AU', 'AV-44: the score equals logging 60 g directly', two.score, entryOf(crackers.record, { value: 60, unit: 'g' }).score);
  eq('AU', 'a gram entry still renders as before', quantityAsEntered(entryOf(crackers.record, { value: 45, unit: 'g' })), '45 g');

  // The store accepts it (SCHEMA-6 field) and it round-trips unchanged.
  const store = new Store(new MemoryBackend(), { today: '2026-09-27' });
  const saved = await store.putEntry(two);
  eq('AU', 'SCHEMA-6: the store accepts quantity_shortcut and stamps schema 6', saved.schema_version, 6);
  eq('AU', 'SCHEMA-6: …and it renders the same from storage', quantityAsEntered(await store.getEntry(two.entry_id)), '2 servings (60 g)');

  /* ---- discrimination ---- */
  const v22 = `${two.quantity_g} g`;                              // v2.2 stored the resolved grams
  check('AU', 'AV-44 DISCRIMINATES: storing the resolved grams renders "60 g"; the rule renders "2 servings (60 g)"',
    v22 === '60 g' && quantityAsEntered(two) === '2 servings (60 g)');
  discrimination.push(['AV-44', 'shortcut stored as resolved grams (v2.2)', 'categorical', '"60 g" vs "2 servings (60 g)"']);
}

/* ---------------- run ---------------- */

suiteAR(); suiteAS(); suiteAT(); await suiteAU();
const heads = { AR: 'SUITE AR — AV-41, P5 fixed serving', AS: 'SUITE AS — AV-42, declared per 100 ml',
  AT: 'SUITE AT — AV-43, declared bounds', AU: 'SUITE AU — AV-44, shortcut entries' };
for (const k of Object.keys(heads)) {
  console.log(`\n${heads[k]}`); console.log('='.repeat(heads[k].length));
  for (const l of results[k]) console.log(l);
}
console.log('\nDISCRIMINATION — §10 convention'); console.log('='.repeat(31));
for (const [id, d, delta, note] of discrimination) console.log(`  ${id.padEnd(6)} ${d.padEnd(48)} ${String(delta).padStart(12)}  ${note}`);
console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
