import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { audioArgs, waitForNote } from './helpers';

test.use(audioArgs('e2-in-tune.wav'));

/**
 * V11 / SC-013 — WCAG 2.1 AA, automated half.
 *
 * Axe catches the mechanical failures: unlabelled controls, contrast, bad ARIA,
 * broken landmark structure. It cannot judge whether an announcement is
 * *useful*, so the announcer's wording is asserted directly further down and
 * the VoiceOver/TalkBack passes stay manual, as the quickstart says.
 *
 * The token palette already has its own contrast test in `packages/tokens`;
 * this checks the colours as they actually land on the page, which is a
 * different question — a token can be correct and still be applied to the wrong
 * background.
 */
async function analyze(page: Page) {
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
}

test('the tuner screen has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const results = await analyze(page);
  expect(
    results.violations,
    results.violations.map((v) => `${v.id}: ${v.help}`).join('\n')
  ).toEqual([]);
});

test('the settings sheet has no accessibility violations', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();

  const results = await analyze(page);
  expect(
    results.violations,
    results.violations.map((v) => `${v.id}: ${v.help}`).join('\n')
  ).toEqual([]);
});

test('the permission explainer has no accessibility violations', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.permissions.query = async () =>
      ({
        state: 'prompt',
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as PermissionStatus;
  });
  await page.goto('/');
  await expect(page.getByTestId('permission-prompt')).toBeVisible();

  const results = await analyze(page);
  expect(
    results.violations,
    results.violations.map((v) => `${v.id}: ${v.help}`).join('\n')
  ).toEqual([]);
});

test('announces the reading as one sentence, not four fragments (FR-020)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const announcer = page.getByTestId('sr-announcer');
  await expect(announcer).toHaveAttribute('aria-live', 'polite');
  // aria-atomic matters: without it a screen reader may read only the changed
  // words, which turns "E 2, in tune." into "in tune" with no note attached.
  await expect(announcer).toHaveAttribute('aria-atomic', 'true');
  await expect(announcer).toContainText(/E 2, .*(in tune|cents)/);

  // Exactly one live region while reading. Two polite regions interrupt each
  // other, which is how the direction cue used to talk over the status banner.
  const liveRegions = await page.locator('[aria-live]:not([aria-hidden="true"])').count();
  expect(liveRegions).toBe(1);
});

test('does not announce the visual channels a second time', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  // Each of these is a redundant visual rendering of what the announcer says.
  for (const id of ['note-label', 'cents-readout', 'tuning-line', 'direction-cue']) {
    await expect(page.getByTestId(id)).toHaveAttribute('aria-hidden', 'true');
  }
});

test('every interactive control is labelled and meets the touch target floor', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.getByTestId('reference-badge').click();

  const controls = page.locator(
    'button:visible, input:visible, [role="button"]:visible, [role="slider"]:visible'
  );
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);

  for (let i = 0; i < count; i += 1) {
    const control = controls.nth(i);
    const name = await control.evaluate((el) => {
      const label = el.getAttribute('aria-label');
      return label ?? el.textContent?.trim() ?? '';
    });
    expect(name, `control ${i} has no accessible name`).not.toBe('');

    // Principle IV: 44x44 minimum. Measured on the rendered box, because a
    // token value that never reaches the element proves nothing.
    const box = await control.boundingBox();
    expect(box, `control "${name}" has no box`).not.toBeNull();
    expect(box!.height, `control "${name}" is only ${box!.height}px tall`).toBeGreaterThanOrEqual(
      44
    );
  }
});

test('is fully operable from the keyboard (SC-013)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  // Tab must reach the only control on the tuner screen, and it must show a
  // focus ring — Principle IV requires visible focus, and these controls
  // override the browser default styling.
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('reference-badge')).toBeFocused();

  const outline = await page
    .getByTestId('reference-badge')
    .evaluate((el) => getComputedStyle(el).outlineWidth);
  expect(outline).not.toBe('0px');

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-sheet')).toHaveCount(0);
});
