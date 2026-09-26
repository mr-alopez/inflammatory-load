/**
 * Spec v2.1 §3.3c: the package quantity and the per-serving read.
 * Vectors AV-35, AV-36.
 *
 * Suites:
 *   AL. AV-35 — dual-unit package strings, end to end through the resolver
 *   AM. AV-36 — per-serving fields under a per-serving basis, end to end
 */

import { parsePackage, resolveFromOFF, parseQuantity } from '../src/sources.js';
import { shapeOFF } from '../src/client.js';
import { scoreEntry } from '../src/scoring.js';
import { prefillFromRefusal } from '../src/prefill.js';

const TOL = 1e-9;
let pass = 0, fail = 0;
const results = { AL: [], AM: [] };
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
  eq('AL', 'AV-35: "20 oz (567 g)" → per_100g (rule 3)', basis('20 oz (567 g)'), 'per_100g');
  eq('AL', 'AV-35: "12 fl oz (355 mL)" → per_100ml (rule 2)', basis('12 fl oz (355 mL)'), 'per_100ml');
  eq('AL', 'AV-35: "16 oz" → per_100g', basis('16 oz'), 'per_100g');
  eq('AL', 'AV-35: "500 g (16 fl oz)" → refused (rule 4)', basis('500 g (16 fl oz)'), 'BASIS_UNRESOLVED');
  eq('AL', 'AV-35: "1 loaf" → refused (rule 4)', basis('1 loaf'), 'BASIS_UNRESOLVED');

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
  eq('AL', '§3.3c: "1,000 g" is one thousand grams', parsePackage('1,000 g')?.value, 1000);
  eq('AL', '§3.3c: "1,5 kg" is not read as 5 kg — it does not resolve', parsePackage('1,5 kg'), null);
  eq('AL', '§3.3c: "12 gummies" is not 12 g', parsePackage('12 gummies'), null);
  eq('AL', '§3.3c: "12 FL OZ" in capitals is volume', parsePackage('12 FL OZ')?.kind, 'volume');
  eq('AL', '§3.3c: "1.5 L" is 1500 ml', parsePackage('1.5 L')?.value, 1500);

  discrimination.push(['AV-35', 'strict reader on "20 oz (567 g)"', 'categorical', 'refuses vs resolves per_100g — ~140 of 300 products']);
  discrimination.push(['AV-35', 'oz matched before fl oz', 'categorical', 'a drink refuses (figures disagree) or scores on per_100g']);
  discrimination.push(['AV-35', 'first figure wins on disagreeing figures', 'categorical', 'resolves as mass vs refuses under rule 4']);
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

/* ---------------- run ---------------- */

suiteAL(); suiteAM();
const heads = { AL: 'SUITE AL — AV-35, dual-unit package strings', AM: 'SUITE AM — AV-36, per-serving fields' };
for (const k of Object.keys(heads)) {
  console.log(`\n${heads[k]}`); console.log('='.repeat(heads[k].length));
  for (const l of results[k]) console.log(l);
}
console.log('\nDISCRIMINATION — §10 convention'); console.log('='.repeat(31));
for (const [id, d, delta, note] of discrimination) console.log(`  ${id.padEnd(6)} ${d.padEnd(44)} ${String(delta).padStart(12)}  ${note}`);
console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
