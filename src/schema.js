/**
 * SCHEMA-2 — spec v0.6 §8.4, §8.6, §8.6a.
 *
 * Field definitions and immutability classes. Data only, no logic.
 */

export const SCHEMA_VERSION = 5;

export const STORES = {
  ENTRIES: 'entries',
  SAVED_PRODUCTS: 'saved_products',
  PRODUCT_CACHE: 'product_cache',   // resolved OFF/USDA records only — never MANUAL/SAVED (§8.5)
  COMBOS: 'combos',      // §8.5b — named component lists; not a source, not a composite record
  META: 'meta',          // TREND_EPOCH lives here — stored once, outside any entry
};

export const META_KEYS = {
  TREND_EPOCH: 'trend_epoch',
  SCHEMA_VERSION: 'schema_version',
};

/** §2.3 nutrient-sourced scored attributes. */
export const REPORTED_FIELDS = ['added_sugar_g', 'sodium_mg', 'saturated_fat_g', 'fiber_g'];

/** §2.5 macro fields. */
export const MACRO_FIELDS = ['energy_kcal', 'protein_g', 'carbohydrate_g', 'fat_g'];

/**
 * §8.4 storage contract, in full.
 *
 * `immutable: true` means §8.4's "immutable once written" covers the field.
 * §8.4 names no mutable field, so every field is immutable and entries are
 * append-only. The classification is kept explicit rather than implied so the
 * guard can report which rule fired — see README "Storage decisions".
 */
export const ENTRY_FIELDS = {
  entry_id:                 { immutable: true, required: true },
  product_id:               { immutable: true, required: true },
  source:                   { immutable: true, required: true, enum: ['OFF', 'USDA', 'MANUAL', 'SAVED'] },

  source_basis:             { immutable: true, nullable: true, enum: ['per_100g', 'per_100ml', 'per_serving', 'NOT_APPLICABLE', null] },
  source_basis_provenance:  { immutable: true, nullable: true, enum: ['DECLARED', 'DERIVED_RULE_2', null] },

  quantity_value:           { immutable: true, required: true },
  // §3.3: the unit AS ENTERED. quantity_g remains the single canonical quantity.
  quantity_unit:            { immutable: true, required: true, enum: ['g', 'ml', 'fl oz', 'cup', 'tbsp'] },
  quantity_g:               { immutable: true, nullable: true },

  density_used:             { immutable: true, nullable: true },
  density_provenance:       { immutable: true, nullable: true, enum: ['DERIVED', 'DMAP-1', 'BDMAP-1', 'MANUAL', null] },
  density_class:            { immutable: true, nullable: true },

  // The attribute set as retrieved AND as consumed, with explicit nulls (§8.4).
  reported:                 { immutable: true, required: true, valueObject: REPORTED_FIELDS },
  as_consumed:              { immutable: true, required: true, valueObject: [...REPORTED_FIELDS, ...MACRO_FIELDS] },
  macros:                   { immutable: true, required: true, valueObject: MACRO_FIELDS },

  sugar_field_used:         { immutable: true, nullable: true, enum: ['total', null] },

  occasion_category:        { immutable: true, required: true },
  category_map_version:     { immutable: true, required: true },

  coeff_version:            { immutable: true, required: true },
  score:                    { immutable: true, required: true },
  local_date:               { immutable: true, required: true },

  macro_basis:              { immutable: true, required: true, enum: ['SCHEMA_2', 'PRE_SCHEMA_2'] },
  food_name:                { immutable: true, required: true },   // §6.0a, resolved at write

  // SCHEMA-3 (G1). A stored entry renders every §6 string without recomputing.
  // classification_set cannot be reconstructed after the fact, which is why
  // this landed before the logging flow (§8.6).
  classification_set:       { immutable: true, required: true },   // {P5:{servings:1}, P3:{units:1.0003}}
  contributions:            { immutable: true, required: true },   // every contributing attribute
  incomplete:               { immutable: true, required: true },   // {isIncomplete, fields[]}

  // SCHEMA-4 (§8.5b). Present only on an entry written through a combo. Absent
  // — not null — on every other entry, which reads as "not logged through a
  // combo" and needs no backfill (§8.6).
  combo_id:                 { immutable: true, nullable: true },
  combo_name:               { immutable: true, nullable: true },

  // SCHEMA-5 (§8.5). Present only on a manual entry prefilled from a refused
  // record: that record's source and product id, and the fields the user
  // changed from their prefilled values. Absent otherwise — absence reads as
  // "not prefilled" and needs no backfill.
  prefilled_from:           { immutable: true, nullable: true },
  prefill_changed:          { immutable: true, nullable: true },

  schema_version:           { immutable: true, required: true },
};

/** §8.5b. A combo adds these; an entry logged any other way carries neither. */
export const SCHEMA_4_ADDED_FIELDS = ['combo_id', 'combo_name'];

/** §8.5 (v2.0). Present only on a prefilled manual entry. */
export const SCHEMA_5_ADDED_FIELDS = ['prefilled_from', 'prefill_changed'];

/**
 * Fields a SCHEMA-1 → SCHEMA-2 migration adds (§8.6). Existing entries take
 * null on each; §8.6a governs how they display.
 */
export const SCHEMA_3_ADDED_FIELDS = ['classification_set', 'contributions', 'incomplete'];

export const SCHEMA_2_ADDED_FIELDS = [
  'macros',
  'source_basis',
  'source_basis_provenance',
  'quantity_g',
  'density_used',
  'density_provenance',
  'density_class',
];

/**
 * Value-bearing fields a migration may never alter (§8.6, hard requirement).
 * Checked directly by the migration test.
 */
export const MIGRATION_PROTECTED = ['score', 'reported', 'as_consumed', 'macros'];
