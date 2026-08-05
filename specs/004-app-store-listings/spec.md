# Feature Specification: App Store Listing Optimisation

**Feature Branch**: `004-app-store-listings`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "adjust the spec and include any app-store listing optimisation for the iOS and Android shells"

## Overview

`003-seo-discoverability` taught the web page to describe itself, and recorded app-store listing
optimisation as explicitly out of scope. This feature takes that bullet back in. It is the same
problem — a product nobody can find is a product nobody uses — on the two surfaces `003` could not
reach, where the discovery mechanism is not a crawler but a store's search field and a listing page a
shopper skims in a few seconds.

The starting position is worse than the web page's was. Inspecting `apps/mobile` as it stands:

**Gap 1 — there is no listing at all.** The app's configuration carries a name, a slug, a version, and
the microphone purpose strings. It carries no description, no keywords, no category, and no privacy
policy address. Every field a store shows to a shopper is empty or absent.

**Gap 2 — the app is named, not described.** The store name is the product's internal name — the same
defect `003`'s FR-061 fixed on the web. Store search is less forgiving than web search: a shopper types
"guitar tuner", and a name that does not contain those words competes badly for them.

**Gap 3 — there is nothing to look at.** `apps/mobile` has no assets directory: no app icon, no
adaptive icon, no screenshots. The icon is the most-seen element of any listing — it appears in search
results, on the listing page, and on the home screen forever afterwards — and today it is whichever
placeholder the tooling defaults to. Screenshots, which decide whether a shopper who reached the
listing installs, do not exist.

**Gap 4 — the app is not submittable.** Both stores refuse an app that requests the microphone without a
reachable privacy policy, and both require a completed privacy declaration. The app's genuinely strong
position here — it collects nothing, transmits nothing, and works offline — is currently stated nowhere
a store or a shopper can read it. Separately, the two shells disagree about their own identity: the iOS
bundle identifier is `com.prielaidas.chromatictuner` while the Android package is
`com.chromatictuner.app`. Neither store permits changing that value after first publication.

**Gap 5 — nothing would keep it true.** A listing is edited in a web console by a person, months apart
from the code. That is exactly the shape of drift `003`'s US4 was written against: the copy claims a
feature that was never built, a screenshot shows a screen that no longer exists, and nothing fails.

This spec continues the numbering of `001`, `002`, and `003` — **FR-088 onward, SC-035 onward**.
Requirement numbers in this project are cited by number in code comments and in `contracts/`, so a
second FR-060 meaning something different would silently corrupt those references.

**Scope boundary.** This is a listing feature. It adds metadata, copy, and images describing the mobile
shells, plus the gates that keep them honest, plus one publicly reachable privacy policy that both
stores require. It does **not** add, remove, or alter any tuner capability, and it must not: the mobile
app's behaviour after this feature must be indistinguishable from its behaviour before, apart from its
icon. Everything `001` placed out of scope stays out of scope, and this feature is specifically where
the temptation to claim otherwise appears.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A guitarist searching a store finds the tuner and understands it (Priority: P1)

Someone with a guitar in their lap opens a store and types what they want: "guitar tuner", "chromatic
tuner", "free tuner". Today the app has no realistic chance of being returned — its store name is a
codename, and it has no description, no keywords, and no category for either store to match against.

After this change the listing arrives describing itself: a name that leads with what the tool is, a
short line that completes the pitch rather than repeating it, a full description that answers the
questions a first-time user asks, and discovery terms drawn from what the app genuinely does.

**Why this priority**: It is the feature. Every other story either presents this text (US2), makes it
publishable (US3), or keeps it true (US4). A listing with no words is invisible regardless of how good
its screenshots are.

**Independent Test**: Read the listing text alone — no images, no install — and confirm a reader can say
what the app is, what it costs, what it needs, and how to use it. Separately confirm each field fits its
store's published length limit without truncation.

**Acceptance Scenarios**:

1. **Given** a shopper searching a store for what the tool does rather than for its name, **When** the
   listing's name and searchable text are read, **Then** they contain the terms that shopper typed — not
   only the product's internal name.
2. **Given** the listing name and short summary shown together in a search result row, **When** they are
   read out of context, **Then** they state what the app does and that it is free, and neither is
   truncated at the store's published limit.
3. **Given** the full description, **When** only the portion visible before the store's "more" control is
   read, **Then** it already conveys purpose, cost, and requirement — a microphone — without relying on
   the expanded text.
4. **Given** the full description in its entirety, **When** it is read as an answer to "how do I tune a
   guitar with this", **Then** it answers directly and completely enough to stand on its own.
5. **Given** the two listings, **When** the iOS and Android copy are compared, **Then** they make the
   same claims about the same product; a wording difference forced by a store's field structure is
   permitted, a difference in substance is not.
6. **Given** the listing copy and the web page's copy from `003`, **When** they are compared, **Then**
   they agree — a person who finds one and then the other is not told two different things.
7. **Given** the app's actual capabilities, **When** every claim and every discovery term is checked,
   **Then** none refers to tuning presets, per-string targets, custom tunings, reference-tone playback,
   capo or transposition, a metronome, accounts, or sync — all explicitly out of scope in `001`.

---

### User Story 2 - The listing looks like a tuner at a glance (Priority: P2)

A shopper scanning a results page sees an icon roughly the size of a fingernail and, if the icon earns
it, a strip of screenshots. That is the entire decision. Today the icon is a framework placeholder and
there are no screenshots, so the app loses that comparison before its copy is ever read.

After this change the listing carries an icon that reads as a tuner at the smallest size a store
renders, and screenshots taken from the real running app showing what tuning actually looks like — in
both light and dark appearance, at every device size the stores require.

**Why this priority**: On a store, images are read before words. It sits below US1 only because store
search matches on copy, so a listing with words and placeholder art is still findable, while the reverse
is not.

**Independent Test**: View the icon at the smallest size each store displays it, among unrelated icons,
and confirm it is identifiable; regenerate every screenshot from a clean checkout with a single
documented command and confirm the output matches what ships.

**Acceptance Scenarios**:

1. **Given** the app icon at the size a store renders it in a search results list, **When** a person sees
   it among unrelated app icons, **Then** it reads as a tuner rather than as an unlabelled shape or a
   wordmark.
2. **Given** each store's icon requirements — shape, masking, background, and rules about transparency
   and pre-applied corner rounding — **When** the icon is submitted, **Then** it satisfies them without
   the store cropping away meaning.
3. **Given** the set of screenshots, **When** each store's required device sizes are enumerated, **Then**
   a screenshot exists for every one of them, including tablet sizes for as long as the app declares
   tablet support.
4. **Given** the screenshots, **When** they are compared against the running app, **Then** they show the
   real interface displaying a real reading — not a mockup, not an empty state, and not a screen the app
   no longer has.
5. **Given** the app supports light and dark appearance (Principle IV), **When** the screenshot set is
   reviewed, **Then** both appearances are represented.
6. **Given** a screenshot shown at the thumbnail size a store uses in a results row, **When** a person
   looks at it, **Then** the note readout is still legible.
7. **Given** a clean checkout, **When** the documented screenshot process is run, **Then** it reproduces
   the shipped screenshots, so a UI change makes them regenerate rather than rot.

---

### User Story 3 - The listing passes review the first time (Priority: P3)

Submission is where a microphone app meets its hardest audience. Both stores reject an app that asks for
the microphone without a reachable privacy policy and a completed privacy declaration, and both ask
exactly what data leaves the device. This app's honest answer — nothing is recorded, nothing is stored,
nothing is transmitted, and it works with no network at all — is a genuine selling point currently
written down nowhere a reviewer or a shopper can see.

After this change, every declaration a store requires exists, is truthful, and is derived from the same
claims the rest of the app already makes; and the two shells stop disagreeing about their own identity
before that disagreement becomes permanent.

**Why this priority**: It is a gate, not a lever — it does not improve the listing, it makes the listing
publishable. It ranks below US1 and US2 because those determine the listing's value once it is live, and
this determines only whether it goes live on the first attempt or the third.

**Independent Test**: Walk each store's submission requirements for an app requesting microphone access
and confirm every required artefact exists in the repository, is reachable, and states something true of
the built app.

**Acceptance Scenarios**:

1. **Given** each store's privacy declaration, **When** it is completed from the repository's stated
   claims, **Then** it declares that no data is collected — consistent with the app making no network
   requests during use (FR-030).
2. **Given** both listings, **When** a reviewer or a shopper follows the privacy policy link, **Then** it
   reaches a publicly readable statement of what the app does with audio, in plain language, agreeing
   with the in-app privacy statement (FR-031).
3. **Given** the microphone purpose strings shown at the permission prompt, **When** they are compared
   with the listing copy and the privacy policy, **Then** all three explain the same purpose in the same
   terms.
4. **Given** the two shells' identifiers, **When** they are compared, **Then** they follow one scheme —
   and the chosen value is recorded as permanent, because neither store allows changing it after first
   publication.
5. **Given** each store's age or content rating questionnaire, **When** it is answered from the app's
   actual content, **Then** the resulting rating is recorded alongside the listing.
6. **Given** a submission, **When** the version and build identifiers are inspected, **Then** they follow
   a defined scheme that increments correctly for a resubmission of an unchanged version.
7. **Given** a listing field that a store console owns and the repository cannot write, **When**
   submission is prepared, **Then** a checklist maps every repository artefact to the console field it
   fills, so nothing is transcribed from memory.

---

### User Story 4 - The listing does not silently rot (Priority: P4)

A year from now the tuner has changed and the listing has not. A screenshot shows a control that was
removed. The description mentions behaviour that changed. A new paragraph pushed the store name three
characters over its limit and the console silently truncated it. Nobody notices, because nothing fails —
the app still tunes, and the store still serves the listing.

After this change, the listing's text and assets live in the repository as the source of truth, and the
same quality gates that guard the rest of the project assert their limits, their existence, and their
truthfulness.

**Why this priority**: It protects the value of the other three rather than creating value itself, and it
is worth nothing until at least US1 exists. It is also what makes this feature constitutional — Principle
III requires correctness be demonstrated by tests, not by inspection.

**Independent Test**: Overrun a length limit, delete a required asset, and introduce a forbidden claim;
confirm the gates fail and each failure names the specific field or file at fault.

**Acceptance Scenarios**:

1. **Given** the listing text and assets are complete and within limits, **When** the quality gates run,
   **Then** they pass.
2. **Given** any listing field exceeds its store's published limit, **When** the gates run, **Then** they
   fail and name that field and the limit it broke.
3. **Given** any required listing field is emptied, **When** the gates run, **Then** they fail and name
   what is missing.
4. **Given** a listing asset is moved, deleted, or replaced at the wrong dimensions, **When** the gates
   run, **Then** they fail rather than shipping a broken or rejected reference.
5. **Given** listing copy that names a capability from `001`'s out-of-scope list, **When** the gates run,
   **Then** they fail and name the offending term.
6. **Given** the iOS and Android copy, **When** the gates run, **Then** a substantive divergence between
   them, or between either and the web copy from `003`, fails.
7. **Given** this feature changes no tuner behaviour, **When** the full existing gate suite runs, **Then**
   every gate — lint, format, typecheck, unit tests, coverage, mobile tests, end-to-end, accessibility,
   and the offline check — is still green.

---

### Edge Cases

- **The stores' field structures do not match each other.** One store's name-plus-subtitle pair and
  dedicated keyword field do not map onto another's name-plus-short-description, where discovery terms
  must live inside prose. A single shared string reused everywhere would waste one store's fields and
  overrun the other's. Shared *claims* with per-store *phrasing* is the shape that survives — so the gate
  must compare substance, not bytes.
- **Length limits are counted in a store's units, not in intuition.** Limits are per-field, differ between
  the stores, and are enforced silently by truncation rather than by an error. A field that reads fine in
  an editor can arrive in a search result cut mid-word.
- **Declaring tablet support has a cost.** The app currently declares tablet support, which obliges a full
  set of tablet screenshots and an interface that looks deliberate at that size. Producing them and
  withdrawing the declaration are both acceptable answers; shipping the declaration without the
  screenshots is not, because it fails review.
- **Screenshots of a tuner need a signal to show.** An idle tuner shows an empty state. A screenshot worth
  taking shows a note being read, which means the capture process needs a deterministic audio source — the
  same problem the end-to-end suite already solved with generated reference signals.
- **The icon has to survive two different maskings.** One platform applies its own corner rounding to a
  square with no transparency; another crops an adaptive icon to a shape the device chooses, cutting into
  the margins. An icon composed for one is clipped by the other.
- **Colour literals in store assets.** Principle IV forbids hard-coded colour values in `apps/**`. Store
  artwork is exactly the kind of asset that acquires its own palette by hand and drifts away from the app
  it depicts.
- **A privacy claim is a promise about the future.** "No data collected" is true today because the app
  makes no network requests at all. Any later addition of analytics, crash reporting, or an update check
  would make the store declaration false — a more serious failure than an out-of-date screenshot.
- **The identifier decision is irreversible.** The two shells currently disagree. Whichever value is
  chosen is permanent from first publication; choosing it beforehand costs nothing, and afterwards it
  cannot be chosen at all.
- **The store console is outside version control.** A gate can prove the repository's copy is correct. It
  cannot prove that what a person pasted into the console matches it. The process has to close that gap
  deliberately rather than assume it away.
- **Keyword temptation.** The highest-volume tuner queries include terms for capabilities `001` ruled out —
  drop tunings, capo, metronome, presets. They would rank, they would be false, and a store removes
  listings whose metadata does not match the app.
- **The app is not currently releasable.** It builds only as a development client, has no icon assets, and
  has never been submitted. This feature produces listing artefacts; it does not by itself make a release
  build exist.
- **The web tuner and the store listings compete for the same queries.** Both target "guitar tuner". They
  are different surfaces with different searchers and this is not a conflict to resolve, but the claims
  must not diverge — which is what FR-094 binds.

## Requirements *(mandatory)*

### Functional Requirements

**Listing content**

- **FR-088**: The listing text for both stores MUST live in the repository as the single source of truth,
  structured so that each store's fields derive from one shared set of claims rather than being maintained
  twice.
- **FR-089**: The store name MUST lead with what the tool does in the words a shopper searches for, not
  only the product's internal name, and MUST fit each store's published length limit without truncation.
- **FR-090**: Each listing MUST carry a short summary that extends the name rather than repeating it,
  stating the app's purpose and that it is free, within that store's published limit.
- **FR-091**: Each listing MUST carry a full description explaining what the app is, what it needs, how to
  use it, and what it costs. Its opening MUST convey purpose, cost, and requirement before any store
  control truncates it.
- **FR-092**: The listing MUST supply discovery terms in the form each store accepts — a dedicated keyword
  field where one exists, and terms naturally present in the description where it does not.
- **FR-093**: Every claim and every discovery term MUST be true of the app as built, and MUST NOT name any
  capability listed as out of scope in `001-chromatic-guitar-tuner` — tuning presets, per-string targets,
  custom tunings, reference-tone playback, accounts, sync, capo or transposition, or practice tools —
  including inside a negation.
- **FR-094**: The listings' claims MUST agree with the web page's title, summary, and supporting content
  from `003-seo-discoverability`.
- **FR-095**: The iOS and Android listings MUST make the same claims about the same product. Per-store
  phrasing differences forced by field structure are permitted; a difference in substance is a defect.
- **FR-096**: Each listing MUST declare a store category and an age or content rating derived from the
  app's actual content, recorded in the repository alongside the copy.

**Visual identity**

- **FR-097**: The app MUST have a first-party icon that identifies it as a tuner at the smallest size
  either store renders it, satisfying both stores' shape, masking, and transparency rules without the
  store cropping away meaning.
- **FR-098**: The icon and all listing artwork MUST derive their colours from the shared design tokens
  rather than from literal colour values, so the listing and the app cannot drift apart visually.
- **FR-099**: A screenshot MUST exist for every device size each store requires, including tablet sizes for
  as long as the app declares tablet support. If tablet screenshots are not produced, the tablet
  declaration MUST be withdrawn in the same change.
- **FR-100**: Screenshots MUST be captured from the real running app displaying a real reading, and MUST be
  produced by a documented, repeatable process from a clean checkout rather than captured by hand.
- **FR-101**: The screenshot set MUST represent both light and dark appearance (Principle IV).
- **FR-102**: The primary note readout MUST remain legible in a screenshot shown at the thumbnail size a
  store uses in a search results row.

**Review readiness**

- **FR-103**: Each store's privacy declaration MUST be recorded in the repository, MUST state that the app
  collects and transmits no data, and MUST remain consistent with FR-030's offline behaviour and the
  existing no-network verification.
- **FR-104**: A privacy policy MUST be publicly reachable at a stable address and linked from both
  listings. It MUST state in plain language what the app does with audio, and MUST agree with the in-app
  privacy statement (FR-031).
- **FR-105**: The microphone purpose strings, the listing copy, and the privacy policy MUST explain the
  same purpose in the same terms.
- **FR-106**: Both shells MUST use one consistent application identifier scheme. The chosen value MUST be
  recorded as permanent, because neither store permits changing it after first publication.
- **FR-107**: The shells MUST define a version and build identifier scheme that increments correctly for a
  resubmission of an unchanged version.
- **FR-108**: A submission checklist MUST map every repository artefact to the store console field it
  fills, and MUST name every field the console owns that the repository cannot supply.

**Verification**

- **FR-109**: Each listing field MUST be asserted automatically against its store's published length limit,
  with the limits recorded in one place; an over-limit or empty field MUST fail the gate and name the field
  and the limit it broke.
- **FR-110**: The out-of-scope vocabulary from FR-093 MUST be asserted automatically against all listing
  text, failing the gate and naming the offending term.
- **FR-111**: Every listing asset MUST be verified to exist and to match the dimensions and format its store
  requires, so a moved, deleted, or mis-sized asset fails a gate rather than a review.
- **FR-112**: The agreement required by FR-094 and FR-095 MUST be asserted automatically, so a change to one
  store's copy, or to the web copy, cannot silently diverge from the others.
- **FR-113**: This feature MUST NOT change any tuner behaviour. The existing gates — lint, format,
  typecheck, unit tests, coverage, mobile tests, end-to-end, accessibility, and the offline check — MUST
  remain green, and no requirement here may alter the audio path, the note math, the reading filter chain,
  or the two output channels.

### Key Entities

- **Listing claims**: The shared, store-independent set of true statements about the app — what it is, what
  it costs, what it needs, what it does with audio. The source both stores' copy and the web copy are
  derived from and checked against.
- **Store listing**: One store's rendering of those claims into its own fields — name, short summary, full
  description, discovery terms, category, rating. Bounded by that store's published limits.
- **Listing assets**: The icon and the screenshot set. Distinct from `003`'s web preview asset: an icon is a
  small square that must survive two different maskings, and screenshots are per-device-size captures of the
  real interface.
- **Privacy declaration**: The store-required statement of what data the app collects and transmits, plus
  the publicly reachable policy both stores link to. Its correctness depends on the app continuing to make
  no network requests.
- **Submission checklist**: The mapping from repository artefacts to store console fields, covering the
  boundary where version control ends and human transcription begins.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-035**: Every listing field for both stores is non-empty and within its published length limit,
  verified automatically, with zero over-limit and zero empty fields.
- **SC-036**: A reader shown only the store name and short summary can state what the app does and that it
  is free — confirmed by the same human-validation method used for the earlier features' UX gates.
- **SC-037**: Every claim in either listing is traceable to a true statement about the built app, with zero
  unmatched claims and zero occurrences of the out-of-scope vocabulary.
- **SC-038**: A screenshot exists for every device size both stores require, verified automatically, with
  zero missing sizes and both light and dark appearance represented.
- **SC-039**: Running the documented screenshot process from a clean checkout reproduces the shipped
  screenshots, so a UI change that invalidates them is visible in review rather than discovered in the
  store.
- **SC-040**: The app icon is identified as a tuner by a majority of reviewers shown it at store search
  result size among unrelated icons, using the same human-validation method as SC-036.
- **SC-041**: Both listings pass their store's review with zero rejections attributable to metadata, privacy
  declarations, missing assets, or claims not matching the app.
- **SC-042**: The privacy declaration for both stores states that no data is collected, and the existing
  no-network verification remains green — so the declaration is corroborated rather than merely asserted.
- **SC-043**: Overrunning a length limit, emptying a required field, deleting a required asset, and
  introducing a forbidden claim each cause the gates to fail with a message naming the specific field or
  file — demonstrated for all four.
- **SC-044**: The mobile app's behaviour is unchanged apart from its icon: every existing gate stays green,
  and no test in `apps/mobile` or `packages/*` required modification to accommodate this feature.
- **SC-045**: Within 30 days of publication, searching each store for the app's own name returns it, and
  searching for the primary intent term it targets returns it within the first page of results.

## Assumptions

- **Listing artefacts, not release engineering.** This feature produces the copy, assets, declarations, and
  gates that constitute a listing. Producing signed release builds, configuring a build service, automating
  submission upload, and managing signing credentials are release engineering — needed before anything can
  be submitted, but not listing optimisation, and out of scope here.
- **One locale, English.** Matching `003`'s assumption. Store listings support per-locale copy, and
  localising them is a well-understood later multiplier; the first listing is English only.
- **Both stores, one product.** The iOS and Android shells present the same app. Divergent positioning per
  platform is not wanted, and FR-095 makes that explicit.
- **The identifier is settled now.** The shells currently disagree (`com.prielaidas.chromatictuner` versus
  `com.chromatictuner.app`) and neither app has been published, so the value is still free to choose.
  **Resolved during planning: both become `com.chromatictuner.app`** (research D3). This spec had assumed
  the iOS value would win because a generated `ios/` project already carried it; that was wrong —
  `apps/mobile/ios/` is gitignored, so the identifier has one tracked occurrence and the two sides cost
  the same to change. With cost symmetric, the Android package wins because it is the half a user sees,
  in the Play Store URL that gets pasted into a chat.
- **The privacy policy is one page on the existing web app.** It is the cheapest reachable address the
  project controls, and it reuses the identity and canonical-address machinery `003` already built. This is
  a deliberate, narrow exception to `003`'s "no second content page" boundary, taken because both stores
  require the address and there is nowhere cheaper to put it.
- **Tablet support is a decision, not a default.** The app declares it today, most likely by template
  default rather than by intent. FR-099 forces the choice to be made explicitly rather than discovered at
  review.
- **Screenshots reuse the existing deterministic audio approach.** The end-to-end suite already drives the
  app with generated reference signals; capturing a screenshot of a live reading is the same problem, and
  inventing a second mechanism for it would fail Principle II.
- **The store consoles are edited by a person.** No requirement here assumes API access to a store console.
  FR-108 exists precisely because the last step is manual.
- **No paid or off-app work.** Paid install campaigns, review solicitation, store A/B experiments, and
  third-party ASO analytics subscriptions are outside anything the codebase can express.
- **No new runtime capability.** Nothing here may be satisfied by adding a feature to the app so the
  listing can claim it. The listing describes what exists; `001`'s out-of-scope list is unchanged.

### Explicitly out of scope

Recorded so they are not silently reintroduced during planning:

- Release engineering: signed release builds, build service configuration, submission automation, and
  signing credential management
- Localised listings, translated store copy, and per-region positioning
- Store A/B testing, custom product pages, and per-audience listing variants
- App preview videos — still screenshots only for the first listing
- In-app rating and review prompts, and any review solicitation
- Paid user acquisition, install campaigns, and third-party ASO analytics tooling
- Analytics, crash reporting, attribution, or update checks in the mobile shells — each would falsify
  FR-103's "no data collected" declaration
- Any tuner capability listed as out of scope in `001-chromatic-guitar-tuner`; listing copy is constrained
  to what exists, never the reverse
- Anything affecting the web app's discoverability, which `003-seo-discoverability` owns

## Dependencies

- **Developer accounts on both stores.** SC-041 and SC-045 cannot be satisfied until an Apple Developer
  Program membership and a Google Play developer account exist. Every other requirement — FR-088 through
  FR-113 — can be built and verified before then.
- **A canonical public address.** FR-104's privacy policy needs the address `003`'s FR-075 defers to build
  configuration. Until it exists, the policy page can be built and gated but not linked from a live listing.
- **`001-chromatic-guitar-tuner`**: FR-030 (offline operation) and FR-031 (the in-app privacy statement) are
  the factual basis for FR-103, FR-104, and FR-105 — this feature restates them for a store audience and
  must not overstate them. `001`'s out-of-scope list constrains FR-093.
- **`003-seo-discoverability`**: the web copy is the existing statement of the same claims; FR-094 and
  FR-112 bind the listings to it, and `003`'s corroboration gate is the model for FR-110.
- **The existing mobile test suite and the design tokens package** are the verification vehicle for FR-098
  and FR-109 through FR-113.
- **A release build of the mobile shells** is required before FR-100's screenshots can be captured from the
  real app. The shells currently build only as a development client.
