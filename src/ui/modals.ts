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
import { fmt, fmtDuration, fmtFixed, fmtRate, fmtShort } from './format';
import { behaviorName, getLang, rarityName, t, tx } from './i18n';
import { icon, logo } from './icons';
import { portraitURL } from './portrait';
import { EXPORT_PREFIX } from '../game/balance';
import { WORLD_TEXT } from '../game/treeText';
import { isWorldId } from '../game/worlds';
import { base64ToUtf8, deserializeState } from '../game/state';
import { BUILD_DATE, VERSION_LABEL } from '../version';

export interface ModalHandle {
  readonly wrap: HTMLElement;
  readonly body: HTMLElement;
  readonly kind: string;
  close(): void;
  update?(v: GameView): void;
  /** Rebuild after a language change. */
  relabel?(): void;
  /** Change the title (and the close button's label) after a language change. */
  setTitle?(title: string): void;
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
    let close: HTMLButtonElement | null = null;
    if (opts.title !== undefined) {
      titleEl.textContent = opts.title;
      modal.setAttribute('aria-label', opts.title);
      close = h('button', { type: 'button', class: 'modal-close', 'aria-label': t('close'), html: icon('close') });
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
      setTitle: (title: string) => {
        titleEl.textContent = title;
        modal.setAttribute('aria-label', title);
        close?.setAttribute('aria-label', t('close'));
      },
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

// ───────────────────────────── Achievement card ─────────────────────────────

/**
 * Small centred card for a just-unlocked achievement (tapping its toast), instead of the half-screen
 * Journal (QA2 H-29). "See all" opens the achievements list.
 */
export function openAchievementCard(host: ModalHost, ctx: Ctx, id: string, openList: () => void): ModalHandle {
  const m = host.show({ kind: 'achievement', center: true });
  const a = ctx.view.achievements.find((x) => x.id === id);
  const close = h('button', { type: 'button', class: 'btn' }, t('close'));
  close.addEventListener('click', () => m.close());
  const all = h('button', { type: 'button', class: 'btn primary' }, ic('trophy', 24), t('achievementsAll'));
  all.addEventListener('click', () => {
    m.close();
    openList();
  });
  m.body.append(
    h(
      'div',
      { class: 'ach-card' },
      h('div', { class: 'ach-card-ic' }, ic('trophy', 24)),
      h('div', { class: 'ach-card-kicker' }, t('achievement')),
      h('h2', null, a ? tx(a.name) : id),
      a && tx(a.desc) ? h('p', null, tx(a.desc)) : null,
      a?.reward ? h('p', { class: 'ach-card-reward' }, tx(a.reward)) : null,
      h('div', { class: 'ach-card-actions' }, close, all),
    ),
  );
  return m;
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
          // Where production comes from (QA3 F13), when the game exposes it.
          ...(v.multipliers
            ? [stat(t('multGlobal'), `×${fmtFixed(v.multipliers.global, 2, lang)}`), stat(t('multBuffs'), `×${fmtFixed(v.multipliers.buffs, 2, lang)}`)]
            : []),
        ),
      );
      // Each factor of the production multiplier (Genoma, mejoras, logros, secretos…), when listed.
      const parts = v.multipliers?.parts?.filter((p) => Math.abs(p.mult - 1) > 1e-6) ?? [];
      if (parts.length)
        content.appendChild(
          h(
            'div',
            { class: 'stats mult-parts', role: 'group', 'aria-label': t('multParts') },
            ...parts.map((p) => stat(tx(p.name), `×${fmtFixed(p.mult, 2, lang)}`)),
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
    /** A row whose control drops to its own line (long segmented controls; QA2 H-13). */
    const wrapRow = (iconName: string, label: string, control: HTMLElement, hint?: string) => {
      const r = row(iconName, label, control, hint);
      r.classList.add('wrap');
      return r;
    };
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
        row(
          'textsize',
          t('textSize'),
          segc(
            [
              { v: 'normal', label: t('textNormal') },
              { v: 'large', label: t('textLarge') },
            ] as { v: 'normal' | 'large'; label: string }[],
            () => ctx.textSize(),
            (v) => {
              ctx.sound('toggle');
              ctx.setTextSize(v);
            },
          ),
        ),
      ),
      group(
        t('customize'),
        ...(ctx.deps.openWardrobe
          ? [
              row(
                'hanger',
                t('wardrobe'),
                (() => {
                  const b = h('button', { type: 'button', class: 'btn', style: 'min-height:40px', 'aria-label': t('wardrobe'), 'data-testid': 'open-wardrobe' }, ic('hanger', 24));
                  b.addEventListener('click', () => {
                    ctx.sound('open');
                    m.close();
                    ctx.deps.openWardrobe?.();
                  });
                  return b;
                })(),
                t('wardrobeHint'),
              ),
            ]
          : []),
        // The store is only offered here (never in the HUD), and only where it may show.
        ...(ctx.deps.openStore
          ? [
              row(
                'bag',
                t('storeOpen'),
                (() => {
                  const b = h('button', { type: 'button', class: 'btn', style: 'min-height:40px', 'aria-label': t('storeOpen'), 'data-testid': 'open-store' }, ic('bag', 24));
                  b.addEventListener('click', () => {
                    ctx.sound('open');
                    m.close();
                    ctx.deps.openStore?.();
                  });
                  return b;
                })(),
                t('storeHint'),
              ),
            ]
          : []),
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
        wrapRow(
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
    // Extra sections from the integrator (the story archive "Historia").
    if (ctx.deps.settingsSections) {
      const extra = h('div', { class: 'set-extra' });
      m.body.append(extra);
      ctx.deps.settingsSections(extra);
    }
    // Which build is this? (the owner checks every deployment)
    m.body.append(
      h(
        'div',
        { class: 'set-version', 'data-testid': 'settings-version' },
        `Bioluma ${VERSION_LABEL}`,
        BUILD_DATE ? ` · ${BUILD_DATE.slice(0, 16).replace('T', ' ')} UTC` : '',
      ),
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
    // Import (QA1 #7): say what is wrong, and replacing the current game takes a second tap.
    let importArmed = 0;
    imp.addEventListener('click', () => {
      const s = box.value.trim();
      if (!s) {
        ctx.toast(t('importEmpty'), 'warn', 'info');
        box.focus();
        return;
      }
      const other = /^[A-Z]+\d+\./.exec(s);
      if (other && !s.startsWith(EXPORT_PREFIX)) {
        ctx.toast(t('importVersion'), 'bad', 'warning');
        return;
      }
      // A string that cannot load is rejected on the first tap; only a valid save asks to confirm.
      if (!importable(s)) {
        ctx.toast(t('importFail'), 'bad', 'warning');
        return;
      }
      if (!importArmed || performance.now() > importArmed) {
        importArmed = performance.now() + 4000;
        imp.classList.add('danger');
        imp.lastChild!.textContent = t('importConfirm');
        ctx.vibrate(15);
        setTimeout(() => {
          if (importArmed && performance.now() > importArmed) {
            importArmed = 0;
            imp.classList.remove('danger');
            imp.lastChild!.textContent = t('importSave');
          }
        }, 4100);
        return;
      }
      importArmed = 0;
      const ok = ctx.deps.importSave(s);
      ctx.toast(ok ? t('importOk') : t('importFail'), ok ? 'good' : 'bad', ok ? 'check' : 'warning');
      if (ok) m.close();
      else {
        imp.classList.remove('danger');
        imp.lastChild!.textContent = t('importSave');
      }
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
    m.setTitle?.(t('settings'));
    build();
    m.body.scrollTop = st;
  };
  return m;
}

// ───────────────────────────── Species card ─────────────────────────────

/** Longest custom species name (QA1 #5). */
const NAME_MAX = 24;

/** First `max` user-perceived characters (never splits an emoji or an accented letter). */
export function cutGraphemes(s: string, max: number): string {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(x: string): Iterable<{ segment: string }> } }).Segmenter;
  const parts = Seg ? Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment) : Array.from(s);
  return parts.length > max ? parts.slice(0, max).join('') : s;
}

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
    const k = JSON.stringify([s.name, s.catalogName, s.scientificName, s.hue, s.production ? fmtRate(s.production.eps, lang) : '', s.production?.members, s.boostedBy?.map((b) => b.id), s.timesSeen, s.behavior, s.mult, s.copyCost, s.copyBlocked, s.copyCost !== null && s.copyCost !== undefined ? v.essence >= s.copyCost : null, s.world, v.session?.world, lang, renaming]);
    if (k === key) return;
    // Do not rebuild under the player's fingers while they type the new name (only the input counts:
    // the pencil keeping focus must not block opening the field, QA1 #2).
    if (renaming && (document.activeElement as HTMLElement | null)?.closest?.('.rename-form')) return;
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
    m.setTitle?.(t('tabBestiary'));
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
  /** Species identity is on (the game sends a scientific line): plain name as the title. */
  const named = s.scientificName !== undefined;
  const portrait = h('div', { class: `portrait r-${s.rarity}` });
  if (s.portrait) portrait.appendChild(h('img', { src: portraitURL(s.portrait, s.hue), alt: '' }));
  else portrait.appendChild(h('span', { class: 'noimg' }));

  let title: HTMLElement;
  if (renaming) {
    const input = h('input', { type: 'text', maxlength: String(NAME_MAX), value: s.name, 'aria-label': t('rename') });
    const ok = h('button', { type: 'button', class: 'btn primary', 'aria-label': t('save') }, ic('check', 24));
    const done = () => endRename(cutGraphemes(input.value.trim(), NAME_MAX) || s.name);
    ok.addEventListener('click', done);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done();
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
    // With species identity (scientificName present) the title is its plain name and the Latin goes below.
    const main = named ? s.name : (s.catalogName ?? s.name);
    title = h('div', { class: 'spc-title' }, h('h2', { class: !named && s.catalogName ? 'latin' : '' }, main), renameBtn);
  }
  const sub = named
    ? s.scientificName && s.scientificName !== s.name
      ? h('div', { class: 'spc-sub spc-sci' }, s.scientificName)
      : null
    : s.catalogName && s.name !== s.catalogName
      ? h('div', { class: 'spc-sub' }, `“${s.name}”`)
      : null;

  // The theme's behaviour colour (AA on paper too: no lime on white, docs/ARTE.md §3).
  const bcol = s.behavior ? `var(--bl-beh-${s.behavior}, ${BEHAVIOR_COLOR[s.behavior]})` : 'var(--dim)';
  // Its behaviour explains itself (Behaviour Guide) when the integrator offers it.
  const behBadge = ctx.deps.onBehaviorInfo
    ? h('button', { type: 'button', class: 'badge badge-link', style: `color:${bcol}`, 'aria-label': `${behaviorName(s.behavior)}: ${t('behaviorGuideAria')}` }, ic(s.behavior ?? 'unknown', 24), behaviorName(s.behavior), ic('info', 24))
    : h('span', { class: 'badge', style: `color:${bcol}` }, ic(s.behavior ?? 'unknown', 24), behaviorName(s.behavior));
  if (ctx.deps.onBehaviorInfo) behBadge.addEventListener('click', () => ctx.deps.onBehaviorInfo?.(s.behavior));
  const badges = h(
    'div',
    { class: 'badges' },
    // Colour family · body shape · behaviour (species identity, optional fields), then rarity and era.
    s.colorName ? h('span', { class: 'badge badge-color' }, h('i', { class: 'sw', 'aria-hidden': 'true' }), tx(s.colorName)) : null,
    s.shapeLabel ? h('span', { class: 'badge' }, tx(s.shapeLabel)) : null,
    behBadge,
    h('span', { class: `badge r-${s.rarity}` }, ic('sparkle', 24), rarityName(s.rarity)),
    h('span', { class: 'badge' }, `${t('era')} ${s.era}`),
  );
  const stat = (label: string, value: string) =>
    h('div', { class: 'stat' }, h('div', { class: 's-l' }, label), h('div', { class: 's-v' }, value));
  const grid = h(
    'div',
    { class: 'spc-grid' },
    stat(t('multiplier'), t('multiplierValue', { v: fmtShort(s.mult, lang) })),
    stat(t('timesSeen'), t('timesSeenValue', { n: fmt(s.timesSeen, lang) })),
    // What it earns right now, all of its living members together (game: SpeciesView.production).
    s.production ? stat(t('spcEarnsNow'), `+${fmtRate(s.production.eps, lang)}${t('perSec')}`) : null,
    s.production ? stat(t('spcAliveNow'), fmt(s.production.members, lang)) : null,
  );
  // The upgrades that make it earn more (game: SpeciesView.boostedBy).
  const boosted = s.boostedBy?.length
    ? h('div', { class: 'spc-boost' }, ic('bolt', 24), h('span', null, `${t('spcBoostedBy')} `, h('b', null, s.boostedBy.map((b) => tx(b.name)).join(' · '))))
    : null;
  // Where it lives, in words (CLARIDAD J-09): no μ/σ on screen.
  const home = s.world && isWorldId(s.world) ? s.world : null;
  const homeName = home ? tx(WORLD_TEXT[home]?.name) : '';
  if (homeName) grid.append(stat(t('livesIn'), homeName));
  // Only when this session plays in another World (J-10): a fact, not a threat.
  const here = v.session?.world;
  const warn =
    homeName && here && here !== home
      ? h('div', { class: 'warnline spc-warn' }, ic('info', 24), h('span', null, t('outOfRegime', { world: homeName })))
      : null;
  // A copy (Copiadora, CLARIDAD J-34): the game says what it costs now in Esencia (0 = the Archivo's
  // free copy), or why there is none; no button when there is nothing to say.
  const cost = s.copyCost ?? null;
  const canPrint = cost !== null && v.essence >= cost;
  const printBtn =
    cost !== null
      ? h(
          'button',
          { type: 'button', class: 'btn block good' },
          ic('print', 24),
          `${t('makeCopy')} · `,
          h('span', { class: 'mono', style: 'display:inline-flex;align-items:center;gap:3px', html: cost === 0 ? t('copyFree') : `${icon('essence', 16)}${fmt(cost, lang)}` }),
        )
      : null;
  if (printBtn) {
    printBtn.disabled = !canPrint;
    printBtn.addEventListener('click', print);
  }
  void ctx;
  const root = h(
    'div',
    { class: s.hue !== undefined ? 'spc has-sp' : 'spc' },
    portrait,
    title,
    sub,
    badges,
    grid,
    boosted,
    warn,
    printBtn,
    printBtn ? h('div', { class: 'print-hint' }, t('copyHint')) : null,
  );
  // The species' own colour (accent of its portrait ring, title and colour chip).
  if (s.hue !== undefined) root.style.setProperty('--sp', `hsl(${Math.round(s.hue)} 70% 60%)`);
  return root;
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

/** Same checks as game.importString, without touching the game. */
function importable(s: string): boolean {
  if (!s.startsWith(EXPORT_PREFIX)) return false;
  try {
    return deserializeState(base64ToUtf8(s.slice(EXPORT_PREFIX.length))) !== null;
  } catch {
    return false;
  }
}
