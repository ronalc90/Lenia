/**
 * The honest-clock note (QA4 F-02): a device that runs the dish clearly slower than real time is told once that the
 * clock counts dish time. Once per game, remembered in local storage (QA-4 N12: it came on every reload), and short
 * enough to read in a toast's time.
 */
import type { Text } from '../core/types';

export const SLOW_DEVICE_TEXT: Text = {
  es: 'Este aparato va despacio: el reloj espera a tus criaturas.',
  en: 'This device is slow: the clock waits for your creatures.',
};

/** Local-storage key of the «told» flag. */
export const SLOW_DEVICE_KEY = 'bioluma.slowTold';

interface FlagStorage {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

export class SlowDeviceNote {
  private done: boolean;

  constructor(private readonly storage: FlagStorage | null) {
    let v: string | null = null;
    try {
      v = storage?.getItem(SLOW_DEVICE_KEY) ?? null;
    } catch {
      v = null;
    }
    this.done = v === '1';
  }

  shouldTell(): boolean {
    return !this.done;
  }

  told(): void {
    this.done = true;
    try {
      this.storage?.setItem(SLOW_DEVICE_KEY, '1');
    } catch {
      /* private window: once per load */
    }
  }
}
