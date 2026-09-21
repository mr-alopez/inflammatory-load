/**
 * Macro capture and normalization — spec v0.8 §11 step 4: §2.5, §1.2, §4.6.
 *
 * §2.5's prohibitions are structural here, not cosmetic. This module computes
 * totals and a normalized ratio and exposes nothing else: there is no target,
 * goal, budget, remaining figure, progress value, band, or color anywhere in
 * its surface, because there is no function capable of producing one.
 *
 * Step 4 owns the arithmetic. Step 5 owns every string (§6.2b, §6.3b).
 */

import { MACRO_FIELDS } from './schema.js';

/* ------------------------------------------------------------------ *
 * §1.3 — rounding
 * ------------------------------------------------------------------ */

/** Half away from zero, to `dp` decimal places. Display-time only (§1.3). */
export function roundHalfAwayFromZero(value, dp = 1) {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** dp;
  const scaled = value * f;
  const r = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return r / f;
}

/** §1.3 macro exception — macros round to zero decimal places. */
export const roundMacro = (value) => roundHalfAwayFromZero(value, 0);

/* ------------------------------------------------------------------ *
 * §2.5 / §6.2b — macro totals
 * ------------------------------------------------------------------ */

/**
 * Day macro totals (§6.2b summation basis, K1).
 *
 * Sums the FULL-PRECISION as-consumed values and rounds once, at the end. The
 * per-entry integers §6.1a renders are display output and are never summed:
 * five entries at 152.65 kcal total 763.25 → 763, not 5 × 153 = 765.
 *
 * `partial` is a decision, not a string. §6.2b renders it.
 */
export function macroTotals(entries) {
  const totals = {};
  let partial = false;

  for (const field of MACRO_FIELDS) {
    let sum = 0;
    let sawValue = false;
    for (const e of entries) {
      const v = macroValue(e, field);
      if (v === null || v === undefined) {
        // A PRE_SCHEMA_2 or NOT_APPLICABLE entry is not "missing" a value it
        // never had; §8.6a and §3.3c govern those separately.
        if (!isExempt(e)) partial = true;
        continue;
      }
      sum += v;                       // full precision, never rounded here
      sawValue = true;
    }
    totals[field] = sawValue ? sum : null;
  }
  return { totals, partial };
}

/** Rounded-once integers for the four fields. §1.3 arithmetic, not §6.2b's string. */
export function macroTotalsRounded(entries) {
  const { totals, partial } = macroTotals(entries);
  const rounded = {};
  for (const field of MACRO_FIELDS) {
    rounded[field] = totals[field] === null ? null : roundMacro(totals[field]);
  }
  return { totals: rounded, partial };
}

function macroValue(entry, field) {
  return entry.macros?.[field] ?? entry.as_consumed?.[field] ?? null;
}

/** §8.6a PRE_SCHEMA_2 and §3.3c NOT_APPLICABLE entries have no values to lack. */
function isExempt(entry) {
  return entry.macro_basis === 'PRE_SCHEMA_2' || entry.source_basis === 'NOT_APPLICABLE';
}

/* ------------------------------------------------------------------ *
 * §1.2 / §4.6 — window aggregation and normalization
 * ------------------------------------------------------------------ */

export const NORMALIZATION = {
  AVAILABLE: 'AVAILABLE',
  NO_ENTRIES: 'NO_ENTRIES',
  NO_CALORIE_DATA: 'NO_CALORIE_DATA',
};

/** §1.2 — sum of SCORE over the window's entries, at full precision. */
export function windowLoad(entries) {
  return entries.reduce((a, e) => a + e.score, 0);
}

/** §1.2 — sum of energy_kcal over the same entries, at full precision. */
export function windowKcal(entries) {
  return entries.reduce((a, e) => a + (macroValue(e, 'energy_kcal') ?? 0), 0);
}

/**
 * §4.6 normalization.
 *
 * Three preconditions, all required: the window contains at least one entry;
 * every entry has a non-null `energy_kcal`; `WINDOW_KCAL` > 0.
 *
 * When any precondition fails, `load_per_1000` is NOT COMPUTED — the key is
 * absent from the result rather than present and null, and no division runs.
 * AV-18 exists because an implementation checking only the null condition
 * divides 0 by 0.
 *
 * `LOAD_PER_1000` is never banded (§4.6). No band is returned or computable.
 *
 * @param entries      the window's entries
 * @param opts.onDivide  test hook: called immediately before the division
 */
export function normalizeWindow(entries, { onDivide } = {}) {
  const load = windowLoad(entries);

  // Precondition 1 — at least one entry. Checked FIRST, before any division.
  if (entries.length === 0) {
    return { status: NORMALIZATION.NO_ENTRIES, window_load: 0, window_kcal: 0 };
  }

  // Precondition 2 — every entry has a non-null energy_kcal. A NOT_APPLICABLE
  // entry (§3.3c) has none and is not INCOMPLETE, so it fails here on the same
  // footing as a genuinely missing value: the denominator is absent either way
  // and is never imputed (§3.2).
  const missing = entries.some((e) => {
    const v = macroValue(e, 'energy_kcal');
    return v === null || v === undefined;
  });
  if (missing) {
    return { status: NORMALIZATION.NO_CALORIE_DATA, window_load: load, window_kcal: null };
  }

  const kcal = windowKcal(entries);

  // Precondition 3 — WINDOW_KCAL > 0.
  if (!(kcal > 0)) {
    return { status: NORMALIZATION.NO_CALORIE_DATA, window_load: load, window_kcal: kcal };
  }

  if (onDivide) onDivide();
  return {
    status: NORMALIZATION.AVAILABLE,
    window_load: load,
    window_kcal: kcal,
    load_per_1000: load / (kcal / 1000),
  };
}

/** §4.6 status only — what §6.3b renders from. */
export function windowNormalizationStatus(entries) {
  return normalizeWindow(entries).status;
}
