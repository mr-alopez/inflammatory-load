/**
 * Screenshots of the SHIPPED app in Ledger, every screen, light and dark, at
 * phone width (390×844, 2×) — the v2.3 handoff's report item (d).
 *
 * Unlike tools/design-frames.mjs, which styled captured markup, this drives the
 * real app over the Chrome DevTools Protocol: a fresh profile, seeded through
 * the app's own modules (store, scoring, entry), then navigated by clicking.
 * Lookups by barcode go to Open Food Facts for real.
 *
 *   node tools/serve.mjs            (in another terminal; or the preview server)
 *   node tools/ledger-shots.mjs [http://localhost:8123]
 *
 * Writes design/ledger/*.png and design/ledger/sheet-*.png.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ORIGIN = process.argv[2] ?? 'http://localhost:8123';
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const out = resolve('design/ledger');
mkdirSync(out, { recursive: true });
const profile = join(tmpdir(), `il-ledger-${process.pid}`);

const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--no-default-browser-check', `--user-data-dir=${profile}`, `--remote-debugging-port=${PORT}`, 'about:blank'],
{ stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('Chrome did not start');
}

const ws = new WebSocket(await target());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
  ws.send(JSON.stringify({ id, method, params }));
});
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function until(expression, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evaluate(`!!(${expression})`)) return;
    await sleep(150);
  }
  throw new Error(`timed out waiting for: ${expression}`);
}
async function go(url) {
  await send('Page.navigate', { url });
  await until('document.readyState === "complete" && document.querySelector("#today-load")');
  await sleep(600);
}
const click = (sel) => evaluate(`(document.querySelector(${JSON.stringify(sel)}).click(), true)`);
const setValue = (sel, v) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)});
  el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

/* ---------------- seed, through the app's own modules ---------------- */

await go(`${ORIGIN}/`);
const seeded = await evaluate(`(async () => {
  const { EntryStore } = await import('/src/store.js');
  const { openDatabase } = await import('/src/backends/indexeddb.js');
  const { scoreEntry } = await import('/src/scoring.js');
  const { buildEntry } = await import('/src/entry.js');
  const { shapeOFF } = await import('/src/client.js');
  const { resolveFromOFF, quantityShortcuts, enteredShortcut } = await import('/src/sources.js');
  const store = new EntryStore(await openDatabase());

  const iso = (d) => d.toISOString().slice(0, 10);
  const day = (back) => { const d = new Date(); d.setHours(12); d.setDate(d.getDate() - back); return iso(d); };
  let n = 0;
  const put = async (record, quantity, local_date, extra = {}) => {
    const s = scoreEntry(record, quantity);
    if (!s.created) throw new Error(record.name + ': ' + s.reason);
    const e = buildEntry(s, record, { entry_id: 'seed-' + (n++), food_name: record.name, quantity, local_date, ...extra });
    await store.putEntry(extra.coeff_version ? { ...e, coeff_version: extra.coeff_version } : e);
  };
  const usda = (name, per100, cls = {}, density = null) => ({
    name, product_id: 'usda:' + name, source: 'USDA', classifications: cls,
    ...(density ? { derived_density: density } : {}), occasion_category: 'UNCATEGORIZED', category_map_version: 'CATMAP-1',
    reported: per100,
  });
  const R = (a, s, f, fi, k, p, c, fat) => ({ added_sugar_g: a, sodium_mg: s, saturated_fat_g: f, fiber_g: fi,
    energy_kcal: k, protein_g: p, carbohydrate_g: c, fat_g: fat });
  const coffee = usda('Coffee, brewed', R(0, 2, 0.002, 0, 1, 0.12, 0, 0.02), {}, { mass_g: 237, volume_ml: 236.5882365 });
  const sugar = usda('Sugar, granulated', R(99.8, 1, 0, 0, 387, 0, 99.98, 0), {}, { mass_g: 200, volume_ml: 236.5882365 });
  const milk = usda('Lactaid Reduced Fat Milk', R(0, 44, 1.25, 0, 50, 3.3, 5, 2), {}, { mass_g: 244, volume_ml: 236.5882365 });
  const almonds = usda('Almonds, raw', R(0, 1, 3.8, 12.5, 579, 21.2, 21.6, 49.9), { A5: true });
  const apple = usda('Apple, raw', R(0, 1, 0.03, 2.4, 52, 0.26, 13.8, 0.17), { A4: true });
  const oats = usda('Oats, rolled', R(0, 2, 1.2, 10.1, 379, 13.2, 67.7, 6.5), { A7: true });
  const crackers = resolveFromOFF(shapeOFF({ code: '0819898010752', product_name: 'Harvest Whole Wheat Crackers',
    nutrition_data_per: '100g', quantity: null, serving_size: '5 crackers (30 g)', nova_group: 4,
    categories_tags: ['en:crackers'], ingredients: [{ text: 'whole wheat flour' }],
    nutriments: { 'added-sugars_100g': 3.3, sodium_100g: 0.53, 'saturated-fat_100g': 1.7, fiber_100g: 10,
      'energy-kcal_100g': 433, proteins_100g: 10, carbohydrates_100g: 70, fat_100g: 13.3 } })).record;
  const bread = { name: 'Organic Bread 21 Whole Grains and Seeds', product_id: 'local:bread', source: 'MANUAL',
    manual: { serving_mass_g: 45 }, classifications: { A7: true, P5: true },
    reported: R(5, 170, 0, 5, 120, 5, 22, 1.5), occasion_category: 'UNCATEGORIZED', category_map_version: 'CATMAP-1',
    prefilled_from: { source: 'OFF', product_id: 'off:0013764028029' }, prefill_changed: [] };

  // Sixteen days back, with one empty block for the trend's gap tick.
  const rotation = [[almonds, 28], [apple, 150], [oats, 40], [almonds, 20], [apple, 120]];
  for (let back = 17; back >= 1; back--) {
    if (back >= 9 && back <= 11) continue;                          // an empty block
    const [food, g] = rotation[back % rotation.length];
    // The oldest day in the comparison window was logged under COEFF-1.
    await put(food, { value: g, unit: 'g' }, day(back), back === 3 ? { coeff_version: 'COEFF-1' } : {});
    await put(crackers, { value: 30 + back, unit: 'g' }, day(back));
  }
  // Today: the morning coffee combo, a shortcut entry, the prefilled bread.
  const combo = { combo_id: 'combo:Morning coffee', combo_name: 'Morning coffee' };
  await put(coffee, { value: 12, unit: 'fl oz' }, day(0), combo);
  await put(sugar, { value: 2 / 3, unit: 'tbsp' }, day(0), combo);
  await put(milk, { value: 2, unit: 'fl oz' }, day(0), combo);
  const serving = quantityShortcuts(crackers).find((s) => s.id === 'serving');
  await put(crackers, enteredShortcut(serving, 2), day(0));
  await put(bread, { value: 45, unit: 'g' }, day(0));
  await put(almonds, { value: 28, unit: 'g' }, day(0));

  // The combo itself, so its chip shows on Today.
  const { ComboStore, buildCombo } = await import('/src/store.js');
  const combos = new ComboStore(store.backend);
  await combos.put(buildCombo({ name: 'Morning coffee', components: [
    { food_name: coffee.name, record: coffee, quantity: { value: 12, unit: 'fl oz' } },
    { food_name: sugar.name, record: sugar, quantity: { value: 2 / 3, unit: 'tbsp' } },
    { food_name: milk.name, record: milk, quantity: { value: 2, unit: 'fl oz' } },
  ] }));
  return n;
})()`);
console.log(`  seeded ${seeded} entries`);

/* ---------------- screens ---------------- */

const SCREENS = [
  ['today', 'Today', async () => { await click('nav [data-screen="today"]'); }],
  ['today-entries', 'Today — entries', async () => {
    await click('nav [data-screen="today"]');
    await evaluate('(document.querySelector("#today-entries").scrollIntoView(), window.scrollBy(0, -40), true)');
  }],
  ['log', 'Log', async () => { await click('nav [data-screen="log"]'); }],
  ['add', 'Add', async () => { await click('nav [data-screen="add"]'); }],
  ['add-prefill', 'Add — prefilled bread', async () => {
    await click('nav [data-screen="add"]'); await click('[data-path="scan"]');
    await setValue('#scan-manual-code', '4099100042955'); await click('#scan-lookup');
    await until('!document.querySelector("#add-manual").hidden', 30000);
  }],
  ['add-quantity', 'Add — quantity, shortcuts', async () => {
    await click('nav [data-screen="add"]'); await click('[data-path="scan"]');
    await setValue('#scan-manual-code', '0819898010752'); await click('#scan-lookup');
    await until('!document.querySelector("#add-quantity").hidden', 30000);
    await click('#quantity-serving');
  }],
  ['trend', 'Trend', async () => { await click('nav [data-screen="trend"]'); }],
  ['method', 'Method', async () => { await click('nav [data-screen="method"]'); }],
  ['settings', 'Settings', async () => { await click('nav [data-screen="settings"]'); }],
];

for (const theme of ['light', 'dark']) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  for (const [id, , act] of SCREENS) {
    await go(`${ORIGIN}/`);
    await act();
    await sleep(500);
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(out, `${id}-${theme}.png`), Buffer.from(data, 'base64'));
    console.log(`  ${id}-${theme}.png`);
  }
}

/* ---------------- contact sheets: light above dark ---------------- */

const halves = [SCREENS.slice(0, 5), SCREENS.slice(5)];
for (const [i, part] of halves.entries()) {
  const cells = ['light', 'dark'].map((theme) => `<div class="row"><div class="mode">${theme}</div>${part.map(([id, t]) =>
    `<figure><img src="${id}-${theme}.png" width="390" height="844"><figcaption>${t}</figcaption></figure>`).join('')}</div>`).join('');
  const sheet = join(out, `sheet-${i + 1}.html`);
  writeFileSync(sheet, `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:28px 32px;background:#8e959b;font:15px/1.4 system-ui,sans-serif;color:#111}
    h1{margin:0 0 18px;font-size:24px}
    .row{display:flex;gap:22px;align-items:flex-start;margin-bottom:20px}
    .mode{writing-mode:vertical-rl;transform:rotate(180deg);font:700 13px system-ui;letter-spacing:.2em;
          text-transform:uppercase;align-self:center}
    figure{margin:0} img{display:block;border-radius:22px;box-shadow:0 6px 24px rgba(0,0,0,.28)}
    figcaption{font:600 13px system-ui;margin-top:8px;text-align:center}
  </style><h1>Ledger, as shipped — ${i === 0 ? 'Today, Log, Add' : 'Add, Trend, Method, Settings'}</h1>${cells}`);
  const w = 32 * 2 + 30 + part.length * 412;
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 1900, deviceScaleFactor: 1, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await send('Page.navigate', { url: pathToFileURL(sheet).href });
  await sleep(1500);
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(out, `sheet-${i + 1}.png`), Buffer.from(data, 'base64'));
  console.log(`  sheet-${i + 1}.png`);
}

ws.close();
chrome.kill();
await sleep(500);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still hold a lock */ }
