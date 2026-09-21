# Dietary Inflammatory Load — Normative Spec v0.9

**Supersedes:** v0.8. Resolves U1–U6, V1–V5 and W1. Completes the AV-11/12/13 blocks that U1
found asserting something false (§10), makes `entry.macros` authoritative for macro values
(§8.4), adds AV-22 for K9's `<1` rule, and adopts W1's claims-bind-vectors rule with a
mechanical two-direction audit (§11).

## Changed vector IDs

`AV-22` is **new**, appended after `AV-21`, covering K9's `<1` macro rendering rule, which
had no vector. Nothing renumbers. §11 step 5 is updated in the same pass, per W1.

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

| ID | Attribute | Unit | Coefficient | Source class |
|----|-----------|------|-------------|--------------|
| `P1` | Added sugar | per 10 g | +1.0 | nutrient |
| `P2` | Sodium | per 500 mg | +0.5 | nutrient |
| `P3` | Alcohol | per unit (14 g ethanol) | +2.0 | classification |
| `P4` | Refined grain | per serving | +1.0 | classification |
| `P5` | Ultra-processed (NOVA 4) | per serving | +1.5 | classification |
| `P6` | Processed meat | per serving | +2.0 | classification |
| `P7` | Deep-fried preparation | per serving | +1.5 | classification |
| `P8` | Saturated fat | per 5 g | +0.5 | nutrient |

### 2.2 Anti-inflammatory attributes

| ID | Attribute | Unit | Coefficient | Source class |
|----|-----------|------|-------------|--------------|
| `A1` | Fiber | per 5 g | −1.0 | nutrient |
| `A2` | Omega-3 fish | per serving | −3.0 | classification |
| `A3` | Non-starchy vegetable | per serving | −1.5 | classification |
| `A4` | Fruit (whole) | per serving | −1.0 | classification |
| `A5` | Nuts / seeds | per 30 g | −1.5 | classification |
| `A6` | Legumes | per serving | −1.5 | classification |
| `A7` | Whole grain | per serving | −1.0 | classification |
| `A8` | Olive oil | per 14 g | −0.5 | classification |

### 2.3 Source classes

**Nutrient-sourced:** `P1`, `P2`, `P8`, `A1`. Values come from data-source fields, scale per
§3.3b, and can be absent. Governed by §3.2.

**Classification-sourced:** `P3`–`P7`, `A2`–`A8`. Values follow from the resolved product's
classification and quantity. They are never absent — either the product resolves and they are
determined, or the product does not resolve and no entry is created (§3.1, §3.3c, §8.5).

### 2.4 Display names

An attribute's display name is its §2.1/§2.2 name, lowercase, with one exception:

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
   individual product:

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

**Anchoring.** Blocks count forward from `TREND_EPOCH`, the local calendar date of the first
stored entry. `TREND_EPOCH` is written once at first log and is immutable; it is never
recomputed, and deleting the first entry does not move it. Block *n* covers `TREND_EPOCH + 3n`
through `TREND_EPOCH + 3n + 2`. Boundaries therefore never shift, and the same entries produce
the same trend on any day.

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

### 6.1 Entry line

```
{food_name} — {score:+0.1f}
{driver_1} · {driver_2} · {driver_3}
```

Score always shows an explicit sign. If the rounded score has zero magnitude it renders as
`+0.0` regardless of the unrounded sign. The string `-0.0` must never be produced. Test
assertion: `format(-0.04)` == `+0.0`.

If no attribute reaches the §5.1 threshold, the second line is omitted.

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

### 7.1 Trigger

Swaps are offered **only on explicit user request** per entry. The entry line carries a passive
affordance; no suggestion appears unrequested.

### 7.2 Candidate selection

Candidates are drawn from the same `OCCASION_CATEGORY` as the source entry.

**Candidates are scored at `REFERENCE_MASS`**, resolved as:

1. The candidate's labeled serving mass, if the source record supplies one (converted per
   §3.3a if stated in volume).
2. Otherwise, the §3.3 serving mass of the first serving-based attribute the candidate carries,
   in §2 table order (`P4` before `P5` before `P6`, then `A2` onward).
3. If the candidate carries no labeled serving and no serving-based attribute, it is ineligible
   as a candidate.

The source entry is scored at its logged quantity. The two are not mass-matched, and no
mass-comparison rule applies.

Rationale: a swap is a substitution of one item for another, not an isocaloric exchange.
Gram-matching produced sub-threshold drivers that silently suppressed §6.5's second line.

Rank candidates by `source_score − candidate_score` descending. Return the top 1. The candidate
corpus is unresolved — see §12.

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

**Liquid classification** for §3.3a step 2 is a separate taxonomy from `OCCASION_CATEGORY` and
is keyed independently in `density-map.json`. `beverage` does not distinguish juice from
spirits; the density map keys on the source record's own category tags. A liquid whose class
does not resolve falls to `MANUAL` per §3.3a step 3.

### 7.3 Suppression

If no candidate achieves a delta ≥ 2.0:

```
No clear alternative in this category.
```

If the source entry is `UNCATEGORIZED`:

```
This item isn't categorized, so alternatives aren't available.
```

Do not return a marginal swap to fill the slot.

---

## 8. Data, storage, and platform

### 8.1 Primary source

Open Food Facts. Barcode lookup, nutrients, NOVA classification, and the macro fields of §2.5.
NOVA is the only free structured source for `P5` and is why this is primary.

### 8.2 Secondary source

USDA FoodData Central, restricted to **Foundation Foods** and **SR Legacy**. Entries in these
datasets are single-ingredient or minimally-prepared by dataset construction and are
structurally NOVA 1–2; for them `P5` = 0 is a determined value, not a default, and §3.2 does
not apply.

The USDA **Branded Food Products** dataset is not eligible. It contains ultra-processed
products with no NOVA field, so `P5` would be genuinely missing. Products found only there
resolve to `MANUAL` (§8.5) or do not resolve.

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
date; and `macro_basis` (`SCHEMA_2` | `PRE_SCHEMA_2`, §8.6a).

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

Manual values are recorded on a `per_serving` basis with `serving_mass_g` equal to the mass
supplied (§3.3c).

A manual entry **can be `COMPLETE`.** It is `COMPLETE` when every nutrient and macro field
carries a value. A field the user explicitly marked absent resolves to null and marks the entry
`INCOMPLETE` exactly as a missing source field does (§3.2) — marking a field absent is a
statement that the record lacks the value, which is what `INCOMPLETE` records.

Omitting a field entirely is distinct: it is an input error (`FIELD_NOT_STATED`), not a
statement about the product, and no entry is created.

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

**Target: installable PWA**, Chrome on Android, single-page, no framework. Nothing in this spec
requires a native API.

- **Storage: IndexedDB**, not localStorage. §8.4 requires immutable per-entry snapshots plus
  versioned coefficient, category, and density sets, and §8.5a adds a saved-product store.
  Schema is versioned (`SCHEMA-2`) with an explicit migration path. `SCHEMA-1 → SCHEMA-2` adds
  the four macro fields, `density_used`, `source_basis`, `quantity_g`, and the saved-product
  store; existing entries take null on the new fields and are governed by §8.6a. Migrations may
  add fields; they may never alter a stored score, attribute value, or macro value.
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

Macro: `energy_kcal` reported 43 per 100 ml → as consumed 152.65 → renders `153 kcal`.

Sum = 2.014879 exact. `SCORE` = **+2.0**
Drivers: `1 unit alcohol`
(Displayed value rounds to 1.0, strips to `1`, singular per §5.3.)

Confirms §3.6's scoping: `P3` bypasses the pipeline, but sodium and calories scale through it.
An implementation exempting the whole entry yields 0 kcal and is a defect.

### AV-5 — Five beers, completed day, no other entries

`DAILY_LOAD` = 5 × 2.014879 = 10.074393 → displays **+10.1**, band `D_ELEVATED`, label
`Elevated`.

Renders `{date}: +10.1 · Elevated` and nothing more (§6.6).
§6.2b renders **`763 kcal`**: 5 × 152.65 = 763.25, rounded once at display.

An implementation summing the §6.1a displayed integers produces 5 × 153 = 765 and is a defect.
The fixture asserts `763`.

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
2. §8.4 / §8.6 IndexedDB storage, `SCHEMA-2`, immutability, §8.6a carve-out. Vector AV-21.
3. §8.1 / §8.2 source resolution; §8.5 manual entry; §8.5a saved products. Vectors AV-7a,
   AV-11, AV-12, AV-13.
4. §2.5 macro capture; §4.6 normalization. Vectors AV-16, AV-17, AV-18.
5. §4, §6 display and banding, including §6.1a, §6.2a, §6.2b, §6.3a, §6.3b. Vectors AV-2, AV-5,
   AV-8, AV-22. Also §3.5 juice field selection and its §2.4 display-name consequence. Step 1 fixtures
   supply the selected value directly in the `P1` slot; step 5 is where selection itself is
   implemented and AV-8's `sugar` driver string is asserted.
6. §4.5 trend. Vectors AV-19, AV-20.
7. §9 method page.
8. §7 swap engine — **blocked**, see §12. AV-3 is testable against the scoring core in
   isolation and should be implemented as a unit test of §6.5 and §7.2 selection logic before
   §7 is unblocked.

---

## 12. Open decisions

None blocks §11 step 1. `[OPEN-7]` blocks §7.

- `[OPEN-6]` **Timezone and day boundary.** §1.2 says "local calendar date" but does not define
  behavior when the device timezone changes mid-window, nor whether a 01:00 entry belongs to
  the prior day. Interim default: device-local midnight, no special handling. Affects
  `DAILY_LOAD` assignment and `TREND_EPOCH` only, never `SCORE`.
- `[OPEN-7]` **Swap candidate corpus.** §7.2 ranks candidates but does not say where the set
  comes from — the whole source database, a curated list, the user's own logged history, or the
  §8.5a saved-product store. §7 cannot be implemented until this is decided.
  This decision subsumes two others. First, `[OPEN-8]` below. Second, §7.2 step 2's use of §2
  table order: that order exists for driver tie-breaking (§5.2) and has no bearing on what
  quantity defines a candidate. An ultra-processed nut product with no labeled serving
  currently resolves `REFERENCE_MASS` to 100 g via `P5` rather than 30 g via `A5`, scoring
  `P5` at 1 serving and `A5` at 3.33 servings. Do not patch §7.2 in isolation; resolve the
  precedence rule together with the corpus. §7 stays stubbed to the §7.3 suppression string
  until both land.
- `[OPEN-8]` **`REFERENCE_MASS` when the labeled serving is a count.** §7.2 step 1 assumes a
  mass, but labels state "1 bar", "2 cookies". Interim: fall through to step 2. Blocks §7 only.
- `[OPEN-9]` **`TREND_EPOCH` after a full data wipe.** §8.4 says immutable and that deleting the
  first entry does not move it, but says nothing about clearing all data. Interim: a full wipe
  clears `TREND_EPOCH`, and the next log sets it afresh. Affects §4.5 only.
