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
operate.** 115 e2e tests pass today over four reproducible defects. That is not an accident, and the
first row below is the reason — it is worth understanding before writing a single assertion.

| Tempting assertion | Why it passes on a broken build |
| --- | --- |
| `page.getByTestId('a4-slider').fill('432')` then assert the value | **This is what the existing suite already does** (`settings.spec.ts:28`, `:44`, `:52`) and it is precisely why the defect shipped. `fill()` sets the value directly and never presses a key, so it exercises none of the keyboard path. V49–V51 must use `press()`. |
| "the reference pitch changed after `ArrowRight`" | Passes **today**. The value does change; defect 3 is entirely about where focus went afterwards. Assert the active element, not the value. |
| "after `Tab` from the last control, `reference-badge` is not focused" | Passes when focus lands on `<body>` — which is what a native `<dialog>` does (**D2**, measured) and what a half-written trap does. K6 requires landing on the **first control**, named. |
| "after N tabs nothing outside the sheet is focused", N = the control count | Passes if the cycle happens to land back inside on the Nth press. Use 2× the control count and assert **every** intermediate element, not just the last. |
| "the sheet still closes on Escape" (as the guard against an over-eager trap) | Passes for a `Tab` handler that `preventDefault`s unconditionally, because Escape is handled on a different branch. The assertion that catches that is `Tab` in the **middle** of the sheet still advancing one control. |
| "focus returns to `reference-badge` after close" | Passes for an implementation that hard-codes `reference-badge`. There is only one opener today, so no test can distinguish the two. Read `document.activeElement` *before* opening and assert against that value. |
| "the content is the same width before and after locking" | The scrollbar gutter is **0 on macOS** (overlay scrollbars) and non-zero on CI's Ubuntu runners, so this passes locally against zero compensation and fails only in CI. Assert the arithmetic (**D4**, T003). |
| "`scrollTop` is unchanged after scrolling with the sheet open" | Passes when the page was never scrollable at that viewport. Assert `scrollHeight > clientHeight` first, so the test cannot succeed by having nothing to scroll. |
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

- [ ] T001 Confirm all merge gates pass on a clean checkout of this branch and record the counts in this file — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e`, plus `pnpm --filter @chromatic-tuner/mobile test`. `pnpm verify:listing` was already red at `005` for missing Android screenshots (a release gate, not a merge gate); record whether that is still the only failure.
- [ ] T002 [P] Audit the existing suites this feature can break and record the list in this file — `apps/web/e2e/settings.spec.ts` (drives the sheet with `fill()`/`click()`), `apps/web/e2e/a11y.spec.ts` (asserts the first `Tab` lands on `reference-badge` with the sheet **closed**, `:128`, `:321`), `apps/web/e2e/layout-stability.spec.ts` (measures inside the open sheet, so it meets the scroll lock's `padding-right`), `apps/web/e2e/fold.spec.ts` (scroll cue and document scrolling), `apps/web/e2e/appearance.spec.ts` and `apps/web/e2e/press-affordance.spec.ts` (both click sheet controls)
- [ ] T003 [P] Measure and record the scrollbar gutter on this machine in this file — `window.innerWidth - document.documentElement.clientWidth` on the tuner page served by `apps/web`. Expected **0** (macOS overlay scrollbars, per **D4**). This number is what makes T020's assertion design a recorded fact rather than an argument in prose.
- [ ] T004 [P] Capture "before" screenshots of the open sheet in light and dark on `apps/web` and store them under `specs/006-fix-settings-sheet-focus/screenshots/` — SC-062 requires the "after" set to be pixel-identical, which needs a baseline taken before any edit. Mobile is not captured: it has no production diff (**D7**), so its half of V57 is a release-gate formality with nothing to compare.

**Checkpoint**: baselines recorded, blast radius known, and the gutter measured rather than assumed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the two test helpers every story below needs. Nothing else is shared — this feature adds
no infrastructure, no schema, and no module.

**⚠️ Blocking**: T005 must land before any test task in Phases 3–5.

- [ ] T005 Add `openSettings(page)` and `activeTestId(page)` to `apps/web/e2e/helpers.ts` — `openSettings` clicks `reference-badge` and waits for `settings-sheet`; `activeTestId` returns `document.activeElement`'s `data-testid` (falling back to the tag name, so a `BODY` result is reported as `BODY` rather than `undefined` — every hazard row above depends on being able to tell those apart)

**Checkpoint**: the story phases can be written independently and in any order.

---

## Phase 3: User Story 1 — Changing a setting by keyboard leaves focus where it was (Priority: P1) 🎯 MVP

**Goal**: reported defects 3 and 4. Make the settings operable from the keyboard at all.

**Independent Test**: open the settings with a keyboard, press an arrow key on the reference pitch
twice, and confirm the value moved by two steps with focus still on the slider.

**Ships alone**: yes, and it is the MVP. Focus containment and scroll locking are both violations the
user can work around; this one silently discards input.

### Tests for User Story 1 ⚠️ write first, observe failing

> All three land in `apps/web/e2e/settings.spec.ts`, so they are sequential, not parallel.

- [ ] T006 [US1] Write V49 in `apps/web/e2e/settings.spec.ts` — open the settings, focus `a4-slider`, `press('ArrowRight')`; assert `a4-value` reads `441` **and** `activeTestId(page)` is `a4-slider` (K2, FR-132)
- [ ] T007 [US1] Write V50 in `apps/web/e2e/settings.spec.ts` — for each of `accidental-flat`, `appearance-dark`, `settings-reset`, focus it and `press('Enter')`, then assert the preference applied **and** `activeTestId(page)` is still that control; repeat the three with `press(' ')`. Six assertions (K2, FR-132)
- [ ] T008 [US1] Write V51 in `apps/web/e2e/settings.spec.ts` — focus `a4-slider` at 440, `press('ArrowDown')` eight times with no other input, assert `a4-value` reads `432` (K3, FR-134, SC-056)
- [ ] T009 [US1] Run `apps/web/e2e/settings.spec.ts`, **observe V49–V51 fail**, and record the actual failure output in this file — the expected failure is `settings-close` where the control should be, and `439` for V51

### Implementation for User Story 1

- [ ] T010 [US1] Split the effect in `apps/web/src/components/organisms/SettingsSheet.tsx:80–92` (**D1**) — one effect keyed on `[open]` alone that calls `closeRef.current?.focus()`, one keyed on `[open, onClose]` that registers the `keydown` listener. Comment it by cause, citing K1/K2 and naming `TunerDisplay.tsx:96` as the unstable dependency, so the next reader does not "simplify" them back together. Do **not** wrap `onClose` in `useCallback` at the call site — **D1** records why that is the wrong file to fix it in
- [ ] T011 [US1] Re-run V49–V51 green, then re-run `settings.spec.ts`, `appearance.spec.ts` and `press-affordance.spec.ts` in full and record the counts — the suites from T002 that drive these same controls

**Checkpoint**: the settings are keyboard-operable. US1 is independently shippable here.

---

## Phase 4: User Story 2 — Focus cannot leave the open sheet (Priority: P2)

**Goal**: reported defect 1, plus the focus restoration that belongs to the same contract.

**Independent Test**: open the settings, `Tab` past the last control, and confirm focus returns to the
first rather than reaching anything behind the scrim; close and confirm focus is back on the opener.

**Ships alone**: yes. Independent of US1 — a trap and a stable focus effect touch different lines.

### Tests for User Story 2 ⚠️ write first, observe failing

> All three land in `apps/web/e2e/a11y.spec.ts`, so they are sequential, not parallel.

- [ ] T012 [US2] Write V52 in `apps/web/e2e/a11y.spec.ts` — derive the focusable list from the DOM inside `settings-sheet` rather than hard-coding a count (K5); assert `Tab` from the last lands on the first, `Shift+Tab` from the first lands on the last, `Tab` from the **middle** advances exactly one control (the over-eager-`preventDefault` guard), and that 2× the control count of `Tab` presses never once leaves the sheet (K4, K6, FR-135, FR-136, SC-058)
- [ ] T013 [US2] Write V53 in `apps/web/e2e/a11y.spec.ts` — read `activeTestId(page)` **before** opening and assert the restore matches that captured value rather than the literal `reference-badge`; cover all three closes: `settings-close`, `Escape`, and a backdrop press (K7, FR-138)
- [ ] T014 [US2] Write the automatable half of K8 in `apps/web/e2e/a11y.spec.ts` — `settings-sheet` carries `aria-modal="true"`, and `settings-backdrop`'s bounding box covers the full viewport. Expected to pass immediately; it is a non-regression pin on the two channels this feature is **not** implementing (FR-136, FR-144)
- [ ] T015 [US2] Run `apps/web/e2e/a11y.spec.ts`, **observe V52 and V53 fail**, and record the output in this file — V52 should reach `reference-badge` or `microphone-toggle`, V53 should report `BODY`

### Implementation for User Story 2

- [ ] T016 [US2] Add `Tab` handling to the existing `keydown` listener in `apps/web/src/components/organisms/SettingsSheet.tsx` (**D3**, K4–K6) — a `sheetRef` on the `<section>`; `querySelectorAll` the focusable set **on each keypress** (K5), never cached at open; wrap at both ends with `preventDefault`; pull focus back to the first control if the active element is outside the sheet; fall through untouched everywhere else so the browser's own order still runs inside the sheet. Return early on an empty set as a stated condition, not a silent one (Principle I)
- [ ] T017 [US2] Capture the opener and restore it in `apps/web/src/components/organisms/SettingsSheet.tsx` (**D6**, K7) — capture `document.activeElement` inside the `[open]` effect, restore in that effect's cleanup, guarded on the node still being `document.contains`. Record in the comment why capturing *inside* the effect is what makes it converge under `<StrictMode>`, since a later move of the capture outside would break it in dev only
- [ ] T018 [US2] Re-run V52–V54 green, then re-run `a11y.spec.ts` in full — including the two pre-existing tests at `:128` and `:321` that assert the first `Tab` lands on `reference-badge` with the sheet **closed**, which this must not disturb

**Checkpoint**: the sheet is a real modal to the keyboard. US2 is independently shippable here.

---

## Phase 5: User Story 3 — The page behind the sheet does not scroll (Priority: P3)

**Goal**: reported defect 2.

**Independent Test**: open the settings on a page that scrolls, attempt to scroll by every means, and
confirm the position is unchanged — and unchanged again, at the same offset, after closing.

**Ships alone**: yes. Independent of US1 and US2.

### Tests for User Story 3 ⚠️ write first, observe failing

- [ ] T019 [US3] Write V54 in `apps/web/e2e/a11y.spec.ts` — assert `scrollHeight > clientHeight` **first** so the test cannot pass by having nothing to scroll; record `scrollTop`, open the settings, then wheel over the scrim, `End`, `PageDown`, and `ArrowDown` with focus in the sheet but not on the slider; assert `scrollTop` is unchanged after each (K9, FR-139, SC-059)
- [ ] T020 [US3] Write V55 in `apps/web/e2e/a11y.spec.ts` — measure `gutter = window.innerWidth - document.documentElement.clientWidth` before opening and assert the applied `padding-right` **equals that measured gutter**, including when it is `0`; assert `scrollTop` returns to a known pre-open offset after close; assert `overflow`, `padding-right` and `overscroll-behavior` are back to their pre-open values. Also pin **D5**: the computed `touch-action` on `a4-slider` is not `none`, so the rubber-band fix can never be "simplified" into one that cancels the slider drag (K10, K11, FR-140, FR-141)
- [ ] T021 [US3] Run `apps/web/e2e/a11y.spec.ts`, **observe V54 and V55 fail**, and record the output in this file — the expected failure matches the `<dialog>` probe in **D2**: the page scrolls on both wheel and `End`

### Implementation for User Story 3

- [ ] T022 [US3] Add the scroll lock to `apps/web/src/components/organisms/SettingsSheet.tsx` (**D4**, K9–K11) — an effect keyed on `[open]` that captures the document element's prior inline `overflow` and `paddingRight`, sets `overflow: hidden`, adds the measured gutter back as `paddingRight` when it is non-zero, and writes both **captured values** back in cleanup (not `''` — see the code-review obligation above). Comment why the document element and not `position: fixed` on the body: `overflow: hidden` preserves `scrollTop` by construction, so FR-140 holds without bookkeeping
- [ ] T023 [US3] Add `overscroll-behavior: none` alongside the lock in `apps/web/src/components/organisms/SettingsSheet.tsx` (**D5**), captured and restored in the same place. Comment the trap by name: `touch-action: none` on the backdrop **inherits** onto `<input type="range">` and would fix a rubber-band by breaking the reference pitch drag on every phone
- [ ] T024 [US3] Re-run V54, V55 green, then re-run `fold.spec.ts` and `layout-stability.spec.ts` in full and record the counts — the two suites from T002 that measure scrolling and in-sheet geometry

**Checkpoint**: all four reported defects are fixed and all three stories are shippable.

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
