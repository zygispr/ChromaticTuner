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

- [X] T001 Confirm all gates pass on a clean checkout and record the counts in this file — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e && pnpm build && pnpm verify:listing`, plus `pnpm --filter @chromatic-tuner/mobile test`
- [X] T002 [P] Record the web cold-start baseline from the existing measurement in `apps/web/e2e/performance.spec.ts` (added by `003` T002) into this file — SC-049 needs before/after against the 2 s budget
- [X] T003 [P] Establish and record a mobile cold-start baseline (launch to first rendered frame) for `apps/mobile` in this file — **no such measurement exists today**, and research **D5** puts an AsyncStorage read in front of the root mount, making this the number most at risk in the whole feature
- [X] T004 [P] Audit the existing suites this feature will touch and record the list in this file — `apps/web/e2e/appearance.spec.ts` (its override test becomes a real feature test), `apps/web/e2e/layout-stability.spec.ts` (asserts equal widths for a **two**-member option group that becomes three), `packages/core/tests/preferences.test.ts`, `packages/core/tests/port-contracts.test.ts`, `apps/mobile/__tests__/settings.test.tsx`

**Checkpoint**: baselines recorded; the blast radius on the existing suites is known rather than discovered mid-implementation.

---

## Phase 1 build log (2026-08-06)

### T001 — gates on a clean checkout

Clean tree at `881aed1`. Node **v24.14.0** locally; `.github/workflows` pins **22** (three jobs).

| Gate | Result |
| --- | --- |
| `pnpm lint` | green, 0 warnings |
| `pnpm format:check` | green |
| `pnpm typecheck` | green — 5 projects |
| `pnpm test` | green — **19 files, 437 tests** |
| `pnpm test:coverage` | green — stmts 98.5%, branches 94.81%, funcs 97.29%, **lines 100%** |
| `pnpm test:e2e` | green — **115 passed** (42.7 s) |
| `pnpm build` | green — `index.html` 7.55 kB, `assets/index-*.js` 235.83 kB (gzip 75.06) |
| `pnpm verify:listing` | **RED — pre-existing**, see below |
| `pnpm --filter @chromatic-tuner/mobile test` | green — **11 suites, 81 tests** |

**`verify:listing` is red before this feature touches anything**, and is recorded as the starting state
rather than treated as a regression:

```
assets: 2 problems
  listing/assets/screenshots/android/light/ does not exist
  listing/assets/screenshots/android/dark/ does not exist
appearances: 1 problem
  android is missing a light screenshot
```

`004` captured iOS only (`be9c6da`, "iOS screenshots from the real app"); `git ls-files` tracks exactly
two screenshots, both iOS. Android capture needs an Android SDK + emulator and is a **release** gate,
not a merge gate (CLAUDE.md), so this cannot go green on CI either. FR-130 requires the gates this
feature can affect to stay green; this one is unaffected by `005` — `listing/` is outside the dependency
graph and the plan states the feature does not touch it. **T059 must compare against this baseline, not
against "all green", or it will attribute a pre-existing gap to this feature.**

### T002 — web cold-start baseline (SC-049, budget 2 s)

Five runs each of `performance.spec.ts -g "cold-start budget"`, which measures `performance.now()` from
navigation start to the observer firing on a usable tuning display.

| Build | Runs (ms) | Median |
| --- | --- | --- |
| Vite **dev** server (what `pnpm test:e2e` measures) | 106.6, 102.1, 119.0, 101.7, 103.9 | **103.9 ms** |
| **Production preview** (`dist/`, `vite preview`) | 52.9, 51.5, 52.8, 60.5, 46.2 | **52.8 ms** |

**Both numbers are recorded deliberately, and T055 must use the production one.** The suite's own
measurement runs against the dev server, but **D3's no-flash script is emitted by the build** — it does
not exist on the dev server at all. Comparing a post-feature dev number against a pre-feature dev number
would measure the one configuration in which the riskiest web change is absent. Headroom against the 2 s
budget is ~38× either way, so the risk to SC-049 on web is negligible; the reason to hold the right
baseline is that a regression should be *visible*, not that it is expected.

Method note: port 5173 was already held by a dev server, so `vite preview` bound 5174 and the production
runs used a throwaway Playwright config pointed at it (the committed config hardcodes `baseURL` 5173).
The temp config was deleted; the tree is clean.

### T003 — mobile cold-start baseline (SC-049)

**There was no measurement, so one had to be built.** `apps/mobile/scripts/measure-cold-start.sh` and
its analyser are new (see Deviation 1). Method, because the number means nothing without it:

The unified log has no first-RN-frame marker. FrontBoard's `scene content state changed: ready` fires
~370 ms after the open request, but that is the **launch storyboard**, not React — verified by streaming
`log stream` across a launch and finding React's own work (`Successfully installed JSI bindings`,
`RCTAsyncLocalStorage_V1`) landing 250–350 ms *later*. So the frame is found in a screen recording
instead: `simctl io recordVideo`, then `ffprobe`'s `signalstats` per frame. `YHIGH` separates the three
phases without ambiguity, because the storyboard is a flat fill:

| Phase | YHIGH |
| --- | --- |
| home screen | 165 |
| launch storyboard | 16 |
| first React frame (text drawn) | 26 |

Release build, from this commit, `iPhone 17 Pro Max` simulator on iOS 26.5, dark appearance, Metro
killed and the embedded Hermes bundle in use. Eight runs:

| Metric | Runs (ms) | Median |
| --- | --- | --- |
| **storyboard → first RN frame** | 208, 233, 235, 250, 258, 262, 303, 310 | **254 ms** |
| launch → first RN frame (user-perceived) | 402, 403, 428, 432, 442, 465, 482 | 432 ms |

**`storyboard → first RN frame` is the number T055 must compare against**, for two reasons. It is the
interval **D5 actually lengthens** — the preference read goes in front of the root mount, and the
storyboard is what is on screen until it returns. And it is the stable one: `simctl`'s recorder emits
frames only on change, and in one run of the eight it coalesced the entire app-open animation into a
single frame, collapsing `launch → content` onto `storyboard → content` and making that run's
user-perceived figure not comparable. That run is excluded from the second row and kept in the first.

**This is a simulator on an M-series Mac, not a device.** It is a *relative* baseline for detecting
T039's regression under an identical method — it is not evidence about SC-049's 2 s budget on real
hardware, which stays a manual release gate. A 10% regression on the storyboard figure is **~25 ms**,
comfortably above the ~17 ms frame quantisation of the measurement.

### T004 — blast radius on the existing suites

The task text names five files. The audit found **eight**, and two of the five are described
inaccurately. Both corrections matter for sequencing, so they are recorded rather than silently fixed.

**Breaks the moment `appearance` joins `StoredPreferences` (T011) — a typecheck failure, not a test
failure.** The field is `readonly` and required, so every object literal typed as `StoredPreferences`
stops compiling. There are **eight** such literals in five files:

| File | Lines |
| --- | --- |
| `packages/core/testing/port-contract-tests.ts` | 155, 166 |
| `packages/core/tests/port-contracts.test.ts` | 152, 162 |
| `packages/react/tests/use-preferences.test.tsx` | 93, 176, 247 |
| `apps/mobile/__tests__/settings.test.tsx` | 150, 163, 238 |
| `apps/mobile/__tests__/async-storage-preferences.contract.test.ts` | 38, 43 |

`packages/react/tests/use-preferences.test.tsx` and
`apps/mobile/__tests__/async-storage-preferences.contract.test.ts` are **not** in T004's list. The
second is the one that matters: line 43 asserts `JSON.parse(raw)` `toEqual` a whole three-field record,
which is exactly the "compare the whole record" shape T007 asks for — it will fail loudly with the new
field, and that failure is correct.

**Breaks on the value change (T012), as assertions rather than types:**

- `packages/core/tests/preferences.test.ts:69` "keeps valid values untouched" — `toEqual` against an
  exact three-field object. Also `:58` and `:63` compare against `DEFAULT_PREFERENCES` by reference, so
  those two keep passing for free.
- `packages/core/tests/preferences.test.ts:172` round-trip, `:203` schema-version case.

**Correction 1 — `layout-stability.spec.ts` does not assert option widths.** T004 and T022 both describe
it as "equal widths for a two-member option group". It asserts two different things:
`:117` `await expect(groups).toHaveCount(2)` with `nth(0)`/`nth(1)` named "Reference pitch" and
"Accidentals", and a **sheet height** invariant across setting changes (`:76`–`:97`). A third group
fails the count assertion and shifts nothing else. The equal-width assertion T022 has in mind is in
`appearance.spec.ts` (`borderWidth` parity between the two accidental options), not here. **T022's file
is right and its reason is wrong** — the work is updating a group count and adding the third accessible
name, plus extending the height invariant to the new group.

**Correction 2 — the storage key has a fourth occurrence.** Research **D4** counts two adapters plus
D3's generated script and applies Principle I's rule of three. `apps/web/e2e/settings.spec.ts:16` holds
a third hand-written copy today, making D3's the fourth. It does not change D4's decision — it
strengthens it — but T013/T014/T015 should sweep it too, or the extraction leaves a copy behind in the
one place that seeds `localStorage` for the tests T031–T034 depend on.

**Unchanged by this feature, confirmed by inspection**: `apps/web/e2e/a11y.spec.ts` gains coverage from
the new group automatically (it analyses the whole settings sheet, so T049 needs no new assertion to
*run* — only to be re-run), and `apps/web/e2e/appearance.spec.ts:62`'s override test stands as-is, as
the plan predicted.

### Deviations, stated rather than hidden

**1. Phase 1 added two files to the repo**, which no task asked for:
`apps/mobile/scripts/measure-cold-start.sh` and `measure-cold-start-analyse.py`. T003 says *establish*
a baseline, and a number produced by an ad-hoc command in a scratch directory cannot be re-established
by T055 under the same method — which is the only thing that makes a before/after comparison mean
anything. They are not wired into any gate, add no dependency (`ffmpeg` and `python3` are developer
tools, invoked only by this script), and run nowhere near CI, which has no simulator. Both gates that
could see them are green: `pnpm lint` and `pnpm format:check` re-run clean.

**2. The Release build in DerivedData was overwritten.** The one there was `004`'s screenshot-capture
build (Aug 5 09:44) — it contains `CaptureAudioSource`, which contract L12.3 forbids in a release
bundle, and it predates the last source commit (`cba41c8`, Aug 5 16:33), so it was stale as well as
wrong for this purpose. The replacement is a plain Release build from this commit and greps clean for
both `CaptureAudioSource` and `EXPO_PUBLIC_SCREENSHOT_CAPTURE`. **Consequence**: re-running
`pnpm listing:screenshots` for iOS now needs its capture build rebuilt first, per the command
`listing/scripts/capture-screenshots.mjs` already prints. The two committed iOS screenshots are
untouched.

**3. T001's `verify:listing` result is red and stays red.** Recorded above rather than fixed: Android
screenshot capture is a release gate needing an Android SDK and emulator, and nothing in this feature
touches `listing/`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The type, the rule, the stored field, and the provider plumbing. Everything in every user
story reads from here.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Checks first ⚠️ Write these and observe them failing

- [X] T005 [P] Write the resolution table test in `packages/core/tests/appearance.test.ts` covering all six combinations per [data-model §3](./data-model.md) (V39, M1–M4) — it MUST include the two M2 rows where `'light'`/`'dark'` ignore a contradicting device value, because without them the test passes for a function that always returns its second argument
- [X] T006 [P] Extend `packages/core/tests/preferences.test.ts` for the new field (V40, V41, M5–M7) — absent, `null`, `0`, `''`, `'System'`, and `'auto'` all default to `'system'`; a bad appearance leaves `a4Hz` and `accidentalStyle` untouched and a bad `a4Hz` leaves a valid `'dark'` untouched; a pre-feature record `{ a4Hz: 432, accidentalStyle: 'flat', schemaVersion: 1 }` loads with both values intact
- [X] T007 [P] Add the appearance round-trip check to `packages/core/testing/port-contract-tests.ts` (V41) — each of the three values survives `save` then `load` on every implementation including the doubles; compare the **whole record**, not the two old fields
- [X] T008 [P] Write the provider test in `packages/react/tests/use-preferences.test.tsx` (V42, M9–M11) — resolved appearance with a contradicting `deviceAppearance`, `'system'` following a `deviceAppearance` change, `preferencesLoaded` false-then-true, and `initialPreferences` reporting `preferencesLoaded` true on the **first** render

### Implementation

- [X] T009 [P] Add `Appearance` and `AppearancePreference` to `packages/core/src/types.ts` beside `AccidentalStyle`, as closed string-literal unions
- [X] T010 Create `packages/core/src/appearance.ts` with `resolveAppearance` (M1–M4), citing FR-115 and FR-116 in the comment — depends on T009
- [X] T011 [P] Add the `appearance` field to `StoredPreferences` in `packages/core/src/ports/preferences-store.ts`; the **port interface itself is unchanged** (contract §5)
- [X] T012 Add `appearance: 'system'` to `DEFAULT_PREFERENCES`, an `isAppearancePreference` guard, and the independent-repair clause in `normalizePreferences` in `packages/core/src/preferences.ts` (M5–M7) — depends on T011; `PREFERENCES_SCHEMA_VERSION` stays at `1` per research **D6**
- [X] T013 Add `PREFERENCES_STORAGE_KEY = 'chromatic-tuner:preferences'` to `packages/core/src/preferences.ts` and export it, plus the new types and `resolveAppearance`, from `packages/core/src/index.ts` (M8, research **D4**)
- [X] T014 [P] Replace the private `KEY` constant in `apps/web/src/adapters/local-storage-preferences.ts` with the core import — depends on T013
- [X] T015 [P] Replace the private `KEY` constant in `apps/mobile/src/adapters/async-storage-preferences.ts` with the core import — depends on T013
- [X] T016 Add `appearance`, `appearancePreference`, `setAppearancePreference`, and `preferencesLoaded` to `PreferencesContextValue` in `packages/react/src/TunerContext.ts` (M9, M10)
- [X] T017 Add the `deviceAppearance` and `initialPreferences` props to `packages/react/src/TunerProvider.tsx`, resolve the appearance once per render, and track `preferencesLoaded` (M9–M11) — `deviceAppearance` defaults to `'light'`; `initialPreferences` seeds state synchronously and skips the async load
- [X] T018 Surface the additions through `packages/react/src/usePreferences.ts` and its doc comment — depends on T016, T017

**Checkpoint**: `pnpm test` and `pnpm test:coverage` green with the new logic fully covered. The rule and the storage exist; nothing renders differently yet.

---

## Phase 2 build log (2026-08-06)

### Test-first, observed

All four checks were written and run before any implementation existed. What failed, and how:

| Check | First run |
| --- | --- |
| T005 `appearance.test.ts` | **0 tests collected** — `Cannot find module '../src/appearance'` |
| T006 `preferences.test.ts` | **8 failed** — every appearance assertion, plus the three existing whole-record `toEqual`s |
| T007 `port-contract-tests.ts` | **passed** — see the deviation below |
| T008 `use-preferences.test.tsx` | **9 failed** — the provider had no `deviceAppearance`, no `initialPreferences`, no `preferencesLoaded` |

After implementation: `pnpm test` **462 passed / 20 files** (was 437 / 19), coverage **100% lines,
98.51% stmts, 95% branches, 97.36% funcs** — all above the 90/90/85 floor. `pnpm typecheck` green across
5 projects, `pnpm --filter @chromatic-tuner/mobile test` **82 passed** (was 81), `pnpm test:e2e`
**115 passed**, `pnpm build` green, lint and format green.

### T007 passed on its first run, so it was proved a different way

Per this file's own rule, a check that passes immediately is a check that has not been shown to work.
This one is not wrong, but it **cannot** fail today: both adapters and both doubles `JSON.stringify` the
whole record, so a field they have never heard of round-trips by construction. Its value is as a guard
against a future adapter that maps fields by hand.

So it was verified the way T038 and T046 verify theirs — break it and watch the gate fail. The in-memory
double's `save` was temporarily made to drop `appearance`:

```
× P1: round-trips a saved value
× P1: every appearance value round-trips (M5, V41)
Contract violation: the whole record must round-trip, not just the fields we name
  (expected keys a4Hz,accidentalStyle,appearance,schemaVersion, got a4Hz,accidentalStyle,schemaVersion)
```

Both new checks caught it, and named the missing field. The double was restored (`git diff` clean).
This is why `assertSameRecord` compares **key sets in both directions** rather than the named fields:
the existing `assertEqual` form passes on exactly the adapter that drops everything it was not asked
about.

### M8 — verified, and it needed a wider sweep than D4 planned

A repository-wide search for the literal now returns **two hits, both in `packages/core`**:

```
packages/core/src/preferences.ts:18     export const PREFERENCES_STORAGE_KEY = '...'
packages/core/tests/preferences.test.ts:222   expect(PREFERENCES_STORAGE_KEY).toBe('...')
```

Four copies were replaced, not the two D4 counted — the extra two are the ones T004 found
(`apps/web/e2e/settings.spec.ts`, `apps/mobile/__tests__/async-storage-preferences.contract.test.ts`).

The second hit is **deliberate and is not a violation of M8's spirit**. With every consumer importing
one constant, the "two consumers disagree" bug is gone by construction — but so is any tripwire on
changing the key itself, which would compile, pass, and silently orphan the stored settings of everyone
who already has some. One pinned literal, in the package M8 permits it in, keeps that failure loud.

The mobile adapter's own round-trip test lost its literal and gained something better: it now compares
the **whole parsed record**, which is the assertion that catches a field the adapter forgets to write.

### Deviations, stated rather than hidden

**1. Six files outside the task list were edited**, all of them the blast radius T004 predicted and one
it did not. Required by the type change, not optional:
`packages/core/tests/port-contracts.test.ts` (2 literals), `apps/mobile/__tests__/settings.test.tsx`
(3), `apps/mobile/__tests__/async-storage-preferences.contract.test.ts` (2),
`apps/web/e2e/settings.spec.ts` (the key), plus `packages/react/tests/use-preferences.test.tsx` and
`packages/core/tests/preferences.test.ts`, which were T006/T008's own targets.

**2. `vitest` alone did not catch the type errors.** After the four checks and the implementation were
in, `pnpm test` was **fully green while `pnpm typecheck` had six errors** — Vitest transpiles without
type-checking, so a `StoredPreferences` literal missing the new required field runs fine. T004's central
prediction ("a typecheck failure, not a test failure") was right, and it is worth restating for the
remaining phases: **`pnpm test` passing is not evidence that Phase 3-5 compile.**

**3. `preferencesLoaded` had a case the contract does not spell out**: a provider with no
`PreferencesStore` at all (both apps' tests do this, and `TunerProvider` supports it). M10 says the flag
becomes true "when the store resolves", and with no store it would have stayed false forever — which
would mean the web effect that writes `data-theme` never runs for a provider configured without
persistence. It is set true immediately in that case. Same observable rule (it is true once there is
nothing left to wait for); worth noting because contract §3 M10 does not enumerate it.

**4. `setAppearancePreference` stores the choice, never the resolution.** Writing
`resolveAppearance(...)` into storage would satisfy every Phase 2 test and quietly break FR-119 — "Match
device" would freeze into whichever appearance the device was in at the moment it was chosen. There is a
test for it (`stores system as a choice in its own right`), because the mistake is invisible until the
OS changes.

---

## Phase 3: User Story 1 - A guitarist darkens the tuner without leaving it (Priority: P1) 🎯 MVP

**Goal**: The control exists on both platforms and changing it repaints the whole app immediately, with
the microphone undisturbed.

**Independent Test**: Set the device to light, open the app, choose Dark, and confirm every surface —
tuner, settings, status messaging — is dark, with the device's own setting unchanged. Persistence is
*not* part of this story.

### Checks for User Story 1 ⚠️ Write these first and observe them failing

- [X] T019 [P] [US1] Extend `apps/web/e2e/appearance.spec.ts`: with the device emulated **light**, choose Dark in the settings sheet and assert the computed background of `main` is the dark token — and the reverse, device dark → choose Light (FR-118, US1 AS2/AS3)
- [X] T020 [P] [US1] Add to `apps/web/e2e/appearance.spec.ts`: changing appearance while a note is being read does not interrupt the readout or re-request microphone permission (US1 AS4, FR-118)
- [X] T021 [P] [US1] Extend `apps/mobile/__tests__/settings.test.tsx`: the appearance group renders three options, the current one is reported selected, and choosing one updates the rendered colours (FR-118, FR-124)
- [X] T022 [P] [US1] Update `apps/web/e2e/layout-stability.spec.ts` for a **three**-member option group — choosing an option must not resize the row under the finger that chose it (research **D8**)

### Implementation for User Story 1

- [X] T023 [P] [US1] Create `apps/web/src/useDeviceAppearance.ts` — `useSyncExternalStore` over `matchMedia('(prefers-color-scheme: dark)')`, returning `Appearance`
- [X] T024 [US1] Pass `deviceAppearance` into `TunerProvider` in `apps/web/src/main.tsx`, and add the effect that writes `data-theme` on `<html>` from the resolved appearance — **gated on `preferencesLoaded` (M10)**; writing before it is true reintroduces the flash Phase 4 exists to prevent
- [X] T025 [US1] Add the three-option appearance group to `apps/web/src/components/organisms/SettingsSheet.tsx`, reusing the Accidentals group's exact treatment — `selected` tint fill, bold label, 1px border, `a11y.minTouchTarget`, equal widths, `role="group"` + `aria-pressed`, `data-testid="appearance-{value}"` (research **D8**, FR-125–FR-127)
- [X] T026 [P] [US1] Rewrite `useAppearance()` in `apps/mobile/src/theme.ts` to read the resolved appearance from context instead of calling `useColorScheme()` directly (M9) — the old implementation is **replaced, not left beside its successor** (Principle I)
- [X] T027 [US1] Pass `useColorScheme()` into `TunerProvider` as `deviceAppearance` in `apps/mobile/src/App.tsx` — depends on T026
- [X] T028 [US1] Add the three-option appearance group to `apps/mobile/src/components/screens/SettingsScreen.tsx`, mirroring the web group exactly — same labels, same order, same default, `accessibilityRole="radio"`, `accessibilityState={{ selected }}`, `testID="appearance-{value}"` (FR-124)
- [X] T029 [US1] Diff the option labels and order between `apps/web/src/components/organisms/SettingsSheet.tsx` and `apps/mobile/src/components/screens/SettingsScreen.tsx` and confirm they are the plain-language set from research **D8** — "Match device", "Light", "Dark"; not "System", not "Auto" (FR-124, Principle IV)
- [X] T030 [US1] Verify no literal colour was introduced in `apps/web/src/components/organisms/SettingsSheet.tsx` or `apps/mobile/src/components/screens/SettingsScreen.tsx` — `pnpm lint` enforces this on `apps/**`, but confirm the new group reads every colour through tokens (FR-129)

**Checkpoint**: the control works on both platforms and changes the appearance instantly. Closing the app still loses the choice — that is Phase 4.

---

## Phase 3 build log (2026-08-06)

### Test-first, observed

Eleven new or changed assertions across four files, all run before any
implementation existed:

| Check | First run |
| --- | --- |
| T019 device/choice contradiction, both directions | **2 failed** — no `appearance-*` control to click |
| T019 plain-language names | **1 failed** — `toHaveText` found nothing |
| T020 reading survives the change, no second `getUserMedia` | **1 failed** |
| T021 mobile group, selection, repaint, fill | **4 failed** — `Unable to find an element with testID: appearance-system` |
| T022 group count 2→3, equal widths, sheet height | **3 failed** |

After implementation: `pnpm test:e2e` **120 passed** (was 115), mobile jest
**86 passed** (was 82), `pnpm test` 462, coverage unchanged at **100% lines /
95% branches**, typecheck green across 5 projects, lint, format and build green.

### T026 was not a one-file change — it moved the mobile app onto app state

`useAppearance()` is called by **seven** components, so rewriting it to read
context (M9) is what makes the whole mobile tree follow the choice for free. It
also means every one of those components now needs a `TunerProvider` above it,
where before they read a global and rendered bare.

**Three test files rendered them bare: 18 failures across 3 suites**, all
`usePreferences must be used inside a <TunerProvider>`. Fixed by wrapping the
isolated renders in a new `apps/mobile/__tests__/theme-harness.tsx` (one shared
`Themed` wrapper rather than three copies; `jest.config.js` matches only
`*.test.{ts,tsx}`, so a helper can live in that directory).

**This dependency is the feature working, not a cost of it.** A component that
could still resolve its own colours without the provider is a component able to
disagree with the rest of the app about which appearance is in effect — which is
FR-118's failure mode. The breakage was the type system and the tests noticing
that theming stopped being ambient.

### `ThemeSync` keys off the PREFERENCE, not the resolved appearance

The obvious reading of T024 is "write `data-theme` from the resolved
appearance". That is wrong for `'system'`, and it took reading T033 and T042
together to see why:

- `packages/tokens` emits **both** a `prefers-color-scheme` media query and a
  `[data-theme]` override block.
- Writing `data-theme="dark"` for a `'system'` user pins the override on. It
  still tracks the OS, because `useDeviceAppearance` re-renders and the effect
  rewrites the attribute — so every Phase 3 and Phase 5 test would pass.
- But T033 (Phase 4) requires the attribute to be **absent** under `'system'`,
  and M12 says the same of the inline script, precisely so the media query keeps
  control and an OS change is followed **with no JavaScript at all**.

So the effect sets the attribute for `'light'`/`'dark'` and **removes** it for
`'system'`, which is the same rule the inline script will follow in T036. Two
mechanisms, one rule — rather than two mechanisms that agree only by accident.

### Deviations, stated rather than hidden

**1. `main.tsx` gained two components and moved its port construction.** The tree
used to be built at module scope; `useDeviceAppearance` is a hook, so it needs a
component (`Root`), and the `data-theme` effect needs one inside the provider
(`ThemeSync`). The ports moved to module scope **deliberately** — constructing
them inside `Root` would give `TunerProvider` new port identities on every
device-appearance change, rebuilding the audio graph and re-requesting the
microphone. That is exactly the failure T020 asserts against, and it would have
been introduced by the same commit that added the test for it.

**2. `apps/web/e2e/press-affordance.spec.ts` needed updating**, and T004's audit
did not list it. It hard-codes the number of buttons in the sheet — `4` for Done,
Sharps, Flats, Reset — as a sentinel against a control quietly stopping being a
button. Three options makes it **7**. The loop underneath it is the part that
matters and it now covers the new controls for free: each is asserted clean at
rest and washed on hover (FR-058). Nothing about the assertion was weakened.

**3. `apps/mobile/src/theme.ts` no longer defines `Appearance`.** It had its own
`'light' | 'dark'` union, which is now the core type re-exported, so the two
cannot drift. No consumer changed — they all import the name from the same
place they always did.

**4. The mobile group uses `accessibilityRole="radio"`, the web uses
`aria-pressed`.** That asymmetry is research D8's instruction rather than an
oversight, and it matches what each platform's screen reader expects of a
mutually exclusive set. T051 is where it gets heard rather than read.

---

## Phase 4: User Story 2 - The choice survives closing the app (Priority: P1)

**Goal**: The chosen appearance is persisted and is in effect **on the first frame** of the next launch,
with no flash of the other appearance.

**Independent Test**: Choose an appearance, fully terminate the app, reopen, and confirm the chosen
appearance is in effect from the first frame drawn.

**This phase contains the feature's only hard problem.** See plan §Summary: the preference load is
asynchronous on both platforms, so each needs a synchronous route to first paint.

### Checks for User Story 2 ⚠️ Write these first and observe them failing

- [X] T031 [P] [US2] Add the pre-React assertion to `apps/web/e2e/appearance.spec.ts` (V43, M12) — seed `localStorage` with `appearance: 'dark'`, emulate the device as **light**, navigate with `waitUntil: 'commit'`, and read `document.documentElement.dataset.theme` immediately. **This is the check the naive implementation fails**: at this point the app bundle has not executed, so a pass proves the inline script did it and not React
- [X] T032 [P] [US2] Add the painted-and-still-correct assertion to `apps/web/e2e/appearance.spec.ts` (V43) — read the computed background of `main` both immediately and again after `waitForNote`, so a late React write that reverts the attribute is caught
- [X] T033 [P] [US2] Add the `'system'` case to `apps/web/e2e/appearance.spec.ts` (V43, M12) — with `appearance: 'system'` stored, `data-theme` must be **absent**, leaving the media query in charge so a later OS change is followed with no JavaScript
- [X] T034 [P] [US2] Add the fail-safe cases to `apps/web/e2e/appearance.spec.ts` (V44, M12) — `localStorage` holding `'not json'`, then `{"appearance":"chartreuse"}`, then nothing: the page loads, no console error, and the emulated media query decides
- [X] T035 [P] [US2] Add the first-frame test to `apps/mobile/__tests__/settings.test.tsx` or a new `apps/mobile/__tests__/first-frame.test.tsx` (V45, M11) — `App` with `initialPreferences` of `'dark'` and `useColorScheme()` mocked to `'light'` renders dark on its **initial** commit, asserted before any `act()` flush

### Implementation for User Story 2

- [X] T036 [US2] Emit the no-flash inline script from `siteIdentity()` in `apps/web/vite.config.ts` into `<head>` of `apps/web/index.html` (M12, research **D3**) — synchronous and blocking, not deferred and not a module; imports `PREFERENCES_STORAGE_KEY` from `@chromatic-tuner/core` (T013); wrapped in `try/catch` that does nothing on failure; sets **no attribute at all** when the preference is `'system'`
- [X] T037 [US2] Confirm the generated script survives the production build and the service worker — run `pnpm build` and inspect `dist/index.html`, then `pnpm --filter @chromatic-tuner/web preview` and re-run T031's assertion against the built output, not just the dev server
- [X] T038 [US2] **Break it and watch the gate fail**: temporarily make the inline script a `defer`red script, confirm T031 fails, and record the failure output in this file — a gate never observed failing is not known to work (SC-048)
- [X] T039 [US2] Make `apps/mobile/index.js` async: load and normalise preferences via `loadPreferences` before calling `registerRootComponent` (M12, research **D5**) — the native launch screen stays up until the first RN view renders
- [X] T040 [US2] Accept and forward `initialPreferences` to `TunerProvider` in `apps/mobile/src/App.tsx` — depends on T039
- [X] T041 [US2] Confirm the web app needs no `initialPreferences` and record why in this file — D3 owns the paint there, and adding it would be a second mechanism for a problem already solved (Principle II)

**Checkpoint**: choose Dark, force-quit, reopen — dark from the first frame, on both platforms. V46 is runnable by hand.

---

## Phase 4 build log (2026-08-06)

### Test-first, observed

| Check | First run |
| --- | --- |
| T031/T032 pre-React assertion, both directions | **2 failed** — `data-theme was not set before the app bundle executed`, received `null` |
| T033 `'system'` sets no attribute | **passed** — an absence, trivially true with no script; proved separately below |
| T034 fail-safe cases | **passed** — same category |
| T035 mobile first frame, seeded dark vs light device | **1 failed** of 2; the `'system'` half passed trivially |

After implementation: `pnpm test:e2e` **127 passed** (was 120), mobile jest **88** (was 86),
`pnpm test` 462, typecheck green across 5 projects, lint, format, build and `verify:offline` green.

### T038 — the break the task asked for is a no-op, and that is the finding

T038 says to "temporarily make the inline script a `defer`red script". Done, and **the gate stayed
green**:

```
✓ a stored dark preference is in effect before the bundle runs (V43, M12, FR-120)
✓ a stored light preference is in effect before the bundle runs (V43, M12, FR-120)
```

That is not a hole in the gate. **`defer` has no effect on an inline script** — the attribute is
defined only for scripts with a `src`, so `<script defer>foo()</script>` runs synchronously exactly as
if the attribute were absent. The naive mistake T038 names cannot actually happen.

The attribute that *does* defer an inline script is `type="module"`, which is implicitly deferred. That
is also the more plausible mistake, because it is what someone adds in order to write modern JavaScript.
Breaking it that way fails the gate properly:

```
✘ a stored dark preference is in effect before the bundle runs (V43, M12, FR-120)
✘ a stored light preference is in effect before the bundle runs (V43, M12, FR-120)
  Error: data-theme was not set before the app bundle executed
  Expected: "dark"    Received: null
```

**M12's wording should say `type="module"` rather than `defer`.** Both are listed there ("not deferred,
not a module"), so the contract is not wrong — but the one that matters is the second, and T038 named
the first.

### The absence assertions were proved too, because they passed on their first run

T033 and T034 assert that **no** attribute is set. With no script at all that is trivially true, so by
this file's own rule they had not been shown to work. Broken the other way — making the script resolve
`'system'` eagerly against `matchMedia`, which is the obvious-looking implementation M12 forbids:

```
✘ a stored system preference sets no attribute at all (V43, M12)
  Error: expect(received).toBeNull()
  Received: "dark"
```

**A stale dev server nearly hid this.** The first attempt at that check reported 7 passed, because
Playwright's `reuseExistingServer` had attached to a Vite dev server started before the edit, and
`curl`ing it showed the *original* script still being served. The result above is from the production
preview, and the whole e2e suite was afterwards re-run against a **freshly started** dev server (127
passed). Worth recording as a hazard for the remaining phases: `pnpm test:e2e` silently reuses whatever
is already on 5173.

### T039 — the risk the plan flagged did not materialise

Async `registerRootComponent` was the open question: React Native's `AppRegistry.runApplication` is
called from native after the bundle evaluates, so registering inside a `.then()` could plausibly have
produced "Application has not been registered". **It does not.** A Release build from this commit,
launched with Metro killed and the embedded Hermes bundle in use, starts normally.

Verified on the real thing rather than in Jest, which never loads `index.js`:

- Preference seeded to `'dark'` in AsyncStorage, simulator set to **light** → the app renders dark.
- Frame-by-frame from a screen recording, the transition is **a single frame**: `YAVG 232.5 → 37.4`,
  `YHIGH 235 → 29`. The white launch storyboard is followed directly by the dark app, with no
  intermediate light *app* frame. That storyboard is the accepted D9 seam — it follows the OS via
  `userInterfaceStyle: 'automatic'` and cannot read AsyncStorage.

Preliminary cold start under the T003 conditions (same simulator, dark appearance, no stored
preference), 8 runs — **T055 records this formally**, but the flagged risk is resolved:

| Metric | Baseline (T003) | After T039 | Change |
| --- | --- | --- | --- |
| storyboard → first RN frame | 254 ms | **252 ms** | −0.8% |
| launch → first RN frame | 432 ms | 424 ms | −1.9% |

Both inside measurement noise; nothing approaching the 10% that would block merge. **T055 must keep the
simulator in dark appearance with no stored preference**, or it is not comparing like with like — the
storyboard's own colour follows the device and changes which frames the analyser sees.

### T041 — the web needs no `initialPreferences`, confirmed

`grep` over source (excluding `dist/` and tests) finds it in exactly three places: the prop's definition
in `TunerProvider`, and the two mobile files that supply it. `apps/web/src/main.tsx` has none.

D3 owns first paint on the web: the inline script has already set `data-theme` before React exists, so
seeding the provider would change nothing a user can see while adding a second mechanism for a solved
problem (Principle II). The one thing the web *does* need from Phase 2 is `preferencesLoaded`, so
`ThemeSync` does not overwrite the script's work — which is a gate, not a seed.

### Deviations, stated rather than hidden

**1. `PREFERENCES_STORAGE_KEY` moved to `packages/core/src/preferences-key.ts`.** T013 put it in
`preferences.ts`, and T036 requires `vite.config.ts` to import it — but that file is loaded by Node
outside the app's module graph and can only import a source module that imports **nothing** itself.
`preferences.ts` pulls in the note math and two port types. This is the same constraint, with the same
resolution, that the config's existing comment documents for `packages/tokens/src/colors.ts`. Re-exported
from `preferences.ts`, so M8 still holds and no consumer changed.

**2. The privacy page gets the script too**, which T036 does not mention. It runs no React at all, so
without it `/privacy.html` would be the one surface that ignores an in-app choice entirely and keeps
following the device — and it is the page a store reviewer is certain to open. FR-118 says every
surface.

**3. `apps/mobile/src/App.tsx` now exports its `preferences` store**, so `index.js` reads through the
same instance the provider writes through. Two instances would also work, being stateless wrappers over
one key; one makes them provably the same consumer rather than two that happen to agree.

**4. `TunerScreen` gained `testID="tuner-screen"`.** A test affordance, not behaviour: V45 asserts on
the root surface's background at the initial commit and had no handle on it.

**5. The script does not call `matchMedia` at all**, though M12's prose says it "resolves against"
it. The two are only reconcilable one way: M12 also requires **no attribute at all** for `'system'`, and
once that holds there is nothing left for `matchMedia` to decide. Calling it would be dead code whose
only possible effect is the bug the third bullet forbids.

---

## Phase 5: User Story 3 - The choice can be handed back to the device (Priority: P2)

**Goal**: "Match device" is a real, persistent state that tracks the OS live — and an explicit choice
provably does not.

**Independent Test**: Choose a fixed appearance, select Match device, then change the OS appearance and
confirm the app follows without being reopened.

### Checks for User Story 3 ⚠️ Write these first and observe them failing

- [X] T042 [P] [US3] Add the live-follow test to `apps/web/e2e/appearance.spec.ts` (V47, FR-115) — with `'system'` stored, call `page.emulateMedia({ colorScheme })` **after** load and assert the background changes with no reload
- [X] T043 [P] [US3] Add the does-**not**-follow test to `apps/web/e2e/appearance.spec.ts` (V47, FR-116) — with `'dark'` stored, change the emulated media both ways and assert the background never moves. Without this, T042 passes for an app that ignores the stored preference entirely
- [X] T044 [P] [US3] Add the mobile equivalents to `apps/mobile/__tests__/` (FR-115, FR-116) — re-rendering with a changed `useColorScheme()` value moves the appearance under `'system'` and does not move it under `'dark'`

### Implementation for User Story 3

- [X] T045 [US3] Confirm `apps/web/src/useDeviceAppearance.ts` (T023) actually subscribes rather than sampling once — a `matchMedia` read taken at mount satisfies every test in Phase 3 and fails T042
- [X] T046 [US3] **Break it and watch the gate fail**: temporarily make `useDeviceAppearance` sample once at mount instead of subscribing, confirm T042 fails while Phase 3's tests still pass, and record that in this file — it demonstrates exactly what US3 adds over US1 (SC-051)
- [X] T047 [US3] Verify the mobile background-return path by hand — background the app, change the OS appearance, foreground it, and confirm it is already correct with no visible correction (V47, spec Edge Cases)
- [X] T048 [US3] Confirm `userInterfaceStyle: 'automatic'` is unchanged in `apps/mobile/app.config.ts` and record the accepted launch-screen seam from research **D9** in this file (FR-120 governs frames the app renders)

**Checkpoint**: all three options behave correctly and independently. The feature is functionally complete.

---

## Phase 5 build log (2026-08-06)

### Test-first, observed

| Check | First run |
| --- | --- |
| T042 live-follow under `'system'` | **passed** — see below; this is the phase's main finding |
| T043 explicit choice never follows | **passed** — same reason |
| T044 mobile follow / do-not-follow | **passed** once the harness was fixed; the behaviour landed in Phase 3 |
| `color-scheme` for UA widgets (new, not in the task list) | **3 failed** — computed `normal`, expected `dark`/`light`/`light dark` |

After: `pnpm test:e2e` **132 passed** (was 127), mobile jest **90** (was 88), `pnpm test` 462,
typecheck green across 5 projects, lint, format and build green.

### T046 — the specified break does not fail the specified gate, and the reason matters

T046 says to make `useDeviceAppearance` sample once at mount, "confirm T042 fails while Phase 3's tests
still pass". Done, and **the entire e2e suite passed — all 132 tests**.

This is not a gap in T042. It is that **on the web, nothing observes the resolved appearance at all**:

- `ThemeSync` keys off `appearancePreference` — the stored choice — not the resolved value.
- Under `'system'` no `data-theme` is written (M12), so the page follows the OS through the
  `prefers-color-scheme` media query, in CSS, with **no JavaScript involved**. That is the design, and
  T042 is really a test of the stylesheet.
- Under an explicit choice the attribute is pinned once, and the device is irrelevant by definition.
- No component in `apps/web/src` reads `appearance` from context; every colour arrives as
  `var(--ct-*)`.

So `useDeviceAppearance` currently has **no observable consumer on the web**, and FR-115's live-follow
is delivered entirely by CSS. That is the better mechanism — it survives with JavaScript disabled and
costs no frame — but it means US3 adds nothing to the web that US1 did not already have, which is the
opposite of what T046's premise assumes.

**The hook was kept rather than deleted.** The tempting reading of Principle I is that unread code is
dead code. But it is not unread: it feeds `deviceAppearance`, which is what makes
`usePreferences().appearance` *correct* on the web. Removing it would leave that value permanently
`'light'` — a silently wrong answer waiting for the first web consumer that needs the appearance in
JavaScript (a canvas, an SVG, an icon choice). A right-but-unread value is cheap; a wrong one is a trap.
**Flagged for a decision rather than settled unilaterally** — the alternative is to delete the hook and
the prop on web and accept that `appearance` is meaningless there.

The hook does subscribe (T045, confirmed by inspection): `addEventListener('change', …)` with a matching
`removeEventListener` in the teardown, via `useSyncExternalStore`. The file was restored exactly
(`git diff` clean) after the break.

### A real defect this feature introduced: `color-scheme` (not in any task)

Found while looking for something the resolved appearance could legitimately drive. `index.html`
declares `<meta name="color-scheme" content="light dark">`, telling the browser to style **its own**
widgets from the OS preference. Correct while the OS was the only opinion; wrong the moment there is an
in-app override.

The settings sheet contains a real `<input type="range">`. With Dark chosen on a light OS, everything
this app draws repainted and the slider stayed in **light UA chrome on a dark sheet** — along with
scrollbars and default form colours.

Fixed in CSS rather than JavaScript, in the same generated block as the tokens, so it lands with the
same first paint:

```css
:root                    { color-scheme: light dark; }
:root[data-theme='light']{ color-scheme: light; }
:root[data-theme='dark'] { color-scheme: dark; }
```

`:root` keeps `light dark` — the "Match device" case, where the UA is told both are available and
decides for itself. Pinning either there would be the same mistake as pinning `data-theme` for a
`'system'` user.

Worth noting the first run reported `normal`, not `light dark`: the **meta tag does not set the CSS
property**. It influences the used value, but `getComputedStyle(...).colorScheme` reads the property,
which was unset. The three assertions now cover both explicit appearances and the system case.

### T047 — the background-return path, verified on the simulator

Not by eye: the app was foregrounded again while a screen recording ran, and every frame checked.

Preference `'system'`, device **light**, app launched, then backgrounded (by foregrounding Settings),
the OS switched to **dark**, and the app brought forward again.

- On return the app is **already dark** — screenshot confirms the tuner and its explainer in the dark
  palette.
- **Zero frames** in the light-app brightness range (`YAVG > 150`) after the app reappears. The bright
  values during the transition belong to the app-switch zoom, whose `YAVG` never rises above 83 — an
  actual light app frame measures ~232.

No visible correction, which is what the spec's Edge Cases ask for.

### T048 — `userInterfaceStyle: 'automatic'` unchanged, and the seam it leaves

`apps/mobile/app.config.ts:60` still reads `userInterfaceStyle: 'automatic'`, last touched by `be9c6da`
(004) and untouched by this feature.

**The accepted seam (research D9), now observed rather than predicted.** The native launch screen
follows the OS and cannot read AsyncStorage, so for a user who chose Dark on a light device the launch
storyboard is light and the first app frame is dark. Phase 4's frame-by-frame recording shows exactly
that: `YAVG 232.5 → 37.4` in one frame. FR-120 governs the frames the **app** renders, and there is no
frame of the wrong appearance among those. Changing `userInterfaceStyle` to a fixed value would trade
this seam for a worse one — the launch screen would then contradict the OS for every user who had made
no choice at all.

### Deviations, stated rather than hidden

**1. Three assertions were added that no task asked for** — the `color-scheme` checks. They cover a real
defect this feature introduced, described above. Without them the browser's own controls keep following
the OS after the user has explicitly overridden it.

**2. T044's harness seeds through `initialPreferences` rather than pressing the control.** The first
attempt set the preference from inside a render, which is a side effect in render and fragile. Seeding
synchronously keeps the test to its one variable: what the provider does with a stored choice when the
**device** moves.

**3. Jest's `expect` takes no message argument.** The first version of T044 used Vitest's two-argument
form (`expect(x, 'why').toBe(y)`) and failed with "Expect takes at most one argument" — a real failure,
but of the test rather than the code. Worth remembering: the two runners in this repo differ here.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: The obligations that apply to the whole feature — accessibility, contrast, measurement, and
the gates FR-130 requires to stay green.

- [X] T049 [P] Run the axe gate with the new group present — `pnpm --filter @chromatic-tuner/web exec playwright test e2e/a11y.spec.ts` (V48, FR-125)
- [X] T050 [P] Keyboard-only pass on the web group (V48) — focus visible on every option, and confirm the *unchosen focused* option never reads as chosen, which is the defect `500dfb5` fixed for the accidentals group and this one inherits by reuse
- [ ] T051 [P] Screen-reader pass — VoiceOver on iOS and VoiceOver or NVDA on web (V48, SC-053, FR-125): the group is announced with its label, each option's selected state is announced, and a change is announced
- [X] T052 [P] Greyscale and contrast pass (V48, FR-126, FR-127, SC-052) — the selected option is identifiable without hue, and every option in both states in both appearances meets WCAG 2.1 AA
- [X] T053 [P] Verify the 44×44 minimum touch target on all three options on both platforms (FR-125)
- [X] T054 Simulate a failed write on both platforms (V48, FR-123, SC-054) — private browsing on web, a mocked rejecting store on mobile — and confirm the appearance still changes and the existing `persistence-warning` surface says it will not be remembered. **No new warning surface**
- [X] T055 Record before/after cold-start numbers for **both** platforms in this file against the T002/T003 baselines (SC-049) — the mobile figure is the one at risk from T039; a regression over 10% blocks merge per the constitution
- [X] T056 [P] Record frame-time numbers for an appearance switch while a note is ringing, on both platforms, in this file (SC-050)
- [ ] T057 [P] Capture light and dark screenshots of the settings sheet and the tuner on both platforms and attach them to the PR — required by the constitution for any UI change
- [X] T058 Update `CLAUDE.md` — the preferences record now carries three fields, `PREFERENCES_STORAGE_KEY` has one definition in `packages/core`, and the no-flash mechanism on each platform is exactly the kind of non-obvious constraint that file exists to carry
- [X] T059 Run every gate and record the counts in this file (FR-130) — `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e && pnpm build && pnpm verify:listing`, plus `pnpm --filter @chromatic-tuner/mobile test`
- [X] T060 Walk [quickstart.md](./quickstart.md) V39–V48 end to end and record the outcome of each in this file, including the manual ones

**Two tasks are deliberately left open — they need a human, not a longer script.** See "What is not
done" below.

---

## Phase 6 build log (2026-08-06)

### T059 — every gate, against the T001 baseline

| Gate | T001 baseline | Now |
| --- | --- | --- |
| `pnpm lint` | green | green |
| `pnpm format:check` | green | green |
| `pnpm typecheck` | green — 5 projects | green — 5 projects |
| `pnpm test` | 19 files, **437** | 20 files, **462** |
| `pnpm test:coverage` | 98.5 / 94.81 / 97.29 / **100** | 98.51 / **95** / 97.36 / **100** |
| `pnpm test:e2e` | **115** | **139** |
| `pnpm build` | green | green |
| `pnpm verify:listing` | **RED**, 3 problems | **RED, the same 3 problems** |
| `pnpm --filter @chromatic-tuner/mobile test` | 11 suites, **81** | 12 suites, **92** |

`verify:listing` fails on exactly the three problems T001 recorded — the two missing Android screenshot
directories and the missing Android light screenshot. Nothing in `005` touches `listing/`, and Android
capture is a release gate needing an SDK and an emulator. Coverage is above the 90/90/85 floor on every
axis and branches improved.

### T055 — cold start, before and after (SC-049)

**Web**, production preview, five runs each. `dist/` now carries the no-flash script, which the dev
server never had — this is the comparison T002 said to make.

| | Runs (ms) | Median |
| --- | --- | --- |
| Before (T002) | 52.9, 51.5, 52.8, 60.5, 46.2 | **52.8 ms** |
| After | 49.5, 51.7, 53.2, 51.2, 51.8 | **51.7 ms** |

−2.1%, inside noise, against a 2 s budget. The blocking script costs nothing measurable.

**Mobile**, same simulator, dark appearance, no stored preference — the T003 conditions exactly.

| | Median | Change |
| --- | --- | --- |
| Before (T003), 8 runs | **254 ms** | — |
| After, 10 runs | **258.5 ms** | **+1.8%** |

`launch → first RN frame` moved 432 → 432.5 ms. Well under the 10% that blocks merge.

**The first attempt at this measurement read 286 ms (+12.8%) and was wrong.** The mobile source is
byte-identical to the Phase 4 build that measured 252 ms — `git log 04b580e..HEAD -- apps/mobile/src
apps/mobile/index.js` is empty — so a code regression was impossible. A `vite preview` server and a dev
server were competing for the machine, and the first run of that batch showed a 997 ms launch against a
typical 430. Re-run with the servers stopped and one warm-up launch discarded, it returned to 258.5 ms.

**This is a property of the harness worth knowing**: `measure-cold-start.sh` reads real wall-clock frame
timing off a simulator and has no isolation from the rest of the machine. Anyone re-running it should
stop dev servers first and treat a single batch's median as provisional. Recorded in `CLAUDE.md` too.

### T056 — frame time across an appearance switch (SC-050)

**Web**, measured by a new committed test rather than a one-off probe, sampling real presented frames
through `requestAnimationFrame` while the appearance is flipped three times against a ringing note:

| | p50 | p95 | max |
| --- | --- | --- | --- |
| Steady tuning session (existing SC-010 gate) | 8.0 ms | 9.5 ms | 16.1 ms |
| **Across three appearance switches** | **7.9 ms** | **9.7 ms** | **16.3 ms** |

Indistinguishable. That is what D7 bought: with no transition there is nothing to animate, so the switch
is one attribute write plus a re-render of the sheet — it never touches the continuous reading path.

**Mobile is not measured automatically, and could not be.** The switch needs a tap on the settings
control, and `simctl` has no input-injection command — there is no `tap`. What is known: the mobile
switch is the same instant re-render with no animation (D7), and the jest tests confirm the repaint is a
single state change. A frame-time number on a real device stays a manual release gate, consistent with
quickstart V8's "manual, on device".

### T049, T050, T052, T053, T054 — the accessibility obligations

`pnpm --filter @chromatic-tuner/web exec playwright test e2e/a11y.spec.ts`: **19 passed** (was 14). The
sheet-wide Axe analysis covers the new group without a new assertion, as T004 predicted; five tests were
added for the two things it cannot see.

**T050 and T052 were proved by breaking the treatment.** Both passed on their first run, which by this
file's rule means nothing yet — they are regression tests for a defect `500dfb5` already fixed, inherited
by reuse. So the appearance group was temporarily regressed to the pre-`500dfb5` form (no fill, no weight
change, selection carried by border colour alone). All three failed, with the right messages:

```
✘ a focused but unchosen option never reads as the chosen one (T050, FR-126)
  Error: a focused but unchosen option is filled like the chosen one
✘ the chosen option survives greyscale in light  (T052)
✘ the chosen option survives greyscale in dark   (T052)
  Error: light is filled like the chosen option
```

`SettingsSheet.tsx` was restored (`git diff` clean).

The contrast check analyses the sheet with **each** option chosen in turn, in both appearances, because
the `selected` tint changes what a label is composited against — the state Axe would never see if only
the default selection were analysed.

**T053** needed nothing new on web: the existing "every interactive control meets the touch target
floor" test opens the sheet and measures every visible button's rendered box, so the three options were
already covered. Mobile gained an explicit assertion that each option's `minHeight` is
`a11y.minTouchTarget` (44).

**T054** is asserted on both platforms rather than simulated by hand. Web emulates private browsing by
making `Storage.prototype.setItem` throw for this key only — reading still works, so the app starts
normally and only the write fails, which is the awkward case. Mobile uses a rejecting store. On both: the
appearance applies and visibly repaints, and the **existing** `persistence-warning` surface says it will
not be remembered. No new warning surface.

### T060 — quickstart V39–V48

| Scenario | Status |
| --- | --- |
| V39 resolution table (M1–M4) | ✅ automated — `packages/core/tests/appearance.test.ts`, all six combinations |
| V40 a bad appearance costs no reference pitch | ✅ automated — independent-repair, both directions |
| V41 yesterday's record still loads (M7) | ✅ automated — pre-feature record + port round-trip on every adapter |
| V42 one appearance, one source (M9) | ✅ automated — provider tests, contradicting device |
| V43 dark before React exists (M12, FR-120) | ✅ automated — `waitUntil: 'commit'`, both directions, plus the `'system'` absence |
| V44 the script fails safe | ✅ automated — unparseable, out-of-union, absent field, nothing stored |
| V45 mobile first frame | ✅ automated (initial commit, no `act()`) **and** confirmed on the simulator frame-by-frame |
| V46 it survives being closed | ⚠️ **partly manual.** Web reload is automated (`settings.spec.ts`). Mobile force-quit → reopen confirmed on the simulator with a seeded record. **Not done: a real device, a device restart, and the offline installed-PWA case.** |
| V47 live following, and not following | ✅ automated both platforms; mobile background→OS change→foreground verified frame-by-frame (Phase 5) |
| V48 usable, legible, honest | ⚠️ **all but the screen reader.** Axe, keyboard/focus, greyscale, contrast, touch targets and failed-write are automated. **Not done: the VoiceOver/NVDA pass (T051).** |

### What is **not** done, and why it needs a person

**T051 — the screen-reader pass.** VoiceOver on iOS and VoiceOver or NVDA on web, confirming the group
is announced with its label, each option's selected state is announced, and a change is announced. This
cannot be driven from here: it needs a human listening. It matters more than usual for this control
because the two platforms use **different** semantics on purpose — `aria-pressed` on web,
`accessibilityRole="radio"` on mobile (research D8) — so the announcements are the only place that
asymmetry is checked against real assistive technology rather than against markup.

**T057 — mobile settings-sheet screenshots.** Captured and available:

```
web-tuner-light.png            web-settings-light.png
web-tuner-dark.png             web-settings-dark.png
web-settings-dark-chosen-on-light-device.png
mobile-tuner-dark-chosen-on-light-device.png
mobile-tuner-light-chosen-on-dark-device.png
```

The two mobile shots deliberately contradict the device, so they show the choice winning rather than the
OS. **Missing: the mobile settings sheet itself**, in both appearances — reaching it needs a tap, and
`simctl` has no input injection. A human with the simulator open can capture both in under a minute.

### Deviations, stated rather than hidden

**1. Six assertions were added that no task asked for**, all in service of tasks that were otherwise
"do it by eye": the T050 focus-vs-selection test, four T052 greyscale/contrast tests, and the T054
failed-write test on web. Every one of them replaces a manual pass with something that fails on a future
regression.

**2. `apps/web/e2e/performance.spec.ts` gained a committed test**, where T056 only asked for numbers to
be recorded. A number in this file rots; a test holds the budget. It asserts the same p50/p95 thresholds
the steady-session gate uses.

**3. My Phase 5 edit had deleted the `## Phase 6` heading** from this file, leaving its Purpose line
attached to the end of the Phase 5 log. Restored. Noted because the build log is the deliverable here as
much as the code is.

---

## Defect — the settings sheet was invisible in dark (2026-08-06, reported after Phase 6)

**Reported**: "the dark mode is way too dark. It's barely visible that settings slideout is a slideout
in dark mode."

Both halves were true, and the second was measurable.

### What was wrong

The sheet painted itself in `background` — the *same* token as the screen behind it — and relied
entirely on the scrim for separation. That works in light and cannot work in dark:

| | page | dimmed by scrim | sheet | separation |
| --- | --- | --- | --- | --- |
| light | `#FCFCFD` L\* 99.0 | L\* 57.5 | `#FCFCFD` L\* 99.0 | **ΔL\* 41.5** |
| dark (before) | `#0B0B0F` L\* 3.1 | L\* 1.1 | `#0B0B0F` L\* 3.1 | **ΔL\* 2.0** |

A scrim *darkens*, and there was almost nothing below `#0B0B0F` to darken towards. The `box-shadow`
contributed nothing either — black on near-black. **Dark mode had no elevation signal at all.**

Contrast *ratio* is the wrong instrument here and hid the problem: the `+0.05` term in the WCAG formula
dominates when both luminances are near zero, so even a clearly visible dark step reads as ~1.3:1. The
measurements above are perceptual lightness (CIE L\*), where ~5 is a distinct surface.

### The fix

- **`background.dark` `#0B0B0F` → `#121419`** (L\* 3.1 → 6.3). The old value was darker than either
  platform's baseline — Material's dark surface is `#121212`, L\* 6.5.
- **New `surface` token**, `#FCFCFD` light / `#1F232B` dark. The sheet is now ΔL\* 11.5 above the dimmed
  tuner. Light is deliberately identical to `background`: there the scrim already gives ΔL\* 41.5, and a
  second value would be a difference with no purpose.
- **`selected.dark` `#23262E` → `#2E333D`**, because the chosen-option tint would otherwise have been a
  step *down* from the surface it tints.
- **A 1px `line` edge along the sheet's top**, on both platforms — a second channel, so the sheet keeps
  reading as a sheet under greyscale and after any future retune of these values.

Every AA constraint still holds; the lift *reduces* contrast against the background, so it was checked
before being committed to rather than after. Tightest margins: `flat` 5.91:1 against a 4.5 floor, `line`
3.81:1 against 3.0 (3.26:1 on the raised surface).

### The contrast test was measuring the wrong pair

`keeps the selected fill a tint, not an inversion` asserted `selected` against **`background`**, while
its own comment says "the surface". Those were the same colour, so it passed and meant nothing. The
options only ever appear inside the sheet, so it now measures against `surface` — and would have failed
if the tint had not been raised alongside it. Also added: `line` and every text colour against
`surface`.

### `verify:listing` caught what a human review would not have

The generated app icons embed the background colour, and the gate compares artwork against the built
token block:

```
artwork: 2 problems
  apps/web/public/icon-maskable.svg uses #0B0B0F, which is not a --ct-* token value
  apps/web/public/icon.svg uses #0B0B0F, which is not a --ct-* token value
```

`pnpm listing:assets` regenerated five artefacts. Back to `artwork: 5 scanned`, and `verify:listing` is
red on exactly the three pre-existing Android screenshot problems from the T001 baseline — nothing more.

**This is the second time in this feature that `listing/` turned out to be downstream of something the
plan said it would not touch.** Plan §Technical Context states the feature "does not touch
`packages/tokens` or `listing/`". It now touches both. That was the right call for a real defect, but
the claim in the plan is no longer true.

### Verification

`pnpm test` **474** (was 462) · `test:e2e` **139** · mobile jest **92** · coverage 100% lines / 95%
branches · typecheck, lint, format, build green.

One e2e failure during the change was a correct one: `the chosen accidental is filled, not outlined, in
dark` resolves an unchosen option's *rendered* backdrop up to the first painted ancestor, which is now
`surface`. Updated, and the assertion is unweakened.

Light and dark screenshots recaptured on web and compared: light is unchanged, dark now reads as a
raised sheet. **The mobile sheet is verified by test rather than by eye** — jest asserts
`color.surface[theme]` on the sheet in both appearances, but the simulator cannot be driven to open the
sheet (no `simctl` input injection), which is the same limitation T057 records.

---

## Change — a gear on the way into settings (2026-08-06, requested after Phase 6)

**Requested**: "the Settings button should have a gear icon at the start or end (whatever's more
conventional) to better signify that it's a settings button."

The control meant is `ReferenceBadge` — the tuner screen's only control, showing "A4 440 Hz" and opening
the settings sheet. Nothing labelled "Settings" is a button; the sheet's own "Settings" is a heading.

**The gap was real and one-sided.** The badge's accessible name has begun with `"Settings."` since
`001`, so assistive technology was already told what the control does. A sighted user saw only a
reference pitch. This closes it the other way round.

### Trailing, not leading

The label here is **data** — the pitch the tuner is using — not the button's name. So the gear follows
it, the way a disclosure indicator does, rather than leading it as it would on a `⚙ Settings` menu item.
A leading gear would also read as belonging to "A4".

### A text glyph, not an SVG

`U+2699` + `U+FE0E`, identical character-for-character on both platforms (FR-018).

`react-native-svg` **is not a dependency** and adding it for one icon is what Principle II's ~30-line
rule exists to refuse. The app already draws iconography this way — `▾` for the scroll cue, `−` and `+`
for the reference stepper — so this is house practice rather than a workaround. Using the same glyph on
both platforms also makes them identical by construction instead of by review.

`U+FE0E` is the text presentation selector and is load-bearing: without it some platforms render
`U+2699` as a **colour emoji**, which would put a hue into a design that is otherwise entirely
token-driven and greyscale-safe. Verified by screenshot rather than assumed — web renders it
monochrome, and iOS was checked too, being the platform most likely to ignore the selector.

### The gear never goes bold

The non-standard reference state is louder on two channels, the attention colour and a heavier weight
(FR-053), and **both belong to the value that changed**. The gear takes the colour — it is part of the
same control — but stays at regular weight, so it adds no third signal carrying no information. On web
that needs an explicit opt-out, because the weight is set on the button.

### Two existing assertions had to change, and the reason is worth knowing

`toHaveTextContent` under this setup is an **exact** match, not a substring one:

```
Expected instance to have text content:  A4 440 Hz
Received:                                A4 440 Hz⚙︎
```

The two pre-existing badge assertions became regexes. The new one asserts `/A4 440 Hz\s*⚙/` as a single
ordered pattern rather than two independent substrings, so a *leading* gear would fail it.

### Verification

`pnpm test:e2e` **140** (was 139) · mobile jest **93** (was 92) · typecheck, lint, format, build green.
The gear is asserted present and visible, absent from the accessible name, and trailing — on both
platforms.

---

## Defect — "Match device" was ragged on mobile (2026-08-06, reported after Phase 6)

**Reported**: the label is centred on web and left-aligned on mobile.

Correct, and the cause is a platform default rather than a mistake in either file.

The option box carries `alignItems: 'center'`, which centres the Text **element** — enough while a
label fits on one line. "Match device" does not. On a 393 pt phone the arithmetic is:

```
393  screen
-48  sheet padding (space.lg each side)
-16  two space.sm gaps between three options
---
329 / 3 = 109.7 pt per option
-16  the option's own space.sm padding
 -2  1 pt border each side
---
 91.7 pt for the label, against ~95 pt that "Match device" needs at labelSize 16
```

So it wraps — and **React Native left-aligns wrapped lines by default**, giving "Match" / "device"
ragged left. The web half never showed it because a `<button>` inherits `text-align: center` from the
UA stylesheet.

**Fixed** with `textAlign: 'center'` on `optionLabel` and `optionExample`. The example line is short
today and gets it anyway: it is the second line of the same box and must not go ragged if it ever wraps.

**Verified by eye, not only by assertion.** The mobile settings sheet cannot be opened on a simulator —
`simctl` has no input injection, which is what left T057 open — so `TunerDisplay`'s `settingsOpen` was
temporarily defaulted to `true`, a Release build installed on an iPhone 17 simulator (393 pt, matching
the reporter's iPhone 15), and the sheet photographed. The label wraps to two lines and both are centred.
The temporary change was reverted (`git diff` clean). That screenshot is also the first look anyone has
had at the mobile sheet since the surface change — it confirms the raised surface and hairline edge too.

**This is the third defect in this feature that only a human looking at the app could have found**, after
the invisible sheet and the missing gear. All three were invisible to a green test suite. Worth stating
plainly: the automated gates here are good at catching regressions and poor at catching "it looks wrong".

`expect` in Jest takes **one argument** — the first version of the new check used Vitest's two-argument
form and failed with "Expect takes at most one argument", exactly as Phase 5 recorded. It now collects
the five labels into one object and asserts that, so a failure still names which option is wrong.

Mobile jest **94** (was 93); lint, format, typecheck green.

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
