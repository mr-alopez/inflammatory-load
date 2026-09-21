/**
 * Trend view — spec v1.2 §11 step 8: §4.5. Vectors AV-19, AV-20.
 *
 * Suites:
 *   Q. AV-19 — fixed-epoch anchoring
 *   R. AV-20 — an empty block is gapped, not plotted at +0.0
 *   S. §4.5's mandatory constraints, structurally (as §13.3 was tested)
 *   T. [OPEN-9] — TREND_EPOCH after a full data wipe
 */

import { readFileSync } from 'node:fs';
import { trendBlocks, blockRange, blockIndexOf, localDate } from '../src/select.js';
import { EntryStore, wipeAll } from '../src/store.js';
import { MemoryBackend } from '../src/backends/memory.js';
import { STORES, META_KEYS, SCHEMA_VERSION } from '../src/schema.js';
import { buildEntry } from '../src/entry.js';
import { scoreEntry } from '../src/scoring.js';

let pass = 0, fail = 0;
const results = { Q: [], R: [], S: [], T: [] };
function check(s, label, ok, note = '') {
  ok ? pass++ : fail++;
  results[s].push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  — ${note}` : ''}`);
}

const e = (local_date, score) => ({ local_date, score, coeff_version: 'COEFF-1' });

/* ================================================================== *
 * SUITE Q — AV-19, fixed-epoch anchoring
 * ================================================================== */

function suiteQ() {
  const EPOCH = '2026-09-01';
  const entries = ['2026-09-01', '2026-09-05', '2026-09-08', '2026-09-11', '2026-09-13', '2026-09-14']
    .map((d) => e(d, 1));

  const on15 = trendBlocks(entries, EPOCH, '2026-09-15');
  const on16 = trendBlocks(entries, EPOCH, '2026-09-16');

  check('Q', 'AV-19: blocks 0–3 have the stated boundaries',
    JSON.stringify(on15.slice(0, 4).map((b) => [b.start, b.end]))
    === JSON.stringify([['2026-09-01', '2026-09-03'], ['2026-09-04', '2026-09-06'],
      ['2026-09-07', '2026-09-09'], ['2026-09-10', '2026-09-12']]),
    on15.slice(0, 4).map((b) => `${b.start}..${b.end}`).join(' '));

  check('Q', 'AV-19: the current block [09-13…09-15] is NOT plotted',
    on15[4].omitted === 'CURRENT_INCOMPLETE' && on15[4].plotted === false);

  // The defect the vector exists to catch.
  check('Q', 'AV-19: boundaries identical on 09-15 and 09-16',
    JSON.stringify(on15.map((b) => [b.start, b.end]))
    === JSON.stringify(on16.slice(0, on15.length).map((b) => [b.start, b.end])));
  // Blocks 0–3 are already complete on 09-15 and must not change. Block 4 is
  // the current block on 09-15 and completes on 09-16, so it SHOULD begin
  // plotting — that is the series growing, not a boundary moving.
  check('Q', 'AV-19: values of already-complete blocks identical on 09-15 and 09-16',
    JSON.stringify(on15.slice(0, 4).map((b) => [b.block_load, b.plotted]))
    === JSON.stringify(on16.slice(0, 4).map((b) => [b.block_load, b.plotted])));
  check('Q', 'AV-19: block 4 is current on 09-15 and plotted once complete on 09-16',
    on15[4].omitted === 'CURRENT_INCOMPLETE' && on16[4].plotted === true,
    `09-16 block 4 load ${on16[4].block_load}`);

  // An implementation re-anchoring to the most recent completed day would put
  // block 0 at a different date every day; assert the anchor is the epoch.
  check('Q', 'AV-19: block 0 starts at TREND_EPOCH, not at a sliding anchor',
    blockRange(EPOCH, 0).start === EPOCH);
  check('Q', 'AV-19: block index is a pure function of epoch and date',
    blockIndexOf(EPOCH, '2026-09-15') === 4 && blockIndexOf(EPOCH, '2026-09-12') === 3);

  check('Q', 'BLOCK_LOAD is not WINDOW_LOAD — different day sets (§1.2)',
    on15[3].start === '2026-09-10' && on15[3].end === '2026-09-12',
    'window on 09-15 is 09-12…09-14; block 3 is 09-10…09-12');

  /* ---- AV-19 backdated arrival (v1.3, option (c)) ---- */
  const backdated = trendBlocks([...entries, e('2026-08-30', 2)], EPOCH, '2026-09-15');
  const neg1 = backdated.find((b) => b.index === -1);

  check('Q', 'AV-19 backdated: 2026-08-30 lands in block −1',
    !!neg1 && neg1.start === '2026-08-29' && neg1.end === '2026-08-31',
    neg1 ? `${neg1.start}..${neg1.end}` : '(no block −1)');
  check('Q', 'AV-19 backdated: block −1 is PLOTTED, not excluded',
    neg1?.plotted === true && neg1.block_load === 2);

  // The defect the assertion exists to catch: moving the epoch re-cuts history.
  const positives = backdated.filter((b) => b.index >= 0);
  check('Q', 'AV-19 backdated: blocks 0–4 retain identical boundaries',
    JSON.stringify(positives.map((b) => [b.start, b.end]))
    === JSON.stringify(on15.map((b) => [b.start, b.end])));
  check('Q', 'AV-19 backdated: blocks 0–4 retain identical values',
    JSON.stringify(positives.map((b) => [b.block_load, b.plotted]))
    === JSON.stringify(on15.map((b) => [b.block_load, b.plotted])));
  check('Q', 'AV-19 backdated: the epoch did not move',
    backdated.find((b) => b.index === 0).start === EPOCH);
  check('Q', 'AV-19 backdated: the entry is not collapsed into block 0',
    backdated.find((b) => b.index === 0).block_load === on15[0].block_load);

  // A re-anchoring implementation would produce these boundaries instead.
  const reanchored = trendBlocks([...entries, e('2026-08-30', 2)], '2026-08-30', '2026-09-15');
  check('Q', 'AV-19 backdated: re-anchoring visibly re-cuts every boundary',
    reanchored[0].start === '2026-08-30' && reanchored[1].start === '2026-09-02'
    && reanchored[1].start !== on15[1].start,
    `re-anchored block 1 starts ${reanchored[1].start}, correct is ${on15[1].start}`);
}

/* ================================================================== *
 * SUITE R — AV-20, gaps
 * ================================================================== */

function suiteR() {
  const EPOCH = '2026-09-01';
  // No entries on 09-04, 09-05 or 09-06.
  const blocks = trendBlocks([e('2026-09-01', 1), e('2026-09-08', 1)], EPOCH, '2026-09-15');
  const gap = blocks[1];

  check('R', 'AV-20: block [09-04…09-06] contains zero entries',
    gap.start === '2026-09-04' && gap.end === '2026-09-06' && gap.entryCount === 0);
  check('R', 'AV-20: it is NOT plotted', gap.plotted === false);
  check('R', 'AV-20: it is marked NO_DATA, distinct from the current block',
    gap.omitted === 'NO_DATA');
  check('R', 'AV-20: its x position is preserved (index kept in the series)',
    blocks[1].index === 1 && blocks[2].index === 2);

  // The distinction the vector exists to protect.
  const zeroScoring = trendBlocks([e('2026-09-04', 0)], EPOCH, '2026-09-15')[1];
  check('R', 'AV-20: a block with ONE entry scoring 0.0 IS plotted, at +0.0',
    zeroScoring.plotted === true && zeroScoring.block_load === 0);
  check('R', 'AV-20: no-data and balanced-to-zero are different states',
    gap.plotted !== zeroScoring.plotted && gap.block_load === zeroScoring.block_load,
    'same load, different plot decision — which is why the load alone cannot be the signal');

  /**
   * §4.5 (v1.3): "A negative-index block follows every rule a positive-index
   * block follows." Asserted behaviourally rather than by reading the source —
   * a structural scan of renderTrend is index-agnostic and would pass vacuously
   * on this question (§2.5's must-be-able-to-fail rule).
   */
  const withNeg = trendBlocks(
    [e('2026-08-24', 3), e('2026-09-01', 1)],   // 08-24 → block −3; 08-25..08-31 empty
    '2026-09-01', '2026-09-15'
  );
  const negPlotted = withNeg.find((b) => b.index === -3);
  const negGapped = withNeg.filter((b) => b.index < 0 && b.entryCount === 0);

  check('R', 'negative block WITH an entry is plotted, same rule as a positive one',
    negPlotted?.plotted === true && negPlotted.block_load === 3);
  check('R', 'negative block with NO entries is gapped, same rule as a positive one',
    negGapped.length === 2 && negGapped.every((b) => b.plotted === false && b.omitted === 'NO_DATA'),
    `${negGapped.length} empty negative blocks, all NO_DATA`);
  check('R', 'the negative range is contiguous with block 0 — no hole at the epoch',
    withNeg[0].index === -3 && withNeg.map((b) => b.index).join(',').startsWith('-3,-2,-1,0'),
    withNeg.map((b) => b.index).join(','));
  check('R', 'series extent starts at the lowest-index block containing an entry',
    withNeg[0].index === -3 && withNeg[0].entryCount === 1);
}

/* ================================================================== *
 * SUITE S — §4.5 mandatory constraints, structurally
 * ================================================================== */

function suiteS() {
  const html = readFileSync('index.html', 'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1 ');

  // Isolate renderTrend's body.
  const start = html.indexOf('async function renderTrend');
  check('S', 'renderTrend exists and was located', start !== -1);
  let depth = 0, i = html.indexOf('{', start), end = i;
  do { if (html[end] === '{') depth++; else if (html[end] === '}') depth--; end++; }
  while (depth > 0 && end < html.length);
  const body = strip(html.slice(start, end));
  check('S', '[script: index.html renderTrend body] scanned surface is non-empty (§2.5)',
    body.length > 400, `${body.length} chars scanned`);

  const forbidden = {
    // Only `currentColor` is permitted — one neutral mark for every value. The
    // quote is part of the token, so the lookahead must allow it.
    'no colour or fill by value': /(?:fill|stroke)\s*:\s*['"]?(?!currentColor)[#\w(]/,
    'no banding': /bandDaily|bandWindow|Elevated|Neutral|\bHigh\b|\bLow\b/,
    'no trendline, path or polyline': /createElementNS\([^)]*,\s*'(?:path|polyline|polygon)'/,
    'no tappable point or drill-down': /addEventListener\(\s*'(?:click|pointerdown|touchstart)'/,
    'no slope, projection or forecast': /\bslope\b|\bprojection\b|\bforecast\b|\bregression\b/i,
    'no streak count': /\bstreak\b/i,
    'no comparison to a prior block': /previousBlock|priorBlock|\bdelta\b|vsPrevious|change(?:From|Since)/,
    'no macro fields': /energy_kcal|protein_g|carbohydrate_g|fat_g|macroTotals/,
    'no DAILY_LOAD points': /dailyLoad|DAILY_LOAD/,
  };
  for (const [label, re] of Object.entries(forbidden)) {
    const hit = body.match(re);
    check('S', `§4.5: ${label}`, !hit, hit ? `found ${JSON.stringify(hit[0])}` : '');
  }

  // A gap must READ as a gap — the requirement is on the rendering, not a note.
  check('S', '§4.5: a gap is drawn at its preserved position, not skipped',
    /NO_DATA/.test(body) && /x1:\s*cx/.test(body));
  check('S', '§4.5: the legend says a gap means no data, not zero',
    /no data was recorded/.test(body) && /balanced out to zero/.test(body));
  check('S', '§4.5: the current block is explained rather than silently missing',
    /not plotted until all three of its days are complete/.test(body));
}

/* ================================================================== *
 * SUITE T — [OPEN-9]
 * ================================================================== */

async function suiteT() {
  const backend = new MemoryBackend();
  const store = new EntryStore(backend, { today: '2026-09-15' });
  const mk = (id, date) => {
    const rec = {
      name: 'x', source: 'MANUAL', manual: { serving_mass_g: 100 }, classifications: {},
      reported: { added_sugar_g: 0, sodium_mg: 0, saturated_fat_g: 0, fiber_g: 0 },
    };
    return buildEntry(scoreEntry(rec, { value: 100, unit: 'g' }), rec,
      { entry_id: id, food_name: 'x', quantity: { value: 100, unit: 'g' }, local_date: date });
  };

  await store.putEntry(mk('t1', '2026-09-10'));
  await store.putEntry(mk('t2', '2026-09-12'));
  check('T', 'TREND_EPOCH set at first log', (await store.getTrendEpoch()) === '2026-09-10');

  // §4.5: deleting the first entry does not move it.
  await store.deleteEntry('t1');
  check('T', 'deleting the first entry does not move TREND_EPOCH',
    (await store.getTrendEpoch()) === '2026-09-10');

  // [OPEN-9] DECIDED: a full wipe clears it, atomically with the entries.
  const report = await wipeAll(backend);
  check('T', 'a full wipe clears TREND_EPOCH', (await store.getTrendEpoch()) === undefined);
  check('T', 'a full wipe clears the entries in the same operation',
    (await store.allEntries()).length === 0 && report.entriesDeleted === 1);
  check('T', 'the wipe reports both, so a half-done wipe is visible',
    report.trendEpochCleared === true);

  // The next log sets a fresh epoch.
  await store.putEntry(mk('t3', '2026-09-14'));
  check('T', 'the next log sets a fresh epoch', (await store.getTrendEpoch()) === '2026-09-14');

  // KNOWN ASYMMETRY, reported: deleting every entry one by one is not a wipe.
  const b2 = new MemoryBackend();
  const s2 = new EntryStore(b2, { today: '2026-09-15' });
  await s2.putEntry(mk('u1', '2026-09-10'));
  await s2.deleteEntry('u1');
  check('T', 'ASYMMETRY: deleting every entry individually leaves TREND_EPOCH standing',
    (await s2.getTrendEpoch()) === '2026-09-10',
    'two routes to an empty store, two different epochs — §4.5 makes this correct, but it is emergent');
}

/* ---------------- run ---------------- */

suiteQ(); suiteR(); suiteS(); await suiteT();

const heads = {
  Q: 'SUITE Q — AV-19, fixed-epoch anchoring',
  R: 'SUITE R — AV-20, a gap is not a zero',
  S: '§4.5 mandatory constraints, structurally',
  T: '[OPEN-9] — TREND_EPOCH after a full data wipe',
};
for (const k of ['Q', 'R', 'S', 'T']) {
  console.log(`\n${heads[k]}`);
  console.log('='.repeat(heads[k].length));
  for (const l of results[k]) console.log(l);
}
console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
