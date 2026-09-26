/**
 * §6.6's list — ONE list, imported by every check that enforces it.
 *
 * v2.1: the list holds two kinds of entry (§6.6 "How the prohibition is
 * enforced"):
 *
 *   - VERDICT WORDS, prohibited anywhere in user-visible text.
 *   - IMPERATIVE PHRASES, prohibited as phrases.
 *
 * `try`, `choose` and `instead` were listed BARE until v2.1. As bare words they
 * could not tell "try the almonds instead" from "choose whole grain or refined",
 * and the first scan of the disclosure strings hit three pieces of correct copy
 * — two of them spec text. Those were carried as named exceptions for one
 * round; §6.6 now forbids exceptions ("If correct copy trips the list, the list
 * is wrong and is fixed"), so they are gone and the list is fixed instead.
 *
 * Applied to rendered, user-visible text only — never to ids, class names or
 * identifiers (v1.9).
 */

/** The eight words §6.6 has named since v0.1, both directions of every check. */
export const SEC_6_6_NAMED = ['yay', 'nay', 'bad', 'good', 'avoid', 'cheat', 'clean', 'guilty'];

/** §6.6 verdict words: prohibited anywhere, as whole words. */
export const VERDICT_WORDS = [...SEC_6_6_NAMED, 'healthy', 'unhealthy'];

/**
 * §6.6 imperative phrases. `try … instead` spans a clause — it may not cross a
 * sentence end, so a "try" in one sentence and an "instead" in the next are not
 * one imperative.
 */
export const IMPERATIVE_PHRASES = [
  ['try … instead', /\btry\b[^.!?]*\binstead\b/i],
  ['instead of eating', /\binstead of eating\b/i],
  ['you should', /\byou should\b/i],
  ["you shouldn't", /\byou shouldn[’']?t\b/i],
  ['choose a', /\bchoose a\b/i],
  ['choose the', /\bchoose the\b/i],
  ['choose this', /\bchoose this\b/i],
  ['eat more', /\beat more\b/i],
  ['eat less', /\beat less\b/i],
  ['cut back', /\bcut back\b/i],
  ['well done', /\bwell done\b/i],
  ['nice work', /\bnice work\b/i],
  ['keep it up', /\bkeep it up\b/i],
];

const WORD_RE = new RegExp(`\\b(${VERDICT_WORDS.join('|')})\\b`, 'i');

/** Which entry, if any, a string trips. null when clean. */
export function verdictIn(s) {
  const text = String(s);
  const w = text.match(WORD_RE);
  if (w) return w[0];
  const p = IMPERATIVE_PHRASES.find(([, re]) => re.test(text));
  return p ? p[0] : null;
}
export const isVerdict = (s) => verdictIn(s) !== null;

/** Kept for callers that want a pattern; it matches the WORDS only. */
export const VERDICTS = WORD_RE;

/**
 * §2.5 fifth form cases, shared so both suites exercise the same list against
 * the same evidence.
 */
export const VERDICT_CASES = {
  rejects: [
    'a bad day', 'Well done', 'you should avoid this', 'a clean week', 'nice work',
    'keep it up', 'an unhealthy choice', 'a good choice', 'yay', 'guilty',
    // The imperatives the bare words were meant to catch — still caught.
    'Try the almonds instead',          // §6.6 v2.1: the named must-reject
    'try this instead',
    'Choose the apple.',
    'You should eat more fibre.',
    "You shouldn't have that.",
    'Cut back on sugar.',
    'Have fruit instead of eating a bar.',
  ],
  accepts: [
    // The three strings the bare-word list wrongly tripped (v2.0). Must-accept.
    "This label doesn't say which flour is used. Everything else is filled in — just choose whole grain or refined.",
    'Without it, searching for plain foods like coffee or sugar returns branded products instead.',
    'A solid with no entry in the table cannot be entered by spoon or cup at all — it asks for grams instead of guessing.',
    // Real rendered output.
    'Today so far: +3.3', '2026-09-14: +99.0 · High', '27 g added sugar', '12 fl oz',
    'Not enough history yet to suggest an alternative.',
    'Press and hold an entry to remove it. Today only — earlier days are final.',
    'No clear alternative in this category.',
    // Whole words only (Y4): a verdict word inside another word is not one.
    'goodness', 'badge', 'cleanser', 'shoulder',
    // A try and an instead in different sentences are not one imperative.
    'Try scanning the barcode. The search returned products instead.',
  ],
};

/**
 * Identifiers the checks must NOT judge, because §6.6 governs rendered text.
 * `good-choice` IS a verdict by text — which is the point: it must still never
 * reach the scan, because it is an identifier.
 */
export const NON_RENDERED_IDENTIFIERS = [
  'good-choice', 'add-choose', 'goodFor', 'badgeCount', 'cleanupHandler',
];
