/**
 * §3.3c (v2.2): reading a declared quantity.
 *
 * ONE reader for both declared strings: the package `quantity` (rules 2 and 3,
 * and the package shortcut) and `serving_size` (rule 1, the rule 2/3 fallback,
 * the P5 labelled serving and the serving shortcut). Until v2.2 there were
 * three readers of these strings — a strict one in sources.js, the package
 * reader, and a parenthesis reader in prefill.js — and they disagreed: the
 * prefill form could read "1 slice (26 g)" while rule 1 refused it.
 *
 * Every mass or volume figure in the string is read, and all of them must agree
 * on mass versus volume. A string whose figures disagree, or that has no
 * figure, does not resolve. Read, never interpreted: nothing comes from the
 * product name, category, or any other field (§8.3).
 *
 *   - Units are the §3.3c table. A figure with a unit not in it is not a figure.
 *   - Fluid-ounce spellings are matched before ounce spellings.
 *   - A figure containing a comma does not resolve, and neither does its
 *     string: "1,5 kg" and "1,500 g" mean different things with the same comma.
 *   - A metric figure, where present, supplies the value; otherwise the first
 *     figure is converted exactly.
 *   - `N x M unit` is a multipack: the value is ONE item, M (§3.3).
 *
 * No imports: prefill.js, sources.js and the tests all read through this, and
 * it must not pull the scoring graph into prefill.
 */

const FL_OZ_ML = 29.5735295625;

/** §3.3c unit table. `display` is how the figure is shown on a shortcut label. */
export const DECLARED_UNITS = {
  g:       { kind: 'mass',   factor: 1,                metric: true,  display: 'g' },
  kg:      { kind: 'mass',   factor: 1000,             metric: true,  display: 'kg' },
  oz:      { kind: 'mass',   factor: 28.349523125,     metric: false, display: 'oz' },
  lb:      { kind: 'mass',   factor: 453.59237,        metric: false, display: 'lb' },
  ml:      { kind: 'volume', factor: 1,                metric: true,  display: 'ml' },
  cl:      { kind: 'volume', factor: 10,               metric: true,  display: 'cl' },
  dl:      { kind: 'volume', factor: 100,              metric: true,  display: 'dl' },
  l:       { kind: 'volume', factor: 1000,             metric: true,  display: 'L' },
  'fl oz': { kind: 'volume', factor: FL_OZ_ML,         metric: false, display: 'fl oz' },
  // §3.3's exact kitchen units. See the §3.3c table note: these rows exist so
  // that "2 tbsp (32 g)" reads as volume-and-mass and refuses, as its vector says.
  cup:     { kind: 'volume', factor: FL_OZ_ML * 8,     metric: false, display: 'cup' },
  tbsp:    { kind: 'volume', factor: FL_OZ_ML / 2,     metric: false, display: 'tbsp' },
  tsp:     { kind: 'volume', factor: FL_OZ_ML / 6,     metric: false, display: 'tsp' },
};

/** Spelling → unit. Longest first, fluid ounces before ounces. Case-insensitive. */
const SPELLINGS = [
  ['fluid ounces', 'fl oz'], ['fluid ounce', 'fl oz'], ['fl. oz', 'fl oz'], ['fl.oz', 'fl oz'],
  ['fl oz', 'fl oz'], ['floz', 'fl oz'],
  ['millilitres', 'ml'], ['milliliters', 'ml'], ['millilitre', 'ml'], ['milliliter', 'ml'], ['ml', 'ml'],
  ['litres', 'l'], ['liters', 'l'], ['litre', 'l'], ['liter', 'l'],
  ['kilograms', 'kg'], ['kilogram', 'kg'], ['kg', 'kg'],
  ['grams', 'g'], ['gram', 'g'], ['gm', 'g'],
  ['ounces', 'oz'], ['ounce', 'oz'], ['oz', 'oz'],
  ['pounds', 'lb'], ['pound', 'lb'], ['lbs', 'lb'], ['lb', 'lb'],
  ['cl', 'cl'], ['dl', 'dl'],
  ['cups', 'cup'], ['cup', 'cup'],
  ['tablespoons', 'tbsp'], ['tablespoon', 'tbsp'], ['tbsp', 'tbsp'],
  ['teaspoons', 'tsp'], ['teaspoon', 'tsp'], ['tsp', 'tsp'],
  ['g', 'g'], ['l', 'l'],
];
/** Spelling key: lower case, with spaces and points removed ("fl. oz" → "floz"). */
const compact = (s) => s.toLowerCase().replace(/[\s.]+/g, '');
const SPELLING_OF = new Map(SPELLINGS.map(([s, u]) => [compact(s), u]));
const esc = (s) => s.replace(/[.]/g, '\\.').replace(/ /g, '\\s*');

/**
 * A figure: a mixed number, a fraction, or a decimal — the last allowed to carry
 * commas so that they can be SEEN and refused, not skipped over. Not preceded
 * by a digit, point, comma or slash, so "1,5 kg" can never be read as "5 kg".
 */
const FIGURE = new RegExp(
  '(?<![\\d.,/])(\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d[\\d,]*(?:\\.\\d+)?|\\.\\d+)\\s*' +
  `(${SPELLINGS.map(([s]) => esc(s)).join('|')})(?![a-z])`,
  'gi'
);
const MULTIPACK = /(\d+)\s*[x×]\s*$/i;
const VULGAR = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8' };

function figureValue(t) {
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[3]) > 0 ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : NaN;
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) > 0 ? Number(frac[1]) / Number(frac[2]) : NaN;
  return Number(t);
}

/**
 * @returns {{ value, unit: 'g'|'ml', kind: 'mass'|'volume', label, pack }} or null.
 *   `value` is in grams or millilitres. `label` is the chosen figure as declared,
 *   e.g. "567 g" or "16 oz". `pack` is N for an `N x M unit` string, else null.
 */
export function readDeclared(text) {
  if (typeof text !== 'string') return null;
  // A vulgar-fraction character is a fraction, not a word: "1 ½ cup" is 1 1/2
  // cups. Unread, the cup would vanish and "1 ½ cup (39 g)" would resolve as
  // mass while "1 1/2 cup (39 g)" refuses.
  text = text.replace(/(\d)?\s*([½⅓⅔¼¾⅛⅜⅝⅞])/g, (_, whole, f) => `${whole ? `${whole} ` : ' '}${VULGAR[f]}`);
  const figures = [];
  for (const m of text.matchAll(FIGURE)) {
    if (m[1].includes(',')) return null;                 // a comma: the string does not resolve
    const u = DECLARED_UNITS[SPELLING_OF.get(compact(m[2]))];
    const value = figureValue(m[1].replace(/\s+/g, ' ').trim());
    if (!u || !Number.isFinite(value) || value <= 0) continue;
    const packMatch = text.slice(0, m.index).match(MULTIPACK);
    figures.push({ raw: m[1].replace(/\s+/g, ' ').trim(), value, ...u, pack: packMatch ? Number(packMatch[1]) : null });
  }
  if (figures.length === 0) return null;
  if (new Set(figures.map((f) => f.kind)).size !== 1) return null;   // they disagree: rule 4

  // A multipack's value is the item that follows "N x", never the pack total.
  const first = figures[0];
  const pick = first.pack ? first : (figures.find((f) => f.metric) ?? first);
  return {
    value: pick.value * pick.factor,
    unit: pick.kind === 'mass' ? 'g' : 'ml',
    kind: pick.kind,
    label: `${pick.raw} ${pick.display}`,
    pack: first.pack && first.pack > 1 ? first.pack : null,
  };
}
