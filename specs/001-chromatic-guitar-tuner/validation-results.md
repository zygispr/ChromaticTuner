# Validation Results: Chromatic Guitar Tuner

**Date**: 2026-08-02 · **Against**: [quickstart.md](./quickstart.md) V1–V13 · **Task**: T099

Run on a development Mac (Apple silicon, macOS 15.5), Node 24.14.0, pnpm 11.18.0, headless Chromium via
Playwright. **No physical phone was available**, so every scenario the quickstart marks "on device" is
recorded below as outstanding rather than passed — see [Not verified](#not-verified) for the exact list.

## Summary

| Suite | Result |
| --- | --- |
| Unit (`pnpm test`) | **414 passed**, 18 files, 5.3 s |
| Mobile (`jest-expo`) | **42 passed**, 5 files, 1.2 s |
| End-to-end (`pnpm test:e2e`) | **44 passed**, 29.5 s |
| `packages/core` coverage | **100% lines**, 98.5% statements, 94.8% branches |
| Eight quality gates | all green |

---

## Scenario results

| # | Scenario | Status | Evidence |
| --- | --- | --- | --- |
| V1 | Detection accuracy | ✅ pass | ±1 cent at every semitone E1–E6, for sine, sawtooth and weak-fundamental tones, at 20 dB SNR. Outside E1–E6 the analyzer returns no reading rather than a confident wrong one. `packages/core/tests/accuracy.test.ts`, `accuracy-range.test.ts` |
| V2 | Reading stability | ✅ pass | Within ±2 cents over 5 s of a steady noisy tone. `stability.test.ts` |
| V3 | No flicker at the boundary | ✅ pass | One name change per boundary crossing on an E2→D2 sweep, including at 20 dB SNR; **zero** changes while dithering ±2 cents on the midpoint. `filters.test.ts` |
| V4 | Zero allocation in the hot path | ✅ pass | 10,000 push/analyze cycles, no steady-state heap growth, same `PitchReading` instance returned. `allocation.test.ts` |
| V5 | End-to-end web tuning | ✅ pass | Real Chromium, fake microphone, three fixtures. `tuning-in-tune/-flat/-sharp.spec.ts` |
| V6 | Permission paths | ✅ pass | Denied shows explanation + platform recovery steps + retry; granting mid-session recovers with **no reload**. `permissions.spec.ts` |
| V7 | Latency | ⚠️ **partial — misses the stated targets** | Measured, see [below](#v7-latency-in-detail). On-device leg not run. |
| V8 | 60 fps under load | ⚠️ partial | Browser: frame time p50 **8.2 ms**, p95 **9.2 ms**, max **19.8 ms** over 20 s of live tuning; React does not re-render per reading. On-device leg not run. `performance.spec.ts` |
| V9 | Offline and zero network | ✅ pass | Zero cross-origin requests and zero request bodies during a full session (`no-network.spec.ts`). Production build reloads with the network disabled in **199 ms** (`scripts/verify-offline.mjs`). Mobile airplane-mode leg not run. |
| V10 | Glanceability and colour independence | ⚠️ partial | Automated: all three non-colour channels survive simulated achromatopsia; the page renders under deuteranopia, protanopia and tritanopia; note label ≥96 px and >4× the cue. `appearance.spec.ts`. The 1 m human judgement is not automatable and was not performed. |
| V11 | Accessibility | ⚠️ partial | Axe WCAG 2.1 A/AA clean on the tuner, the settings sheet and the explainer; every control labelled and ≥44 px; full keyboard operation with a visible focus ring. `a11y.spec.ts`. VoiceOver and TalkBack passes not performed. |
| V12 | Reference pitch | ✅ pass | A4 = 432 reads +32 cents on a 440 Hz string; the indicator is visible; the setting survives a full reload. `settings.spec.ts` |
| V13 | Thermal and battery | ❌ **not run** | Requires 30 minutes on a physical mid-range phone. |

---

## V7: latency, in detail

The quickstart states "marker **begins** moving within 50 ms; fully settles within ~100 ms", derived in
research D3 from the 1024-sample hop and the 4096-sample window.

Measured (`packages/core/tests/latency.test.ts`, a 40-cent pitch step at E2, identical across MIDI 28–88):

| Quantity | Measured | Quickstart target | Binding requirement |
| --- | --- | --- | --- |
| First marker movement | **66.6 ms** | 50 ms — **missed** | FR-027 / Principle V: ≤100 ms — **met** |
| Settle to within 1 cent | **136.2 ms** | ~100 ms — **missed** | — |

**Why.** Research D3's estimate omitted the median-of-5 filter added in US1 (research D7 stage 3). A
median-of-5 cannot move until three of its five samples are new — three hops, 69.6 ms — so it sets the floor
for first movement regardless of how fast the detector is. Settle is then bounded below by the 4096-sample
window itself (92.9 ms), which exists because ±1 cent at E1 (41 Hz) is not achievable with a shorter one.

**The trade-off is real and measurable.** Dropping the median window to 3 was measured, not estimated:

| Median window | First movement | Settle |
| --- | --- | --- |
| 5 (shipped) | 66.6 ms | 136.2 ms |
| 3 | 43.0 ms | 113.0 ms |

That buys 23.6 ms of responsiveness and costs outlier rejection — the stage that exists to stop a single bad
frame reaching the display. **It was not applied**, because changing shipped DSP tuning is a product decision
rather than a polish-phase one, and the binding requirement (FR-027, ≤100 ms for the reading to update) is
already met. The numbers are recorded here so the choice can be made deliberately.

The regression thresholds in `latency.test.ts` are set at 100 ms and 150 ms — above the measured values, so a
regression fails the build, and not at the measured values, which would make any regression invisible.

---

## Cold start (FR-026, SC-011)

Production build, real Chromium, fake microphone, navigation to a reported note
(`pnpm --filter @chromatic-tuner/web verify:offline`):

| Start | Time to first reading | Budget |
| --- | --- | --- |
| Cold, no service worker | **836 ms** | 2000 ms |
| Warm, service worker serving | **310 ms** | 2000 ms |
| Offline, network disabled | **199 ms** | 2000 ms |

Development-machine numbers. FR-026 specifies "the lowest supported target device", which is the outstanding
on-device measurement below.

---

## Not verified

Everything here needs hardware this run did not have. None of it is blocked by the code; all of it is a
release-gate check that must happen before shipping.

| Gap | Scenario | Why it matters |
| --- | --- | --- |
| Latency on a mid-range phone | V7 | The browser numbers cover the DSP path; the render and display path differ on device. |
| Sustained frame rate on a phone | V8 | Reanimated drives the marker on the UI thread; that path has no desktop equivalent. |
| 30-minute thermal and battery run | V13, SC-012 | Principle V's idle-CPU clause is only observable over time on real silicon. |
| Glanceability from 1 m | V10, SC-009 | A human judgement. The mechanical precondition — non-colour channels present — is automated. |
| VoiceOver and TalkBack | V11, SC-013 | Axe cannot judge whether an announcement is *useful*, only whether it is well-formed. |
| Mobile airplane mode | V9 | The web half is verified; the RN half needs a device. |
| iOS and Android development builds | — | Never compiled in this environment. The mobile app is verified only under `jest-expo` with the native module mocked. |
