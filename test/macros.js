/**
 * Macro capture and normalization — spec v0.8 §11 step 4.
 *
 * Suites:
 *   H. Vectors AV-16, AV-17, AV-18
 *   I. NOT_APPLICABLE normalization (reported separately — no vector covers it)
 *   J. §6.2b summation basis and §2.5 structural prohibitions
 */

import * as macros from '../src/macros.js';
import { normalizeWindow, macroTotals, macroTotalsRounded, windowLoad, windowKcal,
  roundMacro, NORMALIZATION } from '../src/macros.js';
import { createManualRecord, ABSENT } from '../src/manual.js';
import { scoreEntry } from '../src/scoring.js';
import { migrateEntryV1toV2 } from '../src/store.js';

const TOL = 1e-6;
let pass = 0, fail = 0;
const results = { H: [], I: [], J: [] };
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

/** A stored-entry shape sufficient for window arithmetic. */
const entry = (score, energy_kcal, extra = {}) => ({
  score,
  macros: { energy_kcal, protein_g: 10, carbohydrate_g: 30, fat_g: 8 },
  macro_basis: 'SCHEMA_2',
  source_basis: 'per_100g',
  ...extra,
});

/* ================================================================== *
 * SUITE H — AV-16, AV-17, AV-18
 * ================================================================== */

function suiteH() {
  /* ---- AV-16 — preconditions met ---- */
  // Three completed days: WINDOW_LOAD +18.4, WINDOW_KCAL 6,240.
  const window16 = [
    entry(6.0, 1200), entry(4.0, 900),   // day 1
    entry(5.4, 2100),                     // day 2
    entry(3.0, 2040),                     // day 3
  ];
  near('H', 'AV-16: WINDOW_LOAD', windowLoad(window16), 18.4);
  near('H', 'AV-16: WINDOW_KCAL', windowKcal(window16), 6240);

  let divided = 0;
  const r16 = normalizeWindow(window16, { onDivide: () => { divided++; } });
  check('H', 'AV-16: status AVAILABLE', r16.status === NORMALIZATION.AVAILABLE, r16.status);
  near('H', 'AV-16: LOAD_PER_1000 (unrounded)', r16.load_per_1000, 2.948718);
  near('H', 'AV-16: LOAD_PER_1000 displayed to 1 dp',
    macros.roundHalfAwayFromZero(r16.load_per_1000, 1), 2.9);
  check('H', 'AV-16: division ran exactly once', divided === 1, `${divided}`);
  check('H', 'AV-16: no band on the normalized line (§4.6)',
    !('band' in r16) && !('band_label' in r16), Object.keys(r16).join(', '));

  /* ---- AV-17 — calorie data missing ---- */
  const window17 = [...window16.slice(0, 3), entry(3.0, null)];
  let divided17 = 0;
  const r17 = normalizeWindow(window17, { onDivide: () => { divided17++; } });
  check('H', 'AV-17: status NO_CALORIE_DATA',
    r17.status === NORMALIZATION.NO_CALORIE_DATA, r17.status);
  check('H', 'AV-17: LOAD_PER_1000 not computed (key absent)',
    !('load_per_1000' in r17), Object.keys(r17).join(', '));
  check('H', 'AV-17: no division ran', divided17 === 0);
  check('H', 'AV-17: energy never imputed to satisfy the denominator',
    r17.window_kcal === null);
  // Imputing 0 for the null entry yields a real-looking figure from a window
  // that has no defined denominator. The defect is producing a number at all,
  // so the delta is categorical — but name the number, per §10.
  const impute17 = windowLoad(window17) / (windowKcal(window17) / 1000);
  discrimination.push(['AV-17', 'imputing 0 kcal for the null entry', 'categorical',
    `no value computed vs ${fmt(impute17)} if imputed`]);

  /* ---- AV-18 — empty window ---- */
  let divided18 = 0;
  const r18 = normalizeWindow([], { onDivide: () => { divided18++; } });
  check('H', 'AV-18: status NO_ENTRIES', r18.status === NORMALIZATION.NO_ENTRIES, r18.status);
  check('H', 'AV-18: LOAD_PER_1000 not computed at all (key absent)',
    !('load_per_1000' in r18), Object.keys(r18).join(', '));
  check('H', 'AV-18: entry-count precondition fired BEFORE any division',
    divided18 === 0, `division calls: ${divided18}`);
  check('H', 'AV-18: no NaN escapes',
    Object.values(r18).every((v) => typeof v !== 'number' || Number.isFinite(v)));
  discrimination.push(['AV-18', 'checking only the null condition (0/0)',
    'categorical', 'NaN vs no value computed — binary']);

  // Precondition 3: all entries have kcal, but they sum to zero.
  const rZero = normalizeWindow([entry(1.0, 0), entry(2.0, 0)]);
  check('H', 'precondition 3: WINDOW_KCAL = 0 refuses',
    rZero.status === NORMALIZATION.NO_CALORIE_DATA && !('load_per_1000' in rZero));
}

/* ================================================================== *
 * SUITE I — NOT_APPLICABLE normalization (reported separately)
 * ================================================================== */

function suiteI() {
  // A real NOT_APPLICABLE entry, built through the manual path (§8.5, §3.3c).
  const rumRecord = createManualRecord({
    name: 'Rum', classifications: { P3: { abv_percent: 40 } }, volume_ml: 44,
    nutrients: { added_sugar_g: ABSENT, sodium_mg: ABSENT, saturated_fat_g: ABSENT, fiber_g: ABSENT },
    macros: { energy_kcal: ABSENT, protein_g: ABSENT, carbohydrate_g: ABSENT, fat_g: ABSENT },
  });
  const scored = scoreEntry(rumRecord, { value: 44, unit: 'ml' });

  // The premise that makes this test necessary: it is complete by every other
  // measure, so a "skip incomplete entries" implementation would let it through.
  check('I', 'NOT_APPLICABLE entry is NOT INCOMPLETE (§3.3c, S4)',
    scored.isIncomplete === false, `incomplete = [${scored.incomplete}]`);
  check('I', 'NOT_APPLICABLE entry has a real score',
    Math.abs(scored.score - 1.9837714285714285) < TOL, fmt(scored.score));

  const naEntry = {
    score: scored.score,
    macros: { energy_kcal: null, protein_g: null, carbohydrate_g: null, fat_g: null },
    macro_basis: 'SCHEMA_2',
    source_basis: 'NOT_APPLICABLE',
  };

  let divided = 0;
  const alone = normalizeWindow([naEntry], { onDivide: () => { divided++; } });
  check('I', 'window of one NOT_APPLICABLE entry → NO_CALORIE_DATA',
    alone.status === NORMALIZATION.NO_CALORIE_DATA, alone.status);
  check('I', 'LOAD_PER_1000 not computed', !('load_per_1000' in alone));
  check('I', 'no division ran', divided === 0);

  // The dangerous case: an otherwise complete, calorie-bearing window that one
  // NOT_APPLICABLE entry joins. Nothing else about it is missing.
  const mixed = [entry(6.0, 1200), entry(4.0, 900), naEntry];
  const rMixed = normalizeWindow(mixed, { onDivide: () => { divided++; } });
  check('I', 'one NOT_APPLICABLE entry suppresses an otherwise valid window',
    rMixed.status === NORMALIZATION.NO_CALORIE_DATA, rMixed.status);
  check('I', 'still no division', divided === 0);

  // Control: the same window without it normalizes.
  const control = normalizeWindow([entry(6.0, 1200), entry(4.0, 900)]);
  check('I', 'control — same window without it DOES normalize',
    control.status === NORMALIZATION.AVAILABLE, control.status);
  near('I', 'control LOAD_PER_1000', control.load_per_1000, 10 / 2.1);

  // It is also exempt from `partial`: it has no macro values to lack.
  const { partial } = macroTotals([naEntry]);
  check('I', 'NOT_APPLICABLE entry does not make a day partial (§3.3c)',
    partial === false, `partial = ${partial}`);

  const delta = Math.abs(control.load_per_1000 - 0);
  discrimination.push(['NOT_APPLICABLE', 'treating it as a normalizable entry',
    delta.toExponential(3),
    `discriminates (suppressed vs ${fmt(control.load_per_1000)} if wrongly admitted)`]);
}

/* ================================================================== *
 * SUITE J — summation basis and §2.5 structural prohibitions
 * ================================================================== */

function suiteJ() {
  /* §6.2b summation basis (K1): five entries at 152.65 kcal */
  const five = Array.from({ length: 5 }, () => entry(2.0, 152.65));
  const { totals } = macroTotals(five);
  near('J', 'full-precision kcal total', totals.energy_kcal, 763.25);
  check('J', 'rounds once to 763, not 765',
    macroTotalsRounded(five).totals.energy_kcal === 763,
    `${macroTotalsRounded(five).totals.energy_kcal}`);
  check('J', 'summing displayed integers would give 765 — the defect',
    five.reduce((a, e) => a + roundMacro(e.macros.energy_kcal), 0) === 765);
  discrimination.push(['K1', 'summing per-entry displayed integers',
    Math.abs(765 - 763).toExponential(3), 'discriminates (correct 763 vs defective 765)']);

  /* §8.6a — a PRE_SCHEMA_2 entry does not make a day partial */
  const legacy = migrateEntryV1toV2({
    entry_id: 'l1', product_id: 'p', source: 'OFF', quantity_value: 100, quantity_unit: 'g',
    reported: { added_sugar_g: 1, sodium_mg: 1, saturated_fat_g: 1, fiber_g: 1 },
    as_consumed: { added_sugar_g: 1, sodium_mg: 1, saturated_fat_g: 1, fiber_g: 1 },
    occasion_category: 'snack', category_map_version: 'CATMAP-1', coeff_version: 'COEFF-1',
    score: 0.1, local_date: '2026-09-01', schema_version: 1,
  });
  check('J', 'PRE_SCHEMA_2 entry does not set partial', macroTotals([legacy]).partial === false);
  check('J', 'a genuinely missing macro DOES set partial',
    macroTotals([entry(1, 100), { ...entry(1, 100), macros: { energy_kcal: 100, protein_g: null, carbohydrate_g: 1, fat_g: 1 } }]).partial === true);

  /* §2.5 — structural prohibitions */
  // V4: matched against camelCase-split tokens, not substrings — 'ring' is
  // inside 'driverString' and a substring match flags the innocent.
  const FORBIDDEN_TOKENS = new Set(['target','goal','budget','remaining','progress','quota',
    'allowance','band','color','colour','verdict','ring','gauge','streak']);
  const tokens = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const FORBIDDEN = { test: (n) => tokens(n).some((t) => FORBIDDEN_TOKENS.has(t)) };
  const exportNames = Object.keys(macros);
  const badExports = exportNames.filter((n) => FORBIDDEN.test(n));
  check('J', '[export surface: src/macros.js] §2.5: no export can produce a target, goal or band',
    badExports.length === 0, badExports.length ? badExports.join(', ') : `${exportNames.length} exports clean`);

  const shapes = [
    macroTotals(five),
    macroTotalsRounded(five),
    normalizeWindow([entry(6.0, 1200)]),
    normalizeWindow([]),
  ];
  const badKeys = shapes.flatMap((s) => Object.keys(s).filter((k) => FORBIDDEN.test(k)));
  check('J', '[returned object keys: macros.js] §2.5: no returned shape carries a target, band or colour key',
    badKeys.length === 0, badKeys.length ? badKeys.join(', ') : 'all shapes clean');

  /**
   * §2.5, fifth form: neither check above had ever flagged a name, so neither
   * had been shown to separate a forbidden name from a permitted one. Both the
   * historical near-misses are kept as accept cases — `ring` inside
   * `driverString` and `band` inside `bandwidth` — because a substring matcher
   * passes the reject cases and fails these.
   */
  check('J', '§2.5 forbidden-token matcher DISCRIMINATES',
    ['dailyTarget', 'calorieGoal', 'bandLabel', 'colorFor', 'progressRing', 'streak']
      .every((n) => FORBIDDEN.test(n))
    && ['driverString', 'macroTotals', 'normalizeWindow', 'windowKcal', 'roundMacro', 'bandwidth']
      .every((n) => !FORBIDDEN.test(n)),
    'catches 6 forbidden names, clears 6 permitted ones including driverString and bandwidth');

  check('J', '§2.5: macro totals expose exactly the four fields',
    Object.keys(totals).join(',') === 'energy_kcal,protein_g,carbohydrate_g,fat_g',
    Object.keys(totals).join(','));

  /* §1.3 rounding, half away from zero, at 0 dp */
  check('J', 'roundMacro(152.5) = 153', roundMacro(152.5) === 153);
  check('J', 'roundMacro(-152.5) = -153 (away from zero)', roundMacro(-152.5) === -153);
  check('J', 'roundMacro(0.4) = 0', roundMacro(0.4) === 0);
}

/* ---------------- run ---------------- */

suiteH();
suiteI();
suiteJ();

const heads = {
  H: 'SUITE H — vectors AV-16, AV-17, AV-18',
  I: 'SUITE I — NOT_APPLICABLE normalization (reported separately)',
  J: 'SUITE J — §6.2b summation basis and §2.5 structural prohibitions',
};
for (const k of ['H', 'I', 'J']) {
  console.log(`\n${heads[k]}`);
  console.log('='.repeat(heads[k].length));
  for (const line of results[k]) console.log(line);
}

console.log('\nDISCRIMINATION — §10 convention');
console.log('='.repeat(31));
for (const [id, label, delta, note] of discrimination) {
  console.log(`  ${id.padEnd(16)} ${label.padEnd(44)} ${String(delta).padStart(12)}  ${note}`);
}

console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
