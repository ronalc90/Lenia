// Placeholder Steam achievement icons, generated from platforms/steam/achievements.json:
//   platforms/steam/achievement-icons/<API_NAME>.jpg          256x256, achieved (colour)
//   platforms/steam/achievement-icons/<API_NAME>_locked.jpg   256x256, unachieved (greyscale, dimmed)
//
//   node platforms/steam/scripts/gen-achievement-icons.mjs [--sheet /path/preview.png]
//
// Style (matches the game icon): near-black background, a glass petri-dish rim, one glowing glyph in
// the category colour, an optional tier label. Pure SVG drawn here (no AI art), rasterised with the
// root devDependency playwright-core and the Chromium under /opt/pw-browsers (or CHROMIUM_PATH).
// Final art may replace these files 1:1 (same names); keep the greyscale rule for the locked ones.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const steamDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(steamDir, 'achievement-icons');
mkdirSync(outDir, { recursive: true });
const plan = JSON.parse(readFileSync(join(steamDir, 'achievements.json'), 'utf8'));

const HUE = {
  start: '#5BC0EB', bestiary: '#4FE3B0', behaviour: '#6FA8FF', economy: '#9BE36D', golden: '#FFD166',
  prestige: '#B794F6', tools: '#7FD8F7', story: '#FF8FB1', secret: '#E879F9', speed: '#FFA552', idle: '#8EA2FF',
};
const DARK = '#0A141C';

/** Glyphs in a 256 box centred on (128, 122). F = gradient fill, S = stroke style. */
const F = 'fill="url(#fillG)"';
const S = 'fill="none" stroke="url(#fillG)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"';
const GLYPHS = {
  drop: `<path d="M128 60 C128 60 86 112 86 142 a42 42 0 0 0 84 0 C170 112 128 60 128 60Z" ${F}/>`,
  orbium: `<circle cx="128" cy="122" r="48" ${F}/><circle cx="114" cy="134" r="34" fill="${DARK}"/>`,
  swimmer: `<circle cx="142" cy="110" r="38" ${F}/><circle cx="131" cy="120" r="26" fill="${DARK}"/>
    <path d="M100 140 L64 170 M110 152 L80 184 M92 128 L56 150" ${S} stroke-width="7" opacity="0.8"/>`,
  spinner: `<path d="M128 122 a8 8 0 0 1 8 8 a16 16 0 0 1 -16 16 a24 24 0 0 1 -24 -24 a32 32 0 0 1 32 -32 a40 40 0 0 1 40 40 a48 48 0 0 1 -48 48" ${S}/>`,
  pulsing: `<circle cx="128" cy="122" r="16" ${F}/><circle cx="128" cy="122" r="32" ${S} stroke-width="7" opacity="0.8"/><circle cx="128" cy="122" r="50" ${S} stroke-width="5" opacity="0.45"/>`,
  divider: `<circle cx="102" cy="122" r="30" ${F}/><circle cx="156" cy="122" r="30" ${F}/><path d="M129 96 L129 148" stroke="${DARK}" stroke-width="8"/>`,
  colony: [[128, 96], [96, 122], [160, 122], [110, 154], [146, 154], [128, 126]]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === 5 ? 12 : 17}" ${F}/>`).join(''),
  hexdots: [0, 1, 2, 3, 4, 5]
    .map((k) => `<circle cx="${128 + 44 * Math.cos((k * Math.PI) / 3)}" cy="${122 + 44 * Math.sin((k * Math.PI) / 3)}" r="13" ${F}/>`)
    .join('') + `<circle cx="128" cy="122" r="16" ${F}/>`,
  cell: `<circle cx="128" cy="122" r="50" ${S} stroke-width="7"/><circle cx="136" cy="114" r="18" ${F}/><circle cx="104" cy="140" r="6" ${F}/><circle cx="150" cy="148" r="5" ${F}/>`,
  diamond: `<path d="M128 64 L180 122 L128 180 L76 122 Z" ${F}/>`,
  jewel: `<path d="M92 92 L164 92 L188 118 L128 182 L68 118 Z" ${F}/><path d="M68 118 L188 118 M110 92 L100 118 L128 182 L156 118 L146 92" fill="none" stroke="${DARK}" stroke-width="4" opacity="0.6"/>`,
  helix: `<path d="M100 64 C156 92 100 152 156 180 M156 64 C100 92 156 152 100 180" ${S} stroke-width="8"/>
    <path d="M110 84 L146 84 M106 122 L150 122 M110 160 L146 160" ${S} stroke-width="5" opacity="0.7"/>`,
  rings: `<circle cx="108" cy="122" r="34" ${S}/><circle cx="148" cy="122" r="34" ${S}/>`,
  chevrons: `<path d="M84 110 L128 70 L172 110 M84 146 L128 106 L172 146 M84 182 L128 142 L172 182" ${S} stroke-width="11"/>`,
  orb: `<circle cx="128" cy="126" r="44" ${F}/><path d="M150 72 C152 86 156 90 170 92 C156 94 152 98 150 112 C148 98 144 94 130 92 C144 90 148 86 150 72Z" fill="#fff"/>`,
  spark: `<path d="M128 56 C134 104 150 116 194 122 C150 128 134 140 128 188 C122 140 106 128 62 122 C106 116 122 104 128 56Z" ${F}/>`,
  dots: [-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => `<circle cx="${128 + 36 * i}" cy="${122 + 36 * j}" r="13" ${F}/>`)).join(''),
  stamp: `<rect x="78" y="72" width="100" height="100" rx="18" ${S} stroke-width="7"/><circle cx="128" cy="122" r="28" ${F}/><circle cx="120" cy="128" r="19" fill="${DARK}"/>`,
  slider: `<path d="M72 100 L184 100 M72 146 L184 146" ${S} stroke-width="7"/><circle cx="104" cy="100" r="15" ${F}/><circle cx="156" cy="146" r="15" ${F}/>`,
  archive: `<rect x="74" y="78" width="108" height="26" rx="6" ${F}/><path d="M84 112 L84 168 L172 168 L172 112 M112 132 L144 132" ${S} stroke-width="8"/>`,
  sunset: `<path d="M76 140 a52 52 0 0 1 104 0 Z" ${F}/><path d="M62 150 L194 150 M86 166 L170 166 M108 182 L148 182" ${S} stroke-width="7"/>`,
  sunrise: `<path d="M80 152 a48 48 0 0 1 96 0 Z" ${F}/><path d="M64 160 L192 160 M128 74 L128 90 M80 94 L90 106 M176 94 L166 106" ${S} stroke-width="7"/>`,
  moon: `<circle cx="128" cy="122" r="50" ${F}/><circle cx="152" cy="104" r="42" fill="${DARK}"/>`,
  hourglass: `<path d="M88 66 L168 66 L136 122 L168 178 L88 178 L120 122 Z" ${S} stroke-width="8"/><path d="M104 168 L152 168 L128 140 Z" ${F}/>`,
  bolt: `<path d="M140 56 L84 132 L122 132 L112 188 L172 108 L134 108 Z" ${F}/>`,
  book: `<path d="M128 84 C108 72 84 72 66 78 L66 168 C84 162 108 162 128 174 C148 162 172 162 190 168 L190 78 C172 72 148 72 128 84 Z" ${S} stroke-width="7"/><path d="M128 84 L128 174" ${S} stroke-width="5"/>`,
  bookstar: `<path d="M128 104 C110 94 88 94 72 99 L72 176 C88 171 110 171 128 182 C146 171 168 171 184 176 L184 99 C168 94 146 94 128 104 Z" ${S} stroke-width="7"/><path d="M128 52 C131 70 136 74 152 76 C136 78 131 82 128 100 C125 82 120 78 104 76 C120 74 125 70 128 52Z" ${F}/>`,
  eye: `<path d="M60 122 C92 78 164 78 196 122 C164 166 92 166 60 122 Z" ${S} stroke-width="7"/><circle cx="128" cy="122" r="22" ${F}/>`,
  hand: `<path d="M98 176 L98 104 M116 172 L116 82 M134 172 L134 78 M152 172 L152 90 M98 140 C80 120 72 126 76 142 L96 176 L156 176 C164 160 168 140 168 120 L168 104" ${S} stroke-width="10"/>`,
};

function svgFor(a) {
  const c = HUE[a.category] ?? '#5BC0EB';
  const glyph = GLYPHS[a.icon.glyph];
  if (!glyph) throw new Error(`no glyph "${a.icon.glyph}" (${a.steamApiName})`);
  const label = a.icon.label;
  const shift = label ? 'translate(12.8 0) scale(0.9)' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <defs>
    <radialGradient id="bg" cx="50%" cy="42%" r="70%"><stop offset="0" stop-color="#16263A"/><stop offset="0.7" stop-color="#0D141D"/><stop offset="1" stop-color="#0B0E12"/></radialGradient>
    <radialGradient id="halo" cx="50%" cy="48%" r="50%"><stop offset="0" stop-color="${c}" stop-opacity="0.32"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
    <linearGradient id="fillG" x1="0.2" y1="0" x2="0.8" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.45" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity="0.85"/></linearGradient>
    <linearGradient id="rim" x1="0.1" y1="0" x2="0.9" y2="1"><stop offset="0" stop-color="#D9F1FF" stop-opacity="0.8"/><stop offset="0.5" stop-color="${c}" stop-opacity="0.4"/><stop offset="1" stop-color="#7E93A6" stop-opacity="0.2"/></linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="256" height="256" fill="url(#bg)"/>
  <circle cx="128" cy="124" r="112" fill="${DARK}"/>
  <circle cx="128" cy="124" r="110" fill="url(#halo)"/>
  <circle cx="128" cy="124" r="112" fill="none" stroke="url(#rim)" stroke-width="5"/>
  <path d="M52 84 A88 88 0 0 1 104 40" fill="none" stroke="#fff" stroke-opacity="0.28" stroke-width="5" stroke-linecap="round"/>
  <g filter="url(#glow)" transform="${shift}">${glyph}</g>
  ${
    label
      ? `<text x="128" y="222" text-anchor="middle" font-family="Inter, 'DejaVu Sans', Arial, sans-serif" font-weight="800" font-size="${label.length > 4 ? 30 : 36}" fill="#fff" stroke="${DARK}" stroke-width="6" paint-order="stroke" letter-spacing="1">${label}</text>`
      : ''
  }
</svg>`;
}

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
const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
try {
  for (const a of plan.achievements) {
    for (const locked of [false, true]) {
      const filter = locked ? 'filter:grayscale(1) brightness(0.55) contrast(0.9);' : '';
      await page.setContent(`<!doctype html><html><body style="margin:0;background:#0B0E12"><div style="${filter}width:256px;height:256px">${svgFor(a)}</div></body></html>`);
      const file = join(steamDir, locked ? a.icon.locked : a.icon.achieved);
      writeFileSync(file, await page.screenshot({ type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: 256, height: 256 } }));
    }
  }
  console.log(`wrote ${plan.achievements.length * 2} icons to ${outDir}`);

  const sheetArg = process.argv.indexOf('--sheet');
  if (sheetArg > 0) {
    const cells = plan.achievements
      .map((a) => `<figure style="margin:4px;text-align:center;font:10px sans-serif;color:#9ab"><img src="data:image/jpeg;base64,${readFileSync(join(steamDir, a.icon.achieved)).toString('base64')}" width="96"><img src="data:image/jpeg;base64,${readFileSync(join(steamDir, a.icon.locked)).toString('base64')}" width="48"><figcaption>${a.steamApiName}</figcaption></figure>`)
      .join('');
    const sheet = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    await sheet.setContent(`<body style="margin:0;background:#05070a;display:flex;flex-wrap:wrap">${cells}</body>`);
    await sheet.screenshot({ path: process.argv[sheetArg + 1], fullPage: true });
    console.log('sheet', process.argv[sheetArg + 1]);
  }
} finally {
  await browser.close();
}
