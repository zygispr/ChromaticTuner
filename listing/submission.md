# Submitting the listing

**Feature**: `004-app-store-listings` · FR-108, data-model §7

This file describes a boundary rather than holding data: the point where version control stops and a
person typing into a web console begins.

`pnpm verify:listing` can prove the repository's copy of every field is correct, within limit, and in
agreement with the built web page. It cannot prove what was pasted into App Store Connect or the Play
Console. Every row below names the artefact a console field is filled from, and the second half names
the fields **no artefact can fill** — so that gap is deliberate rather than discovered at submission.

---

## Where the values live

JSON carries no comments, so the orientation for `store-listing.json` lives here. Three files, and
nothing is authored twice:

| File                               | Holds                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `listing/store-listing.json`       | `claims` (store-independent facts), `stores.ios`, `stores.android`, `privacy`                     |
| `listing/limits.json`              | Each store's field limits and asset specifications, with the documentation URL each was read from |
| `listing/out-of-scope-claims.json` | The vocabulary no surface may use, shared with `apps/web/e2e/metadata.spec.ts`                    |

### What is authored, and what derives from it

Edit the left column. Never edit anything in the right column — it is generated or derived, and a hand
edit there is a second copy of a fact that has one author.

| Authored by a person                          | Derives from it, automatically                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `claims.appName`                              | The mobile home-screen label, the first word of the microphone prompt, the privacy page's prose                                                                     |
| `claims.purposeSentence`                      | `Info.plist`'s `NSMicrophoneUsageDescription`, the `react-native-audio-api` plugin's own copy of it, the privacy page's opening, and both stores' permission reason |
| `claims.identifier`                           | `ios.bundleIdentifier`, `android.package`, and the address a Play Store URL is built from                                                                           |
| `claims.corroboration`                        | What L6 requires both listings to say and L7 requires the built web page to say                                                                                     |
| `stores.ios.*`, `stores.android.*`            | Nothing — these are the leaves, bounded by `limits.json`                                                                                                            |
| `privacy.policyPath`                          | The policy URL, composed with the origin the build decided on                                                                                                       |
| `apps/mobile/package.json`'s `version`        | The marketing version in both stores                                                                                                                                |
| `BUILD_NUMBER` in `apps/mobile/app.config.ts` | `ios.buildNumber` and `android.versionCode`, which is why they cannot drift                                                                                         |
| `packages/tokens`                             | Every colour in `listing/assets/*.png` and in `apps/web/public/*.svg`, via `pnpm listing:assets`                                                                    |

Keys beginning with `$` in the JSON are annotations explaining the data rather than data. Every check
skips them, which is deliberate: a note recording _why_ a term is forbidden would otherwise trip the
check that forbids it.

`apps/mobile/app.json` is gone. It used to hold the identity these values now derive into, including two
byte-identical copies of the purpose sentence.

### The one value that is permanent

`claims.identifier` — `pro.chromatictuner.app` — is **permanent from first publication**. Neither store
permits changing it afterwards, and it is the half of the identity a user sees, in the Play Store URL
that gets pasted into a chat. Everything else on this page can be edited after release; that one cannot.
Open action 1 below is the check to run before it becomes irreversible.

It was `com.chromatictuner.app` until 2026-08-05. That value is **not available**: Apple refuses to
register it — "the app identifier cannot be registered to your development team because it is not
available" — which means another Apple account holds it. Do not go back to it.

`pro.chromatictuner.app` is confirmed free on **Apple only**, by registering it: Xcode issued
`iOS Team Provisioning Profile: pro.chromatictuner.app` and a Release build signed against it. Google
Play availability is **unverified** and cannot be checked without a Play Console attempt — see open
action 1.

---

## App Store Connect

| Console field                 | Filled from                                                                                                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App Name                      | `stores.ios.name`                                                                                                                                                                                                    |
| Subtitle                      | `stores.ios.subtitle`                                                                                                                                                                                                |
| Promotional Text              | `stores.ios.promotionalText` — the one field Apple lets you edit without review                                                                                                                                      |
| Description                   | `stores.ios.description`                                                                                                                                                                                             |
| Keywords                      | `stores.ios.keywords` — paste verbatim, **including the absence of spaces after the commas**; a space costs a character out of the 100                                                                               |
| Primary Category              | `stores.ios.primaryCategory`                                                                                                                                                                                         |
| Secondary Category            | `stores.ios.secondaryCategory`                                                                                                                                                                                       |
| Age Rating                    | `stores.ios.ageRating` — the _outcome_; the questionnaire itself is below                                                                                                                                            |
| Privacy Policy URL            | The origin the site is deployed to, plus `privacy.policyPath`. Read it off the deployed page's `<link rel="canonical">` rather than typing it — `pnpm verify:listing` checks that the built page and this path agree |
| App Privacy → Data Collection | `privacy.dataCollected` is empty: answer "Data Not Collected"                                                                                                                                                        |
| Microphone purpose string     | `claims.purposeSentence`, already in `Info.plist` via `app.config.ts`. Do not retype it into the console                                                                                                             |
| Bundle ID                     | `claims.identifier`                                                                                                                                                                                                  |
| Version                       | `apps/mobile/package.json`'s `version`                                                                                                                                                                               |
| Build                         | `BUILD_NUMBER` in `apps/mobile/app.config.ts` — see "Every submission" below                                                                                                                                         |
| App Icon (1024×1024)          | `listing/assets/icon-ios-1024.png`                                                                                                                                                                                   |
| Screenshots, 6.9" iPhone      | `listing/assets/screenshots/ios/light/` and `.../dark/`                                                                                                                                                              |

## Google Play Console

| Console field              | Filled from                                                                                                                                |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| App name                   | `stores.android.title`                                                                                                                     |
| Short description          | `stores.android.shortDescription`                                                                                                          |
| Full description           | `stores.android.fullDescription`                                                                                                           |
| App category               | `stores.android.category`                                                                                                                  |
| Content rating             | `stores.android.contentRating` — the _outcome_; the IARC questionnaire itself is below                                                     |
| Privacy policy             | The same derived address as Apple's                                                                                                        |
| Data safety                | `privacy.dataCollected` is empty, and `privacy.permissions` is the microphone alone. Read the open action below before answering this form |
| App icon (512×512)         | `listing/assets/icon-play-512.png`                                                                                                         |
| Feature graphic (1024×500) | `listing/assets/feature-graphic-1024x500.png` — Play will not publish without it, and no other store has an equivalent                     |
| Phone screenshots          | `listing/assets/screenshots/android/light/` and `.../dark/`                                                                                |
| Package name               | `claims.identifier`                                                                                                                        |
| Version code / name        | `BUILD_NUMBER` in `app.config.ts` / `apps/mobile/package.json`'s `version`                                                                 |

## Where each icon comes from

Every icon this product ships, and what you do with it at submission time. `pnpm verify:listing`
checks this table against the resolved Expo config and the built web output, so a row that stops being
true fails a gate rather than misleading the next reader (contract L16).

Until `008` this section was a single sentence claiming the adaptive launcher icon was "built into the
app". It was not: nothing referenced it, and the app shipped Expo's blank white placeholder. A
checklist that asserts a false thing is worse than one that omits it, because it is the sentence that
stops you checking.

| Artefact                                          | Where it is consumed                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------- |
| `listing/assets/icon-ios-1024.png`                | **Console field** — App Store Connect, App Icon                              |
| `listing/assets/icon-play-512.png`                | **Console field** — Play Console, App icon                                   |
| `listing/assets/feature-graphic-1024x500.png`     | **Console field** — Play Console, Feature graphic                            |
| `listing/assets/icon-adaptive-foreground.png`     | **Reference copy** — see the note below                                      |
| `apps/mobile/assets/icon.png`                     | **Built into the app** — `app.config.ts` `icon` → the iOS AppIcon set        |
| `apps/mobile/assets/icon-adaptive-foreground.png` | **Built into the app** — `android.adaptiveIcon.foregroundImage`              |
| `apps/mobile/assets/icon-adaptive-background.png` | **Built into the app** — `android.adaptiveIcon.backgroundImage`              |
| `apps/web/public/icon.svg`                        | **Served by the web app** — `rel="icon"`, and the manifest's `any` icon      |
| `apps/web/public/icon-maskable.svg`               | **Served by the web app** — the manifest's `maskable` icon                   |
| `apps/web/public/apple-touch-icon.png`            | **Served by the web app** — `rel="apple-touch-icon"`; iOS Add to Home Screen |
| `apps/web/public/icon-192.png`                    | **Served by the web app** — manifest raster                                  |
| `apps/web/public/icon-512.png`                    | **Served by the web app** — manifest raster, `any maskable`                  |

**Nothing in this table is uploaded twice.** The four console fields are the only ones you touch by
hand; everything else reaches a user through a build.

**On `listing/assets/icon-adaptive-foreground.png` — a reference copy, and deliberately not a console
field.** Play has no adaptive-foreground upload: an Android adaptive icon comes out of the binary, not
out of the console. This file exists as the reference `004` drew for that design, and the bytes Android
actually ships are `apps/mobile/assets/icon-adaptive-foreground.png` — a separate file, drawn at the
safe-zone scale, because Expo resolves an icon path against the working directory rather than the
project root and pointing the native build at `listing/` would make `apps/mobile` unbuildable without
it (research `008` D2). Both are generated from the same mark and the same palette by
`listing/scripts/generate-icons.mjs`, and `listing/assets/artwork.json` records a digest for each.

**Regenerating.** `pnpm build && pnpm listing:assets` rewrites every artefact above from the shipped
colour tokens. It needs the Playwright Chromium and so is a release step, not a merge gate; the
committed digests are what CI checks instead.

---

## What no artefact can fill

These are answered by a person, in a browser, and their outcomes are recorded back into
`store-listing.json` where a value results:

1. **Apple's age-rating questionnaire.** `stores.ios.ageRating` records the result, not the answers.
2. **Play's IARC content-rating questionnaire.** Same: `stores.android.contentRating` is the outcome.
3. **Play's Data safety form.** Every question is answered from `privacy`, but the form itself is a
   console workflow with no exportable representation.
4. **Developer contact address, support URL, marketing URL, copyright line.** Account-level or
   listing-level fields with no repository equivalent. The privacy page points at "the contact address
   published on the store listing pages", so whatever is entered here is what that sentence refers to.
5. **Pricing, availability, and distribution countries.** `claims.price` says free with no in-app
   purchases; the console is where that becomes true.
6. **Export-compliance declarations.** The app uses no encryption of its own.
7. **Re-checking `listing/limits.json` against current store documentation.** Each store block carries
   the URLs its limits were read from and a `lastChecked` date. **Re-read them and reset the date every
   time this listing is submitted.** A limit that silently tightened is a truncated store name nobody
   sees until it is live — these are facts about two products owned by other companies, and they change
   without notice.

   Last read **2026-08-05**. No limit had tightened, but the exercise found three things worth knowing
   before doing it again: one of the two recorded URLs had gone 404, Apple measures the keyword field in
   **bytes** rather than characters, and Apple's screenshot cap is per **display size** rather than per
   appearance — so light and dark share one allowance of ten. All three are now encoded in
   `limits.json` and enforced by `pnpm verify:listing`.

---

## Every submission

**Increment `BUILD_NUMBER` in `apps/mobile/app.config.ts`.** Every submission, including a
_resubmission of an unchanged marketing version_ — that is the case the rule exists for (D10, FR-107).
One integer feeds `ios.buildNumber` and `android.versionCode`, so the two stores cannot drift into the
state where one accepts a build and the other rejects it as a duplicate.

The marketing version is a different thing and lives in `apps/mobile/package.json`. It changes when the
app changes; `BUILD_NUMBER` changes when a build is submitted.

Run before submitting:

```bash
pnpm build && pnpm verify:listing            # fields, limits, vocabulary, assets, identity, privacy
pnpm --filter @chromatic-tuner/mobile verify:release-bundle   # the capture source is not in the build
pnpm listing:screenshots                     # macOS + Xcode + an Android emulator; not a CI gate
```

---

## Open actions before the first submission

**1. Confirm the identifier against the site's origin, and confirm it is free on Play — permanent
afterwards (D3, T067).** `claims.identifier` is `pro.chromatictuner.app`. Two checks, both before the
first submission:

- **Play availability.** Only Apple has been verified. Play package names are globally unique and
  permanent _even after an app is deleted_, so a collision discovered after publishing cannot be
  undone by unpublishing. Check it in the Play Console before the first Android upload.
- **Origin.** Reverse-DNS reads this as the domain `chromatictuner.pro`. If `VITE_SITE_URL` ends up
  being an origin that does not correspond, that mismatch is fine for the stores — neither verifies
  domain ownership — but must be **accepted in writing here before submission**. Note it does close
  off Universal Links and App Links, which both verify ownership by fetching a file from the domain.

**2. Decide what a release Android build declares (T045).** `expo prebuild -p android` generates a main
manifest declaring `INTERNET`, `SYSTEM_ALERT_WINDOW`, `VIBRATE`, `READ_EXTERNAL_STORAGE` and
`WRITE_EXTERNAL_STORAGE` alongside the `RECORD_AUDIO` the config actually asks for. None of them comes
from `app.config.ts`; they come from the React Native template and from autolinked modules, with
`expo-dev-client` contributing `SYSTEM_ALERT_WINDOW`.

This does not make `privacy.dataCollected` false — a permission is a capability, not a transmission, and
`apps/web/e2e/no-network.spec.ts` asserts nothing is transmitted. But `INTERNET` in a manifest is the
first thing a reviewer reading a "no data collected" declaration will ask about, and a store build that
still carries the development client is a separate problem of its own.

The remedy is to make `expo-dev-client` conditional on a non-production build profile, then re-run
`expo prebuild -p android` and re-read `android/app/src/main/AndroidManifest.xml`. It is recorded rather
than done because this repository has no Android SDK to build and run the result against, and an
unverified change to how the app is assembled is not an improvement.

**3. Capture the Android screenshots (T038).** `listing/assets/screenshots/android/{light,dark}/` do not
exist, and `pnpm verify:listing` is red because of it. Play requires them. Install the Android SDK
platform-tools, create a **1080×1920** AVD — the common 1080×2400 default is 2.22:1 and Play rejects it
— install a capture build, and run `pnpm listing:screenshots`.
