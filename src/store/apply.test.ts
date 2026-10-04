import { describe, expect, it, vi } from 'vitest';
import { matterLUT } from '../core/palette';
import { cosmeticById } from './catalog';
import { bindCosmetics, defaultRenderStyle, paletteLUT, renderStyleFor } from './apply';
import { Entitlements } from './entitlements';

describe('bindCosmetics', () => {
  it('pushes the equipped look to every target and only re-sends what changed', () => {
    const ent = new Entitlements({ storage: null });
    const setMatterLUT = vi.fn();
    const setRenderStyle = vi.fn();
    const setCosmetics = vi.fn();
    const setAmbience = vi.fn();
    const off = bindCosmetics(ent, { sim: { setMatterLUT, setRenderStyle }, overlay: { setCosmetics }, audio: { setAmbience } });
    expect(Array.from(setMatterLUT.mock.calls[0][0] as Uint8Array)).toEqual(Array.from(matterLUT()));
    expect(setRenderStyle).toHaveBeenCalledTimes(1);
    expect(setCosmetics).toHaveBeenCalledTimes(1);
    expect(setAmbience.mock.calls[0][0].bpm).toBe(76);

    ent.grant(['palette.ember', 'halo.hex'], 'purchase');
    ent.equip('palette.ember');
    const ember = cosmeticById('palette.ember');
    expect(setMatterLUT).toHaveBeenCalledTimes(2);
    expect(Array.from(setMatterLUT.mock.calls[1][0] as Uint8Array)).toEqual(Array.from(paletteLUT(ember?.slot === 'palette' ? ember.data.stops : [])));
    expect(setCosmetics).toHaveBeenCalledTimes(1); // halo/trail/spark/dish unchanged
    ent.equip('halo.hex');
    expect(setCosmetics).toHaveBeenCalledTimes(2);
    expect(setCosmetics.mock.calls[1][0].halo.shape).toBe('hex');
    expect(setMatterLUT).toHaveBeenCalledTimes(2);
    off();
    ent.unequip('palette');
    expect(setMatterLUT).toHaveBeenCalledTimes(2);
  });

  it('default render style reproduces the shader constants', () => {
    const s = defaultRenderStyle();
    expect(s.bg.map((c) => Math.round(c * 255))).toEqual([11, 14, 18]);
    expect(s.rim.map((c) => Math.round(c * 255))).toEqual([91, 192, 235]);
    expect(s.rimAmt).toBe(0.22);
    expect(s.grid[3]).toBe(0);
    const bp = cosmeticById('dish.blueprint');
    const pal = cosmeticById('palette.bioluma');
    if (bp?.slot === 'dish' && pal?.slot === 'palette') expect(renderStyleFor(pal.data, bp.data).grid[3]).toBeCloseTo(0.07);
  });
});
