export interface ScreenReaderAnnouncerProps {
  /** The sentence to announce, or null when there is nothing to say. */
  readonly message: string | null;
}

/**
 * The tuner's single assistive-technology channel (FR-020).
 *
 * The visual display splits the reading across four elements — note, cents,
 * line, direction cue — and every one of them is marked `aria-hidden`, because
 * a screen reader reading all four produces four fragments per change. This one
 * region carries the whole reading as a sentence instead.
 *
 * Visually hidden rather than `display: none`: hidden content is not announced
 * at all, which would make this element pointless. The clip-rect technique is
 * the one that keeps it in the accessibility tree.
 */
export function ScreenReaderAnnouncer({ message }: ScreenReaderAnnouncerProps) {
  if (message === null) return null;

  return (
    <div
      data-testid="sr-announcer"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute',
        width: 1,
        height: 1,
        margin: -1,
        padding: 0,
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0,
      }}
    >
      {message}
    </div>
  );
}
