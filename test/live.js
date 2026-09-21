/**
 * LIVE service tests — spec v1.6 §2.5, §8.1.
 *
 * Deliberately separate from `npm test`. These hit the real Open Food Facts
 * service, so they are slow, occasionally flaky, and must never gate the build.
 * Run on demand and before each deploy:
 *
 *     npm run test:live
 *
 * WHY THIS FILE EXISTS. §2.5: a fixture verifies that the code handles a
 * response correctly; it cannot verify that the service returns that response
 * for that request. The v2 search defect passed every fixture test in this repo
 * while returning Moroccan mineral water for a cereal query, because no test was
 * ever aimed at the service's actual behaviour.
 *
 * Every assertion here must be able to fail on that defect. `--endpoint=v2`
 * re-runs the search assertions against the old endpoint to prove they do.
 */

import { searchOFF, lookupBarcode, LOOKUP } from '../src/client.js';

const USE_V2 = process.argv.includes('--endpoint=v2');

/**
 * Open Food Facts rate-limits, and a transient 503 must not be mistaken for an
 * answer. Retry with backoff, and let the caller distinguish "the service said
 * no" from "the service did not answer".
 */
async function retryJson(url, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' } });
      if (r.ok) return await r.json();
    } catch { /* fall through to the wait */ }
    await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
  }
  return null;
}
const QUERY = 'cheerios';

let pass = 0, fail = 0, skipped = 0;
const lines = [];
function check(label, ok, note = '') {
  ok ? pass++ : fail++;
  lines.push(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${note ? `  — ${note}` : ''}`);
}
function skip(label, why) { skipped++; lines.push(`  skip ${label}  — ${why}`); }

/** The defective v2 call, kept verbatim so the test can go red on demand. */
async function searchV2(query, limit = 10) {
  const fields = 'code,product_name,quantity,serving_size,nutrition_data_per,'
    + 'nova_group,nutriments,categories_tags,ingredients';
  try {
    const r = await fetch('https://world.openfoodfacts.org/api/v2/search'
      + `?categories_tags_en=&fields=${fields}&page_size=${limit}`
      + `&q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } });
    if (!r.ok) return { status: LOOKUP.ERROR, detail: `HTTP ${r.status}` };
    const b = await r.json();
    const products = b.products ?? [];
    return products.length
      ? { status: LOOKUP.OK, results: products, raw: b }
      : { status: LOOKUP.NOT_FOUND };
  } catch (e) { return { status: LOOKUP.OFFLINE, detail: String(e.message ?? e) }; }
}

/* ------------------------------------------------------------------ */

console.log(`\nLIVE — Open Food Facts (${USE_V2 ? 'v2, the DEFECT' : 'v1, the fix'})`);
console.log('='.repeat(52));

const searchOnce = USE_V2 ? searchV2 : searchOFF;

/**
 * Open Food Facts rate-limits, and a 503 is not an answer about relevance. A
 * transient failure must not read as a red — a false failure erodes trust in the
 * suite as surely as a false green does.
 */
async function search(q, limit = 10) {
  let r = await searchOnce(q, limit);
  for (let i = 0; i < 5 && (r.status === LOOKUP.ERROR || r.status === LOOKUP.OFFLINE); i++) {
    await new Promise((s) => setTimeout(s, 2000 * (i + 1)));
    r = await searchOnce(q, limit);
  }
  return r;
}

const result = await search(QUERY, 10);

if (result.status === LOOKUP.OFFLINE) {
  skip('text search', 'no network — live tests need one, and must not gate the build');
} else if (result.status !== LOOKUP.OK) {
  check('text search returns results', false, `status ${result.status} ${result.detail ?? ''}`);
} else {
  const names = result.results.map((p) => String(p.product_name ?? '')).filter(Boolean);

  // The assertion the old code fails: results must RELATE to the query, not
  // merely exist. "Results came back" was true of the defect too.
  const relevant = names.filter((n) => n.toLowerCase().includes(QUERY));
  check(`results relate to "${QUERY}" — not merely present`,
    relevant.length >= Math.ceil(names.length / 2),
    `${relevant.length}/${names.length} matched: ${names.slice(0, 3).join(' / ')}`);

  /**
   * The direct proof the query is honoured: a nonsense query must not return
   * the same products. Identical results are the signature of an ignored
   * parameter.
   *
   * A service ERROR is NOT a pass. The first version of this check reported
   * green on `nonsense → ERROR`, which proves nothing about whether the query
   * was honoured — the same §2.5 trap this file exists to close, reappearing
   * inside the file itself.
   */
  const nonsense = await search('xyzzyqwertyplugh', 10);
  if (nonsense.status === LOOKUP.OFFLINE || nonsense.status === LOOKUP.ERROR) {
    skip('a nonsense query returns something different',
      `inconclusive: nonsense query returned ${nonsense.status}, which proves nothing either way`);
  } else if (nonsense.status === LOOKUP.NOT_FOUND) {
    check('a nonsense query returns nothing — the query IS honoured', true, 'NOT_FOUND');
  } else {
    const sameTop = String(nonsense.results[0]?.product_name ?? '')
      === String(result.results[0]?.product_name ?? '');
    check('a nonsense query returns something different', !sameTop,
      sameTop ? `both returned "${result.results[0]?.product_name}" — the query is ignored`
        : `${nonsense.results.length} different products`);
  }

  /**
   * §8.1: text search is filtered to US products. Asserted against the RAW
   * service, because shapeOFF does not carry countries_tags through — checking
   * the shaped record found 0 of 0 and passed vacuously (§2.5).
   *
   * The filter is proven by its effect: filtered and unfiltered counts must
   * differ for a query with results in more than one country.
   */
  if (!USE_V2) {
    const raw = (extra) => retryJson('https://world.openfoodfacts.org/cgi/search.pl'
      + `?search_terms=${encodeURIComponent(QUERY)}&search_simple=1&action=process`
      + `&json=1&page_size=5${extra}`);
    const filtered = await raw('&countries_tags_en=United%20States');
    const global = await raw('');
    if (!filtered || !global) {
      skip('§8.1: the US filter takes effect', 'raw comparison request failed');
    } else {
      check('§8.1: the US filter takes effect — filtered count differs from global',
        filtered.count < global.count && filtered.count > 0,
        `US ${filtered.count} vs global ${global.count}`);
      const tags = (filtered.products ?? []).flatMap((p) => p.countries_tags ?? []);
      check('§8.1: every filtered result carries en:united-states',
        tags.length > 0 && (filtered.products ?? [])
          .every((p) => (p.countries_tags ?? []).includes('en:united-states')),
        `${(filtered.products ?? []).length} products, ${tags.length} country tags seen`);
    }
  }

  // §3.3c / §3.1 / §2.1 need these. Search-a-licious would fail this one.
  const usable = result.results.filter((p) => p.nutriments && Object.keys(p.nutriments).length > 0);
  check('results carry the fields §3.3c and §2.1 need',
    usable.length >= Math.ceil(result.results.length / 2),
    `${usable.length}/${result.results.length} carry nutriments`);
}

/* Barcode lookup is a different endpoint and must be unaffected (§8.1). */
const barcode = await lookupBarcode('0016000275645');   // Cheerios, US
if (barcode.status === LOOKUP.OFFLINE) {
  skip('barcode lookup', 'no network');
} else {
  check('§8.1: barcode lookup still resolves on the product endpoint',
    barcode.status === LOOKUP.OK, barcode.status);
  if (barcode.status === LOOKUP.OK) {
    check('barcode lookup is not country-filtered',
      !!barcode.raw?.product_name, barcode.raw?.product_name ?? '(no name)');
  }
}

for (const l of lines) console.log(l);
console.log(`\n${'-'.repeat(52)}`);
console.log(`${pass + fail} assertions, ${fail} failed, ${skipped} skipped`);

if (USE_V2) {
  console.log('\nRun against v2 deliberately: failures here are the point (§2.5).');
  process.exit(fail > 0 ? 0 : 1);   // v2 SHOULD fail; green would mean the test is inert
}
process.exit(fail === 0 ? 0 : 1);
