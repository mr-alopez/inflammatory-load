/**
 * Spec v2.3: the answers to the v2.2 report. Vectors AV-41 to AV-44.
 *
 * Suites:
 *   AR. AV-41 — P5's fixed serving (COEFF-2): the cooking spray
 *   AS. AV-42 — a declared per-100 ml basis (§3.3c rule 2)
 *   AT. AV-43 — §3.1 declared bounds: "N% or less"
 *   AU. AV-44 — §6.1b shortcut entries, stored and rendered as entered
 *   AV. AV-45 — rounding half away from zero, positive (§1.3)
 *   AW. AV-46 — label density precision (§3.3a step 1)
 */

import { resolveFromOFF, quantityShortcuts, enteredShortcut, declaredBoundSettlesWhole,
  resolveGrainMajority } from '../src/sources.js';
import { shapeOFF } from '../src/client.js';
import { scoreEntry } from '../src/scoring.js';
import { buildEntry } from '../src/entry.js';
import { quantityAsEntered, formatScore, entryLine } from '../src/display.js';
import { readDeclared } from '../src/declared.js';
import { resolveDensity, resolveVolumeDensity } from '../src/scoring.js';
import { DENSITY_MAP } from '../src/coefficients.js';
import { COEFF_VERSION } from '../src/coefficients.js';
import { EntryStore as Store } from '../src/store.js';
import { MemoryBackend } from '../src/backends/memory.js';

const TOL = 1e-9;
let pass = 0, fail = 0;
const results = { AR: [], AS: [], AT: [], AU: [], AV: [], AW: [] };
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
    ['the clause ended at a sentence stop', 'Whole wheat flour, 2% or less of: salt. Wheat flour, water'],
  ];
  for (const [why, text] of rejects) check('AT', `AV-43 must-reject: ${why}`, !declaredBoundSettlesWhole(text));
  eq('AT', 'AV-43: a text-less record still refuses', resolveGrainMajority(PARSED, null), 'unknown');

  // v2.4 (item 6).
  check('AT', 'AV-43: "contains less than 2% of" is a bound like "2% or less"',
    declaredBoundSettlesWhole('Whole wheat flour, water, contains less than 2% of: salt, wheat flour'));
  check('AT', 'AV-43: "whole oats" as the first ingredient qualifies',
    declaredBoundSettlesWhole('Whole oats, sugar, 2% or less of: salt, enriched wheat flour'));
  check('AT', 'AV-43: "refined sunflower oil" outside the clause no longer blocks',
    declaredBoundSettlesWhole('Whole wheat flour, water, refined sunflower oil, 2% or less of: salt, wheat flour'));
  eq('AT', '§3.1: a parsed list with whole wheat and "refined palm oil" is whole — an oil is not a grain',
    resolveGrainMajority([{ text: 'whole wheat flour' }, { text: 'refined palm oil' }]), 'whole');
  eq('AT', '§3.1: "refined wheat flour" still counts as refined grain',
    resolveGrainMajority([{ text: 'whole wheat flour' }, { text: 'refined wheat flour' }]), 'unknown');
  const bareRefined = (t) => /\brefined\b/i.test(t);                    // the v2.3 pattern's defect
  check('AT', 'AV-43 DISCRIMINATES: the bare word "refined" counts an oil as refined grain; the rule does not',
    bareRefined('refined sunflower oil')
    && declaredBoundSettlesWhole('Whole wheat flour, refined sunflower oil, 2% or less of: salt, wheat flour'));

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

/* ================================================================== *
 * AV — AV-45: rounding half away from zero, positive
 * ================================================================== */

function suiteAV() {
  const rec = { name: 'Half-way test', product_id: 'local:half', source: 'MANUAL', manual: { serving_mass_g: 100 },
    classifications: {}, occasion_category: 'UNCATEGORIZED', category_map_version: 'CATMAP-1',
    reported: { added_sugar_g: 2.5, sodium_mg: 0, saturated_fat_g: 0, fiber_g: 0,
      energy_kcal: 10, protein_g: 0, carbohydrate_g: 2.5, fat_g: 0 } };
  const s = scoreEntry(rec, { value: 100, unit: 'g' });
  eq('AV', 'AV-45: basis per_serving, provenance DECLARED', `${s.basis}/${s.basisProvenance}`, 'per_serving/DECLARED');
  near('AV', 'AV-45: P1 contributes +0.25', s.contributions.P1, 0.25);
  near('AV', 'AV-45: sum +0.25 exact', s.score, 0.25);
  eq('AV', 'AV-45: renders +0.3', formatScore(s.score), '+0.3');
  const e = buildEntry(s, rec, { entry_id: 'e-45', food_name: rec.name, quantity: { value: 100, unit: 'g' }, local_date: '2026-09-27' });
  eq('AV', 'AV-45: the entry line reads "Half-way test — +0.3"', entryLine(e)[0], 'Half-way test — +0.3');
  eq('AV', 'AV-15\'s negative case still renders −1.9', formatScore(-1.85), '\u22121.9');

  /* ---- discrimination: the string assertion catches both defects ---- */
  const halfEven = (v) => { const x = v * 10, f = Math.floor(x), r = x - f;
    const n = Math.abs(r - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(x); return n / 10; };
  const trunc = (v) => Math.trunc(v * 10) / 10;
  check('AV', 'AV-45 DISCRIMINATES: half to even gives +0.2', halfEven(0.25) === 0.2 && formatScore(0.25) === '+0.3');
  check('AV', 'AV-45 DISCRIMINATES: truncation gives +0.2', trunc(0.25) === 0.2);
  discrimination.push(['AV-45', 'half to even / truncation', 'categorical', '"+0.2" vs "+0.3"']);
}

/* ================================================================== *
 * AW — AV-46: label density precision
 * ================================================================== */

function suiteAW() {
  // The oil: "1 tbsp (14 g)" — the 14 g is ±0.5 g, ±3.6%, over the 1% limit.
  const oil = resolveFromOFF(shapeOFF(off({ nutrition_data_per: '100ml', quantity: '500 ml',
    serving_size: '1 tbsp (14 g)', categories_tags: ['en:vegetable-oils'] })));
  near('AW', 'AV-46: the pair is uncertain by 0.5/14 = 3.57%', oil.record.derived_density.rel_uncertainty, 0.5 / 14);
  const d = resolveDensity(oil.record);
  near('AW', 'AV-46: "1 tbsp (14 g)" yields 0.91 from DMAP-1', d.density, DENSITY_MAP.culinary_oil);
  eq('AW', 'AV-46: …provenance DMAP-1', d.provenance, 'DMAP-1');

  // Precise enough: "1 cup (240 mL)" is ±0.2%; a mass pair "8 fl oz (240.5 g)" ±0.02% is used first.
  near('AW', '"240 mL" is uncertain by 0.5/240 = 0.21%', 0.5 / 240, readDeclared('1 cup (240 mL)', { serving: true }) ? 0.5 / 240 : NaN);
  const milk = resolveFromOFF(shapeOFF(off({ nutrition_data_per: '100ml', quantity: '1 l',
    serving_size: '8 fl oz (248.5 g)', categories_tags: ['en:milks'] })));
  const dm = resolveDensity(milk.record);
  eq('AW', 'a precise label pair (248.5 g, ±0.02%) is used before the class', dm.provenance, 'DERIVED');
  near('AW', '…at 248.5 / 236.5882365 g/ml', dm.density, 248.5 / 236.5882365);

  // No class resolves: the imprecise pair is the fallback, not a refusal.
  const pb = resolveFromOFF(shapeOFF(off({ serving_size: '2 tbsp (32 g)', categories_tags: ['en:spreads'] })));
  const dp = resolveVolumeDensity(pb.record);
  eq('AW', 'no class: "2 tbsp (32 g)" (±1.6%) falls back to the label pair', dp.provenance, 'DERIVED');
  near('AW', '…32 / 29.5735295625', dp.density, 32 / 29.5735295625);

  /* ---- discrimination ---- */
  const labelFirst = oil.record.derived_density.mass_g / oil.record.derived_density.volume_ml;
  check('AW', 'AV-46 DISCRIMINATES: label-first gives 0.947; the rule gives 0.91',
    Math.abs(labelFirst - 0.94678) < 1e-4 && Math.abs(d.density - 0.91) < 1e-9);
  discrimination.push(['AV-46', 'label pair used regardless of precision', (labelFirst - 0.91).toExponential(3), '0.947 vs 0.91 g/ml — 4.0%']);
}

/* ---------------- run ---------------- */

suiteAR(); suiteAS(); suiteAT(); await suiteAU(); suiteAV(); suiteAW();
const heads = { AR: 'SUITE AR — AV-41, P5 fixed serving', AS: 'SUITE AS — AV-42, declared per 100 ml',
  AT: 'SUITE AT — AV-43, declared bounds', AU: 'SUITE AU — AV-44, shortcut entries',
  AV: 'SUITE AV — AV-45, rounding half away from zero', AW: 'SUITE AW — AV-46, label density precision' };
for (const k of Object.keys(heads)) {
  console.log(`\n${heads[k]}`); console.log('='.repeat(heads[k].length));
  for (const l of results[k]) console.log(l);
}
console.log('\nDISCRIMINATION — §10 convention'); console.log('='.repeat(31));
for (const [id, d, delta, note] of discrimination) console.log(`  ${id.padEnd(6)} ${d.padEnd(48)} ${String(delta).padStart(12)}  ${note}`);
console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
