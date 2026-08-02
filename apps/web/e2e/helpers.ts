import { expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Shared setup for the fake-microphone specs.
 *
 * Chromium replays a WAV file as the capture device, so the whole stack —
 * getUserMedia, the AudioWorklet, the analyzer, the filter chain, and the DOM —
 * runs for real against a known input with no hardware (research D10).
 *
 * `launchOptions` cannot be set per `describe` (Playwright forces a new worker
 * for it), so each fixture gets its own spec file with a top-level `test.use`.
 */
export function audioArgs(wav: string) {
  const file = fileURLToPath(new URL(`./fixtures/${wav}`, import.meta.url));
  return {
    launchOptions: {
      args: [
        // Required. Without it Chromium rejects getUserMedia with
        // NotSupportedError even when the context has been granted the
        // microphone permission — the fake device alone is not enough.
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        `--use-file-for-fake-audio-capture=${file}`,
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  };
}

/** The readout settles a few analysis hops after the stream starts. */
export async function waitForNote(page: Page, note: string): Promise<void> {
  await expect(page.getByTestId('note-label')).toContainText(note, { timeout: 20_000 });
}

/** Parse the signed integer out of the cents readout. */
export async function readCents(page: Page): Promise<number> {
  const text = await page.getByTestId('cents-readout').textContent();
  const match = /-?\d+/.exec(text ?? '');
  expect(match, `expected a numeric cents readout, got "${text}"`).not.toBeNull();
  return Number(match![0]);
}
