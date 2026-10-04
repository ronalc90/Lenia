import { describe, expect, it } from 'vitest';
import {
  ABYSS_UNLOCK,
  BASEMENT_UNLOCK,
  BONUS_CAP,
  SECRET_DEFS,
  SECRET_IDS,
  TOTAL_SECRETS,
} from './data';
import { isPalindromeNumber, normalizeName, STORAGE_KEY } from './secrets';
import { creature, curves, fakeWorld, GLIDER_PATH, handDrawn, memoryStorage, seededRng, species } from './testUtil';
import type { SecretId } from './types';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

/** Straight stroke in grid cells. */
function swipe(dir: 'up' | 'down' | 'left' | 'right', x = 96, y = 120, len = 30) {
  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  return Array.from({ length: 12 }, (_, i) => ({ x: x + (d[0] * len * i) / 11, y: y + (d[1] * len * i) / 11, t: i * 16 }));
}

describe('hidden species', () => {
  it('registering Orbium ignis, phantasma or the cryptid reveals each secret once', () => {
    const w = fakeWorld();
    w.setView({ species: [species('a', 'Orbium unicaudatus'), species('b', 'Gyrorbium gyrans')] });
    w.advance(5);
    expect(w.log.found).toHaveLength(0);
    w.setView({ species: [species('a', 'Orbium unicaudatus'), species('b', 'Orbium unicaudatus ignis')] });
    w.advance(1);
    expect(w.foundIds()).toEqual(['ignis']);
    expect(w.log.unlockCosmetic.map((c) => c.id)).toContain('ember');
    w.setView({ species: [...w.view.species, species('c', 'Orbium phantasma'), species('d', 'Pyroscutium ambiguus')] });
    w.bus.emit('speciesNew', { speciesId: 'c', name: 'x', rarity: 'rare', x: 0, y: 0 });
    expect(w.foundIds()).toEqual(['ignis', 'phantasma', 'cryptid']);
    w.advance(3);
    expect(w.log.found).toHaveLength(3);
    expect(w.log.grantJournal.map((j) => j.id)).toEqual(['secret.ignis', 'secret.phantasma', 'secret.cryptid']);
  });
});

describe('homages', () => {
  it('naming a species after Bert Chan or Lenia (any case, accents, spaces) is a thank-you', () => {
    for (const name of ['Chan', '  bert   CHAN ', 'Lénia', '«Lenia»', 'Orbium lenia']) {
      const w = fakeWorld();
      w.secrets.onSpeciesRenamed(name);
      expect(w.foundIds(), name).toEqual(['chan']);
      expect(w.log.effect.some((e) => e.kind === 'whisper')).toBe(true);
    }
    const w = fakeWorld();
    for (const name of ['Chandra', 'Bertha', 'Leniadora', 'Orbium']) w.secrets.onSpeciesRenamed(name);
    expect(w.log.found).toHaveLength(0);
  });

  it('a glider drawn with the brush, or the name Conway, salutes the Game of Life', () => {
    const rng = seededRng(4);
    const w = fakeWorld();
    w.secrets.onBrushPath(handDrawn(curves.poly(GLIDER_PATH), rng, { size: 24, rot: Math.PI / 2, noise: 0.02 }));
    expect(w.foundIds()).toEqual(['conway']);
    expect(w.log.effect.some((e) => e.kind === 'glider')).toBe(true);
    const w2 = fakeWorld();
    w2.secrets.onSpeciesRenamed('Conway');
    expect(w2.foundIds()).toEqual(['conway']);
  });

  it('the 42nd manual seed is the answer; auto-seeds do not count', () => {
    const w = fakeWorld();
    for (let i = 0; i < 100; i++) w.bus.emit('seed', { x: 1, y: 1, cost: 1, manual: false });
    for (let i = 0; i < 41; i++) w.bus.emit('seed', { x: 1, y: 1, cost: 1, manual: true });
    expect(w.log.found).toHaveLength(0);
    w.bus.emit('seed', { x: 1, y: 1, cost: 1, manual: true });
    expect(w.foundIds()).toEqual(['answer']);
  });

  it('ten explosions within two minutes make a maximizer; spread out they do not', () => {
    const w = fakeWorld();
    for (let i = 0; i < 10; i++) {
      w.bus.emit('creatureExploded', { id: i, x: 0, y: 0 });
      w.jump(30);
    }
    expect(w.log.found).toHaveLength(0);
    for (let i = 0; i < 10; i++) {
      w.bus.emit('creatureExploded', { id: i, x: 0, y: 0 });
      w.jump(10);
    }
    expect(w.foundIds()).toEqual(['maximizer']);
  });

  it('seven golden sparks in a row without a miss; a miss resets the streak (also across reloads)', () => {
    const storage = memoryStorage();
    const w = fakeWorld({ storage });
    const catchOne = () => w.bus.emit('goldenCollected', { x: 0, y: 0, reward: { es: '', en: '' } });
    for (let i = 0; i < 6; i++) catchOne();
    w.bus.emit('goldenMissed', {});
    for (let i = 0; i < 6; i++) catchOne();
    expect(w.log.found).toHaveLength(0);
    // Reload: the streak (6) survives.
    const w2 = fakeWorld({ storage });
    w2.bus.emit('goldenCollected', { x: 0, y: 0, reward: { es: '', en: '' } });
    expect(w2.foundIds()).toEqual(['goldenStreak']);
  });
});

describe('strokes on the dish', () => {
  const rng = seededRng(21);
  it('spiral, heart and infinity strokes each reveal their secret with a trace effect', () => {
    const w = fakeWorld();
    w.secrets.onBrushPath(handDrawn(curves.spiral(2.5), rng, { size: 28, rot: 1 }));
    w.secrets.onBrushPath(handDrawn(curves.heart, rng, { size: 26, start: 0.3 }, true));
    w.secrets.onBrushPath(handDrawn(curves.infinity, rng, { size: 30, rot: 0.2 }, true));
    expect(w.foundIds()).toEqual(['spiral', 'heart', 'infinity']);
    expect(w.log.effect.filter((e) => e.kind === 'trace')).toHaveLength(3);
  });

  it('a circle around a living creature draws a halo; around nothing it only echoes', () => {
    const w = fakeWorld();
    w.setView({ creatures: [creature(1, 40, 40)] });
    w.secrets.onBrushPath(handDrawn(curves.circle, rng, { cx: 150, cy: 180, size: 20 }, true));
    expect(w.log.found).toHaveLength(0);
    expect(w.log.effect.map((e) => e.kind)).toEqual(['trace']);
    w.secrets.onBrushPath(handDrawn(curves.circle, rng, { cx: 42, cy: 38, size: 18, overshoot: 0.05 }, true));
    expect(w.foundIds()).toEqual(['halo']);
    const halo = w.log.effect.find((e) => e.kind === 'halo');
    expect(halo && halo.kind === 'halo' && Math.hypot(halo.x - 40, halo.y - 40)).toBeLessThan(1);
  });

  it('a circle drawn across the toroidal edge still encloses the creature there', () => {
    const w = fakeWorld();
    w.setView({ creatures: [creature(1, 2, 120)] });
    const loop = handDrawn(curves.circle, rng, { cx: 2, cy: 120, size: 16, noise: 0.01, wobble: 0.01 }, true).map((p) => ({
      ...p,
      x: ((p.x % 192) + 192) % 192,
    }));
    w.secrets.onBrushPath(loop);
    expect(w.foundIds()).toEqual(['halo']);
  });

  it('ordinary sowing strokes and tiny strokes find nothing; wild scribbles almost never do', () => {
    const w = fakeWorld();
    const stroke = (turnNoise: number, n: number) => {
      const pts = [];
      let x = 96;
      let y = 120;
      let a = rng() * 6.28;
      for (let k = 0; k < n; k++) {
        a += (rng() - 0.5) * turnNoise;
        x += Math.cos(a) * 2;
        y += Math.sin(a) * 2;
        pts.push({ x, y, t: k * 16 });
      }
      return pts;
    };
    // Sowing: smooth wandering drags.
    for (let i = 0; i < 300; i++) w.secrets.onBrushPath(stroke(0.5, 20 + Math.floor(rng() * 50)));
    w.secrets.onBrushPath(handDrawn(curves.heart, rng, { size: 4 }, true));
    expect(w.log.found).toHaveLength(0);
    // Frantic scribbling: a rare lucky shape is acceptable (it is a secret found by chance).
    const w2 = fakeWorld();
    for (let i = 0; i < 400; i++) w2.secrets.onBrushPath(stroke(1.6, 40));
    expect(w2.log.effect.filter((e) => e.kind === 'trace').length).toBeLessThanOrEqual(8);
  });
});

describe('touches, keys and sensors', () => {
  it('the Konami code on a keyboard (wrong order does nothing)', () => {
    const w = fakeWorld();
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) w.secrets.onKey(k);
    expect(w.log.found).toHaveLength(0);
    for (const k of ['x', 'ArrowUp', ...KONAMI]) w.secrets.onKey(k);
    expect(w.foundIds()).toEqual(['konami']);
    expect(w.log.unlockCosmetic.map((c) => c.id)).toContain('phosphor');
  });

  it('the Konami code as eight straight swipes on a touch screen', () => {
    const w = fakeWorld();
    for (const d of ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'] as const) w.secrets.onBrushPath(swipe(d));
    expect(w.foundIds()).toEqual(['konami']);
  });

  it('seven quick taps on the logo wake it; slow taps do not', () => {
    const w = fakeWorld();
    for (let i = 0; i < 7; i++) {
      w.secrets.onLogoTap();
      w.jump(1.2);
    }
    expect(w.log.found).toHaveLength(0);
    for (let i = 0; i < 7; i++) {
      w.secrets.onLogoTap();
      w.jump(0.3);
    }
    expect(w.foundIds()).toEqual(['logo']);
    expect(w.log.effect.some((e) => e.kind === 'logoWake')).toBe(true);
  });

  it('holding the essence counter five seconds shows the exact number', () => {
    const w = fakeWorld();
    w.setView({ essence: 1234.5678 });
    w.secrets.onEssenceLongPress(4999);
    expect(w.log.found).toHaveLength(0);
    w.secrets.onEssenceLongPress(5000);
    expect(w.foundIds()).toEqual(['patience']);
    const wh = w.log.effect.find((e) => e.kind === 'whisper');
    expect(wh && wh.kind === 'whisper' && wh.text.en).toBe('1,234.567');
  });

  it('a shake is noticed (by us, not by the creatures)', () => {
    const w = fakeWorld();
    w.secrets.onDeviceShake();
    w.secrets.onDeviceShake();
    expect(w.foundIds()).toEqual(['shake']);
    expect(w.log.effect.filter((e) => e.kind === 'ripple')).toHaveLength(2);
  });
});

describe('patience', () => {
  it('the same creature alive for 30 minutes of active play is an old friend', () => {
    const w = fakeWorld();
    w.setView({ creatures: [creature(7, 50, 50)] });
    w.advance(29 * 60, 2);
    expect(w.log.found).toHaveLength(0);
    w.advance(62, 2);
    expect(w.foundIds()).toEqual(['oldFriend']);
  });

  it('a creature replaced halfway does not count, and hidden-tab gaps only count 5 s', () => {
    const w = fakeWorld();
    w.setView({ creatures: [creature(1, 50, 50)] });
    w.advance(20 * 60, 5);
    w.setView({ creatures: [creature(2, 50, 50)] });
    w.advance(20 * 60, 5);
    expect(w.log.found).toHaveLength(0);
    const w2 = fakeWorld();
    w2.setView({ creatures: [creature(1, 50, 50)] });
    w2.advance(10 * 60, 5); // 10 active minutes
    for (let i = 0; i < 6; i++) w2.advance(600, 600); // six 10-minute gaps (tab hidden): +5 s each
    expect(w2.log.found).toHaveLength(0);
  });

  it('a paused dish does not count as keeping a creature alive (but does count for "still there?")', () => {
    const w = fakeWorld();
    w.setView({ creatures: [creature(7, 50, 50)] });
    w.secrets.setPaused(true);
    w.advance(40 * 60, 5);
    expect(w.foundIds()).toEqual(['afk']);
    w.secrets.setPaused(false);
    w.advance(20 * 60, 5);
    expect(w.secrets.isFound('oldFriend')).toBe(false);
  });

  it('exactly seven stable creatures of seven species', () => {
    const w = fakeWorld();
    const seven = Array.from({ length: 7 }, (_, i) => creature(i, 20 + i * 20, 40 + (i % 3) * 30, { speciesId: `s${i}` }));
    w.setView({ creatures: seven.map((c, i) => ({ ...c, speciesId: `s${Math.min(i, 5)}` })) });
    w.advance(2);
    w.setView({ creatures: [...seven, creature(99, 5, 5, { speciesId: 's9' })] });
    w.advance(2);
    w.setView({ creatures: seven.map((c, i) => (i === 0 ? { ...c, state: 'born' as const } : c)) });
    w.advance(2);
    expect(w.log.found).toHaveLength(0);
    w.setView({ creatures: seven });
    w.advance(1);
    expect(w.foundIds()).toEqual(['seven']);
    const cons = w.log.effect.find((e) => e.kind === 'constellation');
    expect(cons && cons.kind === 'constellation' && cons.points).toHaveLength(7);
  });

  it('five minutes of an empty dish after having had life is silence', () => {
    const w = fakeWorld();
    w.advance(10 * 60);
    expect(w.log.found).toHaveLength(0); // never had life
    w.setView({ creatures: [creature(1, 5, 5)] });
    w.advance(3);
    w.setView({ creatures: [creature(1, 5, 5, { state: 'dead' })] });
    w.advance(4 * 60);
    w.setView({ creatures: [creature(2, 5, 5, { state: 'born' })] }); // something sprouts: reset
    w.advance(2);
    w.setView({ creatures: [] });
    w.advance(4 * 60 + 50);
    expect(w.log.found).toHaveLength(0);
    w.advance(15);
    expect(w.foundIds()).toEqual(['silence']);
  });

  it('an Extinction with nothing alive sterilises the sterile', () => {
    const w = fakeWorld();
    w.setView({ creatures: [creature(1, 5, 5)] });
    w.bus.emit('extinctionStart', { genome: 3 });
    expect(w.log.found).toHaveLength(0);
    w.setView({ creatures: [creature(1, 5, 5, { state: 'dead' })] });
    w.bus.emit('extinctionStart', { genome: 3 });
    expect(w.foundIds()).toEqual(['sterile']);
  });

  it('a palindromic essence of six digits or more, or exactly 1 234 567', () => {
    expect(isPalindromeNumber(12321)).toBe(false);
    expect(isPalindromeNumber(123321)).toBe(true);
    expect(isPalindromeNumber(1e21)).toBe(false);
    const w = fakeWorld();
    for (const e of [12321, 99999, 123456.9, 1234566.5]) {
      w.setView({ essence: e });
      w.advance(1);
    }
    expect(w.log.found).toHaveLength(0);
    w.setView({ essence: 123321.4 });
    w.advance(1);
    expect(w.foundIds()).toEqual(['palindrome']);
    expect(w.log.grantJournal[0].text.es.startsWith('123321.')).toBe(true);
    const w2 = fakeWorld();
    w2.setView({ essence: 1234567.2 });
    w2.advance(1);
    expect(w2.log.grantJournal[0].text.en.startsWith('1,234,567')).toBe(true);
  });

  it('ten minutes paused asks if you are still there', () => {
    const w = fakeWorld();
    w.secrets.setPaused(true);
    w.advance(9 * 60, 10);
    w.secrets.setPaused(false);
    w.secrets.setPaused(true);
    w.advance(9 * 60, 10);
    expect(w.log.found).toHaveLength(0);
    w.advance(70, 10);
    expect(w.foundIds()).toEqual(['afk']);
    // Also detected on resume when the poll was throttled (tab hidden).
    const w2 = fakeWorld();
    w2.secrets.setPaused(true);
    w2.jump(11 * 60);
    w2.secrets.setPaused(false);
    expect(w2.foundIds()).toEqual(['afk']);
  });
});

describe('sky', () => {
  it('playing under a full moon', () => {
    const w = fakeWorld({ start: '2025-03-14T06:00:00Z' });
    w.advance(1);
    expect(w.foundIds()).toEqual(['fullMoon']);
    expect(w.log.effect.some((e) => e.kind === 'moon')).toBe(true);
    const w2 = fakeWorld({ start: '2025-03-21T12:00:00Z' });
    w2.advance(120);
    expect(w2.log.found).toHaveLength(0);
  });

  it('birthdays: Bioluma (4 Oct) and Lenia (13 Dec) with their own journal lines', () => {
    const a = fakeWorld({ start: '2027-10-04T10:00:00' });
    a.advance(1);
    expect(a.foundIds()).toEqual(['birthday']);
    expect(a.log.grantJournal[0].text.en).toContain('birthday');
    const b = fakeWorld({ start: '2026-12-13T22:00:00' });
    b.advance(1);
    expect(b.log.grantJournal[0].text.en).toContain('2018');
    const c = fakeWorld({ start: '2027-10-05T10:00:00' });
    c.advance(60);
    expect(c.log.found).toHaveLength(0);
  });

  it('the aurora needs play time, a living dish and luck', () => {
    const three = [creature(1, 10, 10), creature(2, 100, 30), creature(3, 50, 200)];
    const early = fakeWorld({ rng: () => 0 });
    early.setView({ creatures: three, stats: { playTime: 600, totalEssence: 0, eraEssence: 0, seeds: 0, creaturesBorn: 0 } });
    early.advance(30);
    expect(early.log.found).toHaveLength(0);
    const unlucky = fakeWorld({ rng: () => 0.999 });
    unlucky.setView({ creatures: three, stats: { playTime: 3000, totalEssence: 0, eraEssence: 0, seeds: 0, creaturesBorn: 0 } });
    unlucky.advance(60);
    expect(unlucky.log.found).toHaveLength(0);
    const lucky = fakeWorld({ rng: () => 0 });
    lucky.setView({ creatures: three, stats: { playTime: 3000, totalEssence: 0, eraEssence: 0, seeds: 0, creaturesBorn: 0 } });
    lucky.advance(2);
    expect(lucky.foundIds()).toEqual(['aurora']);
    expect(lucky.log.effect.some((e) => e.kind === 'aurora')).toBe(true);
    expect(lucky.log.unlockCosmetic.map((c) => c.id)).toContain('aurora');
  });

  it("three creatures in a row, evenly spaced, for two polls: Orion's belt", () => {
    const stats = { playTime: 1200, totalEssence: 0, eraEssence: 0, seeds: 0, creaturesBorn: 0 };
    const w = fakeWorld();
    const belt = [creature(1, 40, 60), creature(2, 70, 80.5), creature(3, 100, 101), creature(4, 150, 20)];
    w.setView({ creatures: belt, stats });
    w.advance(1);
    expect(w.log.found).toHaveLength(0);
    w.advance(1);
    expect(w.foundIds()).toEqual(['orion']);
    const c = w.log.effect.find((e) => e.kind === 'constellation');
    expect(c && c.kind === 'constellation' && c.points).toHaveLength(3);
    // Uneven or bent rows are not a belt.
    const w2 = fakeWorld();
    w2.setView({ creatures: [creature(1, 40, 60), creature(2, 60, 73), creature(3, 100, 100)], stats });
    w2.advance(5);
    w2.setView({ creatures: [creature(1, 40, 60), creature(2, 70, 92), creature(3, 100, 100)], stats });
    w2.advance(5);
    expect(w2.log.found).toHaveLength(0);
  });

  it('the belt also forms across the toroidal edge', () => {
    const stats = { playTime: 1200, totalEssence: 0, eraEssence: 0, seeds: 0, creaturesBorn: 0 };
    const w = fakeWorld();
    w.setView({ creatures: [creature(1, 170, 50), creature(2, 2, 50), creature(3, 26, 50)], stats });
    w.advance(2);
    expect(w.foundIds()).toEqual(['orion']);
  });
});

describe('meta: basement, all found, bonus, cosmetics', () => {
  it('the basement opens only after ten secrets', () => {
    const w = fakeWorld();
    for (const id of SECRET_IDS.slice(0, BASEMENT_UNLOCK - 1)) w.secrets.forceFind(id);
    w.secrets.onBasementOpened();
    expect(w.secrets.isFound('basement')).toBe(false);
    expect(w.secrets.basementUnlocked()).toBe(false);
    w.secrets.forceFind(SECRET_IDS[BASEMENT_UNLOCK - 1]);
    expect(w.secrets.basementUnlocked()).toBe(true);
    expect(w.log.progress.at(-1)?.basementUnlocked).toBe(true);
    w.secrets.onBasementOpened();
    expect(w.secrets.isFound('basement')).toBe(true);
  });

  it('finding everything emits allFound once and unlocks the gilded colormap', () => {
    const w = fakeWorld();
    for (const id of SECRET_IDS) if (id !== 'konami') w.secrets.forceFind(id);
    expect(w.log.allFound).toHaveLength(0);
    for (const k of KONAMI) w.secrets.onKey(k);
    expect(w.log.allFound).toEqual([{ total: TOTAL_SECRETS }]);
    expect(w.secrets.cosmetics()).toContain('gilded');
    for (const k of KONAMI) w.secrets.onKey(k);
    expect(w.log.allFound).toHaveLength(1);
    expect(w.log.found).toHaveLength(TOTAL_SECRETS);
  });

  it('the Essence bonus is +1 % per secret and never exceeds +10 %', () => {
    const w = fakeWorld();
    expect(w.secrets.bonusMultiplier()).toBe(1);
    for (const id of SECRET_IDS.slice(0, 3)) w.secrets.forceFind(id);
    expect(w.secrets.bonusMultiplier()).toBeCloseTo(1.03, 10);
    for (const id of SECRET_IDS) w.secrets.forceFind(id);
    expect(w.secrets.bonusMultiplier()).toBeCloseTo(1 + BONUS_CAP, 10);
    expect(w.secrets.bonus()).toBeLessThanOrEqual(BONUS_CAP);
  });

  it('cosmetics: per-secret colormaps, Abyssal at five secrets, only unlocked ones can be picked', () => {
    const w = fakeWorld();
    expect(w.secrets.setColormap('ember')).toBe(false);
    w.secrets.forceFind('ignis');
    expect(w.secrets.setColormap('ember')).toBe(true);
    expect(w.log.colormap.at(-1)?.id).toBe('ember');
    expect(w.log.colormap.at(-1)?.colormap?.stops.length).toBeGreaterThan(3);
    const ids: SecretId[] = ['chan', 'logo', 'heart', 'spiral'];
    ids.slice(0, ABYSS_UNLOCK - 2).forEach((id) => w.secrets.forceFind(id));
    expect(w.secrets.cosmetics()).not.toContain('abyss');
    w.secrets.forceFind(ids[ABYSS_UNLOCK - 2]);
    expect(w.secrets.cosmetics()).toContain('abyss');
    expect(w.secrets.setColormap(null)).toBe(true);
  });

  it('hint ladders climb to the explicit tier and stop; found secrets keep theirs', () => {
    const w = fakeWorld();
    expect(w.secrets.get('heart').hintLevel).toBe(0);
    w.secrets.revealHint('heart');
    w.secrets.revealHint('heart');
    w.secrets.revealHint('heart');
    const v = w.secrets.get('heart');
    expect(v.hintLevel).toBe(2);
    expect(v.hints).toHaveLength(3);
    expect(v.hint).toEqual(SECRET_DEFS.find((d) => d.id === 'heart')!.hints[2]);
    w.secrets.forceFind('logo');
    w.secrets.revealHint('logo');
    expect(w.secrets.get('logo').hintLevel).toBe(0);
  });

  it('rumours are cryptic hints of undiscovered secrets only', () => {
    const w = fakeWorld();
    for (const id of SECRET_IDS) if (id !== 'heart' && id !== 'basement') w.secrets.forceFind(id);
    // basement is open (≥ 10 found) so both remain candidates
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++) seen.add(w.secrets.rumor()!.id);
    expect([...seen].every((id) => id === 'heart' || id === 'basement')).toBe(true);
  });
});

describe('persistence', () => {
  it('secrets survive a reload through storage', () => {
    const storage = memoryStorage();
    const a = fakeWorld({ storage });
    a.secrets.forceFind('heart');
    a.secrets.revealHint('spiral');
    expect(JSON.parse(storage.data[STORAGE_KEY]).found.heart).toBeTypeOf('number');
    const b = fakeWorld({ storage });
    expect(b.secrets.isFound('heart')).toBe(true);
    expect(b.secrets.get('spiral').hintLevel).toBe(1);
  });

  it('serialize/load merge with the main save: union, earliest discovery wins', () => {
    const a = fakeWorld({ storage: null });
    a.secrets.forceFind('heart');
    const snap = a.secrets.serialize();
    snap.found.heart = 1000;
    const b = fakeWorld({ storage: null });
    b.secrets.forceFind('spiral');
    b.secrets.load(snap);
    expect(b.secrets.isFound('heart')).toBe(true);
    expect(b.secrets.isFound('spiral')).toBe(true);
    expect(b.secrets.get('heart').foundAt).toBe(1000);
  });

  it('garbage in storage or in load() never crashes and is ignored', () => {
    const w = fakeWorld({ storage: memoryStorage({ [STORAGE_KEY]: '{not json' }) });
    expect(w.secrets.foundCount()).toBe(0);
    w.secrets.load(null);
    w.secrets.load(42);
    w.secrets.load({ found: { heart: 'yesterday', nope: 5, spiral: 7 }, cosmetics: ['ember', 'gold'], colormap: 'ember' });
    expect(w.secrets.isFound('spiral')).toBe(true);
    expect(w.secrets.isFound('heart')).toBe(false);
    expect(w.secrets.cosmetics()).toEqual([]); // ember needs ignis; repaired away
    expect(w.secrets.colormap()).toBe(null);
  });

  it('a storage that throws (private mode, quota) is survivable', () => {
    const angry = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    const w = fakeWorld({ storage: angry });
    w.secrets.forceFind('heart');
    expect(w.secrets.isFound('heart')).toBe(true);
  });

  it('reset forgets everything', () => {
    const w = fakeWorld();
    w.secrets.forceFind('heart');
    w.secrets.reset();
    expect(w.secrets.foundCount()).toBe(0);
  });
});

describe('data integrity', () => {
  it('every secret has unique id, both languages, three hints and a short companion line', () => {
    expect(new Set(SECRET_IDS).size).toBe(SECRET_IDS.length);
    expect(TOTAL_SECRETS).toBeGreaterThanOrEqual(20);
    for (const d of SECRET_DEFS) {
      for (const tx of [d.name, d.flavor, d.journal, d.companion, ...d.hints]) {
        expect(tx.es.trim().length, d.id).toBeGreaterThan(0);
        expect(tx.en.trim().length, d.id).toBeGreaterThan(0);
      }
      expect(d.hints).toHaveLength(3);
      expect(d.companion.es.split(/\s+/).length, d.id).toBeLessThanOrEqual(12);
      expect(d.companion.en.split(/\s+/).length, d.id).toBeLessThanOrEqual(12);
      expect(d.journal.es.split(/[.!?…]\s/).length, d.id).toBeLessThanOrEqual(4);
    }
  });

  it('normalises typed names', () => {
    expect(normalizeName('  «Bért  CHAN» ')).toBe('bert chan');
  });
});
