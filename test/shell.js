/**
 * Application shell — spec v1.0 §11 step 6, §13.3 constraints.
 *
 * §13.3 is §2.5, §6.6 and §4.4 restated as UI requirements, and the brief says
 * to treat them as structurally as §2.5's. So these assert the ABSENCE OF THE
 * CAPABILITY, not the absence of a call: there must be no code path able to
 * produce a target, ring, gauge, streak, badge, or a notification reporting a
 * load.
 *
 * Comments are stripped before scanning. The shell's own source discusses the
 * prohibitions in prose, and a check that a file never says "notification"
 * would fail on the comment explaining why it registers no notification
 * handler — the Y4 lesson, one level up.
 */

import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const results = [];
function check(label, ok, note = '') {
  ok ? pass++ : fail++;
  results.push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  — ${note}` : ''}`);
}

/**
 * §2.5, fifth form: a check that has never judged an instance has never been
 * tested. Every structural predicate below is handed at least one value it must
 * flag and one it must not, on every run, whether or not the codebase currently
 * supplies an instance.
 *
 * `flags` returns true when the predicate considers the input a violation.
 * `rejects` are inputs it MUST flag; `accepts` are inputs it must NOT flag. A
 * predicate that separates nothing fails the build — which is the point: §4.4's
 * palette guard flagged everything, including the values it named as permitted,
 * for six versions, because no real case ever reached it.
 */
function discriminates(label, flags, { rejects = [], accepts = [] }) {
  const missed = rejects.filter((v) => !flags(v));
  const falsePositives = accepts.filter((v) => flags(v));
  const ok = missed.length === 0 && falsePositives.length === 0
    && rejects.length > 0 && accepts.length > 0;
  const note = missed.length ? `did not flag: ${missed.map(short).join(' | ')}`
    : falsePositives.length ? `wrongly flagged: ${falsePositives.map(short).join(' | ')}`
      : `${rejects.length} rejected, ${accepts.length} accepted`;
  check(`${label} — DISCRIMINATES`, ok, note);
}
const short = (v) => JSON.stringify(String(v)).slice(0, 60);

const html = readFileSync('index.html', 'utf8');
const sw = readFileSync('sw.js', 'utf8');
const select = readFileSync('src/select.js', 'utf8');

/** Strip //, /* *\/ and <!-- --> comments so prose about a rule is not the rule. */
function stripComments(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
}

const code = { html: stripComments(html), sw: stripComments(sw), select: stripComments(select) };
const all = Object.values(code).join('\n');

/* ---------- §13.3: no targets, rings, gauges, streaks ---------- */

const FORBIDDEN_TOKENS = new Set([
  'target', 'goal', 'budget', 'remaining', 'progress', 'quota', 'allowance',
  'ring', 'gauge', 'streak', 'badge', 'verdict', 'advice', 'encourage',
]);
const tokenize = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/);

/**
 * Scan AUTHORED names only — class and id attributes, declared bindings, and
 * data-* values. Not every identifier: `target` is a forbidden token AND a core
 * DOM property (`event.target`), so scanning property reads flags the nav click
 * handler. This is Y4's lesson at the UI layer — the prohibition list overlaps
 * the platform's own vocabulary, and the fix is to narrow what is scanned, not
 * to weaken the list.
 */
const authored = [
  ...[...code.html.matchAll(/\b(?:class|id|data-screen)\s*=\s*["']([^"']+)["']/g)]
    .flatMap((m) => m[1].split(/\s+/)),
  ...[...all.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
  ...[...all.matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)].map((m) => m[1]),
];
const forbiddenName = (n) => tokenize(n).some((t) => FORBIDDEN_TOKENS.has(t));
const badIdentifiers = [...new Set(authored.filter(forbiddenName))];
check('[markup+script: index.html, sw.js, select.js] §13.3: no authored name denotes a target, ring, gauge, streak or badge',
  badIdentifiers.length === 0,
  badIdentifiers.length ? badIdentifiers.join(', ') : `${new Set(authored).size} authored names scanned`);

// Both historical failures are kept as cases: `ring` inside `driverString` (Y4,
// fixed by tokenizing) and `target` inside `event.target` (fixed by narrowing
// the scanned surface, not the list).
discriminates('§13.3 forbidden names', forbiddenName, {
  rejects: ['dailyTarget', 'calorieGoal', 'streak', 'progressRing', 'badgeCount', 'macro-budget'],
  accepts: ['driverString', 'entryLine', 'renderToday', 'swapLine', 'stringify'],
});

/* ---------- §13.3: no notification, badge or reminder ---------- */

const NOTIFY_APIS = [
  /\bnew\s+Notification\b/, /\.showNotification\s*\(/, /Notification\.requestPermission/,
  /\.setAppBadge\s*\(/, /\.clearAppBadge\s*\(/, /addEventListener\s*\(\s*['"]push['"]/,
  /addEventListener\s*\(\s*['"]notificationclick['"]/, /\bperiodicSync\b/, /\bshowTrigger\b/,
];
const usesNotifyApi = (src) => NOTIFY_APIS.some((re) => re.test(src));
const usedNotify = NOTIFY_APIS.filter((re) => re.test(all)).map((re) => String(re));
check('[script: index.html, sw.js, select.js] §13.3: no notification, badge, push or reminder API is reachable',
  usedNotify.length === 0, usedNotify.join(' | ') || 'none of 9 APIs present');

/**
 * Nine hand-written patterns, none of which had ever matched anything. Each one
 * is handed a call it must catch, so a typo in any single pattern cannot hide
 * behind the other eight — the aggregate `some()` would stay green while one
 * API went unguarded.
 */
for (const [re, sample] of [
  [/\bnew\s+Notification\b/, 'new Notification("x")'],
  [/\.showNotification\s*\(/, 'reg.showNotification("x")'],
  [/Notification\.requestPermission/, 'Notification.requestPermission()'],
  [/\.setAppBadge\s*\(/, 'navigator.setAppBadge(3)'],
  [/\.clearAppBadge\s*\(/, 'navigator.clearAppBadge()'],
  [/addEventListener\s*\(\s*['"]push['"]/, "self.addEventListener('push', fn)"],
  [/addEventListener\s*\(\s*['"]notificationclick['"]/, "self.addEventListener('notificationclick', fn)"],
  [/\bperiodicSync\b/, 'reg.periodicSync.register()'],
  [/\bshowTrigger\b/, 'new Notification("x", { showTrigger: t })'],
]) {
  const guarded = NOTIFY_APIS.some((p) => String(p) === String(re));
  check(`§13.3 pattern is live: ${re}`, guarded && re.test(sample),
    guarded ? `catches ${sample}` : 'PATTERN NOT IN THE SCANNED LIST');
}
discriminates('§13.3 notification APIs', usesNotifyApi, {
  rejects: ['new Notification("hi")', 'navigator.setAppBadge(3)', "self.addEventListener('push', f)"],
  accepts: ['document.addEventListener("click", f)', 'const notificationText = "x"'],
});

/* ---------- §6.6: no verdict word or imperative in user-visible text ---------- */

const VERDICTS = /\b(yay|nay|bad|good|avoid|cheat|clean|guilty|healthy|unhealthy|should|must eat|well done|nice work|keep it up)\b/i;
const literals = [...code.html.matchAll(/'([^'\n]{2,})'|"([^"\n]{2,})"|`([^`\n]{2,})`/g)]
  .map((m) => m[1] ?? m[2] ?? m[3]);
const htmlText = code.html.replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
const visible = [...literals, htmlText];
const offenders = visible.filter((s) => VERDICTS.test(s));
check('[string literals + markup text: index.html] §6.6: no verdict word or imperative in any shell string',
  offenders.length === 0, offenders.length ? offenders.join(' | ') : `${literals.length} literals scanned`);

/**
 * REPORTED — two lists guard one prohibition, and they have drifted.
 *
 * §6.6 is implemented by two checks on two surfaces: this one over the shell's
 * string literals, and test/display.js over the strings the display module
 * produces. Neither pattern is a superset of the other:
 *
 *   here only:        well done, nice work, keep it up, healthy, unhealthy, must eat
 *   display.js only:  try, choose, instead
 *
 * So "Well done" passes the display check and "instead" passes this one. Both
 * had flagged nothing ever, so the divergence was invisible.
 *
 * NOT resolved here. A naive union is wrong: `\bchoose\b` matches the shell's
 * own element id `add-choose`, and Y4's rule is to narrow the scanned surface,
 * not to weaken the list — but these two checks scan deliberately different
 * surfaces, so which list belongs on which surface is a §6.6 question, not a
 * mechanical one. What must be true of both is asserted instead.
 */
const SEC_6_6_NAMED = ['yay', 'nay', 'bad', 'good', 'avoid', 'cheat', 'clean', 'guilty'];
const missed66 = SEC_6_6_NAMED.filter((w) => !VERDICTS.test(`a ${w} thing`));
check('§6.6: every verdict word the spec names is caught here',
  missed66.length === 0, missed66.length ? `not caught: ${missed66.join(', ')}` : '8 named words');

discriminates('§6.6 verdict words', (s) => VERDICTS.test(s), {
  rejects: ['a bad choice', 'Well done', 'you should avoid this', 'a clean day', 'unhealthy'],
  // Real strings the app renders. A guard that flags these would be weakened,
  // not fixed — which is how a prohibition list dies.
  accepts: ['Today so far', 'Press and hold an entry to remove it.',
    'Not enough history yet to suggest an alternative.', 'goodness'],
});

/**
 * The literal scanner's reach, asserted rather than assumed. It reads
 * single-line literals only: a verdict word inside a MULTI-LINE template literal
 * is invisible to it. No such literal exists in the shell today, and this
 * assertion fails the build if one appears — the bound is enforced rather than
 * documented in a comment nobody reads.
 */
const multiLineTemplates = [...code.html.matchAll(/`[^`]*`/g)].filter((m) => m[0].includes('\n'));
check('[script: index.html] §6.6 scanner reach: no multi-line template literal escapes the scan',
  multiLineTemplates.length === 0,
  multiLineTemplates.length
    ? `${multiLineTemplates.length} multi-line template literal(s) are NOT scanned for verdicts`
    : `${literals.length} single-line literals scanned, 0 unscanned`);

/* ---------- §4.4: entries are never banded or coloured ---------- */

const css = (html.match(/<style>([\s\S]*?)<\/style>/) ?? [, ''])[1];
const entryRules = [...css.matchAll(/\.entry[^{]*\{([^}]*)\}/g)].map((m) => m[1]);

/**
 * §4.4: an entry may use the neutral palette and nothing else.
 *
 * The value is CAPTURED and then tested. The previous form put the palette in a
 * negative lookahead after `\s*`, which backtracks to zero width — the lookahead
 * then ran against a string starting with a space, matched none of its
 * alternatives, and reported every declaration as an offender, including the
 * three it named as allowed. It survived because no `.entry` rule declared a
 * colour until removal added one, so the check had never once fired on the
 * thing it exists to judge (§2.5).
 */
const NEUTRAL = /^(var\(--fg\)|var\(--dim\)|inherit)$/;
const entryColours = (rule) =>
  [...rule.matchAll(/(?:^|[^-\w])color\s*:\s*([^;}]+)/g)].map((m) => m[1].trim());
const colouredEntry = entryRules.filter((r) => entryColours(r).some((v) => !NEUTRAL.test(v)));
check('[style: index.html <style>] §4.4: no .entry rule sets a colour outside the neutral palette',
  colouredEntry.length === 0, colouredEntry.join(' | ') || `${entryRules.length} entry rules, all neutral`);

// This is the check the fifth form was written for. It flagged every colour it
// was shown, including the three it named as permitted, from v1.0 to v1.6.
const offPalette = (rule) => entryColours(rule).some((v) => !NEUTRAL.test(v));
discriminates('§4.4 entry palette', offPalette, {
  rejects: ['.x { color: #c0392b; }', '.x { color: red; }', '.x { color: var(--band-high); }'],
  accepts: ['.x { color: var(--dim); }', '.x { color:var(--fg); }', '.x { color: inherit; }',
    '.x { border-color: var(--fg); }', '.x { background-color: var(--card); }',
    '.x { margin-top: 10px; }'],
});

const bandsAtRender = (src) => /bandDaily|bandWindow/.test(src);
check('§4.4: no band label reaches an entry — bands come only from day/window helpers',
  !bandsAtRender(code.html),
  'shell calls completedDaySummary/windowSummary, which band internally');
discriminates('§4.4 band helpers', bandsAtRender, {
  rejects: ['const b = bandDaily(load);', 'text(el, bandWindow(x))'],
  accepts: ['completedDaySummary(date, load)', 'windowSummary(d, l)', 'const band = null;'],
});

const BAND_CLASS = /class\s*=\s*["'][^"']*\b(low|neutral|elevated|high)\b/i;
check('§4.4: no band-derived CSS class on any element', !BAND_CLASS.test(code.html));
discriminates('§4.4 band-derived class', (s) => BAND_CLASS.test(s), {
  rejects: ['<div class="band high">', '<p class="elevated">', "<i class='low'>"],
  accepts: ['<div class="entry removable">', '<p class="hold-hint">', '<div class="summary-line">'],
});

/* ---------- presence checks: why these carry no discrimination case ---------- *
 *
 * §2.5's fifth form governs checks that assert an ABSENCE. "Found nothing" is
 * indistinguishable from "the pattern is broken", so an absence check can pass
 * without ever judging anything — that is the §4.4 palette failure.
 *
 * A presence check cannot fail that way. Its pattern is run against a file that
 * must contain a match, so a broken pattern goes RED immediately and loudly. The
 * live codebase is its accept case, and it is exercised on every run by
 * construction. Adding a synthetic case to one would assert nothing the check
 * does not already assert.
 *
 * The checks below are presence checks, and this is the record of that judgment.
 * ------------------------------------------------------------------------ */

/* ---------- §8.6 / §13.3: offline ---------- */

check('§8.6: a service worker caches the shell and engine modules',
  /caches\.open/.test(code.sw) && /addAll/.test(code.sw) && /src\/display\.js/.test(sw));
check('§8.6: fetch handler serves from cache first',
  /caches\.match/.test(code.sw));
check('§13.3: the app opens without IndexedDB rather than dead-ending',
  /MemoryBackend/.test(code.html), 'falls back to an in-memory store');
/**
 * A bare specifier means a bundler or an import map; a relative one does not.
 * The original pattern allowed only `./`, so it would have flagged a legitimate
 * `../` import as a framework import. Nothing in the shell uses `../` today, so
 * it had never fired — and the natural response to a guard that rejects a
 * legitimate import is to weaken it, which is precisely what the fifth form
 * exists to prevent.
 */
const NON_NATIVE = /require\(|from\s*['"](?!\.{1,2}\/)/;
check('§8.6: no framework or build step — modules loaded natively',
  /<script type="module">/.test(html) && !NON_NATIVE.test(code.html));
discriminates('§8.6 native modules', (s) => NON_NATIVE.test(s), {
  rejects: ["const x = require('react')", "import React from 'react'",
    "import { z } from 'zod'"],
  accepts: ["import { x } from './src/display.js'", "import m from '../data/density-map.json'",
    "import { y } from './macros.js'"],
});

/* ---------- reported gap ---------- */

check('src/select.js is labelled a reported gap, not a silent addition',
  /REPORTED GAP/.test(select));

/* ---------- G1: rendering reads, it never scores ---------- */

const IMPORT_RE = /from\s+['"]([^'"]+)['"]/g;
const importsOf = (file) => [...readFileSync(file, 'utf8').matchAll(IMPORT_RE)].map((m) => m[1]);

import { dirname, join, normalize } from 'node:path';

/**
 * Resolve relative to the IMPORTING file, as the runtime does.
 *
 * The previous form collapsed both `./` and `../` to `src/`, so
 * `../data/density-map.json` resolved to the non-existent
 * `src/data/density-map.json`; the recursive call threw and the catch swallowed
 * it. The walk therefore could not see past any `../` hop, and said so nowhere.
 * Today the only such import is a JSON leaf, so nothing was actually missed —
 * which is exactly why it had never been noticed.
 *
 * `unresolved` now collects what the walk could not follow, so a blind spot is
 * reported rather than swallowed (§2.5: assert the mechanism engaged).
 */
const unresolved = [];
function reachable(entry, seen = new Set()) {
  for (const spec of importsOf(entry)) {
    if (!spec.startsWith('.')) continue;                    // bare specifiers: node builtins
    const path = normalize(join(dirname(entry), spec)).replace(/\\/g, '/');
    if (seen.has(path)) continue;
    seen.add(path);
    if (/\.json$/.test(path)) continue;                     // data leaf, imports nothing
    try { reachable(path, seen); } catch (e) { unresolved.push(`${path} (${e.code ?? 'ERR'})`); }
  }
  return seen;
}

const displayReach = reachable('src/display.js');
// Guard against a vacuous pass: if the walk found nothing, the regex is broken,
// not the graph clean.
check('G1: the import walk actually resolved something', displayReach.size >= 2,
  `${displayReach.size} modules reachable from display.js`);
check('[import graph: src/display.js, transitive] G1: NO import path to the scoring module',
  displayReach.size >= 2 && ![...displayReach].some((p) => p.endsWith('scoring.js')),
  [...displayReach].join(', '));

/**
 * The walk's reject case, from the real graph rather than a fixture:
 * `index.html` imports `./src/scoring.js` directly (the §13.2 logging flow
 * legitimately scores at write time), so a walk from it MUST find scoring.js.
 *
 * REPORTED, and the reason this case is not optional: **no module under `src/`
 * imports `scoring.js` at all.** Scoring is reached only from `index.html` and
 * from the test files. So "display.js has no import path to scoring.js" is true
 * of every module in `src/` equally — the check would pass unchanged if it were
 * aimed at any other file in the tree. It engages, it resolves five modules, and
 * it is aimed at the right surface, but no instance in this codebase can make it
 * fail. Without the case below it asserts far less than it appears to.
 */
const reachesScoring = (start) => [...reachable(start)].some((p) => p.endsWith('scoring.js'));
discriminates('G1 import walk', reachesScoring, {
  rejects: ['index.html'],
  accepts: ['src/display.js'],
});

// Asserted AFTER every walk above, so it covers all of them. A relative import
// the walk could not follow is a blind spot, and a blind spot is silence, not a
// clean graph.
check('G1: the import walk has no blind spots — every relative import was followed',
  unresolved.length === 0, unresolved.length ? unresolved.join(', ') : 'all resolved');
/**
 * G1 forbids scoring at RENDER time, not at write time. The logging flow (§13.2)
 * legitimately calls scoreEntry — §8.4 entries are built from a score when they
 * are written. So the check is scoped to the render functions, which must read
 * stored entries only.
 */
function renderFunctionBodies(src) {
  return [...src.matchAll(/function (render[A-Za-z]*)\s*\([^)]*\)\s*\{/g)].map((m) => {
    const start = m.index + m[0].length;
    let depth = 1, i = start;
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') depth--;
      i++;
    }
    return { name: m[1], body: src.slice(start, i) };
  });
}
const renderBodies = renderFunctionBodies(code.html);
const scoringRenderers = renderBodies.filter((r) => /scoreEntry|buildEntry/.test(r.body));
check('[script: index.html render* function bodies] G1: no render function scores',
  renderBodies.length >= 3 && scoringRenderers.length === 0,
  scoringRenderers.length
    ? scoringRenderers.map((r) => r.name).join(', ')
    : `${renderBodies.map((r) => r.name).join(', ')} all read-only`);

/**
 * The brace matcher is the part that can be silently wrong: a body cut short at
 * the first nested `}` would miss a `scoreEntry` call later in the function and
 * report clean. The reject case puts the call AFTER a nested block, so a naive
 * matcher fails it.
 */
const scoresAtRender = (src) =>
  renderFunctionBodies(src).some((r) => /scoreEntry|buildEntry/.test(r.body));
discriminates('G1 render bodies', scoresAtRender, {
  rejects: [
    'function renderToday(e) { scoreEntry(e); }',
    'function renderLog(e) { if (x) { const y = 1; } const s = scoreEntry(e); }',
    'function renderTrend(e) { for (const a of b) { if (c) { d(); } } buildEntry(e); }',
  ],
  accepts: [
    'function renderToday(e) { text(el, entryLine(e)); }',
    'function renderLog(e) { if (x) { dailyLoad(e); } return null; }',
    'function helper(e) { scoreEntry(e); }',          // not a render* function
  ],
});

/* ---------- the markup is well-formed ---------- */

/**
 * Added after a `</main>` lost its `<` during a markup edit and rendered as the
 * visible text "/main>" for a whole step. The browser recovered silently; no
 * test noticed. Structural checks scan script and style, not the document.
 */
const STRUCTURAL_TAGS = ['main', 'nav', 'section', 'div', 'button', 'label', 'p', 'h2'];
const tagUnbalanced = (src, tag) => {
  const open = (src.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length;
  const close = (src.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
  return open !== close;
};
const unbalanced = STRUCTURAL_TAGS.filter((tag) => tagUnbalanced(html, tag));
check('[markup: index.html] every structural tag is balanced', unbalanced.length === 0,
  unbalanced.length ? `unbalanced: ${unbalanced.join(', ')}` : `${STRUCTURAL_TAGS.length} tags checked`);

discriminates('markup balance', (src) => tagUnbalanced(src, 'main'), {
  rejects: ['<main><main></main>', '<main>', '</main>'],
  accepts: ['<main></main>', '<main id="x"></main><main></main>', '<p>no main here</p>'],
});

/**
 * A closing tag that lost its "<" renders as text. Caught by shape.
 *
 * The bound, now asserted rather than assumed: this only matches an orphan alone
 * on its line. The `</main>` defect was alone on its line, which is why this
 * caught it — but `<p>x</p> /main>` would slip through, so the shell is also
 * checked for the inline shape.
 */
const orphanAlone = (src) => (src.match(/^\s*\/[a-z]+>\s*$/gm) ?? []).length > 0;
const orphanInline = (src) => /[^<\s]\s+\/[a-z]+>/.test(src);
const orphanClose = html.match(/^\s*\/[a-z]+>\s*$/gm) ?? [];
check('[markup: index.html] no closing tag has lost its angle bracket',
  !orphanAlone(html) && !orphanInline(html),
  orphanClose.join(' ') || 'none, on its own line or inline');

discriminates('orphan closing tag (own line)', orphanAlone, {
  rejects: ['  /main>\n', '/section>\n'],
  accepts: ['  </main>\n', '<p>fine</p>\n'],
});
discriminates('orphan closing tag (inline)', orphanInline, {
  rejects: ['<p>x</p> /main>', 'text /div>'],
  accepts: ['<p>x</p></main>', '<p>a / b</p>', '<main></main>'],
});

/* ---------- §9.1: single source, and linked from every summary view ---------- */

// Import the real values rather than parsing them out — the point is to compare
// what the module actually exports against what the shell contains.
const DISC = await import('../src/disclosures.js');
const constants = ['PROVENANCE', 'SCOPE', 'COMPARABILITY', 'MACRO_STATEMENT']
  .map((name) => ({ name, text: DISC[name] }));

check('§9.1: all four literal strings are exported by the module',
  constants.every((c) => typeof c.text === 'string' && c.text.length > 40),
  constants.map((c) => `${c.name}:${c.text?.length ?? 0}`).join(' '));

// A distinctive fragment of each, sought in the shell. Any hit is transcription.
const fragmentOf = (text) => text.split('\n')[0].trim().slice(0, 40);
const transcribes = (src, text) => src.includes(fragmentOf(text));
const transcribed = constants.filter((c) => transcribes(html, c.text));
check('[markup+script: index.html vs src/disclosures.js exports] §9.1: no §9 string is transcribed',
  transcribed.length === 0,
  transcribed.length ? transcribed.map((c) => c.name).join(', ') : '4 strings checked, none duplicated');

// The fragments are long enough to be distinctive, and short enough to exist.
// A fragment of '' would make every document "transcribe" it; a fragment longer
// than the string would make nothing ever match.
check('§9.1 fragments are usable: each is 40 chars of real text',
  constants.every((c) => fragmentOf(c.text).length === 40),
  constants.map((c) => `${c.name}:${fragmentOf(c.text).length}`).join(' '));
discriminates('§9.1 transcription', (src) => transcribes(src, constants[0].text), {
  rejects: [`<p>${constants[0].text}</p>`, `x ${fragmentOf(constants[0].text)} y`],
  accepts: ['<p>Something the module does not say.</p>', '<p>PROVENANCE</p>', ''],
});

const redeclaresRefusal = (src) => /BASIS_UNRESOLVED\s*:\s*['"`]/.test(src);
check('§9.1: refusal copy is read from the module, not redeclared (§13.5)',
  /REFUSAL_COPY\s*=\s*DISC\.REFUSAL_COPY/.test(code.html) && !redeclaresRefusal(code.html));
discriminates('§13.5 refusal copy redeclaration', redeclaresRefusal, {
  rejects: ["const C = { BASIS_UNRESOLVED: 'We could not read...' };",
    'const C = { BASIS_UNRESOLVED: `x` };'],
  accepts: ['const REFUSAL_COPY = DISC.REFUSAL_COPY;',
    'if (reason === BASIS_UNRESOLVED) return;'],
});

// §9.1: "linked from every summary view". Assert, do not assume.
const SUMMARY_VIEWS = ['today', 'log', 'trend'];

/**
 * Depth-aware, so a nested `<section>` cannot truncate the slice.
 *
 * The previous form sliced to the FIRST `</section>` after the opening tag. No
 * summary view nests a section today, so it had never been wrong — but a nested
 * section would have silently shortened the slice and reported a missing
 * method-link that was present, and the response to a guard that reports a
 * missing link which is visibly there is to delete the guard.
 */
function sectionOf(src, id) {
  const start = src.indexOf(`<section id="${id}"`);
  if (start === -1) return '';
  const re = /<section[\s>]|<\/section>/g;
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(src))) {
    depth += m[0] === '</section>' ? -1 : 1;
    if (depth === 0) return src.slice(start, m.index + m[0].length);
  }
  return src.slice(start);
}
const hasMethodLink = (section) => /class="[^"]*method-link/.test(section);
const unlinked = SUMMARY_VIEWS.filter((v) => !hasMethodLink(sectionOf(html, v)));
check('[markup: index.html, per-section] §9.1: the method page is linked from every summary view',
  unlinked.length === 0,
  unlinked.length ? `missing on: ${unlinked.join(', ')}` : SUMMARY_VIEWS.join(', '));

// The extractor must find the section, stop at ITS close, and survive nesting.
const NESTED = '<section id="today"><section id="in"></section>'
  + '<button class="method-link"></button></section><section id="other"></section>';
check('§9.1 sectionOf survives a nested <section>',
  hasMethodLink(sectionOf(NESTED, 'today')),
  'a nested section no longer truncates the slice');
check('§9.1 sectionOf stops at its own closing tag',
  !/id="other"/.test(sectionOf(NESTED, 'today')));
discriminates('§9.1 method link', (id) => !hasMethodLink(sectionOf(html, id)), {
  rejects: ['settings', 'nonexistent-view'],   // no method-link: §9.1 requires it only on summary views
  accepts: SUMMARY_VIEWS,
});
check('§9.1: those links are wired, not decorative',
  /querySelectorAll\('\.method-link'\)/.test(code.html));

// §9.1 content: the page builds its tables from the live data modules.
check('§9.1: the attribute table is built from ATTRIBUTES, not typed out',
  /ATTRIBUTE_ORDER\.map/.test(code.html) && /ATTRIBUTES\[id\]/.test(code.html));
check('§9.1: the density table is built from DENSITY_MAP, not typed out',
  /Object\.entries\(DENSITY_MAP\)/.test(code.html));
check('§9.1: the page carries every required section',
  ['m-scope', 'm-prov', 'm-attributes', 'm-servings', 'm-density-rule', 'm-densities',
    'm-scaling', 'm-juice', 'm-comp', 'm-macro', 'm-trend']
    .every((id) => html.includes(`id="${id}"`)));

/* ---------- v1.8: §8.5b combos, §3.3a form constraint, §8.1 ordering ---------- */

/**
 * §8.5b: a combo writes ordinary entries. The shell must not build a composite
 * one — a single entry whose values are the sum of its parts — which is the
 * defect AV-26 exists to catch, here as a structural prohibition on the surface
 * where it would be written.
 */
// Y4: tokens, not substrings — `sum` is inside `summary`.
const sumsComponents = (src) => /reduce\(|\bsum\b|\+=/.test(src);

const comboBlock = (code.html.match(/function comboScoreAndBuild[\s\S]*?\n}/) ?? [''])[0];
check('[script: index.html comboScoreAndBuild] §8.5b: the combo builder builds one entry per component',
  comboBlock.length > 200 && /buildEntry\(/.test(comboBlock) && !sumsComponents(comboBlock),
  `${comboBlock.length} chars`);
discriminates('§8.5b composite-entry prohibition', sumsComponents, {
  rejects: ['const total = components.reduce((a, c) => a + c.score, 0);',
    'let sum = 0; for (const c of cs) sum += c.score;'],
  accepts: ['return buildEntry(scored, component.record, meta);',
    'const scored = scoreEntry(component.record, component.quantity);'],
});

// §8.5b: the component's ORIGINAL source is kept. Nothing is restamped SAVED.
check("[script: index.html] §8.5b: no combo path restamps a component's source",
  !/combo[\s\S]{0,200}source:\s*['"]SAVED['"]/.test(code.html));

// §8.5b: logging is atomic, and the shell routes through the store's logCombo
// rather than looping putEntry itself — a loop here would write partially.
check('[script: index.html] §8.5b: the shell logs a combo through logCombo, not a putEntry loop',
  /await logCombo\(/.test(code.html)
  && !/for\s*\([^)]*of\s+combo\.components[^)]*\)\s*\{[\s\S]{0,200}putEntry/.test(code.html));

/**
 * §3.3a step 2b: the form must ask the SAME question the conversion does. A
 * separate rule in the UI is how a unit gets offered that then refuses.
 */
check('[script: index.html syncVolumeUnits] §3.3a: the form constraint calls resolveVolumeDensity',
  /function syncVolumeUnits[\s\S]{0,400}resolveVolumeDensity\(/.test(code.html));
const guessesDensity = (src) => /density\s*[=:]\s*1(\.0+)?\b/.test(src);
check('[script: index.html] §3.3a: the shell never hardcodes a density to keep a unit available',
  !guessesDensity(code.html));

discriminates('§3.3a density-guess prohibition', guessesDensity, {
  rejects: ['const density = 1.0;', 'return { density: 1 };', 'let density = 1.00;'],
  accepts: ['const d = resolveVolumeDensity(record);', 'if (density === null) return;',
    'density_used: scored.density'],
});

// §3.3: the amount field accepts fractions, so it must parse them, not Number().
check('[script: index.html] §3.3: the quantity field parses fractions via parseAmount',
  /function currentQuantity[\s\S]{0,300}parseAmount\(/.test(code.html)
  && !/function currentQuantity[\s\S]{0,300}Number\(\$\('quantity-value'\)/.test(code.html));

// §8.1: ordering and labelling are decided in sources.js, not in the DOM loop.
check('[script: index.html] §8.1: search rendering uses orderSearchResults and searchResultLabel',
  /orderSearchResults\(/.test(code.html) && /searchResultLabel\(/.test(code.html));
check('[markup: index.html] §8.1: the search screen says a scan is more reliable',
  /search-scan-hint/.test(html) && /scanning the barcode/.test(htmlText));

/* ---------- run ---------- */

console.log('\nSHELL — §13.3 structural constraints');
console.log('='.repeat(36));
for (const l of results) console.log(l);
console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
