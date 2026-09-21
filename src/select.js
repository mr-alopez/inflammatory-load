/**
 * Entry selection — §1.2's day and window definitions.
 *
 * REPORTED GAP, not a shell invention. §1.2 defines TODAY_LOAD, DAILY_LOAD and
 * WINDOW_LOAD in terms of "the same local calendar date" and "the three most
 * recent completed local calendar days", but no §11 step built the selection.
 * Steps 1–5 all take an entry array as given. The shell cannot render Log
 * without it, so it lives here — engine side, where §1.2 puts it — rather than
 * in the UI layer. Flagged for ratification.
 *
 * Day boundaries follow `[OPEN-6]`'s interim default: device-local midnight,
 * no special handling.
 */

import { windowLoad } from './macros.js';

/** Local calendar date as YYYY-MM-DD, per [OPEN-6]'s device-local default. */
export function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function shiftDate(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return localDate(dt);
}

export const entriesForDate = (entries, date) => entries.filter((e) => e.local_date === date);

/** §1.2 DAILY_LOAD — sum of SCORE for entries on the same local calendar date. */
export const dailyLoad = (entries, date) => windowLoad(entriesForDate(entries, date));

/** §1.2 TODAY_LOAD — DAILY_LOAD for the current local date. Never banded. */
export const todayLoad = (entries, today = localDate()) => dailyLoad(entries, today);

/** Distinct dates that have entries, newest first. Today is excluded. */
export function completedDates(entries, today = localDate()) {
  return [...new Set(entries.map((e) => e.local_date))]
    .filter((d) => d < today)
    .sort()
    .reverse();
}

/**
 * §1.2 WINDOW_LOAD's day set — the three most recent COMPLETED local calendar
 * days. The current day is excluded until it closes at local midnight.
 *
 * Note this is the three most recent completed CALENDAR days, not the three
 * most recent days that happen to have entries: a day with no entries is still
 * a completed day and contributes 0.
 */
export function windowDates(today = localDate()) {
  return [shiftDate(today, -1), shiftDate(today, -2), shiftDate(today, -3)];
}

export function windowEntries(entries, today = localDate()) {
  const days = new Set(windowDates(today));
  return entries.filter((e) => days.has(e.local_date));
}

/** §6.3a — whether a set of entries spans more than one coefficient set version. */
export function hasMixedCoefficientVersions(entries) {
  return new Set(entries.map((e) => e.coeff_version)).size > 1;
}

/* ------------------------------------------------------------------ *
 * §4.5 — fixed-epoch trend blocks
 * ------------------------------------------------------------------ */

/** Whole days from `from` to `to`, both ISO dates. */
export function daysBetween(from, to) {
  const [ay, am, ad] = from.split('-').map(Number);
  const [by, bm, bd] = to.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/** §4.5: block n covers TREND_EPOCH + 3n through TREND_EPOCH + 3n + 2. */
export const blockRange = (epoch, n) => ({
  index: n,
  start: shiftDate(epoch, 3 * n),
  end: shiftDate(epoch, 3 * n + 2),
});

export const blockIndexOf = (epoch, date) => Math.floor(daysBetween(epoch, date) / 3);

/**
 * §4.5 BLOCK_LOAD series. Boundaries count forward from TREND_EPOCH and never
 * move, so the same entries produce the same trend on any day (AV-19).
 *
 * Two omission cases, and they are different from each other:
 *   - the CURRENT block is not plotted until all three of its days are complete
 *   - a block containing ZERO entries is gapped: its x position is preserved and
 *     left empty, never plotted at +0.0 (AV-20)
 */
export function trendBlocks(entries, epoch, today = localDate()) {
  if (!epoch) return [];
  const currentIndex = blockIndexOf(epoch, today);
  const out = [];

  /**
   * §4.5: TREND_EPOCH pins the grid; it does not mark the start of the series.
   * Blocks extend in BOTH directions, so an entry dated before the epoch lands
   * in its own negative-index block rather than falling outside every block.
   *
   * The epoch still never moves. Re-anchoring to the earliest dated entry would
   * re-cut every boundary in the history — the defect AV-19 exists to catch —
   * and that is no more acceptable when triggered by data than by a clock.
   *
   * Series extent: from the lowest-index block containing an entry to the
   * current block, gapping empty blocks throughout.
   */
  const indices = entries.map((e) => blockIndexOf(epoch, e.local_date));
  const startIndex = Math.min(0, ...indices);

  for (let n = startIndex; n <= currentIndex; n++) {
    const { start, end } = blockRange(epoch, n);
    const inBlock = entries.filter((e) => e.local_date >= start && e.local_date <= end);
    const isCurrent = n === currentIndex;
    out.push({
      index: n,
      start,
      end,
      entryCount: inBlock.length,
      // BLOCK_LOAD is not WINDOW_LOAD: different day sets, not interchangeable (§1.2).
      block_load: inBlock.reduce((a, e) => a + e.score, 0),
      plotted: !isCurrent && inBlock.length > 0,
      omitted: isCurrent ? 'CURRENT_INCOMPLETE' : (inBlock.length === 0 ? 'NO_DATA' : null),
    });
  }
  return out;
}
