# Phase 1 Data Model: App Icon Coverage

**Feature**: `008-app-icon-coverage` | **Date**: 2026-08-15

This feature stores no user data and changes no runtime state. Its "model" is the set of icon artefacts,
the surfaces that consume them, and the one new record that makes the set checkable.

---

## The mark

Unchanged, and not re-specified here. `listing/scripts/generate-icons.mjs` holds it as the `MARK`
constant — a line, a centre marker, two ticks, a flat dot, a sharp dot — with every dimension expressed
as a fraction of the canvas so one template serves every size. Its extreme extent is 0.25 of the width
from centre, which is what puts it inside the 66% adaptive-icon safe zone with room for a circular mask.

Every artefact below is that template at a size, with three switches: **background** (drawn or
transparent), **rounding** (pre-applied or square), and **scale** (full or safe-zone).

---

## Artefacts

Existing artefacts are listed for completeness because the new manifest (below) must cover all of them.

| Path | Size | Bg | Round | Scale | Alpha | Consumed by | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `listing/assets/icon-ios-1024.png` | 1024² | yes | no | full | forbidden | App Store Connect field | exists |
| `listing/assets/icon-play-512.png` | 512² | yes | no | full | allowed | Play Console field | exists |
| `listing/assets/icon-adaptive-foreground.png` | 1024² | no | no | full | required | Play adaptive icon reference | exists |
| `listing/assets/feature-graphic-1024x500.png` | 1024×500 | yes | no | full | forbidden | Play Console field | exists |
| `apps/web/public/icon.svg` | 512² | yes | **yes** | full | n/a | favicon, manifest `purpose: any` | exists |
| `apps/web/public/icon-maskable.svg` | 512² | yes | no | **safe** | n/a | manifest `purpose: maskable` | exists |
| `apps/mobile/assets/icon.png` | 1024² | yes | no | full | **forbidden** | Expo `icon` → iOS AppIcon, Android legacy | **new** |
| `apps/mobile/assets/icon-adaptive-foreground.png` | 1024² | no | no | **safe** | **required** | Expo `android.adaptiveIcon.foregroundImage` | **new** |
| `apps/mobile/assets/icon-adaptive-background.png` | 1024² | yes | no | — | allowed | Expo `android.adaptiveIcon.backgroundImage` | **new** |
| `apps/web/public/apple-touch-icon.png` | 180² | yes | **no** | full | **forbidden** | `<link rel="apple-touch-icon">` | **new** |
| `apps/web/public/icon-192.png` | 192² | yes | no | full | allowed | manifest raster fallback | **new** |
| `apps/web/public/icon-512.png` | 512² | yes | no | **safe** | allowed | manifest raster, `any maskable` | **new** |

**The rounding column is the trap.** Exactly one artefact is pre-rounded — `icon.svg`, because a favicon
and a browser tab apply no mask. Every masking surface (iOS home screen, Android launcher, maskable
manifest slot) must receive a **square** source, or the platform's own mask cuts corners that were
already cut and the page or wallpaper shows through at four points. `apple-touch-icon.png` is the one
most likely to be got wrong, because reusing `icon.svg`'s geometry looks correct in a file browser.

**The alpha column is the second trap**, and it points both ways. `apps/mobile/assets/icon.png` must have
**no** alpha: Apple rejects an alpha channel outright, and before that ever happens Expo composites a
transparent source onto solid white (research D4). `icon-adaptive-foreground.png` must **have** alpha:
the launcher composites it over the background layer, and an opaque foreground hides that layer entirely.
`apple-touch-icon.png` must have none: iOS fills transparency with solid black.

**`apps/mobile/assets/icon-adaptive-background.png` is a solid field**, not artwork — the palette's
`--ct-background` at 1024², matching the foreground's dimensions as Expo requires. It exists so that no
hex literal has to be written into `app.config.ts` (research D3).

---

## Surfaces

A surface is one place a platform draws the app. Each is the pairing of an artefact with a rule the
platform applies to it.

| Surface | Artefact | Platform's rule | Today |
| --- | --- | --- | --- |
| iOS home screen / switcher / Spotlight | `apps/mobile/assets/icon.png` | superellipse mask, no alpha | **blank white square** |
| Android launcher | mobile adaptive fg + bg | device-chosen mask, layered | **blank white square** |
| iOS Safari home-screen tile | `apple-touch-icon.png` | PNG only; own mask; alpha → black | **page screenshot** |
| Installed web app | manifest icons | picks by size and `purpose` | icon (SVG only) |
| Browser tab / bookmark | `icon.svg` | scalable, unmasked | icon |
| App Store Connect | `icon-ios-1024.png` | uploaded by hand | icon |
| Play Console | `icon-play-512.png`, feature graphic | uploaded by hand | icon |

The two blank rows and the screenshot row are the whole feature. SC-074's "60%" counts the five
installable surfaces in this table's top five rows.

---

## The artwork manifest — `listing/assets/artwork.json`

New, generated, committed. The only new persistent record this feature introduces. It is what makes
"every icon traces to one mark and one palette" (SC-076) a checkable property of *rasters*, which carry
neither a colour literal nor a comment for L11's two SVG checks to read (research D5).

```jsonc
{
  "$note": "Generated by listing/scripts/generate-icons.mjs. Do not edit by hand.",
  "generatedBy": "listing/scripts/generate-icons.mjs",
  "palette": {
    // Every --ct-* value the templates drew with, as resolved from the built
    // token block on the run that produced these bytes.
    "--ct-background": "#…",
    "--ct-line": "#…",
    "--ct-in-tune": "#…",
    "--ct-flat": "#…",
    "--ct-sharp": "#…",
    "--ct-no-reading": "#…"
  },
  "artefacts": {
    "apps/mobile/assets/icon.png": { "width": 1024, "height": 1024, "sha256": "…" }
    // … one entry per file the generator writes, SVGs included
  }
}
```

**Fields and what each one catches:**

- `palette` — a token changes and the artwork is not regenerated. The recorded value no longer appears
  in the built `--ct-*` block, and the gate fails. This is L11's check 1, for files that have no
  literals to grep.
- `artefacts[].sha256` — a file is edited by hand, or replaced with something exported from a design
  tool. This is L11's check 2, for files that carry no provenance comment. It also makes `004`'s V34
  ("regenerate and see no diff") runnable on CI, which could not launch the browser the generator needs.
- `artefacts` **completeness** — the generator gains a target and the manifest is not extended, leaving a
  shipped artefact that nothing checks. The gate compares the manifest's key set against the generator's
  own declared target list.

**Invariants:**

1. Every path in `artefacts` exists and its bytes digest to the recorded value.
2. Every value in `palette` appears in `apps/web/dist/index.html`'s `<style data-chromatic-tuner="tokens">`
   block. (Requires `pnpm build` first — the same precondition the existing artwork group already has.)
3. Every file the generator writes appears in `artefacts`, and nothing else does.
4. Every entry in `limits.json`'s `assets.files` that is icon artwork also appears in `artefacts`. The
   two records serve different purposes — `limits.json` says what a *store* demands, `artwork.json` says
   what the *generator* produced — and an artefact in one and not the other is a gap in one of them.

---

## Configuration deltas

Not data, but the state that must change for the artefacts to reach a surface.

| File | Change |
| --- | --- |
| `apps/mobile/app.config.ts` | add `icon`, `android.adaptiveIcon.{foregroundImage,backgroundImage}` |
| `apps/web/index.html` | repoint `rel="apple-touch-icon"` from `/icon.svg` to `/apple-touch-icon.png` |
| `apps/web/vite.config.ts` — `webManifest()` | add the two PNG entries, keep both SVG entries |
| `apps/web/vite.config.ts` — `precache()` | the manifest hard-codes `/icon.svg` only; add every new public icon **and** `/icon-maskable.svg`, which was already missing |
| `listing/limits.json` | `assets.files` entries for the four new store-relevant PNGs |
| `listing/submission.md` | correct the false adaptive-icon claim; state what is built in versus typed in |
