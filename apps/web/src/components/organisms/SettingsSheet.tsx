import { usePreferences } from '@chromatic-tuner/react';
import { A4_MAX_HZ, A4_MIN_HZ, type AccidentalStyle } from '@chromatic-tuner/core';
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
 * The two settings the product has, and a way back to defaults (FR-022–FR-024).
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
    isNonStandardReference,
    persistenceFailed,
    setA4Hz,
    setAccidentalStyle,
    reset,
  } = usePreferences();

  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    // Focus lands on a real control rather than nowhere, and Escape closes —
    // the minimum for a dialog to be operable by keyboard (FR-020, SC-013).
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="settings-backdrop"
      onClick={onClose}
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
        data-testid="settings-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Tuner settings"
        // The backdrop closes; the sheet itself must not.
        onClick={(event) => event.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 520,
          display: 'flex',
          flexDirection: 'column',
          gap: `${space.lg}px`,
          padding: `${space.lg}px ${space.md}px ${space.xl}px`,
          background: themedVar('background'),
          color: themedVar('text'),
          borderTopLeftRadius: space.md,
          borderTopRightRadius: space.md,
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
              fontSize: `${type.labelSize}px`,
              color: themedVar('text'),
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </header>

        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend
            style={{
              padding: 0,
              fontSize: `${type.labelSize}px`,
              fontWeight: type.weightMedium,
            }}
          >
            Reference pitch
          </legend>

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
        </fieldset>

        <fieldset style={{ border: 'none', margin: 0, padding: 0 }}>
          <legend
            style={{ padding: 0, fontSize: `${type.labelSize}px`, fontWeight: type.weightMedium }}
          >
            Accidentals
          </legend>

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
                    // Selection is carried by weight and border as well as
                    // colour, so it survives greyscale (FR-015).
                    fontWeight: selected ? type.weightBold : type.weightRegular,
                    color: themedVar('text'),
                    background: 'transparent',
                    border: `2px solid ${selected ? themedVar('text') : themedVar('line')}`,
                    borderRadius: space.sm,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'block' }}>{option.label}</span>
                  <span style={{ display: 'block', opacity: 0.6, fontSize: 12 }}>
                    {option.example}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

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
