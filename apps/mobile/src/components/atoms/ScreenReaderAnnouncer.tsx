import { StyleSheet, Text, View } from 'react-native';

export interface ScreenReaderAnnouncerProps {
  /** The sentence to announce, or null when there is nothing to say. */
  readonly message: string | null;
}

/**
 * The tuner's single assistive-technology channel (FR-020).
 *
 * Mirrors the web atom exactly. The visual display splits the reading across
 * four elements — note, cents, line, direction cue — and every one of them is
 * hidden from VoiceOver and TalkBack, because reading all four produces four
 * fragments per change. This one region carries the whole reading as a
 * sentence.
 *
 * Sized to a single point rather than `display: none`: content that is not laid
 * out is not announced, which would make this element pointless.
 */
export function ScreenReaderAnnouncer({ message }: ScreenReaderAnnouncerProps) {
  if (message === null) return null;

  return (
    <View testID="sr-announcer" accessibilityLiveRegion="polite" style={styles.hidden}>
      <Text accessibilityLabel={message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
});
