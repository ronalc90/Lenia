/**
 * Secrets & easter eggs — public surface. SPOILERS: docs/SECRETS.md.
 */
export { createSecrets, STORAGE_KEY, normalizeName, isPalindromeNumber, exactEssenceText } from './secrets';
export type { Secrets, SecretsDeps } from './secrets';
export * from './types';
export {
  SECRET_DEFS,
  SECRET_IDS,
  TOTAL_SECRETS,
  CATEGORY_TEXT,
  COLORMAPS,
  COSMETIC_IDS,
  COSMETIC_SOURCE,
  BONUS_CAP,
  BONUS_PER_SECRET,
  BASEMENT_UNLOCK,
  ABYSS_UNLOCK,
  LONG_PRESS_MS,
  colormapColor,
  colormapLUT,
  secretDef,
} from './data';
export {
  SECRET_REGIMES,
  secretRegimes,
  matchSecretRegime,
  inSecretWindow,
  secretSporePool,
  pickSecretSpore,
  isSecretSpeciesCode,
  cryptidAwake,
  isNightHour,
} from './regimes';
export type { SecretRegime, RegimeParams } from './regimes';
export { recognize, swipeDirection, templatePoints, unwrapPath, GESTURE_NAMES } from './gestures';
export type { GestureMatch, GestureName } from './gestures';
export { moonInfo, isFullMoon } from './moon';
export type { MoonInfo } from './moon';
export { createShakeDetector, createJiggleDetector } from './shake';
export { SECRET_ACHIEVEMENTS, earnedSecretAchievements } from './achievements';
export type { SecretAchievementDef } from './achievements';
