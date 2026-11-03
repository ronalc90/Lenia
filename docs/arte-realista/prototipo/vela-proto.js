// VELA · Monitor de cultivo MC-7 — reference prototype for ARTE-REALISTA.md §4.
// Canvas 2D in a 100 × 100 unit box (same contract as src/ui/art/vela.ts). Static layers are SVG path
// data turned into Path2D; dynamic layers (screen, lamp, alarm LED) are drawn every frame.
// No images, no Math.random, no shadowBlur, no ctx.filter (Safari has none). Deterministic in t.
'use strict';

const TAU = Math.PI * 2;

/** Rounded rectangle as SVG path data (the authoring format: paste into any SVG viewer to check). */
function rr(x, y, w, h, r) {
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
    `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}
function circ(cx, cy, r) {
  return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
}

// ── Geometry (100-unit box). Every number here is the table of ARTE-REALISTA.md §4.2. ──
const G = {
  chassis: rr(8, 14, 84, 74, 4.5),
  topFaceY: 18.6,
  fascia: rr(12, 20, 76, 62, 3.5),
  bezel: rr(15.5, 23.5, 51, 37, 3.5),
  glass: rr(18.5, 26.5, 45, 31, 2),
  glassBox: { x: 18.5, y: 26.5, w: 45, h: 31 },
  lamp: { x: 77, y: 31, ring: 6.4, lens: 4.7 },
  alarm: { x: 77, y: 41.2, r: 1.25 },
  grille: { xs: [72.6, 77, 81.4], ys: [46.5, 50, 53.5, 57], r: 0.85 },
  knob: { x: 77, y: 71.5, r: 5.4, top: 4.1 },
  plate: rr(15.5, 64, 51, 15, 1.2),
  plateBox: { x: 15.5, y: 64, w: 51, h: 15 },
  feet: [rr(16, 87.4, 12, 2.8, 1), rr(72, 87.4, 12, 2.8, 1)],
};
const P = {};
for (const [k, v] of Object.entries(G)) if (typeof v === 'string') P[k] = new Path2D(v);
P.feet = G.feet.map((d) => new Path2D(d));
P.bezelRing = new Path2D(G.bezel + G.glass); // evenodd ring

// ── Palette (ARTE-REALISTA.md §4.3) ──
const C = {
  ink: '#101214',
  coat: ['#f4f2ed', '#e8e5de', '#d9d5cc', '#c3beb3'],
  fascia: ['#272d32', '#1b2024', '#101316'],
  bezel: ['#3b434a', '#2b3238', '#1f252a', '#161a1e'],
  glassBase: '#03100d',
  teal: { core: '#dcfff6', main: '#5ee6c8', glow: '94,230,200' },
  amber: { core: '#ffe2b8', main: '#f2a541', glow: '242,165,65' },
  red: { core: '#ffd0c8', main: '#ff5a4a', glow: '255,90,74' },
  gold: { core: '#fff1c2', main: '#ffd166', glow: '255,209,102' },
  cyanBounce: '91,192,235',
};

/** Blackbody colour (Tanner Helland's fit, 1000–40000 K) as [r,g,b]. */
function kelvin(K) {
  const t = K / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return [c(r), c(g), c(b)];
}
const rgb = (a, k = 1) => `rgb(${Math.round(a[0] * k)},${Math.round(a[1] * k)},${Math.round(a[2] * k)})`;
const rgba = (a, al) => `rgba(${a[0]},${a[1]},${a[2]},${al})`;

/** Smooth deterministic noise in [-1, 1]. */
function wob(t, s = 0) {
  return Math.sin(t * 1.7 + s) * 0.55 + Math.sin(t * 3.13 + s * 2.3) * 0.3 + Math.sin(t * 7.31 + s * 5.1) * 0.15;
}
function hash(i) {
  let x = (i * 374761393) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// ── Expression states (ARTE-REALISTA.md §4.5) ──
const STATES = {
  idle:      { label: 'MONITORIZANDO', ink: 'teal',  trace: 'breath', amp: 1.3, K: 2700, lamp: 0.62, flick: 0.03, screen: 1.0,  alarm: 0 },
  talking:   { label: '◉ VOZ',          ink: 'teal',  trace: 'voice',  amp: 6.0, K: 2900, lamp: 0.75, flick: 0.04, screen: 1.05, alarm: 0 },
  happy:     { label: '✓ ESTABLE',      ink: 'teal',  trace: 'chirp',  amp: 3.2, K: 3200, lamp: 0.90, flick: 0.02, screen: 1.12, alarm: 0 },
  worried:   { label: '▲ ATENCIÓN',     ink: 'amber', trace: 'jitter', amp: 2.4, K: 2200, lamp: 0.45, flick: 0.22, screen: 0.95, alarm: 0 },
  surprised: { label: '! NUEVO REGISTRO', ink: 'teal', trace: 'spike', amp: 9.0, K: 3600, lamp: 1.00, flick: 0.0,  screen: 1.35, alarm: 0 },
  sleeping:  { label: 'STANDBY  03:12', ink: 'teal',  trace: 'sleep',  amp: 0.4, K: 2400, lamp: 0.0,  flick: 0.0,  screen: 0.22, alarm: 0 },
  alarm:     { label: 'ALARMA · T 39,4 °C', ink: 'red', trace: 'flat', amp: 0.0, K: 2200, lamp: 0.15, flick: 0.0, screen: 1.1, alarm: 1 },
  proud:     { label: '★ RÉCORD',       ink: 'gold',  trace: 'chirp',  amp: 3.0, K: 3200, lamp: 0.85, flick: 0.01, screen: 1.1,  alarm: 0 },
};

// ── Noise tile (powder-coat grain), built once, deterministic ──
let noiseTile = null;
function grain(ctx) {
  if (!noiseTile) {
    noiseTile = document.createElement('canvas');
    noiseTile.width = noiseTile.height = 64;
    const g = noiseTile.getContext('2d');
    const im = g.createImageData(64, 64);
    for (let i = 0; i < 64 * 64; i++) {
      const v = Math.round(hash(i + 17) * 255);
      im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v;
      im.data[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }
  return ctx.createPattern(noiseTile, 'repeat');
}

/** px → box units: line widths are specified in CSS px so they stay crisp at any size. */
let PX = 1;

// ═════════════════════ static layers ═════════════════════

function drawChassis(ctx) {
  // 1 base silhouette + 2 local colour (vertical ramp: lit top, darker base)
  let g = ctx.createLinearGradient(0, 14, 0, 88);
  g.addColorStop(0, C.coat[0]); g.addColorStop(0.12, C.coat[1]); g.addColorStop(0.6, C.coat[2]); g.addColorStop(1, C.coat[3]);
  ctx.fillStyle = g; ctx.fill(P.chassis);
  ctx.save(); ctx.clip(P.chassis);
  // 3 form shadow: key light upper-left → right flank and base fall off (multiply)
  ctx.globalCompositeOperation = 'multiply';
  g = ctx.createLinearGradient(8, 0, 92, 0);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#ffffff'); g.addColorStop(1, '#cfc8bc');
  ctx.fillStyle = g; ctx.fillRect(8, 14, 84, 74);
  // 4 reflected light: cyan bounce from the dish below (screen)
  ctx.globalCompositeOperation = 'screen';
  g = ctx.createLinearGradient(0, 88, 0, 72);
  g.addColorStop(0, `rgba(${C.cyanBounce},0.20)`); g.addColorStop(1, `rgba(${C.cyanBounce},0)`);
  ctx.fillStyle = g; ctx.fillRect(8, 70, 84, 18);
  // top face (the bevel seen from slightly above) + chamfer hairline
  ctx.globalCompositeOperation = 'source-over';
  g = ctx.createLinearGradient(0, 14, 0, G.topFaceY);
  g.addColorStop(0, '#fbfaf7'); g.addColorStop(1, '#efece6');
  ctx.fillStyle = g; ctx.fillRect(8, 14, 84, G.topFaceY - 14);
  ctx.fillStyle = 'rgba(120,112,98,0.55)'; ctx.fillRect(8, G.topFaceY, 84, 0.6 * PX);
  // 7 texture: powder-coat grain (soft-light, 6 %)
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.06;
  ctx.fillStyle = grain(ctx);
  ctx.save(); ctx.scale(0.25, 0.25); ctx.fillRect(32, 56, 336, 296); ctx.restore();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  // 5 specular: one long highlight on the top front edge
  g = ctx.createLinearGradient(12, 0, 88, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.18, 'rgba(255,255,255,0.9)'); g.addColorStop(0.65, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = g; ctx.lineWidth = 0.9 * PX; ctx.beginPath(); ctx.moveTo(13, 14.7); ctx.lineTo(87, 14.7); ctx.stroke();
  // 8 crisp outline only on the real silhouette
  ctx.strokeStyle = 'rgba(28,26,22,0.9)'; ctx.lineWidth = 1.25 * PX; ctx.stroke(P.chassis);
  // feet
  for (const f of P.feet) {
    g = ctx.createLinearGradient(0, 87.4, 0, 90.2);
    g.addColorStop(0, '#3a3c3e'); g.addColorStop(1, '#141516');
    ctx.fillStyle = g; ctx.fill(f);
  }
}

function drawFascia(ctx) {
  let g = ctx.createLinearGradient(0, 20, 0, 82);
  g.addColorStop(0, C.fascia[0]); g.addColorStop(0.06, C.fascia[1]); g.addColorStop(1, C.fascia[2]);
  ctx.fillStyle = g; ctx.fill(P.fascia);
  ctx.save(); ctx.clip(P.fascia);
  // recess: the fascia sits 1 mm inside the chassis → contact shadow under the top lip
  g = ctx.createLinearGradient(0, 20, 0, 23.5);
  g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(12, 20, 76, 3.5);
  // glass sheen: one diagonal soft band (the room's window), never animated
  g = ctx.createLinearGradient(12, 20, 52, 84);
  g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(0.34, 'rgba(255,255,255,0.025)'); g.addColorStop(0.35, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(12, 20, 76, 62);
  ctx.restore();
  // lower lip catches the key light
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(13.5, 81.6, 73, 0.5 * PX);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 0.75 * PX; ctx.stroke(P.fascia);
}

/** WORKED EXAMPLE (ARTE-REALISTA.md §3.6): the screen bezel, eight layers. */
function drawBezel(ctx, upTo = 8) {
  // 1 base silhouette (ring = bezel minus glass, evenodd) + 2 local colour
  let g = ctx.createLinearGradient(0, 23.5, 0, 60.5);
  g.addColorStop(0, C.bezel[0]); g.addColorStop(0.08, C.bezel[1]); g.addColorStop(0.55, C.bezel[2]); g.addColorStop(1, C.bezel[3]);
  ctx.fillStyle = upTo >= 2 ? g : C.bezel[2]; ctx.fill(P.bezelRing, 'evenodd');
  if (upTo < 3) return;
  ctx.save(); ctx.clip(P.bezelRing, 'evenodd');
  // 3 form shadow: the inner chamfer faces down-right → darker on the right and bottom (multiply)
  ctx.globalCompositeOperation = 'multiply';
  g = ctx.createLinearGradient(15.5, 23.5, 66.5, 60.5);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#d9dde0'); g.addColorStop(1, '#8e959b');
  ctx.fillStyle = g; ctx.fillRect(15.5, 23.5, 51, 37);
  if (upTo < 4) { ctx.restore(); return; }
  // 4 reflected light: the dish's cyan from below on the lower rail (screen)
  ctx.globalCompositeOperation = 'screen';
  g = ctx.createLinearGradient(0, 60.5, 0, 55);
  g.addColorStop(0, `rgba(${C.cyanBounce},0.18)`); g.addColorStop(1, `rgba(${C.cyanBounce},0)`);
  ctx.fillStyle = g; ctx.fillRect(15.5, 55, 51, 5.5);
  ctx.globalCompositeOperation = 'source-over';
  if (upTo >= 7) {
  // 7 texture: anodised micro-grain + horizontal brushing (3 % each)
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.08;
  ctx.fillStyle = grain(ctx); ctx.save(); ctx.scale(0.2, 0.2); ctx.fillRect(77, 117, 256, 186); ctx.restore();
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  for (let y = 24; y < 60.5; y += 0.45) {
    ctx.fillStyle = hash(Math.round(y * 100)) > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)';
    ctx.fillRect(15.5, y, 51, 0.22);
  }
  }
  ctx.restore();
  if (upTo < 5) return;
  // 5 specular: long thin highlight along the top outer chamfer
  g = ctx.createLinearGradient(19, 0, 63, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.2, 'rgba(255,255,255,0.55)'); g.addColorStop(0.7, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.strokeStyle = g; ctx.lineWidth = 0.6 * PX; ctx.beginPath(); ctx.moveTo(19, 24.15); ctx.lineTo(63, 24.15); ctx.stroke();
  // inner chamfer: lit top edge, dark bottom edge (the glass sits lower than the bezel)
  ctx.strokeStyle = 'rgba(160,172,182,0.5)'; ctx.lineWidth = 0.5 * PX;
  ctx.beginPath(); ctx.moveTo(20.5, 26.1); ctx.lineTo(61.5, 26.1); ctx.stroke();
  if (upTo < 6) return;
  // 6 rim light: VELA's own lamp (warm, right) grazes the right rail
  g = ctx.createLinearGradient(66.5, 0, 62, 0);
  g.addColorStop(0, 'rgba(255,177,110,0.45)'); g.addColorStop(1, 'rgba(255,177,110,0)');
  ctx.strokeStyle = g; ctx.lineWidth = 0.55 * PX;
  ctx.beginPath(); ctx.moveTo(66.15, 27); ctx.lineTo(66.15, 57); ctx.stroke();
  if (upTo < 8) return;
  // 8 crisp outline only where metal meets glass and fascia
  ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 0.75 * PX; ctx.stroke(P.glass);
  ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 1 * PX; ctx.stroke(P.bezel);
}

function drawPlate(ctx) {
  const b = G.plateBox;
  let g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
  g.addColorStop(0, '#b9bcbf'); g.addColorStop(0.45, '#e8eaeb'); g.addColorStop(0.55, '#dcdfe0'); g.addColorStop(1, '#a9adb1');
  ctx.fillStyle = g; ctx.fill(P.plate);
  ctx.save(); ctx.clip(P.plate);
  // brushed aluminium: hairlines along the brushing direction (anisotropy = streaks ⟂ to the highlight)
  for (let y = b.y; y < b.y + b.h; y += 0.32) {
    const v = hash(Math.round(y * 1000));
    ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${0.05 + v * 0.06})` : `rgba(0,0,0,${0.03 + v * 0.05})`;
    ctx.fillRect(b.x, y, b.w, 0.16);
  }
  g = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(0.3, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 0.75 * PX; ctx.stroke(P.plate);
  // engraved text: dark fill + 1-device-px highlight on the lower lip of each stroke
  const engrave = (txt, x, y, size, weight, track) => {
    ctx.font = `${weight} ${size}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textBaseline = 'alphabetic';
    let cx = x;
    for (const ch of txt) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillText(ch, cx + 0.12, y + 0.18);
      ctx.fillStyle = '#26292c'; ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + track * size;
    }
  };
  engrave('VELA', 20, 71.4, 5.2, 700, 0.22);
  engrave('MONITOR DE CULTIVO · MC-7', 20, 74.9, 2.05, 600, 0.06);
  engrave('ESTACIÓN VIGILIA · N.º 0451', 20, 77.6, 1.7, 500, 0.06);
  // rivets
  for (const rx of [63.6]) for (const ry of [67, 76]) {
    g = ctx.createRadialGradient(rx - 0.35, ry - 0.35, 0.1, rx, ry, 1.1);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#a7abaf'); g.addColorStop(1, '#53575b');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(rx, ry, 1.05, 0, TAU); ctx.fill();
  }
}

function drawGrille(ctx) {
  const { xs, ys, r } = G.grille;
  for (const x of xs) for (const y of ys) {
    ctx.fillStyle = '#030405'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    // punched hole: its lower lip catches the key light
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 0.5 * PX;
    ctx.beginPath(); ctx.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
}

function conicMetal(ctx, x, y, a0, light, dark, n = 4) {
  if (!ctx.createConicGradient) return light;
  const g = ctx.createConicGradient(a0, x, y);
  for (let i = 0; i <= n * 2; i++) g.addColorStop(i / (n * 2), i % 2 ? dark : light);
  return g;
}

function drawKnob(ctx) {
  const k = G.knob;
  // knurled skirt
  ctx.fillStyle = conicMetal(ctx, k.x, k.y, -0.6, '#d8dadb', '#5c6064', 4);
  ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.35 * PX;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    ctx.beginPath(); ctx.moveTo(k.x + Math.cos(a) * k.top, k.y + Math.sin(a) * k.top); ctx.lineTo(k.x + Math.cos(a) * k.r, k.y + Math.sin(a) * k.r); ctx.stroke();
  }
  // top face: radially brushed (conic = anisotropic highlight of concentric grooves)
  ctx.fillStyle = conicMetal(ctx, k.x, k.y, -0.9, '#f1f2f2', '#8d9195', 2);
  ctx.beginPath(); ctx.arc(k.x, k.y, k.top, 0, TAU); ctx.fill();
  const g = ctx.createRadialGradient(k.x - 1.2, k.y - 1.4, 0.2, k.x, k.y, k.top);
  g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = '#1a1c1e'; ctx.lineWidth = 0.6 * PX; ctx.beginPath(); ctx.moveTo(k.x, k.y); ctx.lineTo(k.x + Math.cos(-2.3) * 3.4, k.y + Math.sin(-2.3) * 3.4); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 0.75 * PX; ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, TAU); ctx.stroke();
}

/** Carry handle: a chrome tube (5-stop cylinder ramp) on two stand-offs. Holds the scarf and the medal. */
function drawHandle(ctx) {
  for (const x of [24, 76]) {
    const g = ctx.createLinearGradient(x - 2, 0, x + 2, 0);
    g.addColorStop(0, '#4b4f53'); g.addColorStop(0.35, '#e9eaea'); g.addColorStop(0.6, '#9a9ea2'); g.addColorStop(1, '#3c3f42');
    ctx.fillStyle = g; ctx.fill(new Path2D(rr(x - 2, 8.6, 4, 6, 0.8)));
    ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 0.6 * PX; ctx.stroke(new Path2D(rr(x - 2, 8.6, 4, 6, 0.8)));
  }
  const tube = new Path2D(rr(21, 7.2, 58, 3.2, 1.6));
  const g = ctx.createLinearGradient(0, 7.2, 0, 10.4);
  // cylinder ramp: dark edge · specular · local · reflected light · dark edge
  g.addColorStop(0, '#3a3d40'); g.addColorStop(0.28, '#f7f7f5'); g.addColorStop(0.5, '#a4a8ab'); g.addColorStop(0.82, '#c9dbe4'); g.addColorStop(1, '#2e3134');
  ctx.fillStyle = g; ctx.fill(tube);
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 0.75 * PX; ctx.stroke(tube);
}

/** Probe cable to the dish: black silicone, one long highlight, leaves the frame bottom-right. */
function drawCable(ctx) {
  const d = 'M92 70C97 71 99 76 98 84C97.4 89 99 94 104 100';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#0c0d0e'; ctx.lineWidth = 2.6; ctx.stroke(new Path2D(d));
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.45 * PX; ctx.stroke(new Path2D('M92.3 69.2C96.6 70.2 98.4 75 97.5 83'));
  const g = ctx.createLinearGradient(0, 66.5, 0, 73.5);
  g.addColorStop(0, '#5a5e62'); g.addColorStop(0.3, '#d9dbdc'); g.addColorStop(1, '#3d4043');
  ctx.fillStyle = g; ctx.fill(new Path2D(rr(90.6, 66.8, 3.2, 6.4, 0.8)));
  ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 0.6 * PX; ctx.stroke(new Path2D(rr(90.6, 66.8, 3.2, 6.4, 0.8)));
}

// ═════════════════════ dynamic layers ═════════════════════

function tracePoint(kind, x, t, amp, talk) {
  switch (kind) {
    case 'breath': return Math.sin(t * TAU * 0.25 + x * 0.25) * amp + wob(t * 2 + x * 0.6, 3) * 0.25;
    case 'voice': {
      const env = (0.35 + 0.65 * Math.abs(Math.sin(x * 0.33 - t * 9))) * (0.25 + talk);
      return (Math.sin(x * 1.9 - t * 30) * 0.6 + Math.sin(x * 3.7 - t * 47) * 0.4) * amp * env * 0.5;
    }
    case 'chirp': return Math.sin(x * (0.18 + x * 0.004) - t * 4) * amp;
    case 'jitter': return (Math.sin(x * 0.9 - t * 7) * 0.5 + wob(x * 1.7 + t * 11, 5)) * amp;
    case 'spike': {
      const d = x - 26;
      return d < 0 ? wob(x + t, 1) * 0.3 : -Math.exp(-d * 0.12) * Math.cos(d * 0.9) * amp;
    }
    case 'sleep': return 0;
    case 'flat': return wob(x * 3 + t * 20, 2) * 0.25;
  }
  return 0;
}

function drawScreen(ctx, st, t, talk) {
  const b = G.glassBox;
  const ink = C[st.ink];
  ctx.save(); ctx.clip(P.glass);
  ctx.fillStyle = C.glassBase; ctx.fillRect(b.x, b.y, b.w, b.h);
  // emission floor (the panel never reaches true black)
  ctx.fillStyle = `rgba(${ink.glow},${0.035 * st.screen})`; ctx.fillRect(b.x, b.y, b.w, b.h);
  // graticule: 5 × 4 divisions, 1 device px (oscilloscope convention)
  ctx.strokeStyle = `rgba(${C.teal.glow},${0.10 * st.screen})`; ctx.lineWidth = 1 * PX * 0.5;
  for (let i = 1; i < 6; i++) { const x = b.x + (b.w / 6) * i; ctx.beginPath(); ctx.moveTo(x, b.y + 5); ctx.lineTo(x, b.y + b.h - 6.5); ctx.stroke(); }
  for (let i = 1; i < 4; i++) { const y = b.y + 5 + ((b.h - 11.5) / 4) * i; ctx.beginPath(); ctx.moveTo(b.x + 1.5, y); ctx.lineTo(b.x + b.w - 1.5, y); ctx.stroke(); }
  const mono = '"JetBrains Mono", ui-monospace, monospace';
  // status row
  ctx.font = `600 2.2px ${mono}`; ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(${C.teal.glow},${0.75 * st.screen})`;
  ctx.fillText('MC-7', b.x + 1.6, b.y + 2.6);
  ctx.fillText('37,0 °C   5,0 % CO₂', b.x + 9.5, b.y + 2.6);
  // trace (3 passes: glow, body, hot core) — layered strokes instead of shadowBlur
  const cy = b.y + 5 + (b.h - 11.5) / 2;
  if (st.trace !== 'sleep') {
    const path = new Path2D();
    for (let i = 0; i <= 96; i++) {
      const x = b.x + 1.5 + ((b.w - 3) * i) / 96;
      const y = cy + tracePoint(st.trace, (x - b.x), t, st.amp, talk);
      i ? path.lineTo(x, y) : path.moveTo(x, y);
    }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(${ink.glow},${0.16 * st.screen})`; ctx.lineWidth = 2.4; ctx.stroke(path);
    ctx.strokeStyle = `rgba(${ink.glow},${0.55 * st.screen})`; ctx.lineWidth = 0.95; ctx.stroke(path);
    ctx.strokeStyle = ink.core; ctx.globalAlpha = Math.min(1, 0.9 * st.screen); ctx.lineWidth = 0.4; ctx.stroke(path); ctx.globalAlpha = 1;
  } else {
    // standby: a dim dot crossing slowly (screen-saver), nothing else moves
    const x = b.x + 3 + ((t * 2.2) % (b.w - 6));
    ctx.fillStyle = `rgba(${C.teal.glow},0.35)`; ctx.beginPath(); ctx.arc(x, cy, 0.5, 0, TAU); ctx.fill();
  }
  // alarm banner: inverted red band with 45° hazard hatch
  if (st.alarm) {
    ctx.fillStyle = 'rgba(255,90,74,0.92)'; ctx.fillRect(b.x, b.y + b.h - 6.6, b.w, 6.6);
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, b.y + b.h - 6.6, b.w, 6.6); ctx.clip();
    ctx.strokeStyle = 'rgba(60,0,0,0.25)'; ctx.lineWidth = 1.1;
    for (let x = b.x - 8; x < b.x + b.w + 8; x += 2.6) { ctx.beginPath(); ctx.moveTo(x, b.y + b.h); ctx.lineTo(x + 6.6, b.y + b.h - 6.6); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = '#1a0300'; ctx.font = `800 2.6px ${mono}`;
    ctx.fillText(st.label, b.x + 1.8, b.y + b.h - 3.2);
  } else {
    ctx.fillStyle = ink.main; ctx.globalAlpha = Math.min(1, st.screen);
    ctx.font = `700 2.7px ${mono}`;
    ctx.fillText(st.label, b.x + 1.8, b.y + b.h - 3.2);
    ctx.globalAlpha = 1;
  }
  // exposure bloom for 'surprised' (a decaying flash, never > 1 per state change)
  if (st.screen > 1.2) {
    const g = ctx.createRadialGradient(b.x + b.w / 2, cy, 2, b.x + b.w / 2, cy, b.w * 0.7);
    g.addColorStop(0, `rgba(${ink.glow},0.18)`); g.addColorStop(1, `rgba(${ink.glow},0)`);
    ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
  }
  // control-grid mesh of a VFD (fine, 5 %)
  ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.12;
  for (let x = b.x; x < b.x + b.w; x += 0.8) { ctx.beginPath(); ctx.moveTo(x, b.y); ctx.lineTo(x, b.y + b.h); ctx.stroke(); }
  // inner vignette (glass thickness) + one sharp reflection on the cover glass
  let g = ctx.createRadialGradient(b.x + b.w / 2, b.y + b.h / 2, b.h * 0.35, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.62);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
  g = ctx.createLinearGradient(b.x, b.y, b.x + b.w * 0.55, b.y + b.h);
  g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.28, 'rgba(255,255,255,0.03)'); g.addColorStop(0.29, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
  ctx.restore();
}

function drawLamp(ctx, st, t, talk, rm) {
  const L = G.lamp;
  // chrome bezel ring, radially brushed (conic gradient = anisotropic highlight)
  ctx.fillStyle = conicMetal(ctx, L.x, L.y, -0.7, '#f4f4f1', '#6c6f72', 4);
  ctx.beginPath(); ctx.arc(L.x, L.y, L.ring, 0, TAU); ctx.arc(L.x, L.y, L.lens + 0.25, 0, TAU, true); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 0.75 * PX; ctx.beginPath(); ctx.arc(L.x, L.y, L.ring, 0, TAU); ctx.stroke();
  // brightness: incandescent filament — small slow flicker, never a blink (except alarm / worried)
  const flick = rm ? 0 : st.flick * wob(t * 6.3, 2);
  let on = Math.max(0, st.lamp * (1 + flick) + talk * 0.15);
  if (st.trace === 'sleep') on = rm ? 0.25 : 0.08 + 0.37 * (0.5 - 0.5 * Math.cos(t * TAU * 0.2)); // 12 breaths/min
  const hot = kelvin(st.K), mid = kelvin(Math.max(1200, st.K - 700)), edge = kelvin(1900);
  // lens (faceted jewel): off colour mixed towards lit colour by `on`
  const g = ctx.createRadialGradient(L.x - 1.1, L.y - 1.2, 0.2, L.x, L.y, L.lens);
  const mixc = (c, k) => [Math.round(60 + (c[0] - 60) * k), Math.round(38 + (c[1] - 38) * k), Math.round(20 + (c[2] - 20) * k)];
  g.addColorStop(0, rgb(mixc([255, 246, 224], on)));
  g.addColorStop(0.28, rgb(mixc(hot, on)));
  g.addColorStop(0.72, rgb(mixc(mid, on * 0.9)));
  g.addColorStop(1, rgb(mixc(edge, on * 0.55)));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(L.x, L.y, L.lens, 0, TAU); ctx.fill();
  // facets: 8 radial cuts (Fresnel-cut jewel)
  ctx.strokeStyle = 'rgba(0,0,0,0.14)'; ctx.lineWidth = 0.3 * PX;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; ctx.beginPath(); ctx.moveTo(L.x + Math.cos(a) * 1.3, L.y + Math.sin(a) * 1.3); ctx.lineTo(L.x + Math.cos(a) * L.lens, L.y + Math.sin(a) * L.lens); ctx.stroke(); }
  // glow on the fascia (screen blend, two radii)
  ctx.save(); ctx.globalCompositeOperation = 'screen';
  for (const [r, a] of [[11, 0.32], [24, 0.10]]) {
    const gg = ctx.createRadialGradient(L.x, L.y, L.lens * 0.6, L.x, L.y, r);
    gg.addColorStop(0, rgba(hot, a * on)); gg.addColorStop(1, rgba(hot, 0));
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(L.x, L.y, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // specular: the room's window on the dome of the lens (always there, lamp on or off)
  ctx.save(); ctx.translate(L.x - 1.6, L.y - 1.8); ctx.rotate(-0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.ellipse(0, 0, 1.25, 0.6, 0, 0, TAU); ctx.fill(); ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(L.x + 1.9, L.y + 2.1, 0.35, 0, TAU); ctx.fill();
}

/** Separate red alarm LED: 2 Hz strobe (≤ 3 flashes/s, WCAG 2.3.1), steady under Reduce motion. */
function drawAlarm(ctx, st, t, rm, A = G.alarm, label = true) {
  const lit = st.alarm ? (rm ? 1 : (Math.floor(t * 4) % 2 === 0 ? 1 : 0.25)) : 0;
  const ag = ctx.createRadialGradient(A.x - 0.3, A.y - 0.3, 0.1, A.x, A.y, A.r);
  ag.addColorStop(0, lit ? '#ffd9d2' : '#5a2320'); ag.addColorStop(1, lit ? '#ff3b2e' : '#2a0d0b');
  ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(A.x, A.y, A.r, 0, TAU); ctx.fill();
  if (lit) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    const gg = ctx.createRadialGradient(A.x, A.y, 0.5, A.x, A.y, 6);
    gg.addColorStop(0, `rgba(255,59,46,${0.45 * lit})`); gg.addColorStop(1, 'rgba(255,59,46,0)');
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(A.x, A.y, 6, 0, TAU); ctx.fill(); ctx.restore();
  }
  if (!label) return;
  ctx.font = '600 1.45px "JetBrains Mono", monospace'; ctx.fillStyle = 'rgba(210,214,218,0.6)'; ctx.textBaseline = 'middle';
  ctx.fillText('ALM', A.x + 1.9, A.y + 0.1);
}

// ═════════════════════ entry points ═════════════════════

/** Full portrait (≥ 56 px). `cssSize` is the portrait size in CSS px (sets PX so lines are crisp). */
function drawVelaInstrument(ctx, stateId, t, talk, rm, cssSize) {
  PX = 100 / cssSize;
  const st = STATES[stateId];
  drawCable(ctx); drawHandle(ctx); drawChassis(ctx); drawFascia(ctx); drawBezel(ctx); drawPlate(ctx); drawGrille(ctx); drawKnob(ctx);
  drawScreen(ctx, st, t, talk); drawLamp(ctx, st, t, talk, rm); drawAlarm(ctx, st, t, rm);
}

/** Mini avatar (< 56 px): only the screen with its trace and the lamp, no plate, no knob. */
function drawVelaMini(ctx, stateId, t, talk, rm, cssSize) {
  PX = 100 / cssSize;
  const st = STATES[stateId];
  // bezel (51 × 37 u) scaled ×1.8 to fill the box; lines keep their CSS-px width (PX / 1.8)
  const k = 1.8;
  ctx.save(); ctx.translate(50 - 41 * k, 50 - 42 * k + 4); ctx.scale(k, k);
  PX = 100 / cssSize / k;
  drawBezel(ctx); drawScreen(ctx, { ...st, amp: st.amp * 0.8 }, t, talk);
  ctx.restore();
  // lamp tucked on the top-right corner, same layers, smaller
  const L = G.lamp, kl = 1.5;
  ctx.save(); ctx.translate(86, 16); ctx.scale(kl, kl); ctx.translate(-L.x, -L.y);
  PX = 100 / cssSize / kl;
  if (st.alarm) drawAlarm(ctx, st, t, rm, { x: L.x, y: L.y, r: 3.2 }, false);
  else drawLamp(ctx, st, t, talk, rm);
  ctx.restore();
}

window.VELA = { drawVelaInstrument, drawVelaMini, drawBezel, drawScreen, STATES, kelvin, setPx: (v) => { PX = v; } };
