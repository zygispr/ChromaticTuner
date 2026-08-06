# Contract: Dialog modality

**Feature**: `006-fix-settings-sheet-focus` | **Date**: 2026-08-06

Guarantees are numbered **K1–K11** (for *keyboard*; `A`, `C`, `D`, `E`, `L`, `M`, `N`, `P`, `R`, `S`,
`T`, `W` are taken by `001`–`005`). Code comments cite these numbers, as they do for `S1`, `A5`, `N7`,
`M12`.

This contract adds nothing to `001`'s `core-api.md` or `platform-ports.md` and modifies neither. It
describes a **UI contract for one component** — what the settings surface owes a user who is operating
it without a pointer — and it applies to both platforms, on the understanding that the web implements
it and the mobile platform already provides it (**D7**).

The subject of every guarantee below is "the settings surface while it is open". Nothing here says
anything about the sheet while it is closed.

---

## §1 Focus is moved only by the user

### K1 — Opening is the only thing that moves focus

Focus is placed on a control inside the sheet exactly once per open, at the moment it opens. No other
event may place focus. **(FR-133)**

The control is the **Done** button, which is both the close affordance and the first control in DOM
order — this is existing behaviour and is preserved, not redesigned.

### K2 — Changing a preference does not move focus

After `setA4Hz`, `setAccidentalStyle`, `setAppearancePreference`, or `reset`, the active element is the
same element it was before. **(FR-132)**

This is the guarantee that reported defects 3 and 4 violate. It holds for a change that alters nothing —
an arrow key at `A4_MIN_HZ`, or re-choosing the option already chosen — as well as for one that does.

### K3 — A repeated key reaches the same control every time

*n* presses of the same key on a control produce *n* applications of that control's behaviour, with no
navigation in between. Eight `ArrowDown` presses on the reference pitch move it eight hertz. **(FR-134)**

K3 is a consequence of K2 and is stated separately because it is what a user actually experiences, and
because it is the assertion that fails loudest if K2 is implemented in a way that merely re-focuses the
*right* control rather than not re-focusing at all.

---

## §2 Focus cannot leave

### K4 — Focus stays inside

While the sheet is open, no element outside it may hold focus as a result of keyboard navigation.
**(FR-136)**

### K5 — The reachable set is live

The controls focus may reach are those present in the sheet **at the moment of the keypress**, not
those present when it opened. A control that appears or disappears while the sheet is open is included
or excluded accordingly. **(FR-137)**

The sheet has one such control today — the persistence warning is not focusable, but the set is also
changed by `disabled` state, and this guarantee is what makes a future addition safe by default.

### K6 — Navigation wraps, in one press

`Tab` from the last control in the reachable set moves focus to the first. `Shift+Tab` from the first
moves focus to the last. In both cases the browser's default action is prevented, so no intermediate
stop — `<body>`, the document, or browser UI — is visited. **(FR-135)**

Stated as "in one press" deliberately. A native modal `<dialog>` satisfies K4 but not K6: it lands on
`<body>` first, and Chromium and WebKit disagree about which element that is for `Shift+Tab`
(**D2**, measured).

### K7 — Focus returns to the opener

Closing the sheet returns focus to the element that was focused when it opened, by any of the four
exits — **Done**, Escape, a backdrop press, or unmount — provided that element is still in the
document. **(FR-138)**

If it is not, focus is not forced anywhere; the browser's default applies. A restore that targets a
removed node is the failure this proviso exists to prevent.

### K8 — Non-keyboard channels are contained too

Nothing outside the sheet is activatable by pointer or reachable by assistive technology.
**(FR-136)**

Not implemented by this feature, and listed because it is part of the same contract and must not
regress: the pointer is contained by the full-viewport backdrop, and assistive technology by
`aria-modal="true"` on the dialog. Both predate this feature; both are asserted.

---

## §3 The page behind does not move

### K9 — The document does not scroll

While the sheet is open, the document's scroll position does not change in response to any input —
wheel, trackpad, touch drag, or key. **(FR-139)**

A native modal `<dialog>` does **not** provide this: measured, the page scrolled on both wheel and
`End` in both Chromium and WebKit (**D2**).

### K10 — Locking does not resize the content behind

Applying the lock does not change the used width of the content behind the scrim. Where removing the
scrollbar frees a gutter, exactly that many pixels are given back. Where the platform draws overlay
scrollbars the gutter is zero and nothing is added. **(FR-141)**

The gutter is `window.innerWidth - document.documentElement.clientWidth`, and it is **0 on macOS and
non-zero on CI's Ubuntu runners** — so this guarantee is asserted as the arithmetic (applied padding
equals measured gutter), never as an observed width, which would be vacuously true on a developer's
machine (**D4**).

### K11 — Closing restores exactly

On close, the document element's `overflow`, `padding-right` and `overscroll-behavior` return to the
values they held before the lock — the previous values, not empty strings — and the scroll position is
the one the page had when the sheet opened. **(FR-140)**

The position is preserved by the mechanism rather than by bookkeeping: `overflow: hidden` on the
scroller does not reset `scrollTop`. A `position: fixed` lock would need the offset saved and
re-applied, which is the reason it was not chosen.

---

## §4 What this contract does not change

Stated so a reviewer can check the negative space, and because FR-144 and FR-145 make these verified
claims rather than intentions:

- **Escape closes the sheet.** The `Escape` branch of the keydown listener is untouched; `Tab` is
  added beside it.
- **The backdrop gesture rule is untouched.** A press that begins and ends on the backdrop closes the
  sheet; one with either end inside it does not (`SettingsSheet.tsx:64–110`). No new pointer handler is
  added and none is modified.
- **The a11y tree is untouched.** Same `role`, same `aria-modal`, same `aria-label`, same
  `role="group"` / `aria-labelledby` structure — including the Safari legend workaround at `:198–207`,
  which no part of this feature has cause to go near.
- **Nothing moves by a pixel.** No token, colour, spacing, radius, or duration changes. `touch-action`
  is specifically *not* set on the backdrop, because it inherits and would cancel the drag gesture on
  the reference pitch slider (**D5**).
- **The tuner keeps reading.** The sheet stays mounted over a live session; guarantee `N7` is
  unaffected, and no work added here runs in the audio path or the render loop.
