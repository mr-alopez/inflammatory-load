/**
 * §6.6's verdict-word list — ONE list, imported by every check that enforces it.
 *
 * v1.9 (E5): two partly-right lists is §9's duplication problem in test form.
 * test/shell.js caught `well done`, `nice work`, `keep it up`, `healthy`,
 * `unhealthy`, `must eat`; test/display.js caught `try`, `choose`, `instead`.
 * Neither was a superset, so "Well done" passed the display check and "instead"
 * passed the shell check — and neither had ever flagged a string, so the
 * divergence was invisible.
 *
 * **Applied to rendered, user-visible text only.** Never to ids, class names or
 * identifiers, which the user never sees. The false positive that exposed the
 * split — the element id `add-choose` matching `choose` — is the same mistake in
 * the other direction: a prohibition aimed at a surface it was never about
 * (§2.5). `add-choose` is a must-accept case below.
 */

/** The eight words §6.6 names literally. Both directions of every check. */
export const SEC_6_6_NAMED = ['yay', 'nay', 'bad', 'good', 'avoid', 'cheat', 'clean', 'guilty'];

/**
 * §6.6's full prohibition: the named verdict words, plus the imperatives to eat
 * or not eat that §6.6 describes rather than enumerates.
 */
export const VERDICTS = new RegExp(
  '\\b('
  + SEC_6_6_NAMED.join('|')
  + '|healthy|unhealthy|should|must eat|well done|nice work|keep it up'
  + '|try|choose|instead'
  + ')\\b',
  'i'
);

export const isVerdict = (s) => VERDICTS.test(String(s));

/**
 * §2.5 fifth form cases, shared so both suites exercise the same list against
 * the same evidence. `accepts` carries the real strings the app renders and the
 * identifiers it must not judge.
 */
export const VERDICT_CASES = {
  rejects: [
    'a bad day', 'Well done', 'you should avoid this', 'a clean week',
    'try this instead', 'nice work', 'keep it up', 'an unhealthy choice',
    'you must eat more fibre', 'a good choice', 'yay', 'guilty',
  ],
  accepts: [
    // Real rendered output.
    'Today so far: +3.3',
    '2026-09-14: +99.0 · High',
    '27 g added sugar',
    '12 fl oz',
    'Not enough history yet to suggest an alternative.',
    'Press and hold an entry to remove it. Today only — earlier days are final.',
    'No clear alternative in this category.',
    // Words that merely contain a verdict word. Y4: tokens, not substrings.
    'goodness', 'badge', 'cleanser', 'shoulder',
  ],
};

/**
 * Identifiers the checks must NOT judge, because §6.6 governs rendered text.
 * `add-choose` is the shell's own element id and is not a verdict.
 */
export const NON_RENDERED_IDENTIFIERS = [
  'add-choose', 'combo-choose', 'goodFor', 'badgeCount', 'cleanupHandler',
];
