# Quickstart: Settings sheet behaves as a modal dialog

**Feature**: `006-fix-settings-sheet-focus` | **Date**: 2026-08-06

Nine validations, **V49–V57**. V49–V55 are automated on the web, V56 is automated on mobile, V57 is
manual. Every one of V49–V55 is a regression test for a reported defect or a contract guarantee, and
**each must be observed failing against the current code before the fix lands** — Principle III's rule
for bug fixes, and the whole reason this feature has no ambiguity about what "done" means.

Guarantee numbers (K1–K11) are in [`contracts/modality.md`](./contracts/modality.md); decision numbers
(D1–D8) are in [`research.md`](./research.md).

## Prerequisites

```bash
corepack enable && pnpm install          # Node 22.13+, not 20
pnpm --filter @chromatic-tuner/web exec playwright install chromium
pnpm --filter @chromatic-tuner/web e2e:fixtures    # regenerates the WAV fixtures, once
```

The e2e suite drives a real browser with fake audio capture; the settings sheet is only reachable once
the tuner is past its permission gate, so these specs use the existing `audioArgs` /
`waitForNote` helpers from `apps/web/e2e/helpers.ts` exactly as `settings.spec.ts` already does.

## Running

```bash
# everything this feature adds, web
pnpm --filter @chromatic-tuner/web exec playwright test e2e/settings.spec.ts e2e/a11y.spec.ts

# one validation at a time, by title
pnpm --filter @chromatic-tuner/web exec playwright test -g "V49"

# mobile
pnpm --filter @chromatic-tuner/mobile test -- settings-modality

# the full merge gate
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e
```

---

## V49 — An arrow key on the reference pitch leaves focus alone *(defect 3, K2)*

**File**: `apps/web/e2e/settings.spec.ts`

Open the settings from the reference badge, focus `a4-slider`, press `ArrowRight`.

**Expect**: `a4-value` reads `441`, and the active element is still `a4-slider`.

**Before the fix**: the active element is `settings-close`. This is the reported defect, and this
assertion is the one that must be seen red first.

> Assert the *active element*, not "the value changed". The value changes today; the defect is entirely
> in where focus went afterwards.

---

## V50 — Activating any button leaves focus on that button *(defect 4, K2)*

**File**: `apps/web/e2e/settings.spec.ts`

For each of `accidental-flat`, `appearance-dark`, `settings-reset`: focus it, press `Enter`, assert the
preference applied **and** the active element is still that control. Repeat the set with `Space`.

**Expect**: six passes.

**Before the fix**: six failures, all landing on `settings-close`.

> `settings-reset` is the interesting one — reset changes which options are selected underneath the
> focused control, which is the spec's "a control whose selected state changes under focus" edge case.

---

## V51 — Eight presses move eight hertz *(K3)*

**File**: `apps/web/e2e/settings.spec.ts`

Focus `a4-slider` at 440, press `ArrowDown` eight times with no other input.

**Expect**: `a4-value` reads `432`. This is SC-056 executed literally.

**Before the fix**: `439` — the first press lands, the remaining seven go to **Done**, which ignores
them. That silent discard is the part of the defect a user notices without being able to name.

---

## V52 — Tab cannot leave the sheet, and wraps in one press *(K4, K5, K6)*

**File**: `apps/web/e2e/a11y.spec.ts`

1. Open the settings. Focus the last control in the sheet, press `Tab`, assert the active element is
   the first control in the sheet.
2. Focus the first, press `Shift+Tab`, assert the active element is the last.
3. Press `Tab` twice as many times as the sheet has focusable controls, collecting the active element
   each time. Assert every one of them is inside `settings-sheet`.

**Expect**: focus never leaves; no step observes `BODY`, `reference-badge`, or `microphone-toggle`.

**Before the fix**: step 3 reaches the controls behind the scrim.

> Derive the control list from the DOM inside the test rather than hard-coding eight, so the assertion
> keeps its meaning if the sheet ever gains a control — which is K5 applied to the test itself.

---

## V53 — Closing returns focus to the opener *(K7)*

**File**: `apps/web/e2e/a11y.spec.ts`

Open from `reference-badge`, then close three ways in three runs: clicking `settings-close`, pressing
`Escape`, and pressing on the backdrop.

**Expect**: after each, the active element is `reference-badge`.

**Before the fix**: `BODY` in all three.

---

## V54 — The page does not scroll behind the sheet *(K9)*

**File**: `apps/web/e2e/a11y.spec.ts`

Use a viewport short enough that the document scrolls (the supporting content below the fold
guarantees this at the default 1280×720; assert `scrollHeight > clientHeight` first, so the test
cannot pass by having nothing to scroll). Record `scrollTop`, open the settings, then: wheel over the
scrim, press `End`, press `PageDown`, press `ArrowDown` with focus on the sheet but not on the slider.

**Expect**: `scrollTop` is unchanged after every one of them.

**Before the fix**: the wheel and `End` both scroll — the same result the `<dialog>` probe produced,
because nothing in either arrangement locks the document (**D2**, **D4**).

---

## V55 — The lock costs no width, and unlocks exactly *(K10, K11)*

**File**: `apps/web/e2e/a11y.spec.ts`

1. Before opening, measure `gutter = window.innerWidth - document.documentElement.clientWidth`.
2. Open. Assert the document element's applied `padding-right` equals `gutter` — including when
   `gutter` is `0`, where the assertion is that nothing was added.
3. Scroll to a known offset before opening; assert `scrollTop` is that same offset after closing.
4. After closing, assert `overflow`, `padding-right` and `overscroll-behavior` are back to their
   pre-open values.

**Expect**: all four.

> **Do not write this as "the content is the same width before and after".** Measured on macOS the
> gutter is 0 — `clientWidth` was 900 both times — so a width comparison passes locally against an
> implementation with no compensation at all, and only fails on CI's Ubuntu runners with their classic
> scrollbars. Asserting the arithmetic is meaningful on both (**D4**).

---

## V56 — Mobile still gets its modality from the platform *(FR-142, FR-143, D7)*

**File**: `apps/mobile/__tests__/settings-modality.test.tsx` *(new)*

Three assertions, none of which requires a production change:

1. The settings render inside a `Modal` carrying `accessibilityViewIsModal` — the iOS mechanism that
   confines VoiceOver, and the thing a refactor to an absolutely-positioned view would remove.
2. The tuner screen has no scrollable ancestor, so there is nothing behind the sheet to scroll.
3. Changing a preference from the sheet does not move accessibility focus:
   `AccessibilityInfo.setAccessibilityFocus` is never called.

**Expect**: three passes on the current code, today. These are the assertions FR-143 asks for — they
pin behaviour we are choosing not to implement, so that the day someone removes it is the day a named
test goes red rather than the day a user files the web bug again on the other platform.

---

## V57 — Manual gates

Not automatable, and both are release gates rather than merge gates.

**Screen readers** — with VoiceOver (macOS Safari, iOS) and TalkBack (Android): open the settings and
navigate by element past the end of the sheet. The cursor must not reach the tuner behind it, and the
surface must be announced as a dialog. This is the half of K8 that no automated engine here can
observe; Axe checks that `aria-modal` is *present*, not that a screen reader honours it.

**Screenshots** — light and dark, both platforms, sheet open. Required by the repo rule that UI changes
need light and dark screenshots, and here they are checking that there is **no** change: SC-062 asks
for pixel-identical output against the pre-change capture. Any difference is a defect in this feature,
not a judgement call — FR-145 permits none.

---

## Order of work

Test-first is constitutional, so the order is not a suggestion:

1. Write V49–V51, run them, **watch them fail**. Apply **D1** — split the effect. They pass.
2. Write V52 and V53, watch them fail. Apply **D3** and **D6**. They pass.
3. Write V54 and V55, watch them fail. Apply **D4** and **D5**. They pass.
4. Write V56. It passes immediately — that is its purpose, and it is the one validation here that is
   *not* preceded by a red run, because there is no defect for it to catch yet.
5. Run the full gate, then V57.

Each of the first three steps is independently shippable and maps to one user story: P1 is step 1, P2 is
step 2, P3 is step 3.
