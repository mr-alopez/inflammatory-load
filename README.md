# Inflammatory Load

Implements spec **v1.3**, §11 steps 1–9 of 10. Only the swap engine (step 10)
remains.

```bash
npm test       # 7 suites
npm run audit  # W1 round audit, both directions
```

## What is built

| Step | | |
|---|---|---|
| 1 | Scoring core — §3.3c → §3.3a → §3.3b → §3.3, §3.1, §3.6 | done |
| 2 | Storage, `SCHEMA-3`, immutability, §8.6a carve-out | done |
| 3 | Source resolution, manual entry, saved products | done |
| 4 | Macro capture, §4.6 normalization | done |
| 5 | §6 display strings, §4 banding | done |
| 6 | Application shell (§13) | done |
| 7 | Logging flow (§13.2) | done |
| 8 | §4.5 trend | done |
| 9 | §9 method page | done |
| 10 | §7 swap engine — AV-3, AV-23, AV-24 | not started |

No LLM anywhere in the path (§8.3). No basis, density, or classification is
inferred — each resolves from a declared field or an explicit rule, or the entry
is refused and the user lands somewhere they can continue from (§13.2).

```
src/coefficients.js       COEFF-1 attribute table, serving masses.
src/density-map.js        DMAP-2 loader — densities + tag mapping (data/).
src/scoring.js            The pipeline. Pure: no I/O, no globals, no framework.
src/schema.js             SCHEMA-3 field list and immutability classes.
src/entry.js              Single implementation of §8.4's storage contract.
src/store.js              Storage, migrations, §8.6a carve-out, wipe.
src/select.js             §1.2 day/window selection, §4.5 trend blocks.
src/macros.js             §2.5 macros, §4.6 normalization.
src/display.js            §5.3 drivers, §6 strings, §4 banding. Reads only.
src/disclosures.js        §9.2–§9.5 and §13.5 literal strings. Single source.
src/sources.js            §8.1/§8.2 resolution and refusal.
src/manual.js             §8.5 manual entry, §8.5a saved products.
src/client.js             OFF and USDA network clients.
index.html                The PWA shell — all markup, style, app script (§8.6).
sw.js                     Network-first shell, cache-first assets (Z1).
tools/audit.mjs           The W1 round audit.
```

## §3.3b density cancellation — derived independently

The spec asserts this in §3.3b. Re-derived here from the rule statements rather
than copied, per the handoff.

Let `R` be the reported value on the record's own basis, `d` the density in
g/ml, `V` the entered volume in ml.

**Case 1 — `per_100ml` record, entered in ml.**

§3.3b normalization gives `per_gram = R / 100 / d`.
§3.3a conversion gives `quantity_g = V × d`.

```
as_consumed = (R / (100 d)) × (V d) = R V / 100
```

`d` cancels exactly. The as-consumed value is independent of the density, so an
error in `d` cannot propagate into a nutrient value on this path. Confirmed
against AV-8: 8.7 × 240 / 100 = 20.88, and the implementation returns 20.88 with
`d = 1.04` live in both factors.

**Case 2 — `per_100g` record, entered in ml.**

```
per_gram = R / 100
quantity_g = V × d
as_consumed = R V d / 100
```

`d` applies **once**, on the quantity side only. This is why AV-10's olive oil is
sensitive to the density and AV-8's juice is not — they differ in basis, not in
liquid-ness. An implementation that treats the two cases alike fails one or the
other.

**Case 3 — `per_serving` record whose serving is stated in volume.**

```
per_gram = R / (serving_ml × d)
quantity_g = V × d
as_consumed = R V / serving_ml
```

`d` cancels, as in case 1.

The derivation agrees with §3.3b. No disagreement to report.

## Fixture modelling decisions

Choices the spec did not make for me. Flagged, not folded in silently.

1. **AV-10's source is modelled as USDA.** The vector states basis `per_100g`
   with a 15 ml entry but names no source. It cannot be an OFF record: §3.3c
   rule 2 turns any OFF product with a volumetric package quantity into
   `per_100ml`, which contradicts the vector. USDA is always `per_100g` (§3.3c),
   so USDA — or an OFF oil sold by mass — is the only consistent reading.

2. **Basis provenance for everything except rule 2 is `DECLARED`.** §8.4's enum
   has exactly two values and K3 names only rule 2 as `DERIVED_RULE_2`, so the
   rest are `DECLARED` by elimination. §3.3c never states it.

3. **Liquid class is a declared field on the record.** §3.3a step 2 says the
   density map is keyed on "the product's liquid classification (§3.3c)", but
   §3.3c is basis resolution and defines no such thing; §7.2a is where liquid
   classification is actually defined, keyed on the source record's own category
   tags. Modelled as `record.density_class`, a category-tag lookup.

4. **Vectors that state no macro fields assert nothing about completeness.**
   §10 says macros are stated only in vectors that test them, but §3.2 marks an
   entry `INCOMPLETE` for any null macro. AV-1, AV-7, AV-9 and others would all
   be `INCOMPLETE` under a literal reading. The fixtures leave macros null and
   make no completeness assertion for those vectors.

5. **§3.5 juice field selection is out of scope for step 1.** AV-8 supplies the
   total-sugars value already selected into the `P1` slot. §11 step 1 lists
   §3.3c, §3.3a, §3.3b, §3.3, §3.1 and §3.6; §3.5 is not among them.

6. **`P5` serving mass for an unlabelled liquid** is implemented as 100 ml × d
   per §3.3's parenthetical. No vector exercises it.

## Storage decisions (§11 step 2)

Choices the spec did not make. Flagged, not folded in.

1. **`entry_id` is a new field.** §8.4's list identifies an entry by "resolved
   product ID", which is not unique — two apples on the same day share it. The
   store adds `entry_id` as the primary key. §8.4 needs it.

2. **Every §8.4 field is immutable, so entries are append-only.** §8.4 says
   values are "immutable once written" and prior days are "read-only without
   exception", and names no mutable field. `updateEntry` therefore always
   rejects; it exists to enforce and prove the rejection, and reports which rule
   fired (`IMMUTABLE_FIELD` vs `PRIOR_DAY_READ_ONLY`). Note that §7.2a's user
   category override edits the *product*, not a logged entry.

3. **Entries are deep-frozen on write and on read.** In JavaScript the real
   immutability failure is handing a caller a live reference. `Object.freeze`
   applied recursively makes the violation throw rather than silently corrupt
   the audit trail. Suite B tests this directly.

4. **The backend is injectable.** Node has no IndexedDB, so `src/store.js` holds
   the schema, migration, and immutability logic over a small backend
   interface; `backends/indexeddb.js` is the PWA backend and
   `backends/memory.js` is what the tests drive. §8.4's invariants are the point
   of this layer and they need to be testable without a browser.

5. **§8.6a is implemented as decisions, not strings.** AV-21 asserts that the
   day macro line is *omitted*, which is a §6.2b rendering outcome, but §11 step
   2 excludes display. The carve-out is exposed as `dayMacroLinePolicy()` →
   `OMIT | PARTIAL | FULL` and `windowNormalizationStatus()` →
   `AVAILABLE | NO_ENTRIES | NO_CALORIE_DATA`. Step 5 renders them.

6. **`deepClone` is a JSON round-trip.** Safe for doubles, but it maps `NaN` and
   `Infinity` to `null` and drops `undefined`. No current path produces a
   non-finite score; if one ever can, this needs `structuredClone`.

## Source-resolution decisions (§11 step 3)

1. **AV-11/12/13 are modelled as OFF rule 3** — `nutrition_data_per: "100g"`
   with a mass package quantity. The vectors state `per_100g` but no source, and
   rule 3 was the only §3.3c path with no coverage.

2. **They are given complete macro values.** §10's C4 convention says a vector
   stating no macro fields "asserts nothing about INCOMPLETE status", but AV-11's
   own text asserts it renders `Incomplete — missing sodium` — an exact list, and
   §6.4 puts macro fields in that list. With macros null the list would read
   `sodium, kcal, protein, carbs, fat`. Supplying them makes the vector's own
   assertion true.

3. **`ABSENT` is a distinct sentinel.** §8.5 requires each field to be supplied
   *or explicitly marked absent*, so omitting one is an input error
   (`FIELD_NOT_STATED`) and marking it absent is a valid statement. A field
   marked absent reads as null and marks the entry `INCOMPLETE`.

4. **Grain majority uses only a declared `percent`.** Open Food Facts also
   exposes `percent_estimate`, which OFF computes itself — using it would be
   inference wearing a field's clothes, which §8.3 prohibits. Both grain types
   present with no declared percentage means the classification does not resolve.

5. **`PRODUCT_CACHE` is the enforcement point for "never promoted".** §8.5 and
   §8.5a prohibit manual and saved values reaching a shared or cached record but
   name no mechanism. `promoteToProductCache()` refuses any `MANUAL` or `SAVED`
   record, which makes the prohibition testable rather than aspirational.

6. **Refusal happens at the source layer.** Unresolved basis, unresolved density
   and unknown grain majority refuse in `sources.js`, so "not scored and not
   stored" is a resolution outcome rather than something the scoring core
   discovers after the fact.

7. **A saved product's `product_id` is its `saved_id`.** §8.5a does not say.
   This keeps an entry traceable to the local saved record and never to a shared
   product id.

## Macro and normalization decisions (§11 step 4)

1. **`load_per_1000` is absent, not null, when a precondition fails.** §4.6 says
   it "is not computed", so the key does not appear on the result at all. The
   tests assert key absence and use an `onDivide` hook to prove no division ran
   — AV-18's defect is computing 0/0, which a null-valued key would not catch.

2. **`windowNormalizationStatus()` moved from `store.js` to `macros.js`.** Step 2
   stubbed it (E5); step 4 owns it. `store.js` re-exports so nothing else moved.

3. **A `NOT_APPLICABLE` entry is exempt from `partial` as well as from
   `INCOMPLETE`.** S4 exempts it from `INCOMPLETE` explicitly and from §4.6 by
   the denominator rule, but says nothing about §6.2b's ` · partial`. The same
   reasoning applies — it has no macro values to lack — so it does not make a
   day partial. Flagged rather than assumed.

4. **§2.5's prohibitions are enforced structurally.** The test greps the module's
   entire export surface and every returned object shape for
   `target|goal|budget|remaining|progress|quota|allowance|band|colour|verdict`.
   There is no code path capable of producing one, which is what §2.5 asks for.

5. **Macro values are read from `entry.macros` first, then `entry.as_consumed`.**
   §8.4 stores both; nothing says which is authoritative for aggregation. They
   are written from the same source, so this only matters if they ever diverge.

## Display decisions (§11 step 5)

1. **§2.4's rule does not produce the names six vectors assert.** Applied
   literally — "the §2.1/§2.2 name, lowercase" — it yields
   `ultra-processed (nova 4)`, `deep-fried preparation`, `fruit (whole)` and
   `nuts / seeds`. `DISPLAY_NAME_OVERRIDES` in `src/display.js` carries the four
   shortened forms the vectors use, marked as a deviation pending a spec
   decision. `displayNamePerSpec()` returns what §2.4 literally says, and the
   display suite prints both side by side every run.

2. **`entryMacroLine` collects parts then joins once.** §6.1a's "omitted along
   with their separator" is not implemented as string surgery, so a leading,
   doubled or trailing separator is unreachable rather than merely untested.

3. **` · partial` and ` · mixed coefficient versions` cannot co-occur.** §6.3a
   appends to §6.2/§6.3 summaries; ` · partial` appends to the §6.2b macro line.
   They attach to different lines, so the ordering question the handoff asked
   about does not arise. Tested by asserting neither suffix appears on the
   other's line.

4. **`entryLine` returns an array of lines, not a joined string.** §6.1 is two
   lines with the second conditionally omitted; joining them here would force
   the caller to split on a newline to find out whether drivers exist.

5. **Structural greps tokenize identifiers rather than substring-match.** V4
   added `ring` to the forbidden list, and `ring` is inside `driverString` — a
   substring match flagged a function that does nothing of the kind. Names are
   camelCase-split and matched token-by-token in both the display and macro
   suites.

## Application shell decisions (§11 step 6)

§13 has no acceptance vectors, so this list is longer than usual.

1. **A truly single-file PWA is not possible.** A service worker must be a
   separate same-origin script — it cannot be inlined, and its scope derives
   from its URL. §8.6's "single-page, no framework" is satisfied; "single file"
   is not, and cannot be. The shell is `index.html` + `sw.js` +
   `manifest.webmanifest` + `icon.svg`, no build step, native ES modules.

2. **`src/select.js` is a reported gap implemented engine-side.** §1.2 defines
   DAILY_LOAD, TODAY_LOAD and WINDOW_LOAD, but no §11 step built the selection —
   steps 1–5 all take an entry array as given. The shell cannot render Log
   without it. It lives in the engine, where §1.2 puts it, rather than in the UI
   layer, and is labelled `REPORTED GAP` in the file. Flagged for ratification.

3. **The window is three completed calendar days, not three days with entries.**
   §1.2 says "the three most recent completed local calendar days", so a day
   with no entries is still in the window and contributes 0.

4. **The app falls back to an in-memory store when IndexedDB is unavailable.**
   §8.6 says never degrade to an unscored state. Nothing persists in that mode.

5. **No API responses are cached by the service worker**, only shell and engine
   files. §8.4 stores resolved values on the entry; a cached OFF response would
   be a second, unversioned source of truth.

6. **The §13.3 structural test scans authored names, not all identifiers.**
   `target` is a forbidden token and also a core DOM property (`event.target`),
   so scanning every identifier flagged the nav click handler. Y4's lesson
   recurring one layer up: narrow what is scanned rather than weaken the list.
   Comments are stripped first, for the same reason.

7. **Method screen strings are duplicated from §9 into the shell.** §9's four
   literal strings are not exported by any module — they live only in the spec.
   They should be a module constant.

## Logging flow decisions (§11 step 7)

1. **The service worker had to change strategy.** §8.6 requires offline but says
   nothing about how a shell update reaches a user. The step-6 worker was
   cache-first with a fixed cache name, so the first version installed is served
   forever — during this step the browser kept serving the step-6 shell after
   the file had changed on disk. Now: network-first for navigation and
   same-origin scripts, cache-first for the rest, `CACHE_VERSION` bumped per
   shell change, and `activate` deletes non-matching caches.

2. **K2 is a form constraint, as §8.5 requires.** The alcohol control is
   `disabled` until a volume is entered, its label says why, and clearing the
   volume unchecks it. The engine's `P3_REQUIRES_VOLUME` rejection still exists
   and still fires on a direct call — it is the backstop, not the user's first
   contact with the rule.

3. **Every refusal carries copy and lands in manual entry with what is already
   known.** `REFUSAL_COPY` maps each engine reason to a sentence explaining what
   happened; `toManual()` pre-fills name and barcode. No refusal renders an
   error and stops.

4. **The manual form distinguishes blank from "not stated".** §8.5 requires each
   field to be supplied *or explicitly marked absent*, so every nutrient and
   macro row carries a "not stated" checkbox that disables its input. A blank box
   is an unfinished form, not a claim about the product.

5. **`ABSENT` defaults where a number cannot be parsed.** A field left blank with
   "not stated" unchecked reads as `ABSENT` rather than 0 — claiming a product
   contains zero sodium because the user has not typed yet would be worse than
   marking it unknown.

6. **Density classes and juice classification come from OFF category tags**
   (`categories_tags`), a declared field, per §7.2a — never from the product
   name (§8.3).

7. **USDA search is inert without an API key.** §8.6 says a key is required;
   none is configured, so `searchUSDA` returns `NO_API_KEY` and only OFF is
   searched. Where to put a key is unspecified.

8. **Rendering reads, writing scores.** G1 forbids scoring at render time, not at
   write time. The logging flow calls `scoreEntry`; no `render*` function does,
   and the structural test asserts exactly that distinction.

## Trend and settings decisions (§11 step 8)

1. **`[OPEN-9]` decided: a full wipe clears `TREND_EPOCH`, atomically with the
   entries.** §4.5 makes the epoch immutable and says deleting the *first* entry
   does not move it. A wipe is a different act — it does not move a series'
   anchor, it ends the series. The epoch is a property of the entry set, not of
   the device, so it cannot outlive the set it anchors. `wipeAll()` clears both
   and reports both, so a half-done wipe is visible rather than silent.

2. **Known asymmetry, reported not resolved:** deleting every entry one by one
   is not a wipe, so it leaves the epoch standing. Two routes to an empty store
   yield different epochs. §4.5 makes that correct — the first entry's deletion
   explicitly does not move the epoch — but it is emergent rather than decided.

3. **REPORTED GAP: entries can be dated before `TREND_EPOCH`.** §8.4 sets the
   epoch "at first log" from that entry's `local_date`, which assumes the first
   entry logged is also the earliest dated. Nothing enforces it. I hit this live:
   the epoch was `2026-09-18` while entries existed on `09-16` and `09-17`, and
   they fell outside every block. §8.4's immutability means the epoch cannot be
   corrected afterwards. `trendBlocks` now counts them and the legend says they
   exist and are still in the log — reported, never dropped quietly.

4. **A gap is drawn, not skipped.** An empty block gets a hollow tick below the
   axis at its preserved x position, and the legend states it means no data was
   recorded — "not the same as a block that balanced out to zero". The zero
   baseline is drawn so a genuine `+0.0` sits visibly on it and a gap does not.

5. **One neutral mark for every value.** No colour, no banding, no size
   variation — the structural test asserts `currentColor` is the only fill or
   stroke, and that no `path` or `polyline` exists (a trendline would be one).

6. **The USDA key lives in `localStorage`, not IndexedDB.** It is configuration,
   not logged data: it must not appear in an entry, a migration, or an export.

7. **Settings holds the key and nothing else**, per §13.1. No preferences, no
   targets, no goals.

## Method page decisions (§11 step 9)

1. **The tables are built from the live data modules, not typed out.** The
   attribute table comes from `ATTRIBUTES`, the serving masses from the same
   table the scorer uses, and the density table from `data/density-map.json`
   itself. A transcribed table drifts from what the app actually computes with;
   this one cannot.

2. **G3 is now actually implemented.** §9.1's "Single source" rule landed in
   v1.1 and the strings stayed hardcoded in `index.html` until now — the rule
   was written and not obeyed. `src/disclosures.js` holds §9.2–§9.5 and §13.5's
   refusal copy; the shell reads both. The structural test compares the module's
   real exported values against the shell's source, so a future transcription
   fails the build.

3. **"Every summary view" is asserted, not assumed.** Today, Log and Trend each
   carry a method link, and the test checks each section's own markup rather
   than counting links globally.

4. **The `Per` column shows the coefficient denominator, not the serving mass.**
   They differ for `P5` — coefficiented per serving, but the serving is the
   product's labelled one — so the page says "serving (labelled)" rather than
   inventing a number.

5. **Scope leads the page.** §9.3's statement is what a reader needs before any
   number means anything, so it sits above the explanation rather than at the
   foot of it.

## Trend anchoring (v1.3, option (c))

`TREND_EPOCH` pins the block grid; it does not mark the start of the series.
Blocks extend in **both directions** — block −1 covers `epoch − 3` through
`epoch − 1`, and `floor(days_between(epoch, date) / 3)` yields the right
negative index with no special case. An entry dated before the epoch is plotted
in its own block rather than falling outside every block, and the epoch still
never moves, so AV-19's never-shifting boundaries hold exactly as written.

The v1.2 mitigation — counting pre-epoch entries and disclosing them in the
legend — is removed entirely. Once those entries are plotted, a legend saying
they exist elsewhere states something no longer true.

## Swap engine decisions (§11 step 10)

1. **`CATMAP-1` ships with 131 tag rules plus 20 USDA category names.** Ordered
   most-specific first, so `en:dried-fruits` beats `en:fruits` by position in the
   file rather than by any scoring in the loader. `UNCATEGORIZED` remains a valid
   outcome, not an error.

2. **The swap engine does not actually need `scoreEntry`.** §7.0 permits the
   import; the rescaling rule turned out to make it unnecessary, because
   `as_consumed / quantity_g` is basis-independent and every contribution is
   linear in mass. The permission stands anyway — §7.0 is about where the
   boundary lies, not about whether this file happens to cross it today.

3. **`P3` rescales by mass ratio like everything else.** I had this wrong and
   the handoff corrected it: units are computed from volume, but volume is
   `quantity_g / density` and density is constant per product, so units are
   linear in mass. Asserted directly, since the reasoning is non-obvious enough
   that someone will otherwise try to re-derive a volume.

4. **A candidate's exemplar entry is arbitrary.** Any of a product's entries
   rescales to the same result, since the rescale is a pure ratio — so the most
   recent is used, and nothing depends on that choice.

5. **A legacy (`SCHEMA-2`) entry cannot be a candidate.** It has no
   `contributions` map, so there is nothing to rescale. It falls out of the
   corpus alongside `NOT_APPLICABLE`, for the same reason: the data needed does
   not exist and cannot be recovered.

6. **The affordance reads "Find an alternative", on every entry, always.** Its
   uniformity is the argument for why it survives §4.4 — so the structural test
   greps its every reference for a conditional and fails on any.

7. **Markup balance is now tested.** A `</main>` lost its `<` during the step 9
   markup edit and rendered as visible text for a whole step; the browser
   recovered silently and no test noticed, because the structural checks scan
   script and style rather than the document.
