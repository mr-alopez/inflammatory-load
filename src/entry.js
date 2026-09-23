/**
 * Entry construction — §8.4's storage contract, populated at write.
 *
 * One place builds a stored entry, so §8.4's field list has a single
 * implementation and G1's fields cannot be forgotten by a new call site.
 *
 * `classification_set` and `contributions` are captured HERE, at write, because
 * §8.6 says a migration cannot recover a value that is not reconstructible from
 * what was stored — and classification contributions are not reconstructible
 * from anything else in §8.4.
 */

import { ATTRIBUTES, NUTRIENT_ATTRIBUTES, COEFF_VERSION } from './coefficients.js';
import { MACRO_FIELDS, SCHEMA_VERSION } from './schema.js';

/**
 * @param scored   the result of scoreEntry()
 * @param record   the resolved source record it was scored from
 * @param meta     entry_id, local_date, food_name, quantity, occasion_category…
 */
export function buildEntry(scored, record, meta) {
  if (!scored.created) throw new Error('cannot build an entry from a refused score');

  // §8.4 classification_set — every classification attribute that applied,
  // with the derived count that produced its contribution.
  const classification_set = {};
  for (const [id, count] of Object.entries(scored.servings ?? {})) {
    if (scored.contributions[id] === undefined) continue;
    classification_set[id] = id === 'P3' ? { units: count } : { servings: count };
  }

  // §8.4 contributions — every attribute that contributed, nutrient and
  // classification alike. Zero contributions are kept: "did not contribute" and
  // "was not present" are different, and §6.4's list depends on the difference.
  const contributions = {};
  for (const [id, v] of Object.entries(scored.contributions)) {
    if (v !== undefined) contributions[id] = v;
  }

  const macros = Object.fromEntries(
    MACRO_FIELDS.map((f) => [f, scored.asConsumed[f] ?? null])
  );
  // §8.4 (U6): macro values live in `macros` and do not appear in as_consumed.
  const as_consumed = {};
  for (const id of NUTRIENT_ATTRIBUTES) {
    const f = ATTRIBUTES[id].field;
    as_consumed[f] = scored.asConsumed[f] ?? null;
  }

  return {
    entry_id: meta.entry_id,
    product_id: meta.product_id ?? record.product_id ?? `local:${meta.food_name}`,
    source: record.source,
    source_basis: scored.basis,
    source_basis_provenance: scored.basisProvenance,
    quantity_value: meta.quantity.value,
    quantity_unit: meta.quantity.unit,
    quantity_g: scored.quantity_g,
    density_used: scored.density,
    density_provenance: scored.densityProvenance,
    // §3.3a: the class that selected the density, for DMAP-1 and for BDMAP-1's
    // step 2b alike — a spooned quantity must be distinguishable from a weighed
    // one in any audit, and the class is how.
    density_class: scored.densityProvenance === 'DMAP-1' ? (record.density_class ?? null)
      : scored.densityProvenance === 'BDMAP-1' ? (scored.bulkClass ?? null)
        : null,
    reported: { ...record.reported },
    as_consumed,
    macros,
    sugar_field_used: record.sugar_field_used ?? null,
    occasion_category: meta.occasion_category ?? record.occasion_category ?? 'UNCATEGORIZED',
    category_map_version: meta.category_map_version ?? record.category_map_version ?? 'CATMAP-1',
    coeff_version: scored.coeffVersion ?? COEFF_VERSION,
    score: scored.score,
    local_date: meta.local_date,
    macro_basis: 'SCHEMA_2',            // §8.6a: PRE_SCHEMA_2 is set only by migration
    food_name: meta.food_name,
    classification_set,
    contributions,
    incomplete: { isIncomplete: scored.isIncomplete, fields: [...scored.incomplete] },
    // §8.5b: present ONLY on an entry written through a combo. Absent — not
    // null — otherwise, because absence is what says "not logged through a
    // combo" and a null would assert the field was considered and empty.
    ...(meta.combo_id ? { combo_id: meta.combo_id, combo_name: meta.combo_name } : {}),
    schema_version: SCHEMA_VERSION,
  };
}
