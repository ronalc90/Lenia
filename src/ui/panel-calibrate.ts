/**
 * Calibrar tab: big 44 px sliders for μ, σ, R, dt within the unlocked ranges,
 * editable numeric readouts, live `setCalibration`, and saved regimes as chips.
 */
import type { CalibrationView, GameView } from '../core/types';
import { introEl, retrigger, type Ctx, type Panel } from './ctx';
import { h, ic, reconcile, setAttr, setDisabled, setStyle, setText, show, toggle } from './dom';
import { fmtParam } from './format';
import { t, type StrKey } from './i18n';
import { icon } from './icons';

type Key = 'mu' | 'sigma' | 'R' | 'dt';

const DEFS: { key: Key; label: StrKey; sym: string; step: number; range: keyof CalibrationView }[] = [
  { key: 'mu', label: 'muLabel', sym: 'μ', step: 0.001, range: 'muRange' },
  { key: 'sigma', label: 'sigmaLabel', sym: 'σ', step: 0.0001, range: 'sigmaRange' },
  { key: 'R', label: 'RLabel', sym: 'R', step: 1, range: 'RRange' },
  { key: 'dt', label: 'dtLabel', sym: 'dt', step: 0.01, range: 'dtRange' },
];

interface Slider {
  key: Key;
  step: number;
  card: HTMLElement;
  name: HTMLElement;
  num: HTMLInputElement;
  range: HTMLInputElement;
  lo: HTMLElement;
  hi: HTMLElement;
  body: HTMLElement;
  lock: HTMLElement;
  /** Ignore view values while the player is dragging/typing. */
  busyUntil: number;
  dragging: boolean;
}

interface RegimeRow {
  el: HTMLElement;
  name: HTMLElement;
  params: HTMLElement;
  del: HTMLButtonElement;
  index: number;
  armed: number;
}

export class CalibratePanel implements Panel {
  readonly el = h('section', { class: 'panel', role: 'tabpanel' });
  private scroll = h('div', { class: 'panel-scroll' });
  private sliders: Slider[] = [];
  private regimesWrap = h('div');
  private regimes = h('div', { class: 'regimes' });
  private regimeRows = new Map<string, RegimeRow>();
  private addBtn!: HTMLButtonElement;
  private form: HTMLElement | null = null;
  private regNote = h('p', { class: 'note' });
  private regCount = h('span', { class: 'count' });
  private pending: Partial<Record<Key, number>> = {};
  private raf = 0;

  constructor(private ctx: Ctx) {
    this.el.appendChild(this.scroll);
    this.build();
  }

  private build(): void {
    this.scroll.textContent = '';
    const intro = introEl(this.ctx, 'calibrate');
    if (intro) this.scroll.appendChild(intro);
    this.scroll.appendChild(h('div', { class: 'warnline', role: 'note' }, ic('warning', 24), h('span', null, t('calWarning'))));
    this.scroll.appendChild(h('div', { class: 'sec-h' }, ic('calibrate', 24), h('span', { class: 'grow' }, t('rulesOfLife'))));
    this.sliders = DEFS.map((d) => this.makeSlider(d.key, d.label, d.step, d.sym));
    for (const s of this.sliders) this.scroll.appendChild(s.card);

    this.addBtn = h('button', { type: 'button', class: 'regime-add' }, ic('plus', 24), t('saveRegime'));
    this.addBtn.addEventListener('click', () => this.openForm());
    this.regimeRows.clear();
    this.regimes = h('div', { class: 'regimes' });
    this.regimesWrap = h(
      'div',
      null,
      h('div', { class: 'sec-h' }, ic('layers', 24), h('span', { class: 'grow' }, t('regimes')), this.regCount),
      this.regimes,
      this.regNote,
    );
    this.scroll.appendChild(this.regimesWrap);
  }

  rebuild(): void {
    this.form = null;
    this.build();
  }

  private makeSlider(key: Key, label: StrKey, step: number, sym: string): Slider {
    const name = h('div', { class: 'slider-name' }, t(label), h('span', { class: 'sym' }, sym));
    const num = h('input', {
      class: 'slider-num',
      type: 'text',
      inputmode: 'decimal',
      'aria-label': t(label),
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const range = h('input', { class: 'range', type: 'range', 'aria-label': t(label), step: String(step) });
    const lo = h('span');
    const hi = h('span');
    const body = h('div', null, range, h('div', { class: 'slider-ends' }, lo, hi));
    const lock = h('div', { class: 'slider-lock' }, ic('lock', 24), t('sliderLocked'));
    const card = h('div', { class: 'slider-card' }, h('div', { class: 'slider-top' }, name, num), body, lock);
    const s: Slider = { key, step, card, name, num, range, lo, hi, body, lock, busyUntil: 0, dragging: false };

    range.addEventListener('pointerdown', () => (s.dragging = true));
    const endDrag = () => {
      s.dragging = false;
      s.busyUntil = performance.now() + 700;
    };
    range.addEventListener('pointerup', endDrag);
    range.addEventListener('pointercancel', endDrag);
    range.addEventListener('input', () => {
      const v = parseFloat(range.value);
      s.busyUntil = performance.now() + 700;
      this.paintRange(s, v);
      num.value = fmtParam(v, step);
      this.queue(key, v);
    });
    range.addEventListener('change', endDrag);

    num.addEventListener('focus', () => {
      s.busyUntil = Infinity;
      num.select();
    });
    const commit = () => {
      const raw = parseFloat(num.value.replace(',', '.'));
      const r = this.rangeOf(key);
      s.busyUntil = performance.now() + 700;
      if (!r || !Number.isFinite(raw)) {
        num.value = fmtParam(parseFloat(range.value), step);
        retrigger(num, 'deny');
        return;
      }
      const v = Math.min(r[1], Math.max(r[0], Math.round(raw / step) * step));
      num.value = fmtParam(v, step);
      range.value = String(v);
      this.paintRange(s, v);
      this.queue(key, v);
    };
    num.addEventListener('blur', commit);
    num.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        num.blur();
      } else if (e.key === 'Escape') {
        num.value = fmtParam(parseFloat(range.value), step);
        num.blur();
      }
    });
    return s;
  }

  private rangeOf(key: Key): [number, number] | null {
    const c = this.ctx.view.calibration;
    return key === 'mu' ? c.muRange : key === 'sigma' ? c.sigmaRange : key === 'R' ? c.RRange : c.dtRange;
  }

  private paintRange(s: Slider, v: number): void {
    const r = this.rangeOf(s.key);
    if (!r) return;
    const p = r[1] > r[0] ? (v - r[0]) / (r[1] - r[0]) : 0;
    setStyle(s.range, '--p', Math.min(1, Math.max(0, p)).toFixed(4));
  }

  /** Coalesce slider moves into one setCalibration per animation frame. */
  private queue(key: Key, v: number): void {
    this.pending[key] = v;
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      const p = this.pending;
      this.pending = {};
      this.ctx.actions.setCalibration(p);
    });
  }

  update(v: GameView): void {
    const c = v.calibration;
    const now = performance.now();
    for (const s of this.sliders) {
      const r = this.rangeOf(s.key);
      const locked = r === null;
      toggle(s.card, 'locked', locked);
      show(s.body, !locked);
      show(s.lock, locked);
      setDisabled(s.num, locked);
      const val = c[s.key];
      if (locked) {
        if (document.activeElement !== s.num) s.num.value = fmtParam(val, s.step);
        continue;
      }
      setAttr(s.range, 'min', String(r[0]));
      setAttr(s.range, 'max', String(r[1]));
      setText(s.lo, fmtParam(r[0], s.step));
      setText(s.hi, fmtParam(r[1], s.step));
      if (!s.dragging && now > s.busyUntil) {
        const str = String(val);
        if (s.range.value !== str) s.range.value = str;
        const txt = fmtParam(val, s.step);
        if (s.num.value !== txt) s.num.value = txt;
        this.paintRange(s, val);
      }
    }
    this.updateRegimes(c);
  }

  private updateRegimes(c: CalibrationView): void {
    const locked = c.maxRegimes <= 0;
    setText(this.regCount, locked ? '' : `${c.regimes.length} / ${c.maxRegimes}`);
    const items = c.regimes.map((r, i) => ({ r, i }));
    reconcile(
      this.regimes,
      items,
      (it) => `${it.i}:${it.r.name}`,
      this.regimeRows,
      (it) => this.makeRegime(it.i),
      (row, it) => {
        row.index = it.i;
        setText(row.name, it.r.name);
        setText(row.params, `μ${it.r.mu.toFixed(3)} σ${it.r.sigma.toFixed(4)} R${it.r.R}`);
        const cur =
          Math.abs(it.r.mu - c.mu) < 1e-6 && Math.abs(it.r.sigma - c.sigma) < 1e-6 && it.r.R === c.R && Math.abs(it.r.dt - c.dt) < 1e-6;
        toggle(row.el, 'current', cur);
        if (row.armed && performance.now() > row.armed) {
          row.armed = 0;
          row.del.innerHTML = icon('close', 16);
          row.del.style.color = '';
        }
      },
    );
    // The add chip / form live after the managed rows.
    const canAdd = !locked && c.regimes.length < c.maxRegimes;
    if (this.form) {
      if (this.form.parentElement !== this.regimes) this.regimes.appendChild(this.form);
    } else if (canAdd) {
      if (this.addBtn.parentElement !== this.regimes || this.regimes.lastElementChild !== this.addBtn) this.regimes.appendChild(this.addBtn);
    } else this.addBtn.remove();
    setText(this.regNote, locked ? t('regimesLocked') : c.regimes.length === 0 ? t('regimesEmpty') : '');
    show(this.regNote, locked || c.regimes.length === 0);
  }

  private makeRegime(index: number): RegimeRow {
    const name = h('span', { class: 'rg-name' });
    const params = h('span', { class: 'rg-params' });
    const load = h('button', { type: 'button', class: 'rg-load', title: t('loadRegime') }, name, params);
    const del = h('button', { type: 'button', class: 'rg-del', 'aria-label': t('deleteRegime'), html: icon('close', 16) });
    const el = h('div', { class: 'regime' }, load, del);
    const row: RegimeRow = { el, name, params, del, index, armed: 0 };
    load.addEventListener('click', () => {
      this.ctx.actions.loadRegime(row.index);
      this.ctx.sound('tap');
      retrigger(el, 'bought');
      this.ctx.vibrate(8);
    });
    del.addEventListener('click', () => {
      // Two-step delete: first tap arms (red), second within 2.5 s deletes.
      if (!row.armed) {
        row.armed = performance.now() + 2500;
        del.innerHTML = icon('trash', 16);
        del.style.color = '#FF7A5C';
        return;
      }
      this.ctx.actions.deleteRegime(row.index);
      this.ctx.vibrate(15);
    });
    return row;
  }

  private openForm(): void {
    const c = this.ctx.view.calibration;
    const input = h('input', {
      type: 'text',
      maxlength: '24',
      value: t('regimeName', { n: c.regimes.length + 1 }),
      'aria-label': t('regimes'),
    });
    const save = h('button', { type: 'button', class: 'btn primary' }, ic('check', 24), t('save'));
    const cancel = h('button', { type: 'button', class: 'btn ghost', 'aria-label': t('cancel') }, ic('close', 24));
    const form = h('div', { class: 'regime-form' }, input, save, cancel);
    const close = () => {
      form.remove();
      this.form = null;
      this.updateRegimes(this.ctx.view.calibration);
    };
    const submit = () => {
      const name = input.value.trim() || t('regimeName', { n: c.regimes.length + 1 });
      const ok = this.ctx.actions.saveRegime(name);
      if (ok) this.ctx.vibrate(8);
      close();
    };
    save.addEventListener('click', submit);
    cancel.addEventListener('click', close);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
      else if (e.key === 'Escape') close();
    });
    this.addBtn.remove();
    this.form = form;
    this.regimes.appendChild(form);
    input.focus();
    input.select();
  }
}
