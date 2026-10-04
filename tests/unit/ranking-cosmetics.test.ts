import { describe, expect, it } from 'vitest';
import { parseWantedCosmetics, resolveRankCosmetics, visibleCosmetics } from '../../server/cosmetics';
import { finalizeSubmission, generateKeyPair, importPrivateKey, parseSubmission, randomHex } from '../../server/protocol';
import { createLeaderboardService } from '../../server/service';
import { MemoryStore } from '../../server/store';
import { emptyRecord, grantItem, upsertSub, type EntRecord } from '../../server/store/entitlements';

const ORIGIN = 'https://bioluma.test';
const T0 = Date.UTC(2026, 9, 10, 12);

describe('ranking cosmetics', () => {
  it('free (achievement) items always show; paid items only with a store record', () => {
    const want = { badge: 'badge.naturalist', frame: 'frame.gilded' };
    expect(resolveRankCosmetics(null, 'k', want, T0)).toEqual({ badge: 'badge.naturalist' });
    const rec = emptyRecord('k');
    grantItem(rec, 'frame.gilded', T0);
    expect(resolveRankCosmetics(rec, 'k', want, T0)).toEqual({ badge: 'badge.naturalist', frame: 'frame.gilded' });
  });

  it('supporter items need an active subscription and lapse with it', () => {
    const rec: EntRecord = emptyRecord('k');
    const want = { badge: 'badge.mecenas' };
    expect(resolveRankCosmetics(rec, 'k', want, T0)).toBeUndefined();
    upsertSub(rec, { id: 's1', provider: 'lemonsqueezy', plan: 'month', status: 'cancelled', renewsAt: null, endsAt: T0 + 86_400_000, since: T0, updatedAt: T0 });
    const c = resolveRankCosmetics(rec, 'k', want, T0)!;
    expect(c.badge).toBe('badge.mecenas');
    expect(visibleCosmetics(c, T0 + 1000)).toEqual({ badge: 'badge.mecenas' });
    expect(visibleCosmetics(c, T0 + 2 * 86_400_000)).toBeUndefined();
  });

  it('rejects malformed wishes', () => {
    expect(parseWantedCosmetics({ badge: 'badge.orbium' })).toEqual({ badge: 'badge.orbium' });
    expect(parseWantedCosmetics({ essence: 'x' })).toBeNull();
    expect(parseWantedCosmetics({ badge: '<script>' })).toBeNull();
    expect(parseWantedCosmetics([])).toBeNull();
  });

  it('a signed submission carries the wish and the board row shows what the server allows', async () => {
    let now = T0;
    const rec = emptyRecord('');
    const service = createLeaderboardService({ store: new MemoryStore(), now: () => now, powBits: 2, entitlements: async (key) => ({ ...rec, key }) });
    const kp = await generateKeyPair();
    const priv = await importPrivateKey(kp.priv);
    const sub = await finalizeSubmission(
      {
        version: 1,
        playerId: crypto.randomUUID(),
        publicKey: kp.pub,
        name: 'Ada',
        lifetimeEssence: 1000,
        eraEssence: 1000,
        genome: 0,
        speciesCount: 3,
        behaviorsCount: 1,
        era: 1,
        playTimeSec: 600,
        seeds: 30,
        epsPeak: 10,
        createdAt: T0 - 86_400_000,
        clientTime: now,
        nonce: randomHex(16),
        integrity: { speedHack: false, clockRollback: false, tampered: false },
        cosmetics: { badge: 'badge.naturalist', frame: 'frame.gilded', nameColor: 'name.mecenas.gold' },
      },
      priv,
      2,
    );
    expect(parseSubmission(JSON.parse(JSON.stringify(sub))).ok).toBe(true);
    const res = await service.submit(
      new Request(`${ORIGIN}/api/submit`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(sub) }),
    );
    expect(res.status).toBe(200);
    now += 1000;
    const board = (await (await service.leaderboard(new Request(`${ORIGIN}/api/leaderboard?board=essence`))).json()) as {
      entries: { cosmetics?: Record<string, string> }[];
    };
    // Gilded frame is paid and not owned, the gold name colour is supporter-only: only the badge shows.
    expect(board.entries[0].cosmetics).toEqual({ badge: 'badge.naturalist' });
  });

  it('a tampered wish breaks the signature', async () => {
    const kp = await generateKeyPair();
    const priv = await importPrivateKey(kp.priv);
    const sub = await finalizeSubmission(
      {
        version: 1,
        playerId: crypto.randomUUID(),
        publicKey: kp.pub,
        name: 'Ada',
        lifetimeEssence: 1000,
        eraEssence: 1000,
        genome: 0,
        speciesCount: 3,
        behaviorsCount: 1,
        era: 1,
        playTimeSec: 600,
        seeds: 30,
        epsPeak: 10,
        createdAt: T0 - 86_400_000,
        clientTime: T0,
        nonce: randomHex(16),
        integrity: { speedHack: false, clockRollback: false, tampered: false },
      },
      priv,
      2,
    );
    const service = createLeaderboardService({ store: new MemoryStore(), now: () => T0, powBits: 0 });
    const forged = { ...sub, cosmetics: { badge: 'badge.founder' } };
    const res = await service.submit(
      new Request(`${ORIGIN}/api/submit`, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(forged) }),
    );
    expect(res.status).toBe(401);
  });
});
