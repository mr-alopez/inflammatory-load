/**
 * Prefill from a refused record — spec v2.0 §8.5.
 *
 * When a product refuses for a reason OTHER than its basis, and its basis
 * resolved under §3.3c, the record's declared values are carried into the manual
 * form. They are the product's own declared fields, so this is not inference
 * and §8.3 is untouched.
 *
 * Pure: takes a record, returns form values. The shell renders them; the
 * manual module records what the user changed.
 */

const FIELDS = [
  'added_sugar_g', 'sodium_mg', 'saturated_fat_g', 'fiber_g',
  'energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g',
];

/** Reasons that permit prefill. BASIS_UNRESOLVED is deliberately absent (§8.5). */
export const PREFILL_REASONS = ['GRAIN_MAJORITY_UNKNOWN', 'DENSITY_UNRESOLVED', 'DATASET_NOT_ELIGIBLE'];

/**
 * What the record could not determine, and so what the user must supply.
 * The shell shows these as required inputs, not optional ones.
 */
const NEEDS = {
  GRAIN_MAJORITY_UNKNOWN: ['grain'],
  DENSITY_UNRESOLVED: ['density'],
  DATASET_NOT_ELIGIBLE: [],
};

/**
 * A declared serving size in the form the form wants: `{value, unit}` in g or ml.
 *
 * OFF writes servings as "1 slice (38 g)" or "1 can (355 ml)" far more often
 * than "38 g". The strict parser §3.3c uses reads only the latter, so it would
 * discard the gram figure most labels actually carry. This reads the
 * parenthetical too. It reads a DECLARED string; it does not estimate, and an
 * unparseable serving returns null so the form falls back to 100.
 *
 * Used for the form only — the user sees the mass and can change it. §3.3c's
 * scoring path is unchanged.
 */
export function parseServing(text) {
  if (typeof text !== 'string') return null;
  const t = text.toLowerCase();
  const plain = t.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(g|ml)$/);
  if (plain) return { value: Number(plain[1]), unit: plain[2] };
  const paren = t.match(/\(\s*([0-9]+(?:\.[0-9]+)?)\s*(g|ml)\s*\)/);
  if (paren) return { value: Number(paren[1]), unit: paren[2] };
  return null;
}

/**
 * The form shows at most two decimal places. Change detection (AV-34) compares
 * against THIS value, not the unrounded one — otherwise every field whose
 * conversion is inexact would register as edited when the user touched nothing.
 */
export const roundForForm = (v) => Number(v.toFixed(2));

/**
 * @param record    the refused record, built in full by the resolver
 * @param reason    the refusal reason
 * @param raw       the source record, for the declared serving string
 * @returns null when prefill does not apply, otherwise the form's values
 */
export function prefillFromRefusal({ record, reason, raw = {}, isLiquid = false }) {
  if (!record || !PREFILL_REASONS.includes(reason)) return null;

  /**
   * The values are per 100 g — or per 100 ml for a liquid, which is Open Food
   * Facts' own convention for its `_100g` fields and the one §3.3c rule 2
   * already relies on. USDA Foundation and SR Legacy are per 100 g (§8.2).
   *
   * They are converted to ONE serving, because the manual form is per serving
   * (§3.3c MANUAL). Carrying per-100 values into a per-serving form unconverted
   * is AV-31's defect: sodium 447 where 169.86 is correct.
   */
  const declared = parseServing(raw.serving_size);
  let serving;
  if (isLiquid) {
    const ml = declared?.unit === 'ml' ? declared.value : 100;
    serving = { volume_ml: ml, scale: ml / 100, basisNote: declared?.unit === 'ml' ? 'declared' : 'default' };
  } else {
    const g = declared?.unit === 'g' ? declared.value : 100;
    serving = { serving_mass_g: g, scale: g / 100, basisNote: declared?.unit === 'g' ? 'declared' : 'default' };
  }

  // Declared fields only. A field the record did not declare is ABSENT from
  // `values` and arrives blank — never 0 (J4/J5, §8.5).
  const values = {};
  for (const f of FIELDS) {
    const v = record.reported?.[f];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    values[f] = roundForForm(v * serving.scale);
  }

  // Classifications the record declares. When the grain majority is what the
  // refusal is about, P4 and A7 are the user's to answer, so neither is carried.
  const classifications = { ...(record.classifications ?? {}) };
  if (reason === 'GRAIN_MAJORITY_UNKNOWN') { delete classifications.P4; delete classifications.A7; }
  delete classifications.P3;   // K2: P3 needs a volume and ABV the user states

  return {
    reason,
    from: { source: record.source, product_id: record.product_id },
    name: record.name ?? '',
    ...(serving.serving_mass_g !== undefined ? { serving_mass_g: serving.serving_mass_g } : {}),
    ...(serving.volume_ml !== undefined ? { volume_ml: serving.volume_ml } : {}),
    servingSource: serving.basisNote,
    values,
    classifications,
    sugar_field_used: record.sugar_field_used ?? null,
    needs: NEEDS[reason] ?? [],
    declaredCount: Object.keys(values).length,
  };
}

/**
 * §8.5 provenance: the fields the user changed from their prefilled values.
 *
 * Only fields that WERE prefilled can be changed from a prefilled value:
 * filling a field the record left blank is supplying, not changing. The grain
 * choice is not a change either — it was never prefilled (AV-34).
 */
export function changedFromPrefill(submitted, prefill) {
  if (!prefill) return [];
  const changed = [];
  const same = (a, b) => a !== null && a !== undefined && Math.abs(a - b) < 1e-9;

  for (const [f, v] of Object.entries(prefill.values ?? {})) {
    const got = submitted.reported?.[f];
    if (!same(got, v)) changed.push(f);
  }
  if (prefill.serving_mass_g !== undefined && !same(submitted.serving_mass_g, prefill.serving_mass_g)) {
    changed.push('serving_mass_g');
  }
  if (prefill.volume_ml !== undefined && !same(submitted.volume_ml, prefill.volume_ml)) {
    changed.push('volume_ml');
  }

  const grainChoice = prefill.needs?.includes('grain') ? new Set(['P4', 'A7']) : new Set();
  const before = new Set(Object.keys(prefill.classifications ?? {}));
  const after = new Set(Object.keys(submitted.classifications ?? {}).filter((id) => id !== 'P3'));
  for (const id of new Set([...before, ...after])) {
    if (grainChoice.has(id)) continue;
    if (before.has(id) !== after.has(id)) changed.push(id);
  }
  return changed;
}
