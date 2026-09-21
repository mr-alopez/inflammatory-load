/**
 * Scoring core — spec v0.5 §11 step 1.
 *
 * Scope: §3.3c → §3.3a → §3.3b → §3.3, plus §3.1 suppression and §3.6 with its
 * scoped exemption. Pure: no I/O, no globals, no framework, no LLM (§8.3).
 *
 * Everything is computed at full precision. Nothing is rounded (§1.3).
 * Display, storage, banding, trend, normalization, and the swap engine are out
 * of scope and deliberately absent.
 */

import {
  ATTRIBUTES,
  ATTRIBUTE_ORDER,
  NUTRIENT_ATTRIBUTES,
  MACRO_FIELDS,
  DENSITY_MAP,
  ETHANOL_DENSITY,
  ETHANOL_G_PER_UNIT,
  P5_UNLABELED_SERVING_MASS_G,
  P5_UNLABELED_SERVING_VOLUME_ML,
  VOLUME_UNITS,
  COEFF_VERSION,
} from './coefficients.js';

/** Non-creation reasons. An entry is refused, never scored around (§2.3). */
export const REJECT = {
  BASIS_UNRESOLVED: 'BASIS_UNRESOLVED',            // §3.3c rule 4
  DENSITY_UNRESOLVED: 'DENSITY_UNRESOLVED',        // §3.3a step 3
  GRAIN_MAJORITY_UNKNOWN: 'GRAIN_MAJORITY_UNKNOWN',// §3.1
  P3_REQUIRES_VOLUME: 'P3_REQUIRES_VOLUME',        // §8.5 exception for P3
  P4_A7_BOTH_ASSERTED: 'P4_A7_BOTH_ASSERTED',      // §3.1 mutual exclusion
};

const rejected = (reason, detail) => ({ created: false, reason, detail });

const isVolumeUnit = (u) => VOLUME_UNITS.includes(u);

/** Normalize a declared volume to millilitres. Declared units only — no guessing. */
function toMl(value, unit) {
  switch (unit) {
    case 'ml': return value;
    case 'cl': return value * 10;
    case 'l': return value * 1000;
    case 'fl oz': return value * 29.5735295625;
    default: return null;
  }
}

/* ------------------------------------------------------------------ *
 * §3.3c — Source basis resolution
 * ------------------------------------------------------------------ */

export function resolveBasis(record) {
  // §3.3c MANUAL exception (B4): an entry with nothing to scale resolves
  // without a basis. Set by src/manual.js, never by a source record.
  if (record.basis_override === 'NOT_APPLICABLE') {
    return { basis: 'NOT_APPLICABLE', provenance: 'DECLARED' };
  }
  switch (record.source) {
    case 'USDA':
      // Foundation Foods / SR Legacy declare a fixed 100 g basis (§8.2).
      return { basis: 'per_100g', provenance: 'DECLARED' };

    case 'MANUAL':
    case 'SAVED':
      // §3.3c MANUAL / SAVED: always per_serving.
      return { basis: 'per_serving', provenance: 'DECLARED' };

    case 'OFF': {
      const off = record.off || {};
      const per = off.nutrition_data_per;
      const servingSize = off.serving_size;
      const pkg = off.quantity;

      // Rule 1
      if (per === 'serving' && servingSize && Number.isFinite(servingSize.value)) {
        const parseable = servingSize.unit === 'g' || isVolumeUnit(servingSize.unit);
        if (parseable) return { basis: 'per_serving', provenance: 'DECLARED' };
      }
      // Rule 2 — derives, does not read (§3.3c).
      if (per === '100g' && pkg && isVolumeUnit(pkg.unit)) {
        return { basis: 'per_100ml', provenance: 'DERIVED_RULE_2' };
      }
      // Rule 3
      if (per === '100g' && pkg && !isVolumeUnit(pkg.unit)) {
        return { basis: 'per_100g', provenance: 'DECLARED' };
      }
      // Rule 4 — does not resolve. per_100g is never a fallback.
      return { basis: null, provenance: null };
    }

    default:
      return { basis: null, provenance: null };
  }
}

/* ------------------------------------------------------------------ *
 * §3.3a — Volume to mass conversion
 * ------------------------------------------------------------------ */

export function resolveDensity(record) {
  // 1. Per-product derivation, preferred whenever available.
  const d = record.derived_density;
  if (d && Number.isFinite(d.mass_g) && Number.isFinite(d.volume_ml) && d.volume_ml > 0) {
    return { density: d.mass_g / d.volume_ml, provenance: 'DERIVED' };
  }
  // A manual entry supplies its own density directly (§8.5).
  if ((record.source === 'MANUAL' || record.source === 'SAVED')
      && Number.isFinite(record.manual?.density_g_per_ml)) {
    return { density: record.manual.density_g_per_ml, provenance: 'MANUAL' };
  }
  // 2. DMAP-1, keyed on the record's own declared liquid class.
  if (record.density_class && DENSITY_MAP[record.density_class] !== undefined) {
    return { density: DENSITY_MAP[record.density_class], provenance: 'DMAP-1' };
  }
  // 3. Does not resolve. Density is never assumed to be 1.00.
  return { density: null, provenance: null };
}

/* ------------------------------------------------------------------ *
 * §3.3b — Nutrient scaling
 * ------------------------------------------------------------------ */

/**
 * Normalize one reported value to a per-gram basis.
 *
 *   per_100g:    reported / 100
 *   per_100ml:   reported / 100 / density
 *   per_serving: reported / serving_mass_g
 *
 * For a liquid entered in ml against a per_100ml record, density cancels
 * exactly against §3.3a's quantity conversion. Derivation in README.md.
 */
function perGram(reported, basis, { density, servingMassG }) {
  switch (basis) {
    case 'per_100g': return reported / 100;
    case 'per_100ml': return reported / 100 / density;
    case 'per_serving': return reported / servingMassG;
    default: throw new Error(`unknown basis: ${basis}`);
  }
}

/* ------------------------------------------------------------------ *
 * §3.6 — Alcohol
 * ------------------------------------------------------------------ */

/** P3 consumes the ENTERED VOLUME directly. It never passes through quantity_g. */
export function alcoholUnits({ volume_ml, abv_percent }) {
  const ethanol_g = volume_ml * (abv_percent / 100) * ETHANOL_DENSITY;
  return { ethanol_g, units: ethanol_g / ETHANOL_G_PER_UNIT };
}

/* ------------------------------------------------------------------ *
 * Main entry point
 * ------------------------------------------------------------------ */

/**
 * @param {object} record  source record (see test/fixtures.js for the shape)
 * @param {{value:number, unit:'g'|'ml'}} quantity  as entered
 * @returns {object} either {created:false, reason} or the full scored result
 */
export function scoreEntry(record, quantity) {
  const cls = record.classifications || {};

  /* --- §3.1 mutual exclusion and non-resolving classification, checked first --- */
  if (cls.P4 && cls.A7) {
    return rejected(REJECT.P4_A7_BOTH_ASSERTED, 'P4 and A7 are mutually exclusive (§3.1)');
  }
  if (record.grain_majority === 'unknown') {
    return rejected(
      REJECT.GRAIN_MAJORITY_UNKNOWN,
      'majority grain mass not determinable; falls to MANUAL (§3.1)'
    );
  }

  /* --- §8.5 exception for P3: a volume is mandatory --- */
  const p3 = cls.P3 || null;
  let p3VolumeMl = null;
  if (p3) {
    if (quantity.unit === 'ml') {
      p3VolumeMl = quantity.value;
    } else if (Number.isFinite(p3.volume_ml)) {
      p3VolumeMl = p3.volume_ml;
    }
    if (p3VolumeMl === null) {
      return rejected(
        REJECT.P3_REQUIRES_VOLUME,
        'P3 asserted without a volume; §3.6 cannot compute ethanol from mass alone (§8.5)'
      );
    }
    if (!Number.isFinite(p3.abv_percent) && !Number.isFinite(p3.fallback_units)) {
      return rejected(
        REJECT.P3_REQUIRES_VOLUME,
        'P3 asserted without ABV or a §3.6 fallback container size (§8.5)'
      );
    }
  }

  /* --- Pipeline step 1: §3.3c --- */
  const { basis, provenance: basisProvenance } = resolveBasis(record);
  if (basis === null) {
    return rejected(
      REJECT.BASIS_UNRESOLVED,
      'source basis does not resolve; per_100g is never a fallback (§3.3c rule 4)'
    );
  }

  /* --- Pipeline step 2: §3.3a --- */
  const servingStatedInVolume = !!(record.off?.serving_size && isVolumeUnit(record.off.serving_size.unit));
  // A NOT_APPLICABLE entry scales nothing; it needs a density only if it still
  // carries a serving-based attribute (§3.3c exception, §3.3).
  const hasServingAttr = Object.keys(cls).some((id) => id !== 'P3' && cls[id]);
  const nothingToScale = basis === 'NOT_APPLICABLE' && !hasServingAttr;
  const needsDensity = nothingToScale ? false :
    quantity.unit === 'ml' ||
    basis === 'per_100ml' ||
    (basis === 'per_serving' && servingStatedInVolume) ||
    (cls.P5 && !record.labeled_serving && quantity.unit === 'ml');

  let density = null;
  let densityProvenance = null;
  if (needsDensity) {
    ({ density, provenance: densityProvenance } = resolveDensity(record));
    if (density === null) {
      return rejected(
        REJECT.DENSITY_UNRESOLVED,
        'liquid density does not resolve; never assumed to be 1.00 (§3.3a step 3)'
      );
    }
  }

  const quantity_g = nothingToScale
    ? null
    : (quantity.unit === 'ml' ? quantity.value * density : quantity.value);

  /* --- serving_mass_g for a per_serving basis (§3.3b) --- */
  let basisServingMassG = null;
  if (basis === 'per_serving') {
    if (record.source === 'MANUAL' || record.source === 'SAVED') {
      basisServingMassG = record.manual?.serving_mass_g;
    } else {
      const ss = record.off.serving_size;
      basisServingMassG = isVolumeUnit(ss.unit) ? toMl(ss.value, ss.unit) * density : ss.value;
    }
    if (!Number.isFinite(basisServingMassG) || basisServingMassG <= 0) {
      return rejected(REJECT.BASIS_UNRESOLVED, 'per_serving basis without a usable serving mass');
    }
  }

  /* --- Pipeline step 3: §3.3b nutrient + macro scaling --- */
  const asConsumed = {};
  const incomplete = [];
  const scaleCtx = { density, servingMassG: basisServingMassG };

  for (const id of NUTRIENT_ATTRIBUTES) {
    const field = ATTRIBUTES[id].field;
    const reported = record.reported?.[field];
    if (nothingToScale) {
      // §3.3c (S4): a NOT_APPLICABLE entry has no nutrient or macro values to
      // lack, so it is never INCOMPLETE. Fully specified, not deficient.
      asConsumed[field] = null;
    } else if (reported === null || reported === undefined) {
      asConsumed[field] = null;
      incomplete.push(id);
    } else {
      asConsumed[field] = perGram(reported, basis, scaleCtx) * quantity_g;
    }
  }
  for (const field of MACRO_FIELDS) {
    const reported = record.reported?.[field];
    if (nothingToScale) {
      asConsumed[field] = null;                       // §3.3c (S4), as above
    } else if (reported === null || reported === undefined) {
      asConsumed[field] = null;
      incomplete.push(field);
    } else {
      asConsumed[field] = perGram(reported, basis, scaleCtx) * quantity_g;
    }
  }

  /* --- Pipeline step 4: §3.3 serving derivation --- */
  const servings = {};
  for (const id of ATTRIBUTE_ORDER) {
    const attr = ATTRIBUTES[id];
    if (attr.kind !== 'classification' || !cls[id]) continue;

    let servingMassG = attr.servingMassG;
    if (id === 'P5') {
      // §3.3: labeled package serving mass; if unlabeled, 100 g (liquids: 100 ml converted).
      if (record.labeled_serving) {
        const ls = record.labeled_serving;
        servingMassG = isVolumeUnit(ls.unit) ? toMl(ls.value, ls.unit) * density : ls.value;
      } else {
        servingMassG = quantity.unit === 'ml'
          ? P5_UNLABELED_SERVING_VOLUME_ML * density
          : P5_UNLABELED_SERVING_MASS_G;
      }
    }
    servings[id] = quantity_g / servingMassG;
  }

  /* --- contributions --- */
  const contributions = {};

  for (const id of NUTRIENT_ATTRIBUTES) {
    const attr = ATTRIBUTES[id];
    const v = asConsumed[attr.field];
    contributions[id] = v === null ? 0 : (v / attr.per) * attr.coeff;
  }

  if (p3) {
    const units = Number.isFinite(p3.abv_percent)
      ? alcoholUnits({ volume_ml: p3VolumeMl, abv_percent: p3.abv_percent }).units
      : p3.fallback_units;
    servings.P3 = units;
    contributions.P3 = units * ATTRIBUTES.P3.coeff;
  }

  for (const id of Object.keys(servings)) {
    if (id === 'P3') continue;
    contributions[id] = servings[id] * ATTRIBUTES[id].coeff;
  }

  // §3.1 — P3 suppresses P5, and only on its own entry.
  const p5Suppressed = !!p3 && !!cls.P5;
  if (p5Suppressed) contributions.P5 = 0;

  /* --- SCORE, summed at full precision (§1.3) --- */
  let score = 0;
  for (const id of ATTRIBUTE_ORDER) {
    if (contributions[id] !== undefined) score += contributions[id];
  }

  return {
    created: true,
    coeffVersion: COEFF_VERSION,
    basis,
    basisProvenance,
    density,
    densityProvenance,
    quantity_g,
    asConsumed,
    servings,
    contributions,
    p5Suppressed,
    incomplete,
    isIncomplete: incomplete.length > 0,
    score,
  };
}
