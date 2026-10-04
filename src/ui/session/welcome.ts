/**
 * One-time card for a save from the old loop (game.migration, src/game/legacy.ts): VELA says in three
 * short lines what changed and that nothing was lost, then one button. Same card look as the start
 * card and the summary (session.css), so it reads as part of the session screens.
 */
import type { Lang } from '../../core/types';
import { SESSION_UI } from '../../game/treeText';
import { fmt } from '../format';
import { Portrait } from '../story/portraits';
import { treeIcon } from '../tree/icons';
import '../art/art.css';
import './session.css';

export interface WelcomeCard {
  readonly isOpen: boolean;
  /** Show it once; `datos` = the Datos the old save turned into. Resolves when the player closes it. */
  show(datos: number): Promise<void>;
  dispose(): void;
}

export function createWelcomeCard(root: HTMLElement, opts: { lang(): Lang; reduceMotion?(): boolean }): WelcomeCard {
  const rm = () => !!opts.reduceMotion?.();
  const layer = document.createElement('div');
  layer.className = 'ss-layer ss-welcome';
  layer.hidden = true;
  layer.innerHTML = `<div class="ss-scrim"></div><section class="ss-card" role="dialog" aria-modal="true"></section>`;
  root.appendChild(layer);
  const card = layer.querySelector('.ss-card') as HTMLElement;
  let open = false;
  let raf = 0;
  let done: (() => void) | null = null;

  function close(): void {
    if (!open) return;
    open = false;
    cancelAnimationFrame(raf);
    layer.classList.remove('show');
    setTimeout(() => (layer.hidden = true), rm() ? 0 : 320);
    const d = done;
    done = null;
    d?.();
  }

  card.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-act="go"]')) close();
  });

  return {
    get isOpen() {
      return open;
    },
    show(datos) {
      const l = opts.lang();
      const lines = SESSION_UI.welcomeLines(fmt(datos, l)).map((x) => x[l]);
      card.innerHTML = `
        <div class="ss-head"><h2>${SESSION_UI.welcomeTitle[l]}</h2></div>
        <div class="ss-vela"><div class="ss-bubble">${lines.map((x) => `<p>${x}</p>`).join('')}</div></div>
        <div class="ss-actions"><button type="button" class="ss-btn primary" data-act="go">${treeIcon('play', 24)}<span class="tx">${SESSION_UI.welcomeGo[l]}</span></button></div>`;
      card.setAttribute('aria-label', SESSION_UI.welcomeTitle[l]);
      layer.hidden = false;
      layer.classList.toggle('rm', rm());
      open = true;
      requestAnimationFrame(() => layer.classList.add('show'));
      const holder = card.querySelector('.ss-vela') as HTMLElement;
      let p: Portrait | null = null;
      try {
        p = new Portrait('ss-vela-pic');
      } catch {
        p = null;
      }
      if (p) {
        const portrait = p;
        portrait.set('vela', 'happy');
        portrait.state.reduceMotion = rm();
        holder.prepend(portrait.canvas);
        const t0 = performance.now();
        let last = t0;
        const talkFor = rm() ? 0 : 2.4;
        const loop = () => {
          const now = performance.now();
          const t = (now - t0) / 1000;
          const dt = Math.min(0.05, (now - last) / 1000);
          last = now;
          const talking = t < talkFor;
          portrait.frame(t, dt, talking ? 0.35 + 0.35 * Math.abs(Math.sin(t * 13)) : 0, talking);
          if (open) raf = requestAnimationFrame(loop);
        };
        raf = requestAnimationFrame(loop);
      }
      return new Promise<void>((resolve) => (done = resolve));
    },
    dispose() {
      cancelAnimationFrame(raf);
      layer.remove();
    },
  };
}
