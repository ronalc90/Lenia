/**
 * Encargos (requests): a character asks you to CULTIVATE something concrete,
 * says WHY in one short line, and rewards you. They replace the plain objective
 * chain (docs/STORY.md §10).
 *
 *  - The Act I chain mirrors OBJECTIVES in src/game/balance.ts one to one (same
 *    ids, same order, same Essence rewards read from that table) so the balance
 *    bot's assumptions hold; only the voice changes ("heat" asks for 3 stable
 *    creatures where the objective "two" asked for 2).
 *  - Later chain steps are story requests gated by Era.
 *  - Side requests rotate from a pool once Calibrate is open.
 *
 * Owner's rule: kid-simple. ask ≤ 10 words, why ≤ 14 words, thanks ≤ 12 words
 * (tests enforce it). Committee lines are telex capitals and end with FIN / END.
 */
import type { Behavior, Text } from '../core/types';
import type { Mood, Speaker } from './types';

const t = (es: string, en: string): Text => ({ es, en });

export const MAX_ASK_WORDS = 10;
export const MAX_WHY_WORDS = 14;
export const MAX_THANKS_WORDS = 12;

/** VELA's accessories, unlocked by some Encargos and drawn on her portrait. */
export type Cosmetic = 'scarf' | 'medal' | 'flower';
export const COSMETICS: readonly Cosmetic[] = ['scarf', 'medal', 'flower'];
export const COSMETIC_NAMES: Record<Cosmetic, Text> = {
  scarf: t('Bufanda para VELA', 'A scarf for VELA'),
  medal: t('Medalla para VELA', 'A medal for VELA'),
  flower: t('Flor para VELA', 'A flower for VELA'),
};

/** What can be measured (from the GameView, or the Encargos' own event counters). */
export type GoalMetric =
  | 'seeds' // manual seeds (view stats.seeds; delta: seed events)
  | 'stableNow' // stable creatures on the dish right now
  | 'speciesSeen' // a species was looked at in the Bestiary (0/1)
  | 'upgrade' // arg = upgrade id → level
  | 'eps' // Essence per second
  | 'species' // species registered (delta: new species events)
  | 'behaviors' // distinct behaviours ever seen
  | 'behavior' // arg = behaviour → seen ever (0/1)
  | 'golden' // Sparks caught
  | 'calib' // calibration changes
  | 'prints' // species prints
  | 'eraEssence' // Essence earned this Era
  | 'extinctions'
  | 'genomeNodes' // Genome nodes owned
  | 'node' // arg = node id → owned (0/1)
  | 'keepAlive' // arg = behaviour → seconds one creature of it has stayed stable
  | 'seedSpecies'; // how many of the 7 seed species are registered

export interface GoalDef {
  metric: GoalMetric;
  arg?: string;
  /** A number, or computed from the view when the Encargo is offered (side requests). */
  target: number | ((v: import('../core/types').GameView) => number);
  /** Count only what happens after the Encargo is offered. */
  delta?: boolean;
}

export interface RewardDef {
  /** Essence equal to this OBJECTIVES entry's reward (balance.ts). */
  objective?: string;
  /** Essence equal to N seconds of current production (at least `essenceMin`). */
  essenceSec?: number;
  essenceMin?: number;
  samples?: number;
  cosmetic?: Cosmetic;
  journal?: string;
}

export interface EncargoDef {
  id: string;
  who: Speaker;
  mood: Mood;
  /** The request, imperative; shown in the objective bar. May contain {n} (target). */
  ask: Text;
  /** Why, in one short line. */
  why: Text;
  /** Said when it is done (by `thanksWho`, default the same speaker; tapes can't react). */
  thanks: Text;
  thanksWho?: Speaker;
  goal: GoalDef;
  /** A second condition that must also hold (e.g. "calibrate AND a new species"). */
  also?: GoalDef;
  reward: RewardDef;
  /** Chain steps wait for this Era. */
  minEra?: number;
  /** Side pool: offer once ever (otherwise it may come back after a while). */
  once?: boolean;
  /** Side pool: only when this holds. */
  available?: (v: import('../core/types').GameView) => boolean;
}

const calibOpen = (v: import('../core/types').GameView) => v.tabs.calibrate;
const bestiaryOpen = (v: import('../core/types').GameView) => v.tabs.bestiary && v.species.length > 0;

/** Side requests' rewards (proposed; the Balancer may move them into balance.ts). */
export const SIDE_REWARD = {
  sparkSec: 60,
  crowdSec: 90,
  rateSec: 120,
  printSec: 90,
  newSpeciesSec: 90,
  keepSec: 60,
  minEssence: 25,
  samplesSmall: 1,
  samplesBehavior: 2,
} as const;

// ═══════════════════════ Main chain ═══════════════════════

export const CHAIN: EncargoDef[] = [
  // ───── Act I: mirrors balance.ts OBJECTIVES (teaches the game) ─────
  {
    id: 'seed',
    who: 'vela',
    mood: 'happy',
    ask: t('Siembra algo en la placa.', 'Sow something in the dish.'),
    why: t('La placa duerme. Un toque la despierta.', 'The dish is asleep. One tap wakes it up.'),
    thanks: t('¡Eso es! Mira cómo brilla.', 'That\'s it! Look at it glow.'),
    goal: { metric: 'seeds', target: 1 },
    reward: { objective: 'seed' },
  },
  {
    id: 'stable',
    who: 'vela',
    mood: 'neutral',
    ask: t('Consigue una criatura que se quede.', 'Get a creature that stays.'),
    why: t('Las que se quedan dan luz. Las otras se deshacen.', 'The ones that stay make light. The others melt.'),
    thanks: t('¡Una amiga nueva! Hola, pequeña.', 'A new friend! Hello, little one.'),
    goal: { metric: 'stableNow', target: 1 },
    reward: { objective: 'stable' },
  },
  {
    id: 'look',
    who: 'vela',
    mood: 'awed',
    ask: t('Mira tu criatura en el Bestiario.', 'Look at your creature in the Bestiary.'),
    why: t('Cada especie tiene nombre. ¡Vamos a conocerla!', 'Every species has a name. Let\'s meet it!'),
    thanks: t('Qué nombre tan elegante. Anotado.', 'What a fancy name. Noted.'),
    goal: { metric: 'speciesSeen', target: 1 },
    reward: { objective: 'look' },
  },
  {
    id: 'dropper',
    who: 'vela',
    mood: 'happy',
    ask: t('Compra el Gotero.', 'Buy the Dropper.'),
    why: t('Con él, tus semillas prenden más a menudo.', 'With it, your seeds take more often.'),
    thanks: t('¡Gotero nuevo! Huele a laboratorio.', 'A new Dropper! Smells like science.'),
    goal: { metric: 'upgrade', arg: 'dropper', target: 1 },
    reward: { objective: 'dropper' },
  },
  {
    id: 'two',
    who: 'vela',
    mood: 'worried',
    ask: t('Ten 3 criaturas estables a la vez.', 'Have 3 stable creatures at once.'),
    why: t('¿Me ayudas? Su luz enciende la calefacción. ¡Brrr!', 'Help me? Their light turns the heating on. Brrr!'),
    thanks: t('¡Calorcito! Y me tejí una bufanda.', 'Warm at last! And I knitted a scarf.'),
    goal: { metric: 'stableNow', target: 3 },
    reward: { objective: 'two', cosmetic: 'scarf', journal: 'e_heat' },
  },
  {
    id: 'eps3',
    who: 'committee',
    mood: 'neutral',
    ask: t('PRODUZCAN 3 ESENCIA/S. FIN.', 'PRODUCE 3 ESSENCE/S. END.'),
    why: t('EL COMITÉ PAGA LA LUZ. LA LUZ CUESTA. FIN.', 'THE COMMITTEE PAYS FOR THE LIGHTS. LIGHTS COST. END.'),
    thanks: t('RECIBIDO. ACEPTABLE. FIN.', 'RECEIVED. ACCEPTABLE. END.'),
    goal: { metric: 'eps', target: 3 },
    reward: { objective: 'eps3' },
  },
  {
    id: 'calib',
    who: 'vela',
    mood: 'awed',
    ask: t('Compra el Calibrador.', 'Buy the Calibrator.'),
    why: t('Cambia las reglas de su mundo. ¡Y nacen criaturas nuevas!', 'It changes the rules of their world. New creatures appear!'),
    thanks: t('¡Ahora mandas tú! Con cuidado, ¿eh?', 'Now you\'re in charge! Gently, okay?'),
    goal: { metric: 'upgrade', arg: 'calibrator', target: 1 },
    reward: { objective: 'calib' },
  },
  {
    id: 'move',
    who: 'vela',
    mood: 'neutral',
    ask: t('Mueve μ un poquito.', 'Nudge μ a little.'),
    why: t('Otras reglas, otra fauna. ¡A ver quién sale!', 'Other rules, other creatures. Let\'s see who shows up!'),
    thanks: t('Todo tembló un poco. ¡Qué emoción!', 'Everything wobbled a bit. How exciting!'),
    goal: { metric: 'calib', target: 1 },
    reward: { objective: 'move' },
  },
  {
    id: 'seeder',
    who: 'vela',
    mood: 'happy',
    ask: t('Compra el Sembrador automático.', 'Buy the Auto-seeder.'),
    why: t('Siembra solo mientras miras. Yo lo vigilo.', 'It sows by itself while you watch. I\'ll keep an eye on it.'),
    thanks: t('¡Bip, bip! Ya siembra solo.', 'Beep beep! It sows on its own now.'),
    goal: { metric: 'upgrade', arg: 'autoSeeder', target: 1 },
    reward: { objective: 'seeder' },
  },
  {
    id: 'species3',
    who: 'committee',
    mood: 'neutral',
    ask: t('ENVÍEN 3 ESPECIES PARA EL INFORME. FIN.', 'SEND 3 SPECIES FOR THE REPORT. END.'),
    why: t('SIN INFORME NO HAY LUZ. FIN.', 'NO REPORT, NO LIGHTS. END.'),
    thanks: t('INFORME RECIBIDO. NADIE LO LEERÁ. FIN.', 'REPORT RECEIVED. NOBODY WILL READ IT. END.'),
    goal: { metric: 'species', target: 3 },
    reward: { objective: 'species3' },
  },
  {
    id: 'golden',
    who: 'vela',
    mood: 'awed',
    ask: t('Atrapa un Destello.', 'Catch a Spark.'),
    why: t('Pasa volando y deja un regalo. ¡Mira bien!', 'It flies by and leaves a gift. Keep watch!'),
    thanks: t('¡Atrapado! ¡Qué reflejos!', 'Caught! What reflexes!'),
    goal: { metric: 'golden', target: 1 },
    reward: { objective: 'golden' },
  },
  {
    id: 'behaviors2',
    who: 'vela',
    mood: 'happy',
    ask: t('Encuentra 2 maneras de moverse.', 'Find 2 ways of moving.'),
    why: t('Unas nadan, otras giran. ¡Cada una a su manera!', 'Some swim, some spin. Each in its own way!'),
    thanks: t('Dos estilos. ¡Esto ya es un baile!', 'Two styles. Now it\'s a dance!'),
    goal: { metric: 'behaviors', target: 2 },
    reward: { objective: 'behaviors2' },
  },
  {
    id: 'eps10',
    who: 'committee',
    mood: 'neutral',
    ask: t('EXIGIMOS 10 ESENCIA/S. FIN.', 'WE DEMAND 10 ESSENCE/S. END.'),
    why: t('LA CALEFACCIÓN NO SE PAGA SOLA. FIN.', 'THE HEATING DOES NOT PAY FOR ITSELF. END.'),
    thanks: t('CIFRA ACEPTABLE. SIGAN. FIN.', 'ACCEPTABLE FIGURE. CARRY ON. END.'),
    goal: { metric: 'eps', target: 10 },
    reward: { objective: 'eps10' },
  },
  {
    id: 'culture',
    who: 'vela',
    mood: 'happy',
    ask: t('Compra Cultivo.', 'Buy Culture.'),
    why: t('Un caldo más rico. ¡Todas dan más luz!', 'A richer broth. They all shine brighter!'),
    thanks: t('Mmm, sopita de laboratorio.', 'Mmm, lab soup.'),
    goal: { metric: 'upgrade', arg: 'culture', target: 1 },
    reward: { objective: 'culture' },
  },
  {
    id: 'print',
    who: 'committee',
    mood: 'neutral',
    ask: t('IMPRIMAN UNA COPIA DE UNA ESPECIE. FIN.', 'PRINT A COPY OF A SPECIES. END.'),
    why: t('LAS COPIAS RINDEN. AL COMITÉ LE ENCANTAN. FIN.', 'COPIES YIELD. THE COMMITTEE LOVES COPIES. END.'),
    thanks: t('COPIA REGISTRADA. EXCELENTE. FIN.', 'COPY LOGGED. EXCELLENT. END.'),
    goal: { metric: 'prints', target: 1 },
    reward: { objective: 'print' },
  },
  {
    id: 'species6',
    who: 'vela',
    mood: 'awed',
    ask: t('Encuentra 6 especies.', 'Find 6 species.'),
    why: t('Seis ya es una familia. ¡Quiero conocerlas a todas!', 'Six is a family already. I want to meet them all!'),
    thanks: t('¡Una familia entera! Les hice sitio.', 'A whole family! I made room for them.'),
    goal: { metric: 'species', target: 6 },
    reward: { objective: 'species6' },
  },
  {
    id: 'eps50',
    who: 'committee',
    mood: 'neutral',
    ask: t('EXIGIMOS 50 ESENCIA/S ANTES DEL AMANECER. FIN.', 'WE DEMAND 50 ESSENCE/S BEFORE DAWN. END.'),
    why: t('EL AMANECER ESTÁ LEJOS. LA FACTURA, NO. FIN.', 'DAWN IS FAR AWAY. THE BILL IS NOT. END.'),
    thanks: t('OBJETIVO CUMPLIDO. SE ARCHIVA. FIN.', 'TARGET MET. FILED. END.'),
    goal: { metric: 'eps', target: 50 },
    reward: { objective: 'eps50' },
  },
  {
    id: 'dish',
    who: 'vela',
    mood: 'happy',
    ask: t('Compra Placa I.', 'Buy Dish I.'),
    why: t('Más sitio: más criaturas sin apretarse.', 'More room: more creatures, no squeezing.'),
    thanks: t('¡Placa más grande! Caben todas.', 'A bigger dish! Everyone fits.'),
    goal: { metric: 'upgrade', arg: 'dish', target: 1 },
    reward: { objective: 'dish' },
  },
  {
    id: 'era100k',
    who: 'vela',
    mood: 'neutral',
    ask: t('Junta 100 000 Esencia esta noche.', 'Gather 100,000 Essence tonight.'),
    why: t('Cuando la placa se llena de luz, madura.', 'When the dish fills with light, it ripens.'),
    thanks: t('Está madura. Casi da pena.', 'It\'s ripe. It\'s almost sad.'),
    goal: { metric: 'eraEssence', target: 100000 },
    reward: { objective: 'era100k' },
  },
  {
    id: 'extinct',
    who: 'vela',
    mood: 'worried',
    ask: t('Prueba la Extinción.', 'Try the Extinction.'),
    why: t('La noche termina, la memoria queda.', 'The night ends, the memory stays.'),
    thanks: t('Una noche nueva. Y nos acordamos de todo.', 'A new night. And we remember everything.'),
    goal: { metric: 'extinctions', target: 1 },
    reward: { objective: 'extinct', journal: 'e_extinct' },
  },

  // ───── Act II–III: story requests, one or two per night ─────
  {
    id: 'genome',
    who: 'vela',
    mood: 'neutral',
    minEra: 2,
    ask: t('Compra un nodo del Genoma.', 'Buy a Genome node.'),
    why: t('El Genoma es lo que la placa recuerda.', 'Genome is what the dish remembers.'),
    thanks: t('Recordar cuesta. Pero vale la pena.', 'Remembering costs. But it\'s worth it.'),
    goal: { metric: 'genomeNodes', target: 1 },
    reward: { essenceSec: 60, essenceMin: 100 },
  },
  {
    id: 'swimmer',
    who: 'vela',
    mood: 'awed',
    minEra: 2,
    ask: t('Mantén viva una nadadora 2 minutos.', 'Keep a swimmer alive for 2 minutes.'),
    why: t('Quiero medir cuánto nada sin cansarse.', 'I want to time how long it swims without tiring.'),
    thanks: t('¡Dos minutos! Y ni se despeinó.', 'Two minutes! Not a hair out of place.'),
    goal: { metric: 'keepAlive', arg: 'swimmer', target: 120 },
    reward: { samples: 2 },
  },
  {
    id: 'report10',
    who: 'committee',
    mood: 'neutral',
    minEra: 3,
    ask: t('INFORME: 10 ESPECIES. FIN.', 'REPORT: 10 SPECIES. END.'),
    why: t('LOS INFORMES CORTOS NO SE LEEN. LOS LARGOS TAMPOCO. FIN.', 'SHORT REPORTS GO UNREAD. LONG ONES TOO. END.'),
    thanks: t('SE CONCEDE MEDALLA. FIN.', 'MEDAL GRANTED. END.'),
    goal: { metric: 'species', target: 10 },
    reward: { essenceSec: 120, essenceMin: 500, cosmetic: 'medal', journal: 'e_medal' },
  },
  {
    id: 'colony',
    who: 'albor',
    mood: 'neutral',
    minEra: 4,
    ask: t('Junta tres iguales: una colonia.', 'Gather three of a kind: a colony.'),
    why: t('Juntas brillan más. Como nosotros en invierno.', 'Together they glow more. Like us in winter.'),
    thanks: t('Albor estaría orgullosa. Yo lo estoy.', 'Albor would be proud. I am.'),
    thanksWho: 'vela',
    goal: { metric: 'behavior', arg: 'colony', target: 1 },
    reward: { samples: 3 },
  },
  {
    id: 'calibNew',
    who: 'vela',
    mood: 'awed',
    minEra: 4,
    ask: t('Calibra hasta que nazca algo nuevo.', 'Calibrate until something new is born.'),
    why: t('Hay especies escondidas entre los números.', 'Species are hiding between the numbers.'),
    thanks: t('¡Una desconocida! Bienvenida.', 'A stranger! Welcome.'),
    goal: { metric: 'species', target: 1, delta: true },
    also: { metric: 'calib', target: 1, delta: true },
    reward: { samples: 2 },
  },
  {
    id: 'rings',
    who: 'vela',
    mood: 'happy',
    minEra: 5,
    ask: t('Compra Anillos dobles en el Genoma.', 'Buy Double rings in the Genome.'),
    why: t('Dos anillos, reglas nuevas, criaturas enormes.', 'Two rings, new rules, huge creatures.'),
    thanks: t('¡Mira qué grandotas!', 'Look how big they are!'),
    goal: { metric: 'node', arg: 'doubleRings', target: 1 },
    reward: { essenceSec: 120, essenceMin: 1000 },
  },
  {
    id: 'seven',
    who: 'albor',
    mood: 'neutral',
    minEra: 6,
    ask: t('Encuentra a las siete de la semilla.', 'Find the seven seed species.'),
    why: t('Las siete primeras. Con ellas empezó todo.', 'The first seven. Everything began with them.'),
    thanks: t('Las siete. Albor guardaba una flor para hoy.', 'All seven. Albor kept a flower for today.'),
    thanksWho: 'vela',
    goal: { metric: 'seedSpecies', target: 7 },
    reward: { samples: 5, cosmetic: 'flower', journal: 'e_seven' },
  },
  {
    id: 'dawnCrowd',
    who: 'vela',
    mood: 'neutral',
    minEra: 6,
    ask: t('Ten 10 criaturas a la vez.', 'Have 10 creatures at once.'),
    why: t('Que el sol las encuentre a todas despiertas.', 'So the sun finds them all awake.'),
    thanks: t('Todas despiertas. Ya puede salir el sol.', 'All awake. The sun may rise now.'),
    goal: { metric: 'stableNow', target: 10 },
    reward: { essenceSec: 180, essenceMin: 2000 },
  },
];

// ═══════════════════════ Side requests (rotating) ═══════════════════════

const nice = (x: number): number => {
  if (x <= 10) return Math.max(1, Math.ceil(x));
  const p = Math.pow(10, Math.floor(Math.log10(x)) - 1);
  return Math.ceil(x / p) * p;
};

export const SIDE: EncargoDef[] = [
  {
    id: 's_dancer',
    who: 'albor',
    mood: 'neutral',
    once: true,
    available: calibOpen,
    ask: t('Cultiva una que gire.', 'Grow one that spins.'),
    why: t('Yo las llamaba bailarinas. Giran sin marearse.', 'I called them dancers. They spin without getting dizzy.'),
    thanks: t('¡Una bailarina! Albor la adoraría.', 'A dancer! Albor would love it.'),
    thanksWho: 'vela',
    goal: { metric: 'behavior', arg: 'spinner', target: 1 },
    reward: { samples: SIDE_REWARD.samplesBehavior, journal: 'e_dancer' },
  },
  {
    id: 's_heart',
    who: 'albor',
    mood: 'neutral',
    once: true,
    available: calibOpen,
    ask: t('Busca una que lata.', 'Find one that pulses.'),
    why: t('Late como un corazón pequeñito. Escúchala.', 'It beats like a tiny heart. Listen.'),
    thanks: t('Pum, pum. Qué bonito.', 'Thump, thump. How lovely.'),
    thanksWho: 'vela',
    goal: { metric: 'behavior', arg: 'pulsing', target: 1 },
    reward: { samples: SIDE_REWARD.samplesBehavior },
  },
  {
    id: 's_split',
    who: 'vela',
    mood: 'awed',
    once: true,
    available: calibOpen,
    ask: t('Encuentra una que se divida en dos.', 'Find one that splits in two.'),
    why: t('Una se vuelve dos. ¡Magia de verdad!', 'One becomes two. Real magic!'),
    thanks: t('¡Gemelas! Anotado dos veces.', 'Twins! Noted twice.'),
    goal: { metric: 'behavior', arg: 'divider', target: 1 },
    reward: { samples: SIDE_REWARD.samplesBehavior },
  },
  {
    id: 's_new',
    who: 'vela',
    mood: 'awed',
    available: calibOpen,
    ask: t('Calibra hasta que nazca algo nuevo.', 'Calibrate until something new is born.'),
    why: t('Hay especies escondidas entre los números.', 'Species are hiding between the numbers.'),
    thanks: t('¡Una desconocida! Bienvenida.', 'A stranger! Welcome.'),
    goal: { metric: 'species', target: 1, delta: true },
    also: { metric: 'calib', target: 1, delta: true },
    reward: { samples: SIDE_REWARD.samplesSmall, essenceSec: SIDE_REWARD.newSpeciesSec, essenceMin: SIDE_REWARD.minEssence },
  },
  {
    id: 's_spin90',
    who: 'vela',
    mood: 'happy',
    available: (v) => v.behaviorsSeen.includes('spinner'),
    ask: t('Mantén una giratoria 90 segundos.', 'Keep a spinner going for 90 seconds.'),
    why: t('Quiero ver si se marea. Spoiler: no.', 'I want to see if it gets dizzy. Spoiler: no.'),
    thanks: t('Ni un mareo. Impresionante.', 'Not dizzy at all. Impressive.'),
    goal: { metric: 'keepAlive', arg: 'spinner', target: 90 },
    reward: { samples: SIDE_REWARD.samplesSmall, essenceSec: SIDE_REWARD.keepSec, essenceMin: SIDE_REWARD.minEssence },
  },
  {
    id: 's_sparks',
    who: 'vela',
    mood: 'awed',
    ask: t('Atrapa 2 Destellos.', 'Catch 2 Sparks.'),
    why: t('Cada Destello trae un regalo. ¡Dos, mejor!', 'Every Spark brings a gift. Two is better!'),
    thanks: t('¡Doble regalo! Brillas, colega.', 'Double gift! You shine, colleague.'),
    goal: { metric: 'golden', target: 2, delta: true },
    reward: { essenceSec: SIDE_REWARD.sparkSec, essenceMin: SIDE_REWARD.minEssence },
  },
  {
    id: 's_crowd',
    who: 'vela',
    mood: 'happy',
    ask: t('Ten {n} criaturas a la vez.', 'Have {n} creatures at once.'),
    why: t('Una placa llena canta más fuerte.', 'A full dish sings louder.'),
    thanks: t('¡Qué coro! Se oye desde aquí.', 'What a choir! I can hear it from here.'),
    goal: {
      metric: 'stableNow',
      target: (v) => Math.min(14, Math.max(3, v.creatures.filter((c) => c.state === 'stable').length + 2)),
    },
    reward: { essenceSec: SIDE_REWARD.crowdSec, essenceMin: SIDE_REWARD.minEssence },
  },
  {
    id: 's_rate',
    who: 'committee',
    mood: 'neutral',
    available: (v) => v.essencePerSec >= 3,
    ask: t('SUBAN LA PRODUCCIÓN A {n}/S. FIN.', 'RAISE OUTPUT TO {n}/S. END.'),
    why: t('MÁS ES MÁS. ES NUESTRO LEMA. FIN.', 'MORE IS MORE. IT IS OUR MOTTO. END.'),
    thanks: t('CIFRA ANOTADA. QUEREMOS MÁS. FIN.', 'FIGURE NOTED. WE WANT MORE. END.'),
    goal: { metric: 'eps', target: (v) => nice(Math.max(5, v.essencePerSec * 1.6)) },
    reward: { essenceSec: SIDE_REWARD.rateSec, essenceMin: SIDE_REWARD.minEssence },
  },
  {
    id: 's_print',
    who: 'committee',
    mood: 'neutral',
    available: bestiaryOpen,
    ask: t('IMPRIMAN 3 COPIAS. FIN.', 'PRINT 3 COPIES. END.'),
    why: t('TRES COPIAS, TRES VECES MÁS FELICES. FIN.', 'THREE COPIES, THREE TIMES HAPPIER. END.'),
    thanks: t('COPIAS RECIBIDAS. QUÉ ORDEN. FIN.', 'COPIES RECEIVED. SUCH ORDER. END.'),
    goal: { metric: 'prints', target: 3, delta: true },
    reward: { essenceSec: SIDE_REWARD.printSec, essenceMin: SIDE_REWARD.minEssence },
  },
];

export const ENCARGO_BY_ID: ReadonlyMap<string, EncargoDef> = new Map([...CHAIN, ...SIDE].map((e) => [e.id, e]));

export const ALL_BEHAVIOR_IDS: readonly Behavior[] = ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony'];
