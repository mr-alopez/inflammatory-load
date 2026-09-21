/**
 * DMAP-2 loader — §3.3a step 2, §7.2a.
 *
 * The densities AND the tag-to-class mapping live together in
 * data/density-map.json and are versioned together (J6). A mapping held in code
 * is not auditable and drifts from the map it keys.
 */
import map from '../data/density-map.json' with { type: 'json' };

export const DMAP_VERSION = map.version;
export const DENSITY_MAP = map.densities;

/**
 * Resolve a liquid class from a record's DECLARED category tags. Never from the
 * product name (§8.3). Returns null when nothing matches, which routes the
 * entry to MANUAL via §3.3a step 3 rather than assuming a density.
 */
export function classifyLiquid(categoriesTags = []) {
  const tags = categoriesTags.map((t) => String(t).toLowerCase());
  for (const [cls, fragments] of Object.entries(map.tags)) {
    if (fragments.some((f) => tags.some((t) => t.includes(f)))) return cls;
  }
  return null;
}

/** §3.5 juice classification, from the same declared tags (§7.2a). */
export function isJuiceClassified(categoriesTags = []) {
  const tags = categoriesTags.map((t) => String(t).toLowerCase());
  const hit = (list) => list.some((f) => tags.some((t) => t.includes(f)));
  return hit(map.juice_classification.include) && !hit(map.juice_classification.exclude);
}
