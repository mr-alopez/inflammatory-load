/**
 * §4.4 / §6.6 as a visual rule — the palette guard, extended for the v2.0
 * design pass (handoff v2.0, Part 2), and run against every candidate
 * direction BEFORE any of them is applied.
 *
 * The rule: colour never depends on what was eaten.
 *   - No entry is coloured, tinted or iconed by its score, band or attributes.
 *   - A positive and a negative score render in the same colour; sign is the
 *     `+` / `−` character alone.
 *   - Band labels all render in one shared style.
 *   - Colour may carry STRUCTURE — accent for actions and headings, a muted
 *     tone, surface layering — identical across all entries.
 *
 * Mechanically, that is four checks. Each carries inline accept and reject
 * cases (§2.5, fifth form), so each has judged an instance before it judges a
 * direction:
 *
 *   1. No selector is keyed on a band, a score or a sentiment. This is what
 *      makes "positive and negative render alike" and "one band style" true:
 *      the score and the band are text inside one node, so without a
 *      state-keyed selector no rule CAN tell them apart.
 *   2. No token is named for a band or a sentiment (--good, --danger, --high…).
 *   3. Inside entry scope, every colour-bearing declaration uses a defined
 *      structural token — never a raw colour, never a sentiment token.
 *   4. Every text pair clears WCAG AA (4.5:1) in light AND dark.
 *
 * Plus §13.3: no ring, gauge, streak, badge or progress in any selector, and
 * no conic-gradient, which is how a ring gets drawn without an element.
 */

import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const out = [];
function check(label, ok, note = '') {
  ok ? pass++ : fail++;
  out.push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  — ${note}` : ''}`);
}
function discriminates(label, flags, { rejects, accepts }) {
  const missed = rejects.filter((v) => !flags(v));
  const wrong = accepts.filter((v) => flags(v));
  check(`${label} — DISCRIMINATES`, missed.length === 0 && wrong.length === 0 && rejects.length && accepts.length,
    missed.length ? `did not flag: ${missed.join(' | ')}` : wrong.length ? `wrongly flagged: ${wrong.join(' | ')}`
      : `${rejects.length} rejected, ${accepts.length} accepted`);
}

/* ================================================================== *
 * The guard
 * ================================================================== */

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** Every `selector { body }` rule, flattened out of @media blocks. */
export function rules(css) {
  const src = stripComments(css);
  const found = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) {
    const selector = m[1].replace(/@media[^{]*$/, '').trim();
    if (selector.startsWith('@')) continue;
    found.push({ selector, body: m[2] });
  }
  return found;
}

/** Band and sentiment words. A selector or token named for one of these is a verdict. */
const STATE_WORDS = ['low', 'neutral', 'elevated', 'high', 'positive', 'negative', 'good', 'bad',
  'healthy', 'unhealthy', 'danger', 'warning', 'warn', 'success', 'over', 'under', 'band', 'score',
  'red', 'green', 'amber'];
const wordsIn = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);

/** 1. A selector keyed on state. Class, id and attribute names are all read. */
export function stateKeyedSelector(selector) {
  const names = [...selector.matchAll(/[.#]([A-Za-z0-9_-]+)|\[([^\]=~|^$*]+)(?:[~|^$*]?=([^\]]+))?\]/g)]
    .flatMap((m) => [m[1], m[2], m[3]]).filter(Boolean);
  return names.some((n) => wordsIn(n.replace(/["']/g, '')).some((w) => STATE_WORDS.includes(w)));
}

/** 2. A token named for a band or a sentiment. */
export const sentimentToken = (name) => wordsIn(name).some((w) => STATE_WORDS.includes(w));

/** Tokens a stylesheet defines, by theme. */
export function tokens(css) {
  const src = stripComments(css);
  const block = (re) => {
    const m = src.match(re);
    if (!m) return null;
    return Object.fromEntries([...m[1].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((x) => [x[1], x[2].trim()]));
  };
  const light = block(/(?:^|\})\s*:root\s*\{([^}]*)\}/);
  const dark = block(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/);
  const media = block(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/);
  return { light, dark, media };
}

/** Selectors whose rules style an entry or anything inside one. */
const ENTRY_SCOPE = ['entry', 'entry-line', 'quantity', 'drivers', 'macros', 'incomplete', 'swap-ask',
  'swap-result', 'entry-remove', 'combo-group', 'combo-remove-group'];
export const inEntryScope = (selector) =>
  [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].some((m) => ENTRY_SCOPE.includes(m[1]));

const COLOUR_PROPS = /^(color|background(-color)?|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|box-shadow|fill|stroke|text-decoration(-color)?|caret-color|accent-color|column-rule(-color)?)$/;
const RAW_COLOUR = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|\b(red|green|blue|orange|yellow|lime|crimson|tomato|salmon|gold|pink|purple|navy|teal|olive|maroon|black|white|gray|grey|silver|aqua|fuchsia)\b/i;

/**
 * 3. Colour declarations in entry scope that are not structural.
 * @returns the offending `property: value` strings
 */
export function entryColourViolations(css, allowedTokens) {
  const bad = [];
  for (const { selector, body } of rules(css)) {
    if (!inEntryScope(selector)) continue;
    for (const decl of body.split(';')) {
      const [prop, ...rest] = decl.split(':');
      if (!prop || !rest.length) continue;
      const p = prop.trim().toLowerCase();
      if (!COLOUR_PROPS.test(p)) continue;
      const value = rest.join(':').replace(/!important/, '').trim();
      if (RAW_COLOUR.test(value)) { bad.push(`${selector} { ${p}: ${value} }`); continue; }
      for (const [, t] of value.matchAll(/var\(--([a-z0-9-]+)\)/gi)) {
        if (!allowedTokens.has(t) || sentimentToken(t)) bad.push(`${selector} { ${p}: ${value} }`);
      }
    }
  }
  return bad;
}

/** §13.3 in CSS: a class named for a target, or a conic gradient (a ring with no element). */
const FORBIDDEN_13_3 = ['target', 'goal', 'budget', 'remaining', 'progress', 'quota', 'allowance',
  'ring', 'gauge', 'streak', 'badge', 'meter'];
export function thirteenThreeViolations(css) {
  const bad = [];
  for (const { selector, body } of rules(css)) {
    for (const [, n] of selector.matchAll(/[.#]([A-Za-z0-9_-]+)/g)) {
      if (wordsIn(n).some((w) => FORBIDDEN_13_3.includes(w))) bad.push(selector);
    }
    if (/\b(progress|meter)\b(?![-\w])/.test(selector.replace(/[.#][\w-]+/g, ''))) bad.push(selector);
    if (/conic-gradient/.test(body)) bad.push(`${selector} (conic-gradient)`);
  }
  return bad;
}

/** 4. WCAG 2.x relative luminance and contrast. */
function lum(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** The text pairs every direction must clear, in both themes. */
const TEXT_PAIRS = [
  ['fg', 'bg'], ['fg', 'surface'], ['fg', 'field'],
  ['dim', 'bg'], ['dim', 'surface'],
  ['accent-ink', 'accent'],          // label on a primary button
  ['accent', 'bg'], ['accent', 'surface'],   // accent used as link or heading text
];

/* ================================================================== *
 * The guard, judged first (§2.5 fifth form)
 * ================================================================== */

out.push('\nTHE GUARD, BEFORE IT JUDGES ANY DIRECTION');
out.push('=========================================');

discriminates('1. state-keyed selector', stateKeyedSelector, {
  rejects: ['.entry.high', '.score-negative', '[data-band="Elevated"]', '.entry.is-good',
    '.summary .band-low', '#today-load.positive', '.entry[data-score]'],
  accepts: ['.entry', '.entry.removable', '.entry.holding', '.combo-group > h3', '.today-actions',
    'nav button[aria-current="page"]', '.nf input', '#add-choose .add:first-child', '.hold-hint'],
});
discriminates('2. sentiment-named token', sentimentToken, {
  rejects: ['good', 'danger', 'band-high', 'score-negative', 'warn', 'red'],
  accepts: ['fg', 'dim', 'surface', 'accent', 'accent-ink', 'rule-strong', 'field', 'nav-h'],
});
const allowedForCase = new Set(['fg', 'dim', 'rule', 'surface', 'accent', 'field']);
discriminates('3. entry-scope colour', (css) => entryColourViolations(css, allowedForCase).length > 0, {
  rejects: [
    '.entry { background: #fde8e8; }',
    '.entry { color: var(--danger); }',
    '.drivers { color: red; }',
    '.entry { border-top: 2px solid rgb(200, 0, 0); }',
    '.quantity { color: var(--undefined-token); }',
  ],
  accepts: [
    '.entry { border-top: 2px solid var(--fg); background: var(--surface); }',
    '.drivers { color: var(--dim); }',
    '.combo-group { border-left: 2px solid var(--rule); }',
    '.load { color: #b00; }',                     // not entry scope: the rule is about entries
    '.entry { padding: 12px; margin: 0; }',
  ],
});
discriminates('§13.3 in CSS', (css) => thirteenThreeViolations(css).length > 0, {
  rejects: ['.daily-goal { width: 50%; }', '.streak-count { font-weight: 700; }',
    '.ring { border-radius: 50%; }', '.load { background: conic-gradient(var(--fg) 40%, var(--rule) 0); }',
    'progress { accent-color: var(--fg); }'],
  accepts: ['.today-actions { position: sticky; }', '.entry { border-radius: 5px; }', '.add.secondary { color: var(--dim); }'],
});
discriminates('4. AA contrast', ([a, b]) => contrast(a, b) < 4.5, {
  rejects: [['#777777', '#ffffff'], ['#999999', '#f6f1e7'], ['#5a5a5a', '#333333']],
  accepts: [['#767676', '#ffffff'], ['#14181d', '#e3e7ea'], ['#ffffff', '#1b5e8c']],
});
check('4. contrast arithmetic is right: black on white is 21:1, a colour on itself is 1:1',
  Math.abs(contrast('#000000', '#ffffff') - 21) < 1e-9 && Math.abs(contrast('#1b5e8c', '#1b5e8c') - 1) < 1e-9);

/* ================================================================== *
 * The directions
 * ================================================================== */

const DIRECTIONS = [
  ['A — Meso', 'design/direction-a-meso.css'],
  ['B — Notebook', 'design/direction-b-notebook.css'],
  ['C — Ledger', 'design/direction-c-ledger.css'],
];
const REQUIRED = ['bg', 'surface', 'fg', 'dim', 'rule', 'accent', 'accent-ink', 'field'];
const contrastTable = [];

for (const [name, file] of DIRECTIONS) {
  const css = readFileSync(file, 'utf8');
  out.push(`\nDIRECTION ${name}  (${file})`);
  out.push('='.repeat(12 + name.length));

  const t = tokens(css);
  check('both themes define every required token',
    REQUIRED.every((k) => t.light?.[k] && t.dark?.[k]),
    REQUIRED.filter((k) => !t.light?.[k] || !t.dark?.[k]).join(', ') || `${REQUIRED.length} tokens × 2 themes`);
  check('the system-dark and forced-dark blocks are identical',
    JSON.stringify(t.media) === JSON.stringify(t.dark),
    'CSS cannot share one block between a media query and an attribute selector — keep both copies equal');

  const defined = new Set([...Object.keys(t.light ?? {}), ...Object.keys(t.dark ?? {})]);
  const sentimentNamed = [...defined].filter(sentimentToken);
  check('2. no token is named for a band or a sentiment', sentimentNamed.length === 0,
    sentimentNamed.join(', ') || `${defined.size} tokens`);

  const keyed = rules(css).map((r) => r.selector).filter(stateKeyedSelector);
  check('1. no selector is keyed on a band, score or sentiment', keyed.length === 0,
    keyed.join(' | ') || `${rules(css).length} rules`);

  const entryBad = entryColourViolations(css, defined);
  const entryRules = rules(css).filter((r) => inEntryScope(r.selector)).length;
  check('3. every colour in entry scope is a structural token', entryBad.length === 0 && entryRules > 5,
    entryBad.join(' | ') || `${entryRules} entry-scope rules, all structural`);

  const t133 = thirteenThreeViolations(css);
  check('§13.3: no ring, gauge, streak, badge, progress or conic gradient', t133.length === 0,
    t133.join(' | ') || 'none');

  for (const theme of ['light', 'dark']) {
    const failing = [];
    for (const [f, b] of TEXT_PAIRS) {
      const r = contrast(t[theme][f], t[theme][b]);
      contrastTable.push([name, theme, `${f} on ${b}`, r]);
      if (r < 4.5) failing.push(`${f} on ${b} ${r.toFixed(2)}`);
    }
    const worst = Math.min(...TEXT_PAIRS.map(([f, b]) => contrast(t[theme][f], t[theme][b])));
    check(`4. WCAG AA for every text pair — ${theme}`, failing.length === 0,
      failing.join(', ') || `${TEXT_PAIRS.length} pairs, lowest ${worst.toFixed(2)}:1`);
  }
}

/* ---------------- run ---------------- */

console.log('\nPALETTE GUARD — §4.4 as a visual rule, v2.0 design pass');
console.log('='.repeat(56));
for (const l of out) console.log(l);

console.log('\nCONTRAST — every text pair, both themes');
console.log('=======================================');
for (const [name, theme, pair, r] of contrastTable) {
  console.log(`  ${name.padEnd(13)} ${theme.padEnd(5)} ${pair.padEnd(22)} ${r.toFixed(2).padStart(6)}:1`);
}

console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
