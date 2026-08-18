---

description: "Task list for 008-app-icon-coverage"
---

# Tasks: App Icon Coverage

**Feature**: `008-app-icon-coverage` · **Created**: 2026-08-18

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/app-icons.md](./contracts/app-icons.md),
[quickstart.md](./quickstart.md)

This file doubles as the build log, following `001`–`007`: record deviations, defects, and
measurements here as work lands, not just checkmarks.

## Test-first is not optional here

Principle III is NON-NEGOTIABLE, and this feature is **three bug fixes**, so the constitution's
stronger clause applies to all of them: *every bug fix MUST add a regression test that fails on the
unfixed code*. SC-078 restates it. Each of the three defects has one task that writes its gate and one
that **observes it red before the fix exists** — T017, T023 and T032. A gate for one of these defects
that has never been seen red is not known to work, and this feature exists precisely because three
gates that looked reasonable never failed on three shipped defects.

**The hazard this feature carries: an icon that is wrong renders as an icon that is plausible.** No
platform reports "I cannot use this" — it substitutes a white square, a screenshot, or a mark
composited onto white, and every one of those is a passing build, a resolving reference and a
well-formed config. Read this table before writing an assertion.

| Tempting assertion | Why it passes on a broken build |
| --- | --- |
| `expect(appleTouchIconHref).toMatch(/\.(svg\|png\|ico)$/)` | **This is the current assertion** (`metadata.spec.ts:530`), and the defect passes it. An SVG `apple-touch-icon` resolves, is well-formed, and puts a **screenshot of the page** on the home screen. The rule must be per-`rel`: `.png` only for `apple-touch-icon`, `.svg` still fine for `rel="icon"` (L14). |
| "the referenced asset resolves" | Same failure, one level down. Resolution was never the question — three features shipped with every icon reference resolving and the tile still wrong. Assert **format**, then resolution. |
| `expect(config.icon).toBeDefined()` against `app.config.ts` | Source-level only. A plugin can rewrite the config, and a check against the source agrees with the source whatever the plugins did — the same reason L12 reads the resolved output. The source test is the *second* layer, not the gate (L13). |
| "an icon exists at `ios/…/App-Icon-1024x1024@1x.png`" | **Passes on the exact defect.** Expo writes a blank white 1024×1024 there when no icon is configured (research D1), and `apps/mobile/ios/` is git-ignored generated output — anything asserted about it is erased by the next `prebuild` and proves nothing about checked-in state (FR-175). |
| "`apps/mobile/assets/icon.png` exists and is 1024×1024" | True of any 1024² PNG, including Expo's white square copied into place. What ties a file to *this product's mark* is its entry in `artwork.json` (L13 → L15), not its dimensions. |
| every digest in `artwork.json` matches (check 1 alone) | Proves the bytes are untouched, says nothing about whether they are **current**. Correctly-transcribed-then-stale artwork passes — which is the defect `004`'s D5 actually found. |
| every recorded palette value is still a `--ct-*` value (check 2 alone) | Passes on hand-drawn artwork whose recorded palette happens to be current. Checks 1 and 2 are L11's two halves; neither alone is a test of anything (L15). |
| "the manifest names a PNG" | Passes on a 48×48 PNG. Chromium wants **at least** a 192² and a 512²; assert both thresholds, read from the manifest's own `sizes` and confirmed against the file (L14, D7). |
| reusing `icon.svg`'s geometry for `apple-touch-icon.png` | Looks perfect in a file browser and wrong on a phone. `icon.svg` is generated `rounded: true`; iOS masks it **again**, cutting already-cut corners and letting the wallpaper through at four points (D6). Exactly one artefact in this product is pre-rounded, and it is not this one. |
| feeding the transparent adaptive foreground to Expo's top-level `icon` | No error, no rejection at this stage: `generateUniversalIconAsync` sets `removeTransparency: true` and `backgroundColor: '#ffffff'`, so the mark ships **composited onto white** (D4). Apple's no-alpha rule is the better-known half; this is the half that actually bites. |
| setting a top-level `icon` and omitting `android.adaptiveIcon` | Builds, installs, and gives Android a shrunken **unmasked, unlayered** tile — `withAndroidIcons.js` skips the layering system entirely when only `icon` is set. That is not FR-174. |
| `git status --porcelain` after `pnpm listing:assets` (V73) | Only catches drift **on a machine that ran the generator**, and `pnpm listing:assets` cannot run on CI's Ubuntu runners. The committed digests are the half CI can check, launching nothing. Both halves are needed. |
| `android.adaptiveIcon.backgroundColor: '#…'` | A hex literal in `apps/**` is an ESLint error here, and suppressing that rule defeats the rule that exists to stop colours being transcribed. The background is a **generated solid PNG** for that reason (D3). |

**Two things no automated gate in this feature can see**, recorded as manual obligations rather than
pretended into tests:

1. **Whether the rendered tile looks right.** Rasterising, masking and downscaling are the OS's job.
   Every clause of L13–L16 proves configuration, bytes and derivation; V79–V83 are people looking at
   real home screens, for the same reason `004`'s L10 is manual.
2. **A mobile icon regression under `jest-expo`.** It has no layout engine and no launcher.
   `app-config.test.ts` can prove the config names files that exist and nothing more.

---

## Phase 1: Setup

**Purpose**: record the three defects as observed facts before anything changes. Each is a red case a
later task must reproduce, so the evidence has to be captured while the code is still unfixed.

- [X] T001 Record the mobile defect in this file: run `pnpm --filter @chromatic-tuner/mobile exec expo config --json --type prebuild` and paste the resolved `icon`, `ios.icon` and `android.adaptiveIcon` values (expected: absent/null), then `rm -rf apps/mobile/ios && pnpm --filter @chromatic-tuner/mobile prebuild --platform ios` and record that `apps/mobile/ios/ChromaticTuner/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png` is a blank white 1024×1024
- [X] T002 [P] Record the web defect in this file: quote `apps/web/index.html:9` (`<link rel="apple-touch-icon" href="/icon.svg" />`) and the assertion at `apps/web/e2e/metadata.spec.ts:530` that accepts it
- [X] T003 [P] Record the documentation defect in this file: quote `listing/submission.md:106-107` ("it is not a console field — it is built into the app") against T001's finding that nothing references it
- [X] T004 Confirm the baseline is green before changing anything: `pnpm build && pnpm verify:listing && pnpm test:e2e` — every gate this feature extends must be observed passing on the unfixed code, or a later red result cannot be attributed to the new assertion

**Checkpoint**: reached, with one deviation recorded below (T004). The three defects are recorded, and
every gate this feature extends passes on the code that contains them.

### Phase 1 findings — the three defects, as measured on 2026-08-18

**T001 — the mobile app is configured with no icon of any kind, and Expo fills the gap.**

The resolved config, read the way L13 will read it
(`pnpm --filter @chromatic-tuner/mobile exec expo config --json --type prebuild`):

```text
icon:                   undefined
ios.icon:               undefined
android.adaptiveIcon:   undefined
android keys:           ["package","versionCode","permissions"]
ios keys:               ["supportsTablet","bundleIdentifier","buildNumber","deploymentTarget","infoPlist"]
```

Three absent keys, exactly as research D1 predicted. `rm -rf apps/mobile/ios` followed by
`expo prebuild --platform ios` then wrote
`apps/mobile/ios/ChromaticTuner/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png` —
5,856 bytes, 1024×1024, bit depth 8, **PNG colour type 6 (RGBA)**. Fully decoded rather than sampled,
because a sampled read of the *filtered* bytes is not evidence of anything:

```text
DECODED — distinct colours in all 1048576 pixels: 1
  #ffffffff 1048576 px 100.00%
```

Every one of 1,048,576 pixels is opaque white. This is Expo's `createSquareAsync` placeholder and it is
what the app ships today. Two details worth keeping:

- The placeholder carries an **alpha channel** (colour type 6). Had it ever reached App Store Connect it
  would have been rejected for that alone — so the defect's most likely discovery path was a submission
  failure months from now, not a home screen.
- The prebuild also emitted `- Updating package.json` / `Using react-native@0.86.2 instead of
  recommended react-native@0.86.0`. Pre-existing, unrelated to icons, and it reported `no changes`.

**T002 — the touch icon is a format iOS cannot use, and the gate accepts it.**

`apps/web/index.html:7-9`, unchanged:

```html
<link rel="manifest" href="/manifest.webmanifest" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/icon.svg" />
```

Both `rel`s point at the same SVG. Correct for the first, unusable for the second. The assertion that
lets it through, `apps/web/e2e/metadata.spec.ts:528-530`:

```ts
const rolesMissing = [
  ['the web manifest', /manifest\.webmanifest$/],
  ['an icon', /\.(?:svg|png|ico)$/],
  ['the preview image', /og-image\.png$/],
]
```

One pattern for every `rel`, and `.svg` is in it — so the wrong-format reference satisfies the rule
that was meant to catch a wrong reference. The manifest has the matching gap
(`apps/web/vite.config.ts:508-511`): two SVG entries, `sizes: 'any'`, and no raster at all.

Measured green on the unfixed document, which is the fact T023 will invert:

```text
✓ e2e/metadata.spec.ts:501 › every referenced asset resolves (FR-085, P7)
✓ e2e/metadata.spec.ts:591 › every icon the manifest names resolves (FR-080, FR-085)
14 passed
```

**T003 — the submission checklist asserts the opposite of T001.**

`listing/submission.md:106-107`:

> The adaptive launcher icon (`listing/assets/icon-adaptive-foreground.png`) is not a console field — it
> is built into the app.

Every reference to that file in the repository, excluding `specs/` and the git-ignored native
directories:

```text
listing/limits.json:55            — the table that measures it
listing/submission.md:106         — the sentence claiming it is built into the app
listing/scripts/generate-icons.mjs:356 — the generator that writes it
```

The generator that produces it, the table that measures it, and the sentence that describes it. Nothing
in `apps/mobile/` — no config, no build step, no copy — so the file is built into nothing. The claim is
false in the strongest available sense: not stale, never true.

**T004 — baseline, with one deviation.**

`pnpm build` clean (68 modules, 93 ms). `pnpm test:e2e` **221 passed**, including the two icon tests
quoted above. `pnpm typecheck`, `pnpm lint` and `pnpm test` are exercised by T032 and were not re-run
here.

**Deviation: `pnpm verify:listing` is red at baseline, and the task said green.** It fails on three
findings that predate this feature and are unrelated to it — the Android screenshot set, red since
`005` and recorded as such in the `007` merge commit:

```text
assets: 2 problems
  listing/assets/screenshots/android/light/ does not exist — …
  listing/assets/screenshots/android/dark/ does not exist — …
appearances: 1 problem
  android is missing a light screenshot — Principle IV requires both appearances be represented
```

Every group this feature extends is clean: `artwork: 5 scanned`, `identity: 7 derived values ok`, and
`assets` reports **no problem with its file table** — only with the screenshot directories, which are a
different code path in the same group. So the baseline requirement is met in substance: a later red
result in `assets`' file table, `artwork`, `identity`, or the new groups is attributable to this
feature's assertions. Left unfixed deliberately — capturing Android screenshots is `004`'s
`pnpm listing:screenshots` release gate, needs an emulator, and is outside this feature's boundary.
T019, T031 and T032 must expect these same three lines and must not treat their absence as success.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the generator gains its six raster targets and writes `listing/assets/artwork.json`, and
L15 checks it. Every user story consumes artefacts produced here, so nothing below can start until
this phase lands.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

**Why the generator comes before its gate here.** L15 is not a test of behaviour that can be written
against absence — its red cases are *mutations* of a record that has to exist first (a flipped byte, a
moved token, an unrecorded target). T014 performs all four and is the observed-red task for L15. The
three **defect** gates keep the strict order, in Phases 3–5.

- [X] T005 Extend `markup({ width, height, background })` in `listing/scripts/generate-icons.mjs` with two switches the raster path does not have yet: `safeZone` (scale the mark by 0.8, matching `svg()`'s existing `scale`) and `mark` (omit the mark entirely, for the solid adaptive background layer). Keep every colour a `var(--ct-*)` — the `artwork` group scans this file for colour literals and fails on one
- [X] T006 Add the six new entries to `TARGETS` in `listing/scripts/generate-icons.mjs`, per the artefact table in [data-model.md](./data-model.md): `apps/mobile/assets/icon.png` (1024², background, full, **alpha false**), `apps/mobile/assets/icon-adaptive-foreground.png` (1024², no background, **safeZone**, alpha true), `apps/mobile/assets/icon-adaptive-background.png` (1024², background, **mark false**, alpha true), `apps/web/public/apple-touch-icon.png` (180², background, full, **not rounded**, alpha false), `apps/web/public/icon-192.png` (192², background, full, alpha true), `apps/web/public/icon-512.png` (512², background, **safeZone**, alpha true). Comment the three switches that are counter-intuitive — the un-rounded touch icon (D6), the no-alpha `icon.png` (D4), the safe-zone foreground (FR-174)
- [X] T007 `mkdirSync` `apps/mobile/assets` and `apps/web/public` alongside the existing `listing/assets` call in `listing/scripts/generate-icons.mjs`, so a clean checkout generates without a missing-directory failure
- [X] T008 Write `listing/assets/artwork.json` from `listing/scripts/generate-icons.mjs`: `$note`, `generatedBy`, the `palette` object holding every `--ct-*` value `darkPalette()` resolved on this run, and an `artefacts` map keyed by repo-relative path with `{ width, height, sha256 }`. Digest the **bytes actually written** (post-`stripAlpha`), cover the SVG targets too, and exclude `artwork.json` itself — a record cannot digest itself
- [X] T009 Run `pnpm build && pnpm listing:assets` and commit the seven new files (six PNGs plus `artwork.json`) plus any regenerated existing artefact
- [X] T010 Verify the emitted bytes against the data-model table before trusting them downstream: `apps/mobile/assets/icon.png` and `apps/web/public/apple-touch-icon.png` are PNG colour type 2 (no alpha), `icon-adaptive-foreground.png` is colour type 6 with real transparency outside the mark, `icon-adaptive-background.png` matches the foreground's dimensions, and `apple-touch-icon.png` has square corners. Record the header values in this file
- [X] T011 Add four `assets.files` entries to `listing/limits.json` for the artefacts a platform imposes a hard rule on: `apps/mobile/assets/icon.png` (1024², `alpha: "forbidden"`, `requiredBy: "iOS app icon"`, note the Expo-composites-onto-white failure), `apps/mobile/assets/icon-adaptive-foreground.png` (1024², `alpha: "required"`), `apps/mobile/assets/icon-adaptive-background.png` (1024², `alpha: "allowed"`), `apps/web/public/apple-touch-icon.png` (180², `alpha: "forbidden"`, note that iOS fills transparency with solid black). The two manifest rasters carry no platform-enforced rule and are gated by L14 and L15 instead
- [X] T012 Add an `artwork-manifest` group to `listing/scripts/verify-listing.mjs` implementing L15 checks 1 and 2: every path in `artwork.json`'s `artefacts` exists and its bytes digest to the recorded `sha256`; every value in `palette` still appears in the built document's `<style data-chromatic-tuner="tokens">` block. Reuse the token-block read the existing `artwork` group already does, and fail with the `pnpm build` hint that group already gives
- [X] T013 Extend the `artwork-manifest` group with L15 checks 3 and 4: the manifest's key set equals the generator's declared target list (import or re-read `TARGETS`/`SVGS` from `generate-icons.mjs` without launching its browser — or assert against an exported list, whichever keeps the generator single-source), and every icon path in `limits.json`'s `assets.files` also appears in `artefacts`
- [X] T014 **Observe L15 red four ways**, reverting each: flip one byte in a committed PNG (check 1); change `color.background` in `packages/tokens`, rebuild and rerun without regenerating (check 2, = V74); delete one entry from `artwork.json`'s `artefacts` (check 3); add a `limits.json` entry naming a file no target produces (check 4). Record each failure message in this file — a four-part gate needs each part seen red separately

**Checkpoint**: reached. Twelve artefacts exist, are recorded and are checked; nothing consumes the six
new ones yet. `verify:listing` is green apart from Phase 1's pre-existing Android screenshot lines.

### Phase 2 findings

**What the generator emits now.** Twelve artefacts from one mark and one palette, up from six:

```text
listing/assets/icon-ios-1024.png              1024×1024  10562 B
listing/assets/icon-play-512.png               512×512    4576 B
listing/assets/icon-adaptive-foreground.png   1024×1024  11827 B
listing/assets/feature-graphic-1024x500.png   1024×500    5270 B
apps/mobile/assets/icon.png                   1024×1024  10562 B   new
apps/mobile/assets/icon-adaptive-foreground.png 1024×1024 10884 B  new
apps/mobile/assets/icon-adaptive-background.png 1024×1024  5236 B  new
apps/web/public/apple-touch-icon.png           180×180    1402 B   new
apps/web/public/icon-192.png                   192×192    1543 B   new
apps/web/public/icon-512.png                   512×512    4034 B   new
apps/web/public/icon.svg                       512×512
apps/web/public/icon-maskable.svg              512×512
listing/assets/artwork.json — 12 recorded
```

**T010 — the emitted bytes, decoded rather than assumed.** Every PNG was fully unfiltered and its
pixels counted; the switch each artefact depends on was read off the result, not off the target entry
that asked for it.

| Artefact | Colour type | Corners | Transparent | Mark extent from centre |
| --- | --- | --- | --- | --- |
| `apps/mobile/assets/icon.png` | 2 — RGB, no alpha | `#121419` | — | ±0.2900 |
| `apps/mobile/assets/icon-adaptive-foreground.png` | 6 — RGBA | `00000000` | 97.4% | ±0.2324 |
| `apps/mobile/assets/icon-adaptive-background.png` | 2 — RGB | `#121419` | — | uniform, 1 colour |
| `apps/web/public/apple-touch-icon.png` | 2 — RGB, no alpha | `#121419` | — | ±0.2889 |
| `apps/web/public/icon-192.png` | 2 — RGB | `#121419` | — | ±0.2917 |
| `apps/web/public/icon-512.png` | 2 — RGB | `#121419` | — | ±0.2324 |

Four things this confirmed that a target entry alone would not have:

- **The safe-zone switch works, and the number proves it**: 0.2324 ÷ 0.2900 = 0.8014. The two artefacts
  a mask crops are the two drawn small, and no other artefact was shrunk by accident.
- **`apple-touch-icon.png`'s corners are the background colour**, not transparent and not rounded. That
  is the D6 trap closed: a pre-rounded source would show the wallpaper at four points after iOS masks it
  a second time, and it looks correct in a file browser either way.
- **The adaptive foreground is 97.4% fully transparent** — real transparency, not an opaque field with an
  alpha channel bolted on, which is what would hide the background layer beneath it.
- **`apps/mobile/assets/icon.png` and `listing/assets/icon-ios-1024.png` have the same SHA-256**
  (`e4f10478…`). Byte-identical, so FR-172's "no second mark" is proved rather than asserted, and D2's
  accepted duplication is duplication of output in the strictest sense.

**A target's `alpha: true` does not mean the file has an alpha channel**, and anyone writing a future
gate needs to know it. The flag only means "do not run `stripAlpha`"; Chromium's PNG encoder then emits
colour type **2** anyway whenever nothing in the image is actually transparent. So
`icon-adaptive-background.png`, `icon-192.png` and `icon-512.png` are all declared `alpha: true` and all
come out without an alpha channel, while `icon-adaptive-foreground.png` — the one artefact with real
transparency — comes out type 6. Nothing here is wrong: `limits.json` asks these for `allowed`, and the
only two files with a hard requirement (`forbidden` on the two opaque icons, `required` on the
foreground) get exactly what they need. But an assertion phrased as "every `alpha: true` target has an
alpha channel" would fail on a correct build.

**Deviation, T008 — the recorded palette is six tokens, not eleven.** The first implementation recorded
the whole resolved dark block. That is the easier line of code and a worse gate: `--ct-surface` and
`--ct-scrim` appear in no icon, so moving either would fail L15 check 2 and demand a regeneration that
alters no byte. A gate that cries wolf teaches people to regenerate reflexively, which is the habit that
lets real drift through. The record now holds only what the templates drew with — the six data-model
names it — derived from `markup.toString()` and `svg.toString()` rather than from a hand-kept list, so
adding a colour to the mark records it automatically:

```json
{ "--ct-background": "#121419", "--ct-flat": "#4C93F0", "--ct-in-tune": "#34C46A",
  "--ct-line": "#6B7280", "--ct-no-reading": "#9BA2B0", "--ct-sharp": "#FFC978" }
```

**Defect found and fixed in this phase: the `artwork` gate caught this feature's own comment.** The first
draft of the `icon.png` target explained D4 by quoting Expo's `backgroundColor: '#ffffff'`. That is a
colour literal in `listing/scripts/*.mjs`, which the `artwork` group scans and fails on, and it did:

```text
artwork: 1 problem
  listing/scripts/generate-icons.mjs contains colour literals (#ffffff) — artwork colours must
  come from the built token block, not from the template (D5, D6)
```

Fixed by describing the colour instead of quoting it, in the generator and in the `limits.json` note that
had copied the same hex. The gate is right to be this blunt — a hex in a comment today is a hex in a
template tomorrow — and it is worth recording that the rule fired on the person adding icons, which is
the only kind of evidence that a gate is load-bearing rather than decorative.

**Correction to a pre-existing comment, found by T010's measurement.** `generate-icons.mjs` claimed the
mark's extreme extent was `0.22 + 0.03 = 0.25 of the width from centre`. The measured extent is **0.29**,
because `dotOffset` is 0.26 and has been for some time — the comment was arithmetic for a constant the
file no longer holds. It matters because that number is what the safe-zone judgement rests on: a circular
mask's radius is 0.3056 of the canvas, so the true margin is 0.015 rather than the 0.055 the comment
implied. Still a fit, and thin enough to justify drawing the masked raster at `safeZone` scale (0.232)
instead of relying on it. Comment corrected in place with the measurement and the reasoning.

**T014 — L15 observed red four times, each reverted.** Four checks, four distinct failures, each naming
the file or token at fault:

```text
1  flipped one byte in apps/mobile/assets/icon.png
   apps/mobile/assets/icon.png does not match its recorded digest (recorded e4f10478b6a8…,
   found 663a0aadd43f…) — it has been edited by hand, or regenerated without committing
   artwork.json alongside it

2  packages/tokens color.background dark #121419 → #101318, rebuilt, not regenerated  (= V74)
   the artwork was drawn with --ct-background: #121419, which is no longer a --ct-* token
   value — the palette moved and the artwork was not regenerated (`pnpm listing:assets`)

3  deleted the apps/web/public/icon-512.png entry from artwork.json
   generate-icons.mjs writes apps/web/public/icon-512.png, but artwork.json does not record
   it — a shipped artefact that no check can see

4  added a limits.json entry for a file no target produces
   limits.json requires listing/assets/icon-nonexistent-256.png, but artwork.json does not
   record it — either the generator does not produce it, or it is hand-authored artwork
   pretending otherwise
```

Case 2 also turned the existing `artwork` group red, which is correct and worth noting: that group
catches the drift for the two SVGs by grepping their literals, and `artwork-manifest` catches it for the
ten rasters that have no literals to grep. The two halves of L11's idea now cover the whole artefact set.

**Determinism.** After Prettier reformatted both scripts, `pnpm listing:assets` reproduced every
previously committed artefact byte-for-byte — `git status` shows the six new files and nothing modified
under `listing/assets/` or `apps/web/public/`. `pnpm lint` and `pnpm format:check` are clean.

---

## Phase 3: User Story 1 - The installed mobile app is recognisable on a home screen (Priority: P1) 🎯 MVP

**Goal**: the mobile app ships this product's mark on iOS and Android instead of Expo's blank white
placeholder, from checked-in configuration and checked-in artwork.

**Independent Test**: delete `apps/mobile/ios/` and `apps/mobile/android/`, rebuild, install, and look at
the home screen. Delivers the entire user-visible value of this feature on its own, with no web change.

### Gates for User Story 1 (write first, observe red) ⚠️

- [ ] T015 [US1] Extend `apps/mobile/__tests__/app-config.test.ts` with a source-level test asserting the config declares `icon`, `android.adaptiveIcon.foregroundImage` and `android.adaptiveIcon.backgroundImage`, and that each named path resolves to a file that exists on disk relative to `apps/mobile/`. This is the second layer, mirroring how `004` layered L12 — it cannot see what a plugin does, which is why T016 exists
- [ ] T016 [US1] Extend the `identity` group in `listing/scripts/verify-listing.mjs` with L13, read from the **resolved** config `resolvedMobileConfig()` already fetches: `icon` present, existing, 1024×1024, **no alpha channel**; `android.adaptiveIcon.foregroundImage` present, existing, 1024×1024, **with** alpha; `android.adaptiveIcon.backgroundImage` present, existing, matching the foreground's dimensions; and each of the three paths present in `artwork.json`'s `artefacts`, which is what ties them to this product's mark rather than to any 1024² PNG. Reuse the existing `readPng()` helper
- [ ] T017 [US1] **Observe T015 and T016 red on the unfixed `app.config.ts`** — run both before T018 exists, and record the failure messages here. `pnpm --filter @chromatic-tuner/mobile test -- app-config` must name the absent keys; `pnpm build && pnpm verify:listing` must fail the `identity` group naming the absent resolved `icon`. This is the defect the feature was opened against (V72), so a gate not seen red on it is not known to work

### Implementation for User Story 1

- [ ] T018 [US1] Add `icon: './assets/icon.png'` and `android.adaptiveIcon: { foregroundImage: './assets/icon-adaptive-foreground.png', backgroundImage: './assets/icon-adaptive-background.png' }` to `apps/mobile/app.config.ts`. Project-relative paths, not `../../listing/…` (research D2: Expo resolves the string against the **CWD**, not the project root). No `backgroundColor` (research D3: a hex literal in `apps/**` is a lint error, and the background layer carries the value instead)
- [ ] T019 [US1] Run `pnpm --filter @chromatic-tuner/mobile test -- app-config` and `pnpm build && pnpm verify:listing` — both green. Record the `identity` group's new label
- [ ] T020 [US1] Confirm the resolution end to end: `pnpm --filter @chromatic-tuner/mobile exec expo config --json --type prebuild` now reports all three paths, and `rm -rf apps/mobile/ios && pnpm --filter @chromatic-tuner/mobile prebuild --platform ios` writes an `App-Icon-1024x1024@1x.png` that is the mark rather than T001's white square. Record the before/after in this file (SC-077, FR-175)

**Checkpoint**: User Story 1 is complete and shippable. The mobile app has an icon, two gates prove it,
and both were seen red first. Stop here for the MVP.

---

## Phase 4: User Story 2 - Adding the web app to an iOS home screen produces the icon (Priority: P2)

**Goal**: the web app's home-screen tile on iOS is the mark rather than a screenshot of the page, and
installers that mask an icon get a raster filled to the edges.

**Independent Test**: add the deployed page to the home screen on an iOS device and compare against the
same action on Android. Testable and shippable without touching the mobile app at all.

### Gates for User Story 2 (write first, observe red) ⚠️

- [ ] T021 [US2] Replace the format assertion in `apps/web/e2e/metadata.spec.ts` (the `['an icon', /\.(?:svg|png|ico)$/]` row at line 530) with a **per-`rel`** rule per L14: `rel="apple-touch-icon"` must end `.png`; `rel="icon"` may be `.svg`, `.png` or `.ico`. Keep collecting the URLs from the live document rather than writing filenames into the test — the existing comment explains why, and it is the same reason the rule must be per-`rel` rather than per-document
- [ ] T022 [US2] Extend the manifest test in `apps/web/e2e/metadata.spec.ts` with L14's third row: the manifest names at least one raster of at least 192×192 and at least one of at least 512×512, alongside its SVG entries. Assert on the declared `sizes` **and** confirm the referenced bytes, so a mislabelled `sizes` cannot pass
- [ ] T023 [US2] **Observe T021 and T022 red on the unfixed document** — run `pnpm test:e2e -- metadata.spec.ts` before T024, with `apple-touch-icon` still pointing at `/icon.svg` and the manifest still SVG-only, and record both failures here (V75). Under the old assertion this passed, which is why the defect survived three features

### Implementation for User Story 2

- [ ] T024 [US2] Repoint `<link rel="apple-touch-icon">` in `apps/web/index.html` from `/icon.svg` to `/apple-touch-icon.png`. Leave `<link rel="icon" href="/icon.svg" type="image/svg+xml">` exactly as it is — SVG is correct there and has been supported since iOS 15 (D6)
- [ ] T025 [US2] Add the two raster entries to `webManifest()` in `apps/web/vite.config.ts`: `{ src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' }` and `{ src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }`. Keep both existing SVG entries (D7)
- [ ] T026 [US2] Add every public icon to the precache manifest in `precache()` in `apps/web/vite.config.ts` — `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png`, and `/icon-maskable.svg`, which was **already missing** beside the hard-coded `/icon.svg` (research D9). Public-directory files are not in Vite's bundle object, which is why this list is explicit and why an addition here is easy to forget
- [ ] T027 [US2] Run `pnpm test:e2e -- metadata.spec.ts` green, then V78: `pnpm build && pnpm --filter @chromatic-tuner/web preview --port 4173 &` and `pnpm --filter @chromatic-tuner/web verify:offline`. Confirm the generated `dist/sw.js` precache list names all five icons

**Checkpoint**: User Stories 1 and 2 both work independently. Every installable surface but the manual
ones is proved.

---

## Phase 5: User Story 3 - The submission checklist tells the truth about icons (Priority: P3)

**Goal**: `listing/submission.md` states correctly, for every icon artefact, whether it is typed into a
store console or built into the app — and a gate fails when the record and the artefacts disagree.

**Independent Test**: read the submission document against the built app and confirm each claim about
where an icon comes from is verifiable.

**Depends on User Story 1**: this story cannot be closed before Phase 3, because until the icon is
actually in the binary there is no true statement to write.

### Gate for User Story 3 (write first, observe red) ⚠️

- [ ] T028 [US3] Add a `submission-icons` group to `listing/scripts/verify-listing.mjs` implementing L16: every artefact path the **resolved** Expo config consumes must be described in `listing/submission.md` as built into the app, and every icon path in `limits.json` that no configuration consumes must be described as a console field. Drive it from the resolved config and `artwork.json` rather than from a hand-written list, so a new artefact fails the gate instead of slipping past it (FR-181)
- [ ] T029 [US3] **Observe T028 red**, twice, and record both: (a) against the unfixed `submission.md` sentence at line 106 claiming the adaptive foreground "is built into the app" while the resolved config consumed nothing — reconstruct by temporarily reverting T018; and (b) by changing one row of the corrected document to the wrong category. Case (a) is the historical defect, case (b) proves the gate reads the document rather than only the artefacts (V76)

### Implementation for User Story 3

- [ ] T030 [US3] Correct `listing/submission.md`: delete the false sentence at lines 106–107, and add a table stating for each icon artefact whether it is a console field or built into the app — `listing/assets/icon-ios-1024.png` and `icon-play-512.png` and the feature graphic are console fields; `apps/mobile/assets/*.png` are built in via `app.config.ts`; `apps/web/public/*` are served by the web app. Note that `listing/assets/icon-adaptive-foreground.png` is a **console reference copy**, and that the bytes Android actually ships come from `apps/mobile/assets/` (research D2)
- [ ] T031 [US3] Run `pnpm build && pnpm verify:listing` green, with `assets`, `artwork`, `artwork-manifest`, `identity` and `submission-icons` all passing. Record the group labels here

**Checkpoint**: all three user stories are independently functional, and each of the three defects has a
gate that was seen red on the unfixed code (SC-078).

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T032 Run the full merge-gate suite: `pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:e2e` (V77). `packages/*` is untouched by this feature, so `packages/tokens/tests/contrast.test.ts`, `apps/web/e2e/a11y.spec.ts` and the coverage thresholds must be unchanged and green — if any of them moved, something landed outside this feature's boundary
- [ ] T033 [P] Run V73's manual half: `pnpm build && pnpm listing:assets && git status --porcelain` reports no diff. This is `004`'s V34, now with the CI-runnable half T012 added
- [ ] T034 [P] Update `CLAUDE.md`: `apps/mobile/assets/` is a new directory of generated, committed artwork; `listing/assets/artwork.json` is the generated digest-and-palette record that makes raster provenance checkable; the existing note that `color.background` is embedded in the generated icons now reaches the mobile app's own icons too
- [ ] T035 [P] Append this feature's defects, deviations and measurements to `specs/001-chromatic-guitar-tuner/tasks.md`, which is the cross-feature build log
- [ ] T036 Request code review of the branch against `contracts/app-icons.md` L13–L16 and the hazard table above, with the two manual-only obligations named explicitly

### Release gates (manual, real hardware — not merge gates)

These cannot run on CI and are run before a submission, not before a merge.

- [ ] T037 V79 — iOS home screen (FR-171, SC-074, SC-075): `rm -rf apps/mobile/ios && pnpm --filter @chromatic-tuner/mobile prebuild && pnpm --filter @chromatic-tuner/mobile ios`. The tile is the mark on the app's background, masked once to iOS's superellipse — no double-rounded corners, no white or black fill at the edges. Check the app switcher and a Spotlight result for the same mark
- [ ] T038 V80 — Android launcher (FR-174): `rm -rf apps/mobile/android && pnpm --filter @chromatic-tuner/mobile android`. Verify against **at least two mask shapes**: the mark stays uncropped and the background reaches every edge with no transparent corner. With themed icons on, expect the **full-colour** icon — no monochrome layer ships, by design (D8)
- [ ] T039 V81 — Add to Home Screen in Safari on a real iPhone or iPad (FR-176, SC-074). The tile is the mark: not a page screenshot, not the mark on a black field, not double-rounded. Three separate failure modes with three separate causes, all three plausible in a file browser
- [ ] T040 V82 — Legibility at the smallest size (SC-075): the installed app beside other apps, at reading distance, without reading labels, on both a light and a dark wallpaper
- [ ] T041 V83 — Chromium installability (research D7, open risk): install the web app from a Chromium-based browser and confirm it installs with the mark. Recorded because an SVG manifest icon declared `sizes: "any"` is reported to break installability and this manifest declares exactly that; the tracker entry could not be read, so this is an observation to make, not a finding
- [ ] T042 Record the outcome of T037–T041 in this file, including which Android mask shapes were checked and which devices and OS versions were used

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — but it must run **before** any implementation, because it
  captures evidence that the fixes destroy
- **Foundational (Phase 2)**: depends on Setup — **blocks all three user stories**, since every story
  consumes an artefact the generator produces
- **User Story 1 (Phase 3)**: depends on Phase 2 only
- **User Story 2 (Phase 4)**: depends on Phase 2 only — independent of US1
- **User Story 3 (Phase 5)**: depends on Phase 2 **and User Story 1**. Stated in the spec and it is a
  real dependency, not a sequencing preference: T029's red case is the false claim measured against a
  config that consumes nothing, and T030 cannot write a true sentence until T018 makes one true
- **Polish (Phase 6)**: depends on every story being complete

### Within Each User Story

- The gate is written and **observed red** before the fix (T017 before T018; T023 before T024; T029
  before T030). This ordering is the story, not an artefact of the story
- Within Phase 2, T005 → T006 → T007 → T008 are the same file and are sequential; T009 needs all four;
  T010–T011 need T009; T012–T013 need T011; T014 needs T012 and T013

### Parallel Opportunities

- T002 and T003 (different evidence, different files)
- Phase 3 and Phase 4 are fully independent once Phase 2 lands — different apps, different gates,
  different files. Two people can take one each
- Within Phase 4, T021 and T022 touch the same spec file and are sequential; T024, T025 and T026 touch
  `index.html` and `vite.config.ts` and can be done together by one person or split as `index.html` ∥
  `vite.config.ts`
- T033, T034 and T035 in Phase 6

## Parallel Example: after Phase 2

```bash
# Two independent tracks, no shared files:
Track A (US1): T015 → T016 → T017 (red) → T018 → T019 → T020
Track B (US2): T021 → T022 → T023 (red) → T024 → T025 → T026 → T027

# Then US3, which needs Track A:
Track C (US3): T028 → T029 (red) → T030 → T031
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 — capture the evidence while the defects still exist
2. Phase 2 — generator, artefacts, `artwork.json`, L15
3. Phase 3 — the mobile icon, gates red then green
4. **STOP and VALIDATE**: T020, then T037 and T038 on real devices

That is the whole user-visible defect. The mobile app ships a recognisable icon, from checked-in
configuration, proved by two layered gates.

### Incremental Delivery

1. Phase 1 + Phase 2 → every artefact exists, is recorded and is checked; nothing consumes them
2. + Phase 3 → the phone shows the mark (MVP)
3. + Phase 4 → iOS Safari's home-screen tile shows the mark, and masking installers get a raster
4. + Phase 5 → the submission checklist is true, and stays true

Each step adds a surface without touching the previous one's files.

---

## Notes

- `pnpm build` is a precondition for `pnpm verify:listing` — the palette is read out of
  `apps/web/dist/index.html`. Every task above that runs the verifier runs the build first
- `pnpm listing:assets` needs the Playwright Chromium and stays a **release** gate. Everything in
  Phases 2–5 must pass on CI's Ubuntu runners against the **committed bytes**
- `apps/mobile/ios/` and `apps/mobile/android/` are git-ignored generated output. Nothing may be fixed
  by editing them (FR-175), and nothing asserted about them survives a `prebuild`
- No new dependency is added by any task here, and no file in `packages/*` is touched
- Commit after each task or logical group; stop at any checkpoint to validate a story independently
