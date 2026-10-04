/**
 * One thing per event: Momentos ⇄ story tutorial.
 *
 * The story (src/story) has VELA tutorial scenes for some first-time events
 * (t_wait, t_fail, t_explode, t_stable, t_essence, t_bestiary, t_golden). The
 * moment card already shows VELA's animated portrait speaking the line, with
 * the pause, zoom and diagram, so when a moment opens its scenes are marked
 * consumed and never play. Conversely, if the story got there first (VELA's
 * bubble already played), the moment opens as a brief label instead.
 *
 * Consumption uses `story.consume(ids)` when the story exposes it (tiny patch,
 * see docs/MOMENTOS.md §Story). Without it, a safe fallback marks a scene done
 * through the public API — `play(id)` then `skip()` — only while the story is
 * idle (never interrupting a scene); `consuming` is true during that instant so
 * the integrator can mute the story UI's open/done blips.
 */
import { MOMENT_BY_ID } from './catalog';
import type { Moments } from './moments';
import type { MomentId } from './types';

/** The slice of the story API the bridge needs (src/story/story.ts `Story` satisfies it). */
export interface StoryLike {
  current(): { phase: string } | null;
  play(sceneId: string): boolean;
  skip(): void;
  archive(): { scenes: { id: string; seen: boolean }[] };
  readonly enabled: boolean;
  /** Optional hook: mark scenes done without playing them (patch in docs/MOMENTOS.md). */
  consume?(sceneIds: string[]): void;
}

export interface StoryBridge {
  /** The story is on screen (dialogue lines, a choice or an ending cinematic): moments wait. */
  storyShowing(): boolean;
  /**
   * For the story's `suppress(sceneId)` dep: a moment that tells this scene is
   * queued, open or still to be consumed, so the story must not start it now.
   */
  suppresses(sceneId: string): boolean;
  /** The story already told this moment (its main scene played): show a brief label instead. */
  covered(id: MomentId): boolean;
  /** True only while the fallback plays+skips a scene (mute story sounds meanwhile). */
  readonly consuming: boolean;
  /** Scenes still waiting to be consumed (fallback, story was busy). */
  pending(): string[];
  dispose(): void;
}

const RETRY_MS = 400;

/** Story scene → the moments that tell it. */
const BY_SCENE = new Map<string, MomentId[]>();
for (const [id, def] of MOMENT_BY_ID) for (const sc of def.story ?? []) BY_SCENE.set(sc, [...(BY_SCENE.get(sc) ?? []), id]);

export function linkStory(moments: Moments, story: StoryLike): StoryBridge {
  let consuming = false;
  const pending = new Set<string>();

  function sceneSeen(id: string): boolean {
    try {
      return story.archive().scenes.some((s) => s.id === id && s.seen);
    } catch {
      return false;
    }
  }

  function flush(): void {
    if (!pending.size) return;
    if (story.consume) {
      const ids = [...pending];
      pending.clear();
      try {
        story.consume(ids);
      } catch (err) {
        console.warn('[moments] story.consume failed', err);
      }
      return;
    }
    if (!story.enabled) {
      // A disabled story plays nothing: nothing to consume.
      pending.clear();
      return;
    }
    for (const id of [...pending]) {
      if (story.current()) return; // never interrupt a scene: retry later
      pending.delete(id);
      if (sceneSeen(id)) continue;
      consuming = true;
      try {
        if (story.play(id)) story.skip();
      } catch (err) {
        console.warn('[moments] story fallback consume failed', err);
      } finally {
        consuming = false;
      }
    }
  }

  const off = moments.on('open', ({ moment }) => {
    if (moment.replay) return;
    for (const id of MOMENT_BY_ID.get(moment.id)?.story ?? []) pending.add(id);
    flush();
  });
  const timer = typeof setInterval === 'function' ? setInterval(flush, RETRY_MS) : null;

  return {
    storyShowing() {
      try {
        const c = story.current();
        return !!c && c.phase !== 'wait' && c.phase !== 'idle';
      } catch {
        return false;
      }
    },
    suppresses(sceneId) {
      if (pending.has(sceneId)) return true;
      for (const id of BY_SCENE.get(sceneId) ?? []) if (moments.isActive(id)) return true;
      return false;
    },
    covered(id) {
      const main = MOMENT_BY_ID.get(id)?.story?.[0];
      return !!main && sceneSeen(main);
    },
    get consuming() {
      return consuming;
    },
    pending: () => [...pending],
    dispose() {
      off();
      if (timer !== null) clearInterval(timer);
    },
  };
}
