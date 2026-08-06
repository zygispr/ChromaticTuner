# Phase 0 Research: In-App Appearance Control

**Feature**: `005-dark-mode-toggle` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

Ten decisions. Two of them (**D3**, **D5**) are the whole difficulty of this feature: FR-120 requires
the stored appearance to be in effect before the first frame, and **the preference is loaded
asynchronously after first render on both platforms today**. Everything else is small.

---

## The defect FR-120 is actually about

`TunerProvider` seeds its state from `DEFAULT_PREFERENCES` and replaces it when the store resolves:

```
packages/react/src/TunerProvider.tsx:54   useState<StoredPreferences>({ ...DEFAULT_PREFERENCES, ... })
packages/react/src/TunerProvider.tsx:69   void loadPreferences(preferences).then((loaded) => { ... setStored(loaded) })
```

For a reference pitch this is invisible — nothing is painted differently at 440 Hz for the two frames
before the stored 432 arrives. For appearance it is the whole bug: the first paint would be the
*default* appearance and the stored one would arrive afterwards. A user who chose dark would get a
white flash on every single launch, which is precisely the moment they are least willing to tolerate it
(a dark room, a bright screen at eye level).

So an appearance preference cannot ride the existing async path alone. It needs a synchronous route to
the first paint on each platform. D3 and D5 are those two routes.

---

## D1 — The resolution rule is a pure function in `packages/core`

**Decision**: `packages/core` owns the two types and one function:

```
type Appearance = 'light' | 'dark'                        // what is rendered
type AppearancePreference = Appearance | 'system'          // what is stored
resolveAppearance(preference, deviceAppearance): Appearance
```

`resolveAppearance` is total and pure: it returns `preference` unless it is `'system'`, in which case it
returns `deviceAppearance`. Three lines, exhaustively testable, no platform surface.

**Rationale**: This is the FR-115/FR-116 rule — the thing that decides whether the device setting is
consulted at all — and it is the one piece both platforms must agree on exactly. Principle VI puts
platform-agnostic logic in the core; `packages/core` compiles against ES2022 with no DOM lib, and a
function of two string arguments compiles there trivially. Having it in one place is what makes
FR-124's "identical on both platforms" structural instead of a review checklist item.

**Alternatives considered**:

- *Each app resolves it inline.* Two `preference === 'system' ? device : preference` expressions with
  nothing keeping them in step — exactly the drift Principle IV's single-source rule exists to prevent,
  and it would leave FR-116 untested at the unit level on both platforms.
- *Resolve inside `TunerProvider`.* Works, but buries a pure rule in a React component where it can only
  be tested by rendering. The provider still calls it; it just does not own it.

---

## D2 — Device appearance arrives as a prop, not as a fourth port

**Decision**: `TunerProvider` gains `deviceAppearance?: Appearance`. Each app computes it with its own
one-line hook — `useColorScheme()` on mobile, a `useSyncExternalStore` over
`matchMedia('(prefers-color-scheme: dark)')` on web — and passes it down. No `AppearanceSource` port is
added; `AudioSource`, `PreferencesStore`, and `WakeLock` remain the only three.

**Rationale**: A port earns its place when `packages/core` needs to *call* the platform. Core does not
need the device appearance — D1's function takes it as an argument. A port here would be an interface
defined in core, implemented twice, and then passed through React to React, never once consulted by the
core itself. That is the abstraction Principle II tells us to reject: the simplest thing that satisfies
the spec is a typed value flowing down the tree it is already rendering.

Constitution VI's "platform services MUST sit behind narrow interfaces with at least one test double"
is satisfied: the interface is the `Appearance` prop, and the test double is passing `'dark'`. Compare
the three real ports — each is stateful, each has lifecycle obligations (`start`/`stop`, quota failures,
OS handles), and each has behaviour that two adapters can plausibly get *differently wrong*, which is
what `port-contract-tests.ts` exists to catch. Reading a light/dark bit has none of that.

**Alternatives considered**:

- *A fourth port with contract tests.* Consistent-looking, and rejected: it would add an interface, two
  adapter classes, and a contract suite to move one string. `verify:release-bundle`-style ceremony for a
  value with no failure mode.
- *A hook in `packages/react` that reads the platform directly.* Impossible by construction — that
  package may import neither `react-dom` nor `react-native` (ESLint error), which is exactly why the
  value has to be injected.

---

## D3 — Web applies the stored appearance in a blocking inline script, emitted by the build

**Decision**: `siteIdentity()` in `apps/web/vite.config.ts` emits a small synchronous `<script>` into
`<head>`, before the stylesheet's first paint. It reads the preferences record from `localStorage`,
resolves it against `matchMedia`, and sets `data-theme` on `<html>`. The `[data-theme='light']` and
`[data-theme='dark']` blocks it drives **already exist** (`vite.config.ts:131-137`) and are already
proven to beat the media query by `apps/web/e2e/appearance.spec.ts:62`, a test written in anticipation
of this feature: *"If the override did not win, a future in-app theme switch would silently do
nothing."*

The script is wrapped in `try/catch` and does nothing on any failure — absent record, unparseable JSON,
`localStorage` throwing in private mode, an unrecognised value. Doing nothing leaves the media query in
charge, which is the correct default (FR-114).

**Rationale**: There is no other synchronous route. Since `003`, the served document contains real
content, so the browser paints *before* the module graph executes — the flash would be visible rather
than theoretical. An inline blocking script in `<head>` is the only thing that runs before that paint.
No Content-Security-Policy is set on this site (checked, not assumed), so no hash or nonce plumbing is
required; if one is added later, this script needs a hash.

**Consequence for React**: the app must not fight the attribute the script set. `TunerProvider` gains
`preferencesLoaded`, and the web effect that writes `data-theme` from React state must wait for it.
Writing `data-theme` from the provider's *default* state on mount would reintroduce the exact flash
this decision removes.

**Alternatives considered**:

- *Write `data-theme` from React on mount.* This is the naive implementation and it is the bug. React
  mounts after first paint.
- *Ship the appearance in a cookie and render it server-side.* There is no server; this is a static
  bundle with a service worker.
- *Store the appearance in a second, dedicated `localStorage` key so the script parses less.* Rejected
  in favour of D4 — a second key is a second thing that can disagree with the first.

---

## D4 — The storage key moves into `packages/core`

**Decision**: `'chromatic-tuner:preferences'` is exported from `packages/core` and imported by both
adapters and by the Vite plugin that generates D3's script.

**Rationale**: Principle I extracts duplicated logic **on its third occurrence, not its second**. The key
is currently written twice — `apps/web/src/adapters/local-storage-preferences.ts:7` and
`apps/mobile/src/adapters/async-storage-preferences.ts:8` — which was correctly left alone. D3 is the
third, and it is the occurrence that makes the duplication dangerous rather than merely untidy: the
first two are checked against each other by nothing, but they are at least both TypeScript in the same
tree. A copy of the string inside a generated `<script>` body would drift silently and the symptom would
be a flash that only appears in production builds.

`vite.config.ts` is TypeScript and already imports `@chromatic-tuner/tokens`, so importing a constant
from `@chromatic-tuner/core` needs no new machinery.

---

## D5 — Mobile resolves preferences before the root component mounts

**Decision**: `apps/mobile/index.js` becomes async: it loads and normalises preferences, then calls
`registerRootComponent` with the value in hand. `App` passes it to `TunerProvider` as
`initialPreferences`, which seeds state synchronously and skips the async load.

**Rationale**: The native launch screen stays up until the first React Native view renders, so delaying
the mount by one AsyncStorage read means the first frame the user ever sees is already correct. The read
is a single key, single-digit milliseconds, against a 2-second cold-start budget (SC-049) — but it is on
the startup path, so it must be measured, not assumed. That measurement is a task, not an assumption.

**Alternatives considered**:

- *Add `expo-splash-screen` and hold the splash until preferences resolve.* This is the documented Expo
  pattern and it was the first choice. Rejected because it is not currently resolvable from
  `apps/mobile` (verified with `require.resolve`) and would be a **new dependency**, which the
  constitution requires justifying against what it replaces. What it would replace is four lines in
  `index.js`. Principle II's ~30-line rule rejects it outright.
- *Render `null` until preferences load.* Hides the splash immediately and shows a blank frame instead —
  it trades a flash of the wrong appearance for a flash of nothing, which is not better.
- *Render the interim frame in the device appearance.* Correct exactly when the user did not override,
  which is the case that needed no help.

**Note**: `initialPreferences` also lets the web app skip a redundant re-render later, but web does not
need it for correctness — D3 handles the paint there.

---

## D6 — `PREFERENCES_SCHEMA_VERSION` stays at 1

**Decision**: No bump. `appearance` is added as a field that `normalizePreferences` defaults to
`'system'` when absent or unrecognised.

**Rationale**: The version exists for shape changes that are *incompatible*. This one is not, in either
direction. `normalizePreferences` already repairs every field independently, so a record written before
this feature loads with its reference pitch and accidental style intact and its appearance defaulted —
which is FR-122, satisfied by the existing design rather than by new code. Bumping the version would
imply a migration that has nothing to do.

**The one direction worth stating**: a record written by this version and read by an *older* build has
its `appearance` silently dropped on the next save, because the old normaliser destructures only two
fields. On mobile this cannot happen (installs do not roll back). On web it can, briefly, if a stale
service-worker bundle is served after an update. The cost is that the user re-picks their appearance
once. Documented rather than defended against — a schema version would not have prevented it either.

---

## D7 — The appearance change is instant, with no transition

**Decision**: No crossfade, no colour animation. Selecting an option repaints.

**Rationale**: Principle II — the simplest thing that satisfies the spec. It also disposes of FR-128
(reduced motion) structurally: there is no motion to suppress, so there is no preference to honour and
nothing to get wrong. A transition would have to be written twice, tested twice under reduced-motion,
and would fight the `data-theme` attribute swap on web, where transitioning every token at once on a
document-level attribute change is a known way to drop frames on a low-end device.

---

## D8 — The control reuses the accidental-style option group, with three members

**Decision**: A labelled group of three mutually exclusive options in the existing settings surface,
visually identical to the Accidentals group directly above it — `selected` tint fill, bold label,
1px border, `a11y.minTouchTarget` height, equal widths.

**Rationale**: Principle IV requires one interaction pattern for settings, and this sheet already
demonstrates it. Reusing it also inherits a defect that was already found and fixed here: the selected
state must be a **tint fill**, not the 2px `text` border that was originally used, because that border
is the app's focus idiom and tabbing to an *unchosen* option made it look chosen
(`SettingsSheet.tsx:264-275`, commit `500dfb5`). Writing a new selection treatment for this control
would be a fresh opportunity to make the same mistake.

Equal widths matter for the same reason they do above: choosing an option must not resize the row under
the finger that chose it, which the layout-stability test already asserts for the two-member group and
must now assert for a three-member one.

**Labels**: "Match device", "Light", "Dark". Not "System" or "Auto" — Principle IV requires plain,
mechanism-free copy, and "device" is the word for the thing the user actually changed.

**Accessibility**: web keeps the group's `role="group"` + `aria-pressed` pattern already in use;
mobile uses `accessibilityRole="radio"` with `accessibilityState={{ selected }}`. Three options rather
than two changes nothing structurally about either.

---

## D9 — `userInterfaceStyle: 'automatic'` stays in `app.config.ts`

**Decision**: Unchanged.

**Rationale**: That key controls what the **native** layer does — the launch screen, system alerts, the
keyboard. It must keep following the OS, because those surfaces cannot read AsyncStorage and have no
way to know about an in-app override. Setting it to a fixed value to match a user's choice would require
a native config change per user, which is not a thing.

**Accepted limitation, stated plainly**: a user whose device is light and who chooses dark sees a light
*launch screen* before the app's own first frame paints dark. FR-120 governs what the app renders, and
this is the OS rendering. Every app with an in-app appearance override on iOS has this seam; closing it
would mean shipping a native module to read the preference before JS starts, which no requirement here
justifies.

---

## D10 — "No flash" is asserted, not eyeballed

**Decision**: Three mechanical checks, because SC-048 is otherwise a claim nobody can falsify.

1. **Web, pre-React**: Playwright navigates with `waitUntil: 'commit'` after seeding `localStorage`, then
   reads `document.documentElement.dataset.theme` — this runs before the app bundle has executed, so a
   passing assertion proves the inline script did it and not React.
2. **Web, painted**: with the emulated media set to the *opposite* of the stored choice, assert the
   computed background of `main` is the stored appearance's token both immediately and after the app has
   mounted. Two reads, one before and one after `waitForNote`, catch a late React write that reverts the
   attribute.
3. **Mobile**: a Jest test that `App` renders its first frame with the resolved appearance when
   `initialPreferences` is supplied, plus the entry-point ordering asserted directly.

**Rationale**: The existing `appearance.spec.ts` already proves the override *mechanism* works; none of
its tests prove *when* it is applied, which is the entire content of FR-120. Check 1 is the one that
would have caught the naive implementation.

---

## Summary of what this feature adds

| Layer | Change |
| --- | --- |
| `packages/core` | `Appearance`, `AppearancePreference`, `resolveAppearance`, the `appearance` field, the exported storage key |
| `packages/react` | `deviceAppearance` prop, `initialPreferences` prop, `preferencesLoaded`, `appearance` + `appearancePreference` + `setAppearancePreference` on the context |
| `packages/tokens` | **none** — both palettes already exist |
| `apps/web` | inline no-flash script from the Vite plugin, a `matchMedia` hook, a `data-theme` effect gated on `preferencesLoaded`, the settings group |
| `apps/mobile` | async entry point, `useColorScheme` passed to the provider, `theme.ts` resolving from context instead of the OS, the settings group |

**No new dependencies. No new port. No change to `packages/tokens`, the DSP path, the note math, the
filter chain, or the two output channels.**
