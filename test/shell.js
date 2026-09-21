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
const badIdentifiers = [...new Set(
  authored.filter((n) => tokenize(n).some((t) => FORBIDDEN_TOKENS.has(t)))
)];
check('[markup+script: index.html, sw.js, select.js] §13.3: no authored name denotes a target, ring, gauge, streak or badge',
  badIdentifiers.length === 0,
  badIdentifiers.length ? badIdentifiers.join(', ') : `${new Set(authored).size} authored names scanned`);

/* ---------- §13.3: no notification, badge or reminder ---------- */

const NOTIFY_APIS = [
  /\bnew\s+Notification\b/, /\.showNotification\s*\(/, /Notification\.requestPermission/,
  /\.setAppBadge\s*\(/, /\.clearAppBadge\s*\(/, /addEventListener\s*\(\s*['"]push['"]/,
  /addEventListener\s*\(\s*['"]notificationclick['"]/, /\bperiodicSync\b/, /\bshowTrigger\b/,
];
const usedNotify = NOTIFY_APIS.filter((re) => re.test(all)).map((re) => String(re));
check('[script: index.html, sw.js, select.js] §13.3: no notification, badge, push or reminder API is reachable',
  usedNotify.length === 0, usedNotify.join(' | ') || 'none of 9 APIs present');

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

/* ---------- §4.4: entries are never banded or coloured ---------- */

const css = (html.match(/<style>([\s\S]*?)<\/style>/) ?? [, ''])[1];
const entryRules = [...css.matchAll(/\.entry[^{]*\{([^}]*)\}/g)].map((m) => m[1]);
const colouredEntry = entryRules.filter((r) => /(^|[^-])color\s*:\s*(?!var\(--fg\)|var\(--dim\)|inherit)/.test(r));
check('[style: index.html <style>] §4.4: no .entry rule sets a colour outside the neutral palette',
  colouredEntry.length === 0, colouredEntry.join(' | ') || `${entryRules.length} entry rules, all neutral`);

check('§4.4: no band label reaches an entry — bands come only from day/window helpers',
  !/bandDaily|bandWindow/.test(code.html),
  'shell calls completedDaySummary/windowSummary, which band internally');

const BAND_CLASS = /class\s*=\s*["'][^"']*\b(low|neutral|elevated|high)\b/i;
check('§4.4: no band-derived CSS class on any element', !BAND_CLASS.test(code.html));

/* ---------- §8.6 / §13.3: offline ---------- */

check('§8.6: a service worker caches the shell and engine modules',
  /caches\.open/.test(code.sw) && /addAll/.test(code.sw) && /src\/display\.js/.test(sw));
check('§8.6: fetch handler serves from cache first',
  /caches\.match/.test(code.sw));
check('§13.3: the app opens without IndexedDB rather than dead-ending',
  /MemoryBackend/.test(code.html), 'falls back to an in-memory store');
check('§8.6: no framework or build step — modules loaded natively',
  /<script type="module">/.test(html) && !/require\(|from ['"](?!\.\/)/.test(code.html));

/* ---------- reported gap ---------- */

check('src/select.js is labelled a reported gap, not a silent addition',
  /REPORTED GAP/.test(select));

/* ---------- G1: rendering reads, it never scores ---------- */

const IMPORT_RE = /from\s+['"]([^'"]+)['"]/g;
const importsOf = (file) => [...readFileSync(file, 'utf8').matchAll(IMPORT_RE)].map((m) => m[1]);

function reachable(entry, seen = new Set()) {
  for (const spec of importsOf(entry)) {
    if (!spec.startsWith('.')) continue;                    // bare specifiers: node builtins
    const path = 'src/' + spec.replace(/^\.\.?\//, '');
    if (seen.has(path)) continue;
    seen.add(path);
    try { reachable(path, seen); } catch { /* leaf or unresolvable */ }
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
 * G1 forbids scoring at RENDER time, not at write time. The logging flow (§13.2)
 * legitimately calls scoreEntry — §8.4 entries are built from a score when they
 * are written. So the check is scoped to the render functions, which must read
 * stored entries only.
 */
const renderBodies = [...code.html.matchAll(/function (render[A-Za-z]*)\s*\([^)]*\)\s*\{/g)]
  .map((m) => {
    const start = m.index + m[0].length;
    let depth = 1, i = start;
    while (i < code.html.length && depth > 0) {
      if (code.html[i] === '{') depth++;
      else if (code.html[i] === '}') depth--;
      i++;
    }
    return { name: m[1], body: code.html.slice(start, i) };
  });
const scoringRenderers = renderBodies.filter((r) => /scoreEntry|buildEntry/.test(r.body));
check('[script: index.html render* function bodies] G1: no render function scores',
  renderBodies.length >= 3 && scoringRenderers.length === 0,
  scoringRenderers.length
    ? scoringRenderers.map((r) => r.name).join(', ')
    : `${renderBodies.map((r) => r.name).join(', ')} all read-only`);

/* ---------- the markup is well-formed ---------- */

/**
 * Added after a `</main>` lost its `<` during a markup edit and rendered as the
 * visible text "/main>" for a whole step. The browser recovered silently; no
 * test noticed. Structural checks scan script and style, not the document.
 */
const STRUCTURAL_TAGS = ['main', 'nav', 'section', 'div', 'button', 'label', 'p', 'h2'];
const unbalanced = STRUCTURAL_TAGS.filter((tag) => {
  const open = (html.match(new RegExp(`<${tag}[\\s>]`, 'g')) ?? []).length;
  const close = (html.match(new RegExp(`</${tag}>`, 'g')) ?? []).length;
  return open !== close;
});
check('[markup: index.html] every structural tag is balanced', unbalanced.length === 0,
  unbalanced.length ? `unbalanced: ${unbalanced.join(', ')}` : `${STRUCTURAL_TAGS.length} tags checked`);

// A closing tag that lost its "<" renders as text. Catch the shape directly.
const orphanClose = html.match(/^\s*\/[a-z]+>\s*$/gm) ?? [];
check('[markup: index.html] no closing tag has lost its angle bracket', orphanClose.length === 0,
  orphanClose.join(' ') || 'none');

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
const transcribed = constants.filter((c) => {
  const fragment = c.text.split('\n')[0].trim().slice(0, 40);
  return html.includes(fragment);
});
check('[markup+script: index.html vs src/disclosures.js exports] §9.1: no §9 string is transcribed',
  transcribed.length === 0,
  transcribed.length ? transcribed.map((c) => c.name).join(', ') : '4 strings checked, none duplicated');

check('§9.1: refusal copy is read from the module, not redeclared (§13.5)',
  /REFUSAL_COPY\s*=\s*DISC\.REFUSAL_COPY/.test(code.html)
  && !/BASIS_UNRESOLVED\s*:\s*['"`]/.test(code.html));

// §9.1: "linked from every summary view". Assert, do not assume.
const SUMMARY_VIEWS = ['today', 'log', 'trend'];
const sectionOf = (id) => {
  const start = html.indexOf(`<section id="${id}"`);
  return start === -1 ? '' : html.slice(start, html.indexOf('</section>', start));
};
const unlinked = SUMMARY_VIEWS.filter((v) => !/class="[^"]*method-link/.test(sectionOf(v)));
check('[markup: index.html, per-section] §9.1: the method page is linked from every summary view',
  unlinked.length === 0,
  unlinked.length ? `missing on: ${unlinked.join(', ')}` : SUMMARY_VIEWS.join(', '));
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

/* ---------- run ---------- */

console.log('\nSHELL — §13.3 structural constraints');
console.log('='.repeat(36));
for (const l of results) console.log(l);
console.log(`\n${'-'.repeat(72)}`);
console.log(`${pass + fail} assertions, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
