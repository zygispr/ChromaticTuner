# Feature Specification: Search & Answer-Engine Discoverability

**Feature Branch**: `003-seo-discoverability`

**Created**: 2026-08-04

**Status**: Draft

**Input**: User description: "Improve the SEO capabilities of this app. Research what improvements could be made and make a spec"

## Overview

The web tuner is invisible to search. Every improvement below follows from one root cause and four
gaps that were found by inspecting what the deployed page actually serves.

**Root cause — the page has no content until scripting runs.** The served document is a `<head>` and an
empty container; every word a person reads is produced by scripting afterwards. Search engines that
execute scripts do so on a delayed, budget-limited second pass, and most other consumers — link preview
generators in messaging apps, and the crawlers behind AI answer engines — do not execute scripts at all.
Those consumers currently see a page with a nine-character title and one short sentence.

**Gap 1 — the app is named, not described.** The document is titled with the product's internal name, a
word nobody types into a search box. Someone looking for this app searches for what it *does*: a
chromatic tuner, a guitar tuner that runs in the browser, one that works without installing anything.
Nothing on the page speaks that language.

**Gap 2 — a shared link is a naked URL.** The page carries no preview identity, so pasting it into a
chat, a forum, or a social post produces a bare link with no title, no summary, and no image. Musicians
recommend tools to each other in exactly those places, and this is the channel the product is least
equipped for.

**Gap 3 — nothing machine-readable says what this is.** There is no structured description of the app as
a *thing* — a free browser-based tuner, its price, its platform, its capabilities. Answer engines
increasingly assemble responses from these descriptions and cross-check them against what is visible on
the page; an app with neither is unlikely to be named when someone asks for a recommendation.

**Gap 4 — crawlers are given no direction.** There is no crawl-directive file, no machine-readable list
of pages, and no statement of which address is canonical. Nothing currently prevents a preview or
staging deployment from being indexed alongside the real one and competing with it.

This spec continues the numbering of `001-chromatic-guitar-tuner` and `002-tuner-ux-refinements` —
**FR-060 onward, SC-023 onward**. Requirement numbers in this project are cited by number in code
comments and in `contracts/`, so a second FR-005 meaning something different would silently corrupt
those references.

**Scope boundary.** This is a web-only feature. It changes what the page *says about itself* and adds
supporting content and assets. It does not touch the audio path, the note math, the reading filter
chain, or the two output channels, and it must not weaken any guarantee those already carry — in
particular the constitution's cold-start budget and FR-018's promise that the tuning display is fully
usable without scrolling.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A guitarist searching the web finds the tuner (Priority: P1)

Someone picks up a guitar, has no tuner within reach, and searches the web for one — typing what they
want rather than a brand name: "online guitar tuner", "chromatic tuner browser", "tune guitar with
microphone free". Today the app has essentially no chance of being returned for any of those, because
the only text a search engine reliably reads is a product codename and a one-line description, and the
page it is asked to judge appears empty.

After this change, the page arrives already describing itself: a heading that names what the tool is, a
short summary of what it does and what it costs (nothing), and enough supporting text for a search
engine to judge the page relevant to that intent — all present before any scripting runs, and all true.

**Why this priority**: It is the whole point of the feature and every other story depends on the same
foundation. A page with no server-delivered content cannot be previewed, cannot be summarised by an
answer engine, and cannot be audited. Fixing this one thing unlocks the rest.

**Independent Test**: Request the page the way a crawler does — no scripting, no interaction — and
confirm the response already contains a descriptive title, a meaningful summary, a single top-level
heading naming the tool, and supporting text about how to use it. Separately confirm that a real person
loading the page in a browser still reaches a usable tuning display within the cold-start budget, with
the display fully visible without scrolling.

**Acceptance Scenarios**:

1. **Given** a consumer that does not execute scripts, **When** it requests the page, **Then** the
   response contains the tool's name, its purpose, a single top-level heading, and supporting
   descriptive text — not an empty container.
2. **Given** the page's title and summary, **When** they are read out of context in a results list,
   **Then** they describe what the tool does in the words a searcher would use, not only the product's
   internal name.
3. **Given** a person opens the page in a browser, **When** the tuner becomes interactive, **Then** the
   primary tuning display is fully visible without scrolling on the smallest supported screen, exactly
   as before this change (FR-018).
4. **Given** a person opens the page, **When** it loads, **Then** the descriptive content does not push
   the tuning display out of view, cause a visible layout shift, or delay the first usable display
   beyond the cold-start budget.
5. **Given** the page now continues below the fold, **When** a person looks at the first screenful,
   **Then** something indicates there is more below, and that indication does not overlap the tuning
   display or its controls.
6. **Given** a person scrolled down to read the content and then returns to the page later, **When** it
   loads, **Then** they land on the tuning display, not on the position they left.
7. **Given** a person has scrolled down to the content, **When** they pluck a string, **Then** they are
   not left receiving tuning feedback they cannot see.
8. **Given** the app is deployed to more than one address (for example a preview build and the live
   site), **When** a crawler reaches either, **Then** it is told which single address is authoritative,
   and non-live addresses are not offered for indexing.
9. **Given** a crawler that does execute scripts, **When** it renders the page, **Then** what it sees is
   consistent with what it was served — the descriptive content is not swapped out for different claims.

---

### User Story 2 - A shared link shows what the tool is (Priority: P2)

A guitarist recommends the tuner to a bandmate by pasting the link into a group chat, a forum thread, or
a social post. Today that produces a bare URL: no title, no description, no image. The recipient has no
idea whether it is a tuner, a blog post, or spam, and the person recommending it looks like they shared
a broken link.

After this change the same paste produces a preview card: the tool's name, a one-line summary, and an
image that visibly reads as a tuner.

**Why this priority**: Word of mouth between musicians is the app's most likely growth channel and the
one where the current gap is most visible. It ranks below US1 only because it improves an existing path
rather than opening a closed one — and because it depends on the same page identity US1 establishes.

**Independent Test**: Paste the deployed URL into link-preview tooling and into at least two real
messaging or social platforms, and confirm a card renders with a title, a description, and a correctly
sized image on each.

**Acceptance Scenarios**:

1. **Given** the deployed URL, **When** it is pasted into a chat, forum, or social platform, **Then** a
   preview renders showing the tool's name, a summary of what it does, and an image.
2. **Given** the preview image, **When** it is displayed at the platform's standard size, **Then** it is
   not cropped past legibility and it visually reads as a tuner rather than a generic logo.
3. **Given** a platform that cannot display the preview image format, **When** it generates the card,
   **Then** it still receives an image it can render rather than falling back to no image at all.
4. **Given** the preview text, **When** it is compared with the page's own title and summary, **Then**
   they agree — a person clicking the card gets what the card promised.
5. **Given** someone installs the app to their home screen or desktop, **When** they view it in their
   list of installed apps, **Then** it presents a complete identity — name, description, and icon — of
   the same quality as the shared preview.

---

### User Story 3 - An answer engine recommends the tuner accurately (Priority: P3)

Someone asks an AI assistant "what's a good free guitar tuner I can use in a browser?" For the assistant
to name this app, it has to have been able to read the page, understand that it is a free browser-based
chromatic tuner requiring only a microphone, and trust that description enough to repeat it.

Today the page offers nothing to read and nothing to verify. After this change it carries an explicit,
machine-readable description of itself as an application — what it is, what it costs, what it runs on,
what it can do — and that description is corroborated by text visible on the page.

**Why this priority**: A growing share of "recommend me a tool" questions never reach a results page.
The cost is low once US1 exists, but the payoff is less certain and less directly measurable than either
story above, so it follows them.

**Independent Test**: Run the page through public structured-data validation and confirm zero errors,
then confirm every claim in the machine-readable description is also stated in text a person can read on
the page.

**Acceptance Scenarios**:

1. **Given** the page, **When** it is checked by a public structured-data validator, **Then** it reports
   a valid application description with zero errors.
2. **Given** the machine-readable description, **When** each claim in it is checked against the visible
   page, **Then** every claim is corroborated by text a person can read — no claim exists only in
   markup.
3. **Given** the app's actual capabilities, **When** the description and supporting content are reviewed,
   **Then** they claim nothing the app does not do — no tuning presets, no per-string targets, no custom
   tunings, no reference-tone playback, no accounts (all explicitly out of scope in 001).
4. **Given** the page's supporting content, **When** it is read as an answer to "how do I tune a guitar
   with this", **Then** it answers the question directly and completely enough to stand on its own.

---

### User Story 4 - Discoverability does not silently rot (Priority: P4)

Six months and three refactors from now, a change removes the summary, breaks the preview image path, or
lets the page's descriptive content drift out of sync with the machine-readable description. Nobody
notices, because nothing fails — the tuner still tunes. The regression surfaces months later as traffic
that quietly stopped arriving.

After this change, the guarantees above are asserted automatically alongside the existing quality gates,
so a regression blocks a merge rather than being discovered in analytics.

**Why this priority**: It protects the value of the other three rather than creating value itself, so it
is worth nothing until at least US1 has landed. It is also the story that makes this feature
constitutional — Principle III requires correctness be demonstrated by tests, not by inspection.

**Independent Test**: Remove a required piece of page identity — the summary, the canonical address, or
the preview image — and confirm the automated gate fails and names what is missing.

**Acceptance Scenarios**:

1. **Given** the required page identity is complete, **When** the quality gates run, **Then** they pass.
2. **Given** a required piece of identity is removed or emptied, **When** the gates run, **Then** they
   fail and the failure names the specific missing item.
3. **Given** the preview image or any referenced asset is moved or deleted, **When** the gates run,
   **Then** they fail rather than shipping a broken reference.
4. **Given** the machine-readable description asserts a capability, **When** the gates run, **Then** they
   verify the corresponding text is present on the page.
5. **Given** the app must still work with no network (FR-030), **When** the offline behaviour is
   verified, **Then** the added content and assets have not broken it.

---

### Edge Cases

- **A crawler can never grant microphone permission.** It will always render the pre-permission state.
  The content it sees must therefore be a truthful, self-sufficient description of the tuner rather than
  an error, an empty state, or a permission complaint that reads as a broken page.
- **The offline cache and the crawl-directive files.** Crawl directives and the page list describe the
  live site; caching a stale copy of them, or failing to serve them at all because the cache intercepted
  the request, both misinform crawlers. Offline behaviour for real users (FR-030) must be unchanged.
- **Descriptive content versus the no-scroll guarantee.** FR-018 requires the tuning display to be fully
  usable without scrolling on the smallest supported screen. Any content added for crawlers must not
  compete with it for that first screenful, and must not cause layout shift as the tuner initialises.
- **The page starts scrolling.** Today the layout is a single non-scrolling viewport. Placing content
  below the fold changes that, and several things break quietly if unconsidered: a browser restoring a
  previous scroll position would land a returning visitor on the text instead of the tuner; a player who
  has scrolled down and then plucks a string gets feedback they cannot see; and on-screen keyboards or
  browser chrome that resize the viewport must not drag the tuner out of view.
- **Content that grows.** Supporting content is the kind of thing that gets one more paragraph added
  every few months. Without a gate on the fold, the tuning display loses a little room each time and
  nobody notices until FR-018 is already broken.
- **Preview and staging deployments.** Any address other than the canonical one must not be offered for
  indexing, or it will compete with the live site for the same queries.
- **Reduced-motion, dark mode, and text-size preferences.** Added content is subject to the same
  Principle IV obligations as everything else: legible in both appearances, respecting the platform's
  text-size preference, and meeting WCAG 2.1 AA contrast.
- **Screen readers and the added content.** New headings and text change the document outline. The
  existing announcement behaviour and the a11y gates must still pass, and the tuning readout must remain
  the page's primary landmark rather than being buried under marketing copy.
- **Claims drifting ahead of the product.** Content written to attract searches is content nobody
  compiles. A phrase like "supports Drop D" would be both untrue and a direct violation of 001's
  out-of-scope list.
- **The mobile app shells.** `apps/mobile` has no crawlable surface. Nothing in this feature applies to
  it, and no requirement here may introduce a shared change that forces work in it.

## Requirements *(mandatory)*

### Functional Requirements

**Page identity and served content**

- **FR-060**: The page MUST deliver its descriptive content — title, summary, top-level heading, and
  supporting text — in the initial response, without requiring scripting to run.
- **FR-061**: The page title MUST describe what the tool does in the terms a searcher would use, not
  only the product's internal name, and MUST remain short enough to display without truncation in a
  results list.
- **FR-062**: The page MUST carry a summary that reads as a complete sentence describing the tool's
  purpose and cost, suitable for display beneath the title in a results list.
- **FR-063**: The page MUST have exactly one top-level heading, naming the tool.
- **FR-064**: The page MUST include supporting content that explains how to use the tuner and answers
  the questions a first-time user would ask, sufficient to stand alone as an answer.
- **FR-065**: All descriptive content MUST be true of the app as built. It MUST NOT claim any capability
  listed as out of scope in `001-chromatic-guitar-tuner` — tuning presets, per-string targets, custom
  tunings, reference-tone playback, accounts, sync, capo/transposition, or practice tools.
- **FR-066**: The tuning display MUST own the first viewport height exactly as it does today: on the
  smallest supported screen it MUST remain fully visible and usable with no scrolling, no tapping, and
  no expanding (FR-018). Supporting content MUST begin below that first viewport height, never within
  it.
- **FR-067**: The page becomes scrollable to reach the supporting content. Scrolling MUST NOT be
  required to tune, MUST NOT move the tuning display while a reading is live, and MUST NOT introduce a
  scroll position that the app restores on load — every visit MUST start at the tuning display.
- **FR-068**: Because the page today ends at the fold with no indication that anything follows, it MUST
  give a visible cue that supporting content exists below. The cue MUST NOT overlap or obscure any part
  of the tuning display or its controls.
- **FR-069**: Supporting content MUST NOT cause a visible layout shift as the tuner initialises, and
  MUST NOT be rendered in a way that delays the tuning display becoming interactive.
- **FR-070**: Added content MUST meet the same accessibility obligations as the rest of the app — legible
  in light and dark appearance, WCAG 2.1 AA contrast, respecting the platform's text-size and
  reduced-motion preferences — and MUST NOT displace the tuning readout as the page's primary content.
- **FR-071**: Keyboard and screen-reader users MUST be able to reach the supporting content in document
  order after the tuner, and MUST be able to skip past it back to the tuning controls without traversing
  every element.

**Crawl direction**

- **FR-072**: The site MUST publish crawl directives stating what may be crawled and where the page list
  can be found.
- **FR-073**: The site MUST publish a machine-readable list of its indexable addresses.
- **FR-074**: Every page MUST declare a single canonical address, so that the same content reached by
  different addresses is consolidated rather than competing with itself.
- **FR-075**: The canonical address MUST come from build configuration rather than being written into
  source, so that a deployment to a new address does not require editing content, and so the value can
  be supplied once the public address exists.
- **FR-076**: Deployments other than the canonical one MUST NOT be offered for indexing.

**Shareable identity**

- **FR-077**: The page MUST carry a preview identity — name, summary, and image — that link-preview
  generators can read without executing scripts.
- **FR-078**: The preview image MUST be provided in a format and at dimensions that the major messaging
  and social platforms render, and MUST remain legible at the size those platforms display it.
- **FR-079**: The preview text MUST agree with the page's own title and summary.
- **FR-080**: The installable app's identity — name, description, icons, and category — MUST be complete
  enough to present correctly in an operating system's list of installed applications.

**Machine-readable description**

- **FR-081**: The page MUST carry a structured, machine-readable description of itself as an application,
  including at minimum its name, what it does, its price, and the platform it runs on.
- **FR-082**: The structured description MUST validate against public structured-data validators with
  zero errors.
- **FR-083**: Every claim in the structured description MUST be corroborated by content visible on the
  page. No claim may exist only in markup.

**Verification**

- **FR-084**: The required page identity — title, summary, canonical address, top-level heading, preview
  identity, and structured description — MUST be asserted automatically as part of the existing quality
  gates, and a missing or empty item MUST fail the gate and name what is missing.
- **FR-085**: Every asset referenced by the page identity MUST be verified to exist and be reachable, so
  a moved or deleted asset fails a gate rather than shipping broken.
- **FR-086**: The offline guarantee (FR-030) MUST continue to hold after this feature lands, verified by
  the existing offline check.
- **FR-087**: FR-066's no-scroll guarantee MUST be asserted automatically at the smallest supported
  screen size, so that supporting content growing over time cannot silently encroach on the fold.

### Key Entities

- **Page identity**: The set of self-descriptive facts the page publishes about itself — its name,
  summary, canonical address, and preview identity. Read by search engines, link-preview generators, and
  answer-engine crawlers. Its defining property is that it is available without executing scripts.
- **Supporting content**: Human-readable text on the page explaining what the tuner is and how to use
  it. Serves both a first-time visitor and any consumer judging the page's relevance. Constrained to
  claims that are true of the built app.
- **Structured description**: A machine-readable statement of the app as an application entity — name,
  purpose, price, platform, capabilities. Must be corroborated by the supporting content.
- **Crawl directives**: The site-level statement of what may be crawled and where the address list lives.
- **Preview asset**: The image shown when the link is shared. Distinct from the app icon: it is sized and
  composed for a wide preview card rather than a small square.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-023**: Fetching the page with scripting disabled returns a document containing the tool's name, a
  descriptive title, a summary sentence, exactly one top-level heading, and at least 150 words of
  supporting text — verifiable without a browser.
- **SC-024**: Pasting the deployed link into at least three widely used messaging or social platforms
  produces a preview card with a title, a description, and a rendered image on all three.
- **SC-025**: A public structured-data validator reports zero errors and zero warnings on the page's
  application description.
- **SC-026**: An independent technical audit of the page's crawlability and metadata reports no
  outstanding issues in its search-optimisation category.
- **SC-027**: Every claim in the structured description is traceable to a sentence of visible page text —
  verified by review, with zero unmatched claims.
- **SC-028**: Cold start to a usable tuning display stays within the constitution's 2-second budget on
  the lowest supported target device, with the before/after numbers reported.
- **SC-029**: On the smallest supported screen, at initial load, every element of the tuning display and
  its controls is within the first viewport height with zero scrolling required, and cumulative layout
  shift on load does not increase.
- **SC-030**: A person arriving at the page can tell that content continues below the fold, confirmed by
  the same human-validation method used for the earlier features' UX gates.
- **SC-031**: Removing any single required identity item causes the quality gates to fail with a message
  naming that item — demonstrated for at least three different items.
- **SC-032**: Growing the supporting content until it would encroach on the fold causes the no-scroll
  gate to fail rather than shipping.
- **SC-033**: The canonical address is present in a major search engine's index within 30 days of
  deployment, and no non-canonical deployment address is indexed alongside it.
- **SC-034**: The existing gates — lint, format, typecheck, unit tests, coverage, end-to-end,
  accessibility, and the offline check — all remain green.

## Assumptions

- **Web only.** "This app" in the request means the web tuner. `apps/mobile` has no crawlable surface,
  and app-store listing optimisation is a different discipline with different artefacts; it is out of
  scope here.
- **Single page, single locale.** The tuner is one page in English. Multiple language versions,
  region targeting, and a multi-page content site are out of scope. If a future feature adds pages, the
  address list added here is the place they get registered.
- **The page stays a tuner first.** Supporting content is written to serve a real visitor as well as a
  crawler. Content that exists only to attract searches, and that a visitor would find useless, is not
  what this asks for.
- **Supporting content lives below the fold on the same page.** Decided during specification: the tuner
  keeps the first viewport height untouched and the content follows beneath it. The two alternatives
  considered and rejected were hiding the content visually (search engines discount text hidden from
  sighted users, and it invites a cloaking judgement) and putting it in a collapsed disclosure inside the
  fold (it costs vertical space on exactly the smallest screens FR-018 protects). The consequence is that
  the page becomes scrollable for the first time, which FR-067 and FR-068 govern.
- **Roughly 250 words of supporting content.** Enough to answer a first-time user's questions and to give
  a search engine something to judge; SC-023's 150-word floor is the binding minimum, not the target.
- **No off-page work.** Backlink acquisition, directory submissions, paid placement, and outreach are
  outside anything the codebase can express, and outside this feature.
- **No analytics or tracking added.** Measuring search performance is done with the search engines' own
  webmaster tooling against the deployed site, not by adding scripts to the page. This preserves the app's
  current property of making no network requests during use (FR-030's offline behaviour, verified by the
  existing `no-network` end-to-end check).
- **No new runtime framework.** Whatever satisfies FR-060 is a build-time or serving-time concern; adopting
  a server-rendering framework for a single static page would fail the constitution's Principle II. The
  choice among the available approaches belongs to `/speckit-plan`, not here.
- **Existing quality gates are the vehicle.** FR-084's assertions extend the current lint/test/e2e
  pipeline rather than introducing a separate audit process or a third-party service subscription.
- **No public address yet.** Confirmed during specification: the tuner has no deployment address today.
  The canonical address is therefore build configuration (FR-075) rather than a literal in the source, and
  everything except FR-074, FR-076, and SC-033 can be built and verified before a domain exists. Those
  three are satisfied by supplying the configured value at first deployment; no code change should be
  needed then.

### Explicitly out of scope

Recorded so they are not silently reintroduced during planning:

- App-store listing optimisation for the iOS and Android shells
- Multiple languages, translated pages, or region targeting
- A blog, article library, content management system, or any second content page
- Backlink building, outreach, directory submission, and paid search
- Analytics, tag managers, tracking pixels, or any third-party script on the page
- User accounts, sign-in, comments, ratings, or user-generated content
- Any tuner capability listed as out of scope in `001-chromatic-guitar-tuner` — content describing the
  app must be constrained to what exists, not the reverse

## Dependencies

- **A canonical public address.** FR-074, FR-076, and SC-033 are unsatisfiable until the app is deployed
  to a stable address. Every other requirement — FR-060 through FR-073, FR-075, and FR-077 through
  FR-087 — can be built and verified before then. FR-075 exists so that supplying the address later is a
  configuration change, not a code change.
- **`001-chromatic-guitar-tuner` FR-018** (display usable without scrolling) and **FR-030** (offline
  operation) are constraints on this feature, not merely related work; FR-066, FR-086, and FR-087 exist
  to keep them intact.
- **The existing end-to-end and accessibility suites** are the verification vehicle for FR-084, FR-085,
  and FR-087.
