/**
 * The end-of-session REPORT (docs/CLARIDAD2.md §2.9, docs/ARTE-REALISTA.md §6.9): a lab report that tells the
 * session as a story, in a fixed order.
 *
 *   INFORME · SESIÓN 4 · 03/11 · 02:41                        (Mono)
 *   ¡Especie nueva! Remolino violeta  [specimen photo + scale bar + Latin]  +10 Datos (solo la primera vez)
 *   Luz recogida ........................ 963
 *   ÷ 25 ................................ 38 Datos    ↑ ayer 20
 *   Noche 2 +10 % ....................... +4
 *   PREMIOS DE DESCUBRIMIENTO (SOLO LA PRIMERA VEZ)
 *     Especie nueva · Remolino violeta ... +10
 *   ENCARGOS  ✓ Ten 3 criaturas a la vez . +2        (session 1: PRIMEROS PASOS ✓ sembrar …)
 *   RÉCORDS   ✓ Más luz en una sesión .... +2
 *   Recogida final (VELA) ............... +24 luz (ya está en la luz de arriba)
 *   Total ............................... 61 Datos  [REGISTRADO]
 *   (fewer Datos than the session before: why, on a neutral line, and what to do)
 *   Colección 3/7 · la siguiente vive en el Mundo 4
 *   Láminas de hoy: [LÁMINA 07 · Dos especies] …
 *   VELA's line · [Ir al Árbol · 3 mejoras listas] [Nueva sesión]
 *
 * Every row that adds says how much, and the rows add up to the total (tested). The only "prize animation" is
 * the REGISTRADO stamp (120 ms, no bounce; no confetti over the UI). reportHeadline / reportRows are pure.
 */
import type { Lang, Pattern, Text } from '../../core/types';
import * as C from '../../game/cycleBalance';
import { BEHAVIOR_NAMES } from '../../game/content';
import type { DatosBreakdown, RecordHit, SessionGoal, SessionSummary } from '../../game/session';
import { velaLine } from '../../game/session';
import { DATO_NAME, DATOS_NAME, NODE_TEXT, SESSION_UI, TREE_UI, WORLD_TEXT } from '../../game/treeText';
import { fmt, fmtClock, fmtMult, fmtPerSec } from '../format';
import type { PriceExplain } from '../moments/price';
import { plateLabel, plateOf, scaleBar, scaleText } from '../moments/plates';
import { mountPortrait } from '../portrait';
import { Portrait } from '../story/portraits';
import { treeIcon } from '../tree/icons';
import { countUp, DURATION, EASING } from '../art/motion';
import '../art/art.css';
import './session.css';

export interface SummarySpecies {
  name: string;
  portrait: Pattern | null;
  hue?: number;
  /** The scientific name, in italics under the specimen photo (SpeciesView.scientificName). */
  latin?: string | null;
}

/** A Momento plate of today that was not opened during the run («Láminas de hoy»); PC fills it (moments.drainForSummary). */
export interface PlateRef {
  /** The Momento id (to open it again). */
  id: string;
  /** Its IllustrationKind: the plate number comes from it (src/ui/moments/plates.ts). */
  kind: string;
  title: Text;
}

/** First steps of session 1 (SESSION_UI.firstStepNames), in the order the tutorial teaches them. */
export type FirstStep = 'sow' | 'creature' | 'collect';

/**
 * What the report reads beyond today's SessionSummary (ADR-030, docs/CLARIDAD2.md §2.9). PA's SessionSummary may
 * carry these (optional until it lands) and a host may pass them in SummaryExtras; the extras win.
 */
export interface ReportData {
  /** Encargos done, by name, in order (when their count matches the Datos term, one row each). */
  encargoNames?: Text[];
  /** Session 1: the first steps done (default: the first N of sow, creature, collect). */
  firstSteps?: FirstStep[];
  /** New ways of moving and new variants, by name. */
  behaviorNames?: Text[];
  variantNames?: Text[];
  /** Luz VELA swept at «¡Tiempo!» (already inside the Luz collected: told, never added twice). */
  swept?: number;
  /** The session before: its total, the Datos its Luz gave, its discovery prize (for "ayer 20 ↑" and the reason). */
  previous?: { total: number; fromLight: number; prize: number } | null;
  /** The World to buy for the next species (the action of the "fewer Datos" line). */
  lessWorld?: Text | null;
  /** The collection and where the next species lives (null cost = that World is open). */
  collection?: { have: number; total: number; nextWorld?: Text | null; nextCost?: number | null } | null;
  /** Merges today: VELA's tip («Hoy se juntaron 2. Siembra más lejos…»). */
  merged?: number;
  /** (PA) Every goal met by name, first steps and Encargos: one row each when their Datos match the term. */
  goals?: SessionGoal[];
  /** (PA) What to do about a smaller payout, already worded («compra Mundo 2 en el Árbol» / «juega en…»). */
  lessAction?: Text | null;
}

/**
 * PA's SessionSummary (game/session.ts, ADR-030) as the report's data: the goals by name, the final sweep,
 * the session before, what to do about a smaller payout and the collection with the next species' World.
 */
export function reportDataOf(sum: SessionSummary): ReportData {
  const next = sum.collection?.next ?? null;
  const out: ReportData = { goals: sum.goals, previous: sum.previous ?? null, lessAction: sum.lessAction ?? null };
  if ((sum.light?.sweep ?? 0) > 0) out.swept = Math.round(sum.light!.sweep);
  if (sum.behaviors?.length) out.behaviorNames = sum.behaviors.map((b) => BEHAVIOR_NAMES[b]);
  if (sum.collection) out.collection = { have: sum.collection.have, total: sum.collection.total, nextWorld: next ? (WORLD_TEXT[next.world]?.name ?? null) : null, nextCost: next?.cost ?? null };
  return out;
}

export interface SummaryExtras extends ReportData {
  /** Tree nodes affordable after banking this session. */
  affordable: number;
  /** The cheapest thing still to buy when nothing is affordable. */
  nextGoal?: { name: Text; missing: number; sessions: number | null } | null;
  /** (PC) Today's plates not opened in the run (docs/CLARIDAD2.md §8.1). */
  plates?: PlateRef[];
}

export type SummarySound = 'open' | 'tally' | 'total';

export interface SessionSummaryOptions {
  lang(): Lang;
  reduceMotion?(): boolean;
  speciesInfo(id: string): SummarySpecies | null;
  onTree(): void;
  onNext(): void;
  onSound?(kind: SummarySound): void;
  /** A tap on one of today's plates (PC opens that Momento again). */
  onPlate?(ref: PlateRef): void;
  /** The report's clock (default: now). */
  now?(): Date;
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
 * The report's tally (docs/ARTE-REALISTA.md §6.4, §6.9), ms: the rows light from `start`, `step` apart; the total
 * counts in integer jumps at 8 Hz over `total`; the REGISTRADO stamp lands in `stamp` (no bounce). All within
 * `budget`; a tap anywhere jumps to the end.
 */
export const SUMMARY_TALLY = { start: 200, step: 90, total: 600, hz: 8, stamp: 120, budget: 1800 } as const;

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const tx = (es: string, en: string): Text => ({ es, en });

/** The report's own words (both languages); the shared ones live in game/treeText SESSION_UI. */
export const REPORT_TEXT = {
  head: (n: number, date: string, time: string) => tx(`INFORME · SESIÓN ${n} · ${date} · ${time}`, `REPORT · SESSION ${n} · ${date} · ${time}`),
  newSpecies: (name: string) => tx(`¡Especie nueva! ${name}`, `New species! ${name}`),
  newSpeciesN: (n: number) => tx(`¡${n} especies nuevas!`, `${n} new species!`),
  discoveryNote: tx('Premio de descubrimiento: solo la primera vez', 'Discovery prize: first time only'),
  recordHead: (name: string) => tx(`¡Récord! ${name}`, `Record! ${name}`),
  recordNote: (now: string, before: string) => tx(`${now} (antes ${before})`, `${now} (before ${before})`),
  lightHead: (n: string) => tx(`Recogiste ${n} de luz`, `You collected ${n} glow`),
  speciesRow: (name: string) => tx(`Especie nueva · ${name}`, `New species · ${name}`),
  variantRow: (name: string) => tx(`Variante nueva · ${name}`, `New variant · ${name}`),
  behaviorRow: (name: string) => tx(`Manera de moverse nueva · ${name}`, `New way of moving · ${name}`),
  firstSteps: tx('Primeros pasos', 'First steps'),
  encargos: tx('Encargos', 'Requests'),
  records: tx('Récords', 'Records'),
  total: tx('Total', 'Total'),
  registered: tx('Registrado', 'Recorded'),
  plates: tx('Láminas de hoy', 'Today’s plates'),
  today: tx('Especies de hoy', 'Today’s species'),
  scientific: tx('nombre científico', 'scientific name'),
};

/** The first row of the report: what was exciting today (a new species, else a record, else the light). */
export interface ReportHeadline {
  kind: 'species' | 'record' | 'light';
  title: string;
  note?: string;
  /** The species of the specimen photo. */
  speciesId?: string;
  /** "+10 Datos" next to a discovery. */
  amount?: string;
}

/** What the pure report needs from the host: species names and the night of the Datos bonus. */
export interface ReportCtx {
  speciesName(id: string): string;
  night: number;
}

function recordValue(r: RecordHit, l: Lang): { now: string; before: string } {
  const f = (v: number) => (r.kind === 'eps' ? fmtPerSec(v, l) : fmt(v, l));
  return { now: f(r.value), before: f(r.previous) };
}

function term(d: DatosBreakdown, kind: DatosBreakdown['terms'][number]['kind']) {
  return d.terms.find((t) => t.kind === kind) ?? null;
}

export function reportHeadline(sum: SessionSummary, l: Lang, ctx: ReportCtx): ReportHeadline {
  const fresh = sum.species.filter((s) => s.isNew);
  const sp = term(sum.datos, 'species');
  if (fresh.length) {
    return {
      kind: 'species',
      speciesId: fresh[0].id,
      title: (fresh.length === 1 ? REPORT_TEXT.newSpecies(ctx.speciesName(fresh[0].id)) : REPORT_TEXT.newSpeciesN(fresh.length))[l],
      note: REPORT_TEXT.discoveryNote[l],
      amount: sp ? `+${fmt(sp.value, l)} ${DATOS_NAME[l]}` : undefined,
    };
  }
  if (sum.records.length) {
    const r = sum.records[0];
    const v = recordValue(r, l);
    return { kind: 'record', title: REPORT_TEXT.recordHead(SESSION_UI.recordName[r.kind][l])[l], note: REPORT_TEXT.recordNote(v.now, v.before)[l] };
  }
  return { kind: 'light', title: REPORT_TEXT.lightHead(fmt(sum.datos.essence, l))[l] };
}

/** One line of the report's sheet. `adds` = the Datos it adds to the total (0 for the light, notes and headers). */
export interface ReportRow {
  kind: 'light' | 'div' | 'night' | 'section' | 'species' | 'variant' | 'behavior' | 'step' | 'encargo' | 'record' | 'sparks' | 'book' | 'minimum' | 'swept' | 'total' | 'less';
  label: string;
  value: string;
  adds: number;
  note?: string;
  /** The note's own meaning ("↑ ayer 20" is a gain; the figure it sits next to is not). */
  noteTone?: 'gain' | 'off';
  tone?: 'gain' | 'cost' | 'off' | 'info';
  section?: 'discovery' | 'steps' | 'encargos' | 'records';
}

const FIRST_STEPS: readonly FirstStep[] = ['sow', 'creature', 'collect'];

/**
 * The report's sheet, in its fixed order (docs/CLARIDAD2.md §2.9). Named rows when the names are known (one row
 * per species, request, record), a "count × each" row otherwise, so the arithmetic always holds:
 * Σ adds = DatosBreakdown.total.
 */
export function reportRows(sum: SessionSummary, data: ReportData, l: Lang, ctx: ReportCtx): ReportRow[] {
  const d = sum.datos;
  const rows: ReportRow[] = [];
  // «1 Dato», «2 Datos» (the report read «÷ 25 … 1 Datos»).
  const Dn = (n: number) => (n === 1 ? DATO_NAME : DATOS_NAME)[l];
  const plus = (n: number) => `+${fmt(n, l)}`;
  const prev = data.previous ?? null;
  rows.push({ kind: 'light', label: SESSION_UI.collected[l], value: fmt(d.essence, l), adds: 0 });
  const trend = prev ? (d.fromEssence > prev.fromLight ? '↑' : d.fromEssence < prev.fromLight ? '↓' : '=') : '';
  rows.push({
    kind: 'div',
    label: `÷ ${d.div}`,
    value: `${fmt(d.base, l)} ${Dn(d.base)}`,
    adds: d.base,
    note: prev ? `${trend} ${SESSION_UI.yesterday(fmt(prev.fromLight, l))[l]}` : undefined,
    noteTone: prev && trend === '↑' ? 'gain' : undefined,
  });
  if (d.nightMult > 1 && d.fromEssence > d.base)
    rows.push({ kind: 'night', label: `${TREE_UI.night(ctx.night)[l]} ${fmtMult(d.nightMult, l)}`, value: plus(d.fromEssence - d.base), adds: d.fromEssence - d.base, tone: 'gain' });
  else if (d.fromEssence !== d.base) rows.push({ kind: 'night', label: TREE_UI.night(ctx.night)[l], value: plus(d.fromEssence - d.base), adds: d.fromEssence - d.base });

  // A term as named rows (when the names match its count) or one "label count × each" row.
  const named = (kind: ReportRow['kind'], t: DatosBreakdown['terms'][number] | null, names: string[] | null, label: string, section?: ReportRow['section']) => {
    if (!t) return;
    if (names && names.length === t.count) for (const n of names) rows.push({ kind, label: n, value: plus(t.each), adds: t.each, tone: 'gain', section });
    else rows.push({ kind, label: `${cap(label)} ${t.count} × ${fmt(t.each, l)}`, value: plus(t.value), adds: t.value, tone: 'gain', section });
  };
  const section = (sec: NonNullable<ReportRow['section']>, label: string) => rows.push({ kind: 'section', label, value: '', adds: 0, section: sec });

  // Discovery prizes, first time only.
  const sp = term(d, 'species');
  const va = term(d, 'variants');
  const be = term(d, 'behaviors');
  if (sp || va || be) {
    section('discovery', SESSION_UI.discoveryOnce[l]);
    const fresh = sum.species.filter((s) => s.isNew).map((s) => REPORT_TEXT.speciesRow(ctx.speciesName(s.id))[l]);
    named('species', sp, fresh, SESSION_UI.newSpecies[l], 'discovery');
    named('variant', va, data.variantNames?.map((n) => REPORT_TEXT.variantRow(n[l])[l]) ?? null, SESSION_UI.newVariants[l], 'discovery');
    named('behavior', be, data.behaviorNames?.map((n) => REPORT_TEXT.behaviorRow(n[l])[l]) ?? null, SESSION_UI.newBehaviors[l], 'discovery');
  }
  // Requests by name; session 1 counts its silent goals as the first steps (QA-CLARIDAD #9).
  const en = term(d, 'encargos');
  // PA's goals by name (first steps and Encargos), when they are exactly what the term paid; a step that paid
  // nothing of its own (collecting: its light already counts) is a ✓ row that adds 0.
  const goals = data.goals ?? [];
  const paid = goals.filter((g) => g.datos > 0);
  const goalsMatch = goals.length > 0 && (en ? paid.length === en.count && paid.reduce((a, g) => a + g.datos, 0) === en.value : paid.length === 0);
  if (goalsMatch) {
    const goalRows = (kind: 'step' | 'encargo', sec: 'steps' | 'encargos', title: string) => {
      const mine = goals.filter((g) => g.kind === kind);
      if (!mine.length) return;
      section(sec, title);
      for (const g of mine) rows.push({ kind, label: `✓ ${g.name[l]}`, value: g.datos > 0 ? plus(g.datos) : '', adds: g.datos, tone: g.datos > 0 ? 'gain' : 'off', section: sec });
    };
    goalRows('step', 'steps', REPORT_TEXT.firstSteps[l]);
    goalRows('encargo', 'encargos', REPORT_TEXT.encargos[l]);
  } else if (en) {
    if (sum.n === 1) {
      section('steps', REPORT_TEXT.firstSteps[l]);
      const steps = (data.firstSteps ?? FIRST_STEPS.slice(0, en.count)).map((k) => `✓ ${SESSION_UI.firstStepNames[k][l]}`);
      named('step', en, steps, REPORT_TEXT.firstSteps[l], 'steps');
    } else {
      section('encargos', REPORT_TEXT.encargos[l]);
      named('encargo', en, data.encargoNames?.map((n) => `✓ ${n[l]}`) ?? null, SESSION_UI.encargos[l], 'encargos');
    }
  }
  const rec = term(d, 'records');
  if (rec) {
    section('records', REPORT_TEXT.records[l]);
    named('record', rec, sum.records.map((r) => `✓ ${SESSION_UI.recordName[r.kind][l]}`), SESSION_UI.records[l], 'records');
  }
  const go = term(d, 'goldens');
  if (go) rows.push({ kind: 'sparks', label: `${cap(SESSION_UI.sparks[l])} ${go.count} × ${fmt(go.each, l)}`, value: plus(go.value), adds: go.value, tone: 'gain' });
  if (d.book > 0) rows.push({ kind: 'book', label: `${NODE_TEXT.encyclopedia.name[l]} ${fmtMult(d.bookMult, l)}`, value: plus(d.book), adds: d.book, tone: 'gain' });
  if (d.minimum > 0) rows.push({ kind: 'minimum', label: SESSION_UI.minimumNote(C.DATOS_MIN)[l], value: plus(d.minimum), adds: d.minimum, tone: 'gain' });
  if ((data.swept ?? 0) > 0)
    rows.push({ kind: 'swept', label: SESSION_UI.sweptEnd[l], value: `+${fmt(data.swept!, l)} ${SESSION_UI.luz[l].toLowerCase()}`, adds: 0, note: SESSION_UI.sweptNote[l], tone: 'off' });
  rows.push({ kind: 'total', label: REPORT_TEXT.total[l], value: `${fmt(d.total, l)} ${Dn(d.total)}`, adds: 0 });
  // Fewer Datos than the session before (QA-CLARIDAD #36): why, on a neutral line (never red), and what to do.
  if (prev && d.total < prev.total) {
    rows.push({
      kind: 'less',
      label: SESSION_UI.lessReason({ prize: prev.prize, before: fmt(prev.fromLight, l), now: fmt(d.fromEssence, l), grew: d.fromEssence > prev.fromLight })[l],
      value: '',
      adds: 0,
      note: data.lessAction ? data.lessAction[l] : data.lessWorld ? SESSION_UI.lessAction(data.lessWorld)[l] : undefined,
      tone: 'info',
    });
  }
  return rows;
}

/**
 * The Datos of a session (so far) as the shared "¿Por qué?" sheet (src/ui/moments/price.ts): the
 * HUD preview opens it. [Luz ÷ 25] + [night] = Datos, one row per extra, the rule in words and
 * the next node they reach ("Más tiempo: faltan 4").
 */
export function datosExplain(d: DatosBreakdown, l: Lang, night: number, goal?: { name: Text; missing: number } | null): PriceExplain {
  // The equation is only the multiplied part (Luz ÷ 25 × night = Datos from the light); every extra is a "+"
  // row under it and the last row is the total, so every number shown adds up.
  const terms: PriceExplain['terms'] = [
    { icon: 'essence', value: fmt(d.base, l), label: l === 'es' ? `${fmt(d.essence, l)} de luz ÷ ${d.div}` : `${fmt(d.essence, l)} glow ÷ ${d.div}`, active: true },
  ];
  if (d.nightMult > 1) terms.push({ icon: 'moon', value: fmtMult(d.nightMult, l), label: SESSION_UI.nightBonus(night)[l], active: true, tone: 'gain' });
  const KIND: Record<DatosBreakdown['terms'][number]['kind'], { icon: PriceExplain['totalIcon']; label: Text }> = {
    species: { icon: 'creatures', label: SESSION_UI.newSpecies },
    variants: { icon: 'creatures', label: SESSION_UI.newVariants },
    behaviors: { icon: 'behavior', label: SESSION_UI.newBehaviors },
    encargos: { icon: 'check', label: SESSION_UI.encargos },
    goldens: { icon: 'spark', label: SESSION_UI.sparks },
    records: { icon: 'up', label: SESSION_UI.records },
  };
  const rows: NonNullable<PriceExplain['rows']> = d.terms.map((t) => ({ icon: KIND[t.kind].icon, label: `+${fmt(t.value, l)}`, text: `${cap(KIND[t.kind].label[l])}: ${t.count} × ${t.each}`, tone: 'gain' as const }));
  if (d.book > 0) rows.push({ icon: 'book', label: `+${fmt(d.book, l)}`, text: `${SESSION_UI.encyclopedia[l]} ${fmtMult(d.bookMult, l)}`, tone: 'gain' });
  if (d.minimum > 0) rows.push({ icon: 'gift', label: `+${fmt(d.minimum, l)}`, text: SESSION_UI.minimumNote(C.DATOS_MIN)[l], tone: 'info' });
  if (rows.length) rows.push({ icon: 'book', label: '=', text: `${fmt(d.total, l)} ${DATOS_NAME[l]}${l === 'es' ? ' al terminar' : ' at the end'}`, tone: 'info' });
  return {
    title: SESSION_UI.conversionTitle[l],
    icon: 'book',
    total: fmt(d.fromEssence, l),
    totalLabel: DATOS_NAME[l],
    totalIcon: 'book',
    totalTone: 'gain',
    terms,
    rows,
    rule: `${SESSION_UI.conversionRule(d.div)[l]}. ${
      l === 'es' ? 'Las especies nuevas, los encargos y los récords suman más. Al terminar, todo va al Árbol.' : 'New species, requests and records add more. At the end, it all goes to the Tree.'
    }`,
    advice: goal ? (goal.missing > 0 ? SESSION_UI.previewNext(goal.name[l], fmt(goal.missing, l))[l] : SESSION_UI.previewReady(goal.name[l])[l]) : undefined,
    closeLabel: l === 'es' ? 'Cerrar' : 'Close',
  };
}

/** The report's sheet as markup (spreadsheet rows with leader dots; sections as small capitals). */
function rowsHtml(rows: ReportRow[], staged: boolean): string {
  return rows
    .filter((r) => r.kind !== 'less' && r.kind !== 'total')
    .map((r, i) => {
      if (r.kind === 'section') return `<div class="ss-rp-sec${staged ? ' pending' : ''}" data-i="${i}">${esc(r.label)}</div>`;
      const sub = r.section ? ' sub' : '';
      return `<div class="ss-rp-row k-${r.kind}${sub}${r.tone ? ` t-${r.tone}` : ''}${staged ? ' pending' : ''}" data-i="${i}"><span class="k">${esc(r.label)}</span><span class="lead" aria-hidden="true"></span><span class="v">${esc(
        r.value,
      )}</span>${r.note ? `<span class="n${r.noteTone ? ` t-${r.noteTone}` : ''}">${esc(r.note)}</span>` : ''}</div>`;
    })
    .join('');
}

export function createSessionSummary(root: HTMLElement, opts: SessionSummaryOptions): SessionSummaryView {
  const rm = () => !!opts.reduceMotion?.();
  const layer = document.createElement('div');
  layer.className = 'ss-layer';
  layer.hidden = true;
  layer.innerHTML = `<div class="ss-scrim"></div><section class="ss-card ss-report" role="dialog" aria-modal="true"></section>`;
  root.appendChild(layer);
  const card = layer.querySelector('.ss-card') as HTMLElement;
  let open = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let raf = 0;
  let portrait: Portrait | null = null;
  let plates: PlateRef[] = [];

  function clearTimers(): void {
    for (const t of timers) clearTimeout(t);
    timers = [];
    cancelAnimationFrame(raf);
  }

  const two = (n: number) => String(n).padStart(2, '0');

  /** A specimen photo (docs/ARTE-REALISTA.md §6.9): the real creature, a scale bar, the Latin name, «¡Nueva!». */
  function specimenHtml(id: string, px: number, l: Lang, isNew: boolean, withName: boolean): string {
    const info = opts.speciesInfo(id);
    const hue = info?.hue ?? 195;
    const cells = info?.portrait ? Math.max(info.portrait.w, info.portrait.h) : 0;
    // The portrait fills 0.78 of its side (mountPortrait default): px per cell for the 0.7-mm cell.
    const bar = cells > 0 ? scaleBar({ pxPerCell: (px * 0.78) / cells }) : null;
    return `<figure class="ss-spec" style="--hue:${hue};--px:${px}px">
      <div class="pic" data-sp="${esc(id)}" data-px="${px}"></div>
      ${bar ? `<span class="bar" style="width:${bar.box.toFixed(1)}px" aria-hidden="true"></span><span class="mm">${scaleText(bar.mm)}</span>` : ''}
      ${withName ? `<figcaption><b>${esc(info?.name ?? '?')}</b>${info?.latin ? `<i title="${esc(REPORT_TEXT.scientific[l])}">${esc(info.latin)}</i>` : ''}</figcaption>` : ''}
      ${isNew ? `<span class="new">${esc(SESSION_UI.isNew[l])}</span>` : ''}
    </figure>`;
  }

  function headlineHtml(h: ReportHeadline, l: Lang): string {
    const photo = h.speciesId ? specimenHtml(h.speciesId, 96, l, true, false) : '';
    const latin = h.speciesId ? opts.speciesInfo(h.speciesId)?.latin : null;
    return `<div class="ss-rp-hero k-${h.kind}">${photo}<div class="tx"><h3>${esc(h.title)}</h3>${
      latin ? `<p class="lat"><i>${esc(latin)}</i> <small>${esc(REPORT_TEXT.scientific[l])}</small></p>` : ''
    }${h.amount ? `<p class="amt">${esc(h.amount)}</p>` : ''}${h.note ? `<p class="note">${esc(h.note)}</p>` : ''}</div></div>`;
  }

  function todayHtml(sum: SessionSummary, h: ReportHeadline, l: Lang): string {
    const rest = sum.species.filter((s) => s.id !== h.speciesId).slice(0, 8);
    if (!rest.length) return '';
    return `<div class="ss-rp-today"><h4>${esc(REPORT_TEXT.today[l])}</h4><div class="row">${rest.map((s) => specimenHtml(s.id, 56, l, s.isNew, true)).join('')}</div></div>`;
  }

  function platesHtml(l: Lang): string {
    const known = plates.filter((p) => plateOf(p.kind));
    if (!known.length) return '';
    return `<div class="ss-rp-plates"><h4>${esc(REPORT_TEXT.plates[l])}</h4><div class="row">${known
      .map(
        (p, i) =>
          `<button type="button" class="ss-plate" data-plate="${i}"${opts.onPlate ? '' : ' disabled'}><span class="no">${esc(plateLabel(plateOf(p.kind)!.no, l))}</span><span class="nm">${esc(
            p.title[l],
          )}</span></button>`,
      )
      .join('')}</div></div>`;
  }

  function paintPortraits(): void {
    for (const pic of card.querySelectorAll<HTMLElement>('[data-sp]')) {
      const info = opts.speciesInfo(pic.dataset.sp!);
      if (info?.portrait) mountPortrait(pic, info.portrait, Number(pic.dataset.px) || 56, { hue: info.hue, fill: 0.78 });
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
   * The total is the point of the report: scroll just enough that it sits above the sticky buttons (audit: on a
   * phone they covered it). Scrolls the card only, never its ancestors.
   */
  function revealTotal(smooth: boolean): void {
    const total = card.querySelector('.ss-rp-total');
    const actions = card.querySelector('.ss-actions');
    if (!total || !actions || !open) return;
    const over = total.getBoundingClientRect().bottom - (actions.getBoundingClientRect().top - 8);
    if (over > 0) card.scrollBy({ top: over, behavior: smooth && !rm() ? 'smooth' : 'auto' });
  }

  /**
   * The tally (docs/ARTE-REALISTA.md §6.4): the rows are there from the first frame at 35 % (the structure
   * reads, never an empty box) and light up in order; the total counts in whole jumps at 8 Hz, then the
   * REGISTRADO stamp lands once in 120 ms, no bounce. A tap anywhere jumps to the end.
   */
  let finish: (() => void) | null = null;
  function tally(total: number, l: Lang): void {
    const rowEls = [...card.querySelectorAll<HTMLElement>('.ss-rp-row.pending, .ss-rp-sec.pending')];
    const totalEl = card.querySelector('.ss-rp-total') as HTMLElement;
    const totalNum = totalEl.querySelector('b') as HTMLElement;
    const T = SUMMARY_TALLY;
    const STEP = Math.min(T.step, (T.budget - T.start - T.total - T.stamp) / Math.max(1, rowEls.length));
    let cancel: (() => void) | null = null;
    const done = () => {
      for (const r of rowEls) r.classList.remove('pending');
      cancel?.();
      totalNum.textContent = fmt(total, l);
      totalEl.classList.add('done');
      finish = null;
    };
    finish = () => {
      clearTimers();
      done();
    };
    rowEls.forEach((r, i) =>
      timers.push(
        setTimeout(() => {
          r.classList.remove('pending');
          if (r.classList.contains('ss-rp-row')) opts.onSound?.('tally');
        }, T.start + i * STEP),
      ),
    );
    const t0 = T.start + rowEls.length * STEP;
    timers.push(
      setTimeout(() => {
        revealTotal(true);
        // Whole jumps at 8 Hz (an instrument's readout, §6.4): the count is stepped, never smooth.
        const steps = Math.max(1, Math.round((T.total / 1000) * T.hz));
        cancel = countUp(totalNum, 0, total, (x) => fmt(Math.round(Math.round((x / Math.max(1, total)) * steps) * (total / steps)), l), T.total);
        timers.push(
          setTimeout(() => {
            done();
            opts.onSound?.('total');
          }, T.total),
        );
      }, t0),
    );
  }

  const api: SessionSummaryView = {
    el: layer,
    get isOpen() {
      return open;
    },
    show(sum, extras) {
      clearTimers();
      const l = opts.lang();
      const data: ReportData = { ...reportDataOf(sum), ...extras };
      plates = extras.plates ?? [];
      const night = Math.max(1, Math.round((sum.datos.nightMult - 1) / C.DATOS_NIGHT_BONUS) + 1);
      const ctx: ReportCtx = { speciesName: (id) => opts.speciesInfo(id)?.name ?? '?', night };
      const head = reportHeadline(sum, l, ctx);
      const rows = reportRows(sum, data, l, ctx);
      const total = rows.find((r) => r.kind === 'total')!;
      const less = rows.find((r) => r.kind === 'less');
      const staged = !rm() && !opts.instant;
      const merged = (data.merged ?? 0) > 0 ? SESSION_UI.mergedTip(data.merged!)[l] : '';
      const vela = merged || velaLine(sum.vela)[l];
      const now = opts.now?.() ?? new Date();
      const stamp = REPORT_TEXT.head(sum.n, `${two(now.getDate())}/${two(now.getMonth() + 1)}`, `${two(now.getHours())}:${two(now.getMinutes())}`)[l];
      const treeFirst = extras.affordable > 0;
      const treeSub = treeFirst
        ? tx(`${extras.affordable} ${extras.affordable === 1 ? 'mejora lista' : 'mejoras listas'}`, `${extras.affordable} ${extras.affordable === 1 ? 'upgrade' : 'upgrades'} ready`)[l]
        : extras.nextGoal
          ? tx(`Te faltan ${fmt(extras.nextGoal.missing, l)} para ${extras.nextGoal.name.es}`, `${fmt(extras.nextGoal.missing, l)} more for ${extras.nextGoal.name.en}`)[l]
          : '';
      const treeBtn = `<button type="button" class="ss-btn ${treeFirst ? 'primary' : ''}" data-act="tree">${treeIcon('tree', 26)}<span class="tx">${esc(SESSION_UI.goTree[l])}${
        treeSub ? `<small>${esc(treeSub)}</small>` : ''
      }</span></button>`;
      const nextBtn = `<button type="button" class="ss-btn ${treeFirst ? '' : 'primary'}" data-act="next">${treeIcon('play', 22)}<span class="tx">${esc(SESSION_UI.again[l])}</span></button>`;
      const coll = data.collection
        ? `<p class="ss-rp-coll">${treeIcon('bestiary', 18)}<span>${esc(SESSION_UI.collection(data.collection.have, data.collection.total)[l])}${
            data.collection.nextWorld ? ` · ${esc(SESSION_UI.nextSpeciesIn(data.collection.nextWorld, data.collection.nextCost ? fmt(data.collection.nextCost, l) : null)[l])}` : ''
          }</span></p>`
        : '';
      card.innerHTML = `
        <span class="ss-rp-stamp">${esc(stamp)}</span>
        <header class="ss-head ss-rp-head"><h2>${esc(SESSION_UI.endTitle(sum.n)[l])}</h2><span class="ss-chip">${treeIcon('clockIcon', 15)}${fmtClock(sum.seconds)}</span></header>
        ${headlineHtml(head, l)}
        <div class="ss-rp-sheet" role="table" aria-label="${esc(SESSION_UI.equationTitle[l])}">
          ${rowsHtml(rows, staged)}
          <div class="ss-rp-total${staged ? '' : ' done'}"><span class="k">${esc(total.label)}</span><span class="lead" aria-hidden="true"></span><b>${staged ? '0' : fmt(sum.datos.total, l)}</b><span class="u">${esc((sum.datos.total === 1 ? DATO_NAME : DATOS_NAME)[l])}</span><span class="reg" aria-label="${esc(REPORT_TEXT.registered[l])}">${esc(REPORT_TEXT.registered[l])}</span></div>
          ${less ? `<p class="ss-rp-less">${esc(less.label)}${less.note ? `<b>${esc(less.note)}</b>` : ''}</p>` : ''}
          <p class="ss-rp-kept">${esc(SESSION_UI.datosKept[l])}</p>
        </div>
        <div class="ss-rp-side">
          ${coll}
          ${todayHtml(sum, head, l)}
          ${platesHtml(l)}
          <div class="ss-vela"><div class="ss-bubble">${esc(vela)}</div></div>
        </div>
        <div class="ss-actions">${treeFirst ? treeBtn + nextBtn : nextBtn + treeBtn}</div>`;
      card.setAttribute('aria-label', SESSION_UI.endTitle(sum.n)[l]);
      layer.hidden = false;
      layer.classList.toggle('rm', rm());
      open = true;
      opts.onSound?.('open');
      requestAnimationFrame(() => layer.classList.add('show'));
      paintPortraits();
      startVela(vela);
      if (!staged) requestAnimationFrame(() => revealTotal(false));
      // The report comes up like a drawer (§6.4): 220-ms ease-out, no overshoot.
      if (!rm() && typeof card.animate === 'function')
        card.animate([{ transform: 'translateY(32px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: DURATION.sheet, easing: EASING.enter });
      if (staged) tally(sum.datos.total, l);
    },
    hide() {
      if (!open) return;
      open = false;
      clearTimers();
      finish = null;
      layer.classList.remove('show');
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
    const target = e.target as HTMLElement;
    const b = target.closest('[data-act]') as HTMLElement | null;
    const pl = target.closest('[data-plate]') as HTMLElement | null;
    // A tap anywhere while it counts jumps to the end of the tally.
    if (finish) {
      finish();
      if (!b && !pl) return;
    }
    if (pl) {
      const ref = plates.filter((p) => plateOf(p.kind))[Number(pl.dataset.plate)];
      if (ref) opts.onPlate?.(ref);
      return;
    }
    if (!b) return;
    if (b.dataset.act === 'tree') opts.onTree();
    else opts.onNext();
  });
  return api;
}
