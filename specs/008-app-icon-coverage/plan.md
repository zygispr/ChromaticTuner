# Implementation Plan: App Icon Coverage

**Branch**: `008-app-icon-coverage` | **Date**: 2026-08-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-app-icon-coverage/spec.md`

## Summary

The mark already exists and is already generated from the palette. This feature carries it to the three
surfaces it never reached, and adds the gate each gap slipped past.

The mobile app ships **no icon at all**: `app.config.ts` declares none, and Expo's documented fallback —
"create a white square image if no icon exists to mitigate the chance of a submission failure" — quietly
writes a blank 1024×1024 into the app bundle. The web app's `apple-touch-icon` points at an SVG, which
Safari on iOS cannot use, so Add to Home Screen produces a screenshot of the page. And
`listing/submission.md` states that the adaptive launcher icon "is built into the app", which was never
true.

The approach is to extend what exists rather than build anything new: `generate-icons.mjs` gains six
targets, `app.config.ts` gains three keys, and the three defects get gates in the three files that
already do this kind of checking. One new artefact is introduced — `listing/assets/artwork.json`, a
generated digest-and-palette record — because L11's two SVG checks (grep the literals, grep the
provenance marker) have no equivalent for a raster, and FR-179 asks for the same guarantee on rasters.

## Technical Context

**Language/Version**: TypeScript 5.9 (`app.config.ts`, `vite.config.ts`, tests); JavaScript ESM for
`listing/scripts/*.mjs`, which stay `.mjs` with JSON data because CI's Node 22 pin predates type
stripping (`004` D1)

**Primary Dependencies**: none added. Rasterising is `@playwright/test`'s Chromium, already installed;
PNG re-encoding is `node:zlib` and a hand-written CRC, already in the generator; digests are
`node:crypto`

**Storage**: N/A — no runtime state. One new committed record, `listing/assets/artwork.json`

**Testing**: Vitest (`packages/*`), Jest via `jest-expo` (`apps/mobile`), Playwright (`apps/web/e2e`),
and `verify-listing.mjs`, which is its own runner

**Target Platform**: iOS 16.4+, Android, and evergreen browsers. iOS Safari and Chromium are the two that
change behaviour here

**Project Type**: pnpm workspace — `packages/*` (platform-free) and `apps/*` (platform shells), plus
`listing/`, which sits outside that graph

**Performance Goals**: unaffected. This feature touches no DSP path, no render loop and no React tree.
No before/after latency or frame-time numbers are owed, because nothing on either path changes

**Constraints**: `pnpm listing:assets` needs a browser and stays a release gate, not a merge gate — so
every check added here must run against **committed bytes** on CI's Ubuntu runners. `apps/mobile/ios/`
and `android/` are git-ignored generated output, so nothing may be fixed by editing them

**Scale/Scope**: 6 new generated artefacts, 1 generated record, 3 configuration files edited, 4 gates
extended, 1 document corrected

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1 design.*

| Principle | Assessment |
| --- | --- |
| **I — Code quality** | Passes. No dead code; the false sentence in `submission.md` is deleted rather than annotated. The PNG-decoding logic is **not** duplicated into the verifier — D5 rejected that route partly on this principle, choosing a record that needs no decoder. |
| **II — Simplicity** | Passes, and is the binding constraint on three decisions. No new dependency (nothing added; the existing Chromium rasterises). D3 chooses a generated background PNG over importing the tokens package into Expo's config loader for one string. D6 rejects a five-file `apple-touch-icon` ladder for the single 180 iOS downscales from. D8 declines the iOS tinted variant and the Android monochrome layer as YAGNI. `artwork.json` is the one addition, justified below. |
| **III — Testing (non-negotiable)** | Passes, and drives the task order. Each of the three defects gets a gate **observed red on the unfixed code first** — V72, V75 and V76 each name their red case. This is the spec's SC-078 and the constitution's "every bug fix MUST add a regression test that fails on the unfixed code", and all three are bug fixes. |
| **IV — UX consistency** | Passes, and is the reason FR-172 forbids a second mark. "Identical concepts MUST look and behave identically everywhere" is exactly what a blank tile beside a correct store listing violates. No hard-coded colour is introduced anywhere — D3 exists to keep that true in `app.config.ts`. |
| **V — Performance** | Not engaged. No runtime code path changes. The generator runs offline, deliberately, so no browser launch enters the build path. |
| **VI — Scalability** | Passes. `limits.json`'s `assets.files` is already data-driven, so new artefacts are data additions. A future icon variant (iOS tinted, Android monochrome) is a generator target plus a manifest row, not a code change. |

**Coverage note**: `packages/core` coverage thresholds are unaffected — no file in `packages/*` is
touched.

**The one thing that needs justifying**: `listing/assets/artwork.json` is a new persistent artefact, and
Principle II asks whether it is earned. It is: FR-179 requires the palette-derivation guarantee on
rasters, L11's two mechanisms both read text a PNG does not have, and the alternatives were weighed in
research D5 — a second PNG decoder (rejected on Principle I and on gate quality), a `tEXt` chunk
(rejected on cost across two encode paths), and a digest with no palette record (rejected as half the
requirement). It also converts `004`'s manual V34 into something CI can run without a browser. Recorded
in Complexity Tracking below.

*Post-Phase-1 re-check*: unchanged. The design added no abstraction, no dependency and no runtime code.

## Project Structure

### Documentation (this feature)

```text
specs/008-app-icon-coverage/
├── plan.md              # This file
├── spec.md
├── research.md          # Phase 0 — D1–D9
├── data-model.md        # Phase 1 — artefacts, surfaces, artwork.json
├── quickstart.md        # Phase 1 — V72–V83
├── checklists/
│   └── requirements.md
├── contracts/
│   └── app-icons.md     # Phase 1 — L13–L16
└── tasks.md             # Phase 2 (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
listing/
├── scripts/
│   ├── generate-icons.mjs        # +6 raster targets, +artwork.json
│   └── verify-listing.mjs        # +L13 (resolved config), +L15 (manifest), +L16 (submission)
├── limits.json                   # +4 assets.files entries
├── submission.md                 # corrected: what is built in vs typed in
└── assets/
    └── artwork.json              # NEW — generated, committed

apps/mobile/
├── app.config.ts                 # +icon, +android.adaptiveIcon.{foregroundImage,backgroundImage}
├── assets/                       # NEW directory
│   ├── icon.png                          # 1024², opaque, square
│   ├── icon-adaptive-foreground.png      # 1024², alpha, safe-zone
│   └── icon-adaptive-background.png      # 1024², solid --ct-background
└── __tests__/app-config.test.ts  # +icon paths declared and existing

apps/web/
├── index.html                    # apple-touch-icon → /apple-touch-icon.png
├── vite.config.ts                # webManifest(): +2 rasters;  precache(): +every icon
├── public/
│   ├── apple-touch-icon.png      # NEW — 180², opaque, square, unrounded
│   ├── icon-192.png              # NEW
│   └── icon-512.png              # NEW — safe-zone, any + maskable
└── e2e/metadata.spec.ts          # +format-per-rel assertions (L14)
```

**Structure Decision**: no new package, no new app, and nothing in `packages/*`. The work sits in the
existing `listing/` generator-and-verifier pair plus the two app shells — which is where `004` put the
same kind of work. The one new directory is `apps/mobile/assets/`, mirroring `apps/web/public/`; research
D2 records why the mobile app gets its own copies rather than reaching into `listing/` for build-critical
bytes.

## Phase ordering

The gates come first, and each is observed failing before the thing it gates is fixed (Principle III).
Within that, the mobile icon is the P1 story and can ship alone.

1. **Generator and record** — new raster targets, `artwork.json`, `limits.json` rows. Nothing consumes
   them yet.
2. **L15 + L13 gates, red** — the manifest check and the resolved-config check, both failing.
3. **Mobile wiring** — `app.config.ts` and `app-config.test.ts`; L13 goes green. *User Story 1 complete
   and shippable here.*
4. **L14 gate, red** — the per-`rel` format assertion, failing on the current `apple-touch-icon`.
5. **Web wiring** — `index.html`, `webManifest()`, `precache()`; L14 goes green. *User Story 2 complete.*
6. **L16 gate, red, then `submission.md`** — the false claim is the red case, so this can only be written
   after step 3 makes a true statement available. *User Story 3 complete.*
7. **Manual release gates** — V79–V83 on real hardware.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| `listing/assets/artwork.json` — a new generated, committed record | FR-179 extends "artwork derives from the palette" to rasters. L11 proves this for SVGs by grepping colour literals and a provenance comment; a PNG has neither. The record supplies both — a digest as the marker, a recorded palette as the literal — and additionally makes `004`'s manual V34 runnable on CI, which cannot launch the generator's browser. | **Decode the PNGs and check pixels**: needs a decoder, and `generate-icons.mjs` already has one, so it would be a second copy (Principle I); anti-aliasing forces it to degrade into sampling named pixels, which passes on a shifted mark. **A PNG `tEXt` provenance chunk**: more elegant, but must be injected into both encode paths, and still records no palette. **Digest alone**: proves the file is untouched, says nothing about whether it is current — half the requirement. |
| Three mobile PNGs duplicating artwork already in `listing/assets/` | Expo resolves an icon path against the **current working directory**, not the project root (`@expo/image-utils` passes any non-`http` string straight to the image library), so a `../../listing/…` path holds only while every caller happens to `cd` into `apps/mobile`. Pointing the native build at `listing/` would also invert the stated dependency direction — `listing/` "depends on nothing" — making `apps/mobile` unbuildable without it. | **A prebuild copy step**: adds a step, a failure mode and an ordering constraint to save three files that change about once a year (Principle II). **Reaching into `listing/` directly**: the CWD fragility above, plus the inverted dependency. The duplication is of *output* from one generator, one mark and one palette, and `artwork.json` makes it checkable rather than merely tolerated. |
