/**
 * §3.3c (v2.2): reading a declared quantity.
 *
 * ONE reader for both declared strings: the package `quantity` (rules 3 and 4,
 * and the package shortcut) and `serving_size` (rule 1, the rule 3/4 fallback,
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

/**
 * Half a unit in the last stated digit: "14" ±0.5, "14.2" ±0.05. For a fraction,
 * half of its denominator's unit ("1/2" ±0.25). Used only for §3.3a's precision rule.
 */
export function uncertainty(raw) {
  const frac = raw.match(/\/(\d+)$/);
  if (frac) return 0.5 / Number(frac[1]);
  const decimals = (raw.split('.')[1] ?? '').length;
  return 0.5 * 10 ** -decimals;
}

function figureValue(t) {
  const mixed = t.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[3]) > 0 ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : NaN;
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) > 0 ? Number(frac[1]) / Number(frac[2]) : NaN;
  return Number(t);
}

/** A parenthesis depth at each index, so a figure knows whether it sits in one. */
function depthAt(text) {
  const d = new Array(text.length + 1).fill(0);
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(' || text[i] === '[') depth++;
    d[i] = depth;
    if ((text[i] === ')' || text[i] === ']') && depth > 0) depth--;
  }
  return d;
}

const result = (pick, pack, density = null) => ({
  value: pick.value * pick.factor,
  unit: pick.kind === 'mass' ? 'g' : 'ml',
  kind: pick.kind,
  label: `${pick.raw} ${pick.display}`,
  // The declared figure in its own unit, for a shortcut entry's display (§6.1b).
  size: { value: pick.value, unit: pick.display },
  pack,
  density,
});

/**
 * @param text     the declared string
 * @param serving  true for `serving_size`, where the US label convention applies
 * @returns {{ value, unit: 'g'|'ml', kind, label, size, pack, density }} or null.
 *   `value` is in grams or millilitres. `label` is the chosen figure as declared,
 *   e.g. "567 g" or "16 oz". `pack` is N for an `N x M unit` string, else null.
 *   `density` is `{ mass_g, volume_ml }` where a serving string pairs a household
 *   volume with a metric mass (or the reverse), else null.
 */
export function readDeclared(text, { serving = false } = {}) {
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
    figures.push({ raw: m[1].replace(/\s+/g, ' ').trim(), value, ...u, pack: packMatch ? Number(packMatch[1]) : null, at: m.index });
  }
  if (figures.length === 0) return null;

  /**
   * v2.4: a serving string with ONE metric figure and at most one household
   * measure (cup, tbsp, tsp, fl oz — or a count such as "slice", which is not a
   * figure at all), one of the two in parentheses, describes one serving in
   * either order: "2 tbsp (32 g)" and "14 g (1 Tbsp)" alike. The metric figure IS
   * the serving and alone decides mass versus volume; the household measure
   * describes the same serving, so it cannot contradict it. A volume/mass pair is
   * a declared density (§3.3a step 1). Two metric figures, or two household
   * figures, fall through to the agreement rule below.
   */
  if (serving) {
    const depth = depthAt(text);
    const metric = figures.filter((f) => f.metric);
    const household = figures.filter((f) => !f.metric);
    const [m] = metric;
    const [h] = household;
    const paired = h ? (depth[m?.at] > 0) !== (depth[h.at] > 0) : true;
    if (metric.length === 1 && household.length <= 1 && paired) {
      let density = null;
      if (h && h.kind !== m.kind) {
        const amount = (f) => f.value * f.factor;
        density = m.kind === 'mass'
          ? { mass_g: amount(m), volume_ml: amount(h) }
          : { mass_g: amount(h), volume_ml: amount(m) };
        // §3.3a step 1 (v2.4) precision: half a unit in the metric figure's last
        // stated digit, relative to the figure. The household unit is exact.
        density.rel_uncertainty = uncertainty(m.raw) / m.value;
      }
      return result(m, null, density);
    }
  }
  if (new Set(figures.map((f) => f.kind)).size !== 1) return null;   // they disagree: rule 5

  // A multipack's value is the item that follows "N x", never the pack total.
  const first = figures[0];
  const pick = first.pack ? first : (figures.find((f) => f.metric) ?? first);
  return result(pick, first.pack && first.pack > 1 ? first.pack : null);
}
