/** Shared context handed to panels and modals by the UI root. */
import type { BuyQty, Currency, GameActions, GameView } from '../core/types';
import { h, ic } from './dom';
import { t, type StrKey } from './i18n';
import type { UIDeps, UISound } from './ui';

export type TabId = 'lab' | 'bestiary' | 'calibrate' | 'genome';
export const TABS: TabId[] = ['lab', 'bestiary', 'calibrate', 'genome'];
export type ToastKind = 'info' | 'good' | 'warn' | 'bad' | 'gold';
export type ThemePref = 'auto' | 'dark' | 'light';

export interface Ctx {
  readonly actions: GameActions;
  readonly deps: UIDeps;
  /** Latest game view (never null once panels exist). */
  readonly view: GameView;
  buyQty: BuyQty;
  setBuyQty(q: BuyQty): void;
  openSpecies(id: string): void;
  enterPrintMode(id: string): void;
  /** DOM particle burst from an element (+ optional floating text). */
  fxBurst(el: Element, color: string, text?: string): void;
  toast(text: string, kind: ToastKind, icon?: string, onClick?: () => void): void;
  vibrate(p: number | number[]): void;
  /** UI feedback sound (forwarded to deps.onUISound if provided). */
  sound(kind: UISound): void;
  switchTab(tab: TabId): void;
  restartTutorial(): void;
  /** Theme preference (auto follows the system). */
  themePref(): ThemePref;
  setTheme(t: ThemePref): void;
  introVisible(tab: TabId): boolean;
  dismissIntro(tab: TabId): void;
}

export interface Panel {
  readonly el: HTMLElement;
  update(v: GameView): void;
  /** Rebuild static text after a language change. */
  rebuild(): void;
  onShow?(): void;
}

export function currencyIcon(c: Currency): string {
  return c === 'essence' ? 'essence' : c === 'samples' ? 'samples' : 'genome';
}

export function currencyAmount(v: GameView, c: Currency): number {
  return c === 'essence' ? v.essence : c === 'samples' ? v.samples : v.genome;
}

const INTRO_KEY: Record<TabId, StrKey> = {
  lab: 'introLab',
  bestiary: 'introBestiary',
  calibrate: 'introCalibrate',
  genome: 'introGenome',
};

/** One-line dismissible explanation shown the first time a tab opens. */
export function introEl(ctx: Ctx, tab: TabId): HTMLElement | null {
  if (!ctx.introVisible(tab)) return null;
  const el = h(
    'div',
    { class: 'intro', role: 'note' },
    ic('info', 24),
    h('p', null, t(INTRO_KEY[tab])),
    h('button', {
      type: 'button',
      text: t('dismiss'),
      onclick: () => {
        ctx.dismissIntro(tab);
        el.remove();
      },
    }),
  );
  return el;
}

/** Restart a one-shot CSS animation class. */
export function retrigger(el: Element, cls: string): void {
  el.classList.remove(cls);
  void (el as HTMLElement).offsetWidth;
  el.classList.add(cls);
}
