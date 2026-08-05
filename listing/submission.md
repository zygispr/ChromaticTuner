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

Three files, and nothing is authored twice:

| File                               | Holds                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- |
| `listing/store-listing.json`       | `claims` (store-independent facts), `stores.ios`, `stores.android`, `privacy`                     |
| `listing/limits.json`              | Each store's field limits and asset specifications, with the documentation URL each was read from |
| `listing/out-of-scope-claims.json` | The vocabulary no surface may use, shared with `apps/web/e2e/metadata.spec.ts`                    |

`claims.identifier` is **permanent from first publication**. Neither store permits changing it
afterwards. Everything else on this page can be edited later; that one cannot.

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

The adaptive launcher icon (`listing/assets/icon-adaptive-foreground.png`) is not a console field — it is
built into the app.

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
7. **Re-checking `listing/limits.json` against current store documentation.** Both files carry the URL
   each limit was read from and a `lastChecked` date. They are `null` today: the limits were recorded
   from prior knowledge rather than re-read from the published specifications, and writing a date beside
   an unverified value would make it look verified. **Set them before the first submission.** A limit
   that silently tightened is a truncated store name nobody sees until it is live.

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

**1. Confirm the identifier against the site's origin — permanent afterwards (D3, T067).**
`claims.identifier` is `com.chromatictuner.app`. If `VITE_SITE_URL` ends up being an origin that does
not correspond to it, that mismatch is fine but must be **accepted in writing here before submission**,
because it cannot be changed after the first publication.

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
