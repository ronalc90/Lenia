/**
 * Player-facing text of the research tree and the session loop (Spanish + English). Kid-simple
 * (QA2: "would a 5-year-old understand it?"): names of 1–3 words, one-line descriptions of at most
 * 12 words that say what changes FOR YOU, no jargon (no μ/σ, kernel, Genoma…). Numbers live in
 * cycleBalance.ts; tree.ts formats the "+30 s → +60 s" values.
 */
import type { Text } from '../core/types';

const t = (es: string, en: string): Text => ({ es, en });

export type BranchId = 'time' | 'dropper' | 'dish' | 'life' | 'discovery' | 'worlds' | 'spark';

/** The permanent currency. One place to rename it ("Datos", "Ideas"…). */
export const DATOS_NAME = t('Datos', 'Data');
/** Singular, for "1 Dato". */
export const DATO_NAME = t('Dato', 'Data');

export const BRANCH_TEXT: Record<BranchId | 'core', { name: Text; desc: Text }> = {
  core: { name: t('Tu laboratorio', 'Your lab'), desc: t('El centro del árbol. Aquí empieza cada noche.', 'The heart of the tree. Every night starts here.') },
  time: { name: t('Reloj', 'Clock'), desc: t('Más tiempo en cada sesión y un arranque más rápido.', 'More time every session and a faster start.') },
  dropper: { name: t('Gotero', 'Dropper'), desc: t('Semillas que prenden más y más para sembrar.', 'Seeds that take more often, and more of them.') },
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
    desc: t('La noche avanza: se abre un anillo nuevo del árbol.', 'The night moves on: a new ring of the tree opens.'),
  },
  // ⏱ Reloj
  clock: { name: t('Más tiempo', 'More time'), desc: t('Cada sesión dura un poco más.', 'Every session lasts a little longer.') },
  clock2: { name: t('Reloj grande', 'Big clock'), desc: t('Todavía más tiempo para experimentar.', 'Even more time to experiment.') },
  fridge: { name: t('Nevera', 'Fridge'), desc: t('Empiezas con tus mejores criaturas ya vivas.', 'Start with your best creatures already alive.') },
  sprint: { name: t('Sprint final', 'Final sprint'), desc: t('En los últimos 30 segundos todo da más Esencia.', 'In the last 30 seconds everything gives more Essence.') },
  encTime: { name: t('Encargos con prisa', 'Hurry requests'), desc: t('Cumplir un encargo te da más segundos.', 'Finishing a request gives you more seconds.') },
  clock3: { name: t('Reloj de arena', 'Hourglass'), desc: t('Minutos enteros más por sesión.', 'Whole extra minutes per session.') },
  clock4: { name: t('Reloj eterno', 'Endless clock'), desc: t('El reloj más grande del laboratorio.', 'The biggest clock in the lab.') },
  // 💧 Gotero
  dropper: { name: t('Gotero', 'Dropper'), desc: t('Tus semillas prenden más a menudo.', 'Your seeds take more often.') },
  startEssence: { name: t('Esencia de bolsillo', 'Pocket Essence'), desc: t('Empiezas cada sesión con más Esencia.', 'Start every session with more Essence.') },
  freeSeeds: { name: t('Esporas de regalo', 'Gift spores'), desc: t('Siembras gratis al empezar cada sesión.', 'Free seeds at the start of every session.') },
  stabilizer: { name: t('Estabilizador', 'Stabilizer'), desc: t('Semillas más firmes: aún más se quedan a vivir.', 'Steadier seeds: even more stay alive.') },
  bigSeed: { name: t('Gota grande', 'Big drop'), desc: t('Mantén pulsado para sembrar una semilla grande.', 'Press and hold to sow a big seed.') },
  autoSeeder: { name: t('Sembrador automático', 'Auto-seeder'), desc: t('Un robot siembra solo en un sitio libre.', 'A robot sows by itself in a free spot.') },
  cheapSeeds: { name: t('Gotas baratas', 'Cheap drops'), desc: t('Sembrar cuesta menos Esencia.', 'Sowing costs less Essence.') },
  dropperMax: { name: t('Gotero maestro', 'Master dropper'), desc: t('El mejor gotero: toda semilla prende.', 'The best dropper: every seed takes.') },
  // 🧫 Placa
  dish: { name: t('Placa más grande', 'Bigger dish'), desc: t('La placa crece: caben más criaturas.', 'The dish grows: more creatures fit.') },
  slots: { name: t('Más sitio', 'More room'), desc: t('Más criaturas antes de que sembrar se encarezca.', 'More creatures before sowing gets pricey.') },
  crowdCost: { name: t('Sin apretujones', 'No squeezing'), desc: t('Una placa llena encarece menos la siembra.', 'A full dish raises the seed price less.') },
  nursery: { name: t('Guardería', 'Nursery'), desc: t('Las primeras criaturas no suben el precio.', 'Your first creatures do not raise the price.') },
  incubator: { name: t('Incubadora', 'Incubator'), desc: t('Las semillas se hacen criaturas más deprisa.', 'Seeds become creatures faster.') },
  dishXL: { name: t('Placa gigante', 'Giant dish'), desc: t('La placa más grande que existe.', 'The biggest dish there is.') },
  ecosystem: { name: t('Ecosistema', 'Ecosystem'), desc: t('Más especies distintas a la vez: más Esencia.', 'More different species at once: more Essence.') },
  // 🌱 Vida
  culture: { name: t('Cultivo', 'Culture'), desc: t('Un caldo más rico: todas dan más Esencia.', 'A richer broth: they all give more Essence.') },
  nutrient: { name: t('Nutriente', 'Nutrient'), desc: t('Criaturas con más forma y más brillo.', 'Creatures with more shape and more glow.') },
  culture2: { name: t('Superalimento', 'Superfood'), desc: t('Un festín: mucha más Esencia para todas.', 'A feast: much more Essence for everyone.') },
  swimAffinity: { name: t('Nadadoras', 'Swimmers'), desc: t('Las que nadan dan más Esencia.', 'The swimming ones give more Essence.') },
  stillAffinity: { name: t('Tranquilas', 'Calm ones'), desc: t('Las quietas y las que laten dan más.', 'Still and pulsing ones give more.') },
  colonyAffinity: { name: t('Familias', 'Families'), desc: t('Las colonias y las que se dividen dan más.', 'Colonies and dividers give more.') },
  symbiosis: { name: t('Simbiosis', 'Symbiosis'), desc: t('Dos especies distintas juntas se ayudan.', 'Two different species side by side help each other.') },
  abundance: { name: t('Vida abundante', 'Abundant life'), desc: t('Toda la placa da más Esencia.', 'The whole dish gives more Essence.') },
  eternalLife: { name: t('Vida eterna', 'Eternal life'), desc: t('Cada nivel, un poco más de Esencia. Sin final.', 'Every level, a bit more Essence. Never ends.') },
  // 🔬 Descubrir
  notebook: { name: t('Cuaderno de campo', 'Field notebook'), desc: t('Cada especie nueva te da más Datos.', 'Every new species gives you more Data.') },
  print: { name: t('Copiadora', 'Copier'), desc: t('Planta una copia de una especie del Bestiario.', 'Plant a copy of a species from the Bestiary.') },
  cataloguing: { name: t('Catalogación', 'Cataloguing'), desc: t('Cada especie registrada da más Esencia.', 'Every registered species gives more Essence.') },
  archive: { name: t('Archivo', 'Archive'), desc: t('Una copia gratis cada poco tiempo.', 'A free copy every little while.') },
  microscope: { name: t('Microscopio', 'Microscope'), desc: t('Fichas con más detalle sobre cada criatura.', 'Cards with more detail about each creature.') },
  discoBonus: { name: t('Premio al descubridor', 'Discoverer prize'), desc: t('Cada manera nueva de moverse da más Datos.', 'Every new way of moving gives more Data.') },
  rareSpores: { name: t('Esporas curiosas', 'Curious spores'), desc: t('Las semillas buscan especies que aún no tienes.', 'Seeds look for species you do not have yet.') },
  mutations: { name: t('Mutaciones', 'Mutations'), desc: t('A veces una copia sale distinta: ¡otra variante!', 'Sometimes a copy comes out different: a variant!') },
  encyclopedia: { name: t('Gran enciclopedia', 'Great encyclopedia'), desc: t('Todos los Datos de cada sesión crecen.', 'All the Data of every session grows.') },
  // 🌍 Mundos
  worldGyro: { name: t('Mundo 3 · Remolinos', 'World 3 · Whirls'), desc: t('Nace una criatura que gira como un remolino.', 'A creature that spins like a whirl is born.') },
  worldCold: { name: t('Mundo 2 · Frío', 'World 2 · Cold'), desc: t('Un mundo lento: criaturas finas y transparentes.', 'A slow world: thin, see-through creatures.') },
  worldLegs: { name: t('Mundo 6 · Patas', 'World 6 · Legs'), desc: t('Criaturas con patitas que caminan por la placa.', 'Creatures with little legs that walk the dish.') },
  worldShields: { name: t('Mundo 4 · Escudos', 'World 4 · Shields'), desc: t('Criaturas fuertes con forma de escudo.', 'Strong creatures shaped like shields.') },
  worldHelix: { name: t('Mundo 5 · Discos', 'World 5 · Discs'), desc: t('Discos, anillos y triángulos que brillan.', 'Glowing discs, rings and triangles.') },
  worldGiants: { name: t('Mundo 7 · Gigantes', 'World 7 · Giants'), desc: t('Criaturas enormes: caben menos, pero cada una vale ×2.', 'Huge creatures: fewer fit, but each is worth ×2.') },
  // ✨ Destello
  spark: { name: t('Destello frecuente', 'Frequent spark'), desc: t('La chispa dorada aparece más a menudo.', 'The golden spark shows up more often.') },
  sparkLife: { name: t('Destello lento', 'Slow spark'), desc: t('La chispa se queda más tiempo para atraparla.', 'The spark stays longer so you can catch it.') },
  sparkTime: { name: t('Destello del tiempo', 'Time spark'), desc: t('Cada chispa atrapada suma segundos al reloj.', 'Every spark you catch adds seconds.') },
  sparkFirst: { name: t('Primer destello', 'Early spark'), desc: t('La primera chispa llega nada más empezar.', 'The first spark comes right at the start.') },
  sparkGift: { name: t('Regalos mejores', 'Better gifts'), desc: t('Los regalos de la chispa son más grandes.', 'The spark’s gifts are bigger.') },
  sparkDatos: { name: t('Destello sabio', 'Wise spark'), desc: t('Cada chispa atrapada te da Datos.', 'Every spark you catch gives you Data.') },
  sparkMutagen: { name: t('Mutágeno potente', 'Strong mutagen'), desc: t('El regalo Mutágeno da más semillas seguras.', 'The Mutagen gift gives more sure seeds.') },
};

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

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
  sprint: (m: Text) => t(`Últimos 30 s ${m.es}`, `Last 30 s ${m.en}`),
  perEncargo: (s: number) => t(`+${s} s por encargo`, `+${s} s per request`),
  success: (p: string) => t(`Prenden ${p} %`, `${p}% take`),
  startEssence: (n: number) => t(`Empiezas con ${n} de Esencia`, `Start with ${n} Essence`),
  freeSeeds: (n: number) => t(plural(n, 'siembra gratis', 'siembras gratis'), plural(n, 'free seed', 'free seeds')),
  bigSeed: (area: Text) => t(`Semilla grande ×${area.es}`, `Big seed ×${area.en}`),
  every: (s: Text) => t(`Cada ${s.es} s`, `Every ${s.en} s`),
  seedPrice: (p: string) => t(`Semillas −${p} %`, `Seeds −${p}%`),
  normalPrice: t('Precio normal', 'Normal price'),
  diameter: (d: number) => t(`Placa Ø${d}`, `Dish Ø${d}`),
  slots: (n: number) => t(`+${n} ${n === 1 ? 'sitio barato' : 'sitios baratos'}`, `+${n} cheap ${n === 1 ? 'spot' : 'spots'}`),
  crowd: (p: string) => t(`Recargo −${p} %`, `Surcharge −${p}%`),
  crowdNormal: t('Recargo normal', 'Normal surcharge'),
  nursery: (n: number) => t(`Las ${n} primeras no suben el precio`, `First ${n} do not raise the price`),
  mature: (m: Text) => t(`Maduran ${m.es}`, `Grow up ${m.en}`),
  perSpecies: (p: string) => t(`+${p} % por especie viva`, `+${p}% per species alive`),
  essenceMult: (m: Text) => t(`Esencia ${m.es}`, `Essence ${m.en}`),
  essencePlus: (p: string) => t(`Esencia +${p} %`, `Essence +${p}%`),
  allEssence: (m: Text) => t(`Toda la Esencia ${m.es}`, `All Essence ${m.en}`),
  swimmers: (p: string) => t(`Nadadoras +${p} %`, `Swimmers +${p}%`),
  still: (p: string) => t(`Quietas +${p} %`, `Still ones +${p}%`),
  colonies: (p: string) => t(`Colonias +${p} %`, `Colonies +${p}%`),
  pairs: (m: Text) => t(`Parejas ${m.es}`, `Pairs ${m.en}`),
  datosPerSpecies: (n: number) => t(`${n} Datos por especie nueva`, `${n} Data per new species`),
  copies: t('Copias que siempre prenden', 'Copies that always take'),
  bestiaryEssence: (p: string) => t(`Bestiario: Esencia +${p} %`, `Bestiary: Essence +${p}%`),
  freeCopy: (s: number) => t(`Copia gratis cada ${s} s`, `Free copy every ${s} s`),
  microscope: [t('Ficha simple', 'Simple card'), t('Rangos y marcas', 'Ranges and marks'), t('Todos los detalles', 'Every detail')] as Text[],
  datosPerBehavior: (n: number) => t(`${n} Datos por manera nueva`, `${n} Data per new way`),
  seekNew: t('Buscan formas nuevas', 'They seek new forms'),
  variants: t('Copias con variantes', 'Copies with variants'),
  allDatos: (p: string) => t(`Datos +${p} %`, `Data +${p}%`),
  species: (n: number) => t(`${plural(n, 'especie posible', 'especies posibles')}`, `${plural(n, 'possible species', 'possible species')}`),
  sparkEvery: (r: string) => t(`Llega cada ${r} s`, `Comes every ${r} s`),
  sparkStays: (s: number) => t(`Se queda ${s} s`, `Stays ${s} s`),
  perSpark: (s: number) => t(`+${s} s por chispa`, `+${s} s per spark`),
  firstSpark: (r: string) => t(`La primera a los ${r} s`, `First one at ${r} s`),
  gifts: (m: Text) => t(`Regalos ${m.es}`, `Gifts ${m.en}`),
  datosPerSpark: (n: number) => t(`+${n} Datos por chispa`, `+${n} Data per spark`),
  sureSeeds: (n: number) => t(`${n} semillas seguras`, `${n} sure seeds`),
};

/** World cards (start card picker). Names live in NODE_TEXT for the tree; the first world here. */
export const WORLD_TEXT: Record<string, { name: Text; short: Text; desc: Text }> = {
  classic: { name: t('Mundo 1 · Clásico', 'World 1 · Classic'), short: t('Clásico', 'Classic'), desc: t('Donde empezó todo: nadadoras redondas.', 'Where it all began: round swimmers.') },
  gyro: { name: NODE_TEXT.worldGyro.name, short: t('Remolinos', 'Whirls'), desc: NODE_TEXT.worldGyro.desc },
  cold: { name: NODE_TEXT.worldCold.name, short: t('Frío', 'Cold'), desc: NODE_TEXT.worldCold.desc },
  legs: { name: NODE_TEXT.worldLegs.name, short: t('Patas', 'Legs'), desc: NODE_TEXT.worldLegs.desc },
  shields: { name: NODE_TEXT.worldShields.name, short: t('Escudos', 'Shields'), desc: NODE_TEXT.worldShields.desc },
  helix: { name: NODE_TEXT.worldHelix.name, short: t('Discos', 'Discs'), desc: NODE_TEXT.worldHelix.desc },
  giants: { name: NODE_TEXT.worldGiants.name, short: t('Gigantes', 'Giants'), desc: NODE_TEXT.worldGiants.desc },
};

/** Short UI strings of the tree and the session screens. */
export const TREE_UI = {
  title: t('Árbol de investigación', 'Research tree'),
  titleShort: t('Árbol', 'Tree'),
  hint: t('Toca un nodo', 'Tap a node'),
  level: t('NIVEL', 'LEVEL'),
  buy: t('Comprar', 'Buy'),
  maxed: t('¡Completo!', 'Complete!'),
  owned: t('Tuyo', 'Owned'),
  now: t('Ahora', 'Now'),
  next: t('Con un nivel más', 'With one more level'),
  beforeAfter: t('Antes → después', 'Before → after'),
  tapPrice: t('Toca el precio para ver la cuenta', 'Tap the price to see the sum'),
  step: (i: number, n: number) => t(`Paso ${i} de ${n}`, `Step ${i} of ${n}`),
  bought: (name: string) => t(`Comprado: ${name}`, `Bought: ${name}`),
  needs: t('Necesita', 'Needs'),
  mystery: t('Algo nuevo… compra el paso anterior para verlo.', 'Something new… buy the step before to see it.'),
  nightLocked: (n: number) => t(`Se abre en la Noche ${n}.`, `Opens on Night ${n}.`),
  missing: (n: string, s: string | null) =>
    s ? t(`Te faltan ${n} Datos — ${s}`, `You need ${n} more Data — ${s}`) : t(`Te faltan ${n} Datos`, `You need ${n} more Data`),
  sessions: (n: number) => (n === 1 ? t('una sesión más', 'one more session') : t(`unas ${n} sesiones`, `about ${n} sessions`)),
  priceRule: (start: string, growth: string) =>
    t(`Empieza en ${start} Datos y cada nivel cuesta ×${growth}.`, `Starts at ${start} Data and every level costs ×${growth}.`),
  priceRuleOne: (start: string) => t(`Un solo nivel: ${start} Datos.`, `One level only: ${start} Data.`),
  priceWhy: t(
    'Una sola regla: más lejos del centro, más caro; cada nivel da más, por eso cuesta más. Nada al azar.',
    'One rule: farther from the centre costs more; each level gives more, so it costs more. Nothing random.',
  ),
  why: t('¿Por qué cuesta esto?', 'Why this price?'),
  nextLevels: t('Próximos niveles', 'Next levels'),
  ringStart: (ring: string) => t(`Anillo ${ring}`, `Ring ${ring}`),
  levelN: (n: number) => t(`nivel ${n}`, `level ${n}`),
  levelsBought: (n: number, g: string) =>
    n === 1 ? t(`1 nivel comprado: ×${g}`, `1 level bought: ×${g}`) : t(`${n} niveles comprados: ×${g} cada uno`, `${n} levels bought: ×${g} each`),
  newSession: t('Nueva sesión', 'New session'),
  centre: t('Centrar', 'Centre'),
  zoomIn: t('Acercar', 'Zoom in'),
  zoomOut: t('Alejar', 'Zoom out'),
  close: t('Cerrar', 'Close'),
  night: (n: number) => t(`Noche ${n}`, `Night ${n}`),
  nightReady: t('¡La noche puede avanzar!', 'The night can move on!'),
  nightGate: (s: number, sp: number, alt: number) =>
    t(`Necesita ${s} sesiones y ${sp} especies — o ${alt} sesiones.`, `Needs ${s} sessions and ${sp} species — or ${alt} sessions.`),
  nightProgress: (s: number, sNeed: number, sp: number, spNeed: number) =>
    t(`Sesiones ${s}/${sNeed} · Especies ${sp}/${spNeed}`, `Sessions ${s}/${sNeed} · Species ${sp}/${spNeed}`),
  nightRule: t('La noche no cuesta Datos: avanza cuando trabajas lo suficiente. Abre anillos nuevos y da +10 % de Datos.', 'A night costs no Data: it moves on when you have worked enough. It opens new rings and gives +10% Data.'),
  nightFree: t('Gratis', 'Free'),
  affordable: (n: number) => (n === 1 ? t('1 mejora lista', '1 upgrade ready') : t(`${n} mejoras listas`, `${n} upgrades ready`)),
};

/** Session HUD, start and end cards. */
export const SESSION_UI = {
  session: (n: number) => t(`Sesión ${n}`, `Session ${n}`),
  startTitle: (n: number) => t(`Sesión ${n}`, `Session ${n}`),
  startTime: (clock: string) => t(`Tienes ${clock} de laboratorio`, `You have ${clock} of lab time`),
  startHint: t('El reloj empieza con tu primera gota.', 'The clock starts with your first drop.'),
  startGo: t('¡Empezar!', 'Start!'),
  startNew: t('Nuevo desde la última vez', 'New since last time'),
  startGoal: t('Tu encargo', 'Your request'),
  startKeep: (n: number) => (n === 1 ? t('Sale de la nevera: 1 criatura', 'Out of the fridge: 1 creature') : t(`Salen de la nevera: ${n} criaturas`, `Out of the fridge: ${n} creatures`)),
  lastMinute: t('¡Último minuto!', 'Last minute!'),
  timesUp: t('¡Tiempo!', 'Time!'),
  waiting: t('Siembra para empezar', 'Sow to start'),
  sprint: t('¡Sprint!', 'Sprint!'),
  plusTime: (s: number) => t(`+${s} s`, `+${s} s`),
  endTitle: (n: number) => t(`Fin de la sesión ${n}`, `End of session ${n}`),
  earned: t('Esencia ganada', 'Essence earned'),
  every100: (d: number) => t(`Cada ${d} de Esencia = 1 Dato`, `Every ${d} Essence = 1 Data`),
  oneDato: t('= 1 Dato', '= 1 Data'),
  nightBonus: (n: number) => t(`Noche ${n}`, `Night ${n}`),
  encyclopedia: t('Enciclopedia', 'Encyclopedia'),
  newSpecies: t('especies nuevas', 'new species'),
  newBehaviors: t('maneras de moverse nuevas', 'new ways of moving'),
  encargos: t('encargos', 'requests'),
  sparks: t('destellos sabios', 'wise sparks'),
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
  worldPicked: t('Jugarás aquí', 'You will play here'),
  previewDatos: (n: string) => t(`+${n} Datos al terminar`, `+${n} Data at the end`),
  previewNext: (name: string, missing: string) => t(`${name}: faltan ${missing}`, `${name}: ${missing} to go`),
  previewReady: (name: string) => t(`¡Alcanza para ${name}!`, `Enough for ${name}!`),
  conversionTitle: t('Así ganas Datos', 'How you earn Data'),
  conversionRule: (d: number) => t(`Por cada ${d} de Esencia, 1 Dato`, `For every ${d} Essence, 1 Data`),
};

/** VELA's line on the end card (≤ 14 words each). Picked by session.ts `velaLine`. */
export const VELA_LINES = {
  first: t('¡Tu primera sesión! Lo anoté todo. Ahora, al Árbol.', 'Your first session! I noted everything. Now, to the Tree.'),
  newSpecies: t('¡Una especie nueva! Ya está en el Bestiario. Anotado.', 'A new species! It is in the Bestiary now. Noted.'),
  record: t('¡Récord! Esto va directo al informe.', 'A record! This goes straight into the report.'),
  poor: t('Hoy salió poco. Pero aprendimos algo. ¡Otra vez!', 'Not much today. But we learned something. Again!'),
  night: t('La placa está lista para una noche nueva.', 'The dish is ready for a new night.'),
  sprint: t('¡Qué final! Ese sprint valió la pena.', 'What a finish! That sprint was worth it.'),
  plain: t('Buen experimento, colega. Anotado.', 'Good experiment, colleague. Noted.'),
};
