# Implementation Plan: Settings sheet behaves as a modal dialog

**Branch**: `006-fix-settings-sheet-focus` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-fix-settings-sheet-focus/spec.md`

## Summary

Four reported defects, one sentence: `SettingsSheet` says `aria-modal="true"` and nothing makes it
true. It does not contain focus, it does not contain scrolling, and it takes focus away from the
control the user is operating every time a preference changes.

**The four are two fixes, not four.** Defects 3 and 4 are a single line of dependency array, and
defects 1 and 2 are the two halves of "contain the dialog":

| Reported | Cause | Fix | Size |
| --- | --- | --- | --- |
| 3, 4 — focus jumps to **Done** | `useEffect(…, [open, onClose])` at `SettingsSheet.tsx:92` re-fires whenever `onClose` changes identity, and `onClose` is the inline arrow at `TunerDisplay.tsx:96` in a component that re-renders on every preference change | Split the effect: opening the sheet is the only thing that may move focus (**D1**) | ~6 lines |
| 1 — Tab escapes the sheet | Nothing handles `Tab`. `aria-modal` covers assistive technology and the scrim covers the pointer, but the keyboard has no owner | Handle `Tab` in the keydown listener that already handles `Escape` (**D3**) | ~18 lines |
| 2 — the page scrolls behind | Nothing locks the document. Supporting content has sat below the fold since `003` | `overflow: hidden` on the document element, with the scrollbar gutter paid back (**D4**) | ~12 lines |
| — | focus is discarded on close | Capture the opener, restore it on close (**D6**) | ~5 lines |

**The obvious answer was measured and rejected.** `<dialog>` + `showModal()` is the platform's own
modal, and it would in principle replace all of the above. A probe in the two engines that matter
(`research.md` **D2**) found it does **not** wrap Tab — focus lands on `<body>` past the last control,
and Chromium and WebKit disagree about Shift+Tab — and it does **not** block scrolling of the document
behind it, in either engine. It would satisfy neither FR-135 nor FR-139 without the same two handlers
written anyway, while restructuring the sheet's markup and a11y tree. Measured, not assumed.

**No new dependency, no new component, no new file in `apps/web/src`.** All of the web work lands in
`SettingsSheet.tsx`. `packages/core`, `packages/react`, `packages/tokens`, the DSP path, the two output
channels, the stored preferences record, and every pixel of the sheet are untouched — FR-145 and
SC-062 make the last one a verified claim rather than an intention.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true` — unchanged. Nothing here is core logic; this is
entirely `apps/web` presentation plus assertions on `apps/mobile`.

**Primary Dependencies**: React 19 / Vite 8 (web), Expo 57 / React Native 0.86 (mobile). **No new
dependencies.** `focus-trap`, `react-focus-lock` and `body-scroll-lock` all exist to do exactly this
and are all declined by Principle II's ~30-line rule — the trap this dialog needs is 18 lines because
the dialog is one sheet with eight controls and no nesting, no portals, and no iframes (**D8**).

**Storage**: untouched. No key, no field, no version. `data-model.md` exists to say so and to name the
transient state the sheet gains.

**Testing**: Playwright carries this feature, because every guarantee is about real focus, real key
events, and real scroll position — none of which jsdom models faithfully. New assertions go in the
existing `apps/web/e2e/settings.spec.ts` and `apps/web/e2e/a11y.spec.ts` rather than a new spec file.
`jest-expo` covers the three mobile parity assertions. Nothing is added to `packages/core`'s suite; its
coverage floor is unaffected because no core file changes.

**Target Platform**: iOS 16.4+, Android 8+, evergreen desktop and mobile browsers — the constitution's
supported targets, unchanged. The probe covered Chromium and WebKit; Firefox's Playwright build is not
installed on this machine and the behaviours relied on (`Tab` keydown, `overflow`, `activeElement`) are
not engine-specific in the way `<dialog>` turned out to be.

**Performance Goals**: unchanged, and **not at risk**. Nothing added runs in the audio path, in the
render loop, or on the startup path. The keydown listener exists only while the sheet is open, and the
sheet is only open when the tuner is not being read. No before/after latency or frame-time numbers are
required, because Principle V's measurement obligation is scoped to the DSP path and the render loop
and this touches neither.

**Constraints**, all established by inspection or measurement rather than assumed:

- **The document scrolls.** `TunerLayout` is `100dvh` with `overflow: hidden`, but the supporting
  content `003` added lives after `#root` in `index.html`, so the scroller is the document element.
- **`TunerDisplay` re-renders on every preference change** — it destructures `usePreferences()` at
  `TunerDisplay.tsx:41` — which is what makes the inline `onClose` arrow an unstable dependency.
- **The sheet cannot be `inert`ed from an ancestor**: it renders *inside* `<section
  data-testid="tuner-display">`, so the elements to be made inert are its own ancestors (**D3**).
- **`<StrictMode>` is on** (`main.tsx:202`), so any effect cleanup runs once spuriously in dev. The
  focus-restore design has to be correct under that, not merely correct in production (**D6**).
- **The scrollbar gutter is 0 on this machine** (macOS overlay scrollbars, measured) and non-zero on
  CI's Ubuntu runners, so FR-141 cannot be verified by measuring a width locally (**D4**).

**Scale/Scope**: one component changed, three test files extended, one mobile test file added.
Approximately 40 lines of production code in total, all in `apps/web/src/components/organisms/
SettingsSheet.tsx`.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design. Both passes recorded.*

| Principle | Assessment | Verdict |
| --- | --- | --- |
| **I — Code quality** | Each of the four behaviours is a separately named, separately commented unit inside one component; none requires "and" to describe. No dead code — the single `useEffect` is *split*, not duplicated beside a successor. Every early `return` in the trap is a stated condition rather than a silent one. | **PASS** |
| **II — Simplicity** | The three candidate dependencies are declined (**D8**), and so is the structural rewrite `<dialog>` would require — on evidence, not taste (**D2**). No new abstraction: nothing here has two implementations, so nothing is generalised. The focusable-set query is inline in the one place that needs it, not a hook. | **PASS** |
| **III — Testing** | Every one of the four defects gets a regression test observed failing against the current code first, which is the rule for bug fixes stated verbatim in Principle III. Playwright is the runner because these are real-focus and real-scroll assertions (**D7**). No test is skipped, weakened, or deleted. | **PASS** |
| **IV — UX consistency** | "One interaction pattern for settings" is precisely what this restores: the sheet already claims dialog semantics on both platforms and this makes the web honour them. Visible focus is preserved — the trap moves focus, it never suppresses the `:focus-visible` ring. No token, colour, spacing or duration changes; FR-145 and SC-062 pin the pixels. | **PASS** |
| **V — Performance** | Nothing in the audio path, the render loop, or startup. One document keydown listener, live only while the sheet is open. The focusable query runs on `Tab` keypresses — user-paced, not frame-paced. | **PASS** |
| **VI — Scalability** | Dependencies still point inward; nothing is added to `packages/*`. This is platform-shaped behaviour landing in the platform shell, which is where the layering says it belongs — the equivalent mobile behaviour is a different mechanism (a native `Modal`), which is exactly why it was never shared code. | **PASS** |

**Post-Phase-1 re-evaluation**: no principle moved. Phase 1 added no abstraction, no dependency, no
port, and no file to `apps/web/src`. The item that came closest to a violation was Principle II on the
trap itself — a hand-written focus trap is a well-known way to get accessibility subtly wrong, which is
the usual argument for a library. **D8** records why the 30-line rule still decides it here: the
containment surface is one non-nested dialog with eight controls, and `contracts/modality.md` states
the obligations as testable guarantees (K1–K11) so "subtly wrong" has somewhere to fail loudly.
No Complexity Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/006-fix-settings-sheet-focus/
├── plan.md              # This file
├── spec.md              # FR-132–FR-145, SC-056–SC-062
├── research.md          # Phase 0 — D1–D8, including the <dialog> probe
├── data-model.md        # Phase 1 — transient state only; nothing persisted changes
├── quickstart.md        # Phase 1 — V49–V57
├── contracts/
│   └── modality.md      # Phase 1 — guarantees K1–K11
├── checklists/
│   └── requirements.md  # Spec quality checklist (all pass)
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
apps/web/
├── src/components/organisms/
│   └── SettingsSheet.tsx        # ALL production changes land here:
│                                #   · effect split — open is the only focus trigger (K1, D1)
│                                #   · Tab handling beside the existing Escape (K3–K6, D3)
│                                #   · scroll lock + gutter payback (K8–K10, D4)
│                                #   · opener captured on open, restored on close (K7, D6)
└── e2e/
    ├── settings.spec.ts         # V49–V51 — focus stability, the reported defects 3 and 4
    └── a11y.spec.ts             # V52–V55 — containment, restoration, scroll lock

apps/mobile/
└── __tests__/
    └── settings-modality.test.tsx   # V56 — the three parity assertions (FR-142, D7)
```

**Structure Decision**: the existing four-layer graph, unchanged — `tokens ← core ← react ← apps/*`.
This feature adds no directory, no package, and no file under `apps/web/src`. It is the first feature
in the log whose entire production diff is one file, which is the honest shape of the work rather than
a target that was aimed at: three of the four defects are properties of one component's relationship to
the document, and the document is only addressable from the platform shell.

The one new file is a mobile *test*. It is separate from `__tests__/settings.test.tsx` rather than
appended to it because it asserts a different kind of thing — that the platform still provides
behaviour we are not implementing — and FR-143 exists so that assertion cannot be quietly deleted along
with a settings test someone is rewriting.

## Complexity Tracking

> No entries. No constitution gate required justification, no abstraction was added, and no dependency
> was introduced. The two temptations — `<dialog>`/`showModal()` (**D2**) and a focus-trap library
> (**D8**) — were both declined, and the reasoning is in `research.md` rather than here because neither
> was adopted.

## Phase Status

- [x] **Phase 0** — `research.md`, D1–D8, no unresolved NEEDS CLARIFICATION
- [x] **Phase 1** — `data-model.md`, `contracts/modality.md` (K1–K11), `quickstart.md` (V49–V57)
- [x] Constitution Check evaluated pre-Phase-0 and re-evaluated post-Phase-1 — PASS both times
- [ ] **Phase 2** — `tasks.md` (`/speckit-tasks`)
