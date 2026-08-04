# Data Model: Search & Answer-Engine Discoverability

**Feature**: `003-seo-discoverability` · **Date**: 2026-08-04

This feature adds **no runtime state**. Nothing is stored, nothing is persisted, no preference is
introduced, and `PreferencesStore` is untouched. What it adds is a set of *build-time* values and the
rule that they all flow from one place.

The model below is therefore about provenance: which value exists, where its single source is, and what
it must satisfy. The property that matters — and the one FR-083 turns into a gate — is that **no value
appears twice**. A description written once into `<meta>` and again into JSON-LD is a description that
will disagree with itself within two releases.

---

## Source of truth

```text
packages/tokens ──────────┐
  (colour, type, space)   │
                          ├──> apps/web/vite.config.ts ──> dist/index.html
apps/web/src/content.ts ──┤       (build-time assembly)     dist/robots.txt
  (every copy string)     │                                 dist/sitemap.xml
                          │
VITE_SITE_URL ────────────┘
  (.env / deploy env)
```

Three inputs, one assembly step, three outputs. `apps/web/src/content.ts` is the new module; the other
two inputs already exist.

---

## Entity: Site copy (`apps/web/src/content.ts`)

A plain module of exported string constants. No class, no factory, no schema — Principle II.

| Field | Type | Constraint | Consumed by |
|---|---|---|---|
| `title` | `string` | ≤ 60 characters, leads with the head search term | `<title>`, `og:title`, `twitter:title`, JSON-LD `name` |
| `description` | `string` | 120–155 characters, one complete sentence, states purpose and cost | `<meta name="description">`, `og:description`, JSON-LD `description`, manifest `description` |
| `heading` | `string` | ≤ 40 characters, names the tool | the document's single `<h1>` |
| `sections` | `ReadonlyArray<{ heading: string; body: string }>` | ≥ 150 words in total across all `body` values (SC-023); target ~250 | the below-fold content section |
| `features` | `ReadonlyArray<string>` | every entry must appear verbatim in some `sections[].body` | JSON-LD `featureList` |
| `appName` | `string` | — | manifest `name`, JSON-LD `name`, preview card |

### Validation rules

- **V-COPY-1 (FR-065)**: No string may name a capability listed as out of scope in `001` — tuning
  presets, per-string targets, custom tunings, reference-tone playback, accounts, sync, capo or
  transposition, metronome or practice tools. Enforced by review and by a lint-style assertion over a
  denylist of those terms in `metadata.spec.ts`.
- **V-COPY-2 (FR-083)**: Every entry in `features` must be found in the rendered page's visible text.
  This is the corroboration rule, and it is asserted against the *rendered document*, not against the
  module — asserting `content.ts` against itself would prove nothing.
- **V-COPY-3 (FR-079)**: `title` and `description` are used for both the page and the preview identity by
  construction. There is no separate `ogTitle`. Agreement is structural, not tested.
- **V-COPY-4 (FR-061)**: `title` over 60 characters is truncated in results listings, so the length bound
  is a gate, not a guideline.

### Claims requiring corroboration

Any factual claim in the copy has to be true of the built app *and* verifiable. Two are load-bearing:

| Claim | Why it is true | Where it is corroborated |
|---|---|---|
| "accurate to within one cent" | Constitution accuracy budget: ±1 cent across E1–E6 at SNR ≥ 20 dB, enforced by `packages/core` tests | must be stated with its range, not as an unbounded claim |
| "works offline" / "no network" | FR-030, FR-031; proven by `verify:offline` and `e2e/no-network.spec.ts` | already an existing, tested guarantee |

The accuracy claim is the one most likely to be written carelessly. "Accurate to ±1 cent" without
qualification is false outside E1–E6, where the constitution explicitly declines to guarantee it. The
copy must carry the range or soften the claim.

---

## Entity: Page identity (the built document)

Not a runtime object — the set of tags the built `index.html` must expose. Full field-by-field
requirements are in [`contracts/page-identity.md`](./contracts/page-identity.md); this is the shape.

| Group | Members | Source |
|---|---|---|
| Document identity | `<title>`, `<meta name="description">`, `<link rel="canonical">`, `<html lang>` | `content.ts` + `VITE_SITE_URL` |
| Preview identity | `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`, `twitter:card`, `twitter:image` | `content.ts` + `VITE_SITE_URL` |
| Structured description | one `application/ld+json` block, `@type: SoftwareApplication` | `content.ts` |
| Document outline | exactly one `<h1>`; section headings at `<h2>` | `content.ts` |
| Theme | one `<style>` block defining every `--ct-*` property in both appearances | `packages/tokens` via `src/theme.ts` |

### State transition: none

There is no lifecycle here. The document is assembled once at build time and is immutable thereafter.
This is worth stating because it is the reason no runtime code reads any of it — a canonical tag written
by JavaScript is invisible to the consumers it exists for (research D5).

---

## Entity: Build configuration

| Key | Type | Default | Required at |
|---|---|---|---|
| `VITE_SITE_URL` | absolute origin, no trailing slash | committed dev default in `apps/web/.env` | build time only |

### Validation rules

- **V-ENV-1 (FR-075)**: The value must never appear as a literal in source. Any occurrence of a real
  origin outside `.env` and the deploy environment is a defect.
- **V-ENV-2 (FR-074)**: An unresolved `%VITE_SITE_URL%` in the built output fails the metadata gate. The
  committed default exists precisely so a clean checkout cannot produce this.
- **V-ENV-3 (FR-076)**: When the build's origin is not the canonical one, the emitted `robots.txt` must
  disallow all crawling. The environment decides; no filename or hosting feature is involved.

---

## Entity: Preview asset (`apps/web/public/og-image.png`)

| Property | Value | Rule |
|---|---|---|
| Dimensions | 1200 × 630 | The size every target platform crops toward (FR-078) |
| Format | PNG | SVG is not reliably rendered as a preview by any target platform |
| Provenance | generated by `scripts/generate-og-image.mjs`, committed | Follows the `e2e/fixtures/generate.mjs` precedent (D7) |
| Palette | from `packages/tokens` | No literal colours; the card matches the app |

### Validation rules

- **V-IMG-1 (FR-085)**: The file must exist and be reachable at the URL the `og:image` tag names. A moved
  or deleted asset fails a gate rather than shipping a broken card.
- **V-IMG-2 (FR-078)**: Legible at the smallest size platforms display the card. Verified by eye at
  reduced scale — this is a human gate, not an automatable one.

---

## What this model deliberately does not contain

- **No runtime types.** Nothing here crosses into `packages/core`, so no core API delta document exists
  for this feature — unlike `002`, which amended the continuous channel.
- **No persisted state and no schema version.** Principle VI's forward-migration requirement applies to
  persistent settings; there are none here.
- **No `FAQPage` or `AggregateRating` entities.** Rejected in research D6 — the first buys little since
  FAQ rich results were curtailed for non-authoritative sites, and the second would require inventing
  ratings that do not exist.
