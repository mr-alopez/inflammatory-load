/**
 * Volume units, bulk density and the quantity line — spec v1.9 §3.3, §3.3a
 * step 2b, §6.1b. Vectors AV-28, AV-29, AV-30.
 *
 * Suites:
 *   AA. AV-28 — 12 fl oz of a water-based beverage
 *   AB. AV-29 — a scoopable solid through BDMAP-1, and the refusal without one
 *   AC. §3.3 fractional input, and the form constraint that follows the same
 *       rule the conversion does
 *   AD. AV-30 — §6.1b renders the quantity as entered, and §6.1 is unchanged
 */

import { scoreEntry, resolveVolumeDensity, QUANTITY_UNITS, ENTRY_VOLUME_UNITS } from '../src/scoring.js';
import { buildEntry } from '../src/entry.js';
import { parseAmount, orderSearchResults, searchResultLabel } from '../src/sources.js';
import { classifyBulk, bulkDensity, BDMAP_VERSION, BULK_DENSITY_MAP, BULK_DERIVATIONS } from '../src/bulk-density-map.js';
import { usdaDerivedDensity } from '../src/client.js';
import { entryLine, quantityAsEntered, formatAmount } from '../src/display.js';

const TOL = 1e-6;
let pass = 0, fail = 0;
const results = { AA: [], AB: [], AC: [], AD: [] };
const discrimination = [];

const fmt = (n) => (typeof n === 'number'
  ? n.toPrecision(12).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : String(n));

function check(s, label, ok, note = '') {
  ok ? pass++ : fail++;
  results[s].push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  — ${note}` : ''}`);
}
function near(s, label, actual, expected) {
  const m = Math.abs(actual - expected);
  check(s, label, m <= TOL, `actual ${fmt(actual)}  expected ${fmt(expected)}  margin ${m.toExponential(2)}`);
}
function eq(s, label, actual, expected) {
  check(s, label, actual === expected, `actual ${JSON.stringify(actual)}  expected ${JSON.stringify(expected)}`);
}

/* ---------- records ---------- */

const coffee = {
  name: 'Coffee, brewed', source: 'OFF', product_id: 'off:coffee', classifications: {},
  density_class: 'water_based_beverage', bulk_class: null,
  off: { nutrition_data_per: '100g', quantity: { value: 500, unit: 'ml' }, serving_size: null },
  reported: { added_sugar_g: 0, sodium_mg: 2, saturated_fat_g: 0, fiber_g: 0,
    energy_kcal: 1, protein_g: 0.1, carbohydrate_g: 0, fat_g: 0 },
};
const sugar = {
  name: 'Sugar, granulated', source: 'OFF', product_id: 'off:sugar', classifications: {},
  density_class: null, bulk_class: 'granulated_sugar',
  off: { nutrition_data_per: '100g', quantity: { value: 1000, unit: 'g' }, serving_size: null },
  reported: { added_sugar_g: 100, sodium_mg: 0, saturated_fat_g: 0, fiber_g: 0,
    energy_kcal: 387, protein_g: 0, carbohydrate_g: 100, fat_g: 0 },
};
const mystery = { ...sugar, name: 'Mystery Powder', product_id: 'off:mystery', bulk_class: null };

/* ================================================================== *
 * SUITE AA — AV-28
 * ================================================================== */

function suiteAA() {
  const r = scoreEntry(coffee, { value: 12, unit: 'fl oz' });
  check('AA', 'AV-28: the entry is created', r.created === true, r.reason ?? '');

  // 12 fl oz -> 354.882 ml, at DMAP-1 density 1.00 -> 354.882 g.
  near('AA', 'AV-28: quantity_g = 354.882', r.quantity_g, 12 * 29.5735295625);
  check('AA', 'AV-28: quantity_g rounds to 354.882', r.quantity_g.toFixed(3) === '354.882',
    r.quantity_g.toFixed(3));
  near('AA', 'AV-28: density 1.00 from DMAP-1', r.density, 1.0);
  eq('AA', 'AV-28: density provenance is DMAP-1', r.densityProvenance, 'DMAP-1');

  // §3.3: stored AS ENTERED, not as converted.
  const entry = buildEntry(r, coffee, {
    entry_id: 'u-1', food_name: coffee.name, quantity: { value: 12, unit: 'fl oz' },
    local_date: '2026-09-23', occasion_category: 'snack',
  });
  eq('AA', 'AV-28: quantity_value stored as entered', entry.quantity_value, 12);
  eq('AA', 'AV-28: quantity_unit stored as entered', entry.quantity_unit, 'fl oz');
  near('AA', 'AV-28: quantity_g is the canonical quantity', entry.quantity_g, 354.88235475);
  eq('AA', 'AV-28: the quantity renders as entered', quantityAsEntered(entry), '12 fl oz');
  // §6.1b (v1.9) renders it. §6.1's first line still does not — the two lines
  // are separate, which is the whole reason §6.1b is its own subsection.
  check('AA', "§6.1's first line still carries no quantity",
    !entryLine(entry)[0].includes('fl oz'), entryLine(entry)[0]);

  // Discrimination: a fluid ounce is not an ounce of mass.
  const ozAsMass = 12 * 28.349523125;
  near('AA', 'AV-28: the mass-ounce defect yields 340.194 g', ozAsMass, 340.1942775);
  discrimination.push(['AV-28', 'treating fl oz as an ounce of mass',
    Math.abs(354.88235475 - ozAsMass).toExponential(3),
    'correct 354.882 g vs defective 340.194 g — propagates to every nutrient and the score']);

  // The second defect: storing the converted value as the entered one.
  check('AA', 'AV-28: the converted-as-entered defect renders a different string',
    `${entry.quantity_value} ${entry.quantity_unit}` !== '354.88235475 ml');
  discrimination.push(['AV-28', 'storing the converted value as the entered one', 'categorical',
    '"12 fl oz" vs "354.882 ml" — differs as a rendered string']);
}

/* ================================================================== *
 * SUITE AB — AV-29
 * ================================================================== */

function suiteAB() {
  const r = scoreEntry(sugar, { value: 1 / 3, unit: 'tbsp' });
  check('AB', 'AV-29: the entry is created', r.created === true, r.reason ?? '');

  const ml = 14.78676478125 / 3;
  near('AB', 'AV-29: 1/3 tbsp is 4.929 ml', ml, 4.92892159375);
  near('AB', 'AV-29: quantity_g = 4.165 via BDMAP-1', r.quantity_g, ml * 0.845);
  check('AB', 'AV-29: quantity_g rounds to 4.165', r.quantity_g.toFixed(3) === '4.165',
    r.quantity_g.toFixed(3));
  near('AB', 'AV-29: bulk density 0.845', r.density, 0.845);
  eq('AB', 'AV-29: provenance is BDMAP-1', r.densityProvenance, 'BDMAP-1');
  eq('AB', 'AV-29: the selecting class is stored', r.bulkClass, 'granulated_sugar');

  const entry = buildEntry(r, sugar, {
    entry_id: 'u-2', food_name: sugar.name, quantity: { value: 1 / 3, unit: 'tbsp' },
    local_date: '2026-09-23', occasion_category: 'snack',
  });
  eq('AB', 'AV-29: density_class stored, so a spooned quantity is auditable',
    entry.density_class, 'granulated_sugar');
  eq('AB', 'AV-29: density_provenance stored on the entry', entry.density_provenance, 'BDMAP-1');

  // §3.3a: step 2 BEFORE step 2b. A liquid class wins.
  const both = { ...sugar, density_class: 'water_based_beverage' };
  const b = scoreEntry(both, { value: 1, unit: 'tbsp' });
  eq('AB', '§3.3a: a liquid class takes precedence over BDMAP-1', b.densityProvenance, 'DMAP-1');

  // The refusal: no class, no conversion. Never at a guessed density.
  const u = scoreEntry(mystery, { value: 1, unit: 'tbsp' });
  eq('AB', 'AV-29: a solid with no bulk class is REFUSED, not converted', u.created, false);
  eq('AB', 'AV-29: the refusal names the density rule', u.reason, 'DENSITY_UNRESOLVED');

  // ...and the form asks the same question the conversion does, so a unit the
  // form offers always converts.
  eq('AB', 'AV-29: resolveVolumeDensity agrees with the conversion for sugar',
    resolveVolumeDensity(sugar).provenance, 'BDMAP-1');
  eq('AB', 'AV-29: resolveVolumeDensity refuses the same product the scorer does',
    resolveVolumeDensity(mystery).density, null);

  const guessed = ml * 3 * 1.0;   // 1 tbsp at an assumed density of 1.00
  discrimination.push(['AV-29', 'assuming a bulk density of 1.00',
    Math.abs(4.92892159375 - 4.16493874671875).toExponential(3),
    'correct 4.165 g vs defective 4.929 g — 18% on every scaled nutrient']);
  discrimination.push(['AV-29', 'converting a classless solid at a guessed density', 'categorical',
    `entry refused vs created at ${fmt(guessed)} g`]);

  // BDMAP-1 is auditable: every density carries its derivation.
  const undocumented = Object.keys(BULK_DENSITY_MAP).filter((c) => !BULK_DERIVATIONS[c]);
  check('AB', 'BDMAP-1: every density records the measure it was derived from',
    undocumented.length === 0 && Object.keys(BULK_DENSITY_MAP).length === 9,
    undocumented.length ? `undocumented: ${undocumented}` : '9 classes, 9 derivations');
  check('AB', 'BDMAP-1: each derivation reproduces its density to 3 dp',
    Object.entries(BULK_DENSITY_MAP).every(([cls, d]) => {
      const m = BULK_DERIVATIONS[cls].match(/=\s*([0-9]+\.[0-9]+)\.?$/);
      return m && Math.abs(Number(m[1]) - d) < 0.0006;
    }));

  // §7.2a file order: specific before general. `brown-sugars` must beat `sugars`.
  eq('AB', 'BDMAP-1: specific classes precede general ones',
    classifyBulk(['en:brown-sugars', 'en:sugars']), 'brown_sugar');
  eq('AB', 'BDMAP-1: the general class still resolves alone',
    classifyBulk(['en:sugars']), 'granulated_sugar');
  eq('AB', 'BDMAP-1: an unmatched tag resolves to null, never a default',
    classifyBulk(['en:mystery']), null);
  eq('AB', 'BDMAP-1: bulkDensity(null) is null, never a fallback', bulkDensity(null), null);
}

/* ================================================================== *
 * SUITE AC — §3.3 fractional input, §8.1 ordering
 * ================================================================== */

function suiteAC() {
  // §3.3: "0.5", "1/3", "1 1/2" are all accepted.
  near('AC', '§3.3: "1/3" parses', parseAmount('1/3'), 1 / 3);
  near('AC', '§3.3: "1 1/2" parses', parseAmount('1 1/2'), 1.5);
  near('AC', '§3.3: "0.5" parses', parseAmount('0.5'), 0.5);
  near('AC', '§3.3: "2/3" parses', parseAmount('2/3'), 2 / 3);
  near('AC', '§3.3: ".5" parses', parseAmount('.5'), 0.5);

  // Refused, never guessed at.
  for (const bad of ['', 'abc', '0', '1/0', '-1', '1/2/3', '1..5']) {
    eq('AC', `§3.3: ${JSON.stringify(bad)} is refused, not rounded`, parseAmount(bad), null);
  }

  // §3.3's unit table, against the exact US customary definitions.
  near('AC', '§3.3: 1 fl oz = 29.5735 ml', ENTRY_VOLUME_UNITS['fl oz'], 29.5735295625);
  near('AC', '§3.3: 1 cup = 8 fl oz', ENTRY_VOLUME_UNITS.cup, 29.5735295625 * 8);
  near('AC', '§3.3: 1 tbsp = 1/2 fl oz', ENTRY_VOLUME_UNITS.tbsp, 29.5735295625 / 2);
  check('AC', '§3.3: the table agrees with the spec to its stated precision',
    ENTRY_VOLUME_UNITS['fl oz'].toFixed(4) === '29.5735'
    && ENTRY_VOLUME_UNITS.cup.toFixed(3) === '236.588'
    && ENTRY_VOLUME_UNITS.tbsp.toFixed(4) === '14.7868');
  check('AC', '§3.3: no teaspoon unit is offered — 1/3 tbsp is one teaspoon',
    !QUANTITY_UNITS.includes('tsp'), QUANTITY_UNITS.join(', '));

  // §8.1 ordering: USDA before OFF, source order kept within each group.
  const ordered = orderSearchResults({
    usda: [{ description: 'Coffee, brewed', dataType: 'SR Legacy', nutrients: { energy_kcal: 1 } },
      { description: 'Coffee, instant', dataType: 'Foundation', nutrients: { energy_kcal: 241 } }],
    off: [{ product_name: 'Iced Coffee', brands: 'Brand A', nutriments: { energy_kcal: 62 }, nutrition_data_per: '100ml' },
      { product_name: 'Coffee Drink', brands: null, nutriments: {} }],
  });
  eq('AC', '§8.1: USDA results come first', ordered.slice(0, 2).every((x) => x.source === 'USDA'), true);
  eq('AC', '§8.1: OFF results follow', ordered.slice(2).every((x) => x.source === 'OFF'), true);
  eq('AC', "§8.1: the source's own order is kept within a group",
    ordered[0].raw.description, 'Coffee, brewed');

  // §8.1 labelling: source always, brand where one exists, energy where known.
  const labels = ordered.map(searchResultLabel);
  eq('AC', '§8.1: a USDA result names its source and dataset',
    labels[0][1], 'USDA SR Legacy · 1 kcal/100 g');
  eq('AC', '§8.1: an OFF result names source, brand and energy',
    labels[2][1], 'Open Food Facts · Brand A · 62 kcal/100 ml');
  check('AC', '§8.1: a result with no brand and no energy still names its source',
    labels[3][1] === 'Open Food Facts');
  check('AC', '§8.1: no result renders as a bare name with nothing to choose on',
    labels.every(([, detail]) => detail.length > 0));
  discrimination.push(['§8.1', 'listing OFF before USDA', 'categorical',
    'a "coffee" search surfaces branded drinks above "Coffee, brewed"']);

  /**
   * §3.3a step 1 from USDA's declared foodPortions — the only route by which a
   * USDA product is enterable by volume, since USDA carries no categories_tags
   * for steps 2 or 2b to key on.
   */
  const cup = usdaDerivedDensity([{ amount: 1, gramWeight: 237, measureUnit: { name: 'cup' } }]);
  near('AC', '§3.3a step 1: 1 cup = 237 g gives volume 236.588 ml', cup.volume_ml, 236.5882365);
  eq('AC', '§3.3a step 1: the mass is carried through', cup.mass_g, 237);
  near('AC', '§3.3a step 1: 8 fl oz resolves to the same volume',
    usdaDerivedDensity([{ amount: 8, gramWeight: 237, measureUnit: { name: 'fl oz' } }]).volume_ml,
    236.5882365);
  eq('AC', '§3.3a step 1: a non-volume portion is skipped, not guessed at',
    usdaDerivedDensity([{ amount: 1, gramWeight: 50, measureUnit: { name: 'undetermined' } }]), null);

  /**
   * The shape USDA SR Legacy ACTUALLY returns, taken from fdcId 171881,
   * "Beverages, coffee, brewed, breakfast blend". measureUnit.name is the
   * literal string "undetermined" and the real unit is in `modifier`. A
   * fixture written from the expected shape passed while this one derived
   * nothing (§2.5).
   */
  const sr = usdaDerivedDensity([
    { amount: 1.0, gramWeight: 248.0, measureUnit: { name: 'undetermined' }, modifier: 'cup' },
  ]);
  check('AC', '§3.3a step 1: the REAL SR Legacy shape derives a density',
    sr !== null && sr.mass_g === 248, JSON.stringify(sr));
  near('AC', '§3.3a step 1: brewed coffee is 248 g per cup → 1.048 g/ml',
    sr.mass_g / sr.volume_ml, 248 / 236.5882365);
  eq('AC', '§3.3a step 1: a modifier naming no unit still derives nothing',
    usdaDerivedDensity([{ amount: 1, gramWeight: 50, measureUnit: { name: 'undetermined' }, modifier: 'piece' }]),
    null);
  check('AC', '§3.3a step 1: a compound modifier resolves its unit',
    usdaDerivedDensity([{ amount: 1, gramWeight: 240, measureUnit: { name: 'undetermined' }, modifier: 'cup (8 fl oz)' }])
      ?.volume_ml === 236.5882365);
  check('AC', '§3.3a step 1: a volume portion is found past a non-volume one',
    usdaDerivedDensity([
      { amount: 1, gramWeight: 50, measureUnit: { name: 'undetermined' } },
      { amount: 1, gramWeight: 237, measureUnit: { name: 'cup' } },
    ])?.mass_g === 237);
  eq('AC', '§3.3a step 1: no portions means no derivation, never a default',
    usdaDerivedDensity([]), null);
  eq('AC', '§3.3a step 1: a zero gram weight is refused',
    usdaDerivedDensity([{ amount: 1, gramWeight: 0, measureUnit: { name: 'cup' } }]), null);

  // A USDA record carrying portions derives; one without is gram-only.
  const usdaCoffee = { ...coffee, source: 'USDA', density_class: null,
    derived_density: { mass_g: 237, volume_ml: 236.5882365 } };
  eq('AC', '§3.3a: a USDA record with portions resolves a volume density',
    resolveVolumeDensity(usdaCoffee).provenance, 'DERIVED');
  const usdaNoPortions = { ...coffee, source: 'USDA', density_class: null, bulk_class: null };
  delete usdaNoPortions.derived_density;
  eq('AC', '§3.3a: a USDA record without portions is gram-only',
    resolveVolumeDensity(usdaNoPortions).density, null);
  discrimination.push(['§3.3a', 'reading USDA portions from /foods/search', 'categorical',
    'search carries no foodPortions, so no density derives and the worked case is gram-only']);
}

/* ================================================================== *
 * SUITE AD — AV-30, §6.1b the quantity renders as entered
 * ================================================================== */

function suiteAD() {
  // §3.3a step 1 from USDA foodPortions: 1 cup = 248 g → density 1.0482.
  const usdaCoffee = {
    name: 'Coffee, brewed', source: 'USDA', product_id: 'usda:171881', classifications: {},
    density_class: null, bulk_class: null,
    derived_density: { mass_g: 248, volume_ml: 236.5882365 },
    reported: { added_sugar_g: 0, sodium_mg: 2, saturated_fat_g: 0, fiber_g: 0,
      energy_kcal: 1, protein_g: 0.1, carbohydrate_g: 0, fat_g: 0 },
  };
  const r = scoreEntry(usdaCoffee, { value: 12, unit: 'fl oz' });
  check('AD', 'AV-30: the entry is created', r.created === true, r.reason ?? '');
  check('AD', 'AV-30: quantity_g is 372.0', r.quantity_g.toFixed(1) === '372.0',
    r.quantity_g.toFixed(3));

  const entry = buildEntry(r, usdaCoffee, {
    entry_id: 'q-1', food_name: 'Coffee, brewed', quantity: { value: 12, unit: 'fl oz' },
    local_date: '2026-09-23', occasion_category: 'beverage',
  });

  const line = quantityAsEntered(entry);
  eq('AD', 'AV-30: §6.1b renders "12 fl oz"', line, '12 fl oz');

  // The three defects, each visible as a string.
  check('AD', 'AV-30: it does NOT render the derived mass', !/372/.test(line), line);
  check('AD', 'AV-30: it does NOT render the converted volume', !/354|ml/.test(line), line);
  const first = entryLine(entry)[0];
  check('AD', "AV-30: §6.1's first line is unchanged — name and score only",
    /^Coffee, brewed — [+-][0-9]+\.[0-9]$/.test(first), first);
  check('AD', 'AV-30: the quantity is NOT appended to §6.1',
    !/fl oz/.test(first) && !first.includes(line), first);

  // The fraction is reconstructed, not rounded.
  const sugarEntry = buildEntry(
    scoreEntry(sugar, { value: 1 / 3, unit: 'tbsp' }), sugar,
    { entry_id: 'q-2', food_name: 'Sugar, granulated',
      quantity: { value: 1 / 3, unit: 'tbsp' }, local_date: '2026-09-23',
      occasion_category: 'snack' }
  );
  eq('AD', 'AV-30: 1/3 tbsp renders as "1/3 tbsp", not "0.33 tbsp"',
    quantityAsEntered(sugarEntry), '1/3 tbsp');

  // §6.1b's stated denominators, and the decimal fallback beyond them.
  eq('AD', '§6.1b: halves', formatAmount(0.5), '1/2');
  eq('AD', '§6.1b: thirds', formatAmount(2 / 3), '2/3');
  eq('AD', '§6.1b: quarters', formatAmount(0.25), '1/4');
  eq('AD', '§6.1b: eighths', formatAmount(3 / 8), '3/8');
  eq('AD', '§6.1b: mixed numbers', formatAmount(1.5), '1 1/2');
  eq('AD', '§6.1b: a whole number has no fraction', formatAmount(12), '12');
  eq('AD', '§6.1b: a fifth is not a culinary denominator — decimal, 2 places',
    formatAmount(0.2), '0.2');
  eq('AD', '§6.1b: trailing zeros stripped', formatAmount(2.5), '2 1/2');
  eq('AD', '§6.1b: beyond two places, rounded to two', formatAmount(0.123), '0.12');

  discrimination.push(['AV-30', 'rendering the derived mass', 'categorical',
    '"372 g" vs "12 fl oz" — differ in number and unit']);
  discrimination.push(['AV-30', 'rendering the converted volume', 'categorical',
    '"354.882 ml" vs "12 fl oz" — right as a volume, wrong as the quantity entered']);
  discrimination.push(['AV-30', 'appending the quantity to §6.1 instead of its own line',
    'categorical',
    '"Coffee, brewed — +0.4 · 12 fl oz" contains the right substring and breaks §6.1\'s format']);
  discrimination.push(['AV-30', 'rounding the fraction to a decimal', 'categorical',
    '"0.33 tbsp" vs "1/3 tbsp" — a rounding of the entered value, not a rendering of it']);
}

/* ---------------- run ---------------- */

suiteAA(); suiteAB(); suiteAC(); suiteAD();

const heads = {
  AA: 'SUITE AA — AV-28, volume entry in fluid ounces',
  AB: `SUITE AB — AV-29, scoopable solids via ${BDMAP_VERSION}`,
  AC: 'SUITE AC — §3.3 fractional input, §8.1 result order and labels',
  AD: 'SUITE AD — AV-30, §6.1b the quantity renders as entered',
};
for (const k of ['AA', 'AB', 'AC', 'AD']) {
  console.log(`\n${heads[k]}`);
  console.log('='.repeat(heads[k].length));
  for (const line of results[k]) console.log(line);
}

console.log('\nDISCRIMINATION — §10 convention');
console.log('='.repeat(31));
for (const [id, defect, delta, note] of discrimination) {
  console.log(`  ${id.padEnd(6)} ${defect.padEnd(52)} ${String(delta).padStart(12)}  ${note}`);
}

console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
