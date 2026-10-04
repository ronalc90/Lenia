/**
 * Modal sheets: journal (+ achievements, stats), settings, species card,
 * offline card and the era summary of the extinction ritual.
 * Bottom sheets on mobile, centered dialogs on wide layouts.
 */
import type { GameView, Settings, SpeciesView } from '../core/types';
import { BEHAVIOR_COLOR } from '../core/palette';
import type { Ctx } from './ctx';
import type { UISound } from './ui';
import { h, ic, setAttr, setText, toggle } from './dom';
import { fmt, fmtDuration, fmtFixed, fmtRate } from './format';
import { behaviorName, getLang, rarityName, t, tx } from './i18n';
import { icon, logo } from './icons';
import { portraitURL } from './portrait';

export interface ModalHandle {
  readonly wrap: HTMLElement;
  readonly body: HTMLElement;
  readonly kind: string;
  close(): void;
  update?(v: GameView): void;
  /** Rebuild after a language change. */
  relabel?(): void;
}

export class ModalHost {
  private stack: ModalHandle[] = [];
  constructor(
    private layer: HTMLElement,
    private sound: (k: UISound) => void = () => {},
  ) {}

  get top(): ModalHandle | undefined {
    return this.stack[this.stack.length - 1];
  }
  get open(): boolean {
    return this.stack.length > 0;
  }
  find(kind: string): ModalHandle | undefined {
    return this.stack.find((m) => m.kind === kind);
  }

  show(opts: {
    kind: string;
    title?: string;
    titleIcon?: string;
    center?: boolean;
    dismissable?: boolean;
    onClose?: () => void;
  }): ModalHandle {
    const scrim = h('div', { class: 'scrim' });
    const body = h('div', { class: 'modal-body' });
    const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', tabindex: '-1' });
    const titleEl = h('h3');
    if (opts.title !== undefined) {
      titleEl.textContent = opts.title;
      modal.setAttribute('aria-label', opts.title);
      const close = h('button', { type: 'button', class: 'modal-close', 'aria-label': t('close'), html: icon('close') });
      close.addEventListener('click', () => handle.close());
      modal.appendChild(
        h('div', { class: 'modal-head' }, opts.titleIcon ? ic(opts.titleIcon, 24, 'title-ic') : null, titleEl, close),
      );
    }
    modal.appendChild(body);
    const wrap = h('div', { class: 'modal-wrap' + (opts.center ? ' center' : '') }, scrim, modal);
    let closed = false;
    const handle: ModalHandle = {
      wrap,
      body,
      kind: opts.kind,
      close: () => {
        if (closed) return;
        closed = true;
        this.sound('close');
        this.stack = this.stack.filter((m) => m !== handle);
        wrap.classList.add('out');
        setTimeout(() => wrap.remove(), 190);
        opts.onClose?.();
      },
    };
    if (opts.dismissable !== false) scrim.addEventListener('click', () => handle.close());
    this.layer.appendChild(wrap);
    this.stack.push(handle);
    this.sound('open');
    // Move focus into the dialog (keyboard users) without showing a ring on a button.
    requestAnimationFrame(() => modal.focus({ preventScroll: true }));
    return handle;
  }

  closeTop(): boolean {
    const top = this.top;
    if (!top) return false;
    top.close();
    return true;
  }

  closeAll(): void {
    for (const m of [...this.stack]) m.close();
  }
}

// ───────────────────────────── Journal ─────────────────────────────

export function openJournal(host: ModalHost, ctx: Ctx, startTab: 'journal' | 'ach' | 'stats' = 'journal'): ModalHandle {
  const m = host.show({ kind: 'journal', title: t('journal'), titleIcon: 'journal' });
  let tab = startTab;
  let key = '';
  // Snapshot of unread ids at open, so new entries stay highlighted while reading.
  const unread = new Set(ctx.view.journal.filter((e) => !e.read).map((e) => e.id));
  const seg = h('div', { class: 'seg text wide', role: 'tablist' });
  const content = h('div');
  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'journal', label: t('journalTab') },
    { id: 'ach', label: t('achievementsTab') },
    { id: 'stats', label: t('statsTab') },
  ];
  const btns = tabs.map((tb) => {
    const b = h('button', { type: 'button', role: 'tab', text: tb.label });
    b.addEventListener('click', () => {
      tab = tb.id;
      key = '';
      render(ctx.view);
    });
    seg.appendChild(b);
    return { id: tb.id, b };
  });
  m.body.append(seg, content);

  const render = (v: GameView) => {
    for (const { id, b } of btns) {
      toggle(b, 'on', id === tab);
      setAttr(b, 'aria-selected', id === tab ? 'true' : 'false');
    }
    const lang = getLang();
    const k =
      tab === 'journal'
        ? `j${v.journal.length}${lang}`
        : tab === 'ach'
          ? `a${v.achievements.map((a) => +a.done).join('')}${lang}`
          : `s${Math.floor(v.stats.playTime / 10)}${Math.floor(v.stats.totalEssence)}${v.species.length}${lang}`;
    if (k === key) return;
    key = k;
    content.textContent = '';
    if (tab === 'journal') {
      if (!v.journal.length) {
        content.appendChild(h('div', { class: 'empty' }, t('journalEmpty')));
        return;
      }
      const list = h('div', { class: 'jr-list' });
      const n = v.journal.length;
      [...v.journal].reverse().forEach((e, i) => {
        const isNew = unread.has(e.id);
        list.appendChild(
          h(
            'div',
            { class: 'jr' + (isNew ? ' unread' : '') },
            h('div', { class: 'jr-n' }, `#${String(n - i).padStart(2, '0')}`),
            tx(e.text),
            isNew ? h('span', { class: 'dot' }) : null,
          ),
        );
      });
      content.appendChild(list);
    } else if (tab === 'ach') {
      const done = v.achievements.filter((a) => a.done).length;
      content.appendChild(
        h('div', { class: 'sec-h' }, ic('trophy', 24), h('span', { class: 'grow' }, t('achievementsTab')), h('span', { class: 'count' }, `${done} / ${v.achievements.length}`)),
      );
      const sorted = [...v.achievements].sort((a, b) => +b.done - +a.done);
      for (const a of sorted) {
        content.appendChild(
          h(
            'div',
            { class: 'ach' + (a.done ? ' done' : '') },
            h('div', { class: 'a-ic' }, ic(a.done ? 'trophy' : 'lock', 24)),
            h('div', { class: 'a-t' }, h('div', { class: 'a-name' }, tx(a.name)), h('div', { class: 'a-desc' }, tx(a.desc))),
            h('div', { class: 'a-rw' }, tx(a.reward)),
          ),
        );
      }
    } else {
      const s = v.stats;
      const stat = (label: string, value: string) =>
        h('div', { class: 'stat' }, h('div', { class: 's-l' }, label), h('div', { class: 's-v' }, value));
      content.appendChild(
        h(
          'div',
          { class: 'stats' },
          stat(t('statPlayTime'), fmtDuration(s.playTime, lang)),
          stat(t('statEra'), String(v.era)),
          stat(t('statTotalEssence'), fmt(s.totalEssence, lang)),
          stat(t('statEraEssence'), fmt(s.eraEssence, lang)),
          stat(t('statSeeds'), fmt(s.seeds, lang)),
          stat(t('statBorn'), fmt(s.creaturesBorn, lang)),
          stat(t('statSpecies'), String(v.species.length)),
          stat(t('genome'), fmt(v.genome, lang)),
        ),
      );
    }
  };
  render(ctx.view);
  if (unread.size) ctx.actions.markJournalRead();
  m.update = (v) => render(v);
  return m;
}

// ───────────────────────────── Settings ─────────────────────────────

export function openSettings(host: ModalHost, ctx: Ctx): ModalHandle {
  const m = host.show({ kind: 'settings', title: t('settings'), titleIcon: 'settings' });
  const refs: { update(s: Settings): void }[] = [];
  let resetArmed = 0;

  const build = () => {
    m.body.textContent = '';
    refs.length = 0;
    const set = <K extends keyof Settings>(k: K, v: Settings[K]) => ctx.actions.setSetting(k, v);
    const s0 = ctx.view.settings;

    const group = (title: string, ...rows: HTMLElement[]) =>
      h('div', { class: 'set-group' }, h('h4', null, title), h('div', { class: 'set-card' }, ...rows));
    const row = (iconName: string, label: string, control: HTMLElement, hint?: string) =>
      h(
        'div',
        { class: 'set-row' },
        ic(iconName, 24),
        h('div', { class: 'sr-text' }, h('div', { class: 'sr-label' }, label), hint ? h('div', { class: 'sr-hint' }, hint) : null),
        control,
      );
    const sw = (key: 'muted' | 'vibration' | 'reduceMotion' | 'oneTouch' | 'analytics', label: string) => {
      const b = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-label': label });
      b.setAttribute('aria-checked', String(!!s0[key]));
      b.addEventListener('click', () => {
        const next = b.getAttribute('aria-checked') !== 'true';
        b.setAttribute('aria-checked', String(next));
        ctx.sound('toggle');
        set(key, next);
      });
      refs.push({ update: (s) => setAttr(b, 'aria-checked', String(!!s[key])) });
      return b;
    };
    const vol = (key: 'sfxVolume' | 'musicVolume', label: string) => {
      const out = h('span', { class: 'vol' });
      const r = h('input', { class: 'range', type: 'range', min: '0', max: '1', step: '0.05', 'aria-label': label });
      let busy = 0;
      const paint = (val: number) => {
        r.style.setProperty('--p', String(val));
        out.textContent = `${Math.round(val * 100)}`;
      };
      r.value = String(s0[key]);
      paint(s0[key]);
      r.addEventListener('input', () => {
        busy = performance.now() + 600;
        const val = parseFloat(r.value);
        paint(val);
        set(key, val);
      });
      refs.push({
        update: (s) => {
          if (performance.now() < busy) return;
          if (r.value !== String(s[key])) {
            r.value = String(s[key]);
            paint(s[key]);
          }
        },
      });
      return h('div', { style: 'display:flex;align-items:center;gap:6px;flex:0 1 190px' }, r, out);
    };
    const segc = <V extends string>(opts: { v: V; label: string }[], cur: () => V, onPick: (v: V) => void) => {
      const el = h('div', { class: 'seg text' });
      const bs = opts.map((o) => {
        const b = h('button', { type: 'button', text: o.label });
        b.addEventListener('click', () => {
          onPick(o.v);
          for (const x of bs) toggle(x.b, 'on', x.v === o.v);
        });
        el.appendChild(b);
        return { v: o.v, b };
      });
      const upd = () => {
        for (const x of bs) toggle(x.b, 'on', x.v === cur());
      };
      upd();
      refs.push({ update: upd });
      return el;
    };

    m.body.append(
      group(
        t('appearance'),
        row(
          'contrast',
          t('theme'),
          segc(
            [
              { v: 'auto', label: t('themeAuto') },
              { v: 'dark', label: t('themeDark') },
              { v: 'light', label: t('themeLight') },
            ] as { v: 'auto' | 'dark' | 'light'; label: string }[],
            () => ctx.themePref(),
            (v) => {
              ctx.sound('toggle');
              ctx.setTheme(v);
            },
          ),
        ),
      ),
      group(
        t('language'),
        row(
          'globe',
          t('language'),
          segc(
            [
              { v: 'es', label: 'Español' },
              { v: 'en', label: 'English' },
            ],
            () => ctx.view.settings.lang,
            (v) => set('lang', v),
          ),
        ),
      ),
      group(
        t('audio'),
        row('sound', t('sfxVolume'), vol('sfxVolume', t('sfxVolume'))),
        row('heart', t('musicVolume'), vol('musicVolume', t('musicVolume'))),
        row('mute', t('muted'), sw('muted', t('muted'))),
      ),
      group(
        t('gameplay'),
        row('vibrate', t('vibration'), sw('vibration', t('vibration'))),
        row('motion', t('reduceMotion'), sw('reduceMotion', t('reduceMotion'))),
        row('hand', t('oneTouch'), sw('oneTouch', t('oneTouch')), t('oneTouchHint')),
        row(
          'info',
          t('tutRestart'),
          (() => {
            const b = h('button', { type: 'button', class: 'btn', style: 'min-height:40px', 'aria-label': t('tutRestart') }, ic('rebirth', 24));
            b.addEventListener('click', () => {
              ctx.sound('tap');
              m.close();
              ctx.restartTutorial();
            });
            return b;
          })(),
          t('tutRestartHint'),
        ),
      ),
      group(
        t('graphics'),
        row(
          'layers',
          t('quality'),
          segc(
            [
              { v: 'auto', label: t('qAuto') },
              { v: 'low', label: t('qLow') },
              { v: 'medium', label: t('qMedium') },
              { v: 'high', label: t('qHigh') },
            ] as { v: Settings['quality']; label: string }[],
            () => ctx.view.settings.quality,
            (v) => set('quality', v),
          ),
        ),
        ...(ctx.deps.onScreenshot
          ? [
              row(
                'camera',
                t('screenshot'),
                (() => {
                  const b = h('button', { type: 'button', class: 'btn', style: 'min-height:40px' }, ic('download', 24));
                  b.setAttribute('aria-label', t('screenshot'));
                  b.addEventListener('click', () => ctx.deps.onScreenshot?.());
                  return b;
                })(),
              ),
            ]
          : []),
      ),
      group(t('privacy'), row('stats', t('analytics'), sw('analytics', t('analytics')), t('analyticsHint'))),
    );

    // Save data
    const box = h('textarea', { class: 'save-box', spellcheck: 'false', placeholder: t('savePlaceholder'), 'aria-label': t('saveData') });
    const exp = h('button', { type: 'button', class: 'btn' }, ic('upload', 24), t('exportSave'));
    const copy = h('button', { type: 'button', class: 'btn' }, ic('copy', 24), t('copy'));
    const imp = h('button', { type: 'button', class: 'btn' }, ic('download', 24), t('importSave'));
    const reset = h('button', { type: 'button', class: 'btn danger-ghost block', style: 'margin-top:8px' }, ic('trash', 24), t('resetSave'));
    exp.addEventListener('click', () => {
      box.value = ctx.deps.exportSave();
      box.focus();
      box.select();
    });
    copy.addEventListener('click', async () => {
      if (!box.value) box.value = ctx.deps.exportSave();
      try {
        await navigator.clipboard.writeText(box.value);
        ctx.toast(t('copied'), 'good', 'check');
      } catch {
        box.focus();
        box.select();
      }
    });
    imp.addEventListener('click', () => {
      const s = box.value.trim();
      if (!s) {
        box.focus();
        return;
      }
      const ok = ctx.deps.importSave(s);
      ctx.toast(ok ? t('importOk') : t('importFail'), ok ? 'good' : 'bad', ok ? 'check' : 'warning');
      if (ok) m.close();
    });
    reset.addEventListener('click', () => {
      if (!resetArmed || performance.now() > resetArmed) {
        resetArmed = performance.now() + 4000;
        reset.className = 'btn danger block';
        reset.lastChild!.textContent = t('resetConfirm');
        ctx.vibrate(20);
        setTimeout(() => {
          if (resetArmed && performance.now() > resetArmed) {
            resetArmed = 0;
            reset.className = 'btn danger-ghost block';
            reset.lastChild!.textContent = t('resetSave');
          }
        }, 4100);
        return;
      }
      resetArmed = 0;
      ctx.vibrate([40, 40, 80]);
      ctx.deps.resetSave();
      m.close();
    });
    m.body.append(
      h('div', { class: 'set-group' }, h('h4', null, t('saveData')), box, h('div', { class: 'btn-row' }, exp, copy, imp), reset),
      h(
        'div',
        { class: 'set-group' },
        h('h4', null, t('credits')),
        h(
          'div',
          { class: 'set-card credits' },
          h('span', { html: logo(44), style: 'flex:none' }),
          h(
            'div',
            null,
            h('p', null, t('creditsGame')),
            h('p', null, t('creditsLenia')),
            h('p', null, t('creditsKeys')),
          ),
        ),
      ),
    );
  };
  build();
  m.update = (v) => {
    for (const r of refs) r.update(v.settings);
  };
  m.relabel = () => {
    const st = m.body.scrollTop;
    build();
    m.body.scrollTop = st;
  };
  return m;
}

// ───────────────────────────── Species card ─────────────────────────────

export function openSpecies(host: ModalHost, ctx: Ctx, id: string): ModalHandle {
  const m = host.show({ kind: 'species', title: t('tabBestiary'), titleIcon: 'bestiary' });
  let key = '';
  let renaming = false;
  ctx.actions.markSpeciesSeen(id);

  const render = (v: GameView) => {
    const s = v.species.find((x) => x.id === id);
    if (!s) {
      m.close();
      return;
    }
    const lang = getLang();
    const k = JSON.stringify([s.name, s.catalogName, s.timesSeen, s.behavior, s.mult, v.samples >= s.printCost, v.calibration.mu, v.calibration.sigma, lang, renaming]);
    if (k === key) return;
    if (renaming && m.body.contains(document.activeElement)) return;
    key = k;
    m.body.textContent = '';
    m.body.appendChild(speciesBody(s, v, ctx, () => {
      renaming = true;
      key = '';
      render(ctx.view);
    }, (name) => {
      renaming = false;
      if (name !== null) ctx.actions.renameSpecies(id, name);
      key = '';
      render(ctx.view);
    }, renaming, () => {
      m.close();
      ctx.enterPrintMode(id);
    }));
  };
  render(ctx.view);
  m.update = render;
  m.relabel = () => {
    key = '';
    render(ctx.view);
  };
  return m;
}

function speciesBody(
  s: SpeciesView,
  v: GameView,
  ctx: Ctx,
  startRename: () => void,
  endRename: (name: string | null) => void,
  renaming: boolean,
  print: () => void,
): HTMLElement {
  const lang = getLang();
  const portrait = h('div', { class: `portrait r-${s.rarity}` });
  if (s.portrait) portrait.appendChild(h('img', { src: portraitURL(s.portrait), alt: '' }));
  else portrait.appendChild(h('span', { class: 'noimg' }));

  let title: HTMLElement;
  if (renaming) {
    const input = h('input', { type: 'text', maxlength: '28', value: s.name, 'aria-label': t('rename') });
    const ok = h('button', { type: 'button', class: 'btn primary', 'aria-label': t('save') }, ic('check', 24));
    ok.addEventListener('click', () => endRename(input.value.trim() || s.name));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') endRename(input.value.trim() || s.name);
      if (e.key === 'Escape') {
        e.stopPropagation();
        endRename(null);
      }
    });
    title = h('div', { class: 'rename-form' }, input, ok);
    requestAnimationFrame(() => {
      input.focus();
      input.select();
    });
  } else {
    const renameBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': t('rename'), html: icon('pencil', 20) });
    renameBtn.addEventListener('click', startRename);
    const main = s.catalogName ?? s.name;
    title = h('div', { class: 'spc-title' }, h('h2', { class: s.catalogName ? 'latin' : '' }, main), renameBtn);
  }
  const sub = s.catalogName && s.name !== s.catalogName ? h('div', { class: 'spc-sub' }, `“${s.name}”`) : null;

  const bcol = s.behavior ? BEHAVIOR_COLOR[s.behavior] : '#8B98A5';
  const badges = h(
    'div',
    { class: 'badges' },
    h('span', { class: `badge r-${s.rarity}` }, ic('sparkle', 24), rarityName(s.rarity)),
    h('span', { class: 'badge', style: `color:${bcol}` }, ic(s.behavior ?? 'unknown', 24), behaviorName(s.behavior)),
    h('span', { class: 'badge' }, `${t('era')} ${s.era}`),
  );
  const stat = (label: string, value: string) =>
    h('div', { class: 'stat' }, h('div', { class: 's-l' }, label), h('div', { class: 's-v' }, value));
  const grid = h(
    'div',
    { class: 'spc-grid' },
    stat(t('multiplier'), `×${fmtFixed(s.mult, 2, lang)}`),
    stat(t('timesSeen'), fmt(s.timesSeen, lang)),
    stat(t('muRange'), `${s.muRange[0].toFixed(3)}–${s.muRange[1].toFixed(3)}`),
    stat(t('sigmaRange'), `${s.sigmaRange[0].toFixed(4)}–${s.sigmaRange[1].toFixed(4)}`),
  );
  const c = v.calibration;
  const tol = 0.004;
  const outOf =
    c.mu < s.muRange[0] - tol || c.mu > s.muRange[1] + tol || c.sigma < s.sigmaRange[0] - tol / 2 || c.sigma > s.sigmaRange[1] + tol / 2;
  const warn = outOf ? h('div', { class: 'warnline spc-warn' }, ic('warning', 24), h('span', null, t('outOfRegime'))) : null;
  const canPrint = v.samples >= s.printCost;
  const printBtn = h(
    'button',
    { type: 'button', class: 'btn block good' },
    ic('print', 24),
    `${t('print')} · `,
    h('span', { class: 'mono', style: 'display:inline-flex;align-items:center;gap:3px', html: `${icon('samples', 16)}${fmt(s.printCost, lang)}` }),
  );
  printBtn.disabled = !canPrint;
  printBtn.addEventListener('click', print);
  void ctx;
  return h(
    'div',
    { class: 'spc' },
    portrait,
    title,
    sub,
    badges,
    grid,
    warn,
    printBtn,
    h('div', { class: 'print-hint' }, t('printHint')),
  );
}

// ───────────────────────────── Offline card ─────────────────────────────

export function openOffline(host: ModalHost, seconds: number, essence: number, reduceMotion: boolean): ModalHandle {
  const m = host.show({ kind: 'offline', center: true });
  const lang = getLang();
  const amount = h('span', { class: 'mono' }, '+0');
  const go = h('button', { type: 'button', class: 'btn primary block' }, t('offlineGo'));
  go.addEventListener('click', () => m.close());
  m.body.appendChild(
    h(
      'div',
      { class: 'big-card' },
      h('div', { class: 'bc-ic' }, ic('moon', 24)),
      h('h2', null, t('offlineTitle')),
      h('div', { class: 'bc-amount' }, ic('essence', 24), amount),
      h('div', { class: 'bc-sub' }, t('offlineIn', { t: fmtDuration(seconds, lang) })),
      go,
    ),
  );
  // Count-up for a satisfying reveal.
  const t0 = performance.now();
  const dur = reduceMotion ? 0 : 900;
  const step = () => {
    const p = dur ? Math.min(1, (performance.now() - t0) / dur) : 1;
    const e = 1 - Math.pow(1 - p, 3);
    setText(amount, '+' + fmt(essence * e, lang));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  return m;
}

// ───────────────────────────── Era summary ─────────────────────────────

export interface EraSummary {
  era: number;
  genome: number;
  duration: number | null;
  essence: number;
  newSpecies: number;
  best: { name: string; eps: number } | null;
}

export function openEraSummary(host: ModalHost, sum: EraSummary, onOpenTree: () => void): ModalHandle {
  const m = host.show({ kind: 'era', center: true, dismissable: false });
  const lang = getLang();
  const row = (l: string, v: string) => h('div', { class: 'era-row' }, h('span', null, l), h('span', null, v));
  const go = h('button', { type: 'button', class: 'btn violet block' }, ic('genome', 24), t('openGenome'));
  go.addEventListener('click', () => {
    m.close();
    onOpenTree();
  });
  m.body.appendChild(
    h(
      'div',
      { class: 'big-card' },
      h('div', { class: 'bc-ic', style: 'color:var(--violet);background:radial-gradient(circle,rgba(184,146,255,.25),rgba(184,146,255,.04) 65%,transparent 70%)' }, ic('rebirth', 24)),
      h('h2', null, t('eraEnd', { n: sum.era })),
      h(
        'div',
        { class: 'era-rows' },
        sum.duration !== null ? row(t('eraDuration'), fmtDuration(sum.duration, lang)) : null,
        row(t('eraEssence'), fmt(sum.essence, lang)),
        row(t('eraNewSpecies'), String(sum.newSpecies)),
        sum.best ? row(t('eraBest'), `${sum.best.name} · +${fmtRate(sum.best.eps, lang)}/s`) : null,
      ),
      h('div', { class: 'era-gain-l' }, t('genomeGained')),
      h('div', { class: 'era-gain' }, ic('genome', 24), `+${fmt(sum.genome, lang)}`),
      go,
    ),
  );
  return m;
}
