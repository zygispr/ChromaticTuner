# Quickstart Validation: In-App Appearance Control

**Feature**: `005-dark-mode-toggle` | **Date**: 2026-08-05

Validation scenarios **V39–V48**, continuing from `004`'s V38. Each states what to run and what must be
true. Contract guarantees are cited as `M1`–`M12` ([contracts/appearance.md](./contracts/appearance.md)).

## Prerequisites

```bash
pnpm install          # corepack enable first; Node 22.13+
```

## Gates

```bash
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test
pnpm test:coverage    # packages/core >= 90% lines / 90% functions / 85% branches
pnpm test:e2e         # regenerates WAV fixtures, then Playwright + Chromium
pnpm --filter @chromatic-tuner/mobile test
pnpm build && pnpm verify:listing
```

All must be green. FR-130 makes "unchanged" a requirement rather than a hope — nothing in this feature
should move any of these numbers except coverage, which should rise.

Focused runs while working:

```bash
pnpm vitest run --project core -t "resolveAppearance"
pnpm vitest run packages/core/tests/preferences.test.ts
pnpm --filter @chromatic-tuner/web exec playwright test e2e/appearance.spec.ts
pnpm --filter @chromatic-tuner/mobile test -- settings
```

---

## V39 — The resolution table (M1–M4)

**Automated**, `packages/core`.

All six combinations of `AppearancePreference` × `Appearance` return the value in
[data-model §3](./data-model.md). `'light'` and `'dark'` ignore the device argument; `'system'` returns
it. `resolveAppearance` never returns `'system'`.

**Test-first (Principle III)**: this test is written and observed failing before the function exists.

---

## V40 — A bad appearance does not cost you your reference pitch (M5, M6)

**Automated**, `packages/core`.

Normalise `{ a4Hz: 432, accidentalStyle: 'flat', appearance: 'AUTO' }`. Expect `a4Hz` 432,
`accidentalStyle` `'flat'`, `appearance` `'system'`. Repeat with `appearance` absent, `null`, `0`, `''`,
and `'System'` (wrong case). Then invert it: an unusable `a4Hz` alongside a valid `'dark'` must keep the
`'dark'`.

---

## V41 — Yesterday's record still loads (M7)

**Automated**, `packages/core` and the port contract suite.

`{ a4Hz: 432, accidentalStyle: 'flat', schemaVersion: 1 }` — a record with no appearance field at all,
exactly as shipped today — normalises with both values intact and `appearance: 'system'`.
`PREFERENCES_SCHEMA_VERSION` is still `1`.

In `packages/core/testing/port-contract-tests.ts`, add the round-trip: each of the three appearance
values survives `save` then `load` unchanged, on every implementation including the doubles. Runs under
Vitest for the web adapter and Jest for the mobile one, which is why the suite imports no test framework.

---

## V42 — One appearance, one source (M9)

**Automated**, `packages/react`.

Render `TunerProvider` with `deviceAppearance="dark"` and a store holding `appearance: 'light'`. The
context reports `appearance: 'light'` and `appearancePreference: 'light'`. Flip the prop to `"light"`
and the resolved value does not move — that is FR-116 at the provider level.

Then store `'system'`, flip `deviceAppearance`, and watch the resolved value follow.

---

## V43 — The web page is already dark before React exists (M12, FR-120)

**Automated**, Playwright — *this is the scenario that catches the naive implementation.*

```bash
pnpm --filter @chromatic-tuner/web exec playwright test e2e/appearance.spec.ts
```

1. Seed `localStorage` with a record whose `appearance` is `'dark'`.
2. Emulate `colorScheme: 'light'` — the device says the **opposite**, so nothing but the stored
   preference can produce a dark page.
3. Navigate with `waitUntil: 'commit'` and immediately read
   `document.documentElement.dataset.theme`. It must already be `'dark'`. At this point the app bundle
   has not executed; a pass proves the inline script did this, not React.
4. Let the app mount, wait for a note, and read the computed background of `main` again. Still the dark
   token. A late write from the provider's default state would show up here and nowhere else.

Repeat with the stored value `'light'` against an emulated dark device.

Then the `'system'` case: with `appearance: 'system'` stored, `data-theme` must be **absent** — the
media query keeps control, so a later OS change is followed with no JavaScript at all (M12).

---

## V44 — The script fails safe (M12)

**Automated**, Playwright.

Seed `localStorage` with `'not json'`, then with `{"appearance":"chartreuse"}`, then with nothing at
all. In each case the page loads, no error reaches the console, and the appearance is whatever the
emulated media query says. Failing to read a preference must degrade to today's behaviour, never to the
wrong appearance.

---

## V45 — The mobile app's first frame is already correct (M11, M12)

**Automated**, `jest-expo`, plus one manual confirmation.

Automated: `App` given `initialPreferences` with `appearance: 'dark'` and `useColorScheme()` mocked to
`'light'` renders dark on its **first** commit — assert on the initial render output, not after an
`act()` flush, because a value that is only right after a flush is the bug.

Manual, on a real device or simulator: set the OS to light, choose Dark in the app, force-quit, reopen.
Between the launch screen and the tuner there must be no white frame. Record it in slow motion if
unsure — the seam the launch screen itself creates is expected and documented (research **D9**); a white
*app* frame is not.

---

## V46 — It survives being closed (FR-119, SC-047)

**Manual**, both platforms. This is the requirement the user actually asked for.

- **Web**: choose Dark, close the tab, quit the browser, reopen. Dark. Then with the app installed and
  **offline**, repeat — nothing here needs a network (FR-131).
- **Mobile**: choose Dark, swipe the app away, reopen. Dark. Then restart the device and reopen. Dark.
- **Both**: choose "Match device", close, reopen, then change the OS appearance. The app follows — it
  stored the *choice*, not the light it resolved to at the time (M3, FR-119).
- Confirm the reference pitch and accidental style set beforehand are both still in effect (FR-121).

---

## V47 — Live following, and not following (FR-115, FR-116, SC-051)

**Manual**, both platforms.

With "Match device" selected and the app open in the foreground, change the OS appearance. The app
follows within a second, with no restart. On mobile, background the app, change the OS appearance,
return — already correct, no visible correction.

Now select Dark explicitly and change the OS appearance both ways. Nothing moves. Then confirm the
microphone is still live and the note readout never stopped (FR-118).

---

## V48 — The control is usable, legible, and honest (FR-123, FR-125–FR-127)

**Automated where it can be**, manual where it cannot.

- Axe passes on the settings sheet with the new group present (the existing e2e a11y gate).
- Keyboard only: tab to the group, move through the three options, activate one. Focus is visible on
  every option, and the *unchosen* focused option never reads as chosen — the defect commit `500dfb5`
  fixed for the accidentals group, which this one inherits by reusing its treatment (research **D8**).
- Screen reader (VoiceOver on iOS, NVDA or VoiceOver on web): the group is announced with its label,
  each option's selected state is announced, and changing it is announced.
- Greyscale: the selected option is still identifiable — fill and weight, not hue alone (FR-126).
- Contrast: every option in both states, in both appearances, meets AA (FR-127).
- Touch targets: 44×44 minimum on all three.
- Simulate a failed write (private browsing on web; a mocked rejecting store on mobile). The appearance
  still changes, and the sheet says it will not be remembered — the existing `persistence-warning`
  surface, not a new one (FR-123).
- Screenshots in both appearances, both platforms, attached to the PR — the constitution requires this
  for any UI change.

---

## Performance (SC-049, SC-050)

**Required before merge**, because this feature adds work to the startup path on both platforms.

| Measurement | Budget | How |
| --- | --- | --- |
| Web cold start to usable display | ≤ 2 s, no >10% regression | `003`'s existing cold-start measurement, before and after |
| Mobile cold start to usable display | ≤ 2 s, no >10% regression | Launch-to-first-frame on the lowest supported device, before and after |
| Frame rate while switching appearance | 60 fps sustained | DevTools Performance on web; RN Perf Monitor on mobile, with a note ringing |

The mobile number is the one at risk: **D5** moves an AsyncStorage read in front of the root mount. It
is a single key and should be a few milliseconds, but "should be" is not a measurement, and the
constitution does not accept one.

Nothing here touches the DSP path or the render loop, so the audio-in→display latency figure is not
expected to move; capture it anyway on the same run, since it is free once the harness is open.
