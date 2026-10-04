import { describe, expect, it } from 'vitest';
import { Bus, type GameEvents } from '../core/bus';
import { createStory } from './story';
import { makeView, memoryStorage } from './testUtil';

function make() {
  const bus = new Bus<GameEvents>();
  const storage = memoryStorage();
  const story = createStory({ bus, getView: () => makeView(), storage, now: () => 1_000_000, random: () => 0.99, pollMs: 0 });
  return { story, storage };
}

describe('story.consume (one thing per event with Momentos)', () => {
  it('marks a scene told by a moment done without playing it or archiving it', () => {
    const { story } = make();
    let ends = 0;
    story.on('sceneStart', () => ends++);
    story.consume(['t_stable', 't_essence']);
    expect(ends).toBe(0);
    const scenes = story.archive().scenes;
    expect(scenes.find((s) => s.id === 't_stable')?.seen ?? false).toBe(false);
    // The tutorial chain continues: serialize lists both as done.
    expect(story.serialize().done).toEqual(expect.arrayContaining(['t_stable', 't_essence']));
  });

  it('ends the scene if it is on screen right now, and ignores unknown ids', () => {
    const { story } = make();
    story.play('t_wait');
    expect(story.current()?.scene.id).toBe('t_wait');
    story.consume(['t_wait', 'no_such_scene']);
    expect(story.current()).toBeNull();
    expect(story.serialize().done).toContain('t_wait');
    expect(story.serialize().done).not.toContain('no_such_scene');
  });

  it('persists what it consumed', () => {
    const { story, storage } = make();
    story.consume(['t_fail']);
    const raw = storage.getItem('bioluma.story');
    expect(raw === null ? '' : raw).toContain('t_fail');
  });
});
