/**
 * Player-facing text of the research tree and the session loop (Spanish + English). Kid-simple
 * (QA2: "would a 5-year-old understand it?"): names of 1–3 words, one-line descriptions of at most
 * 12 words that say what changes FOR YOU, no jargon (no μ/σ, kernel, Genoma…). Numbers live in
 * cycleBalance.ts; tree.ts formats the "+30 s → +60 s" values.
 */
import type { Text } from '../core/types';
import * as C from './cycleBalance';

const t = (es: string, en: string): Text => ({ es, en });

export type BranchId = 'time' | 'dropper' | 'dish' | 'life' | 'discovery' | 'worlds' | 'spark';

/** The permanent currency. One place to rename it ("Datos", "Ideas"…). */
export const DATOS_NAME = t('Datos', 'Data');
/** Singular, for "1 Dato". */
export const DATO_NAME = t('Dato', 'Data');

export const BRANCH_TEXT: Record<BranchId | 'core', { name: Text; desc: Text }> = {
  core: { name: t('La noche', 'The night'), desc: t('El centro del Árbol. Aquí avanza la noche.', 'The heart of the Tree. The night moves on here.') },
  time: { name: t('Reloj', 'Clock'), desc: t('Más tiempo en cada sesión y un arranque más rápido.', 'More time every session and a faster start.') },
  dropper: { name: t('Gotero', 'Dropper'), desc: t('Viven más semillas, y tienes más para sembrar.', 'More of your seeds live, and you get more of them.') },
  dish: { name: t('Placa', 'Dish'), desc: t('Una placa más grande, con sitio para todas.', 'A bigger dish, with room for everyone.') },
  life: { name: t('Vida', 'Life'), desc: t('Cada criatura da más Esencia por segundo.', 'Every creature gives more Essence per second.') },
  discovery: { name: t('Descubrir', 'Discover'), desc: t('Más Datos por cada cosa nueva que encuentras.', 'More Data for everything new you find.') },
  worlds: { name: t('Mundos', 'Worlds'), desc: t('Reglas nuevas en las que nacen otras especies.', 'New rules where other species are born.') },
  spark: { name: t('Destello', 'Spark'), desc: t('La chispa dorada viene más y regala más.', 'The golden spark comes more often and gives more.') },
};

/** Node names and one-line descriptions, by node id (tree.ts TREE_NODES). */
export const NODE_TEXT: Record<string, { name: Text; desc: Text }> = {
  lab: {
    name: t('Nueva noche', 'New night'),
    desc: t('La noche avanza: se abren mejoras nuevas.', 'The night moves on: new upgrades open.'),
  },
  // ⏱ Reloj
  clock: { name: t('Más tiempo', 'More time'), desc: t('Cada sesión dura un poco más.', 'Every session lasts a little longer.') },
  clock2: { name: t('Reloj grande', 'Big clock'), desc: t('Todavía más tiempo para experimentar.', 'Even more time to experiment.') },
  fridge: { name: t('Nevera', 'Fridge'), desc: t('Empiezas con tus mejores criaturas ya vivas.', 'Start with your best creatures already alive.') },
  sprint: { name: t('Recta final', 'Final stretch'), desc: t('En el último cuarto de la sesión todo da más Esencia.', 'In the last quarter of the session everything gives more Essence.') },
  encTime: { name: t('Encargos con prisa', 'Hurry requests'), desc: t('Cumplir un encargo te da más segundos.', 'Finishing a request gives you more seconds.') },
  clock3: { name: t('Reloj de arena', 'Hourglass'), desc: t('Medio minuto más por nivel.', 'Half a minute more per level.') },
  clock4: { name: t('Reloj eterno', 'Endless clock'), desc: t('El reloj más grande del laboratorio.', 'The biggest clock in the lab.') },
  // 💧 Gotero
  dropper: { name: t('Gotero', 'Dropper'), desc: t('Con él, viven más semillas.', 'With it, more of your seeds live.') },
  startEssence: { name: t('Esencia de bolsillo', 'Pocket Essence'), desc: t('Empiezas cada sesión con más Esencia.', 'Start every session with more Essence.') },
  freeSeeds: { name: t('Semillas de regalo', 'Gift seeds'), desc: t('Siembras gratis al empezar cada sesión.', 'Free seeds at the start of every session.') },
  stabilizer: { name: t('Semillas fuertes', 'Strong seeds'), desc: t('Semillas más firmes: aún más se quedan a vivir.', 'Steadier seeds: even more stay alive.') },
  bigSeed: { name: t('Semilla grande', 'Big seed'), desc: t('Mantén pulsado para sembrar una semilla grande.', 'Press and hold to sow a big seed.') },
  autoSeeder: { name: t('Sembrador automático', 'Auto-seeder'), desc: t('Un robot siembra solo en un sitio libre.', 'A robot sows by itself in a free spot.') },
  cheapSeeds: { name: t('Semillas baratas', 'Cheap seeds'), desc: t('Sembrar cuesta menos Esencia.', 'Sowing costs less Essence.') },
  dropperMax: { name: t('Gotero maestro', 'Master dropper'), desc: t('El mejor gotero: todas las semillas viven.', 'The best dropper: every seed lives.') },
  // 🧫 Placa
  dish: { name: t('Placa más grande', 'Bigger dish'), desc: t('La placa crece: caben más criaturas.', 'The dish grows: more creatures fit.') },
  slots: { name: t('Más sitio', 'More room'), desc: t('Cabe una criatura más en la placa.', 'One more creature fits on the dish.') },
  crowdCost: { name: t('Sin apretujones', 'No squeezing'), desc: t('Las criaturas caben más juntas: más sitio.', 'Creatures fit closer together: more room.') },
  nursery: { name: t('Guardería', 'Nursery'), desc: t('Más semillas pueden crecer a la vez.', 'More seeds can grow at the same time.') },
  incubator: { name: t('Incubadora', 'Incubator'), desc: t('Las semillas se hacen criaturas más deprisa.', 'Seeds become creatures faster.') },
  dishXL: { name: t('Placa gigante', 'Giant dish'), desc: t('La placa más grande que existe.', 'The biggest dish there is.') },
  ecosystem: { name: t('Placa variada', 'Mixed dish'), desc: t('Cada especie de tu Bestiario: más Esencia.', 'Every species in your Bestiary: more Essence.') },
  // 🌱 Vida
  culture: { name: t('Cultivo', 'Culture'), desc: t('Un caldo más rico: todas dan más Esencia.', 'A richer broth: they all give more Essence.') },
  nutrient: { name: t('Comida extra', 'Extra food'), desc: t('Criaturas con más forma dan más Esencia.', 'Creatures with more shape give more Essence.') },
  culture2: { name: t('Superalimento', 'Superfood'), desc: t('Un festín: mucha más Esencia para todas.', 'A feast: much more Essence for everyone.') },
  swimAffinity: { name: t('Nadadoras', 'Swimmers'), desc: t('Las que nadan dan más Esencia.', 'The swimming ones give more Essence.') },
  stillAffinity: { name: t('Tranquilas', 'Calm ones'), desc: t('Las quietas y las que laten dan más Esencia.', 'Still ones and the ones that pulse give more Essence.') },
  colonyAffinity: { name: t('Familias', 'Families'), desc: t('Las colonias y las que se dividen dan más Esencia.', 'Colonies and the ones that split give more Essence.') },
  symbiosis: { name: t('Amistad', 'Friendship'), desc: t('Dos criaturas juntas se ayudan.', 'Two creatures side by side help each other.') },
  abundance: { name: t('Vida abundante', 'Abundant life'), desc: t('Toda la placa da más Esencia.', 'The whole dish gives more Essence.') },
  eternalLife: { name: t('Vida eterna', 'Eternal life'), desc: t('Cada nivel, un poco más de Esencia. Sin final.', 'Every level, a bit more Essence. Never ends.') },
  // 🔬 Descubrir
  notebook: { name: t('Cuaderno de campo', 'Field notebook'), desc: t('Cada especie nueva te da más Datos.', 'Every new species gives you more Data.') },
  print: { name: t('Copiadora', 'Copier'), desc: t('Planta una copia de una especie del Bestiario.', 'Plant a copy of a species from the Bestiary.') },
  cataloguing: { name: t('Coleccionista', 'Collector'), desc: t('Tu Bestiario hace que todas den más Esencia.', 'Your Bestiary makes every creature give more Essence.') },
  archive: { name: t('Archivo', 'Archive'), desc: t('Una copia gratis cada poco tiempo.', 'A free copy every little while.') },
  microscope: { name: t('Microscopio', 'Microscope'), desc: t('Fichas con más detalle sobre cada criatura.', 'Cards with more detail about each creature.') },
  discoBonus: { name: t('Premio al descubridor', 'Discoverer prize'), desc: t('Cada manera nueva de moverse da más Datos.', 'Every new way of moving gives more Data.') },
  rareSpores: { name: t('Semillas curiosas', 'Curious seeds'), desc: t('Las semillas buscan especies que aún no tienes.', 'Seeds look for species you do not have yet.') },
  mutations: { name: t('Copias sorpresa', 'Surprise copies'), desc: t('A veces una copia sale distinta: ¡una sorpresa!', 'Sometimes a copy comes out different: a surprise!') },
  encyclopedia: { name: t('Gran enciclopedia', 'Great encyclopedia'), desc: t('Todos los Datos de cada sesión crecen.', 'All the Data of every session grows.') },
  // 🌍 Mundos
  worldGyro: { name: t('Mundo 3 · Remolinos', 'World 3 · Whirls'), desc: t('Nace una criatura que gira como un remolino.', 'A creature that spins like a whirl is born.') },
  worldCold: { name: t('Mundo 2 · Frío', 'World 2 · Cold'), desc: t('Un mundo frío y quieto: un anillo con un agujero.', 'A cold, still world: a ring with a hole.') },
  worldLegs: { name: t('Mundo 6 · Patas', 'World 6 · Legs'), desc: t('Una escalera larga con agujeros.', 'A long ladder with holes.') },
  worldShields: { name: t('Mundo 4 · Escudos', 'World 4 · Shields'), desc: t('Un escudo hueco y grande.', 'A big, hollow shield.') },
  worldHelix: { name: t('Mundo 5 · Hélices', 'World 5 · Helices'), desc: t('Una bailarina retorcida que gira sobre sus patas.', 'A twisted dancer that spins on its legs.') },
  worldGiants: { name: t('Mundo 7 · Gigantes', 'World 7 · Giants'), desc: t('Criaturas enormes: caben menos, pero cada una vale el doble.', 'Huge creatures: fewer fit, but each is worth double.') },
  // ✨ Destello
  spark: { name: t('Destello frecuente', 'Frequent spark'), desc: t('La chispa dorada aparece más a menudo.', 'The golden spark shows up more often.') },
  sparkLife: { name: t('Destello lento', 'Slow spark'), desc: t('La chispa se queda más tiempo para atraparla.', 'The spark stays longer so you can catch it.') },
  sparkTime: { name: t('Destello del tiempo', 'Time spark'), desc: t('Cada chispa atrapada suma segundos al reloj.', 'Every spark you catch adds seconds.') },
  sparkFirst: { name: t('Primer destello', 'Early spark'), desc: t('La primera chispa llega nada más empezar.', 'The first spark comes right at the start.') },
  sparkGift: { name: t('Regalos mejores', 'Better gifts'), desc: t('La chispa te regala más segundos de tu Esencia.', 'The spark gives you more seconds of your Essence.') },
  sparkDatos: { name: t('Destello sabio', 'Wise spark'), desc: t('Cada chispa atrapada te da Datos.', 'Every spark you catch gives you Data.') },
  sparkMutagen: { name: t('Semillas mágicas', 'Magic seeds'), desc: t('Cada chispa deja más semillas que siempre viven.', 'Every spark leaves more seeds that always live.') },
};

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * A price factor in words (CLARIDAD J-89: "×2" is algebra for a child): ×2 "el doble", ×1,5 "la
 * mitad más", ×3 "el triple", ×1,1 "un poquito más"; anything else stays "×g".
 */
export function growthWord(g: string): Text {
  switch (g.replace(',', '.')) {
    case '2':
      return t('el doble', 'double');
    case '1.5':
      return t('la mitad más', 'half as much again');
    case '3':
      return t('el triple', 'triple');
    case '1.1':
      return t('un poquito más', 'a little more');
    default:
      return t(`×${g.replace('.', ',')}`, `×${g.replace(',', '.')}`);
  }
}

/**
 * How each node's number reads in "antes → después" (tree.ts `show`). Always a number or a short
 * effect, never jargon. Percent values arrive already rounded ("35").
 */
export const VALUE_TEXT = {
  no: t('No', 'No'),
  never: t('Nunca', 'Never'),
  night: (n: number) => t(`Noche ${n}`, `Night ${n}`),
  session: (clock: string) => t(`Sesión ${clock}`, `Session ${clock}`),
  fridge: (n: number) => (n ? t(`${plural(n, 'criatura viva', 'criaturas vivas')} al empezar`, `${plural(n, 'creature', 'creatures')} alive at start`) : t('Ninguna al empezar', 'None at start')),
  sprint: (m: Text) => t(`Al final: Esencia ${m.es}`, `At the end: Essence ${m.en}`),
  perEncargo: (s: number) => t(`+${s} s por encargo`, `+${s} s per request`),
  success: (p: string) => t(`Viven ${p} de cada 100`, `${p} in 100 live`),
  startEssence: (n: number) => t(`Empiezas con ${n} de Esencia`, `Start with ${n} Essence`),
  freeSeeds: (n: number) => t(plural(n, 'semilla gratis', 'semillas gratis'), plural(n, 'free seed', 'free seeds')),
  /** `area` is kept for callers; the value reads in words (J-92). */
  bigSeed: (area: Text) => (void area, t('Semilla grande (más del doble)', 'Big seed (more than double)')),
  every: (s: Text) => t(`Cada ${s.es} s`, `Every ${s.en} s`),
  seedPrice: (p: string) => t(`Semillas −${p} %`, `Seeds −${p}%`),
  normalPrice: t('Precio normal', 'Normal price'),
  /** The dish size is seen in the animation, never as a number (J-93). */
  room: (n: number, d?: number) => (void d, t(`Sitio para ${plural(n, 'criatura', 'criaturas')}`, `Room for ${plural(n, 'creature', 'creatures')}`)),
  roomOnly: (n: number) => t(`Sitio para ${plural(n, 'criatura', 'criaturas')}`, `Room for ${plural(n, 'creature', 'creatures')}`),
  nursery: (n: number) => t(`${n} creciendo a la vez`, `${n} growing at once`),
  /** Incubadora: seconds a seed needs to be born (time-lapse × Incubadora). */
  birth: (s: Text) => t(`Nacen en ${s.es} s`, `Hatch in ${s.en} s`),
  mature: (m: Text) => (m.en === '×1' ? t('Nacen a su ritmo', 'Hatch at their own pace') : t(`Nacen ${m.es} más rápido`, `Hatch ${m.en} faster`)),
  perSpecies: (p: string) => t(`+${p} % por especie del Bestiario`, `+${p}% per Bestiary species`),
  essenceMult: (m: Text) => t(`Esencia ${m.es}`, `Essence ${m.en}`),
  essencePlus: (p: string) => t(`Esencia +${p} %`, `Essence +${p}%`),
  allEssence: (m: Text) => t(`Toda la Esencia ${m.es}`, `All Essence ${m.en}`),
  swimmers: (p: string) => t(`Nadadoras +${p} %`, `Swimmers +${p}%`),
  still: (p: string) => t(`Quietas +${p} %`, `Still ones +${p}%`),
  colonies: (p: string) => t(`Colonias +${p} %`, `Colonies +${p}%`),
  pairs: (m: Text) => t(`Especies amigas: Esencia ${m.es}`, `Friend species: Essence ${m.en}`),
  datosPerSpecies: (n: number) => t(`${n} Datos por especie nueva`, `${n} Data per new species`),
  copies: t('Copias que siempre viven', 'Copies that always live'),
  bestiaryEssence: (p: string) => t(`Bestiario: Esencia +${p} %`, `Bestiary: Essence +${p}%`),
  freeCopy: (s: number) => t(`Copia gratis cada ${s} s`, `Free copy every ${s} s`),
  microscope: [t('Ficha simple', 'Simple card'), t('Dónde vive y cómo se mueve', 'Where it lives and how it moves'), t('Todos los detalles', 'Every detail')] as Text[],
  datosPerBehavior: (n: number) => t(`${n} Datos por manera nueva`, `${n} Data per new way`),
  seekNew: t('Buscan especies que no tienes', 'Seek species you don’t have'),
  variants: t('Copias con sorpresa', 'Copies with surprises'),
  allDatos: (p: string) => t(`Datos +${p} %`, `Data +${p}%`),
  species: (n: number) => t(`${plural(n, 'especie para encontrar', 'especies para encontrar')}`, `${plural(n, 'species to find', 'species to find')}`),
  sparkEvery: (r: string) => t(`Llega cada ${r} s`, `Comes every ${r} s`),
  sparkStays: (s: number) => t(`Se queda ${s} s`, `Stays ${s} s`),
  perSpark: (s: number) => t(`+${s} s por chispa`, `+${s} s per spark`),
  firstSpark: (r: string) => t(`La primera a los ${r} s`, `First one at ${r} s`),
  gifts: (sec: number) => t(`Regalo: ${sec} s de Esencia`, `Gift: ${sec} s of Essence`),
  datosPerSpark: (n: number) => t(`+${n} ${n === 1 ? 'Dato' : 'Datos'} por chispa`, `+${n} Data per spark`),
  sureSeeds: (n: number) => t(n === 1 ? '1 semilla segura por chispa' : `${n} semillas seguras por chispa`, n === 1 ? '1 sure seed per spark' : `${n} sure seeds per spark`),
};

/** World cards (start card picker). Names live in NODE_TEXT for the tree; the first world here. */
export const WORLD_TEXT: Record<string, { name: Text; short: Text; desc: Text }> = {
  classic: { name: t('Mundo 1 · Clásico', 'World 1 · Classic'), short: t('Clásico', 'Classic'), desc: t('Donde empezó todo: la Nadadora.', 'Where it all began: the Swimmer.') },
  gyro: { name: NODE_TEXT.worldGyro.name, short: t('Remolinos', 'Whirls'), desc: NODE_TEXT.worldGyro.desc },
  cold: { name: NODE_TEXT.worldCold.name, short: t('Frío', 'Cold'), desc: NODE_TEXT.worldCold.desc },
  legs: { name: NODE_TEXT.worldLegs.name, short: t('Patas', 'Legs'), desc: NODE_TEXT.worldLegs.desc },
  shields: { name: NODE_TEXT.worldShields.name, short: t('Escudos', 'Shields'), desc: NODE_TEXT.worldShields.desc },
  helix: { name: NODE_TEXT.worldHelix.name, short: t('Hélices', 'Helices'), desc: NODE_TEXT.worldHelix.desc },
  giants: { name: NODE_TEXT.worldGiants.name, short: t('Gigantes', 'Giants'), desc: NODE_TEXT.worldGiants.desc },
};

/** Short UI strings of the tree and the session screens. */
export const TREE_UI = {
  title: t('Árbol de investigación', 'Research tree'),
  titleShort: t('Árbol', 'Tree'),
  hint: t('Toca una mejora', 'Tap an upgrade'),
  /** First visit, nothing bought yet: the hand points at a green node (QA4 F-11). */
  hintFirst: t('¡Toca el nodo verde que señala la mano!', 'Tap the green node the hand points at!'),
  level: t('NIVEL', 'LEVEL'),
  buy: t('Comprar', 'Buy'),
  maxed: t('¡Completo!', 'Complete!'),
  owned: t('Tuyo', 'Owned'),
  now: t('Ahora', 'Now'),
  next: t('Con un nivel más', 'With one more level'),
  beforeAfter: t('Antes → después', 'Before → after'),
  tapPrice: t('Toca el precio para ver la cuenta', 'Tap the price to see the sum'),
  // "Mejora 1 de 7" (of the route) next to "Nivel 0 de 6" (of this upgrade): two different counts, both
  // in words (QA4 F-15: "Paso 1 de 7" beside "NIVEL 0/6" read as one number that did not add up).
  step: (i: number, n: number) => t(`mejora ${i} de ${n}`, `upgrade ${i} of ${n}`),
  levelOf: (i: number, n: string) => t(`Nivel ${i} de ${n}`, `Level ${i} of ${n}`),
  /** The wallet next to the price, never as a fraction (QA4 F-15: "Datos 3 / 2"). */
  haveCost: (have: string, cost: string) => t(`Tienes ${have} · Cuesta ${cost}`, `You have ${have} · Costs ${cost}`),
  bought: (name: string) => t(`Comprado: ${name}`, `Bought: ${name}`),
  needs: t('Necesita', 'Needs'),
  /** A closed node: what to buy first in the Tree. */
  afterNodes: (names: Text[]) =>
    t(`primero ${names.map((n) => `«${n.es}»`).join(' y ')} en el Árbol`, `first ${names.map((n) => `“${n.en}”`).join(' and ')} in the Tree`),
  mystery: t('Algo nuevo… compra el paso anterior para verlo.', 'Something new… buy the step before to see it.'),
  nightLocked: (n: number) => t(`Se abre en la Noche ${n} (toca el centro cuando brille).`, `Opens on Night ${n} (tap the centre when it glows).`),
  /** The night button while its gate is not met (J-102): what is still missing. */
  nightNotYet: (sessions: number) =>
    sessions === 1 ? t('Aún no: falta 1 sesión', 'Not yet: 1 session to go') : t(`Aún no: faltan ${sessions} sesiones`, `Not yet: ${sessions} sessions to go`),
  missing: (n: string, s: string | null) =>
    s ? t(`Te faltan ${n} Datos — ${s}`, `You need ${n} more Data — ${s}`) : t(`Te faltan ${n} Datos`, `You need ${n} more Data`),
  sessions: (n: number) => (n === 1 ? t('una sesión más', 'one more session') : t(`unas ${n} sesiones`, `about ${n} sessions`)),
  priceRule: (start: string, growth: string) =>
    t(`Empieza en ${start} Datos; cada nivel cuesta ${growthWord(growth).es}.`, `Starts at ${start} Data; each level costs ${growthWord(growth).en}.`),
  priceRuleOne: (start: string) => t(`Un solo nivel: ${start} Datos.`, `One level only: ${start} Data.`),
  priceWhy: t(
    'Una sola regla: más lejos del centro, más caro; cada nivel da más, por eso cuesta más. Nada al azar.',
    'One rule: farther from the centre costs more; each level gives more, so it costs more. Nothing random.',
  ),
  why: t('¿Por qué cuesta esto?', 'Why this price?'),
  nextLevels: t('Próximos niveles', 'Next levels'),
  /** `ring` is kept for callers: the tile says what the number is, not where it comes from (J-88). */
  ringStart: (ring: string) => (void ring, t('precio de salida', 'starting price')),
  levelN: (n: number) => t(`nivel ${n}`, `level ${n}`),
  levelsBought: (n: number, g: string) =>
    n === 1
      ? t(`1 nivel comprado: ${growthWord(g).es}`, `1 level bought: ${growthWord(g).en}`)
      : t(`${n} niveles comprados: cada uno ${growthWord(g).es}`, `${n} levels bought: each one ${growthWord(g).en}`),
  newSession: t('Nueva sesión', 'New session'),
  centre: t('Centrar', 'Centre'),
  zoomIn: t('Acercar', 'Zoom in'),
  zoomOut: t('Alejar', 'Zoom out'),
  close: t('Cerrar', 'Close'),
  night: (n: number) => t(`Noche ${n}`, `Night ${n}`),
  nightReady: t('¡La noche puede avanzar!', 'The night can move on!'),
  nightGate: (s: number, sp: number, alt: number) =>
    t(
      `Necesita ${plural(s, 'sesión', 'sesiones')} y ${plural(sp, 'especie', 'especies')} — o ${plural(alt, 'sesión', 'sesiones')}.`,
      `Needs ${plural(s, 'session', 'sessions')} and ${sp} species — or ${plural(alt, 'session', 'sessions')}.`,
    ),
  nightProgress: (s: number, sNeed: number, sp: number, spNeed: number) =>
    t(`Sesiones ${s}/${sNeed} · Especies ${sp}/${spNeed}`, `Sessions ${s}/${sNeed} · Species ${sp}/${spNeed}`),
  nightRule: t(
    'La noche es gratis: llega jugando sesiones y encontrando especies. Abre mejoras nuevas y da +10 % de Datos.',
    'The night is free: it comes as you play sessions and find species. It opens new upgrades and gives +10% Data.',
  ),
  nightFree: t('Gratis', 'Free'),
  affordable: (n: number) => (n === 1 ? t('1 mejora lista', '1 upgrade ready') : t(`${n} mejoras listas`, `${n} upgrades ready`)),
};

/** Session HUD, start and end cards. */
export const SESSION_UI = {
  session: (n: number) => t(`Sesión ${n}`, `Session ${n}`),
  startTitle: (n: number) => t(`Sesión ${n}`, `Session ${n}`),
  startTime: (clock: string) => t(`Tienes ${clock} de laboratorio`, `You have ${clock} of lab time`),
  startHint: t('El reloj empieza con tu primera semilla.', 'The clock starts with your first seed.'),
  startGo: t('¡Empezar!', 'Start!'),
  startNew: t('Nuevo desde la última vez', 'New since last time'),
  startGoal: t('Tu encargo', 'Your request'),
  // The Nevera said once what it is (QA4 F-16: "nevera" was never explained).
  startKeep: (n: number) =>
    n === 1
      ? t('Ya viva desde el principio: 1 criatura (VELA la guarda en la nevera entre sesiones)', 'Alive from the start: 1 creature (VELA keeps it in the fridge between sessions)')
      : t(`Ya vivas desde el principio: ${n} criaturas (VELA las guarda en la nevera entre sesiones)`, `Alive from the start: ${n} creatures (VELA keeps them in the fridge between sessions)`),
  lastMinute: t('¡Último minuto!', 'Last minute!'),
  timesUp: t('¡Tiempo!', 'Time!'),
  waiting: t('Siembra para empezar', 'Sow to start'),
  sprint: t('¡Recta final!', 'Final stretch!'),
  plusTime: (s: number) => t(`+${s} s`, `+${s} s`),
  endTitle: (n: number) => t(`Fin de la sesión ${n}`, `End of session ${n}`),
  earned: t('Esencia ganada', 'Essence earned'),
  every100: (d: number) => t(`Cada ${d} de Esencia = 1 Dato`, `Every ${d} Essence = 1 Data`),
  oneDato: t('= 1 Dato', '= 1 Data'),
  nightBonus: (n: number) => t(`Noche ${n}`, `Night ${n}`),
  encyclopedia: t('Enciclopedia', 'Encyclopedia'),
  newSpecies: t('especies nuevas', 'new species'),
  newVariants: t('variantes nuevas', 'new variants'),
  newBehaviors: t('maneras de moverse nuevas', 'new ways of moving'),
  encargos: t('encargos', 'requests'),
  /** Session 1 shows no Encargo (CLARIDAD §3.3): its silent goals (sow, a creature) are "first goals". */
  firstSteps: t('primeras metas', 'first goals'),
  sparks: t('destellos atrapados', 'sparks caught'),
  records: t('récords', 'records'),
  minimum: t('mínimo', 'minimum'),
  minimumNote: (n: number) => t(`Nunca menos de ${n}: ¡siempre se aprende algo!`, `Never less than ${n}: you always learn something!`),
  total: t('Datos', 'Data'),
  found: t('Especies de hoy', 'Today’s species'),
  isNew: t('¡Nueva!', 'New!'),
  best: t('La mejor', 'The best'),
  record: t('¡Récord!', 'Record!'),
  goTree: t('Ir al Árbol', 'Go to the Tree'),
  again: t('Nueva sesión', 'New session'),
  perSec: (v: string) => t(`+${v}/s`, `+${v}/s`),
  recordName: {
    essence: t('Más Esencia en una sesión', 'Most Essence in a session'),
    eps: t('Más Esencia por segundo', 'Most Essence per second'),
    creatures: t('Más criaturas a la vez', 'Most creatures at once'),
    species: t('Más especies en una sesión', 'Most species in a session'),
  } as Record<'essence' | 'eps' | 'creatures' | 'species', Text>,
  equationTitle: t('Cómo se calcularon tus Datos', 'How your Data was counted'),
  pickWorld: t('Elige un mundo', 'Pick a world'),
  worldSpecies: (n: number) => (n === 1 ? t('+1 especie', '+1 species') : t(`+${n} especies`, `+${n} species`)),
  worldFound: (a: number, b: number) => t(`Encontradas ${a}/${b}`, `Found ${a}/${b}`),
  worldAllFound: t('¡Todas encontradas!', 'All found!'),
  worldNew: t('¡Nuevo!', 'New!'),
  /** The open world that pays most (QA4 F-14). */
  worldBest: t('★ Da más Esencia', '★ Pays the most'),
  worldPicked: t('Jugarás aquí', 'You will play here'),
  previewDatos: (n: string) => t(`+${n} Datos al terminar`, `+${n} Data at the end`),
  previewNext: (name: string, missing: string) => t(`${name}: te faltan ${missing} Datos`, `${name}: ${missing} more Data`),
  previewReady: (name: string) => t(`¡Alcanza para ${name}!`, `Enough for ${name}!`),
  conversionTitle: t('Así ganas Datos', 'How you earn Data'),
  conversionRule: (d: number) => t(`Por cada ${d} de Esencia, 1 Dato`, `For every ${d} Essence, 1 Data`),
  // CLARIDAD J-162…J-170: texts the new loop needs (the integrator wires them into the UI).
  endNow: t('Terminar ahora', 'End now'),
  /** One-time card for a save from the old loop (VELA, three short lines). */
  welcomeTitle: t('¡Bienvenida al laboratorio nuevo!', 'Welcome to the new lab!'),
  welcomeLines: (datos: string) => [
    t('Ahora juegas sesiones cortas, con reloj.', 'Now you play short sessions, with a clock.'),
    t('Tu Esencia se vuelve Datos, y con Datos mejoras el Árbol.', 'Your Essence becomes Data, and Data grows the Tree.'),
    t(`Lo que tenías ahora son ${datos} Datos. ¡Nada se perdió!`, `What you had is now ${datos} Data. Nothing was lost!`),
  ],
  welcomeGo: t('¡Vamos!', 'Let’s go!'),
  /** Dock button between sessions. */
  dockTree: t('Árbol', 'Tree'),
  /** Pause card. */
  pausedTitle: t('En pausa', 'Paused'),
  pausedBody: t('La placa y el reloj esperan.', 'The dish and the clock wait.'),
  keepPlaying: t('Seguir', 'Keep playing'),
  endNowYes: t('Sí, terminar', 'Yes, end it'),
  /** Abono on sale after the first seconds of the clock. */
  boostIn: (clock: string) => t(`Abono en ${clock}`, `Fertiliser in ${clock}`),
  boostWait: (clock: string) => t(`en ${clock}`, `in ${clock}`),
  /** Abono with nothing alive to boost: the dock's short line, and what a tap on it says. */
  boostNeedsLife: t('Falta vida', 'Needs life'),
  boostNeedsLifeWhy: t('El Abono necesita criaturas vivas.', 'Fertiliser needs living creatures.'),
  /** The Datos preview in the dock: "+12 Datos" over "al terminar". */
  previewShort: (n: string) => t(`+${n} Datos`, `+${n} Data`),
  previewEnd: t('al terminar', 'at the end'),
  endNowConfirm: (datos: string) => t(`¿Terminar ya? Te llevas ${datos} Datos.`, `End now? You take ${datos} Data.`),
  // QA4 F-17: the price said "20 s" while the rule was 8 s, and nothing said what Abono is.
  boostDesc: t(
    `Abono: comida para tus criaturas. Todo da Esencia ×${String(C.BOOST_MULT).replace('.', ',')} hasta el final de la sesión.`,
    `Fertiliser: food for your creatures. Everything gives Essence ×${C.BOOST_MULT} until the session ends.`,
  ),
  boostPrice: t(
    `Cuesta lo que tu placa gana en ${C.BOOST_SECONDS} s; el siguiente de hoy, el doble. Lo gastado cuenta igual para tus Datos.`,
    `Costs what your dish earns in ${C.BOOST_SECONDS} s; the next one today costs double. Spent Essence still counts for your Data.`,
  ),
  tapAgain: t('¡Toca aquí otra vez!', 'Tap here again!'),
  keptNew: t('¡Nueva! · guardada en el Bestiario', 'New! · kept in the Bestiary'),
  /** Under a new species' portrait in the summary (with the "¡Nueva!" badge above it). */
  keptShort: t('guardada en el Bestiario', 'kept in the Bestiary'),
  datosKept: t('Los Datos no se pierden nunca.', 'Data is never lost.'),
  startVela: t('Esto te regala el Árbol hoy. ¡Y tienes un encargo!', 'This is the Tree’s gift today. And you have a request!'),
  startVelaNoRequest: t('Esto te regala el Árbol hoy.', 'This is the Tree’s gift today.'),
  sheetHint: t('Gris es ahora. Verde es lo que tendrás.', 'Grey is now. Green is what you will get.'),
  /** Right after the first purchase, in the same spot (CLARIDAD J-120: an upgrade is forever). */
  sheetHintBought: t('¡Es tuya para siempre! La notarás en la próxima sesión.', 'It is yours forever! You will feel it next session.'),
  worldHint: t('Toca un mundo para jugar allí.', 'Tap a world to play there.'),
  newSpeciesTime: (s: number) => t(`¡Especie nueva: +${s} segundos!`, `New species: +${s} seconds!`),
};

/** VELA's line on the end card (≤ 14 words each). Picked by session.ts `velaLine`. */
export const VELA_LINES = {
  first: t('¡Primera sesión! Tu Esencia se volvió Datos. Ahora, al Árbol.', 'First session! Your Essence became Data. Now, to the Tree.'),
  newSpecies: t('¡Una especie nueva! Ya está en el Bestiario. Anotado.', 'A new species! It is in the Bestiary now. Noted.'),
  record: t('¡Récord! Esto va directo al informe.', 'A record! This goes straight into the report.'),
  poor: t('Hoy salió poco. Pero aprendimos algo. ¡Otra vez!', 'Not much today. But we learned something. Again!'),
  night: t('La placa está lista para una noche nueva.', 'The dish is ready for a new night.'),
  sprint: t('¡Qué final! Esa recta final valió la pena.', 'What a finish! That final stretch was worth it.'),
  plain: t('Buen experimento, colega. Anotado.', 'Good experiment, colleague. Noted.'),
};
