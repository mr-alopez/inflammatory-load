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
import { prefillFromRefusal } from './prefill.js';

export const SOURCE_REJECT = {
  DATASET_NOT_ELIGIBLE: 'DATASET_NOT_ELIGIBLE',       // §8.2 USDA Branded
  BASIS_UNRESOLVED: 'BASIS_UNRESOLVED',               // §3.3c rule 4
  GRAIN_MAJORITY_UNKNOWN: 'GRAIN_MAJORITY_UNKNOWN',   // §3.1
  DENSITY_UNRESOLVED: 'DENSITY_UNRESOLVED',           // §3.3a step 3
  NOT_FOUND: 'NOT_FOUND',
};

/** §8.2 — Foundation Foods and SR Legacy only. Branded is not eligible. */
export const USDA_ELIGIBLE_DATASETS = ['Foundation', 'SR Legacy'];

/**
 * A refusal offers manual entry (§13.2). Since v2.0 it may also carry the
 * record's declared values for the form (§8.5) — null when prefill does not
 * apply, which includes every basis refusal.
 */
const refuse = (reason, detail, prefill = null) =>
  ({ resolved: false, reason, detail, offer: 'MANUAL', prefill });

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

/**
 * §3.3: a user-entered amount. Accepts a decimal, a vulgar fraction, or a mixed
 * number — `0.5`, `1/3`, `1 1/2` — because that is how people say tablespoons.
 *
 * Returns null rather than a guess. A value that does not parse is refused by
 * the form; it is never rounded to something nearby.
 */
export function parseAmount(text) {
  if (typeof text === 'number') return Number.isFinite(text) && text > 0 ? text : null;
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (t === '') return null;

  const mixed = t.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) {
    const [, whole, num, den] = mixed.map(Number);
    return den > 0 ? whole + num / den : null;
  }
  const frac = t.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) {
    const [, num, den] = frac.map(Number);
    return den > 0 && num > 0 ? num / den : null;
  }
  const dec = t.match(/^\d*\.?\d+$/);
  if (dec) {
    const v = Number(t);
    return Number.isFinite(v) && v > 0 ? v : null;
  }
  return null;
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
  const grainMajority = resolveGrainMajority(raw.ingredients);
  const isLiquid = !!(packageQty && VOLUME_UNITS.includes(packageQty.unit));
  const densityClass = raw.density_class ?? null;

  /**
   * v2.0 (§8.5): the record is built IN FULL before any refusal, because a
   * refusal for a reason other than the basis now carries the record's declared
   * values into the manual form. Refusing before the record existed threw that
   * away and made the user retype a label the app already had.
   *
   * An unresolved grain majority contributes neither P4 nor A7 here — that
   * choice is what the refusal asks the user for.
   */
  const juice = applyJuiceRule(raw, reportedFromOFF(raw),
    classificationsFromOFF(raw, grainMajority === 'unknown' ? null : grainMajority));

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
    // §3.3a step 2b: carried through from the shaper, which read the declared
    // tags. Null is a valid outcome and means "not enterable by volume".
    bulk_class: raw.bulk_class ?? null,
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

  /**
   * Refusal order, v2.0: BASIS FIRST.
   *
   * Previously grain majority was checked first, so a record failing both
   * reported GRAIN_MAJORITY_UNKNOWN. That now matters: the grain copy (§13.5)
   * says "Everything else is filled in", and §8.5 forbids prefill when the
   * basis refused — so the same record would show that sentence over an empty
   * form (AV-32). The basis is the more fundamental failure, and the one the
   * no-prefill rule keys on, so it is reported first.
   */
  if (basisWouldNotResolve(record)) {
    return refuse(
      SOURCE_REJECT.BASIS_UNRESOLVED,
      'nutrition_data_per absent or unparseable serving_size; per_100g is never a fallback (§3.3c rule 4)'
    );
  }

  // §3.1 — the basis resolved, so a grain refusal can carry the label forward.
  if (grainMajority === 'unknown') {
    return refuse(
      SOURCE_REJECT.GRAIN_MAJORITY_UNKNOWN,
      'both whole and refined grain listed with no declared mass ordering (§3.1)',
      prefillFromRefusal({ record, reason: SOURCE_REJECT.GRAIN_MAJORITY_UNKNOWN, raw, isLiquid })
    );
  }

  // §3.3a step 3 — a liquid with no density class. The volume is declared;
  // the density is what the user supplies.
  if (isLiquid && (densityClass === null || DENSITY_MAP[densityClass] === undefined)) {
    return refuse(
      SOURCE_REJECT.DENSITY_UNRESOLVED,
      'liquid product with no resolvable density class; never assumed 1.00 (§3.3a step 3)',
      prefillFromRefusal({ record, reason: SOURCE_REJECT.DENSITY_UNRESOLVED, raw, isLiquid })
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

  // Built in full before the dataset check, so an ineligible dataset can carry
  // its declared values into the manual form (§8.5, v2.0).
  const result = {
    resolved: true,
    record: {
      name: raw.description,
      product_id: `usda:${raw.fdcId}`,
      source: 'USDA',
      density_class: raw.density_class ?? null,
      bulk_class: raw.bulk_class ?? null,
      // §3.3a step 1, from USDA's declared foodPortions. This is the only route
      // by which a USDA product is enterable by volume: USDA carries no
      // categories_tags, so steps 2 and 2b cannot key on it.
      ...(raw.derived_density ? { derived_density: raw.derived_density } : {}),
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

  /**
   * §8.2. A USDA basis is always per 100 g, so it always resolves, and an
   * ineligible dataset may prefill. NOTE: search never returns Branded — it is
   * filtered to Foundation and SR Legacy at the request (§8.2) — so from the
   * shell this path is unreachable today. It is implemented because §8.5 names
   * it, and tested because unreachable code that is wrong is still wrong.
   */
  if (!USDA_ELIGIBLE_DATASETS.includes(raw.dataType)) {
    return refuse(
      SOURCE_REJECT.DATASET_NOT_ELIGIBLE,
      `dataType "${raw.dataType}" is not eligible; Branded carries no NOVA field so P5 would be ` +
      'genuinely missing (§8.2)',
      prefillFromRefusal({ record: result.record, reason: SOURCE_REJECT.DATASET_NOT_ELIGIBLE })
    );
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * §8.1 — search result order and labelling
 * ------------------------------------------------------------------ */

/**
 * §8.1: USDA Foundation Foods and SR Legacy are listed BEFORE Open Food Facts.
 * Within each group the source's own order is kept.
 *
 * The order is fixed, not inferred from the query. For "coffee" the right
 * answer is almost always a generic whole food, and a rule that reordered on
 * what the query looked like would be a guess about what the user meant — the
 * same class of thing §8.3 keeps out of the scoring path.
 */
export function orderSearchResults({ usda = [], off = [] } = {}) {
  return [
    ...usda.map((raw) => ({ raw, source: 'USDA' })),
    ...off.map((raw) => ({ raw, source: 'OFF' })),
  ];
}

/**
 * §8.1: every result shows its source, its brand where one exists, and its
 * energy per 100 g or 100 ml — enough to tell a plain brewed coffee from a
 * flavoured bottled drink at a glance.
 *
 * Returns [name, detail]. `detail` is never empty: the source is always known,
 * so a result can never render as a bare name with nothing to choose on, which
 * is the state §8.1 exists to end.
 */
export function searchResultLabel({ raw, source }) {
  if (source === 'USDA') {
    const name = raw.description || '(no name)';
    const kcal = raw.nutrients?.energy_kcal;
    const parts = [`USDA ${raw.dataType}`];
    if (Number.isFinite(kcal)) parts.push(`${Math.round(kcal)} kcal/100 g`);
    return [name, parts.join(' · ')];
  }
  const name = raw.product_name || '(no name)';
  const kcal = raw.nutriments?.energy_kcal;
  const parts = ['Open Food Facts'];
  if (raw.brands) parts.push(String(raw.brands).split(',')[0].trim());
  if (Number.isFinite(kcal)) {
    parts.push(`${Math.round(kcal)} kcal/100 ${raw.nutrition_data_per === '100ml' ? 'ml' : 'g'}`);
  }
  return [name, parts.join(' · ')];
}
