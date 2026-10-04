import { describe, expect, it } from 'vitest';
import { lutFromStops, MATTER_ART } from '../ui/art/matter';
import { MATTER_STOPS, MATTER_STOPS_V1, matterColor, matterLUT } from './palette';

describe('matter palette', () => {
  it('is the art direction night palette (docs/ARTE.md §8.1), byte for byte', () => {
    expect(MATTER_STOPS.map((s) => [...s])).toEqual(MATTER_ART.night.map((s) => [...s]));
    expect(Array.from(matterLUT())).toEqual(Array.from(lutFromStops(MATTER_ART.night)));
  });

  it('keeps white for the hot core: the body below 0.8 is not white, the first palette was', () => {
    const lum = ([r, g, b]: number[]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(lum(matterColor(0.8))).toBeLessThan(235);
    expect(lum(matterColor(1))).toBeGreaterThan(245);
    const v1 = MATTER_STOPS_V1.find((s) => s[0] === 0.7)!;
    expect(lum([v1[1], v1[2], v1[3]])).toBeGreaterThan(235);
  });
});
