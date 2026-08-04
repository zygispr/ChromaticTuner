/**
 * Generates the link-preview image (D7, FR-078, contract P7).
 *
 *   pnpm --filter @chromatic-tuner/web build
 *   pnpm --filter @chromatic-tuner/web og:image
 *
 * Generated and committed, following the precedent `e2e/fixtures/generate.mjs`
 * already sets: a generator script plus a checked-in artefact, regenerated
 * deliberately rather than on every build. That keeps a browser launch out of
 * the critical build path for a file that changes about once a year, and it
 * means the image is reviewable in a pull request.
 *
 * **No new dependency.** Something has to rasterise — every platform in scope
 * wants a PNG at roughly 1200×630 and none of them reliably renders the SVG the
 * repo already ships. Playwright is already installed, already in CI, and
 * already screenshots HTML at an exact device size, so adding `sharp` or a
 * resvg binding would be a native build for a job the toolchain already does
 * (Principle II's dependency rule).
 *
 * **Why it reads `dist/index.html` rather than importing anything.** The card
 * needs the palette and the page's own headline, and both already exist in the
 * built document: the `<style>` block `siteIdentity()` emits carries every
 * `--ct-*` value generated from `@chromatic-tuner/tokens`, and the `<h1>` is
 * `content.ts`'s heading. Importing those modules directly is not available to
 * this file — it is `.mjs`, and importing a `.ts` module requires Node's type
 * stripping, which the repo's Node 20 floor predates. Lifting the style block
 * wholesale means the card cannot drift from the app's palette or its heading,
 * on any Node version, with no duplication to keep in step.
 */
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const WIDTH = 1200;
const HEIGHT = 630;

const OUTPUT = fileURLToPath(new URL('../public/og-image.png', import.meta.url));
const BUILT_PAGE = new URL('../dist/index.html', import.meta.url);

let document;
try {
  document = readFileSync(BUILT_PAGE, 'utf8');
} catch {
  console.error(
    'dist/index.html not found — run `pnpm --filter @chromatic-tuner/web build` first.'
  );
  process.exit(1);
}

const tokenStyles = /<style data-chromatic-tuner="tokens">([\s\S]*?)<\/style>/.exec(document)?.[1];
const headline = /<h1>([\s\S]*?)<\/h1>/.exec(document)?.[1];

if (!tokenStyles || !headline) {
  console.error(
    'could not read the token stylesheet or the <h1> out of dist/index.html — ' +
      'the build output changed shape and this generator needs updating.'
  );
  process.exit(1);
}

/**
 * Composed to survive being shown small (V-IMG-2).
 *
 * Platforms display this card at a few hundred pixels wide, so the card carries
 * one large glyph, one short headline, and nothing else competing for
 * attention. `data-theme="dark"` pins the appearance: a preview card is not
 * subject to the viewer's own colour scheme, so it has to pick one rather than
 * inherit whatever the rendering browser happens to prefer.
 */
const template = `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <style>${tokenStyles}</style>
    <style>
      * { box-sizing: border-box; margin: 0; }
      body {
        width: ${WIDTH}px;
        height: ${HEIGHT}px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 28px;
        background: var(--ct-background);
        color: var(--ct-text);
        font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial,
          sans-serif;
      }
      .note { font-size: 208px; font-weight: 700; line-height: 1; letter-spacing: -0.03em; }
      .line { position: relative; width: 620px; height: 6px; border-radius: 3px; background: var(--ct-line); }
      .zone {
        position: absolute; left: 50%; top: -7px; width: 84px; height: 20px;
        transform: translateX(-50%); border-radius: 10px; background: var(--ct-in-tune); opacity: 0.28;
      }
      .marker {
        position: absolute; left: 50%; top: -17px; width: 10px; height: 40px;
        transform: translateX(-50%); border-radius: 5px; background: var(--ct-in-tune);
      }
      .headline { font-size: 52px; font-weight: 700; letter-spacing: -0.01em; }
      .sub { font-size: 30px; color: var(--ct-no-reading); }
    </style>
  </head>
  <body>
    <div class="note">E</div>
    <div class="line"><div class="zone"></div><div class="marker"></div></div>
    <div class="headline">${headline}</div>
    <div class="sub">Chromatic · works offline · nothing to install</div>
  </body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

await page.setContent(template, { waitUntil: 'load' });
await page.screenshot({ path: OUTPUT, type: 'png' });

await browser.close();

console.log(`Wrote ${OUTPUT} at ${WIDTH}×${HEIGHT}, headline "${headline}".`);
