/**
 * «¿Por qué cuesta esto?» inside a Tree node's sheet (owner bug, docs/ARTE-PULIDO.md B-10.5): never a
 * second sheet stacked on the first that repeats it, but a short explanation that unfolds in place and
 * says what the sheet does not: what the upgrade is for, why it matters, what it opens next, and the
 * price as an equation with the next levels.
 */
import type { Lang, Text } from '../../core/types';
import { TREE_BY_ID, TREE_NODES, beforeAfter, costRows, nodeText, priceRule, sessionsToAfford, treeStates, type TreeCtx } from '../../game/tree';
import { BRANCH_TEXT, DATOS_NAME, SESSION_UI, TREE_UI, type BranchId } from '../../game/treeText';
import { datosMissingText, fmt, fmtShort } from '../format';

const t = (es: string, en: string): Text => ({ es, en });

/** Why a route matters to the player (one line each; the route's own blurb says what it does). */
const ROUTE_MATTERS: Record<BranchId, Text> = {
  time: t('Más tiempo es más Esencia en cada sesión, y la Esencia se vuelve Datos al terminar.', 'More time is more Essence every session, and Essence becomes Data at the end.'),
  dropper: t('Cada semilla que vive es una criatura más que da Esencia desde el primer segundo.', 'Every seed that lives is one more creature earning Essence from its first second.'),
  dish: t('En una placa más grande caben más criaturas a la vez: más Esencia por segundo.', 'A bigger dish holds more creatures at once: more Essence per second.'),
  life: t('Multiplica lo que ya tienes: todas tus criaturas cobran más, también las que vengan.', 'It multiplies what you already have: all your creatures earn more, the next ones too.'),
  discovery: t('Encontrar cosas nuevas es lo que más Datos da; esto hace que cada hallazgo cuente más.', 'Finding new things gives the most Data; this makes every find count for more.'),
  worlds: t('Cada Mundo tiene especies que no nacen en ningún otro: sin él, el Bestiario no se completa.', 'Each World has species born nowhere else: without it the Bestiary is never complete.'),
  spark: t('El Destello es un regalo que llega solo: tiempo, Esencia o Datos sin hacer nada.', 'The Spark is a gift that comes by itself: time, Essence or Data for free.'),
};

export const WHY_UI = {
  forWhat: t('Para qué', 'What for'),
  matters: t('Por qué importa', 'Why it matters'),
  unlocks: t('Qué abre', 'What it opens'),
  price: t('La cuenta', 'The sum'),
  close: t('Ocultar', 'Hide'),
  opens: (names: string[], l: Lang): string =>
    l === 'es'
      ? `Después se abre${names.length > 1 ? 'n' : ''} ${names.map((n) => `«${n}»`).join(' y ')}.`
      : `Next it opens ${names.map((n) => `“${n}”`).join(' and ')}.`,
  opensUnknown: (n: number, l: Lang): string =>
    l === 'es'
      ? n === 1
        ? 'Después se abre un paso nuevo que aún no conoces.'
        : `Después se abren ${n} pasos nuevos que aún no conoces.`
      : n === 1
        ? 'Next it opens a new step you have not seen yet.'
        : `Next it opens ${n} new steps you have not seen yet.`,
  last: (route: string, l: Lang): string =>
    l === 'es' ? `Es la última mejora de la ruta ${route}: con ella la ruta queda completa.` : `It is the last upgrade of the ${route} route: it completes the route.`,
  forWhatLine: (route: string, blurb: string, l: Lang): string => (l === 'es' ? `Ruta ${route}: ${blurb}` : `${route} route: ${blurb}`),
};

/** What the unfolded «¿Por qué?» shows (rendered by treeView, compared by the test). */
export interface NodeWhy {
  forWhat: string;
  matters: string;
  unlocks: string;
  /** "4 × ×1,5 = 6": start price, growth so far, the price now. */
  equation: { start: string; startLabel: string; growth: string; growthLabel: string; total: string; totalLabel: string };
  /** The rule in words. */
  rule: string;
  /** "nivel 2 · 9 Datos → Sesión 4:00"… */
  next: string[];
}

type WhyCtx = TreeCtx & { recentDatos?: readonly number[] };

/** Every sentence the node's sheet already shows (its body), to keep the explanation from repeating it. */
export function sheetSentences(id: string, lang: Lang, ctx: WhyCtx): string[] {
  const ba = beforeAfter(ctx.levels, id);
  const st = treeStates(ctx).get(id);
  const out = [nodeText(id).name[lang], nodeText(id).desc[lang], ba.before[lang], TREE_UI.now[lang], TREE_UI.next[lang], SESSION_UI.sheetHint[lang]];
  if (ba.after) out.push(ba.after[lang]);
  if (st && Number.isFinite(st.cost)) {
    out.push(TREE_UI.haveCost(fmt(ctx.datos, lang), fmt(st.cost, lang))[lang]);
    const missing = Math.max(0, st.cost - ctx.datos);
    const n = sessionsToAfford(missing, ctx.recentDatos ?? []);
    out.push(missing > 0 ? datosMissingText(missing, lang, n ? TREE_UI.sessions(n)[lang] : null) : lang === 'es' ? '¡Puedes comprarlo!' : 'You can buy it!');
  }
  return out.filter(Boolean);
}

const dec2 = (x: number, l: Lang): string => {
  const v = Math.round(x * 100) / 100;
  return v >= 1000 ? fmt(Math.round(v), l) : String(v).replace('.', l === 'es' ? ',' : '.');
};

/** The unfolded explanation of a node (null for the centre and unknown ids). */
export function nodeWhy(id: string, level: number, lang: Lang, ctx: WhyCtx): NodeWhy | null {
  const def = TREE_BY_ID[id];
  if (!def || id === 'lab' || def.branch === 'core') return null;
  const br = def.branch as BranchId;
  const route = BRANCH_TEXT[br].name[lang];
  const states = treeStates(ctx);
  // What it opens: the nodes that need it. Names only of what the player can already see; the rest
  // stays a surprise ("un paso nuevo").
  const after = TREE_NODES.filter((n) => n.requires.includes(id));
  const seen = after.filter((n) => {
    const s = states.get(n.id)?.status;
    return s && s !== 'hidden' && s !== 'mystery';
  });
  const unknown = after.length - seen.length;
  const unlocks = !after.length
    ? WHY_UI.last(route, lang)
    : seen.length
      ? WHY_UI.opens(
          seen.map((n) => nodeText(n.id).name[lang]),
          lang,
        ) + (unknown ? ` ${WHY_UI.opensUnknown(unknown, lang)}` : '')
      : WHY_UI.opensUnknown(unknown, lang);
  const r = priceRule(id);
  const rows = costRows(id, level, 3, { ...ctx.levels, [id]: level });
  const g = dec2(r.growth, lang);
  const cost = rows[0]?.cost;
  return {
    forWhat: WHY_UI.forWhatLine(route, BRANCH_TEXT[br].desc[lang], lang),
    matters: ROUTE_MATTERS[br][lang],
    unlocks,
    equation: {
      start: fmtShort(r.start, lang),
      startLabel: TREE_UI.ringStart(String(def.ring))[lang],
      growth: `×${dec2(Math.pow(r.growth, level), lang)}`,
      growthLabel: level > 0 ? TREE_UI.levelsBought(level, g)[lang] : TREE_UI.levelN(1)[lang],
      total: cost === undefined ? '—' : fmtShort(cost, lang),
      totalLabel: DATOS_NAME[lang],
    },
    rule: `${r.single ? TREE_UI.priceRuleOne(fmtShort(r.start, lang))[lang] : TREE_UI.priceRule(fmtShort(r.start, lang), g)[lang]} ${TREE_UI.priceWhy[lang]}`,
    next: rows.map((row) => `${TREE_UI.levelN(row.level)[lang]} · ${fmtShort(row.cost, lang)} ${DATOS_NAME[lang]} → ${row.value[lang]}`),
  };
}

/** All of an explanation's sentences, in reading order. */
export function whySentences(w: NodeWhy): string[] {
  return [w.forWhat, w.matters, w.unlocks, w.rule, ...w.next].filter(Boolean);
}
