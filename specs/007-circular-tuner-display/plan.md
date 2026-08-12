# Implementation Plan: Circular Tuner Display

**Branch**: `007-circular-tuner-display` | **Date**: 2026-08-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-circular-tuner-display/spec.md`

## Summary

Give the player a second tuning display — a twelve-segment dial with C at the top
and a needle that sweeps clockwise as the string sharpens — and a setting to choose
between it and the horizontal line the app has always had. The line stays the
default, so nobody who never opens Settings sees any change.

The approach in one paragraph: the angle maths goes into `packages/core` as two
pure functions (`dialAngleDegrees`, `unwrapDegrees`) where it can be asserted to
the degree; the continuous reading channel gains a third scalar, `midi`, because
the needle's angle needs pitch class and cents *in the same frame* and today those
arrive on different channels a render apart; the dial itself is a new sibling
component to `TuningLine` in each app, drawn entirely from layout primitives —
rotated rectangles and absolutely-positioned labels — so no drawing dependency is
added and both platforms produce the same geometry; and the choice is a fourth
field in the preferences blob, which makes persistence, reset, repair-on-read and
the storage-failure warning inherited behaviour rather than new code.

The one finding worth reading before implementing is [research D6](./research.md):
a dial showing twelve notes is ~11× less sensitive per cent than the line
(0.3°/cent against 7.2 px/cent). That is inherent to the requested design, not a
defect — but it means the in-tune tolerance cannot be drawn as a region, and it is
why D7 marks the target with a line rather than a zone.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true`. `packages/core` compiles
against ES2022 only — no DOM lib, no Node types.

**Primary Dependencies**: None added. React 19 + Vite (web), Expo + React Native +
`react-native-reanimated` (mobile) — all already present. `react-native-svg` is
explicitly **not** introduced (research D4).

**Storage**: One JSON blob under `PREFERENCES_STORAGE_KEY` — `localStorage` on
web, AsyncStorage on mobile. The `PreferencesStore` port is unchanged; a fourth
field moves inside a record both adapters treat as opaque.

**Testing**: Vitest (`packages/*`), Jest + `jest-expo` (`apps/mobile`), Playwright +
Chromium with fake audio capture (`apps/web/e2e`), plus the runner-agnostic port
contract suite in `packages/core/testing/port-contract-tests.ts`.

**Target Platform**: Evergreen desktop and mobile browsers; iOS 16.4+; Android 8+.

**Project Type**: pnpm workspace — platform-free packages, thin platform shells.

**Performance Goals**: 60 fps sustained while tuning; audio-in → display ≤ 100 ms
p95; zero steady-state allocation in the audio path. The dial writes one transform
per frame, the same as the line.

**Constraints**: The dial's twelve labels, twelve ticks and rim are static and
render once; only the needle wrapper's transform is written at reading rate, and
never through React state. The third `midi` scalar must not introduce a
per-callback allocation (`allocation.test.ts`).

**Scale/Scope**: Two new core functions and their tests; one extended type, one
extended handler signature, one extended stored record; one new component per app;
one new settings group per app; ~10 new validation scenarios (V58–V71).

## Constitution Check

*GATE: passed before Phase 0, re-checked after Phase 1 design. No violations.*

| Principle | Assessment |
|---|---|
| **I — Code quality** | Two new named functions with single responsibilities (`dialAngleDegrees`, `unwrapDegrees`). No dead code: `TuningLine` is untouched and still reachable, because it remains the default display. Every new comment cites a G-number, an FR, or a measured defect. |
| **II — Simplicity** | **No new dependency** (D4). **No new abstraction**: two sibling components chosen over a parameterised "meter" that would have exactly two implementations sharing only a props shape (D1). The reading channel is extended by one scalar rather than restructured. The schema version does not move, because nothing needs migrating (D9). |
| **III — Testing** | Test-first. The angle maths is pure and lands in `packages/core` under the ≥90% floor with exact-degree fixtures (D12). The new preference gets a check in the shared port contract suite, so every adapter *and* every test double is held to it (G19) — adding behaviour to a port means adding a contract check, not just an adapter test. V61 exists because the wrap defect passes any test that only inspects the final angle. |
| **IV — UX consistency** | Same tokens, same `tuningStateOf`, same `noteName`, same in-tune tolerance — FR-160's "one visual language" is satisfied by reuse, not by re-implementation. The settings row uses the existing selected-tint idiom (not the heavier border, which is the focus idiom). 44 pt targets. Light and dark. Reduced motion drops the tween entirely (D11). Redundant channels survive: FR-168 keeps the note name, cents and direction cue on screen, so the dial adds a channel rather than replacing three. |
| **V — Performance** | One imperative transform write per frame, on a wrapper, never through React state (G21). Three scalars on the reading channel keep the callback allocation-free (G14). Before/after frame-time numbers are required in `tasks.md` (V71). |
| **VI — Scalability** | Dependencies still point inward: pure angle maths in `core`, the continuous channel in `core`, presentation per platform. `core` gains no DOM, no React, no platform import. Persistent state stays versioned with a forward path (D9). |

**Accessibility gates**: FR-167 sets the floors, G22 forbids the mechanism that has
defeated them twice (an opacity multiplier at a call site, invisible to both the
palette test and Axe), and V67 measures the composited result rather than the
token.

**Post-Phase-1 re-check**: no gate moved. The design added no dependency, no
abstraction, and no platform import to the core. The only contract *change* — the
third parameter on `ReadingHandler` — is additive and leaves every existing
subscriber working unmodified (G15).

## Project Structure

### Documentation (this feature)

```text
specs/007-circular-tuner-display/
├── plan.md              # This file
├── spec.md
├── research.md          # D1–D12
├── data-model.md        # §1–§7
├── quickstart.md        # V58–V71
├── contracts/
│   └── tuner-display.md # G1–G24
├── checklists/
│   └── requirements.md
└── tasks.md             # NOT created by /speckit-plan
```

### Source Code (repository root)

```text
packages/core/src/
├── types.ts                     # + TunerDisplay, isTunerDisplay
├── notes/
│   └── dial.ts                  # NEW — dialAngleDegrees, unwrapDegrees
├── tuning/session.ts            # ReadingHandler gains `midi`; publishes it
├── preferences.ts               # + tunerDisplay default and repair clause
├── ports/preferences-store.ts   # + tunerDisplay on StoredPreferences
└── index.ts                     # re-exports

packages/core/testing/
└── port-contract-tests.ts       # + tunerDisplay round-trip and repair checks

packages/core/tests/
├── dial.test.ts                 # NEW — G1–G11
├── preferences.test.ts          # + G16–G18
├── session.test.ts              # + G12, G13
└── allocation.test.ts           # unchanged, must still pass (G14)

packages/react/src/
├── TunerProvider.tsx            # + setTunerDisplay, publishes tunerDisplay
├── usePreferences.ts            # + tunerDisplay, setTunerDisplay
└── useTuner.ts                  # + subscribeToReading (cents, clarity, midi)

apps/web/src/components/
├── molecules/TuningDial.tsx     # NEW
├── organisms/TunerDisplay.tsx   # chooses line or dial
└── organisms/SettingsSheet.tsx  # + Tuning display group

apps/web/e2e/
├── helpers.ts                   # + needleAngleDeg (reads the computed matrix)
├── dial.spec.ts                 # NEW
└── a11y.spec.ts                 # + composited dial contrast

apps/mobile/src/components/
├── molecules/TuningDial.tsx     # NEW
├── organisms/TunerDisplay.tsx   # chooses line or dial
└── screens/SettingsScreen.tsx   # + Tuning display group
```

**Structure Decision**: The existing workspace layout is unchanged. The dial lands
at the same level as `TuningLine` — `molecules/` in both apps — because it is the
same kind of thing: a self-contained display that takes the tuning state and a
subscription and owns its own transform. Both apps mirror each other, as they
already do, so every file above has a counterpart in the other app except the
core and react packages, which are shared.

## Complexity Tracking

> No Constitution Check violations. This table is empty by design.

The two decisions that came closest to needing an entry, and why they did not:

| Considered | Why it would have been a violation | What was done instead |
|---|---|---|
| `react-native-svg` for the dial | A new dependency (Principle II) for drawing that twelve rotated rectangles already do, and a second drawing model to keep in step with web | Layout primitives on both platforms (D4) |
| A `TuningMeter` abstraction over line and dial | An abstraction with two implementations sharing only a props shape (Principle II) | Two sibling components and a ternary (D1) |
