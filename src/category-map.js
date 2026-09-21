/**
 * CATMAP-1 loader — §7.2a.
 *
 * Maps a source record's DECLARED taxonomy keys to an OCCASION_CATEGORY. Never
 * inferred from a product name, never produced by an LLM (§8.3). The mapping
 * lives in data/category-map.json and is versioned there, for the same reason
 * DMAP-2's tag mapping does (J6): a mapping held in code is not auditable.
 */
import map from '../data/category-map.json' with { type: 'json' };

export const CATMAP_VERSION = map.version;
export const OCCASION_CATEGORIES = map.categories;
export const RULE_COUNT = map.rules.length;

/**
 * §7.2a: first matching key in FILE ORDER wins, so specific keys precede
 * general ones. `en:dried-fruits` must beat `en:fruits`, and it does because it
 * appears earlier in the file — not because of any scoring here.
 *
 * @returns one of OCCASION_CATEGORIES, or 'UNCATEGORIZED' — a valid outcome.
 */
export function categoryFromTags(categoriesTags = []) {
  const tags = categoriesTags.map((t) => String(t).toLowerCase());
  for (const rule of map.rules) {
    if (tags.some((t) => t === `en:${rule.tag}` || t.endsWith(`:${rule.tag}`) || t === rule.tag)) {
      return rule.category;
    }
  }
  return 'UNCATEGORIZED';
}

/** §8.2: USDA food category names, where a key is configured. */
export function categoryFromUSDA(foodCategory) {
  if (!foodCategory) return 'UNCATEGORIZED';
  return map.usda[foodCategory] ?? 'UNCATEGORIZED';
}
