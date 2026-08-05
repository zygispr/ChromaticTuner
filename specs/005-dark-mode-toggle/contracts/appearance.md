# Contract: Appearance

**Feature**: `005-dark-mode-toggle` | **Date**: 2026-08-05

Guarantees are numbered **M1–M12** (for *mode*; `A`, `P`, `R`, `S`, `N`, `L`, `W`, `T`, `C`, `D`, `E`
are taken by `001`–`004`). Code comments cite these numbers, as they do for `S1`, `A5`, `N7`, `P1`.

This contract extends, and does not modify, `001`'s `core-api.md` and `platform-ports.md`. The
`PreferencesStore` port itself is **unchanged** — it moves one more field inside a blob it already
treats as opaque.

---

## §1 Core: resolution

### M1 — `resolveAppearance` is total and pure

```ts
resolveAppearance(preference: AppearancePreference, deviceAppearance: Appearance): Appearance
```

Returns for every one of the six input combinations, throws for none, reads nothing outside its
arguments, and writes nothing. Same inputs, same output, always.

### M2 — An explicit preference outranks the device

When `preference` is `'light'` or `'dark'`, the result equals `preference` regardless of
`deviceAppearance`. **(FR-116)**

### M3 — `'system'` defers to the device

When `preference` is `'system'`, the result equals `deviceAppearance`. **(FR-115)**

### M4 — The result is always a renderable appearance

The return type is `Appearance`, never `AppearancePreference`. `'system'` can be stored and it can be
chosen; it can never be *rendered*. Any code path that could paint `'system'` is a defect.

---

## §2 Core: preferences

### M5 — `normalizePreferences` defaults an unusable appearance to `'system'`

Absent, `null`, a number, an empty string, `'System'`, `'auto'`, or any value outside the three
permitted literals yields `'system'`. **(FR-121)**

### M6 — Fields are still repaired independently

An unusable `appearance` must not disturb `a4Hz` or `accidentalStyle`, and an unusable `a4Hz` must not
disturb `appearance`. This is an existing guarantee of the function; M6 exists so that adding a field
does not quietly weaken it. **(FR-121, FR-122)**

### M7 — A record written before this feature loads without loss

`{ a4Hz: 432, accidentalStyle: 'flat', schemaVersion: 1 }` normalises to that same reference pitch and
accidental style, with `appearance: 'system'`. `PREFERENCES_SCHEMA_VERSION` remains `1`; see research
**D6**. **(FR-122)**

### M8 — The storage key has exactly one definition

`PREFERENCES_STORAGE_KEY` is exported from `packages/core` and is the only place the string
`'chromatic-tuner:preferences'` appears in the repository. Both adapters and the web no-flash script
import it. **(research D4)**

> Enforceable: a repository-wide search for the literal outside `packages/core` returning any hit is a
> failure. Worth an assertion, because the one consumer that cannot be type-checked against the others
> is the one embedded in generated HTML.

---

## §3 React layer

### M9 — One appearance, read from one place

`TunerProvider` computes `resolveAppearance(stored.appearance, deviceAppearance)` once per render and
publishes it on the context. Every surface reads that value. No component may call `resolveAppearance`
itself, and no component may consult the platform appearance directly.

Context additions:

```ts
readonly appearance: Appearance;                                  // resolved, for rendering
readonly appearancePreference: AppearancePreference;              // stored, for the control
readonly setAppearancePreference: (p: AppearancePreference) => void;
readonly preferencesLoaded: boolean;                              // see M10
```

`deviceAppearance` is a prop, not a port — research **D2**. It defaults to `'light'` when omitted, which
keeps `TunerProvider` usable in a test that does not care.

### M10 — `preferencesLoaded` is false until storage has answered

It starts `false`, becomes `true` exactly once when the store resolves (or immediately, when
`initialPreferences` was supplied), and never returns to `false`.

Its purpose is narrow and load-bearing: **the web app must not write `data-theme` from React state
before this is true.** Writing the default state's appearance on mount would overwrite what the inline
script correctly established and reintroduce the flash the script exists to prevent. **(FR-120)**

### M11 — `initialPreferences` seeds state synchronously

When supplied, `TunerProvider` uses it as the initial state, reports `preferencesLoaded` as `true` from
the first render, and does not perform the async load. It is already-normalised data; the provider does
not re-validate it. **(FR-120, research D5)**

---

## §4 Platform obligations

These are not code interfaces — they are what each app must do to keep M9 and M10 true. They are stated
here because they are the parts most likely to be implemented differently on the two platforms and are
therefore where FR-124 breaks first.

### M12 — The appearance is established before the first painted frame

**Web.** A synchronous `<script>` in `<head>`, emitted by the build, reads `PREFERENCES_STORAGE_KEY`
from `localStorage`, resolves it against `matchMedia('(prefers-color-scheme: dark)')`, and sets
`data-theme` on `<html>`. It must:

- run before any stylesheet paints — inline and blocking, not deferred, not a module;
- swallow every error and do nothing on failure, leaving the media query in charge (M12 degrades to
  today's behaviour, it never degrades to a wrong appearance);
- set no attribute at all when the stored preference is `'system'`, so the media query keeps control and
  a later OS change is followed without JavaScript.

**Mobile.** `index.js` loads and normalises preferences before `registerRootComponent`, so the native
launch screen — which is already showing — stays up until the first React frame is correct. The frame is
never rendered with the default appearance and then corrected.

**Accepted seam (research D9):** the native launch screen follows the OS via
`userInterfaceStyle: 'automatic'` and cannot know about an in-app override. M12 governs the frames the
app renders.

---

## §5 What this contract does not change

- `AudioSource`, `WakeLock`, and the `PreferencesStore` **interface** — untouched. No fourth port
  (research **D2**).
- `port-contract-tests.ts` gains no new port suite. It gains one check that a `StoredPreferences`
  carrying each of the three appearance values round-trips through `save`/`load` unchanged, which is a
  property of the adapters, not of the new types.
- The discrete/continuous output split, `PitchAnalyzer`'s reuse of one `PitchReading`, and the
  zero-allocation steady state. **Nothing in this feature runs while audio is being processed.**
