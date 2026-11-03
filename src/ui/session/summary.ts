/**
 * "Fin de la sesión N" (docs/CICLO.md §3.3): the end-of-session card.
 *
 *  - VELA's portrait says one line (session.ts velaKey).
 *  - The Datos as a visual equation that adds up, row by row (owner: "Esencia ganada 1.240 → ÷100 =
 *    12 Datos + 3 especies nuevas ×5 = 27 Datos"), each row sliding in and the total counting up.
 *  - Today's species with portraits ("¡Nueva!"), the best creature, the records beaten.
 *  - Two big buttons: "Ir al Árbol" (green, with "3 mejoras listas") and "Nueva sesión"; when
 *    nothing is affordable "Nueva sesión" leads and the tree button says what is missing.
 */
import type { Lang, Pattern, Text } from '../../core/types';
import * as C from '../../game/cycleBalance';
import type { DatosBreakdown, SessionSummary } from '../../game/session';
import { velaLine } from '../../game/session';
import { DATOS_NAME, SESSION_UI } from '../../game/treeText';
import { fmt, fmtClock, fmtRate } from '../format';
import type { PriceExplain } from '../moments/price';
import { mountPortrait } from '../portrait';
import { Portrait } from '../story/portraits';
import { treeIcon } from '../tree/icons';
import { countUp, ease, pop, staggerDelay, DURATION, EASING, SPRING, springEasing } from '../art/motion';
import '../art/art.css';
import './session.css';

export interface SummarySpecies {
  name: string;
  portrait: Pattern | null;
  hue?: number;
}

export interface SummaryExtras {
  /** Tree nodes affordable after banking this session. */
  affordable: number;
  /** The cheapest thing still to buy when nothing is affordable. */
  nextGoal?: { name: Text; missing: number; sessions: number | null } | null;
}

export type SummarySound = 'open' | 'tally' | 'total';

export interface SessionSummaryOptions {
  lang(): Lang;
  reduceMotion?(): boolean;
  speciesInfo(id: string): SummarySpecies | null;
  onTree(): void;
  onNext(): void;
  onSound?(kind: SummarySound): void;
  /** Dev/screenshots: skip the staged animation (everything shown at once). */
  instant?: boolean;
}

export interface SessionSummaryView {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  show(sum: SessionSummary, extras: SummaryExtras): void;
  hide(): void;
  dispose(): void;
}

/**
 * The summary's tally (docs/ARTE-PULIDO.md B-11, B-6), ms: rows light from `start`, `step` apart, each
 * counting in `row`; the total counts in `total` (easeOutCubic), pops in `pop` and an aurora light
 * crosses it in `sweep`. Everything within `budget`.
 */
export const SUMMARY_TALLY = { start: 200, step: 120, row: 300, total: 900, pop: 260, sweep: 600, budget: 1800 } as const;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const dec = (x: number, l: Lang): string => String(Math.round(x * 100) / 100).replace('.', l === 'es' ? ',' : '.');

/** One row of the equation (pure, for tests and the dev page). */
export interface EqRow {
  kind: 'essence' | 'mult' | 'species' | 'variants' | 'behaviors' | 'encargos' | 'goldens' | 'records' | 'book' | 'minimum';
  /** Tiles left of the "=" ("1.240 Esencia ganada", "÷", "100 …"). */
  tiles: { icon?: string; color?: string; value: string; label: string }[];
  ops: string[];
  /** What the row adds or yields (shown on the right). */
  result: string;
}

/**
 * The Datos equation as rows: essence ÷ 100 = base; × night = fromEssence; + each discovery term;
 * + Gran enciclopedia (a % of everything so far); + the minimum top-up. Every number adds up.
 */
export function equationRows(d: DatosBreakdown, l: Lang, night: number, first = false): EqRow[] {
  const rows: EqRow[] = [];
  rows.push({
    kind: 'essence',
    tiles: [
      { icon: 'drop', color: 'var(--bl-accent)', value: fmt(d.essence, l), label: SESSION_UI.earned[l] },
      { value: fmt(d.div, l), label: SESSION_UI.oneDato[l] },
    ],
    ops: ['÷'],
    result: fmt(d.base, l),
  });
  if (d.nightMult > 1) {
    rows.push({
      kind: 'mult',
      tiles: [
        { value: fmt(d.base, l), label: DATOS_NAME[l] },
        { icon: 'moon', color: 'var(--bl-moon)', value: `×${dec(d.nightMult, l)}`, label: SESSION_UI.nightBonus(night)[l] },
      ],
      ops: [''],
      result: fmt(d.fromEssence, l),
    });
  }
  const META: Record<DatosBreakdown['terms'][number]['kind'], { icon: string; color: string; label: Text }> = {
    species: { icon: 'species', color: 'var(--bl-good)', label: SESSION_UI.newSpecies },
    variants: { icon: 'species', color: 'var(--bl-accent)', label: SESSION_UI.newVariants },
    behaviors: { icon: 'behavior', color: 'var(--bl-accent)', label: SESSION_UI.newBehaviors },
    // Session 1 shows no Encargo: what it counts there are the first goals (sow, a creature that stays).
    encargos: { icon: 'encargo', color: 'var(--bl-gold)', label: first ? SESSION_UI.firstSteps : SESSION_UI.encargos },
    goldens: { icon: 'spark', color: 'var(--bl-gold)', label: SESSION_UI.sparks },
    records: { icon: 'trophy', color: 'var(--bl-gold)', label: SESSION_UI.records },
  };
  for (const t of d.terms) {
    const m = META[t.kind];
    rows.push({
      kind: t.kind,
      tiles: [{ icon: m.icon, color: m.color, value: `${t.count} × ${t.each}`, label: m.label[l] }],
      ops: [],
      result: `+${fmt(t.value, l)}`,
    });
  }
  if (d.book > 0) {
    rows.push({
      kind: 'book',
      tiles: [
        { value: fmt(d.sub, l), label: DATOS_NAME[l] },
        { icon: 'encyclopedia', color: 'var(--bl-aurora)', value: `${Math.round((d.bookMult - 1) * 100)} %`, label: SESSION_UI.encyclopedia[l] },
      ],
      ops: ['×'],
      result: `+${fmt(d.book, l)}`,
    });
  }
  if (d.minimum > 0) rows.push({ kind: 'minimum', tiles: [{ icon: 'gift', color: 'var(--bl-good)', value: `+${d.minimum}`, label: SESSION_UI.minimum[l] }], ops: [], result: `+${fmt(d.minimum, l)}` });
  return rows;
}

/**
 * The Datos of a session (so far) as the shared "¿Por qué?" sheet (src/ui/moments/price.ts): the
 * HUD preview opens it. [Esencia ÷ 100] × [night] = Datos, one row per extra, the rule in words and
 * the next node they reach ("Más tiempo: faltan 4").
 */
export function datosExplain(d: DatosBreakdown, l: Lang, night: number, goal?: { name: Text; missing: number } | null): PriceExplain {
  // The equation is only the multiplied part (Esencia ÷ 100 × night = Datos from Esencia); every
  // extra is a "+" row under it and the last row is the total, so every number shown adds up.
  const terms: PriceExplain['terms'] = [
    { icon: 'essence', value: fmt(d.base, l), label: l === 'es' ? `${fmt(d.essence, l)} Esencia ÷ ${d.div}` : `${fmt(d.essence, l)} Essence ÷ ${d.div}`, active: true },
  ];
  if (d.nightMult > 1) terms.push({ icon: 'moon', value: `×${dec(d.nightMult, l)}`, label: SESSION_UI.nightBonus(night)[l], active: true });
  const KIND: Record<DatosBreakdown['terms'][number]['kind'], { icon: PriceExplain['totalIcon']; label: Text }> = {
    species: { icon: 'creatures', label: SESSION_UI.newSpecies },
    variants: { icon: 'creatures', label: SESSION_UI.newVariants },
    behaviors: { icon: 'behavior', label: SESSION_UI.newBehaviors },
    encargos: { icon: 'check', label: SESSION_UI.encargos },
    goldens: { icon: 'spark', label: SESSION_UI.sparks },
    records: { icon: 'up', label: SESSION_UI.records },
  };
  const rows: NonNullable<PriceExplain['rows']> = d.terms.map((t) => ({ icon: KIND[t.kind].icon, label: `+${fmt(t.value, l)}`, text: `${KIND[t.kind].label[l]}: ${t.count} × ${t.each}`, tone: 'good' as const }));
  if (d.book > 0) rows.push({ icon: 'book', label: `+${fmt(d.book, l)}`, text: `${SESSION_UI.encyclopedia[l]} +${Math.round((d.bookMult - 1) * 100)} %`, tone: 'good' });
  if (d.minimum > 0) rows.push({ icon: 'gift', label: `+${fmt(d.minimum, l)}`, text: SESSION_UI.minimumNote(C.DATOS_MIN)[l], tone: 'info' });
  if (rows.length) rows.push({ icon: 'book', label: '=', text: `${fmt(d.total, l)} ${DATOS_NAME[l]}${l === 'es' ? ' al terminar' : ' at the end'}`, tone: 'info' });
  return {
    title: SESSION_UI.conversionTitle[l],
    icon: 'book',
    total: fmt(d.fromEssence, l),
    totalLabel: DATOS_NAME[l],
    totalIcon: 'book',
    terms,
    rows,
    rule: `${SESSION_UI.conversionRule(d.div)[l]}. ${
      l === 'es' ? 'Las especies nuevas, los encargos y los récords suman más. Al terminar, todo va al Árbol.' : 'New species, requests and records add more. At the end, it all goes to the Tree.'
    }`,
    advice: goal ? (goal.missing > 0 ? SESSION_UI.previewNext(goal.name[l], fmt(goal.missing, l))[l] : SESSION_UI.previewReady(goal.name[l])[l]) : undefined,
    closeLabel: l === 'es' ? 'Cerrar' : 'Close',
  };
}

function rowHtml(r: EqRow, i: number, pending: boolean): string {
  const tiles = r.tiles
    .map((t, k) => {
      const op = k > 0 ? (r.ops[k - 1] ? `<span class="ss-op">${esc(r.ops[k - 1])}</span>` : '') : r.kind !== 'essence' && r.kind !== 'mult' ? '<span class="ss-op">+</span>' : '';
      return `${op}<span class="ss-t"${t.color ? ` style="--c:${t.color}"` : ''}>${t.icon ? `<span class="ic">${treeIcon(t.icon, 20)}</span>` : ''}<span><b>${esc(t.value)}</b><span class="l">${esc(
        t.label,
      )}</span></span></span>`;
    })
    .join('');
  return `<div class="ss-row${pending ? ' pending' : ''}" data-i="${i}"><div class="ss-lhs">${tiles}</div><div class="ss-rhs">= <span class="v">${esc(r.result)}</span></div></div>`;
}

export function createSessionSummary(root: HTMLElement, opts: SessionSummaryOptions): SessionSummaryView {
  const rm = () => !!opts.reduceMotion?.();
  const layer = document.createElement('div');
  layer.className = 'ss-layer';
  layer.hidden = true;
  layer.innerHTML = `<div class="ss-scrim"></div><section class="ss-card" role="dialog" aria-modal="true"></section>`;
  root.appendChild(layer);
  const card = layer.querySelector('.ss-card') as HTMLElement;
  let open = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let raf = 0;
  let portrait: Portrait | null = null;

  function clearTimers(): void {
    for (const t of timers) clearTimeout(t);
    timers = [];
    cancelAnimationFrame(raf);
  }

  function speciesBlock(sum: SessionSummary, l: Lang): string {
    if (!sum.species.length) return '';
    const items = sum.species
      .slice(0, 8)
      .map((s) => {
        const info = opts.speciesInfo(s.id);
        const hue = info?.hue ?? 195;
        // A new one says where it went: the dish empties, the Bestiary keeps it (CLARIDAD J-165, F-05).
        return `<div class="ss-sp" style="--hue:${hue}"><div class="pic" data-sp="${esc(s.id)}"></div><span class="nm">${esc(info?.name ?? '?')}</span>${
          s.isNew ? `<span class="new">${esc(SESSION_UI.isNew[l])}</span><span class="kept">${esc(SESSION_UI.keptShort[l])}</span>` : ''
        }</div>`;
      })
      .join('');
    return `<div class="ss-box"><h4>${esc(SESSION_UI.found[l])}</h4><div class="ss-species">${items}</div>${bestBlock(sum, l)}${recordsBlock(sum, l)}</div>`;
  }

  function bestBlock(sum: SessionSummary, l: Lang): string {
    if (!sum.best || !sum.best.speciesId) return '';
    const info = opts.speciesInfo(sum.best.speciesId);
    if (!info) return '';
    return `<div class="ss-best" style="margin-top:12px;--hue:${info.hue ?? 195}"><div class="pic" data-sp="${esc(sum.best.speciesId)}"></div><div><b>${esc(
      SESSION_UI.best[l],
    )}: ${esc(info.name)}</b><span>${esc(SESSION_UI.perSec(fmtRate(sum.best.eps, l))[l])}</span></div></div>`;
  }

  function recordsBlock(sum: SessionSummary, l: Lang): string {
    if (!sum.records.length) return '';
    const fmtRec = (k: string, v: number) => (k === 'eps' ? fmtRate(v, l) : fmt(v, l));
    return `<div class="ss-records">${sum.records
      .map(
        (r) =>
          `<span class="ss-rec">${treeIcon('trophy', 16)}<span><b>${esc(SESSION_UI.record[l])}</b> ${esc(SESSION_UI.recordName[r.kind][l])}: ${fmtRec(r.kind, r.value)} <span style="opacity:.7">(${fmtRec(
            r.kind,
            r.previous,
          )})</span></span></span>`,
      )
      .join('')}</div>`;
  }

  function paintPortraits(): void {
    for (const pic of card.querySelectorAll<HTMLElement>('[data-sp]')) {
      const info = opts.speciesInfo(pic.dataset.sp!);
      if (info?.portrait) mountPortrait(pic, info.portrait, pic.closest('.ss-best') ? 56 : 60, { hue: info.hue, fill: 0.78 });
    }
  }

  function startVela(text: string): void {
    const holder = card.querySelector('.ss-vela') as HTMLElement | null;
    if (!holder) return;
    try {
      portrait = new Portrait('ss-vela-pic');
    } catch {
      portrait = null;
    }
    if (!portrait) return;
    portrait.set('vela', 'happy');
    portrait.state.reduceMotion = rm();
    holder.prepend(portrait.canvas);
    const t0 = performance.now();
    let last = t0;
    const talkFor = rm() || opts.instant ? 0 : Math.min(2.4, 0.05 * text.length);
    const loop = () => {
      const now = performance.now();
      const t = (now - t0) / 1000;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const talking = t < talkFor;
      portrait!.frame(t, dt, talking ? 0.35 + 0.35 * Math.abs(Math.sin(t * 13)) : 0, talking);
      if (open) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  /**
   * The Datos total is the point of the card: scroll just enough that it sits above the sticky
   * buttons (audit: on a phone they covered it). Scrolls the card only, never its ancestors.
   */
  function revealTotal(smooth: boolean): void {
    const total = card.querySelector('.ss-total');
    const actions = card.querySelector('.ss-actions');
    if (!total || !actions || !open) return;
    const over = total.getBoundingClientRect().bottom - (actions.getBoundingClientRect().top - 8);
    if (over > 0) card.scrollBy({ top: over, behavior: smooth && !rm() ? 'smooth' : 'auto' });
  }

  /**
   * The tally (B-11): the rows are there from the first frame at 35 % (the structure reads, never an
   * empty box); each one lights up and counts its result in 300 ms, 120 ms after the one before; then
   * the total counts in 900 ms (easeOutCubic), pops (1 → 1.08 → 1) and a light of aurora crosses its
   * box. All of it within 1.8 s; a tap anywhere jumps to the end.
   */
  let finish: (() => void) | null = null;
  function tally(sum: SessionSummary, l: Lang): void {
    const rowEls = [...card.querySelectorAll<HTMLElement>('.ss-row')];
    const totalEl = card.querySelector('.ss-total') as HTMLElement;
    const totalNum = totalEl.querySelector('b') as HTMLElement;
    const cancels: (() => void)[] = [];
    const T = SUMMARY_TALLY;
    const START = T.start;
    // 120 ms apart, squeezed when there are many rows so the whole tally stays within its budget.
    const STEP = Math.min(T.step, (T.budget - T.start - T.total) / Math.max(1, rowEls.length - 1));
    const ROW_MS = T.row;
    const light = (r: HTMLElement) => {
      if (!r.classList.contains('pending')) return;
      r.classList.remove('pending');
      r.classList.add('in');
      const v = r.querySelector('.ss-rhs .v') as HTMLElement | null;
      const m = v ? /^([+]?)(.*)$/.exec(v.textContent ?? '') : null;
      const n = m ? Number(l === 'es' ? m[2].replace(/[.\s]/g, '').replace(',', '.') : m[2].replace(/[,\s]/g, '')) : NaN;
      if (v && m && Number.isFinite(n) && n > 1) cancels.push(countUp(v, 0, n, (x) => `${m[1]}${fmt(x, l)}`, ROW_MS));
    };
    const done = () => {
      for (const r of rowEls) light(r);
      for (const c of cancels) c();
      totalNum.textContent = fmt(sum.datos.total, l);
      totalEl.classList.add('done');
      finish = null;
    };
    finish = () => {
      clearTimers();
      done();
    };
    rowEls.forEach((r, i) => {
      timers.push(
        setTimeout(() => {
          light(r);
          opts.onSound?.('tally');
        }, START + i * STEP),
      );
    });
    // The total starts counting as the last row lights (its own 300-ms count runs alongside).
    const t0 = START + Math.max(0, rowEls.length - 1) * STEP;
    timers.push(
      setTimeout(() => {
        revealTotal(true);
        cancels.push(countUp(totalNum, 0, sum.datos.total, (x) => fmt(x, l), T.total, ease.outCubic));
        timers.push(
          setTimeout(() => {
            done();
            pop(totalNum, 1.08, T.pop);
            const sweep = totalEl.querySelector('.ss-sweep') as HTMLElement | null;
            sweep?.animate?.([{ transform: 'translateX(-110%)' }, { transform: 'translateX(110%)' }], { duration: T.sweep, easing: EASING.standard });
            opts.onSound?.('total');
          }, T.total),
        );
      }, t0),
    );
    void staggerDelay;
  }

  const api: SessionSummaryView = {
    el: layer,
    get isOpen() {
      return open;
    },
    show(sum, extras) {
      clearTimers();
      const l = opts.lang();
      const rows = equationRows(sum.datos, l, Math.max(1, Math.round((sum.datos.nightMult - 1) / C.DATOS_NIGHT_BONUS) + 1), sum.n === 1);
      const staged = !rm() && !opts.instant;
      const vela = velaLine(sum.vela)[l];
      const treeFirst = extras.affordable > 0;
      const treeSub = treeFirst
        ? (l === 'es' ? `${extras.affordable} ${extras.affordable === 1 ? 'mejora lista' : 'mejoras listas'}` : `${extras.affordable} ${extras.affordable === 1 ? 'upgrade' : 'upgrades'} ready`)
        : extras.nextGoal
          ? l === 'es'
            ? `Te faltan ${fmt(extras.nextGoal.missing, l)} para ${extras.nextGoal.name.es}`
            : `${fmt(extras.nextGoal.missing, l)} more for ${extras.nextGoal.name.en}`
          : '';
      const treeBtn = `<button type="button" class="ss-btn ${treeFirst ? 'primary' : ''}" data-act="tree">${treeIcon('tree', 26)}<span class="tx">${esc(SESSION_UI.goTree[l])}${
        treeSub ? `<small>${esc(treeSub)}</small>` : ''
      }</span></button>`;
      const nextBtn = `<button type="button" class="ss-btn ${treeFirst ? '' : 'primary'}" data-act="next">${treeIcon('play', 22)}<span class="tx">${esc(SESSION_UI.again[l])}</span></button>`;
      card.innerHTML = `
        <div class="ss-head"><h2>${esc(SESSION_UI.endTitle(sum.n)[l])}</h2><span class="ss-chip">${treeIcon('clockIcon', 15)}${fmtClock(sum.seconds)}</span></div>
        <div class="ss-vela"><div class="ss-bubble">${esc(vela)}</div></div>
        <div class="ss-box ss-eqbox"><h4>${esc(SESSION_UI.equationTitle[l])}</h4>
          <p class="ss-formula">${treeIcon('drop', 16)}${esc(SESSION_UI.conversionRule(sum.datos.div)[l])}</p>
          ${rows.map((r, i) => rowHtml(r, i, staged)).join('')}
          <div class="ss-total${staged ? '' : ' done'}"><span class="ss-sweep" aria-hidden="true"></span><span class="lbl">${treeIcon('datos', 26)}${esc(DATOS_NAME[l])}</span><b>${staged ? '0' : fmt(sum.datos.total, l)}</b></div>
          <p class="ss-kept">${esc(SESSION_UI.datosKept[l])}</p>
          ${sum.datos.minimum > 0 ? `<p class="ss-minnote">${esc(SESSION_UI.minimumNote(C.DATOS_MIN)[l])}</p>` : ''}
        </div>
        <div class="ss-side">${speciesBlock(sum, l)}${!sum.species.length ? `${recordsBlock(sum, l)}` : ''}</div>
        <div class="ss-actions">${treeFirst ? treeBtn + nextBtn : nextBtn + treeBtn}</div>`;
      card.setAttribute('aria-label', SESSION_UI.endTitle(sum.n)[l]);
      card.classList.add('wide');
      layer.hidden = false;
      layer.classList.toggle('rm', rm());
      open = true;
      opts.onSound?.('open');
      requestAnimationFrame(() => layer.classList.add('show'));
      paintPortraits();
      startVela(vela);
      if (!staged) requestAnimationFrame(() => revealTotal(false));
      // The card rises 32 px with the default spring; its sections follow 60 ms apart (B-5).
      if (!rm() && typeof card.animate === 'function') {
        card.animate([{ transform: 'translateY(32px)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
          duration: SPRING.default.ms,
          easing: springEasing('default'),
        });
        let k = 0;
        for (const sec of card.children)
          (sec as HTMLElement).animate?.([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], {
            duration: DURATION.sheet,
            delay: Math.min(5, k++) * 60,
            easing: EASING.enter,
            fill: 'backwards',
          });
      }
      if (staged) tally(sum, l);
    },
    hide() {
      if (!open) return;
      open = false;
      clearTimers();
      finish = null;
      layer.classList.remove('show');
      // Out in 200 ms `exit`, downwards (B-5).
      if (!rm() && typeof card.animate === 'function')
        card.animate([{ transform: 'none', opacity: 1 }, { transform: 'translateY(32px)', opacity: 0 }], { duration: DURATION.sheetOut, easing: EASING.exit, fill: 'forwards' });
      setTimeout(() => {
        if (!open) {
          layer.hidden = true;
          for (const a of card.getAnimations()) a.cancel();
        }
      }, rm() ? 0 : DURATION.sheetOut + 20);
    },
    dispose() {
      clearTimers();
      layer.remove();
    },
  };
  card.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    // A tap anywhere while it counts jumps to the end of the tally (B-11).
    if (finish) {
      finish();
      if (!b) return;
    }
    if (!b) return;
    if (b.dataset.act === 'tree') opts.onTree();
    else opts.onNext();
  });
  return api;
}
