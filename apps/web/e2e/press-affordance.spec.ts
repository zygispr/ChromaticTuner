import { expect, test, type Locator, type Page } from '@playwright/test';

import { audioArgs, waitForNote } from './helpers';

test.use(audioArgs('e2-in-tune.wav'));

/**
 * Every control reacts to hover on web, and to touch everywhere (FR-058, FR-059).
 *
 * Raised by the V20 human leg: the tester found the reference-pitch control
 * without help, but observed that **no button in the app changes colour on
 * hover**. A control that is identifiable at rest can still feel dead under the
 * pointer, and that is a different requirement from FR-052's "reads as a
 * control" — which is why it is tested separately here rather than folded into
 * the appearance suite.
 *
 * The wash is applied as an inset `box-shadow` rather than a `background`,
 * deliberately: it has to layer over the two shapes the app already has —
 * ghost controls that are transparent, and solid ones filled with `text` —
 * without replacing either. Setting `background` would erase the solid fill and
 * make its `background`-coloured label invisible.
 */

/** The computed inset wash on a control, or 'none' at rest. */
async function wash(control: Locator): Promise<string> {
  return control.evaluate((el) => getComputedStyle(el).boxShadow);
}

/** Every button actually on screen, so a new control cannot quietly opt out. */
async function visibleButtons(page: Page): Promise<Locator[]> {
  const all = await page.locator('button:visible').all();
  expect(all.length).toBeGreaterThan(0);
  return all;
}

test('every control on the tuner screen washes on hover (FR-058)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  for (const control of await visibleButtons(page)) {
    const name = (await control.getAttribute('data-testid')) ?? (await control.innerText());

    expect(await wash(control), `${name} should be clean at rest`).toBe('none');

    await control.hover();
    const hovered = await wash(control);
    expect(hovered, `${name} did not react to hover`).not.toBe('none');
    expect(hovered, `${name}'s wash should layer over its fill, not replace it`).toContain('inset');
  }
});

test('every control in the settings sheet washes on hover (FR-058)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();

  const sheet = page.getByTestId('settings-sheet');
  const controls = await sheet.locator('button:visible').all();
  // Done, Sharps, Flats, Line, Dial, Match device, Light, Dark, Reset — if this
  // drops, a control stopped being a button. The loop below is what actually
  // covers the options; the count is here so that a control quietly leaving the
  // set is a failure rather than a silently smaller loop.
  //
  // Went 7 -> 9 when 007 added the Tuning display group. The canary did its job:
  // it failed on a sheet that had grown, which is exactly the event it exists to
  // announce.
  expect(controls.length).toBe(9);

  for (const control of controls) {
    const name = await control.getAttribute('data-testid');
    expect(await wash(control), `${name} should be clean at rest`).toBe('none');
    await control.hover();
    expect(await wash(control), `${name} did not react to hover`).not.toBe('none');
  }
});

/**
 * The wash is clipped to a control's own corners, so it cannot paint a square.
 *
 * Reported after the wash shipped: the settings sheet's "Done" button was the
 * only control in either app without a corner radius, which nothing had noticed
 * while it was an unfilled label. Give it a background and the omission becomes
 * a hard 44x44 square sitting beside five rounded controls.
 *
 * Asserted across every control rather than on "Done" alone. The defect was not
 * really that one button was wrong — it was that nothing checked the set was
 * consistent, so the next control to skip a radius would look fine until
 * something filled it in.
 */
async function radiusOf(control: Locator): Promise<string> {
  return control.evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
}

test('every control has rounded corners for the wash to follow (FR-058)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();

  for (const control of await visibleButtons(page)) {
    const name = (await control.getAttribute('data-testid')) ?? (await control.innerText());
    expect(await radiusOf(control), `${name} has square corners`).not.toBe('0px');
  }
});

/**
 * "Done" is comfortably larger than its label, and its box lines up with the
 * controls below it.
 *
 * Reported in two passes. First: the control read as cramped, the word only
 * just fitting — it had no horizontal padding at all, 44 px of touch target
 * around roughly 40 px of text.
 *
 * Then, after padding was added: its right edge no longer matched the buttons
 * below. The first attempt had pulled the box outwards with a negative margin,
 * on the theory that the *label* should stay on the sheet's content edge. That
 * was the wrong edge to align. What a user sees is the **box** — the border on
 * the accidental buttons, the wash on any of them — and nobody expects the
 * reset button's centred label to touch the content edge either. Labels are
 * inset by their own padding; boxes are what line up.
 *
 * So the box edges are asserted against each other, and the label is left
 * wherever its padding puts it.
 */
test('the Done control is padded without leaving the content edge (FR-058)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');
  await page.getByTestId('reference-badge').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();

  const measured = await page.evaluate(() => {
    const done = document.querySelector('[data-testid="settings-close"]')!;
    const reset = document.querySelector('[data-testid="settings-reset"]')!;
    const style = getComputedStyle(done);
    const box = done.getBoundingClientRect();

    const flats = document.querySelector('[data-testid="accidental-flat"]')!;

    return {
      width: Math.round(box.width),
      paddingLeft: parseFloat(style.paddingLeft),
      paddingRight: parseFloat(style.paddingRight),
      doneRight: Math.round(box.right),
      resetRight: Math.round(reset.getBoundingClientRect().right),
      flatsRight: Math.round(flats.getBoundingClientRect().right),
      badgePadding: parseFloat(
        getComputedStyle(document.querySelector('[data-testid="reference-badge"]')!).paddingLeft
      ),
    };
  });

  // Matched against ReferenceBadge rather than a number picked by eye: that is
  // the app's other compact control, and 16px is the padding it already uses.
  // Before the fix Done had 6px — Chromium's UA default for <button>, which is
  // why "no padding at all" still measured as non-zero and why an assertion of
  // `> 0` would have passed on the broken control.
  expect(measured.paddingLeft, 'Done is not padded like the other compact control').toBe(
    measured.badgePadding
  );
  expect(measured.paddingRight).toBe(measured.paddingLeft);

  expect(
    measured.width,
    'Done is not comfortably wider than the bare touch target'
  ).toBeGreaterThanOrEqual(60);

  // The box edges, not the label edges. Every control in the sheet ends on the
  // same right edge, so the wash and the borders form one column.
  expect(measured.doneRight, "Done's right edge does not match the reset button").toBe(
    measured.resetRight
  );
  expect(measured.doneRight, "Done's right edge does not match the accidental buttons").toBe(
    measured.flatsRight
  );
});

/**
 * The touch half of the same requirement (FR-059).
 *
 * The web app runs on phones too, so "hover" alone would leave every touch user
 * with no press feedback at all — the exact gap the mobile half closes with
 * `Pressable`'s pressed state. `:active` covers both: a mouse user gets it on
 * press as well as hover, and a touch user gets it at all.
 */
test('a control washes while the pointer is held down (FR-059)', async ({ page }) => {
  await page.goto('/');
  await waitForNote(page, 'E');

  const control = page.getByTestId('microphone-toggle');
  const box = (await control.boundingBox())!;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  expect(await wash(control), 'no feedback while the pointer was held').not.toBe('none');
  await page.mouse.up();
});

/**
 * Hover must not stick on a touch device.
 *
 * Without a `(hover: hover)` guard, tapping a control on a phone leaves the
 * wash painted on it until something else is tapped — which reads as a stuck
 * button, and is worse than having no hover state at all. The guard is the
 * whole reason the rule is split in two.
 */
test.describe('on a touch device', () => {
  // The emulation flags only, not a full device descriptor: a descriptor also
  // carries `defaultBrowserType`, which cannot change inside a describe.
  test.use({ viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true });

  test('hover never applies, so the wash cannot stick (FR-058)', async ({ page }) => {
    await page.goto('/');
    await waitForNote(page, 'E');

    // Confirm the emulation is real before trusting the assertion under it —
    // otherwise this passes on a desktop context and tests nothing.
    const hoverless = await page.evaluate(() => matchMedia('(hover: none)').matches);
    expect(hoverless, 'device emulation did not produce a hoverless context').toBe(true);

    const control = page.getByTestId('microphone-toggle');
    await control.hover();
    expect(await wash(control), 'hover stuck to a control on a touch device').toBe('none');
  });
});
