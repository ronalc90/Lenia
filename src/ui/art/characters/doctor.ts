/**
 * The people of Estación Vigilia (docs/ARTE.md §6.6): chibi scientists in lab coats, drawn in code.
 *
 * One parametric renderer for every human in the cast: a big round head (about half the height),
 * a short lab coat, mitten hands and little boots. A `DoctorSpec` says who it is (skin, hair, eyes,
 * the sweater under the coat, goggles / glasses / stethoscope / beanie / scarf, an item to hold);
 * a `DoctorPose` says how they feel right now (mood, blink, talking, a gesture).
 *
 * Coordinates are "character units": the origin is between the feet, y grows downwards, the head's
 * centre sits at (0, -60) and the top of the hair near y = -86. `drawDoctorAt` places a whole body
 * anywhere (intro scenes); `drawDoctorBust` frames head and shoulders in the 100 × 100 portrait box
 * used by the dialogue (src/ui/art/portraits.ts).
 *
 * Light language: the warm candle (VELA) lights faces and coats from the upper right; the cold
 * bioluminescent dish lights them from below with a cyan rim. No images, no Math.random, no
 * shadowBlur: glows are radial gradients. Reduce motion freezes breathing, swaying and waving but
 * keeps the expression and a talking mouth.
 */
import { glow, twinkle } from '../vela';

const TAU = Math.PI * 2;

export type DoctorMood = 'neutral' | 'happy' | 'surprised' | 'worried' | 'thinking' | 'proud' | 'sleepy';
export const DOCTOR_MOODS: readonly DoctorMood[] = ['neutral', 'happy', 'surprised', 'worried', 'thinking', 'proud', 'sleepy'];

export type HairStyle = 'bob' | 'curly' | 'short' | 'bun';
export type Gesture = 'rest' | 'wave' | 'chin' | 'cheeks' | 'hips' | 'clasp' | 'hold' | 'point' | 'write' | 'walk';
export type HeldItem = 'none' | 'lantern' | 'clipboard' | 'notebook' | 'mug' | 'suitcase';

export interface DoctorSpec {
  id: string;
  skin: string;
  /** Shadow tone of the skin (cheek side, ears). */
  skinShade: string;
  hair: string;
  hairShade: string;
  hairStyle: HairStyle;
  /** A silver streak in the fringe (Albor). */
  streak?: boolean;
  /** Iris colour (the lower half of the eye). */
  iris: string;
  /** The sweater under the coat. */
  sweater: string;
  coat?: string;
  glasses?: boolean;
  goggles?: string | null;
  stethoscope?: boolean;
  beanie?: string | null;
  scarf?: string | null;
  freckles?: boolean;
  /** What the hands hold when the gesture is 'hold' (and 'write' = notebook + pen). */
  item?: HeldItem;
  /** Lash flicks at the outer corner of the eyes. */
  lashes?: boolean;
}

export interface DoctorPose {
  mood: DoctorMood;
  /** Seconds since the mood changed: a small squash & stretch pop. */
  moodAge: number;
  /** 0..1 mouth openness. */
  talk: number;
  talking: boolean;
  /** 0..1, 1 = eyes closed. */
  blink: number;
  reduceMotion: boolean;
  /** Overrides the mood's gesture. */
  gesture?: Gesture;
  /** Overrides the spec's held item. */
  item?: HeldItem;
  /** -1..1: where the eyes look (x). Default: a slow drift. */
  lookX?: number;
  lookY?: number;
  /** Mirror the whole character (face left). */
  flip?: boolean;
  /** 0..1 lantern / candle light on the face (default 1). */
  warm?: number;
}

const INK = '#2a2130';
const INK_SOFT = 'rgba(42,33,48,0.55)';
const COAT = '#f3f7fb';
const COAT_SHADE = '#c9d6e4';
const BLUSH = '255,128,140';
const LINE = 1.35;

/** Which gesture each mood shows when the pose does not say. */
export const MOOD_GESTURE: Record<DoctorMood, Gesture> = {
  neutral: 'rest',
  happy: 'wave',
  surprised: 'cheeks',
  worried: 'clasp',
  thinking: 'chin',
  proud: 'hips',
  sleepy: 'rest',
};

// ───────────────────────────── small helpers ─────────────────────────────

function outlineFill(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient, lw = LINE): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0): void {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, TAU);
}

/** A limb as a rounded tube with an ink outline: shoulder → elbow → hand. */
function limb(ctx: CanvasRenderingContext2D, pts: [number, number][], width: number, color: string): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 3) ctx.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]);
    else for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  };
  path();
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + LINE * 2;
  ctx.stroke();
  path();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function hand(ctx: CanvasRenderingContext2D, x: number, y: number, spec: DoctorSpec, r = 3.9): void {
  circle(ctx, x, y, r);
  outlineFill(ctx, spec.skin);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  circle(ctx, x - r * 0.3, y - r * 0.35, r * 0.35);
  ctx.fill();
}

// ───────────────────────────── arms (by gesture) ─────────────────────────────

interface ArmPose {
  /** [elbow, hand] for the left (viewer's left) and right arm. */
  l: [[number, number], [number, number]];
  r: [[number, number], [number, number]];
  /** Arms drawn over the head (hands at the face). */
  front: boolean;
}

function armPose(g: Gesture, t: number, rm: boolean, talking: number): ArmPose {
  const w = rm ? 0 : Math.sin(t * 9) * 3.2;
  const sway = rm ? 0 : Math.sin(t * 1.3) * 0.8;
  switch (g) {
    case 'wave':
      return {
        l: [[-18, -30], [-18.5, -21.5 + sway]],
        r: [[22, -42], [25 + w, -56 - Math.abs(w) * 0.25]],
        front: false,
      };
    case 'chin':
      return { l: [[-12, -26], [3, -28]], r: [[14, -26], [5, -43]], front: true };
    case 'cheeks':
      return { l: [[-21, -36], [-15.5, -50]], r: [[21, -36], [15.5, -50]], front: true };
    case 'hips':
      return { l: [[-25, -32], [-17.5, -24]], r: [[25, -32], [17.5, -24]], front: false };
    case 'clasp':
      return { l: [[-15, -26], [-2.5, -24 + sway * 0.4]], r: [[15, -26], [2.5, -24 + sway * 0.4]], front: false };
    case 'hold':
      return { l: [[-16, -27], [-7, -27]], r: [[16, -27], [7, -27]], front: false };
    case 'write': {
      const p = rm ? 0 : talking * Math.sin(t * 11) * 1.8;
      return { l: [[-16, -27], [-8, -26]], r: [[16, -28], [5 + p, -30 + Math.abs(p) * 0.4]], front: false };
    }
    case 'point':
      return { l: [[-18, -30], [-18.5, -21.5 + sway]], r: [[24, -40], [31, -45 + sway]], front: false };
    case 'walk': {
      const s = rm ? 0 : Math.sin(t * 6.5) * 4;
      return { l: [[-18, -31], [-19 + s, -22]], r: [[18, -31], [19 + s, -22]], front: false };
    }
    case 'rest':
    default:
      return { l: [[-18, -31], [-18.5, -21.5 + sway]], r: [[18, -31], [18.5, -21.5 - sway]], front: false };
  }
}

// ───────────────────────────── hair ─────────────────────────────

function hairBack(ctx: CanvasRenderingContext2D, s: DoctorSpec): void {
  const g = ctx.createLinearGradient(0, -86, 0, -40);
  g.addColorStop(0, s.hair);
  g.addColorStop(1, s.hairShade);
  ctx.beginPath();
  switch (s.hairStyle) {
    case 'bob':
      ctx.moveTo(-24, -46);
      ctx.bezierCurveTo(-28, -64, -24, -84, 0, -84.5);
      ctx.bezierCurveTo(24, -84, 28, -64, 24, -46);
      ctx.quadraticCurveTo(19, -42.5, 13, -45);
      ctx.lineTo(-13, -45);
      ctx.quadraticCurveTo(-19, -42.5, -24, -46);
      break;
    case 'curly': {
      const bumps: [number, number, number][] = [
        [-20, -50, 6.5],
        [-23, -60, 7],
        [-20, -72, 7.5],
        [-10, -80, 8],
        [3, -82, 8.5],
        [15, -77, 8],
        [22, -66, 7.5],
        [22, -54, 6.5],
      ];
      for (const [x, y, r] of bumps) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      break;
    }
    case 'bun':
      ctx.moveTo(-21.5, -54);
      ctx.bezierCurveTo(-23, -76, -12, -82, 0, -82);
      ctx.bezierCurveTo(12, -82, 23, -76, 21.5, -54);
      ctx.closePath();
      ctx.moveTo(9.5, -88);
      ctx.arc(0, -88, 9.5, 0, TAU);
      break;
    case 'short':
    default:
      ctx.moveTo(-21.5, -55);
      ctx.bezierCurveTo(-23, -77, -12, -82.5, 0, -82.5);
      ctx.bezierCurveTo(12, -82.5, 23, -77, 21.5, -55);
      ctx.closePath();
  }
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.stroke();
}

function hairFront(ctx: CanvasRenderingContext2D, s: DoctorSpec, t: number, rm: boolean): void {
  const g = ctx.createLinearGradient(-10, -84, 10, -62);
  g.addColorStop(0, s.hair);
  g.addColorStop(1, s.hairShade);
  ctx.fillStyle = g;
  ctx.strokeStyle = INK;
  ctx.lineWidth = LINE;
  ctx.lineJoin = 'round';
  switch (s.hairStyle) {
    case 'bob': {
      // A side-swept fringe and two locks framing the face.
      ctx.beginPath();
      ctx.moveTo(-21, -56);
      ctx.bezierCurveTo(-22, -74, -10, -80, 2, -79);
      ctx.bezierCurveTo(14, -78, 22, -70, 21, -56);
      ctx.quadraticCurveTo(17, -65, 8, -68.5);
      ctx.quadraticCurveTo(-2, -70, -8, -64.5);
      ctx.quadraticCurveTo(-14, -61, -21, -56);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Side locks down to the jaw.
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * 20.5, -62);
        ctx.quadraticCurveTo(side * 23.5, -52, side * 21, -45.5);
        ctx.quadraticCurveTo(side * 18, -47, side * 17.5, -52);
        ctx.quadraticCurveTo(side * 18, -58, side * 20.5, -62);
        ctx.fill();
        ctx.stroke();
      }
      if (s.streak) {
        ctx.strokeStyle = 'rgba(232,226,236,0.9)';
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-12, -74.5);
        ctx.quadraticCurveTo(-4, -72.5, 1, -68.8);
        ctx.stroke();
      }
      break;
    }
    case 'curly': {
      const tufts: [number, number, number][] = [
        [-15, -68, 5.5],
        [-7, -73, 6],
        [2, -74, 6],
        [11, -72, 5.8],
        [17, -66, 5],
      ];
      ctx.beginPath();
      for (const [x, y, r] of tufts) {
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      ctx.fill();
      ctx.stroke();
      // Little curl highlights.
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 1;
      for (const [x, y, r] of tufts) {
        ctx.beginPath();
        ctx.arc(x - 0.5, y - 0.5, r * 0.55, Math.PI * 1.1, Math.PI * 1.7);
        ctx.stroke();
      }
      break;
    }
    case 'bun':
    case 'short':
    default: {
      // Three soft tufts sweeping right; one cowlick on top that bobs.
      ctx.beginPath();
      ctx.moveTo(-21, -58);
      ctx.bezierCurveTo(-22, -76, -10, -81, 1, -80.5);
      ctx.bezierCurveTo(14, -80, 22, -72, 21, -58);
      ctx.quadraticCurveTo(18, -66, 12, -68);
      ctx.quadraticCurveTo(10, -64, 5, -64);
      ctx.quadraticCurveTo(4, -68, -2, -68.5);
      ctx.quadraticCurveTo(-5, -64, -11, -64);
      ctx.quadraticCurveTo(-14, -66, -21, -58);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (s.hairStyle === 'short' && !s.beanie) {
        const bob = rm ? 0 : Math.sin(t * 2.1) * 0.8;
        ctx.beginPath();
        ctx.moveTo(0, -80);
        ctx.quadraticCurveTo(2 + bob, -88, 7 + bob, -87);
        ctx.quadraticCurveTo(3, -84, 3.5, -80);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1.1;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-12, -75);
      ctx.quadraticCurveTo(-6, -78, 0, -77.5);
      ctx.stroke();
    }
  }
}

// ───────────────────────────── face ─────────────────────────────

function eyes(ctx: CanvasRenderingContext2D, s: DoctorSpec, p: DoctorPose, t: number): void {
  const m = p.mood;
  const rm = p.reduceMotion;
  const lx = p.lookX ?? (rm ? 0 : Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.91) * 0.25);
  const ly = p.lookY ?? (m === 'worried' ? 0.6 : m === 'thinking' ? -0.8 : 0);
  const blink = m === 'sleepy' ? Math.max(0.85, p.blink) : p.blink;
  for (const side of [-1, 1] as const) {
    const ex = side * 7.6;
    const ey = -57;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (m === 'happy' || (m === 'proud' && side === 1)) {
      // ^ ^ (proud winks with one)
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      ctx.moveTo(ex - 3.2, ey + 0.8);
      ctx.quadraticCurveTo(ex, ey - 3.6, ex + 3.2, ey + 0.8);
      ctx.stroke();
      continue;
    }
    if (blink > 0.55) {
      // closed: a soft downward arc with a lash flick
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(ex - 3.1, ey);
      ctx.quadraticCurveTo(ex, ey + 2.6, ex + 3.1, ey);
      ctx.stroke();
      if (s.lashes) {
        ctx.beginPath();
        ctx.moveTo(ex + side * 3.1, ey);
        ctx.lineTo(ex + side * 4.4, ey - 1);
        ctx.stroke();
      }
      continue;
    }
    const big = m === 'surprised' ? 1.22 : m === 'worried' ? 0.92 : 1;
    const rx = 3.05 * big;
    const ry = 4.05 * big * (1 - blink * 0.9);
    const proudSquint = m === 'proud' ? 0.62 : 1;
    // Eye: ink top, coloured iris below, two highlights (warm candle, cold dish).
    ctx.save();
    ellipse(ctx, ex + lx * 0.7, ey + ly * 0.5, rx, ry * proudSquint);
    const g = ctx.createLinearGradient(0, ey - ry, 0, ey + ry);
    g.addColorStop(0, INK);
    g.addColorStop(0.45, INK);
    g.addColorStop(1, s.iris);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    circle(ctx, ex + lx * 0.7 - rx * 0.32, ey + ly * 0.5 - ry * 0.38 * proudSquint, rx * 0.42);
    ctx.fill();
    ctx.fillStyle = 'rgba(190,240,255,0.85)';
    circle(ctx, ex + lx * 0.7 + rx * 0.35, ey + ly * 0.5 + ry * 0.35 * proudSquint, rx * 0.2);
    ctx.fill();
    ctx.restore();
    if (m === 'proud') {
      // a smug lower lid
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ex - 3.2, ey - 1.5);
      ctx.lineTo(ex + 3.2, ey - 1.5);
      ctx.stroke();
    }
    if (s.lashes) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ex + side * rx * 0.85, ey - ry * 0.55);
      ctx.lineTo(ex + side * (rx + 1.4), ey - ry * 0.85);
      ctx.stroke();
    }
  }
}

function brows(ctx: CanvasRenderingContext2D, s: DoctorSpec, m: DoctorMood): void {
  ctx.strokeStyle = s.hairShade;
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  for (const side of [-1, 1] as const) {
    const bx = side * 7.6;
    let y0 = -63.4;
    let tilt = 0; // + = inner end up (worried)
    if (m === 'surprised') y0 = -66;
    if (m === 'worried') tilt = 1.8;
    if (m === 'thinking') {
      y0 = side === 1 ? -65.2 : -63;
      tilt = side === 1 ? -0.4 : -0.6;
    }
    if (m === 'proud') tilt = -0.9;
    if (m === 'sleepy') y0 = -62.6;
    const inner = bx - side * 2.6;
    const outer = bx + side * 2.6;
    ctx.beginPath();
    ctx.moveTo(inner, y0 - tilt);
    ctx.quadraticCurveTo(bx, y0 - 1.1 - (m === 'surprised' ? 0.6 : 0), outer, y0 + tilt * 0.4);
    ctx.stroke();
  }
}

function mouth(ctx: CanvasRenderingContext2D, p: DoctorPose, t: number): void {
  const m = p.mood;
  const x = m === 'thinking' ? 2.2 : 0;
  const y = -50.2;
  const open = p.talking ? Math.max(0, Math.min(1, p.talk)) : 0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  const drawOpen = (w: number, h: number) => {
    // A rounded "D": dark inside, a pink tongue.
    ctx.beginPath();
    ctx.moveTo(x - w, y - 0.6);
    ctx.quadraticCurveTo(x, y - 1.6, x + w, y - 0.6);
    ctx.quadraticCurveTo(x + w * 0.9, y + h, x, y + h);
    ctx.quadraticCurveTo(x - w * 0.9, y + h, x - w, y - 0.6);
    ctx.closePath();
    ctx.fillStyle = '#6b2737';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#ff8f9e';
    ellipse(ctx, x, y + h * 0.95, w * 0.7, h * 0.45);
    ctx.fill();
    ctx.restore();
    ctx.stroke();
  };
  if (open > 0.08) {
    const base = m === 'surprised' ? 2.2 : m === 'happy' ? 3.4 : 2.6;
    drawOpen(base + open * 0.6, 1.2 + open * 2.8);
    return;
  }
  switch (m) {
    case 'happy':
      drawOpen(3.6, 3.4);
      return;
    case 'surprised':
      ellipse(ctx, x, y + 0.6, 1.7, 2.2);
      ctx.fillStyle = '#6b2737';
      ctx.fill();
      ctx.stroke();
      return;
    case 'worried': {
      ctx.beginPath();
      ctx.moveTo(x - 3, y + 0.8);
      ctx.quadraticCurveTo(x - 1.5, y - 0.6, x, y + 0.6);
      ctx.quadraticCurveTo(x + 1.5, y + 1.6, x + 3, y + 0.2);
      ctx.stroke();
      return;
    }
    case 'thinking':
      ctx.beginPath();
      ctx.moveTo(x - 2, y + 0.6);
      ctx.quadraticCurveTo(x + 0.5, y + 1.3, x + 2.4, y - 0.2);
      ctx.stroke();
      return;
    case 'proud':
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 0.2);
      ctx.quadraticCurveTo(x + 0.5, y + 2.8, x + 3.6, y - 1.4);
      ctx.stroke();
      return;
    case 'sleepy': {
      const b = p.reduceMotion ? 1 : 0.85 + 0.15 * Math.sin(t * 1.6);
      ellipse(ctx, x, y + 0.6, 1.1 * b, 1.4 * b);
      ctx.fillStyle = '#6b2737';
      ctx.fill();
      ctx.stroke();
      return;
    }
    case 'neutral':
    default:
      ctx.beginPath();
      ctx.moveTo(x - 2.6, y - 0.2);
      ctx.quadraticCurveTo(x, y + 2.2, x + 2.6, y - 0.2);
      ctx.stroke();
  }
}

function sweat(ctx: CanvasRenderingContext2D, p: DoctorPose): void {
  if (p.mood === 'worried') {
    // a sweat drop
    ctx.fillStyle = 'rgba(190,235,255,0.95)';
    ctx.strokeStyle = 'rgba(40,110,150,0.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-18, -70);
    ctx.quadraticCurveTo(-15.5, -65, -16.6, -63.6);
    ctx.quadraticCurveTo(-18.2, -62.4, -19.4, -64);
    ctx.quadraticCurveTo(-20, -65.5, -18, -70);
    ctx.fill();
    ctx.stroke();
  }
}

function head(ctx: CanvasRenderingContext2D, s: DoctorSpec, p: DoctorPose, t: number): void {
  const warm = p.warm ?? 1;
  // Ears.
  for (const side of [-1, 1]) {
    ellipse(ctx, side * 19.6, -56.5, 3.3, 4.1);
    outlineFill(ctx, s.skin);
    ctx.fillStyle = s.skinShade;
    ellipse(ctx, side * 19.8, -56.3, 1.5, 2.2);
    ctx.fill();
  }
  // Face: a soft squircle, lit warm from the upper right, a cool bounce below.
  const fg = ctx.createRadialGradient(6, -66, 2, 0, -58, 24);
  fg.addColorStop(0, mix(s.skin, '#fff3dc', 0.25 * warm));
  fg.addColorStop(0.6, s.skin);
  fg.addColorStop(1, s.skinShade);
  ellipse(ctx, 0, -59.5, 20.2, 18.6);
  outlineFill(ctx, fg);
  // Cyan bounce light from the dish along the jaw.
  ctx.save();
  ellipse(ctx, 0, -59.5, 20.2, 18.6);
  ctx.clip();
  const cg = ctx.createLinearGradient(0, -48, 0, -40);
  cg.addColorStop(0, 'rgba(91,192,235,0)');
  cg.addColorStop(1, 'rgba(91,192,235,0.28)');
  ctx.fillStyle = cg;
  ctx.fillRect(-21, -50, 42, 12);
  ctx.restore();
  // Cheeks.
  for (const side of [-1, 1]) {
    const a = p.mood === 'happy' || p.mood === 'proud' ? 0.55 : p.mood === 'worried' ? 0.25 : 0.4;
    glow(ctx, side * 12.4, -51.8, 4.6, BLUSH, a);
  }
  if (s.freckles) {
    ctx.fillStyle = 'rgba(150,80,50,0.45)';
    for (const [fx, fy] of [
      [-13.5, -53.6],
      [-11.4, -52.4],
      [-12.6, -50.8],
      [13.5, -53.6],
      [11.4, -52.4],
      [12.6, -50.8],
    ]) {
      circle(ctx, fx, fy, 0.48);
      ctx.fill();
    }
  }
  // Nose: a tiny warm dot.
  ctx.fillStyle = s.skinShade;
  ellipse(ctx, 0.4, -53.2, 1, 0.75);
  ctx.fill();
  eyes(ctx, s, p, t);
  brows(ctx, s, p.mood);
  mouth(ctx, p, t);
}

/** Blend two #rrggbb colours. */
export function mix(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const c = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
}

// ───────────────────────────── accessories ─────────────────────────────

function glasses(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#3b2a26';
  ctx.lineWidth = 1.25;
  for (const side of [-1, 1]) {
    circle(ctx, side * 7.6, -57, 5.4);
    ctx.fillStyle = 'rgba(255,240,215,0.16)';
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(side * 7.6, -57, 4.2, Math.PI * 1.15, Math.PI * 1.45);
    ctx.stroke();
    ctx.strokeStyle = '#3b2a26';
    ctx.lineWidth = 1.25;
  }
  ctx.beginPath();
  ctx.moveTo(-2.3, -57.6);
  ctx.quadraticCurveTo(0, -59.2, 2.3, -57.6);
  ctx.stroke();
}

function goggles(ctx: CanvasRenderingContext2D, color: string): void {
  // Strap across the hair, two round lenses pushed up on the forehead.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 4.4;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.ellipse(0, -66, 21.4, 9, 0, Math.PI * 1.03, Math.PI * 1.97);
  ctx.stroke();
  ctx.strokeStyle = '#3d4a5c';
  ctx.lineWidth = 2.6;
  ctx.stroke();
  for (const side of [-1, 1]) {
    circle(ctx, side * 7.4, -74, 5.6);
    outlineFill(ctx, color);
    const lg = ctx.createRadialGradient(side * 7.4 - 1.5, -75.5, 0.5, side * 7.4, -74, 4.2);
    lg.addColorStop(0, 'rgba(230,252,255,0.95)');
    lg.addColorStop(1, 'rgba(91,192,235,0.85)');
    circle(ctx, side * 7.4, -74, 3.9);
    ctx.fillStyle = lg;
    ctx.fill();
    ctx.strokeStyle = INK_SOFT;
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.fillRect(-2, -75, 4, 2);
}

function beanie(ctx: CanvasRenderingContext2D, color: string, t: number, rm: boolean): void {
  const dark = mix(color, '#1a2233', 0.35);
  ctx.beginPath();
  ctx.moveTo(-21.5, -64);
  ctx.bezierCurveTo(-22, -84, -10, -88, 0, -88);
  ctx.bezierCurveTo(10, -88, 22, -84, 21.5, -64);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -88, 0, -64);
  g.addColorStop(0, mix(color, '#ffffff', 0.15));
  g.addColorStop(1, color);
  outlineFill(ctx, g);
  // Knit ribs.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.9;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 5.2, -69);
    ctx.quadraticCurveTo(i * 4.2, -80, i * 2.2, -86);
    ctx.stroke();
  }
  // Folded brim.
  ctx.beginPath();
  ctx.moveTo(-22.5, -70.5);
  ctx.quadraticCurveTo(0, -75, 22.5, -70.5);
  ctx.lineTo(22.5, -63.5);
  ctx.quadraticCurveTo(0, -67.5, -22.5, -63.5);
  ctx.closePath();
  outlineFill(ctx, mix(color, '#ffffff', 0.08));
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.8;
  for (let i = -10; i <= 10; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 2.1, -72.6 + Math.abs(i) * 0.05);
    ctx.lineTo(i * 2.1, -66 + Math.abs(i) * 0.05);
    ctx.stroke();
  }
  // Pompom (bobs).
  const bob = rm ? 0 : Math.sin(t * 2.3) * 0.9;
  circle(ctx, 0.5 + bob * 0.4, -90 + bob * 0.3, 5.2);
  outlineFill(ctx, '#f6f1e6');
  ctx.fillStyle = 'rgba(200,190,175,0.7)';
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * TAU;
    circle(ctx, 0.5 + bob * 0.4 + Math.cos(a) * 2.6, -90 + bob * 0.3 + Math.sin(a) * 2.6, 0.6);
    ctx.fill();
  }
}

function scarf(ctx: CanvasRenderingContext2D, color: string, t: number, rm: boolean): void {
  const dark = mix(color, '#3a1c00', 0.3);
  const flutter = rm ? 0 : Math.sin(t * 1.7) * 0.8;
  // Hanging end (over the coat, right side).
  ctx.beginPath();
  ctx.moveTo(4, -43);
  ctx.lineTo(11, -43);
  ctx.lineTo(12.5 + flutter, -27);
  ctx.lineTo(5.5 + flutter, -27.5);
  ctx.closePath();
  outlineFill(ctx, color);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.9;
  for (const y of [-32, -29.5]) {
    ctx.beginPath();
    ctx.moveTo(5.3 + flutter * 0.9, y);
    ctx.lineTo(12.3 + flutter * 0.9, y + 0.2);
    ctx.stroke();
  }
  // Fringe.
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(6.4 + i * 1.8 + flutter, -27.4);
    ctx.lineTo(6.4 + i * 1.8 + flutter * 1.2, -25.4);
    ctx.stroke();
  }
  // Wrap around the neck.
  ctx.beginPath();
  ctx.moveTo(-13.5, -46);
  ctx.quadraticCurveTo(0, -38, 13.5, -46);
  ctx.lineTo(13, -40.5);
  ctx.quadraticCurveTo(0, -32.5, -13, -40.5);
  ctx.closePath();
  outlineFill(ctx, color);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-11, -42.6);
  ctx.quadraticCurveTo(0, -36.4, 11, -42.6);
  ctx.stroke();
}

function stethoscope(ctx: CanvasRenderingContext2D): void {
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.6;
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(-9, -44);
    ctx.quadraticCurveTo(-10, -34, -5, -31);
    ctx.moveTo(9, -44);
    ctx.quadraticCurveTo(11, -36, 9, -30);
    ctx.quadraticCurveTo(8, -26, 10.5, -24);
  };
  path();
  ctx.stroke();
  ctx.strokeStyle = '#4a7fa8';
  ctx.lineWidth = 1.4;
  path();
  ctx.stroke();
  circle(ctx, 11, -22.5, 2.8);
  outlineFill(ctx, '#d6dde6');
  circle(ctx, 11, -22.5, 1.4);
  ctx.fillStyle = '#9fb1c4';
  ctx.fill();
}

// ───────────────────────────── held items ─────────────────────────────

/** Albor's night lamp: a small brass lantern with a warm flame (the Spark's origin). */
export function drawLantern(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, t: number, rm: boolean, on = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  const fl = rm ? 1 : 1 + Math.sin(t * 7.3) * 0.06 + Math.sin(t * 13.1) * 0.04;
  glow(ctx, 0, 1, 26 * fl, '255,184,107', 0.42 * on);
  glow(ctx, 0, 1, 9, '255,236,190', 0.6 * on);
  // Handle.
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, -7.2, 3.4, Math.PI, 0);
  ctx.stroke();
  // Cap.
  ctx.beginPath();
  ctx.moveTo(-5, -5);
  ctx.lineTo(-2.4, -8);
  ctx.lineTo(2.4, -8);
  ctx.lineTo(5, -5);
  ctx.closePath();
  outlineFill(ctx, '#c9953c', 1);
  // Glass.
  ctx.beginPath();
  ctx.roundRect(-4.4, -5, 8.8, 10, 2);
  const g = ctx.createRadialGradient(0, 1, 0.5, 0, 1, 6);
  g.addColorStop(0, `rgba(255,248,220,${0.95 * on + 0.05})`);
  g.addColorStop(1, `rgba(255,170,80,${0.55 * on + 0.1})`);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.stroke();
  // Flame.
  if (on > 0.05) {
    ctx.fillStyle = `rgba(255,214,102,${on})`;
    ctx.beginPath();
    ctx.moveTo(0, -2.8 * fl);
    ctx.quadraticCurveTo(1.8, 0.5, 0, 2);
    ctx.quadraticCurveTo(-1.8, 0.5, 0, -2.8 * fl);
    ctx.fill();
  }
  // Base.
  ctx.beginPath();
  ctx.roundRect(-5.2, 5, 10.4, 2.6, 1);
  outlineFill(ctx, '#c9953c', 1);
  ctx.restore();
}

function clipboard(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.roundRect(x - 8, y - 9, 16, 19, 2);
  outlineFill(ctx, '#b98552');
  ctx.beginPath();
  ctx.rect(x - 6, y - 6.5, 12, 15);
  ctx.fillStyle = '#fbf6ea';
  ctx.fill();
  ctx.strokeStyle = 'rgba(70,110,150,0.6)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(x - 4.5, y - 3.5 + i * 3);
    ctx.lineTo(x + (i === 3 ? 0 : 4.5), y - 3.5 + i * 3);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.roundRect(x - 3.5, y - 10.5, 7, 3.4, 1);
  outlineFill(ctx, '#aeb8c4', 1);
}

function notebook(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.beginPath();
  ctx.roundRect(x - 10, y - 6, 20, 13, 1.8);
  outlineFill(ctx, '#2f5d63');
  ctx.beginPath();
  ctx.moveTo(x - 9, y - 5);
  ctx.lineTo(x, y - 4);
  ctx.lineTo(x + 9, y - 5);
  ctx.lineTo(x + 9, y + 5.5);
  ctx.lineTo(x, y + 6.5);
  ctx.lineTo(x - 9, y + 5.5);
  ctx.closePath();
  ctx.fillStyle = '#fbf3df';
  ctx.fill();
  ctx.strokeStyle = INK_SOFT;
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y - 4);
  ctx.lineTo(x, y + 6.5);
  ctx.stroke();
  // A tiny Orbium sketch in cyan ink on the left page.
  ctx.strokeStyle = '#2f9fd8';
  ctx.lineWidth = 0.7;
  circle(ctx, x - 4.6, y + 0.8, 2.2);
  ctx.stroke();
  circle(ctx, x - 4.6, y + 0.8, 1);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(70,90,120,0.55)';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x + 1.5, y - 1.6 + i * 2.4);
    ctx.lineTo(x + 7.5, y - 1.4 + i * 2.4);
    ctx.stroke();
  }
}

function mug(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, rm: boolean): void {
  ctx.beginPath();
  ctx.roundRect(x - 5, y - 6, 10, 11, 2.2);
  outlineFill(ctx, '#e9eef5');
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x + 5.5, y - 0.5, 2.6, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.fillStyle = '#5bc0eb';
  ctx.fillRect(x - 5, y - 2, 10, 2.2);
  if (!rm) {
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 0.9;
    for (const dx of [-1.6, 1.6]) {
      ctx.beginPath();
      const ph = t * 2 + dx;
      ctx.moveTo(x + dx, y - 7);
      ctx.quadraticCurveTo(x + dx + Math.sin(ph) * 1.5, y - 10, x + dx, y - 13);
      ctx.stroke();
    }
  }
}

function suitcase(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.roundRect(x - 3.5, y - 2, 7, 4, 1.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.roundRect(x - 10, y + 1.5, 20, 15, 2.6);
  outlineFill(ctx, '#c0563a');
  ctx.fillStyle = '#e8b04a';
  ctx.fillRect(x - 6.5, y + 1.5, 2.2, 15);
  ctx.fillRect(x + 4.3, y + 1.5, 2.2, 15);
  // A sticker: a little Orbium.
  circle(ctx, x - 0.2, y + 10, 2.6);
  ctx.fillStyle = '#e8f7ff';
  ctx.fill();
  ctx.strokeStyle = '#2f9fd8';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

// ───────────────────────────── body ─────────────────────────────

function coat(ctx: CanvasRenderingContext2D, s: DoctorSpec): void {
  const c = s.coat ?? COAT;
  const g = ctx.createLinearGradient(-20, -44, 20, -12);
  g.addColorStop(0, mix(c, COAT_SHADE, 0.55));
  g.addColorStop(0.55, c);
  g.addColorStop(1, mix(c, '#fff1dd', 0.35));
  ctx.beginPath();
  ctx.moveTo(-8, -45);
  ctx.quadraticCurveTo(-15, -45, -16.5, -38.5);
  ctx.lineTo(-20, -15.5);
  ctx.quadraticCurveTo(-20.3, -12, -16.5, -12);
  ctx.lineTo(16.5, -12);
  ctx.quadraticCurveTo(20.3, -12, 20, -15.5);
  ctx.lineTo(16.5, -38.5);
  ctx.quadraticCurveTo(15, -45, 8, -45);
  ctx.closePath();
  outlineFill(ctx, g);
  // The sweater in the V.
  ctx.beginPath();
  ctx.moveTo(-8, -45);
  ctx.lineTo(0, -29.5);
  ctx.lineTo(8, -45);
  ctx.closePath();
  ctx.fillStyle = s.sweater;
  ctx.fill();
  // Lapels.
  ctx.fillStyle = mix(c, '#ffffff', 0.4);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 8, -45);
    ctx.lineTo(side * 11, -39);
    ctx.lineTo(side * 6.5, -38);
    ctx.lineTo(0, -29.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // Centre seam + buttons.
  ctx.strokeStyle = INK_SOFT;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(0, -29.5);
  ctx.lineTo(0, -12.5);
  ctx.stroke();
  ctx.fillStyle = '#b8c6d6';
  for (const y of [-25, -19]) {
    circle(ctx, 1.9, y, 0.95);
    ctx.fill();
  }
  // Breast pocket with a cyan pen and a lab badge.
  ctx.strokeStyle = INK_SOFT;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-14, -31);
  ctx.lineTo(-7, -31);
  ctx.lineTo(-7.4, -26);
  ctx.lineTo(-13.6, -26);
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = '#5bc0eb';
  ctx.fillRect(-12.2, -34, 1.5, 3.4);
  ctx.fillStyle = '#ffb86b';
  ctx.fillRect(-10, -33.2, 1.3, 2.6);
  // Hem pockets.
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(side * 6, -20.5);
    ctx.lineTo(side * 15.5, -20.5);
    ctx.stroke();
  }
}

function legs(ctx: CanvasRenderingContext2D, t: number, walk: boolean, rm: boolean): void {
  const step = walk && !rm ? Math.sin(t * 6.5) : 0;
  for (const side of [-1, 1]) {
    const lift = walk ? Math.max(0, step * side) * 2.4 : 0;
    const x = side * 6.2;
    ctx.beginPath();
    ctx.roundRect(x - 3.6, -14, 7.2, 11 - lift, 2.5);
    outlineFill(ctx, '#33405a');
    // Boot.
    ctx.beginPath();
    ctx.moveTo(x - 4.6, -lift);
    ctx.lineTo(x - 4.6, -4.5 - lift);
    ctx.quadraticCurveTo(x - 4.6, -6.5 - lift, x - 2, -6.5 - lift);
    ctx.lineTo(x + 2.5, -6.5 - lift);
    ctx.quadraticCurveTo(x + 5.6 * 1, -6 - lift, x + 6 * 1, -1.8 - lift);
    ctx.quadraticCurveTo(x + 6, -lift, x + 4, -lift);
    ctx.closePath();
    outlineFill(ctx, '#7a4a32');
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(x - 4.4, -6.2 - lift, 8.6, 1.4);
  }
}

// ───────────────────────────── whole character ─────────────────────────────

interface DrawOpts {
  /** Draw legs, boots and the floor shadow. */
  full: boolean;
}

function drawCharacter(ctx: CanvasRenderingContext2D, s: DoctorSpec, p: DoctorPose, t: number, o: DrawOpts): void {
  const rm = p.reduceMotion;
  const tt = rm ? 0 : t;
  const gesture = p.gesture ?? MOOD_GESTURE[p.mood];
  const item = p.item ?? (gesture === 'hold' ? (s.item ?? 'none') : gesture === 'write' ? 'notebook' : 'none');
  const walk = gesture === 'walk';
  // Breathing, a slow sway and the talking bounce.
  const breathe = Math.sin(tt * 1.9) * 0.012;
  const sway = Math.sin(tt * 0.8) * 0.025;
  const pop = p.moodAge < 0.35 && !rm ? Math.sin((p.moodAge / 0.35) * Math.PI) * 0.06 : 0;
  const bounce = p.talking && !rm ? Math.abs(Math.sin(t * 13)) * p.talk * 1.3 : 0;
  const walkBob = walk && !rm ? Math.abs(Math.sin(t * 6.5)) * 1.6 : 0;
  ctx.save();
  if (p.flip) ctx.scale(-1, 1);
  if (o.full) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ellipse(ctx, 0, 0.5, 17, 3.2);
    ctx.fill();
    legs(ctx, t, walk, rm);
  }
  ctx.translate(0, -walkBob);
  // Upper body squash (pop) and breath, anchored at the waist.
  ctx.translate(0, -12);
  ctx.scale(1 + pop * 0.6 - breathe * 0.5, 1 - pop + breathe);
  ctx.translate(0, 12);
  const arms = armPose(gesture, t, rm, p.talk);
  if (s.hairStyle === 'bob' || s.hairStyle === 'curly') hairBack(ctx, s);
  coat(ctx, s);
  if (s.stethoscope) stethoscope(ctx);
  if (s.scarf) scarf(ctx, s.scarf, t, rm);
  const sleeve = s.coat ?? COAT;
  const drawArm = (a: [[number, number], [number, number]], side: -1 | 1) => {
    limb(ctx, [[side * 14.5, -40], a[0], a[1]], 7, mix(sleeve, COAT_SHADE, 0.25));
    hand(ctx, a[1][0], a[1][1], s);
  };
  if (!arms.front) {
    // Items held between the hands go behind the hands.
    drawItem(ctx, item, arms, t, rm);
    drawArm(arms.l, -1);
    drawArm(arms.r, 1);
  }
  // Head (tilts a little; bounces when talking).
  ctx.save();
  ctx.translate(0, -44 - bounce);
  ctx.rotate(sway * (p.mood === 'thinking' ? 2.2 : 1) + (p.mood === 'sleepy' ? 0.1 : 0));
  ctx.translate(0, 44);
  if (s.hairStyle !== 'bob' && s.hairStyle !== 'curly') hairBack(ctx, s);
  head(ctx, s, p, t);
  hairFront(ctx, s, t, rm);
  if (s.beanie) beanie(ctx, s.beanie, t, rm);
  if (s.goggles) goggles(ctx, s.goggles);
  if (s.glasses) glasses(ctx);
  sweat(ctx, p);
  if (p.mood === 'thinking' && !rm) {
    // A little thought bubble trio.
    const k = (t * 0.8) % 1;
    ctx.fillStyle = `rgba(255,255,255,${0.75 - k * 0.3})`;
    circle(ctx, 22, -76, 1.2);
    ctx.fill();
    circle(ctx, 25.5, -81, 1.8);
    ctx.fill();
    circle(ctx, 30, -87, 2.6);
    ctx.fill();
  }
  if (p.mood === 'happy' || p.mood === 'proud') twinkle(ctx, -24, -80, 3.2, '#ffd166', rm ? 0.9 : 0.55 + 0.45 * Math.sin(t * 3));
  if (p.mood === 'surprised') {
    ctx.strokeStyle = 'rgba(255,214,102,0.9)';
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    for (const a of [-2.3, -1.9, -1.5]) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 25, -62 + Math.sin(a) * 25);
      ctx.lineTo(Math.cos(a) * 30, -62 + Math.sin(a) * 30);
      ctx.stroke();
    }
  }
  if (p.mood === 'sleepy' && !rm) {
    ctx.fillStyle = 'rgba(201,209,255,0.85)';
    ctx.font = '600 7px Inter, system-ui, sans-serif';
    const k = (t * 0.5) % 1;
    ctx.globalAlpha = 1 - k;
    ctx.fillText('z', 18 + k * 6, -74 - k * 10);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (arms.front) {
    drawArm(arms.l, -1);
    drawArm(arms.r, 1);
  }
  ctx.restore();
}

function drawItem(ctx: CanvasRenderingContext2D, item: HeldItem, arms: ArmPose, t: number, rm: boolean): void {
  const hx = (arms.l[1][0] + arms.r[1][0]) / 2;
  const hy = (arms.l[1][1] + arms.r[1][1]) / 2;
  switch (item) {
    case 'lantern':
      // Between both hands when holding it up; hanging from the left hand otherwise.
      if (Math.abs(arms.l[1][0] - arms.r[1][0]) > 16) drawLantern(ctx, arms.l[1][0], arms.l[1][1] + 10, 1, t, rm);
      else drawLantern(ctx, hx, hy + 4, 1, t, rm);
      return;
    case 'clipboard':
      clipboard(ctx, hx, hy - 1);
      return;
    case 'notebook':
    {
      notebook(ctx, -1.5, -27);
      // The pen in the right hand.
      const [px, py] = arms.r[1];
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(px + 1, py - 1);
      ctx.lineTo(px + 5, py - 6);
      ctx.stroke();
      ctx.strokeStyle = '#ffb86b';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      return;
    }
    case 'mug':
      mug(ctx, hx, hy - 2, t, rm);
      return;
    case 'suitcase':
      suitcase(ctx, arms.r[1][0] + 1, arms.r[1][1] + 1);
      return;
    case 'none':
    default:
  }
}

/** A whole character with the feet at (x, y), `k` pixels per character unit. */
export function drawDoctorAt(ctx: CanvasRenderingContext2D, spec: DoctorSpec, pose: DoctorPose, t: number, x: number, y: number, k: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(k, k);
  drawCharacter(ctx, spec, pose, t, { full: true });
  ctx.restore();
}

/** Head and shoulders framed in the 100 × 100 portrait box (the dialogue's portrait). */
export function drawDoctorBust(ctx: CanvasRenderingContext2D, spec: DoctorSpec, pose: DoctorPose, t: number): void {
  ctx.save();
  ctx.translate(50, 44 + 60 * 1.12);
  ctx.scale(1.12, 1.12);
  drawCharacter(ctx, spec, pose, t, { full: false });
  ctx.restore();
}
