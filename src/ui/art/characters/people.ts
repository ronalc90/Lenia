/**
 * Who is who at Estación Vigilia (docs/STORY.md §2, docs/ARTE.md §6.6), as `DoctorSpec`s, plus the
 * dialogue portraits that use them:
 *
 *  ALBOR   the former lead scientist. Dark bob with a silver streak, round glasses, freckles, a teal
 *          sweater and her mustard scarf under the lab coat. She carries the night lamp that the
 *          Choir learned to imitate (the Spark). On tape: a warm sepia memory with a cassette whose
 *          reels turn while she talks. Live (secret ending): in full colour, the dawn behind her.
 *  YOU     the night-shift scientist, three looks the player picks in the intro (curls + goggles,
 *          beanie + stethoscope, bun + glasses). The journal voice: writes in a notebook.
 */
import { glow } from '../vela';
import { drawDoctorBust, type DoctorMood, type DoctorPose, type DoctorSpec, type Gesture } from './doctor';

const TAU = Math.PI * 2;

export const ALBOR: DoctorSpec = {
  id: 'albor',
  skin: '#f2c7a2',
  skinShade: '#d99c78',
  hair: '#3a2820',
  hairShade: '#22160f',
  hairStyle: 'bob',
  streak: true,
  iris: '#8a5a2b',
  sweater: '#2f6f73',
  glasses: true,
  scarf: '#e0a83e',
  freckles: true,
  item: 'lantern',
  lashes: true,
};

export type PlayerLookId = 'curls' | 'beanie' | 'bun';
export const PLAYER_LOOK_IDS: readonly PlayerLookId[] = ['curls', 'beanie', 'bun'];

export const PLAYER_LOOKS: Record<PlayerLookId, DoctorSpec> = {
  curls: {
    id: 'curls',
    skin: '#c98d62',
    skinShade: '#a86e48',
    hair: '#3b2418',
    hairShade: '#24150d',
    hairStyle: 'curly',
    iris: '#5a3a1e',
    sweater: '#ff7a5c',
    goggles: '#3d4a5c',
    item: 'clipboard',
  },
  beanie: {
    id: 'beanie',
    skin: '#f7d6bd',
    skinShade: '#e2aa8c',
    hair: '#c9682e',
    hairShade: '#9a4a1c',
    hairStyle: 'short',
    iris: '#3f7fa8',
    sweater: '#2c3e66',
    beanie: '#5bc0eb',
    stethoscope: true,
    freckles: true,
    item: 'mug',
  },
  bun: {
    id: 'bun',
    skin: '#e3b088',
    skinShade: '#c28a64',
    hair: '#1e1a22',
    hairShade: '#0f0c12',
    hairStyle: 'bun',
    iris: '#4a3322',
    sweater: '#8c6fd8',
    glasses: true,
    stethoscope: true,
    item: 'notebook',
    lashes: true,
  },
};

export const PLAYER_LOOK_NAMES: Record<PlayerLookId, { es: string; en: string }> = {
  curls: { es: 'Rizos y gafas de lab', en: 'Curls and goggles' },
  beanie: { es: 'Gorro y estetoscopio', en: 'Beanie and stethoscope' },
  bun: { es: 'Moño y gafitas', en: 'Bun and glasses' },
};

export const LOOK_STORAGE_KEY = 'bioluma.look';
let look: PlayerLookId | null = null;

/** The player's look (picked in the intro; persisted in localStorage, never throws). */
export function getPlayerLook(): PlayerLookId {
  if (look) return look;
  try {
    const v = globalThis.localStorage?.getItem(LOOK_STORAGE_KEY);
    if (v && (PLAYER_LOOK_IDS as readonly string[]).includes(v)) look = v as PlayerLookId;
  } catch {
    /* storage blocked */
  }
  return look ?? 'curls';
}

export function setPlayerLook(id: PlayerLookId): void {
  look = id;
  try {
    globalThis.localStorage?.setItem(LOOK_STORAGE_KEY, id);
  } catch {
    /* storage blocked */
  }
}

export function playerSpec(id: PlayerLookId = getPlayerLook()): DoctorSpec {
  return PLAYER_LOOKS[id];
}

/** Story moods (VELA's vocabulary) → a doctor's face. */
export function doctorMood(m: string): DoctorMood {
  switch (m) {
    case 'awed':
      return 'surprised';
    case 'happy':
    case 'surprised':
    case 'worried':
    case 'thinking':
    case 'proud':
    case 'sleepy':
      return m;
    default:
      return 'neutral';
  }
}

/** What a dialogue portrait needs (a subset of PortraitState). */
export interface PeoplePose {
  mood: string;
  moodAge: number;
  talk: number;
  talking: boolean;
  blink: number;
  live: boolean;
  reduceMotion: boolean;
  gesture?: Gesture;
}

function pose(s: PeoplePose, extra: Partial<DoctorPose> = {}): DoctorPose {
  return {
    mood: doctorMood(s.mood),
    moodAge: s.moodAge,
    talk: s.talk,
    talking: s.talking,
    blink: s.blink,
    reduceMotion: s.reduceMotion,
    gesture: s.gesture,
    ...extra,
  };
}

/** A small cassette (the tape is playing): reels turn faster while she talks. */
export function drawCassette(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, t: number, talking: boolean, rm: boolean): void {
  const h = w * 0.64;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, w * 0.08);
  ctx.fillStyle = '#efe3c8';
  ctx.fill();
  ctx.strokeStyle = '#2a2130';
  ctx.lineWidth = w * 0.045;
  ctx.stroke();
  // Label.
  ctx.fillStyle = '#ffb86b';
  ctx.fillRect(-w * 0.4, -h * 0.4, w * 0.8, h * 0.22);
  ctx.strokeStyle = '#6b4b2a';
  ctx.lineWidth = w * 0.02;
  ctx.beginPath();
  ctx.moveTo(-w * 0.32, -h * 0.29);
  for (let i = 0; i < 8; i++) ctx.lineTo(-w * 0.3 + i * w * 0.07, -h * 0.31 + (i % 2) * h * 0.06);
  ctx.stroke();
  // Window + reels.
  ctx.beginPath();
  ctx.roundRect(-w * 0.32, -h * 0.08, w * 0.64, h * 0.34, h * 0.12);
  ctx.fillStyle = '#2a2420';
  ctx.fill();
  const spin = rm ? 0 : t * (talking ? 5 : 0.9);
  for (const [rx, r] of [
    [-w * 0.18, h * 0.13],
    [w * 0.18, h * 0.1],
  ] as const) {
    ctx.fillStyle = '#5a3a24';
    ctx.beginPath();
    ctx.arc(rx, h * 0.09, r * 1.2, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(rx, h * 0.09);
    ctx.rotate(spin);
    ctx.fillStyle = '#efe6d2';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2a2420';
    for (let k = 0; k < 3; k++) {
      ctx.rotate(TAU / 3);
      ctx.fillRect(-r * 0.1, r * 0.2, r * 0.2, r * 0.42);
    }
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Albor in the dialogue. On tape: inside a warm, slightly sepia memory with soft scanlines and the
 * cassette in the corner. Live: in full colour with the first dawn behind her.
 */
export function drawAlborPortrait(ctx: CanvasRenderingContext2D, s: PeoplePose, t: number): void {
  const rm = s.reduceMotion;
  if (s.live) {
    glow(ctx, 50, 104, 64, '255,150,110', 0.55);
    glow(ctx, 50, 96, 44, '255,214,160', 0.6);
    glow(ctx, 50, 40, 38, '255,236,200', 0.22);
    drawDoctorBust(ctx, ALBOR, pose(s, { warm: 1.2 }), t);
    return;
  }
  // The memory: a warm round vignette (the lamp she carried).
  glow(ctx, 50, 52, 54, '255,170,90', 0.32);
  glow(ctx, 50, 40, 30, '255,226,180', 0.18);
  drawDoctorBust(ctx, ALBOR, pose(s, { gesture: s.gesture ?? (s.mood === 'neutral' ? 'hold' : undefined) }), t);
  // Tape look: a sepia wash and drifting scanlines (static under Reduce motion).
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(255,170,90,0.14)';
  ctx.fillRect(0, 0, 100, 100);
  ctx.fillStyle = 'rgba(40,20,10,0.08)';
  const off = rm ? 0 : (t * 6) % 3;
  for (let y = off; y < 100; y += 3) ctx.fillRect(0, y, 100, 1);
  ctx.restore();
  drawCassette(ctx, 80, 86, 24, t, s.talking, rm);
}

/** You (the journal voice): your chosen look, writing in the field notebook when you "speak". */
export function drawYouPortrait(ctx: CanvasRenderingContext2D, s: PeoplePose, t: number, lookId: PlayerLookId = getPlayerLook()): void {
  glow(ctx, 62, 40, 44, '255,184,107', 0.16);
  glow(ctx, 40, 96, 44, '91,192,235', 0.16);
  const m = doctorMood(s.mood);
  const g: Gesture | undefined = s.gesture ?? (m === 'neutral' ? 'write' : undefined);
  drawDoctorBust(ctx, playerSpec(lookId), pose(s, { gesture: g }), t);
}
