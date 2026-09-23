# Proposed spec edit — entry removal (would become v1.7)

**Status: NOT APPLIED.** No spec version has been emitted. The code and tests below
are built and green against v1.6, which does not describe removal at all. This
file is the normative text I would need in order for that code to be covered by
the spec, written by Code rather than by Chat, and offered for review rather than
merged.

The decision it encodes — *removal is permitted for today's entries only* — was
made by the user, not by me.

---

## The gap this closes

v1.6 never grants, forbids, or scopes entry removal. It mentions removal exactly
once, in §4.5:

> `TREND_EPOCH` … is never recomputed, deleting the first entry does not move it

That is a guard against an operation no section defines. Meanwhile `deleteEntry`
has existed in `src/store.js` since §11 step 2, is exercised by two tests, and had
**no guard of any kind** — it would remove an entry from any day, in silence.

---

## PART A — spec edits (apply to v1.6)

### §8.4 — append to the immutability block, after "A correction is a new entry, not an edit."

```
**Removal is not mutation, and is permitted for today only.** An entry logged
today may be removed. This exists for the accidental add — a barcode scanned
twice, a quantity confirmed on the wrong product — and it is not an edit path:
no field of a stored entry is ever mutable, and a correction is still a new
entry.

"Prior days are read-only without exception" governs removal as well as
mutation, and removal is the stronger operation. A completed day's `DAY_LOAD`,
its §6.3 summary, its band, its §4.6 normalization and its §4.5 block are all
read from stored entries, so removing one silently rewrites a figure the user
has already been shown. An attempt to remove a prior-day entry is refused with
`PRIOR_DAY_READ_ONLY`.

Removal is confirmed before it happens and cannot be undone. Removing an entry
that does not exist is refused with `NO_SUCH_ENTRY`: §8.4's loud-rejection rule
covers a delete that removed nothing as surely as a write that wrote nothing.

`TREND_EPOCH` is unaffected (§4.5). Note the consequence: a first entry is now
removable only on the day it was logged, which narrows when §4.5's
epoch-does-not-move clause can fire without changing what it guarantees.
```

### §7.1 — append to the affordance note

```
The removal gesture is conditional where §7.1's swap affordance is uniform, and
the distinction matters. §7.1's uniformity argument is that a control appearing
on some entries and not others reads as a verdict on those entries. A control
keyed to the calendar date says nothing about the food, so it does not carry
that meaning and does not need to be uniform.
```

### §11 — add AV-25

```
**AV-25 — removal is today-only.** Two entries dated today and one dated
earlier. Removing a today entry removes that entry and no other; the day's load
becomes the sum of the survivors. Removing the earlier entry is refused with
`PRIOR_DAY_READ_ONLY` and the entry is still stored afterwards. Removing an
unknown id is refused with `NO_SUCH_ENTRY`. `TREND_EPOCH` does not move.

Discrimination: with the prior-day guard removed, the refusal assertions fail.
Verified by mutation — 2 of 8 go red.
```

---

## Open questions for Chat

1. **Is "today only" the right line, or should it be narrower?** A tighter
   reading of the actual need — "I just added this and it's wrong" — would be an
   undo window on the most recent entry only. Today-only is what was asked for
   and is what is built.

2. **Does §6 need to name the hint string?** The gesture is undiscoverable
   without one. The shell currently renders, on the Today view only:

   > Press and hold an entry to remove it. Today only — earlier days are final.

   This is a new user-visible string that §6 does not define. It is factual and
   about the app rather than the user (§13.3), but §6 is meant to be the complete
   list of strings, and right now it isn't.

3. **Should removal be recorded rather than erased?** A tombstone would keep the
   audit trail literally complete at the cost of complexity nothing currently
   needs. Erasure is what is built.
