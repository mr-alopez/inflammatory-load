/**
 * Round audit — spec v0.9 §11 Authority + "Claims about vectors bind those
 * vectors" (D6 and W1).
 *
 * Two directions, both mechanical:
 *   1. §11's citations against §10's headings          (D6)
 *   2. every vector named in a §10 convention against
 *      that convention's stated requirement            (W1)
 *
 * Reports; never edits. A failure is a defect in whichever text was written
 * last, and per W1 is reported rather than resolved.
 *
 *   node tools/audit.mjs spec/inflammatory-load-spec-v0.9.md
 */

import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('usage: node tools/audit.mjs <spec.md>'); process.exit(2); }
const doc = readFileSync(file, 'utf8');

const MACROS = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g'];
const NUTRIENTS = ['P1', 'P2', 'P8', 'A1'];

/* ---------- parse ---------- */

const headings = [...doc.matchAll(/^### (AV-[0-9A-Za-z]+) —/gm)].map((m) => m[1]);

function blockOf(id) {
  const start = doc.indexOf(`### ${id} —`);
  if (start === -1) return '';
  const rest = doc.slice(start + 4);
  const next = rest.search(/\n### AV-|\n---\n/);
  return next === -1 ? rest : rest.slice(0, next);
}

const sec11 = doc.slice(doc.indexOf('## 11. Implementation order'), doc.indexOf('## 12.'));
const cited = [...new Set([...sec11.matchAll(/AV-[0-9A-Za-z]+/g)].map((m) => m[0]))];

let failures = 0;
const line = (ok, text) => { if (!ok) failures++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${text}`); };

/* ---------- direction 1 — D6 ---------- */

console.log('\nDIRECTION 1 — §11 citations against §10 headings (D6)');
console.log('='.repeat(53));

/**
 * §2.5, fifth form. Both comparisons below are set differences, and a set
 * difference of two EMPTY sets is empty. If the heading regex and the citation
 * regex both broke, `phantom` and `orphan` would both be empty and the audit
 * would report clean having parsed nothing at all.
 *
 * Assert the parse engaged before trusting what it found.
 */
line(headings.length > 0, `§10 headings parsed: ${headings.length}`);
line(cited.length > 0, `§11 citations parsed: ${cited.length}`);
line(blockOf(headings[0] ?? '').length > 100,
  `vector blocks resolve: ${headings[0] ?? '(none)'} is ${blockOf(headings[0] ?? '').length} chars`);

const phantom = cited.filter((v) => !headings.includes(v));
const orphan = headings.filter((v) => !cited.includes(v));
line(phantom.length === 0, `no §11 citation without a §10 heading${phantom.length ? `: ${phantom.join(' ')}` : ''}`);
line(orphan.length === 0, `no §10 heading uncited by §11${orphan.length ? `: ${orphan.join(' ')}` : ''}`);
console.log(`       ${headings.length} headings, ${cited.length} distinct citations`);

/* ---------- direction 2 — W1 ---------- */

console.log('\nDIRECTION 2 — §10 conventions against the vectors they name (W1)');
console.log('='.repeat(64));

/** Vectors a convention names, read from the convention's own sentence. */
function namedIn(pattern) {
  const m = doc.match(pattern);
  return m ? [...new Set([...m[0].matchAll(/AV-[0-9A-Za-z]+/g)].map((x) => x[0]))] : [];
}

// C4 exception: an exact INCOMPLETE list obliges all eight fields.
const c4 = namedIn(/A vector that asserts an exact `INCOMPLETE` list[\s\S]*?do so\./);
line(c4.length > 0, `C4 exception names vectors: ${c4.join(' ') || '(none found)'}`);
for (const id of c4) {
  const b = blockOf(id);
  const missingMacros = MACROS.filter((f) => !b.includes(f));
  const missingNutrients = NUTRIENTS.filter((f) => !b.includes(`\`${f}\``));
  line(missingMacros.length === 0 && missingNutrients.length === 0,
    `${id} states all eight fields${missingMacros.length || missingNutrients.length
      ? ` — missing ${[...missingNutrients, ...missingMacros].join(', ')}` : ''}`);
}

// Aggregate vectors: named vectors must state no source/basis/reported values.
const agg = namedIn(/\*\*Aggregate vectors\.\*\*[\s\S]*?not themselves asserted\./);
line(agg.length > 0, `Aggregate convention names vectors: ${agg.join(' ') || '(none found)'}`);
for (const id of agg) {
  const b = blockOf(id);
  const leaks = ['Basis `', 'Source `', 'Reported ('].filter((t) => b.includes(t));
  line(leaks.length === 0, `${id} states no per-entry source/basis${leaks.length ? ` — found: ${leaks.join(', ')}` : ''}`);
}

// Base convention: every entry-level vector states all four scored nutrients.
// "Entry-level" = carries an attribute table. Others are listed, not failed.
const TABLE_ROW = /\|\s*`P\d`|\|\s*`A\d`/;
const tabled = headings.filter((id) => TABLE_ROW.test(blockOf(id)));
const untabled = headings.filter((id) => !tabled.includes(id));

/**
 * §2.5, fifth form. If TABLE_ROW broke, `tabled` would be empty, the loop below
 * would run zero times, and every vector would land in the `untabled` note —
 * printed as information, not as a failure. The audit would report clean having
 * checked no vector against the base convention.
 */
line(tabled.length > 0, `entry-level vectors detected: ${tabled.length}`);
line(TABLE_ROW.test('| `P1` | 12 g | 0.03 |') && !TABLE_ROW.test('No table here, just prose.'),
  'the attribute-table pattern separates a table row from prose');
for (const id of tabled) {
  const b = blockOf(id);
  const missing = NUTRIENTS.filter((f) => !b.includes(`\`${f}\``));
  line(missing.length === 0, `${id} states all four scored nutrients${missing.length ? ` — missing ${missing.join(', ')}` : ''}`);
}
console.log(`\n  note  no attribute table (non-creation, aggregate or storage vectors):`);
console.log(`        ${untabled.join(' ')}`);

/* ---------- result ---------- */

console.log(`\n${'-'.repeat(64)}`);
console.log(`${failures === 0 ? 'audit clean' : `${failures} audit failure(s)`}`);
process.exit(failures === 0 ? 0 : 1);
