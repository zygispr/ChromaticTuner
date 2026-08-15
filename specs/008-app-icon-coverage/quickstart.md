# Quickstart: App Icon Coverage

**Feature**: `008-app-icon-coverage` | **Date**: 2026-08-15

Validation scenarios for this feature, continuing the repository's `V` numbering. Contract clauses are
`L13`–`L16` in [`contracts/app-icons.md`](contracts/app-icons.md); artefacts and their switches are in
[`data-model.md`](data-model.md).

## Prerequisites

```bash
pnpm install                       # corepack enable first; Node 22.13+
pnpm build                         # required: the palette is read out of apps/web/dist/index.html
pnpm listing:assets                # regenerates all artwork; needs the Playwright Chromium
```

`pnpm listing:assets` cannot run on CI's Ubuntu runners and stays a release gate. Everything under
"Automated" below runs without it, against the committed bytes.

---

## Automated

### V72 — The mobile app is configured with this product's icon (L13)

```bash
pnpm build && pnpm verify:listing
```

**Expect**: the `identity` group reports the resolved config's `icon`,
`android.adaptiveIcon.foregroundImage` and `.backgroundImage` all present, all existing, `icon` with no
alpha channel and the foreground with one.

**Observe it red first** (Principle III): comment out `icon` in `apps/mobile/app.config.ts` and rerun —
the group must fail naming the absent key. This is the exact defect the feature was opened against, so a
gate that has not been seen red on it is not known to work.

### V73 — Regenerating changes nothing (L15)

```bash
pnpm build && pnpm listing:assets && git status --porcelain
```

**Expect**: no diff. This is `004`'s V34, now with an automated half — `pnpm verify:listing` recomputes
every digest in `listing/assets/artwork.json` against the committed bytes and fails on any mismatch,
without launching a browser. Run the manual half whenever the generator or the tokens change.

**Observe it red first**: flip one byte in any committed icon and rerun `pnpm verify:listing`.

### V74 — A stale palette fails, not ships (L15)

```bash
# Change color.background in packages/tokens, then:
pnpm build && pnpm verify:listing
```

**Expect**: failure — `artwork.json`'s recorded palette no longer matches the built `--ct-*` block.
`pnpm listing:assets` then makes it pass, and `git status` shows every icon changed, not some of them.
Revert afterwards.

### V75 — Every icon reference is usable by the surface that names it (L14)

```bash
pnpm test:e2e -- metadata.spec.ts
```

**Expect**: `apple-touch-icon` resolves **and** ends in `.png`; the manifest names at least one raster of
192² or larger and one of 512² or larger alongside its SVGs; every reference resolves.

**Observe it red first**: point `rel="apple-touch-icon"` back at `/icon.svg`. The pre-fix document must
fail this test — under the old assertion it passed, which is why the defect survived three features.

### V76 — The submission record matches the artefacts (L16)

```bash
pnpm build && pnpm verify:listing
```

**Expect**: every artefact the resolved Expo config consumes is described in `listing/submission.md` as
built into the app; every artefact only a console consumes is described as a console field.

**Observe it red first**: the unfixed `submission.md` claims the adaptive foreground "is built into the
app" while nothing referenced it — that sentence against the unfixed `app.config.ts` is the red case.

### V77 — Source-level configuration and the standing suite

```bash
pnpm --filter @chromatic-tuner/mobile test -- app-config
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

**Expect**: `app-config.test.ts` asserts the config names icon paths that exist on disk. The full suite
must stay green — in particular `packages/tokens/tests/contrast.test.ts` and `a11y.spec.ts`, neither of
which this feature should touch.

### V78 — The installed web app still works offline, with its artwork

```bash
pnpm build && pnpm --filter @chromatic-tuner/web preview --port 4173 &
pnpm --filter @chromatic-tuner/web verify:offline
```

**Expect**: pass, with every new public icon in the generated `sw.js` precache list. The list hard-codes
`/icon.svg` and misses `/icon-maskable.svg` today; adding rasters without adding them there produces an
installed app whose icons 404 offline.

---

## Manual

These need real hardware or a real store surface. Rendering an icon is the OS's job, and no runner in
this project has a home screen — `jest-expo` has no layout engine, and the web E2E suite has no
installer.

### V79 — The iOS home screen shows the mark (FR-171, SC-074, SC-075)

```bash
rm -rf apps/mobile/ios
pnpm --filter @chromatic-tuner/mobile prebuild
pnpm --filter @chromatic-tuner/mobile ios
```

**Expect**: the home-screen tile is the mark on the app's background, correctly masked to iOS's
superellipse, with **no** double-rounded corners and no white or black fill at the edges. Check the app
switcher and a Spotlight search for the same icon.

Deleting `ios/` first is the point (FR-175, SC-077): that directory is git-ignored generated output, and
this proves the icon comes from checked-in configuration rather than from something that survived in a
stale build.

### V80 — The Android launcher masks the mark correctly (FR-174)

```bash
rm -rf apps/mobile/android
pnpm --filter @chromatic-tuner/mobile android
```

**Expect**: the launcher icon shows the full mark inside whatever mask the device applies. Verify against
**at least two mask shapes** (Settings → most launchers offer circle, squircle and rounded square): the
mark stays uncropped in all of them and the background reaches every edge with no transparent corner.

With themed icons enabled (Android 13+), expect the **full-colour** icon — no monochrome layer ships, by
design (research D8).

### V81 — Add to Home Screen on iOS Safari (FR-176, SC-074)

On a real iPhone or iPad, open the deployed web app in Safari → Share → Add to Home Screen.

**Expect**: the tile is the mark — not a screenshot of the page, not the mark on a black field, and not
double-rounded. All three are separate failure modes with separate causes (format, alpha, pre-applied
rounding — research D6), and all three look plausible in a file browser.

### V82 — Legibility at the smallest size (SC-075)

Put the installed app on a home screen alongside other apps and look at it from normal reading distance
without reading labels. Check both a light and a dark wallpaper.

**Expect**: distinguishable from an unrelated app on first look. This is `004`'s SC-040 judgement applied
to the surface that finally has an icon on it.

### V83 — Chromium installability (research D7, open risk)

Install the web app from a Chromium-based browser.

**Expect**: it installs, and the installed icon is the mark. Recorded because there are reports of a
Chromium defect in which an SVG manifest icon declared `sizes: "any"` breaks installability outright, and
this manifest declares exactly that. The tracker entry could not be read, so this is an observation to
make rather than a finding — the rasters V75 adds are the right action either way.
