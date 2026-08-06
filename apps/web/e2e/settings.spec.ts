import { PREFERENCES_STORAGE_KEY } from '@chromatic-tuner/core';
import { color } from '@chromatic-tuner/tokens';
import { expect, test, type Page } from '@playwright/test';

import { activeTestId, audioArgs, openSettings, waitForNote } from './helpers';

test.use(audioArgs('e2-in-tune.wav'));

/**
 * User Story 4, end to end in a real browser (V12).
 *
 * This is also where `LocalStoragePreferences` is verified against the port
 * contract, for the same reason `WebAudioSource` is (T045): the shared suite
 * runs headless, and obligation P4 is specifically about surviving a full
 * restart — which only a real browser reload can actually demonstrate.
 */

const STORAGE_KEY = PREFERENCES_STORAGE_KEY;

test('shows the reference pitch and marks a non-standard one (FR-022)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const badge = page.getByTestId('reference-badge');
  await expect(badge).toContainText('440');
  await expect(badge).toHaveAttribute('data-non-standard', 'false');

  await badge.click();
  await page.getByTestId('a4-slider').fill('432');

  await expect(page.getByTestId('a4-value')).toHaveText('432');
  await page.getByTestId('settings-close').click();

  await expect(badge).toContainText('432');
  await expect(badge).toHaveAttribute('data-non-standard', 'true');
});

test('a 440 Hz string reads about +32 cents once A4 is 432 (V12)', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  await page.getByTestId('a4-slider').fill('415');
  await page.getByTestId('settings-close').click();

  // The fixture is a steady E2. Against a lower reference the same physical
  // pitch sits sharp of whatever note is now nearest — the note name may move,
  // but the tuner must keep reading rather than blanking (guarantee N7).
  await expect(page.getByTestId('note-label')).not.toHaveText('–', { timeout: 15_000 });

  await page.getByTestId('reference-badge').click();
  await page.getByTestId('a4-slider').fill('432');
  await page.getByTestId('settings-close').click();

  // The shift is a ratio, so it is the same for every note: 440/432 is +31.8
  // cents, and an in-tune E2 read against A4 = 432 must sit at exactly that.
  // Tight bounds on purpose — a loose band here would pass even if the
  // reference pitch were being applied at half strength or not at all.
  await expect
    .poll(
      async () => {
        const text = await page.getByTestId('cents-readout').textContent();
        return Number(/-?\d+/.exec(text ?? '')?.[0] ?? Number.NaN);
      },
      { timeout: 15_000 }
    )
    .toBeGreaterThan(28);

  const text = await page.getByTestId('cents-readout').textContent();
  const cents = Number(/-?\d+/.exec(text ?? '')?.[0] ?? Number.NaN);
  expect(cents).toBeLessThan(36);
});

test('the accidental preference applies wherever a note is shown (FR-023)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  await page.getByTestId('accidental-flat').click();
  await expect(page.getByTestId('accidental-flat')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('settings-close').click();

  // E has no accidental, so assert the preference reached the store and the
  // control rather than inventing a fixture for a black key here — the naming
  // itself is exhaustively covered by the core's note tests.
  const stored = await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY);
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ accidentalStyle: 'flat' });
});

test('settings survive a full reload (FR-024, obligation P4)', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  await page.getByTestId('a4-slider').fill('444');
  await page.getByTestId('accidental-flat').click();
  await page.getByTestId('settings-close').click();

  // A reload, not a re-render: this is the difference between "kept in state"
  // and "actually persisted", and it is the whole of FR-024.
  await page.reload();
  await waitForNote(page, 'E');

  await expect(page.getByTestId('reference-badge')).toContainText('444');
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('accidental-flat')).toHaveAttribute('aria-pressed', 'true');
});

test('reset returns to defaults and clears storage', async ({ page }) => {
  test.setTimeout(90_000);

  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  await page.getByTestId('a4-slider').fill('420');
  await expect(page.getByTestId('a4-value')).toHaveText('420');

  await page.getByTestId('settings-reset').click();

  await expect(page.getByTestId('a4-value')).toHaveText('440');
  await expect(page.getByTestId('accidental-sharp')).toHaveAttribute('aria-pressed', 'true');

  await expect
    .poll(async () => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY))
    .toBeNull();
});

test('a corrupt stored preference does not stop the tuner (obligation P1)', async ({ page }) => {
  // The case that matters most: whatever is in storage, tuning still works.
  await page.addInitScript((key) => {
    localStorage.setItem(key, '{ not json at all');
  }, STORAGE_KEY);

  await page.goto('/');
  await waitForNote(page, 'E');

  await expect(page.getByTestId('reference-badge')).toContainText('440');
});

test('settings are reachable and dismissible by keyboard (SC-013)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-sheet')).toHaveCount(0);
});

/**
 * User Story 3 (T029, T030): what counts as dismissing the sheet.
 *
 * A DOM `click` fires on the nearest common ancestor of `mousedown` and
 * `mouseup`. Press inside the sheet, release over the backdrop, and that
 * ancestor is the backdrop — so the sheet dismisses on a gesture the user meant
 * as an adjustment. The existing `stopPropagation` never covered this: it only
 * sees gestures whose two ends are both inside the sheet.
 *
 * **The reported symptom named the pitch slider, and that specific gesture does
 * not reproduce here.** Chromium takes pointer capture on a range input being
 * dragged, which retargets the `mouseup` back to the slider, so the click lands
 * inside the sheet and `stopPropagation` catches it. Measured, not assumed: a
 * probe of the slider drag left the sheet open, while pressing anywhere else in
 * the sheet and releasing on the backdrop closed it every time. The defect is
 * real and the report was right about the behaviour; the mechanism is
 * press-origin, not the slider.
 */
test('a press that begins inside the sheet and ends outside does not dismiss (FR-048)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  const sheet = await page.getByTestId('settings-sheet').boundingBox();
  expect(sheet).not.toBeNull();

  // Press on the sheet's own surface, drag well clear of it, release there. The
  // sheet is anchored to the bottom, so y = 20 is comfortably on the backdrop.
  await page.mouse.move(sheet!.x + sheet!.width / 2, sheet!.y + 12);
  await page.mouse.down();
  await page.mouse.move(sheet!.x + sheet!.width / 2, 20, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByTestId('settings-sheet')).toBeVisible();
});

test('a press that begins on the backdrop and ends inside does not dismiss (FR-048)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  const sheet = await page.getByTestId('settings-sheet').boundingBox();
  expect(sheet).not.toBeNull();

  await page.mouse.move(sheet!.x + sheet!.width / 2, 20);
  await page.mouse.down();
  await page.mouse.move(sheet!.x + sheet!.width / 2, sheet!.y + 12, { steps: 10 });
  await page.mouse.up();

  // The mirror image of the case above, and arguably the more surprising one:
  // the user released their press ON the sheet and it vanished underneath them.
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
});

test('an adjustment survives a drag that leaves the sheet (FR-051)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();

  const slider = await page.getByTestId('a4-slider').boundingBox();
  expect(slider).not.toBeNull();

  await page.mouse.move(slider!.x + slider!.width / 2, slider!.y + slider!.height / 2);
  await page.mouse.down();
  await page.mouse.move(slider!.x + slider!.width / 2, 20, { steps: 10 });

  // Read the value mid-gesture, after React has rendered the press. Pressing a
  // range input jumps its value to the press position, so reading before the
  // render lands captures the value the drag is about to replace.
  await page.waitForTimeout(100);
  const adjusted = await page.getByTestId('a4-value').textContent();

  await page.mouse.up();

  await expect(page.getByTestId('settings-sheet')).toBeVisible();
  await expect(page.getByTestId('a4-value')).toHaveText(adjusted!);
});

/**
 * Guard tests: these pass before the fix and must keep passing after.
 *
 * The failure mode being guarded against is over-correction — a fix that stops
 * the drag-out dismissal by disabling backdrop dismissal altogether would
 * satisfy the tests above and break the way most people close a sheet.
 */
test('a press that begins and ends on the backdrop still dismisses (FR-050)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();

  await page.mouse.move(20, 20);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.getByTestId('settings-sheet')).toBeHidden();
});

test('Done and Escape still dismiss (FR-050, SC-013)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  await page.getByTestId('settings-close').click();
  await expect(page.getByTestId('settings-sheet')).toBeHidden();

  await page.getByTestId('reference-badge').click();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('settings-sheet')).toBeHidden();
});

/**
 * T054 / FR-123 / SC-054 — a failed write must not undo the choice.
 *
 * Private browsing is emulated by making `localStorage.setItem` throw, which is
 * exactly what Safari's old private mode did and what a full quota does today.
 * Reading still works, so the app starts normally and only the write fails —
 * the awkward case, rather than storage being absent altogether.
 *
 * The appearance is the preference where reverting would be most visible: the
 * whole app would repaint and then repaint back, which reads as a broken
 * control rather than as a storage problem.
 */
test('a failed write leaves the appearance applied and says it will not be remembered (FR-123)', async ({
  page,
}) => {
  // The key is passed in rather than written here: M8 keeps the literal to one
  // definition, and a copy inside an init script is the kind that drifts unseen.
  await page.addInitScript((key) => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(...args: [string, string]) {
      if (args[0] === key) throw new Error('QuotaExceededError');
      return original.apply(this, args);
    };
  }, STORAGE_KEY);

  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await waitForNote(page, 'E');

  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
  await expect(page.getByTestId('persistence-warning')).toHaveCount(0);

  await page.getByTestId('appearance-dark').click();

  // The choice applies for this session, visibly. Compared against the actual
  // token rather than "not transparent" — the device is emulated light, so only
  // the choice can produce this value.
  await expect(page.getByTestId('appearance-dark')).toHaveAttribute('aria-pressed', 'true');
  const { r, g, b } = {
    r: parseInt(color.background.dark.slice(1, 3), 16),
    g: parseInt(color.background.dark.slice(3, 5), 16),
    b: parseInt(color.background.dark.slice(5, 7), 16),
  };
  expect(await page.locator('main').evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
    `rgb(${r}, ${g}, ${b})`
  );
  expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(
    'dark'
  );

  // And the EXISTING surface says so — no new warning was introduced for this.
  await expect(page.getByTestId('persistence-warning')).toBeVisible();
  await expect(page.getByTestId('persistence-warning')).toContainText(/not be remembered/i);
});

/**
 * V49–V51 (006, US1) — changing a preference must not move focus (K2, K3).
 *
 * Reported defects 3 and 4. The effect at `SettingsSheet.tsx:80` is keyed on
 * `[open, onClose]`; `onClose` is the inline arrow at `TunerDisplay.tsx:96`, in
 * a component that destructures `usePreferences()` at `:41` — so every
 * preference change mints a new arrow, re-runs an effect whose only real
 * trigger is opening, and calls `focus()` on Done. The next keystroke goes to a
 * button that ignores it.
 *
 * **These must press keys, never `fill()`.** Every existing test in this file
 * drives the reference pitch with `fill('432')`, which assigns the value and
 * dispatches `input` without a keystroke — so the entire keyboard path has
 * never been exercised here, which is why the defect shipped under 145 green
 * tests.
 *
 * **And they must press through `page.keyboard`, never `locator.press()`.**
 * `locator.press()` FOCUSES the element and then presses it. Against this
 * defect that is not a test at all: it re-focuses the slider before each of
 * V51's eight presses, silently repairing the exact behaviour under test, and
 * passes green on the broken build. `page.keyboard.press` sends the key to
 * whatever actually holds focus, which is the only question being asked.
 */
test('V49 — an arrow key on the reference pitch leaves focus on it (FR-132, K2)', async ({
  page,
}) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await openSettings(page);

  await page.getByTestId('a4-slider').focus();
  await page.keyboard.press('ArrowRight');

  await expect(page.getByTestId('a4-value')).toHaveText('441');
  // The value moving is NOT the assertion. It moves today; the defect is
  // entirely in where focus went afterwards.
  expect(await activeTestId(page)).toBe('a4-slider');
});

/**
 * Each case restores its precondition first, because pressing a control that is
 * already chosen applies nothing and would assert nothing. `reset` needs the
 * opposite setup — something non-default to return from.
 */
const ACTIVATIONS = [
  {
    testId: 'accidental-flat',
    prepare: async (page: Page) => {
      await page.getByTestId('accidental-sharp').click();
      await expect(page.getByTestId('accidental-flat')).toHaveAttribute('aria-pressed', 'false');
    },
    expectApplied: async (page: Page) =>
      expect(page.getByTestId('accidental-flat')).toHaveAttribute('aria-pressed', 'true'),
  },
  {
    testId: 'appearance-dark',
    prepare: async (page: Page) => {
      await page.getByTestId('appearance-system').click();
      await expect(page.getByTestId('appearance-dark')).toHaveAttribute('aria-pressed', 'false');
    },
    expectApplied: async (page: Page) =>
      expect(page.getByTestId('appearance-dark')).toHaveAttribute('aria-pressed', 'true'),
  },
  {
    testId: 'settings-reset',
    prepare: async (page: Page) => {
      await page.getByTestId('a4-slider').fill('432');
      await expect(page.getByTestId('a4-value')).toHaveText('432');
    },
    expectApplied: async (page: Page) => expect(page.getByTestId('a4-value')).toHaveText('440'),
  },
] as const;

for (const key of ['Enter', ' '] as const) {
  const keyName = key === ' ' ? 'Space' : key;

  test(`V50 — ${keyName} on a settings button leaves focus on that button (FR-132, K2)`, async ({
    page,
  }) => {
    await page.goto('/');
    await waitForNote(page, 'E');
    await openSettings(page);

    for (const { testId, prepare, expectApplied } of ACTIVATIONS) {
      await prepare(page);

      // Focus, then press through the keyboard — not `locator.press()`, which
      // would re-focus the control and hide the defect.
      await page.getByTestId(testId).focus();
      await page.keyboard.press(key);

      await expectApplied(page);
      expect(await activeTestId(page), `${keyName} on ${testId} moved focus`).toBe(testId);
    }
  });
}

test('V51 — eight presses move eight hertz (FR-134, K3, SC-056)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await openSettings(page);

  await expect(page.getByTestId('a4-value')).toHaveText('440');
  await page.getByTestId('a4-slider').focus();

  // Focused ONCE, outside the loop. This is SC-056 executed literally: eight
  // presses with no other input, which is what a user does to reach 432.
  for (let press = 0; press < 8; press += 1) {
    await page.keyboard.press('ArrowDown');
  }

  await expect(page.getByTestId('a4-value')).toHaveText('432');
});
