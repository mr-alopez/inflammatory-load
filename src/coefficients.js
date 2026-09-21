/**
 * COEFF-1 / DMAP-1 — static data from spec v0.5 §2.1, §2.2, §3.3, §3.3a.
 * Data only. No logic, no I/O.
 */

export const COEFF_VERSION = 'COEFF-1';

/** §2.1 / §2.2. `per` is the denominator of the coefficient unit. */
export const ATTRIBUTES = {
  // --- nutrient-sourced (§2.3) ---
  P1: { kind: 'nutrient', field: 'added_sugar_g', per: 10, coeff: +1.0, name: 'Added sugar' , displayName: "added sugar"},
  P2: { kind: 'nutrient', field: 'sodium_mg', per: 500, coeff: +0.5, name: 'Sodium' , displayName: "sodium"},
  P8: { kind: 'nutrient', field: 'saturated_fat_g', per: 5, coeff: +0.5, name: 'Saturated fat' , displayName: "saturated fat"},
  A1: { kind: 'nutrient', field: 'fiber_g', per: 5, coeff: -1.0, name: 'Fiber' , displayName: "fiber"},

  // --- classification-sourced (§2.3) ---
  P3: { kind: 'alcohol', coeff: +2.0, name: 'Alcohol' , displayName: "alcohol"},
  P4: { kind: 'classification', servingMassG: 30, coeff: +1.0, name: 'Refined grain' , displayName: "refined grain"},
  // P5's serving mass is per-product (§3.3): labeled serving, else 100 g.
  P5: { kind: 'classification', servingMassG: null, coeff: +1.5, name: 'Ultra-processed (NOVA 4)' , displayName: "ultra-processed"},
  P6: { kind: 'classification', servingMassG: 50, coeff: +2.0, name: 'Processed meat' , displayName: "processed meat"},
  P7: { kind: 'classification', servingMassG: 100, coeff: +1.5, name: 'Deep-fried preparation' , displayName: "deep-fried"},
  A2: { kind: 'classification', servingMassG: 100, coeff: -3.0, name: 'Omega-3 fish' , displayName: "omega-3 fish"},
  A3: { kind: 'classification', servingMassG: 80, coeff: -1.5, name: 'Non-starchy vegetable' , displayName: "non-starchy vegetable"},
  A4: { kind: 'classification', servingMassG: 120, coeff: -1.0, name: 'Fruit (whole)' , displayName: "fruit"},
  A5: { kind: 'classification', servingMassG: 30, coeff: -1.5, name: 'Nuts / seeds' , displayName: "nuts"},
  A6: { kind: 'classification', servingMassG: 90, coeff: -1.5, name: 'Legumes' , displayName: "legumes"},
  A7: { kind: 'classification', servingMassG: 30, coeff: -1.0, name: 'Whole grain' , displayName: "whole grain"},
  A8: { kind: 'classification', servingMassG: 14, coeff: -0.5, name: 'Olive oil' , displayName: "olive oil"},
};

/** §2 table order — drives §5.2 tie-breaks and §6.4 listing order. */
export const ATTRIBUTE_ORDER = [
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8',
  'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8',
];

export const NUTRIENT_ATTRIBUTES = ['P1', 'P2', 'P8', 'A1'];

/** §2.5 — recorded, never scored. */
export const MACRO_FIELDS = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g'];

/**
 * §3.3a step 2. Densities and the tag-to-class mapping live in
 * data/density-map.json (DMAP-2, J6) and are re-exported here so existing
 * importers do not move.
 */
export { DENSITY_MAP, DMAP_VERSION, classifyLiquid, isJuiceClassified } from './density-map.js';

/** §3.6 — 1 unit = 14 g ethanol; ethanol density 0.789 g/ml. */
export const ETHANOL_DENSITY = 0.789;
export const ETHANOL_G_PER_UNIT = 14;

/** §3.6 fallback when ABV is unavailable. fl oz → units. */
export const ALCOHOL_FALLBACK_UNITS = {
  beer: { fl_oz: 12, units: 1.0 },
  wine: { fl_oz: 5, units: 1.0 },
  spirits: { fl_oz: 1.5, units: 1.0 },
};

/** §3.3 — P5 serving mass when the product carries no labeled serving. */
export const P5_UNLABELED_SERVING_MASS_G = 100;
export const P5_UNLABELED_SERVING_VOLUME_ML = 100;

export const VOLUME_UNITS = ['ml', 'l', 'cl', 'fl oz'];
export const MASS_UNITS = ['g', 'kg', 'mg', 'oz', 'lb'];
