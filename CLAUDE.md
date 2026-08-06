# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A chromatic guitar tuner for web, iOS, and Android. pnpm workspace: `packages/*` (shared, platform-free) and `apps/*` (thin platform shells). Accuracy target is ±1 cent across E1–E6, verified by tests against generated reference signals.

`.specify/memory/constitution.md` is binding, not aspirational — several of its principles are enforced by lint rules and tests. Read it before proposing architectural changes. The feature spec, plan, contracts, and build log live in `specs/001-chromatic-guitar-tuner/`; `contracts/core-api.md` and `contracts/platform-ports.md` define the guarantees the code comments reference by number (S1, A5, N7, R1, …).

## Commands

```bash
pnpm install                # corepack enable first; Node 22.13+

# Dev
pnpm --filter @chromatic-tuner/web dev        # http://localhost:5173
pnpm --filter @chromatic-tuner/mobile ios     # needs a dev build; Expo Go cannot work
pnpm --filter @chromatic-tuner/mobile android

# Gates (all run in CI on every PR)
pnpm lint                   # eslint --max-warnings 0
pnpm format:check
pnpm typecheck              # tsc --noEmit in every package
pnpm test                   # vitest, packages/* only
pnpm test:coverage          # packages/core >= 90% lines / 90% functions / 85% branches
pnpm test:e2e               # regenerates WAV fixtures, then Playwright + Chromium
pnpm build                  # web bundle + generated service worker
pnpm verify:listing         # store listing — run AFTER pnpm build, it reads dist/
pnpm --filter @chromatic-tuner/mobile test    # jest-expo
```

**Node 22.13+, not 20.** `packageManager` pins pnpm 11.18, which requires it — on Node 20 pnpm itself
fails with `ERR_UNKNOWN_BUILTIN_MODULE: node:sqlite`. CI pinned Node 20 until `004`'s T050, which meant
**no job in the workflow had ever run**; every gate below was green only because someone ran it locally.
Node 22 rather than 24 is deliberate: `004`'s research D1 justifies `listing/scripts/*.mjs` being
JavaScript with JSON data by CI predating TypeScript type stripping, and Node 22 still does.

Three commands **cannot** run on CI's Ubuntu runners and are release gates rather than merge gates:

```bash
pnpm listing:assets         # icons + feature graphic; needs the Playwright Chromium
pnpm listing:screenshots    # needs macOS + Xcode for iOS, an Android SDK + emulator for Android
pnpm --filter @chromatic-tuner/mobile verify:release-bundle   # 4 Metro exports, ~26s
```

`verify:release-bundle` asserts the screenshot-capture `AudioSource` is absent from a release bundle
(contract L12.3). It reads the export's **source map**, not the shipped bytes: a release bundle is
Hermes bytecode with every identifier minified, so grepping it for `captureAudioSource` finds nothing —
and finds nothing for `RNAudioSource` either, which is definitely in it.

Single tests:

```bash
pnpm vitest run packages/core/tests/notes.test.ts     # from the repo root; path filter works across projects
pnpm vitest run --project core -t "nearestNote"       # projects are named `core`, `react`, `tokens`
pnpm --filter @chromatic-tuner/web exec playwright test e2e/a11y.spec.ts   # run `e2e:fixtures` once first
pnpm --filter @chromatic-tuner/mobile test -- settings
```

Offline/service-worker behaviour cannot run under the normal suite (the dev server never emits `sw.js`):

```bash
pnpm build && pnpm --filter @chromatic-tuner/web preview --port 4173 &
pnpm --filter @chromatic-tuner/web verify:offline
```

Thermal/battery behaviour over 30 minutes (quickstart V13) is a manual release gate on real hardware.

## Architecture

Dependencies point inward only: `tokens` ← `core` ← `react` ← `apps/*`.

- **`packages/core`** — pure TypeScript: DSP (`RingBuffer`, `PitchAnalyzer` wrapping pitchy/MPM), note math, the reading filter chain, `TunerSession`, the three ports, and preferences. Compiles against ES2022 only — no DOM lib, no Node types. Importing React/React Native or touching `window`/`document`/`navigator`/`localStorage` here is an ESLint error, not a convention.
- **`packages/tokens`** — colour, spacing, type scale, motion, a11y constants. Zero deps so both a React and a React Native bundle can consume it. A literal hex/rgb/hsl value anywhere in `apps/**` is an ESLint error.
- **`packages/react`** — `TunerProvider`, `useTuner`, `usePreferences`, screen-reader announcement text. React only; importing `react-dom` or `react-native` here is an ESLint error. This is the last shared layer — components below it are written once per platform.
- **`apps/web`** — Vite + React 19, Web Audio + AudioWorklet, `localStorage`, Screen Wake Lock, a build-time-generated service worker. Two pages: the tuner, and `privacy.html`, which is plain markup because a store reviewer must be able to read a policy without running a script.
- **`apps/mobile`** — Expo + React Native, `react-native-audio-api`, AsyncStorage, `expo-keep-awake`.

Both apps mirror the same component structure (atoms → molecules → organisms → screens/pages) and the same gate/lifecycle hooks, so a change to one usually needs the equivalent change to the other.

`listing/` is outside that graph and depends on nothing: the store copy, the per-store field limits, the
forbidden vocabulary, the generated store artefacts, and the scripts that check them (`004`).

**`apps/mobile/app.json` no longer exists.** `app.config.ts` replaced it and _derives_ the app's
identity from `listing/store-listing.json` — the name, the bundle identifier, the Android package, and
both iOS microphone purpose strings, which used to be two hand-maintained copies of one sentence inside
`app.json` alone. The marketing version comes from `apps/mobile/package.json`, and one `BUILD_NUMBER`
constant feeds `ios.buildNumber` and `android.versionCode`. Adding a fact about the app to a store
listing means adding it there, not here. `listing/submission.md` says what is authored and what derives.

### The two output channels

This is the core performance design (`research.md` D6) and the easiest thing to break:

- `TunerSession.onStatusChange` is **discrete** — permission state, note change, tuning-state change. It drives React re-renders and is deliberately suppressed when nothing meaningful changed.
- `TunerSession.onReading` is **continuous**, ~43 Hz. Consumers must write to the DOM / a Reanimated shared value directly. Calling `setState` from a cents subscription re-renders at 43 Hz and breaks the 60 fps budget.

`PitchAnalyzer` reuses one `PitchReading` object and preallocates every buffer; the steady-state audio path allocates nothing (asserted by `packages/core/tests/allocation.test.ts`). Anything that retains a reading must copy it — the session does exactly that when publishing a discrete change.

Note also that percentage `translateX` resolves against the transformed element's own width: the marker transform goes on the full-width track, never on the marker. This shipped wrong for seven phases; `apps/web/e2e/helpers.ts:markerOffsetPx` measures real bounding boxes to keep it honest.

### Appearance, and the two no-flash routes

The stored record carries **three** preferences since `005` — `a4Hz`, `accidentalStyle`, `appearance` —
in one JSON blob under one key. `PREFERENCES_STORAGE_KEY` has exactly one definition, in
`packages/core/src/preferences-key.ts`; a repository search for the literal must return only that file
and the one test that pins it. It lives in a module of its own because `apps/web/vite.config.ts` imports
it, and that file is loaded by Node outside the app's module graph — it can only import a source module
that imports nothing itself, the same constraint that already forced `packages/tokens/src/colors.ts`.

`resolveAppearance(preference, deviceAppearance)` is the whole rule and lives in the core. Components
never call it and never consult the platform appearance: `TunerProvider` resolves once per render and
publishes `appearance` (what to render, `'light' | 'dark'`) alongside `appearancePreference` (what the
user chose, `'system'` included). Those two are **not** interchangeable — `'system'` is a stored choice,
not a snapshot of what it resolved to, or "Match device" would freeze the first time the OS changed.

**The appearance must be right on the first painted frame (FR-120), and each platform gets its own
synchronous route there:**

- **Web** — a blocking inline `<script>` in `<head>`, generated by `siteIdentity()` in `vite.config.ts`
  and injected into _both_ documents. It sets `data-theme` for an explicit choice and **nothing at all**
  for `'system'`, which is what leaves the `prefers-color-scheme` media query in charge so an OS change
  is followed with no JavaScript. `defer` on an inline script is a no-op; the attribute that would break
  this is `type="module"`. React must not fight it: the `data-theme` effect in `main.tsx` is gated on
  `preferencesLoaded`.
- **Mobile** — `index.js` awaits `loadPreferences` _before_ `registerRootComponent`, so the native
  launch screen stays up until the first React frame is already correct. Async registration works; the
  launch screen itself follows the OS via `userInterfaceStyle: 'automatic'` and cannot read
  AsyncStorage, which is an accepted seam (research D9).

`color-scheme` is pinned alongside `data-theme` in the generated CSS. Without it the **browser's own**
widgets — most visibly the settings sheet's `<input type="range">` — keep following the OS after the
user has overridden it.

**Elevation in dark is lightness, not shadow.** A raised surface uses the `surface` token, which is
identical to `background` in light — the scrim already separates the settings sheet there by ΔL\* 41 —
and lighter than it in dark, where a scrim has nothing to darken towards and a black shadow on a
near-black screen is invisible. The sheet also draws a `line` edge, so the separation survives greyscale.
Judge dark surfaces by perceptual lightness, not contrast ratio: the `+0.05` in the WCAG formula
dominates near black, so a clearly visible step reads as ~1.3:1 and an invisible one as ~1.04:1.

`color.background` is embedded in the generated app icons, so changing it makes `pnpm verify:listing`
fail on artwork drift. `pnpm listing:assets` regenerates them.

On the web, nothing currently reads the resolved `appearance` in JavaScript: every colour arrives as
`var(--ct-*)`, and following the device is the stylesheet's job. `useDeviceAppearance` exists to keep the
published context value truthful, not because a component consumes it.

`apps/mobile/scripts/measure-cold-start.sh` measures launch-to-first-React-frame from a screen recording
(the unified log has no marker for it). It is sensitive to machine load — stop dev servers before
trusting a number.

### Ports and their contract suite

Every platform difference lives behind `AudioSource`, `PreferencesStore`, or `WakeLock` (`packages/core/src/ports/`). `packages/core/testing/port-contract-tests.ts` is a runner-agnostic suite of plain async functions (it imports no test framework, because web adapters run under Vitest and mobile adapters under Jest) that every implementation — including the test doubles — is checked against. Adding behaviour to a port means adding a contract check, not just an adapter test.

Some obligations that are easy to violate: `onFrames` buffers are valid only for the callback's duration; the actual sample rate comes back from `start()` and may differ from the one requested; `stop()` must release the OS handle so the recording indicator clears; `AudioSource` failures reject with a typed `AudioSourceError` that maps 1:1 onto a `TunerStatus` the UI can act on.

## Working in this repo

- **Test-first is constitutional** (Principle III): tests exist and are observed failing before the implementation. Skipping or deleting a failing test to unblock a merge is prohibited; every bug fix adds a regression test that fails on the unfixed code.
- Changes to the DSP path or render loop need before/after latency and frame-time numbers; UI changes need light and dark screenshots.
- **An `opacity` multiplier defeats a correct colour token, and almost nothing can see it.** `packages/tokens/tests/contrast.test.ts` checks the **palette**, so it cannot see dimming applied at a call site; Axe measures the composite but its `color-contrast` rule covers **text only**, so a dimmed graphic passes both. This has now bitten twice — `001` shipped the FLAT/SHARP labels at `0.55` (3.9:1, caught by Axe because they are text), and the tuning rule and its tick marks shipped at `0.6`/`0.5`, compositing to 2.1:1 and 1.85:1 against a 3:1 floor, caught by nobody until someone said the lines looked faint. Prefer a token at full strength; if something must be quieter, give it its own token and assert the **composited** result, as `a11y.spec.ts` now does for the ruler.
- **Icons are text glyphs** — `⚙︎` on the reference badge, `▾` for the scroll cue, `−`/`+` on the reference stepper. There is no SVG library on mobile and `react-native-svg` is not a dependency, so a glyph is what lets both platforms draw the same mark character-for-character (FR-018). Always append **`U+FE0E`**, the text presentation selector: without it iOS renders several of these as colour emoji, which puts a hue into a design that is otherwise entirely token-driven. Verify by screenshot on both platforms — the selector is exactly the thing a renderer may ignore.
- **The settings sheet's modality is hand-written, and three things about that are counter-intuitive** (`006`). A modal `<dialog>` + `showModal()` was measured and rejected: it does **not** wrap `Tab` — focus lands on `<body>` past the last control, and Chromium and WebKit disagree about `Shift+Tab` — and it does **not** stop the document scrolling behind it, in either engine. The platform's dialog does less than its reputation, so `SettingsSheet.tsx` owns `Tab` and the scroll lock itself. `touch-action: none` must never go on the backdrop to stop a rubber-band: `touch-action` **inherits**, and the backdrop is the sheet's parent, so it would cancel the drag gesture on the reference pitch `<input type="range">` on every phone — `overscroll-behavior` on the document element is the property that does the job. And the scrollbar gutter is **0 on macOS** (overlay scrollbars) and non-zero on CI's Ubuntu runners, so any assertion phrased as a before/after width comparison passes locally on an implementation with no compensation at all and fails only in CI; assert the arithmetic instead.
- Comments here explain _why_, usually citing a constitution principle, an FR number, a contract guarantee, or a real defect. Match that — don't add narration of what the code plainly does.
- The spec's "explicitly out of scope" list (tuning presets, string targets, custom tunings, reference tones, accounts, sync) is binding. If a task seems to need one, the task is wrong. It is also machine-readable in `listing/out-of-scope-claims.json`, read by both `pnpm verify:listing` and `apps/web/e2e/metadata.spec.ts`, and it forbids the vocabulary **including inside a negation** — "no accounts needed" names the capability it denies, to a shopper and to a store's indexer alike.
- Feature work runs through the spec-kit skills (`/speckit-specify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-implement`); `specs/001-chromatic-guitar-tuner/tasks.md` doubles as the build log, including defects and deviations.
- `pnpm-workspace.yaml` sets `nodeLinker: hoisted` because Metro cannot resolve pnpm's symlinked store — don't remove it. It must live there, not in `.npmrc`: pnpm reads core settings only from `pnpm-workspace.yaml`, so the setting did nothing for as long as it sat in `.npmrc` (which is now deleted).
- iOS targets **16.4+**, not 15 — `expo-modules-core`'s podspec declares that floor, and below it Expo autolinking silently skips every Expo module.
