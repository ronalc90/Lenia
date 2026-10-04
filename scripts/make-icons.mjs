// Generates the Bioluma app icon: public/icon.svg and its PNG rasterizations.
//   node scripts/make-icons.mjs
// The SVG art below is the single source of truth (drawn by hand, no AI-generated art).
// Rasterization uses headless Chromium through playwright-core (never run `playwright install`;
// the browser is found under /opt/pw-browsers or given in CHROMIUM_PATH).
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pub = join(root, 'public');
mkdirSync(pub, { recursive: true });

// ---------------------------------------------------------------------------------------------
// Art: a petri dish on near-black, with a glowing stylized Orbium (Lenia's glider): a disc-like
// body whose bright leading crescent fades from white to cyan to indigo, a darker hole inside,
// a tapered tail and a faint halo. Coordinates are in a 512 x 512 box.
// ---------------------------------------------------------------------------------------------
const B = { x: 282, y: 224 }; // body centre
const defs = `
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="45%" r="75%">
      <stop offset="0" stop-color="#131E29"/>
      <stop offset="0.6" stop-color="#0D1219"/>
      <stop offset="1" stop-color="#0B0E12"/>
    </radialGradient>
    <radialGradient id="dishFill" cx="50%" cy="46%" r="54%">
      <stop offset="0" stop-color="#10202C"/>
      <stop offset="0.65" stop-color="#0A151E"/>
      <stop offset="1" stop-color="#060B10"/>
    </radialGradient>
    <linearGradient id="rim" x1="0.1" y1="0" x2="0.9" y2="1">
      <stop offset="0" stop-color="#D9F1FF" stop-opacity="0.85"/>
      <stop offset="0.45" stop-color="#5BC0EB" stop-opacity="0.38"/>
      <stop offset="1" stop-color="#7E93A6" stop-opacity="0.22"/>
    </linearGradient>
    <radialGradient id="halo" gradientUnits="userSpaceOnUse" cx="${B.x - 24}" cy="${B.y + 26}" r="190">
      <stop offset="0" stop-color="#5BC0EB" stop-opacity="0.46"/>
      <stop offset="0.45" stop-color="#3E7FD0" stop-opacity="0.2"/>
      <stop offset="1" stop-color="#2B3A9A" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="crescent" gradientUnits="userSpaceOnUse" x1="${B.x + 62}" y1="${B.y - 58}" x2="${B.x - 58}" y2="${B.y + 52}">
      <stop offset="0" stop-color="#FFFFFF"/>
      <stop offset="0.28" stop-color="#C9F5FF"/>
      <stop offset="0.6" stop-color="#4FC8F0"/>
      <stop offset="1" stop-color="#4A52D6"/>
    </linearGradient>
    <linearGradient id="tail" gradientUnits="userSpaceOnUse" x1="${B.x - 22}" y1="${B.y + 24}" x2="112" y2="336">
      <stop offset="0" stop-color="#5CD0F5" stop-opacity="0"/>
      <stop offset="0.2" stop-color="#6FDAF8" stop-opacity="0.9"/>
      <stop offset="0.6" stop-color="#3F8FE0" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#3B3FB8" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="hole" gradientUnits="userSpaceOnUse" cx="${B.x - 17}" cy="${B.y + 13}" r="52">
      <stop offset="0" stop-color="#2A2F8F" stop-opacity="0.42"/>
      <stop offset="0.7" stop-color="#1B2468" stop-opacity="0.18"/>
      <stop offset="1" stop-color="#1B2468" stop-opacity="0"/>
    </radialGradient>
    <filter id="b1" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.6"/></filter>
    <filter id="b3" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5"/></filter>
    <filter id="b10" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="11"/></filter>
    <mask id="crescentMask" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
      <circle cx="${B.x}" cy="${B.y}" r="79" fill="#fff"/>
      <circle cx="${B.x - 20}" cy="${B.y + 16}" r="61" fill="#000" filter="url(#b1)"/>
    </mask>
    <clipPath id="dishClip"><circle cx="256" cy="256" r="203"/></clipPath>
  </defs>`;

// Tapered, curved tail trailing to the lower left.
const tailPath = `M ${B.x - 22} ${B.y + 30} C ${B.x - 66} ${B.y + 66} 196 306 112 336
  C 176 354 ${B.x - 78} ${B.y + 100} ${B.x - 12} ${B.y + 70} Z`;

const creature = `
  <g clip-path="url(#dishClip)"><g transform="translate(-34.4 -10.2) scale(1.1)">
    <circle cx="${B.x - 24}" cy="${B.y + 26}" r="190" fill="url(#halo)"/>
    <circle cx="${B.x}" cy="${B.y}" r="112" fill="none" stroke="#5BC0EB" stroke-opacity="0.10" stroke-width="2"/>
    <circle cx="${B.x}" cy="${B.y}" r="142" fill="none" stroke="#5BC0EB" stroke-opacity="0.06" stroke-width="2"/>
    <!-- tail -->
    <path d="${tailPath}" fill="url(#tail)" filter="url(#b10)" opacity="0.8"/>
    <path d="${tailPath}" fill="url(#tail)" filter="url(#b1)"/>
    <!-- body: faint full disc, dark hole, glowing crescent -->
    <circle cx="${B.x}" cy="${B.y}" r="79" fill="#4FC8F0" fill-opacity="0.07"/>
    <circle cx="${B.x}" cy="${B.y}" r="79" fill="none" stroke="#7FD8F7" stroke-opacity="0.38" stroke-width="2.2" filter="url(#b1)"/>
    <circle cx="${B.x - 17}" cy="${B.y + 13}" r="52" fill="url(#hole)"/>
    <g filter="url(#b10)" opacity="0.95">
      <g mask="url(#crescentMask)"><rect x="0" y="0" width="512" height="512" fill="url(#crescent)"/></g>
    </g>
    <g filter="url(#b3)" opacity="0.8">
      <g mask="url(#crescentMask)"><rect x="0" y="0" width="512" height="512" fill="url(#crescent)"/></g>
    </g>
    <g mask="url(#crescentMask)">
      <rect x="0" y="0" width="512" height="512" fill="url(#crescent)"/>
    </g>
    <!-- inner structure: a thin membrane arc hugging the hole, and a faint second ring -->
    <path d="M ${B.x - 52} ${B.y + 6} A 54 54 0 0 0 ${B.x - 14} ${B.y + 54}" fill="none" stroke="#6FD6F6" stroke-opacity="0.5" stroke-width="2.4" stroke-linecap="round" filter="url(#b1)"/>
    <path d="M ${B.x + 6} ${B.y - 52} A 54 54 0 0 1 ${B.x + 46} ${B.y - 24}" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="2" stroke-linecap="round" filter="url(#b1)"/>
    <!-- bright core of the leading edge -->
    <ellipse cx="${B.x + 45}" cy="${B.y - 34}" rx="20" ry="9" transform="rotate(-37 ${B.x + 45} ${B.y - 34})" fill="#fff" opacity="0.9" filter="url(#b3)"/>
    <!-- drifting matter -->
    <g fill="#8EDDF8">
      <circle cx="372" cy="334" r="3.2" opacity="0.55"/>
      <circle cx="152" cy="176" r="2.6" opacity="0.45"/>
      <circle cx="392" cy="170" r="2.2" opacity="0.4"/>
      <circle cx="188" cy="392" r="2.4" opacity="0.4"/>
      <circle cx="330" cy="372" r="1.8" opacity="0.35"/>
      <circle cx="132" cy="262" r="1.8" opacity="0.3"/>
    </g>
  </g></g>`;

// Dish: glass rim, inner rim line and soft highlights.
const dish = `
  <circle cx="256" cy="256" r="208" fill="url(#dishFill)"/>
  ${creature}
  <circle cx="256" cy="256" r="208" fill="none" stroke="url(#rim)" stroke-width="7"/>
  <circle cx="256" cy="256" r="195" fill="none" stroke="#CFEAFB" stroke-opacity="0.10" stroke-width="2"/>
  <path d="M 120 176 A 170 170 0 0 1 226 98" fill="none" stroke="#fff" stroke-opacity="0.34" stroke-width="6" stroke-linecap="round" filter="url(#b1)"/>
  <path d="M 396 372 A 170 170 0 0 1 350 414" fill="none" stroke="#fff" stroke-opacity="0.14" stroke-width="5" stroke-linecap="round" filter="url(#b1)"/>`;

/** @param {{rounded:boolean, scale:number}} o */
function svgFor({ rounded, scale }) {
  const cornerBg = rounded
    ? `<rect width="512" height="512" rx="116" fill="url(#bgGlow)"/>`
    : `<rect width="512" height="512" fill="url(#bgGlow)"/>`;
  const t = scale === 1 ? '' : ` transform="translate(${256 - 256 * scale} ${256 - 256 * scale}) scale(${scale})"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <title>Bioluma</title>${defs}
  ${cornerBg}
  <g${t}>${dish}</g>
</svg>
`;
}

const variants = {
  // any-purpose icon: rounded square (transparent corners), dish fills it
  any: svgFor({ rounded: true, scale: 1 }),
  // maskable: full-bleed background, dish inside the 80 % safe zone
  maskable: svgFor({ rounded: false, scale: 0.88 }),
  // apple touch: iOS rounds it itself and wants no transparency
  apple: svgFor({ rounded: false, scale: 0.94 }),
};

writeFileSync(join(pub, 'icon.svg'), variants.any);

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = '/opt/pw-browsers';
  for (const d of readdirSync(base).filter((n) => n.startsWith('chromium-')).sort().reverse()) {
    const p = join(base, d, 'chrome-linux', 'chrome');
    if (existsSync(p)) return p;
  }
  throw new Error('No chromium under /opt/pw-browsers; set CHROMIUM_PATH');
}

const jobs = [
  ['icon-192.png', 'any', 192],
  ['icon-512.png', 'any', 512],
  ['icon-maskable-512.png', 'maskable', 512],
  ['apple-touch-icon.png', 'apple', 180],
];

const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
try {
  for (const [file, variant, size] of jobs) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const svg = variants[variant].replace('width="512" height="512"', `width="${size}" height="${size}"`);
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`,
    );
    await page.screenshot({ path: join(pub, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log('wrote', file, `${size}x${size}`);
  }
} finally {
  await browser.close();
}
