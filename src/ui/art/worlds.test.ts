import { describe, expect, it } from 'vitest';
import { WORLDS } from '../../game/worlds';
import { contrast } from './color';
import { EMBLEM_NAMES, EMOJI_EMBLEM, emblem } from './emblems';
import { WORLD_ART_IDS, WORLD_HUE, worldArt, worldColors } from './worlds';

describe('world card art', () => {
  it('covers every world of the game with its own hue', () => {
    expect([...WORLD_ART_IDS].sort()).toEqual(WORLDS.map((w) => w.id).sort());
    for (const w of WORLDS) expect(WORLD_HUE[w.id], w.id).toBe(w.hue);
  });

  it('draws a distinct, well-formed picture per world', () => {
    const arts = WORLD_ART_IDS.map((id) => worldArt(id));
    for (const a of arts) {
      expect(a).toMatch(/^<svg class="bl-world" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice"/);
      expect(a).not.toMatch(/NaN|undefined/);
      expect(a.endsWith('</svg>')).toBe(true);
    }
    expect(new Set(arts.map((a) => a.replace(/w[a-z]+\d+/g, 'ID'))).size).toBe(WORLD_ART_IDS.length);
  });

  it('gives each call its own gradient ids (many cards on one screen)', () => {
    const a = worldArt('cold');
    const b = worldArt('cold');
    const idA = a.match(/id="(g[^"]+)"/)![1];
    expect(b).not.toContain(`id="${idA}"`);
  });

  it('labels the art only when asked (decorative by default)', () => {
    expect(worldArt('giants')).toContain('aria-hidden="true"');
    expect(worldArt('giants', { label: 'Mundo 7 · Gigantes' })).toContain('role="img" aria-label="Mundo 7 · Gigantes"');
  });

  it('keeps the card title readable: white text on the calm corner', () => {
    for (const id of WORLD_ART_IDS) expect(contrast('#f2f6fa', worldColors(id).deep), id).toBeGreaterThanOrEqual(7);
  });
});

describe('emblems', () => {
  it('draws every emblem with unique gradient ids and replaces the copy emoji', () => {
    for (const nm of EMBLEM_NAMES) {
      const a = emblem(nm, 20);
      expect(a).toMatch(/^<svg class="bl-em" width="20"/);
      expect(a).not.toMatch(/NaN|undefined/);
      expect(emblem(nm)).not.toBe(a);
    }
    for (const e of ['💧', '📊', '🌙', '✨', '📋', '🎁', '🏆', '⏱']) expect(EMOJI_EMBLEM[e], e).toBeDefined();
  });
});
