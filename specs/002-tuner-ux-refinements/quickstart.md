# Quickstart Validation: Tuner UX Refinements

**Feature**: `002-tuner-ux-refinements` · **Date**: 2026-08-03

Extends `001-chromatic-guitar-tuner`'s **V1–V13**, which all remain in force. New scenarios are **V14–V21**
and continue that numbering for the same reason the requirement numbers do — these are cited from code and
from `tasks.md`, and a reused number silently points at the wrong check.

## Prerequisites

```bash
pnpm install                # corepack enable first; Node 20+
```

The mobile legs need a development build on a physical device. **Expo Go cannot work.** As of `001`'s
Phase 8 the iOS build compiles, signs and installs; there is still no Android project or SDK in this
environment, so every mobile leg below is iOS-only until that changes.

## Running the suites

```bash
# Everything that gates a PR
pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:coverage && pnpm test:e2e

# Narrower, while working
pnpm vitest run --project core -t "lapse"
pnpm --filter @chromatic-tuner/web exec playwright test e2e/marker-rest.spec.ts
pnpm --filter @chromatic-tuner/mobile test -- microphone-toggle

# Mobile on device
pnpm --filter @chromatic-tuner/mobile ios
```

---

## V14 — Microphone stop and restart (US1, FR-036–FR-038) · automated + on device

Start the tuner, confirm readings, activate the stop control, then the start control.

**Expected**: capture stops and resumes; the control's label changes to state what it will do next; no
reload or restart is needed. On device, the operating-system recording indicator **clears** within a second
of stopping and returns on restart — this is the half that cannot be checked in a browser and must be seen
on hardware.

---

## V15 — A user-initiated stop survives backgrounding (US1, FR-040) · automated + on device

Stop capture, background the app or switch tabs, return.

**Expected**: still stopped. The tuner does **not** resume on its own.

This is the scenario most likely to pass by accident in a unit test and fail in reality, because
`useMicrophoneLifecycle` calls `start()` on every return to the foreground. Exercise the real lifecycle
event — `visibilitychange` on web, `AppState` on mobile — not a mocked intent flag.

---

## V16 — The permission flow is unchanged (US1, FR-041) · automated

With permission never granted, activate the start control for the first time.

**Expected**: the explainer appears before the platform prompt, exactly as in `001` V6. Denied and
`microphone-busy` states still show their recovery guidance, and the control does not present as though
starting succeeded.

---

## V17 — The marker rests when the signal dies (US2, FR-043, FR-044) · automated

Play a fixture tone displacing the marker, stop it, and measure the marker's position after the filter
releases.

**Expected**: the marker returns to the **same coordinate as at startup**, within 1 second (SC-018).

Measure with `apps/web/e2e/helpers.ts:markerOffsetPx`, which reads real bounding boxes and takes a median
across samples. Do not weaken it to make this pass: it exists because a single measurement disagreed by
44 px on correct code, and because `001`'s marker defect survived seven phases behind an assertion that
merely checked a transform existed.

---

## V18 — Sustained tones and brief dropouts (US2, FR-045, FR-046) · automated

Hold a tone well past the hold window; separately, interrupt one for less than the hold window.

**Expected**: neither resets the marker. No reset/re-acquire flicker at the boundary.

---

## V19 — The sheet survives a drag that ends outside it (US3, FR-048, FR-051) · automated

Press the reference-pitch control, drag the pointer outside the sheet, release.

**Expected**: the sheet is still open and the adjusted value is retained. Then confirm the routes that
*should* dismiss still do: a press starting and ending on the backdrop, "Done", and Escape.

Mobile counterpart: tap the dimmed backdrop and confirm the sheet closes (FR-049).

---

## V20 — The reference control reads as a control (US4, FR-052–FR-054) · automated + human

**Automated**: Axe over the tuner screen with the reference pitch at 440 and at a non-standard value, in
light and dark. Contrast must meet the AA floor for text and 3:1 for the border as a meaningful graphic.
Confirm the non-standard state remains more prominent than the standard one, and that the distinction
survives greyscale.

Check the **composited** result, not the palette. A correct token at `opacity: 0.55` measured 3.9:1 in
`001`, and the tokens package's own contrast test could not see it.

**Human**: show the default screen to someone who has not used the app and ask them to change the
reference pitch (SC-020). Not automatable; record the outcome either way.

---

## V21 — The mobile backdrop does not slide (US5, FR-055–FR-057) · on device

Open settings on mobile.

**Expected**: the dim is at full extent immediately; only the sheet slides up. With reduced motion enabled
at the OS level, the sheet appears without animating.

Genuinely visual — record a screen capture rather than asserting on animation internals, and compare
against the web sheet, which is the reference behaviour.

---

## Regression gates that must still pass

Every `001` scenario stays in force. These four are the ones this feature could plausibly break:

| From `001` | Why it is at risk here |
|---|---|
| **V4** — zero allocation in the hot path | US2 adds an event to the ~43 Hz channel. |
| **V7 / V8** — latency and frame rate | US2 touches the render path; Principle V requires before/after numbers in the PR. |
| **V11** — accessibility | US1 adds a control; US4 changes one. Axe must stay clean in every state of both. |
| **V5** — marker position measured in pixels | US2 changes when the marker moves. |

## Coverage summary

| Spec area | Scenarios |
|---|---|
| US1 microphone control | V14, V15, V16 |
| US2 stale readings | V17, V18 |
| US3 sheet dismissal | V19 |
| US4 reference affordance | V20 |
| US5 sheet presentation | V21 |
| Constitution gates | V4, V7, V8, V11 (from `001`) |

V16–V20 run in CI. **V14 and V15 have on-device legs, and V21 is on-device only** — those are release-gate
checks, in the same category as `001`'s V7, V8, V10 and V13.
