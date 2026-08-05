# Phase 1 Data Model: App Store Listing Optimisation

**Feature**: `004-app-store-listings` · **Date**: 2026-08-05

Nothing here is runtime state. Every entity below is build- or release-time data, and the model's job is
to say **where each fact lives once** so that FR-088's "single source of truth" is a property of the
layout rather than a promise in a document.

---

## The rule the whole model follows

> Every fact about the app that a store displays is authored in exactly one place, and every other place
> it appears reads it from there.

Four facts currently violate that rule, which is why the model looks the way it does:

| Fact | Authored today | Authored after |
| --- | --- | --- |
| Microphone purpose sentence | `app.json` × 2 | `store-listing.json` × 1 |
| Dark palette | `packages/tokens` + `icon.svg` hex × 5 | `packages/tokens` × 1 |
| Marketing version | `package.json` (`0.0.0`) + `app.json` (`0.1.0`) | `package.json` × 1 |
| Application identifier | `app.json` × 2, disagreeing | `store-listing.json` × 1 |

---

## 1. Listing claims

**Where**: `listing/store-listing.json`, `claims` object.

The store-independent facts. Not copy — the substance the copy has to carry, and what FR-112's
agreement check compares against the web build.

| Field | Meaning | Constraint |
| --- | --- | --- |
| `appName` | The product's own name | Matches `apps/web/src/content.ts`'s `appName` |
| `identifier` | The permanent application identifier | `com.chromatictuner.app` (D3); permanent from first publication |
| `purposeSentence` | Why the app needs the microphone | Reproduced verbatim into both iOS purpose strings and referenced by the privacy policy (FR-105) |
| `collectsNoData` | The privacy position | `true`; corroborated by `no-network.spec.ts` staying green, never asserted alone (FR-103) |
| `price` | What it costs | Free, no in-app purchase |
| `requirements` | What a user needs | A microphone. Nothing else — no account, no network after first load |

**Validation**: every string non-empty; `identifier` matches `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`;
no field matches any pattern in `out-of-scope-claims.json`.

---

## 2. Store listing

**Where**: `listing/store-listing.json`, `stores.ios` and `stores.android` objects.

One store's rendering of the claims into its own fields. The two stores do not share a field structure,
which is the whole reason this is a separate entity from the claims (spec edge case 1): iOS has a
subtitle and a dedicated keyword field, Play has a short description and indexes prose.

**iOS**

| Field | Limit | Notes |
| --- | --- | --- |
| `name` | 30 | Leads with what the tool does, not the internal name (FR-089) |
| `subtitle` | 30 | Extends the name; must not repeat its words (FR-090) |
| `promotionalText` | 170 | Editable without review; optional |
| `description` | 4000 | Opening must carry purpose, cost, requirement before the "more" fold (FR-091) |
| `keywords` | 100 | Comma-separated, no spaces after commas — the separator costs a character. Words already in `name` and `subtitle` are indexed and must not be repeated here (FR-092) |
| `primaryCategory`, `secondaryCategory` | — | FR-096 |
| `ageRating` | — | From Apple's questionnaire, recorded not computed |

**Android**

| Field | Limit | Notes |
| --- | --- | --- |
| `title` | 30 | Same intent as iOS `name`; may differ in wording, not in substance (FR-095) |
| `shortDescription` | 80 | The line under the title in search results (FR-090) |
| `fullDescription` | 4000 | Carries the discovery terms, since Play has no keyword field (FR-092) |
| `category` | — | FR-096 |
| `contentRating` | — | From the IARC questionnaire, recorded not computed |

**Validation**: every field within its limit from `limits.json` and non-empty (FR-109); no field matches
`out-of-scope-claims.json` (FR-110); the two stores' claim sets agree (FR-095); both agree with the web
build's rendered text (FR-094, FR-112).

---

## 3. Field limits

**Where**: `listing/limits.json`.

FR-109 requires the limits be "recorded in one place". This is that place, and it exists because the
limits are **not** facts about this project — they are facts about two products owned by other
companies, and they change without notice.

```text
{
  "ios":     { "name": 30, "subtitle": 30, "promotionalText": 170,
               "description": 4000, "keywords": 100 },
  "android": { "title": 30, "shortDescription": 80, "fullDescription": 4000 },
  "assets":  { … see entity 4 … }
}
```

Each entry carries the store documentation URL it was read from and the date it was last checked.
`listing/submission.md` includes re-checking them as a step, because a limit that silently tightened is
a truncated store name nobody sees until it is live.

---

## 4. Listing assets

**Where**: `listing/assets/`, generated and committed (D6, D7). Constraints in `limits.json`'s `assets`
section so the gate reads them rather than hard-coding them.

| Asset | Size | Format constraint | Source |
| --- | --- | --- | --- |
| `icon-ios-1024.png` | 1024×1024 | PNG, **no alpha channel**, **no pre-applied corner rounding** — Apple rejects both | `generate-icons.mjs` |
| `icon-play-512.png` | 512×512 | 32-bit PNG, ≤1 MB | `generate-icons.mjs` |
| `icon-adaptive-foreground.png` | 1024×1024 | PNG with alpha; all meaning inside the centre safe zone, because the launcher masks to a shape the device chooses | `generate-icons.mjs` |
| `feature-graphic-1024x500.png` | 1024×500 | PNG or JPEG, **no alpha** — Play requires this and will not publish without it | `generate-icons.mjs` |
| `screenshots/ios/{light,dark}/*.png` | 1290×2796 or 1320×2868 | Apple requires a 6.9" iPhone set; other sizes are derived by the store | `capture-screenshots.mjs` |
| `screenshots/android/{light,dark}/*.png` | see below | 2–8 images, 320–3840 px per side, **longest side ≤ 2× shortest** | `capture-screenshots.mjs` |

**The Android aspect constraint is the trap.** Play's "longest side no more than twice the shortest"
rule excludes the resolution a modern phone emulator boots at by default — 1080×2400 is 2.22:1 and is
rejected. The capture profile must be chosen to land inside the rule (1080×1920 is 1.78:1 and safe), and
the gate checks the committed files rather than trusting the device profile.

No tablet assets, because D4 withdraws `supportsTablet`. If that is ever reversed, the required sets
return with it — which is the cost the decision records.

---

## 5. Privacy declaration

**Where**: `listing/store-listing.json`'s `privacy` object, plus the page at `apps/web/privacy.html`.

| Field | Meaning |
| --- | --- |
| `policyUrl` | Derived from the canonical origin (`003` FR-075), not written literally |
| `dataCollected` | Empty. Both stores' forms answer "no data collected" |
| `permissions` | Microphone only, with `claims.purposeSentence` as the stated reason |

**The property that makes this true is architectural, not editorial.** The app makes no network requests
during use (FR-030), which `apps/web/e2e/no-network.spec.ts` already asserts. FR-103 binds the
declaration to that check rather than to a promise: if analytics, crash reporting, or an update ping is
ever added, the existing gate goes red and the declaration becomes false in the same commit — which is
the sequencing the spec's "a privacy claim is a promise about the future" edge case asks for.

---

## 6. Version and build record

**Where**: `apps/mobile/package.json` (`version`) and one integer constant in `apps/mobile/app.config.ts`.

| Value | Source | Rule |
| --- | --- | --- |
| Marketing version | `package.json` `version` | Changes when the app changes |
| `ios.buildNumber` | The integer, stringified | Increments on every submission, including a resubmission of an unchanged version |
| `android.versionCode` | The same integer | Same value, so the two stores cannot drift |

---

## 7. Submission checklist

**Where**: `listing/submission.md`.

The only entity whose purpose is to describe a boundary rather than hold data: the point where version
control stops and a person typing into a web console begins (FR-108). One row per console field, naming
the repository artefact that fills it, plus the fields no artefact can fill — the questionnaires, the
account-level settings, the re-check of `limits.json` against current store documentation.

A gate can prove the repository's copy is correct. It cannot prove what was pasted. This file is what
makes that gap deliberate rather than assumed.

---

## Relationships

```text
packages/tokens ──────────────► generate-icons.mjs ──► listing/assets/*.png
      │                              (via the built <style> block, D6)   └─► apps/web/public/*.svg
      │
listing/store-listing.json
      ├── claims ──────────────► apps/mobile/app.config.ts ──► Info.plist, AndroidManifest
      ├── claims ──────────────► apps/web/privacy.html
      ├── stores.ios ──────────┐
      ├── stores.android ──────┤──► verify-listing.mjs ──► CI gate
      └── privacy ─────────────┘         ▲        ▲
                                         │        │
listing/limits.json ─────────────────────┘        │
listing/out-of-scope-claims.json ────────┬────────┘
                                         └──────► apps/web/e2e/metadata.spec.ts

apps/web/dist/index.html (rendered text) ─────► verify-listing.mjs   [FR-112]
```

The last edge is the one worth reading twice. FR-112 compares the listings against the **built
document's rendered text**, not against `apps/web/src/content.ts`. Comparing the listing to the constant
that produces the web page would pass whether or not the web page says anything — `003`'s `tasks.md`
records that exact failure shape from `001`.
