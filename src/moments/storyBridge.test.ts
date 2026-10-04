import { describe, expect, it } from 'vitest';
import { Bus, type GameEvents } from '../core/bus';
import type { GameView } from '../core/types';
import { createStory } from '../story/story';
import { createMoments } from './moments';
import { linkStory, type StoryLike } from './storyBridge';
import { creature, makeView, memoryStorage } from './testUtil';

function setup(withConsume: boolean) {
  const bus = new Bus<GameEvents>();
  let t = 1_000_000;
  let view: GameView = makeView({ stats: { playTime: 0, totalEssence: 0, eraEssence: 0, seeds: 0, creaturesBorn: 0 } });
  let momentsRef: ReturnType<typeof createMoments> | null = null;
  // Wiring as in docs/MOMENTOS.md: the story does not start a scene while a moment is queued or open.
  const story = createStory({
    bus,
    getView: () => view,
    storage: memoryStorage(),
    now: () => t,
    pollMs: 0,
    random: () => 0.99,
    isBlocked: () => momentsRef?.isBusy() ?? false,
  });
  const consumed: string[][] = [];
  const storyLike: StoryLike = withConsume
    ? {
        current: () => story.current(),
        play: (id) => story.play(id),
        skip: () => story.skip(),
        archive: () => story.archive(),
        get enabled() {
          return story.enabled;
        },
        consume: (ids) => void consumed.push(ids),
      }
    : story;
  // eslint-disable-next-line prefer-const
  let bridge: ReturnType<typeof linkStory>;
  const moments = createMoments({
    bus,
    getView: () => view,
    storage: memoryStorage(),
    now: () => t,
    pollMs: 0,
    isBlocked: () => bridge.storyShowing(),
    downgrade: (id) => bridge.covered(id),
  });
  momentsRef = moments;
  bridge = linkStory(moments, storyLike);
  const advance = (ms: number) => {
    for (let left = ms; left > 0; left -= 250) {
      t += Math.min(250, left);
      story.tick();
      moments.tick();
    }
  };
  return {
    bus,
    story,
    moments,
    bridge,
    consumed,
    advance,
    setView: (v: Partial<GameView>) => (view = { ...view, ...v }),
  };
}

/** Play the intro scene to its task, then sow: the tutorial's first real step. */
function introAndSow(s: ReturnType<typeof setup>): void {
  s.advance(5000);
  expect(s.story.current()?.scene.id).toBe('t_intro');
  while (s.story.current()?.phase === 'lines') s.story.advance();
  expect(s.story.current()?.phase).toBe('wait');
  s.setView({ stats: { playTime: 1, totalEssence: 0, eraEssence: 0, seeds: 1, creaturesBorn: 0 } });
  s.bus.emit('seed', { x: 10, y: 10, cost: 2, manual: true });
}

describe('story bridge: one thing per event', () => {
  it('the first seed card replaces VELA\'s "wait a moment" scene (fallback through play + skip)', async () => {
    const s = setup(false);
    introAndSow(s);
    await Promise.resolve();
    s.advance(2000);
    expect(s.moments.current()?.id).toBe('seed');
    expect(s.moments.current()?.mode).toBe('full');
    // t_intro finished on the seed; t_wait was consumed, so it never shows.
    expect(s.story.current()).toBeNull();
    s.moments.dismiss();
    s.advance(20_000);
    expect(s.story.current()?.scene.id).not.toBe('t_wait');
    expect(s.bridge.pending()).toEqual([]);
  });

  it('the life card consumes t_stable and t_essence, and the tutorial goes on after them', async () => {
    const s = setup(false);
    introAndSow(s);
    await Promise.resolve();
    s.advance(2000);
    s.moments.dismiss();
    s.setView({ creatures: [creature(1)] });
    s.bus.emit('creatureStable', { id: 1, x: 50, y: 50 });
    await Promise.resolve();
    s.advance(4000);
    expect(s.moments.current()?.id).toBe('stable');
    s.moments.dismiss();
    s.advance(30_000);
    const seen = new Set(s.story.serialize().done);
    expect(seen.has('t_stable')).toBe(true);
    expect(seen.has('t_essence')).toBe(true);
    // (The fallback marks them through play + skip; the story.consume patch keeps them out of the archive.)
  });

  it('the story is told to hold a scene while its moment is queued', () => {
    const s = setup(false);
    s.advance(5000);
    expect(s.bridge.suppresses('t_golden')).toBe(false);
    s.bus.emit('goldenSpawn', { x: 1, y: 1 });
    expect(s.bridge.suppresses('t_golden')).toBe(true);
    expect(s.bridge.suppresses('t_lab')).toBe(false);
  });

  it('uses story.consume when the story offers it', async () => {
    const s = setup(true);
    s.advance(5000);
    s.story.skipTutorial();
    s.bus.emit('creatureExploded', { id: 1, x: 5, y: 5 });
    await Promise.resolve();
    s.advance(2000);
    expect(s.moments.current()?.id).toBe('explode');
    expect(s.consumed).toEqual([['t_explode']]);
  });

  it('moments wait while VELA is talking, and a lesson she already gave opens as a brief label', async () => {
    const s = setup(false);
    s.advance(5000);
    expect(s.bridge.storyShowing()).toBe(true); // t_intro lines on screen
    s.bus.emit('creatureDied', { id: 1, x: 5, y: 5 });
    s.advance(3000);
    expect(s.moments.current()).toBeNull();
    // Play t_fail for real (the story got there first), then let the moment through.
    s.story.play('t_fail');
    while (s.story.current()?.phase === 'lines') s.story.advance();
    s.story.skip();
    expect(s.bridge.covered('dissolve')).toBe(true);
    s.advance(500);
    expect(s.moments.current()?.id).toBe('dissolve');
    expect(s.moments.current()?.mode).toBe('brief');
  });
});
