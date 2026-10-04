// Generates every native icon from the single source of truth, public/icon.svg (hand-drawn, see
// scripts/make-icons.mjs at the repo root):
//   platforms/desktop/build/icon.png (1024), icon.ico (16-256), icon.icns (16-1024), icons/NxN.png
//   platforms/mobile/assets/icon-only.png, icon-foreground.png, icon-background.png,
//                           splash.png, splash-dark.png  (inputs of `npx capacitor-assets generate`)
//
//   node platforms/shared/make-icons.mjs
//
// Rasterises with headless Chromium through the root devDependency playwright-core (browser found
// under /opt/pw-browsers or in CHROMIUM_PATH; never run `playwright install`). ICO and ICNS are
// written in pure Node with PNG-compressed entries (Windows Vista+, macOS 10.7+).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const desktop = join(root, 'platforms', 'desktop', 'build');
const mobile = join(root, 'platforms', 'mobile', 'assets');
mkdirSync(join(desktop, 'icons'), { recursive: true });
mkdirSync(mobile, { recursive: true });

const BG = '#0B0E12';
const source = readFileSync(join(root, 'public', 'icon.svg'), 'utf8');
const BG_RECT = /<rect width="512" height="512" rx="116" fill="url\(#bgGlow\)"\/>/;
if (!BG_RECT.test(source)) throw new Error('public/icon.svg changed shape: update BG_RECT in make-icons.mjs');

/** Wraps the art in a transform so it occupies `scale` of the canvas, optionally without background. */
function variant({ scale = 1, background = 'rounded' }) {
  let svg = source;
  if (background === 'none') svg = svg.replace(BG_RECT, '');
  if (background === 'square') svg = svg.replace(BG_RECT, '<rect width="512" height="512" fill="url(#bgGlow)"/>');
  if (scale !== 1) {
    const off = 256 - 256 * scale;
    svg = svg.replace(/(<\/defs>)([\s\S]*)(<\/svg>)/, `$1<g transform="translate(${off} ${off}) scale(${scale})">$2</g>$3`);
  }
  return svg;
}
/** Only the background gradient, full bleed (Android adaptive icon background layer). */
const backgroundOnly = source.replace(/(<\/defs>)[\s\S]*(<\/svg>)/, '$1<rect width="512" height="512" fill="url(#bgGlow)"/>$2');

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/opt/pw-browsers';
  if (existsSync(base)) {
    for (const d of readdirSync(base).filter((n) => n.startsWith('chromium-')).sort().reverse()) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  throw new Error('No Chromium found: set CHROMIUM_PATH');
}

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
/** Renders an SVG (512 box) into a PNG buffer of size w x h; the art is a centred square of `art` px. */
async function render(svg, w, h = w, art = Math.min(w, h), bg = null) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const sized = svg.replace('width="512" height="512"', `width="${art}" height="${art}"`);
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${w}px;height:${h}px;display:grid;place-items:center;overflow:hidden;background:${bg ?? 'transparent'}">${sized}</body></html>`,
  );
  const png = await page.screenshot({ omitBackground: !bg, clip: { x: 0, y: 0, width: w, height: h } });
  await page.close();
  return png;
}

function ico(entries) {
  const header = Buffer.alloc(6 + 16 * entries.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, png }, i) => {
    const o = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, o);
    header.writeUInt8(size >= 256 ? 0 : size, o + 1);
    header.writeUInt16LE(1, o + 4); // planes
    header.writeUInt16LE(32, o + 6); // bits per pixel
    header.writeUInt32LE(png.length, o + 8);
    header.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...entries.map((e) => e.png)]);
}

function icns(entries) {
  const chunks = entries.map(({ type, png }) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(png.length + 8, 4);
    return Buffer.concat([head, png]);
  });
  const head = Buffer.alloc(8);
  head.write('icns', 0, 'ascii');
  head.writeUInt32BE(8 + chunks.reduce((n, c) => n + c.length, 0), 4);
  return Buffer.concat([head, ...chunks]);
}

try {
  // ── Desktop ──
  const full = variant({});
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const pngs = {};
  for (const s of sizes) pngs[s] = await render(full, s);
  writeFileSync(join(desktop, 'icon.png'), pngs[1024]);
  for (const s of [16, 32, 48, 64, 128, 256, 512]) writeFileSync(join(desktop, 'icons', `${s}x${s}.png`), pngs[s]);
  writeFileSync(join(desktop, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: pngs[size] }))));
  // macOS (Big Sur+ grid): art is ~80% of the canvas with transparent margin.
  const mac = variant({ scale: 0.805 });
  const m = {};
  for (const s of [16, 32, 64, 128, 256, 512, 1024]) m[s] = await render(mac, s);
  const types = [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024], ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512]];
  writeFileSync(join(desktop, 'icon.icns'), icns(types.map(([type, s]) => ({ type, png: m[s] }))));
  console.log('desktop: build/icon.png, icon.ico, icon.icns, icons/*.png');

  // ── Mobile (Capacitor assets) ──
  writeFileSync(join(mobile, 'icon-only.png'), await render(variant({ background: 'square', scale: 0.94 }), 1024, 1024, 1024, BG));
  // Adaptive icon: foreground art inside the 66/108 safe circle, background layer full bleed.
  writeFileSync(join(mobile, 'icon-foreground.png'), await render(variant({ background: 'none', scale: 0.7 }), 1024));
  writeFileSync(join(mobile, 'icon-background.png'), await render(backgroundOnly, 1024, 1024, 1024, BG));
  const splash = await render(variant({ background: 'none' }), 2732, 2732, 640, BG);
  writeFileSync(join(mobile, 'splash.png'), splash);
  writeFileSync(join(mobile, 'splash-dark.png'), splash);
  console.log('mobile: assets/icon-only.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png');
} finally {
  await browser.close();
}
