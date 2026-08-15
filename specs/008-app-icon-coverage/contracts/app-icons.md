# Contract: App Icons

**Feature**: `008-app-icon-coverage` | **Date**: 2026-08-15

Extends `specs/004-app-store-listings/contracts/store-listing.md`, continuing its `L` numbering. L8 and
L11 stand unchanged; L13–L16 cover the ground they were never asked to.

> **On L11.** Its title is "Artwork derives from tokens, **and the app is not left with two icons**." The
> outcome was worse than the one it guards: the mobile app was left with *no* icon. L11 checks that the
> artwork in `listing/` and `apps/web/public/` agrees with the palette. Nothing checked that the mobile
> app pointed at any of it. L13 is that check.

---

## L13 — The mobile app declares an icon, and it is this product's icon

The **resolved** Expo configuration declares:

- `icon` — a path that exists, is a 1024×1024 PNG, and has **no alpha channel**;
- `android.adaptiveIcon.foregroundImage` — a path that exists, is a 1024×1024 PNG, and **has** an alpha
  channel;
- `android.adaptiveIcon.backgroundImage` — a path that exists and matches the foreground's dimensions.

Each named file appears in `artwork.json`'s `artefacts` (L15), which is what ties it to this product's
mark rather than to any 1024×1024 PNG.

**Why "resolved" and not "as written"**: the same reason L12 gives. Plugins rewrite the config, and a
check against `app.config.ts` would agree with the source whatever the plugins did. This is also the
only level at which the defect is visible as a defect: the source's failure mode is an *absent* key, and
`expo config --type prebuild` is where absence becomes `icon: null`.

**Why alpha is asserted in both directions**: they are opposite requirements, and each has a silent
failure. An alpha channel on `icon` is rejected by Apple — but before that, Expo's
`generateUniversalIconAsync` sets `removeTransparency: true` and `backgroundColor: '#ffffff'`, so a
transparent source is composited onto **white** and ships looking merely wrong. An opaque
`foregroundImage` hides the background layer the launcher composites beneath it.

**Verifier**: `verify-listing.mjs`, via the existing `resolvedMobileConfig()` (FR-171, FR-175, FR-180),
plus `apps/mobile/__tests__/app-config.test.ts` at the source, mirroring how L12 is layered.

---

## L14 — Every icon a document or manifest names is in a format that surface can render

For each icon reference in the web app's markup and generated manifest, the referenced file both resolves
**and** is in a format the naming platform accepts:

| Reference | Accepted | Rejected |
| --- | --- | --- |
| `<link rel="apple-touch-icon">` | `.png` | `.svg`, `.ico` |
| `<link rel="icon">` | `.svg`, `.png`, `.ico` | — |
| manifest `icons[]` | at least one raster present, of at least 192² and at least 512² | SVG-only |

**Why format and not just resolution.** No platform reports that it cannot use an icon; it substitutes
something. iOS Safari, handed an SVG `apple-touch-icon`, adds a **screenshot of the page** to the home
screen. That is a resolving reference, a well-formed tag, a passing `metadata.spec.ts`, and the wrong
tile — which is exactly why the existing test could not see this for three features. `.svg` is correct
for `rel="icon"` (Safari has supported it since iOS 15) and wrong for `rel="apple-touch-icon"`, so the
rule has to be per-`rel`, not per-document.

**Verifier**: `apps/web/e2e/metadata.spec.ts` (FR-176, FR-177, FR-178), extending the test that already
collects every icon URL from the live document. Format is asserted on the URL the page actually
publishes, not on a filename written into the test.

---

## L15 — Every generated artefact is recorded, unmodified, and drawn from the current palette

`listing/assets/artwork.json` is written by `generate-icons.mjs` and holds, for every artefact it emits,
the pixel dimensions, a SHA-256 of the bytes, and the `--ct-*` values that run drew with. All four hold:

1. every path in `artefacts` exists, and its bytes digest to the recorded `sha256`;
2. every value in `palette` still appears in the built document's `<style data-chromatic-tuner="tokens">`
   block;
3. the generator's target list and the manifest's key set are equal — no artefact ships unrecorded, and
   no record outlives its artefact;
4. every icon in `limits.json`'s `assets.files` also appears in `artefacts`.

**Why this exists.** L11 proves the same two things about SVGs by grepping them: every colour literal is
a palette value, and the file carries the generator's marker. Neither transposes to a raster — a PNG has
no literals and no comment. The digest is the marker; the recorded palette is the literal. Check 2 alone
would pass on a hand-drawn file whose recorded palette happened to be current, and check 1 alone would
pass on correctly-transcribed-then-stale artwork — which is precisely the defect `004`'s D5 found and
the reason L11 needs both halves too.

**What it additionally buys.** `004`'s V34 — "regenerate and see no diff" — is manual because
`pnpm listing:assets` needs a browser CI's Ubuntu runners do not have. The digest proves the committed
bytes are the ones the generator last produced, on CI, launching nothing.

**Precondition**: `pnpm build`, for the same reason the existing artwork group has it — the palette is
read out of `apps/web/dist/index.html`.

**Verifier**: `verify-listing.mjs` (FR-173, FR-179, FR-182).

---

## L16 — The submission record states, truthfully, where each asset is consumed

For every icon artefact, `listing/submission.md` says whether it is **typed into a store console** or
**built into the app**, and that statement matches the artefacts.

**Why this is a contract clause and not a docs tidy-up.** The document currently asserts of
`icon-adaptive-foreground.png`: "it is not a console field — it is built into the app." It was not built
into the app; nothing referenced it. A checklist that asserts a false thing is worse than one that omits
it, because it is the thing that stops the reader from checking. The person reading `submission.md` is
preparing a submission months from now with no other source.

**Verifier**: `verify-listing.mjs` (FR-181) — every path in `artwork.json` that the resolved Expo config
consumes is described as built in; every path in `limits.json` that no configuration consumes is
described as a console field.

---

## What this contract deliberately does not guarantee

- **That the rendered icon looks right.** Rasterising, masking and downscaling are the OS's job. Every
  clause above proves configuration, bytes and derivation; whether the mark reads as a tuner on a real
  home screen at a real size is V72/V73, and it is manual for the same reason `004`'s L10 is.
- **The iOS dark and tinted variants, and the Android monochrome themed icon.** Not shipped — research
  D8. Nothing here asserts their absence either; adding one later is additive.
- **Splash and launch screens.** A different surface, out of scope (spec Assumptions), and still
  unconfigured.
- **That `jest-expo` catches a mobile icon regression.** It cannot: it has no layout engine and no
  launcher. `app-config.test.ts` proves the configuration names files that exist; the resolved-config
  half of L13 is where the real assertion lives, and the rendered result is manual.
