/**
 * Icons of the Momentos cards, chips and the seed-price sheet: the art direction's single system
 * (src/ui/art/icons.ts, docs/ARTE.md §5), same signature and class (`mo-ic`, plus `bl-ic`).
 */
import type { Behavior } from '../../core/types';
import type { ChipIcon, MomentIcon } from '../../moments/types';

export { moIcon } from '../art/icons';

/** Every name the Momentos ask for (all resolve in the art set; checked by a test). */
export type MoIconName = MomentIcon | NonNullable<ChipIcon> | 'creatures' | 'info' | 'big' | 'close' | 'pause' | 'eye' | 'warn' | 'lock' | Behavior;
