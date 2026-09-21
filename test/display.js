/**
 * Display layer — spec v0.9 §11 step 5.
 *
 * Every §6 string is compared for EXACT equality. A trailing space or a wrong
 * dash character is a defect.
 *
 * Suites:
 *   K. Vectors AV-2, AV-5, AV-8, AV-22, and step 5's half of AV-21
 *   L. §6.1a separator-omission matrix
 *   M. Suffix interaction — ` · partial` and ` · mixed coefficient versions`
 *   N. §4.3 banding on the unrounded value
 *   O. §6.6 structural prohibitions
 */

import * as display from '../src/display.js';
import { entryLine, entryMacroLine, incompleteMarker, completedDaySummary, todayLine,
  windowSummary, normalizedLine, dayMacroLine, bandDaily, bandWindow, formatScore,
  formatMacro, drivers } from '../src/display.js';
import { scoreEntry } from '../src/scoring.js';
import { resolveFromOFF } from '../src/sources.js';
import { createManualRecord } from '../src/manual.js';
import { macroTotals, normalizeWindow } from '../src/macros.js';
import { migrateEntryV1toV2, dayMacroLinePolicy } from '../src/store.js';
import { buildEntry } from '../src/entry.js';
import { fixtures } from './fixtures.js';

let pass = 0, fail = 0;
const results = { K: [], L: [], M: [], N: [], O: [] };
const nameAudit = [];

function eq(suite, label, actual, expected) {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  results[suite].push(ok
    ? `  ok   ${label}`
    : `  FAIL ${label}\n         actual   ${JSON.stringify(actual)}\n         expected ${JSON.stringify(expected)}`);
}
function check(suite, label, ok, note = '') {
  ok ? pass++ : fail++;
  results[suite].push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  — ${note}` : ''}`);
}

const fx = (id) => fixtures.find((f) => f.id === id);

/** Build a STORED entry (§8.4) — display reads these, never a score (G1). */
const ent = (scored, record, food_name, quantity) =>
  buildEntry(scored, record, { entry_id: 'x', food_name, quantity, local_date: '2026-09-18' });

/** AV-2 is a step 5 vector and is not in the step 1 fixture file. */
const AV2 = {
  id: 'AV-2',
  quantity: { value: 182, unit: 'g' },
  record: {
    name: 'Apple, medium',
    source: 'USDA',                       // SR Legacy — per_100g, provenance DECLARED
    classifications: { A4: true },
    reported: { added_sugar_g: 0, sodium_mg: 1, saturated_fat_g: 0.028, fiber_g: 2.4 },
  },
};

/* ================================================================== *
 * SUITE K — vectors
 * ================================================================== */

function suiteK() {
  /* ---- AV-2 — apple ---- */
  const r2 = scoreEntry(AV2.record, AV2.quantity);
  const lines2 = entryLine(ent(r2, AV2.record, 'Apple, medium', AV2.quantity));
  eq('K', 'AV-2 §6.1 entry line', lines2[0], 'Apple, medium — -2.4');
  eq('K', 'AV-2 §6.1 driver line', lines2[1], '1.5 servings fruit');

  /* ---- AV-8 — juice, §3.5 + §2.4 ---- */
  const av8raw = {
    code: 'oj', product_name: 'Orange juice',
    nutrition_data_per: '100g', quantity: '1000 ml', serving_size: null,
    ingredients: [], density_class: 'juice',
    juice_classified: true,                       // §7.2a category-tag lookup
    nutriments: {
      sugars_added_g: 0,                          // §3.5: ignored, never a fallback
      sugars_total_g: 8.7,                        // §3.5: this is what P1 reads
      sodium_mg: 0.8, saturated_fat_g: 0, fiber_g: 0.2,
    },
  };
  const av8 = resolveFromOFF(av8raw);
  check('K', 'AV-8 §3.5 selects the total-sugars field',
    av8.record.reported.added_sugar_g === 8.7, `${av8.record.reported.added_sugar_g}`);
  check('K', 'AV-8 §3.5 stores sugar_field_used', av8.record.sugar_field_used === 'total');
  check('K', 'AV-8 §3.5 suppresses A4', av8.record.classifications.A4 === undefined);

  const r8 = scoreEntry(av8.record, { value: 240, unit: 'ml' });
  const lines8 = entryLine(ent(r8, av8.record, 'Orange juice', { value: 240, unit: 'ml' }));
  eq('K', 'AV-8 §6.1 entry line', lines8[0], 'Orange juice — +2.0');
  eq('K', 'AV-8 §2.4 driver reads `sugar`, not `added sugar`', lines8[1], '20.9 g sugar');

  /* ---- AV-22 — K9's `<1` rule, both branches ---- */
  const av22rec = createManualRecord({
    name: 'Low-macro item', classifications: {}, serving_mass_g: 100,
    nutrients: { added_sugar_g: 0, sodium_mg: 100, saturated_fat_g: 0, fiber_g: 0.2 },
    macros: { energy_kcal: 12, protein_g: 0.4, carbohydrate_g: 3, fat_g: 0 },
  });
  const r22 = scoreEntry(av22rec, { value: 100, unit: 'g' });
  const lines22 = entryLine(ent(r22, av22rec, 'Low-macro item', { value: 100, unit: 'g' }));
  eq('K', 'AV-22 §6.1 entry line', lines22[0], 'Low-macro item — +0.1');
  check('K', 'AV-22 driver line omitted (nothing reaches 1.0)', lines22.length === 1);
  check('K', 'AV-22 omission is BELOW_THRESHOLD, not LEGACY_DEFICIENT (§6.1, G1)',
    display.driverState(ent(r22, av22rec, 'Low-macro item', { value: 100, unit: 'g' }))
      === display.DRIVER_STATE.BELOW_THRESHOLD);
  check('K', 'a SCHEMA-2 entry is LEGACY_DEFICIENT, distinguishable from empty drivers',
    display.driverState({ score: 1, food_name: 'x', as_consumed: {} })
      === display.DRIVER_STATE.LEGACY_DEFICIENT);
  check('K', 'AV-2 driver state is PRESENT',
    display.driverState(ent(r2, AV2.record, 'Apple, medium', AV2.quantity))
      === display.DRIVER_STATE.PRESENT);
  check('K', 'AV-22 entry is COMPLETE', r22.isIncomplete === false, `[${r22.incomplete}]`);
  eq('K', 'AV-22 §6.1a — 0.4 renders `<1`, exact 0 renders `0`',
    entryMacroLine({ energy_kcal: 12, protein_g: 0.4, carbohydrate_g: 3, fat_g: 0 }),
    '12 kcal · <1 g protein · 3 g carbs · 0 g fat');

  /* ---- AV-5 — five beers ---- */
  const av4 = fx('AV-4');
  const r4 = scoreEntry(av4.record, av4.quantity);
  const day = Array.from({ length: 5 }, () => ({
    score: r4.score,
    macros: {
      energy_kcal: r4.asConsumed.energy_kcal,
      protein_g: r4.asConsumed.protein_g,
      carbohydrate_g: r4.asConsumed.carbohydrate_g,
      fat_g: r4.asConsumed.fat_g,
    },
    macro_basis: 'SCHEMA_2', source_basis: r4.basis,
  }));
  const dailyLoad = day.reduce((a, e) => a + e.score, 0);
  eq('K', 'AV-5 §6.2 completed-day summary',
    completedDaySummary('2026-09-14', dailyLoad), '2026-09-14: +10.1 · Elevated');
  check('K', 'AV-5 band is D_ELEVATED on the unrounded load',
    bandDaily(dailyLoad).id === 'D_ELEVATED', `${dailyLoad}`);
  const t5 = macroTotals(day);
  eq('K', 'AV-5 §6.2b day macro line', dayMacroLine(t5.totals, { partial: t5.partial }),
    '763 kcal · 8 g protein · 63 g carbs · 0 g fat');
  check('K', 'AV-5 no partial suffix — every entry is COMPLETE', t5.partial === false);

  /* ---- AV-21 — step 5's half of the D7 split ---- */
  const legacy = migrateEntryV1toV2({
    entry_id: 'l1', product_id: 'p', source: 'OFF', quantity_value: 100, quantity_unit: 'g',
    reported: { added_sugar_g: 1, sodium_mg: 1, saturated_fat_g: 1, fiber_g: 1 },
    as_consumed: { added_sugar_g: 1, sodium_mg: 1, saturated_fat_g: 1, fiber_g: 1 },
    occasion_category: 'snack', category_map_version: 'CATMAP-1', coeff_version: 'COEFF-1',
    score: -0.4, local_date: '2026-09-01', schema_version: 1,
  });
  const tL = macroTotals([legacy]);
  check('K', 'AV-21 §6.2b line omitted entirely, not ` · partial`',
    dayMacroLine(tL.totals, { partial: tL.partial, omit: dayMacroLinePolicy([legacy]) === 'OMIT' }) === null);
  check('K', 'AV-21 §6.4 lists nothing on account of macro nulls',
    incompleteMarker([], legacy) === null);
  eq('K', 'AV-21 §6.3b renders the calorie-data string',
    normalizedLine(normalizeWindow([legacy])),
    'Per 1,000 kcal: unavailable — some entries have no calorie data');
}

/* ================================================================== *
 * SUITE L — §6.1a separator omission matrix
 * ================================================================== */

function suiteL() {
  const full = { energy_kcal: 250, protein_g: 10, carbohydrate_g: 30, fat_g: 8 };
  eq('L', 'all four present', entryMacroLine(full), '250 kcal · 10 g protein · 30 g carbs · 8 g fat');
  eq('L', 'FIRST field null', entryMacroLine({ ...full, energy_kcal: null }),
    '10 g protein · 30 g carbs · 8 g fat');
  eq('L', 'MIDDLE field null (protein)', entryMacroLine({ ...full, protein_g: null }),
    '250 kcal · 30 g carbs · 8 g fat');
  eq('L', 'MIDDLE field null (carbs)', entryMacroLine({ ...full, carbohydrate_g: null }),
    '250 kcal · 10 g protein · 8 g fat');
  eq('L', 'LAST field null', entryMacroLine({ ...full, fat_g: null }),
    '250 kcal · 10 g protein · 30 g carbs');
  eq('L', 'two adjacent nulls', entryMacroLine({ ...full, protein_g: null, carbohydrate_g: null }),
    '250 kcal · 8 g fat');
  eq('L', 'first and last null', entryMacroLine({ ...full, energy_kcal: null, fat_g: null }),
    '10 g protein · 30 g carbs');
  eq('L', 'all but one (kcal only)',
    entryMacroLine({ energy_kcal: 250, protein_g: null, carbohydrate_g: null, fat_g: null }), '250 kcal');
  eq('L', 'all but one (fat only)',
    entryMacroLine({ energy_kcal: null, protein_g: null, carbohydrate_g: null, fat_g: 8 }), '8 g fat');
  check('L', 'all four null → line omitted',
    entryMacroLine({ energy_kcal: null, protein_g: null, carbohydrate_g: null, fat_g: null }) === null);

  const every = [full, { ...full, energy_kcal: null }, { ...full, protein_g: null },
    { ...full, fat_g: null }, { energy_kcal: 1, protein_g: null, carbohydrate_g: null, fat_g: null }];
  check('L', 'no rendered line ever has a leading, doubled or trailing separator',
    every.every((m) => {
      const s = entryMacroLine(m);
      return s !== null && !s.startsWith(' ·') && !s.endsWith('· ') && !s.includes('·  ·') && !/\s$/.test(s);
    }));
}

/* ================================================================== *
 * SUITE M — suffix interaction
 * ================================================================== */

function suiteM() {
  const totals = { energy_kcal: 763.25, protein_g: null, carbohydrate_g: null, fat_g: null };
  eq('M', '§6.2b with ` · partial`', dayMacroLine(totals, { partial: true }), '763 kcal · partial');
  eq('M', '§6.2b without partial', dayMacroLine({ ...totals, protein_g: 10 }, { partial: false }),
    '763 kcal · 10 g protein');

  eq('M', '§6.2 + §6.3a on a day summary',
    completedDaySummary('2026-09-14', 10.074392857142857, { mixedVersions: true }),
    '2026-09-14: +10.1 · Elevated · mixed coefficient versions');
  eq('M', '§6.3 + §6.3a on a window summary',
    windowSummary('2026-09-14', 18.4, { mixedVersions: true }),
    '3 days ending 2026-09-14: +18.4 · Elevated · mixed coefficient versions');
  eq('M', '§6.3 without the marker', windowSummary('2026-09-14', 18.4),
    '3 days ending 2026-09-14: +18.4 · Elevated');

  // The two suffixes attach to DIFFERENT lines and cannot co-occur on one
  // string: §6.3a appends to §6.2/§6.3, ` · partial` to §6.2b. See README.
  const daySummary = completedDaySummary('2026-09-14', 10.07, { mixedVersions: true });
  const macroLine = dayMacroLine(totals, { partial: true });
  check('M', '` · partial` never appears on a §6.2 summary', !daySummary.includes('partial'));
  check('M', '` · mixed coefficient versions` never appears on a §6.2b line',
    !macroLine.includes('mixed coefficient versions'));
  check('M', 'separator spacing is exactly " · " everywhere',
    [daySummary, macroLine, windowSummary('2026-09-14', 18.4, { mixedVersions: true })]
      .every((s) => !/ {2}/.test(s) && !/·[^ ]/.test(s.replace(/^[^·]*/, ''))));

  eq('M', '§6.2a today line has no band', todayLine(4.2), 'Today so far: +4.2');
  eq('M', '§6.2a with no entries', todayLine(0), 'Today so far: +0.0');
}

/* ================================================================== *
 * SUITE N — §4.3 banding on the unrounded value
 * ================================================================== */

function suiteN() {
  check('N', '+5.04 displays +5.0 but bands D_ELEVATED (not D_NEUTRAL)',
    formatScore(5.04) === '+5.0' && bandDaily(5.04).id === 'D_ELEVATED');
  check('N', 'exactly +5.0 is D_NEUTRAL (inclusive upper bound)', bandDaily(5.0).id === 'D_NEUTRAL');
  check('N', '+5.0000001 is D_ELEVATED', bandDaily(5.0000001).id === 'D_ELEVATED');
  check('N', 'exactly −5.0 is D_LOW', bandDaily(-5.0).id === 'D_LOW');
  check('N', '−4.96 displays -5.0 but bands D_NEUTRAL',
    formatScore(-4.96) === '-5.0' && bandDaily(-4.96).id === 'D_NEUTRAL');
  check('N', 'exactly +15.0 is D_ELEVATED', bandDaily(15.0).id === 'D_ELEVATED');
  check('N', '+15.04 displays +15.0 but bands D_HIGH',
    formatScore(15.04) === '+15.0' && bandDaily(15.04).id === 'D_HIGH');
  check('N', 'window: exactly +15.0 is W_NEUTRAL', bandWindow(15.0).id === 'W_NEUTRAL');
  check('N', 'window: +45.04 displays +45.0 but bands W_HIGH',
    formatScore(45.04) === '+45.0' && bandWindow(45.04).id === 'W_HIGH');

  eq('N', '§6.1 never renders -0.0', formatScore(-0.04), '+0.0');
  eq('N', '§6.1 negative rounding is away from zero', formatScore(-1.85), '-1.9');
  eq('N', 'macro 0.4 renders <1', formatMacro(0.4), '<1');
  eq('N', 'macro exact 0 renders 0', formatMacro(0), '0');
  eq('N', 'macro 152.5 rounds away from zero', formatMacro(152.5), '153');
}

/* ================================================================== *
 * SUITE O — §6.6 structural prohibitions
 * ================================================================== */

function suiteO() {
  const VERDICTS = /\b(yay|nay|bad|good|avoid|cheat|clean|guilty|try|choose|should|instead)\b/i;
  // V4 added `ring`, `gauge` and `streak`. Matched against camelCase-split
  // TOKENS, not as substrings: `ring` is inside `driverString`, and a substring
  // match flags a function that does nothing of the kind.
  const FORBIDDEN_TOKENS = new Set(['verdict', 'advice', 'suggest', 'warn', 'encourage',
    'target', 'goal', 'remaining', 'streak', 'ring', 'gauge', 'progress', 'budget']);
  const tokens = (n) => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);

  const names = Object.keys(display);
  const badNames = names.filter((n) => tokens(n).some((t) => FORBIDDEN_TOKENS.has(t)));
  check('O', '§6.6: no export can produce a verdict, advice or target',
    badNames.length === 0, badNames.length ? badNames.join(', ') : `${names.length} exports clean`);

  // Every string this module can produce, across every band including High.
  const produced = [
    ...entryLine(ent(scoreEntry(fx('AV-1').record, fx('AV-1').quantity), fx('AV-1').record, 'X', fx('AV-1').quantity)),
    entryMacroLine({ energy_kcal: 1, protein_g: 1, carbohydrate_g: 1, fat_g: 1 }),
    incompleteMarker(['P2', 'protein_g']),
    completedDaySummary('2026-09-14', 99, { mixedVersions: true }),   // D_HIGH
    completedDaySummary('2026-09-14', -99),                            // D_LOW
    todayLine(0),
    windowSummary('2026-09-14', 99),                                   // W_HIGH
    windowSummary('2026-09-14', -99),
    normalizedLine({ status: 'AVAILABLE', load_per_1000: 2.948718 }),
    normalizedLine({ status: 'NO_ENTRIES' }),
    normalizedLine({ status: 'NO_CALORIE_DATA' }),
    dayMacroLine({ energy_kcal: 1, protein_g: null, carbohydrate_g: null, fat_g: null }, { partial: true }),
  ].filter(Boolean);

  const offenders = produced.filter((s) => VERDICTS.test(s));
  check('O', '§6.6: no produced string contains a verdict word or imperative',
    offenders.length === 0, offenders.length ? offenders.join(' | ') : `${produced.length} strings clean`);

  check('O', '§6.6: a high band renders §6.2 and nothing more',
    completedDaySummary('2026-09-14', 99) === '2026-09-14: +99.0 · High');
  check('O', '§6.6: a high window band renders §6.3 and nothing more',
    windowSummary('2026-09-14', 99) === '3 days ending 2026-09-14: +99.0 · High');
  check('O', '§4.6: the normalized line carries no band in any branch',
    ['AVAILABLE', 'NO_ENTRIES', 'NO_CALORIE_DATA'].every((status) =>
      !/Low|Neutral|Elevated|High/.test(normalizedLine({ status, load_per_1000: 1 }))));
}

/* ---------- §2.4 display-name audit across every asserted driver ---------- */

function nameAuditRun() {
  const asserted = {
    'AV-1': ['27 g added sugar', '1 serving ultra-processed'],
    'AV-2': ['1.5 servings fruit'],
    'AV-6B': ['25.9 g added sugar', '1 serving ultra-processed'],
    'AV-7': ['1 serving ultra-processed', '1 serving whole grain'],
    'AV-9': ['1.5 servings nuts', '5.6 g fiber'],
    'AV-9a': ['2.5 servings ultra-processed'],
  };
  for (const [id, want] of Object.entries(asserted)) {
    const f = id === 'AV-2' ? AV2 : fx(id);
    if (!f) continue;
    const got = drivers(ent(scoreEntry(f.record, f.quantity), f.record, id, f.quantity));
    for (let i = 0; i < Math.max(got.length, want.length); i++) {
      if (got[i] !== want[i]) nameAudit.push([id, want[i] ?? '(none)', got[i] ?? '(none)']);
    }
  }
}

/* ---------------- run ---------------- */

suiteK(); suiteL(); suiteM(); suiteN(); suiteO(); nameAuditRun();

const heads = {
  K: 'SUITE K — vectors AV-2, AV-5, AV-8, AV-22, AV-21 (step 5 half)',
  L: 'SUITE L — §6.1a separator-omission matrix',
  M: 'SUITE M — suffix interaction and spacing',
  N: 'SUITE N — §4.3 banding on the unrounded value',
  O: 'SUITE O — §6.6 structural prohibitions',
};
for (const k of ['K', 'L', 'M', 'N', 'O']) {
  console.log(`\n${heads[k]}`);
  console.log('='.repeat(heads[k].length));
  for (const l of results[k]) console.log(l);
}

if (nameAudit.length) {
  console.log('\n§2.4 DISPLAY-NAME AUDIT — vector assertion vs the rule as written');
  console.log('='.repeat(64));
  for (const [id, want, got] of nameAudit) {
    console.log(`  ${id.padEnd(7)} vector asserts ${JSON.stringify(want).padEnd(34)} §2.4 produces ${JSON.stringify(got)}`);
  }
}

console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
