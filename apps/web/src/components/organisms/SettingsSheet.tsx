import { usePreferences } from '@chromatic-tuner/react';
import {
  A4_MAX_HZ,
  A4_MIN_HZ,
  type AccidentalStyle,
  type AppearancePreference,
} from '@chromatic-tuner/core';
import { a11y, motion, space, type } from '@chromatic-tuner/tokens';
import { useEffect, useRef } from 'react';

import { themedVar } from '../../theme';

export interface SettingsSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

const ACCIDENTAL_OPTIONS: Array<{ value: AccidentalStyle; label: string; example: string }> = [
  { value: 'sharp', label: 'Sharps', example: 'C♯ D♯ F♯' },
  { value: 'flat', label: 'Flats', example: 'D♭ E♭ G♭' },
];

/**
 * Plain, mechanism-free copy (research D8, FR-124).
 *
 * "Match device", not "System" or "Auto" — "device" is the word for the thing
 * the user actually changed. `apps/mobile/src/components/screens/SettingsScreen`
 * carries the same list in the same order, and both are asserted, because two
 * hand-maintained copies of one vocabulary is exactly how the platforms drift.
 *
 * "Match device" leads, so the default sits first and the list reads as
 * defer / override-light / override-dark.
 */
const APPEARANCE_OPTIONS: Array<{ value: AppearancePreference; label: string }> = [
  { value: 'system', label: 'Match device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * What `Tab` may reach inside the sheet (K5).
 *
 * Deliberately narrow: every control in here is a `<button>` or an `<input>`,
 * none is in a portal or a shadow root, and there is exactly one dialog in the
 * app. That is the whole reason a focus-trap dependency was declined — the
 * cases those libraries earn their weight on do not exist here (research D8).
 */
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * The three settings the product has, and a way back to defaults (FR-022–FR-024,
 * FR-117).
 *
 * A sheet rather than a page: the spec's out-of-scope list is binding, so there
 * will never be enough settings to justify navigation, and the tuner staying
 * mounted underneath means the reference pitch can be adjusted against a
 * ringing string and heard taking effect (guarantee N7).
 */
export function SettingsSheet({ open, onClose }: SettingsSheetProps) {
  const {
    a4Hz,
    accidentalStyle,
    appearancePreference,
    isNonStandardReference,
    persistenceFailed,
    setA4Hz,
    setAccidentalStyle,
    setAppearancePreference,
    reset,
  } = usePreferences();

  const closeRef = useRef<HTMLButtonElement>(null);

  /** The containment surface the Tab handler measures focus against (K4). */
  const sheetRef = useRef<HTMLElement>(null);

  /**
   * Whether the gesture currently in flight has stayed on the backdrop.
   *
   * A DOM `click` fires on the nearest common ancestor of `mousedown` and
   * `mouseup`, so a gesture with one end inside the sheet and the other outside
   * resolves to the backdrop — and dismissed the sheet mid-adjustment. Checking
   * the click's own target cannot separate the two cases, because the backdrop
   * IS that target in both. Only a press that begins AND ends out here is a
   * dismissal, so both ends are recorded as they happen.
   *
   * A ref rather than state: this is written during a pointer gesture, and
   * setting state there would re-render the sheet — including the controlled
   * range input being dragged at the time.
   */
  const gestureStayedOnBackdrop = useRef(false);

  /**
   * Opening is the only thing that may move focus (K1).
   *
   * Keyed on `open` ALONE, and it must stay that way. This lived in the effect
   * below until `006`, sharing its `[open, onClose]` — and `onClose` is the
   * inline arrow at `TunerDisplay.tsx:96`, in a component that destructures
   * `usePreferences()` at `:41`. So every preference change re-rendered it,
   * minted a new arrow, re-ran the effect, and called `focus()` on Done:
   * reported defects 3 and 4, and a violation of K2.
   *
   * What the user felt was worse than a lost ring. The NEXT arrow key went to a
   * button that ignores it, so the reference pitch accepted one step and
   * appeared to stop responding — eight presses moved it one hertz (K3).
   *
   * The two halves have genuinely different triggers, which is why splitting
   * them is the fix rather than a tidy-up: moving focus answers "did it just
   * open", listening for Escape answers "is it open", and only the second needs
   * the current `onClose`. Do not merge them back together, and do not "fix"
   * this from `TunerDisplay` with a `useCallback` — that repairs the defect in a
   * different file from the one that is wrong, and leaves this component still
   * asserting through its dependency array that it wants to re-focus whenever
   * its close handler changes identity (research D1).
   */
  useEffect(() => {
    if (!open) return;

    // Captured INSIDE the effect, which is what makes this converge under
    // <StrictMode> (main.tsx:202). Dev mounts, cleans up, and mounts again:
    // the first run captures the badge and focuses Done, the cleanup puts
    // focus back on the badge, and the second run captures the badge again
    // because the restore is what it reads. Move this capture outside the
    // effect and the second run captures Done instead — closing would then
    // return focus to a control that no longer exists, in dev only (D6).
    const opener = document.activeElement as HTMLElement | null;

    // A real control rather than nowhere, so the dialog is operable by keyboard
    // from the first keystroke (FR-020, FR-133, SC-013).
    closeRef.current?.focus();

    // Cleanup rather than a call in `onClose`, because the sheet has four exits
    // — Done, Escape, a backdrop press, and unmount — and this is the only
    // place all four pass through (K7, FR-138). Without it the closing sheet
    // takes focus down with it and the next Tab restarts from the top of the
    // page, behind the tuner.
    return () => {
      // A restore that targets a removed node moves focus nowhere and loses it
      // silently, which is worse than not restoring at all.
      //
      // `preventScroll` so restoring focus cannot move the page (FR-140).
      // Today it is belt and braces — this cleanup runs before the scroll
      // lock's, so the document is still `overflow: hidden` and `focus()` could
      // not scroll it anyway — but that is an accident of the order these two
      // effects are declared in. This holds if they are ever reordered.
      if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [open]);

  /**
   * The page behind the sheet does not move (K9–K11).
   *
   * Reported defect 2. `TunerLayout` is `100dvh` with its own `overflow:
   * hidden`, but `003` put supporting content after `#root` in `index.html`, so
   * the SCROLLER is the document element — and nothing was stopping it.
   *
   * `overflow: hidden` here rather than `position: fixed` on the body, which is
   * the other standard recipe. Fixing the body discards the scroll offset, so
   * FR-140 would then need the position saved and re-applied on close, with a
   * visible jump whenever the bookkeeping is wrong. `overflow: hidden` does not
   * reset `scrollTop`, so the position is preserved BY CONSTRUCTION (D4).
   *
   * A native modal `<dialog>` would not have helped: measured, the page scrolled
   * on both wheel and `End` in Chromium and WebKit alike (D2).
   */
  useEffect(() => {
    if (!open) return;

    const root = document.documentElement;

    // Captured rather than assumed empty. There is no inline style on this
    // element today, so restoring these and assigning `''` are the same thing
    // and no test can tell them apart — which is exactly why this must be
    // written the correct way now, while someone is looking (K11).
    const previousOverflow = root.style.overflow;
    const previousPaddingRight = root.style.paddingRight;
    const previousOverscrollBehavior = root.style.overscrollBehavior;

    // Measured BEFORE the lock: removing the scrollbar is what frees the gutter,
    // so once `overflow: hidden` lands this reads 0 everywhere. It is 0 on
    // macOS overlay scrollbars and non-zero on CI's Ubuntu runners, so paying
    // it back is a no-op on one and load-bearing on the other (FR-141, D4).
    const gutter = window.innerWidth - root.clientWidth;

    root.style.overflow = 'hidden';

    // Scroll chaining, not the document scroll — `overflow: hidden` already
    // stops that. This is the rubber-band on a drag that begins on the scrim.
    //
    // NOT `touch-action: none` on the backdrop. `touch-action` INHERITS, and
    // the backdrop is this sheet's parent, so it would also apply to the
    // reference pitch `<input type="range">` — whose thumb is dragged with
    // precisely the gesture that property cancels. That fixes a rubber-band by
    // breaking the reference pitch on every phone (D5, pinned by V55).
    root.style.overscrollBehavior = 'none';

    if (gutter > 0) root.style.paddingRight = `${gutter}px`;

    return () => {
      root.style.overflow = previousOverflow;
      root.style.paddingRight = previousPaddingRight;
      root.style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }

      if (event.key !== 'Tab') return;

      // Only the keyboard needs an owner. The pointer is contained by the
      // full-viewport backdrop below, and assistive technology by
      // `aria-modal="true"` — the keyboard had nothing, which is defect 1.
      //
      // Document-level rather than `onKeyDown` on the section: a handler on the
      // sheet only fires while focus is already inside it, so it cannot recover
      // from the one state worth recovering from. Here containment is an
      // invariant rather than a hope (D3).
      const sheet = sheetRef.current;
      if (!sheet) return;

      // Queried on every keypress, never cached at open (K5). The persistence
      // warning appears and disappears while the sheet is open and `Reset to
      // defaults` changes what is selected, so a list captured at open time is
      // a cache with no invalidation. Eight elements on a user-paced keystroke:
      // there is no budget to save here.
      const focusable = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      // A sheet with nothing focusable has nowhere to send focus, so the
      // browser's own order is better than anything this could do. Stated
      // rather than left to fall out of the index arithmetic (Principle I).
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (!sheet.contains(active)) {
        // Focus got out some other way — the browser's UI, a programmatic
        // focus, a click that landed nowhere. Pull it back.
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }

      // Every other Tab falls through untouched, so the browser's own order
      // still runs inside the sheet. Cancelling those would contain focus
      // perfectly and make the sheet untraversable, which V52 checks for by
      // pressing Tab in the MIDDLE — at either end the two are indistinguishable.
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="settings-backdrop"
      onPointerDown={(event) => {
        gestureStayedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onPointerUp={(event) => {
        gestureStayedOnBackdrop.current &&= event.target === event.currentTarget;
      }}
      onClick={() => {
        // Deliberately does not test the click's own target: the backdrop is the
        // common ancestor for every mixed gesture, so that check would pass for
        // exactly the cases this exists to reject.
        if (gestureStayedOnBackdrop.current) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        background: themedVar('scrim'),
        zIndex: 10,
      }}
    >
      <section
        ref={sheetRef}
        data-testid="settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Tuner settings"
        style={{
          width: '100%',
          maxWidth: 520,
          display: 'flex',
          flexDirection: 'column',
          gap: `${space.lg}px`,
          padding: `${space.lg}px ${space.md}px ${space.xl}px`,
          // `surface`, not `background`: the sheet is raised, and in dark the
          // only thing that says so is being lighter. Painted in `background`
          // it stood ΔL* 2.0 clear of the dimmed tuner — invisible — against
          // 41.5 in light, where the scrim does the work instead.
          background: themedVar('surface'),
          color: themedVar('text'),
          borderTopLeftRadius: space.md,
          borderTopRightRadius: space.md,
          // No border on this edge. It was a `line` rule, added as a second
          // separation channel — but `line` is sized for the tuning ruler's 3:1
          // against `background`, which in dark put it at L* 48 between a
          // dimmed tuner at 2.2 and this surface at 13.6: the brightest thing
          // in the region, reading as a drawn rule rather than an edge. In
          // light it was invisible anyway (ΔL* 3.7 from the scrimmed tuner
          // above it), so it only ever cost something. The radius and the
          // luminance step are the edge.
          // Kept for light, where it reads. In dark it is black on a lighter
          // surface and contributes nothing, which is why it was never the
          // thing holding the sheet apart from the screen behind it.
          boxShadow: `0 -8px 32px ${themedVar('scrim')}`,
          transition: `transform ${motion.colorMs}ms ${motion.easing}`,
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: `${type.centsSize}px`, fontWeight: type.weightBold }}>
            Settings
          </h2>
          <button
            type="button"
            ref={closeRef}
            data-testid="settings-close"
            onClick={onClose}
            aria-label="Close settings"
            style={{
              minWidth: a11y.minTouchTarget,
              minHeight: a11y.minTouchTarget,
              // The same horizontal padding ReferenceBadge uses — the app's
              // other compact control. Without it the word only just fits
              // inside the box, which reads as cramped now the wash makes the
              // box visible.
              //
              // No negative margin to pull it outwards. An earlier attempt did
              // that, to keep the LABEL on the sheet's content edge — the wrong
              // edge to align. What a user sees is the box: this one's wash
              // against the accidental buttons' borders and the reset button's,
              // all of which end on that edge. Labels sit wherever their own
              // padding puts them, exactly as the reset button's centred label
              // does.
              padding: `0 ${space.md}px`,
              fontSize: `${type.labelSize}px`,
              color: themedVar('text'),
              background: 'transparent',
              border: 'none',
              // Matches every other control's radius. Borderless, so this went
              // unnoticed until the hover wash gave it a fill — at which point
              // it painted a hard 44x44 square beside five rounded controls
              // (FR-058).
              borderRadius: space.sm,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </header>

        {/* `role="group"` + `aria-labelledby` rather than fieldset/legend.
            The semantics are identical, but a legend is laid out inside its
            fieldset's border box, and Safari resolves that special case wrong on
            a group's FIRST layout: each fieldset came out one legend line-height
            (18 px) too tall, so opening the sheet and then touching any
            control — the slider, either accidental, reset — collapsed it by
            36 px under the user's finger. Chromium and the Playwright WebKit
            build both lay it out correctly, which is why no automated engine
            here reproduces it; see the group-structure test in
            e2e/layout-stability.spec.ts. */}
        <div role="group" aria-labelledby="reference-pitch-label">
          <span
            id="reference-pitch-label"
            style={{
              display: 'block',
              fontSize: `${type.labelSize}px`,
              fontWeight: type.weightMedium,
            }}
          >
            Reference pitch
          </span>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: space.sm,
              marginTop: space.sm,
            }}
          >
            <output
              data-testid="a4-value"
              htmlFor="a4-slider"
              style={{
                fontSize: `${type.centsSize}px`,
                fontWeight: type.weightMedium,
                fontVariantNumeric: 'tabular-nums',
                color: isNonStandardReference ? themedVar('sharp') : themedVar('text'),
              }}
            >
              {a4Hz}
            </output>
            <span style={{ fontSize: `${type.labelSize}px`, opacity: 0.7 }}>Hz</span>
          </div>

          <input
            id="a4-slider"
            data-testid="a4-slider"
            type="range"
            min={A4_MIN_HZ}
            max={A4_MAX_HZ}
            step={1}
            value={a4Hz}
            onChange={(event) => setA4Hz(Number(event.target.value))}
            aria-label={`Reference pitch for A4, in hertz. Currently ${a4Hz}.`}
            style={{ width: '100%', marginTop: space.sm, height: a11y.minTouchTarget }}
          />

          <div
            aria-hidden="true"
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 12,
              opacity: 0.6,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span>{A4_MIN_HZ}</span>
            <span>440</span>
            <span>{A4_MAX_HZ}</span>
          </div>
        </div>

        <div role="group" aria-labelledby="accidentals-label">
          <span
            id="accidentals-label"
            style={{
              display: 'block',
              fontSize: `${type.labelSize}px`,
              fontWeight: type.weightMedium,
            }}
          >
            Accidentals
          </span>

          <div style={{ display: 'flex', gap: space.sm, marginTop: space.sm }}>
            {ACCIDENTAL_OPTIONS.map((option) => {
              const selected = accidentalStyle === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  data-testid={`accidental-${option.value}`}
                  aria-pressed={selected}
                  onClick={() => setAccidentalStyle(option.value)}
                  style={{
                    flex: 1,
                    minHeight: a11y.minTouchTarget,
                    padding: `${space.sm}px`,
                    fontSize: `${type.labelSize}px`,
                    // Selection is carried by fill and weight as well as
                    // colour, so it survives greyscale (FR-015).
                    //
                    // A fill rather than the heavier border this used to have.
                    // That border was 2px of `text`, which is the app's FOCUS
                    // idiom — `main.tsx` rings :focus-visible in 3px of the same
                    // colour — so the resting selected state and the keyboard
                    // ring were one pixel apart, and tabbing to the *unchosen*
                    // option made it look like the chosen one.
                    //
                    // The `selected` tint, not `text`. Filling with `text` was
                    // the first attempt and overcorrected: that is the
                    // primary-action fill, so a preference between two
                    // note-naming conventions became the loudest element in the
                    // sheet. A tinted container is what a chosen segment gets on
                    // both platforms, and it keeps the label in `text` — the
                    // example line beneath it sits near the AA floor on the
                    // tint, which is why it is set at `mutedOpacity` rather than
                    // by eye.
                    fontWeight: selected ? type.weightBold : type.weightRegular,
                    color: themedVar('text'),
                    background: selected ? themedVar('selected') : 'transparent',
                    // Equal on both, so choosing one cannot resize the row under
                    // the finger that chose it (asserted in layout-stability).
                    border: `1px solid ${selected ? themedVar('text') : themedVar('line')}`,
                    borderRadius: space.sm,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'block' }}>{option.label}</span>
                  <span style={{ display: 'block', opacity: a11y.mutedOpacity, fontSize: 12 }}>
                    {option.example}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* The same treatment as the Accidentals group above, deliberately
            reused rather than rewritten (research D8). Reuse inherits the fix
            from `500dfb5`: the selected state is a `selected` tint FILL, not a
            heavier `text` border, because that border is the app's focus idiom
            and tabbing to an *unchosen* option made it look chosen. A new
            selection treatment here would be a fresh chance to make the same
            mistake. */}
        <div role="group" aria-labelledby="appearance-label">
          <span
            id="appearance-label"
            style={{
              display: 'block',
              fontSize: `${type.labelSize}px`,
              fontWeight: type.weightMedium,
            }}
          >
            Appearance
          </span>

          <div style={{ display: 'flex', gap: space.sm, marginTop: space.sm }}>
            {APPEARANCE_OPTIONS.map((option) => {
              const selected = appearancePreference === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  data-testid={`appearance-${option.value}`}
                  aria-pressed={selected}
                  onClick={() => setAppearancePreference(option.value)}
                  style={{
                    // `flex: 1` resolves to a 0% basis, so all three boxes are
                    // one width whatever their labels say. It matters more here
                    // than above: "Match device" is more than twice as long as
                    // "Dark", so content-sized boxes would be three different
                    // widths and would shift under the finger as the selected
                    // label takes its bold weight.
                    flex: 1,
                    minHeight: a11y.minTouchTarget,
                    padding: `${space.sm}px`,
                    fontSize: `${type.labelSize}px`,
                    fontWeight: selected ? type.weightBold : type.weightRegular,
                    color: themedVar('text'),
                    background: selected ? themedVar('selected') : 'transparent',
                    border: `1px solid ${selected ? themedVar('text') : themedVar('line')}`,
                    borderRadius: space.sm,
                    cursor: 'pointer',
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {persistenceFailed && (
          <p
            data-testid="persistence-warning"
            role="status"
            style={{ margin: 0, fontSize: `${type.labelSize}px`, color: themedVar('sharp') }}
          >
            These settings apply now but could not be saved, so they will not be remembered next
            time.
          </p>
        )}

        <button
          type="button"
          data-testid="settings-reset"
          onClick={reset}
          style={{
            minHeight: a11y.minTouchTarget,
            fontSize: `${type.labelSize}px`,
            color: themedVar('text'),
            background: 'transparent',
            border: `1px solid ${themedVar('line')}`,
            borderRadius: space.sm,
            cursor: 'pointer',
          }}
        >
          Reset to defaults
        </button>
      </section>
    </div>
  );
}
