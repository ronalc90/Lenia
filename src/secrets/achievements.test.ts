import { describe, expect, it } from 'vitest';
import { earnedSecretAchievements, SECRET_ACHIEVEMENTS, upperSnake } from './achievements';
import { SECRET_DEFS, SECRET_IDS, TOTAL_SECRETS } from './data';

describe('secret achievements', () => {
  it('one hidden achievement per secret plus milestones, with unique SECRET_* Steam names', () => {
    expect(SECRET_ACHIEVEMENTS.filter((a) => a.secretId)).toHaveLength(SECRET_DEFS.length);
    const names = SECRET_ACHIEVEMENTS.map((a) => a.steamApiName);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(SECRET_ACHIEVEMENTS.map((a) => a.id)).size).toBe(names.length);
    for (const a of SECRET_ACHIEVEMENTS) {
      expect(a.steamApiName).toMatch(/^SECRET_[A-Z0-9_]+$/);
      expect(a.hidden).toBe(true);
      expect(a.name.es && a.name.en && a.desc.es && a.desc.en).toBeTruthy();
    }
    expect(upperSnake('goldenStreak')).toBe('GOLDEN_STREAK');
  });

  it('earned achievements follow found secrets and counts', () => {
    expect(earnedSecretAchievements(() => false)).toEqual([]);
    expect(earnedSecretAchievements((id) => id === 'heart')).toEqual(['secret_heart', 'secret_first']);
    const all = earnedSecretAchievements(() => true);
    expect(all).toContain('secret_all');
    expect(all).toHaveLength(TOTAL_SECRETS + 3);
    expect(SECRET_IDS.length).toBe(TOTAL_SECRETS);
  });
});
