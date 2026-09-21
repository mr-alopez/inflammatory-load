/**
 * Acceptance vectors from spec v0.6 §10 — the §11 step 1 suite (thirteen).
 *
 * Expected values are the spec's printed figures. §10 prints contributions to
 * 6 dp against a 1e-6 fixture tolerance, and states that the tolerance is a
 * floor imposed by that printing, not an independent bound.
 *
 * `discrimination` records each defect a vector's stated purpose names, so the
 * runner can report the delta between the correct value and the defective one.
 * Per §10's discrimination convention, a delta at or below tolerance means the
 * vector is inert on that property regardless of whether it passes.
 */

export const fixtures = [
  /* ---------------------------------------------------------------- */
  {
    id: 'AV-1',
    title: 'Snickers bar, 52.7 g (1 package)',
    quantity: { value: 52.7, unit: 'g' },
    record: {
      name: 'Snickers bar',
      source: 'OFF',
      off: {
        nutrition_data_per: 'serving',
        serving_size: { value: 52.7, unit: 'g' },
        quantity: { value: 52.7, unit: 'g' },
      },
      labeled_serving: { value: 52.7, unit: 'g' },
      classifications: { P5: true },
      reported: { added_sugar_g: 27, sodium_mg: 120, saturated_fat_g: 5.0, fiber_g: 1.3 },
    },
    expect: {
      created: true,
      basis: 'per_serving',
      basisProvenance: 'DECLARED',
      quantity_g: 52.7,
      contributions: { P1: +2.7, P2: +0.12, P8: +0.5, A1: -0.26, P5: +1.5 },
      score: 4.56,
    },
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'AV-4',
    title: 'Beer, 355 ml, 5.0% ABV',
    quantity: { value: 355, unit: 'ml' },
    record: {
      name: 'Beer',
      source: 'OFF',
      off: {
        nutrition_data_per: '100g',
        serving_size: null,
        quantity: { value: 355, unit: 'ml' },
      },
      density_class: 'beer',
      labeled_serving: null,
      classifications: { P3: { abv_percent: 5.0 }, P5: true },
      reported: {
        added_sugar_g: 0, sodium_mg: 4, saturated_fat_g: 0, fiber_g: 0,
        // X1: all four macros stated. A vector stating some but not all
        // propagates a partial suffix into AV-5 (§10, partial macro statement).
        energy_kcal: 43, protein_g: 0.46, carbohydrate_g: 3.55, fat_g: 0,
      },
    },
    expect: {
      created: true,
      basis: 'per_100ml',
      basisProvenance: 'DERIVED_RULE_2',
      density: 1.01,
      quantity_g: 358.55,
      p5Suppressed: true,
      asConsumed: { sodium_mg: 14.2, energy_kcal: 152.65 },
      // §10 precision: P3 values are non-terminating and printed exactly.
      servings: { P3: 1.0003392857142857 },
      contributions: { P2: +0.0142, P3: +2.0006785714285714, P5: 0 },
      score: 2.0148785714285714,
    },
    discrimination: [
      {
        label: 'whole-entry §3.6 exemption (beer with no calories)',
        kind: 'asConsumed', field: 'energy_kcal', defective: 0,
      },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'AV-6A',
    title: 'Rum, 44 ml, 40% ABV',
    quantity: { value: 44, unit: 'ml' },
    record: {
      name: 'Rum',
      source: 'OFF',
      off: {
        nutrition_data_per: '100g',
        serving_size: null,
        quantity: { value: 44, unit: 'ml' },
      },
      density_class: 'spirits',
      labeled_serving: null,
      classifications: { P3: { abv_percent: 40 } },
      reported: { added_sugar_g: 0, sodium_mg: 0, saturated_fat_g: 0, fiber_g: 0 },
    },
    expect: {
      created: true,
      basis: 'per_100ml',
      density: 0.94,
      quantity_g: 41.36,
      servings: { P3: 0.9918857142857143 },
      contributions: { P3: +1.9837714285714285 },
      score: 1.9837714285714285,
    },
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'AV-6B',
    title: 'Orange juice drink, 240 ml (density 1.04, NOVA 4)',
    quantity: { value: 240, unit: 'ml' },
    record: {
      name: 'Orange juice drink',
      source: 'OFF',
      off: {
        nutrition_data_per: '100g',
        serving_size: { value: 240, unit: 'ml' },
        quantity: { value: 355, unit: 'ml' },
      },
      // Density class (§7.2a taxonomy) is 'juice'. This is NOT a §3.5 juice
      // entry — it is a sweetened NOVA 4 drink, so P1 reads added sugars.
      density_class: 'juice',
      labeled_serving: { value: 240, unit: 'ml' },
      classifications: { P5: true },
      reported: { added_sugar_g: 10.8, sodium_mg: 4.2, saturated_fat_g: 0, fiber_g: 0 },
    },
    expect: {
      created: true,
      basis: 'per_100ml',
      basisProvenance: 'DERIVED_RULE_2',
      density: 1.04,
      quantity_g: 249.6,
      p5Suppressed: false,
      // Cancellation: 10.8 × 240 / 100 = 25.92, independent of d.
      asConsumed: { added_sugar_g: 25.92, sodium_mg: 10.08 },
      servings: { P5: 1.0 },
      contributions: { P1: +2.592, P2: +0.01008, P5: +1.5 },
      score: 4.10208,
    },
    discrimination: [
      { label: 'apply density once (no cancellation)', kind: 'score', defective: 4.2061632 },
      { label: 'single-entry impl zeroing the mixer sugar', kind: 'contribution', field: 'P1', defective: 0 },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'AV-6c',
    title: 'Manual alcoholic entry, mass-only (rejected)',
    quantity: { value: 40, unit: 'g' },
    record: {
      name: 'Unknown spirit',
      source: 'MANUAL',
      manual: { serving_mass_g: 40 },
      classifications: { P3: {} },
      reported: { added_sugar_g: 0, sodium_mg: 0, saturated_fat_g: 0, fiber_g: 0 },
    },
    expect: { created: false, reason: 'P3_REQUIRES_VOLUME' },
    discrimination: [
      { label: 'creating an INCOMPLETE entry instead of refusing', kind: 'categorical' },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'AV-7',
    title: 'Whole-grain crackers, 30 g, NOVA 4',
    quantity: { value: 30, unit: 'g' },
    record: {
      name: 'Whole-grain crackers',
      source: 'OFF',
      off: {
        nutrition_data_per: 'serving',
        serving_size: { value: 30, unit: 'g' },
        quantity: { value: 200, unit: 'g' },
      },
      labeled_serving: { value: 30, unit: 'g' },
      grain_majority: 'whole',
      classifications: { P5: true, A7: true },
      reported: { added_sugar_g: 0.5, sodium_mg: 200, saturated_fat_g: 1.0, fiber_g: 3.0 },
    },
    expect: {
      created: true,
      basis: 'per_serving',
      quantity_g: 30,
      contributions: { P1: +0.05, P2: +0.2, P8: +0.1, A1: -0.6, P5: +1.5, A7: -1.0 },
      score: 0.25,
    },
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'AV-7b',
    title: 'Basis does not resolve',
    quantity: { value: 100, unit: 'g' },
    record: {
      name: 'Unlabelled OFF product',
      source: 'OFF',
      off: { nutrition_data_per: null, serving_size: null, quantity: { value: 200, unit: 'g' } },
      classifications: {},
      reported: { added_sugar_g: 1, sodium_mg: 10, saturated_fat_g: 1, fiber_g: 1 },
    },
    expect: { created: false, reason: 'BASIS_UNRESOLVED' },
    discrimination: [
      { label: 'falling back to per_100g instead of refusing', kind: 'categorical' },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'AV-8',
    title: 'Orange juice, 240 ml, labeled 100% (density cancellation)',
    quantity: { value: 240, unit: 'ml' },
    record: {
      name: 'Orange juice',
      source: 'OFF',
      off: {
        nutrition_data_per: '100g',
        serving_size: null,
        quantity: { value: 1000, unit: 'ml' },
      },
      density_class: 'juice',
      labeled_serving: null,
      classifications: {},
      // §3.5 field selection is step 5 (§11). The total-sugars value is
      // supplied already selected. sugar_field_used: "total".
      reported: { added_sugar_g: 8.7, sodium_mg: 0.8, saturated_fat_g: 0, fiber_g: 0.2 },
    },
    expect: {
      created: true,
      basis: 'per_100ml',
      basisProvenance: 'DERIVED_RULE_2',
      density: 1.04,
      quantity_g: 249.6,
      asConsumed: { added_sugar_g: 20.88 },
      contributions: { P1: +2.088, P2: +0.00192, A1: -0.096 },
      score: 1.99392,
    },
    discrimination: [
      { label: 'density applied once (as-consumed sugar)', kind: 'asConsumed', field: 'added_sugar_g', defective: 21.7152 },
      { label: 'density applied once (entry score)', kind: 'score', defective: 2.0736768 },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'AV-9',
    title: 'Almonds, 45 g (fractional serving derivation)',
    quantity: { value: 45, unit: 'g' },
    record: {
      name: 'Almonds',
      source: 'USDA',
      classifications: { A5: true },
      reported: { added_sugar_g: 0, sodium_mg: 0, saturated_fat_g: 3.8, fiber_g: 12.5 },
    },
    expect: {
      created: true,
      basis: 'per_100g',
      basisProvenance: 'DECLARED',
      quantity_g: 45,
      asConsumed: { saturated_fat_g: 1.71, fiber_g: 5.625 },
      servings: { A5: 1.5 },
      contributions: { P8: +0.171, A1: -1.125, A5: -2.25 },
      score: -3.204,
    },
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'AV-9a',
    title: 'Unlabelled liquid, P5 serving mass',
    quantity: { value: 250, unit: 'ml' },
    record: {
      name: 'Sweetened almond beverage',
      source: 'OFF',
      off: {
        nutrition_data_per: '100g',
        serving_size: null,
        quantity: { value: 1000, unit: 'ml' },
      },
      density_class: 'milk',
      labeled_serving: null,      // unlabelled → §3.3 fallback of 100 ml × d
      classifications: { P5: true },
      reported: { added_sugar_g: 3.2, sodium_mg: 60, saturated_fat_g: 0.1, fiber_g: 0.4 },
    },
    expect: {
      created: true,
      basis: 'per_100ml',
      basisProvenance: 'DERIVED_RULE_2',
      density: 1.03,
      quantity_g: 257.5,
      asConsumed: { added_sugar_g: 8.0, sodium_mg: 150, saturated_fat_g: 0.25, fiber_g: 1.0 },
      servings: { P5: 2.5 },
      contributions: { P1: +0.8, P2: +0.15, P8: +0.025, A1: -0.2, P5: +3.75 },
      score: 4.525,
    },
    discrimination: [
      { label: 'flat 100 g unlabelled fallback', kind: 'score', defective: 4.6375 },
      { label: 'density applied once to nutrients', kind: 'score', defective: 4.54825 },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'AV-10',
    title: 'Olive oil, 15 ml (USDA SR Legacy, non-cancelling)',
    quantity: { value: 15, unit: 'ml' },
    record: {
      name: 'Olive oil',
      source: 'USDA',            // USDA SR Legacy — per_100g as a dataset property
      density_class: 'culinary_oil',
      classifications: { A8: true },
      reported: { added_sugar_g: 0, sodium_mg: 0, saturated_fat_g: 13.8, fiber_g: 0 },
    },
    expect: {
      created: true,
      basis: 'per_100g',
      basisProvenance: 'DECLARED',
      density: 0.91,
      quantity_g: 13.65,
      asConsumed: { saturated_fat_g: 1.8837 },
      servings: { A8: 0.975 },
      contributions: { P8: +0.18837, A8: -0.4875 },
      score: -0.29913,
    },
    discrimination: [
      { label: 'flat 1 ml = 1 g', kind: 'score', defective: -0.328714 },
      { label: 'A8-only variant', kind: 'score', defective: -0.347344 },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'AV-14',
    title: 'Negative zero',
    quantity: { value: 100, unit: 'g' },
    record: {
      name: 'Manual item',
      source: 'MANUAL',
      manual: { serving_mass_g: 100 },
      classifications: {},
      reported: { added_sugar_g: 0, sodium_mg: 20, saturated_fat_g: 0, fiber_g: 0.3 },
    },
    expect: {
      created: true,
      basis: 'per_serving',
      quantity_g: 100,
      contributions: { P2: +0.02, A1: -0.06 },
      score: -0.04,
    },
    discrimination: [
      { label: 'rendering `-0.0` (display layer, §11 step 5)', kind: 'display' },
    ],
  },

  /* ---------------------------------------------------------------- */
  {
    id: 'AV-15',
    title: 'Negative rounding',
    quantity: { value: 100, unit: 'g' },
    record: {
      name: 'Manual high-fibre item',
      source: 'MANUAL',
      manual: { serving_mass_g: 100 },
      classifications: {},
      reported: { added_sugar_g: 0, sodium_mg: 0, saturated_fat_g: 0, fiber_g: 9.25 },
    },
    expect: {
      created: true,
      basis: 'per_serving',
      quantity_g: 100,
      contributions: { A1: -1.85 },
      score: -1.85,
    },
    discrimination: [
      { label: 'rounding toward +inf yields -1.8 (display layer, §11 step 5)', kind: 'display' },
    ],
  },
];
