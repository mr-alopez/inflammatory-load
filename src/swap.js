/**
 * Swap engine — spec v1.4 §7. The last unbuilt section.
 *
 * §7.0: this module MAY import the scoring module. It is not rendering — it is
 * computation on explicit user request (§7.1), producing a candidate that has
 * never been logged and therefore has no stored score. The display module still
 * may not import scoring, and no `render*` function may score. §6.5's swap line
 * renders what this computes; it does not compute.
 *
 * In practice this module does not need `scoreEntry` at all: §7.2's rescaling
 * rule works from stored data by mass ratio, which is basis-independent. The
 * permission stands regardless — it is about where the boundary lies, not about
 * whether this file happens to use it today.
 */

import { ATTRIBUTES, ATTRIBUTE_ORDER, NUTRIENT_ATTRIBUTES } from './coefficients.js';

export const SWAP = {
  SUGGESTION: 'SUGGESTION',
  SOURCE_INELIGIBLE: 'SOURCE_INELIGIBLE',   // §7.3 case 1
  CORPUS_EMPTY: 'CORPUS_EMPTY',             // §7.3 case 2
  BELOW_THRESHOLD: 'BELOW_THRESHOLD',       // §7.3 case 3
};

/** §7.3 delta threshold. A marginal swap is never returned to fill the slot. */
export const DELTA_THRESHOLD = 2.0;

/* ------------------------------------------------------------------ *
 * §7.2 — REFERENCE_MASS
 * ------------------------------------------------------------------ */

/**
 * Median `quantity_g` across a product's stored entries. With an EVEN count,
 * the LOWER of the two middle values — not the average, not the upper — so the
 * result is deterministic (AV-23).
 */
export function medianQuantityG(quantities) {
  const sorted = [...quantities].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor((sorted.length - 1) / 2);   // lower middle when even
  return sorted[mid];
}

/* ------------------------------------------------------------------ *
 * §7.2 — corpus
 * ------------------------------------------------------------------ */

const isRescalable = (e) =>
  e.source_basis !== 'NOT_APPLICABLE'         // quantity_g is null; cannot rescale
  && Number.isFinite(e.quantity_g)
  && e.quantity_g > 0
  && !!e.contributions;                        // SCHEMA-3; a legacy entry cannot rescale

/**
 * §7.2: candidates are drawn from the user's own data only.
 *
 *   1. Distinct products appearing in two or more stored entries.
 *   2. Saved products carrying a user category override.
 *
 * Excluded: UNCATEGORIZED, NOT_APPLICABLE, and the source entry's own product.
 */
export function buildCorpus(entries, savedProducts = [], { excludeProductId, category } = {}) {
  const byProduct = new Map();
  for (const e of entries) {
    if (!isRescalable(e)) continue;
    if (e.occasion_category === 'UNCATEGORIZED') continue;
    if (category && e.occasion_category !== category) continue;
    if (excludeProductId && e.product_id === excludeProductId) continue;
    if (!byProduct.has(e.product_id)) byProduct.set(e.product_id, []);
    byProduct.get(e.product_id).push(e);
  }

  const corpus = [];
  for (const [productId, its] of byProduct) {
    if (its.length < 2) continue;                       // §7.2 rule 1
    corpus.push({
      product_id: productId,
      food_name: its[its.length - 1].food_name,
      occasion_category: its[0].occasion_category,
      reference_mass: medianQuantityG(its.map((e) => e.quantity_g)),
      exemplar: its[its.length - 1],                    // any entry rescales identically
      entry_count: its.length,
      origin: 'LOGGED',
    });
  }

  // §7.2 rule 2 — saved products with a user category override.
  for (const s of savedProducts) {
    if (s.occasion_category === 'UNCATEGORIZED') continue;
    if (category && s.occasion_category !== category) continue;
    if (excludeProductId && s.saved_id === excludeProductId) continue;
    if (byProduct.has(s.saved_id)) continue;            // already covered by rule 1
    const mass = s.record?.manual?.serving_mass_g;
    if (!Number.isFinite(mass) || mass <= 0) continue;
    corpus.push({
      product_id: s.saved_id,
      food_name: s.name,
      occasion_category: s.occasion_category,
      reference_mass: mass,
      savedRecord: s.record,
      entry_count: 0,
      origin: 'SAVED',
    });
  }
  return corpus;
}

/* ------------------------------------------------------------------ *
 * §7.2 — rescaling a candidate
 * ------------------------------------------------------------------ */

/**
 * Score a candidate at REFERENCE_MASS from its own stored entry data. The
 * source record is not re-fetched and §3.3c is not re-run.
 *
 *   per_gram        = as_consumed / quantity_g
 *   value_at_ref    = per_gram × REFERENCE_MASS
 *   servings_at_ref = servings_logged × (REFERENCE_MASS / quantity_g)
 *
 * `P3` rescales the same way. Units are computed from volume (§3.6), but volume
 * is quantity_g / density and density is constant for a given product, so units
 * are linear in mass. No volume is stored and none is needed.
 */
export function rescaleEntry(entry, referenceMass) {
  const ratio = referenceMass / entry.quantity_g;

  const as_consumed = {};
  for (const id of NUTRIENT_ATTRIBUTES) {
    const field = ATTRIBUTES[id].field;
    const v = entry.as_consumed?.[field];
    as_consumed[field] = v === null || v === undefined ? null : v * ratio;
  }

  const classification_set = {};
  for (const [id, counts] of Object.entries(entry.classification_set ?? {})) {
    classification_set[id] = id === 'P3'
      ? { units: counts.units * ratio }
      : { servings: counts.servings * ratio };
  }

  // Contributions are linear in their counts, so they scale by the same ratio.
  const contributions = {};
  for (const [id, v] of Object.entries(entry.contributions ?? {})) {
    contributions[id] = v * ratio;
  }
  const score = ATTRIBUTE_ORDER.reduce((a, id) => a + (contributions[id] ?? 0), 0);

  return {
    food_name: entry.food_name,
    product_id: entry.product_id,
    quantity_g: referenceMass,
    sugar_field_used: entry.sugar_field_used ?? null,
    as_consumed,
    classification_set,
    contributions,
    score,
  };
}

/* ------------------------------------------------------------------ *
 * §6.5 — delta drivers
 * ------------------------------------------------------------------ */

/**
 * §6.5: `delta_driver_out` is the pro-inflammatory attribute with the largest
 * REDUCTION between source and candidate; `delta_driver_in` the
 * anti-inflammatory attribute with the largest GAIN. Both by CHANGE, never by
 * absolute magnitude in either entry — the line describes what the swap does,
 * not what the candidate is.
 */
export function deltaDrivers(source, candidate) {
  let out = null, into = null;
  for (const id of ATTRIBUTE_ORDER) {
    const s = source.contributions?.[id] ?? 0;
    const c = candidate.contributions?.[id] ?? 0;
    const pro = ATTRIBUTES[id].coeff > 0;
    if (pro) {
      const reduction = s - c;                       // positive when the swap reduces it
      if (reduction > 0 && (!out || reduction > out.change)) out = { id, change: reduction };
    } else {
      const gain = Math.abs(c) - Math.abs(s);        // positive when the swap gains it
      if (gain > 0 && (!into || gain > into.change)) into = { id, change: gain };
    }
  }
  return { out, into };
}

/* ------------------------------------------------------------------ *
 * §7 — the request
 * ------------------------------------------------------------------ */

/**
 * §7.1: computed on explicit request, never stored (§8.4). §7.3's suppression
 * cases are evaluated IN ORDER — most-specific cause first — so the message
 * names why this request failed rather than a downstream consequence of it.
 */
export function requestSwap(sourceEntry, entries, savedProducts = []) {
  // §7.3 case 1 — source ineligible.
  if (sourceEntry.occasion_category === 'UNCATEGORIZED'
      || sourceEntry.source_basis === 'NOT_APPLICABLE') {
    return { status: SWAP.SOURCE_INELIGIBLE };
  }

  const corpus = buildCorpus(entries, savedProducts, {
    excludeProductId: sourceEntry.product_id,
    category: sourceEntry.occasion_category,
  });

  // §7.3 case 2 — corpus empty. Distinct from case 3: nothing to compare
  // against, rather than a comparison that found nothing better.
  if (corpus.length === 0) return { status: SWAP.CORPUS_EMPTY };

  const ranked = corpus
    .map((c) => {
      const scored = c.origin === 'LOGGED'
        ? rescaleEntry(c.exemplar, c.reference_mass)
        : null;
      return scored ? { ...c, scored, delta: sourceEntry.score - scored.score } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.delta - a.delta);               // §7.2: descending, top 1

  if (ranked.length === 0) return { status: SWAP.CORPUS_EMPTY };

  const best = ranked[0];
  // §7.3 case 3 — candidates exist but none clears the threshold.
  if (best.delta < DELTA_THRESHOLD) return { status: SWAP.BELOW_THRESHOLD };

  return {
    status: SWAP.SUGGESTION,
    candidate: best.scored,
    reference_mass: best.reference_mass,
    delta: best.delta,
    drivers: deltaDrivers(sourceEntry, best.scored),
  };
}
