/**
 * Acceptance vector runner — spec v0.6 §10, §11 step 1 suite.
 *
 * Asserts contributions and sums at 1e-6 and prints every margin.
 * Additionally reports each vector's DISCRIMINATION: the delta between the
 * correct value and the defective value the vector's stated purpose names.
 * Per §10, a delta at or below tolerance means the vector is inert on that
 * property even when it passes.
 */

import { scoreEntry } from '../src/scoring.js';
import { fixtures } from './fixtures.js';

const TOL = 1e-6;

let failures = 0;
let checks = 0;
const inert = [];
const discriminationRows = [];

const fmt = (n) => (typeof n === 'number'
  ? n.toPrecision(12).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  : String(n));

function near(actual, expected, label, out) {
  checks++;
  const margin = Math.abs(actual - expected);
  const ok = margin <= TOL;
  if (!ok) failures++;
  out.push(
    `      ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(24)} ` +
    `actual ${fmt(actual).padStart(18)}  expected ${fmt(expected).padStart(18)}  ` +
    `margin ${margin.toExponential(2)}`
  );
}

function equal(actual, expected, label, out) {
  checks++;
  const ok = actual === expected;
  if (!ok) failures++;
  out.push(`      ${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(24)} ${String(actual)}` +
    (ok ? '' : `  (expected ${String(expected)})`));
}

function correctValueFor(d, result) {
  switch (d.kind) {
    case 'score': return result.score;
    case 'asConsumed': return result.asConsumed[d.field];
    case 'contribution': return result.contributions[d.field] ?? 0;
    default: return null;
  }
}

function recordDiscrimination(fx, result) {
  for (const d of fx.discrimination || []) {
    if (d.kind === 'categorical') {
      discriminationRows.push([fx.id, d.label, 'categorical', 'entry refused vs created — binary, not numeric']);
      continue;
    }
    if (d.kind === 'display') {
      discriminationRows.push([fx.id, d.label, 'out of scope', 'display layer is §11 step 5; not asserted here']);
      continue;
    }
    const correct = correctValueFor(d, result);
    const delta = Math.abs(correct - d.defective);
    const isInert = delta <= TOL;
    if (isInert) inert.push(`${fx.id}: ${d.label}`);
    discriminationRows.push([
      fx.id, d.label,
      delta.toExponential(3),
      `${isInert ? 'INERT — cannot fail' : 'discriminates'}  (correct ${fmt(correct)} vs defective ${fmt(d.defective)})`,
    ]);
  }
}

function runOne(fx) {
  const out = [];
  const result = scoreEntry(fx.record, fx.quantity);
  const e = fx.expect;

  equal(result.created, e.created, 'created', out);

  if (!e.created) {
    equal(result.reason, e.reason, 'reason', out);
    if (result.detail) out.push(`           ${result.detail}`);
    recordDiscrimination(fx, result);
    return out;
  }
  if (!result.created) {
    out.push(`      FAIL entry rejected: ${result.reason} — ${result.detail}`);
    failures++;
    return out;
  }

  if (e.basis !== undefined) equal(result.basis, e.basis, 'basis', out);
  if (e.basisProvenance !== undefined) equal(result.basisProvenance, e.basisProvenance, 'basis provenance', out);
  if (e.density !== undefined) near(result.density, e.density, 'density', out);
  if (e.quantity_g !== undefined) near(result.quantity_g, e.quantity_g, 'quantity_g', out);
  if (e.p5Suppressed !== undefined) equal(result.p5Suppressed, e.p5Suppressed, 'P5 suppressed', out);

  for (const [f, want] of Object.entries(e.asConsumed || {})) near(result.asConsumed[f], want, `as consumed ${f}`, out);
  for (const [id, want] of Object.entries(e.servings || {})) near(result.servings[id], want, `servings ${id}`, out);
  for (const [id, want] of Object.entries(e.contributions || {})) near(result.contributions[id] ?? 0, want, `contribution ${id}`, out);

  near(result.score, e.score, 'SCORE (unrounded)', out);
  recordDiscrimination(fx, result);
  return out;
}

console.log(`\n§11 step 1 acceptance vectors (${fixtures.length})`);
console.log('='.repeat(40));
for (const fx of fixtures) {
  console.log(`\n  ${fx.id} — ${fx.title}`);
  for (const line of runOne(fx)) console.log(line);
}

console.log(`\n\nDISCRIMINATION — §10 convention`);
console.log('='.repeat(40));
console.log('  Delta between the correct value and the defective value each vector names.');
console.log(`  A delta <= ${TOL} means the vector cannot fail on that property.\n`);
const w0 = Math.max(...discriminationRows.map((r) => r[0].length));
const w1 = Math.max(...discriminationRows.map((r) => r[1].length));
for (const [id, label, delta, note] of discriminationRows) {
  console.log(`  ${id.padEnd(w0)}  ${label.padEnd(w1)}  ${String(delta).padStart(12)}  ${note}`);
}

console.log(`\n${'-'.repeat(72)}`);
console.log(`${checks} assertions, ${failures} failed, tolerance ${TOL}`);
console.log(`${discriminationRows.length} named defects; ${inert.length} inert`);
if (inert.length) for (const i of inert) console.log(`  INERT: ${i}`);
process.exit(failures === 0 && inert.length === 0 ? 0 : 1);
