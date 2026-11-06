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
import { DATOS_PER_NEW_BEHAVIOR, DATOS_PER_NEW_SPECIES, SESSION_SEED_PRICE, SESSION_TIME_PER_SPECIES } from '../game/cycleBalance';
import { SESSION_UI } from '../game/treeText';
import { warnSeconds } from '../game/session';
import { TEXT as GAME_TEXT } from '../game/content';
import { fmt, fmtDuration, fmtRate } from '../ui/format';
import { closestKnown } from '../species/looks';
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

/** Esencia is called Luz on screen (ADR-030, docs/CLARIDAD2.md §2.1); the code keeps `essence`. */
const essenceChip = (n: number, sign: '+' | '−', perSec = false): Chip =>
  chip(
    both((l) => `${sign}${perSec ? fmtRate(n, l) : fmt(n, l)} ${l === 'es' ? 'luz' : 'glow'}${perSec ? '/s' : ''}`),
    sign === '+' ? 'good' : 'warn',
    'essence',
  );
/** "Nadadora: ×1,6 luz" — the production bonus of a behaviour, named (balance.ts, never a copy). */
const behaviorBonusChip = (b: Behavior): Chip => chip(both((l) => bonusText(b, l)), 'good', 'up');
const samplesChip = (n: number): Chip =>
  chip(both((l) => `+${n} ${l === 'es' ? (n === 1 ? 'Muestra' : 'Muestras') : n === 1 ? 'Sample' : 'Samples'}`), 'good', 'sample');
/** Sessions loop (docs/CICLO.md): discoveries pay Datos at the end of the session (CLARIDAD J-31, J-32). */
const datosChip = (n: number): Chip => chip(both((l) => `+${n} ${l === 'es' ? 'Datos' : 'Data'}`), 'good', 'gift');
const secondsChip = (n: number): Chip => chip(both(() => `+${n} s`), 'good', 'clock');
const sessionsLoop = (v: GameView): boolean => v.cycle === 'sessions';
const genomeChip = (n: number): Chip => chip(both((l) => `+${fmt(n, l)} ${l === 'es' ? 'Genoma' : 'Genome'}`), 'violet', 'genome');
const zeroChip = chip(t('0 luz/s', '0 glow/s'), 'grey', 'x');

/** Seconds left on the session clock when its Momento explains it (the HUD's "¡Último minuto!"). */
/** The lab session in the view (sessions loop; absent in the classic loop). */
function sessionOf(v: GameView): { phase: string; remaining: number; limit: number; bonus: number } | null {
  const s = (v as { session?: { phase: string; remaining: number; limit?: number; bonus?: number } | null }).session;
  return s ? { phase: s.phase, remaining: s.remaining, limit: s.limit ?? s.remaining, bonus: s.bonus ?? 0 } : null;
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
 * The seed price went up for the first time (sessions loop, docs/CICLO.md): a seed bought today made
 * the next one dearer, in whole Esencia. Living creatures never raise it any more (owner: "never punish
 * growth"; CLARIDAD J-121), so crowding and a full dish do not open this card: the price pill and its
 * sheet explain them in the classic loop. Owner: "no price ever changes without a visible reason".
 */
export function priceRose(v: GameView): boolean {
  const p = v.seedPrice;
  if (!p || typeof p.stepMult !== 'number' || !(p.stepMult > 1 + 1e-9)) return false;
  const cheap = typeof p.cheapMult === 'number' && p.cheapMult > 0 ? p.cheapMult : 1;
  return v.seedCost > Math.max(1, Math.round(p.base * cheap)) + 1e-9;
}

/** Back-compat name. */
export const priceIsHigh = priceRose;

/** The seed price plate's second line: the one way the price changes is a Tree node (ADR-030 §2.11). */
const SEED_CHEAPER = t('Con «Semillas baratas» del Árbol, cuesta menos.', 'With “Cheap seeds” in the Tree, it costs less.');

/** The first purchase in the classic loop (Lab upgrades: at once; an Extinction resets them). */
const CLASSIC_UPGRADE_LINES: readonly [Text, Text] = [
  t('Tu mejora ya funciona.', 'Your upgrade works already.'),
  t('Mira la placa: lo vas a notar.', 'Watch the dish: you will notice it.'),
];

/** The income card in the sessions loop: light is collected from drops (ADR-030 §2.2). */
const SESSIONS_INCOME_LINES: readonly [Text, Text] = [
  t('Cada criatura con forma llena una gota de luz.', 'Every creature with a shape fills a drop of glow.'),
  t('Toca la gota para recogerla: con luz siembras más.', 'Tap the drop to collect it: glow buys more seeds.'),
];

/** The species card in the classic loop (Samples still exist there). */
const CLASSIC_SPECIES_LINES: readonly [Text, Text] = [
  t('Nadie la había visto aquí. Se guarda en tu Bestiario.', 'Nobody had seen it here. It goes into your Bestiary.'),
  t('Cada especie nueva te da Muestras para el Bestiario.', 'Every new species gives you Samples for the Bestiary.'),
];

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
  pulsing: { title: t('¡Late!', 'It pulses!'), brief: t('¡Late!', 'It pulses!'), mood: 'awed' },
  swimmer: { title: t('¡Una nadadora!', 'A swimmer!'), brief: t('¡Nadadora!', 'Swimmer!'), mood: 'awed' },
  spinner: { title: t('¡Gira!', 'It spins!'), brief: t('¡Gira!', 'It spins!'), mood: 'awed' },
  divider: { title: t('¡Se divide!', 'It splits!'), brief: t('¡Se divide!', 'It splits!'), mood: 'awed' },
  colony: { title: t('¡Una colonia!', 'A colony!'), brief: t('¡Colonia!', 'Colony!'), mood: 'happy' },
};

/** Plate numbers of the behaviour cards («LÁMINA 08 · Una criatura quieta»). */
const BEHAVIOR_PLATE: Record<Behavior, number> = { still: 8, pulsing: 9, swimmer: 10, spinner: 11, divider: 12, colony: 13 };

function behaviorMoment(b: Behavior, priority: number): MomentDef {
  const tx = BEHAVIOR_TEXT[b];
  return {
    id: `behavior.${b}` as MomentId,
    plate: BEHAVIOR_PLATE[b],
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
        chips: [behaviorBonusChip(b), sessionsLoop(c.view()) ? datosChip(DATOS_PER_NEW_BEHAVIOR) : samplesChip(SAMPLES_NEW_BEHAVIOR)],
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
    plate: 1,
    priority: 94,
    title: t('¡Una semilla!', 'A seed!'),
    lines: [
      t('Cada toque pone una semilla de luz. ¿Vivirá?', 'Each tap drops a seed of light. Will it live?'),
      t('Si se queda con forma, ¡es una criatura!', 'If it keeps its shape, it is a creature!'),
    ],
    brief: t('¡Semilla!', 'A seed!'),
    illustration: 'seed',
    icon: 'drop',
    mood: 'happy',
    color: UI.accent,
    trigger: onEvent('seed', (p) => p.manual),
    build: from('seed', (p) => ({
      focus: at(p.x, p.y, 2.4),
      // The first seeds are free: say "¡Gratis!", never "−0 luz".
      chips: [p.cost > 0 ? essenceChip(p.cost, '−') : chip(t('¡Gratis!', 'Free!'), 'good', 'gift')],
      data: { amount: p.cost },
    })),
    delayMs: 900,
    story: ['t_wait'],
  },
  {
    id: 'dissolve',
    plate: 2,
    priority: 96,
    title: t('Se apagó', 'It faded'),
    lines: [
      t('Era muy poquita y se apagó. ¡Pasa mucho!', 'It was too little and faded. That happens a lot!'),
      t('Sembrar es barato: prueba en otro sitio.', 'Seeds are cheap: try another spot.'),
    ],
    brief: t('Se apagó', 'It faded'),
    illustration: 'dissolve',
    icon: 'fade',
    mood: 'worried',
    color: '#9AA6B2',
    // Only a fade the player can relate to: never before their first seed (QA4 F-07: the starter faded
    // under VELA's first lines and the first thing a new player saw was "Se apagó").
    trigger: onEvent('creatureDied', (_p, c) => c.view().stats.seeds > 0),
    // Why it went dark, said at the spot (ADR-030 §2.5: game/contact.ts deathCause).
    build: from('creatureDied', (p) => ({ focus: at(p.x, p.y, 2.2), chips: [zeroChip], data: {}, brief: deathBrief(p.cause) })),
    delayMs: 300,
    story: ['t_fail'],
  },
  {
    id: 'explode',
    plate: 3,
    priority: 95,
    // The first fusion of the save: the run's one pausing card (§2.5); after that, a label at the spot.
    title: t('¡Se juntaron!', 'They merged!'),
    lines: [
      t('Al tocarse, dos criaturas se hacen una mancha sin forma.', 'When two creatures touch they become one shapeless blob.'),
      t('Sin forma no hay luz. Siembra lejos de las demás.', 'No shape, no glow. Sow away from the others.'),
    ],
    brief: GAME_TEXT.merged,
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
    plate: 4,
    priority: 100,
    title: t('¡VIDA!', 'LIFE!'),
    lines: [
      t('Esta forma se mantiene sola: ¡es una criatura!', 'This shape holds itself together: it is a creature!'),
      t('Ni poca luz ni demasiada: justo la que necesita.', 'Not too little light, not too much: just what it needs.'),
    ],
    brief: t('¡VIDA!', 'LIFE!'),
    illustration: 'stable',
    icon: 'heart',
    mood: 'awed',
    color: UI.good,
    trigger: onEvent('creatureStable'),
    build: from('creatureStable', (p, c) => {
      const v = c.view();
      const cv = v.creatures.find((x) => x.id === p.id);
      // The creature's own rate, the number its label shows; none while the clock waits for the first
      // seed (the HUD says +0/s then), never a made-up 1 (RF-10).
      const earning = !v.session || v.session.phase === 'running';
      const eps = earning && cv && cv.eps > 0 ? cv.eps : 0;
      return { focus: at(p.x, p.y, 2.4, p.id), chips: eps > 0 ? [essenceChip(eps, '+', true)] : [], data: { amount: eps } };
    }),
    delayMs: 400,
    // t_essence chains right after t_stable; the income card (a few seconds later) tells it.
    story: ['t_stable', 't_essence'],
  },
  {
    id: 'income',
    plate: 5,
    priority: 90,
    title: t('Esto es luz', 'This is glow'),
    lines: [
      t('Cada criatura con forma te da luz cada segundo.', 'Every creature with a shape gives you glow every second.'),
      t('Arriba: «+1 luz/s» quiere decir 1 de luz cada segundo.', 'Up top: “+1 glow/s” means 1 glow every second.'),
    ],
    brief: t('+luz', '+glow'),
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
        // Sessions: the light waits in a drop until it is collected (ADR-030 §2.2).
        lines: sessionsLoop(v) ? [...SESSIONS_INCOME_LINES] : undefined,
      };
    }),
    story: ['t_essence'],
  },
  {
    id: 'species',
    plate: 6,
    priority: 85,
    title: t('¡Especie nueva!', 'New species!'),
    lines: [
      t('Nadie la había visto aquí. Se guarda en tu Bestiario.', 'Nobody had seen it here. It goes into your Bestiary.'),
      t(
        `Cada especie nueva te da ${DATOS_PER_NEW_SPECIES} Datos y ${SESSION_TIME_PER_SPECIES} segundos más.`,
        `Every new species gives you ${DATOS_PER_NEW_SPECIES} Data and ${SESSION_TIME_PER_SPECIES} more seconds.`,
      ),
    ],
    brief: t('¡Especie nueva!', 'New species!'),
    illustration: 'species',
    icon: 'book',
    mood: 'awed',
    color: UI.good,
    trigger: onEvent('speciesNew'),
    build: from('speciesNew', (p, c) => {
      const v = c.view();
      const near = nearestCreature(v, p.x, p.y);
      const name = chip(t(p.name, p.name), 'info', 'check');
      if (sessionsLoop(v)) {
        // What the summary will really pay, the tree's Cuaderno included (QA4 F-18: the card said +10, the summary +12).
        const rw = v.research?.speciesReward ?? { datos: DATOS_PER_NEW_SPECIES, seconds: SESSION_TIME_PER_SPECIES };
        const extra = rw.datos - DATOS_PER_NEW_SPECIES;
        return {
          focus: at(p.x, p.y, 2.2, near?.id ?? null, ['tab.bestiary']),
          chips: [datosChip(rw.datos), secondsChip(rw.seconds), name],
          data: { speciesId: p.speciesId, speciesName: p.name, amount: rw.datos, seconds: rw.seconds },
          lines: [
            t('Nadie la había visto aquí. Se guarda en tu Bestiario.', 'Nobody had seen it here. It goes into your Bestiary.'),
            extra > 0
              ? t(`Te da ${rw.datos} Datos (${extra} por tu Cuaderno) y ${rw.seconds} segundos más.`, `It gives you ${rw.datos} Data (${extra} from your Notebook) and ${rw.seconds} more seconds.`)
              : t(`Cada especie nueva te da ${rw.datos} Datos y ${rw.seconds} segundos más.`, `Every new species gives you ${rw.datos} Data and ${rw.seconds} more seconds.`),
          ],
        };
      }
      // Classic loop: a new species still pays Samples.
      return {
        focus: at(p.x, p.y, 2.2, near?.id ?? null, ['tab.bestiary']),
        chips: [samplesChip(SAMPLES_NEW_SPECIES[p.rarity]), name],
        data: { speciesId: p.speciesId, speciesName: p.name },
        lines: [CLASSIC_SPECIES_LINES[0], CLASSIC_SPECIES_LINES[1]],
      };
    }),
    delayMs: 300,
    story: ['t_bestiary'],
  },
  {
    id: 'secondSpecies',
    plate: 7,
    priority: 84,
    title: t('Dos especies distintas', 'Two different species'),
    // One line; the comparison above the two cards names what you SEE is different (a hole, a bright
    // centre, the size: species/looks, docs/ESPECIES.md) and rings mark it on both portraits.
    lines: [t('¡Otra especie! Mira qué tiene distinto.', 'Another species! Look at what is different.')],
    brief: t('¡Otra especie!', 'Another species!'),
    illustration: 'compare',
    icon: 'book',
    mood: 'awed',
    color: '#7FD6FF',
    trigger: onEvent('speciesNew', (p, c) => c.view().species.some((s) => s.id !== p.speciesId)),
    build: from('speciesNew', (p, c) => {
      const v = c.view();
      const near = nearestCreature(v, p.x, p.y);
      const others = v.species.filter((s) => s.id !== p.speciesId);
      const me = v.species.find((s) => s.id === p.speciesId);
      // The other species: the known one that LOOKS most like the new one (the comparison then names
      // what differs); without look data, one with a creature alive on the dish right now.
      const knownCodes = others.map((o) => o.lookCode).filter((x): x is string => !!x);
      const closest = me?.lookCode ? closestKnown(me.lookCode, knownCodes) : null;
      const byLook = closest ? others.find((o) => o.lookCode === closest) : undefined;
      const alive = v.creatures.find(
        (cr) => cr.state === 'stable' && cr.speciesId && cr.speciesId !== p.speciesId && (byLook ? cr.speciesId === byLook.id : others.some((o) => o.id === cr.speciesId)),
      );
      const other = byLook ?? (alive ? others.find((o) => o.id === alive.speciesId)! : others[0]);
      const focus = at(p.x, p.y, 2, near?.id ?? null, ['tab.bestiary']);
      if (alive) focus.others = [{ x: alive.x, y: alive.y, id: alive.id }];
      // One name per species: the common one (docs/CLARIDAD.md J-118).
      const nameOf = (s: { name: string }) => s.name;
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
    plate: 21,
    priority: 76,
    title: t('¡Una se hizo dos!', 'One became two!'),
    lines: [
      t('Una criatura se partió en dos criaturas.', 'One creature split into two creatures.'),
      t('Ahora hay dos, y las dos pueden dar luz.', 'Now there are two, and both can make glow.'),
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
    plate: 14,
    priority: 110,
    title: t('¡Un Destello!', 'A Spark!'),
    lines: [
      t('Una chispa dorada cruza la placa. ¡Tócala rápido!', 'A golden spark drifts across the dish. Tap it, quick!'),
      t('Si la atrapas, te regala luz.', 'Catch it and it gives you glow.'),
    ],
    brief: t('¡Toca el Destello!', 'Tap the Spark!'),
    illustration: 'golden',
    icon: 'spark',
    mood: 'awed',
    color: UI.gold,
    trigger: onEvent('goldenSpawn'),
    build: from('goldenSpawn', (p) => ({
      focus: at(p.x, p.y, 1.6, null, ['golden']),
      chips: [chip(t('Regalo', 'Gift'), 'gold', 'gift'), chip(t(`Se va en ${GOLDEN_LIFE} s`, `Leaves in ${GOLDEN_LIFE} s`), 'warn', 'clock')],
      data: {},
    })),
    // The spark must still be there to be worth a "tap it" card.
    valid: (_d, c) => !!c.view().golden,
    delayMs: 600,
    story: ['t_golden'],
  },
  {
    id: 'upgrade',
    plate: 15,
    priority: 60,
    title: t('¡Mejora comprada!', 'Upgrade bought!'),
    lines: [
      t('Es tuya para siempre: nunca se pierde.', 'It is yours forever: it is never lost.'),
      t('La próxima sesión ya lo vas a notar.', 'You will feel it next session.'),
    ],
    brief: t('¡Mejora!', 'Upgrade!'),
    illustration: 'upgrade',
    icon: 'upgrade',
    mood: 'proud',
    color: UI.accent,
    trigger: onEvent('upgradeBought'),
    build: from('upgradeBought', (p, c) => {
      const u = c.view().upgrades.find((x) => x.id === p.id);
      const chips: Chip[] = [];
      if (u) {
        chips.push(chip(both((l) => `${u.name[l]} ${p.level}`), 'info', 'check'));
        if (u.effect.es || u.effect.en) chips.push(chip(u.effect, 'good', 'up'));
      }
      // The node in the research tree when it is on screen, else the upgrade's card (classic Lab).
      const focus = ui(`tree.node.${p.id}`, `upgrade.${p.id}`, 'tab.lab');
      // Classic Lab upgrades work at once and an Extinction resets them: say that instead.
      if (c.view().cycle !== 'sessions') return { focus, chips, data: { upgradeId: p.id }, lines: [CLASSIC_UPGRADE_LINES[0], CLASSIC_UPGRADE_LINES[1]] };
      return { focus, chips, data: { upgradeId: p.id } };
    }),
    // Sessions: the Tree's own sheet says it (before → after, CLARIDAD J-168) at the moment of buying;
    // this card waited for the next session to start and then told it again, with the Lab's levels.
    valid: (_d, c) => c.view().cycle !== 'sessions',
    delayMs: 500,
  },
  {
    id: 'autoseed',
    plate: 16,
    priority: 58,
    title: t('Siembra automática', 'Auto-sowing'),
    lines: [
      t('El sembrador automático siembra por ti, solito.', 'The auto-sower plants seeds for you, all by itself.'),
      t('Cada semilla gasta un poquito de luz.', 'Each seed spends a little glow.'),
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
    id: 'clock',
    plate: 18,
    priority: 95,
    title: t('Tu tiempo de laboratorio', 'Your lab time'),
    lines: [
      t('Este reloj es tu tiempo de laboratorio. ¡Ya casi se acaba!', 'This clock is your lab time. It is almost up!'),
      t('Al llegar a 0:00, tu luz se cuenta. ¡No pierdes nada!', 'At 0:00 your glow is counted. You lose nothing!'),
    ],
    brief: t('¡Ya casi!', 'Almost up!'),
    illustration: 'clock',
    icon: 'clock',
    mood: 'happy',
    color: UI.accent,
    // The clock turns amber (session.ts warnSeconds: a quarter of the run, 4–30 s), whatever the run's
    // length: the card, its chip and its dial say the same seconds as the clock (QA4 F-08: a fixed
    // "one minute" opened at the start of a 20 s run, with a dial running from 1:00).
    trigger: {
      kind: 'poll',
      when: (c) => {
        const s = sessionOf(c.view());
        return !!s && s.phase === 'running' && s.remaining > 0 && s.remaining <= warnSeconds(s.limit + s.bonus);
      },
    },
    // Only while the clock is still amber: a card that waited behind the summary would say stale seconds.
    valid: (_d, c) => {
      const s = sessionOf(c.view());
      return !!s && s.phase === 'running' && s.remaining > 0 && s.remaining <= warnSeconds(s.limit + s.bonus);
    },
    build: (_p, c) => {
      const s = sessionOf(c.view());
      const left = Math.max(0, Math.ceil(s?.remaining ?? 0));
      return {
        focus: ui('hud.clock'),
        chips: [chip(t(`Quedan ${left} s`, `${left} s left`), 'info', 'clock')],
        data: { seconds: left },
      };
    },
    delayMs: 200,
  },
  {
    id: 'seedPrice',
    plate: 19,
    priority: 62,
    // One price (ADR-030 §2.11, QA-CLARIDAD #21): SEED_PRICE_STEP is 1, the sheet says the fixed price.
    title: t('Precio de la semilla', 'The seed price'),
    lines: [
      SESSION_UI.seedAlways(String(SESSION_SEED_PRICE)),
      SEED_CHEAPER,
    ],
    brief: t('Una semilla, un precio', 'One seed, one price'),
    illustration: 'seedPrice',
    icon: 'tag',
    mood: 'neutral',
    color: UI.warn,
    trigger: { kind: 'poll', when: (c) => priceRose(c.view()) },
    build: (_p, c) => {
      const v = c.view();
      const price = priceData(v);
      const bought = v.seedPrice?.bought ?? 0;
      const chips: Chip[] = [chip(both((l) => `${l === 'es' ? 'Semilla' : 'Seed'}: ${fmt(v.seedCost, l)} ${l === 'es' ? 'luz' : 'glow'}`), 'warn', 'essence')];
      if (bought > 0) chips.push(chip(both((l) => `${l === 'es' ? 'Compradas hoy' : 'Bought today'}: ${fmt(bought, l)}`), 'info', 'up'));
      const lines = [SESSION_UI.seedAlways(String(Math.max(0, Math.round(v.seedCost)))), SEED_CHEAPER];
      return { focus: ui('seed', 'dish'), chips, data: { price }, lines };
    },
    delayMs: 800,
  },
  {
    id: 'overgrown',
    plate: 20,
    priority: 105,
    // The other first-time accident with a card (§2.5): «LÁMINA 20 · ¡Demasiada vida junta!».
    title: t('¡Demasiada vida junta!', 'Too much life!'),
    lines: [
      t('Muchas se juntaron y la mancha creció sin parar.', 'Many merged and the blob kept on growing.'),
      t('Límpiala gratis y deja sitio entre criaturas.', 'Clean it for free and leave room between creatures.'),
    ],
    brief: t('¡Placa desbordada! 0 luz/s', 'Dish overflowed! 0 glow/s'),
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
    plate: 22,
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
    plate: 23,
    priority: 92,
    title: t('¡Era nueva!', 'A new Era!'),
    lines: [
      t('Se borró la placa, pero lo que descubriste se queda.', 'The dish was wiped, but what you discovered stays.'),
      t('Gasta tu Genoma en el Árbol y vuelve a sembrar.', 'Spend your Genome in the Tree, then sow again.'),
    ],
    brief: t('¡Era nueva!', 'A new Era!'),
    illustration: 'keepReset',
    icon: 'genome',
    mood: 'proud',
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
    plate: 24,
    priority: 120,
    title: t('Mientras no estabas', 'While you were away'),
    lines: [t('Tus criaturas siguieron trabajando mientras no estabas.', 'Your creatures kept working while you were gone.'), offlineShare],
    brief: t('¡Bienvenida de vuelta!', 'Welcome back!'),
    illustration: 'offline',
    icon: 'moon',
    mood: 'sleepy',
    color: UI.accent,
    // Classic loop only: sessions run only while playing (no work while away; CLARIDAD B-13).
    trigger: onEvent('offlineReturn', (p, c) => p.essence > 0 && c.view().cycle !== 'sessions'),
    build: from('offlineReturn', (p) => ({
      focus: ui('hud.essence'),
      chips: [essenceChip(p.essence, '+'), chip(both((l) => fmtDuration(p.seconds, l)), 'info', 'clock')],
      data: { amount: p.essence, seconds: p.seconds },
    })),
  },
  // ── ADR-030 (docs/CLARIDAD2.md §2.2, §2.5): collected light, the warning before a touch, steering ──
  {
    id: 'contact',
    plate: 3,
    priority: 98,
    title: t('¡Cuidado!', 'Careful!'),
    lines: [
      t('Si dos criaturas se tocan, se juntan y se apagan.', 'If two creatures touch, they merge and go dark.'),
      t('Siembra lejos de las demás o guía a la nadadora.', 'Sow away from the others or steer the swimmer.'),
    ],
    brief: GAME_TEXT.contactSoon,
    illustration: 'explode',
    icon: 'burst',
    mood: 'worried',
    color: UI.warn,
    // The game's warning link (GameView.dangers): two outlines will touch within CONTACT_WARN_S.
    trigger: { kind: 'poll', when: (c) => sessionOf(c.view())?.phase === 'running' && (c.view().dangers?.length ?? 0) > 0 },
    build: (_p, c) => {
      const v = c.view();
      const d = v.dangers?.[0];
      const a = d ? v.creatures.find((x) => x.id === d.a) : undefined;
      const b = d ? v.creatures.find((x) => x.id === d.b) : undefined;
      const swimmer = [a, b].some((x) => x?.behavior === 'swimmer');
      const focus: MomentFocus =
        a && b ? { grid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, id: null }, others: [{ x: a.x, y: a.y, id: a.id }, { x: b.x, y: b.y, id: b.id }], target: null, zoom: 1.4 } : ui('dish');
      return { focus, chips: [], data: {}, brief: swimmer ? GAME_TEXT.contactSteer : GAME_TEXT.contactSoon };
    },
    // A warning, never a stop (the dish keeps running so the player can act).
    forceBrief: true,
    valid: (_d, c) => (c.view().dangers?.length ?? 0) > 0,
  },
  {
    id: 'collect',
    plate: 25,
    priority: 89,
    title: t('Recoger la luz', 'Collecting glow'),
    lines: [
      t('Cada criatura con forma llena una gota de luz.', 'Every creature with a shape fills a drop of glow.'),
      t('Tócala o pasa el dedo por encima para recogerla.', 'Tap it or swipe over it to collect it.'),
    ],
    brief: t('¡Luz recogida!', 'Glow collected!'),
    illustration: 'essence',
    icon: 'essence',
    mood: 'happy',
    color: UI.accent,
    trigger: onEvent('lightCollected', (p) => p.by === 'hand' && p.amount > 0),
    build: from('lightCollected', (p) => ({ focus: at(p.x, p.y, 1.6, null, ['hud.essence']), chips: [essenceChip(p.amount, '+')], data: { amount: p.amount } })),
    delayMs: 300,
    // ADR-031: never while a streak runs. With the pulse every hand collection is a hit of the streak, so the pulse
    // lesson (t_pulse) teaches it instead; a brief per tap covered the ¡Chispazo! (a run defers it, unseen, each time).
    valid: (_d, c) => !(c.view().streak?.hits ?? 0),
  },
  {
    id: 'steer',
    plate: 26,
    priority: 69,
    title: t('Guiar', 'Steering'),
    lines: [
      t('Apoya el dedo en una nadadora y arrástralo.', 'Put your finger on a swimmer and drag it.'),
      t('Gira hacia tu dedo, nunca hacia el cristal.', 'It turns towards your finger, never into the glass.'),
    ],
    brief: t('Arrástrala para guiarla', 'Drag it to steer'),
    illustration: 'swimmer',
    icon: 'behavior',
    mood: 'happy',
    color: BEHAVIOR_COLOR.swimmer ?? UI.accent,
    // A swimmer on a running dish, once its way of moving was told (the steering gesture is ADR-030 §2.5).
    trigger: { kind: 'poll', when: (c) => sessionOf(c.view())?.phase === 'running' && c.view().creatures.some((x) => x.state === 'stable' && x.behavior === 'swimmer') },
    build: (_p, c) => {
      const sw = c.view().creatures.find((x) => x.state === 'stable' && x.behavior === 'swimmer');
      return { focus: sw ? at(sw.x, sw.y, 1.8, sw.id) : ui('dish'), chips: [], data: { behavior: 'swimmer' } };
    },
    requires: 'behavior.swimmer',
    delayMs: 600,
  },
];

/** A seed that never took went dark: the label says why (ADR-030 §2.5). */
function deathBrief(cause: GameEvents['creatureDied']['cause']): Text | undefined {
  if (cause === 'glass') return GAME_TEXT.deathGlass;
  if (cause === 'crowd') return GAME_TEXT.deathCrowd;
  if (cause === 'faded') return GAME_TEXT.deathFaded;
  return undefined;
}

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
  'overgrown',
  'autoseed',
  'clock',
  'extinctionReady',
  'extinction',
  'offline',
  'contact',
  'collect',
  'steer',
];

/** Story scene ids this module may consume (for the story bridge and its tests). */
export const STORY_SCENES_COVERED: readonly string[] = MOMENTS.flatMap((m) => m.story ?? []);
