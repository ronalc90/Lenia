/**
 * Secret achievements: one hidden achievement per secret plus a few milestones, with stable
 * Steam API names ("SECRET_*") for the platforms engineer's mapping. Hidden = the store shows
 * "Hidden achievement" until unlocked; the description is the explicit tier-3 hint.
 */
import type { Text } from '../core/types';
import { BASEMENT_UNLOCK, SECRET_DEFS, TOTAL_SECRETS } from './data';
import type { SecretId } from './types';

export interface SecretAchievementDef {
  id: string;
  /** The secret that unlocks it, or a milestone. */
  secretId: SecretId | null;
  /** Secrets needed (milestones only). */
  count: number | null;
  name: Text;
  desc: Text;
  hidden: true;
  steamApiName: string;
}

/** camelCase → UPPER_SNAKE ("goldenStreak" → "GOLDEN_STREAK"). */
export function upperSnake(id: string): string {
  return id.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

const t = (es: string, en: string): Text => ({ es, en });

export const SECRET_ACHIEVEMENTS: readonly SecretAchievementDef[] = [
  ...SECRET_DEFS.map(
    (d): SecretAchievementDef => ({
      id: `secret_${d.id}`,
      secretId: d.id,
      count: null,
      name: d.name,
      desc: d.hints[2],
      hidden: true,
      steamApiName: `SECRET_${upperSnake(d.id)}`,
    }),
  ),
  {
    id: 'secret_first',
    secretId: null,
    count: 1,
    name: t('Curiosidad', 'Curiosity'),
    desc: t('Encuentra tu primer secreto.', 'Find your first secret.'),
    hidden: true,
    steamApiName: 'SECRET_FIRST',
  },
  {
    id: 'secret_ten',
    secretId: null,
    count: BASEMENT_UNLOCK,
    name: t('Bajo el suelo', 'Under the floor'),
    desc: t(`Encuentra ${BASEMENT_UNLOCK} secretos.`, `Find ${BASEMENT_UNLOCK} secrets.`),
    hidden: true,
    steamApiName: 'SECRET_TEN',
  },
  {
    id: 'secret_all',
    secretId: null,
    count: TOTAL_SECRETS,
    name: t('Nada más que encontrar', 'Nothing left to find'),
    desc: t('Encuentra todos los secretos.', 'Find every secret.'),
    hidden: true,
    steamApiName: 'SECRET_ALL_FOUND',
  },
];

/** Achievement ids earned for a set of found secrets. */
export function earnedSecretAchievements(found: (id: SecretId) => boolean): string[] {
  let n = 0;
  for (const d of SECRET_DEFS) if (found(d.id)) n++;
  return SECRET_ACHIEVEMENTS.filter((a) => (a.secretId ? found(a.secretId) : n >= (a.count ?? Infinity))).map((a) => a.id);
}
