/**
 * The script of Bioluma: every scene, line and journal entry (es + en).
 * Plot, cast and structure: docs/STORY.md. Tone: serene curiosity, slightly
 * melancholic, dry humour, respect for the creatures (GDD §3).
 *
 * Owner's rule: "clean, clear, understandable even for a 5-year-old, yet
 * extremely fun". So: tutorial bubbles ≤ 12 words, concrete and warm; VELA
 * points, reacts and celebrates more than she explains. Later beats may be a
 * little richer, but every line stays short (≤ 20 words) and every scene is
 * skippable. Tests enforce both limits.
 *
 * Voices
 *  - VELA (lab assistant, a little flask robot with a candle flame): cheerful,
 *    precise, a bit anxious; counts things; catchphrase «Anotado» / "Noted".
 *  - Dr. Albor (tapes): warm, tired, poetic; "Day N of the night".
 *  - The Committee (telex): CAPITALS, bureaucratic, always ends with FIN / END.
 *  - The Choir (the creatures): dots first, later three small words at a time.
 *  - You (journal voice): terse first person.
 *
 * Tokens resolved at runtime: {first} first species, {best} best-yield species,
 * {rhythm} the player's own recent seeding rhythm drawn as dots.
 */
import type { Text } from '../core/types';
import { REACHABLE_BEHAVIORS, WORLD_BY_ID } from '../game/worlds';
import { catalogGroup } from '../species/identity';
import { CATALOG, catalogByCode } from '../sim/catalog';
import type { Act, JournalDef, LineDef, Mood, SceneDef, Speaker, StoryCtx, TargetId, WaitDef } from './types';

const t = (es: string, en: string): Text => ({ es, en });

function L(who: Speaker, mood: Mood, es: string, en: string, extra: Partial<LineDef> = {}): LineDef {
  return { who, mood, text: t(es, en), ...extra };
}
const vela = (mood: Mood, es: string, en: string, extra?: Partial<LineDef>) => L('vela', mood, es, en, extra);
const albor = (es: string, en: string, extra?: Partial<LineDef>) => L('albor', 'neutral', es, en, extra);
const telex = (es: string, en: string) => L('committee', 'neutral', es, en);
const coro = (es: string, en: string, extra?: Partial<LineDef>) => L('coro', 'neutral', es, en, extra);
const you = (es: string, en: string) => L('you', 'neutral', es, en);
const at = (...ids: TargetId[]) => ({ target: ids });

/** Word limits enforced by tests (owner's "5-year-old" rule). */
export const MAX_WORDS_TUTORIAL = 12;
export const MAX_WORDS = 20;

// ───────────────────────────── Names ─────────────────────────────

export const SPEAKER_NAMES: Record<Speaker, Text> = {
  vela: t('VELA', 'VELA'),
  albor: t('Albor · cinta', 'Albor · tape'),
  committee: t('Comité', 'Committee'),
  coro: t('El Coro', 'The Choir'),
  you: t('Tú', 'You'),
};
/** The Choir before VELA names it. */
export const UNKNOWN_CHOIR: Text = t('· · ·', '· · ·');
/** Albor speaking live (after the secret ending). */
export const ALBOR_LIVE: Text = t('Dra. Albor', 'Dr. Albor');

export const ACT_TITLES: Record<Act, Text> = {
  1: t('Acto I · Noche polar', 'Act I · Polar Night'),
  2: t('Acto II · Cosas raras', 'Act II · Strange Things'),
  3: t('Acto III · Primera luz', 'Act III · First Light'),
  4: t('Epílogos', 'Epilogues'),
};

/**
 * "Albor's seven species" (the secret ending and the Encargo `seven` need all of them): one that
 * really lives in each world, in world order (CLARIDAD J-129; the GDD's seed species Helicium
 * solidus and Kronium dividuus live in no world, so asking for them was an impossible goal).
 */
export const ALBOR_SPECIES_CODES: readonly string[] = ['O2u', 'C0v', 'OG2g', 'S2s', 'H3cp', 'P4cp', '3GH2n'];
/** Their catalog names (what SpeciesView.catalogName holds). */
export const SEED_SPECIES: readonly string[] = ALBOR_SPECIES_CODES.map((c) => catalogByCode(c)?.name ?? c);
/** Catalog names that count as each of the seven: the species and the forms the detector cannot tell from it. */
const ALBOR_NAMES: readonly (readonly string[])[] = ALBOR_SPECIES_CODES.map((code) => CATALOG.filter((e) => catalogGroup(e.code) === catalogGroup(code)).map((e) => e.name));
/** How many of Albor's seven species these Bestiary names hold (exact names; "Orbium unicaudatus ignis" is not "Orbium unicaudatus"). */
export function alborSpeciesFound(catalogNames: readonly (string | null | undefined)[]): number {
  const have = new Set(catalogNames.filter((x): x is string => !!x));
  return ALBOR_NAMES.filter((names) => names.some((n) => have.has(n))).length;
}
/** Ways of moving a player can find (measured per world: game/worlds.ts WORLD_BEHAVIORS). */
export { REACHABLE_BEHAVIORS };
/** The world each of Albor's species lives in (for hints). */
export const ALBOR_SPECIES_WORLDS: readonly string[] = ALBOR_SPECIES_CODES.map((c) => Object.values(WORLD_BY_ID).find((w) => w.species.includes(c))?.id ?? 'classic');

// ───────────────────────────── Journal (Bitácora) ─────────────────────────────

export const STORY_JOURNAL: JournalDef[] = [
  { id: 's_committee', text: t('Llegó un télex. Quieren números. Les mandé uno: cuántas criaturas viven. Creo que esperaban otro.', 'A telex came. They want numbers. I sent one: how many creatures are alive. I think they wanted another.') },
  { id: 's_lamp', text: t('Dejé la lámpara encendida al empezar la noche. Es una tontería. Lo haré siempre.', 'I left the lamp on as the night began. It is silly. I will always do it.') },
  { id: 's_protocol', text: t('Borré la placa según el protocolo. Limpio y rápido. No sé por qué lo apunto.', 'I wiped the dish by the book. Clean and fast. I do not know why I write it down.') },
  { id: 's_memory', text: t('La placa no debería recordar nada. Y aun así saluda a cada especie como a una vieja amiga.', 'The dish should not remember anything. Yet it greets every species like an old friend.') },
  { id: 's_tape1', text: t('Escuché la voz de la doctora Albor. Habla de las criaturas como de pájaros que vuelven cada invierno.', 'I heard Dr. Albor\'s voice. She talks about the creatures like birds that come back every winter.') },
  { id: 's_send', text: t('Mandé nuestra mejor especie al sur en una caja. Espero que allí también sea de noche.', 'I sent our best species south in a box. I hope it is night there too.') },
  { id: 's_refuse', text: t('Dije que no. La placa no es una fábrica. Todavía.', 'I said no. The dish is not a factory. Not yet.') },
  { id: 's_tape2', text: t('Albor creía que la placa recuerda. Empiezo a creerlo yo también.', 'Albor believed the dish remembers. I am starting to believe it too.') },
  { id: 's_coro', text: t('La placa repitió el ritmo de mis dedos y añadió una nota. No sé qué preguntan.', 'The dish repeated the rhythm of my fingers and added one note. I do not know what they ask.') },
  { id: 's_answer', text: t('Toqué tres veces. Me respondieron cuatro. Hoy tampoco voy a dormir.', 'I tapped three times. They answered with four. I will not sleep tonight either.') },
  { id: 's_recal', text: t('Quité el ruido. Las reglas están limpias. La placa, más callada que nunca.', 'I removed the noise. The rules are clean. The dish, quieter than ever.') },
  { id: 's_confession', text: t('VELA me ocultó la verdad porque Albor se lo pidió. No me enfado. Tenía razón: primero me enamoré.', 'VELA hid the truth because Albor asked her to. I am not angry. She was right: I fell in love first.') },
  { id: 's_tape3', text: t('El Destello es un recuerdo de Albor hecho luz. Cada vez que lo atrapé, ella me ayudaba. Ahora la placa me aprende a mí.', 'The Spark is a memory of Albor made of light. Each time I caught it, she was helping me. Now the dish learns me.') },
  { id: 's_words', text: t('Hablaron. Tres palabras cada vez, como quien aprende a nadar.', 'They spoke. Three words at a time, like someone learning to swim.') },
  // Encargos (src/story/encargoScript.ts)
  { id: 'e_heat', text: t('Tres criaturas encendieron la calefacción. VELA estrena bufanda. No sé de dónde sacó la lana.', 'Three creatures turned the heating on. VELA has a new scarf. I do not know where she got the wool.') },
  { id: 'e_extinct', text: t('Primera noche nueva. La placa se lavó, pero el Bestiario no. Nada se perdió.', 'First new night. The dish was washed, the Bestiary was not. Nothing was lost.') },
  { id: 'e_medal', text: t('El Comité mandó una medalla. VELA se la colgó y no se la quita ni para dormir.', 'The Committee sent a medal. VELA put it on and will not take it off, not even to sleep.') },
  { id: 'e_dancer', text: t('Una bailarina. Albor tenía razón: gira sin marearse.', 'A dancer. Albor was right: it spins without getting dizzy.') },
  { id: 'e_seven', text: t('Las siete especies de Albor, juntas otra vez. VELA lleva una flor en el tapón.', 'Albor’s seven species, together again. VELA wears a flower on her cork.') },
  { id: 's_end_harvest', text: t('Cumplí la cuota. La placa ya no canta, pero rinde.', 'I met the quota. The dish no longer sings, but it yields.') },
  { id: 's_end_law', text: t('Escribí un mundo sin errores. Ya nada me sorprende.', 'I wrote a world without mistakes. Nothing surprises me anymore.') },
  { id: 's_end_memory', text: t('Nada se perdió del todo. Recordar también es estar vivo.', 'Nothing was ever fully lost. Remembering is a way of being alive.') },
  { id: 's_end_tide', text: t('Apagué el microscopio. Siguen brillando sin mí.', 'I switched off the microscope. They keep glowing without me.') },
  { id: 's_end_albor', text: t('Ya no sé quién descubrió a quién. Nos descubrimos.', 'I no longer know who discovered whom. We discovered each other.') },
];

// ───────────────────────────── Helpers for conditions ─────────────────────────────

const dropperReady = (c: StoryCtx): boolean => {
  const d = c.v.upgrades.find((u) => u.id === 'dropper');
  return !!d && d.unlocked && d.level === 0 && d.affordable;
};
const dropperBought = (c: StoryCtx): boolean => (c.v.upgrades.find((u) => u.id === 'dropper')?.level ?? 0) > 0;
const goldenVisible = (c: StoryCtx, life = 0.35): boolean => !!c.v.golden && c.v.golden.life > life;
/** The sessions cycle runs (lab sessions + research tree + worlds). */
const sessions = (c: StoryCtx): boolean => c.v.cycle === 'sessions';
/** "The dish is ripe": a new night is ready (sessions) or the Extinction is available (classic). */
const ripe = (c: StoryCtx): boolean => (sessions(c) ? !!c.v.research?.nightReady : c.v.extinction.available);
const extinctionProgress = (c: StoryCtx): number =>
  sessions(c) ? (c.v.research?.nightReady ? 1 : (c.v.research?.nightProgress ?? 0)) : c.v.extinction.available ? 1 : (c.v.extinction.progress ?? 0);
/** Tree levels bought (any node but the night). */
const treeBought = (c: StoryCtx): number => Object.entries(c.v.research?.levels ?? {}).filter(([id, l]) => id !== 'lab' && l > 0).length;

const tapWait = (es: string, en: string, extra: Partial<WaitDef> = {}): WaitDef => ({
  event: 'taps',
  text: t(es, en),
  target: ['dish'],
  ...extra,
});

/** The first decision of the story: how the first night ends (a1_extinction classic, a1_night sessions). */
const LAMP_CHOICE: NonNullable<SceneDef['choice']> = {
  id: 'lamp',
  options: [
    {
      id: 'lamp',
      label: t('Dejar la lámpara encendida', 'Leave the lamp on'),
      reply: [vela('happy', 'Anotado. Le habría gustado.', 'Noted. She would have liked that.')],
      journal: 's_lamp',
    },
    {
      id: 'protocol',
      label: t('Seguir el protocolo', 'Follow protocol'),
      reply: [vela('neutral', 'Anotado. Rápido y limpio. Al Comité le encantará.', 'Noted. Quick and clean. The Committee will love it.')],
      journal: 's_protocol',
    },
  ],
};

/**
 * PHASE-2B-REMOVE: scenes of the classic loop only (Laboratorio, Calibrar, Extinción). Their
 * conditions never hold in the sessions cycle (t_tree, t_world and a1_night teach it there); they go
 * with the classic loop. The jargon guard (script.test.ts) skips them.
 */
export const CLASSIC_ONLY_SCENES: readonly string[] = ['t_lab', 't_calibrate', 'a1_extinction'];

/** Set by the integrator (story.setFlag) when the opening intro (src/ui/intro) finishes or is skipped. */
export const INTRO_SEEN_FLAG = 'introSeen';

/** VELA's hello (t_intro) for a player who did not watch the intro. */
export const T_INTRO_LINES: LineDef[] = [
  vela('awed', '¡Oh! ¡Hola, hola! Esto es la Estación Vigilia.', 'Oh! Hello, hello! This is Vigil Station.'),
  vela('happy', 'Soy VELA. Es un acrónimo. Nadie sabe de qué.', 'I\'m VELA. It\'s an acronym. Nobody knows for what.'),
  vela('neutral', 'Aquí la noche dura meses. La luz crece en la placa.', 'Here the night lasts months. Light grows in the dish.', at('dish')),
  vela('happy', '¡Toca la placa! A ver qué pasa.', 'Tap the dish! Let\'s see what happens.', at('dish')),
];
/** t_intro after the intro: the station, VELA and the dish were already introduced; straight to the task. */
export const T_INTRO_AFTER_INTRO: LineDef[] = [
  vela('happy', '¡Ya estamos! Tu primera semilla, colega.', 'Here we are! Your first seed, colleague.', at('dish')),
  vela('happy', '¡Toca la placa! A ver qué pasa.', 'Tap the dish! Let\'s see what happens.', at('dish')),
];

/** The Choir's question (final choice). */
const QUESTION = coro('¿qué  ·  somos  ·  para  ·  ti  ?', 'what  ·  are  ·  we  ·  to  ·  you  ?', { hint: 'echo' });

// ───────────────────────────── Scenes ─────────────────────────────

export const SCENES: SceneDef[] = [
  // ═══════════════════════ ACT I · POLAR NIGHT (Era 1, tutorial) ═══════════════════════
  {
    id: 't_intro',
    act: 1,
    tutorial: true,
    priority: 100,
    title: t('Estación Vigilia', 'Vigil Station'),
    when: (c) => c.n('seeds') === 0 && c.v.stats.seeds === 0,
    // After the opening intro (src/ui/intro, flag 'introSeen') VELA skips the hello it already said.
    lines: (c) => (c.flag(INTRO_SEEN_FLAG) ? T_INTRO_AFTER_INTRO : T_INTRO_LINES),
    wait: tapWait('Toca la placa.', 'Tap the dish.', { event: 'seeds' }),
  },
  {
    id: 't_wait',
    act: 1,
    tutorial: true,
    after: ['t_intro'],
    title: t('Paciencia', 'Patience'),
    when: (c) => c.n('seeds') >= 1 && c.n('stables') === 0 && c.n('deaths') === 0 && c.n('explosions') === 0 && c.since('t_intro') >= 9,
    lines: [
      vela('neutral', 'Espera un poquito. Está decidiendo si vive.', 'Wait a moment. It\'s deciding if it lives.', at('dish')),
      vela('happy', 'Si se queda con forma, ¡es una criatura!', 'If it keeps its shape, it\'s a creature!'),
      vela('worried', 'Siembra separado: si dos se tocan, se funden.', 'Sow apart: if two touch, they melt together.', at('dish')),
    ],
  },
  {
    id: 't_fail',
    act: 1,
    tutorial: true,
    priority: 50,
    after: ['t_intro'],
    title: t('Muy poquito', 'Too little'),
    when: (c) => c.n('deaths') >= 1 && c.n('stables') === 0 && c.stablesNow() === 0,
    lines: [
      vela('worried', 'Oh… se apagó. Era muy poquito.', 'Oh… it faded. Too little.'),
      vela('neutral', 'Pasa mucho. ¡Sembrar es barato!', 'That happens a lot. Sowing is cheap!'),
      vela('happy', 'Prueba otra vez, en otro sitio.', 'Try again, somewhere else.', at('dish')),
    ],
    wait: tapWait('Siembra otra vez.', 'Sow again.', { timeoutSec: 40 }),
  },
  {
    id: 't_explode',
    act: 1,
    tutorial: true,
    priority: 55,
    after: ['t_intro'],
    title: t('Demasiado', 'Too much'),
    when: (c) => c.n('explosions') >= 1,
    lines: [
      vela('worried', '¡Uy! Dos semillas se tocaron y se fundieron: ya no tienen forma.', 'Whoa! Two seeds touched and melted together: no shape any more.', at('dish')),
      vela('neutral', 'La materia sin forma no da Esencia. Se come la placa.', 'Shapeless matter gives no Essence. It eats the dish.'),
      vela('happy', 'Por eso la disolví. Siembra lejos de las demás.', 'So I dissolved it. Sow away from the others.', at('dish')),
      vela('happy', '¡Lo apunto bien grande en mi libreta!', 'I\'m writing that down, nice and big!'),
    ],
  },
  {
    id: 't_stable',
    act: 1,
    tutorial: true,
    priority: 80,
    after: ['t_intro'],
    title: t('Algo se quedó', 'Something stayed'),
    when: (c) => c.n('stables') >= 1 || c.stablesNow() >= 1,
    lines: [
      vela('awed', 'Espera… ¡mira!', 'Wait… look!', at('creature', 'dish')),
      vela('awed', 'Tiene borde. Tiene forma. ¡Se queda!', 'It has an edge. A shape. It stays!', at('creature', 'dish')),
      vela('happy', 'Es una criatura. Tu primera. Hola, pequeña.', 'It\'s a creature. Your first one. Hello, little one.', at('creature', 'dish')),
    ],
  },
  {
    id: 't_essence',
    act: 1,
    tutorial: true,
    chain: true,
    priority: 79,
    after: ['t_stable'],
    title: t('Esencia', 'Essence'),
    when: () => true,
    lines: [
      vela('neutral', '¿Ves este número? Es tu Esencia.', 'See this number? That\'s your Essence.', at('hud.essence')),
      vela('happy', 'Cada criatura con forma te da Esencia cada segundo.', 'Every creature with a shape gives Essence every second.', at('creature', 'dish')),
      vela('neutral', 'Debajo ves cuánto ganas por segundo: «+1/s».', 'Below it: how much you earn per second, "+1/s".', at('hud.essence')),
      vela('worried', 'Lo que no tiene forma no da nada.', 'Anything without a shape gives nothing.'),
      vela('happy', 'Gástala en semillas. Más criaturas, más Esencia.', 'Spend it on seeds. More creatures, more Essence.', at('hud.essence')),
    ],
  },
  {
    id: 't_lab',
    act: 1,
    tutorial: true,
    priority: 60,
    after: ['t_essence'],
    title: t('El Gotero', 'The Dropper'),
    when: (c) => c.v.tabs.lab && dropperReady(c),
    lines: [
      vela('neutral', 'Esto es el Laboratorio. Aquí compras mejoras.', 'This is the Lab. You buy upgrades here.', at('tab.lab')),
      vela('happy', '¡Compra el Gotero! Tus semillas prenderán más.', 'Buy the Dropper! Your seeds will take more often.', at('upgrade.dropper', 'tab.lab')),
    ],
    wait: {
      until: dropperBought,
      text: t('Compra el Gotero.', 'Buy the Dropper.'),
      target: ['upgrade.dropper', 'tab.lab'],
      timeoutSec: 90,
    },
  },
  {
    id: 't_bestiary',
    act: 1,
    tutorial: true,
    priority: 58,
    after: ['t_stable'],
    title: t('Un nombre', 'A name'),
    when: (c) => c.v.species.length >= 1 && c.v.tabs.bestiary && (!sessions(c) || (c.v.research?.sessions ?? 0) >= 1),
    lines: [
      vela('awed', '¡Especie nueva! Se llama {first}.', 'A new species! It\'s called {first}.', at('tab.bestiary')),
      vela('neutral', 'La doctora Albor les ponía nombres en latín.', 'Dr. Albor gave them Latin names.'),
      vela('worried', 'Trabajaba aquí antes. Se fue. …Mira tu Bestiario.', 'She worked here before. She left. …Look at your Bestiary.', at('tab.bestiary')),
    ],
    wait: {
      signal: 'tab:bestiary',
      until: (c) => c.v.species.some((s) => !s.isNew),
      text: t('Abre el Bestiario.', 'Open the Bestiary.'),
      target: ['tab.bestiary'],
      timeoutSec: 45,
    },
  },
  {
    id: 't_golden',
    act: 1,
    tutorial: true,
    urgent: true,
    priority: 90,
    after: ['t_intro'],
    title: t('El Destello', 'The Spark'),
    when: (c) => goldenVisible(c),
    lines: [vela('awed', '¡Ahí! ¡Un Destello! ¡Tócalo, rápido!', 'There! A Spark! Tap it, quick!', at('golden', 'dish'))],
    wait: {
      event: 'goldenCaught',
      until: (c) => !c.v.golden,
      text: t('Toca el Destello.', 'Tap the Spark.'),
      target: ['golden', 'dish'],
      timeoutSec: 15,
    },
  },
  {
    id: 't_golden_caught',
    act: 1,
    tutorial: true,
    chain: true,
    after: ['t_golden'],
    title: t('Un regalo', 'A gift'),
    when: (c) => c.n('goldenCaught') >= 1,
    lines: [
      vela('happy', '¡Bien! Siempre deja un regalo.', 'Yay! It always leaves a gift.'),
      vela('neutral', 'Aparecen desde que ella se fue. Qué raro.', 'They appeared after she left. Strange.'),
    ],
  },
  {
    id: 't_golden_missed',
    act: 1,
    tutorial: true,
    chain: true,
    after: ['t_golden'],
    title: t('Se fue', 'Gone'),
    when: (c) => c.n('goldenMissed') >= 1 && c.n('goldenCaught') === 0,
    lines: [vela('worried', 'Se fue. Tranquilidad: siempre vuelve.', 'Gone. Don\'t worry: it always comes back.')],
  },
  {
    id: 't_calibrate',
    act: 1,
    tutorial: true,
    priority: 56,
    after: ['t_stable'],
    title: t('Las reglas', 'The rules'),
    when: (c) => c.v.tabs.calibrate,
    lines: [
      vela('neutral', 'Esto cambia las reglas de su mundo.', 'This changes the rules of their world.', at('tab.calibrate')),
      vela('worried', 'Si las mueves, todo cambia. ¡Con cuidado!', 'Move them and everything changes. Careful!'),
      vela('happy', 'Reglas nuevas, criaturas nuevas. ¡Prueba!', 'New rules, new creatures. Try it!', at('tab.calibrate')),
    ],
    wait: {
      event: 'calib',
      text: t('Mueve μ en Calibrar.', 'Move μ in Calibrate.'),
      target: ['tab.calibrate'],
      timeoutSec: 60,
    },
  },
  {
    // Sessions cycle (CLARIDAD §3.2 step 11): the first visit to the Tree with Datos to spend.
    id: 't_tree',
    act: 1,
    tutorial: true,
    priority: 62,
    after: ['t_stable'],
    title: t('El Árbol', 'The Tree'),
    // Only with the Tree on screen: VELA points at its green nodes (never over the summary).
    when: (c) => sessions(c) && c.ui('tree') && (c.v.research?.sessions ?? 0) >= 1 && treeBought(c) === 0 && (c.v.research?.affordable ?? 0) > 0,
    lines: [
      vela('happy', 'Esto es el Árbol. Aquí gastas tus Datos.', 'This is the Tree. You spend your Data here.'),
      vela('awed', '¡Ese late en verde! Lo puedes comprar. Tócalo.', 'That one glows green! You can buy it. Tap it.'),
    ],
    wait: {
      until: (c) => treeBought(c) > 0,
      text: t('Compra una mejora.', 'Buy an upgrade.'),
      timeoutSec: 90,
    },
  },
  {
    // Sessions cycle (CLARIDAD §3.2 step 19): the first world opened in the Tree (replaces t_calibrate).
    id: 't_world',
    act: 1,
    tutorial: true,
    priority: 57,
    after: ['t_stable'],
    title: t('Otro mundo', 'Another world'),
    // In the Tree, right after opening the World (it is picked for the next session); never later
    // over the dish, when the start card has already shown it.
    when: (c) => {
      const r = c.v.research;
      return sessions(c) && c.ui('tree') && !!r && r.worlds.length >= 2 && r.world === r.worlds[r.worlds.length - 1];
    },
    lines: [
      vela('awed', '¡Un mundo nuevo! Otras reglas, otras criaturas.', 'A new world! Other rules, other creatures.'),
      vela('happy', 'Te lo dejo elegido para la próxima sesión.', 'I picked it for your next session.'),
    ],
  },
  {
    id: 'a1_committee',
    act: 1,
    priority: 10,
    after: ['t_stable'],
    title: t('Un télex', 'A telex'),
    when: (c) => c.v.species.length >= 3 || c.v.essencePerSec >= 10,
    lines: [
      telex('COMITÉ A ESTACIÓN VIGILIA. QUEREMOS NÚMEROS. MUCHOS. FIN.', 'COMMITTEE TO VIGIL STATION. WE WANT NUMBERS. MANY. END.'),
      vela('neutral', 'El Comité. Pagan la luz. Hablan en mayúsculas.', 'The Committee. They pay for the lights. They speak in capitals.'),
      vela('worried', 'Albor nunca les contestaba. Yo sí. Por educación.', 'Albor never answered them. I do. To be polite.'),
    ],
    journal: 's_committee',
  },
  {
    id: 'a1_extinction',
    act: 1,
    priority: 60,
    after: ['t_stable'],
    title: t('La lámpara', 'The lamp'),
    when: (c) => c.v.extinction.available && c.n('extDone') === 0 && c.era <= 1,
    lines: [
      vela('neutral', 'La placa está llena. Toca empezar de nuevo.', 'The dish is full. Time to start again.', at('tab.genome')),
      vela('worried', 'Se borra todo. Pero lo aprendido se queda.', 'Everything gets wiped. But what you learned stays.', at('extinguish', 'tab.genome')),
      vela('worried', 'Albor dejaba la lámpara encendida. «Para que no se vayan a oscuras».', 'Albor left the lamp on. "So they don\'t leave in the dark."'),
    ],
    choice: LAMP_CHOICE,
  },
  {
    // Sessions cycle (CLARIDAD J-43, §3.2 step 22): the first night is ready. Nothing is wiped.
    id: 'a1_night',
    act: 1,
    priority: 60,
    after: ['t_stable'],
    title: t('La lámpara', 'The lamp'),
    // In the Tree, where the night's node is (QA4 F-01: it played over the dish and sat on the seed bar).
    when: (c) => sessions(c) && c.ui('tree') && !!c.v.research?.nightReady && c.era <= 1,
    lines: [
      vela('happy', '¡La noche puede avanzar! Mira el centro del Árbol.', 'The night can move on! Look at the centre of the Tree.', at('tree.center')),
      vela('neutral', 'No se borra nada. Se abren mejoras nuevas.', 'Nothing gets wiped. New upgrades open.'),
      vela('worried', 'Albor dejaba la lámpara encendida. «Para que no se vayan a oscuras».', 'Albor left the lamp on. "So they don\'t leave in the dark."'),
    ],
    choice: LAMP_CHOICE,
  },

  // ═══════════════════════ ACT II · STRANGE THINGS (Eras 2–5) ═══════════════════════
  {
    id: 'a2_memory',
    act: 2,
    priority: 40,
    title: t('La placa recuerda', 'The dish remembers'),
    when: (c) => c.era >= 2 && c.eraAge() >= 4,
    lines: [
      you('Placa nueva. Mismos ojos.', 'New dish. Same eyes.'),
      vela('worried', 'Colega… la placa está vacía. Pero el Bestiario las reconoce a todas.', 'Colleague… the dish is empty. But the Bestiary still knows them all.'),
      vela('worried', 'La placa no tiene memoria. No debería tenerla.', 'The dish has no memory. It shouldn\'t have any.'),
      vela('awed', '…Lo apunto en mi libreta. ¡Qué misterio!', '…I\'m writing it down. What a mystery!'),
    ],
    journal: 's_memory',
  },
  {
    id: 'a2_tape1',
    act: 2,
    after: ['a2_memory'],
    title: t('Primera cinta', 'First tape'),
    when: (c) => c.since('a2_memory') >= 150 && c.stablesNow() >= 1,
    lines: [
      vela('neutral', 'Encontré una cinta de Albor en un cajón. ¿La pongo? …La pongo.', 'I found one of Albor\'s tapes in a drawer. Play it? …Playing it.'),
      albor('Día nueve de la noche. Borré la placa por cuarta vez. Y volvieron todas.', 'Day nine of the night. I wiped the dish a fourth time. They all came back.'),
      albor('Las mismas especies, en el mismo orden. Como golondrinas.', 'The same species, in the same order. Like swallows.'),
      albor('El Comité quiere saber cuánto rinden. Yo quiero saber por qué vuelven.', 'The Committee wants to know what they yield. I want to know why they return.'),
      vela('worried', 'Fin de la cinta. Hay más. Algunas están rayadas.', 'End of tape. There are more. Some are scratched.'),
    ],
    journal: 's_tape1',
  },
  {
    id: 'a2_orbit',
    act: 2,
    priority: 30,
    after: ['a2_memory'],
    title: t('Un saludo', 'A greeting'),
    when: (c) => goldenVisible(c, 0.4) && c.stablesNow() >= 1,
    lines: [
      vela('awed', '¿Lo viste? El Destello dio una vuelta a esa criatura. ¡Como saludando!', 'Did you see? The Spark circled that creature. Like saying hello!', { hint: 'orbit', target: ['golden', 'dish'] }),
      vela('neutral', 'Las chispas no saludan. Lo he comprobado. Tres veces.', 'Sparks don\'t say hello. I checked. Three times.'),
    ],
  },
  {
    id: 'a2_sample',
    act: 2,
    priority: 20,
    after: ['a2_tape1'],
    title: t('El pedido', 'The order'),
    when: (c) => c.era >= 3 && c.eraAge() >= 60 && c.v.species.length >= 1,
    lines: [
      telex('PEDIDO URGENTE: ENVÍEN A {best}. LA COPIAREMOS MIL VECES. FIN.', 'URGENT ORDER: SEND {best}. WE WILL COPY IT A THOUSAND TIMES. END.'),
      vela('worried', 'Quieren copiar a {best} en tanques. Miles. Siempre la misma.', 'They want to copy {best} in tanks. Thousands. Always the same one.'),
      vela('neutral', 'Si la mandamos, siguen pagando la luz. Si no… no sé.', 'If we send it, they keep paying for the lights. If not… who knows.'),
    ],
    choice: {
      id: 'sample',
      options: [
        {
          id: 'send',
          label: t('Enviar la muestra', 'Send the sample'),
          reply: [
            telex('RECIBIDO. EXCELENTE. FIN.', 'RECEIVED. EXCELLENT. END.'),
            vela('neutral', 'Anotado. Le puse una etiqueta bonita.', 'Noted. I gave it a pretty label.'),
          ],
          journal: 's_send',
        },
        {
          id: 'refuse',
          label: t('Decir que no', 'Say no'),
          reply: [
            telex('NEGATIVA ANOTADA. SU DINERO, EN REVISIÓN. FIN.', 'REFUSAL NOTED. YOUR FUNDING IS UNDER REVIEW. END.'),
            vela('happy', 'En revisión. Llevan once años revisándolo.', 'Under review. It\'s been under review for eleven years.'),
          ],
          journal: 's_refuse',
        },
      ],
    },
  },
  {
    id: 'a2_tape2',
    act: 2,
    after: ['a2_sample'],
    title: t('Segunda cinta', 'Second tape'),
    when: (c) => c.since('a2_sample') >= 180 && (c.v.behaviorsSeen.length >= 3 || c.v.species.length >= 6),
    lines: [
      albor('Día treinta y uno. En los informes lo llamo «datos». Suena a ciencia.', 'Day thirty-one. In my reports I call it "data". It sounds scientific.'),
      albor('Pero creo que es memoria. Cada vez que las borro, algo de ellas se queda.', 'But I think it\'s memory. Each time I wipe them, something of them stays.'),
      albor('Anoche apagué la lámpara. La placa siguió brillando, como esperándome.', 'Last night I turned off the lamp. The dish kept glowing, as if waiting for me.'),
      vela('worried', 'Ella hablaba así. Yo lo anotaba todo. No entendía nada.', 'She talked like that. I wrote it all down. I understood nothing.'),
    ],
    journal: 's_tape2',
  },
  {
    id: 'a2_constellation',
    act: 2,
    priority: 25,
    after: ['a2_memory'],
    title: t('Unir los puntos', 'Join the dots'),
    when: (c) => c.era >= 4 && c.stablesNow() >= 4,
    lines: [
      vela('awed', 'Colega, une los puntos. ¿Están dibujando una figura?', 'Colleague, join the dots. Are they drawing a shape?', { hint: 'constellation', target: ['dish'] }),
      you('Es casualidad. Tiene que serlo.', 'It\'s chance. It has to be.'),
      vela('neutral', 'Casualidad. Anotado. Dos veces, por si acaso.', 'Chance. Noted. Twice, just in case.'),
    ],
  },
  {
    id: 'a2_coro_first',
    act: 2,
    after: ['a2_constellation'],
    title: t('Un ritmo', 'A rhythm'),
    when: (c) => c.since('a2_constellation') >= 90 && c.n('seeds') >= 1,
    lines: [
      vela('worried', 'La placa está zumbando distinto. Escucha.', 'The dish is humming differently. Listen.'),
      coro('{rhythm}', '{rhythm}', { hint: 'echo' }),
      vela('awed', '¡Es tu ritmo! Así siembras tú. Te están imitando.', 'That\'s your rhythm! That\'s how you sow. They\'re copying you.'),
      coro('{rhythm}      ·', '{rhythm}      ·'),
      vela('awed', 'Con una nota de más. Como una pregunta.', 'With one extra note. Like a question.'),
      vela('neutral', 'Albor las llamaba «el Coro». Ahora entiendo por qué.', 'Albor called them "the Choir". Now I see why.'),
    ],
    sets: ['choirNamed'],
    journal: 's_coro',
  },
  {
    id: 'a2_answer',
    act: 2,
    priority: 20,
    after: ['a2_coro_first'],
    title: t('Contestar', 'Answer'),
    when: (c) => c.era >= 5 && c.eraAge() >= 45,
    lines: [
      vela('worried', 'Volvió el patrón. Cada vez que siembras, contestan.', 'The pattern is back. Every time you sow, they answer.'),
      vela('neutral', 'Puedo ajustar la placa y quitar ese ruido. Todo limpio.', 'I can tune the dish and remove that noise. All clean.'),
      vela('awed', 'O… podemos contestarles.', 'Or… we could answer them.'),
    ],
    choice: {
      id: 'rhythm',
      options: [
        {
          id: 'answer',
          label: t('Contestarles', 'Answer them'),
          wait: tapWait('Toca la placa tres veces.', 'Tap the dish three times.', { count: 3, timeoutSec: 60 }),
          journal: 's_answer',
        },
        {
          id: 'recalibrate',
          label: t('Quitar el ruido', 'Remove the noise'),
          reply: [vela('neutral', 'Ruido quitado. Silencio total. Muy… limpio.', 'Noise removed. Total silence. Very… clean.')],
          journal: 's_recal',
        },
      ],
    },
  },
  {
    id: 'a2_answered',
    act: 2,
    chain: true,
    priority: 21,
    after: ['a2_answer'],
    title: t('Contestaron', 'They answered'),
    when: (c) => c.choice('rhythm') === 'answer',
    lines: [
      coro('·   ·   ·', '·   ·   ·', { hint: 'echo' }),
      coro('·   ·   ·        ·', '·   ·   ·        ·'),
      vela('awed', 'Contestaron. Colega… ¡contestaron!', 'They answered. Colleague… they answered!'),
    ],
  },
  {
    id: 'a2_vela_secret',
    act: 2,
    after: ['a2_answer'],
    title: t('Pronto', 'Soon'),
    when: (c) => c.since('a2_answer') >= 120,
    lines: [
      vela('worried', 'Colega… tengo que contarte algo de Albor.', 'Colleague… I need to tell you something about Albor.'),
      vela('worried', 'Pero todavía no. Ella me pidió esperar.', 'But not yet. She asked me to wait.'),
      vela('neutral', 'Te lo cuento pronto. Anotado: «pronto».', 'I\'ll tell you soon. Noted: "soon".'),
    ],
  },
  {
    id: 'a2_audit_send',
    act: 2,
    after: ['a2_vela_secret'],
    title: t('Informe', 'Report'),
    when: (c) => c.choice('sample') === 'send' && c.since('a2_vela_secret') >= 60,
    lines: [
      telex('INFORME: LA MUESTRA NO VIVE FUERA DE LA ESTACIÓN. ENVÍEN MÁS. FIN.', 'REPORT: THE SAMPLE DOES NOT LIVE OUTSIDE THE STATION. SEND MORE. END.'),
      vela('worried', 'Fuera de aquí no viven. Nadie se pregunta por qué.', 'They don\'t live outside this place. Nobody asks why.'),
    ],
  },
  {
    id: 'a2_audit_refuse',
    act: 2,
    after: ['a2_vela_secret'],
    title: t('Aviso final', 'Final notice'),
    when: (c) => c.choice('sample') === 'refuse' && c.since('a2_vela_secret') >= 60,
    lines: [
      telex('AVISO FINAL: PENSAMOS CERRAR LA ESTACIÓN VIGILIA. FIN.', 'FINAL NOTICE: WE ARE THINKING OF CLOSING VIGIL STATION. END.'),
      vela('neutral', 'Aviso final número cuarenta y dos. Lo enmarco con los otros.', 'Final notice number forty-two. I\'ll frame it with the others.'),
    ],
  },

  // ═══════════════════════ ACT III · FIRST LIGHT (Eras 6+) ═══════════════════════
  {
    id: 'a3_confession',
    act: 3,
    priority: 50,
    title: t('El secreto', 'The secret'),
    when: (c) => c.era >= 6 && c.eraAge() >= 5,
    lines: [
      vela('worried', 'Te lo debo. Albor no se fue de vacaciones.', 'I owe you this. Albor didn\'t go on holiday.'),
      vela('worried', 'El Comité quería una fábrica: una sola especie, copiada sin parar.', 'The Committee wanted a factory: one species, copied forever.'),
      vela('neutral', 'Ella dijo que no. Y se fue antes de la noche.', 'She said no. And she left before the night.'),
      vela('neutral', 'Me dejó un encargo: «Busca a alguien que escuche. Que primero se enamore».', 'She left me a task: "Find someone who listens. Let them fall in love first."'),
      vela('happy', 'Perdón por el secreto. …Funcionó, ¿verdad?', 'Sorry about the secret. …It worked, didn\'t it?'),
    ],
    journal: 's_confession',
  },
  {
    id: 'a3_tape3',
    act: 3,
    after: ['a3_confession'],
    title: t('La última cinta', 'The last tape'),
    when: (c) => c.since('a3_confession') >= 90,
    lines: [
      vela('neutral', 'La última cinta. Estaba pegada debajo de la placa.', 'The last tape. It was stuck under the dish.'),
      albor('Si oyes esto, VELA te eligió. Ya lo sabes: la placa recuerda. Todo.', 'If you hear this, VELA chose you. So you know: the dish remembers. Everything.'),
      albor('El Destello no es una chispa. Es lo que aprendieron de mí.', 'The Spark isn\'t a spark. It\'s what they learned from me.'),
      albor('Una luz que las miraba cada noche. Me imitan para llamarme.', 'A light that watched them every night. They copy me to call me back.'),
      albor('Ahora te mirarán a ti. Serán lo que tú les enseñes.', 'Now they\'ll watch you. They\'ll become what you teach them.'),
      albor('Volveré con el albor, cuando acabe la noche. Decide qué son para ti.', 'I\'ll be back at first light, when the night ends. Decide what they are to you.'),
      vela('happy', '«Albor» quiere decir la primera luz del día. Le hacía gracia.', '"Albor" means the first light of day. She found that funny.'),
    ],
    journal: 's_tape3',
  },
  {
    id: 'a3_words',
    act: 3,
    after: ['a3_tape3'],
    title: t('Tres palabras', 'Three words'),
    when: (c) => c.since('a3_tape3') >= 120 && c.stablesNow() >= 2,
    lines: [
      coro('luz  ·  que  ·  mira', 'light  ·  that  ·  watches', { hint: 'echo' }),
      coro('vuelves  ·  cada  ·  noche', 'you  ·  come  ·  nightly'),
      vela('awed', '¡Palabras! Usan tus palabras. Las de la Bitácora.', 'Words! They\'re using your words. The ones from the Journal.'),
      coro('¿nos  ·  recuerdas  ?', 'remember  ·  us  ?'),
    ],
    journal: 's_words',
  },
  {
    id: 'a3_tint',
    act: 3,
    priority: 30,
    after: ['a3_words'],
    title: t('Del color de tu mano', 'The colour of your hand'),
    when: (c) => goldenVisible(c, 0.3),
    lines: [
      vela('awed', 'El Destello cambió de color. Se parece… a ti.', 'The Spark changed colour. It looks… like you.', { hint: 'tint', target: ['golden', 'dish'] }),
      you('Lo que les enseñe es lo que serán.', 'What I teach them is what they\'ll become.'),
    ],
  },
  {
    id: 'a3_dawn',
    act: 3,
    priority: 30,
    after: ['a3_words'],
    title: t('Una línea gris', 'A grey line'),
    when: (c) => (c.done('a3_tint') || c.since('a3_words') >= 600) && extinctionProgress(c) >= 0.5,
    lines: [
      vela('neutral', 'Mira el horizonte. Una línea gris. La noche se acaba.', 'Look at the horizon. A grey line. The night is ending.', { hint: 'dawn' }),
      vela('worried', 'Cuando salga el sol, Albor volverá. Y querrán una respuesta.', 'When the sun comes up, Albor will return. And they\'ll want an answer.'),
    ],
  },
  {
    id: 'a3_final',
    act: 3,
    priority: 70,
    after: ['a3_dawn'],
    title: t('La pregunta', 'The question'),
    when: (c) => ripe(c) && c.endings().length === 0,
    lines: [vela('awed', 'Es la última noche. Escucha.', 'It\'s the last night. Listen.'), QUESTION],
    choice: { id: 'final', options: 'final', deferrable: true },
  },
  {
    id: 'a3_final_again',
    act: 3,
    priority: 70,
    repeatable: true,
    after: ['a3_final'],
    title: t('Otra noche', 'Another night'),
    when: (c) => c.endings().length >= 1 && c.era > c.lastEndingEra() && ripe(c),
    lines: [vela('neutral', 'Otra noche madura. ¿Les preguntamos otra vez?', 'Another ripe night. Shall we ask them again?'), QUESTION],
    choice: { id: 'final', options: 'final', deferrable: true },
  },

  // ═══════════════════════ EPILOGUES (after "Continue the experiment") ═══════════════════════
  {
    id: 'ep_harvest',
    act: 4,
    repeatable: true,
    title: t('Después de la cosecha', 'After the harvest'),
    when: (c) => c.flag('pendingEp:harvest'),
    lines: [
      vela('worried', 'El Comité mandó otra medalla. Ya van tres.', 'The Committee sent another medal. That makes three.'),
      vela('neutral', 'Si un día quieres que vuelva a cantar, siembra algo distinto.', 'If you ever want it to sing again, sow something different.'),
    ],
  },
  {
    id: 'ep_law',
    act: 4,
    repeatable: true,
    title: t('Después de la ley', 'After the law'),
    when: (c) => c.flag('pendingEp:law'),
    lines: [
      vela('neutral', 'Todo en orden. Todo exacto.', 'Everything in order. Everything exact.'),
      vela('happy', 'Aunque ayer una giró al revés. Un poquito. No lo anoté.', 'Though yesterday one turned the wrong way. A tiny bit. I didn\'t write it down.'),
    ],
  },
  {
    id: 'ep_memory',
    act: 4,
    repeatable: true,
    title: t('Después del archivo', 'After the archive'),
    when: (c) => c.flag('pendingEp:memory'),
    lines: [
      vela('happy', 'Albor se durmió en el sofá del laboratorio. Dice que vuelve mañana.', 'Albor fell asleep on the lab sofa. She says she\'ll come back tomorrow.'),
      vela('neutral', 'El experimento continúa. Ahora somos tres para recordar.', 'The experiment goes on. Now there are three of us to remember.'),
    ],
  },
  {
    id: 'ep_tide',
    act: 4,
    repeatable: true,
    title: t('Después de la marea', 'After the tide'),
    when: (c) => c.flag('pendingEp:tide'),
    lines: [
      vela('awed', 'Encendí el microscopio un segundo. Solo para saludar. ¡Siguen ahí!', 'I turned the microscope on for a second. Just to wave. They\'re still there!'),
      vela('happy', 'Podemos seguir mirando. Sin tocar. O tocando un poco.', 'We can keep watching. Without touching. Or touching a little.'),
    ],
  },
  {
    id: 'ep_albor',
    act: 4,
    repeatable: true,
    title: t('Primera luz', 'First light'),
    when: (c) => c.flag('pendingEp:albor'),
    lines: [
      L('albor', 'happy', 'Hola, VELA. Hola, colega. ¿Seguimos?', 'Hello, VELA. Hello, colleague. Shall we go on?', { live: true }),
      vela('happy', 'Anotado.', 'Noted.'),
    ],
  },
];

export const SCENE_BY_ID: ReadonlyMap<string, SceneDef> = new Map(SCENES.map((s) => [s.id, s]));
