<!--
Sync Impact Report
==================
Version change: (uninitialized template) → 1.0.0
Bump rationale: Initial ratification. All placeholder tokens replaced with concrete,
testable governance content; no prior version existed to be incompatible with.

Modified principles:
  [PRINCIPLE_1_NAME] → I. Code Quality Is Non-Negotiable
  [PRINCIPLE_2_NAME] → II. Simplicity Over Cleverness
  [PRINCIPLE_3_NAME] → III. Testing Standards (NON-NEGOTIABLE)
  [PRINCIPLE_4_NAME] → IV. User Experience Consistency
  [PRINCIPLE_5_NAME] → V. Performance Is A Feature
  (added)            → VI. Scalability By Design

Added sections:
  - Quality & Performance Standards (was [SECTION_2_NAME])
  - Development Workflow & Quality Gates (was [SECTION_3_NAME])

Removed sections: none

Deferred TODOs:
  - TODO(TECH_STACK): Target platforms, languages, and frameworks are not yet chosen.
    Sections marked "stack-neutral" MUST be revisited (PATCH or MINOR amendment) once
    the first `/speckit-plan` fixes the stack, so that tool-specific gates (linter,
    formatter, coverage tool, profiler) can be named explicitly.
-->

# ChromaticTuner Constitution

## Core Principles

### I. Code Quality Is Non-Negotiable

Every change MUST leave the codebase at least as clean as it found it.

- Code MUST pass the project linter and formatter with zero warnings before merge; warnings
  MUST NOT be suppressed without an inline comment stating the reason.
- Every public function, type, and module MUST have a single, nameable responsibility. If a
  name requires "and" to be accurate, the unit MUST be split.
- Names MUST describe intent, not mechanism (`centsFromFrequency`, not `calc2`). Abbreviations
  are permitted only for domain-standard terms (Hz, FFT, cents, A4).
- Dead code, commented-out code, and unused dependencies MUST be deleted, not archived in place.
- Error paths MUST be handled explicitly. Silent `catch`/ignore blocks are prohibited; a caught
  error MUST be logged, surfaced to the user, or explicitly documented as benign.
- Duplicated logic MUST be extracted on its third occurrence, not its second (avoid premature
  abstraction) and never later than its third.

**Rationale**: A tuner's core is a small amount of signal-processing logic that will be read far
more often than written. Readability defects compound into correctness defects when the math is
subtle.

### II. Simplicity Over Cleverness

The simplest implementation that satisfies the specification MUST be chosen.

- YAGNI is binding: features, configuration options, abstraction layers, and extension points
  MUST NOT be built until a current requirement demands them.
- Any abstraction (interface, factory, plugin system, generic layer) with fewer than two real
  implementations MUST be justified in the plan's Complexity Tracking section or removed.
- Prefer plain functions and plain data over classes, inheritance, and frameworks-within-the-
  framework. Inheritance depth greater than one level MUST be justified in review.
- New third-party dependencies MUST be justified against: (a) what it replaces, (b) its install
  size and transitive footprint, (c) its maintenance status. A dependency used for fewer than
  ~30 lines of equivalent hand-written code MUST be rejected.
- Micro-optimizations that reduce readability MUST NOT be introduced without a profiler trace
  demonstrating the hot path (see Principle V).

**Rationale**: Complexity is the primary long-term cost in a single-purpose application.
Cleverness in a real-time audio path is especially expensive to debug.

### III. Testing Standards (NON-NEGOTIABLE)

Correctness MUST be demonstrated by automated tests, not by manual inspection.

- All pure logic — pitch detection, frequency-to-note mapping, cents deviation, tuning
  temperaments, transposition — MUST have unit tests written before or alongside the
  implementation, and those tests MUST fail before the implementation exists.
- Pitch-detection accuracy MUST be verified against generated reference signals (sine, sawtooth,
  and harmonically rich tones) across the instrument range A0–C8, asserting detected pitch within
  the accuracy budget defined in Quality & Performance Standards.
- Every bug fix MUST add a regression test that fails on the unfixed code.
- Line coverage of core logic modules (DSP, note math, state machines) MUST be ≥ 90%. UI shells
  and platform glue are exempt from the numeric target but MUST have at least one integration
  test covering their primary user flow.
- Tests MUST be deterministic. Tests that depend on real audio hardware, wall-clock timing, or
  network access MUST be isolated behind an explicitly-tagged suite that is not part of the
  default gate.
- The full default test suite MUST run in under 60 seconds locally; a slower suite gets split,
  not tolerated.
- A red test suite blocks merge. Skipping or deleting a failing test to unblock a merge is
  prohibited.

**Rationale**: A tuner that is confidently wrong is worse than one that fails visibly. Automated
accuracy tests are the only scalable defense.

### IV. User Experience Consistency

The UI/UX is the product, not a wrapper around it. UX decisions carry the same weight as
architectural ones.

- The interface MUST be usable at a glance while the user's hands are occupied with an
  instrument: primary tuning feedback MUST be legible from ~1 meter away and MUST NOT require
  interaction to read.
- Tuning state MUST be communicated redundantly — position/needle, color, and text — so the
  display is never dependent on color perception alone. Color contrast MUST meet WCAG 2.1 AA
  (4.5:1 for text, 3:1 for meaningful graphics).
- A single source of truth for design tokens (color, spacing, type scale, motion durations) MUST
  exist. Hard-coded literal colors, spacings, or durations in components are prohibited.
- Identical concepts MUST look and behave identically everywhere: one visual language for
  in-tune/flat/sharp, one interaction pattern for settings, one convention for units.
- Every interactive element MUST have visible focus, an accessible label, and a touch target of
  at least 44x44 pt/px.
- The app MUST work in both light and dark appearance and MUST respect the platform's reduced-
  motion and text-size preferences.
- No user-visible state may appear without a defined empty, loading, error, and no-permission
  variant (notably: microphone permission denied or unavailable).
- User-facing copy MUST be plain and instrument-agnostic; jargon requires an inline explanation.

**Rationale**: Musicians use a tuner in seconds-long bursts, often on a dark stage or mid-
rehearsal. Inconsistency or ambiguity in the readout directly causes mistuned instruments.

### V. Performance Is A Feature

Real-time responsiveness is a correctness requirement, not an optimization goal.

- End-to-end latency from audio input to on-screen readout update MUST be ≤ 100 ms at the 95th
  percentile; ≤ 50 ms is the target.
- The UI MUST sustain 60 fps during continuous tuning; no frame budget overrun above 16.7 ms may
  be introduced knowingly.
- The audio processing path MUST NOT allocate memory, lock, or perform I/O per audio callback.
  Buffers MUST be pre-allocated and reused.
- Cold start to a usable tuning display MUST be ≤ 2 seconds on the lowest supported target
  device.
- Performance claims MUST be backed by measurement. Any change to the DSP path or render loop
  MUST report before/after numbers for latency and frame time in the pull request.
- Regressions greater than 10% on any budget above MUST block merge until resolved or explicitly
  accepted with a documented rationale.
- Idle CPU usage MUST remain low enough that continuous 30-minute use does not cause thermal
  throttling or measurable battery anomalies on mobile targets.

**Rationale**: A tuner is judged almost entirely on how instantly and steadily it reacts.
Latency and jitter are perceived as inaccuracy, even when the math is correct.

### VI. Scalability By Design

The system MUST be structured so that growth in features, instruments, and platforms does not
require rewrites.

- Layers MUST be strictly separated: DSP/pitch-detection core → domain model (notes, temperaments,
  instruments) → presentation. Dependencies point inward only; the core MUST have no UI or
  platform imports.
- The core MUST be pure and platform-agnostic so it can be reused across platforms and exercised
  headlessly in tests.
- New instruments, tuning presets, temperaments, and reference pitches MUST be addable as data or
  configuration, never by editing branching logic in the detection path.
- All I/O boundaries (audio input, persistence, platform services) MUST sit behind narrow
  interfaces with at least one test double.
- Algorithms operating on audio buffers MUST have documented complexity; anything worse than
  O(n log n) per frame MUST be justified.
- Persistent state and settings MUST be versioned with a forward-migration path from the first
  release onward.

**Rationale**: The cheap path to a second instrument mode, a second platform, or a new temperament
is decided by the boundaries drawn in the first weeks, not by later refactors.

## Quality & Performance Standards

These are the measurable budgets referenced by the principles above. They are binding defaults;
changing a number is a constitution amendment, not a pull-request decision.

**Accuracy**

- Pitch detection accuracy: within ±1 cent for steady tones, A0 (27.5 Hz) through C8 (4186 Hz),
  at signal-to-noise ratios of 20 dB or better.
- Readout stability: displayed cents value MUST NOT oscillate by more than ±2 cents on a stable
  input tone.
- Reference pitch MUST be user-configurable across at least 415–466 Hz for A4.

**Performance budgets**

| Budget | Limit | Target |
|---|---|---|
| Audio-in → display latency (p95) | 100 ms | 50 ms |
| Sustained frame rate while tuning | 60 fps | 60 fps |
| Cold start to usable display | 2 s | 1 s |
| Default test suite runtime | 60 s | 20 s |
| Per-audio-callback allocations | 0 | 0 |

**Quality gates**

- Zero linter/formatter warnings.
- Core logic line coverage ≥ 90%.
- No new dependency without written justification.
- Accessibility: WCAG 2.1 AA contrast, labeled controls, 44 pt minimum touch targets.

**Stack-neutral note**: TODO(TECH_STACK) — concrete tool names (linter, formatter, coverage and
profiling tools, target OS versions and minimum device) MUST be recorded here once the first
`/speckit-plan` selects the stack.

## Development Workflow & Quality Gates

1. **Specify** — Every feature begins with a specification describing user-visible behavior and
   its UX states (default, empty, loading, error, permission-denied) before any code is written.
2. **Plan** — The implementation plan MUST include a Constitution Check. Any deviation MUST be
   recorded in Complexity Tracking with the simpler alternative that was rejected and why.
3. **Test first** — For core logic, failing tests MUST exist before the implementation lands
   (Principle III).
4. **Implement** — Smallest change that satisfies the spec. No speculative generality.
5. **Review** — Every pull request MUST be reviewed against this constitution. The reviewer MUST
   explicitly confirm: quality gates green, no unjustified complexity, tests present and
   meaningful, UX consistent with existing patterns, performance budgets measured for DSP/render
   changes.
6. **Merge** — Blocked while any gate is red. "Fix it in a follow-up" is not an accepted
   resolution for a constitution violation.

Pull requests touching the audio path or render loop MUST include before/after performance
numbers. Pull requests touching the UI MUST include a screenshot or recording in both light and
dark appearance.

## Governance

This constitution supersedes all other development practices, conventions, and preferences in
this project. Where a style guide, tool default, or habit conflicts with it, this document wins.

**Amendment procedure**

1. Propose the change as a pull request modifying this file, stating the problem the amendment
   solves.
2. The amendment MUST include the version bump, the updated Sync Impact Report, and a migration
   note for any code or process it invalidates.
3. Amendments take effect on merge and apply to all work started after that point.

**Versioning policy** (semantic versioning)

- **MAJOR** — A principle is removed or redefined in a backward-incompatible way; a binding
  budget is loosened.
- **MINOR** — A new principle or section is added; existing guidance is materially expanded or
  tightened.
- **PATCH** — Clarifications, wording, typo fixes, non-semantic refinements.

**Compliance review**

- Every pull request review MUST verify compliance; the reviewer records this in the review.
- Complexity MUST be justified in writing, not defended in conversation.
- This constitution MUST be re-read and re-validated at the start of every `/speckit-plan`, and
  reviewed for staleness at each release.
- Repeated violations of the same principle are a signal to amend the principle or fix the
  tooling that permits the violation — not to silently ignore it.

**Version**: 1.0.0 | **Ratified**: 2026-08-02 | **Last Amended**: 2026-08-02
