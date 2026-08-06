# Feature Specification: In-App Appearance Control

**Feature Branch**: `005-dark-mode-toggle`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "Implement dark mode toggle button for both web and mobile. The selected mode should be remembered after app is closed and reopened."

## Overview

Both apps already render correctly in light and dark appearance, and both already follow the device's
appearance setting (FR-019). What neither app has is a way for the user to say otherwise.

That gap costs a musician in exactly the situation this product is built for. A guitarist on a dark
stage whose phone is set to light appearance is handed a bright white panel at eye level; someone
tuning in daylight with a device set to dark loses contrast against the sun. Today the only remedy is
to leave the tuner, change a system-wide setting, and come back — mid-rehearsal, with an instrument in
both hands. The choice is also per-app in the user's head ("I want *this* app dark") but device-wide in
reality, so making it costs them every other app's appearance too.

This feature adds an appearance control inside the app and remembers what was chosen, so the decision
is made once rather than at every launch.

**What already exists.** Both apps already draw every surface correctly in both appearances, from one
shared set of colours, and both already read the device's appearance setting. The palette, the contrast
work, and the two rendered appearances are done. What is missing is a way for the user to state a
preference, somewhere to keep it, and a rule for which preference wins — not a second theme.

This spec continues the project's requirement numbering — **FR-114 onward, SC-046 onward**. Requirement
numbers are cited by number from code comments and from `contracts/`, so a reused number would silently
corrupt those references.

**Scope boundary.** This feature changes appearance selection and persistence only. It does not touch
the audio path, the note math, the reading filter chain, or the two output channels, and it must not
weaken any guarantee those already carry — in particular the constitution's cold-start budget and the
60 fps tuning budget. It adds no new palette, no per-element theming, and no third appearance.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A guitarist darkens the tuner without leaving it (Priority: P1)

A guitarist is about to play in a dim room. Their phone is set to light appearance because that is what
suits them everywhere else, and the tuner is a bright rectangle they are about to hold up in front of
an audience. They open the app's appearance control, pick dark, and the tuner is dark immediately —
without touching a device-wide setting and without losing the tuning reading in progress.

**Why this priority**: This is the entire feature from the user's side. Without it there is nothing to
remember. It is also the half that delivers value on its own — an appearance choice that reset on every
launch would still solve the on-stage problem for that performance.

**Independent Test**: Set the device to light appearance, open the app, choose dark, and confirm every
surface — tuner display, settings, status messaging — is in dark appearance, with the device's own
setting unchanged.

**Acceptance Scenarios**:

1. **Given** the device is set to light appearance and the app has never been given an appearance
   choice, **When** the user opens the app, **Then** the app renders in light appearance.
2. **Given** the app is rendering in light appearance, **When** the user selects dark, **Then** every
   visible surface switches to dark appearance without the app restarting and without a page reload.
3. **Given** the app is rendering in dark appearance by the user's choice, **When** the user selects
   light, **Then** every visible surface switches to light appearance — the control works in both
   directions, not only towards dark.
4. **Given** the microphone is live and a note is being read, **When** the user changes the appearance,
   **Then** the reading continues uninterrupted, the microphone permission is not re-requested, and the
   readout does not stutter.
5. **Given** the user has chosen an appearance, **When** they open the appearance control again,
   **Then** the control shows which appearance is currently in effect.

---

### User Story 2 - The choice survives closing the app (Priority: P1)

The same guitarist closes the app, plays a set, and reopens it the next evening. It opens dark, as they
left it. They never make the choice twice.

**Why this priority**: This is the half of the request the user named explicitly, and it is what turns a
per-session workaround into a setting. It is P1 rather than P2 because an appearance that silently
reverts is a worse experience than no control at all: the user has to notice the reversion and re-fix
it every launch.

**Independent Test**: Choose an appearance, fully terminate the app (close the browser tab and the
browser on web; swipe the app away on mobile), reopen, and confirm the chosen appearance is in effect
from the first frame drawn.

**Acceptance Scenarios**:

1. **Given** the user chose an appearance, **When** the app is fully closed and reopened, **Then** it
   renders in the chosen appearance.
2. **Given** the user chose an appearance, **When** the app is reopened, **Then** the first frame the
   user sees is already in that appearance — no flash of the other appearance at any point during
   startup.
3. **Given** the user chose an appearance and the device's appearance setting is subsequently changed
   to the opposite one, **When** the app is reopened, **Then** the user's choice still wins over the
   device setting.
4. **Given** the user has previously set a reference pitch and an accidental style, **When** they choose
   an appearance and reopen the app, **Then** all three preferences are in effect — the new preference
   does not disturb the existing ones.
5. **Given** the app was last used before this feature existed and has stored preferences from then,
   **When** the user opens the updated app, **Then** those stored preferences are still honoured and the
   appearance falls back to the default rather than resetting anything.

---

### User Story 3 - The choice can be handed back to the device (Priority: P2)

A user who set the app dark for one gig wants it to go back to matching their phone, which switches
itself at sunset. They return to the appearance control and hand the decision back.

**Why this priority**: P2 because the app is usable without it — the user can still pick the appearance
they want by hand. It matters because the current behaviour (FR-019, following the platform) is a real
default that some users prefer, and a control that cannot restore it takes something away rather than
adding to it. Following the device is also the default this feature ships with, so this is the state
every user starts in, not a corner.

**Independent Test**: Choose a fixed appearance, then select the follow-the-device option, then change
the device's appearance setting and confirm the app follows it without being reopened.

**Acceptance Scenarios**:

1. **Given** the user has chosen a fixed appearance, **When** they select the follow-the-device option,
   **Then** the app immediately renders in whichever appearance the device is set to.
2. **Given** the app is set to follow the device, **When** the device's appearance changes while the app
   is open and in the foreground, **Then** the app follows within one second without being reopened.
3. **Given** the app is set to follow the device, **When** the app is closed and reopened, **Then** it is
   still following the device rather than pinned to whatever appearance it happened to show last.

---

### Edge Cases

- **Storage is unavailable or full** — private browsing, a revoked storage permission, an exhausted
  quota. The appearance change must still take effect for the session, and the app must say plainly
  that it will not be remembered, in the same way a failed reference-pitch save already does. It must
  not fail silently and must not block tuning.
- **The stored appearance value is corrupt, absent, or from a newer version of the app.** The app falls
  back to the default appearance and leaves the user's other preferences intact — a bad appearance value
  is no reason to discard a reference pitch the user deliberately set.
- **The device's appearance changes while the app is showing a user-chosen fixed appearance.** Nothing
  happens; the user's choice wins until they change it.
- **The device's appearance changes while the app is backgrounded**, then the app is brought forward.
  The app shows whatever the resolution rule produces at that moment — following the device if that is
  what is selected — without a visible flash of the previous appearance.
- **The app is opened for the very first time.** There is no stored choice, so the current behaviour
  (following the device) applies unchanged.
- **The control is used repeatedly and quickly.** The last selection wins, the stored value matches what
  is displayed, and no intermediate state is left behind.
- **A screen reader is in use.** The control announces what it does and which appearance is currently
  selected, and the change is announced rather than being a silent visual event.
- **The device has reduced-motion enabled.** The appearance change must not animate in a way that
  violates that preference.
- **The web app is offline** (installed and running from its cached assets). The control and the stored
  choice work identically; nothing about this feature requires a network.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-114**: The app MUST offer exactly three appearance options — light, dark, and follow-the-device.
  Follow-the-device MUST be the value in effect for a user who has never made a choice, which preserves
  FR-019's existing behaviour as the default rather than replacing it.
- **FR-115**: While follow-the-device is selected, the app MUST track the device's appearance for as
  long as it is open: a change made outside the app MUST be reflected within one second while the app is
  in the foreground, and MUST already be reflected when the app is brought back from the background. No
  restart or reload may be required.
- **FR-116**: While light or dark is selected, a change to the device's appearance MUST NOT alter what
  the app renders. An explicit choice outranks the device until the user changes it.
- **FR-117**: The appearance control MUST live on the existing settings surface, alongside reference
  pitch and accidental style, so that every preference is changed through one interaction pattern
  (Principle IV). It MUST NOT add a control to the tuner display, which FR-018 requires to be readable
  at a glance without interaction.
- **FR-118**: Selecting an appearance MUST take effect immediately across every surface of the app —
  tuner display, settings, status and permission messaging, and any supporting content — without a
  restart, a reload, or a re-request of microphone permission.
- **FR-119**: The selected appearance MUST be persisted on the device and MUST be in effect the next
  time the app is opened, including after the app has been fully terminated and after the device has
  been restarted. Follow-the-device MUST persist as *that choice*, not as whichever appearance it
  happened to resolve to when it was made.
- **FR-120**: The persisted appearance MUST be applied before the first frame is drawn. The user MUST
  NOT see the app render in one appearance and then switch to another during startup.
- **FR-121**: The appearance preference MUST be stored alongside the app's existing preferences and MUST
  be validated and defaulted in the same single place they are, so that an absent, corrupt, or
  unrecognised value yields the default appearance without discarding the other preferences.
- **FR-122**: Preferences stored by an earlier version of the app, which contain no appearance value,
  MUST continue to load, MUST retain their reference pitch and accidental style, and MUST resolve to
  follow-the-device.
- **FR-123**: When the appearance cannot be persisted, the app MUST apply the choice for the current
  session and MUST tell the user it will not be remembered. It MUST NOT crash, block tuning, or fail
  silently.
- **FR-124**: The appearance control MUST be present and MUST behave identically on web and on mobile —
  same three options, same wording, same default, same resolution rule — so that the concept looks and
  behaves the same on both (Principle IV).
- **FR-125**: The appearance control MUST have a visible focus indicator, an accessible label, a touch
  target of at least 44x44 pt/px, and MUST expose which of the three options is currently selected to
  assistive technology.
- **FR-126**: The control MUST communicate the current selection by something other than colour alone.
- **FR-127**: Every surface MUST continue to meet WCAG 2.1 AA contrast (4.5:1 text, 3:1 meaningful
  graphics) in both appearances after this feature ships, including the new control in both its selected
  and unselected states.
- **FR-128**: The appearance change MUST honour the platform's reduced-motion preference.
- **FR-129**: The appearance control MUST NOT use a literal colour value; all colours MUST come from the
  existing design tokens (Principle IV, FR-018's token rule).
- **FR-130**: This feature MUST NOT change any tuning behaviour. Existing gates — lint, format,
  typecheck, unit tests, coverage thresholds, end-to-end tests, the mobile suite, and the listing
  verification — MUST stay green, and the cold-start, latency, and frame-rate budgets MUST NOT regress
  by more than the constitution's 10% allowance.
- **FR-131**: The feature MUST NOT introduce a network request, an account, or any off-device storage;
  the appearance choice stays on the device it was made on.

### Key Entities

- **Appearance preference** — the user's stored choice: light, dark, or follow-the-device. One value
  per device, stored with the app's other preferences (reference pitch, accidental style) under the same
  versioned record. Follow-the-device is a stored value in its own right, distinct from the appearance
  it currently resolves to.
- **Effective appearance** — the light-or-dark appearance actually rendered at a given moment. Derived,
  never stored: it is the user's stored choice, or the device's current appearance when the stored
  choice defers to it. Every surface reads this one value so no surface can disagree with another.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-046**: A user can change the app's appearance in two interactions or fewer starting from the
  tuner display, on both web and mobile.
- **SC-047**: A chosen appearance is still in effect after the app is fully closed and reopened, in
  100% of attempts, on both platforms, and after a device restart.
- **SC-048**: On every launch with a stored appearance, the first frame the user sees is in that
  appearance — zero observed flashes of the other appearance, measured on a cold start on the lowest
  supported target device.
- **SC-049**: Cold start to a usable tuning display stays within the 2-second budget and does not
  regress by more than 10% against the pre-feature measurement on the same device.
- **SC-050**: Sustained frame rate while tuning stays at 60 fps, and switching appearance while a
  reading is live drops no more frames than the existing settings interactions do.
- **SC-051**: With the app set to follow the device, changing the device's appearance updates the app
  within one second with the app open, and requires no restart.
- **SC-052**: Every text and meaningful-graphic element, including the new control in every state,
  passes WCAG 2.1 AA contrast in both appearances — verified by the automated accessibility gate on web
  and by measurement on mobile.
- **SC-053**: A user relying on a screen reader can find the control, determine which appearance is
  selected, and change it, without sighted assistance.
- **SC-054**: With storage unavailable, the appearance still changes and the user is told it will not be
  remembered; tuning is unaffected in 100% of attempts.
- **SC-055**: Preferences written by the previous version of the app load without loss: the reference
  pitch and accidental style are unchanged and the appearance resolves to the default.

## Assumptions

- **Two appearances, not a palette.** "Dark mode" means the existing dark appearance the apps already
  render. This feature adds no new colours, no third theme, and no per-element customisation.
- **The existing preferences record is where this belongs.** The appearance joins reference pitch and
  accidental style rather than getting its own storage, so that one load, one validation path, and one
  versioned record continue to cover everything the app remembers. Adding a field to a record whose
  fields are already repaired independently means an older record loads without loss.
- **Per-device, not per-user.** There are no accounts and nothing is carried between devices; a choice
  made on a phone has no effect on the same person's browser. This follows from the product's existing
  no-network, no-account boundary and is not a limitation this feature introduces.
- **The device's appearance remains the default.** Until the user says otherwise, the current behaviour
  is unchanged: the app follows the platform. This feature only gives them a way to say otherwise.
- **The wording is plain.** The control is described in ordinary language — "Appearance", with options
  named for what they do rather than for the mechanism behind them — consistent with the copy rule in
  Principle IV. The follow-the-device option is named in the user's terms ("Match device" or similar),
  not as "system" or "auto".
- **The control is a three-way choice, not a switch.** The request named a "toggle button", but a
  two-state switch cannot express follow-the-device without an ambiguous unset position. No new
  interaction pattern is needed for the third option: the accidental style already presents a group of
  mutually exclusive labelled options on the same surface, and this is that pattern with three members
  instead of two.
- **No store-listing change is required.** The store copy and the web page's description are not
  obliged to mention this feature; if they later do, that copy goes through the existing listing
  verification like any other claim.
- **Screenshot and icon generation is unaffected.** The tooling that pins a fixed appearance for
  generated artefacts keeps doing so and does not read the user's preference.
