/**
 * The rest of the cast, redrawn (docs/ARTE.md §6.2–§6.5). Same 100×100 unit box as VELA.
 *
 *  ALBOR      a 1970s portable cassette recorder (cream plastic, smoked window, two reels, VU needle)
 *             with a Polaroid of Dr. Albor taped above it. Reels turn and the needle swings while she
 *             talks. Live mode (epilogue): just her, lit by the dawn, breathing and blinking.
 *  COMMITTEE  a heavy grey-green teletype: platen, paper strip printing CAPITAL lines with a red
 *             stamp, keys that hammer, a red "receiving" lamp. The paper stays inside the box.
 *  CHOIR      a brass microscope eyepiece; inside, a REAL live Orbium (LeniaLens) with violet rings
 *             for each "dot" it says.
 *  YOU        the field notebook under the lamp: warm paper, an Orbium sketch, a pen writing.
 */
import type { LeniaLens } from '../story/lens';
import { glow, twinkle, wobble } from './vela';

const TAU = Math.PI * 2;

export interface CastPose {
  talk: number;
  talking: boolean;
  blink: number;
  live: boolean;
  pulses: number[];
  reduceMotion: boolean;
  mood: string;
}

// ═══════════════════════════════ ALBOR ═══════════════════════════════

/** Dr. Albor's face and shoulders, centred at (cx, cy), unit scale k (1 = photo size). */
function alborPortrait(ctx: CanvasRenderingContext2D, cx: number, cy: number, k: number, s: CastPose, t: number, warm: number): void {
  const rm = s.reduceMotion;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(k, k);
  // Parka shoulders (deep teal) with a fur-lined hood edge.
  ctx.fillStyle = '#2f5d63';
  ctx.beginPath();
  ctx.moveTo(-22, 26);
  ctx.quadraticCurveTo(-20, 9, -7, 7);
  ctx.lineTo(7, 7);
  ctx.quadraticCurveTo(20, 9, 22, 26);
  ctx.closePath();
  ctx.fill();
  // Scarf (mustard).
  ctx.fillStyle = '#d9a441';
  ctx.beginPath();
  ctx.moveTo(-8.5, 7.2);
  ctx.quadraticCurveTo(0, 11.5, 8.5, 7.2);
  ctx.lineTo(7.5, 11);
  ctx.quadraticCurveTo(0, 14.5, -7.5, 11);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(2.5, 11, 4, 9);
  // Neck.
  ctx.fillStyle = '#e8b48a';
  ctx.fillRect(-3.2, 2, 6.4, 6);
  // Hair (back): a dark, practical bob.
  ctx.fillStyle = '#2b1d17';
  ctx.beginPath();
  ctx.ellipse(0, -6, 11.2, 12.2, 0, 0, TAU);
  ctx.fill();
  // Face.
  const fg = ctx.createRadialGradient(-2, -6, 1, 0, -4, 11);
  fg.addColorStop(0, '#f6cfa8');
  fg.addColorStop(1, '#dca17a');
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.ellipse(0, -4, 8.4, 9.8, 0, 0, TAU);
  ctx.fill();
  // Fringe.
  ctx.fillStyle = '#2b1d17';
  ctx.beginPath();
  ctx.moveTo(-9, -6);
  ctx.quadraticCurveTo(-7, -16, 1, -15.5);
  ctx.quadraticCurveTo(8.5, -15, 9.2, -6.5);
  ctx.quadraticCurveTo(4, -10.5, -1.5, -9.5);
  ctx.quadraticCurveTo(-6, -9, -9, -6);
  ctx.fill();
  // Round glasses.
  ctx.strokeStyle = '#3a2a22';
  ctx.lineWidth = 0.9;
  for (const ex of [-3.6, 3.6]) {
    ctx.fillStyle = `rgba(255,236,200,${0.18 + warm * 0.12})`;
    ctx.beginPath();
    ctx.arc(ex, -4, 3, 0, TAU);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-0.6, -4.2);
  ctx.quadraticCurveTo(0, -4.9, 0.6, -4.2);
  ctx.stroke();
  // Eyes (blink only when live).
  const closed = s.live ? s.blink : 0;
  ctx.fillStyle = '#2b1d17';
  ctx.strokeStyle = '#2b1d17';
  for (const ex of [-3.6, 3.6]) {
    if (closed > 0.5) {
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(ex - 1.3, -3.8);
      ctx.quadraticCurveTo(ex, -3.1, ex + 1.3, -3.8);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.ellipse(ex, -3.9, 0.95, 1.15 * (1 - closed), 0, 0, TAU);
      ctx.fill();
    }
  }
  // Glasses glint (the lamp).
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.arc(-4.9, -5.3, 0.55, 0, TAU);
  ctx.arc(2.3, -5.3, 0.55, 0, TAU);
  ctx.fill();
  // Smile: warmer when live; moves a little while she talks.
  const talkOpen = s.talking ? s.talk * 1.4 : 0;
  ctx.strokeStyle = '#7a3b2e';
  ctx.lineWidth = 0.9;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-2.6, 1.2);
  ctx.quadraticCurveTo(0, 3.2 + talkOpen + (s.live ? 0.6 : 0), 2.6, 1.2);
  ctx.stroke();
  // Freckles and cheeks.
  ctx.fillStyle = 'rgba(200,110,80,0.35)';
  for (const [fx, fy] of [
    [-5.2, -0.4],
    [-4.2, 0.4],
    [4.6, -0.2],
    [5.4, 0.6],
  ]) {
    ctx.beginPath();
    ctx.arc(fx, fy, 0.35, 0, TAU);
    ctx.fill();
  }
  if (!rm && s.live) {
    // Breathing handled by the caller's transform; nothing animated here.
  }
  void t;
  ctx.restore();
}

export function drawAlborArt(ctx: CanvasRenderingContext2D, s: CastPose, t: number): void {
  const rm = s.reduceMotion;
  if (s.live) {
    // Epilogue: Albor in person, the first dawn behind her (gold low, rose above), breathing gently.
    glow(ctx, 50, 100, 62, '255,170,110', 0.55);
    glow(ctx, 50, 92, 40, '255,214,160', 0.6);
    glow(ctx, 50, 44, 34, '255,236,200', 0.22);
    const br = rm ? 0 : Math.sin(t * 1.2) * 0.6;
    alborPortrait(ctx, 50, 54 + br, 1.55, s, t, 1);
    return;
  }
  glow(ctx, 50, 56, 50, '255,170,90', 0.16);

  // ── The recorder (lower part). ──
  const bodyTop = 47;
  const bodyBot = 92;
  ctx.save();
  // Handle.
  ctx.strokeStyle = '#5b4a3a';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(30, bodyTop + 1);
  ctx.quadraticCurveTo(50, bodyTop - 9, 70, bodyTop + 1);
  ctx.stroke();
  // Body: cream plastic, shaded.
  const bg = ctx.createLinearGradient(0, bodyTop, 0, bodyBot);
  bg.addColorStop(0, '#efe3c8');
  bg.addColorStop(1, '#c9b48d');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(10, bodyTop, 80, bodyBot - bodyTop, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,52,34,0.55)';
  ctx.lineWidth = 0.9;
  ctx.stroke();
  // Top panel: speaker grille (left), VU meter (right).
  ctx.fillStyle = '#4d4032';
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 9; c++) {
      ctx.beginPath();
      ctx.arc(17 + c * 2.6, bodyTop + 4.5 + r * 2.4, 0.65, 0, TAU);
      ctx.fill();
    }
  // VU meter.
  const vx = 60;
  const vy = bodyTop + 3;
  ctx.fillStyle = '#f7efd9';
  ctx.beginPath();
  ctx.roundRect(vx, vy, 24, 8.5, 1.5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,52,34,0.6)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.strokeStyle = '#7a6a55';
  ctx.beginPath();
  ctx.arc(vx + 12, vy + 13, 10, Math.PI * 1.22, Math.PI * 1.78);
  ctx.stroke();
  ctx.strokeStyle = '#d0462a';
  ctx.beginPath();
  ctx.arc(vx + 12, vy + 13, 10, Math.PI * 1.62, Math.PI * 1.78);
  ctx.stroke();
  const level = s.talking ? (rm ? 0.55 : 0.35 + 0.55 * Math.abs(wobble(t * 6, 2)) * Math.max(0.3, s.talk)) : 0.05;
  const na = Math.PI * (1.22 + 0.56 * Math.min(1, level));
  ctx.strokeStyle = '#1f1a14';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(vx + 12, vy + 8.4);
  ctx.lineTo(vx + 12 + Math.cos(na) * 9, vy + 13 + Math.sin(na) * 9);
  ctx.stroke();
  // Smoked cassette window with the tape and its reels.
  const wx = 20;
  const wy = bodyTop + 13;
  const ww = 60;
  const wh = 17;
  ctx.fillStyle = '#2a2420';
  ctx.beginPath();
  ctx.roundRect(wx, wy, ww, wh, 3);
  ctx.fill();
  // Cassette label (masking tape, handwritten-looking strokes).
  ctx.fillStyle = '#f2e3b8';
  ctx.fillRect(wx + 18, wy + 2, 24, 4);
  ctx.strokeStyle = '#6b4b2a';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(wx + 20, wy + 4.2);
  for (let i = 0; i < 9; i++) ctx.lineTo(wx + 21 + i * 2.2, wy + 3.6 + (i % 2) * 1.1);
  ctx.stroke();
  const spin = rm ? 0 : t * (s.talking ? 4.5 : 0.8);
  for (const [rx, mult, fill] of [
    [wx + 15, 1, 7],
    [wx + 45, 1.18, 4.6],
  ] as const) {
    // Tape wound on the reel (brown), more on the left.
    ctx.fillStyle = '#5a3a24';
    ctx.beginPath();
    ctx.arc(rx, wy + 10.5, fill, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(rx, wy + 10.5);
    ctx.rotate(spin * mult);
    ctx.fillStyle = '#efe6d2';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2a2420';
    for (let k = 0; k < 6; k++) {
      ctx.save();
      ctx.rotate((k / 6) * TAU);
      ctx.fillRect(-0.45, 1.2, 0.9, 1.6);
      ctx.restore();
    }
    ctx.restore();
  }
  // Glass reflection on the window.
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(wx + 4, wy);
  ctx.lineTo(wx + 14, wy);
  ctx.lineTo(wx + 6, wy + wh);
  ctx.lineTo(wx - 4 + 4, wy + wh);
  ctx.closePath();
  ctx.fill();
  // Piano keys; PLAY is down while she talks.
  for (let i = 0; i < 6; i++) {
    const down = i === 2 && s.talking;
    ctx.fillStyle = i === 2 ? '#2f2a24' : '#463c31';
    ctx.beginPath();
    ctx.roundRect(19 + i * 10.6, bodyTop + 34 + (down ? 1.2 : 0), 8.8, 5 - (down ? 1.2 : 0), 1.2);
    ctx.fill();
  }
  ctx.fillStyle = '#f2e3b8';
  ctx.beginPath();
  ctx.moveTo(19 + 2 * 10.6 + 3.2, bodyTop + 35.4 + (s.talking ? 1.2 : 0));
  ctx.lineTo(19 + 2 * 10.6 + 3.2, bodyTop + 38 + (s.talking ? 0.4 : 0));
  ctx.lineTo(19 + 2 * 10.6 + 5.6, bodyTop + 36.7 + (s.talking ? 0.8 : 0));
  ctx.closePath();
  ctx.fill();
  // Amber PLAY light.
  const on = s.talking ? 1 : rm ? 0.3 : 0.25 + 0.15 * Math.sin(t * 2);
  glow(ctx, 84, bodyTop + 36.5, 5, '255,170,60', 0.7 * on);
  ctx.fillStyle = on > 0.5 ? '#ffc067' : '#8a5a22';
  ctx.beginPath();
  ctx.arc(84, bodyTop + 36.5, 1.4, 0, TAU);
  ctx.fill();
  ctx.restore();

  // ── The Polaroid, taped above the recorder. ──
  ctx.save();
  ctx.translate(36, 25);
  ctx.rotate(-0.09);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-17, -19.5, 35, 40);
  ctx.fillStyle = '#f7f1e3';
  ctx.fillRect(-18, -21, 35, 40);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-15.5, -18.5, 30, 29);
  ctx.clip();
  const pg = ctx.createLinearGradient(0, -18, 0, 11);
  pg.addColorStop(0, '#6b4a33');
  pg.addColorStop(1, '#2c1d14');
  ctx.fillStyle = pg;
  ctx.fillRect(-16, -19, 31, 30);
  glow(ctx, 8, -14, 18, '255,200,140', 0.3);
  alborPortrait(ctx, -0.5, -2, 0.82, s, t, 0.4);
  // Warm sepia wash and grain lines.
  ctx.fillStyle = 'rgba(255,170,90,0.12)';
  ctx.fillRect(-16, -19, 31, 30);
  ctx.restore();
  // Masking tape.
  ctx.fillStyle = 'rgba(242,227,184,0.85)';
  ctx.save();
  ctx.translate(0, -21);
  ctx.rotate(0.12);
  ctx.fillRect(-6, -2.2, 12, 4.4);
  ctx.restore();
  ctx.restore();
  // A sparkle of the Spark near her photo: the story's hidden link (subtle).
  if (!rm) twinkle(ctx, 60, 14, 2.2, '#ffd166', Math.max(0, Math.sin(t * 0.9)) ** 6);
}

// ═══════════════════════════════ COMMITTEE ═══════════════════════════════

export function drawCommitteeArt(ctx: CanvasRenderingContext2D, s: CastPose, t: number): void {
  const rm = s.reduceMotion;
  glow(ctx, 50, 66, 48, '228,87,46', 0.1);
  // Paper strip: rises from the platen and curls back at the top; never leaves the box.
  const scroll = rm ? 0 : (t * (s.talking ? 8 : 0.5)) % 6;
  const px0 = 33;
  const px1 = 67;
  ctx.save();
  ctx.beginPath();
  ctx.rect(px0 - 1, 9, px1 - px0 + 2, 45);
  ctx.clip();
  const pg = ctx.createLinearGradient(0, 9, 0, 54);
  pg.addColorStop(0, '#d9d1bf');
  pg.addColorStop(0.18, '#f1ead9');
  pg.addColorStop(1, '#e9e1cc');
  ctx.fillStyle = pg;
  ctx.fillRect(px0, 9, px1 - px0, 45);
  // Printed CAPITAL lines.
  ctx.fillStyle = 'rgba(38,40,48,0.78)';
  for (let i = 0; i < 9; i++) {
    const y = 50 - i * 5 + scroll;
    let x = px0 + 3;
    for (let w = 0; w < 4; w++) {
      const len = 3 + ((i * 7 + w * 13) % 7);
      if (x + len > px1 - 3) break;
      ctx.fillRect(x, y, len, 1.4);
      x += len + 1.8;
    }
  }
  // The red stamp: APROBADO (a circle with a tick).
  ctx.strokeStyle = 'rgba(205,52,30,0.85)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(58, 22 + scroll, 5, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(55.6, 22.4 + scroll);
  ctx.lineTo(57.4, 24.3 + scroll);
  ctx.lineTo(60.6, 19.8 + scroll);
  ctx.stroke();
  ctx.restore();
  // Paper curl at the top.
  ctx.fillStyle = '#cfc6b2';
  ctx.beginPath();
  ctx.ellipse(50, 9.2, (px1 - px0) / 2, 2.2, 0, Math.PI, TAU);
  ctx.fill();
  ctx.fillStyle = '#f6f0e1';
  ctx.beginPath();
  ctx.ellipse(50, 9.6, (px1 - px0) / 2, 1.5, 0, 0, Math.PI);
  ctx.fill();

  // Platen roller.
  const rg = ctx.createLinearGradient(0, 50, 0, 58);
  rg.addColorStop(0, '#3b4040');
  rg.addColorStop(0.5, '#1a1d1e');
  rg.addColorStop(1, '#2e3233');
  ctx.fillStyle = rg;
  ctx.beginPath();
  ctx.roundRect(22, 50.5, 56, 7, 3.5);
  ctx.fill();
  ctx.fillStyle = '#8f9894';
  ctx.beginPath();
  ctx.arc(20.5, 54, 3, 0, TAU);
  ctx.arc(79.5, 54, 3, 0, TAU);
  ctx.fill();

  // Machine body: grey-green enamel, trapezoid, with a chrome trim line.
  const body = ctx.createLinearGradient(0, 56, 0, 94);
  body.addColorStop(0, '#6f7d76');
  body.addColorStop(1, '#3f4a45');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(16, 57);
  ctx.lineTo(84, 57);
  ctx.lineTo(91, 93);
  ctx.lineTo(9, 93);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(220,230,226,0.45)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(15, 60.5);
  ctx.lineTo(85, 60.5);
  ctx.stroke();
  // Keys: three rows, hammering while it speaks.
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 9; k++) {
      const x = 20 + row * 1.6 + k * 6.6 - row * 0.4;
      const y = 66.5 + row * 7;
      const hit = s.talking && !rm && Math.sin(t * 17 + k * 2.1 + row * 3.3) > 0.82;
      ctx.fillStyle = '#20262a';
      ctx.beginPath();
      ctx.ellipse(x + 2.3, y + 2.5, 2.6, 2.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = hit ? '#c9d1cd' : '#e9ece4';
      ctx.beginPath();
      ctx.ellipse(x + 2.3, y + 1.7 + (hit ? 0.8 : 0), 2.3, 2.1, 0, 0, TAU);
      ctx.fill();
    }
  // Committee badge on the front: a shield with a rising bar chart (YIELD).
  ctx.fillStyle = '#c9b27a';
  ctx.beginPath();
  ctx.moveTo(50, 87);
  ctx.lineTo(55, 88.5);
  ctx.lineTo(55, 91);
  ctx.quadraticCurveTo(55, 92.4, 50, 93);
  ctx.quadraticCurveTo(45, 92.4, 45, 91);
  ctx.lineTo(45, 88.5);
  ctx.closePath();
  ctx.fill();
  // Red lamp.
  const on = s.talking ? (rm ? 1 : Math.sin(t * 10) > 0 ? 1 : 0.2) : rm ? 0.2 : Math.sin(t * 2) > 0.6 ? 0.8 : 0.15;
  glow(ctx, 80, 62.5, 7, '255,80,50', 0.8 * on);
  ctx.fillStyle = on > 0.5 ? '#ff7a5c' : '#6a2a20';
  ctx.beginPath();
  ctx.arc(80, 62.5, 1.9, 0, TAU);
  ctx.fill();
}

// ═══════════════════════════════ CHOIR ═══════════════════════════════

export function drawChoirArt(ctx: CanvasRenderingContext2D, s: CastPose, t: number, lens: LeniaLens | null): void {
  const cx = 50;
  const cy = 50;
  const Rr = 38;
  glow(ctx, cx, cy, 52, '184,146,255', 0.22);
  // Brass eyepiece with knurling.
  const brass = ctx.createLinearGradient(0, cy - Rr - 8, 0, cy + Rr + 8);
  brass.addColorStop(0, '#f1d48c');
  brass.addColorStop(0.5, '#a47a35');
  brass.addColorStop(1, '#5e431d');
  ctx.fillStyle = brass;
  ctx.beginPath();
  ctx.arc(cx, cy, Rr + 7, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(60,40,15,0.55)';
  ctx.lineWidth = 0.7;
  const rot = s.reduceMotion ? 0 : t * 0.04;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * TAU + rot;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (Rr + 3.5), cy + Math.sin(a) * (Rr + 3.5));
    ctx.lineTo(cx + Math.cos(a) * (Rr + 6.6), cy + Math.sin(a) * (Rr + 6.6));
    ctx.stroke();
  }
  ctx.fillStyle = '#20180c';
  ctx.beginPath();
  ctx.arc(cx, cy, Rr + 1.5, 0, TAU);
  ctx.fill();
  // The view.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, Rr, 0, TAU);
  ctx.clip();
  const bg = ctx.createRadialGradient(cx, cy, 4, cx, cy, Rr);
  bg.addColorStop(0, '#141c3c');
  bg.addColorStop(1, '#04060c');
  ctx.fillStyle = bg;
  ctx.fillRect(cx - Rr, cy - Rr, Rr * 2, Rr * 2);
  if (lens) {
    const sc = (Rr * 3) / lens.size;
    const shiftX = cx - lens.cx * sc;
    const shiftY = cy - lens.cy * sc;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const W = lens.size * sc;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) ctx.drawImage(lens.canvas, shiftX + dx * W, shiftY + dy * W, W, W);
  } else {
    glow(ctx, cx, cy, 14, '120,220,255', 0.8);
  }
  for (const age of s.pulses) {
    const k = age / 1.4;
    if (k >= 1) continue;
    ctx.strokeStyle = `rgba(206,186,255,${(1 - k) * 0.9})`;
    ctx.lineWidth = 1.8 * (1 - k) + 0.4;
    ctx.beginPath();
    ctx.arc(cx, cy, 6 + k * 32, 0, TAU);
    ctx.stroke();
  }
  // Reticle with a scale.
  ctx.strokeStyle = 'rgba(200,230,255,0.16)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - Rr, cy);
  ctx.lineTo(cx + Rr, cy);
  ctx.moveTo(cx, cy - Rr);
  ctx.lineTo(cx, cy + Rr);
  for (let i = -6; i <= 6; i++) {
    ctx.moveTo(cx + i * 5, cy - (i % 2 ? 1 : 2));
    ctx.lineTo(cx + i * 5, cy + (i % 2 ? 1 : 2));
  }
  ctx.stroke();
  const vg = ctx.createRadialGradient(cx, cy, Rr * 0.6, cx, cy, Rr);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(2,3,8,0.85)');
  ctx.fillStyle = vg;
  ctx.fillRect(cx - Rr, cy - Rr, Rr * 2, Rr * 2);
  // Lens reflection.
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, Rr - 5, Math.PI * 1.1, Math.PI * 1.35);
  ctx.stroke();
  ctx.restore();
}

// ═══════════════════════════════ YOU (journal) ═══════════════════════════════

export function drawYouArt(ctx: CanvasRenderingContext2D, s: CastPose, t: number): void {
  const rm = s.reduceMotion;
  glow(ctx, 50, 50, 50, '255,200,130', 0.16);
  ctx.save();
  ctx.translate(50, 56);
  ctx.rotate(-0.07);
  // Cover peeking out (dark leather) + elastic band.
  ctx.fillStyle = '#3a2a22';
  ctx.beginPath();
  ctx.roundRect(-37, -25, 74, 52, 3);
  ctx.fill();
  // Pages.
  for (const side of [-1, 1]) {
    const g = ctx.createLinearGradient(side * 34, 0, 0, 0);
    g.addColorStop(0, '#f6ead0');
    g.addColorStop(0.85, '#efdfbd');
    g.addColorStop(1, '#d9c69c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.quadraticCurveTo(side * 17, -25.5, side * 34.5, -22.5);
    ctx.lineTo(side * 34.5, 23.5);
    ctx.quadraticCurveTo(side * 17, 20.5, 0, 24);
    ctx.closePath();
    ctx.fill();
  }
  // Rules.
  ctx.strokeStyle = 'rgba(80,120,160,0.22)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 6; i++) {
    const y = -14 + i * 6.5;
    ctx.beginPath();
    ctx.moveTo(-31, y);
    ctx.lineTo(-3, y + 0.4);
    ctx.moveTo(3, y + 0.4);
    ctx.lineTo(31, y);
    ctx.stroke();
  }
  // Left page: an Orbium sketched in cyan ink.
  ctx.strokeStyle = 'rgba(20,110,170,0.85)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.arc(-17, -1, 8, 0.5, TAU - 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(-17, 0.5, 2.6, 4.2, 0, 0, TAU);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-17, -1, 10.5, Math.PI * 1.15, Math.PI * 1.85);
  ctx.stroke();
  // Right page: handwriting appears line by line while "you" speak.
  ctx.strokeStyle = 'rgba(40,40,60,0.75)';
  ctx.lineWidth = 0.85;
  ctx.lineCap = 'round';
  const written = rm ? 4 : (t * (s.talking ? 1.3 : 0.12)) % 5;
  for (let i = 0; i < 5; i++) {
    const y = -15.5 + i * 6.5;
    const part = i < Math.floor(written) ? 1 : i === Math.floor(written) ? written % 1 : 0;
    if (part <= 0) continue;
    ctx.beginPath();
    const x0 = 6;
    const x1 = x0 + 24 * part;
    for (let x = x0; x <= x1; x += 1.2) {
      const yy = y + Math.sin(x * 1.4 + i) * 0.8;
      if (x === x0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Spine shadow.
  const sg = ctx.createLinearGradient(-4, 0, 4, 0);
  sg.addColorStop(0, 'rgba(0,0,0,0)');
  sg.addColorStop(0.5, 'rgba(60,40,20,0.3)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(-4, -24, 8, 48);
  // Fountain pen at the writing point.
  const line = Math.floor(written);
  const pxp = 6 + 24 * (written % 1);
  const pyp = -15.5 + Math.min(4, line) * 6.5;
  ctx.save();
  ctx.translate(pxp, pyp);
  ctx.rotate(-0.75);
  ctx.fillStyle = '#1d3f6e';
  ctx.beginPath();
  ctx.roundRect(-1.6, -24, 3.2, 17, 1.5);
  ctx.fill();
  ctx.fillStyle = '#d9b45a';
  ctx.fillRect(-1.6, -9.5, 3.2, 1.2);
  ctx.fillStyle = '#c8ccd2';
  ctx.beginPath();
  ctx.moveTo(-1.5, -7);
  ctx.lineTo(1.5, -7);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  glow(ctx, pxp, pyp, 4, '91,192,235', 0.6);
  ctx.restore();
}
