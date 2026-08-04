/**
 * Every word the served document says about itself (data-model.md).
 *
 * One module, because the same strings are consumed three times over — as the
 * page's own copy, as its preview identity, and as its machine-readable
 * description — and a description written once into `<meta>` and again into
 * JSON-LD is a description that will disagree with itself inside two releases.
 * Answer engines now cross-check schema claims against visible page text and
 * discount pages where the two differ (research D6), so agreement here is a
 * correctness property, not tidiness.
 *
 * Plain exported constants. No class, no factory, no config schema — there is
 * one implementation and one consumer (Principle II).
 *
 * **Everything here must be true of the app as built** (FR-065). The temptation
 * this module exists to resist is a phrase that ranks well and describes
 * something the tuner does not do: tuning presets, per-string targets, custom
 * tunings, reference-tone playback, capo support, accounts, or sync are all
 * explicitly out of scope in `001` and must not appear, including in a
 * negation — the corroboration gate matches on substrings and cannot tell
 * "supports X" from "no X".
 */

export interface ContentSection {
  readonly heading: string;
  readonly body: string;
}

/**
 * Leads with the phrase people actually type. The product's own name is a
 * codename nobody searches for, and 60 characters is where result listings
 * truncate (FR-061).
 */
export const title = 'Online Guitar Tuner — Free Chromatic Tuner in Your Browser';

/**
 * One complete sentence stating purpose and cost, sized for the snippet slot
 * beneath the title (FR-062). "Free" is the qualifier in nearly every query
 * this feature targets, so it is not buried.
 */
export const description =
  'Tune your guitar in the browser using your microphone. A free chromatic tuner that works offline, with nothing to install and nothing to set up.';

/** The document's single `<h1>` (FR-063, P2). */
export const heading = 'Free Online Guitar Tuner';

/** Used by the manifest, the preview card, and the structured description. */
export const appName = 'Chromatic Tuner';

/**
 * The supporting content (FR-064). Written to answer a first-time user's
 * questions, not to reach a word count — SC-023's 150-word floor is a gate
 * against the copy being quietly emptied, not a target.
 *
 * Bodies are single-line strings on purpose. The corroboration gate compares
 * `featureList` entries against the page's rendered `innerText`, and a hard
 * wrap inside a claim becomes whitespace the match has to survive.
 */
export const sections: ReadonlyArray<ContentSection> = [
  {
    heading: 'How to tune your guitar',
    body: 'Allow the tuner to use your microphone, then pluck a single string and let it ring. The tuner names the note it hears and shows how far the string is from that note, measured in cents — a cent is one hundredth of a semitone. The line moves left when the string is flat and needs tightening, and right when it is sharp and needs loosening. Tune one string at a time and let each note sound cleanly rather than strumming, because the tuner reads one note at a time.',
  },
  {
    heading: 'What a chromatic tuner does',
    body: 'A chromatic tuner recognises every note in the twelve-tone scale rather than only the six a guitar is most often tuned to, so it reads whatever your strings are currently sounding rather than assuming where they should be. Detection is accurate to within one cent across E1 to E6, which spans every note a guitar produces — from a badly slack low string up to the highest fret on the top string. If you need to match an ensemble tuned away from A440, the reference pitch is adjustable from 415 to 466 Hz.',
  },
  {
    heading: 'Your playing stays on your device',
    body: 'Everything is analysed in the browser, on your own device. Audio is never recorded, never stored, and never sent anywhere. Once the page has loaded once it keeps working with no network connection at all, so the tuner is still there in a rehearsal room or a basement with no signal.',
  },
];

/**
 * The claims the structured description advertises (P10, FR-083).
 *
 * Every entry is a **verbatim substring of a `sections` body above**, and that
 * ordering is deliberate: the visible sentence is written first and the claim
 * derived from it, never the reverse. A claim no reader can find on the page is
 * the failure this list is most likely to introduce, so it is constructed in
 * the only way that makes that impossible.
 */
export const features: ReadonlyArray<string> = [
  'recognises every note in the twelve-tone scale',
  'accurate to within one cent across E1 to E6',
  'the reference pitch is adjustable from 415 to 466 Hz',
  'Audio is never recorded, never stored, and never sent anywhere',
  'keeps working with no network connection at all',
];
