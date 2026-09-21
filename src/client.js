/**
 * Source clients — §8.1 Open Food Facts, §8.2 USDA FoodData Central.
 *
 * Network only. These fetch and shape; they never classify, never infer, and
 * never decide whether a record resolves — that is §3.3c and src/sources.js.
 *
 * Every failure here returns a reason, never throws past the caller: §13.2
 * requires every failure to resolve to offer manual entry rather than
 * dead-ending, and an exception escaping this layer would dead-end.
 */

import { classifyLiquid, isJuiceClassified } from './density-map.js';

export const LOOKUP = {
  OK: 'OK',
  NOT_FOUND: 'NOT_FOUND',
  OFFLINE: 'OFFLINE',
  NO_API_KEY: 'NO_API_KEY',
  ERROR: 'ERROR',
};

const OFF_BASE = 'https://world.openfoodfacts.org/api/v2';          // barcode lookup (§8.1)
const OFF_V1_SEARCH = 'https://world.openfoodfacts.org/cgi/search.pl';  // text search (§8.1)
const OFF_COUNTRY = 'United States';                                // text search only (§8.1)
const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

/** §8.2: Foundation Foods and SR Legacy only. Branded is not an eligible source. */
const USDA_ELIGIBLE = 'Foundation,SR%20Legacy';

const OFF_FIELDS = [
  'code', 'product_name', 'quantity', 'serving_size', 'nutrition_data_per',
  'nova_group', 'nutriments', 'categories_tags', 'ingredients',
].join(',');

async function getJson(url) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: LOOKUP.OFFLINE };
  }
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 404) return { status: LOOKUP.NOT_FOUND };
    if (!res.ok) return { status: LOOKUP.ERROR, detail: `HTTP ${res.status}` };
    return { status: LOOKUP.OK, body: await res.json() };
  } catch (e) {
    // A failed fetch offline is indistinguishable from a failed fetch online.
    // Both land the user in manual entry, so the distinction does not matter.
    return { status: LOOKUP.OFFLINE, detail: String(e.message ?? e) };
  }
}

/* ------------------------------------------------------------------ *
 * §8.1 — Open Food Facts
 * ------------------------------------------------------------------ */

/** Shape an OFF product into the raw record src/sources.js expects. */
export function shapeOFF(p) {
  const n = p.nutriments ?? {};
  const tags = p.categories_tags ?? [];

  return {
    code: p.code,
    product_name: p.product_name,
    nutrition_data_per: p.nutrition_data_per ?? null,
    quantity: p.quantity ?? null,
    serving_size: p.serving_size ?? null,
    nova_group: p.nova_group ?? null,
    ingredients: p.ingredients ?? [],
    categories_tags: tags,
    // DMAP-2 (J6): both lookups read declared tags via the versioned data file.
    density_class: classifyLiquid(tags),
    juice_classified: isJuiceClassified(tags),
    nutriments: {
      sugars_added_g: n['added-sugars_100g'] ?? n['added-sugars'] ?? undefined,
      sugars_total_g: n.sugars_100g ?? n.sugars ?? undefined,
      sodium_mg: n.sodium_100g !== undefined ? n.sodium_100g * 1000 : undefined,
      saturated_fat_g: n['saturated-fat_100g'] ?? undefined,
      fiber_g: n.fiber_100g ?? undefined,
      energy_kcal: n['energy-kcal_100g'] ?? undefined,
      proteins_g: n.proteins_100g ?? undefined,
      carbohydrates_g: n.carbohydrates_100g ?? undefined,
      fat_g: n.fat_100g ?? undefined,
    },
  };
}

export async function lookupBarcode(barcode) {
  const r = await getJson(`${OFF_BASE}/product/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`);
  if (r.status !== LOOKUP.OK) return r;
  if (r.body?.status === 0 || !r.body?.product) return { status: LOOKUP.NOT_FOUND };
  return { status: LOOKUP.OK, raw: shapeOFF(r.body.product), source: 'OFF' };
}

/**
 * §8.1 text search — the v1 endpoint, NOT v2.
 *
 * v2 supports structured filters only. It does not reject an unsupported text
 * parameter; it ignores it and returns an unfiltered global result set. Measured
 * against the live service: `q=cheerios`, `q=banana` and `q=xyzzyqwerty` all
 * returned the identical count of 4,762,840 and the identical top three products
 * — which is how a search for cereal returned Moroccan mineral water.
 *
 * v1 honours the query AND returns the full product record: `nutriments`,
 * `nutrition_data_per`, `quantity`, `nova_group`, `ingredients`. Search-a-licious
 * honours the query but returns only an index document, so every result would
 * need a second lookup and would still often arrive without nutriments.
 *
 * `countries_tags_en` filters to US products. Text search only — a scanned
 * barcode resolves regardless of country, because the product is in the hand.
 */
export async function searchOFF(query, limit = 10) {
  const url = `${OFF_V1_SEARCH}?search_terms=${encodeURIComponent(query)}`
    + '&search_simple=1&action=process&json=1'
    + `&page_size=${limit}&countries_tags_en=${encodeURIComponent(OFF_COUNTRY)}`;
  const r = await getJson(url);
  if (r.status !== LOOKUP.OK) return r;
  const products = r.body?.products ?? [];
  if (products.length === 0) return { status: LOOKUP.NOT_FOUND };
  return { status: LOOKUP.OK, results: products.map(shapeOFF), source: 'OFF' };
}

/* ------------------------------------------------------------------ *
 * §8.2 — USDA FoodData Central
 * ------------------------------------------------------------------ */

export async function searchUSDA(query, apiKey, limit = 10) {
  if (!apiKey) return { status: LOOKUP.NO_API_KEY };
  const url = `${USDA_BASE}/foods/search?api_key=${encodeURIComponent(apiKey)}`
    + `&dataType=${USDA_ELIGIBLE}&pageSize=${limit}&query=${encodeURIComponent(query)}`;
  const r = await getJson(url);
  if (r.status !== LOOKUP.OK) return r;
  const foods = r.body?.foods ?? [];
  if (foods.length === 0) return { status: LOOKUP.NOT_FOUND };
  return { status: LOOKUP.OK, results: foods.map(shapeUSDA), source: 'USDA' };
}

const USDA_NUTRIENT = {
  1008: 'energy_kcal', 1003: 'protein_g', 1005: 'carbohydrate_g', 1004: 'fat_g',
  1258: 'saturated_fat_g', 1079: 'fiber_g', 1093: 'sodium_mg', 1235: 'added_sugar_g',
};

export function shapeUSDA(f) {
  const nutrients = {};
  for (const n of f.foodNutrients ?? []) {
    const key = USDA_NUTRIENT[n.nutrientId ?? n.nutrient?.id];
    if (key) nutrients[key] = n.value ?? n.amount;
  }
  return {
    fdcId: f.fdcId,
    dataType: f.dataType,
    description: f.description,
    density_class: null,
    grain_majority: null,
    classifications: {},
    nutrients,
  };
}
