/**
 * Display layer — spec v0.9 §11 step 5: §4.1–§4.3 banding, §5.3 drivers, §6
 * strings, §2.4 display names.
 *
 * Every string here is literal per §6. No string may be reworded, and none is
 * assembled from a template a caller can influence.
 *
 * §6.6 is enforced structurally, as §2.5's prohibitions are: there is no
 * function capable of producing a verdict word, an imperative, a target, or a
 * message triggered by a band. A high band returns §6.2 or §6.3 and nothing.
 *
 * Out of scope: the trend view (§4.5) and the swap engine (§7).
 */

import { ATTRIBUTES, ATTRIBUTE_ORDER, NUTRIENT_ATTRIBUTES } from './coefficients.js';
import { MACRO_FIELDS } from './schema.js';
import { roundHalfAwayFromZero, roundMacro } from './macros.js';

const SEP = ' · ';

/* ------------------------------------------------------------------ *
 * §4.1–§4.3 — bands
 * ------------------------------------------------------------------ */

/** §4.3: boundaries inclusive at the upper bound; banding tests the UNROUNDED value. */
export function bandDaily(dailyLoad) {
  if (dailyLoad <= -5.0) return { id: 'D_LOW', label: 'Low' };
  if (dailyLoad <= 5.0) return { id: 'D_NEUTRAL', label: 'Neutral' };
  if (dailyLoad <= 15.0) return { id: 'D_ELEVATED', label: 'Elevated' };
  return { id: 'D_HIGH', label: 'High' };
}

export function bandWindow(windowLoad) {
  if (windowLoad <= -15.0) return { id: 'W_LOW', label: 'Low' };
  if (windowLoad <= 15.0) return { id: 'W_NEUTRAL', label: 'Neutral' };
  if (windowLoad <= 45.0) return { id: 'W_ELEVATED', label: 'Elevated' };
  return { id: 'W_HIGH', label: 'High' };
}

/* ------------------------------------------------------------------ *
 * §1.3 — numeric formatting
 * ------------------------------------------------------------------ */

/** §6.1: `{score:+0.1f}`. Zero magnitude always renders `+0.0`; `-0.0` never appears. */
export function formatScore(value) {
  const r = roundHalfAwayFromZero(value, 1);
  if (r === 0) return '+0.0';
  return (r > 0 ? '+' : '-') + Math.abs(r).toFixed(1);
}

/** §5.3 value formatting: 1 dp half away from zero, trailing `.0` stripped. */
export function formatDriverValue(value) {
  const r = roundHalfAwayFromZero(value, 1);
  const s = r.toFixed(1);
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

/**
 * §1.3 macro exception: integers, half away from zero. A non-null value greater
 * than 0 that rounds to 0 renders `<1`; an exact 0 renders `0` (K9).
 */
export function formatMacro(value) {
  if (value === null || value === undefined) return null;
  const r = roundMacro(value);
  if (r === 0 && value > 0) return '<1';
  return String(r === 0 ? 0 : r);
}

/* ------------------------------------------------------------------ *
 * §2.4 — display names
 * ------------------------------------------------------------------ */

export const MACRO_DISPLAY_NAMES = {
  energy_kcal: 'kcal',
  protein_g: 'protein',
  carbohydrate_g: 'carbs',
  fat_g: 'fat',
};

/**
 * §2.4: an attribute's display name is the Display name column of §2.1/§2.2
 * (X2), with one conditional exception — `P1` renders `sugar` when
 * `sugar_field_used == "total"` (§3.5).
 *
 * The v0.9 `DISPLAY_NAME_OVERRIDES` table is gone: X2 moved those four names
 * into §2 itself, so there is no longer a deviation to carry.
 */
export function displayName(attributeId, { sugar_field_used } = {}) {
  if (attributeId === 'P1') return sugar_field_used === 'total' ? 'sugar' : 'added sugar';
  return ATTRIBUTES[attributeId].displayName;
}

/* ------------------------------------------------------------------ *
 * §5.3 — drivers
 * ------------------------------------------------------------------ */

/** §5.3 driver units. `count` marks a count noun, which pluralizes. */
export const DRIVER_UNITS = {
  P1: { unit: 'g', count: false },
  P2: { unit: 'mg', count: false },
  P8: { unit: 'g', count: false },
  A1: { unit: 'g', count: false },
  P3: { unit: 'unit', plural: 'units', count: true },
};
for (const id of ['P4', 'P5', 'P6', 'P7', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8']) {
  DRIVER_UNITS[id] = { unit: 'serving', plural: 'servings', count: true };
}

/**
 * §5.1: the value a driver displays — as-consumed for nutrients, the derived
 * count otherwise. Both are READ from the stored entry (§8.4 self-sufficiency).
 * Nothing here scores; this module has no import path to src/scoring.js.
 */
function driverValue(attributeId, entry) {
  if (NUTRIENT_ATTRIBUTES.includes(attributeId)) {
    return entry.as_consumed[ATTRIBUTES[attributeId].field];
  }
  const c = entry.classification_set[attributeId];
  return attributeId === 'P3' ? c.units : c.servings;
}

/**
 * §6.1: omission is ONE state. A driver line is omitted only when nothing
 * reaches the §5.1 threshold. An entry that cannot produce drivers at all is a
 * §8.4 defect and must be distinguishable — this is what distinguishes it.
 *
 * Unreachable for any entry written under SCHEMA-3; reachable only for entries
 * migrated from SCHEMA-2, whose classification set is gone and unrecoverable.
 */
export const DRIVER_STATE = {
  PRESENT: 'PRESENT',
  BELOW_THRESHOLD: 'BELOW_THRESHOLD',
  LEGACY_DEFICIENT: 'LEGACY_DEFICIENT',
};

export function driverState(entry) {
  if (!entry.contributions || !entry.classification_set) return DRIVER_STATE.LEGACY_DEFICIENT;
  return drivers(entry).length > 0 ? DRIVER_STATE.PRESENT : DRIVER_STATE.BELOW_THRESHOLD;
}

/** §5.3: `{value} {unit} {display_name}`, pluralized on the DISPLAYED value. */
export function driverString(attributeId, value, entry = {}) {
  const spec = DRIVER_UNITS[attributeId];
  const shown = formatDriverValue(value);
  const unit = spec.count && Number(shown) !== 1 ? spec.plural : spec.unit;
  return `${shown} ${unit} ${displayName(attributeId, entry)}`;
}

/**
 * §5.1/§5.2: attributes whose absolute contribution is ≥ 1.0, ranked by
 * absolute contribution descending, ties by §2 table order, top 3.
 */
export function drivers(entry) {
  const contributions = entry.contributions ?? {};
  return ATTRIBUTE_ORDER
    .filter((id) => Math.abs(contributions[id] ?? 0) >= 1.0)
    .map((id, tableIndex) => ({ id, tableIndex, mag: Math.abs(contributions[id]) }))
    .sort((a, b) => (b.mag - a.mag) || (a.tableIndex - b.tableIndex))
    .slice(0, 3)
    .map(({ id }) => driverString(id, driverValue(id, entry), entry));
}

/* ------------------------------------------------------------------ *
 * §6 — literal strings
 * ------------------------------------------------------------------ */

/**
 * §6.1. Returns an array of lines; the driver line is omitted only when nothing
 * reaches the §5.1 threshold. Reads a STORED entry (§8.4) — never a score.
 */
export function entryLine(entry) {
  const lines = [`${entry.food_name} — ${formatScore(entry.score)}`];
  const d = drivers(entry);
  if (d.length > 0) lines.push(d.join(SEP));
  return lines;
}

/**
 * §6.1a. Null fields are omitted along with their separator — the parts are
 * collected first and joined once, so no leading, doubled or trailing
 * separator is reachable. Returns null when every field is null.
 */
export function entryMacroLine(macros = {}) {
  const parts = [];
  for (const field of MACRO_FIELDS) {
    const shown = formatMacro(macros[field]);
    if (shown === null) continue;
    parts.push(field === 'energy_kcal'
      ? `${shown} kcal`
      : `${shown} g ${MACRO_DISPLAY_NAMES[field]}`);
  }
  return parts.length ? parts.join(SEP) : null;
}

/** §6.4. Comma-separated, §2 table order, scored attributes before macro fields. */
export function incompleteMarker(incompleteFields, entry = {}) {
  if (!incompleteFields || incompleteFields.length === 0) return null;
  const scored = ATTRIBUTE_ORDER
    .filter((id) => incompleteFields.includes(id))
    .map((id) => displayName(id, entry));
  const macro = MACRO_FIELDS
    .filter((f) => incompleteFields.includes(f))
    .map((f) => MACRO_DISPLAY_NAMES[f]);
  return `Incomplete — missing ${[...scored, ...macro].join(', ')}`;
}

/** §6.2 + §6.3a. Banding tests the unrounded load (§4.3). */
export function completedDaySummary(date, dailyLoad, { mixedVersions = false } = {}) {
  let s = `${date}: ${formatScore(dailyLoad)}${SEP}${bandDaily(dailyLoad).label}`;
  if (mixedVersions) s += `${SEP}mixed coefficient versions`;
  return s;
}

/** §6.2a. No band label, no colour, no driver summary. */
export function todayLine(todayLoad) {
  return `Today so far: ${formatScore(todayLoad)}`;
}

/** §6.3 + §6.3a. */
export function windowSummary(lastCompletedDate, windowLoad, { mixedVersions = false } = {}) {
  let s = `3 days ending ${lastCompletedDate}: ${formatScore(windowLoad)}`
        + `${SEP}${bandWindow(windowLoad).label}`;
  if (mixedVersions) s += `${SEP}mixed coefficient versions`;
  return s;
}

/** §6.3b. No band label in any case (§4.6). */
export function normalizedLine(normalization) {
  switch (normalization.status) {
    case 'AVAILABLE':
      return `Per 1,000 kcal: ${formatScore(normalization.load_per_1000)}`;
    case 'NO_ENTRIES':
      return 'Per 1,000 kcal: unavailable — no entries in this window';
    default:
      return 'Per 1,000 kcal: unavailable — some entries have no calorie data';
  }
}

/* ------------------------------------------------------------------ *
 * §6.5 — swap suggestion
 * ------------------------------------------------------------------ */

/** §7.3's three suppression strings, in their evaluation order. */
export const SWAP_SUPPRESSION = {
  SOURCE_INELIGIBLE: "This item isn't categorized, so alternatives aren't available.",
  CORPUS_EMPTY: 'Not enough history yet to suggest an alternative.',
  BELOW_THRESHOLD: 'No clear alternative in this category.',
};

/**
 * §6.5. RENDERS what §7 computed — it does not compute (§7.0). The swap result
 * arrives already scored; nothing here rescales, re-ranks or re-thresholds.
 *
 * The word "instead" and any imperative phrasing are prohibited. Macro fields
 * never appear in a swap line.
 */
export function swapLine(result, sourceEntry) {
  if (result.status !== 'SUGGESTION') {
    return [SWAP_SUPPRESSION[result.status] ?? SWAP_SUPPRESSION.BELOW_THRESHOLD];
  }

  const mass = formatDriverValue(result.reference_mass);
  const lines = [
    `Alternative: ${result.candidate.food_name}, ${mass} g — ${formatScore(result.candidate.score)}`,
  ];

  // §6.5: if either delta driver is absent, the second line is omitted entirely.
  const { out, into } = result.drivers;
  if (out && into) {
    const valueOf = (id, entry) => (NUTRIENT_ATTRIBUTES.includes(id)
      ? entry.as_consumed[ATTRIBUTES[id].field]
      : (id === 'P3' ? entry.classification_set[id].units
        : entry.classification_set[id].servings));
    lines.push(
      `Swaps ${driverString(out.id, valueOf(out.id, sourceEntry), sourceEntry)}`
      + ` for ${driverString(into.id, valueOf(into.id, result.candidate), result.candidate)}.`
    );
  }
  return lines;
}

/**
 * §6.2b. Totals sum full-precision as-consumed values and round once (K1).
 * Returns null when the line is omitted entirely (§8.6a: a day of only
 * PRE_SCHEMA_2 entries).
 */
export function dayMacroLine(totals, { partial = false, omit = false } = {}) {
  if (omit) return null;
  const body = entryMacroLine(totals);
  if (body === null) return null;
  return partial ? `${body}${SEP}partial` : body;
}

/* ------------------------------------------------------------------ *
 * §3.3 — quantity as entered
 * ------------------------------------------------------------------ */

/**
 * REPORTED — §3.3 (v1.8) says the entry "displays them that way (`12 fl oz`,
 * `1/3 tbsp`)", but §6 defines no string that renders a quantity. §6.1 is
 * `{food_name} — {score}`; §6.1a is macros; §6.4 is the incomplete marker;
 * §6.5's mass belongs to a swap candidate. There is no §6 slot to put this in.
 *
 * So this is built, tested and NOT wired into any §6 string. Wiring it into
 * §6.1 would change every entry line and falsify §6.1's stated format and the
 * display vectors that assert it, which §11's "claims about vectors bind those
 * vectors" forbids doing quietly. §6 needs to say where a quantity renders.
 *
 * Fractions are reconstructed rather than stored. §3.3 asks for `1/3 tbsp`, but
 * `quantity_value` holds 0.333…, so rendering "as entered" means recovering the
 * fraction. Only culinary denominators are tried (2, 3, 4, 8) and only on an
 * exact-to-tolerance match; anything else renders as a trimmed decimal. This
 * reconstructs what was entered without storing a second representation of it.
 */
const FRACTION_DENOMINATORS = [2, 3, 4, 8];

export function formatAmount(value) {
  if (!Number.isFinite(value)) return null;
  const whole = Math.floor(value);
  const rest = value - whole;
  if (rest > 1e-9) {
    for (const den of FRACTION_DENOMINATORS) {
      const num = Math.round(rest * den);
      if (num > 0 && num < den && Math.abs(rest - num / den) < 1e-9) {
        return whole > 0 ? `${whole} ${num}/${den}` : `${num}/${den}`;
      }
    }
  }
  return String(Number(value.toFixed(2)));
}

/** `12 fl oz`, `1/3 tbsp`, `100 g` — the quantity as the user entered it (§3.3). */
export function quantityAsEntered(entry) {
  const amount = formatAmount(entry.quantity_value);
  return amount === null ? null : `${amount} ${entry.quantity_unit}`;
}
