/**
 * Swap engine — spec v1.4 §11 step 10: §7, §6.5. Vectors AV-3, AV-23, AV-24.
 *
 * Suites:
 *   U. AV-3 — §6.5 selection logic (the Phase 2a prerequisite, S6)
 *   V. AV-23 — REFERENCE_MASS from the logged median
 *   W. AV-24 — cold-start suppression
 *   X. §7.3 ordered suppression, §7.2 corpus rules, rescaling
 *   Y. §7.0 boundary and §7.1 uniform affordance, structurally
 */

import { readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { requestSwap, buildCorpus, rescaleEntry, medianQuantityG, deltaDrivers, SWAP }
  from '../src/swap.js';
import { swapLine, SWAP_SUPPRESSION } from '../src/display.js';
import { scoreEntry } from '../src/scoring.js';
import { buildEntry } from '../src/entry.js';
import { categoryFromTags, CATMAP_VERSION, RULE_COUNT } from '../src/category-map.js';
import { fixtures } from './fixtures.js';

const TOL = 1e-6;
let pass = 0, fail = 0;
const results = { U: [], V: [], W: [], X: [], Y: [] };
const discrimination = [];

const fmt = (n) => (typeof n === 'number'
  ? n.toPrecision(12).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '') : String(n));

function check(s, label, ok, note = '') {
  ok ? pass++ : fail++;
  results[s].push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  — ${note}` : ''}`);
}
function eq(s, label, actual, expected) {
  const ok = actual === expected;
  ok ? pass++ : fail++;
  results[s].push(ok ? `  ok   ${label}`
    : `  FAIL ${label}\n         actual   ${JSON.stringify(actual)}\n         expected ${JSON.stringify(expected)}`);
}
function near(s, label, actual, expected) {
  const m = Math.abs(actual - expected);
  check(s, label, m <= TOL, `actual ${fmt(actual)}  expected ${fmt(expected)}  margin ${m.toExponential(2)}`);
}

/** A stored entry from a fixture, at a chosen quantity, date and category. */
let seq = 0;
function entryFrom(fixtureId, { quantity, local_date, category = 'snack', product_id } = {}) {
  const fx = fixtures.find((f) => f.id === fixtureId);
  const q = quantity ?? fx.quantity;
  const r = scoreEntry(fx.record, q);
  return buildEntry(r, fx.record, {
    entry_id: `s-${seq++}`,
    product_id: product_id ?? `p:${fixtureId}`,
    food_name: fx.record.name,
    quantity: q,
    local_date: local_date ?? '2026-09-20',
    occasion_category: category,
    category_map_version: CATMAP_VERSION,
  });
}

/* ================================================================== *
 * SUITE U — AV-3 (§11 has said since v0.4 that this lands first)
 * ================================================================== */

function suiteU() {
  // AV-1 Snickers as source; AV-2's apple as the candidate, at 120 g.
  const source = entryFrom('AV-1', { product_id: 'p:snickers' });
  const appleRecord = {
    name: 'Apple', source: 'USDA', classifications: { A4: true },
    reported: { added_sugar_g: 0, sodium_mg: 1, saturated_fat_g: 0.028, fiber_g: 2.4 },
  };
  const appleAt = (g) => buildEntry(scoreEntry(appleRecord, { value: g, unit: 'g' }), appleRecord, {
    entry_id: `a-${seq++}`, product_id: 'p:apple', food_name: 'Apple',
    quantity: { value: g, unit: 'g' }, local_date: '2026-09-20', occasion_category: 'snack',
  });

  // Two entries → in the corpus. Median of [120, 120] is 120.
  const entries = [source, appleAt(120), appleAt(120)];
  const result = requestSwap(source, entries);

  check('U', 'AV-3: a suggestion is returned', result.status === SWAP.SUGGESTION, result.status);
  near('U', 'AV-3: REFERENCE_MASS = 120 g', result.reference_mass, 120);
  near('U', 'AV-3: candidate score at 120 g', result.candidate.score, -1.57144);
  near('U', 'AV-3: delta', result.delta, 4.56 - -1.57144);

  // The selection rule AV-3 exists to pin: delta_driver_in is chosen by GAIN,
  // not by the candidate's largest absolute attribute.
  eq('U', 'AV-3: delta_driver_out is P1', result.drivers.out?.id, 'P1');
  eq('U', 'AV-3: delta_driver_in is A4, chosen by gain not magnitude', result.drivers.into?.id, 'A4');
  near('U', 'AV-3: A4 gain 1.0 beats A1 gain 0.316', result.drivers.into.change, 1.0);

  const lines = swapLine(result, source);
  eq('U', 'AV-3 §6.5 line 1', lines[0], 'Alternative: Apple, 120 g — -1.6');
  eq('U', 'AV-3 §6.5 line 2', lines[1], 'Swaps 27 g added sugar for 1 serving fruit.');
  check('U', "§6.5: no imperative, and the word 'instead' never appears",
    !/\b(instead|try|choose|swap this for|should)\b/i.test(lines.join(' ')));
  check('U', '§6.5: macro fields never appear in a swap line',
    !/kcal|protein|carbs|\bfat\b/i.test(lines.join(' ')));

  discrimination.push(['AV-3', 'delta_driver_in by absolute magnitude, not gain',
    Math.abs(1.0 - 0.316).toExponential(3),
    'A4 gain 1.0 vs A1 gain 0.316 — the defect picks A1 and renders fiber']);
}

/* ================================================================== *
 * SUITE V — AV-23
 * ================================================================== */

function suiteV() {
  eq('V', 'AV-23: median of [40,45,52,60] is the LOWER middle',
    medianQuantityG([40, 45, 52, 60]), 45);
  eq('V', 'AV-23: order of input does not matter',
    medianQuantityG([60, 40, 52, 45]), 45);
  eq('V', 'AV-23: odd counts take the true middle', medianQuantityG([40, 45, 52]), 45);
  eq('V', 'AV-23: a single entry is its own median', medianQuantityG([52]), 52);

  const avg = (40 + 45 + 52 + 60) / 4;
  check('V', 'AV-23: the averaging defect yields 49.25', avg === 49.25);
  check('V', 'AV-23: the upper-middle defect yields 52', [40, 45, 52, 60][2] === 52);
  discrimination.push(['AV-23', 'averaging instead of lower-middle median',
    Math.abs(49.25 - 45).toExponential(3), 'renders ", 49.3 g" instead of ", 45 g"']);
  discrimination.push(['AV-23', 'upper-middle instead of lower-middle',
    Math.abs(52 - 45).toExponential(3), 'renders ", 52 g" instead of ", 45 g"']);

  // End to end: four entries of one product at those quantities.
  const source = entryFrom('AV-1', { product_id: 'p:source' });
  const quantities = [40, 45, 52, 60];
  const cand = quantities.map((g) => entryFrom('AV-7', {
    quantity: { value: g, unit: 'g' }, product_id: 'p:crackers',
  }));
  const r = requestSwap(source, [source, ...cand]);
  near('V', 'AV-23: REFERENCE_MASS resolves to 45 from four logged entries', r.reference_mass, 45);
  check('V', 'AV-23: §6.5 renders ", 45 g"', swapLine(r, source)[0].includes(', 45 g'),
    swapLine(r, source)[0]);
}

/* ================================================================== *
 * SUITE W — AV-24
 * ================================================================== */

function suiteW() {
  // Three entries, all distinct products, none saved.
  const a = entryFrom('AV-1', { product_id: 'p:a' });
  const b = entryFrom('AV-7', { product_id: 'p:b' });
  const c = entryFrom('AV-9', { product_id: 'p:c' });
  const r = requestSwap(a, [a, b, c]);

  eq('W', 'AV-24: status is CORPUS_EMPTY', r.status, SWAP.CORPUS_EMPTY);
  check('W', 'AV-24: no candidate is returned', r.candidate === undefined);
  eq('W', 'AV-24 §7.3 case 2 renders', swapLine(r, a)[0],
    'Not enough history yet to suggest an alternative.');
  check('W', 'AV-24: no §6.5 line is rendered', swapLine(r, a).length === 1);

  // The defect: rendering case 3 asserts a comparison that never happened.
  check('W', 'AV-24: case 3 is a DIFFERENT string, so the defect is detectable',
    SWAP_SUPPRESSION.CORPUS_EMPTY !== SWAP_SUPPRESSION.BELOW_THRESHOLD);
  discrimination.push(['AV-24', 'rendering case 3 on an empty corpus', 'categorical',
    `"${SWAP_SUPPRESSION.CORPUS_EMPTY}" vs "${SWAP_SUPPRESSION.BELOW_THRESHOLD}"`]);

  // A second entry of one product tips it into the corpus.
  const b2 = entryFrom('AV-7', { product_id: 'p:b' });
  const r2 = requestSwap(a, [a, b, c, b2]);
  check('W', 'AV-24: a second entry of one product ends the cold start',
    r2.status !== SWAP.CORPUS_EMPTY, r2.status);
}

/* ================================================================== *
 * SUITE X — §7.3 order, §7.2 corpus, rescaling
 * ================================================================== */

function suiteX() {
  const eligible = entryFrom('AV-1', { product_id: 'p:src' });
  const cand = [entryFrom('AV-9', { product_id: 'p:nuts' }), entryFrom('AV-9', { product_id: 'p:nuts' })];

  /* §7.3 ordering — the case the brief asked for specifically. */
  const uncategorized = { ...eligible, occasion_category: 'UNCATEGORIZED' };
  const r1 = requestSwap(uncategorized, [uncategorized]);
  eq('X', '§7.3: UNCATEGORIZED source with an EMPTY corpus renders case 1, not case 2',
    r1.status, SWAP.SOURCE_INELIGIBLE);
  eq('X', '§7.3: case 1 string', swapLine(r1, uncategorized)[0],
    "This item isn't categorized, so alternatives aren't available.");

  const notApplicable = { ...eligible, source_basis: 'NOT_APPLICABLE', quantity_g: null };
  eq('X', '§7.3: a NOT_APPLICABLE source is also case 1',
    requestSwap(notApplicable, [notApplicable, ...cand]).status, SWAP.SOURCE_INELIGIBLE);

  /* §7.3 case 3 — candidates exist but none clears 2.0. */
  const twin = [entryFrom('AV-1', { product_id: 'p:twin' }), entryFrom('AV-1', { product_id: 'p:twin' })];
  const r3 = requestSwap(eligible, [eligible, ...twin]);
  eq('X', '§7.3: a near-identical candidate is BELOW_THRESHOLD, not suggested', r3.status, SWAP.BELOW_THRESHOLD);
  eq('X', '§7.3: case 3 string', swapLine(r3, eligible)[0], 'No clear alternative in this category.');

  /* §7.2 corpus rules. */
  const self = [entryFrom('AV-1', { product_id: 'p:src' }), entryFrom('AV-1', { product_id: 'p:src' })];
  check('X', '§7.2: a product is never its own alternative',
    buildCorpus([eligible, ...self], [], { excludeProductId: 'p:src', category: 'snack' }).length === 0);
  check('X', '§7.2: a product with only ONE entry is not in the corpus',
    buildCorpus([entryFrom('AV-9', { product_id: 'p:once' })], [], { category: 'snack' }).length === 0);
  check('X', '§7.2: UNCATEGORIZED entries are excluded',
    buildCorpus(cand.map((e) => ({ ...e, occasion_category: 'UNCATEGORIZED' })), [],
      { category: 'snack' }).length === 0);
  check('X', '§7.2: NOT_APPLICABLE entries are excluded explicitly',
    buildCorpus(cand.map((e) => ({ ...e, source_basis: 'NOT_APPLICABLE', quantity_g: null })), [],
      { category: 'snack' }).length === 0);
  check('X', '§7.2: candidates come only from the source’s own category',
    buildCorpus(cand, [], { category: 'beverage' }).length === 0);

  /* §7.2 rescaling, including P3 by mass ratio. */
  const almonds = entryFrom('AV-9', { product_id: 'p:almonds' });         // 45 g, A5
  const doubled = rescaleEntry(almonds, 90);
  near('X', 'rescale: score is linear in mass', doubled.score, almonds.score * 2);
  near('X', 'rescale: as-consumed fibre doubles', doubled.as_consumed.fiber_g, 5.625 * 2);
  near('X', 'rescale: A5 servings double', doubled.classification_set.A5.servings, 3.0);

  const beer = entryFrom('AV-4', { product_id: 'p:beer', category: 'beverage' });
  const halfBeer = rescaleEntry(beer, beer.quantity_g / 2);
  near('X', 'rescale: P3 units halve with mass — no volume needed (§7.2)',
    halfBeer.classification_set.P3.units, beer.classification_set.P3.units / 2);
  near('X', 'rescale: P3 contribution halves too', halfBeer.contributions.P3, beer.contributions.P3 / 2);
  check('X', 'rescale: §3.3c is never re-run — no basis is consulted',
    !('source_basis' in halfBeer) && !('basis' in halfBeer));

  /* §6.5 second line omitted when either driver is absent. */
  const noGain = deltaDrivers(eligible, rescaleEntry(eligible, eligible.quantity_g));
  check('X', '§6.5: identical source and candidate yield no delta drivers',
    noGain.out === null && noGain.into === null);
}

/* ================================================================== *
 * SUITE Y — §7.0 boundary and §7.1 uniform affordance
 * ================================================================== */

function suiteY() {
  const html = readFileSync('index.html', 'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');
  const code = strip(html);

  const IMPORT_RE = /from\s+['"]([^'"]+)['"]/g;
  const importsOf = (f) => [...readFileSync(f, 'utf8').matchAll(IMPORT_RE)].map((m) => m[1]);

  /**
   * Resolves relative to the importing file. The previous form collapsed both
   * `./` and `../` to `src/`, so a `../` import resolved to a path that does not
   * exist, the recursive call threw, and the catch swallowed it — the walk could
   * not see past a `../` hop and reported nothing about it. Same defect as
   * test/shell.js carried; fixed in both.
   */
  const unresolved = [];
  function reachable(entry, seen = new Set()) {
    for (const spec of importsOf(entry)) {
      if (!spec.startsWith('.')) continue;
      const path = normalize(join(dirname(entry), spec)).replace(/\\/g, '/');
      if (seen.has(path)) continue;
      seen.add(path);
      if (/\.json$/.test(path)) continue;                   // data leaf
      try { reachable(path, seen); } catch (e) { unresolved.push(`${path} (${e.code ?? 'ERR'})`); }
    }
    return seen;
  }

  // §7.0 BOTH directions: swap MAY score; display still may not.
  const swapReach = reachable('src/swap.js');
  const displayReach = reachable('src/display.js');
  check('Y', '§7.0: the import walk resolved (must be able to fail, §2.5)',
    swapReach.size >= 1 && displayReach.size >= 2,
    `swap:${swapReach.size} display:${displayReach.size}`);
  check('Y', '[import graph: src/display.js, transitive] §7.0: still NO path to scoring',
    ![...displayReach].some((p) => p.endsWith('scoring.js')),
    [...displayReach].join(', '));
  check('Y', '[import graph: src/swap.js, transitive] §7.0: does not route through display',
    ![...swapReach].some((p) => p.endsWith('display.js')),
    [...swapReach].join(', '));
  check('Y', '§7.0: the import walk has no blind spots — every relative import followed',
    unresolved.length === 0, unresolved.length ? unresolved.join(', ') : 'all resolved');
  check('Y', '§7.0: §6.5 rendering lives in display and takes a computed result',
    /export function swapLine\(result, sourceEntry\)/.test(readFileSync('src/display.js', 'utf8')));

  // §2.5: assert the slice is the real body before trusting what it does not
  // contain. A truncated slice contains nothing, which reads as clean.
  const COMPUTES = /rescaleEntry|buildCorpus|DELTA_THRESHOLD|\.sort\(/;
  const swapLineBody = readFileSync('src/display.js', 'utf8')
    .split('export function swapLine')[1].split('\n}')[0];
  check('Y', '§7.0: the swapLine slice is the real body, not a truncation',
    swapLineBody.length > 200 && /return lines/.test(swapLineBody),
    `${swapLineBody.length} chars`);
  check('Y', '§7.0: swapLine does not rescale, re-rank or re-threshold',
    !COMPUTES.test(swapLineBody));
  check('Y', '§7.0 computation pattern DISCRIMINATES',
    COMPUTES.test('const c = buildCorpus(e);') && COMPUTES.test('list.sort((a, b) => a - b)')
    && !COMPUTES.test('return lines;') && !COMPUTES.test('const sorted = alreadySorted;'),
    'catches corpus/rescale/threshold/sort, allows plain rendering');

  // §7.1: the affordance must be uniform — never conditional on score or band.
  const affordance = code.match(/[^\n]*swap-ask[^\n]*/g) ?? [];
  check('Y', '§7.1: the affordance exists in the shell', affordance.length > 0,
    `${affordance.length} references`);
  const CONDITIONAL = /score|band|Elevated|High|Low|>=|<=|[^=!<>]>[^=]|[^=!<>]<[^=]|\?\s*'/;
  const conditional = affordance.filter((l) => CONDITIONAL.test(l));
  check('Y', '[script: index.html .swap-ask references] §7.1: affordance is not conditional',
    conditional.length === 0, conditional.join(' | ') || 'unconditional in all references');

  // §2.5, fifth form: this had never flagged a line, so it had never been shown
  // to separate a conditional affordance from an unconditional one.
  check('Y', '§7.1 conditional-affordance pattern DISCRIMINATES',
    ['if (entry.score > 2) ask.className = "swap-ask";',
      'if (band === "High") el.append(ask);',
      "ask.className = flag ? 'swap-ask' : 'hidden';"].every((l) => CONDITIONAL.test(l))
    && ["ask.className = 'swap-ask';",
      "ask.addEventListener('click', () => showSwap(entry, el, ask));",
      "if (e.target.closest('.swap-ask, .entry-remove')) return;"].every((l) => !CONDITIONAL.test(l)),
    'catches score/band/ternary gating, allows the unconditional forms in use');

  check('Y', `CATMAP-1 has real coverage: ${RULE_COUNT} tag rules`, RULE_COUNT >= 100);
  check('Y', 'CATMAP-1: specific keys precede general ones',
    categoryFromTags(['en:dried-fruits', 'en:fruits']) === 'snack'
    && categoryFromTags(['en:fruits']) === 'meal component');
}

/* ---------------- run ---------------- */

suiteU(); suiteV(); suiteW(); suiteX(); suiteY();

const heads = {
  U: 'SUITE U — AV-3, §6.5 selection logic',
  V: 'SUITE V — AV-23, REFERENCE_MASS from the logged median',
  W: 'SUITE W — AV-24, cold-start suppression',
  X: 'SUITE X — §7.3 ordering, §7.2 corpus and rescaling',
  Y: 'SUITE Y — §7.0 boundary, §7.1 uniform affordance',
};
for (const k of ['U', 'V', 'W', 'X', 'Y']) {
  console.log(`\n${heads[k]}`);
  console.log('='.repeat(heads[k].length));
  for (const l of results[k]) console.log(l);
}

console.log('\nDISCRIMINATION — §10 convention');
console.log('='.repeat(31));
for (const [id, label, delta, note] of discrimination) {
  console.log(`  ${id.padEnd(7)} ${label.padEnd(46)} ${String(delta).padStart(12)}  ${note}`);
}

console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
