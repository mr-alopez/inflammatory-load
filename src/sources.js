/**
 * Source resolution — spec v0.7 §11 step 3: §8.1 Open Food Facts, §8.2 USDA.
 *
 * Turns a raw source record into the normalized shape src/scoring.js consumes,
 * or refuses to create an entry. Refusal is the correct outcome wherever a
 * value would otherwise have to be guessed (§3.2, §3.3c, §3.1).
 *
 * No LLM anywhere (§8.3). Nothing is inferred from product identity or name.
 */

import { DENSITY_MAP, VOLUME_UNITS } from './coefficients.js';
import { categoryFromTags, categoryFromUSDA, CATMAP_VERSION } from './category-map.js';

export const SOURCE_REJECT = {
  DATASET_NOT_ELIGIBLE: 'DATASET_NOT_ELIGIBLE',       // §8.2 USDA Branded
  BASIS_UNRESOLVED: 'BASIS_UNRESOLVED',               // §3.3c rule 4
  GRAIN_MAJORITY_UNKNOWN: 'GRAIN_MAJORITY_UNKNOWN',   // §3.1
  DENSITY_UNRESOLVED: 'DENSITY_UNRESOLVED',           // §3.3a step 3
  NOT_FOUND: 'NOT_FOUND',
};

/** §8.2 — Foundation Foods and SR Legacy only. Branded is not eligible. */
export const USDA_ELIGIBLE_DATASETS = ['Foundation', 'SR Legacy'];

const refuse = (reason, detail) => ({ resolved: false, reason, detail, offer: 'MANUAL' });

/* ------------------------------------------------------------------ *
 * Declared-field parsing
 * ------------------------------------------------------------------ */

/**
 * Parse a declared quantity string ("355 ml", "52.7 g") into value + unit.
 * This reads a declared field. It does not infer: an unparseable string
 * returns null and the caller refuses rather than guessing.
 */
export function parseQuantity(text) {
  if (typeof text !== 'string') return null;
  const m = text.trim().toLowerCase().match(/^([0-9]+(?:\.[0-9]+)?)\s*(mg|g|kg|ml|cl|l|fl\s?oz|oz|lb)$/);
  if (!m) return null;
  const unit = m[2].replace(/\s+/, ' ') === 'fl oz' || m[2] === 'floz' ? 'fl oz' : m[2];
  return { value: Number(m[1]), unit };
}

/* ------------------------------------------------------------------ *
 * §3.1 — grain majority
 * ------------------------------------------------------------------ */

const WHOLE_GRAIN = /whole\s?(grain|wheat|meal|oat|rye|spelt)/i;
const REFINED_GRAIN = /\b(wheat flour|white flour|enriched flour|refined|semolina|maida)\b/i;

/**
 * Determine majority grain mass from DECLARED ingredient percentages.
 *
 * Open Food Facts also exposes `percent_estimate`, which OFF computes itself.
 * Using it would be inference dressed as a field read, so only a declared
 * `percent` counts. If both grain types are present and neither carries a
 * declared percentage, the classification does not resolve (§3.1).
 *
 * @returns 'whole' | 'refined' | 'unknown' | null (not a grain product)
 */
export function resolveGrainMajority(ingredients = []) {
  const grains = ingredients.filter(
    (i) => WHOLE_GRAIN.test(i.text || '') || REFINED_GRAIN.test(i.text || '')
  );
  if (grains.length === 0) return null;

  const whole = grains.filter((i) => WHOLE_GRAIN.test(i.text));
  const refined = grains.filter((i) => REFINED_GRAIN.test(i.text) && !WHOLE_GRAIN.test(i.text));
  if (refined.length === 0) return 'whole';
  if (whole.length === 0) return 'refined';

  const declared = (list) => list.reduce(
    (a, i) => (typeof i.percent === 'number' ? a + i.percent : NaN), 0
  );
  const wholePct = declared(whole);
  const refinedPct = declared(refined);
  if (Number.isNaN(wholePct) || Number.isNaN(refinedPct)) return 'unknown';
  return wholePct >= refinedPct ? 'whole' : 'refined';
}

/* ------------------------------------------------------------------ *
 * §8.1 — Open Food Facts
 * ------------------------------------------------------------------ */

export function resolveFromOFF(raw) {
  if (!raw) return refuse(SOURCE_REJECT.NOT_FOUND, 'no OFF record');

  const servingSize = parseQuantity(raw.serving_size);
  const packageQty = parseQuantity(raw.quantity);

  // §3.1 — grain majority must resolve before anything else is worth doing.
  const grainMajority = resolveGrainMajority(raw.ingredients);
  if (grainMajority === 'unknown') {
    return refuse(
      SOURCE_REJECT.GRAIN_MAJORITY_UNKNOWN,
      'both whole and refined grain listed with no declared mass ordering (§3.1)'
    );
  }

  const isLiquid = !!(packageQty && VOLUME_UNITS.includes(packageQty.unit));
  const densityClass = raw.density_class ?? null;
  if (isLiquid && (densityClass === null || DENSITY_MAP[densityClass] === undefined)) {
    return refuse(
      SOURCE_REJECT.DENSITY_UNRESOLVED,
      'liquid product with no resolvable density class; never assumed 1.00 (§3.3a step 3)'
    );
  }

  const juice = applyJuiceRule(raw, reportedFromOFF(raw), classificationsFromOFF(raw, grainMajority));

  const record = {
    name: raw.product_name,
    product_id: `off:${raw.code}`,
    source: 'OFF',
    sugar_field_used: juice.sugar_field_used,
    off: {
      nutrition_data_per: raw.nutrition_data_per ?? null,
      serving_size: servingSize,
      quantity: packageQty,
    },
    density_class: densityClass,
    labeled_serving: servingSize,
    grain_majority: grainMajority,
    classifications: juice.classifications,
    reported: juice.reported,
    // §7.2a: resolved when the record resolves, from declared category tags.
    // A record resolving without a category ATTEMPT is a source-layer defect;
    // UNCATEGORIZED is a valid outcome of the attempt, not a skipped one.
    occasion_category: categoryFromTags(raw.categories_tags),
    category_map_version: CATMAP_VERSION,
  };

  // §3.3c is authoritative on the basis; refuse here rather than let scoring
  // discover it, so that "not scored and not stored" is a source-layer outcome.
  if (basisWouldNotResolve(record)) {
    return refuse(
      SOURCE_REJECT.BASIS_UNRESOLVED,
      'nutrition_data_per absent or unparseable serving_size; per_100g is never a fallback (§3.3c rule 4)'
    );
  }
  return { resolved: true, record };
}

function basisWouldNotResolve(record) {
  const { nutrition_data_per: per, serving_size: ss, quantity: q } = record.off;
  if (per === 'serving' && ss) return false;
  if (per === '100g' && q) return false;
  return true;
}

function classificationsFromOFF(raw, grainMajority) {
  const c = {};
  if (raw.nova_group === 4) c.P5 = true;              // §2.1 P5
  if (grainMajority === 'refined') c.P4 = true;        // §3.1 mutual exclusion
  if (grainMajority === 'whole') c.A7 = true;
  for (const id of ['P6', 'P7', 'A2', 'A3', 'A4', 'A5', 'A6', 'A8']) {
    if (raw.classifications?.[id]) c[id] = true;
  }
  if (raw.classifications?.P3) c.P3 = raw.classifications.P3;
  return c;
}

/**
 * §3.5 — juice field selection.
 *
 * A juice-classified entry takes `P1` from the TOTAL sugars field; the
 * added-sugars field is ignored and is never a fallback. If total sugars is
 * absent, `P1` is missing and §3.2 applies. `A4` does not apply, and the entry
 * stores `sugar_field_used: "total"` so §2.4 renders `sugar`, not `added sugar`.
 *
 * Juice classification is a declared category-tag lookup (§7.2a), like
 * `density_class`. It is never inferred from a product name.
 */
export function applyJuiceRule(raw, reported, classifications) {
  if (!raw.juice_classified) return { reported, classifications, sugar_field_used: null };
  const total = raw.nutriments?.sugars_total_g;
  return {
    reported: { ...reported, added_sugar_g: total === undefined ? null : total },
    classifications: (({ A4, ...rest }) => rest)(classifications),   // §3.5: A4 never applies
    sugar_field_used: 'total',
  };
}

function reportedFromOFF(raw) {
  const n = raw.nutriments ?? {};
  const pick = (v) => (v === undefined ? null : v);
  return {
    added_sugar_g: pick(n.sugars_added_g),
    sodium_mg: pick(n.sodium_mg),
    saturated_fat_g: pick(n.saturated_fat_g),
    fiber_g: pick(n.fiber_g),
    energy_kcal: pick(n.energy_kcal),
    protein_g: pick(n.proteins_g),
    carbohydrate_g: pick(n.carbohydrates_g),
    fat_g: pick(n.fat_g),
  };
}

/* ------------------------------------------------------------------ *
 * §8.2 — USDA FoodData Central
 * ------------------------------------------------------------------ */

export function resolveFromUSDA(raw) {
  if (!raw) return refuse(SOURCE_REJECT.NOT_FOUND, 'no USDA record');

  if (!USDA_ELIGIBLE_DATASETS.includes(raw.dataType)) {
    return refuse(
      SOURCE_REJECT.DATASET_NOT_ELIGIBLE,
      `dataType "${raw.dataType}" is not eligible; Branded carries no NOVA field so P5 would be ` +
      'genuinely missing (§8.2)'
    );
  }

  return {
    resolved: true,
    record: {
      name: raw.description,
      product_id: `usda:${raw.fdcId}`,
      source: 'USDA',
      density_class: raw.density_class ?? null,
      // §7.2a / §8.2: USDA food category names, where a key is configured.
      occasion_category: categoryFromUSDA(raw.foodCategory),
      category_map_version: CATMAP_VERSION,
      // §8.2: P5 = 0 is a determined value for these datasets, not a default.
      classifications: { ...(raw.classifications ?? {}) },
      grain_majority: raw.grain_majority ?? null,
      reported: {
        added_sugar_g: raw.nutrients?.added_sugar_g ?? null,
        sodium_mg: raw.nutrients?.sodium_mg ?? null,
        saturated_fat_g: raw.nutrients?.saturated_fat_g ?? null,
        fiber_g: raw.nutrients?.fiber_g ?? null,
        energy_kcal: raw.nutrients?.energy_kcal ?? null,
        protein_g: raw.nutrients?.protein_g ?? null,
        carbohydrate_g: raw.nutrients?.carbohydrate_g ?? null,
        fat_g: raw.nutrients?.fat_g ?? null,
      },
    },
  };
}
