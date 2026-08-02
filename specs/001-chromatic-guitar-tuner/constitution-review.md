# Constitution Compliance Review

**Date**: 2026-08-02 · **Against**: `.specify/memory/constitution.md` v2.0.0 · **Task**: T100

Reviewed at the completion of Phase 7, covering T001–T100. Measurements are in
[validation-results.md](./validation-results.md); the per-phase build log, including every defect and
deviation, is in [tasks.md](./tasks.md).

**Verdict: compliant, with two gaps that are outstanding rather than resolved** — both hardware-dependent,
both listed under Principle V.

---

## I. Code Quality Is Non-Negotiable — ✅

| Requirement | Evidence |
| --- | --- |
| Linter and formatter clean, zero warnings | `pnpm lint` runs with `--max-warnings 0`; `pnpm format:check` clean |
| No unexplained suppressions | **Zero** `eslint-disable`, `@ts-ignore`, `TODO`, or `FIXME` in any source or test file |
| Single nameable responsibility per unit | Enforced by review; the one unit that grew two jobs — `TunerSession` owning both channels — is the asymmetry the architecture exists for, and is documented as such |
| Names describe intent | `centsFromFrequency`-style throughout: `tuningStateOf`, `directionCue`, `normalizePreferences`, `readingAnnouncement` |
| Dead code deleted | The T027 lint-probe files were deleted after proving the rule fires; no archived code remains |
| Error paths explicit, no silent catch | Every `catch` in the codebase either returns a typed result the caller must handle, or carries a comment stating why swallowing is correct. `savePreferences` returning a boolean exists specifically so a failed write cannot be silent |

**Note.** The one place this principle actively shaped the design: obligation P2 ("a save failure must not
block tuning") and Principle I ("no silent catch") are only compatible if the outcome travels somewhere,
which is why `usePreferences` exposes `persistenceFailed` and both settings screens surface it.

## II. Simplicity Over Cleverness — ✅

| Requirement | Evidence |
| --- | --- |
| Simplest sufficient implementation | Two settings, one screen, one line. The spec's out-of-scope list was treated as binding throughout — no presets, no string targets, no reference tones |
| No speculative generality | `schemaVersion` is the single forward-looking field, and Principle VI requires it from day one |
| Dependency justification | `packages/core` has **exactly one** runtime dependency (`pitchy`); `packages/tokens` has **zero**. `@axe-core/playwright` is dev-only and replaces work no hand-written code should attempt |
| Micro-optimisations backed by a trace | The phase-refinement stage in `PitchAnalyzer` exists because MPM alone measured 1.3–1.9 cents of error at MIDI 83/88 — a recorded measurement, not a guess |

**One judgement call worth naming.** The service worker is hand-written with a build-time precache plugin
(~40 lines) rather than pulling in Workbox. That is the right side of the ~30-line rule, and the `Vary`
defect it produced was found by an actual offline load rather than shipped.

## III. Testing Standards (NON-NEGOTIABLE) — ✅

| Requirement | Evidence |
| --- | --- |
| Tests written first and observed failing | Recorded per phase: 14 of 19 (US2), 15 of 21 (US3); US4's `preferences.test.ts` could not resolve its import before the module existed |
| Accuracy verified against generated reference signals | Sine, sawtooth, weak-fundamental, and additive noise at controlled SNR; every semitone E1–E6 |
| Exercised outside the guaranteed range | A0–C8 in `accuracy-range.test.ts`; returns no reading rather than a confident wrong one |
| Regression test per bug fix | Every defect in tasks.md has one — the aliased reading, the start/stop race, the `Vary` cache miss, the frozen readout |
| Core coverage ≥90% lines | **100% lines**, 98.5% statements, 94.8% branches |
| Deterministic tests | No wall-clock or hardware dependency: retry scheduling is injected, audio is generated, the fake microphone replays a fixed WAV |
| Full suite under 60 s | **5.3 s** |

**The clearest evidence this principle worked**: the colour palette failed its own greyscale test before any
UI existed, and the FR-011 flicker showed up as `[40, 39, 40, 39, …]` in a test rather than in someone's
hands.

**And the clearest evidence of its limit**, found after this review was first written: the marker sat on the
centre line at −20 cents, and had done since US1. Principle III opens with "correctness MUST be demonstrated
by automated tests, not by manual inspection" — here the automated tests demonstrated nothing, and manual
inspection found it in about a second. The E2E assertion was `expect(transform).not.toBe('none')`, which the
constant centring transform satisfies: it demonstrated that *a mechanism had fired*, not that *the user saw
the right thing*.

Nothing in this principle is violated by that — the tests exist, they run first, they are deterministic, and
coverage is 100%. But it is worth stating plainly in the compliance record that **none of those properties
implies the assertions are meaningful**, and that this project shipped a broken signature element through
seven phases of them. The corrected specs measure rendered position; the general lesson is that a UI
assertion phrased against a mechanism rather than an outcome is worth roughly nothing, and no coverage
number will reveal that.

## IV. User Experience Consistency — ✅

| Requirement | Evidence |
| --- | --- |
| Legible at a glance from ~1 m | Note label 128 px, >4× the next largest element — asserted in `appearance.spec.ts`. The human 1 m check is outstanding (V10) |
| Redundant state channels | Colour, marker position, and text. Verified present under simulated achromatopsia |
| WCAG 2.1 AA contrast | Palette asserted in `packages/tokens/tests/contrast.test.ts`; **as applied** asserted by Axe in `a11y.spec.ts` |
| Single source of design tokens | One package, and a lint rule that makes a literal colour an error in `apps/*` |
| One visual language across platforms | The two `StatusBanner`s, `SettingsSheet`/`SettingsScreen`, and both `ReferenceBadge`s mirror each other structurally; only the copy differs, where it must |
| Visible focus, labels, ≥44×44 | Asserted per control on the rendered box, not on the token value |
| Light and dark, reduced motion respected | Both appearances asserted against the token set; reduced motion honoured globally in CSS and per-platform in both `TuningLine`s |
| Plain, instrument-agnostic copy | "Tighten" / "Loosen", not "raise the fundamental" |

**Two defects this principle's automation caught**, both invisible to review: the palette's luminance
collapse, and `opacity: 0.55` on a correct token measuring 3.9:1 — a token being right and its application
being wrong are different questions, and it took two different tests to see both.

## V. Performance Is A Feature — ⚠️ two gaps, both hardware

| Requirement | Status |
| --- | --- |
| Latency ≤100 ms to readout update | ✅ **66.6 ms** measured to first movement. Full settle is **136.2 ms**, which misses the quickstart's ~100 ms *guidance*; see [validation-results.md](./validation-results.md#v7-latency-in-detail) for why and for the measured cost of the alternative |
| Sustained 60 fps, no frame over 16.7 ms | ✅ in browser: p50 8.2 ms, p95 9.2 ms. ⚠️ **not measured on device** |
| No allocation in the audio path | ✅ asserted over 10,000 cycles; the reading object is reused and the suppressed-status path was rewritten to keep it that way |
| Cold start ≤2 s on the lowest supported device | ✅ 836 ms cold / 199 ms offline on a development Mac. ⚠️ **not measured on the lowest supported device** |
| Claims backed by measurement | ✅ latency, frame time, allocation and cold start are all tests, not assertions |
| 30-minute use without thermal impact | ❌ **not run** — requires a physical phone (V13) |

The two ⚠️ and one ❌ are the honest state: nothing is known to be failing, and nothing has been verified on
the hardware the constitution names. They are release-gate items, not code defects.

## VI. Scalability By Design — ✅

| Requirement | Evidence |
| --- | --- |
| Strict layering, dependencies inward | `packages/core` cannot import React, React Native, or touch a DOM global — a lint error, verified by probe, not a convention |
| Core pure and platform-agnostic | Compiles against `ES2022` alone: no DOM lib, no Node types. This is why retry scheduling had to be injected |
| New reference pitches addable as data | A4 is a runtime value across 415–466 Hz with no branching in the detection path |
| I/O behind narrow interfaces with a double | Three ports, three doubles, and one shared contract suite that runs against the doubles *and* the real adapters |
| Documented complexity | **Closed during this review** — `PitchAnalyzer.analyze` now documents its O(n log n) term by term. Contract N6 asserted it; the code did not state it |
| Versioned persistent state | `schemaVersion` written from the first release; `normalizePreferences` is the migration point |

---

## Gaps and follow-ups

| # | Item | Type | Blocking release? |
| --- | --- | --- | --- |
| 1 | On-device latency, frame rate, cold start (V7, V8, FR-026) | Hardware verification | **Yes** — Principle V names the device explicitly |
| 2 | 30-minute thermal and battery run (V13, SC-012) | Hardware verification | **Yes** |
| 3 | VoiceOver and TalkBack passes (V11) | Manual verification | **Yes** for SC-013's screen-reader clause |
| 4 | Glanceability from 1 m (V10) | Human judgement | Recommended; the mechanical precondition is automated |
| 5 | iOS and Android development builds never compiled | Build verification | **Yes** — mobile is verified only under `jest-expo` with the native module mocked |
| 6 | Settle time exceeds the quickstart's ~100 ms guidance | Product decision | No — the binding requirement is met; the alternative is measured and recorded |
| 7 | PWA ships SVG icons only | Cosmetic | No — installability is not a stated requirement |
| 8 | Audit the remaining UI assertions for the mechanism-vs-outcome flaw | Test quality | No, but it is the cheapest lesson available from this project |

Items 1–5 all need hardware or a human. None is a code change, and none is blocked by anything in the
repository.
