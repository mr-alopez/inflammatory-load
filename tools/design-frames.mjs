/**
 * Render the v2.0 design directions as screenshots.
 *
 * Every frame is the app's REAL markup — captured from the running app with
 * real data, in design/snapshots/ — under one direction's stylesheet, in light
 * or dark. The directions differ ONLY in CSS, so what is shown is exactly what
 * the chosen one would ship. One markup change is assumed by all three and is
 * already in the Today snapshot: the combo strip and the Add button share a
 * `.today-actions` wrapper, so they can sit together within thumb reach.
 *
 *   node tools/design-frames.mjs
 *
 * Writes design/frames/*.html and one design/direction-<id>.png sheet per direction.
 */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const root = resolve('design');
const frames = join(root, 'frames');
mkdirSync(frames, { recursive: true });

const DIRECTIONS = [
  ['a-meso', 'A — Meso', 'Shares Meso Tracker\u2019s language: cool paper, ink-ruled cards, one signal blue, mono numerals.'],
  ['b-notebook', 'B — Notebook', 'A notebook, literally: warm paper, a serif, entries written on ruled lines rather than boxed.'],
  ['c-ledger', 'C — Ledger', 'No hue at all: hierarchy from size and weight, the figure large, combos as chips.'],
];
const SCREENS = [['today', 'Today'], ['add', 'Add'], ['prefill', 'Add \u2014 prefilled refusal']];
const THEMES = ['light', 'dark'];

const profile = join(tmpdir(), `il-design-${process.pid}`);
function shoot(html, png, w = 390, h = 844, scale = 2) {
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profile}`, `--window-size=${w},${h}`, `--force-device-scale-factor=${scale}`,
    `--screenshot=${png}`, pathToFileURL(html).href,
  ], { stdio: 'ignore' });
}

for (const [id] of DIRECTIONS) {
  for (const [screen] of SCREENS) {
    const body = readFileSync(join(root, 'snapshots', `${screen}.html`), 'utf8');
    for (const theme of THEMES) {
      const name = `${id}-${screen}-${theme}`;
      const html = join(frames, `${name}.html`);
      writeFileSync(html, `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="../direction-${id}.css"></head><body>
${body}
</body></html>`);
      console.log(`  ${name}.html`);
    }
  }
}

/**
 * One contact sheet per direction: three screens, light above dark.
 *
 * Each frame is an IFRAME exactly 390×844, not a screenshot of a 390-wide
 * window. Headless Chrome will not size a window below roughly 500 px, so a
 * frame shot directly laid out wider than a phone and was cropped — the first
 * render cut off the nav's last button and the right edge of every card. An
 * iframe is a true 390 px viewport: position:fixed, sticky and vh all resolve
 * against it exactly as they would on the phone.
 */
for (const [id, label, intent] of DIRECTIONS) {
  const cells = THEMES.map((theme) => `<div class="row"><div class="mode">${theme}</div>${SCREENS.map(([s, t]) =>
    `<figure><iframe src="frames/${id}-${s}-${theme}.html" width="390" height="844" scrolling="no"></iframe><figcaption>${t}</figcaption></figure>`).join('')}</div>`).join('');
  const sheet = join(root, `sheet-${id}.html`);
  writeFileSync(sheet, `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:28px 32px;background:#8e959b;font:15px/1.4 system-ui,sans-serif;color:#111}
    h1{margin:0 0 4px;font-size:24px} p{margin:0 0 18px;font-size:15px;max-width:1100px}
    .row{display:flex;gap:22px;align-items:flex-start;margin-bottom:20px}
    .mode{writing-mode:vertical-rl;transform:rotate(180deg);font:700 13px system-ui;letter-spacing:.2em;
          text-transform:uppercase;align-self:center;color:#111}
    figure{margin:0} iframe{width:390px;height:844px;display:block;border:0;border-radius:22px;
          box-shadow:0 6px 24px rgba(0,0,0,.28);background:#fff}
    figcaption{font:600 13px system-ui;margin-top:8px;text-align:center}
  </style><h1>Direction ${label}</h1><p>${intent}</p>${cells}`);
  shoot(sheet, join(root, `direction-${id}.png`), 1340, 1880, 2);
  console.log(`  direction-${id}.png`);
}

rmSync(profile, { recursive: true, force: true });
