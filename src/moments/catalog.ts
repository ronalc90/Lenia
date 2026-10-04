/**
 * The Momentos catalog: every first-time explainer, its trigger, its words
 * (es + en) and what it points at.
 *
 * Writing rules (tests enforce them): titles ≤ 4 words, 1–2 lines of ≤ 14
 * words, concrete and warm, no jargon a 5-year-old would not get. VELA speaks
 * the lines (she is the story's lab assistant), so they sound like her: short,
 * cheerful, a little amazed.
 */
import type { GameEvents } from '../core/bus';
import { BEHAVIOR_COLOR, UI } from '../core/palette';
import type { Behavior, GameView, Lang, Text } from '../core/types';
import { GOLDEN_LIFE, OFFLINE_RATE, SAMPLES_NEW_BEHAVIOR, SAMPLES_NEW_SPECIES } from '../game/balance';
import { fmt, fmtDuration, fmtFixed, fmtRate } from '../ui/format';
import { behaviorGuide, bonusText } from './behaviors';
import type {
  Built,
  Chip,
  ChipIcon,
  ChipTone,
  MomentData,
  MomentDef,
  MomentFocus,
  MomentId,
  TriggerCtx,
  TriggerDef,
  UiTarget,
} from './types';

const t = (es: string, en: string): Text => ({ es, en });
/** Text built per language (numbers use the locale's marks). */
const both = (f: (l: Lang) => string): Text => ({ es: f('es'), en: f('en') });

function chip(text: Text, tone: ChipTone, icon: ChipIcon = null): Chip {
  return { text, tone, icon };
}

function onEvent<K extends keyof GameEvents>(event: K, when?: (p: GameEvents[K], c: TriggerCtx) => boolean): TriggerDef {
  return { kind: 'event', event, when: when as ((p: unknown, c: TriggerCtx) => boolean) | undefined };
}

/** Typed builder over an event payload. */
function from<K extends keyof GameEvents>(_event: K, fn: (p: GameEvents[K], c: TriggerCtx) => Built): (p: unknown, c: TriggerCtx) => Built {
  return (p, c) => fn(p as GameEvents[K], c);
}

function at(x: number, y: number, zoom: number, id: number | null = null, target: UiTarget[] | null = null): MomentFocus {
  return { grid: { x, y, id }, target, zoom };
}
const ui = (...target: UiTarget[]): MomentFocus => ({ grid: null, target, zoom: 1 });

/** Creature of the view nearest to (x, y), within `maxD` cells (the event is at the creature, so no wrap needed). */
export function nearestCreature(v: GameView, x: number, y: number, maxD = 30): { id: number; eps: number } | null {
  let best: { id: number; eps: number } | null = null;
  let bd = maxD;
  for (const c of v.creatures) {
    const d = Math.hypot(c.x - x, c.y - y);
    if (d <= bd) {
      bd = d;
      best = { id: c.id, eps: c.eps };
    }
  }
  return best;
}

const essenceChip = (n: number, sign: '+' | '−', perSec = false): Chip =>
  chip(
    both((l) => `${sign}${perSec ? fmtRate(n, l) : fmt(n, l)} ${l === 'es' ? 'Esencia' : 'Essence'}${perSec ? '/s' : ''}`),
    sign === '+' ? 'good' : 'warn',
    'essence',
  );
/** "Nadadora: ×1,6 Esencia" — the production bonus of a behaviour, named (balance.ts, never a copy). */
const behaviorBonusChip = (b: Behavior): Chip => chip(both((l) => bonusText(b, l)), 'good', 'up');
const samplesChip = (n: number): Chip =>
  chip(both((l) => `+${n} ${l === 'es' ? (n === 1 ? 'Muestra' : 'Muestras') : n === 1 ? 'Sample' : 'Samples'}`), 'good', 'sample');
const genomeChip = (n: number): Chip => chip(both((l) => `+${fmt(n, l)} ${l === 'es' ? 'Genoma' : 'Genome'}`), 'violet', 'genome');
const zeroChip = chip(t('0 Esencia/s', '0 Essence/s'), 'grey', 'x');

const CALIB_KEYS = ['mu', 'sigma', 'R', 'dt'] as const;
const CALIB_LABEL: Record<(typeof CALIB_KEYS)[number], string> = { mu: 'μ', sigma: 'σ', R: 'R', dt: 'dt' };
const CALIB_DIGITS: Record<(typeof CALIB_KEYS)[number], number> = { mu: 3, sigma: 4, R: 0, dt: 2 };

/** "μ 0,150 → 0,160": the parameter that moved the most (relative). */
export function calibChip(from: MomentData['calibFrom'], to: MomentData['calibTo']): Chip | null {
  if (!from || !to) return null;
  let key: (typeof CALIB_KEYS)[number] | null = null;
  let most = 0;
  for (const k of CALIB_KEYS) {
    const rel = Math.abs(to[k] - from[k]) / Math.max(1e-9, Math.abs(from[k]));
    if (rel > most + 1e-12) {
      most = rel;
      key = k;
    }
  }
  if (!key) return null;
  const k = key;
  return chip(
    both((l) => `${CALIB_LABEL[k]} ${fmtFixed(from[k], CALIB_DIGITS[k], l)} → ${fmtFixed(to[k], CALIB_DIGITS[k], l)}`),
    'info',
    'slot',
  );
}

/** The seed price split the way the player sees it. */
export function priceData(v: GameView): MomentData['price'] | undefined {
  const p = v.seedPrice;
  if (!p) return undefined;
  return {
    base: p.base,
    cost: v.seedCost,
    crowdMult: p.crowdMult,
    satMult: p.satMult,
    freeSlots: p.freeSlots,
    used: p.used,
    alive: p.alive,
  };
}

/**
 * The seed price went above the empty-dish price for the first time: any
 * multiplier > 1 (crowding by living creatures, or the dish over its cheap
 * slots). Owner: "no price ever changes without a visible reason".
 */
export function priceRose(v: GameView): boolean {
  const p = v.seedPrice;
  if (!p) return false;
  return p.crowdMult > 1 + 1e-9 || p.satMult > 1 + 1e-9;
}

/** Back-compat name. */
export const priceIsHigh = priceRose;

const offlineShare: Text =
  OFFLINE_RATE === 0.5
    ? t('Sin ti ganan la mitad. ¡Vuelve para ganarlo todo!', 'Without you they earn half. Come back for it all!')
    : both((l) =>
        l === 'es'
          ? `Sin ti ganan un ${Math.round(OFFLINE_RATE * 100)} %. ¡Vuelve para ganarlo todo!`
          : `Without you they earn ${Math.round(OFFLINE_RATE * 100)}%. Come back for it all!`,
      );

// ───────────────────────────── behaviours ─────────────────────────────

/** Titles and moods; what each behaviour IS comes from src/moments/behaviors.ts (one source for every surface). */
const BEHAVIOR_TEXT: Record<Behavior, { title: Text; brief: Text; mood: MomentDef['mood'] }> = {
  still: { title: t('Una criatura quieta', 'A still creature'), brief: t('Quieta', 'Still'), mood: 'happy' },
  pulsing: { title: t('¡Late!', 'It pulses!'), brief: t('¡Pulsante!', 'It pulses!'), mood: 'awed' },
  swimmer: { title: t('¡Una nadadora!', 'A swimmer!'), brief: t('¡Nadadora!', 'Swimmer!'), mood: 'awed' },
  spinner: { title: t('¡Gira!', 'It spins!'), brief: t('¡Gira!', 'It spins!'), mood: 'awed' },
  divider: { title: t('¡Se divide!', 'It splits!'), brief: t('¡Se divide!', 'It splits!'), mood: 'awed' },
  colony: { title: t('¡Una colonia!', 'A colony!'), brief: t('¡Colonia!', 'Colony!'), mood: 'happy' },
};

function behaviorMoment(b: Behavior, priority: number): MomentDef {
  const tx = BEHAVIOR_TEXT[b];
  return {
    id: `behavior.${b}` as MomentId,
    priority,
    title: tx.title,
    // VELA says "what it is"; the card adds what changes, how to get more and how to boost it.
    lines: [behaviorGuide(b).what],
    brief: tx.brief,
    illustration: b,
    icon: 'behavior',
    mood: tx.mood,
    color: BEHAVIOR_COLOR[b] ?? UI.accent,
    trigger: onEvent('behaviorNew', (p) => p.behavior === b),
    build: from('behaviorNew', (p, c) => {
      const near = nearestCreature(c.view(), p.x, p.y);
      return {
        focus: at(p.x, p.y, b === 'colony' ? 1.5 : 2.2, near?.id ?? null),
        chips: [behaviorBonusChip(b), samplesChip(SAMPLES_NEW_BEHAVIOR)],
        data: { behavior: b },
      };
    }),
    delayMs: 300,
    alsoMarks: b === 'divider' ? ['division'] : undefined,
  };
}

// ───────────────────────────── the catalog ─────────────────────────────

export const MOMENTS: MomentDef[] = [
  {
    id: 'seed',
    priority: 94,
    title: t('Sembraste materia', 'You sowed matter'),
    lines: [
      t('Cada toque pone materia: una gotita de luz viva.', 'Each tap drops matter: a tiny blob of living light.'),
      t('Ahora mira: se apaga, lo inunda todo… ¡o cobra vida!', 'Now watch: it fades, it floods… or it comes alive!'),
    ],
    brief: t('Materia sembrada', 'Matter sown'),
    illustration: 'seed',
    icon: 'drop',
    mood: 'happy',
    color: UI.accent,
    trigger: onEvent('seed', (p) => p.manual),
    build: from('seed', (p) => ({
      focus: at(p.x, p.y, 2.4),
      chips: [essenceChip(p.cost, '−')],
      data: { amount: p.cost },
    })),
    delayMs: 900,
    story: ['t_wait'],
  },
  {
    id: 'dissolve',
    priority: 96,
    title: t('Se disolvió', 'It faded away'),
    lines: [
      t('Muy poquita materia, o mal repartida: se apagó.', 'Too little matter, or badly spread out: it went dark.'),
      t('No pasa nada. Sembrar es barato: ¡prueba otra vez!', 'That is okay. Sowing is cheap: try again!'),
    ],
    brief: t('Se disolvió', 'It faded away'),
    illustration: 'dissolve',
    icon: 'fade',
    mood: 'worried',
    color: '#9AA6B2',
    trigger: onEvent('creatureDied'),
    build: from('creatureDied', (p) => ({ focus: at(p.x, p.y, 2.2), chips: [zeroChip], data: {} })),
    delayMs: 300,
    story: ['t_fail'],
  },
  {
    id: 'explode',
    priority: 95,
    title: t('¡Explotó!', 'It exploded!'),
    lines: [
      t('Demasiada materia: lo llena todo y pierde la forma.', 'Too much matter: it fills everything and loses its shape.'),
      t('Sin forma no hay criatura, y no da Esencia.', 'No shape means no creature, and no Essence.'),
    ],
    brief: t('¡Explotó!', 'It exploded!'),
    illustration: 'explode',
    icon: 'burst',
    mood: 'worried',
    color: UI.warn,
    trigger: onEvent('creatureExploded'),
    build: from('creatureExploded', (p) => ({ focus: at(p.x, p.y, 1.5, p.id), chips: [zeroChip], data: {} })),
    delayMs: 500,
    story: ['t_explode'],
  },
  {
    id: 'stable',
    priority: 100,
    title: t('¡VIDA!', 'LIFE!'),
    lines: [
      t('Esta forma se mantiene sola: ¡es una criatura!', 'This shape holds itself together: it is a creature!'),
      t('Ni muy poca materia ni demasiada: justo lo necesario.', 'Not too little matter, not too much: just right.'),
    ],
    brief: t('¡VIDA!', 'LIFE!'),
    illustration: 'stable',
    icon: 'heart',
    mood: 'awed',
    color: UI.good,
    trigger: onEvent('creatureStable'),
    build: from('creatureStable', (p, c) => {
      const cv = c.view().creatures.find((x) => x.id === p.id);
      const eps = cv && cv.eps > 0 ? cv.eps : 1;
      return { focus: at(p.x, p.y, 2.4, p.id), chips: [essenceChip(eps, '+', true)], data: { amount: eps } };
    }),
    delayMs: 400,
    // t_essence chains right after t_stable; the income card (a few seconds later) tells it.
    story: ['t_stable', 't_essence'],
  },
  {
    id: 'income',
    priority: 90,
    title: t('Esto es Esencia', 'This is Essence'),
    lines: [
      t('Las criaturas estables fabrican Esencia, tu moneda.', 'Stable creatures make Essence, your money.'),
      t('Más forma, más Esencia. Úsala para sembrar y mejorar.', 'More shape, more Essence. Spend it on seeds and upgrades.'),
    ],
    brief: t('+Esencia', '+Essence'),
    illustration: 'essence',
    icon: 'essence',
    mood: 'happy',
    color: UI.accent,
    trigger: onEvent('income', (p) => p.amount > 0),
    build: from('income', (p, c) => {
      const v = c.view();
      const eps = v.essencePerSec > 0 ? v.essencePerSec : p.amount;
      return {
        focus: at(p.x, p.y, 1.6, p.id, ['hud.essence']),
        chips: [essenceChip(eps, '+', true)],
        data: { amount: eps },
      };
    }),
    story: ['t_essence'],
  },
  {
    id: 'species',
    priority: 85,
    title: t('¡Especie nueva!', 'New species!'),
    lines: [
      t('Nadie la había visto aquí. Se guarda en tu Bestiario.', 'Nobody had seen it here. It goes into your Bestiary.'),
      t('Cada especie nueva te da Muestras para el Bestiario.', 'Every new species gives you Samples for the Bestiary.'),
    ],
    brief: t('¡Especie nueva!', 'New species!'),
    illustration: 'species',
    icon: 'book',
    mood: 'awed',
    color: UI.good,
    trigger: onEvent('speciesNew'),
    build: from('speciesNew', (p, c) => {
      const near = nearestCreature(c.view(), p.x, p.y);
      return {
        focus: at(p.x, p.y, 2.2, near?.id ?? null, ['tab.bestiary']),
        chips: [samplesChip(SAMPLES_NEW_SPECIES[p.rarity]), chip(t(p.name, p.name), 'info', 'check')],
        data: { speciesId: p.speciesId, speciesName: p.name },
      };
    }),
    delayMs: 300,
    story: ['t_bestiary'],
  },
  {
    id: 'secondSpecies',
    priority: 84,
    title: t('Dos especies distintas', 'Two different species'),
    // One line: the two cards and the one-sentence reason below it do the rest.
    lines: [t('¡Otra especie! Cada forma se mueve distinto y rinde distinto.', 'Another species! Each shape moves and earns differently.')],
    brief: t('¡Otra especie!', 'Another species!'),
    illustration: 'compare',
    icon: 'book',
    mood: 'awed',
    color: '#7FD6FF',
    trigger: onEvent('speciesNew', (p, c) => c.view().species.some((s) => s.id !== p.speciesId)),
    build: from('speciesNew', (p, c) => {
      const v = c.view();
      const near = nearestCreature(v, p.x, p.y);
      // The other species: preferably one with a creature alive on the dish right now.
      const others = v.species.filter((s) => s.id !== p.speciesId);
      const alive = v.creatures.find((cr) => cr.state === 'stable' && cr.speciesId && cr.speciesId !== p.speciesId && others.some((o) => o.id === cr.speciesId));
      const other = alive ? others.find((o) => o.id === alive.speciesId)! : others[0];
      const focus = at(p.x, p.y, 2, near?.id ?? null, ['tab.bestiary']);
      if (alive) focus.others = [{ x: alive.x, y: alive.y, id: alive.id }];
      const nameOf = (s: { catalogName: string | null; name: string }) => s.catalogName ?? s.name;
      return {
        focus,
        // Names only matter for the brief label; the card shows both species cards.
        chips: other ? [chip(both((l) => `${p.name} ${l === 'es' ? 'y' : 'and'} ${nameOf(other)}`), 'info', 'check')] : [],
        data: { speciesId: p.speciesId, speciesName: p.name, otherSpeciesId: other?.id },
      };
    }),
    delayMs: 300,
    requires: 'species',
  },
  behaviorMoment('still', 70),
  behaviorMoment('pulsing', 71),
  behaviorMoment('swimmer', 72),
  behaviorMoment('spinner', 73),
  behaviorMoment('divider', 74),
  behaviorMoment('colony', 75),
  {
    id: 'division',
    priority: 76,
    title: t('¡Una se hizo dos!', 'One became two!'),
    lines: [
      t('Una criatura se partió en dos criaturas.', 'One creature split into two creatures.'),
      t('Ahora hay dos, y las dos pueden dar Esencia.', 'Now there are two, and both can make Essence.'),
    ],
    brief: t('¡Una se hizo dos!', 'One became two!'),
    illustration: 'division',
    icon: 'split',
    mood: 'awed',
    color: BEHAVIOR_COLOR.divider ?? UI.accent,
    trigger: onEvent('creatureDivided'),
    build: from('creatureDivided', (p) => ({
      focus: at(p.x, p.y, 1.8),
      chips: [chip(t('×2 criaturas', '×2 creatures'), 'good', 'up')],
      data: {},
    })),
    delayMs: 400,
  },
  {
    id: 'golden',
    priority: 110,
    title: t('¡Un Destello!', 'A Spark!'),
    lines: [
      t('Una chispa dorada cruza la placa. ¡Tócala rápido!', 'A golden spark drifts across the dish. Tap it, quick!'),
      t('Si la atrapas, te deja un regalo sorpresa.', 'Catch it and it leaves you a surprise gift.'),
    ],
    brief: t('¡Toca el Destello!', 'Tap the Spark!'),
    illustration: 'golden',
    icon: 'spark',
    mood: 'awed',
    color: UI.gold,
    trigger: onEvent('goldenSpawn'),
    build: from('goldenSpawn', (p) => ({
      focus: at(p.x, p.y, 1.6, null, ['golden']),
      chips: [chip(t('Regalo sorpresa', 'Surprise gift'), 'gold', 'gift'), chip(t(`${GOLDEN_LIFE} s`, `${GOLDEN_LIFE} s`), 'warn', 'clock')],
      data: {},
    })),
    // The spark must still be there to be worth a "tap it" card.
    valid: (_d, c) => !!c.view().golden,
    delayMs: 600,
    story: ['t_golden'],
  },
  {
    id: 'upgrade',
    priority: 60,
    title: t('¡Mejora comprada!', 'Upgrade bought!'),
    lines: [
      t('Las mejoras cambian cómo funciona tu laboratorio.', 'Upgrades change how your lab works.'),
      t('Mira el efecto: así estaba y así queda.', 'See the effect: how it was, and how it is now.'),
    ],
    brief: t('¡Mejora!', 'Upgrade!'),
    illustration: 'upgrade',
    icon: 'upgrade',
    mood: 'happy',
    color: UI.accent,
    trigger: onEvent('upgradeBought'),
    build: from('upgradeBought', (p, c) => {
      const u = c.view().upgrades.find((x) => x.id === p.id);
      const chips: Chip[] = [];
      if (u) {
        chips.push(chip(both((l) => `${u.name[l]} ${p.level}`), 'info', 'check'));
        if (u.effect.es || u.effect.en) chips.push(chip(u.effect, 'good', 'up'));
      }
      return { focus: ui('tab.lab'), chips, data: { upgradeId: p.id } };
    }),
    delayMs: 500,
  },
  {
    id: 'autoseed',
    priority: 58,
    title: t('Siembra automática', 'Auto-sowing'),
    lines: [
      t('El sembrador automático siembra por ti, solito.', 'The auto-sower plants seeds for you, all by itself.'),
      t('Cada siembra gasta un poquito de Esencia.', 'Each seed spends a little Essence.'),
    ],
    brief: t('Siembra automática', 'Auto-sown'),
    illustration: 'autoseed',
    icon: 'robot',
    mood: 'neutral',
    color: '#7FA8C0',
    trigger: onEvent('seed', (p) => !p.manual),
    build: from('seed', (p) => ({ focus: at(p.x, p.y, 1.8), chips: [essenceChip(p.cost, '−')], data: { amount: p.cost } })),
    delayMs: 500,
  },
  {
    id: 'calibration',
    priority: 65,
    title: t('Cambiaste las reglas', 'You changed the rules'),
    lines: [
      t('Moviste las reglas de la vida en toda la placa.', 'You moved the rules of life for the whole dish.'),
      t('Unas se apagan, otras nacen… ¡y con σ alto todo se desborda!', 'Some fade, new ones appear… and with high σ everything overflows!'),
    ],
    brief: t('Reglas nuevas', 'New rules'),
    illustration: 'rules',
    icon: 'sliders',
    mood: 'neutral',
    color: UI.accent,
    trigger: onEvent('calibrationChanged'),
    build: from('calibrationChanged', (p, c) => {
      const to = { mu: p.mu, sigma: p.sigma, R: p.R, dt: p.dt };
      const vc = c.view().calibration;
      const fromC = c.prev.calib ?? { mu: vc.mu, sigma: vc.sigma, R: vc.R, dt: vc.dt };
      const ch = calibChip(fromC, to);
      return { focus: ui('tab.calibrate', 'dish'), chips: ch ? [ch] : [], data: { calibFrom: fromC, calibTo: to } };
    }),
    // Never pause while the player drags a slider: wait until it rests.
    settleMs: 1600,
    merge: (first, latest) => {
      const data = { ...latest.data, calibFrom: first.data.calibFrom };
      const ch = calibChip(data.calibFrom, data.calibTo);
      return { ...latest, data, chips: ch ? [ch] : [] };
    },
  },
  {
    id: 'seedPrice',
    priority: 62,
    title: t('¿Por qué cuesta más?', 'Why so pricey?'),
    lines: [
      t('Cuantas más criaturas viven, más cuesta sembrar.', 'The more creatures live, the more sowing costs.'),
      t('Con la placa llena, cada extra cuesta mucho más. ¡Mejora la Placa!', 'With a full dish, each extra costs much more. Upgrade the Dish!'),
    ],
    brief: t('La siembra sube de precio', 'Sowing got pricier'),
    illustration: 'seedPrice',
    icon: 'tag',
    mood: 'neutral',
    color: UI.warn,
    trigger: { kind: 'poll', when: (c) => priceRose(c.view()) },
    build: (_p, c) => {
      const v = c.view();
      const price = priceData(v);
      const chips: Chip[] = [
        chip(both((l) => `${l === 'es' ? 'Siembra' : 'Seed'}: ${fmt(v.seedCost, l)}`), 'warn', 'essence'),
      ];
      if (price)
        chips.push(
          chip(
            both((l) => `${l === 'es' ? 'Espacios' : 'Slots'} ${Math.min(price.used, 99)}/${price.freeSlots}`),
            price.used > price.freeSlots ? 'bad' : 'info',
            'slot',
          ),
        );
      return { focus: ui('seed', 'dish'), chips, data: { price } };
    },
    delayMs: 800,
  },
  {
    id: 'seedCheaper',
    priority: 40,
    title: t('Más barato', 'Cheaper'),
    lines: [
      t('Murió una criatura y quedó un espacio libre.', 'A creature died, so a slot is free again.'),
      t('Por eso sembrar vuelve a ser más barato.', 'That is why sowing is cheaper again.'),
    ],
    brief: t('Murió una criatura → sembrar es más barato', 'A creature died → sowing is cheaper'),
    illustration: 'seedCheaper',
    icon: 'tag',
    mood: 'happy',
    color: UI.good,
    // Price fell since the last poll, right after a death.
    trigger: {
      kind: 'poll',
      when: (c) => c.prev.seedCost !== null && c.view().seedCost < c.prev.seedCost - 1e-9 && c.since('creatureDied') < 2500,
    },
    build: (_p, c) => {
      const v = c.view();
      const d = c.last('creatureDied') as GameEvents['creatureDied'] | undefined;
      return {
        focus: d ? at(d.x, d.y, 1) : ui('seed', 'dish'),
        chips: [chip(both((l) => `${l === 'es' ? 'Siembra' : 'Seed'}: ${fmt(v.seedCost, l)}`), 'good', 'down')],
        data: { price: priceData(v) },
      };
    },
    forceBrief: true,
    requires: 'seedPrice',
  },
  {
    id: 'overgrown',
    priority: 105,
    title: t('¡La placa se desbordó!', 'The dish overflowed!'),
    lines: [
      t('Demasiada vida sin forma: deja de producir.', 'Too much shapeless life: it stops producing.'),
      t('Límpiala y siembra con calma.', 'Clean it and sow calmly.'),
    ],
    brief: t('¡Placa desbordada! 0/s', 'Dish overflowed! 0/s'),
    illustration: 'overgrown',
    icon: 'burst',
    mood: 'worried',
    color: UI.warn,
    trigger: onEvent('dishOvergrown', (p) => p.on),
    // Zoom OUT: the whole flooded dish is the thing to see.
    build: () => ({
      focus: { grid: null, target: ['dish'], zoom: 1 },
      chips: [zeroChip, chip(t('Placa llena', 'Dish full'), 'warn', 'x')],
      data: {},
    }),
    // Still flooded when it opens (the player may have cleaned it already).
    valid: (_d, c) => c.view().overgrown !== false,
    delayMs: 400,
    action: { id: 'sterilize', label: t('Limpiar placa', 'Clean the dish') },
  },
  {
    id: 'extinctionReady',
    priority: 80,
    title: t('Extinción disponible', 'Extinction ready'),
    lines: [
      t('La placa está madura: puedes empezar una Era nueva.', 'The dish is ripe: you can start a new Era.'),
      t('Se borra la placa, pero ganas Genoma para reglas nuevas.', 'The dish is wiped, but you earn Genome for new rules.'),
    ],
    brief: t('¡Extinción disponible!', 'Extinction ready!'),
    illustration: 'extinctionReady',
    icon: 'genome',
    mood: 'neutral',
    color: '#B892FF',
    trigger: { kind: 'poll', when: (c) => c.view().extinction.available },
    build: (_p, c) => {
      const v = c.view();
      return { focus: ui('extinguish', 'tab.genome'), chips: [genomeChip(v.extinction.genomeGain)], data: { amount: v.extinction.genomeGain } };
    },
  },
  {
    id: 'extinction',
    priority: 92,
    title: t('¡Era nueva!', 'A new Era!'),
    lines: [
      t('Se borró la placa, pero lo que descubriste se queda.', 'The dish was wiped, but what you discovered stays.'),
      t('Gasta tu Genoma en el Árbol y vuelve a sembrar.', 'Spend your Genome in the Tree, then sow again.'),
    ],
    brief: t('¡Era nueva!', 'A new Era!'),
    illustration: 'keepReset',
    icon: 'genome',
    mood: 'happy',
    color: '#B892FF',
    trigger: onEvent('extinctionDone'),
    build: from('extinctionDone', (p) => ({
      focus: ui('tab.genome'),
      chips: [genomeChip(p.genome), chip(t(`Era ${p.era}`, `Era ${p.era}`), 'info', 'check')],
      data: { amount: p.genome, era: p.era },
    })),
  },
  {
    id: 'offline',
    priority: 120,
    title: t('Mientras no estabas', 'While you were away'),
    lines: [t('Tus criaturas siguieron trabajando mientras no estabas.', 'Your creatures kept working while you were gone.'), offlineShare],
    brief: t('¡Bienvenida de vuelta!', 'Welcome back!'),
    illustration: 'offline',
    icon: 'moon',
    mood: 'happy',
    color: UI.accent,
    trigger: onEvent('offlineReturn', (p) => p.essence > 0),
    build: from('offlineReturn', (p) => ({
      focus: ui('hud.essence'),
      chips: [essenceChip(p.essence, '+'), chip(both((l) => fmtDuration(p.seconds, l)), 'info', 'clock')],
      data: { amount: p.essence, seconds: p.seconds },
    })),
  },
];

export const MOMENT_BY_ID: ReadonlyMap<MomentId, MomentDef> = new Map(MOMENTS.map((m) => [m.id, m]));
export const MOMENT_IDS: readonly MomentId[] = MOMENTS.map((m) => m.id);

/** Order of the "¿Qué pasó?" sheet: the order a player usually meets them. */
export const HELP_ORDER: readonly MomentId[] = [
  'seed',
  'dissolve',
  'explode',
  'stable',
  'income',
  'species',
  'secondSpecies',
  'behavior.still',
  'behavior.swimmer',
  'behavior.pulsing',
  'behavior.spinner',
  'behavior.divider',
  'behavior.colony',
  'division',
  'golden',
  'upgrade',
  'seedPrice',
  'seedCheaper',
  'overgrown',
  'autoseed',
  'calibration',
  'extinctionReady',
  'extinction',
  'offline',
];

/** Story scene ids this module may consume (for the story bridge and its tests). */
export const STORY_SCENES_COVERED: readonly string[] = MOMENTS.flatMap((m) => m.story ?? []);
