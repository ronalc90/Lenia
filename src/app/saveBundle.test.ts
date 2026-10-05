import { describe, expect, it } from 'vitest';
import { Bus, type GameEvents } from '../core/bus';
import { createGame } from '../game/game';
import { base64ToUtf8, utf8ToBase64 } from '../game/state';
import { creature, report, run, seededRng } from '../game/testUtil';
import { createMoments } from '../moments/moments';
import { createEncargos } from '../story/encargos';
import { createStory } from '../story/story';
import { makeView } from '../story/testUtil';
import { BUNDLE_PREFIX, createSaveTransfer, decodeSaveText, type Transferable } from './saveBundle';

function memory(): { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

const RAW = ['bioluma.secrets.journal', 'bioluma.look'];

/** One device: a sessions game and the modules that keep their own state. */
function device(seed: number) {
  const bus = new Bus<GameEvents>();
  const storage = memory();
  const game = createGame({ bus, rng: seededRng(seed), cycle: 'sessions', now: () => 1_790_000_000_000 });
  const story = createStory({ bus, getView: () => makeView(), storage, now: () => 0, random: () => 0.99, pollMs: 0 });
  const encargos = createEncargos({ bus, getView: () => makeView(), storage, now: () => 0, random: () => 0, pollMs: 0, story, grant: () => {} });
  const moments = createMoments({ bus, getView: () => makeView(), storage, now: () => 0, pollMs: 0 });
  let secretsState: unknown = { v: 1, found: [] as string[] };
  const secrets: Transferable = { serialize: () => secretsState, load: (d) => void (secretsState = d) };
  const transfer = createSaveTransfer({ game, parts: { story, encargos, secrets, moments }, storage, rawKeys: RAW });
  return { game, story, encargos, moments, secrets, storage, transfer, getSecrets: () => secretsState };
}

describe('export / import carries every kind of progress (RF-02)', () => {
  it('a round trip moves the game, the story, the Encargos, the secrets, the Momentos and the journals', () => {
    const a = device(1);
    // Progress on device A.
    a.game.tick(0.1, null);
    a.game.actions.seedAt(60, 60);
    run(a.game, 20, report([creature({ id: 1, x: 60, y: 60 })]), 0.5);
    a.story.skipTutorial();
    a.story.setFlag('rf02', true);
    a.moments.load({ v: 1, seen: ['stable', 'species'], mode: 'full', labels: {} });
    a.secrets.load({ v: 1, found: ['konami', 'moon'] });
    a.storage.setItem('bioluma.secrets.journal', '[{"id":"s1","read":true}]');
    a.storage.setItem('bioluma.look', '{"hair":3}');
    a.storage.setItem('bioluma.lb.id', 'device-a-only');
    const text = a.transfer.exportText();
    expect(text.startsWith(BUNDLE_PREFIX)).toBe(true);

    // Device B already has its own (fresh) progress.
    const b = device(2);
    b.storage.setItem('bioluma.lb.id', 'device-b');
    expect(b.transfer.importText(text)).toEqual({ ok: true, legacy: false });

    // The progress that lasts (an ended session is followed by a fresh one on any load).
    const lasting = (g: typeof a.game) => {
      const d = JSON.parse(g.serialize()).data as Record<string, unknown>;
      return { research: d.research, species: d.species, stats: d.stats, settings: d.settings, achievements: d.achievements, journal: d.journal, behaviorsSeen: d.behaviorsSeen, createdAt: d.createdAt };
    };
    expect(lasting(a.game).species).not.toEqual([]);
    expect(lasting(b.game)).toEqual(lasting(a.game));
    expect(b.story.serialize()).toEqual(a.story.serialize());
    expect(b.encargos.serialize()).toEqual(a.encargos.serialize());
    expect(b.moments.serialize().seen).toEqual(expect.arrayContaining(['stable', 'species']));
    expect(b.getSecrets()).toEqual({ v: 1, found: ['konami', 'moon'] });
    expect(b.storage.getItem('bioluma.secrets.journal')).toBe('[{"id":"s1","read":true}]');
    expect(b.storage.getItem('bioluma.look')).toBe('{"hair":3}');
    // The ranking identity stays with its device (its key pair never travels).
    expect(b.storage.getItem('bioluma.lb.id')).toBe('device-b');
  });

  it('an old game-only export still imports, and says it is legacy', () => {
    const a = device(3);
    a.game.tick(0.1, null);
    const old = a.game.exportString();
    expect(decodeSaveText(old)).toMatchObject({ legacy: true, parts: null });
    const b = device(4);
    expect(b.transfer.importText(old)).toEqual({ ok: true, legacy: true });
    expect(b.game.serialize()).toBe(a.game.serialize());
  });

  it('garbage, a damaged game part or an unknown version is refused and changes nothing', () => {
    const b = device(5);
    const before = b.game.serialize();
    const good = device(6).transfer.exportText();
    const json = JSON.parse(base64ToUtf8(good.slice(BUNDLE_PREFIX.length))) as Record<string, unknown>;
    const reencode = (o: unknown) => BUNDLE_PREFIX + utf8ToBase64(JSON.stringify(o));
    for (const bad of ['', 'hello', 'BIOLUMA2.%%%', reencode({ ...json, v: 3 }), reencode({ ...json, game: 'BIOLUMA1.abc' }), 'BIOLUMA9.xyz']) {
      expect(b.transfer.importText(bad).ok, bad.slice(0, 20)).toBe(false);
    }
    expect(b.game.serialize()).toBe(before);
  });
});
