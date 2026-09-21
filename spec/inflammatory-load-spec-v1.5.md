# Dietary Inflammatory Load — Normative Spec v1.5

**Supersedes:** v1.4. Closing edits only: §2.5 gains the surface-coverage rule, `[OPEN-6]`
becomes a stated known limitation rather than an open decision, and §7.2a states that
`category-map.json` is ongoing maintenance by design.

**This document is complete.** §11's ten steps are built and this is no longer a build
document. The next round of findings comes from use.

Previously (v1.4): completed §7, the last unbuilt section: `category-map.json` becomes a
required data file, the swap engine's position relative to G1 is stated (§7.0), candidate
rescaling is specified, and §7.3's suppression cases are ordered.

This is the last build round. After §11 step 10 the implementation is complete against §11 and
this document stops being a build document.

Previously (v1.3): resolved the `TREND_EPOCH` pre-epoch problem: blocks now extend in
**both directions** from the epoch (§4.5). The epoch pins the grid; it does not mark the start
of the series.

Previously (v1.2): resolved Z1 and J1–J8. Makes USDA an **optional,
user-supplied-key** source (§8.2) — the no-server constraint means there is nowhere to hold a
secret — and requires a service worker that updates as well as works offline (§8.6).

Previously (v1.1): resolved G1–G4 and H1–H7. Widens §8.4 so a stored entry can render every
string §6 defines for it without recomputing (G1) — the one change that had to land before the
logging flow ships, because the classification set is not reconstructible after the fact.

Previously (v1.0): resolved X1–X4 and Y1–Y5, **resolved `[OPEN-7]`** (swap candidate
corpus = the user's own logged history), and restructures §11 to add the two steps that
assemble the engine into an application (§13).

## Changed vector IDs

`AV-23` and `AV-24` are **new**, appended after `AV-22`, covering `REFERENCE_MASS` median
resolution and cold-start suppression. Nothing renumbers.

`AV-4`'s and `AV-5`'s **expected values changed** (X1): AV-4 gains its three missing macro
fields, which makes AV-5's §6.2b line render all four fields instead of `763 kcal` alone. A
fixture pinned to either is stale.

## Structural changes

§6.0a and §13 are new. §11's steps 6–8 become steps 6–10. `[OPEN-7]` and `[OPEN-8]` are
deleted from §12, both resolved.

`AV-6B`'s expected values changed in **v0.6**, not here — its beverage was respecified from a
water-based cola at density 1.00 to a juice-class drink at density 1.04 (B1). A fixture still
pinned to the v0.5 values is stale.

**Scope note:** This app models a dietary *pattern* and records intake. It does not diagnose,
does not measure inflammation, and makes no claim about any symptom. See §9.

**Versioned artifacts:**
`COEFF-1` coefficient set · `CATMAP-1` category map · `DMAP-1` density map ·
`SCHEMA-2` storage schema

---

## 1. Core model

### 1.1 Principle

No food carries a score. **Attributes** carry scores. A food entry resolves to a set of
attribute values; the score is the weighted sum of those attributes. This is authoritative:
any implementation that stores a per-product score constant violates this spec.

### 1.2 Units

- `SCORE` is a signed real number. Positive = pro-inflammatory. Negative = anti-inflammatory.
- All scores are **per entry as consumed**, not per 100 g.
- `ENTRY` = one resolved product ID at one logged time, with a quantity. An entry resolves to
  **exactly one** product ID. Composite foods are logged as component entries (§3.7).
- `DAILY_LOAD` = sum of `SCORE` for entries on the same local calendar date.
- `TODAY_LOAD` = `DAILY_LOAD` for the current local date. Displayed, never banded, never in
  `WINDOW_LOAD`.
- `WINDOW_LOAD` = sum of `DAILY_LOAD` over the three most recent **completed** local calendar
  days. The current day is excluded until it closes at local midnight.
  The window is three completed calendar days, not three days containing entries. A day with no
  entries is in the window and contributes 0. This differs from §4.5's trend, where a block
  containing no entries is gapped rather than plotted at `+0.0` — a window figure reports a
  period, while a trend point asserts a measurement, and only the latter would be misread as
  balanced eating.
- `BLOCK_LOAD` = sum of `DAILY_LOAD` over the three days of a fixed-epoch trend block (§4.5).
  `BLOCK_LOAD` and `WINDOW_LOAD` are computed over different day sets and are **not
  interchangeable**. `WINDOW_LOAD` slides daily; `BLOCK_LOAD` boundaries never move.
- `WINDOW_KCAL` = sum of `energy_kcal` over the same three completed days as `WINDOW_LOAD`.
- `LOAD_PER_1000` = `WINDOW_LOAD` / (`WINDOW_KCAL` / 1000). Defined only under §4.6.

### 1.3 Rounding

Compute at full precision. Sum at full precision. Round only at display time, **half away from
zero**: a value whose rounding digit is exactly 5 rounds to the neighbor of larger absolute
value.

```
+1.85 → +1.9      -1.85 → -1.9
+1.84 → +1.8      -1.84 → -1.8
+0.25 → +0.3      -0.25 → -0.3
```

This rule governs all displayed numerics **at one decimal place**: scores, loads, driver
values (§5.3), and `LOAD_PER_1000`.

**Macro figures are the exception:** they round to **zero** decimal places, half away from
zero, and render as integers (§6.1a, §6.2b).

A non-null macro value greater than 0 that rounds to 0 renders as `<1` rather than `0`:
`<1 g protein`. A macro value of exactly 0 renders `0`. This prevents §6.1a — which is shown
precisely because a field is non-null — from asserting that the field is zero.

Never round intermediate contributions. Never round before summing.

---

## 2. Attributes and captured fields

### 2.1 Pro-inflammatory attributes

| ID | Attribute | Display name | Unit | Coefficient | Source class |
|----|-----------|--------------|------|-------------|--------------|
| `P1` | Added sugar | added sugar | per 10 g | +1.0 | nutrient |
| `P2` | Sodium | sodium | per 500 mg | +0.5 | nutrient |
| `P3` | Alcohol | alcohol | per unit (14 g ethanol) | +2.0 | classification |
| `P4` | Refined grain | refined grain | per serving | +1.0 | classification |
| `P5` | Ultra-processed (NOVA 4) | ultra-processed | per serving | +1.5 | classification |
| `P6` | Processed meat | processed meat | per serving | +2.0 | classification |
| `P7` | Deep-fried preparation | deep-fried | per serving | +1.5 | classification |
| `P8` | Saturated fat | saturated fat | per 5 g | +0.5 | nutrient |

### 2.2 Anti-inflammatory attributes

| ID | Attribute | Display name | Unit | Coefficient | Source class |
|----|-----------|--------------|------|-------------|--------------|
| `A1` | Fiber | fiber | per 5 g | −1.0 | nutrient |
| `A2` | Omega-3 fish | omega-3 fish | per serving | −3.0 | classification |
| `A3` | Non-starchy vegetable | non-starchy vegetable | per serving | −1.5 | classification |
| `A4` | Fruit (whole) | fruit | per serving | −1.0 | classification |
| `A5` | Nuts / seeds | nuts | per 30 g | −1.5 | classification |
| `A6` | Legumes | legumes | per serving | −1.5 | classification |
| `A7` | Whole grain | whole grain | per serving | −1.0 | classification |
| `A8` | Olive oil | olive oil | per 14 g | −0.5 | classification |

### 2.3 Source classes

**Nutrient-sourced:** `P1`, `P2`, `P8`, `A1`. Values come from data-source fields, scale per
§3.3b, and can be absent. Governed by §3.2.

**Classification-sourced:** `P3`–`P7`, `A2`–`A8`. Values follow from the resolved product's
classification and quantity. They are never absent — either the product resolves and they are
determined, or the product does not resolve and no entry is created (§3.1, §3.3c, §8.5).

### 2.4 Display names

An attribute's display name is the **Display name** column of §2.1/§2.2, which is its
attribute name lowercased except where a parenthetical or qualifier makes the full name
unsuitable for a driver string. One exception remains conditional:

- `P1` renders as `sugar` when the entry has `sugar_field_used == "total"` (§3.5), and as
  `added sugar` otherwise.

The exception exists because §3.5 scores juice from the total-sugars field, and rendering
`added sugar` on a 100% juice entry would assert something false about the product. The dual
naming is disclosed on the method page (§9.1).

**Macro field display names.** `energy_kcal` → `kcal`; `protein_g` → `protein`;
`carbohydrate_g` → `carbs`; `fat_g` → `fat`. These names are used in §6.1a, §6.2b, and §6.4
without variation.

### 2.5 Captured macro fields

These are **recorded, not scored.** They contribute nothing to `SCORE`, `DAILY_LOAD`,
`BLOCK_LOAD`, or any band. They carry no target, goal, budget, or remaining-quantity figure.

| Field | Unit | Source class |
|-------|------|--------------|
| `energy_kcal` | kcal | nutrient |
| `protein_g` | g | nutrient |
| `carbohydrate_g` | g | nutrient |
| `fat_g` | g | nutrient |

Macro fields are nutrient-sourced and scale with quantity per §3.3b, identically to scored
nutrient attributes. They are subject to §3.2: a missing macro field contributes 0 to its day
total and marks the entry `INCOMPLETE`, except as carved out in §8.6a.

**Prohibited for macro fields:** any target or goal value; any progress bar, ring, or gauge;
any "remaining" or "over/under" figure; any color, band, or verdict; any message triggered by
a macro total. A macro is a recorded number and nothing else. §6.6 applies in full.

Rationale: a calorie target imports the per-day pass/fail machinery this spec exists to
exclude. Capturing the number is useful; judging it is out of scope.

**On structural enforcement.** A prohibition checked by substring match produces false
positives as the code surface grows — `ring` matches `driverString`. Match on tokenized
identifiers, not substrings. A false positive in a structural test is worse than no test,
because the response to it is to weaken the pattern.

The same narrowing applies when a prohibition overlaps the platform's own vocabulary: `target`
is forbidden here and is also a DOM property. Scan authored names — class and id attributes,
declared bindings, object keys — with comments stripped, rather than every identifier in the
file. Narrow what is scanned; do not weaken the list.

**A structural test must be able to fail.** A test whose pattern matches nothing, whose walk
never resolves, or whose assertion is vacuously satisfied passes without testing anything, and
reads as coverage. Before trusting a structural check, assert that its mechanism engaged: that
the pattern matched somewhere it should, that the import walk resolved, that the scanned
surface was non-empty. This is B1's discrimination rule applied to structural tests rather than
to vectors.

**A structural check reports only on the surface it is aimed at.** Every check must state what
it covers — script, style, markup, data files — because a check that cannot see a surface
reports nothing about it and reads as though it did. Coverage is bounded by aim, and the bound
is invisible from inside the check.

This is the fourth form of one lesson. B1: a vector must be able to fail on its defect. Y4: a
pattern must match tokens, not substrings. H3 and the vacuous-regex defect: a check must assert
its mechanism engaged. And here: a check that engages correctly on the wrong surface is still
silent about the right one.

The `</main>` defect rendered as visible text for an entire build step with every structural
check green, because none scanned the document. It was found by looking at the screen.

### 2.6 Provenance

Coefficients are **assigned by this spec**, not derived from a published index. They are
ordinally informed by the direction and rough magnitude of effects reported in the Dietary
Inflammatory Index and EDIP literature, but the specific numbers are a design choice. The app
must not present them as measured or validated. See §9.2.

---

## 3. Resolution rules

### 3.1 Suppression and exclusivity

**`P3` suppresses `P5` only,** and only on its own entry. An entry scoring `P3` contributes 0
for `P5`. Rationale: the alcohol coefficient already carries the processing effect. `P3`
suppresses no other attribute and has no effect on any other entry — a mixer logged as a
separate entry (§3.7) scores its own `P1` and `P5` normally.

**`P4` and `A7` are mutually exclusive** per serving. A mixed-grain product is classified by
majority grain mass. **If majority grain mass cannot be determined, the classification does
not resolve:** the product is not scored from `OFF` or `USDA` and falls to `MANUAL` (§8.5).

Rationale: defaulting to `P4` would bias undetermined products toward pro-inflammatory, which
is the §3.2 failure mode one layer down, and would contradict §2.3's claim that classification
attributes are never absent.

**Declared percentages only.** Majority grain mass is determined from a *declared* ingredient
percentage. Open Food Facts' computed `percent_estimate` is not used: OFF derives it itself, so
consuming it would be inference wearing a field's clothes, which §8.3 prohibits.

The cost is concentrated in one common category. Most multigrain breads and crackers declare no
flour percentages and therefore refuse, routing to `MANUAL` (§8.5) and, once entered, to a
saved product (§8.5a). This is accepted: a guessed majority would silently decide the `P4`/`A7`
sign, and a wrong sign is worse than a manual entry.

**`A1` is independent** and always applies. A high-fiber ultra-processed product correctly
earns both `P5` and `A1`.

### 3.2 Missing data

If a **nutrient-sourced** field (§2.3, §2.5) is unavailable, it contributes **0** and the entry
is marked `INCOMPLETE`. This applies identically to pro-inflammatory, anti-inflammatory, and
macro fields: a missing fiber value marks the entry exactly as a missing sodium value does, and
a missing protein value marks it the same way.

Missing data is never imputed, estimated, or defaulted to a category average.

Classification-sourced attributes cannot be missing. An entry whose classification cannot be
determined is not scored and is not stored.

### 3.3 Quantity entry and serving derivation

**Quantity is entered in grams (solids) or millilitres (liquids).** Servings are *derived*,
never entered:

```
servings = quantity_g / serving_mass_g
```

Fractional servings are valid and scale all contributions linearly.

**Package shortcut.** For a resolved packaged product with a labeled net weight, the UI offers
`1 package`, resolving to that net weight in grams before any scoring. Fractions (`1/2`,
`1/4`) resolve the same way. If the product has no labeled net weight, the shortcut is not
offered.

**Serving masses** (fixed, grams):

| Attribute | One serving |
|-----------|-------------|
| `P4`, `A7` | 30 g dry grain, or 30 g bread |
| `P5` | labeled package serving mass; if unlabeled, 100 g (liquids: 100 ml converted per §3.3a) |
| `P6` | 50 g |
| `P7` | 100 g of fried component |
| `A2` | 100 g cooked |
| `A3` | 80 g |
| `A4` | 120 g |
| `A5` | 30 g |
| `A6` | 90 g cooked |
| `A8` | 14 g |

`P3` does not use serving mass; see §3.6.

Note on `A8`: one US tablespoon of olive oil is 15 ml, which converts to 13.65 g at density
0.91, or 0.975 servings. A tablespoon is not one serving. This is intentional — the serving
basis is mass throughout.

### 3.3a Volume to mass conversion

A quantity entered in millilitres converts to grams before §3.3b and §3.3 apply:

```
quantity_g = quantity_ml × density_g_per_ml
```

Density resolves in this order:

1. **Per-product derivation.** If the source record supplies both a serving mass in grams and
   the same serving as a volume, density = mass / volume. Preferred whenever available.
2. **`density-map.json`** (`DMAP-1`), a versioned static file keyed on the product's liquid
   classification (§7.2a). Values are physical constants for the class, not estimates of the
   individual product.

   **Where the classification comes from.** The liquid class is resolved from the source
   record's declared `categories_tags` (§7.2a), never from the product name (§8.3). The
   tag-to-class mapping lives in `density-map.json` alongside the densities themselves and is
   versioned with it — a mapping held in code is not auditable and drifts from the map it keys.

   Densities:

   | Class | g/ml |
   |-------|------|
   | Water-based beverage (soda, water, coffee, tea) | 1.00 |
   | Juice | 1.04 |
   | Milk and dairy drinks | 1.03 |
   | Beer | 1.01 |
   | Wine | 0.99 |
   | Spirits (≈40% ABV) | 0.94 |
   | Culinary oil | 0.91 |

3. If the product is a liquid and neither path resolves, the classification does not resolve;
   the entry falls to `MANUAL` (§8.5), where the user supplies a mass directly.

Density is never assumed to be 1.00 as a fallback. Step 3 exists so that an unresolvable liquid
fails loudly rather than scoring wrong by up to 9%.

The entry stores `density_used` and its provenance (`DERIVED` | `DMAP-1` | `MANUAL`).

**The conversion is unscoped.** `quantity_g` is the entry's single canonical quantity, and both
§3.3b nutrient scaling and §3.3 serving derivation read from it. No attribute scales from the
entered volume directly, with the single exception given in §3.6.

### 3.3b Nutrient scaling

Every nutrient-sourced value (§2.3) and every macro field (§2.5) is scaled from the source
record to as-consumed in one step.

**Pipeline order.** For each entry, in this order and no other:

1. §3.3c — resolve the source record's basis. If it does not resolve, stop; the entry falls to
   `MANUAL`.
2. §3.3a — resolve `quantity_g` from the entered quantity. A quantity entered in grams passes
   through unchanged.
3. §3.3b — normalize the source record to a per-gram basis and scale to `quantity_g`.
4. §3.3 — derive servings for classification-sourced attributes from `quantity_g`.

**Normalization.**

```
basis per_100g:    per_gram = reported_value / 100
basis per_100ml:   per_gram = reported_value / 100 / density_g_per_ml
basis per_serving: per_gram = reported_value / serving_mass_g
```

where `density_g_per_ml` is the value resolved in §3.3a, and a serving stated in volume
converts to `serving_mass_g` by that same density.

**As-consumed.**

```
as_consumed_value = per_gram × quantity_g
```

Density therefore **cancels** for a liquid entered in millilitres against a per-100-ml record:

```
(reported / 100 / d) × (ml × d) = reported × ml / 100
```

An implementation that applies density on only one side of this is a defect (AV-10). The
cancellation is the reason the §3.3a conversion can be unscoped without introducing error.

The entry stores `source_basis` alongside `density_used`.

### 3.3c Source basis resolution

The basis is **read from declared fields where they exist, and otherwise derived by the
explicit rules below. It is never inferred from product identity, name, or category.**
Resolution is ordered; the first matching rule wins.

**Open Food Facts:**

1. `nutrition_data_per == "serving"` **and** `serving_size` present with a parseable mass or
   volume → `per_serving`.
2. `nutrition_data_per == "100g"` **and** the product's `quantity` unit is `ml`, `l`, `cl`, or
   `fl oz` → `per_100ml`, provenance `DERIVED_RULE_2`.

   **This rule derives; it does not read.** Open Food Facts does not declare a per-100-ml
   basis, and volumetric records are labelled `100g`. The product's own declared quantity unit
   is the discriminator.

   **Known failure mode.** A product sold by volume whose nutrition table is genuinely per
   100 g is divided by density by §3.3b, producing a silent error of **1/d − 1**: −3.8% on
   juice (d = 1.04), −2.9% on milk (d = 1.03), +9.9% on an oil sold by volume (d = 0.91).

   Note the sign. For d > 1 the rule **understates** the true value; for d < 1 it overstates.
   Derivation: rule 2 computes (R/100/d)(Vd) = RV/100, while the truth for a per-100-g table is
   (R/100)(Vd) = RVd/100; the ratio is 1/d.

   The error is not detectable from the record. This is why the provenance is stored (§8.4): a
   `DERIVED_RULE_2` entry is the only value in the pipeline that can be wrong without leaving
   a trace, and it must be identifiable in an audit or an export.
3. `nutrition_data_per == "100g"` **and** the product's `quantity` unit is a mass unit →
   `per_100g`.
4. Any other combination, including a missing `nutrition_data_per` or an unparseable
   `serving_size` → **does not resolve**.

**USDA FoodData Central** (Foundation Foods and SR Legacy only, §8.2): always `per_100g`. These
datasets declare a fixed 100 g basis as a property of the dataset.

**`MANUAL`** (§8.5): `per_serving`, with `serving_mass_g` equal to the mass the user
supplied.

**Exception — nothing to scale.** If a manual entry supplies no nutrient-sourced value and no
macro field, its basis is `NOT_APPLICABLE` and it carries no `serving_mass_g`. §3.3b does not
run: there is nothing to normalize. This is the only case in which an entry resolves without a
basis, and it exists because K2 (§8.5) requires a `P3` entry to supply volume rather than mass,
so a spirit logged with volume and ABV alone has no mass to key a serving on.

`NOT_APPLICABLE` is never assigned to an `OFF`, `USDA`, or `SAVED` record. If such an entry
later acquires a nutrient or macro value, it is a new entry (§8.4 immutability), and that entry
must supply a mass or a density.

An entry with basis `NOT_APPLICABLE` is **never** marked `INCOMPLETE`, and §6.4 renders no
marker for it. §3.2's `INCOMPLETE` means a value exists in the world and the record lacks it; a
`NOT_APPLICABLE` entry has no nutrient or macro values to lack, and listing all eight as
missing would assert a data gap that does not exist. This is a fully specified entry, not a
deficient one.

It remains excluded from §4.6 normalization by the same precondition as any entry without
`energy_kcal`: the denominator is genuinely absent and is never imputed.

Nor does such an entry set §6.2b's ` · partial`. The suffix reports that a day's macro totals
are missing contributions; a `NOT_APPLICABLE` entry has no macro values to contribute and none
to lack. A day containing only such entries omits the §6.2b line entirely, as
`dayMacroLinePolicy()` returns `OMIT`.

**`SAVED`** (§8.5a): always `per_serving`, with `serving_mass_g` taken from the saved product
record. A saved product inherits the basis of the manual entry it was created from and never
re-derives one.

A record that does not resolve is not scored and is not stored; the entry falls to `MANUAL`.
The basis is never guessed, and `per_100g` is never used as a fallback.

**Provenance assignment.** `DERIVED_RULE_2` is assigned by rule 2 only. Every other path
assigns `DECLARED`: OFF rules 1 and 3, USDA, `MANUAL`, and `SAVED`. `NOT_APPLICABLE` bases
(§3.3c `MANUAL` exception) carry provenance `DECLARED`.

### 3.4 `A2` qualification

`A2` applies only to fish with ≥1 g combined EPA+DHA per 100 g. Salmon, mackerel, sardines,
herring, anchovies, trout qualify. Tuna (canned light), cod, tilapia, shrimp do **not** — they
score 0 on `A2` and are not penalized.

### 3.5 Juice

An entry is **classified as juice** when the resolved product's primary form is a liquid
extracted from fruit or vegetables, including 100% juice, from-concentrate, and juice blends.
Smoothies containing whole fruit pulp are not juice. Classification is assigned per §7.2a.

For a juice-classified entry:

- `P1` takes its value from the **total sugars** field. The added-sugars field is ignored.
- `P1` renders under the display name `sugar` (§2.4).
- `A4` does not apply; the entry earns no fruit serving.
- `A1` applies normally from the reported fiber field.

The entry stores `sugar_field_used: "total"`. If the total-sugars field is absent, `P1` is
missing and §3.2 applies — the added-sugars field is never a fallback.

This departs from nutrition-label convention and must appear on the method page.

### 3.6 Alcohol unit conversion and pipeline exemption

1 unit = 14 g ethanol. Compute from the **entered volume** and ABV where both are available:

```
ethanol_g = volume_ml × (ABV / 100) × 0.789
units = ethanol_g / 14
```

Fallback when ABV is unavailable: 12 fl oz beer = 1.0 unit; 5 fl oz wine = 1.0 unit; 1.5 fl oz
spirits = 1.0 unit.

**Exemption scope.** The `P3` contribution alone is exempt from §3.3a and §3.3b: it consumes
the entered volume directly and never passes through `quantity_g` or per-gram normalization.
The exemption applies to the `P3` contribution, **not to the entry.** Every other attribute and
every macro field on an alcoholic entry scales normally through the full §3.3b pipeline. An
implementation that exempts the whole entry produces a beer with no calories and is a defect
(AV-4).

### 3.7 Composite foods

An entry resolves to exactly one product ID. A plate combining multiple foods is logged as
multiple entries, one per component. Salmon on whole-grain toast with olive oil is three
entries.

Rationale: it keeps the §8.4 audit trail intact and makes classification unambiguous. The
accepted cost is more log actions per meal.

The UI may group same-timestamp entries visually. Grouping is presentational only.

---

## 4. Bands, trend, normalization

### 4.1 Daily bands

Applies to a **completed** `DAILY_LOAD` only. Never to `TODAY_LOAD`. Never to macros.

| Band ID | Range | Label |
|---------|-------|-------|
| `D_LOW` | ≤ −5.0 | `Low` |
| `D_NEUTRAL` | −5.0 < x ≤ +5.0 | `Neutral` |
| `D_ELEVATED` | +5.0 < x ≤ +15.0 | `Elevated` |
| `D_HIGH` | > +15.0 | `High` |

### 4.2 Window bands

| Band ID | Range | Label |
|---------|-------|-------|
| `W_LOW` | ≤ −15.0 | `Low` |
| `W_NEUTRAL` | −15.0 < x ≤ +15.0 | `Neutral` |
| `W_ELEVATED` | +15.0 < x ≤ +45.0 | `Elevated` |
| `W_HIGH` | > +45.0 | `High` |

This table is defined on `WINDOW_LOAD` only. It does **not** apply to `BLOCK_LOAD`; trend
points are never banded (§4.5).

### 4.3 Band boundaries

Inclusive at the upper bound, exclusive at the lower. Exactly +5.0 is `D_NEUTRAL`. Banding
tests the **unrounded** value.

### 4.4 Entries are never banded

Individual entries display a score, drivers, and macro figures. They are never assigned a band,
never colored red/green, never labeled good or bad.

### 4.5 Trend view

The trend plots `BLOCK_LOAD` for **non-overlapping** 3-day blocks.

**Anchoring.** `TREND_EPOCH` is the local calendar date of the first stored entry. It is
written once at first log and is immutable: it is never recomputed, deleting the first entry
does not move it, and an entry dated earlier does not move it.

`TREND_EPOCH` pins the block grid; it does not mark the start of the series. Blocks extend in
**both directions** from it. Block *n* covers `TREND_EPOCH + 3n` through `TREND_EPOCH + 3n + 2`,
where *n* may be negative: block −1 covers `TREND_EPOCH − 3` through `TREND_EPOCH − 1`, block
−2 the three days before that, and so on. For any entry,
`n = floor(days_between(TREND_EPOCH, entry_date) / 3)`, which yields the correct negative index
for a date before the epoch with no special case.

Boundaries therefore never shift, and the same entries produce the same trend on any day —
including after an entry dated before the epoch arrives. An entry dated before `TREND_EPOCH` is
plotted in its own negative-index block exactly as a later entry is plotted in a positive one;
it is never excluded, never collapsed into block 0, and never a reason to move the epoch.

**Why the epoch does not move.** Re-anchoring to the earliest dated entry re-cuts every boundary
in the history, so the same logged entries would produce different blocks before and after a
backdated entry arrived. That is the defect AV-19 exists to catch, and it is not made acceptable
by being triggered by data rather than by a clock.

A full data wipe clears `TREND_EPOCH` atomically with the entries (`[OPEN-9]`, v1.2); the next
log sets it afresh. This is not an exception to immutability — the epoch is not being moved, it
is being destroyed along with everything it indexed.

**Lag.** Because blocks are fixed to `TREND_EPOCH` while §6.3's `WINDOW_LOAD` slides, the
newest plotted block ends up to two days before the window summary's final day. On 2026-09-15
with `TREND_EPOCH` = 2026-09-01, §6.3 covers 09-12 through 09-14 while the newest plotted block
covers 09-10 through 09-12. This is intended and must not be reconciled by re-anchoring.

**Blocks not plotted.** Two cases are omitted from the series:

- The **current** block — newest, containing today — until all three of its days are complete.
- Any block containing **zero entries**. Its x-axis position is preserved and left empty; it is
  not plotted at `+0.0`. A block with no data is not a balanced block, and plotting it as one
  would assert something the data does not support.

A block containing at least one entry is plotted at its true `BLOCK_LOAD`, which may
legitimately be `+0.0`.

Gapping does not interact with the non-overlapping or no-drill-down constraints: boundaries are
unchanged, and an omitted point is not tappable because no point exists.

A negative-index block follows every rule a positive-index block follows: it is plotted when it
contains at least one entry, gapped when it contains none, and never banded, coloured, or
tappable. "Current block" means the block containing today, whatever its index.

**Series extent.** The series runs from the lowest-index block containing an entry to the newest
complete block, gapping empty blocks throughout (§4.5). The epoch is not marked, labelled, or
otherwise distinguished in the view: it is an internal grid reference, not an event in the
user's history, and drawing attention to it would invite the reading that data before it is
somehow lesser.

The view therefore needs no explanation for a series beginning before the epoch, because nothing
in the view identifies where the epoch falls. Blocks are labelled by their date range, as every
block is.

**Mandatory constraints:**

- Individual `DAILY_LOAD` values are never plotted as points.
- No point is tappable; no drill-down to a single day exists from this view. Day detail is
  reachable only from the log, by date.
- Points are not colored or banded.
- No trendline, slope, projection, streak count, or comparison to a prior block is rendered.
  The series is the output.
- Macro fields are never plotted on this view.

These are the mechanism preventing a longer trend from becoming the per-day verdict this design
excludes. They are not advisory.

### 4.6 Normalization

`LOAD_PER_1000` = `WINDOW_LOAD` / (`WINDOW_KCAL` / 1000), displayed to one decimal place.

**Displayed only when all three hold:** the window contains at least one entry; every entry in
the window has a non-null `energy_kcal`; and `WINDOW_KCAL` > 0. If any precondition fails,
`LOAD_PER_1000` is not computed and not displayed, and §6.3b renders the corresponding string.
Energy is never imputed to satisfy the denominator (§3.2).

**On precondition 3.** Once precondition 2 holds, `WINDOW_KCAL` can be 0 only if every entry in
the window is literally 0 kcal — a real but rare case. It is **not** the zero-division guard:
precondition 1 is, alone, and AV-18 asserts that it fires before any division. Do not merge
preconditions 1 and 3, and do not drop 1 on the reasoning that 3 subsumes it. An empty window
satisfies 2 vacuously and would divide 0 by 0.

`LOAD_PER_1000` is **not banded.** No band table applies to it. It exists so a high-intake day
and a low-intake day can be compared at all, which the absolute figure cannot support.

---

## 5. Drivers

### 5.1 Definition

A `DRIVER` is an attribute whose absolute contribution to an entry is ≥ 1.0. Macro fields are
never drivers.

### 5.2 Selection

At most the top 3 drivers per entry, ranked by absolute contribution descending. Ties break by
table order in §2 (`P1` before `P2`, pro before anti).

### 5.3 Format

Each driver renders as `{value} {unit} {display_name}`, where `display_name` is per §2.4.

**Driver units.** `{unit}` resolves from this table:

| Attribute | Driver unit | Count noun |
|-----------|-------------|------------|
| `P1`, `P8`, `A1` | `g` | no |
| `P2` | `mg` | no |
| `P3` | `unit` / `units` | yes |
| `P4`–`P7`, `A2`–`A8` | `serving` / `servings` | yes |

The driver unit is the unit in which the value is *displayed*, not the unit in which the
coefficient is expressed: `A5` is coefficiented per 30 g but renders in servings.

**Value formatting:**

1. Round to one decimal place, half away from zero (§1.3).
2. Strip a trailing `.0`. `1.0` → `1`. `1.5` → `1.5`. `27.0` → `27`.
3. Pluralize **count nouns** when the *displayed* value ≠ 1. Mass and volume units are never
   pluralized.

The displayed value governs pluralization, not the underlying one: 1.00034 units displays as
`1 unit`, and 1.516667 servings displays as `1.5 servings`.

Examples: `27 g added sugar` · `20.9 g sugar` · `1 serving ultra-processed` ·
`1.5 servings fruit` · `1 unit alcohol` · `5.6 g fiber`

---

## 6. Exact user-facing strings

All strings literal. Placeholders in `{braces}`. No string may be reworded at implementation
time.

### 6.0a Entry display name

`{food_name}` resolves at write time and is stored on the entry (§8.4). It is immutable
thereafter, like every other stored field.

| Source | `food_name` |
|--------|-------------|
| `OFF` | the record's `product_name` |
| `USDA` | the record's `description` |
| `MANUAL` | the name the user supplied (§8.5) |
| `SAVED` | the saved product's name at log time (§8.5a) |

If an `OFF` or `USDA` record supplies no name field, the product does not resolve and the
entry falls to `MANUAL`, where the user names it.

§6.5's `{alt_name}` resolves the same way, from the candidate's own record.

Renaming a saved product does not retitle entries already logged from it (§8.5a).

### 6.1 Entry line

```
{food_name} — {score:+0.1f}
{driver_1} · {driver_2} · {driver_3}
```

Score always shows an explicit sign. If the rounded score has zero magnitude it renders as
`+0.0` regardless of the unrounded sign. The string `-0.0` must never be produced. Test
assertion: `format(-0.04)` == `+0.0`.

If no attribute reaches the §5.1 threshold, the second line is omitted.

**Omission is one state, not two.** The second line is omitted when no attribute reaches the
§5.1 threshold — and for no other reason. An entry whose drivers cannot be computed is a §8.4
defect, not a rendering case, and must not be rendered as though it had no drivers. An
implementation needing an "uncomputable" state has found a storage gap; report it.

### 6.1a Entry macro line

Rendered beneath §6.1, only when at least one macro field is non-null:

```
{energy_kcal} kcal · {protein_g} g protein · {carbohydrate_g} g carbs · {fat_g} g fat
```

All figures are integers (§1.3). Null fields are omitted from the line along with their
separator. No target, comparison, color, or band appears on this line (§2.5).

### 6.2 Completed-day summary

```
{date}: {daily_load:+0.1f} · {band_label}
```

### 6.2a Today line

```
Today so far: {today_load:+0.1f}
```

No band label, no color, no driver summary. With no entries: `Today so far: +0.0`.

Rationale: banding a partial day would make the same number mean different things at different
hours. Nothing is compared to anything, so the line cannot read as a verdict on the morning.

### 6.2b Day macro line

Rendered beneath §6.2 and §6.2a:

```
{energy_kcal} kcal · {protein_g} g protein · {carbohydrate_g} g carbs · {fat_g} g fat
```

All figures are integers (§1.3).

**Summation basis.** Totals sum the **full-precision as-consumed** macro values of each entry
(§3.3b) and round once, at display. The per-entry integers rendered by §6.1a are display
output and are never summed. A day of five entries at 152.65 kcal totals 763.25 → `763 kcal`,
not 5 × 153 = 765.

Totals include only non-null entry values. If any entry that day is missing a macro field, the
line appends:

```
 · partial
```

except as carved out in §8.6a. No target, no remaining figure, no band, no color.

### 6.3 Window summary

```
3 days ending {last_completed_date}: {window_load:+0.1f} · {band_label}
```

The date is always shown. "Last 3 days" is not used: at 8 p.m. on the 14th the window covers
the 11th through the 13th, and the shorter phrasing misstates that.

### 6.3a Mixed version marker

If a `DAILY_LOAD` or `WINDOW_LOAD` sums entries written under more than one coefficient set
version, the summary line appends:

```
 · mixed coefficient versions
```

No other behavior changes; the load is still displayed and still banded.

### 6.3b Normalized line

Rendered beneath §6.3 when §4.6's preconditions hold:

```
Per 1,000 kcal: {load_per_1000:+0.1f}
```

When the window contains no entries:

```
Per 1,000 kcal: unavailable — no entries in this window
```

When the window contains entries but any lacks calorie data, or `WINDOW_KCAL` is 0:

```
Per 1,000 kcal: unavailable — some entries have no calorie data
```

No band label in any case.

### 6.4 Incomplete marker

Appended to the entry line:

```
Incomplete — missing {attribute_name_list}
```

Comma-separated, in §2 table order, scored attributes before macro fields. Names are the §2.4
display names.

### 6.5 Swap suggestion

```
Alternative: {alt_name}, {alt_reference_mass_g} g — {alt_score:+0.1f}
Swaps {delta_driver_out} for {delta_driver_in}.
```

`alt_reference_mass_g` is the §7.2 `REFERENCE_MASS`, rounded to one decimal place with a
trailing `.0` stripped (§5.3 step 2): `120 g`, `52.7 g`. It is always shown, so the displayed
score is never attributable to a quantity the name implies but was not used.

`delta_driver_out` = the pro-inflammatory attribute with the largest **reduction** between
source and candidate. `delta_driver_in` = the anti-inflammatory attribute with the largest
**gain**. Both selected by *change*, not absolute magnitude in either entry — the line
describes what the swap does, not what the candidate is.

If either is absent, the second line is omitted entirely. The word "instead" and any imperative
phrasing ("try", "choose", "swap this for") are prohibited. Macro fields never appear in a swap
line.

### 6.6 Prohibited strings

The app must never render: a verdict word (`yay`, `nay`, `bad`, `good`, `avoid`, `cheat`,
`clean`, `guilty`), an imperative to eat or not eat anything, a symptom claim, a macro or
calorie target, a remaining-quantity figure, or any message triggered by a high band or a macro
total. A high band renders §6.2 or §6.3 and nothing more.

---

## 7. Swap engine

### 7.0 Position relative to G1

G1 (§8.4) forbids **rendering** from scoring: a stored entry renders from stored data, never
from recomputation. The swap engine is not rendering. It is computation performed on explicit
user request (§7.1), producing a candidate that has never been logged and therefore has no
stored score.

The swap engine may import the scoring module. The display module may not, and no `render*`
function may score. §6.5's swap line is rendering — it renders what §7 computed, and does not
compute.

An implementation routing §7 through the display module, or relaxing G1's structural test to
accommodate §7, has misread this boundary.

### 7.1 Trigger

Swaps are offered **only on explicit user request** per entry. The entry line carries a passive
affordance; no suggestion appears unrequested.

**Why this survives §4.4 and §6.6.** Every entry line carries the same affordance, always,
regardless of score, band, or attribute. It therefore says nothing about *this* entry that it
does not say about every entry, and asserts nothing about the food.

The affordance must remain uniform for this argument to hold. It must not appear conditionally
— not only on high-scoring entries, not only on `P5` products, not only above a threshold —
because a conditional affordance *is* a verdict, rendered as a control instead of a word. §6.6
prohibits it as surely as it prohibits the word.

### 7.2 Candidate selection

Candidates are drawn from the same `OCCASION_CATEGORY` as the source entry.

**Corpus.** Candidates are drawn from the user's own data only:

1. Distinct products appearing in **two or more** stored entries.
2. Saved products (§8.5a) carrying a user category override.

No other source is consulted. The app never suggests a product the user has not logged or
saved. The corpus is local, requires no curated list, and is reproducible from the store.

**`REFERENCE_MASS`** is resolved as:

1. For a product with two or more stored entries: the **median `quantity_g`** across all of
   that product's stored entries. With an even count, the lower of the two middle values, so
   the result is deterministic.
2. For a saved product with fewer than two stored entries: its `serving_mass_g` (§8.5).

This supersedes the labeled-serving and table-order precedence of earlier versions. The user's
own typical portion is a better reference than a label's serving suggestion, and it is drawn
from data the store already holds.

Because `REFERENCE_MASS` derives from the log, a candidate's score may change as more entries
accumulate. This is correct and creates no reproducibility problem: swap suggestions are
computed on request and never stored (§7.1, §8.4).

**Rescaling a candidate.** A candidate is scored at `REFERENCE_MASS` from its own stored entry
data. The source record is not re-fetched and §3.3c is not re-run:

```
per_gram          = as_consumed / quantity_g
value_at_ref      = per_gram × REFERENCE_MASS
servings_at_ref   = servings_logged × (REFERENCE_MASS / quantity_g)
```

This is basis-independent and exact: the ratio `as_consumed / quantity_g` already absorbs
whatever basis and density produced it.

**`P3` rescales the same way.** Alcohol units are computed from volume (§3.6), but volume is
`quantity_g / density` and density is constant for a given product, so units are linear in
mass:

```
units_at_ref = units_logged × (REFERENCE_MASS / quantity_g)
```

No volume is stored and none is needed. An implementation attempting to re-derive volume, or
excluding `P3`-bearing products from the corpus, has missed this.

**Exclusions from the corpus:**

- Entries with basis `NOT_APPLICABLE` (§3.3c): `quantity_g` is null, so no rescaling is
  possible. Excluded explicitly, not left to fall out of `UNCATEGORIZED`.
- `UNCATEGORIZED` entries (§7.2a).
- The source entry's own product. A product is never offered as an alternative to itself,
  regardless of quantity difference.

The source entry is scored at its logged quantity. The two are not mass-matched, and no
mass-comparison rule applies.

Rationale: a swap is a substitution of one item for another, not an isocaloric exchange.
Gram-matching produced sub-threshold drivers that silently suppressed §6.5's second line.

Rank candidates by `source_score − candidate_score` descending. Return the top 1.

### 7.2a Category assignment

`OCCASION_CATEGORY` ∈ {`snack`, `beverage`, `meal component`, `condiment`}.

Deterministic lookup, in order:

1. A stored user override for this product ID.
2. `category-map.json` (`CATMAP-1`), a versioned static file keyed on Open Food Facts category
   tag or USDA food category. First match in file order wins.
3. No match: `UNCATEGORIZED`.

An `UNCATEGORIZED` entry is scored normally and counts toward all loads. It is ineligible as a
swap source and as a swap candidate.

Category assignment is not part of the scoring path and affects no score. It is nonetheless
bound by §8.3: deterministic, reproducible, no LLM.

**File requirements.** `category-map.json` is a required data file, versioned as `CATMAP-n`
alongside `density-map.json`. It maps source taxonomy keys to `OCCASION_CATEGORY`:

- Open Food Facts `categories_tags` entries (e.g. `en:biscuits`, `en:carbonated-drinks`,
  `en:breakfast-cereals`).
- USDA food category names, where a key is configured (§8.2).

Order matters: the first matching key in file order wins, so specific keys precede general
ones. A product matching no key is `UNCATEGORIZED`, which is a valid outcome and not an error.

**Resolution is a source-layer responsibility.** `occasion_category` is resolved when the
record resolves, stored on the entry (§8.4), and immutable thereafter like every other stored
field. A record that resolves without a category assignment attempt is a defect in the source
layer, not a product without a category.

Existing entries written before the map existed remain `UNCATEGORIZED` and are not
re-categorized — §8.4 immutability applies. They are ineligible as swap sources and candidates
until re-logged.

**Maintenance.** `category-map.json` is not a one-time deliverable. It is hand-maintained by
design, because §8.3 prohibits inferring a category from a product name or any other undeclared
signal, and its coverage determines how often the swap engine has anything to say.

The signal for maintenance is a product the user eats regularly that remains `UNCATEGORIZED`.
The fix is to add its most specific `categories_tags` key to the map, above any more general
key it also carries, and bump `CATMAP-n`. Entries already logged are not re-categorized (§8.4);
re-logging the product picks up the new category.

A map edit is a versioned data change, never a code change.

**Liquid classification** for §3.3a step 2 is a separate taxonomy from `OCCASION_CATEGORY` and
is keyed independently in `density-map.json`. `beverage` does not distinguish juice from
spirits; the density map keys on the source record's own category tags. A liquid whose class
does not resolve falls to `MANUAL` per §3.3a step 3.

### 7.3 Suppression

Suppression is evaluated in this order, and the first matching case renders. The order runs
most-specific cause first, so the message names why *this* request failed rather than a
downstream consequence of it.

1. **Source ineligible** — the source entry is `UNCATEGORIZED` (§7.2a) or has basis
   `NOT_APPLICABLE` (§3.3c):

   ```
   This item isn't categorized, so alternatives aren't available.
   ```

2. **Corpus empty** — no eligible candidate exists in the source's category:

   ```
   Not enough history yet to suggest an alternative.
   ```

   This is the expected state for a new user and is not an error. It resolves itself as entries
   accumulate.

3. **No candidate clears the threshold** — candidates exist but none achieves a delta ≥ 2.0:

   ```
   No clear alternative in this category.
   ```

Do not return a marginal swap to fill the slot.

---

## 8. Data, storage, and platform

### 8.1 Primary source

Open Food Facts. Barcode lookup, nutrients, NOVA classification, and the macro fields of §2.5.
NOVA is the only free structured source for `P5` and is why this is primary.

### 8.2 Secondary source

USDA FoodData Central, restricted to **Foundation Foods** and **SR Legacy**, is an **optional**
source requiring a user-supplied API key.

The app is fully functional without it. With no key configured, resolution uses `OFF` alone and
unresolved products fall to `MANUAL` (§8.5) as they otherwise would; `USDA` search returns
`NO_API_KEY` and is skipped.

**Why the key is the user's.** §13.4 puts any server component out of scope and §8.5a makes the
app local to the device, so there is nowhere to hold a secret: a key shipped in the bundle is
public, shared by every install, and revocable by a third party in a way that breaks every user
simultaneously. A key the user obtains is theirs, rate-limited to them, and removable by them.

Where the key is requested, the app states plainly that USDA is optional, that the key is free,
that it is stored on the device only, and that it is never transmitted anywhere except to
FoodData Central.

Entries in these datasets are single-ingredient or minimally-prepared by dataset construction
and are structurally NOVA 1–2; for them `P5` = 0 is a determined value, not a default, and §3.2
does not apply.

The USDA **Branded Food Products** dataset is not eligible. It contains ultra-processed
products with no NOVA field, so `P5` would be genuinely missing. Products found only there
resolve to `MANUAL` (§8.5) or do not resolve.

When no key is configured, the structural NOVA argument above is simply unavailable, and whole
foods that `OFF` does not carry route to `MANUAL` rather than being scored from an ineligible
source. The absence of a source is never a reason to relax §3.3c or §3.1.

### 8.3 Prohibited in the scoring path

An LLM must not produce attribute values, classifications, categories, densities, bases, macro
values, or scores. Results would not be reproducible and no audit trail would exist. An LLM may
be used only for free-text → product-ID resolution, and the resolved product ID must be stored
with the entry.

### 8.4 Storage contract

Every entry stores: `entry_id`, a unique identifier assigned at write and used as the primary
key; resolved product ID (not unique — §3.7 composite logging produces multiple entries sharing
a product ID on one date); source (`OFF` | `USDA` | `MANUAL` | `SAVED`);
`source_basis` and its provenance (`DECLARED` | `DERIVED_RULE_2`); quantity as entered and its
unit; `quantity_g`; `density_used`, its provenance (`DERIVED` | `DMAP-1` | `MANUAL`), and the
`density_class` that selected it where provenance is `DMAP-1`; the full **scored** attribute value set as
retrieved and as consumed, including explicit nulls; all four macro fields in `macros`, as
retrieved and as consumed, including explicit nulls — `macros` is authoritative for every macro
value, and macro values do not appear in `as_consumed`; `sugar_field_used`
where applicable; the resolved `OCCASION_CATEGORY` and the `CATMAP` version that produced it
(or `USER_OVERRIDE`); the coefficient set version; the computed score; the local calendar
date; `macro_basis` (`SCHEMA_2` | `PRE_SCHEMA_2`, §8.6a); `food_name` as resolved at write
(§6.0a); the `classification_set` — every classification-sourced attribute (`P3`–`P7`,
`A2`–`A8`) that applied to this entry, with its derived serving count or unit count; the
per-attribute `contributions` map, covering every attribute that contributed, nutrient and
classification alike; and `incomplete`, the resolved completeness state with the list of fields
that produced it (§3.2, §6.4).

`TREND_EPOCH` is stored once, outside any entry, at first log.

**Immutability.** Stored scores, attribute values, and macro values are immutable once written.
A coefficient version change applies only to entries logged after the change; it never
recomputes, rewrites, or reinterprets an existing entry. Prior days are read-only without
exception. Version drift within a window is surfaced by §6.3a, never resolved by recompute.

**No field of a stored entry is mutable.** Entries are strictly append-only: there is no
legitimate caller for an entry update path, and none is built. A correction is a new entry, not
an edit.

Editable state lives outside the entry: §7.2a's user category override edits the *product*
record, and §8.5a's saved products may be edited — neither alters any entry already logged. An
update to either is visible to future entries only.

**Rejection is loud.** A rejected write throws and names the rule that fired
(`IMMUTABLE_FIELD` | `PRIOR_DAY_READ_ONLY`). A silent no-op is prohibited: a caller that
believes it wrote and did not is the audit-trail failure this section exists to prevent.

**Self-sufficiency.** A stored entry contains everything needed to render every string §6
defines for it, without consulting a coefficient set, a source record, or any computation.
Rendering reads; it never scores. This is why the classification set and the contributions map
are stored rather than derived: nutrient contributions could be recomputed from `as_consumed`
and `coeff_version`, but classification contributions cannot be reconstructed from anything
else stored, and an entry that cannot render its own driver line is not auditable in any useful
sense.

A field that render needs and store lacks is a defect in this section, not a reason to
recompute at render time.

**Snapshots are deep.** Wherever this spec says a value is snapshotted or immutable — stored
entries (§8.4), saved-product snapshots at log time (§8.5a) — the guarantee extends to nested
structure. A shallow freeze leaves nested objects writable and produces a record that is
immutable in name only. This is a correctness requirement, not an implementation detail.

### 8.5 `MANUAL` source contract

A manual entry is created when a product does not resolve — including USDA Branded products
(§8.2), unknown-majority grain products (§3.1), unresolvable liquids (§3.3a), and records whose
basis does not resolve (§3.3c).

The user supplies:

- All four nutrient-sourced scored values (`P1`, `P2`, `P8`, `A1`), each in the attribute's
  unit, or explicitly marked absent.
- All four macro fields (§2.5), or explicitly marked absent.
- The classification set: which of `P3`–`P7`, `A2`–`A8` apply, and the serving basis.
- A name and a serving or package mass. For a liquid, a mass directly, **or** a volume plus a
  density.

  **Exception for `P3`.** If the user asserts `P3` (alcohol), a volume is mandatory: the entry
  must supply `volume_ml` and `ABV`, or `volume_ml` and a §3.6 fallback container size. The
  mass-directly branch is unavailable for alcoholic entries, because §3.6 computes ethanol
  from volume and ABV and mass alone cannot recover either. A density is additionally required
  if any nutrient or macro field is supplied, so that §3.3a can resolve `quantity_g`.

  The UI must not allow `P3` to be selected on a manual entry lacking a volume. This is an
  input constraint, not a missing-data case: §2.3 holds, and `INCOMPLETE` is never the right
  outcome here.

  The write-time rejection is retained alongside the form constraint. The UI constraint governs
  this form; the engine rejection governs every other caller, including future ones. Neither
  replaces the other.

Manual values are recorded on a `per_serving` basis with `serving_mass_g` equal to the mass
supplied (§3.3c).

A manual entry **can be `COMPLETE`.** It is `COMPLETE` when every nutrient and macro field
carries a value. A field the user explicitly marked absent resolves to null and marks the entry
`INCOMPLETE` exactly as a missing source field does (§3.2) — marking a field absent is a
statement that the record lacks the value, which is what `INCOMPLETE` records.

Omitting a field entirely is distinct: it is an input error (`FIELD_NOT_STATED`), not a
statement about the product, and no entry is created.

A blank input with no absence marker is neither a value nor an absence statement: it is an
unfinished form, and the entry is not written (`FIELD_NOT_STATED`). It is never read as 0.
Claiming a product contains zero sodium because the user has not typed yet is a worse assertion
than recording that the value is unknown.

Entries with basis `NOT_APPLICABLE` are outside this rule; see §3.3c.

**Manual entries are `UNCATEGORIZED` and therefore swap-ineligible** until the user sets a
category override (§7.2a). This is intended: `category-map.json` keys on source taxonomy fields
that a manual product does not have, and auto-assigning a category would be a guess in the place
the data is weakest.

Manual entries store `source: MANUAL` and are distinguishable in the log and any export.

### 8.5a Saved products (local)

A manual entry may be **saved as a local product record** so it need not be re-entered.

- Saving is explicit and user-initiated. Nothing is saved automatically.
- A saved product stores the same field set as a manual entry, plus a user-assigned name and
  any `OCCASION_CATEGORY` override.
- Logging from a saved product creates an entry with `source: SAVED` and copies the saved
  field values into the entry as an **immutable snapshot** (§8.4). Editing a saved product
  later does not alter any entry already logged from it. The entry's `product_id` is the saved
  product's `saved_id`. A saved product never carries or borrows a shared product id, so an
  entry logged from one is traceable to the local record and to nothing else.
- Saved products are **local only.** They are never uploaded, never shared, never merged into a
  cached or community product record, and never submitted back to `OFF`.
- A saved product carrying a user category override is swap-eligible; one without remains
  `UNCATEGORIZED`.

**Enforcement.** The local-only prohibition has a mechanism, not just a statement: any promotion
path to a shared or cached product record refuses records with `source: MANUAL` or
`source: SAVED`. The refusal is tested, so the rule fails loudly rather than depending on no
caller ever trying.

Rationale: §8.5's no-promotion rule is correct about not polluting shared data, but without a
local store, every multigrain loaf, USDA Branded item, and unresolvable liquid is re-entered by
hand on every log. That is the most likely cause of abandonment, and a local store fixes it
while sharing nothing.

### 8.6 Platform

**Target: installable PWA**, Chrome on Android, no framework, no build step. Nothing in this
spec requires a native API.

The shell is a small fixed set of same-origin files: `index.html` carrying all markup, style
and application script; `sw.js`; `manifest.webmanifest`; and an icon. A service worker cannot
be inlined — it must be a separate same-origin script, and its scope derives from its URL — so
"single file" is not achievable and is not required. What is required is no framework, no build
step, and no bundler.

- **Storage: IndexedDB**, not localStorage. §8.4 requires immutable per-entry snapshots plus
  versioned coefficient, category, and density sets, and §8.5a adds a saved-product store.
  Schema is versioned (`SCHEMA-2`) with an explicit migration path. `SCHEMA-1 → SCHEMA-2` adds
  the four macro fields, `density_used`, `source_basis`, `quantity_g`, and the saved-product
  store; existing entries take null on the new fields and are governed by §8.6a. Migrations may
  add fields; they may never alter a stored score, attribute value, or macro value.
  **On what a migration cannot recover.** A migration may add a field, but it cannot populate
  that field for entries written before it existed where the value is not reconstructible from
  what was stored. The classification set is the example: it cannot be recovered after the
  fact. Any field that rendering or auditing will need must be identified before the logging
  flow (§11 step 7) ships, because every entry written without it is permanently deficient.
- **Offline and updates are two requirements, not one.** The app must work with no network
  *and* pick up a new shell when a network is available. A cache-first service worker satisfies
  the first and silently defeats the second: the first version installed is served forever, and
  the failure presents as an app that simply never changes again.

  Required strategy:
  - Navigation requests and same-origin scripts: **network first**, falling back to cache. A
    reachable network always yields the current shell.
  - Other cached assets: cache first.
  - `CACHE_VERSION` is bumped on every shell change, and `activate` deletes every cache whose
    name does not match.
  - **Cross-origin responses are never cached.** §8.4 stores resolved values on the entry, so a
    cached `OFF` or `USDA` response would be a second, unversioned source of truth for a value
    already resolved and frozen.

  This matters more here than in a typical app: §8.4 entries are immutable and carry a
  coefficient version, so a stale shell writes entries under rules the user believes have been
  superseded.
- **Barcode scanning:** `BarcodeDetector`, EAN-13 and UPC-A, camera via `getUserMedia`. No
  library. If unavailable, fall back to manual barcode entry and text search; never degrade to
  an unscored state.
- **Network:** `OFF` and `USDA FDC` are plain `fetch`. `USDA FDC` requires a free API key. All
  lookups tolerate offline — an unresolvable lookup offers `MANUAL` (§8.5) or a saved product
  (§8.5a) rather than failing the log action.
- **Out of scope:** background sync, home-screen widgets, health-platform integration, iOS. iOS
  would need a WASM barcode fallback (Safari lacks `BarcodeDetector`); noted, not planned.

### 8.6a Migration carve-out

§8.4 immutability is **authoritative over §8.6 migration behavior.** A migration that adds
fields must not change what an existing entry displays.

Entries written under `SCHEMA-1` carry `macro_basis: PRE_SCHEMA_2`. For them:

- Null macro fields do **not** trigger `INCOMPLETE` (§3.2) and are not listed in §6.4.
- A day containing only such entries does not append ` · partial` to §6.2b; its §6.2b line is
  omitted entirely.
- §4.6 normalization **is** suppressed for any window containing one, rendering the §6.3b
  calorie-data string. The denominator is genuinely absent and is never imputed.
- `source_basis` and its provenance are **absent** on these entries — the fields are not
  present on the record, rather than present with a null value. `SCHEMA-1` had no basis
  concept, and a null would assert that provenance is unknown rather than inapplicable. Readers
  test for presence. §8.4's enum is unchanged and admits no null member. These fields are
  omitted from any audit or export view rather than rendered as unknown.

`PRE_SCHEMA_2` is set only by migration. It is never set on a new entry.

---

## 9. Required disclosures

### 9.1 Method page

Linked from every summary view. States: the attribute table in full; §9.2 provenance; §9.3
scope; §9.4 comparability; §9.5 macro statement; §3.3 serving masses; §3.3a density rule and
`DMAP-1` table; §3.3b scaling and the density-cancellation property; the §3.5 juice rule and
the §2.4 dual naming of `P1`; and §4.5's trend lag.

**Single source.** §9.2–§9.5's literal strings are exported as module constants and read from
there by every surface that displays them. No surface transcribes them. A duplicated copy of a
string this section calls literal defeats the designation.

### 9.2 Provenance string (literal)

```
Scores are a design model, not a measurement. Coefficients are assigned by this app
and informed by, but not derived from, published dietary inflammation research.
```

### 9.3 Scope string (literal)

```
This tracks a dietary pattern and records what you ate. It does not measure
inflammation in your body and is not a guide to any symptom or condition.
```

### 9.4 Comparability string (literal)

```
Loads are absolute, not adjusted for how much you ate. A high-intake day and a
low-intake day are not comparable to each other unless you use the per-1,000-kcal
figure, which is shown only when every entry in the window has calorie data.
```

### 9.5 Macro string (literal)

```
Calories and macros are recorded, not judged. This app sets no targets and will
not tell you whether a number is too high or too low.
```

---

## 10. Acceptance vectors

Implementation must reproduce these exactly. The spec (§1–§9) is authoritative; where a vector
disagrees, the spec wins and the vector is a defect.

**Vector conventions.** Every vector states values for all four scored nutrient attributes
(`P1`, `P2`, `P8`, `A1`), including zeros, and states the source basis and reported values from
which as-consumed values derive. An omitted attribute is a defect in the vector, never an
assertion of absence; a vector testing missing data states `null` explicitly.

Macro fields are stated only in vectors that test them. A vector that states no macro fields
asserts **nothing** about `INCOMPLETE` status: its fixture leaves macros null and makes no
completeness assertion. §3.2 still applies to a real entry with null macros — the silence is a
vector convention, not an exemption. Completeness behavior is tested by AV-11, AV-12, AV-13,
and AV-21 only.

A vector that asserts an exact `INCOMPLETE` list is the exception to this silence: it must
state all eight nutrient and macro fields, because §6.4's list spans both. AV-11, AV-12 and
AV-13 do so.

**Partial macro statement.** A vector stating *some* macro fields but not all is neither silent
nor complete, and C4 does not cover it. Such a vector must state all four: a vector that states
one macro field asserts, by omission, that the other three are null, which propagates a
` · partial` suffix into any day-level assertion that includes it. State all four or state
none.

**Aggregate vectors.** A vector whose subject is a day- or window-level computation states its
aggregate inputs directly and is exempt from the per-entry conventions above: it states no
source, basis, or reported values, because the entries producing the aggregate are not its
subject. AV-16, AV-17 and AV-18 are aggregate vectors. An implementer may synthesize any set of
entries summing to the stated aggregates; the synthesized entries are fixture scaffolding and
are not themselves asserted.

**Discrimination.** A vector asserting a property must be able to fail on that property's
defect at the stated tolerance. A vector whose correct and defective values coincide — a unit
density on a cancellation test, a rounded string on a precision test — asserts nothing and is
itself a defect. Where a vector's stated purpose names a defect, the vector states the
defective value and the delta.

**Precision.** Contribution columns are shown display-rounded to **6 dp**; the exact value is
given where it differs.

Fixture tolerance on contributions and sums is **1e-6**. This bound is imposed by the 6-dp
printing convention above, not independently chosen: it is a floor, not a target. Tightening it
requires printing more digits, not changing any computation.

`P3`-bearing values are non-terminating and are printed exactly. Both the `P3` contribution
and the entry sum are given, because they differ whenever the entry carries any other
contribution:

```
AV-4  (355 ml, 5.0% ABV)
  `P3` contribution = 2.0006785714285714…
  entry sum         = 2.0148785714285714…   (`P3` + `P2` 0.0142)

AV-6A (44 ml, 40% ABV)
  `P3` contribution = 1.9837714285714285…
  entry sum         = 1.9837714285714285…   (no other contribution; identical
                                             by coincidence, not by rule)
```

A fixture may assert either at any tolerance down to machine epsilon.

```
AV-16 `LOAD_PER_1000`
  exact = 2.948717948717948717…   (18.4 / 6.24)
  §4.6 displays `+2.9`
```

Any non-terminating value a vector asserts is printed exactly here, not only `P3` values. A
vector asserting a rounded form of a repeating decimal inherits a tolerance floor it did not
choose (B2).

Rendered strings are compared for **exact equality**.

### AV-1 — Snickers bar, 52.7 g (1 package)

Basis `per_serving`, `serving_mass_g` = 52.7. `quantity_g` = 52.7, so `as_consumed = reported`.

| Attribute | Reported (per serving) | As consumed | Contribution |
|-----------|------------------------|-------------|--------------|
| `P1` added sugar | 27 g | 27 g | +2.7 |
| `P2` sodium | 120 mg | 120 mg | +0.12 |
| `P8` saturated fat | 5.0 g | 5.0 g | +0.5 |
| `A1` fiber | 1.3 g | 1.3 g | −0.26 |
| `P5` NOVA 4 | — | 1 serving | +1.5 |

Sum = 4.56 exact. `SCORE` = **+4.6**
Drivers: `27 g added sugar` · `1 serving ultra-processed`

### AV-2 — Apple, medium, 182 g

Basis `per_100g` (USDA SR Legacy). `quantity_g` = 182.

| Attribute | Reported (per 100 g) | As consumed | Contribution |
|-----------|----------------------|-------------|--------------|
| `P1` added sugar | 0 g | 0 g | 0.0 |
| `P2` sodium | 1 mg | 1.82 mg | +0.00182 |
| `P8` saturated fat | 0.028 g | 0.05096 g | +0.005096 |
| `A1` fiber | 2.4 g | 4.368 g | −0.8736 |
| `A4` fruit | — | 182 / 120 = 1.516667 servings | −1.516667 |

Sum = −2.383351 exact. `SCORE` = **−2.4**
Drivers: `1.5 servings fruit`
(`A4` displayed value 1.5 ≠ 1, so `servings` is plural, §5.3.)

### AV-3 — Swap, AV-1 → candidate apple at `REFERENCE_MASS`

Per §7.2, the apple has no labeled serving; its first serving-based attribute in §2 order is
`A4` at 120 g. `REFERENCE_MASS` = 120 g.

| Attribute | Reported (per 100 g) | As consumed | Contribution |
|-----------|----------------------|-------------|--------------|
| `P1` | 0 g | 0 g | 0.0 |
| `P2` sodium | 1 mg | 1.2 mg | +0.0012 |
| `P8` saturated fat | 0.028 g | 0.0336 g | +0.00336 |
| `A1` fiber | 2.4 g | 2.88 g | −0.576 |
| `A4` fruit | — | 1.0 serving | −1.0 |

Sum = −1.57144 exact. `alt_score` = **−1.6**

Delta = 4.56 − (−1.57144) = 6.13144 ≥ 2.0.
`delta_driver_out`: `P1` 2.7 → 0.0, reduction 2.7.
`delta_driver_in`: `A4` 0.0 → 1.0, gain 1.0. `A1` 0.26 → 0.576, gain 0.316. `A4` wins.

Renders:

```
Alternative: Apple, 120 g — -1.6
Swaps 27 g added sugar for 1 serving fruit.
```

Confirms: `REFERENCE_MASS` resolution (§7.2), the §6.5 quantity slot, and `delta_driver_in`
selection by **gain** rather than absolute magnitude.

### AV-4 — Beer, 355 ml, 5.0% ABV

Basis `per_100ml` (§3.3c rule 2). Density 1.01 (`DMAP-1`, beer). `quantity_g` = 358.55.
`P3` uses the **entered volume**, exempt per §3.6:
ethanol = 355 × 0.05 × 0.789 = 14.004750 g → 1.000339 units.

| Attribute | Reported (per 100 ml) | As consumed | Contribution |
|-----------|-----------------------|-------------|--------------|
| `P1` | 0 g | 0 g | 0.0 |
| `P2` sodium | 4 mg | 14.2 mg | +0.0142 |
| `P8` | 0 g | 0 g | 0.0 |
| `A1` | 0 g | 0 g | 0.0 |
| `P3` alcohol | — | 1.000339 units | +2.000679 |
| `P5` | suppressed (§3.1) | — | 0.0 |

| Macro field | Reported (per 100 ml) | As consumed |
|-------------|-----------------------|-------------|
| `energy_kcal` | 43 | 152.65 |
| `protein_g` | 0.46 g | 1.633 g |
| `carbohydrate_g` | 3.55 g | 12.6025 g |
| `fat_g` | 0 g | 0 g |

§6.1a renders `153 kcal · 2 g protein · 13 g carbs · 0 g fat`.
Entry is `COMPLETE`.

Sum = 2.014879 exact. `SCORE` = **+2.0**
Drivers: `1 unit alcohol`
(Displayed value rounds to 1.0, strips to `1`, singular per §5.3.)

Confirms §3.6's scoping: `P3` bypasses the pipeline, but sodium and calories scale through it.
An implementation exempting the whole entry yields 0 kcal and is a defect.

### AV-5 — Five beers, completed day, no other entries

`DAILY_LOAD` = 5 × 2.014879 = 10.074393 → displays **+10.1**, band `D_ELEVATED`, label
`Elevated`.

Renders `{date}: +10.1 · Elevated` and nothing more (§6.6).
§6.2b renders **`763 kcal · 8 g protein · 63 g carbs · 0 g fat`**, with no ` · partial`
suffix — every entry is `COMPLETE`.

Summation, all at full precision, rounded once at display:

```
  kcal    5 × 152.65   = 763.25    → 763
  protein 5 × 1.633    = 8.165     → 8
  carbs   5 × 12.6025  = 63.0125   → 63
  fat     5 × 0        = 0         → 0
```

An implementation summing the §6.1a displayed integers produces 765 kcal, 10 g protein and
65 g carbs, and is a defect. The fixture asserts the full string.

Confirms full-precision summation before rounding, and that a high band triggers no message.

### AV-6A — Rum, 44 ml, 40% ABV

Logged as a separate entry from AV-6B per §3.7. The two together model a mixed drink; neither
is scored as a composite.

Basis `per_100ml`, density 0.94 (`DMAP-1`, spirits), `quantity_g` = 41.36.
Ethanol = 44 × 0.40 × 0.789 = 13.886400 g → 0.991886 units.

| Attribute | Reported (per 100 ml) | As consumed | Contribution |
|-----------|-----------------------|-------------|--------------|
| `P1` | 0 g | 0 g | 0.0 |
| `P2` | 0 mg | 0 mg | 0.0 |
| `P8` | 0 g | 0 g | 0.0 |
| `A1` | 0 g | 0 g | 0.0 |
| `P3` alcohol | — | 0.991886 units | +1.983771 |

Sum = 1.983771 exact. `SCORE` = **+2.0**
Drivers: `1 unit alcohol`

### AV-6B — Orange juice drink, 240 ml

The mixer entry of the pair begun in AV-6A (§3.7).

Basis `per_100ml`, density 1.04 (`DMAP-1`, juice), `quantity_g` = 249.6. `P5` serving mass:
labeled serving 240 ml → 249.6 g → 1.0 serving.

| Attribute | Reported (per 100 ml) | As consumed | Contribution |
|-----------|-----------------------|-------------|--------------|
| `P1` added sugar | 10.8 g | 25.92 g | +2.592 |
| `P2` sodium | 4.2 mg | 10.08 mg | +0.01008 |
| `P8` | 0 g | 0 g | 0.0 |
| `A1` | 0 g | 0 g | 0.0 |
| `P5` NOVA 4 | — | 1.0 serving | +1.5 |

Sum = 4.10208 exact. `SCORE` = **+4.1**
Drivers: `25.9 g added sugar` · `1 serving ultra-processed`

This is a sweetened juice drink, NOVA 4, not a 100% juice — §3.5 does not apply and `P1` reads
the added-sugars field normally.

**Discrimination.** At density 1.04, the apply-density-once defect yields `P1` = 26.9568 g →
+2.6957, and an entry sum of 4.2061632: a delta of 1.040832e-1 on both the `P1` contribution
and the entry score. At the previous density of 1.00 the correct path and the defect were
bit-identical and this vector detected nothing.

Confirms, across the mixed-drink pair (AV-6A, AV-6B), that `P3` suppresses `P5` **only on its
own entry**, that §3.3a conversion runs before serving derivation, and that density cancels
(10.8 × 240 / 100 = 25.92, independent of the 1.04 density).

### AV-6c — Manual alcoholic entry, mass-only (rejected)

User creates a `MANUAL` entry, asserts `P3`, and supplies a mass of 40 g with no volume and no
ABV.

The entry is **rejected at input** (§8.5). No entry is created, no score is computed, and no
`INCOMPLETE` marker is produced — the classification invariant of §2.3 is preserved by refusing
the input, not by scoring around it.

Supplying volume 44 ml and ABV 40% resolves the entry per AV-6A. With no nutrient or macro
values supplied, its basis is `NOT_APPLICABLE` (§3.3c) and §3.3b does not run.

Confirms that `P3` without a volume is an input error, not missing data.

### AV-7 — Whole-grain crackers, 30 g, NOVA 4

Basis `per_serving`, `serving_mass_g` = 30. `quantity_g` = 30.

| Attribute | Reported (per serving) | As consumed | Contribution |
|-----------|------------------------|-------------|--------------|
| `P1` added sugar | 0.5 g | 0.5 g | +0.05 |
| `P2` sodium | 200 mg | 200 mg | +0.2 |
| `P8` saturated fat | 1.0 g | 1.0 g | +0.1 |
| `A1` fiber | 3.0 g | 3.0 g | −0.6 |
| `P5` NOVA 4 | — | 1 serving | +1.5 |
| `A7` whole grain | — | 1 serving | −1.0 |

Majority grain mass is determinable and whole, so `P4` does not apply (§3.1).

Sum = 0.25 exact. `SCORE` = **+0.3** (half away from zero, §1.3)
Drivers: `1 serving ultra-processed` · `1 serving whole grain`

### AV-7a — Mixed-grain product, majority unknown

Product resolves from `OFF` with both whole and refined flour listed and no mass ordering.

Majority grain mass is not determinable. Per §3.1 the classification does not resolve: the
product is **not scored and not stored** from `OFF`. The UI offers `MANUAL` (§8.5) and, once
entered, saving as a local product (§8.5a).

Confirms that unknown majority does not default to `P4`.

### AV-7b — Basis does not resolve

`OFF` record with `nutrition_data_per` absent. §3.3c rule 4 applies: the record does not
resolve. No entry is created from `OFF`; the UI offers `MANUAL`.

Confirms the basis is never inferred and `per_100g` is never a fallback.

### AV-8 — Orange juice, 240 ml, labeled 100%

Basis `per_100ml`, density 1.04 (`DMAP-1`, juice), `quantity_g` = 249.6.

| Attribute | Reported (per 100 ml) | As consumed | Contribution |
|-----------|-----------------------|-------------|--------------|
| `P1` — **total sugars** field | 8.7 g | 20.88 g | +2.088 |
| `P2` sodium | 0.8 mg | 1.92 mg | +0.00192 |
| `P8` | 0 g | 0 g | 0.0 |
| `A1` fiber | 0.2 g | 0.48 g | −0.096 |
| `A4` fruit | not applied (§3.5) | — | 0.0 |

Added-sugars field reports 0 and is ignored. Entry stores `sugar_field_used: "total"`.

Sum = 1.99392 exact. `SCORE` = **+2.0**
Drivers: `20.9 g sugar`

Confirms §2.4 (`sugar`, not `added sugar`) and §3.3b cancellation: 8.7 × 240 / 100 = 20.88, the
1.04 density appearing on both sides and cancelling exactly. An implementation applying density
once yields 21.72 g and is a defect.

### AV-9 — Almonds, 45 g (fractional serving derivation)

Basis `per_100g`. `quantity_g` = 45.

| Attribute | Reported (per 100 g) | As consumed | Contribution |
|-----------|----------------------|-------------|--------------|
| `P1` | 0 g | 0 g | 0.0 |
| `P2` | 0 mg | 0 mg | 0.0 |
| `P8` saturated fat | 3.8 g | 1.71 g | +0.171 |
| `A1` fiber | 12.5 g | 5.625 g | −1.125 |
| `A5` nuts | — | 45 / 30 = 1.5 servings | −2.25 |

Sum = −3.204 exact. `SCORE` = **−3.2**
Drivers: `1.5 servings nuts` · `5.6 g fiber`

### AV-9a — Unlabelled liquid, `P5` serving mass

Source `OFF`, basis `per_100ml` (rule 2), provenance `DERIVED_RULE_2`. Sweetened almond
beverage, NOVA 4, no labeled serving size. Density 1.03 (`DMAP-1`, milk and dairy drinks).
Entry: 250 ml → `quantity_g` = 257.5.

`P5` serving mass, unlabelled fallback: 100 ml × 1.03 = 103 g.
`P5` servings = 257.5 / 103 = 2.5.

| Attribute | Reported (per 100 ml) | As consumed | Contribution |
|-----------|-----------------------|-------------|--------------|
| `P1` added sugar | 3.2 g | 8.0 g | +0.8 |
| `P2` sodium | 60 mg | 150 mg | +0.15 |
| `P8` saturated fat | 0.1 g | 0.25 g | +0.025 |
| `A1` fiber | 0.4 g | 1.0 g | −0.2 |
| `P5` NOVA 4 | — | 2.5 servings | +3.75 |

Sum = 4.525 exact. `SCORE` = **+4.5**
Drivers: `2.5 servings ultra-processed`

**Discrimination.** An implementation using a flat 100 g fallback yields `P5` = 2.575 servings
→ +3.8625, sum 4.6375, a delta of 1.125e-1. An implementation applying density once to the
nutrients yields `P1` = 8.24 g, sum 4.54825, a delta of 2.325e-2. Both exceed tolerance.

### AV-10 — Olive oil, 15 ml (density, cancellation, sub-serving)

Source `USDA SR Legacy`, basis `per_100g`, provenance `DECLARED`. Density 0.91 (`DMAP-1`,
culinary oil), `quantity_g` = 13.65.

The source matters: an `OFF` record for an oil sold in a volumetric package would resolve to
`per_100ml` under §3.3c rule 2, and density would cancel rather than apply. This vector tests
the non-cancelling case, where the basis is per mass and the entry is per volume.

| Attribute | Reported (per 100 g) | As consumed | Contribution |
|-----------|----------------------|-------------|--------------|
| `P1` | 0 g | 0 g | 0.0 |
| `P2` | 0 mg | 0 mg | 0.0 |
| `P8` saturated fat | 13.8 g | 1.8837 g | +0.18837 |
| `A1` | 0 g | 0 g | 0.0 |
| `A8` olive oil | — | 13.65 / 14 = 0.975 servings | −0.4875 |

Sum = **−0.29913** exact. `SCORE` = **−0.3**
No attribute reaches the 1.0 driver threshold, so the second line is **omitted** (§6.1).

**Counterfactual.** A flat 1 ml = 1 g gives `quantity_g` = 15: `P8` → +0.207, `A8` → 15/14 =
1.071429 servings → −0.535714, sum = **−0.328714**.

**Fixture assertion.** The fixture asserts `sum == -0.29913` at the §10 tolerance of 1e-6. It
must **not** assert the rendered string: the correct value, the flat-conversion counterfactual
(−0.328714), and the `A8`-only variant (−0.347344) all render `-0.3`, so a string assertion
passes on the defect this vector exists to catch.

### AV-11 — Missing data, pro-inflammatory

Source `OFF`, basis `per_100g` via §3.3c rule 3 (`nutrition_data_per: "100g"`, mass package
quantity), provenance `DECLARED`. `quantity_g` = 100.

| Attribute | Reported (per 100 g) | As consumed | Contribution |
|-----------|----------------------|-------------|--------------|
| `P1` added sugar | 2.0 g | 2.0 g | +0.2 |
| `P2` sodium | `null` | — | 0.0 |
| `P8` saturated fat | 1.0 g | 1.0 g | +0.1 |
| `A1` fiber | 5.0 g | 5.0 g | −1.0 |

| Macro field | Reported (per 100 g) | As consumed |
|-------------|----------------------|-------------|
| `energy_kcal` | 250 | 250 |
| `protein_g` | 10 g | 10 g |
| `carbohydrate_g` | 30 g | 30 g |
| `fat_g` | 8 g | 8 g |

Sum = −0.7 exact. `SCORE` = **−0.7**
Marked `INCOMPLETE`, renders `Incomplete — missing sodium` — a one-item list, which holds only
because all four macro fields are present (§10, C4 exception).
Drivers: `5 g fiber`
Score is still computed and still counts toward `DAILY_LOAD`.

### AV-12 — Missing data, anti-inflammatory (symmetry)

Source `OFF`, basis `per_100g` via §3.3c rule 3, provenance `DECLARED`. `quantity_g` = 100.
Same product as AV-11 with `sodium` present and `fiber` null.

| Attribute | Reported (per 100 g) | As consumed | Contribution |
|-----------|----------------------|-------------|--------------|
| `P1` added sugar | 2.0 g | 2.0 g | +0.2 |
| `P2` sodium | 300 mg | 300 mg | +0.3 |
| `P8` saturated fat | 1.0 g | 1.0 g | +0.1 |
| `A1` fiber | `null` | — | 0.0 |

| Macro field | Reported (per 100 g) | As consumed |
|-------------|----------------------|-------------|
| `energy_kcal` | 250 | 250 |
| `protein_g` | 10 g | 10 g |
| `carbohydrate_g` | 30 g | 30 g |
| `fat_g` | 8 g | 8 g |

Sum = 0.6 exact. `SCORE` = **+0.6**
Marked `INCOMPLETE`, renders `Incomplete — missing fiber`.
No driver reaches threshold; second line omitted.

An implementation marking AV-11 but not AV-12 is a defect.

### AV-13 — Missing data, macro (symmetry)

Source `OFF`, basis `per_100g` via §3.3c rule 3, provenance `DECLARED`. `quantity_g` = 100.
Same product as AV-12 with `fiber` = 5.0 g restored and `protein_g` null.

| Attribute | Reported (per 100 g) | As consumed | Contribution |
|-----------|----------------------|-------------|--------------|
| `P1` added sugar | 2.0 g | 2.0 g | +0.2 |
| `P2` sodium | 300 mg | 300 mg | +0.3 |
| `P8` saturated fat | 1.0 g | 1.0 g | +0.1 |
| `A1` fiber | 5.0 g | 5.0 g | −1.0 |

| Macro field | Reported (per 100 g) | As consumed |
|-------------|----------------------|-------------|
| `energy_kcal` | 250 | 250 |
| `protein_g` | `null` | — |
| `carbohydrate_g` | 30 g | 30 g |
| `fat_g` | 8 g | 8 g |

Sum = −0.4 exact. `SCORE` = **−0.4**
Marked `INCOMPLETE`, renders `Incomplete — missing protein` (§2.4 display name, not
`protein_g`).
§6.1a renders `250 kcal · 30 g carbs · 8 g fat` — the null protein field is omitted along with
its separator.
The day's §6.2b line appends ` · partial`.

### AV-14 — Negative zero

`MANUAL` entry, basis `per_serving`, `serving_mass_g` = quantity.

| Attribute | Reported | As consumed | Contribution |
|-----------|----------|-------------|--------------|
| `P1` | 0 g | 0 g | 0.0 |
| `P2` sodium | 20 mg | 20 mg | +0.02 |
| `P8` | 0 g | 0 g | 0.0 |
| `A1` fiber | 0.3 g | 0.3 g | −0.06 |

Sum = −0.04 exact. Renders **`+0.0`**. The string `-0.0` must not appear (§6.1).
No driver reaches threshold; second line omitted.

### AV-15 — Negative rounding

`MANUAL` entry, single entry on a completed day, no classification attributes.

| Attribute | Reported | As consumed | Contribution |
|-----------|----------|-------------|--------------|
| `P1` | 0 g | 0 g | 0.0 |
| `P2` | 0 mg | 0 mg | 0.0 |
| `P8` | 0 g | 0 g | 0.0 |
| `A1` fiber | 9.25 g | 9.25 g | −1.85 |

Sum = −1.85 exact. `SCORE` = **−1.9**. `DAILY_LOAD` = −1.85 → displays **−1.9**, band
`D_NEUTRAL`.
Drivers: `9.3 g fiber` (9.25 → half away from zero → 9.3.)

An implementation rounding toward positive infinity produces −1.8 and is a defect.

### AV-16 — Normalization, preconditions met

Window: three completed days, at least one entry, every entry has `energy_kcal`.
`WINDOW_LOAD` = +18.4. `WINDOW_KCAL` = 6,240.

`LOAD_PER_1000` = 18.4 / 6.240 = 2.948718 → renders `Per 1,000 kcal: +2.9`
Window line renders band `W_ELEVATED`. The normalized line carries **no band** (§4.6).

### AV-17 — Normalization, calorie data missing

Same window, one entry with `energy_kcal = null`.

Renders `Per 1,000 kcal: unavailable — some entries have no calorie data`

### AV-18 — Normalization, empty window

Window contains zero entries. `WINDOW_KCAL` = 0; `LOAD_PER_1000` is **not computed** — the
entry-count precondition fails before any division.

Renders `Per 1,000 kcal: unavailable — no entries in this window`

Confirms §4.6's entry-count precondition. An implementation checking only the null condition
divides 0 by 0 and is a defect.

### AV-19 — Trend anchoring

`TREND_EPOCH` = 2026-09-01. Entries exist through 2026-09-14.

Blocks: `[09-01 … 09-03]`, `[09-04 … 09-06]`, `[09-07 … 09-09]`, `[09-10 … 09-12]`.
Current block `[09-13 … 09-15]` is incomplete (09-15 is today) and is **not plotted**.

On 2026-09-15 and on 2026-09-16, blocks 1–4 have identical boundaries and identical values. An
implementation re-anchoring to the most recent completed day shifts every boundary and is a
defect.

Same date, §6.3 covers 09-12 … 09-14 while the newest plotted block covers 09-10 … 09-12 — the
§4.5 lag, which is intended.

**Backdated arrival.** With `TREND_EPOCH` = 2026-09-01 and the blocks above, an entry dated
2026-08-30 is logged. It falls in block −1 (`08-29 … 08-31`), which is plotted. Blocks 1–4
retain identical boundaries and identical values.

An implementation moving the epoch to 2026-08-30 re-cuts every boundary — blocks would become
`[08-30 … 09-01]`, `[09-02 … 09-04]` and so on — and is a defect. An implementation excluding
the 08-30 entry from the trend while retaining it in the log is also a defect.

### AV-20 — Empty block gapped

`TREND_EPOCH` = 2026-09-01. No entries exist on 09-04, 09-05, or 09-06.

Block `[09-04 … 09-06]` contains zero entries and is **not plotted**. Its x-axis position is
preserved and left empty. It must not be plotted at `+0.0`.

A block containing one entry scoring exactly 0.0 **is** plotted, at `+0.0`.

Confirms the distinction between no data and balanced data (§4.5).

### AV-21 — `PRE_SCHEMA_2` migration

Entry written under `SCHEMA-1`, migrated to `SCHEMA-2`, carrying `macro_basis: PRE_SCHEMA_2`
with all four macro fields null.

**Step 2 (storage) asserts the decisions:**

- `dayMacroLinePolicy()` returns `OMIT` for a day containing only such entries.
- `windowNormalizationStatus()` returns `NO_CALORIE_DATA` for any window containing one.
- No `INCOMPLETE` marker is set on account of macro nulls.

**Step 5 (display) asserts the strings:**

- The §6.2b day macro line is omitted entirely — not rendered with ` · partial`.
- §6.4 lists nothing on account of macro nulls.
- §6.3b renders `Per 1,000 kcal: unavailable — some entries have no calorie data`.

The split follows §8.6a's nature: it is a policy about what is true, and §6 renders what that
policy decides.

Confirms §8.6a: the migration changes nothing about what the historical day displays, while
§4.6 still correctly refuses to normalize against an absent denominator.

### AV-22 — Macro `<1` rendering (§1.3)

Source `MANUAL`, basis `per_serving`, `serving_mass_g` = 100, provenance `DECLARED`.
`quantity_g` = 100.

| Attribute | Reported | As consumed | Contribution |
|-----------|----------|-------------|--------------|
| `P1` added sugar | 0 g | 0 g | 0.0 |
| `P2` sodium | 100 mg | 100 mg | +0.1 |
| `P8` saturated fat | 0 g | 0 g | 0.0 |
| `A1` fiber | 0.2 g | 0.2 g | −0.04 |

| Macro field | Reported | As consumed |
|-------------|----------|-------------|
| `energy_kcal` | 12 | 12 |
| `protein_g` | 0.4 g | 0.4 g |
| `carbohydrate_g` | 3 g | 3 g |
| `fat_g` | 0 g | 0 g |

Sum = 0.06 exact. `SCORE` = **+0.1**
No driver reaches threshold; second line omitted.
Entry is `COMPLETE` — every field carries a value.

§6.1a renders:

```
12 kcal · <1 g protein · 3 g carbs · 0 g fat
```

Both branches of §1.3's macro rule are exercised: `protein_g` = 0.4 is non-null and greater
than 0, so it renders `<1` rather than `0`; `fat_g` is exactly 0 and renders `0`. An
implementation rounding 0.4 to `0` makes §6.1a assert that a field is zero on a line shown
precisely because the field is non-null.

### AV-23 — `REFERENCE_MASS` from logged median

Product `X` appears in four stored entries at `quantity_g` 40, 45, 52 and 60.

Median of an even count is the **lower** of the two middle values: 45.
`REFERENCE_MASS` = 45 g.

An implementation averaging (49.25) or taking the upper middle value (52) is a defect. §6.5
renders `, 45 g` in the alternative line.

This vector exists to fix the even-count tie rule, which is the only place median is ambiguous.

**Discrimination.** Quantities 40, 45, 52, 60. Correct `REFERENCE_MASS` is the lower middle
value, **45**. The averaging defect yields **49.25**; the upper-middle defect yields **52**.
§6.5 renders `, 45 g`; the defects render `, 49.3 g` and `, 52 g`. All three differ in the
rendered string, so a string assertion discriminates here — unlike AV-10.

### AV-24 — Cold start suppression

The store contains three entries, all of distinct products, none saved.

No product has two or more stored entries, so the corpus is empty. A swap request on any entry
renders:

```
Not enough history yet to suggest an alternative.
```

No candidate is returned and no §6.5 line is rendered.

**Discrimination.** The corpus is empty, so §7.3 case 2 renders:

```
Not enough history yet to suggest an alternative.
```

The likely defect renders §7.3 case 3 instead:

```
No clear alternative in this category.
```

These are different claims: case 2 says there is nothing to compare against, case 3 says a
comparison was made and found nothing better. An implementation rendering case 3 on an empty
corpus asserts a comparison that never happened. A fallback to a curated list or an external
database is a separate defect and fails the corpus assertion.

---

## 11. Implementation order

**Authority.** §11's vector lists are authoritative over any list in a handoff, prompt, or
review note. When the two disagree, §11 wins and the discrepancy is reported. Any edit that
adds, removes, or renumbers a vector must update §11 in the same pass.

**Claims about vectors bind those vectors.** An edit that asserts or invalidates anything about
a vector must edit that vector in the same pass. A §10 convention naming specific vectors, a
claim that a vector states or demonstrates something, or a change that makes a vector's
surrounding prose false — each obliges the edit to carry the vector with it.

This is D6's rule pointing the other way: D6 requires a vector change to update its citations;
this requires a claim about a vector to update the vector.

**Enforcement.** After every edit pass, the round audit checks both directions mechanically:
§11's citations against §10's headings, and every vector named in a §10 convention against that
convention's requirement. A vector that fails a convention naming it is a defect in whichever
was written last, and is reported rather than resolved.

1. §3.3c basis resolution, §3.3a, §3.3b, §3.3, §3.1, §3.6. Vectors AV-1, AV-4, AV-6A, AV-6B,
   AV-6c, AV-7, AV-7b, AV-8, AV-9, AV-9a, AV-10, AV-14, AV-15.
   Also §1.2's selection logic: `DAILY_LOAD`, `TODAY_LOAD`, `WINDOW_LOAD` and `BLOCK_LOAD`
   day-set selection, and §6.3a's mixed-version detection. These are engine-side — §1.2 defines
   them as core units — and were omitted from this step's original description rather than
   assigned elsewhere.
2. §8.4 / §8.6 IndexedDB storage, `SCHEMA-2`, immutability, §8.6a carve-out. Vector AV-21.
3. §8.1 / §8.2 source resolution; §8.5 manual entry; §8.5a saved products. Vectors AV-7a,
   AV-11, AV-12, AV-13.
4. §2.5 macro capture; §4.6 normalization. Vectors AV-16, AV-17, AV-18.
5. §4, §6 display and banding, including §6.1a, §6.2a, §6.2b, §6.3a, §6.3b. Vectors AV-2, AV-5,
   AV-8, AV-22. Also §3.5 juice field selection and its §2.4 display-name consequence. Step 1 fixtures
   supply the selected value directly in the `P1` slot; step 5 is where selection itself is
   implemented and AV-8's `sugar` driver string is asserted.
6. **Application shell (§13).** The PWA itself: manifest, service worker, navigation, and the
   screens listed in §13. No new scoring or storage logic — this step wires what steps 1–5
   built to something that opens.
7. **Logging flow (§13.2).** Barcode scan, text search, quantity entry, manual entry, saved
   products. The first path by which a user creates an entry.
8. §4.5 trend. Vectors AV-19, AV-20.
9. §9 method page.
10. §7 swap engine. Vectors AV-3, AV-23, AV-24. Unblocked as of v1.0 (`[OPEN-7]` resolved).

---

## 12. Open decisions

None blocks any step. `[OPEN-7]` and `[OPEN-8]` are resolved in v1.0: the corpus by §7.2's
logged-history rule, and `[OPEN-8]`'s count-stated serving (`1 bar`, `2 cookies`) by the
median rule, which never consults a label serving.

**Known limitation — timezone and day boundary.** Entries are assigned to the device's local
calendar date at write time, and the date is stored immutably (§8.4). If the device timezone
changes, an entry near midnight may be assigned to a different calendar day than the user would
expect, and entries logged around the change may appear on adjacent days.

This is accepted rather than resolved. Its former consequence — an entry falling outside every
trend block — was removed by bidirectional blocks (§4.5, v1.3), so a misassigned entry is still
counted and still plotted, only possibly on the neighbouring day. Travel across timezones is the
case in which it will be seen.
- `[OPEN-9]` **`TREND_EPOCH` after a full data wipe.** §8.4 says immutable and that deleting the
  first entry does not move it, but says nothing about clearing all data. Interim: a full wipe
  clears `TREND_EPOCH`, and the next log sets it afresh. Affects §4.5 only.

---

## 13. Application shell

§8.6 specifies the platform; this section specifies what the user opens. It is deliberately
thin: unlike §1–§10, it has no acceptance vectors and is the first part of this spec written
without one. Propose the layout; the constraints below are the part that is not negotiable.

### 13.1 Screens

- **Today.** `TODAY_LOAD` (§6.2a), the day's entries (§6.1, §6.1a), the day macro line
  (§6.2b), and the primary action: add an entry.
- **Log.** Entries by date, reachable by date. Completed-day summaries (§6.2) and the window
  summary (§6.3, §6.3a, §6.3b).
- **Add.** The §13.2 flow.
- **Method.** §9's method page.
- **Trend.** §4.5, once step 8 lands.
- **Settings.** The optional USDA API key (§8.2), and nothing else. This screen exists for that
  one purpose and does not accumulate preferences, targets, or goals (§13.3).

### 13.2 Logging flow

Barcode scan → resolve (§8.1, §8.2, §3.3c) → quantity entry → confirm → write.

Every failure to resolve offers manual entry (§8.5) rather than dead-ending, and a manual entry
offers to save (§8.5a). Text search is the fallback when `BarcodeDetector` is unavailable or a
scan fails.

Quantity entry is grams or millilitres (§3.3), with the package shortcut where a net weight
exists. This is known friction and is accepted (§3.3); it is not to be softened with
serving-count estimates, which would reintroduce inference.

### 13.3 Constraints

These are §2.5, §6.6 and §4.4 restated as UI requirements, and they bind the shell as strictly
as they bind the string layer:

- No targets, goals, budgets, remaining figures, progress rings, gauges, or streaks anywhere in
  the interface.
- No entry is banded or colored (§4.4). Bands appear only on completed days and windows, as
  text labels.
- No verdict words, no imperatives, no symptom claims, no message triggered by a high band
  (§6.6).
- No notification, badge, or reminder that reports a load, a macro, or a band. The app does not
  tell the user how they are doing when they have not asked.
- Offline: the app opens and logs manual and saved entries with no network. Only resolution
  requires it.

**Storage fallback is visible.** If IndexedDB is unavailable and the app falls back to an
in-memory store, it says so persistently while that mode is active:

```
Not saving — this device's storage is unavailable. Entries will be lost when you close the app.
```

This is a factual statement about the app, not a verdict about the user, and is the one
standing message §13.3 permits.

### 13.5 Refusal copy

Every engine refusal reaching the user carries a sentence stating what happened and what the
user can do, and the flow pre-fills everything already known (§13.2). Refusal copy is literal
in the sense of §6: written here, read from a module constant, never transcribed into a
surface.

Refusal copy states a fact about the data, never a judgment about the product or the user.
"This product doesn't list which flour is used, so it can't be scored automatically" is
correct; anything implying the product is deficient, suspect, or a poor choice is prohibited by
§6.6.

The copy for each refusal reason is maintained with the reason codes it covers: §3.3c rule 4,
§3.1 `GRAIN_MAJORITY_UNKNOWN`, §3.3a step 3, §8.2's ineligible dataset, and K2's `P3` volume
rule.

### 13.4 Out of scope

Accounts, sync, sharing, export to third parties, and any server component. The app is local to
the device (§8.5a, §8.6).
