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
import { classifyBulk } from './bulk-density-map.js';

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
  'code', 'product_name', 'brands', 'quantity', 'serving_size', 'nutrition_data_per',
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

  /**
   * §3.3c rule 1 (v2.1): read the fields that belong to the declared basis.
   *
   * Open Food Facts publishes each nutrient twice — `_100g` (normalised) and
   * `_serving`. Until v2.1 this always read `_100g`, and rule 1 resolves a
   * `nutrition_data_per: "serving"` record as per_serving, so scoring then
   * divided per-100 g figures by the serving mass as if they were per serving:
   * a silent error of serving mass / 100, with no trace on the stored entry.
   * No live instance was found — OFF normalises nearly everything to 100g —
   * which is why it was fixed now: entries are immutable, so the first live
   * instance would have been unrepairable.
   *
   * A record whose serving does not parse refuses under rule 4 regardless, so
   * keying on `nutrition_data_per` alone is equivalent to keying on the basis.
   */
  const perServing = p.nutrition_data_per === 'serving';
  const f = (key) => n[`${key}${perServing ? '_serving' : '_100g'}`];

  return {
    code: p.code,
    product_name: p.product_name,
    brands: p.brands ?? null,          // §8.1 result labelling
    nutrition_data_per: p.nutrition_data_per ?? null,
    quantity: p.quantity ?? null,
    serving_size: p.serving_size ?? null,
    nova_group: p.nova_group ?? null,
    ingredients: p.ingredients ?? [],
    categories_tags: tags,
    // DMAP-2 (J6): both lookups read declared tags via the versioned data file.
    density_class: classifyLiquid(tags),
    // BDMAP-1 (§3.3a step 2b): resolved HERE for the same reason the liquid
    // class is — the declared tags are read once, at the source boundary, and
    // the record carries the resolved class. resolveFromOFF does not keep the
    // tags, so a later reader cannot re-derive it.
    bulk_class: classifyBulk(tags),
    juice_classified: isJuiceClassified(tags),
    // The bare keys (`added-sugars`, `sugars`) are the label's own figures, on
    // the declared basis, so they remain a valid fallback under either basis.
    nutriments: {
      sugars_added_g: f('added-sugars') ?? n['added-sugars'] ?? undefined,
      sugars_total_g: f('sugars') ?? n.sugars ?? undefined,
      sodium_mg: f('sodium') !== undefined ? f('sodium') * 1000 : undefined,
      saturated_fat_g: f('saturated-fat') ?? undefined,
      fiber_g: f('fiber') ?? undefined,
      energy_kcal: f('energy-kcal') ?? undefined,
      proteins_g: f('proteins') ?? undefined,
      carbohydrates_g: f('carbohydrates') ?? undefined,
      fat_g: f('fat') ?? undefined,
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

/**
 * §3.3a step 1 from USDA's own declared household measures.
 *
 * Foundation Foods and SR Legacy publish `foodPortions` — a gram weight paired
 * with a stated measure, e.g. 1 cup of brewed coffee = 237 g. That is exactly
 * what step 1 asks for: "a serving mass in grams and the same serving as a
 * volume". It is a DECLARED field, not the product name, so §8.3 is untouched
 * and no name matching is involved.
 *
 * This is what lets a USDA liquid or scoopable solid be entered by volume at
 * all. USDA records carry no `categories_tags`, so neither DMAP-2 (step 2) nor
 * BDMAP-1 (step 2b) can key on them — without step 1 a USDA product would be
 * gram-only. Reported, because the spec does not say where a USDA density comes
 * from; step 1 already covers it and USDA already supplies the data.
 */
const USDA_VOLUME_ML = { cup: 236.5882365, 'fl oz': 29.5735295625, tbsp: 14.78676478125,
  tsp: 4.92892159375, ml: 1, liter: 1000, l: 1000 };

/**
 * The unit may be in `measureUnit.name` OR in `modifier`, and SR Legacy is the
 * case that matters: it sets `measureUnit.name` to the literal string
 * "undetermined" and puts the real unit in `modifier`. "undetermined" is
 * truthy, so reading measureUnit first and falling back with `??` never falls
 * back — brewed coffee returned `{measureUnit: "undetermined", modifier: "cup",
 * gramWeight: 248}` and derived nothing.
 *
 * Both fields are tried against the unit table instead. §2.5: a fixture written
 * from the shape I expected passed while the shape the service returns did not.
 */
function portionMl(p) {
  for (const raw of [p.measureUnit?.name, p.modifier]) {
    if (!raw) continue;
    // A parenthetical is a gloss, not the measure: "cup (8 fl oz)" is one cup.
    // Matching inside it would read this as a fluid ounce and be 8x wrong.
    const text = String(raw).toLowerCase().replace(/\([^)]*\)/g, ' ').trim();
    if (USDA_VOLUME_ML[text] !== undefined) return USDA_VOLUME_ML[text];
    // "1 cup", "fl oz" — the first unit word present, longest name first so
    // "fl oz" is not read as the "oz" inside it.
    const word = Object.keys(USDA_VOLUME_ML)
      .sort((a, b) => b.length - a.length)
      .find((u) => new RegExp(`(^|[^a-z])${u}([^a-z]|$)`).test(text));
    if (word) return USDA_VOLUME_ML[word];
  }
  return undefined;
}

export function usdaDerivedDensity(portions = []) {
  for (const p of portions) {
    const ml = portionMl(p);
    const grams = p.gramWeight;
    const amount = p.amount ?? 1;
    if (ml === undefined || !Number.isFinite(grams) || grams <= 0 || !(amount > 0)) continue;
    return { mass_g: grams, volume_ml: ml * amount };
  }
  return null;
}

export function shapeUSDA(f) {
  const nutrients = {};
  for (const n of f.foodNutrients ?? []) {
    const key = USDA_NUTRIENT[n.nutrientId ?? n.nutrient?.id];
    if (key) nutrients[key] = n.value ?? n.amount;
  }
  const derived = usdaDerivedDensity(f.foodPortions ?? []);
  return {
    fdcId: f.fdcId,
    dataType: f.dataType,
    description: f.description,
    foodCategory: f.foodCategory?.description ?? f.foodCategory ?? null,
    density_class: null,
    bulk_class: null,
    ...(derived ? { derived_density: derived } : {}),
    grain_majority: null,
    classifications: {},
    nutrients,
  };
}

/**
 * §8.2 detail lookup — the only place `foodPortions` is available.
 *
 * USDA's /foods/search response does NOT carry foodPortions; only
 * /food/{fdcId} does. Without them there is no §3.3a step 1 derivation, so a
 * USDA liquid or scoopable solid is gram-only — which is the worked case in
 * the v1.8 handoff failing on its first component.
 *
 * One request, made when a result is SELECTED rather than for every result, so
 * a search still costs one call.
 */
export async function lookupUSDA(fdcId, apiKey) {
  if (!apiKey) return { status: LOOKUP.NO_API_KEY };
  const r = await getJson(`${USDA_BASE}/food/${encodeURIComponent(fdcId)}?api_key=${encodeURIComponent(apiKey)}`);
  if (r.status !== LOOKUP.OK) return r;
  if (!r.body?.fdcId) return { status: LOOKUP.NOT_FOUND };
  return { status: LOOKUP.OK, raw: shapeUSDA(r.body), source: 'USDA' };
}
