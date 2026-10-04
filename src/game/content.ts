/**
 * Player-facing text (Spanish + English). Numbers live in balance.ts; text that needs a
 * number receives it as an argument.
 */
import type { Behavior, Text } from '../core/types';
import { DISH_BONUS } from './balance';
import { formatNumber as f, formatPct as pct } from './format';

const t = (es: string, en: string): Text => ({ es, en });

// ───────────────────────────── Behaviours ──────────────────────────

export const BEHAVIOR_NAMES: Record<Behavior, Text> = {
  still: t('quieta', 'still'),
  pulsing: t('pulsante', 'pulsing'),
  swimmer: t('nadadora', 'swimmer'),
  spinner: t('giratoria', 'spinner'),
  divider: t('divisora', 'divider'),
  colony: t('colonia', 'colony'),
};

// ───────────────────────────── Upgrades ────────────────────────────

export interface UpgradeText {
  name: Text;
  desc: Text;
  hint: Text;
}

export const UPGRADE_TEXT: Record<string, UpgradeText> = {
  dropper: {
    name: t('Gotero', 'Dropper'),
    desc: t('Mejora la semilla: más consistente y nuevas formas de sembrar.', 'Better seeds: more consistent, and new ways to sow.'),
    hint: t('Disponible desde el inicio', 'Available from the start'),
  },
  autoSeeder: {
    name: t('Sembrador automático', 'Auto-seeder'),
    desc: t('Siembra solo en un punto libre de la placa. Paga el costo de la semilla.', 'Sows by itself on a free spot of the dish. Pays the seed cost.'),
    hint: t('Ten 2 criaturas estables a la vez', 'Have 2 stable creatures at once'),
  },
  culture: {
    name: t('Cultivo', 'Culture'),
    desc: t('Mejor medio de cultivo: más Esencia de todo lo que vive.', 'A richer medium: more Essence from everything alive.'),
    hint: t('Alcanza 10 Esencia/s', 'Reach 10 Essence/s'),
  },
  calibrator: {
    name: t('Calibrador', 'Calibrator'),
    desc: t('Desbloquea y amplía los controles de la regla: μ, σ, dt y R.', 'Unlocks and widens the rule controls: μ, σ, dt and R.'),
    hint: t('Registra 1 especie', 'Register 1 species'),
  },
  stabilizer: {
    name: t('Estabilizador', 'Stabilizer'),
    desc: t('Ajusta la semilla hacia lo que mejor vive en el régimen actual.', 'Tunes seeds towards what lives best in the current regime.'),
    hint: t('Compra Calibrador I', 'Buy Calibrator I'),
  },
  dish: {
    name: t('Placa', 'Dish'),
    desc: t('Más espacio: caben más criaturas antes de que la placa se sature y la siembra se encarezca. Además más producción.', 'More room: more creatures fit before the dish saturates and seeding gets pricey. Also more production.'),
    hint: t('Ten 4 criaturas estables a la vez', 'Have 4 stable creatures at once'),
  },
  incubator: {
    name: t('Incubadora', 'Incubator'),
    desc: t('Acelera la simulación: las criaturas maduran y se descubren antes.', 'Speeds up the simulation: creatures mature and are discovered sooner.'),
    hint: t('Compra Placa I', 'Buy Dish I'),
  },
  swimAffinity: {
    name: t('Afinidad nadadora', 'Swimmer affinity'),
    desc: t('Más producción de nadadoras y giratorias.', 'More production from swimmers and spinners.'),
    hint: t('Observa una nadadora', 'Observe a swimmer'),
  },
  sessileAffinity: {
    name: t('Afinidad sésil', 'Sessile affinity'),
    desc: t('Más producción de quietas y pulsantes.', 'More production from still and pulsing creatures.'),
    hint: t('Observa una criatura quieta', 'Observe a still creature'),
  },
  colonyAffinity: {
    name: t('Afinidad colonial', 'Colony affinity'),
    desc: t('Más producción de divisoras y colonias.', 'More production from dividers and colonies.'),
    hint: t('Observa una división', 'Observe a division'),
  },
  reserve: {
    name: t('Reserva', 'Reserve'),
    desc: t('Alarga el tiempo que la placa produce mientras no estás.', 'Extends how long the dish produces while you are away.'),
    hint: t('Vuelve tras cerrar el juego', 'Come back after closing the game'),
  },
  fastPipette: {
    name: t('Pipeta rápida', 'Quick pipette'),
    desc: t('La siembra gratuita de emergencia se recarga antes.', 'The free emergency seed recharges faster.'),
    hint: t('Usa la pipeta de emergencia', 'Use the emergency pipette'),
  },
  nutrient: {
    name: t('Nutriente', 'Nutrient'),
    desc: t('Realza la complejidad medida de cada criatura estable.', 'Boosts the measured complexity of every stable creature.'),
    hint: t('Cultivo nivel 10', 'Culture level 10'),
  },
  microscope: {
    name: t('Microscopio', 'Microscope'),
    desc: t('Más información en las fichas y pistas de especies por descubrir.', 'More detail in species cards and hints of undiscovered species.'),
    hint: t('Registra 1 especie', 'Register 1 species'),
  },
  cataloguing: {
    name: t('Catalogación', 'Cataloguing'),
    desc: t('Aumenta el multiplicador de todas las especies registradas.', 'Raises the multiplier of every registered species.'),
    hint: t('Registra 3 especies', 'Register 3 species'),
  },
  archive: {
    name: t('Archivo', 'Archive'),
    desc: t('Una Impresión gratis cada cierto tiempo.', 'A free Print every so often.'),
    hint: t('Registra 5 especies', 'Register 5 species'),
  },
  marker: {
    name: t('Marcador', 'Marker'),
    desc: t('Las criaturas muestran un punto de color según su comportamiento.', 'Creatures show a coloured dot for their behaviour.'),
    hint: t('Observa 2 comportamientos distintos', 'Observe 2 different behaviours'),
  },
};

const DROPPER_LEVEL_TEXT: Text[] = [
  t('Semilla básica', 'Basic seed'),
  t('Semilla consistente', 'Consistent seed'),
  t('Toque largo: siembra grande', 'Long press: big seed'),
  t('Pincel: arrastra para sembrar', 'Brush: drag to sow'),
  t('Semilla anillo', 'Ring seed'),
  t('Semilla de ruido y selector de forma', 'Noise seed and shape picker'),
];

const CALIBRATOR_LEVEL_TEXT: Text[] = [
  t('Regla fija', 'Fixed rule'),
  t('μ 0.12–0.18, σ 0.010–0.025', 'μ 0.12–0.18, σ 0.010–0.025'),
  t('μ 0.10–0.30, σ 0.005–0.05, 8 regímenes', 'μ 0.10–0.30, σ 0.005–0.05, 8 regimes'),
  t('μ 0.10–0.50, σ hasta 0.10, slider dt', 'μ 0.10–0.50, σ up to 0.10, dt slider'),
  t('Slider R de 10 a 27', 'R slider 10 to 27'),
];

const MICROSCOPE_LEVEL_TEXT: Text[] = [
  t('Sin lente', 'No lens'),
  t('Rango de μ y σ en las fichas', 'μ and σ range in cards'),
  t('Velocidad, periodo y firma', 'Speed, period and signature'),
  t('Pistas de especies cercanas', 'Hints of nearby species'),
];

const arrow = (a: Text, b: Text | null): Text => (b ? t(`${a.es} → ${b.es}`, `${a.en} → ${b.en}`) : a);
const same = (s: string): Text => t(s, s);

/** "current → next" effect text for an upgrade at `level`. `v` returns the value text at a level. */
export function effectText(id: string, level: number, maxLevel: number | null, v: (lvl: number) => string): Text {
  const next = maxLevel === null || level < maxLevel ? level + 1 : null;
  switch (id) {
    case 'dropper':
      return arrow(DROPPER_LEVEL_TEXT[level], next !== null ? DROPPER_LEVEL_TEXT[next] : null);
    case 'calibrator':
      return arrow(CALIBRATOR_LEVEL_TEXT[level], next !== null ? CALIBRATOR_LEVEL_TEXT[next] : null);
    case 'microscope':
      return arrow(MICROSCOPE_LEVEL_TEXT[level], next !== null ? MICROSCOPE_LEVEL_TEXT[next] : null);
    case 'dish':
      return next !== null
        ? t(`${v(level)} huecos → ${v(next)}, +${pct(level * DISH_BONUS)} → +${pct(next * DISH_BONUS)}`, `${v(level)} slots → ${v(next)}, +${pct(level * DISH_BONUS)} → +${pct(next * DISH_BONUS)}`)
        : t(`${v(level)} huecos, +${pct(level * DISH_BONUS)}`, `${v(level)} slots, +${pct(level * DISH_BONUS)}`);
    case 'marker':
      return level ? t('Marcas activas', 'Markers on') : t('Sin marcas → marcas de color', 'No markers → colour markers');
    default:
      return arrow(same(v(level)), next !== null ? same(v(next)) : null);
  }
}

// ───────────────────────────── Genome ──────────────────────────────

export const GENOME_TEXT: Record<string, { name: Text; desc: Text }> = {
  doubleRings: {
    name: t('Anillos dobles', 'Double rings'),
    desc: t('El kernel admite 2 picos: el Calibrador gana un selector de perfil y aparecen especies multi-anillo.', 'The kernel accepts 2 peaks: the Calibrator gains a profile picker and multi-ring species appear.'),
  },
  tripleRings: {
    name: t('Anillos triples', 'Triple rings'),
    desc: t('3 picos en el kernel: aparece Hydrogeminium y especies de radio grande.', '3 kernel peaks: Hydrogeminium and large-radius species appear.'),
  },
  secondChannel: {
    name: t('Segundo canal', 'Second channel'),
    desc: t('Dos sustancias con kernels cruzados. Próximamente.', 'Two substances with crossed kernels. Coming soon.'),
  },
  flow: {
    name: t('Flujo', 'Flow'),
    desc: t('La masa se conserva y las criaturas compiten por materia. Próximamente.', 'Mass is conserved and creatures compete for matter. Coming soon.'),
  },
  dropperMemory: {
    name: t('Memoria del Gotero', 'Dropper memory'),
    desc: t('Cada Era empieza con el Gotero en el nivel máximo alcanzado menos 1.', 'Each Era starts with the Dropper at its best level minus 1.'),
  },
  regimesPersist: {
    name: t('Regímenes persisten', 'Lasting regimes'),
    desc: t('Los regímenes guardados sobreviven a la Extinción.', 'Saved regimes survive Extinction.'),
  },
  essenceStart: {
    name: t('Arranque con Esencia', 'Essence head start'),
    desc: t('Cada Era empieza con 500 × (número de Era) Esencia.', 'Each Era starts with 500 × (Era number) Essence.'),
  },
  persistentSeeder: {
    name: t('Sembrador persistente', 'Lasting auto-seeder'),
    desc: t('Cada Era empieza con el Sembrador automático en nivel 3.', 'Each Era starts with the Auto-seeder at level 3.'),
  },
  mutations: {
    name: t('Mutaciones', 'Mutations'),
    desc: t('El 10 % de las Impresiones muta; si se estabiliza, es una especie nueva "var.".', '10% of Prints mutate; if one stabilises it is a new "var." species.'),
  },
  symbiosis: {
    name: t('Simbiosis', 'Symbiosis'),
    desc: t('Dos especies distintas a menos de 2 R forman pareja: ×1.5 a ambas.', 'Two different species within 2 R pair up: ×1.5 to both.'),
  },
  predation: {
    name: t('Depredación', 'Predation'),
    desc: t('Un canal consume al otro donde se tocan. Próximamente.', 'One channel consumes the other where they touch. Coming soon.'),
  },
};

// ───────────────────────────── Journal (Bitácora) ──────────────────

/** Journal entries in unlock order. [doc §3] */
export const JOURNAL: { id: string; text: Text }[] = [
  { id: 'firstSeed', text: t('Materia inerte. La dejo reposar. Nada debería pasar.', 'Inert matter. I let it rest. Nothing should happen.') },
  { id: 'firstDeath', text: t('Se disolvió en segundos. Demasiado poco, demasiado disperso.', 'It dissolved in seconds. Too little, too scattered.') },
  { id: 'firstExplosion', text: t('Lo contrario: lo llenó todo y dejó de ser nada. La estructura es lo que cuenta.', 'The opposite: it filled everything and stopped being anything. Structure is what counts.') },
  { id: 'firstStable', text: t('Algo se quedó. Tiene borde, tiene forma. La llamo espécimen 1.', 'Something stayed. It has an edge, it has a shape. I call it specimen 1.') },
  { id: 'firstSwimmer', text: t('Se mueve en línea recta y no se deshace. Hoy no voy a dormir.', 'It moves in a straight line and does not fall apart. I will not sleep tonight.') },
  { id: 'firstSpinner', text: t('Esta gira. No sé qué busca, pero lo busca en círculos.', 'This one turns. I do not know what it looks for, but it looks in circles.') },
  { id: 'firstGolden', text: t('Un destello cruzó la placa. No sé qué era, pero dejó algo.', 'A spark crossed the dish. I do not know what it was, but it left something.') },
  { id: 'firstDivision', text: t('Una se volvió dos. Ya no sé si las descubro o si me descubren.', 'One became two. I no longer know if I discover them or they discover me.') },
  { id: 'calibrator', text: t('Si muevo μ un poco, el mundo cambia de reglas. Tengo que anotar todo.', 'If I nudge μ a little, the world changes its rules. I must write everything down.') },
  { id: 'species10', text: t('Diez. Empiezan a parecerse a una fauna, no a accidentes.', 'Ten. They start to look like a fauna, not accidents.') },
  { id: 'extinctionNear', text: t('La placa está madura. Quizá sea hora de empezar de cero con lo aprendido.', 'The dish is ripe. Maybe it is time to start over with what I learned.') },
  { id: 'firstExtinction', text: t('Esterilizo la placa. Me duele. Pero sé qué funcionó, y eso se queda conmigo.', 'I sterilise the dish. It hurts. But I know what worked, and that stays with me.') },
  { id: 'era2', text: t('Nueva placa, mismos ojos. Esta vez siembro con intención.', 'New dish, same eyes. This time I sow with intent.') },
  { id: 'species50', text: t('Dejé de contar accidentes. Ahora cuento vidas.', 'I stopped counting accidents. Now I count lives.') },
];

// ───────────────────────────── Achievements ────────────────────────

export const ACHIEVEMENT_TEXT: Record<string, { name: Text; desc: Text }> = {
  firstSeed: { name: t('Primera gota', 'First drop'), desc: t('Siembra por primera vez.', 'Sow for the first time.') },
  firstLife: { name: t('Algo se quedó', 'Something stayed'), desc: t('Consigue una criatura estable.', 'Get a stable creature.') },
  seeds100: { name: t('Mano firme', 'Steady hand'), desc: t('Siembra 100 veces.', 'Sow 100 times.') },
  seeds1000: { name: t('Lluvia constante', 'Steady rain'), desc: t('Siembra 1 000 veces.', 'Sow 1,000 times.') },
  species3: { name: t('Naturalista', 'Naturalist'), desc: t('Registra 3 especies.', 'Register 3 species.') },
  species10: { name: t('Taxónoma', 'Taxonomist'), desc: t('Registra 10 especies.', 'Register 10 species.') },
  species20: { name: t('Fauna propia', 'A fauna of my own'), desc: t('Registra 20 especies.', 'Register 20 species.') },
  swimmer: { name: t('Nadadora', 'Swimmer'), desc: t('Observa una criatura nadadora.', 'Observe a swimming creature.') },
  spinner: { name: t('Remolino', 'Whirl'), desc: t('Observa una criatura giratoria.', 'Observe a spinning creature.') },
  pulsing: { name: t('Latido', 'Heartbeat'), desc: t('Observa una criatura pulsante.', 'Observe a pulsing creature.') },
  divider: { name: t('Mitosis', 'Mitosis'), desc: t('Observa una criatura divisora.', 'Observe a dividing creature.') },
  colony: { name: t('Colonia', 'Colony'), desc: t('Forma una colonia.', 'Form a colony.') },
  allBehaviors: { name: t('Etóloga', 'Ethologist'), desc: t('Observa los 6 comportamientos.', 'Observe all 6 behaviours.') },
  eps10: { name: t('Productiva', 'Productive'), desc: t('Alcanza 10 Esencia/s.', 'Reach 10 Essence/s.') },
  eps100: { name: t('Floreciente', 'Flourishing'), desc: t('Alcanza 100 Esencia/s.', 'Reach 100 Essence/s.') },
  eps1000: { name: t('Ecosistema', 'Ecosystem'), desc: t('Alcanza 1 000 Esencia/s.', 'Reach 1,000 Essence/s.') },
  essence1e4: { name: t('Diez mil', 'Ten thousand'), desc: t('Gana 10 000 Esencia en total.', 'Earn 10,000 Essence in total.') },
  essence1e6: { name: t('Millonaria', 'Millionaire'), desc: t('Gana 1 000 000 de Esencia en total.', 'Earn 1,000,000 Essence in total.') },
  golden1: { name: t('Destello', 'Spark'), desc: t('Atrapa un Destello.', 'Catch a Spark.') },
  golden10: { name: t('Cazadora de luz', 'Light catcher'), desc: t('Atrapa 10 Destellos.', 'Catch 10 Sparks.') },
  golden50: { name: t('Polilla', 'Moth'), desc: t('Atrapa 50 Destellos.', 'Catch 50 Sparks.') },
  rare: { name: t('Rareza', 'Rarity'), desc: t('Registra una especie rara.', 'Register a rare species.') },
  veryRare: { name: t('Joya', 'Jewel'), desc: t('Registra una especie muy rara.', 'Register a very rare species.') },
  crowd5: { name: t('Placa viva', 'Living dish'), desc: t('Ten 5 criaturas estables a la vez.', 'Have 5 stable creatures at once.') },
  crowd10: { name: t('Bullicio', 'Bustle'), desc: t('Ten 10 criaturas estables a la vez.', 'Have 10 stable creatures at once.') },
  printer: { name: t('Impresora', 'Printer'), desc: t('Imprime una especie.', 'Print a species.') },
  tinkerer: { name: t('Ajuste fino', 'Fine tuning'), desc: t('Cambia la calibración.', 'Change the calibration.') },
  regime: { name: t('Archivista', 'Archivist'), desc: t('Guarda un régimen.', 'Save a regime.') },
  extinction: { name: t('Tabula rasa', 'Tabula rasa'), desc: t('Provoca una Extinción.', 'Trigger an Extinction.') },
  heritage: { name: t('Herencia', 'Heritage'), desc: t('Compra un nodo del Genoma.', 'Buy a Genome node.') },
  variant: { name: t('Variación', 'Variation'), desc: t('Registra una variante mutada.', 'Register a mutated variant.') },
  symbiosis: { name: t('Simbiosis', 'Symbiosis'), desc: t('Forma una pareja simbiótica.', 'Form a symbiotic pair.') },
  returned: { name: t('De vuelta', 'Back again'), desc: t('Vuelve tras una ausencia.', 'Return after being away.') },
  hour: { name: t('Paciencia', 'Patience'), desc: t('Juega una hora.', 'Play for an hour.') },
};

export const achievementReward = (bonus: number): Text => t(`+${pct(bonus)} Esencia`, `+${pct(bonus)} Essence`);

// ───────────────────────────── Objectives ──────────────────────────

const OBJECTIVE_TEXT: Record<string, Text> = {
  seed: t('Toca la placa para sembrar', 'Tap the dish to sow'),
  stable: t('Consigue una criatura estable', 'Get a stable creature'),
  look: t('Mira tu espécimen en el Bestiario', 'Look at your specimen in the Bestiary'),
  dropper: t('Compra Gotero I en el Laboratorio', 'Buy Dropper I in the Lab'),
  two: t('Ten 2 criaturas estables a la vez', 'Have 2 stable creatures at once'),
  seeder: t('Compra el Sembrador automático', 'Buy the Auto-seeder'),
  eps3: t('Produce 3 Esencia/s', 'Produce 3 Essence/s'),
  calib: t('Compra Calibrador I', 'Buy Calibrator I'),
  move: t('Mueve μ en la pestaña Calibrar', 'Move μ in the Calibrate tab'),
  species3: t('Registra 3 especies', 'Register 3 species'),
  golden: t('Atrapa un Destello dorado', 'Catch a golden Spark'),
  behaviors2: t('Observa 2 comportamientos distintos', 'Observe 2 different behaviours'),
  eps10: t('Produce 10 Esencia/s', 'Produce 10 Essence/s'),
  culture: t('Compra Cultivo', 'Buy Culture'),
  print: t('Imprime una especie desde el Bestiario', 'Print a species from the Bestiary'),
  species6: t('Registra 6 especies', 'Register 6 species'),
  eps50: t('Produce 50 Esencia/s', 'Produce 50 Essence/s'),
  dish: t('Compra Placa I', 'Buy Dish I'),
  era100k: t('Gana 100 000 Esencia en esta Era', 'Earn 100,000 Essence this Era'),
  extinct: t('Provoca tu primera Extinción', 'Trigger your first Extinction'),
};

export function objectiveText(id: string, current: number, target: number): Text {
  const base = OBJECTIVE_TEXT[id] ?? t(id, id);
  if (target <= 1) return base;
  const c = Math.min(current, target);
  return t(`${base.es} (${f(Math.floor(c))}/${f(target)})`, `${base.en} (${f(Math.floor(c))}/${f(target)})`);
}

// ───────────────────────────── Golden rewards & misc ───────────────

export const TEXT = {
  bloom: t('Floración', 'Bloom'),
  bloomReward: (mult: number, secs: number) => t(`¡Floración! ×${mult} producción durante ${secs} s`, `Bloom! ×${mult} production for ${secs} s`),
  lumpReward: (amount: number) => t(`¡+${f(amount)} Esencia!`, `+${f(amount)} Essence!`),
  sporeReward: (n: number) => t(`¡Lluvia de esporas! ${n} siembras gratis`, `Spore rain! ${n} free seeds`),
  mutagenReward: (n: number) => t(`¡Mutágeno! Las próximas ${n} siembras prenderán seguro`, `Mutagen! Your next ${n} seeds will surely take`),
  objectiveDone: (reward: number) =>
    reward > 0 ? t(`Objetivo cumplido: +${f(reward)} Esencia`, `Objective complete: +${f(reward)} Essence`) : t('Objetivo cumplido', 'Objective complete'),
  upgradeUnlocked: (name: Text) => t(`Nueva mejora: ${name.es}`, `New upgrade: ${name.en}`),
  tabUnlocked: (es: string, en: string) => t(`Nueva pestaña: ${es}`, `New tab: ${en}`),
  extinctionReady: t('La placa está madura: la Extinción está disponible', 'The dish is ripe: Extinction is available'),
  dishSaturated: t('La placa está saturada: el Sembrador no encuentra hueco', 'The dish is saturated: the Auto-seeder finds no room'),
  newBehavior: (b: Behavior) => t(`Comportamiento nuevo: ${BEHAVIOR_NAMES[b].es}`, `New behaviour: ${BEHAVIOR_NAMES[b].en}`),
  pipetteReady: t('Pipeta de emergencia lista: siembra gratis', 'Emergency pipette ready: free seed'),
  freePrintReady: t('Archivo: Impresión gratis lista', 'Archive: free Print ready'),
  invalidImport: t('Partida no válida', 'Invalid save'),
  extinctionRequirement: (need: number, have: number) =>
    t(`Gana ${f(need)} Esencia en esta Era (llevas ${f(have)})`, `Earn ${f(need)} Essence this Era (you have ${f(have)})`),
  extinctionGain: (g: number) => t(`Extinguir ahora da ${f(g)} Genoma`, `Extinguishing now gives ${f(g)} Genome`),
  specimen: (n: number) => t(`Espécimen ${n}`, `Specimen ${n}`),
  variantSuffix: t(' var.', ' var.'),
  offline: (amount: number) => t(`Mientras no estabas: +${f(amount)} Esencia`, `While you were away: +${f(amount)} Essence`),
};
