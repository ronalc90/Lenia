/**
 * Why a tap on Nutrientes did not buy, as one pure rule (QA-3 N9: with «Ya no da tiempo» on the button and 177 de luz,
 * the toast said «Te faltan 1 de luz»: the old code fell through to «light short» for every other reason).
 */
import type { BoostView } from '../core/types';

export type BoostDenial = { kind: 'wait'; s: number } | { kind: 'noTime' } | { kind: 'needsLife' } | { kind: 'short'; n: number } | { kind: 'none' };

export function boostDenial(b: Pick<BoostView, 'cost' | 'wait' | 'needsLife' | 'noTime'>, essence: number): BoostDenial {
  const wait = Math.ceil(b.wait ?? 0);
  if (wait > 0) return { kind: 'wait', s: wait };
  if (b.noTime) return { kind: 'noTime' };
  if (b.needsLife) return { kind: 'needsLife' };
  const short = Math.ceil(b.cost - essence);
  return short > 0 ? { kind: 'short', n: short } : { kind: 'none' };
}

/** «Te falta 1 de luz» / «Te faltan 12 de luz»: the i18n key for `n` (Spanish agrees in number). */
export function deniedShortKey(n: number): 'deniedShortOne' | 'deniedShort' {
  return n === 1 ? 'deniedShortOne' : 'deniedShort';
}
