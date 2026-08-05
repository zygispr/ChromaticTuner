/**
 * Generates every icon raster both stores need, and the web app's two SVGs
 * (research D5, D6; FR-097, FR-098; contract L8, L11).
 *
 *   pnpm build && pnpm listing:assets
 *
 * `pnpm build` first is not optional: the palette is lifted from the
 * `<style data-chromatic-tuner="tokens">` block of `apps/web/dist/index.html`.
 *
 * **No new dependency.** Something has to rasterise; every store wants PNGs at
 * exact sizes; and `@playwright/test`'s Chromium is already installed and
 * already screenshots HTML at an exact device size. This follows
 * `apps/web/scripts/generate-og-image.mjs` deliberately, including why it reads
 * the built document rather than importing anything: this file is `.mjs`, and
 * importing a `.ts` module needs Node's type stripping, which the repo's Node 20
 * floor predates.
 *
 * **Why the web SVGs are generated here too.** D5 found five hex values in
 * `apps/web/public/icon.svg` hand-copied from the dark palette, and five more in
 * `icon-maskable.svg` — ten literals the `apps/**` ESLint rule never reached,
 * because that rule reads TypeScript and these are SVG in `public/`. Generating
 * the mobile icons while leaving those hand-hexed would satisfy the letter of
 * FR-098 and produce the worse outcome: two icons for one product, free to
 * drift, with a gate on only one of them.
 *
 * Assets are **generated and committed**, regenerated deliberately rather than
 * on every build — the precedent `e2e/fixtures/generate.mjs` and `og-image.png`
 * both set. It keeps a browser launch out of the build path for files that
 * change about once a year, and it makes the artwork reviewable in a pull
 * request.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../../', import.meta.url);
const BUILT_PAGE = new URL('apps/web/dist/index.html', ROOT);
const GENERATED_BY = 'listing/scripts/generate-icons.mjs';

let document;
try {
  document = readFileSync(BUILT_PAGE, 'utf8');
} catch {
  console.error('apps/web/dist/index.html not found — run `pnpm build` first.');
  process.exit(1);
}

const tokenStyles = /<style data-chromatic-tuner="tokens">([\s\S]*?)<\/style>/.exec(document)?.[1];

if (!tokenStyles) {
  console.error(
    'could not read the token stylesheet out of dist/index.html — the build output ' +
      'changed shape and this generator needs updating.'
  );
  process.exit(1);
}

/**
 * The dark palette, resolved from the block above.
 *
 * The SVGs cannot use `var(--ct-*)` the way the HTML template can: a standalone
 * icon has no document to inherit custom properties from, so its colours have to
 * be literal. They are literal **and generated**, which is the distinction that
 * matters — `verify-listing.mjs` asserts every literal in the committed SVGs is
 * a current palette value and that the file carries this generator's marker.
 */
function darkPalette() {
  const block = /:root\[data-theme='dark'\]\s*\{([^}]*)\}/.exec(tokenStyles)?.[1];

  if (!block) {
    console.error('no dark-theme token block in dist/index.html — the build output changed shape.');
    process.exit(1);
  }

  return Object.fromEntries(
    [...block.matchAll(/(--ct-[a-z-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [
      name,
      value.trim(),
    ])
  );
}

const palette = darkPalette();

/**
 * The mark (T030, FR-097, SC-040).
 *
 * It is the tuner's own display, reduced until it survives being a fingernail
 * wide: one horizontal line, one heavy centred marker, and the flat and sharp
 * cues as dots on either side. Choosing the app's own visual language over an
 * invented emblem is the point — the icon a shopper taps is the screen they then
 * see, and it is drawn from the same tokens.
 *
 * Every dimension is a fraction of the canvas so one template serves every size.
 * The extreme extent is 0.22 + 0.03 = **0.25 of the width from centre**, so the
 * whole mark sits inside the centre 50% — comfortably within the 66% safe zone
 * an adaptive launcher mask can cut to, with room for the mask to be a circle.
 *
 * The proportions are deliberately heavier than the app's own: at 48 px the
 * marker is under 4 px wide and the dots under 3 px across, which is the
 * smallest either can be and still register as two colours rather than as grey.
 */
const MARK = {
  lineWidth: 0.52,
  lineHeight: 0.022,
  markerWidth: 0.08,
  markerHeight: 0.3,
  dotRadius: 0.03,
  // The dots cap the line rather than sitting inboard of it. Inboard, the
  // line's rounded ends poke out past them as grey stubs, which at icon sizes
  // reads as a rendering mistake rather than as a design.
  dotOffset: 0.26,
  // Ticks are what separate a measuring instrument from a slider. Without them
  // a bar on a line is a volume control; with them it is a scale with a centre.
  // They are the app's own `TickMark`, not an invention for the icon.
  tickOffset: 0.13,
  tickWidth: 0.02,
  tickHeight: 0.1,
};

function markup({ width, height, background }) {
  const unit = Math.min(width, height);
  const px = (fraction) => (fraction * unit).toFixed(2);

  return `<!doctype html>
<html lang="en" data-theme="dark">
  <head>
    <meta charset="UTF-8" />
    <style>${tokenStyles}</style>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        width: ${width}px;
        height: ${height}px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${background ? 'var(--ct-background)' : 'transparent'};
      }
      .mark { position: relative; width: ${width}px; height: ${height}px; }
      .line, .marker, .dot { position: absolute; top: 50%; left: 50%; }
      .line {
        width: ${px(MARK.lineWidth)}px;
        height: ${px(MARK.lineHeight)}px;
        margin-left: ${px(-MARK.lineWidth / 2)}px;
        margin-top: ${px(-MARK.lineHeight / 2)}px;
        border-radius: ${px(MARK.lineHeight / 2)}px;
        background: var(--ct-line);
      }
      .marker {
        width: ${px(MARK.markerWidth)}px;
        height: ${px(MARK.markerHeight)}px;
        margin-left: ${px(-MARK.markerWidth / 2)}px;
        margin-top: ${px(-MARK.markerHeight / 2)}px;
        border-radius: ${px(MARK.markerWidth / 2)}px;
        background: var(--ct-in-tune);
      }
      .dot {
        width: ${px(MARK.dotRadius * 2)}px;
        height: ${px(MARK.dotRadius * 2)}px;
        margin-top: ${px(-MARK.dotRadius)}px;
        border-radius: 50%;
      }
      .flat { margin-left: ${px(-MARK.dotOffset - MARK.dotRadius)}px; background: var(--ct-flat); }
      .sharp { margin-left: ${px(MARK.dotOffset - MARK.dotRadius)}px; background: var(--ct-sharp); }
      .tick {
        position: absolute;
        top: 50%;
        left: 50%;
        width: ${px(MARK.tickWidth)}px;
        height: ${px(MARK.tickHeight)}px;
        margin-top: ${px(-MARK.tickHeight / 2)}px;
        border-radius: ${px(MARK.tickWidth / 2)}px;
        background: var(--ct-no-reading);
      }
      .tick-left { margin-left: ${px(-MARK.tickOffset - MARK.tickWidth / 2)}px; }
      .tick-right { margin-left: ${px(MARK.tickOffset - MARK.tickWidth / 2)}px; }
    </style>
  </head>
  <body>
    <div class="mark">
      <div class="line"></div>
      <div class="tick tick-left"></div>
      <div class="tick tick-right"></div>
      <div class="dot flat"></div>
      <div class="dot sharp"></div>
      <div class="marker"></div>
    </div>
  </body>
</html>`;
}

/* ------------------------------------------------------------------------- *
 * PNG re-encoding, so an icon Apple accepts can come out of a browser.
 *
 * Chromium writes colour type 6 (RGBA) for every screenshot, including a fully
 * opaque one. Apple rejects an app icon with an alpha channel, and Play rejects
 * a feature graphic with one. Rather than add `sharp` or a resvg binding — a
 * native build for a job the toolchain already does (Principle II) — the raster
 * is decoded, its alpha dropped, and it is re-encoded as colour type 2 using
 * `node:zlib`, which is where the deflate already lives.
 * ------------------------------------------------------------------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** The Paeth predictor, byte for byte from the PNG specification. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Reverses PNG's per-scanline filtering, returning raw RGBA rows. */
function unfilter(raw, width, height, channels) {
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const target = out.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? target[x - channels] : 0;
      const up = previous ? previous[x] : 0;
      const upLeft = previous && x >= channels ? previous[x - channels] : 0;
      const value = line[x];

      switch (filter) {
        case 0:
          target[x] = value;
          break;
        case 1:
          target[x] = (value + left) & 0xff;
          break;
        case 2:
          target[x] = (value + up) & 0xff;
          break;
        case 3:
          target[x] = (value + ((left + up) >> 1)) & 0xff;
          break;
        case 4:
          target[x] = (value + paeth(left, up, upLeft)) & 0xff;
          break;
        default:
          throw new Error(`unknown PNG filter type ${filter} on row ${y}`);
      }
    }
  }

  return out;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function stripAlpha(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const bitDepth = png[24];
  const colourType = png[25];

  if (colourType === 2) return png; // already RGB
  if (colourType !== 6 || bitDepth !== 8) {
    throw new Error(
      `expected 8-bit RGBA from Chromium, got colour type ${colourType} at ${bitDepth} bits`
    );
  }

  const parts = [];
  let offset = 8;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length));
    if (type === 'IEND') break;
    offset += 12 + length;
  }

  const rgba = unfilter(inflateSync(Buffer.concat(parts)), width, height, 4);
  const rgb = Buffer.alloc(height * (width * 3 + 1));

  for (let y = 0; y < height; y += 1) {
    rgb[y * (width * 3 + 1)] = 0; // filter type None — the image re-deflates well enough
    for (let x = 0; x < width; x += 1) {
      const from = y * width * 4 + x * 4;
      const to = y * (width * 3 + 1) + 1 + x * 3;
      rgb[to] = rgba[from];
      rgb[to + 1] = rgba[from + 1];
      rgb[to + 2] = rgba[from + 2];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB, no alpha
  // 10–12 stay zero: deflate compression, adaptive filtering, no interlacing.

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rgb, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------------- *
 * Render
 * ------------------------------------------------------------------------- */

const TARGETS = [
  {
    file: 'listing/assets/icon-ios-1024.png',
    width: 1024,
    height: 1024,
    background: true,
    alpha: false,
  },
  {
    file: 'listing/assets/icon-play-512.png',
    width: 512,
    height: 512,
    background: true,
    alpha: true,
  },
  {
    file: 'listing/assets/icon-adaptive-foreground.png',
    width: 1024,
    height: 1024,
    background: false,
    alpha: true,
    // The launcher mask cuts to a device-chosen shape, so the mark is drawn at
    // the same fractions on a transparent field and the safe zone does the rest.
  },
  {
    file: 'listing/assets/feature-graphic-1024x500.png',
    width: 1024,
    height: 500,
    background: true,
    alpha: false,
  },
];

mkdirSync(fileURLToPath(new URL('listing/assets', ROOT)), { recursive: true });

const browser = await chromium.launch();
const written = [];

for (const target of TARGETS) {
  const page = await browser.newPage({
    viewport: { width: target.width, height: target.height },
    deviceScaleFactor: 1,
  });

  await page.setContent(markup(target), { waitUntil: 'load' });

  const shot = await page.screenshot({ type: 'png', omitBackground: !target.background });
  await page.close();

  const bytes = target.alpha ? shot : stripAlpha(shot);
  const path = fileURLToPath(new URL(target.file, ROOT));
  writeFileSync(path, bytes);

  written.push(`${target.file} ${target.width}×${target.height} ${bytes.length} B`);
}

await browser.close();

/* ------------------------------------------------------------------------- *
 * The web app's SVGs, from the same mark and the same palette (D5).
 * ------------------------------------------------------------------------- */

function svg({ size, rounded, safeZone }) {
  const scale = safeZone ? 0.8 : 1;
  const c = size / 2;
  const u = size * scale;
  const p = (fraction) => Number((fraction * u).toFixed(2));

  const banner =
    `<!-- Generated by ${GENERATED_BY} from the --ct-* tokens in the built ` +
    `document. Do not edit by hand: every colour here is a palette value and ` +
    `verify-listing.mjs checks that it still is. -->`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Chromatic Tuner">
  ${banner}
  <rect width="${size}" height="${size}"${rounded ? ` rx="${size * 0.1875}"` : ''} fill="${palette['--ct-background']}" />
  <rect x="${c - p(MARK.lineWidth / 2)}" y="${c - p(MARK.lineHeight / 2)}" width="${p(MARK.lineWidth)}" height="${p(MARK.lineHeight)}" rx="${p(MARK.lineHeight / 2)}" fill="${palette['--ct-line']}" />
  <rect x="${c - p(MARK.tickOffset) - p(MARK.tickWidth / 2)}" y="${c - p(MARK.tickHeight / 2)}" width="${p(MARK.tickWidth)}" height="${p(MARK.tickHeight)}" rx="${p(MARK.tickWidth / 2)}" fill="${palette['--ct-no-reading']}" />
  <rect x="${c + p(MARK.tickOffset) - p(MARK.tickWidth / 2)}" y="${c - p(MARK.tickHeight / 2)}" width="${p(MARK.tickWidth)}" height="${p(MARK.tickHeight)}" rx="${p(MARK.tickWidth / 2)}" fill="${palette['--ct-no-reading']}" />
  <circle cx="${c - p(MARK.dotOffset)}" cy="${c}" r="${p(MARK.dotRadius)}" fill="${palette['--ct-flat']}" />
  <circle cx="${c + p(MARK.dotOffset)}" cy="${c}" r="${p(MARK.dotRadius)}" fill="${palette['--ct-sharp']}" />
  <rect x="${c - p(MARK.markerWidth / 2)}" y="${c - p(MARK.markerHeight / 2)}" width="${p(MARK.markerWidth)}" height="${p(MARK.markerHeight)}" rx="${p(MARK.markerWidth / 2)}" fill="${palette['--ct-in-tune']}" />
</svg>
`;
}

const SVGS = [
  // The web app's own icon keeps its pre-applied rounding: it is used as a
  // favicon and a PWA icon, neither of which masks for it.
  { file: 'apps/web/public/icon.svg', rounded: true, safeZone: false },
  // `purpose: maskable` means the platform crops to a shape it chooses, so the
  // mark shrinks into the safe zone and the background runs to the edges.
  { file: 'apps/web/public/icon-maskable.svg', rounded: false, safeZone: true },
];

for (const { file, rounded, safeZone } of SVGS) {
  writeFileSync(fileURLToPath(new URL(file, ROOT)), svg({ size: 512, rounded, safeZone }));
  written.push(`${file} 512×512`);
}

console.log(`Wrote ${written.length} artefacts from the built token block:`);
for (const line of written) console.log(`  ${line}`);
