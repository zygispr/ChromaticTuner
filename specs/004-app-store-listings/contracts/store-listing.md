# Contract: Store Listing Artefacts

**Feature**: `004-app-store-listings` · **Date**: 2026-08-05

What the committed artefacts must satisfy, stated so a test can assert it. Guarantees are numbered
**L1–L12** and cited by number in code comments, following the convention `001`'s `contracts/` and
`003`'s `page-identity.md` set. `L` rather than `P` or `S` so a citation cannot be confused with an
existing contract's numbering.

Every guarantee names its verifier. Where the verifier is a person, it says so — a guarantee with a
pretend automated check is worse than one honestly marked manual (`003` D8).

---

## Content

### L1 — Every field is present and within its limit

For each field in `stores.ios` and `stores.android`: non-empty after trimming, and its character count
is at most the limit recorded for it in `limits.json`.

Counted in Unicode code points, not UTF-16 units and not bytes. An emoji in a 30-character store name is
a plausible future edit, and the three counts disagree about it.

**Verifier**: `verify-listing.mjs` (FR-109). **Failure message names the field and the limit it broke** —
`stores.ios.subtitle is 34 characters, limit 30`. A gate that says only "listing invalid" gets muted.

### L2 — The name leads with what the tool does

`stores.ios.name` and `stores.android.title` each contain at least one term from the intent vocabulary
(`tuner`, and at least one of `guitar` or `chromatic`), and neither consists solely of the product's
internal name.

**Verifier**: `verify-listing.mjs` (FR-089). The check is deliberately weak — it cannot judge good copy,
only catch a regression to a bare codename, which is the failure it exists for. L3 is where a human
judges the rest.

### L3 — The name and short summary are self-explanatory in isolation

A reader shown only the store name and the short summary, with no icon and no description, can state
what the app does and that it is free.

**Verifier**: **manual** (SC-036), using the same human-validation method as the earlier features' UX
gates. Recorded in `tasks.md` with the responses.

### L4 — The description's opening stands alone

The first 170 characters of `stores.ios.description` and the first 80 of
`stores.android.fullDescription` each mention the instrument, the microphone, and that the app is free.

**Verifier**: `verify-listing.mjs` (FR-091). 170 and 80 approximate where each store truncates before
its "more" control; both come from `limits.json` so a store's layout change is a data edit.

### L5 — No field claims a capability that is out of scope

No value anywhere in `store-listing.json`, and no rendered text in `apps/web/privacy.html`, matches any
pattern in `out-of-scope-claims.json`.

Patterns are word-boundary regexes, not substrings, for the reason `metadata.spec.ts` already records:
`async` contains `sync` and `accounting` contains `account`, and a gate that fires on innocent prose gets
muted.

**Verifier**: `verify-listing.mjs` (FR-093, FR-110) and the existing `metadata.spec.ts`, both reading the
same file. **Failure names the offending term and the field it appeared in.**

### L6 — The two stores make the same claims

Every claim in `claims` appears, in some phrasing, in both stores' copy; and no store's copy asserts
something absent from `claims`.

Compared as claim coverage, not string equality — the stores' field structures differ by design (spec
edge case 1), so byte comparison would either fail always or force copy that wastes one store's fields.

**Verifier**: `verify-listing.mjs` (FR-095, FR-112).

### L7 — The listings agree with the web page

Every claim in `claims` is corroborated by the **rendered text of the built `apps/web/dist/index.html`**.

Rendered text, not `apps/web/src/content.ts`. Comparing the listing against the constant that produces
the web page proves the two constants are equal and proves nothing about what shipped. `003`'s
`tasks.md` records the seven-phase defect that shape of assertion produced in `001`.

**Verifier**: `verify-listing.mjs` (FR-094, FR-112). Requires `pnpm build` first, which
`quickstart.md` states as a prerequisite.

---

## Assets

### L8 — Every required asset exists, at the right size, in the right format

For each entry in `limits.json`'s `assets` section: the file exists, its pixel dimensions match, its
format matches, and its alpha channel is present or absent as that store requires.

Three of these are rejection-at-review conditions rather than cosmetic ones, and each is a plausible
mistake:

- `icon-ios-1024.png` **must have no alpha channel and no pre-applied corner rounding**. Apple rejects
  both. An icon exported from a design tool with a transparent background looks correct everywhere
  except at submission.
- `feature-graphic-1024x500.png` **must exist**. Play will not publish a listing without it, and it is
  the asset most easily forgotten because no other store has an equivalent.
- Android screenshots **must have their longest side no more than twice their shortest**. A default
  phone emulator profile boots at 1080×2400, which is 2.22:1 and is rejected. The gate checks the
  committed pixels, not the device profile the capture script requested.

**Verifier**: `verify-listing.mjs` (FR-111), reading PNG headers directly — no image dependency
(Principle II).

### L9 — Screenshots cover both appearances

For each platform, at least one screenshot exists under `light/` and at least one under `dark/`, and the
two are not byte-identical.

The inequality check is the point. A capture script whose appearance switch silently failed produces two
directories of the same image, which passes a presence check and fails Principle IV.

**Verifier**: `verify-listing.mjs` (FR-101).

### L10 — Screenshots show a real reading, legibly

Each screenshot shows the tuner displaying a note, and the note readout is legible when the image is
scaled to the thumbnail size the store uses in a results row.

**Verifier**: **manual** (FR-100, FR-102, SC-039, SC-040), plus reproduction: running
`capture-screenshots.mjs` from a clean checkout regenerates the committed files. Manual because "shows a
real reading" and "legible at thumbnail size" are judgements about pixels; the automated half is L8's
dimensions and L9's appearance coverage.

### L11 — Artwork derives from tokens, and the app is not left with two icons

`generate-icons.mjs` produces every raster in `listing/assets/` **and** `apps/web/public/icon.svg` and
`icon-maskable.svg`, from the `--ct-*` values in the built document's `<style>` block. No colour literal
appears in any generator template or committed SVG.

**Verifier**: `verify-listing.mjs` greps the generator's templates and the committed SVGs for
`#rrggbb` / `rgb(` / `hsl(` literals (FR-098). This is the check that closes the gap D5 found: the
`apps/**` hex rule is an ESLint rule and does not reach SVG in `public/`.

---

## Configuration and safety

### L12 — Derived identity matches its source, and the capture flag never ships

Three assertions about what `app.config.ts` produces:

1. Both iOS purpose strings and the Android permission rationale equal `claims.purposeSentence`
   verbatim (FR-105).
2. `ios.bundleIdentifier` and `android.package` both equal `claims.identifier` (FR-106); the marketing
   version comes from `apps/mobile/package.json` and `ios.buildNumber` / `android.versionCode` from the
   single build integer (FR-107).
3. A release configuration contains no capture-mode flag and does not reference
   `captureAudioSource` (D7, Complexity Tracking).

The third is not paranoia about a hypothetical. `EXPO_PUBLIC_*` values are **inlined at build time**, so
"it is only set locally" is a statement about a developer's shell, not about the artefact. Assert the
artefact.

**Verifier**: `verify-listing.mjs` for 1 and 2; a build-output assertion for 3, following
`apps/web/scripts/verify-build-output.mjs`'s precedent (FR-113, SC-044).

---

## What this contract deliberately does not guarantee

Stated so nobody later writes a green-reporting test for one of them:

| Not guaranteed | Why | Where it is handled |
| --- | --- | --- |
| That the store console matches the repository | The console is outside version control and is filled in by a person | `listing/submission.md` (FR-108), by construction |
| That a submission is accepted | The verdict belongs to a review process this repo does not contain | SC-041, observed at submission |
| That the listing ranks | Store search is a third-party system | SC-045, observed 30 days after publication |
| That `limits.json` is current | Apple and Google change their limits without notice | A re-check step in `submission.md`, with a last-checked date per entry |
