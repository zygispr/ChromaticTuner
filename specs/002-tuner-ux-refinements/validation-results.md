# Validation Results: Tuner UX Refinements

**Date**: 2026-08-03, **device and human legs 2026-08-04** · **Against**: [quickstart.md](./quickstart.md)
V14–V21 · **Task**: T053

Run on a development Mac (Apple silicon, macOS 15.5), Node 24.14.0, pnpm 11.18.0, headless Chromium via
Playwright.

**The 2026-08-04 addendum closes every on-device and human gate.** Hardware: Žygimanto iPhone 15, iOS 26.6,
Debug development build (`expo run:ios --configuration Debug`, 0 errors, 1279-module bundle served by
Metro). Expo Go cannot substitute — `react-native-audio-api`, `react-native-reanimated`, `expo-keep-awake`
and `expo-dev-client` are native and absent from it. See [Not verified](#not-verified) for what genuinely
remains.

`001`'s V1–V13 all remain in force and were re-run as part of the gate suite.

## Summary

| Suite | Result |
| --- | --- |
| Unit (`pnpm test`) | **428 passed**, 18 files |
| Mobile (`jest-expo`) | **60 passed**, 8 files |
| End-to-end (`pnpm test:e2e`) | **69 passed** (65 at the 2026-08-03 run; +2 layout stability, +2 Safari sheet-height) |
| `packages/core` coverage | **100% lines**, 98.49% statements, 94.81% branches, 97.26% functions |
| Eight quality gates | all green |

Growth over the feature: **+14 unit**, **+15 mobile**, **+19 end-to-end**.

---

## Scenario results

| # | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| V14 | Microphone stop and restart | ✅ pass | Automated in `microphone-toggle.spec.ts` and `microphone-toggle.test.tsx`: capture stops, the audio source is released, restart resumes with no reload, the accessible name changes between states. **The OS recording indicator was confirmed on an iPhone 15 (2026-08-04)** — it clears on stop and returns on restart. |
| V15 | A stop survives backgrounding | ✅ pass | Automated on both platforms driving the **real** lifecycle event — `visibilitychange` on web, `AppState` on mobile — not a mocked flag. **Confirmed on device against real iOS suspension (2026-08-04)**: the tuner does not resume on its own. |
| V16 | The permission flow is unchanged | ✅ pass | `permissions.spec.ts` and `permissions.test.tsx` unchanged and green; the explainer still precedes the platform prompt, and every failure state still offers recovery. |
| V17 | The marker rests when the signal dies | ✅ pass | `marker-rest.spec.ts` measures real bounding boxes and asserts the marker returns to its **startup coordinate** within 0.5 px. `session.test.ts` proves the lapse fires exactly once, on the edge. |
| V18 | Sustained tones and brief dropouts | ✅ pass | A tone held past `holdMs` never lapses; a dropout shorter than `holdMs` never lapses. Both paired with the positive so neither passes vacuously. |
| V19 | The sheet dismisses only when meant | ✅ pass | Press-inside-release-outside and press-outside-release-inside both keep the sheet open; backdrop press, Done and Escape all still dismiss. Mobile backdrop press closes. See the pointer-capture note below. |
| V20 | The reference control reads as a control | ✅ pass | Axe clean in light and dark at 440 and at a non-standard value; composited border ≥ 3:1, text ≥ 4.5:1, opacity exactly 1; the control survives simulated achromatopsia; the non-standard state stays louder on two channels. **Human leg run 2026-08-04**: a tester who had not seen the app found the control **"quite easily"** — SC-020 passes. One finding beyond the scenario, recorded below. |
| V21 | The mobile backdrop does not slide | ✅ pass | **Confirmed on an iPhone 15, 2026-08-04, on both legs**: the dim reaches full extent immediately with only the sheet sliding, and with OS Reduce Motion enabled the sheet appears with **no animation at all** (FR-057 wants it dropped, not shortened). The automated half asserts `animationType="none"` and that the sheet carries its own animation; that could only ever prove the platform slide is off, not that the result looks right. |

**Regression gates from `001`**: V4 (zero allocation) extended to cover live→lapse→live transitions and
still passes; V5 (marker measured in pixels) green; V7/V8 reported below; V11 (Axe) green with six new
assertions.

---

## Principle V: before and after

US2 touches the render path, so the constitution requires both numbers.

| Measurement | Before | After | Verdict |
| --- | --- | --- | --- |
| First marker movement | 66.576 ms | **66.576 ms** | identical |
| Settle | 136.236 ms | **136.236 ms** | identical |
| Frame time p50 | 8.3 ms | **8.2–8.3 ms** | unchanged; gate is ≤ 17.5 ms |
| Frame time p95 | 9.2 ms | **9.2–9.3 ms** | unchanged; gate is ≤ 33.4 ms |
| Frame time max | 13.6 ms | 9.5–25.1 ms | **reported, not gated** — see below |

`max` is printed by `performance.spec.ts` but deliberately **not asserted**; only p50 and p95 are. Across
runs of identical code it ranged 9.5–25.1 ms, which is why it is quoted as a range rather than a figure and
why a movement in it alone is not evidence of anything. p50 and p95 are the stable, gated numbers, and both
are unchanged across the whole feature.

Latency unchanged **to the digit** — the desirable result, since US2 changes when the session *publishes*,
not how the analyzer *computes*.

**Cold start (FR-026, SC-022)**, measured against the production build with the service worker:

| Start | Time | Budget |
| --- | --- | --- |
| Cold, no service worker | **875 ms** | 2000 ms |
| Warm, service worker serving | 206 ms | 2000 ms |
| Offline, network disabled | 197 ms | 2000 ms |

US1 adds a control to the first screen and cost nothing measurable.

---

## The screenshot found a defect the whole suite missed

Recorded prominently because it is the second time this has happened in this project, in the same way.

The stopped state was captured for T048 and **the marker was still sitting at the −20 cents position it
held when capture stopped** — while the readout beside it had cleared to its placeholder and the banner
read "The microphone is off". The tuner was asserting a pitch it was no longer measuring, on the one
element the whole product is built around.

The cause is exactly US2's, on a path US2 did not cover. `TunerSession.stop()` cleared its
`hasLiveReading` flag without publishing the withdrawal, so the discrete channel cleared itself — as it
always has — and the continuous channel said nothing. `doInterrupt` had the same hole: the platform taking
the microphone away left the marker frozen too.

Every gate was green when this was found. **64 Playwright tests, 425 unit tests, Axe clean, and none of
them look at the screen.** `001`'s worst defect was found the same way, after that phase had already been
recorded as complete.

Fixed by extracting `withdrawReading()` and calling it from all three paths that end a reading — silence,
an explicit stop, and an interruption. Three core regression tests plus an end-to-end one, all verified
failing against the unfixed code first. One pre-existing test legitimately broke and was updated: it
asserted the last continuous event was a live reading, which is no longer true now that `stop()` withdraws.

---

## V19: the reported gesture does not reproduce

The report named the pitch slider — press it, drag out of the sheet, release, sheet vanishes. Probed
directly against the unfixed build, **that gesture left the sheet open**: Chromium takes pointer capture on
a range input being dragged, so the `mouseup` is retargeted back to the slider and the old
`stopPropagation` caught it.

The defect is real; the mechanism is press-origin rather than the slider. Two other gestures reproduced it
every time, and the tests are written around those. Worth flagging in case the slider case still reproduces
on other hardware — a real mouse leaving the window may release pointer capture where synthetic events do
not.

---

## Not verified

The four gaps that needed hardware or a person were **closed on 2026-08-04** and are struck through below.
What remains is genuinely outstanding.

| Gap | Scenario | Status |
| --- | --- | --- |
| ~~OS recording indicator clears on stop~~ | V14, T050 | ✅ **closed** — confirmed on an iPhone 15, iOS 26.6. |
| ~~Stop survives backgrounding, on device~~ | V15, T050 | ✅ **closed** — real iOS suspension, not a `visibilitychange`. |
| ~~The mobile backdrop no longer sweeps~~ | V21, T051 | ✅ **closed** — both legs, including OS Reduce Motion. |
| ~~An unfamiliar user finds the reference control~~ | V20, SC-020, T052 | ✅ **closed** — found "quite easily". |
| **Light and dark screenshots, mobile** | T048 | ❌ **still open, deliberately.** The web half is in [screenshots/](./screenshots/) and was reviewed by eye. Scripted capture is not available on iOS 26.6: `libimobiledevice`'s `screenshotr` reports `Invalid service` because the developer services moved behind the RemoteXPC tunnel, and the tool that does reach it (`pymobiledevice3`) needs root. Hand-held capture was declined in favour of confirming the behaviour directly (T051). |
| **VoiceOver and TalkBack over the new controls** | — | ❌ **still open.** Axe cannot judge whether the microphone toggle's changing accessible name is *useful*, only that it is well-formed. |
| **Safari confirmation of the sheet-height fix** | — | ❌ **still open.** Diagnosed by pixel measurement and fixed by removing the fieldset layout path; no engine in the suite reproduces the bug, so it has not been watched not-happening in real Safari. Needs *Allow remote automation* and `safaridriver`. |
| **Android, everything** | — | ❌ **still open.** No Android project or SDK in this environment, carried from `001`. |

Carried forward unchanged from `001`: on-device V7/V8, mobile airplane mode, V13 on mid-range hardware, and
the Android build. Note that V13's thermal leg needs a **Release** build; the 2026-08-04 run used Debug,
which is correct for behavioural and visual checks and wrong for performance ones.

---

## V20's finding: no hover affordance anywhere on web

The tester found the reference-pitch control quite easily, so SC-020 passes on its own terms. They then
volunteered something the scenario did not ask about: **no button in the web app changes colour on hover**,
and the change "doesn't have to be dramatic".

Recorded rather than acted on. FR-052–FR-054 are about the control being identifiable as interactive **at
rest** — which is what the border and the removed opacity multiplier deliver, and what Axe measures. A hover
state is a different affordance, it applies to every control rather than to the reference badge, and it has
no mobile counterpart, so it is new work with its own asymmetry rather than a loose end of this feature. It
is not on `001`'s out-of-scope list, so nothing forbids it.

This is the argument for keeping the human leg. It answered its own question and then reported something no
automated check was looking for — the same shape as the screenshot finding above, from a different direction.
