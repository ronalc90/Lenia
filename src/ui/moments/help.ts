/**
 * "¿Qué pasó?" sheet: every Momento the dish has explained, to re-watch any
 * time (Settings / Bitácora), plus the two settings of this layer: how much to
 * explain (with pause / brief / none) and the creature labels.
 */
import type { Lang } from '../../core/types';
import type { Moments } from '../../moments/moments';
import type { ExplainMode, StatusLabelMode } from '../../moments/types';
import { moIcon } from './icons';
import { MS, tr } from './strings';

export interface HelpSheet {
  readonly el: HTMLElement;
  refresh(): void;
  dispose(): void;
}

export function createHelp(
  container: HTMLElement,
  moments: Moments,
  opts: { lang(): Lang; reduceMotion?(): boolean; onOpenGuide?(): void },
): HelpSheet {
  const el = document.createElement('section');
  el.className = 'mo-help';
  container.appendChild(el);

  function seg<T extends string>(name: string, label: string, value: T, options: [T, string][]): string {
    return `<div class="mo-seg" role="radiogroup" aria-label="${label}" data-seg="${name}">
      <span class="mo-seg-l">${label}</span>
      <span class="mo-seg-o">${options
        .map(([v, l]) => `<button type="button" role="radio" aria-checked="${v === value}" data-v="${v}" class="${v === value ? 'on' : ''}">${l}</button>`)
        .join('')}</span>
    </div>`;
  }

  function render(): void {
    const L = opts.lang();
    const list = moments.help();
    const seen = list.filter((e) => e.seen).length;
    el.innerHTML = `
      <header class="mo-help-h">
        <span class="mo-help-ic">${moIcon('info', 22)}</span>
        <div><h3>${tr(MS.helpTitle, L)}</h3><p>${tr(MS.helpIntro, L)}</p></div>
        <span class="mo-help-n">${tr(MS.helpCount, L, { n: seen, total: list.length })}</span>
      </header>
      ${opts.onOpenGuide ? `<button type="button" class="mo-btn secondary mo-help-guide">${moIcon('behavior', 18)} ${tr(MS.bhOpen, L)}</button>` : ''}
      <ul class="mo-help-list">
        ${list
          .map((e) => {
            const d = e.def;
            if (!e.seen)
              return `<li class="locked"><span class="mo-help-dot">?</span><span class="mo-help-t"><b>${tr(MS.helpLocked, L)}</b></span></li>`;
            return `<li style="--mo-c:${d.color}">
              <span class="mo-help-dot">${moIcon(d.icon, 20)}</span>
              <span class="mo-help-t"><b>${d.title[L]}</b><small>${d.lines[0][L]}</small></span>
              <button type="button" class="mo-help-play" data-id="${d.id}" aria-label="${tr(MS.helpWatch, L)}: ${d.title[L]}">${moIcon('spark', 16)}${tr(MS.helpWatch, L)}</button>
            </li>`;
          })
          .join('')}
      </ul>
      ${seg<ExplainMode>('mode', tr(MS.explainLabel, L), moments.mode, [
        ['full', tr(MS.explainFull, L)],
        ['brief', tr(MS.explainBrief, L)],
        ['off', tr(MS.explainOff, L)],
      ])}
      ${seg<StatusLabelMode>('labels', tr(MS.labelsLabel, L), moments.labels, [
        ['auto', tr(MS.labelsAuto, L)],
        ['always', tr(MS.labelsAlways, L)],
        ['tap', tr(MS.labelsTap, L)],
      ])}
    `;
  }

  el.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.mo-help-guide')) {
      opts.onOpenGuide?.();
      return;
    }
    const play = target.closest('.mo-help-play') as HTMLElement | null;
    if (play?.dataset.id) {
      moments.replay(play.dataset.id as Parameters<Moments['replay']>[0]);
      return;
    }
    const opt = target.closest('.mo-seg button') as HTMLElement | null;
    const seg = target.closest('.mo-seg') as HTMLElement | null;
    if (opt && seg) {
      const v = opt.dataset.v ?? '';
      if (seg.dataset.seg === 'mode') moments.setMode(v as ExplainMode);
      else moments.setLabels(v as StatusLabelMode);
    }
  });

  render();
  const off = moments.on('change', render);
  return {
    el,
    refresh: render,
    dispose() {
      off();
      el.remove();
    },
  };
}
