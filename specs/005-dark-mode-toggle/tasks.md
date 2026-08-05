---

description: "Task list for 005-dark-mode-toggle"
---

# Tasks: In-App Appearance Control

**Feature**: `005-dark-mode-toggle` · **Created**: 2026-08-05

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/appearance.md](./contracts/appearance.md),
[quickstart.md](./quickstart.md)

This file doubles as the build log, following `001`–`004`: record deviations, defects, and measurements
here as work lands, not just checkmarks.

## Test-first is not optional here

Principle III is NON-NEGOTIABLE. Every test task below is written first and **observed failing** before
the implementation exists. If a test passes on its first run, the test is wrong — fix the test before
touching the implementation.

**The hazard this feature carries: a passing appearance assertion proves almost nothing.** Every check
in this feature has a plausible-looking form that is satisfied by the defect it was written to catch.
`001` already paid for this once — `expect(transform).not.toBe('none')` was satisfied by the constant
that centres the marker, and a 144 px error survived seven phases.

| Tempting assertion | Why it passes on a broken build |
| --- | --- |
| "the page is dark when the preference is dark" | Passes when the **device** is dark and the preference did nothing. Every appearance test must emulate the *opposite* device setting. |
| "`data-theme` is `'dark'` after load" | Passes when React set it *after* first paint — which is the flash. FR-120's binding word is **before**. Assert after `waitUntil: 'commit'`, before the bundle executes. |
| "the background is the dark token after `waitForNote`" | Passes on a build that flashed white for 400 ms. The flash is over by the time this runs. |
| "choosing Dark makes the app dark" | Passes with no persistence at all. US1 and US2 are different assertions. |
| "preferences round-trip through the adapter" | Passes with `appearance` silently dropped, if the assertion compares only the two old fields. Compare the whole record. |
| `resolveAppearance('system', 'dark') === 'dark'` | Passes for a function that ignores its first argument entirely and always returns the device. The M2 rows are what make this test mean anything. |
| "the selected option is visually distinct" | Passes when what distinguishes it is the **focus ring** — the exact defect `500dfb5` fixed on the accidentals group (research **D8**). |
| "`normalizePreferences` defaults a bad appearance" | Passes for an implementation that resets the *whole record*, destroying the user's reference pitch. FR-121 requires fields repaired independently. |
| "the app follows the device" | Passes when it follows the device *always*, ignoring an explicit choice. FR-116 is the other half and needs its own assertion. |

**Two tasks are deliberately "break it and watch the gate fail"** (T038, T046). A gate never observed
failing is not known to work.

---

## Phase 1: Setup

**Purpose**: Record the before-numbers Principle V will demand, and find out which existing tests this
feature is about to break — before it breaks them.

- [ ] T001 Confirm all gates pass on a clean checkout and record the counts in this file — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e && pnpm build && pnpm verify:listing`, plus `pnpm --filter @chromatic-tuner/mobile test`
- [ ] T002 [P] Record the web cold-start baseline from the existing measurement in `apps/web/e2e/performance.spec.ts` (added by `003` T002) into this file — SC-049 needs before/after against the 2 s budget
- [ ] T003 [P] Establish and record a mobile cold-start baseline (launch to first rendered frame) for `apps/mobile` in this file — **no such measurement exists today**, and research **D5** puts an AsyncStorage read in front of the root mount, making this the number most at risk in the whole feature
- [ ] T004 [P] Audit the existing suites this feature will touch and record the list in this file — `apps/web/e2e/appearance.spec.ts` (its override test becomes a real feature test), `apps/web/e2e/layout-stability.spec.ts` (asserts equal widths for a **two**-member option group that becomes three), `packages/core/tests/preferences.test.ts`, `packages/core/tests/port-contracts.test.ts`, `apps/mobile/__tests__/settings.test.tsx`

**Checkpoint**: baselines recorded; the blast radius on the existing suites is known rather than discovered mid-implementation.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The type, the rule, the stored field, and the provider plumbing. Everything in every user
story reads from here.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Checks first ⚠️ Write these and observe them failing

- [ ] T005 [P] Write the resolution table test in `packages/core/tests/appearance.test.ts` covering all six combinations per [data-model §3](./data-model.md) (V39, M1–M4) — it MUST include the two M2 rows where `'light'`/`'dark'` ignore a contradicting device value, because without them the test passes for a function that always returns its second argument
- [ ] T006 [P] Extend `packages/core/tests/preferences.test.ts` for the new field (V40, V41, M5–M7) — absent, `null`, `0`, `''`, `'System'`, and `'auto'` all default to `'system'`; a bad appearance leaves `a4Hz` and `accidentalStyle` untouched and a bad `a4Hz` leaves a valid `'dark'` untouched; a pre-feature record `{ a4Hz: 432, accidentalStyle: 'flat', schemaVersion: 1 }` loads with both values intact
- [ ] T007 [P] Add the appearance round-trip check to `packages/core/testing/port-contract-tests.ts` (V41) — each of the three values survives `save` then `load` on every implementation including the doubles; compare the **whole record**, not the two old fields
- [ ] T008 [P] Write the provider test in `packages/react/tests/use-preferences.test.tsx` (V42, M9–M11) — resolved appearance with a contradicting `deviceAppearance`, `'system'` following a `deviceAppearance` change, `preferencesLoaded` false-then-true, and `initialPreferences` reporting `preferencesLoaded` true on the **first** render

### Implementation

- [ ] T009 [P] Add `Appearance` and `AppearancePreference` to `packages/core/src/types.ts` beside `AccidentalStyle`, as closed string-literal unions
- [ ] T010 Create `packages/core/src/appearance.ts` with `resolveAppearance` (M1–M4), citing FR-115 and FR-116 in the comment — depends on T009
- [ ] T011 [P] Add the `appearance` field to `StoredPreferences` in `packages/core/src/ports/preferences-store.ts`; the **port interface itself is unchanged** (contract §5)
- [ ] T012 Add `appearance: 'system'` to `DEFAULT_PREFERENCES`, an `isAppearancePreference` guard, and the independent-repair clause in `normalizePreferences` in `packages/core/src/preferences.ts` (M5–M7) — depends on T011; `PREFERENCES_SCHEMA_VERSION` stays at `1` per research **D6**
- [ ] T013 Add `PREFERENCES_STORAGE_KEY = 'chromatic-tuner:preferences'` to `packages/core/src/preferences.ts` and export it, plus the new types and `resolveAppearance`, from `packages/core/src/index.ts` (M8, research **D4**)
- [ ] T014 [P] Replace the private `KEY` constant in `apps/web/src/adapters/local-storage-preferences.ts` with the core import — depends on T013
- [ ] T015 [P] Replace the private `KEY` constant in `apps/mobile/src/adapters/async-storage-preferences.ts` with the core import — depends on T013
- [ ] T016 Add `appearance`, `appearancePreference`, `setAppearancePreference`, and `preferencesLoaded` to `PreferencesContextValue` in `packages/react/src/TunerContext.ts` (M9, M10)
- [ ] T017 Add the `deviceAppearance` and `initialPreferences` props to `packages/react/src/TunerProvider.tsx`, resolve the appearance once per render, and track `preferencesLoaded` (M9–M11) — `deviceAppearance` defaults to `'light'`; `initialPreferences` seeds state synchronously and skips the async load
- [ ] T018 Surface the additions through `packages/react/src/usePreferences.ts` and its doc comment — depends on T016, T017

**Checkpoint**: `pnpm test` and `pnpm test:coverage` green with the new logic fully covered. The rule and the storage exist; nothing renders differently yet.

---

## Phase 3: User Story 1 - A guitarist darkens the tuner without leaving it (Priority: P1) 🎯 MVP

**Goal**: The control exists on both platforms and changing it repaints the whole app immediately, with
the microphone undisturbed.

**Independent Test**: Set the device to light, open the app, choose Dark, and confirm every surface —
tuner, settings, status messaging — is dark, with the device's own setting unchanged. Persistence is
*not* part of this story.

### Checks for User Story 1 ⚠️ Write these first and observe them failing

- [ ] T019 [P] [US1] Extend `apps/web/e2e/appearance.spec.ts`: with the device emulated **light**, choose Dark in the settings sheet and assert the computed background of `main` is the dark token — and the reverse, device dark → choose Light (FR-118, US1 AS2/AS3)
- [ ] T020 [P] [US1] Add to `apps/web/e2e/appearance.spec.ts`: changing appearance while a note is being read does not interrupt the readout or re-request microphone permission (US1 AS4, FR-118)
- [ ] T021 [P] [US1] Extend `apps/mobile/__tests__/settings.test.tsx`: the appearance group renders three options, the current one is reported selected, and choosing one updates the rendered colours (FR-118, FR-124)
- [ ] T022 [P] [US1] Update `apps/web/e2e/layout-stability.spec.ts` for a **three**-member option group — choosing an option must not resize the row under the finger that chose it (research **D8**)

### Implementation for User Story 1

- [ ] T023 [P] [US1] Create `apps/web/src/useDeviceAppearance.ts` — `useSyncExternalStore` over `matchMedia('(prefers-color-scheme: dark)')`, returning `Appearance`
- [ ] T024 [US1] Pass `deviceAppearance` into `TunerProvider` in `apps/web/src/main.tsx`, and add the effect that writes `data-theme` on `<html>` from the resolved appearance — **gated on `preferencesLoaded` (M10)**; writing before it is true reintroduces the flash Phase 4 exists to prevent
- [ ] T025 [US1] Add the three-option appearance group to `apps/web/src/components/organisms/SettingsSheet.tsx`, reusing the Accidentals group's exact treatment — `selected` tint fill, bold label, 1px border, `a11y.minTouchTarget`, equal widths, `role="group"` + `aria-pressed`, `data-testid="appearance-{value}"` (research **D8**, FR-125–FR-127)
- [ ] T026 [P] [US1] Rewrite `useAppearance()` in `apps/mobile/src/theme.ts` to read the resolved appearance from context instead of calling `useColorScheme()` directly (M9) — the old implementation is **replaced, not left beside its successor** (Principle I)
- [ ] T027 [US1] Pass `useColorScheme()` into `TunerProvider` as `deviceAppearance` in `apps/mobile/src/App.tsx` — depends on T026
- [ ] T028 [US1] Add the three-option appearance group to `apps/mobile/src/components/screens/SettingsScreen.tsx`, mirroring the web group exactly — same labels, same order, same default, `accessibilityRole="radio"`, `accessibilityState={{ selected }}`, `testID="appearance-{value}"` (FR-124)
- [ ] T029 [US1] Diff the option labels and order between `apps/web/src/components/organisms/SettingsSheet.tsx` and `apps/mobile/src/components/screens/SettingsScreen.tsx` and confirm they are the plain-language set from research **D8** — "Match device", "Light", "Dark"; not "System", not "Auto" (FR-124, Principle IV)
- [ ] T030 [US1] Verify no literal colour was introduced in `apps/web/src/components/organisms/SettingsSheet.tsx` or `apps/mobile/src/components/screens/SettingsScreen.tsx` — `pnpm lint` enforces this on `apps/**`, but confirm the new group reads every colour through tokens (FR-129)

**Checkpoint**: the control works on both platforms and changes the appearance instantly. Closing the app still loses the choice — that is Phase 4.

---

## Phase 4: User Story 2 - The choice survives closing the app (Priority: P1)

**Goal**: The chosen appearance is persisted and is in effect **on the first frame** of the next launch,
with no flash of the other appearance.

**Independent Test**: Choose an appearance, fully terminate the app, reopen, and confirm the chosen
appearance is in effect from the first frame drawn.

**This phase contains the feature's only hard problem.** See plan §Summary: the preference load is
asynchronous on both platforms, so each needs a synchronous route to first paint.

### Checks for User Story 2 ⚠️ Write these first and observe them failing

- [ ] T031 [P] [US2] Add the pre-React assertion to `apps/web/e2e/appearance.spec.ts` (V43, M12) — seed `localStorage` with `appearance: 'dark'`, emulate the device as **light**, navigate with `waitUntil: 'commit'`, and read `document.documentElement.dataset.theme` immediately. **This is the check the naive implementation fails**: at this point the app bundle has not executed, so a pass proves the inline script did it and not React
- [ ] T032 [P] [US2] Add the painted-and-still-correct assertion to `apps/web/e2e/appearance.spec.ts` (V43) — read the computed background of `main` both immediately and again after `waitForNote`, so a late React write that reverts the attribute is caught
- [ ] T033 [P] [US2] Add the `'system'` case to `apps/web/e2e/appearance.spec.ts` (V43, M12) — with `appearance: 'system'` stored, `data-theme` must be **absent**, leaving the media query in charge so a later OS change is followed with no JavaScript
- [ ] T034 [P] [US2] Add the fail-safe cases to `apps/web/e2e/appearance.spec.ts` (V44, M12) — `localStorage` holding `'not json'`, then `{"appearance":"chartreuse"}`, then nothing: the page loads, no console error, and the emulated media query decides
- [ ] T035 [P] [US2] Add the first-frame test to `apps/mobile/__tests__/settings.test.tsx` or a new `apps/mobile/__tests__/first-frame.test.tsx` (V45, M11) — `App` with `initialPreferences` of `'dark'` and `useColorScheme()` mocked to `'light'` renders dark on its **initial** commit, asserted before any `act()` flush

### Implementation for User Story 2

- [ ] T036 [US2] Emit the no-flash inline script from `siteIdentity()` in `apps/web/vite.config.ts` into `<head>` of `apps/web/index.html` (M12, research **D3**) — synchronous and blocking, not deferred and not a module; imports `PREFERENCES_STORAGE_KEY` from `@chromatic-tuner/core` (T013); wrapped in `try/catch` that does nothing on failure; sets **no attribute at all** when the preference is `'system'`
- [ ] T037 [US2] Confirm the generated script survives the production build and the service worker — run `pnpm build` and inspect `dist/index.html`, then `pnpm --filter @chromatic-tuner/web preview` and re-run T031's assertion against the built output, not just the dev server
- [ ] T038 [US2] **Break it and watch the gate fail**: temporarily make the inline script a `defer`red script, confirm T031 fails, and record the failure output in this file — a gate never observed failing is not known to work (SC-048)
- [ ] T039 [US2] Make `apps/mobile/index.js` async: load and normalise preferences via `loadPreferences` before calling `registerRootComponent` (M12, research **D5**) — the native launch screen stays up until the first RN view renders
- [ ] T040 [US2] Accept and forward `initialPreferences` to `TunerProvider` in `apps/mobile/src/App.tsx` — depends on T039
- [ ] T041 [US2] Confirm the web app needs no `initialPreferences` and record why in this file — D3 owns the paint there, and adding it would be a second mechanism for a problem already solved (Principle II)

**Checkpoint**: choose Dark, force-quit, reopen — dark from the first frame, on both platforms. V46 is runnable by hand.

---

## Phase 5: User Story 3 - The choice can be handed back to the device (Priority: P2)

**Goal**: "Match device" is a real, persistent state that tracks the OS live — and an explicit choice
provably does not.

**Independent Test**: Choose a fixed appearance, select Match device, then change the OS appearance and
confirm the app follows without being reopened.

### Checks for User Story 3 ⚠️ Write these first and observe them failing

- [ ] T042 [P] [US3] Add the live-follow test to `apps/web/e2e/appearance.spec.ts` (V47, FR-115) — with `'system'` stored, call `page.emulateMedia({ colorScheme })` **after** load and assert the background changes with no reload
- [ ] T043 [P] [US3] Add the does-**not**-follow test to `apps/web/e2e/appearance.spec.ts` (V47, FR-116) — with `'dark'` stored, change the emulated media both ways and assert the background never moves. Without this, T042 passes for an app that ignores the stored preference entirely
- [ ] T044 [P] [US3] Add the mobile equivalents to `apps/mobile/__tests__/` (FR-115, FR-116) — re-rendering with a changed `useColorScheme()` value moves the appearance under `'system'` and does not move it under `'dark'`

### Implementation for User Story 3

- [ ] T045 [US3] Confirm `apps/web/src/useDeviceAppearance.ts` (T023) actually subscribes rather than sampling once — a `matchMedia` read taken at mount satisfies every test in Phase 3 and fails T042
- [ ] T046 [US3] **Break it and watch the gate fail**: temporarily make `useDeviceAppearance` sample once at mount instead of subscribing, confirm T042 fails while Phase 3's tests still pass, and record that in this file — it demonstrates exactly what US3 adds over US1 (SC-051)
- [ ] T047 [US3] Verify the mobile background-return path by hand — background the app, change the OS appearance, foreground it, and confirm it is already correct with no visible correction (V47, spec Edge Cases)
- [ ] T048 [US3] Confirm `userInterfaceStyle: 'automatic'` is unchanged in `apps/mobile/app.config.ts` and record the accepted launch-screen seam from research **D9** in this file (FR-120 governs frames the app renders)

**Checkpoint**: all three options behave correctly and independently. The feature is functionally complete.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: The obligations that apply to the whole feature — accessibility, contrast, measurement, and
the gates FR-130 requires to stay green.

- [ ] T049 [P] Run the axe gate with the new group present — `pnpm --filter @chromatic-tuner/web exec playwright test e2e/a11y.spec.ts` (V48, FR-125)
- [ ] T050 [P] Keyboard-only pass on the web group (V48) — focus visible on every option, and confirm the *unchosen focused* option never reads as chosen, which is the defect `500dfb5` fixed for the accidentals group and this one inherits by reuse
- [ ] T051 [P] Screen-reader pass — VoiceOver on iOS and VoiceOver or NVDA on web (V48, SC-053, FR-125): the group is announced with its label, each option's selected state is announced, and a change is announced
- [ ] T052 [P] Greyscale and contrast pass (V48, FR-126, FR-127, SC-052) — the selected option is identifiable without hue, and every option in both states in both appearances meets WCAG 2.1 AA
- [ ] T053 [P] Verify the 44×44 minimum touch target on all three options on both platforms (FR-125)
- [ ] T054 Simulate a failed write on both platforms (V48, FR-123, SC-054) — private browsing on web, a mocked rejecting store on mobile — and confirm the appearance still changes and the existing `persistence-warning` surface says it will not be remembered. **No new warning surface**
- [ ] T055 Record before/after cold-start numbers for **both** platforms in this file against the T002/T003 baselines (SC-049) — the mobile figure is the one at risk from T039; a regression over 10% blocks merge per the constitution
- [ ] T056 [P] Record frame-time numbers for an appearance switch while a note is ringing, on both platforms, in this file (SC-050)
- [ ] T057 [P] Capture light and dark screenshots of the settings sheet and the tuner on both platforms and attach them to the PR — required by the constitution for any UI change
- [ ] T058 Update `CLAUDE.md` — the preferences record now carries three fields, `PREFERENCES_STORAGE_KEY` has one definition in `packages/core`, and the no-flash mechanism on each platform is exactly the kind of non-obvious constraint that file exists to carry
- [ ] T059 Run every gate and record the counts in this file (FR-130) — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e && pnpm build && pnpm verify:listing`, plus `pnpm --filter @chromatic-tuner/mobile test`
- [ ] T060 Walk [quickstart.md](./quickstart.md) V39–V48 end to end and record the outcome of each in this file, including the manual ones

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: no dependencies — start immediately
- **Phase 2 (Foundational)**: depends on Phase 1 — **BLOCKS every user story**
- **Phase 3 (US1)**: depends on Phase 2
- **Phase 4 (US2)**: depends on Phase 3 — the control must exist before "what it remembers" is testable
- **Phase 5 (US3)**: depends on Phase 3; independent of Phase 4
- **Phase 6 (Polish)**: depends on Phases 3–5

### User Story Dependencies

Unusually for this template, the stories are **not** fully independent, and pretending otherwise would
produce a dishonest plan:

- **US1 (P1)** — genuinely standalone. Delivers a working control; loses the choice on close.
- **US2 (P1)** — needs US1's control to exist before there is a choice to persist. Its *own* work (the
  two synchronous first-paint routes) is entirely separable and is where the difficulty lives.
- **US3 (P2)** — needs US1's device wiring (T023, T027). Its own work is the live subscription and the
  proof that an explicit choice does **not** follow the device.

US2 and US3 do not depend on each other and can be worked in parallel by two people once US1 lands.

### Within Each Phase

- Checks are written and observed failing before the implementation they cover
- Core types before the rule that uses them; the rule before the provider; the provider before any UI
- Web and mobile implementations of the same story are independent of each other

### Parallel Opportunities

- **Phase 1**: T002, T003, T004 in parallel after T001
- **Phase 2**: all four checks (T005–T008) in parallel; then T009 and T011 in parallel; then T014 and T015 in parallel after T013
- **Phase 3**: all four checks (T019–T022) in parallel; web (T023–T025) and mobile (T026–T028) are two independent tracks
- **Phase 4**: all five checks (T031–T035) in parallel; web (T036–T038) and mobile (T039–T040) are two independent tracks
- **Phase 5**: all three checks (T042–T044) in parallel
- **Phase 6**: T049–T053 and T056–T057 in parallel

### Parallel Example: Phase 2

```text
# Four checks, four files, no shared state — write all of them, watch all of them fail:
T005  packages/core/tests/appearance.test.ts
T006  packages/core/tests/preferences.test.ts
T007  packages/core/testing/port-contract-tests.ts
T008  packages/react/tests/use-preferences.test.tsx
```

---

## Implementation Strategy

### MVP scope

**Phase 1 + Phase 2 + Phase 3 (US1)** — T001–T030. This delivers a working appearance control on both
platforms. It is a shippable increment: a guitarist can darken the tuner for the performance they are
about to give, which is the on-stage problem the spec opens with, solved for that session.

It is not the whole request. The user asked for the choice to be remembered, and that is Phase 4.

### Incremental delivery

1. **Phases 1–3** → the control works. Ship-able, demo-able, and the appearance resets on close.
2. **Phase 4** → the choice sticks, from the first frame. This completes the user's actual request.
3. **Phase 5** → "Match device" becomes a real state rather than just the default.
4. **Phase 6** → the accessibility, contrast, and measurement obligations that make it mergeable.

### Where the risk is

- **T039** (mobile async entry) is the single riskiest change: it moves work in front of the root mount
  and is measured by T055 against the T003 baseline. If it regresses cold start by more than 10%, the
  constitution blocks the merge and research **D5**'s rejected alternatives get revisited.
- **T036** (the inline script) is the second: it is generated code embedded in HTML, outside the type
  checker's reach, which is exactly why T013 gives the storage key one definition and T038 proves the
  gate around it actually fails when it should.
- **T003** is a prerequisite disguised as a setup task — the mobile baseline does not exist yet, and
  without it T055 has nothing to compare against.
