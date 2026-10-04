/**
 * A typical first ten minutes of play must not stumble on secrets, except the few that are
 * intentionally easy (a gentle first "oh, there are secrets here").
 */
import { describe, expect, it } from 'vitest';
import type { CreatureView } from '../core/types';
import { SECRET_DEFS } from './data';
import { creature, fakeWorld, seededRng, species } from './testUtil';
import type { SecretId } from './types';

const EASY = new Set<SecretId>(SECRET_DEFS.filter((d) => d.easy).map((d) => d.id));

function firstTenMinutes(seed: number, start: string) {
  const rng = seededRng(seed);
  const w = fakeWorld({ start, rng });
  const creatures: (CreatureView & { hx: number; hy: number })[] = [];
  let nextId = 1;
  let essence = 10;
  let playTime = 0;
  let seeds = 0;
  const spawn = (sp: string) => {
    const c = { ...creature(nextId++, rng() * 192, rng() * 240, { speciesId: sp, state: 'born' as const }), hx: rng() * 6.28, hy: 0 };
    creatures.push(c);
    w.bus.emit('creatureBorn', { id: c.id, x: c.x, y: c.y });
  };
  w.advance(600, 1, (s) => {
    playTime = s;
    // The player sows by hand every ~10–15 s; the dish answers.
    if (rng() < 0.08) {
      seeds++;
      w.bus.emit('seed', { x: rng() * 192, y: rng() * 240, cost: 5, manual: true });
      if (rng() < 0.45) spawn(s < 300 ? 'orbium' : rng() < 0.5 ? 'orbium' : 'gyro');
      else if (rng() < 0.3) w.bus.emit('creatureExploded', { id: 0, x: 0, y: 0 });
    }
    // Creatures mature, swim (wrapping), sometimes die.
    for (const c of creatures) {
      if (c.state === 'born' && rng() < 0.05) {
        c.state = 'stable';
        w.bus.emit('creatureStable', { id: c.id, x: c.x, y: c.y });
      }
      c.hx += (rng() - 0.5) * 0.2;
      c.x = (c.x + Math.cos(c.hx) * 3 + 192) % 192;
      c.y = (c.y + Math.sin(c.hx) * 3 + 240) % 240;
      if (c.state === 'stable' && rng() < 0.002) {
        c.state = 'dead';
        w.bus.emit('creatureDied', { id: c.id, x: c.x, y: c.y });
      }
    }
    for (let i = creatures.length - 1; i >= 0; i--) if (creatures[i].state === 'dead') creatures.splice(i, 1);
    while (creatures.length > 6) creatures.shift();
    const stable = creatures.filter((c) => c.state === 'stable').length;
    essence = Math.max(0, essence + stable * (0.5 + s / 300) - (rng() < 0.02 ? essence * 0.6 : 0));
    // Golden sparks: caught, missed, caught.
    if (s === 140 || s === 480) w.bus.emit('goldenCollected', { x: 50, y: 50, reward: { es: '', en: '' } });
    if (s === 320) w.bus.emit('goldenMissed', {});
    if (s === 360) w.bus.emit('calibrationChanged', { mu: 0.152, sigma: 0.015, R: 13, dt: 0.1 });
    // Desktop habits: a stray key, a pause, a peek at the essence breakdown, a logo tap.
    if (rng() < 0.03) w.secrets.onKey(['ArrowUp', 'ArrowDown', ' ', 'Escape', '1', 'ArrowLeft'][Math.floor(rng() * 6)]);
    if (s === 200) w.secrets.setPaused(true);
    if (s === 230) w.secrets.setPaused(false);
    if (s === 250) w.secrets.onEssenceLongPress(700);
    if (s === 90 || s === 400) w.secrets.onLogoTap();
    if (s === 420) w.secrets.onSpeciesRenamed('Bolita');
    // Brush sowing strokes (gentle wandering drags) in the last minutes.
    if (s > 420 && rng() < 0.08) {
      const pts = [];
      let x = rng() * 192;
      let y = rng() * 240;
      let a = rng() * 6.28;
      for (let k = 0; k < 20 + rng() * 40; k++) {
        a += (rng() - 0.5) * 0.5;
        x += Math.cos(a) * 2;
        y += Math.sin(a) * 2;
        pts.push({ x, y, t: k * 16 });
      }
      w.secrets.onBrushPath(pts);
    }
    w.setView({
      essence,
      essencePerSec: stable,
      creatures: creatures.map(({ hx: _hx, hy: _hy, ...c }) => ({ ...c })),
      species: [species('orbium', 'Orbium unicaudatus'), ...(s > 300 ? [species('gyro', 'Gyrorbium gyrans')] : [])],
      stats: { playTime, totalEssence: essence, eraEssence: essence, seeds, creaturesBorn: nextId - 1 },
    });
  });
  return { w, seeds };
}

describe('a typical first ten minutes', () => {
  for (const [seed, start] of [
    [1, '2026-06-17T16:20:00'],
    [2, '2026-02-10T11:05:00'],
    [3, '2026-11-03T19:45:00'],
    [4, '2027-04-28T08:30:00'],
  ] as const) {
    it(`finds no secret except the intentionally easy ones (run ${seed})`, () => {
      const { w, seeds } = firstTenMinutes(seed, start);
      const found = w.foundIds();
      for (const id of found) expect(EASY.has(id), `unexpected secret "${id}"`).toBe(true);
      // The gentle one: the 42nd hand seed, if the player got that far.
      expect(found.includes('answer')).toBe(seeds >= 42);
      expect(w.secrets.bonusMultiplier()).toBeLessThanOrEqual(1.02);
    });
  }
});
