# Phase 0 Research: Settings sheet behaves as a modal dialog

**Feature**: `006-fix-settings-sheet-focus` | **Date**: 2026-08-06

Eight decisions. **D2** is the one that shaped the rest, and it is the only one that needed an
experiment; the others follow from reading the code that is already there.

---

## D1 — Why focus jumps to Done, and the smallest fix that is actually correct

**Decision**: split `SettingsSheet`'s single effect in two. The autofocus becomes an effect keyed on
`[open]` alone; the document keydown listener keeps `[open, onClose]`.

**The defect, exactly.** `SettingsSheet.tsx:80–92` is one effect:

```ts
useEffect(() => {
  if (!open) return;
  closeRef.current?.focus();            // ← intended: once, when the sheet opens
  const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
  document.addEventListener('keydown', onKeyDown);
  return () => document.removeEventListener('keydown', onKeyDown);
}, [open, onClose]);                    // ← actually: whenever `onClose` changes identity
```

`onClose` is `() => setSettingsOpen(false)`, written inline at `TunerDisplay.tsx:96`. `TunerDisplay`
destructures `usePreferences()` at line 41, so **every preference change re-renders it**, mints a new
arrow, and re-runs the effect — which calls `focus()` on **Done**.

That is the whole of reported defects 3 and 4. An arrow key on the slider and Space on an option are
the same bug seen from two controls: change a preference → re-render → new `onClose` → refocus. The
second-order effect is the one the reporter actually felt: the *next* arrow press goes to **Done**,
which ignores it, so the reference pitch appears to accept one step and then stop responding.

**Why not `useCallback` at the call site.** Wrapping the arrow in `useCallback(…, [])` in
`TunerDisplay` would make the symptom go away today. It is the wrong fix for two reasons. It repairs
the defect at a distance, in a different file from the one that is wrong; and it leaves `SettingsSheet`
asserting, through its dependency array, that it wants to re-focus whenever its close handler changes —
which it does not, and which the next caller to pass an inline arrow would rediscover. The component
that moves focus should be the component that says when.

**Why splitting is not merely cosmetic.** The two things in that effect have genuinely different
triggers. Moving focus is a response to *opening*. Listening for Escape is a response to *being open*,
and needs the current `onClose`. Written as two effects, each dependency array is the honest answer to
"when should this run again", and `react-hooks/exhaustive-deps` stays satisfied without a suppression
comment — which Principle I would otherwise require a written reason for.

**Alternatives considered**: an `onCloseRef` kept current by a third effect (works, but adds a ref and
an indirection to avoid splitting a five-line function); dropping the autofocus entirely (fails
FR-133 and regresses the FR-020 behaviour the original comment cites).

---

## D2 — `<dialog>` + `showModal()`: measured, then rejected

**Decision**: keep the existing `<div>` backdrop and `<section role="dialog" aria-modal="true">`.
Do **not** adopt the native modal dialog.

This is the decision the whole plan turns on, because `showModal()` would in principle supply focus
containment, background inertness, scroll locking and focus restoration for free — and if it did, D3,
D4 and D6 would all be deleted rather than implemented.

**It does not.** Probed directly in the two engines that matter, with a full-viewport `<dialog>` styled
the way this sheet would need:

| Question | Chromium | WebKit | Needed |
| --- | --- | --- | --- |
| Tab from the **last** control in the dialog | lands on `BODY` | lands on `BODY` | first control (FR-135) |
| Shift+Tab from the **first** control | lands on `BODY` | lands on the `<dialog>` itself | last control (FR-135) |
| Document `scrollTop` after a wheel over the open modal | **500** | **500** | unchanged (FR-139) |
| Document `scrollTop` after `End` | **3400** (bottom) | **3282** (bottom) | unchanged (FR-139) |
| `close()` restores focus to the opener | yes | yes | yes (FR-138) |

Two findings, both against the common belief:

1. **A modal `<dialog>` does not wrap Tab.** Sequential focus navigation leaves the dialog for the
   document (and, in a real browser, for the browser's own UI) before returning. FR-135 and its
   acceptance scenarios ask for a wrap in one press, so a `Tab` handler has to be written anyway.
   The two engines also disagree with each other on Shift+Tab, so the behaviour is not even a
   consistent thing to specify around.
2. **A modal `<dialog>` does not block scrolling of the document behind it.** Wheel and `End` both
   scrolled the page in both engines. So FR-139 needs an explicit lock anyway.

`showModal()` would therefore buy exactly one of the four obligations — focus restoration, which D6
does in five lines — in exchange for: moving `role`/`aria-modal`/`aria-label` onto a different element
to avoid announcing two nested dialogs; resetting eight UA declarations (`max-width`, `max-height`,
`border`, `padding`, `margin`, `background`, `color`, `inset`); a `::backdrop` reset in the global
stylesheet; converting the component from conditional rendering to imperative `showModal()`/`close()`
with a `close`-event bridge back to React state; and re-verifying the pointer-origin backdrop
dismissal (`SettingsSheet.tsx:99–110`) and the Safari layout-stability fix (`:198–207`) against the new
structure. Against FR-145's requirement that nothing move by a pixel, that is a large surface for no
guarantee gained.

**Recorded because it will be asked again.** The table above *is* the record — the probe was a
throwaway Playwright script against a minimal document, and its numbers are reproducible in ten lines
by anyone who doubts them. Worth re-running rather than re-reasoning the next time someone reads "just
use the platform's dialog": the platform's dialog does less than its reputation, and this repo's
answer is *verified, not assumed*.

**Alternatives considered**: `<dialog>` with `show()` rather than `showModal()` — strictly worse, it
gives none of the modality and still costs the restructuring; the `popover` attribute with
`popover="manual"` — same non-modal focus story, and it is a newer surface than `<dialog>`.

---

## D3 — Focus containment: `Tab` in the existing keydown listener

**Decision**: handle `Tab` and `Shift+Tab` in the same document-level `keydown` listener that already
handles `Escape`. Compute the focusable set from the sheet element on each keypress.

**Why the keyboard needs an owner and the other two channels do not.** FR-136 asks that nothing outside
the sheet be reachable by pointer, by assistive technology, or by keyboard. Two of those already hold:

- **Pointer** — the backdrop is `position: fixed; inset: 0` with `zIndex: 10` (`:111–119`), so it
  physically covers every control behind it. A click cannot reach them.
- **Assistive technology** — `aria-modal="true"` on the dialog (`:124`) is the declared mechanism for
  exactly this, and it works regardless of where the dialog sits in the DOM.

Only the keyboard is unowned, so only the keyboard needs code.

**Why document-level rather than `onKeyDown` on the sheet.** A handler on the sheet only fires while
focus is already inside it, which makes it unable to recover from the one state worth recovering from.
The document-level handler can assert containment as an invariant: on `Tab`, if the active element is
not inside the sheet, pull it back to the first control. It also reuses the listener that is already
there, so the sheet gains no second event registration.

**Why the set is queried per keypress and not on open** (FR-137): the persistence warning appears and
disappears while the sheet is open, and `Reset to defaults` changes which options are selected. A list
captured at open time is a cache with no invalidation. The query is `querySelectorAll` over eight
elements, on a user-paced keystroke — there is no budget to spend here.

Shape, for the contract's K3–K6:

```ts
if (event.key !== 'Tab') return;
const focusable = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
if (focusable.length === 0) return;                 // stated, not silent
const first = focusable[0];
const last = focusable[focusable.length - 1];
const active = document.activeElement;
if (!sheet.contains(active)) { event.preventDefault(); first.focus(); }
else if (event.shiftKey && active === first) { event.preventDefault(); last.focus(); }
else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus(); }
```

Everything else falls through to the browser's own tab order, which is correct *inside* the sheet and
is not something to reimplement.

**Alternatives considered**: `inert` on the background — rejected on structure, not on support. The
sheet renders inside `<section data-testid="tuner-display">` (`TunerDisplay.tsx:96`), so the elements
to inert are its own ancestors; making that work needs a portal, which is a structural change to earn a
property `aria-modal` and the scrim already provide. Sentinel elements with `tabIndex={0}` before and
after the sheet — works, and is what several libraries do, but it puts two focusable elements with no
accessible name into the dialog and needs its own explanation for why they are exempt from FR-052.

---

## D4 — Scroll lock: `overflow: hidden` on the document element, gutter repaid

**Decision**: while the sheet is open, set `overflow: hidden` on `document.documentElement` and add the
scrollbar gutter back as `padding-right`. Restore both exactly on close.

**Why the document element.** The scroller is the document: `TunerLayout` is `100dvh` with its own
`overflow: hidden` (`TunerLayout.tsx:21, :30`), and the page scrolls because `003` put supporting
content after `#root` in `index.html`. `overflow: hidden` on `<html>` stops it, and — measured — leaves
`scrollTop` untouched at `300`, which is FR-140 satisfied by the mechanism rather than by bookkeeping.

**Why not `position: fixed` on the body.** The other standard recipe. It stops touch scrolling more
firmly on old iOS, and it *discards the scroll offset*, so FR-140 then needs the position saved and
re-applied on close — with a visible jump if anything goes wrong. Trading a guarantee that holds by
construction for one that holds if the bookkeeping is right is the wrong direction.

**The gutter, and why it cannot be tested where it was measured.** Removing the scrollbar widens the
content behind the scrim, which FR-141 forbids. Compensation is
`window.innerWidth - document.documentElement.clientWidth`, applied as `padding-right` on the same
element, and it is zero when there is no classic scrollbar.

Measured on this machine: `clientWidth` was **900 before and 900 after** the lock — macOS overlay
scrollbars, gutter of zero. **So a Playwright assertion comparing a width before and after would pass
locally on any implementation, including one with no compensation at all.** CI's Ubuntu runners have
classic scrollbars and would catch it, which means the local run and the CI run would disagree — the
single worst failure mode for a test. V55 therefore asserts the *arithmetic* — that the applied
`padding-right` equals the measured gutter, whatever that gutter is — so it is meaningful in both
environments and on both kinds of scrollbar.

**Restoring exactly.** The previous inline `overflow` and `paddingRight` are captured and written back,
rather than assigning `''`. The document element has no inline style today, so the two are the same
thing right now; capture-and-restore is what stays correct if that ever stops being true.

---

## D5 — Touch scrolling: `overscroll-behavior`, not `touch-action` on the backdrop

**Decision**: pair the lock with `overscroll-behavior: none` on the document element. Do **not** put
`touch-action: none` on the backdrop.

`overflow: hidden` on `<html>` is enough to stop the document scrolling on current iOS Safari, but
scroll chaining can still produce a rubber-band on a drag that begins on the scrim. `overscroll-behavior`
is the property for that and applies to the same element as the lock, so it is captured and restored in
the same place.

`touch-action: none` on the backdrop is the trap here and is worth naming so it is not "simplified" in
later. `touch-action` **inherits**, and the backdrop is the sheet's parent — so it would also apply to
`<input type="range">`, whose thumb is dragged with exactly the touch gesture the property cancels.
That would fix a rubber-band by breaking the reference pitch control on every phone.

---

## D6 — Focus restoration, and surviving StrictMode

**Decision**: capture `document.activeElement` in the same effect that moves focus on open, and restore
it in that effect's cleanup.

FR-138 is the fifth obligation of the dialog contract and the one nobody reported, because a pointer
user never notices it. Today closing the sheet leaves focus on a detached node, so the browser resets
to `<body>` and the next Tab starts from the top of the page — behind the tuner, at the reference
badge the user was already standing on.

**Cleanup rather than an explicit call in `onClose`**, because the sheet has four exits — **Done**,
Escape, a backdrop press, and unmounting — and cleanup is the one place all four pass through.

**`<StrictMode>` is on** (`main.tsx:202`), so in development this effect mounts, cleans up, and mounts
again. The sequence is worth walking, because "restore focus in a cleanup" is normally where that bites:

1. effect runs — captures the badge as opener, focuses **Done**
2. cleanup runs — restores focus to the badge
3. effect runs again — captures the badge as opener *(it is focused again)*, focuses **Done**

It converges, and it converges for a reason rather than by luck: the capture reads whatever the restore
just wrote. Recorded because the property is not obvious, and because a later change that captures the
opener *outside* the effect would break it silently in dev only.

**Guarded on the node still being in the document**, so a restore never targets something that has been
removed while the sheet was open.

---

## D7 — Mobile: assert what the platform provides, change nothing

**Decision**: add three assertions to `apps/mobile`. Change no mobile production code.

The spec asked for mobile to be investigated. It was, by reading, and none of the four defects exists
there:

| Defect | Mobile status | Why |
| --- | --- | --- |
| 1 — focus escapes | Not present | `SettingsScreen.tsx:155` is a native `Modal` with `accessibilityViewIsModal` (`:166`), which is the iOS mechanism for confining VoiceOver. On Android a `Modal` is its own native window, so containment is the window's. |
| 2 — scrolling behind | Not present | There is nothing to scroll. `TunerScreen` is full-screen and centred with no scroll view — its own comment says so — and the mobile app has no below-the-fold content, because `003` was a web-only feature. |
| 3, 4 — focus stolen | Not present | Nothing in `SettingsScreen` moves focus. Its effects are keyed on `[open, reduceMotion, offset]`, and `offset` is a Reanimated shared value with a stable identity — so a preference change re-renders it without re-running anything. |

The web's cause cannot arise here even in principle: the equivalent inline arrow is at
`TunerDisplay.tsx:80` on the mobile side too, but no effect there depends on it.

**So the work is assertions, and FR-143 is why they are worth writing anyway.** Each of the three is a
property the platform currently gives us for free and could stop giving us on a refactor — swapping
`Modal` for an absolutely-positioned view, adding a `ScrollView` to the tuner screen, or adding an
autofocus for VoiceOver. A test that fails at that moment is cheaper than rediscovering this from a
bug report, and the repo already prefers pinning parity over trusting it (`APPEARANCE_OPTIONS` is
asserted on both platforms for the same reason).

**Physical keyboards are out of scope on mobile**, stated as an assumption in the spec. The parity that
matters there is assistive technology and touch, which is what the three assertions cover.

---

## D8 — No focus-trap dependency

**Decision**: write the ~18 lines. Do not add `focus-trap`, `react-focus-lock`, or `body-scroll-lock`.

Principle II rejects a dependency that replaces fewer than roughly 30 lines of hand-written code, and
the honest count here is 18 for the trap and 12 for the lock. The usual counter-argument — that
hand-rolled focus traps get accessibility subtly wrong — is a real risk and is what those libraries
mostly earn their weight on: shadow DOM, nested traps, portals, iframes, `contenteditable`, elements
made unfocusable by `visibility: hidden`, and delayed mounting.

None of those exist here. The containment surface is one non-nested sheet with eight controls, all of
them `<button>` or `<input>`, all always rendered, none in a portal or a shadow root, in an app with
exactly one dialog. The risk the libraries price in is the risk of the general case.

Mitigation for what remains: the obligations are written as guarantees K1–K11 in
`contracts/modality.md` and each is asserted, so a subtly wrong trap fails a named test rather than
degrading quietly. That is the same trade the repo already made for the port contract suite.

**Alternatives considered**: `react-focus-lock` (~10 kB, would also handle D6 and the `inert`
question) — declined on the 30-line rule, and it would still not address D4 at all, so the scroll lock
would be hand-written regardless.
