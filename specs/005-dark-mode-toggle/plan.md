# Implementation Plan: In-App Appearance Control

**Branch**: `005-dark-mode-toggle` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-dark-mode-toggle/spec.md`

## Summary

Add a three-option appearance control — Match device, Light, Dark — to the existing settings surface on
both apps, store the choice with the two preferences already there, and make it the appearance the app
is in before it paints anything.

**The feature is one hard requirement and a lot of small ones.** The hard one is FR-120: the stored
appearance must be in effect on the first frame. Today `TunerProvider` seeds from `DEFAULT_PREFERENCES`
and replaces that when storage resolves (`TunerProvider.tsx:54`, `:69`). For a reference pitch nobody
can see the difference; for appearance it means a white flash on every launch for the user who chose
dark — in the exact conditions that made them choose it. The async path cannot carry this preference
alone, so each platform gets a synchronous route to first paint:

| Platform | Route | Why it is the only one |
| --- | --- | --- |
| Web | A blocking inline `<script>` in `<head>`, emitted by the build (**D3**) | Since `003` the document has real content, so the browser paints before the module graph runs |
| Mobile | `index.js` loads preferences *before* `registerRootComponent` (**D5**) | The native launch screen stays up until the first RN view renders, so the first frame is already right |

Two things make this much smaller than it looks. The web's `[data-theme]` override blocks **already
exist** and are already tested — `appearance.spec.ts:62` was written for this feature before it was
specified: *"If the override did not win, a future in-app theme switch would silently do nothing."* And
`packages/tokens` is untouched: both palettes are complete, contrast-checked, and shipping.

**No new dependencies. No fourth port. No change to `packages/tokens`, the DSP path, the note math, the
filter chain, or the two output channels.** FR-130 makes that a requirement rather than an intention.

## Technical Context

**Language/Version**: TypeScript 5.x, `strict: true` — unchanged. `packages/core` still compiles against
ES2022 with no DOM lib; the two new types and `resolveAppearance` are plain string unions and a
three-line function, which is the whole reason the rule can live there.

**Primary Dependencies**: React 19 / Vite 8 (web), Expo 57 / React Native 0.86 (mobile). **No new
dependencies.** `expo-splash-screen` was the obvious answer for the mobile half and was rejected: it is
not resolvable from `apps/mobile` today (verified, not assumed), so it would be a new dependency
replacing four lines in `index.js` — Principle II's ~30-line rule declines it (**D5**).

**Storage**: the existing single key, `'chromatic-tuner:preferences'`, one JSON blob, `localStorage` on
web and AsyncStorage on mobile. One field is added inside it. The key itself moves into
`packages/core` as an export, because the no-flash script is its third consumer and the first that
cannot be type-checked against the others (**D4**, Principle I's rule of three).

**Testing**: Vitest for `packages/core` and `packages/react`; `port-contract-tests.ts` gains one
round-trip check rather than a new port suite; Playwright extends the existing `appearance.spec.ts`;
`jest-expo` covers the mobile settings group and the first-frame assertion. The one test that would
catch a naive implementation is V43 step 3 — read `data-theme` after `waitUntil: 'commit'`, before the
bundle executes (**D10**).

**Target Platform**: iOS 16.4+, Android 8+, evergreen browsers — the constitution's supported targets,
unchanged.

**Project Type**: pnpm workspace. This feature touches `packages/core`, `packages/react`, `apps/web`,
and `apps/mobile`. It does not touch `packages/tokens` or `listing/`.

**Performance Goals**: unchanged budgets, but **this feature is not exempt from measuring them**, unlike
`004`. It adds work to the startup path on both platforms, so cold start must be measured before and
after on each (SC-049). The mobile number is the one genuinely at risk: **D5** puts an AsyncStorage read
in front of the root mount. Nothing here runs while audio is being processed, so the latency and
allocation budgets are untouched by construction.

**Constraints**: Three, all discovered by inspection rather than assumed.
**The preference load is asynchronous on both platforms** — the constraint the whole design is shaped
around. **No Content-Security-Policy is set on the web app**, so the inline script needs no hash today;
if a CSP is ever added, it needs one. **`userInterfaceStyle: 'automatic'` must stay** in
`app.config.ts`, because it governs native surfaces (launch screen, alerts, keyboard) that cannot read
AsyncStorage — which leaves one accepted seam, documented in **D9**.

**Scale/Scope**: one stored field, one derived value, one pure function, one control per app.
Approximately: 4 files in `packages/core`, 3 in `packages/react`, 5 in `apps/web`, 5 in `apps/mobile`.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design. Both passes recorded.*

| Principle | Assessment | Verdict |
| --- | --- | --- |
| **I — Code quality** | The storage key hits its third occurrence and is extracted (**D4**), which is the rule applied on time rather than late. No dead code; `apps/mobile/src/theme.ts`'s `useAppearance()` is *replaced*, not left beside its successor. Every error path in the no-flash script is explicit and its silence is documented as benign (M12). | **PASS** |
| **II — Simplicity** | The two candidate abstractions were both rejected: no `AppearanceSource` port (**D2** — core never calls it, so it would be an interface passed through React to React), and no new dependency (**D5**). No transition animation (**D7**), which removes FR-128's obligation instead of implementing it. | **PASS** |
| **III — Testing** | Test-first on the pure logic: V39 and V40 are written and observed failing before `resolveAppearance` and the normaliser clause exist. The contract suite gains a round-trip check, per the repo rule that adding port behaviour means adding a contract check. V43 is the regression test for the flash defect this design exists to prevent. | **PASS** |
| **IV — UX consistency** | The control reuses the accidentals group's exact treatment, inheriting the selection-vs-focus fix from `500dfb5` rather than risking it again (**D8**). Selection is carried by fill and weight, not hue (FR-126). Labels are plain — "Match device", not "System" or "Auto". No literal colours; tokens only. Light and dark screenshots on both platforms are required by the quickstart. | **PASS** |
| **V — Performance** | Nothing runs in the audio path. Startup does gain work on both platforms, so before/after cold-start numbers are a merge requirement, not a courtesy (quickstart §Performance). Instant repaint over a transition is also the cheaper choice on a low-end device. | **PASS** |
| **VI — Scalability** | Dependencies still point inward: the rule is pure and lives in the core, the platforms inject a value. Persistence stays versioned; the version does not bump because the change is compatible in both directions and a bump would announce a migration with nothing to do (**D6**). | **PASS** |

**Post-Phase-1 re-evaluation**: no principle moved. The design added no abstraction, no dependency, and
no port between the two passes. The one item that came *closer* to a violation during Phase 1 was the
`AppearanceSource` port, which Constitution VI's "platform services behind narrow interfaces" appears to
require; **D2** records why the typed prop plus the pure function satisfies that clause and why a
stateful port with a contract suite would be ceremony for a value with no failure mode. No Complexity
Tracking entries.

## Project Structure

### Documentation (this feature)

```text
specs/005-dark-mode-toggle/
├── plan.md              # This file
├── spec.md              # FR-114–FR-131, SC-046–SC-055
├── research.md          # Phase 0 — D1–D10
├── data-model.md        # Phase 1 — the added field and the derived value
├── quickstart.md        # Phase 1 — V39–V48
├── contracts/
│   └── appearance.md    # Phase 1 — guarantees M1–M12
├── checklists/
│   └── requirements.md  # Spec quality checklist (all pass)
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
packages/core/
├── src/
│   ├── types.ts                      # + Appearance, AppearancePreference
│   ├── appearance.ts                 # + resolveAppearance (M1–M4)
│   ├── preferences.ts                # + appearance field, default, normaliser clause (M5–M7)
│   ├── ports/preferences-store.ts    # + the field on StoredPreferences; the PORT is unchanged
│   └── index.ts                      # + PREFERENCES_STORAGE_KEY (M8)
├── testing/port-contract-tests.ts    # + appearance round-trip
└── tests/
    ├── appearance.test.ts            # V39 — written first
    └── preferences.test.ts           # V40, V41

packages/react/
├── src/TunerContext.ts               # + appearance, appearancePreference, setter, preferencesLoaded
├── src/TunerProvider.tsx             # + deviceAppearance & initialPreferences props (M9–M11)
└── src/usePreferences.ts             # surface the additions

apps/web/
├── index.html                        # receives the generated no-flash script
├── vite.config.ts                    # siteIdentity() emits it, from the shared key (D3, D4)
├── src/useDeviceAppearance.ts        # matchMedia via useSyncExternalStore
├── src/main.tsx                      # pass deviceAppearance; write data-theme, gated on M10
├── src/components/organisms/SettingsSheet.tsx   # the three-option group
└── e2e/appearance.spec.ts            # V43, V44

apps/mobile/
├── index.js                          # async: load preferences before registerRootComponent (D5)
├── src/App.tsx                       # accept and forward initialPreferences + useColorScheme()
├── src/theme.ts                      # useAppearance() reads context, not the OS
├── src/components/screens/SettingsScreen.tsx    # the three-option group
└── __tests__/                        # V45, settings group
```

**Structure Decision**: the existing four-layer graph, unchanged —
`tokens ← core ← react ← apps/*`. This feature adds no directory and no package. `packages/tokens`
appears nowhere above because it needs nothing: both palettes are already complete. The only structural
novelty is that `apps/web/vite.config.ts` starts importing from `@chromatic-tuner/core` as well as
`@chromatic-tuner/tokens`, which needs no new machinery — it is TypeScript and already does the latter.

## Complexity Tracking

> No entries. No constitution gate required justification, no abstraction was added, and no dependency
> was introduced. The two temptations — a fourth port (**D2**) and `expo-splash-screen` (**D5**) — were
> both declined, and the reasoning is in `research.md` rather than here because neither was adopted.

## Phase Status

- [x] **Phase 0** — `research.md`, D1–D10, no unresolved NEEDS CLARIFICATION
- [x] **Phase 1** — `data-model.md`, `contracts/appearance.md` (M1–M12), `quickstart.md` (V39–V48)
- [x] Constitution Check evaluated pre-Phase-0 and re-evaluated post-Phase-1 — PASS both times
- [ ] **Phase 2** — `tasks.md` (`/speckit-tasks`)
