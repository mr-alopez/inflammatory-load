/**
 * BDMAP-1 loader — §3.3a step 2b.
 *
 * Bulk densities for scoopable solids entered by volume. Densities AND the
 * tag-to-class mapping live together in data/bulk-density-map.json and are
 * versioned together, for the same reason DMAP-2's do (J6): a mapping held in
 * code is not auditable and drifts from the map it keys.
 *
 * §3.3a is explicit that this is LESS PRECISE than liquid density. The entry
 * stores provenance `BDMAP-1` so a spooned quantity is distinguishable from a
 * weighed one in any audit, and §9.1's method page says so.
 */
import map from '../data/bulk-density-map.json' with { type: 'json' };

export const BDMAP_VERSION = map.version;
export const BULK_DENSITY_MAP = map.densities;
export const BULK_DERIVATIONS = map.derivations;
export const BULK_RULE_COUNT = map.tags.length;

/**
 * §7.2a: first matching rule in FILE ORDER wins, so specific classes precede
 * general ones. `brown-sugars` must beat `sugars`, and it does because it
 * appears earlier in the file — not because of any scoring here.
 *
 * Resolved from DECLARED category tags only, never from the product name
 * (§8.3). Returns null when nothing matches, which under §3.3a means the
 * product is not enterable by volume rather than convertible at a guess.
 */
export function classifyBulk(categoriesTags = []) {
  const tags = categoriesTags.map((t) => String(t).toLowerCase());
  for (const rule of map.tags) {
    if (rule.fragments.some((f) => tags.some((t) => t.includes(f)))) return rule.class;
  }
  return null;
}

/** The bulk density for a class, or null. Never a fallback value. */
export function bulkDensity(cls) {
  return cls && map.densities[cls] !== undefined ? map.densities[cls] : null;
}
