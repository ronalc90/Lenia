import { describe, expect, it, vi } from 'vitest';
import { lifeStep } from './effects';
import { createStrokeRecorder } from './inputs';

describe('glider effect', () => {
  it("runs real Life: Conway's glider reappears shifted by (1, 1) every four generations", () => {
    let g = new Set(['1,0', '2,1', '0,2', '1,2', '2,2']);
    for (let i = 0; i < 4; i++) g = lifeStep(g);
    expect([...g].sort()).toEqual(['1,3', '2,1', '2,3', '3,2', '3,3'].sort());
    expect(g.size).toBe(5);
  });
});

describe('stroke recorder', () => {
  it('turns brush points into one stroke per drag (ends on idle or end())', () => {
    vi.useFakeTimers();
    const strokes: number[] = [];
    const rec = createStrokeRecorder({ onBrushPath: (p) => strokes.push(p.length) }, { idleMs: 500 });
    for (let i = 0; i < 20; i++) rec.point(10 + i, 10);
    vi.advanceTimersByTime(499);
    expect(strokes).toEqual([]);
    vi.advanceTimersByTime(2);
    expect(strokes).toEqual([20]);
    for (let i = 0; i < 5; i++) rec.point(50, 50 + i);
    rec.end();
    expect(strokes).toEqual([20, 5]);
    // A far jump starts a new stroke (the round dish is walled: nothing wraps).
    rec.point(10, 10);
    rec.point(11, 10);
    rec.point(60, 10);
    rec.point(61, 10);
    rec.point(250, 10);
    rec.end();
    expect(strokes).toEqual([20, 5, 2, 2]); // the lone last point is no stroke
    rec.cancel();
    vi.useRealTimers();
  });
});
