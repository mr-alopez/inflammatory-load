/**
 * Spec v2.1 §3.3c: the package quantity and the per-serving read.
 * Vectors AV-35 to AV-40.
 *
 * Suites:
 *   AL. AV-35 — dual-unit package strings, end to end through the resolver
 *   AM. AV-36 — per-serving fields under a per-serving basis, end to end
 *   AN. AV-37 — serving strings read by the same rule (rule 1)
 *   AO. AV-38 — the serving-string fallback for rules 3 and 4; the serving shortcut
 *   AP. AV-39 — the unit table, every row; commas
 *   AQ. AV-40 — multipacks
 */

import { parsePackage, resolveFromOFF, parseQuantity, quantityShortcuts, resolveShortcut } from '../src/sources.js';
import { readDeclared, DECLARED_UNITS } from '../src/declared.js';
import { parseServing } from '../src/prefill.js';
import { shapeOFF } from '../src/client.js';
import { scoreEntry } from '../src/scoring.js';
import { prefillFromRefusal } from '../src/prefill.js';

const TOL = 1e-9;
let pass = 0, fail = 0;
const results = { AL: [], AM: [], AN: [], AO: [], AP: [], AQ: [] };
const discrimination = [];
function check(s, label, ok, note = '') {
  ok ? pass++ : fail++;
  results[s].push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  — ${note}` : ''}`);
}
const eq = (s, label, a, e) => check(s, label, a === e, `actual ${JSON.stringify(a)}  expected ${JSON.stringify(e)}`);
const near = (s, label, a, e) => check(s, label, Math.abs(a - e) < TOL, `actual ${a}  expected ${e}`);

/** A minimal real-shaped OFF product: only the package string varies. */
const product = (quantity, extra = {}) => ({
  code: '0000000000035', product_name: 'Test', nutrition_data_per: '100g', quantity,
  serving_size: null, nova_group: 3, categories_tags: ['en:sodas'], ingredients: [],
  nutriments: { sodium_100g: 0.01, 'added-sugars_100g': 10, 'saturated-fat_100g': 0, fiber_100g: 0,
    'energy-kcal_100g': 42, proteins_100g: 0, carbohydrates_100g: 10, fat_100g: 0 },
  ...extra,
});

/* ================================================================== *
 * AL — AV-35
 * ================================================================== */

function suiteAL() {
  // The five cases, at the parser.
  eq('AL', 'AV-35: "20 oz (567 g)" reads as mass', parsePackage('20 oz (567 g)')?.kind, 'mass');
  eq('AL', 'AV-35: …net weight is the metric 567 g', parsePackage('20 oz (567 g)')?.value, 567);
  eq('AL', 'AV-35: "12 fl oz (355 mL)" reads as volume', parsePackage('12 fl oz (355 mL)')?.kind, 'volume');
  eq('AL', 'AV-35: …net is the metric 355 ml', parsePackage('12 fl oz (355 mL)')?.value, 355);
  eq('AL', 'AV-35: "16 oz" alone reads as mass', parsePackage('16 oz')?.kind, 'mass');
  near('AL', 'AV-35: …converted exactly: 453.59237 g', parsePackage('16 oz')?.value, 453.59237);
  eq('AL', 'AV-35: "500 g (16 fl oz)" — figures disagree, does not resolve', parsePackage('500 g (16 fl oz)'), null);
  eq('AL', 'AV-35: "1 loaf" — no figure, does not resolve', parsePackage('1 loaf'), null);

  // End to end: the basis each one resolves to.
  const basis = (q) => {
    const r = resolveFromOFF(shapeOFF(product(q, { categories_tags: q.includes('fl oz') || /ml/i.test(q) ? ['en:sodas'] : ['en:breads'] })));
    return r.resolved ? scoreEntry(r.record, { value: 100, unit: 'g' }).basis : r.reason;
  };
  eq('AL', 'AV-35: "20 oz (567 g)" → per_100g (rule 4)', basis('20 oz (567 g)'), 'per_100g');
  eq('AL', 'AV-35: "12 fl oz (355 mL)" → per_100ml (rule 3)', basis('12 fl oz (355 mL)'), 'per_100ml');
  eq('AL', 'AV-35: "16 oz" → per_100g', basis('16 oz'), 'per_100g');
  eq('AL', 'AV-35: "500 g (16 fl oz)" → refused (rule 5)', basis('500 g (16 fl oz)'), 'BASIS_UNRESOLVED');
  eq('AL', 'AV-35: "1 loaf" → refused (rule 5)', basis('1 loaf'), 'BASIS_UNRESOLVED');

  // The package shortcut's net weight is the resolved figure (§3.3).
  const r567 = resolveFromOFF(shapeOFF(product('20 oz (567 g)', { categories_tags: ['en:breads'] })));
  eq('AL', '§3.3: the package shortcut offers the metric 567 g', r567.record?.off.quantity.value, 567);

  /* ---- discrimination: each defect, exercised ---- */

  // 1. The pre-v2.1 reader refuses the most common US format outright.
  eq('AL', 'AV-35 DISCRIMINATES: the old strict reader cannot read "20 oz (567 g)"',
    parseQuantity('20 oz (567 g)'), null);

  // 2. oz matched before fl oz: a drink's figures disagree, or it reads as mass.
  // The realistic form of the defect: a unit lookup that checks `oz` before
  // `fl oz`. "12 fl oz" contains "oz", so it is taken as a mass figure.
  const ozFirst = (t) => {
    const kinds = [];
    for (const seg of t.split('(')) {
      const s = seg.toLowerCase();
      if (s.includes('oz')) kinds.push('mass');          // checked first: the defect
      else if (s.includes('fl oz') || s.includes('ml')) kinds.push('volume');
    }
    return kinds;
  };
  const naive = ozFirst('12 fl oz (355 mL)');
  check('AL', 'AV-35 DISCRIMINATES: checking oz before fl oz makes a drink\'s figures disagree',
    new Set(naive).size === 2, `naive reads: ${naive.join(', ')}`);
  eq('AL', 'AV-35 DISCRIMINATES: …and a bare "12 fl oz" is read as MASS by the defect',
    ozFirst('12 fl oz')[0], 'mass');
  eq('AL', 'AV-35: …where the real reader resolves it, as volume',
    parsePackage('12 fl oz (355 mL)')?.kind, 'volume');
  eq('AL', 'AV-35: …and a bare "12 fl oz" is volume, never mass', parsePackage('12 fl oz')?.kind, 'volume');

  // 3. First figure wins: a disagreeing string resolves when it must refuse.
  const firstWins = (t) => { const m = t.match(/(\d+)\s*(g|fl oz)/); return m ? (m[2] === 'g' ? 'mass' : 'volume') : null; };
  check('AL', 'AV-35 DISCRIMINATES: first-figure-wins resolves "500 g (16 fl oz)"; the rule refuses it',
    firstWins('500 g (16 fl oz)') === 'mass' && parsePackage('500 g (16 fl oz)') === null);

  // 4. A rounded ounce.
  near('AL', 'AV-35 DISCRIMINATES: a rounded 28.35 g ounce gives 453.6, not 453.59237', 16 * 28.35, 453.6);

  // Read, never guessed: separators and look-alikes.
  // v2.2 (AV-39): a comma figure does not resolve in EITHER direction.
  eq('AL', '§3.3c: "1,5 kg" is not read as 5 kg — it does not resolve', parsePackage('1,5 kg'), null);
  eq('AL', '§3.3c: "12 gummies" is not 12 g', parsePackage('12 gummies'), null);
  eq('AL', '§3.3c: "12 FL OZ" in capitals is volume', parsePackage('12 FL OZ')?.kind, 'volume');
  eq('AL', '§3.3c: "1.5 L" is 1500 ml', parsePackage('1.5 L')?.value, 1500);

  discrimination.push(['AV-35', 'strict reader on "20 oz (567 g)"', 'categorical', 'refuses vs resolves per_100g — 39 of 300 products']);
  discrimination.push(['AV-35', 'oz matched before fl oz', 'categorical', 'a drink refuses (figures disagree) or scores on per_100g']);
  discrimination.push(['AV-35', 'first figure wins on disagreeing figures', 'categorical', 'resolves as mass vs refuses under rule 5']);
  discrimination.push(['AV-35', 'rounded ounce (28.35)', (453.6 - 453.59237).toExponential(3), '453.6 g vs 453.59237 g']);
}

/* ================================================================== *
 * AM — AV-36
 * ================================================================== */

function suiteAM() {
  const raw = {
    code: '0000000000036', product_name: 'Per-Serving Crackers', nutrition_data_per: 'serving',
    quantity: '200 g', serving_size: '40 g', nova_group: 3, categories_tags: ['en:crackers'], ingredients: [],
    nutriments: {
      sodium_serving: 0.2, sodium_100g: 0.5,
      'added-sugars_serving': 1, 'added-sugars_100g': 2.5,
      'saturated-fat_serving': 0.4, 'saturated-fat_100g': 1,
      fiber_serving: 0.8, fiber_100g: 2,
      'energy-kcal_serving': 180, 'energy-kcal_100g': 450,
      proteins_serving: 4, proteins_100g: 10,
      carbohydrates_serving: 28, carbohydrates_100g: 70,
      fat_serving: 6, fat_100g: 15,
    },
  };
  const shaped = shapeOFF(raw);
  eq('AM', 'AV-36: under a per-serving basis the shaper reads sodium_serving (200 mg)', shaped.nutriments.sodium_mg, 200);

  const r = resolveFromOFF(shaped);
  eq('AM', 'AV-36: the record resolves', r.resolved, true);
  const s = scoreEntry(r.record, { value: 40, unit: 'g' });
  eq('AM', 'AV-36: basis is per_serving (rule 1)', s.basis, 'per_serving');
  near('AM', 'AV-36: 40 g logged → 200 mg sodium as consumed', s.asConsumed.sodium_mg, 200);

  // The defect: _100g read under the per-serving label.
  const defect = scoreEntry({ ...r.record, reported: { ...r.record.reported, sodium_mg: 500 } }, { value: 40, unit: 'g' });
  near('AM', 'AV-36 DISCRIMINATES: reading sodium_100g gives 500 mg', defect.asConsumed.sodium_mg, 500);
  near('AM', 'AV-36: …the correct value is 0.4× the defective one — serving mass / 100',
    s.asConsumed.sodium_mg / defect.asConsumed.sodium_mg, 0.4);

  // A per-100g record is unchanged: it still reads _100g.
  const per100 = shapeOFF({ ...raw, nutrition_data_per: '100g' });
  eq('AM', 'AV-36: a per-100 g record still reads sodium_100g (500 mg)', per100.nutriments.sodium_mg, 500);

  // Prefill follows the basis: per-serving values are one serving already, not scaled again.
  const grainy = { ...raw, ingredients: [{ text: 'whole wheat flour' }, { text: 'enriched wheat flour' }] };
  const refused = resolveFromOFF(shapeOFF(grainy));
  eq('AM', '§8.5: a per-serving record refusing on grain carries a prefill', refused.reason, 'GRAIN_MAJORITY_UNKNOWN');
  eq('AM', '§8.5: …its serving is the declared 40 g', refused.prefill?.serving_mass_g, 40);
  eq('AM', '§8.5: …and sodium is 200 mg, not 200 × 0.4 = 80', refused.prefill?.values.sodium_mg, 200);

  discrimination.push(['AV-36', 'reading _100g under a per-serving basis', (500 - 200).toExponential(3),
    '500 mg vs 200 mg — correct is 0.4× defective (serving mass / 100)']);
}

/* ================================================================== *
 * AN — AV-37: serving strings (rule 1)
 * ================================================================== */

/** A per-serving OFF record: only the serving string varies. */
const perServing = (serving_size, extra = {}) => ({
  code: '0000000000037', product_name: 'Test', nutrition_data_per: 'serving', quantity: null,
  serving_size, nova_group: 3, categories_tags: ['en:breads'], ingredients: [],
  nutriments: { sodium_serving: 0.12, 'added-sugars_serving': 1, 'saturated-fat_serving': 0,
    fiber_serving: 2, 'energy-kcal_serving': 70, proteins_serving: 4, carbohydrates_serving: 12, fat_serving: 1 },
  ...extra,
});
const basisOf = (raw) => {
  const r = resolveFromOFF(shapeOFF(raw));
  return r.resolved ? scoreEntry(r.record, { value: 26, unit: 'g' }).basis : r.reason;
};
const pair = (q) => JSON.stringify(q ? [q.value, q.unit] : null);

function suiteAN() {
  eq('AN', 'AV-37: "1 slice (26 g)" → per_serving', basisOf(perServing('1 slice (26 g)')), 'per_serving');
  const slice = resolveFromOFF(shapeOFF(perServing('1 slice (26 g)')));
  eq('AN', 'AV-37: …serving 26 g', pair(slice.record?.off.serving_size), '[26,"g"]');
  // A volume serving needs a density to score (§3.3a), so the vector's cup is milk.
  const cup = resolveFromOFF(shapeOFF(perServing('1 cup (240 mL)', { categories_tags: ['en:milks'] })));
  eq('AN', 'AV-37: "1 cup (240 mL)" → serving 240 ml (the metric figure)', pair(cup.record?.off.serving_size), '[240,"ml"]');
  eq('AN', 'AV-37: …basis per_serving', cup.resolved && scoreEntry(cup.record, { value: 240, unit: 'ml' }).basis, 'per_serving');
  eq('AN', 'AV-37: the same cup with no density class refuses on density, not on the basis',
    resolveFromOFF(shapeOFF(perServing('1 cup (240 mL)'))).reason, 'DENSITY_UNRESOLVED');
  // v2.3: household measure + parenthesised metric figure — the metric figure is the serving.
  eq('AN', 'AV-37: "2 tbsp (32 g)" → per_serving', basisOf(perServing('2 tbsp (32 g)')), 'per_serving');
  const pb = resolveFromOFF(shapeOFF(perServing('2 tbsp (32 g)')));
  eq('AN', 'AV-37: …serving 32 g', pair(pb.record?.off.serving_size), '[32,"g"]');
  near('AN', 'AV-37: …declared density 32 g / 29.5735295625 ml = 1.0820596…',
    pb.record && pb.record.derived_density.mass_g / pb.record.derived_density.volume_ml, 32 / 29.5735295625);
  const third = pb.record && scoreEntry(pb.record, { value: 1 / 3, unit: 'tbsp' });
  near('AN', 'AV-37: 1/3 tbsp of it is 5.3333… g (step 1, the declared pair)', third?.quantity_g, 32 / 6);
  eq('AN', 'AV-37: …density provenance DERIVED', third?.densityProvenance, 'DERIVED');
  eq('AN', 'AV-37: "1 cup (54 g)" resolves as mass, 54 g', pair(readDeclared('1 cup (54 g)', { serving: true })), '[54,"g"]');
  eq('AN', 'AV-37: the typo "1 thsp (15 ml)" reads 15 ml — only the parenthesised figure decides',
    pair(readDeclared('1 thsp (15 ml)', { serving: true })), '[15,"ml"]');
  eq('AN', '§3.3c: outside the form — two metric figures — agreement still applies',
    readDeclared('2 tbsp (33 g) (33 g)', { serving: true }), null);
  // v2.4: either order — "14 g (1 Tbsp)" is the same serving written the other way.
  eq('AN', 'AV-37: "14 g (1 Tbsp)" — metric first — is a 14 g serving',
    pair(readDeclared('14 g (1 Tbsp)', { serving: true })), '[14,"g"]');
  near('AN', 'AV-37: …and pairs 14 g with one tablespoon',
    readDeclared('14 g (1 Tbsp)', { serving: true })?.density?.volume_ml, 14.78676478125);
  eq('AN', '§3.3c: two household figures fall to the agreement rule ("1 cup 2 tbsp (40 g)")',
    readDeclared('1 cup 2 tbsp (40 g)', { serving: true }), null);
  eq('AN', '§3.3c: neither figure in parentheses is not the form ("14 g 1 tbsp")',
    readDeclared('14 g 1 tbsp', { serving: true }), null);
  eq('AN', '§3.3c: the convention is for serving strings only — a package "2 tbsp (32 g)" does not resolve',
    readDeclared('2 tbsp (32 g)'), null);
  eq('AN', 'AV-37: "1 slice" — no figure, refuses', basisOf(perServing('1 slice')), 'BASIS_UNRESOLVED');
  // Fractions are figures too, in every spelling a label uses (live: "1 ½ cup (39 g)").
  eq('AN', '§3.3c: a package "1 ½ cup (39 g)" refuses like "1 1/2 cup (39 g)"', readDeclared('1 ½ cup (39 g)'), null);
  near('AN', '§3.3c: as a serving, "1 ½ cup (39 g)" pairs 39 g with 354.88235475 ml',
    readDeclared('1 ½ cup (39 g)', { serving: true })?.density?.volume_ml, 354.88235475);
  near('AN', '§3.3c: "½ cup" is 118.29411825 ml', readDeclared('½ cup')?.value, 118.29411825);
  near('AN', '§3.3c: "1 ½ cup" is 354.88235475 ml', readDeclared('1 ½ cup')?.value, 354.88235475);
  eq('AN', '§3.3c: a serving "0.75 cup cereal (55 g)" is 55 g', pair(readDeclared('0.75 cup cereal (55 g)', { serving: true })), '[55,"g"]');
  // A spelled-out volume word still pairs (live: "2 tablespoon (32 g)").
  near('AN', '§3.3c: "2 tablespoon (32 g)" pairs 32 g with 2 tbsp',
    readDeclared('2 tablespoon (32 g)', { serving: true })?.density?.volume_ml, 29.5735295625);

  // The live record that found it: Nature's Own 100% Whole Wheat, 0072250037129.
  const natures = perServing('1 slice (26 g)', { quantity: '20 oz (567 g)' });
  eq('AN', 'AV-37: the live 0072250037129 record ("20 oz (567 g)", "1 slice (26 g)") → per_serving',
    basisOf(natures), 'per_serving');

  // One reader: the prefill form reads the serving rule 1 reads.
  for (const t of ['1 slice (26 g)', '1 cup (240 mL)', '2 tbsp (32 g)', '1 slice']) {
    const d = readDeclared(t, { serving: true });
    eq('AN', `one reader: prefill and rule 1 agree on "${t}"`,
      JSON.stringify(parseServing(t)), JSON.stringify(d ? { value: d.value, unit: d.unit } : null));
  }

  /* ---- discrimination ---- */
  eq('AN', 'AV-37 DISCRIMINATES: the strict reader refuses "1 slice (26 g)"', parseQuantity('1 slice (26 g)'), null);
  // v2.2's agreement rule refused the US label convention outright.
  check('AN', 'AV-37 DISCRIMINATES: agreement-within-the-string refuses "2 tbsp (32 g)"; the convention reads 32 g',
    readDeclared('2 tbsp (32 g)') === null && readDeclared('2 tbsp (32 g)', { serving: true })?.value === 32);
  // A rounded 15 ml tablespoon in the pair: 32/30 g/ml, so 1/3 tbsp is 5.2578 g, not 5.3333.
  const roundedTbsp = (1 / 3) * 14.78676478125 * (32 / 30);
  check('AN', 'AV-37 DISCRIMINATES: a 15 ml tablespoon in the pair gives 1/3 tbsp = 5.2575 g, not 5.3333 g',
    Math.abs(roundedTbsp - 32 / 6) > 0.07 && Math.abs(third?.quantity_g - 32 / 6) < TOL, `defective ${roundedTbsp}`);
  near('AN', 'AV-37 DISCRIMINATES: reading the cup, not the metric figure, gives 236.5882365 ml',
    8 * 29.5735295625, 236.5882365);
  discrimination.push(['AV-37', 'strict serving reader on "1 slice (26 g)"', 'categorical', 'refuses vs per_serving at 26 g — the live 0072250037129']);
  discrimination.push(['AV-37', 'agreement rule on "2 tbsp (32 g)" (v2.2)', 'categorical', 'refuses vs per_serving at 32 g']);
  discrimination.push(['AV-37', 'rounded 15 ml tbsp in the density pair', (32 / 6 - roundedTbsp).toExponential(3), '1/3 tbsp: 5.2579 g vs 5.3333 g']);
  discrimination.push(['AV-37', 'cup read instead of the metric 240 mL', (240 - 236.5882365).toExponential(3), '236.588 ml vs 240 ml']);
}

/* ================================================================== *
 * AO — AV-38: the serving-string fallback; the serving shortcut
 * ================================================================== */

function suiteAO() {
  const crackers = product(null, { serving_size: '5 crackers (30 g)', categories_tags: ['en:crackers'] });
  const r = resolveFromOFF(shapeOFF(crackers));
  eq('AO', 'AV-38: no package, serving "5 crackers (30 g)" → resolves', r.resolved, true);
  eq('AO', 'AV-38: …basis per_100g (rule 4, by the serving)', r.resolved && scoreEntry(r.record, { value: 30, unit: 'g' }).basis, 'per_100g');
  const sc = r.resolved ? quantityShortcuts(r.record) : [];
  const serving = sc.find((s) => s.id === 'serving');
  eq('AO', 'AV-38: …offers "1 serving (30 g)"', serving?.label, '1 serving (30 g)');
  eq('AO', 'AV-38: …and no package shortcut', sc.some((s) => s.id === 'package'), false);
  eq('AO', '§3.3: 1/2 serving resolves to 15 g before scoring', JSON.stringify(serving && resolveShortcut(serving, 1 / 2)), '{"value":15,"unit":"g"}');
  eq('AO', '§3.3: 2 servings resolve to 60 g', serving && resolveShortcut(serving, 2).value, 60);

  // v2.3: the package decides alone; the two fields are never required to agree.
  const c = resolveFromOFF(shapeOFF(product('500 g', { serving_size: '1 cup (240 mL)', categories_tags: ['en:crackers'] })));
  eq('AO', 'AV-38: package "500 g", serving "1 cup (240 mL)" → resolves as mass (the package decides)',
    c.resolved && scoreEntry(c.record, { value: 30, unit: 'g' }).basis, 'per_100g');
  const oil = resolveFromOFF(shapeOFF(product('500 ml', { serving_size: '1 serving (15 g)', categories_tags: ['en:vegetable-oils'] })));
  eq('AO', 'AV-38: the live oil shape — package "500 ml", serving "1 serving (15 g)" → per_100ml',
    oil.resolved && scoreEntry(oil.record, { value: 15, unit: 'g' }).basis, 'per_100ml');

  // The serving never changes the basis: a per-100 g record stays per 100.
  const both = resolveFromOFF(shapeOFF(product('500 g', { serving_size: '30 g', categories_tags: ['en:crackers'] })));
  eq('AO', 'AV-38: package and serving agree → per_100g, not per_serving', scoreEntry(both.record, { value: 30, unit: 'g' }).basis, 'per_100g');
  eq('AO', 'AV-38: …both shortcuts are offered, package first',
    quantityShortcuts(both.record).map((s) => s.label).join(' | '), '1 package (500 g) | 1 serving (30 g)');

  /* ---- discrimination ---- */
  // Pre-v2.2: rules 3 and 4 read the package only.
  const packageOnly = (off) => (off.quantity ? 'resolves' : 'refuses');
  check('AO', 'AV-38 DISCRIMINATES: package-only rules refuse the crackers; the fallback resolves them',
    packageOnly({ quantity: null }) === 'refuses' && r.resolved);
  // v2.2's cross-field agreement rule refused both.
  const agreement = (pk, sv) => (pk && sv && pk !== sv ? null : pk ?? sv);
  check('AO', 'AV-38 DISCRIMINATES: cross-field agreement refuses "500 ml" + "15 g"; the package decides volume',
    agreement('volume', 'mass') === null && oil.resolved);
  discrimination.push(['AV-38', 'rules 3/4 read the package only', 'categorical', 'refuses vs per_100g']);
  discrimination.push(['AV-38', 'cross-field agreement (v2.2)', 'categorical', 'refused vs per_100ml / per_100g']);
}

/* ================================================================== *
 * AP — AV-39: the unit table, every row; commas
 * ================================================================== */

const TABLE = [
  // [spelling, unit, kind]
  ['g', 'g', 'mass'], ['gm', 'g', 'mass'], ['gram', 'g', 'mass'], ['grams', 'g', 'mass'],
  ['kg', 'kg', 'mass'], ['kilogram', 'kg', 'mass'], ['kilograms', 'kg', 'mass'],
  ['oz', 'oz', 'mass'], ['ounce', 'oz', 'mass'], ['ounces', 'oz', 'mass'],
  ['lb', 'lb', 'mass'], ['lbs', 'lb', 'mass'], ['pound', 'lb', 'mass'], ['pounds', 'lb', 'mass'],
  ['ml', 'ml', 'volume'], ['millilitre', 'ml', 'volume'], ['millilitres', 'ml', 'volume'],
  ['milliliter', 'ml', 'volume'], ['milliliters', 'ml', 'volume'],
  ['cl', 'cl', 'volume'], ['dl', 'dl', 'volume'],
  ['l', 'l', 'volume'], ['litre', 'l', 'volume'], ['litres', 'l', 'volume'], ['liter', 'l', 'volume'], ['liters', 'l', 'volume'],
  ['fl oz', 'fl oz', 'volume'], ['fl. oz', 'fl oz', 'volume'], ['floz', 'fl oz', 'volume'],
  ['fluid ounce', 'fl oz', 'volume'], ['fluid ounces', 'fl oz', 'volume'],
  ['cup', 'cup', 'volume'], ['cups', 'cup', 'volume'],
  ['tbsp', 'tbsp', 'volume'], ['tablespoon', 'tbsp', 'volume'], ['tablespoons', 'tbsp', 'volume'],
  ['tsp', 'tsp', 'volume'], ['teaspoon', 'tsp', 'volume'], ['teaspoons', 'tsp', 'volume'],
];

function suiteAP() {
  for (const [spelling, unit, kind] of TABLE) {
    for (const t of [`2 ${spelling}`, `2 ${spelling.toUpperCase()}`]) {
      const r = readDeclared(t);
      const expect = 2 * DECLARED_UNITS[unit].factor;
      check('AP', `AV-39: "${t}" is ${kind}, ${expect} ${kind === 'mass' ? 'g' : 'ml'}`,
        r?.kind === kind && Math.abs(r.value - expect) < TOL, JSON.stringify(r));
    }
  }
  near('AP', 'AV-39: dl = 100 ml', readDeclared('10 dl')?.value, 1000);
  near('AP', 'AV-39: fluid ounce is exact', readDeclared('1 fluid ounce')?.value, 29.5735295625);
  eq('AP', 'AV-39: "12 fluid ounces" is never an ounce of mass', readDeclared('12 fluid ounces')?.kind, 'volume');

  // Must-reject: a count, a bare number, and a unit not in the table.
  for (const t of ['6 muffins', '4pcs', '16 servings', '10', '12 gummies', '500 mg', '1 loaf']) {
    eq('AP', `AV-39: "${t}" has no figure and does not resolve`, readDeclared(t), null);
  }
  // Commas, in both directions.
  eq('AP', 'AV-39: "1,5 kg" does not resolve', readDeclared('1,5 kg'), null);
  eq('AP', 'AV-39: "1,500 g" does not resolve', readDeclared('1,500 g'), null);
  eq('AP', 'AV-39: a comma figure beside a clean one still does not resolve', readDeclared('3 lb (1,361 g)'), null);

  /* ---- discrimination ---- */
  const stripCommas = (t) => Number(t.replace(/,/g, '').match(/[\d.]+/)[0]);
  check('AP', 'AV-39 DISCRIMINATES: stripping commas reads "1,5 kg" as 15 kg; the rule refuses',
    stripCommas('1,5 kg') === 15 && readDeclared('1,5 kg') === null);
  check('AP', 'AV-39 DISCRIMINATES: a comma-as-decimal reader reads "1,500 g" as 1.5 g; the rule refuses',
    Number('1,500'.replace(',', '.')) === 1.5 && readDeclared('1,500 g') === null);
  check('AP', 'AV-39 DISCRIMINATES: the v2.1 list refused "680 gm"; the table reads it',
    parsePackageV21('680 gm') === null && readDeclared('680 gm')?.value === 680);
  discrimination.push(['AV-39', 'comma stripped ("1,5 kg")', 'categorical', '15 kg vs refused']);
  discrimination.push(['AV-39', 'comma as decimal ("1,500 g")', 'categorical', '1.5 g vs refused']);
  discrimination.push(['AV-39', 'spelling missing from the table', 'categorical', 'refuses vs resolves ("680 gm", "10 pounds", "10 dl")']);
}

/** The v2.1 unit list, for the discrimination above: g kg oz lb ml cl l fl oz. */
const parsePackageV21 = (t) => {
  const m = t.match(/(\d+(?:\.\d+)?)\s*(fl\.?\s*oz|oz|lbs?|kg|g|ml|cl|l)(?![a-z])/i);
  return m ? m : null;
};

/* ================================================================== *
 * AQ — AV-40: multipacks
 * ================================================================== */

function suiteAQ() {
  const cans = resolveFromOFF(shapeOFF(product('10 x 222 mL', { categories_tags: ['en:sodas'] })));
  eq('AQ', 'AV-40: "10 x 222 mL" resolves the kind from the item: volume', readDeclared('10 x 222 mL')?.kind, 'volume');
  eq('AQ', 'AV-40: …the record\'s package value is one item, 222 ml', cans.record?.off.quantity.value, 222);
  eq('AQ', 'AV-40: …basis per_100ml (rule 3)', scoreEntry(cans.record, { value: 222, unit: 'ml' }).basis, 'per_100ml');
  const pkgShortcut = (raw) => {
    const d = readDeclared(raw);
    return quantityShortcuts({ off: { quantity: { value: d.value, unit: d.unit, label: d.label, pack: d.pack } } })[0];
  };
  eq('AQ', 'AV-40: …offers "1 of 10 (222 ml)"', quantityShortcuts(cans.record)[0]?.label, '1 of 10 (222 ml)');
  eq('AQ', 'AV-40: "10 × 222 mL" (multiplication sign) reads the same', pkgShortcut('10 × 222 mL')?.label, '1 of 10 (222 ml)');
  eq('AQ', 'AV-40: 2 of the pack resolve to 444 ml, never 2220', resolveShortcut(pkgShortcut('10 x 222 mL'), 2).value, 444);
  eq('AQ', '§3.3: a single package reads "1 package (…)"', pkgShortcut('20 oz (567 g)')?.label, '1 package (567 g)');
  eq('AQ', 'multipack: the item follows "N x", not a later pack total', pkgShortcut('6 x 12 fl oz (2.13 L)')?.label, '1 of 6 (12 fl oz)');

  /* ---- discrimination ---- */
  near('AQ', 'AV-40 DISCRIMINATES: multiplying offers 2220 ml, 10× the item', 10 * 222, 2220);
  check('AQ', 'AV-40 DISCRIMINATES: metric-preferred picks the 2.13 L total over the 12 fl oz item',
    readDeclared('12 fl oz (2.13 L)')?.value === 2130 && readDeclared('6 x 12 fl oz (2.13 L)')?.value !== 2130);
  discrimination.push(['AV-40', 'the pack multiplied', (2220 - 222).toExponential(3), '2220 ml vs 222 ml — 10×']);
}

/* ---------------- run ---------------- */

suiteAL(); suiteAM(); suiteAN(); suiteAO(); suiteAP(); suiteAQ();
const heads = { AL: 'SUITE AL — AV-35, dual-unit package strings', AM: 'SUITE AM — AV-36, per-serving fields',
  AN: 'SUITE AN — AV-37, serving strings', AO: 'SUITE AO — AV-38, serving fallback and shortcut',
  AP: 'SUITE AP — AV-39, the unit table', AQ: 'SUITE AQ — AV-40, multipacks' };
for (const k of Object.keys(heads)) {
  console.log(`\n${heads[k]}`); console.log('='.repeat(heads[k].length));
  for (const l of results[k]) console.log(l);
}
console.log('\nDISCRIMINATION — §10 convention'); console.log('='.repeat(31));
for (const [id, d, delta, note] of discrimination) console.log(`  ${id.padEnd(6)} ${d.padEnd(44)} ${String(delta).padStart(12)}  ${note}`);
console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
