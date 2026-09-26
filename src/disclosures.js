/**
 * Required disclosures — §9, and §13.5's refusal copy.
 *
 * §9.1 SINGLE SOURCE: §9.2–§9.5's literal strings live here and are read from
 * here by every surface that displays them. No surface transcribes them. A
 * duplicated copy of a string §9 calls literal defeats the designation (G3).
 *
 * §13.5 applies the same rule to refusal copy: written once, read from a
 * constant, never transcribed into a flow.
 *
 * These are data. Nothing in this module computes, scores, or renders.
 */

/* ------------------------------------------------------------------ *
 * §9.2 – §9.5 — the four literal strings
 * ------------------------------------------------------------------ */

/** §9.2 Provenance. */
export const PROVENANCE = `Scores are a design model, not a measurement. Coefficients are assigned by this app
and informed by, but not derived from, published dietary inflammation research.`;

/** §9.3 Scope. */
export const SCOPE = `This tracks a dietary pattern and records what you ate. It does not measure
inflammation in your body and is not a guide to any symptom or condition.`;

/** §9.4 Comparability. */
export const COMPARABILITY = `Loads are absolute, not adjusted for how much you ate. A high-intake day and a
low-intake day are not comparable to each other unless you use the per-1,000-kcal
figure, which is shown only when every entry in the window has calorie data.`;

/** §9.5 Calories and macros. */
export const MACRO_STATEMENT = `Calories and macros are recorded, not judged. This app sets no targets and will
not tell you whether a number is too high or too low.`;

export const DISCLOSURES = { PROVENANCE, SCOPE, COMPARABILITY, MACRO_STATEMENT };

/* ------------------------------------------------------------------ *
 * §9.1 — the explanatory prose the method page must carry
 * ------------------------------------------------------------------ */

/** §3.3a — the density rule. */
export const DENSITY_RULE = `A quantity entered in millilitres is converted to grams before anything is scaled.
The density comes from the product's own record where it states both a mass and a
volume for the same serving; otherwise from the class table below, whose values are
physical constants for the class rather than estimates of the individual product.
The class itself is read from the product's declared category tags, never from its
name. If neither path resolves, the product is entered by hand — a density is never
assumed to be 1.00.`;

/** §3.3b — scaling and the cancellation property. */
export const SCALING_RULE = `Nutrient figures are normalised to a per-gram basis and then scaled to the amount
you logged. Where a product's figures are stated per 100 ml and you log millilitres,
the density appears on both sides of that calculation and cancels exactly, so an
error in the density cannot reach the nutrient value. Where the figures are stated
per 100 g and you log millilitres, it applies once, on the quantity. The two cases
differ in what the label measures against, not in whether the product is a liquid.`;

/** §3.5 juice + §2.4 dual naming of P1. */
export const JUICE_RULE = `Juice is scored from its total sugars rather than its added sugars, whatever the
label says. This is deliberate and departs from nutrition-label convention: the
sugar in juice behaves like added sugar in this model regardless of where it came
from. Juice earns no whole-fruit credit for the same reason.

Because the figure is total sugars, a juice entry says "sugar" rather than "added
sugar" — saying "added sugar" about a 100% juice would assert something false about
the product.`;

/** §4.5 — the trend lag. */
export const TREND_LAG = `The trend is drawn in fixed three-day blocks whose boundaries never move. The
three-day summary elsewhere in the app slides forward every day, so the two cover
different days: the newest plotted block can end up to two days before the summary's
final day. Both are correct; they answer different questions.

A block with no entries is left empty rather than drawn at zero. No data recorded is
not the same as a period that balanced out.`;

/* ------------------------------------------------------------------ *
 * §13.5 — refusal copy
 * ------------------------------------------------------------------ */

/**
 * Every engine refusal reaching the user. States a fact about the data, never a
 * judgment about the product or the user (§13.5, §6.6).
 */
export const REFUSAL_COPY = {
  BASIS_UNRESOLVED:
    'This product does not say what its nutrition figures are measured against, so it '
    + 'cannot be scored from the database. You can enter it by hand.',
  // §13.5 (v2.0): says what is needed rather than what failed. True only
  // because the resolver checks the basis FIRST — a grain refusal therefore
  // always has a resolved basis and always arrives prefilled (AV-32).
  GRAIN_MAJORITY_UNKNOWN:
    "This label doesn't say which flour is used. Everything else is filled in — just "
    + 'choose whole grain or refined.',
  DENSITY_UNRESOLVED:
    'This is a liquid and its density is not known, so millilitres cannot be converted '
    + 'to grams. Enter a mass, or a volume and a density.',
  DATASET_NOT_ELIGIBLE:
    'This record comes from a dataset that carries no processing classification, so it '
    + 'cannot be scored from the database.',
  NOT_FOUND: 'No record found for that barcode.',
  OFFLINE: 'No network. Manual and saved entries still work.',
  NO_API_KEY: 'No USDA key configured, so only Open Food Facts was searched.',
  ERROR: 'The lookup did not complete.',
  P3_REQUIRES_VOLUME:
    'Alcohol is worked out from volume and strength, so a volume is needed before it '
    + 'can be selected.',
};

/**
 * §3.3a step 2b. The spec requires the method page to say this, and says why:
 * a spooned quantity must be distinguishable from a weighed one, both in the
 * stored entry and to the person reading the number.
 */
export const BULK_DENSITY_RULE = `Spoons and cups of a solid — sugar, oats, peanut butter —
are converted to grams through a table of bulk densities for the food type. This is less
precise than weighing, and less precise than the same conversion for a liquid: a tablespoon
of oats varies with how it is packed, a tablespoon of water does not. The entry records that
the quantity came from this table, so a spooned amount is always distinguishable from a
weighed one. A solid with no entry in the table cannot be entered by spoon or cup at all —
it asks for grams instead of guessing.`;

/**
 * §13.1 Settings. A literal §13 string, so it lives here with the others (G3):
 * one module holds every fixed user-visible string, and the shell transcribes
 * none of them.
 *
 * §8.2 (v1.9) stopped claiming the app is fully functional without a key. This
 * is where a user can act on that — at the field where the key is entered.
 */
export const USDA_KEY_NOTE = `Optional, free, and stored on this device only. Without it,
searching for plain foods like coffee or sugar returns branded products instead. Scanning
barcodes works either way.`;
