# Phase 1 Data Model: Settings sheet behaves as a modal dialog

**Feature**: `006-fix-settings-sheet-focus` | **Date**: 2026-08-06

## Nothing persisted changes

This feature stores no data and changes no stored data. Stated explicitly because the settings sheet is
where the stored preferences live, so "we touched the settings" reads like "we touched the record":

- `PREFERENCES_STORAGE_KEY` — unchanged, still the single definition in
  `packages/core/src/preferences-key.ts`.
- The stored blob — unchanged: `a4Hz`, `accidentalStyle`, `appearance`, same shape, same version.
- `normalizePreferences`, `DEFAULT_PREFERENCES`, `resolveAppearance` — untouched.
- The `PreferencesStore` port and its contract suite — untouched. No obligation is added, so no
  contract check is added, which is the repo's rule applied in the direction that means *don't*.

Principle VI's versioning requirement is therefore satisfied vacuously: there is no migration because
there is no change in shape, in either direction.

## Transient state the sheet gains

Four values, all local to `SettingsSheet`, none surviving a close, none observable outside the
component. Listed because three of them are the *reason* the fixes work, and because two are refs
specifically to avoid a re-render — the same reasoning the existing `gestureStayedOnBackdrop` ref
carries, and the same reasoning that would be lost first if someone "tidied" them into state.

| Value | Lifetime | Why it is not React state |
| --- | --- | --- |
| **`sheetRef`** — the dialog element | While mounted | It is a DOM handle. The `Tab` handler needs `sheet.contains(document.activeElement)` and a live `querySelectorAll` at the moment of the keypress (K5), neither of which is renderable. |
| **`openerRef`** — the element focused when the sheet opened | Open → close | Written once during an effect and read once during its cleanup. Nothing renders from it; making it state would re-render the sheet on open for no visual result. |
| **`restoreOverflow` / `restorePadding`** — the document element's prior inline values | Open → close | Captured and written back verbatim (D4). Held in the scroll-lock effect's own closure, so they cannot drift out of step with the lock that produced them. |
| **`gestureStayedOnBackdrop`** — *existing*, unchanged | One pointer gesture | Already documented at `SettingsSheet.tsx:64–77`: written during a pointer gesture, and setting state there would re-render the controlled range input mid-drag. Listed to record that this feature does not disturb it. |

### The one piece of state outside the component

`settingsOpen` in `TunerDisplay` (`TunerDisplay.tsx:42`) — unchanged, and deliberately so. D1 fixes the
sheet's reaction to its props rather than stabilising the prop, so the owner of `open` and `onClose`
needs no change at all.

## State transitions

The sheet has two states and this feature adds work to both edges of the transition. There is no new
state, and no state the user can observe that did not exist before.

```text
              ┌──────────────────────── open ────────────────────────┐
              │                                                      │
   CLOSED ────┤  capture opener (K7)                                 ├──── OPEN
              │  focus the first control — once, and only here (K1)  │
              │  lock the document scroller, repay the gutter (K8)   │
              │  listen for Escape and Tab (K3)                      │
              └──────────────────────────────────────────────────────┘

              ┌─────────────────────── close ────────────────────────┐
              │  stop listening                                      │
   OPEN ──────┤  restore overflow and padding exactly (K10)          ├──── CLOSED
              │  restore focus to the opener, if still present (K7)  │
              └──────────────────────────────────────────────────────┘
```

**No transition on a preference change.** That is the whole of defects 3 and 4: today a preference
change re-runs the open-edge work. After D1 the open edge fires on `open` and on nothing else, so
changing `a4Hz`, `accidentalStyle` or `appearance` — or resetting all three — moves the sheet through
no edge at all (K2).

**Both close paths are the same path.** **Done**, Escape, a backdrop press, and unmount all converge on
the effect cleanups, so the four exits cannot drift apart (D6).
