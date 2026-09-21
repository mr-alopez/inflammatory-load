/**
 * Manual entry and saved products — spec v0.7 §8.5 and §8.5a.
 *
 * §8.5 requires each nutrient and macro field to be supplied OR explicitly
 * marked absent, so ABSENT is a distinct sentinel: omitting a field is an input
 * error, marking it absent is a valid statement about the product.
 */

import { DENSITY_MAP } from './coefficients.js';
import { STORES } from './schema.js';

/** Explicit "the user asserts this value is unavailable" (§8.5). */
export const ABSENT = Symbol('ABSENT');

export const MANUAL_REJECT = {
  P3_REQUIRES_VOLUME: 'P3_REQUIRES_VOLUME',      // §8.5 exception for P3 (K2)
  FIELD_NOT_STATED: 'FIELD_NOT_STATED',          // supplied nor marked absent
  MASS_REQUIRED: 'MASS_REQUIRED',                // §8.5 serving or package mass
  DENSITY_REQUIRED: 'DENSITY_REQUIRED',          // liquid with volume but no density
  NOT_LOCAL: 'NOT_LOCAL',                        // §8.5a local-only violation
};

export class ManualRejection extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.code = code; this.detail = detail; }
}

/** Deep freeze — Object.freeze is shallow, and §8.5a needs the whole snapshot. */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  for (const k of Object.keys(value)) deepFreeze(value[k]);
  return Object.freeze(value);
}

const NUTRIENTS = ['added_sugar_g', 'sodium_mg', 'saturated_fat_g', 'fiber_g'];
const MACROS = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g'];

function readStated(bag, fields, label) {
  const out = {};
  for (const f of fields) {
    if (!(f in bag)) {
      throw new ManualRejection(
        MANUAL_REJECT.FIELD_NOT_STATED,
        `${label}.${f} must be supplied or explicitly marked ABSENT (§8.5)`
      );
    }
    out[f] = bag[f] === ABSENT ? null : bag[f];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * §8.5 — manual entry
 * ------------------------------------------------------------------ */

/**
 * @param input.name
 * @param input.nutrients    all four, value or ABSENT
 * @param input.macros       all four, value or ABSENT
 * @param input.classifications  which of P3–P7, A2–A8 apply
 * @param input.serving_mass_g   serving or package mass
 * @param input.volume_ml        for a liquid, instead of/alongside mass
 * @param input.density_g_per_ml required with volume when anything is scaled
 */
export function createManualRecord(input) {
  const classifications = { ...(input.classifications ?? {}) };
  const p3 = classifications.P3 ?? null;

  const reported = {
    ...readStated(input.nutrients ?? {}, NUTRIENTS, 'nutrients'),
    ...readStated(input.macros ?? {}, MACROS, 'macros'),
  };

  const anyValue = [...NUTRIENTS, ...MACROS].some((f) => reported[f] !== null);

  // §8.5 exception for P3: a volume is mandatory; the mass-directly branch is
  // unavailable, because §3.6 computes ethanol from volume and ABV.
  if (p3) {
    if (!Number.isFinite(input.volume_ml)) {
      throw new ManualRejection(
        MANUAL_REJECT.P3_REQUIRES_VOLUME,
        'P3 asserted without volume_ml; mass alone cannot recover ethanol (§8.5, §3.6)'
      );
    }
    if (!Number.isFinite(p3.abv_percent) && !Number.isFinite(p3.fallback_units)) {
      throw new ManualRejection(
        MANUAL_REJECT.P3_REQUIRES_VOLUME,
        'P3 asserted without ABV or a §3.6 fallback container size (§8.5)'
      );
    }
    if (anyValue && !Number.isFinite(input.density_g_per_ml)) {
      throw new ManualRejection(
        MANUAL_REJECT.DENSITY_REQUIRED,
        'P3 entry supplying nutrient or macro values needs a density so §3.3a can resolve quantity_g (§8.5)'
      );
    }
  }

  // §3.3c MANUAL exception — nothing to scale.
  const notApplicable = !anyValue;
  let servingMassG = null;
  if (!notApplicable) {
    servingMassG = Number.isFinite(input.serving_mass_g)
      ? input.serving_mass_g
      : (Number.isFinite(input.volume_ml) && Number.isFinite(input.density_g_per_ml)
        ? input.volume_ml * input.density_g_per_ml
        : null);
    if (servingMassG === null) {
      throw new ManualRejection(
        MANUAL_REJECT.MASS_REQUIRED,
        'a serving or package mass is required, or a volume plus a density (§8.5)'
      );
    }
  }

  return {
    name: input.name,
    product_id: input.product_id ?? `manual:${input.name}`,
    source: 'MANUAL',
    manual: {
      serving_mass_g: servingMassG,
      density_g_per_ml: Number.isFinite(input.density_g_per_ml) ? input.density_g_per_ml : null,
      volume_ml: Number.isFinite(input.volume_ml) ? input.volume_ml : null,
    },
    density_class: null,                 // §3.3a step 1/MANUAL, never DMAP-1 here
    labeled_serving: servingMassG === null ? null : { value: servingMassG, unit: 'g' },
    grain_majority: input.grain_majority ?? null,
    classifications,
    reported,
    // §3.3c MANUAL exception. Scoring reads this and skips §3.3b.
    basis_override: notApplicable ? 'NOT_APPLICABLE' : null,
    // §7.2a — a manual product has no source taxonomy to key on.
    occasion_category: input.occasion_category ?? 'UNCATEGORIZED',
    category_map_version: input.occasion_category ? 'USER_OVERRIDE' : 'CATMAP-1',
  };
}

/* ------------------------------------------------------------------ *
 * §8.5a — saved products (local only)
 * ------------------------------------------------------------------ */

/**
 * Explicit, user-initiated save. Nothing is saved automatically (§8.5a).
 */
export async function saveProduct(backend, manualRecord, { saved_id, name, occasion_category } = {}) {
  if (manualRecord.source !== 'MANUAL') {
    throw new ManualRejection(
      MANUAL_REJECT.NOT_LOCAL,
      `only a MANUAL record may be saved; got ${manualRecord.source} (§8.5a)`
    );
  }
  const saved = deepFreeze(structuredClone({
    saved_id: saved_id ?? `saved:${name ?? manualRecord.name}`,
    name: name ?? manualRecord.name,
    local_only: true,                                   // §8.5a
    occasion_category: occasion_category ?? manualRecord.occasion_category,
    category_map_version: occasion_category ? 'USER_OVERRIDE' : manualRecord.category_map_version,
    record: manualRecord,
  }));
  await backend.put(STORES.SAVED_PRODUCTS, saved.saved_id, saved);
  return saved;
}

/**
 * Logging from a saved product copies its field values into the entry as an
 * IMMUTABLE SNAPSHOT (§8.5a). Editing the saved product afterward does not
 * alter any entry already logged from it.
 */
export function recordFromSaved(savedProduct) {
  const snapshot = structuredClone(savedProduct.record);
  return deepFreeze({
    ...snapshot,
    source: 'SAVED',
    product_id: savedProduct.saved_id,
    occasion_category: savedProduct.occasion_category,
    category_map_version: savedProduct.category_map_version,
  });
}

/**
 * §8.5 / §8.5a: manual values are never promoted to a shared or cached product
 * record, and saved products are never uploaded, shared, or submitted to OFF.
 * The cache exists for resolved OFF/USDA records only; this is the guard.
 */
export async function promoteToProductCache(backend, record) {
  if (record.source === 'MANUAL' || record.source === 'SAVED') {
    throw new ManualRejection(
      MANUAL_REJECT.NOT_LOCAL,
      `${record.source} values are never promoted to a shared or cached product record (§8.5, §8.5a)`
    );
  }
  await backend.put(STORES.PRODUCT_CACHE, record.product_id, structuredClone(record));
  return true;
}

/** §8.5a — a saved product is swap-eligible only with a user category override. */
export function isSwapEligible(savedProduct) {
  return savedProduct.occasion_category !== 'UNCATEGORIZED';
}
