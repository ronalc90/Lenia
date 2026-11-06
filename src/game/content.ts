/**
 * Player-facing text (Spanish + English). Numbers live in balance.ts; text that needs a
 * number receives it as an argument.
 */
import type { Behavior, Text } from '../core/types';
import { DISH_BONUS } from './balance';
import { formatNumber as f, formatPct as pct, multText } from './format';

const t = (es: string, en: string): Text => ({ es, en });

// ───────────────────────────── Behaviours ──────────────────────────

/** The six ways of moving, one word each (CLARIDAD J-147, glossary §2.1). */
export const BEHAVIOR_NAMES: Record<Behavior, Text> = {
  still: t('quieta', 'still'),
  pulsing: t('late', 'pulses'),
  swimmer: t('nadadora', 'swimmer'),
  spinner: t('gira', 'spins'),
  divider: t('se divide', 'splits'),
  colony: t('colonia', 'colony'),
};

// ───────────────────────────── Upgrades ────────────────────────────
// PHASE-2B-REMOVE (classic loop): UPGRADE_TEXT, the *_LEVEL_TEXT tables, effectText and GENOME_TEXT
// are the Laboratorio, Calibrar and Genoma of the classic loop (CLARIDAD B-09, B-10). The sessions
// cycle words its upgrades in treeText.ts; these go with the classic panels in Phase 2B.

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
    desc: t('Mejor medio de cultivo: más luz de todo lo que vive.', 'A richer medium: more glow from everything alive.'),
    hint: t('Alcanza 10 luz/s', 'Reach 10 glow/s'),
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
const plural = (n: string, one: string, many: string): string => (n.trim() === '1' ? one : many);
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
      // QA1 #13: "1 hueco", "3 huecos" — the noun follows the last number shown.
      return next !== null
        ? t(
            `${v(level)} → ${v(next)} ${plural(v(next), 'hueco', 'huecos')}, +${pct(level * DISH_BONUS)} → +${pct(next * DISH_BONUS)}`,
            `${v(level)} → ${v(next)} ${plural(v(next), 'slot', 'slots')}, +${pct(level * DISH_BONUS)} → +${pct(next * DISH_BONUS)}`,
          )
        : t(`${v(level)} ${plural(v(level), 'hueco', 'huecos')}, +${pct(level * DISH_BONUS)}`, `${v(level)} ${plural(v(level), 'slot', 'slots')}, +${pct(level * DISH_BONUS)}`);
    case 'marker':
      return level ? t('Marcas activas', 'Markers on') : t('Sin marcas → marcas de color', 'No markers → colour markers');
    default:
      return arrow(same(v(level)), next !== null ? same(v(next)) : null);
  }
}

// ───────────────────────────── Genome ──────────────────────────────

export const GENOME_TEXT: Record<string, { name: Text; desc: Text }> = {
  // Kid-simple copy (QA3 F8, QA2 §5): what it does for you, no "kernel" or "peaks".
  doubleRings: {
    name: t('Anillos dobles', 'Double rings'),
    desc: t('Criaturas de doble anillo: más grandes y más raras. Elige el anillo en Calibrar.', 'Double-ring creatures: bigger and rarer. Pick the ring in Calibrate.'),
  },
  tripleRings: {
    name: t('Anillos triples', 'Triple rings'),
    desc: t('Criaturas de triple anillo, como la gran Hydrogeminium.', 'Triple-ring creatures, like the great Hydrogeminium.'),
  },
  secondChannel: {
    name: t('Segundo canal', 'Second channel'),
    desc: t('Dos clases de materia en la misma placa. Próximamente.', 'Two kinds of matter on one dish. Coming soon.'),
  },
  flow: {
    name: t('Flujo', 'Flow'),
    desc: t('Las criaturas compiten por la comida. Próximamente.', 'Creatures compete for food. Coming soon.'),
  },
  essenceStart: {
    name: t('Arranque con luz', 'Glow head start'),
    desc: t('Cada noche nueva empieza con luz guardada: 500 por cada Era.', 'Every new night starts with saved glow: 500 per Era.'),
  },
  dropperMemory: {
    name: t('Memoria del Gotero', 'Dropper memory'),
    desc: t('El Gotero recuerda: empiezas casi con el mejor que tuviste.', 'The Dropper remembers: you start with almost your best one.'),
  },
  regimesPersist: {
    name: t('Recetas guardadas', 'Kept recipes'),
    desc: t('Tus recetas de Calibrar no se borran al empezar de nuevo.', 'Your Calibrate recipes are not erased when you start over.'),
  },
  persistentSeeder: {
    name: t('Sembrador fiel', 'Faithful auto-seeder'),
    desc: t('Cada noche empieza con el Sembrador automático ya trabajando.', 'Every night starts with the Auto-seeder already working.'),
  },
  mutations: {
    name: t('Mutaciones', 'Mutations'),
    desc: t('A veces una copia sale distinta: ¡una criatura nueva "var."!', 'Sometimes a copy comes out different: a new "var." creature!'),
  },
  symbiosis: {
    name: t('Simbiosis', 'Symbiosis'),
    desc: t('Dos criaturas distintas juntas se ayudan: ambas dan ×1,5.', 'Two different creatures side by side help each other: ×1.5 each.'),
  },
  predation: {
    name: t('Depredación', 'Predation'),
    desc: t('Unas criaturas comen a otras. Próximamente.', 'Some creatures eat others. Coming soon.'),
  },
};

// ───────────────────────────── Journal (Bitácora) ──────────────────

/** Journal entries in unlock order. [doc §3] */
export const JOURNAL: { id: string; text: Text }[] = [
  { id: 'firstSeed', text: t('Una semilla de luz. La dejo reposar. Nada debería pasar.', 'A seed of light. I let it rest. Nothing should happen.') },
  { id: 'firstDeath', text: t('Se apagó en segundos. Demasiado poco, demasiado disperso.', 'It faded in seconds. Too little, too scattered.') },
  { id: 'firstExplosion', text: t('Lo contrario: lo llenó todo y dejó de ser nada. La estructura es lo que cuenta.', 'The opposite: it filled everything and stopped being anything. Structure is what counts.') },
  { id: 'firstStable', text: t('Algo se quedó. Tiene borde, tiene forma. Le pongo nombre.', 'Something stayed. It has an edge, it has a shape. I give it a name.') },
  { id: 'firstSwimmer', text: t('Se mueve en línea recta y no se deshace. Hoy no voy a dormir.', 'It moves in a straight line and does not fall apart. I will not sleep tonight.') },
  { id: 'firstSpinner', text: t('Esta gira. No sé qué busca, pero lo busca en círculos.', 'This one turns. I do not know what it looks for, but it looks in circles.') },
  { id: 'firstGolden', text: t('Un destello cruzó la placa. No sé qué era, pero dejó algo.', 'A spark crossed the dish. I do not know what it was, but it left something.') },
  { id: 'firstDivision', text: t('Una se volvió dos. Ya no sé si las descubro o si me descubren.', 'One became two. I no longer know if I discover them or they discover me.') },
  // Classic loop (Calibrador); the sessions loop writes `firstWorld` instead.
  { id: 'calibrator', text: t('Si cambio las reglas un poco, el mundo cambia. Tengo que anotarlo todo.', 'If I change the rules a little, the world changes. I must write it all down.') },
  { id: 'firstWorld', text: t('Abrí otro mundo. Otras reglas, otras criaturas. Tengo que anotarlo todo.', 'I opened another world. Other rules, other creatures. I must write it all down.') },
  { id: 'species10', text: t('Diez. Empiezan a parecerse a una familia, no a accidentes.', 'Ten. They start to look like a family, not accidents.') },
  { id: 'extinctionNear', text: t('La placa está madura. Quizá sea hora de empezar de cero con lo aprendido.', 'The dish is ripe. Maybe it is time to start over with what I learned.') },
  { id: 'firstExtinction', text: t('Lavo la placa. Me cuesta. Pero sé qué funcionó, y eso se queda conmigo.', 'I wash the dish. It is hard. But I know what worked, and that stays with me.') },
  // Sessions loop: the night replaces the Extinction (CLARIDAD J-47).
  { id: 'nightReady', text: t('La placa está madura. La noche puede avanzar.', 'The dish is ripe. The night can move on.') },
  { id: 'firstNight', text: t('Empieza otra noche. La placa se lava; lo aprendido se queda conmigo.', 'Another night begins. The dish is washed; what I learned stays with me.') },
  { id: 'era2', text: t('Nueva placa, mismos ojos. Esta vez siembro con intención.', 'New dish, same eyes. This time I sow with intent.') },
  { id: 'species50', text: t('Dejé de contar accidentes. Ahora cuento vidas.', 'I stopped counting accidents. Now I count lives.') },
];

// ───────────────────────────── Achievements ────────────────────────

export const ACHIEVEMENT_TEXT: Record<string, { name: Text; desc: Text }> = {
  firstSeed: { name: t('Primera semilla', 'First seed'), desc: t('Siembra por primera vez.', 'Sow for the first time.') },
  firstLife: { name: t('Algo se quedó', 'Something stayed'), desc: t('Consigue una criatura viva.', 'Get a living creature.') },
  seeds100: { name: t('Mano firme', 'Steady hand'), desc: t('Siembra 100 veces.', 'Sow 100 times.') },
  seeds1000: { name: t('Lluvia constante', 'Steady rain'), desc: t('Siembra 1 000 veces.', 'Sow 1,000 times.') },
  species3: { name: t('Naturalista', 'Naturalist'), desc: t('Descubre 3 especies.', 'Discover 3 species.') },
  species10: { name: t('Coleccionista', 'Collector'), desc: t('Descubre 10 especies.', 'Discover 10 species.') },
  species20: { name: t('Mi propia familia', 'A family of my own'), desc: t('Descubre 20 especies.', 'Discover 20 species.') },
  swimmer: { name: t('Nadadora', 'Swimmer'), desc: t('Mira una criatura que nada.', 'See a creature that swims.') },
  spinner: { name: t('Remolino', 'Whirl'), desc: t('Mira una criatura que gira.', 'See a creature that spins.') },
  pulsing: { name: t('Latido', 'Heartbeat'), desc: t('Mira una criatura que late.', 'See a creature that pulses.') },
  divider: { name: t('Una se hace dos', 'One becomes two'), desc: t('Mira una criatura que se divide.', 'See a creature that splits.') },
  colony: { name: t('Colonia', 'Colony'), desc: t('Junta tres iguales: una colonia.', 'Gather three alike: a colony.') },
  allBehaviors: { name: t('Observadora', 'Watcher'), desc: t('Mira todas las maneras de moverse.', 'See every way of moving.') },
  eps10: { name: t('Productiva', 'Productive'), desc: t('Haz 10 de luz por segundo.', 'Make 10 glow per second.') },
  eps100: { name: t('Floreciente', 'Flourishing'), desc: t('Haz 100 de luz por segundo.', 'Make 100 glow per second.') },
  eps1000: { name: t('Jardín de luz', 'Garden of light'), desc: t('Haz 1 000 de luz por segundo.', 'Make 1,000 glow per second.') },
  essence1e4: { name: t('Diez mil', 'Ten thousand'), desc: t('Haz 10 000 de luz en total.', 'Make 10,000 glow in total.') },
  essence1e6: { name: t('Millonaria', 'Millionaire'), desc: t('Haz 1 000 000 de luz en total.', 'Make 1,000,000 glow in total.') },
  golden1: { name: t('Destello', 'Spark'), desc: t('Atrapa un Destello.', 'Catch a Spark.') },
  golden10: { name: t('Cazadora de luz', 'Light catcher'), desc: t('Atrapa 10 Destellos.', 'Catch 10 Sparks.') },
  golden50: { name: t('Polilla', 'Moth'), desc: t('Atrapa 50 Destellos.', 'Catch 50 Sparks.') },
  rare: { name: t('Rareza', 'Rarity'), desc: t('Descubre una especie rara.', 'Discover a rare species.') },
  veryRare: { name: t('Joya', 'Jewel'), desc: t('Descubre una especie muy rara.', 'Discover a very rare species.') },
  crowd5: { name: t('Placa viva', 'Living dish'), desc: t('Ten 5 criaturas vivas a la vez.', 'Have 5 living creatures at once.') },
  crowd10: { name: t('Bullicio', 'Bustle'), desc: t('Ten 10 criaturas vivas a la vez.', 'Have 10 living creatures at once.') },
  printer: { name: t('Copiona', 'Copycat'), desc: t('Haz una copia con la Copiadora.', 'Make a copy with the Copier.') },
  tinkerer: { name: t('Viajera', 'Traveller'), desc: t('Visita 3 mundos.', 'Visit 3 worlds.') },
  regime: { name: t('Archivista', 'Archivist'), desc: t('Encuentra todas las especies de un mundo.', 'Find every species of one world.') },
  extinction: { name: t('Primera noche', 'First night'), desc: t('Empieza una noche nueva.', 'Start a new night.') },
  heritage: { name: t('Jardinera', 'Gardener'), desc: t('Compra 10 mejoras del Árbol.', 'Buy 10 upgrades in the Tree.') },
  variant: { name: t('Variación', 'Variation'), desc: t('Encuentra una copia que salió distinta.', 'Find a copy that came out different.') },
  symbiosis: { name: t('Amistad', 'Friendship'), desc: t('Junta dos especies amigas.', 'Put two friend species together.') },
  returned: { name: t('De vuelta', 'Back again'), desc: t('Vuelve a jugar otro día.', 'Come back to play another day.') },
  hour: { name: t('Paciencia', 'Patience'), desc: t('Juega una hora.', 'Play for an hour.') },
};

/**
 * PHASE-2B-REMOVE: the classic loop's wording of the achievements whose goal differs there
 * (Impresión, Calibrador, regímenes, Genoma). Deleted with the classic loop.
 */
export const CLASSIC_ACHIEVEMENT_TEXT: Record<string, { name: Text; desc: Text }> = {
  printer: { name: t('Impresora', 'Printer'), desc: t('Imprime una especie.', 'Print a species.') },
  tinkerer: { name: t('Ajuste fino', 'Fine tuning'), desc: t('Cambia la calibración.', 'Change the calibration.') },
  regime: { name: t('Archivista', 'Archivist'), desc: t('Guarda un régimen.', 'Save a regime.') },
  heritage: { name: t('Herencia', 'Heritage'), desc: t('Compra un nodo del Genoma.', 'Buy a Genome node.') },
};

export const achievementReward = (bonus: number): Text => t(`+${pct(bonus)} de luz`, `+${pct(bonus)} glow`);

// ───────────────────────────── Objectives ──────────────────────────
// The objective line is replaced by the Encargos (main.ts); OBJECTIVE_TEXT is the classic wording
// (CLARIDAD B-11, PHASE-2B-REMOVE), SESSION_OBJECTIVE_TEXT the sessions cycle's.

/** Objective copy, kid-simple (QA2 §5.1). Ids are stable (balance.OBJECTIVES, saves). */
const OBJECTIVE_TEXT: Record<string, Text> = {
  seed: t('Toca aquí para crear vida', 'Tap to make life'),
  stable: t('Cría una criatura viva', 'Grow a living creature'),
  look: t('Mira tu criatura en el Bestiario', 'Look at your creature in the Bestiary'),
  dropper: t('Compra el Gotero en el Laboratorio', 'Buy the Dropper in the Lab'),
  two: t('Ten 2 criaturas vivas', 'Have 2 living creatures'),
  seeder: t('Compra el Sembrador automático', 'Buy the Auto-seeder'),
  eps3: t('Haz 3 de luz por segundo', 'Make 3 glow per second'),
  calib: t('Compra el Calibrador', 'Buy the Calibrator'),
  move: t('Mueve un mando en Calibrar', 'Move a knob in Calibrate'),
  species3: t('Descubre 3 criaturas distintas', 'Discover 3 different creatures'),
  golden: t('Atrapa un Destello dorado', 'Catch a golden Spark'),
  behaviors2: t('Mira 2 formas de moverse', 'See 2 ways of moving'),
  eps10: t('Haz 10 de luz por segundo', 'Make 10 glow per second'),
  culture: t('Compra Cultivo', 'Buy Culture'),
  print: t('Planta otra igual desde el Bestiario', 'Plant another one from the Bestiary'),
  species6: t('Descubre 6 criaturas distintas', 'Discover 6 different creatures'),
  eps50: t('Haz 50 de luz por segundo', 'Make 50 glow per second'),
  dish: t('Compra la Placa', 'Buy the Dish'),
  era100k: t('Haz 100 000 de luz en esta noche', 'Make 100,000 glow this night'),
  extinct: t('Empieza una noche nueva (Extinción)', 'Start a new night (Extinction)'),
};

/** The same steps in the sessions cycle (docs/CICLO.md): worlds instead of Calibrar, nights instead of Extinción. */
export const SESSION_OBJECTIVE_TEXT: Record<string, Text> = {
  calib: t('Abre el Mundo 2 en el Árbol', 'Open World 2 in the Tree'),
  move: t('Juega una sesión en el Mundo 2', 'Play a session in World 2'),
  seeder: t('Compra Más tiempo en el Árbol', 'Buy More time in the Tree'),
  culture: t('Compra Cultivo en el Árbol', 'Buy Culture in the Tree'),
  dropper: t('Compra el Gotero en el Árbol', 'Buy the Dropper in the Tree'),
  dish: t('Compra «Placa más grande» en el Árbol', 'Buy “Bigger dish” in the Tree'),
  print: t('Haz una copia desde el Bestiario', 'Make a copy from the Bestiary'),
  // The same step as the Encargo `era100k` (J-40), which the player sees; both count the session's Esencia.
  era100k: t('Haz 2 000 de luz en una sesión', 'Make 2,000 glow in one session'),
  extinct: t('Empieza una noche nueva en el Árbol', 'Start a new night in the Tree'),
};

export function objectiveText(id: string, current: number, target: number, sessions = false): Text {
  const base = (sessions ? SESSION_OBJECTIVE_TEXT[id] : undefined) ?? OBJECTIVE_TEXT[id] ?? t(id, id);
  if (target <= 1) return base;
  const c = Math.min(current, target);
  return t(`${base.es} (${f(Math.floor(c))}/${f(target)})`, `${base.en} (${f(Math.floor(c))}/${f(target)})`);
}

// ───────────────────────────── Golden rewards & misc ───────────────

/**
 * TEXT keys of the classic loop only (its Destello rewards): never shown in the sessions cycle. The
 * retired systems' messages (Extinción, Genoma, pestañas, Pipeta, ausencia) are gone (CLARIDAD B-11).
 * The jargon guard skips these.
 */
export const CLASSIC_ONLY_TEXT: readonly string[] = [
  'bloom',
  'bloomReward',
  'lumpReward',
];

/** Why some Luz entered the wallet without a drop (bus 'luzGift', ADR-030). */
export type LuzGiftReason = 'spark' | 'encargo' | 'firstSeed' | 'firstCreature' | 'goal';

export const TEXT = {
  bloom: t('Floración', 'Bloom'),
  bloomReward: (mult: number, secs: number) => t(`¡Floración! ×${mult} producción durante ${secs} s`, `Bloom! ×${mult} production for ${secs} s`),
  lumpReward: (amount: number) => t(`¡+${f(amount)} de luz!`, `+${f(amount)} glow!`),
  sporeReward: (n: number) => t(`¡Lluvia de semillas! ${n} gratis`, `Seed shower! ${n} free`),
  mutagenReward: (n: number) => t(`¡Semillas mágicas! Las próximas ${n} siempre viven`, `Magic seeds! Your next ${n} always live`),
  objectiveDone: (reward: number) =>
    reward > 0 ? t(`Objetivo cumplido: +${f(reward)} de luz`, `Objective complete: +${f(reward)} glow`) : t('Objetivo cumplido', 'Objective complete'),
  dishSaturated: t('Placa llena: el Sembrador espera a que haya sitio.', 'Dish full: the Auto-seeder waits for room.'),
  newBehavior: (b: Behavior) => t(`¡Nueva manera de moverse: ${BEHAVIOR_NAMES[b].es}!`, `New way of moving: ${BEHAVIOR_NAMES[b].en}!`),
  freePrintReady: t('Archivo: ¡copia gratis lista!', 'Archive: free copy ready!'),
  invalidImport: t('Partida no válida', 'Invalid save'),
  seedTooClose: t('Muy cerca: se fundirían. ¡Más lejos!', 'Too close: they would melt. Further away!'),
  seedGrowing: t('Espera: ya hay semillas naciendo. Mira cómo crecen.', 'Wait: some seeds are still hatching. Watch them grow.'),
  dishAutoCleaned: t('La placa se desbordó y la limpié. ¡Siembra separado!', 'The dish overflowed and I cleaned it. Sow apart!'),
  /** Registration number shown under a species name (QA2 §5.3: "Criatura N", not "Espécimen"). */
  specimen: (n: number) => t(`Criatura ${n}`, `Creature ${n}`),
  multCollection: t('Colección', 'Collection'),
  multBehaviors: t('Maneras de moverse vistas', 'Ways of moving seen'),
  multAchievements: t('Logros', 'Achievements'),
  variantSuffix: t(' (sorpresa)', ' (surprise)'),
  // ── Sessions cycle (docs/CICLO.md) ──
  /** The Spark's gift, short enough for 360 px (QA-CLARIDAD #31): «¡Destello! +60 luz». */
  sparkGift: (amount: number) => t(`¡Destello! +${f(amount)} luz`, `Spark! +${f(amount)} glow`),
  sparkSure: (n: number) =>
    n === 1 ? t('…y tu próxima semilla vivirá seguro', '…and your next seed will surely live') : t(`…y tus próximas ${n} semillas vivirán seguro`, `…and your next ${n} seeds will surely live`),
  /**
   * A tap on a full dish (refused for free). Owner: room is the limit, never a higher price. Names
   * the first upgrade of the Placa route, which exists from session 1 (CLARIDAD J-160/J-175, P0-7).
   */
  dishFull: (n: number) =>
    t(`¡Placa llena! Caben ${n}. Compra «Placa más grande» en el Árbol.`, `Dish full! Room for ${n}. Buy “Bigger dish” in the Tree.`),
  /** Nutrientes (was Abono, ADR-030): the in-session production boost. */
  boost: t('Nutrientes', 'Nutrients'),
  /** `pct`: what all the Nutrientes bought today add, in whole percent («+25 %», a gain in green). */
  /**
   * Bought: what it gives, and what the next one costs and why (QA-CLARIDAD-2 C11: «10, 12, 24, 49, 97» without a
   * word). `growth`: the price rule in words («el doble», treeText.growthWord of BOOST_GROWTH).
   */
  boostBought: (pct: number, next?: number, growth?: Text) =>
    next !== undefined && growth
      ? t(`¡Nutrientes! +${pct} % de luz hasta el final. El siguiente cuesta ${growth.es}: ${f(next)}.`, `Nutrients! +${pct}% glow until the end. The next one costs ${growth.en}: ${f(next)}.`)
      : t(`¡Nutrientes! +${pct} % de luz hasta el final.`, `Nutrients! +${pct}% glow until the end.`),
  multTree: t('Árbol (Vida)', 'Tree (Life)'),
  multWorld: t('Mundo', 'World'),
  multEcosystem: t('Placa variada', 'Mixed dish'),
  multSprint: t('Recta final', 'Final stretch'),
  nightRequirement: (night: number, sessions: number, species: number) =>
    t(
      `Noche ${night}: ${sessions} ${sessions === 1 ? 'sesión' : 'sesiones'} y ${species} ${species === 1 ? 'especie' : 'especies'}`,
      `Night ${night}: ${sessions} ${sessions === 1 ? 'session' : 'sessions'} and ${species} species`,
    ),
  /** A copy of a species that does not live in this session's world would melt at once. */
  printOtherWorld: (n: number) => t(`Esta especie vive en el Mundo ${n}: cópiala allí.`, `This species lives in World ${n}: copy it there.`),
  nightReady: (night: number) => t(`¡La Noche ${night} está lista! Ábrela en el centro del Árbol.`, `Night ${night} is ready! Open it at the centre of the Tree.`),
  // ── ADR-030 (docs/CLARIDAD2.md §2.5, §2.15, §8.2): every Luz with its reason, every accident with its cause ──
  /** The reason next to the counter when Luz arrives without a drop: "+5 · primera semilla" (QA-CLARIDAD #5). */
  gift: {
    spark: t('Destello', 'Spark'),
    encargo: t('encargo', 'request'),
    firstSeed: t('primera semilla', 'first seed'),
    firstCreature: t('primera criatura', 'first creature'),
    // «meta cumplida» said nothing (QA-CLARIDAD-2 C9): these are the session's requests, like an Encargo's.
    goal: t('encargo cumplido', 'request done'),
  } as Record<LuzGiftReason, Text>,
  giftLine: (amount: number, reason: Text) => t(`+${f(amount)} · ${reason.es}`, `+${f(amount)} · ${reason.en}`),
  /** Several requests' light at once, one chip («+189 · 7 encargos cumplidos»). */
  giftMany: (n: number) => t(`${n} encargos cumplidos`, `${n} requests done`),
  /** A seed that never became stable went dark (game/contact.ts deathCause), a 2 s label in place, grey fade. */
  deathGlass: t('Se apagó: muy pegada al cristal', 'Went dark: too close to the glass'),
  deathCrowd: t('Se apagó: muy cerca de otra', 'Went dark: too close to another'),
  deathFaded: t('Se apagó: no prendió. ¡Prueba otra!', 'Went dark: didn’t take. Try another!'),
  /** A living creature hit the glass (a rare miss of the deflector): its drop stays on the dish. */
  deathGlassAlive: t('Chocó con el cristal y se apagó. Su luz sigue ahí.', 'It hit the glass and went dark. Its glow is still there.'),
  /**
   * A living creature that went dark in open agar, or lost its shape on its own (QA-CLARIDAD-2 C7: three
   * Nadadoras of a run vanished without a word). Its drop stays on the dish.
   */
  deathLost: t('Se apagó: perdió la forma. Su luz sigue ahí.', 'Went dark: lost its shape. Its glow is still there.'),
  shapeLost: t('Se deshizo: sin forma no da luz', 'Fell apart: no shape, no glow'),
  /** A fusion seen again (the first one gets its card): a 2 s label in place. */
  merged: t('Se juntaron: sin forma no da luz', 'Merged: no shape, no glow'),
  /** The warning before two creatures touch (GameView.dangers); `contactSteer` when one is a swimmer. */
  contactSoon: t('¡Cuidado! Se van a tocar', 'Careful! They’re about to touch'),
  contactSteer: t('¡Cuidado! Arrástrala para desviarla', 'Careful! Drag it to steer it away'),
  // ── ADR-031 (docs/MECANICAS.md §10.4): the tap is a pulse, sowing is a button, every loss leaves something ──
  // Numbers arrive as numbers (they are formatted here for each language); multipliers too («×1,25» / "×1.25").
  /** The Sembrar button (bottom bar): its label and what the next seed costs. */
  sow: t('Sembrar', 'Sow'),
  sowFree: t('Gratis', 'Free'),
  sowCost: (n: number) => t(`${f(n)} de luz`, `${f(n)} glow`),
  /** The dish holds all it can (`n` = its room): the button greys and says so. */
  sowFull: (n: number) => t(`Llena (${n} de ${n})`, `Full (${n} of ${n})`),
  /** A seed dragged onto a bad spot snapped to the nearest safe one (once a run, never a scolding). */
  sowSnap: t('Aquí cabe mejor', 'There’s more room here'),
  /** After SEED_FAIL_PITY failed seeds in a row: the gold ring on the button. */
  sowSure: t('¡Esta prende seguro!', 'This one will surely take!'),
  /** Session 1 tutorial (VELA, ≤ 12 words each; MECANICAS §6.1 steps 2, 5, 6 and §6.2). */
  tutSow: t('Toca la semilla para sembrar.', 'Tap the seed to sow it.'),
  tutPulse: t('Tócala: brilla y te da luz.', 'Tap it: it glows and gives you glow.'),
  tutStreak: t('¡Más! Toques seguidos dan más luz.', 'More! Taps in a row give more glow.'),
  tutDrag: t('También puedes arrastrarla.', 'You can drag it too.'),
  /** The streak chip next to the counter (`m` = GameView.streak.mult), its full state, and the line under the counter. */
  streak: (m: number) => {
    const x = multText(m);
    return t(`Racha ${x.es}`, `Streak ${x.en}`);
  },
  streakMax: t('¡Racha máxima!', 'Max streak!'),
  streakLine: (m: number) => {
    const x = multText(m);
    return t(`${x.es} por tu racha`, `${x.en} from your streak`);
  },
  /** The every-N-th hit (`n` = the Luz it paid). */
  chispazo: (n: number) => t(`¡CHISPAZO! +${f(n)}`, `FLASH! +${f(n)}`),
  /** The first Chispazo ever, a 2 s label (`every` = GameView.streak.every: 10, 8 or 6 with Chispazo seguido). */
  chispazoHint: (every: number) => t(`Cada ${every} toques seguidos, ¡un Chispazo!`, `Every ${every} taps in a row: a Flash!`),
  /** Glimmers (from session 2): the start card's «Nuevo» line, and the first time they fly. */
  motesNew: t('Nuevo: un Chispazo suelta chispitas. ¡Atrápalas!', 'New: a Flash throws out glimmers. Catch them!'),
  motesCatch: t('¡Atrápalas!', 'Catch them!'),
  /** A seed that never took gave its price back (bus 'seedRefund'); `refundFree` when it was a free seed. */
  refund: (n: number) => t(`No prendió · +${f(n)} de vuelta`, `Didn’t take · +${f(n)} back`),
  refundFree: t('No prendió · semilla gratis de vuelta', 'Didn’t take · free seed back'),
  /** A forming seed losing matter (only if the measured rule is ≥ 85 % right, MECANICAS §7.3): the amber arc. */
  struggling: t('Le cuesta…', 'Struggling…'),
  /** A warned contact the player can act on (GameView.dangers[].actionable); `saved` when it passed (`n` = hits added). */
  contactAct: t('¡Van a chocar! Arrastra una', 'About to bump! Drag one away'),
  saved: (n: number) => t(`¡Salvada! Racha +${n}`, `Saved! Streak +${n}`),
  /** What a living creature's death left (bus 'deathBurst'), a 2 s label in place. */
  mergedLeft: t('Se juntaron · su luz quedó aquí', 'They merged · their glow stayed here'),
  glassLeft: t('Chocó con el cristal · su luz quedó aquí', 'Hit the glass · its glow stayed here'),
  lostLeft: t('Perdió la forma · su luz quedó aquí', 'Lost its shape · its glow stayed here'),
  /** A shapeless blob (exploded matter): the amber outline, and the lysis when it acts. */
  blobWatched: t('Mancha sin forma · VELA la vigila', 'Shapeless blob · VELA is watching it'),
  blobDissolved: t('VELA disolvió una mancha que crecía sin parar', 'VELA dissolved a blob that kept growing'),
  /** The first death of a cause ever (bus 'accidentLearned', `n` = FIRST_ACCIDENT_DATOS); `learnedSeed` for a seed. */
  learned: (n: number) => t(`Aprendiste por qué pasa: +${n} ${n === 1 ? 'Dato' : 'Datos'}`, `Now you know why: +${n} Data`),
  learnedSeed: (n: number) => t(`Aprendiste: no todas prenden. +${n} ${n === 1 ? 'Dato' : 'Datos'}`, `You learned: not every seed takes. +${n} Data`),
  /** The second line of the first-fusion card («¡Se juntaron!»). */
  mergedCard2: t('Su luz quedó en la placa: ¡recógela!', 'Their glow stayed on the dish: collect it!'),
  /** Settings, accessibility (Settings.easyPulse, MECANICAS §3.5). */
  settingEasyPulse: t('Pulso fácil (mantén el dedo)', 'Easy pulse (hold your finger)'),
};
