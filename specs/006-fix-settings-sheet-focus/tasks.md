---

description: "Task list for 006-fix-settings-sheet-focus"
---

# Tasks: Settings sheet behaves as a modal dialog

**Feature**: `006-fix-settings-sheet-focus` · **Created**: 2026-08-06

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/modality.md](./contracts/modality.md),
[quickstart.md](./quickstart.md)

This file doubles as the build log, following `001`–`005`: record deviations, defects, and
measurements here as work lands, not just checkmarks.

## Test-first is not optional here

Principle III is NON-NEGOTIABLE, and this is a bug fix — so the rule is the strict one: *every bug fix
MUST add a regression test that fails on the unfixed code*. Every test task below is written first and
**observed failing** before the implementation exists. If a test passes on its first run, the test is
wrong. Fix the test before touching the implementation.

**The hazard this feature carries: the existing suite is green against a sheet the keyboard cannot
operate.** 145 e2e tests pass today over four reproducible defects (measured at T001; this said 115
before the baseline was taken). That is not an accident, and the
first row below is the reason — it is worth understanding before writing a single assertion.

| Tempting assertion | Why it passes on a broken build |
| --- | --- |
| `page.getByTestId('a4-slider').fill('432')` then assert the value | **This is what the existing suite already does** (`settings.spec.ts:28`, `:44`, `:52`) and it is precisely why the defect shipped. `fill()` sets the value directly and never presses a key, so it exercises none of the keyboard path. V49–V51 must use `press()`. |
| `locator.press('ArrowDown')` in a loop, instead of `fill()` | **Found at T006, and it would have been fatal.** `locator.press()` FOCUSES the element and then presses it, so V51 written this way re-focuses the slider before each of its eight presses — silently repairing the behaviour under test and passing green on the broken build. Focus once, then press through `page.keyboard.press`, which goes to whatever actually holds focus. |
| "the reference pitch changed after `ArrowRight`" | Passes **today**. The value does change; defect 3 is entirely about where focus went afterwards. Assert the active element, not the value. **Confirmed at T009**: V49's `a4-value` assertion read `441` and passed; only the focus assertion failed. |
| "after `Tab` from the last control, `reference-badge` is not focused" | Passes when focus lands on `<body>` — which is what a native `<dialog>` does (**D2**, measured) and what a half-written trap does. K6 requires landing on the **first control**, named. |
| "after N tabs nothing outside the sheet is focused", N = the control count | Passes if the cycle happens to land back inside on the Nth press. Use 2× the control count and assert **every** intermediate element, not just the last. |
| "the sheet still closes on Escape" (as the guard against an over-eager trap) | Passes for a `Tab` handler that `preventDefault`s unconditionally, because Escape is handled on a different branch. The assertion that catches that is `Tab` in the **middle** of the sheet still advancing one control. |
| "focus returns to `reference-badge` after close" | Passes for an implementation that hard-codes `reference-badge`. There is only one opener today, so no test can distinguish the two. Read `document.activeElement` *before* opening and assert against that value. |
| "the content is the same width before and after locking" | The scrollbar gutter is **0 on macOS** (overlay scrollbars) and non-zero on CI's Ubuntu runners, so this passes locally against zero compensation and fails only in CI. Assert the arithmetic (**D4**, T003). |
| "`scrollTop` is unchanged after scrolling with the sheet open" | Passes when the page was never scrollable at that viewport. Assert `scrollHeight > clientHeight` first, so the test cannot succeed by having nothing to scroll. |
| "`overflow`, `padding-right` and `overscroll-behavior` are back to their pre-open values after close" | **Passes on an implementation that never locked anything** — untouched properties are trivially "restored". Assert the lock is REAL while the sheet is open (`overflow` is `hidden`) before asserting it is undone. Found at T020. |
| "scroll to 300, open the sheet, assert the offset survives" | **Found at T022, after an hour spent blaming the implementation.** Playwright scrolls a click target into view, and `reference-badge` sits at the top of the tuner — so opening from `scrollTop` 300 scrolls the page to 0 *before* the lock runs, and the test asserts about a precondition its own fixture destroyed. Use a small offset that keeps the opener on screen, and read the offset **at open** rather than trusting the pre-open number. |
| "the mobile settings render a `Modal`" | Passes without asserting `accessibilityViewIsModal` at all, which is the prop that actually confines VoiceOver. Assert the prop's **value**. |

**One guarantee no test can currently distinguish.** K11 requires restoring the document element's
*previous* inline `overflow` and `padding-right`, not assigning `''`. There is no inline style on that
element today, so both implementations produce an identical DOM and an identical test result. It is
recorded here as a code-review obligation rather than pretended into a test — the difference only
appears the day something else writes an inline style, which is exactly when nobody will be looking.

---

## Phase 1: Setup

**Purpose**: record the starting state and the two numbers that decide how tests must be written, before
anything changes.

- [X] T001 Confirm all merge gates pass on a clean checkout of this branch and record the counts in this file — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e`, plus `pnpm --filter @chromatic-tuner/mobile test`. `pnpm verify:listing` was already red at `005` for missing Android screenshots (a release gate, not a merge gate); record whether that is still the only failure.
- [X] T002 [P] Audit the existing suites this feature can break and record the list in this file — `apps/web/e2e/settings.spec.ts` (drives the sheet with `fill()`/`click()`), `apps/web/e2e/a11y.spec.ts` (asserts the first `Tab` lands on `reference-badge` with the sheet **closed**, `:128`, `:321`), `apps/web/e2e/layout-stability.spec.ts` (measures inside the open sheet, so it meets the scroll lock's `padding-right`), `apps/web/e2e/fold.spec.ts` (scroll cue and document scrolling), `apps/web/e2e/appearance.spec.ts` and `apps/web/e2e/press-affordance.spec.ts` (both click sheet controls)
- [X] T003 [P] Measure and record the scrollbar gutter on this machine in this file — `window.innerWidth - document.documentElement.clientWidth` on the tuner page served by `apps/web`. Expected **0** (macOS overlay scrollbars, per **D4**). This number is what makes T020's assertion design a recorded fact rather than an argument in prose.
- [X] T004 [P] Capture "before" screenshots of the open sheet in light and dark on `apps/web` and store them under `specs/006-fix-settings-sheet-focus/screenshots/` — SC-062 requires the "after" set to be pixel-identical, which needs a baseline taken before any edit. Mobile is not captured: it has no production diff (**D7**), so its half of V57 is a release-gate formality with nothing to compare.

**Checkpoint**: baselines recorded, blast radius known, and the gutter measured rather than assumed. ✅

### T001 — baseline gate run (2026-08-06, clean tree at `5569a78`)

| Gate | Result |
| --- | --- |
| `pnpm lint` | pass, 0 warnings |
| `pnpm format:check` | pass |
| `pnpm typecheck` | pass — 5 projects (`core`, `tokens`, `react`, `web`, `mobile`) |
| `pnpm test` | **483 passed**, 20 files, 8.0s |
| `pnpm test:coverage` | pass — `packages/core` 98.53% stmts / 95.23% branch / 97.4% funcs / **100% lines** |
| `pnpm test:e2e` | **145 passed**, 47.7s |
| `pnpm --filter @chromatic-tuner/mobile test` | **117 passed**, 16 suites, 2.3s |
| `pnpm verify:listing` | red — **only** the `005` Android screenshots (below) |

`verify:listing` fails on exactly three problems, all one missing asset set and all pre-existing:
`listing/assets/screenshots/android/{light,dark}/` do not exist, and `appearances` reports android
missing a light screenshot. Every other check passes (25 claim fields, 8 fields, 41 vocabulary strings,
7 corroborations, 7 derived identity values, 5 artwork scans). **Unchanged from `005`** — nothing this
feature does can move it, and it stays a release gate.

Two deviations from what the plan assumed, both recorded rather than corrected:

- **The e2e suite is 145 tests, not the 115 stated in this file's hazard table.** The prose above was
  written from a stale count. The claim it was making — *the suite is green over four reproducible
  defects* — is unaffected and is if anything stronger: 145 tests pass against a sheet the keyboard
  cannot operate. T028 compares against **145**, not 115.
- **Local Node is v24.14.0, not the 22.13+ CLAUDE.md pins.** Every gate above passes on it. CI still
  runs Node 22, which is the number that decides `listing/scripts/*.mjs` staying JavaScript, so this is
  a note about where these baselines were taken and not a proposal to move CI.

### T002 — blast radius

Seven suites touch the settings sheet, not the six this task named. `performance.spec.ts` was missed by
the plan and is added below.

| Suite | What it does to the sheet | Risk from this feature |
| --- | --- | --- |
| `settings.spec.ts` | 14 tests. Opens via `reference-badge` ×9; drives `a4-slider` with **`fill()`** at `:29`, `:45`, `:54`, `:99`, `:120`; closes via `settings-close` ×6, backdrop press ×3, `Escape` at `:259` | **Highest.** `fill()` sets the value without a keystroke, so US1 cannot break it — but the focus-restore of T017 lands under every `settings-close`/`Escape`/backdrop close here |
| `a11y.spec.ts` | 13 tests. First `Tab` → `reference-badge` with the sheet **closed** at `:131` and `:324`; `.focus()` on `appearance-dark` *inside the open sheet* at `:360` | **Highest.** `:131`/`:324` are exactly what an over-eager trap breaks (T018 re-runs them by name). `:360` is a sheet-open focus assertion that the T010 effect split can only help — it fails today only by luck of timing |
| `appearance.spec.ts` | 14 tests. Opens the sheet ×6; clicks `appearance-dark`, `accidental-*`; measures focus-ring geometry on `appearance-dark` at `:580`–`:642` | High. The ring measurements read `:focus-visible` on a control **inside** the open sheet — the exact state T010 and T016 move focus into |
| `layout-stability.spec.ts` | 7 tests. Measures the sheet's box at `:79`–`:104` and `:114`–`:145`, across a `settings-reset` | High. Meets the scroll lock's `padding-right` (T022) directly; a gutter of 0 here means the local run cannot see a compensation bug |
| `press-affordance.spec.ts` | 7 tests. Opens the sheet ×3, hovers/holds every control in it | Medium. Pointer-only, but runs against the open sheet |
| `fold.spec.ts` | 7 tests. Owns document scrolling — `scrollTo(0, 500)` and the `scrollHeight > clientHeight` probe at `:70`–`:92`; `reference-badge` in the tab-order list at `:108` | Medium. The only suite that asserts the document **is** scrollable, which is the property T022 suspends |
| `performance.spec.ts` | Opens the sheet at `:214` to switch appearance mid-reading (SC-050 frame budget) | Low, **but unnamed by the plan.** A keydown listener that did work per event would show up here first |

### T003 — the gutter, measured

Measured on the tuner page at the default 1280×720 Playwright viewport:

```text
innerWidth 1280 · documentElement.clientWidth 1280 · gutter 0
scrollHeight 1450 · clientHeight 720 · scrollable true
```

**Gutter is 0**, as **D4** predicted (macOS overlay scrollbars). This is the recorded fact T020's design
rests on: a before/after *width* comparison would pass here against an implementation with no
compensation at all, and fail only on CI's Ubuntu runners. T020 asserts the arithmetic instead.

Two by-products worth having:

- **The document really is scrollable at the default viewport** — 1450 > 720 — so V54 (T019) needs no
  special viewport, and its `scrollHeight > clientHeight` precondition will hold rather than vacuously
  pass. The quickstart asserted this; it is now measured.
- **`document.documentElement` carries no inline `overflow` or `paddingRight` today** (both read `''`).
  That is the concrete form of the code-review obligation above: capture-and-restore and assigning `''`
  are indistinguishable right now, in every test, on both appearances.

### T004 — the "before" baseline

`specs/006-fix-settings-sheet-focus/screenshots/before-sheet-{light,dark}.png`

|  | light | dark |
| --- | --- | --- |
| SHA-256 | `fd02fc4cf5febf128e18e64ee01a539f72463a05cae34d4550a022b5ad0d3111` | `d3a8c0c8273a3b716437dfc930e69ecf91199fddfb8e78a6688aba04ef07feb7` |
| sheet box | x 380, y 188, w 520, h 532 | identical |

**The capture is of the `settings-sheet` element, not the viewport, and that is deliberate.** The tuner
behind the scrim is live — the marker animates and the cents readout updates at 10 Hz — so a viewport
screenshot is not reproducible and could never support SC-062's "pixel-identical". The sheet's own
content is static. The bounding box is recorded alongside so that a geometric shift the eye would miss
is still a numeric failure, and so the `padding-right` of T022 has something to be caught by.

Recipe, so T027 can reproduce it byte-for-byte rather than approximately: throwaway spec in
`apps/web/e2e/`, `audioArgs('e2-in-tune.wav')`, default 1280×720, `page.emulateMedia({ colorScheme })`
with the appearance preference left at its `'system'` default, open via `reference-badge`, wait 600 ms
for the entrance transition, then `sheet.screenshot({ animations: 'disabled' })`.

The harness was **deleted** after the run rather than kept. Left in `e2e/` it would be picked up by
every `pnpm test:e2e` and would silently overwrite the very baseline it produced — and it is not a test:
it asserts nothing. T027 recreates it from the recipe and writes `after-sheet-*.png`.

Mobile is not captured, per this task and **D7**.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the two test helpers every story below needs. Nothing else is shared — this feature adds
no infrastructure, no schema, and no module.

**⚠️ Blocking**: T005 must land before any test task in Phases 3–5.

- [X] T005 Add `openSettings(page)` and `activeTestId(page)` to `apps/web/e2e/helpers.ts` — `openSettings` clicks `reference-badge` and waits for `settings-sheet`; `activeTestId` returns `document.activeElement`'s `data-testid` (falling back to the tag name, so a `BODY` result is reported as `BODY` rather than `undefined` — every hazard row above depends on being able to tell those apart)

**Checkpoint**: the story phases can be written independently and in any order. ✅

### T005 — the two helpers, and one thing the task got wrong

Both landed in `apps/web/e2e/helpers.ts`. Lint, `format:check` and `apps/web` typecheck all pass.

**`openSettings` waits for one more thing than the task specified, and it has to.** Waiting for
`settings-sheet` to be visible is not enough: `open` is React state, so the sheet paints in the commit
while the autofocus lands in a **passive** effect flushed after it. A `toBeVisible()` that polls in
between resolves on a sheet whose focus is still moving, and a test that then focuses a control of its
own races the effect and loses at random — which for this feature would look exactly like the defect
under test. So it also waits for `settings-close` to be focused, which is K1 and existing behaviour, so
every caller starts from one known active element rather than from whichever of the two won.

**Verified against the unfixed build** with a throwaway spec, since T005 blocks Phases 3–5 and neither
helper has a test of its own. Deleted after the run, same reasoning as T004's harness:

```text
before open:                    BODY
after open:                     settings-close
after focusing the slider:      a4-slider
after ArrowRight (the defect):  settings-close     ← defect 3, reproduced
a4-value now:                   441
after close:                    BODY               ← FR-138 violated, as V53 predicts
one Tab from the top:           reference-badge
```

`activeTestId`'s tag-name fallback is load-bearing rather than defensive: two of the three lines above
that matter report `BODY`, and without it they would both report `undefined` and be indistinguishable
from a helper that failed to read anything.

> **T013 must not read `activeTestId` before focusing something, or V53 will pass on the unfixed
> build.** The task says to read the opener "**before** opening" rather than hard-coding
> `reference-badge`. Measured above, focus before opening is **`BODY`** — nothing is focused on a
> freshly loaded page. A V53 that captures `BODY` and asserts the restore matches it would assert
> exactly what today's broken build does, and pass. The capture is only meaningful once the opener is
> genuinely focused: press `Tab` (which reaches `reference-badge`, measured), read `activeTestId`,
> *then* open. The hazard table's row about hard-coding `reference-badge` is still right; this is the
> same trap arriving through the opposite door.

---

## Phase 3: User Story 1 — Changing a setting by keyboard leaves focus where it was (Priority: P1) 🎯 MVP

**Goal**: reported defects 3 and 4. Make the settings operable from the keyboard at all.

**Independent Test**: open the settings with a keyboard, press an arrow key on the reference pitch
twice, and confirm the value moved by two steps with focus still on the slider.

**Ships alone**: yes, and it is the MVP. Focus containment and scroll locking are both violations the
user can work around; this one silently discards input.

### Tests for User Story 1 ⚠️ write first, observe failing

> All three land in `apps/web/e2e/settings.spec.ts`, so they are sequential, not parallel.

- [X] T006 [US1] Write V49 in `apps/web/e2e/settings.spec.ts` — open the settings, focus `a4-slider`, `press('ArrowRight')`; assert `a4-value` reads `441` **and** `activeTestId(page)` is `a4-slider` (K2, FR-132)
- [X] T007 [US1] Write V50 in `apps/web/e2e/settings.spec.ts` — for each of `accidental-flat`, `appearance-dark`, `settings-reset`, focus it and `press('Enter')`, then assert the preference applied **and** `activeTestId(page)` is still that control; repeat the three with `press(' ')`. Six assertions (K2, FR-132)
- [X] T008 [US1] Write V51 in `apps/web/e2e/settings.spec.ts` — focus `a4-slider` at 440, `press('ArrowDown')` eight times with no other input, assert `a4-value` reads `432` (K3, FR-134, SC-056)
- [X] T009 [US1] Run `apps/web/e2e/settings.spec.ts`, **observe V49–V51 fail**, and record the actual failure output in this file — the expected failure is `settings-close` where the control should be, and `439` for V51

### Implementation for User Story 1

- [X] T010 [US1] Split the effect in `apps/web/src/components/organisms/SettingsSheet.tsx:80–92` (**D1**) — one effect keyed on `[open]` alone that calls `closeRef.current?.focus()`, one keyed on `[open, onClose]` that registers the `keydown` listener. Comment it by cause, citing K1/K2 and naming `TunerDisplay.tsx:96` as the unstable dependency, so the next reader does not "simplify" them back together. Do **not** wrap `onClose` in `useCallback` at the call site — **D1** records why that is the wrong file to fix it in
- [X] T011 [US1] Re-run V49–V51 green, then re-run `settings.spec.ts`, `appearance.spec.ts` and `press-affordance.spec.ts` in full and record the counts — the suites from T002 that drive these same controls

**Checkpoint**: the settings are keyboard-operable. US1 is independently shippable here. ✅

### T006–T008 — one hazard the plan did not have, and it would have been fatal

The hazard table says V49–V51 must use `press()` rather than `fill()`. That is necessary and not
sufficient. **`locator.press()` focuses the element and then presses it**, so V51 written the obvious
way — `slider.press('ArrowDown')` eight times — re-focuses the slider before every press, silently
repairing the exact behaviour under test, and passes green on the broken build.

The three tests therefore focus once and press through **`page.keyboard.press`**, which sends the key
to whatever actually holds focus. That is the only form of the question worth asking, and it is now
commented in the spec file so the next reader does not tidy it back. This belongs in the hazard table's
first row alongside `fill()`: same defect, one layer further in.

`ACTIVATIONS` restores each control's precondition before pressing it, because activating a control
that is *already* chosen applies nothing and asserts nothing. `settings-reset` needs the mirror setup —
something non-default to return from — and it is the interesting case the task named: reset changes
which options are selected *underneath* the focused control.

### T009 — observed red

Four tests, four failures, exactly as predicted:

```text
V49  — an arrow key on the reference pitch leaves focus on it
       Expected: "a4-slider"      Received: "settings-close"
V50  — Enter on a settings button leaves focus on that button
       Error: Enter on accidental-flat moved focus
       Expected: "accidental-flat"   Received: "settings-close"
V50  — Space on a settings button leaves focus on that button
       Error: Space on accidental-flat moved focus
       Expected: "accidental-flat"   Received: "settings-close"
V51  — eight presses move eight hertz
       Expected: "432"            Received: "439"   (14 × resolved to 439)
```

**V49's value assertion passed.** `a4-value` read `441`; only the focus assertion failed. That is the
hazard table's second row demonstrated on the real build rather than argued — a V49 that asserted "the
reference pitch changed after ArrowRight" would have been green on unfixed code.

`439` is defect 3 stated as arithmetic: the first press lands on the slider, the effect then moves focus
to Done, and the remaining seven presses are discarded by a button that ignores them.

### T010 — the fix

Six lines of behaviour change in `SettingsSheet.tsx`: the single `[open, onClose]` effect becomes an
autofocus effect keyed on `[open]` alone, plus the untouched Escape listener still keyed on
`[open, onClose]`. No `useCallback` in `TunerDisplay` — **D1**'s reasoning stands, and the comment names
`TunerDisplay.tsx:96` and `:41` so the causal chain survives the next reader.

`exhaustive-deps` is satisfied without a suppression comment, which is the check that the two dependency
arrays are now honest rather than merely convenient.

### T011 — green, and nothing else moved

| Run | Result |
| --- | --- |
| V49–V51 alone | **4 passed** (V50 is two tests, one per key) |
| `settings.spec.ts` + `appearance.spec.ts` + `press-affordance.spec.ts` | **58 passed** |
| Full `pnpm test:e2e` | **149 passed** — T001's 145 plus these 4, nothing regressed |

`pnpm lint`, `format:check` and `typecheck` all clean. The full suite was run rather than only the three
T011 names: it is 47 seconds and it is the only thing that can show the effect split disturbing a suite
nobody predicted.

---

## Phase 4: User Story 2 — Focus cannot leave the open sheet (Priority: P2)

**Goal**: reported defect 1, plus the focus restoration that belongs to the same contract.

**Independent Test**: open the settings, `Tab` past the last control, and confirm focus returns to the
first rather than reaching anything behind the scrim; close and confirm focus is back on the opener.

**Ships alone**: yes. Independent of US1 — a trap and a stable focus effect touch different lines.

### Tests for User Story 2 ⚠️ write first, observe failing

> All three land in `apps/web/e2e/a11y.spec.ts`, so they are sequential, not parallel.

- [X] T012 [US2] Write V52 in `apps/web/e2e/a11y.spec.ts` — derive the focusable list from the DOM inside `settings-sheet` rather than hard-coding a count (K5); assert `Tab` from the last lands on the first, `Shift+Tab` from the first lands on the last, `Tab` from the **middle** advances exactly one control (the over-eager-`preventDefault` guard), and that 2× the control count of `Tab` presses never once leaves the sheet (K4, K6, FR-135, FR-136, SC-058)
- [X] T013 [US2] Write V53 in `apps/web/e2e/a11y.spec.ts` — read `activeTestId(page)` **before** opening and assert the restore matches that captured value rather than the literal `reference-badge`; cover all three closes: `settings-close`, `Escape`, and a backdrop press (K7, FR-138)
- [X] T014 [US2] Write the automatable half of K8 in `apps/web/e2e/a11y.spec.ts` — `settings-sheet` carries `aria-modal="true"`, and `settings-backdrop`'s bounding box covers the full viewport. Expected to pass immediately; it is a non-regression pin on the two channels this feature is **not** implementing (FR-136, FR-144)
- [X] T015 [US2] Run `apps/web/e2e/a11y.spec.ts`, **observe V52 and V53 fail**, and record the output in this file — V52 should reach `reference-badge` or `microphone-toggle`, V53 should report `BODY`

### Implementation for User Story 2

- [X] T016 [US2] Add `Tab` handling to the existing `keydown` listener in `apps/web/src/components/organisms/SettingsSheet.tsx` (**D3**, K4–K6) — a `sheetRef` on the `<section>`; `querySelectorAll` the focusable set **on each keypress** (K5), never cached at open; wrap at both ends with `preventDefault`; pull focus back to the first control if the active element is outside the sheet; fall through untouched everywhere else so the browser's own order still runs inside the sheet. Return early on an empty set as a stated condition, not a silent one (Principle I)
- [X] T017 [US2] Capture the opener and restore it in `apps/web/src/components/organisms/SettingsSheet.tsx` (**D6**, K7) — capture `document.activeElement` inside the `[open]` effect, restore in that effect's cleanup, guarded on the node still being `document.contains`. Record in the comment why capturing *inside* the effect is what makes it converge under `<StrictMode>`, since a later move of the capture outside would break it in dev only
- [X] T018 [US2] Re-run V52–V54 green, then re-run `a11y.spec.ts` in full — including the two pre-existing tests at `:128` and `:321` that assert the first `Tab` lands on `reference-badge` with the sheet **closed**, which this must not disturb

**Checkpoint**: the sheet is a real modal to the keyboard. US2 is independently shippable here. ✅

### T012–T014 — five tests, and V53 written against the T005 warning

V52 is one test; V53 is **three**, one per close route, so a restore that works for Done but not for a
backdrop press reports which one rather than stopping at the first. The K8 pin is the fifth.

V53 follows the warning recorded at T005: it presses `Tab` to focus `reference-badge` **first**, then
reads `activeTestId`, then opens with `Enter`. Reading before focusing anything would have captured
`BODY` — which is exactly what the unfixed build restores to — and the test would have passed green on
broken code. It still never names `reference-badge` in the assertion, so an implementation that
hard-codes the opener cannot pass it either. Both halves of that trap are now closed.

V52 asserts containment two ways per press: `activeTestId` for a readable failure, and a
`sheet.contains(document.activeElement)` check for the structural question. They fail differently — a
trap that wraps to the wrong control passes the second, focus on an unnamed element passes the first.

### T015 — observed red

```text
V52 — Tab cannot leave the open sheet, and wraps in one press
      Error: Tab from the last control did not wrap to the first
      Expected: "settings-close"   Received: "BODY"
V53 — closing with Done returns focus to the opener
      Error: closing with Done discarded focus
      Expected: "reference-badge"  Received: "BODY"
V53 — closing with Escape …            Expected "reference-badge"  Received "BODY"
V53 — closing with a backdrop press …  Expected "reference-badge"  Received "BODY"
the sheet declares itself modal …      PASSED (by design, see below)
```

**One deviation from what T015 predicted.** The task expected V52 to reach `reference-badge` or
`microphone-toggle`. It does not get that far: it fails at the *first* assertion, and focus lands on
**`BODY`** — the lap-and-a-half assertion that would walk onto the controls behind the scrim is never
reached. That is worth recording because it is **D2**'s measurement reproduced on our own sheet: an
unowned `Tab` from the last control goes to the document, exactly as a native modal `<dialog>` does in
both engines. The two arrangements fail identically, which is the empirical half of why `<dialog>` was
rejected.

**The K8 pin passed on its first run.** The rule at the top of this file says a test that passes first
time is wrong — this is the stated exception, and T014 says so: it pins two channels (`aria-modal`, the
full-viewport scrim) that already work and that FR-144 forbids this feature from breaking. It is a
non-regression pin, not a regression test. Recorded here so T030 does not have to rediscover whether it
was an oversight.

### T016–T017 — the trap and the restore

Both land in `SettingsSheet.tsx`, in the two effects Phase 3 separated. The `Tab` branch sits beside the
untouched `Escape` branch in the same listener, so the sheet still registers exactly one.

Three things the code says and this file should not have to repeat: the set is queried per keypress
rather than cached at open (K5); an empty set returns early as a stated condition rather than falling
out of index arithmetic (Principle I); and every `Tab` that is not at either end falls through
untouched, which is what keeps the sheet traversable.

One line was written and removed before it ran: a `shiftKey && active === last` branch that returned
early. It is unreachable as behaviour — the final `!event.shiftKey && active === last` already cannot
match when `shiftKey` is true — so it was dead code, and Principle I does not allow it to stay for
symmetry's sake.

The opener is captured **inside** the `[open]` effect. The comment records why, since the property is
invisible: under `<StrictMode>` the effect mounts, cleans up, and mounts again, and the second capture
reads what the restore just wrote. Hoisting the capture outside would make the second run capture
**Done** instead, so closing would restore focus to a control that no longer exists — in dev only,
which is the worst place for it to be wrong (**D6**).

### T018 — green, and the two pre-existing Tab tests survived

| Run | Result |
| --- | --- |
| V52, V53 ×3, the K8 pin | **5 passed** |
| `a11y.spec.ts` in full | **27 passed** — 22 before, plus these 5 |
| Full `pnpm test:e2e` | **154 passed** — Phase 3's 149 plus 5 |

The two tests this most endangered both pass: `a11y.spec.ts:131` and `:324` assert the first `Tab` lands
on `reference-badge` with the sheet **closed**, which is precisely what an over-eager trap breaks. Lint,
`format:check` and `typecheck` clean.

> **T018's task text says "re-run V52–V54 green".** V54 is the scroll-lock test and belongs to Phase 5
> (T019); it does not exist yet. The three things Phase 4 wrote are V52, V53 and the K8 pin, and those
> are what was re-run. A numbering slip in the task, not a skipped test.

---

## Phase 5: User Story 3 — The page behind the sheet does not scroll (Priority: P3)

**Goal**: reported defect 2.

**Independent Test**: open the settings on a page that scrolls, attempt to scroll by every means, and
confirm the position is unchanged — and unchanged again, at the same offset, after closing.

**Ships alone**: yes. Independent of US1 and US2.

### Tests for User Story 3 ⚠️ write first, observe failing

- [X] T019 [US3] Write V54 in `apps/web/e2e/a11y.spec.ts` — assert `scrollHeight > clientHeight` **first** so the test cannot pass by having nothing to scroll; record `scrollTop`, open the settings, then wheel over the scrim, `End`, `PageDown`, and `ArrowDown` with focus in the sheet but not on the slider; assert `scrollTop` is unchanged after each (K9, FR-139, SC-059)
- [X] T020 [US3] Write V55 in `apps/web/e2e/a11y.spec.ts` — measure `gutter = window.innerWidth - document.documentElement.clientWidth` before opening and assert the applied `padding-right` **equals that measured gutter**, including when it is `0`; assert `scrollTop` returns to a known pre-open offset after close; assert `overflow`, `padding-right` and `overscroll-behavior` are back to their pre-open values. Also pin **D5**: the computed `touch-action` on `a4-slider` is not `none`, so the rubber-band fix can never be "simplified" into one that cancels the slider drag (K10, K11, FR-140, FR-141)
- [X] T021 [US3] Run `apps/web/e2e/a11y.spec.ts`, **observe V54 and V55 fail**, and record the output in this file — the expected failure matches the `<dialog>` probe in **D2**: the page scrolls on both wheel and `End`

### Implementation for User Story 3

- [X] T022 [US3] Add the scroll lock to `apps/web/src/components/organisms/SettingsSheet.tsx` (**D4**, K9–K11) — an effect keyed on `[open]` that captures the document element's prior inline `overflow` and `paddingRight`, sets `overflow: hidden`, adds the measured gutter back as `paddingRight` when it is non-zero, and writes both **captured values** back in cleanup (not `''` — see the code-review obligation above). Comment why the document element and not `position: fixed` on the body: `overflow: hidden` preserves `scrollTop` by construction, so FR-140 holds without bookkeeping
- [X] T023 [US3] Add `overscroll-behavior: none` alongside the lock in `apps/web/src/components/organisms/SettingsSheet.tsx` (**D5**), captured and restored in the same place. Comment the trap by name: `touch-action: none` on the backdrop **inherits** onto `<input type="range">` and would fix a rubber-band by breaking the reference pitch drag on every phone
- [X] T024 [US3] Re-run V54, V55 green, then re-run `fold.spec.ts` and `layout-stability.spec.ts` in full and record the counts — the two suites from T002 that measure scrolling and in-sheet geometry

**Checkpoint**: all four reported defects are fixed and all three stories are shippable. ✅

### T019–T020 — one assertion that stops V55 being vacuous

The task lists V55's assertions as the applied `padding-right`, the restored `scrollTop`, and the three
restored properties. **Written only that way, V55 passes on an implementation that never locks
anything**: if `overflow`, `padding-right` and `overscroll-behavior` are never touched, they are
trivially "back to their pre-open values", and `padding-right` moves by 0 against a gutter of 0.

So V55 first asserts the lock is *real* — `overflow` is `hidden` and `overscroll-behavior` is `none`
while the sheet is open — and only then that closing puts them back. This is the same shape as the
hazard table's "nothing to scroll" row: a restore assertion is meaningless without evidence that
something was applied. It is what caught the implementation at T024 rather than a green vacuum.

The `padding-right` check is the arithmetic `open − closed === gutter`, never an observed width (**D4**).
With the gutter at 0 locally it asserts that nothing was added; on CI's Ubuntu runners it asserts the
freed pixels came back. Both meaningful, neither environment-specific.

### T021 — observed red

```text
V54 — the document does not scroll behind the open sheet
      Error: a wheel over the scrim scrolled the page behind the sheet
      Expected: 0    Received: 600
V55 — the lock costs no width and unlocks exactly
      Error: the document element was never locked
      Expected: "hidden"   Received: "visible"
```

V54's failure is **D2**'s probe reproduced on our own sheet, at the same magnitude: the wheel scrolls
the page straight through the scrim, exactly as it does through a native modal `<dialog>` in both
Chromium and WebKit.

### T022–T023 — and an hour spent blaming the implementation for a defect in the test

The lock went in as **D4** describes and V54 went green immediately. **V55 did not**: `scrollTop` came
back `0` after close instead of the `300` the test had scrolled to.

Two hypotheses were wrong before the right one, and both are worth recording because each is a
plausible thing to believe:

1. **"`focus()` scrolls its target into view, so the restore is undoing the position."** Plausible —
   the opener sits in the first viewport. Adding `preventScroll: true` changed nothing.
2. **"`overflow: hidden` resets `scrollTop`, and D4's measurement was wrong."** Also plausible, and it
   would have meant abandoning the mechanism for `position: fixed` plus bookkeeping.

A throwaway probe settled it in one run, and the answer was neither:

```text
isolated (no React):  scrollTo 300 → 300 · overflow hidden → 300 · released → 300
through the sheet:    before open 300 · WHILE OPEN 0 · after close 0
badge geometry:       top 73, bottom 117, in a 720 viewport
```

`overflow: hidden` preserves the position exactly as **D4** measured. The page was **already at 0 while
the sheet was open** — so nothing in the lock or the restore was responsible. `openSettings` clicks
`reference-badge`, **Playwright scrolls a click target into view**, and the badge sits at the top of the
tuner: from `scrollTop` 300 it is above the fold, so opening the sheet scrolled the page to 0 before the
lock ever ran. The fixture destroyed the very precondition the test was asserting about.

The fix is in the test, not the code. V55 now scrolls to a **small** offset that keeps the badge on
screen, and — more importantly — reads the offset **at open** rather than trusting the pre-open number,
because K11 is about the position the page had when the sheet *opened*. An `expect(open.scrollTop > 0)`
guard fails loudly if the opener ever moves below the fold and this happens again.

**The red run was repeated after the test was rewritten.** V54 and V55 were edited *after* being
observed failing, so the original red no longer covered the final assertions. The implementation was
stashed and both were re-run against the unfixed component: same two failures, same messages. Principle
III wants the final test seen failing, not an earlier draft of it.

`preventScroll: true` was kept even though it fixed nothing. It is not speculative: this cleanup runs
before the scroll lock's, so the document is still `overflow: hidden` and `focus()` could not scroll it
anyway — but that is an accident of the order the two effects are declared in, and `preventScroll`
removes the dependency on it. The comment says exactly that rather than claiming a measurement it does
not have.

### T024 — green, and the two scroll-sensitive suites survived

| Run | Result |
| --- | --- |
| V54, V55 | **2 passed** |
| V52–V55 together | **6 passed** |
| `fold.spec.ts` + `layout-stability.spec.ts` | **13 passed** |
| Full `pnpm test:e2e` | **156 passed** — Phase 4's 154 plus 2 |

`fold.spec.ts` is the one suite that asserts the document **is** scrollable — the property T022
suspends — and it is unaffected, because the lock exists only while the sheet is open. Lint,
`format:check` and `typecheck` clean.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T025 [P] Create `apps/mobile/__tests__/settings-modality.test.tsx` with V56's three assertions (**D7**, FR-142, FR-143) — the settings render inside a `Modal` whose `accessibilityViewIsModal` is `true` (assert the value, not the prop's presence); the tuner screen has no scrollable ancestor; changing a preference from the sheet never calls `AccessibilityInfo.setAccessibilityFocus`. All three pass on today's code, which is the point: they pin behaviour the platform gives us free and a refactor could silently remove. A separate file from `__tests__/settings.test.tsx` so FR-143's assertions cannot be deleted alongside a settings test someone is rewriting
- [ ] T026 [P] Add a short note to `CLAUDE.md` under "Working in this repo" carrying the three traps worth the next reader's time — a modal `<dialog>` neither wraps `Tab` nor blocks page scroll (measured, **D2**); `touch-action` inherits, so it must never go on the backdrop (**D5**); the scrollbar gutter is 0 on macOS and non-zero on CI, so a width comparison is a test that only fails in CI (**D4**). Keep it to the repo's existing density — the *why*, not a narration of the fix
- [ ] T027 Capture the "after" screenshots into `specs/006-fix-settings-sheet-focus/screenshots/` and compare against T004's baseline — SC-062 permits no difference in either appearance. Any delta is a defect in this feature, not a judgement call (FR-145)
- [ ] T028 Run the full merge gate and record the counts against T001's baseline — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e`, plus `pnpm --filter @chromatic-tuner/mobile test`. `packages/core` coverage must be unmoved: no core file changes (SC-061)
- [ ] T029 Run V57's manual screen-reader gate against `apps/web` and `apps/mobile`, recording the result in this file — VoiceOver on macOS Safari and iOS, TalkBack on Android: open the settings, navigate by element past the end of the sheet, confirm the cursor cannot reach the tuner and the surface is announced as a dialog. Record the result here. This is the half of K8 no automated engine in this repo can observe — Axe checks that `aria-modal` is present, not that a screen reader honours it (SC-060)
- [ ] T030 Record the build log for this feature in this file — deviations from the plan, anything **D1–D8** got wrong, and any test that passed on its first run (which per the rule above means the test was wrong and what was done about it)

---

## Dependencies

```text
Phase 1 (T001–T004)  ──►  Phase 2 (T005)  ──┬──►  Phase 3 · US1 (T006–T011)  ──┐
                                            │                                  │
                                            ├──►  Phase 4 · US2 (T012–T018)  ──┼──►  Phase 6
                                            │                                  │    (T025–T030)
                                            └──►  Phase 5 · US3 (T019–T024)  ──┘
```

- **T005 blocks everything** in Phases 3–5: every test task uses both helpers.
- **The three stories are independent of one another.** They touch different lines of one file and
  different assertions in two test files, so they can be built in any order or by different people —
  but see the serialisation note below before assuming they can be built *simultaneously*.
- **Within a story the order is strict**: tests → observe red → implement → re-run. That ordering is
  Principle III, not a preference, and the "observe red" task exists so it cannot be skipped silently.
- **T027 depends on T004.** A pixel comparison with no baseline is not a comparison.

## Parallel opportunities

Honestly: few, and saying so is more useful than manufacturing them.

- **T002, T003, T004** run in parallel — three independent recordings.
- **T025 and T026** run in parallel — different files, different platforms, neither blocking.
- **Everything else serialises on two files.** All web production changes land in
  `SettingsSheet.tsx`; V49–V51 all land in `settings.spec.ts`; V52–V55 all land in `a11y.spec.ts`.
  Marking those `[P]` would promise a parallelism that git would immediately take back.

## Implementation strategy

**MVP is Phase 3 alone** — T001–T011. That is defects 3 and 4, the two that make the settings unusable
rather than merely incorrect, and it is roughly six lines of production code. It is worth shipping on
its own if anything else here stalls.

**Then Phase 4, then Phase 5**, in spec priority order. Each checkpoint is a complete increment with its
own regression tests, and none of the three depends on another's implementation.

**Phase 6 is not optional dressing.** T025 is FR-142/FR-143, T027 is FR-145, and T029 is the only
verification SC-060 will ever get.

## Requirement coverage

| Requirement | Where |
| --- | --- |
| FR-132, FR-133, FR-134 | T006–T011 (US1) |
| FR-135, FR-136, FR-137 | T012, T014, T016 (US2) |
| FR-138 | T013, T017 (US2) |
| FR-139, FR-140, FR-141 | T019, T020, T022, T023 (US3) |
| FR-142, FR-143 | T025 |
| FR-144 | T014, T011, T018, T024 (the non-regression re-runs) |
| FR-145 | T004, T027 |
| SC-056 | T008 |
| SC-057 | T006, T007 |
| SC-058 | T012 |
| SC-059 | T019, T020 |
| SC-060 | T029 |
| SC-061 | T028 |
| SC-062 | T004, T027 |
| K1–K3 | T006–T008, T010 |
| K4–K7 | T012, T013, T016, T017 |
| K8 | T014 (automatable half), T029 (screen readers) |
| K9–K11 | T019, T020, T022, T023 |
