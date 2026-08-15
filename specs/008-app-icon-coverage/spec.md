# Feature Specification: App Icon Coverage

**Feature Branch**: `008-app-icon-coverage`

**Created**: 2026-08-15

**Status**: Draft

**Input**: User description: "add app icons for both web and mobile if not added already"

## Context: what already exists, and what does not

The request is conditional — "if not added already" — so the first work was to find out. The answer is
**partly**, and the part that is missing is the part a person actually sees.

**Added already:**

- The mark itself. `004` designed one icon from the app's own display — line, centre marker, two ticks,
  a flat dot and a sharp dot — and generates every raster from the shipped colour tokens
  (`listing/scripts/generate-icons.mjs`). No new artwork is needed and none should be invented.
- The web app's icons. `apps/web/public/icon.svg` and `icon-maskable.svg` are generated, referenced from
  the document and the web manifest, precached by the service worker, and gated by
  `apps/web/e2e/metadata.spec.ts`.
- The two store **listings'** artwork. `icon-ios-1024.png`, `icon-play-512.png`,
  `icon-adaptive-foreground.png` and the Play feature graphic are generated and committed, and
  `pnpm verify:listing` proves their colours are still current palette values.

**Not added:**

1. **The mobile app has no icon.** `apps/mobile/app.config.ts` declares no icon of any kind, and
   `apps/mobile/assets/` does not exist. The native project is generated output and is git-ignored, so
   every `prebuild` re-derives the icon from that config — and what it currently produces is
   `App-Icon-1024x1024@1x.png`, **a blank white 1024×1024 square**: Expo's placeholder. A player who
   installs the app gets a blank tile on their home screen while the store page that sold it to them
   showed the real mark. The listing artwork was drawn for the store's *fields* and was never wired into
   the *binary*.
2. **`listing/submission.md` states the opposite.** It says of the adaptive launcher icon: "it is not a
   console field — it is built into the app." It is not built into the app. A submission checklist that
   asserts a false thing is worse than one that omits it, because it stops the reader from checking.
3. **The web touch icon is a format iOS cannot use.** `<link rel="apple-touch-icon">` points at
   `icon.svg`, and Safari on iOS and iPadOS accepts only a raster there. Adding the tuner to a home
   screen on the platform where "add to home screen" is most used therefore yields a screenshot of the
   page rather than the icon. The existing gate cannot see this: it asserts the reference *resolves* and
   accepts `.svg`, which is exactly what a wrong-format icon does.

This feature is therefore about **coverage and proof**, not design: put the icon that exists everywhere
the product is installed, and add the gates that would have caught each of the three gaps above.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The installed mobile app is recognisable on a home screen (Priority: P1)

A guitarist installs the tuner on their phone, closes it, and later reaches for it mid-practice with an
instrument in the other hand. They find it by its picture among thirty other apps, on the first look,
without reading any labels.

**Why this priority**: This is the whole defect. Everything else in this feature is a smaller variant of
it. A blank tile is not a cosmetic shortfall — it is indistinguishable from a failed install, it reads
as an abandoned or unfinished app, and both stores treat a placeholder icon as grounds for rejection. It
is also the only item that is currently *wrong* rather than merely *weaker than it could be*.

**Independent Test**: Build the mobile app for each platform from a clean native project and look at the
home screen. Delivers the entire user-visible value of this feature on its own.

**Acceptance Scenarios**:

1. **Given** a native project regenerated from scratch, **When** the app is installed on an iPhone,
   **Then** its home-screen icon is the tuner's mark on the app's own background colour, not a blank or
   placeholder tile.
2. **Given** a native project regenerated from scratch, **When** the app is installed on an Android
   device, **Then** its launcher icon is the tuner's mark, correctly composed against the app background
   and uncropped by whatever mask shape that launcher applies — circle, squircle or rounded square.
3. **Given** the mobile app is installed, **When** the user searches for it by name in the OS launcher
   or app switcher, **Then** the same mark appears beside the result.
4. **Given** someone changes the app's background token and regenerates the artwork, **When** the
   project's gates run, **Then** any icon left carrying the old colour fails a check rather than
   shipping.

---

### User Story 2 - Adding the web app to an iOS home screen produces the icon (Priority: P2)

A player using the tuner in mobile Safari taps Share → Add to Home Screen so it opens like an app next
time. The tile that appears is the tuner's icon.

**Why this priority**: The web app is the version most people meet first, it is installable by design
(it ships a manifest, a scope, a display mode and a service worker), and iOS is the platform where the
current reference silently degrades. It is P2 rather than P1 only because today's outcome is a poor
icon, not an absent app — and because the failure is confined to one platform's install path.

**Independent Test**: Add the deployed page to the home screen on an iOS device and compare the tile
against the same action on Android. Testable and shippable without touching the mobile app at all.

**Acceptance Scenarios**:

1. **Given** the web app open in Safari on iOS, **When** the user adds it to their home screen, **Then**
   the tile shows the tuner's mark rather than a screenshot of the page.
2. **Given** the web app open in a browser that installs from the manifest, **When** the user installs
   it, **Then** the installed app's icon is the tuner's mark, correctly filled to the edges under a
   maskable crop.
3. **Given** any icon the document or the manifest names, **When** the project's gates run, **Then** a
   reference in a format the naming platform cannot render fails a check, not merely a reference that
   404s.

---

### User Story 3 - The submission checklist tells the truth about icons (Priority: P3)

Someone preparing a store submission months from now reads `listing/submission.md`, fills every console
field from it, and is not misled about which artwork is already inside the build.

**Why this priority**: Real but downstream — it costs a person one confused submission cycle rather than
costing every user a blank tile. It cannot be closed before Story 1, because until the icon is actually
in the binary there is no true statement to write.

**Independent Test**: Read the submission document against the built app and confirm each claim about
where an icon comes from is verifiable.

**Acceptance Scenarios**:

1. **Given** the submission document, **When** a reader follows its icon rows, **Then** every claim
   about whether an asset is a console field or built into the app matches the actual build.
2. **Given** a new icon asset is added or an existing one moves, **When** the project's gates run,
   **Then** a submission document that still names the old arrangement fails a check.

---

### Edge Cases

- **A launcher mask crops the icon.** Android composes an adaptive icon from separate layers and cuts it
  to a device-chosen shape. The mark must sit inside the safe area for the most aggressive crop, and the
  background must reach the outer edge so no corner shows through. The existing artwork was drawn for
  this; the requirement is that it stays true once wired in.
- **The OS is in dark mode.** The icon's background is a fixed colour and does not follow the device
  appearance, unlike everything else in this product. That is correct and intended — an icon that
  changed with the system would be unrecognisable half the time — but the mark must remain legible
  against both a light and a dark wallpaper and against both OSes' home-screen treatments.
- **Someone changes the colour tokens.** Every icon in the product derives from the palette. A palette
  change must either regenerate all of them or fail a gate, never leave one surface carrying last
  season's colour.
- **The native project is regenerated.** `apps/mobile/ios/` is git-ignored generated output. Anything
  achieved by editing files inside it is erased by the next `prebuild`, so the icon must come from
  checked-in configuration and checked-in artwork.
- **The icon is seen at its smallest.** A notification badge, a Spotlight result and a browser tab are
  all far smaller than any store's field. The mark must still read as a tuner rather than as a grey
  smudge at those sizes.
- **A platform ignores an unsupported reference silently.** No platform reports "this icon is in a
  format I cannot use" — it just substitutes something else. Gates must therefore assert format, not
  only presence.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-171**: The mobile app MUST ship a first-party icon on both iOS and Android, visible on the home
  screen or launcher, in the app switcher, and anywhere else the platform represents an installed app.
- **FR-172**: The mobile app's icon MUST be the same mark the store listings and the web app already
  use. No second mark is to be designed, and no surface may carry artwork the others do not.
- **FR-173**: Every icon shipped by either app MUST derive its colours from the shared design tokens, so
  a palette change reaches all of them at once. This extends the existing guarantee (FR-098) to the
  surfaces that currently sit outside it.
- **FR-174**: The mobile icon MUST survive an Android adaptive-icon mask of any shape the platform may
  apply, with the mark inside the safe area and the background covering the full field.
- **FR-175**: The mobile icon MUST come from checked-in configuration and checked-in artwork, such that
  regenerating the native project from scratch reproduces it exactly.
- **FR-176**: The web app MUST provide a home-screen icon in a format Safari on iOS and iPadOS renders,
  so that adding the page to a home screen produces the icon rather than a page screenshot.
- **FR-177**: The web app MUST keep offering an icon usable by installers that mask it, filled to the
  edges, in addition to the unmasked icon used as a tab and bookmark mark.
- **FR-178**: Automated gates MUST fail when an icon a document or manifest names is in a format the
  naming platform cannot render — not only when the reference fails to resolve.
- **FR-179**: Automated gates MUST fail when any shipped icon's colours are no longer current palette
  values, on every platform, including the mobile app's own icons.
- **FR-180**: Automated gates MUST fail when the mobile app is configured without an icon, so the
  placeholder-icon defect cannot return unnoticed.
- **FR-181**: The submission checklist MUST accurately state, for each icon asset, whether it is typed
  into a store console or built into the app, and a gate MUST fail when that record and the artefacts
  disagree.
- **FR-182**: Regenerating the icon artwork MUST remain a single deliberate command that produces every
  size every surface needs, rather than a per-platform manual step.

### Key Entities

- **The mark**: the tuner's own display reduced to icon scale — one line, one centre marker, two ticks,
  a flat dot and a sharp dot. Already defined; this feature consumes it rather than changing it.
- **An icon surface**: one place a platform shows the app's picture (iOS home screen, Android launcher,
  browser tab, iOS home-screen tile, installed-PWA tile, store field). Each has its own required sizes,
  formats and masking rules; each must resolve back to the same mark.
- **The palette**: the shared colour tokens every icon derives from. The single source that makes "all
  the icons agree" a checkable property rather than a habit.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-074**: 100% of the surfaces a person can install this product onto — iOS home screen, Android
  launcher, iOS Safari home-screen tile, installed web app, browser tab — show the tuner's mark. The
  current figure is 60%: the two mobile ones are blank and the iOS home-screen tile is a screenshot.
- **SC-075**: A person shown the installed icon at the smallest size their device uses can tell it apart
  from an unrelated app on their own home screen on first look, without reading the label.
- **SC-076**: Every icon in the product is traceable to one mark and one palette, verified automatically
  rather than by eye — zero surfaces carrying artwork or colours that no gate checks.
- **SC-077**: Deleting the entire generated native project and rebuilding reproduces every mobile icon
  with no manual step and no hand-edited file.
- **SC-078**: Each of the three defects this feature was opened against — the blank mobile icon, the
  unrenderable iOS touch icon, and the false claim in the submission checklist — has a gate that fails
  on the unfixed code, per the project's test-first principle.
- **SC-079**: Regenerating all icon artwork after a palette change is a single command, and no surface
  is left behind by it.

## Assumptions

- **The existing mark is the icon.** `004` specified, drew and gated it against FR-097 and FR-098, and
  the request says "if not added already" — an invitation to complete the coverage, not to redesign. Any
  change to the artwork itself is a separate feature.
- **"Web and mobile" means the two shipping apps**, `apps/web` and `apps/mobile`, on their respective
  install surfaces. The store consoles' icon fields are already filled and are not reopened here.
- **Splash and launch screens are out of scope.** They are a distinct surface with their own timing
  constraints — `005` deliberately routed first-frame appearance through the launch screen — and the
  request names icons. Worth noting for a future feature: the mobile launch screen is likewise
  unconfigured, so it inherits a platform default rather than the app's background.
- **Notification icons are out of scope.** The app sends no notifications, and adding an icon for a
  surface the app does not use would be building for a requirement that does not exist (Principle II).
- **The icon does not follow the device appearance.** It is drawn from the dark palette on a fixed
  background, matching what the store listings already show. Platform features that tint or theme an
  icon per appearance are not adopted here.
- **iOS's requirement that a home-screen icon be a raster is treated as fixed.** The web app therefore
  needs a raster touch icon regardless of how well its SVG serves every other browser.
- **Verification of the mobile result requires a real build.** Rendering an icon is the OS's job, and
  the mobile test runner has no layout engine or launcher; automated gates can prove the configuration,
  the artwork and the derivation, and a person confirms the rendered home screen on each platform — the
  same split `004` already uses for store screenshots.
- **No new dependency is needed.** The generator rasterises through the Chromium the project already
  installs for end-to-end tests, and it already emits sizes for both stores.
