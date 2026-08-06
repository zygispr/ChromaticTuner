import type { TunerStatus } from '@chromatic-tuner/core';
import { a11y, space, type as typeTokens } from '@chromatic-tuner/tokens';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '../../theme';

export interface StatusBannerProps {
  readonly status: TunerStatus;
  readonly onRetry: () => void;
  /**
   * The user switched capture off, as opposed to it not having started yet.
   *
   * Both land the session in `idle`, and without this the deliberate stop shows
   * "Starting…" — telling the user the opposite of what just happened (FR-039).
   */
  readonly captureStopped?: boolean;
}

interface Recovery {
  readonly title: string;
  /** What the user should do next. Never absent for a failure (SC-014). */
  readonly steps: string | null;
  readonly canRetry: boolean;
}

/**
 * One line box of banner text, pinned rather than left to the platform font.
 *
 * `TunerDisplay` reserves a fixed slot for this banner so the centred column
 * cannot re-centre when the banner appears, changes, or vanishes. That
 * reservation is only correct if a "line" is a known height — the slot used to
 * be `labelSize * 4`, which assumed a 16pt line box while React Native was
 * giving the title the font's own ~19pt and the steps 24pt.
 */
export const STATUS_LINE_HEIGHT = typeTokens.labelSize * 1.5;

/**
 * The height `TunerDisplay` reserves, derived from what this banner renders.
 *
 * One title line, the gap, and one line of recovery text — the tallest ROUTINE
 * banner, which is the stopped state. That the recovery sentence fits on one
 * line even at the narrowest supported viewport is a REQUIREMENT, not luck: it
 * used to be a longer sentence that wrapped to two lines on any phone, putting
 * the banner at 74px against a 64px slot and shifting the whole centred column
 * ~5px on every Start/Stop. `layout-stability.spec.ts` asserts the fit at 360px
 * so a future edit to the copy fails a gate instead of quietly bringing the jump
 * back.
 *
 * Reserving MORE was the obvious fix and is not available: the tuner column has
 * about ten pixels of slack inside the smallest supported viewport (see
 * `vite.config.ts`), and a taller slot pushes the microphone control into the
 * scroll cue — which `fold.spec.ts` catches. Shortening the worst case was the
 * only direction with room in it, and it gives 8px back.
 *
 * Exported from here, not declared in `TunerDisplay`, so the reservation and the
 * thing being reserved for cannot drift apart. They did.
 *
 * The rare failure banners still grow past this, which remains the right trade —
 * those are terminal states where nothing is being tuned.
 */
export const STATUS_SLOT = STATUS_LINE_HEIGHT * 2 + space.sm;

/** Where the microphone permission actually lives on this OS. */
const SETTINGS_PATH =
  Platform.OS === 'ios'
    ? 'Settings › Privacy & Security › Microphone'
    : 'Settings › Apps › Chromatic Tuner › Permissions';

/**
 * Mirrors the web banner's structure exactly, with copy that names this
 * platform's real settings path (FR-018 for the shape, FR-028 for the words).
 *
 * "Open Settings and allow the microphone" is useless advice if the user cannot
 * find the switch, so the path is spelled out rather than gestured at.
 */
function recoveryFor(status: TunerStatus): Recovery | null {
  switch (status.kind) {
    case 'reading':
      return null;

    case 'listening':
      return { title: 'Listening — play a string', steps: null, canRetry: false };

    case 'idle':
      return { title: 'Starting…', steps: null, canRetry: false };

    case 'requesting-permission':
      return { title: 'Waiting for microphone access…', steps: null, canRetry: false };

    case 'permission-denied':
      return {
        title: 'Microphone access is blocked',
        steps: `Open ${SETTINGS_PATH} and allow the microphone for Chromatic Tuner, then come back — the tuner picks up on its own.`,
        canRetry: true,
      };

    case 'no-microphone':
      return {
        title: 'No microphone found',
        steps:
          'If a headset is connected, unplug it or check that its microphone is working, then try again.',
        canRetry: true,
      };

    case 'microphone-busy':
      return {
        title: 'The microphone is in use',
        steps:
          'Another app has the microphone — a call, a voice memo, or a recorder. End it, then try again.',
        canRetry: true,
      };

    case 'error':
      return {
        title: 'The tuner could not start',
        steps: `${status.message} Restarting the app usually clears this.`,
        canRetry: true,
      };
  }
}

/**
 * Explains any non-tuning state and offers the way out of it.
 *
 * The session retries recoverable failures by itself (FR-029); the button is a
 * shortcut, because waiting with no visible control reads as a hang.
 */
export function StatusBanner({ status, onRetry, captureStopped = false }: StatusBannerProps) {
  const colors = useThemeColors();
  const recovery = captureStopped
    ? {
        title: 'The microphone is off',
        steps: 'Choose Start listening to tune again.',
        canRetry: false,
      }
    : recoveryFor(status);
  if (!recovery) return null;

  return (
    <View testID="status-banner" accessibilityLiveRegion="polite" style={styles.container}>
      <Text
        testID="tuner-status"
        style={[
          styles.title,
          { color: colors.text, opacity: recovery.steps ? 1 : 0.7 },
          recovery.steps ? styles.titleStrong : null,
        ]}
      >
        {recovery.title}
      </Text>

      {recovery.steps !== null && (
        <Text testID="recovery-steps" style={[styles.steps, { color: colors.text }]}>
          {recovery.steps}
        </Text>
      )}

      {recovery.canRetry && (
        <Pressable
          testID="retry-button"
          accessibilityRole="button"
          accessibilityLabel="Try the microphone again"
          onPress={onRetry}
          style={[styles.button, { backgroundColor: colors.text }]}
        >
          {({ pressed }) => (
            <>
              {/* Layered, not swapped (FR-059) — see PermissionPrompt, which
                  carries the reasoning for the solid shape. */}
              {pressed && (
                <View
                  testID="retry-button-wash"
                  style={[styles.wash, { backgroundColor: colors.pressed }]}
                />
              )}
              <Text style={[styles.buttonLabel, { color: colors.background }]}>Try again</Text>
            </>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: space.sm,
    maxWidth: 420,
  },
  title: {
    fontSize: typeTokens.labelSize,
    lineHeight: STATUS_LINE_HEIGHT,
    textAlign: 'center',
  },
  titleStrong: {
    fontWeight: '500',
  },
  steps: {
    fontSize: typeTokens.labelSize,
    lineHeight: STATUS_LINE_HEIGHT,
    textAlign: 'center',
    opacity: 0.75,
  },
  button: {
    minHeight: a11y.minTouchTarget,
    minWidth: a11y.minTouchTarget * 2,
    marginTop: space.xs,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: space.sm,
  },
  /** Matches the button's radius so the wash cannot square off its corners. */
  wash: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: space.sm,
  },
  buttonLabel: {
    fontSize: typeTokens.labelSize,
    fontWeight: '500',
  },
});
