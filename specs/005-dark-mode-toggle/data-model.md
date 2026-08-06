# Phase 1 Data Model: In-App Appearance Control

**Feature**: `005-dark-mode-toggle` | **Date**: 2026-08-05

This feature adds **one stored field** and **one derived value**. Everything else here is the existing
model, restated only where this change touches it.

---

## §1 Types

```ts
/** What is actually rendered. There are exactly two palettes and there always were. */
export type Appearance = 'light' | 'dark';

/** What the user chose and what is stored. 'system' defers to the device (FR-114). */
export type AppearancePreference = Appearance | 'system';
```

Both live in `packages/core/src/types.ts`, beside `AccidentalStyle` and `TuningState`, and follow the
same rule those two follow: a closed set of string literals, so that exhaustiveness is a compile error
rather than a runtime surprise.

`'system'` is a **stored value in its own right**, not a sentinel for "unset" and not a snapshot of what
the device said when it was chosen. This is FR-119's second sentence: a user who selects "Match device"
in daylight must still be matching the device that night, which is only true if the choice is stored as
the choice rather than as the light it resolved to.

---

## §2 `StoredPreferences` — one field added

```ts
export interface StoredPreferences {
  readonly a4Hz: number;
  readonly accidentalStyle: AccidentalStyle;
  readonly appearance: AppearancePreference;   // NEW
  readonly schemaVersion: number;
}
```

| Field | Default | Validation |
| --- | --- | --- |
| `a4Hz` | 440 | clamped to 415–466; non-finite → 440 |
| `accidentalStyle` | `'sharp'` | must be `'sharp'` or `'flat'`, else default |
| **`appearance`** | **`'system'`** | **must be `'light'`, `'dark'`, or `'system'`, else default** |
| `schemaVersion` | 1 | always rewritten at the current version |

The default is `'system'` and that is FR-114 and FR-122 in one line: a user who has never chosen, and a
record written before this feature existed, both land on the behaviour the app has today.

### Schema version: unchanged at 1

See research **D6**. `normalizePreferences` repairs fields **independently** — that is an existing
property, asserted by existing tests, and it is what makes this addition compatible without a migration.
An old record simply has no `appearance` to repair, so it takes the default and keeps its other two
fields. A version bump would announce a migration with nothing to migrate.

### Normalisation

`normalizePreferences` is total (obligation P1) and stays total. One clause is added:

```
appearance: isAppearancePreference(appearance) ? appearance : DEFAULT_PREFERENCES.appearance
```

The existing guarantees carry over unchanged and are worth restating because they are the reason no
adapter needs to know about this field: a corrupt appearance must not discard a good reference pitch
(FR-121), and neither adapter validates anything (both are deliberately thin, and stay that way).

---

## §3 Effective appearance — derived, never stored

```ts
export function resolveAppearance(
  preference: AppearancePreference,
  deviceAppearance: Appearance
): Appearance;
```

| `preference` | `deviceAppearance` | result |
| --- | --- | --- |
| `'light'` | either | `'light'` |
| `'dark'` | either | `'dark'` |
| `'system'` | `'light'` | `'light'` |
| `'system'` | `'dark'` | `'dark'` |

Four rows, and the table *is* the test. The two middle-column "either" cells are FR-116 — an explicit
choice outranks the device — and the bottom two are FR-115.

This value is computed once per render in `TunerProvider` and read by every surface through context, so
no two surfaces can disagree about which appearance is in effect. Nothing stores it.

---

## §4 State transitions

```
                    ┌──────────────────────────────────────────┐
                    │  stored preference: light | dark | system │
                    └──────────────────────────────────────────┘
                                      │
   device appearance ─────────────────┼──────────► resolveAppearance ──► Appearance
   (live, may change at any moment)   │                                   │
                                      │                                   ▼
                                      │                        web:    data-theme on <html>
                                      │                        mobile: useThemeColors()
                                      ▼
                              persisted on change
```

- **User selects an option** → context updates → every surface repaints (FR-118) → write is attempted;
  a failure sets `persistenceFailed` and changes nothing else (FR-123).
- **Device appearance changes** → `deviceAppearance` prop updates → `resolveAppearance` re-runs. The
  result changes only if the stored preference is `'system'` (FR-115, FR-116).
- **App starts** → the platform's synchronous path (research D3 on web, D5 on mobile) establishes the
  appearance *before* first paint; the React tree then renders already agreeing with it (FR-120).
- **Reset to defaults** → `appearance` returns to `'system'` with the other two fields, via the existing
  `clear()`, which is what a fresh install actually looks like.

---

## §5 Storage key

`'chromatic-tuner:preferences'` — unchanged, one key, one JSON blob, as `001` data-model §6 established.

It moves from two private constants into a single export from `packages/core` (research **D4**), because
the web no-flash script becomes its third consumer and is the one that cannot be type-checked against
the other two.

---

## §6 What is *not* in the model

- **No per-surface theming.** One appearance for the whole app.
- **No third palette.** `packages/tokens` is untouched; both appearances already exist there in full.
- **No cross-device state.** One value, on the device it was set on — no network, no account (FR-131).
- **No separate "resolved appearance" persistence.** Storing what `'system'` resolved to would break
  FR-119 the first time the device changed.
