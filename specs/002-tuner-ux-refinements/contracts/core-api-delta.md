# Core API Delta: Tuner UX Refinements

**Feature**: `002-tuner-ux-refinements` · **Date**: 2026-08-03

Amends [`001-chromatic-guitar-tuner/contracts/core-api.md`](../../001-chromatic-guitar-tuner/contracts/core-api.md).
This is the **only** contract change in the feature. Ports (`AudioSource`, `PreferencesStore`, `WakeLock`)
are untouched, so `packages/core/testing/port-contract-tests.ts` gains no obligations.

---

## §3 The two output channels — amended

### Before

```ts
type ReadingHandler = (cents: number, clarity: number) => void;
```

The continuous channel fired only while a reading existed. Silence produced no event at all, and consumers
were left holding their last value with no way to know it had expired.

### After

```ts
type ReadingHandler = (cents: number | null, clarity: number) => void;
```

`null` means **there is no current reading**. Consumers must return their position indicator to rest.

---

## New guarantee R3 — the lapse event

> **R3.** When a reading lapses — the analyzer stops returning a value, which the filter chain does after
> `holdMs` without a confident candidate — the session calls every reading handler exactly **once** with
> `(null, 0)`. It does not call again until a reading has been re-acquired and lapsed anew.

**Once, not per frame.** A consumer needs to be told to move to rest a single time; repeating it at ~43 Hz
would spend the frame budget re-asserting a transform that is already correct. It also keeps the steady
state of silence at **zero** handler invocations per frame, which is what allows `allocation.test.ts` to
keep asserting no steady-state growth without an exemption.

**`(null, 0)`, not `(0, 0)`.** Zero cents is a real and frequent reading — a string that is perfectly in
tune — and the marker rests at the same coordinate for both. Encoding "nothing here" as the value that
means "you are exactly right" would make the two indistinguishable on the channel whose entire job is
positioning the marker, which is the defect this amendment exists to fix.

### Interaction with the existing guarantees

| Guarantee | Status |
|---|---|
| **R1** — continuous-channel consumers must not call `setState` | **Unchanged and still binding.** The lapse event is delivered on the same channel and carries the same prohibition. A consumer that handles `null` by setting state re-introduces the render cost R1 exists to prevent. |
| **R2** — readings are immutable snapshots; the analyzer reuses its object | **Unaffected.** The lapse event carries no object. |
| **S4** — discrete statuses suppress no-op changes | **Unaffected**, and note the two channels remain independent: the discrete channel already publishes `listening` on the same lapse, and consumers of *that* already clear the note name and cents readout. R3 exists because the marker is driven by the other channel. |

---

## Ordering

When a reading lapses, both channels fire. The order is **continuous first, then discrete**, matching the
existing order for a live reading (`session.ts` publishes readings before comparing status).

Consumers must not depend on the relative order for correctness — the two channels drive different
elements, and the marker's rest position and the readout's cleared state are independently correct.

---

## Migration for existing consumers

Two consumers exist in-tree, one per platform. Both currently assume a non-null `cents`.

```ts
// apps/web  — molecules/TuningLine.tsx
// apps/mobile — molecules/TuningLine.tsx
subscribeToCents((cents) => {
  /* positions the marker from `cents` */
});
```

Each must handle `null` by moving to the rest position — the same coordinate as `cents === 0`, reached
through the same animation path, so a lapse looks like a smooth return rather than a jump.

**The rest position must be identical to the startup position** (FR-044). This is asserted rather than
assumed: a marker that rests 2 px off centre after a lapse, but exactly on centre at startup, is a bug that
only shows up after the first note has been played and would otherwise reach production.

---

## Test obligations

Added to `packages/core/tests/`, all required to fail before the implementation exists (Principle III):

| Test | Assertion |
|---|---|
| `session.test.ts` | A lapse fires the reading handler exactly once with `(null, 0)`. |
| `session.test.ts` | A second lapse without an intervening reading fires nothing. |
| `session.test.ts` | Re-acquisition after a lapse resumes normal readings, and a subsequent lapse fires again. |
| `session.test.ts` | A sustained tone past `holdMs` never fires a lapse (FR-045). |
| `session.test.ts` | A dropout shorter than `holdMs` never fires a lapse (FR-046). |
| `allocation.test.ts` | 10,000 push/analyze cycles across live→lapse→live transitions show no steady-state heap growth. |
| `latency.test.ts` | Re-acquisition after a lapse is no slower than first detection (FR-047), with before/after numbers for Principle V. |
