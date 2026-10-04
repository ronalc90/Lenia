/**
 * Secret definitions, cosmetic colormaps and every tuning constant of the secrets module.
 * SPOILERS. Full table with hint ladders: docs/SECRETS.md.
 *
 * Rules of the module (see docs/SECRETS.md §Reglas):
 *  - Rewards are cosmetic or tiny: +1 % Essence per secret, capped at +10 % (BONUS_CAP).
 *    Never a progression gate, never sold.
 *  - Effects decorate the dish; nothing here changes the simulation (pillar 1).
 *  - Player-facing text in es + en; journal lines in the terse first-person voice of GDD §3,
 *    without gendered self-reference.
 */
import type { Text } from '../core/types';
import type { Colormap, CosmeticId, SecretCategory, SecretDef, SecretId } from './types';

const t = (es: string, en: string): Text => ({ es, en });

// ───────────────────────────── Tuning constants ─────────────────────────────
// Integrator: these are the secrets' balance numbers. They live here (not in game/balance.ts)
// because the module is self-contained; move them if the reviewer prefers.

/** +X to M_global per secret found. [owner brief: "+1% essence"] */
export const BONUS_PER_SECRET = 0.01;
/** Total secrets bonus never exceeds this. [owner brief: capped at +10 %] */
export const BONUS_CAP = 0.1;
/** Secrets needed before the "Laboratorio del sótano" appears in Settings. [brief] */
export const BASEMENT_UNLOCK = 10;
/** Secrets needed for the free "Abisal" colormap. [design] */
export const ABYSS_UNLOCK = 5;
/** View poll period (ms). [brief: ~1 s] */
export const POLL_MS = 1000;
/** Longest gap between polls that still counts as active play (s); hidden tabs do not count. */
export const MAX_POLL_DT = 5;

/** Manual seeds for "La respuesta". [Douglas Adams nod] */
export const ANSWER_SEEDS = 42;
/** Explosions within MAXIMIZER_WINDOW_S for "Maximizadora". [design] */
export const MAXIMIZER_EXPLOSIONS = 10;
export const MAXIMIZER_WINDOW_S = 120;
/**
 * Golden sparks caught in a row, none missed. [design] The brief proposed "3 in 60 s", which the
 * golden timing (one every 90–240 s, GDD §23.1) makes impossible; a no-miss streak rewards the
 * same attentiveness. 7 is out of reach in the first ~11 minutes even with the shortest gaps.
 */
export const GOLDEN_STREAK = 7;
/** Logo taps, each within LOGO_GAP_MS of the previous. */
export const LOGO_TAPS = 7;
export const LOGO_GAP_MS = 800;
/** Essence counter long press. [brief: 5 s] */
export const LONG_PRESS_MS = 5000;
/** Same creature alive this long (active play, s). [brief: 30 min] */
export const OLD_FRIEND_S = 30 * 60;
/** Creatures for "Siete de siete". [brief] */
export const SEVEN = 7;
/** Empty dish after having life (active play, s). [brief: 5 min] */
export const SILENCE_S = 5 * 60;
/** Paused this long (wall clock, s). [brief: 10 min] */
export const AFK_S = 10 * 60;
/** Essence palindromes count from this many digits (≈0.1 % chance per poll; never early). */
export const PALINDROME_MIN_DIGITS = 6;
/** The exact number of the brief. */
export const EXACT_ESSENCE = 1_234_567;
/** Local hours [from, to) that count as "night" for the cryptid. [brief: 00:00–04:00] */
export const NIGHT_HOURS: readonly [number, number] = [0, 4];
/** Aurora: rare random dish event. Mean wait while eligible (s); first one also needs play time. */
export const AURORA_MIN_PLAYTIME_S = 20 * 60;
export const AURORA_MIN_STABLE = 3;
export const AURORA_MEAN_S = 45 * 60;
/** After the secret is found, auroras still happen (cosmetic), half as often. */
export const AURORA_REPEAT_MEAN_S = 90 * 60;
export const AURORA_DURATION_S = 14;
/**
 * Orion's belt: three stable creatures in a row, evenly spaced. Tolerances keep it rare and
 * real (the creatures do it themselves); it must hold for ORION_POLLS consecutive polls.
 */
export const ORION_MIN_PLAYTIME_S = 10 * 60;
export const ORION_SPACING: readonly [number, number] = [12, 70];
/** Max distance of the middle creature from the line, as a fraction of the span (+1 cell). */
export const ORION_COLLINEAR = 0.035;
/** Max ratio between the two gaps. */
export const ORION_EVEN = 1.15;
export const ORION_POLLS = 2;
/** Once found, the belt is drawn again (cosmetic) at most this often (s). */
export const ORION_REPEAT_S = 15 * 60;
/** Dates (local, month 1–12) for "Cumpleaños": Bioluma's first commit and Lenia's arXiv paper. */
export const BIRTHDAYS: readonly { month: number; day: number; kind: 'bioluma' | 'lenia' }[] = [
  { month: 10, day: 4, kind: 'bioluma' }, // first commit of this repo, 2026-10-04
  { month: 12, day: 13, kind: 'lenia' }, // Chan, "Lenia — Biology of Artificial Life", arXiv:1812.05433, 2018-12-13
];
/** Desktop Konami code (KeyboardEvent.key, case-insensitive). */
export const KONAMI_KEYS: readonly string[] = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
/** Touch Konami: eight straight swipes on the dish (brush or eraser), within this time (ms). */
export const KONAMI_SWIPES: readonly string[] = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right'];
export const KONAMI_SWIPE_WINDOW_MS = 20_000;
/** Gestures must span at least this many grid cells (bounding-box diagonal). */
export const GESTURE_MIN_CELLS = 14;
/** Names that trigger homages when given to a species (normalised: lowercase, no accents). */
export const CHAN_NAMES: readonly string[] = ['chan', 'bert', 'bert chan', 'bert wang-chak chan', 'wang-chak chan', 'lenia'];
export const CONWAY_NAMES: readonly string[] = ['conway', 'john conway', 'john horton conway', 'life', 'game of life', 'juego de la vida', 'vida', 'b3/s23'];

// ───────────────────────────── Categories ─────────────────────────────

export const CATEGORY_TEXT: Record<SecretCategory, Text> = {
  species: t('Especies ocultas', 'Hidden species'),
  homage: t('Homenajes', 'Homages'),
  gesture: t('Trazos', 'Strokes'),
  touch: t('Toques', 'Touches'),
  patience: t('Paciencia', 'Patience'),
  sky: t('Cielo', 'Sky'),
  meta: t('Sótano', 'Basement'),
};

// ───────────────────────────── The secrets ─────────────────────────────

export const SECRET_DEFS: readonly SecretDef[] = [
  // ── Hidden species ──
  {
    id: 'ignis',
    category: 'species',
    name: t('Llama fría', 'Cold flame'),
    latin: 'Orbium unicaudatus ignis',
    code: 'O2ui',
    flavor: t('Arde sin calor, en el mundo más frío.', 'It burns without heat, in the coldest world.'),
    journal: t(
      'En el Mundo Frío algo se encendió. Orbium ignis: el mismo Orbium, con fiebre.',
      'In the Cold World something lit up. Orbium ignis: the same Orbium, with a fever.',
    ),
    companion: t('¡Está caliente! No, espera. Está fría. Anotado.', "It's hot! No, wait. It's cold. Noted."),
    hints: [
      t('Algunas llamas solo prenden donde hace frío.', 'Some flames only catch where it is cold.'),
      t('Juega en el Mundo 2 · Frío y siembra mucho.', 'Play in World 2 · Cold and sow a lot.'),
      t('Mundo 2 · Frío: una nadadora rosada que parece una llama.', 'World 2 · Cold: a pink swimmer that looks like a flame.'),
    ],
    glyph: 'flame',
    cosmetic: 'ember',
  },
  {
    id: 'phantasma',
    category: 'species',
    name: t('Fantasma', 'Phantom'),
    latin: 'Orbium phantasma',
    code: 'O2p',
    flavor: t('Solo existe cuando el tiempo va despacio.', 'It only exists when time runs slowly.'),
    journal: t(
      'En el Mundo Frío apareció algo casi transparente. Le gusta que lo miren despacio.',
      'In the Cold World something almost transparent appeared. It likes being watched slowly.',
    ),
    companion: t('¿Lo ves? Yo casi no. Hablemos bajito.', 'Can you see it? I barely can. Let’s whisper.'),
    hints: [
      t('Hay quien solo se deja ver si no tienes prisa.', 'Some only show themselves if you are in no hurry.'),
      t('Búscala en el Mundo 2 · Frío.', 'Look for it in World 2 · Cold.'),
      t('Mundo 2 · Frío: una nadadora casi transparente.', 'World 2 · Cold: an almost transparent swimmer.'),
    ],
    glyph: 'ghost',
    cosmetic: 'phantom',
  },
  {
    id: 'cryptid',
    category: 'species',
    name: t('Bicho de medianoche', 'Midnight critter'),
    latin: 'Pyroscutium ambiguus',
    code: 'PS3am',
    flavor: t('Nadie la ha visto a pleno día.', 'No one has seen it in broad daylight.'),
    journal: t(
      'En el mundo de los escudos, a deshoras, apareció otra cosa. Ambigua. A la luz del día no está. No pienso contárselo a nadie.',
      'In the world of shields, at an ungodly hour, something else appeared. Ambiguous. In daylight it is not there. I am not telling anyone.',
    ),
    companion: t('De día no estaba en el catálogo. Anotado… en secreto.', 'It wasn’t in the daytime catalog. Noted… secretly.'),
    hints: [
      t('Algunas especies tienen horario.', 'Some species keep hours.'),
      t('Vuelve al Mundo 4 · Escudos pasada la medianoche.', 'Go back to World 4 · Shields after midnight.'),
      t('Mundo 4 · Escudos, entre las 00:00 y las 04:00, o con luna llena.', 'World 4 · Shields, between 00:00 and 04:00, or under a full moon.'),
    ],
    glyph: 'eye',
    cosmetic: 'selene',
  },

  // ── Homages ──
  {
    id: 'chan',
    category: 'homage',
    name: t('Gratitud', 'Gratitude'),
    flavor: t('Toda placa tuvo una primera mano.', 'Every dish had a first hand.'),
    journal: t(
      'Le puse su nombre. Sin Bert Chan no habría regla, ni catálogo, ni este cuaderno. Gracias.',
      'I named it after him. Without Bert Chan there would be no rule, no catalog, no notebook. Thank you.',
    ),
    companion: t('Gracias, Bert Chan. De parte de todas las criaturas.', 'Thank you, Bert Chan. From all the creatures.'),
    hints: [
      t('Los nombres también son una forma de dar las gracias.', 'Names are also a way of saying thank you.'),
      t('Ponle a una especie el nombre de quien inventó Lenia.', 'Name a species after the person who invented Lenia.'),
      t('Renombra una especie como «Chan» o «Lenia».', 'Rename a species "Chan" or "Lenia".'),
    ],
    glyph: 'thanks',
  },
  {
    id: 'conway',
    category: 'homage',
    name: t('Planeador', 'Glider'),
    flavor: t('Cinco celdas, 1970, y sigue volando.', 'Five cells, 1970, and still flying.'),
    journal: t(
      'Dibujé un planeador de memoria, como quien saluda a un abuelo. Aquí todo es continuo, pero aquel sigue planeando en diagonal.',
      'I drew a glider from memory, like waving to a grandparent. Everything here is continuous, but that one still glides diagonally.',
    ),
    companion: t('Cinco celdas. Un clásico. Mi abuela era una calculadora.', 'Five cells. A classic. My grandma was a calculator.'),
    hints: [
      t('Antes de esta vida hubo un Juego de la Vida.', 'Before this life there was a Game of Life.'),
      t('Dibuja en la placa la nave más famosa de Conway, de un trazo.', 'Draw Conway’s most famous ship on the dish, in one stroke.'),
      t('Con pincel o goma, un trazo por las 5 celdas del planeador: ↘ ↓ ← ← (o bautiza una especie «Conway»).', 'With brush or eraser, one stroke through the glider’s 5 cells: ↘ ↓ ← ← (or name a species "Conway").'),
    ],
    glyph: 'gliderGlyph',
  },
  {
    id: 'answer',
    category: 'homage',
    name: t('La respuesta', 'The answer'),
    flavor: t('Ahora solo falta la pregunta.', 'Now we just need the question.'),
    journal: t(
      'Cuarenta y dos siembras. Si esto era la respuesta, la pregunta debe de estar en otra placa.',
      'Forty-two seeds. If that was the answer, the question must be on another dish.',
    ),
    companion: t('Cuarenta y dos. Sigo buscando la pregunta.', 'Forty-two. Still looking for the question.'),
    hints: [
      t('Cuenta tus semillas.', 'Count your seeds.'),
      t('Un número famoso por responderlo todo.', 'A number famous for answering everything.'),
      t('Siembra a mano 42 veces.', 'Sow by hand 42 times.'),
    ],
    glyph: 'answer',
    easy: true,
  },
  {
    id: 'maximizer',
    category: 'homage',
    name: t('Maximizadora', 'Maximizer'),
    flavor: t('Más no siempre es más.', 'More is not always more.'),
    journal: t(
      'Diez explosiones en dos minutos. A este ritmo convertiré toda la materia en sopa. Ya hay un juego sobre eso, con clips, y no acaba bien.',
      'Ten explosions in two minutes. At this rate I will turn all matter into soup. There is already a game about that, with paperclips, and it does not end well.',
    ),
    companion: t('¡Diez explosiones! Las conté todas. Por favor, para.', 'Ten explosions! I counted them all. Please stop.'),
    hints: [
      t('Hay una forma de fracasar con mucho entusiasmo.', 'There is a way to fail with great enthusiasm.'),
      t('Crea mucha materia sin forma seguida.', 'Make a lot of shapeless matter in a row.'),
      t('10 veces materia sin forma en menos de 2 minutos.', 'Shapeless matter 10 times in under 2 minutes.'),
    ],
    glyph: 'burst',
  },
  {
    id: 'goldenStreak',
    category: 'homage',
    name: t('Racha dorada', 'Golden streak'),
    flavor: t('En algún otro laboratorio, alguien hornea.', 'In some other lab, someone is baking.'),
    journal: t(
      'Siete destellos seguidos, ni uno perdido. Hay quien pasó años atrapando galletas doradas; ahora lo entiendo.',
      'Seven sparks in a row, not one missed. Some people spent years catching golden cookies; now I understand.',
    ),
    companion: t('Siete de siete. Brillas casi tanto como ellas.', 'Seven of seven. You shine almost as much as they do.'),
    hints: [
      t('La constancia también brilla.', 'Constancy shines too.'),
      t('Atrapa muchos Destellos seguidos sin dejar escapar ninguno.', 'Catch many Sparks in a row without letting one escape.'),
      t('7 Destellos seguidos sin perder ninguno.', '7 Sparks in a row without missing one.'),
    ],
    glyph: 'sparks',
  },

  // ── Strokes drawn on the dish ──
  {
    id: 'spiral',
    category: 'gesture',
    name: t('Espiral', 'Spiral'),
    flavor: t('Hacia dentro o hacia fuera: la placa no distingue.', 'Inwards or outwards: the dish cannot tell.'),
    journal: t(
      'Dibujé una espiral en la placa. Las criaturas no la siguieron; las giratorias ya sabían hacerlo.',
      'I drew a spiral on the dish. The creatures did not follow it; the spinners already knew how.',
    ),
    companion: t('Me mareo solo de mirarla. Anotado.', 'I get dizzy just looking. Noted.'),
    hints: [
      t('Las giratorias dibujan algo sin saberlo.', 'Spinners draw something without knowing it.'),
      t('Con el pincel o la goma, traza una curva que se enrosque sobre sí misma.', 'With the brush or eraser, trace a curve that coils around itself.'),
      t('Dibuja una espiral de un solo trazo (vuelta y media o más).', 'Draw a spiral in one stroke (a turn and a half or more).'),
    ],
    glyph: 'spiralGlyph',
  },
  {
    id: 'heart',
    category: 'gesture',
    name: t('Corazón', 'Heart'),
    flavor: t('No es ciencia. No importa.', 'Not science. Doesn’t matter.'),
    journal: t('Dibujé un corazón en la placa. No es un método válido. Lo anoto igual.', 'I drew a heart on the dish. Not a valid method. I am writing it down anyway.'),
    companion: t('Eso no es ciencia. Me gusta igual.', 'That’s not science. I like it anyway.'),
    hints: [
      t('Hay formas que no son científicas.', 'Some shapes are not scientific.'),
      t('Dibuja en la placa lo que dibujarías en un cristal empañado.', 'Draw on the dish what you would draw on a fogged-up window.'),
      t('Traza un corazón de un solo trazo, derecho.', 'Trace an upright heart in one stroke.'),
    ],
    glyph: 'heartGlyph',
  },
  {
    id: 'halo',
    category: 'gesture',
    name: t('Cerco', 'Halo'),
    flavor: t('Por si acaso.', 'Just in case.'),
    journal: t('Le dibujé un círculo alrededor a una criatura. No la protege de nada. Por si acaso.', 'I drew a circle around a creature. It protects it from nothing. Just in case.'),
    companion: t('Un círculo alrededor. Por si acaso. Bien pensado.', 'A circle around it. Just in case. Smart.'),
    hints: [
      t('Algunas criaturas merecen un marco.', 'Some creatures deserve a frame.'),
      t('Rodea a una criatura viva con un trazo.', 'Surround a living creature with one stroke.'),
      t('Dibuja un círculo cerrado alrededor de una criatura viva.', 'Draw a closed circle around a living creature.'),
    ],
    glyph: 'circleGlyph',
  },
  {
    id: 'infinity',
    category: 'gesture',
    name: t('Infinito', 'Infinity'),
    flavor: t('Una placa redonda no tiene esquinas: su borde no se acaba nunca.', 'A round dish has no corners: its rim never ends.'),
    journal: t(
      'Dibujé un infinito. El borde de una placa redonda no se acaba nunca: se puede dar la vuelta para siempre.',
      'I drew an infinity sign. A round dish has a rim that never ends: you could go round it forever.',
    ),
    companion: t('Infinito. Como el borde de la placa. Cuadra.', 'Infinity. Like the rim of the dish. Checks out.'),
    hints: [
      t('Un borde redondo no se acaba nunca. ¿Cómo se dibuja eso?', 'A round rim never ends. How do you draw that?'),
      t('Un ocho tumbado, de un trazo.', 'A sideways eight, in one stroke.'),
      t('Dibuja ∞ con el pincel o la goma.', 'Draw ∞ with the brush or the eraser.'),
    ],
    glyph: 'infinityGlyph',
  },

  // ── Touches, keys, sensors ──
  {
    id: 'konami',
    category: 'touch',
    name: t('El código', 'The code'),
    flavor: t('↑↑↓↓←→←→. Las criaturas no ganan vidas. Tú, nostalgia.', '↑↑↓↓←→←→. The creatures gain no lives. You gain nostalgia.'),
    journal: t(
      'Arriba, arriba, abajo, abajo… Las criaturas no ganaron vidas extra. Yo, un poco de nostalgia.',
      'Up, up, down, down… The creatures got no extra lives. I got a little nostalgia.',
    ),
    companion: t('¿Vidas extra? No tenemos. Anotado igualmente.', 'Extra lives? We don’t have any. Noted anyway.'),
    hints: [
      t('Hay códigos más viejos que este laboratorio.', 'Some codes are older than this lab.'),
      t('Una secuencia famosa de flechas (y dos letras, si tienes teclado).', 'A famous sequence of arrows (and two letters, if you have a keyboard).'),
      t('Teclado: ↑ ↑ ↓ ↓ ← → ← → B A. Táctil: ocho trazos rectos en la placa con esas direcciones.', 'Keyboard: ↑ ↑ ↓ ↓ ← → ← → B A. Touch: eight straight strokes on the dish in those directions.'),
    ],
    glyph: 'arrows',
    cosmetic: 'phosphor',
  },
  {
    id: 'logo',
    category: 'touch',
    name: t('Toc, toc', 'Knock, knock'),
    flavor: t('Alguien al otro lado del cristal.', 'Someone on the other side of the glass.'),
    journal: t('Toqué el cristal siete veces, como en un acuario. Nadie contestó. Bueno: casi nadie.', 'I tapped the glass seven times, like at an aquarium. No one answered. Well: almost no one.'),
    companion: t('¡Toc, toc! ¿Quién es? …Nadie. ¿O sí?', 'Knock, knock! Who’s there? …Nobody. Or…?'),
    hints: [
      t('No golpees el cristal. O sí.', 'Don’t tap the glass. Or do.'),
      t('Toca el logotipo varias veces seguidas.', 'Tap the logo several times in a row.'),
      t('Toca el logo de Bioluma 7 veces seguidas.', 'Tap the Bioluma logo 7 times in a row.'),
    ],
    glyph: 'taps',
    easy: true,
  },
  {
    id: 'patience',
    category: 'touch',
    name: t('Contar despacio', 'Counting slowly'),
    flavor: t('Un número, mirado lo bastante, deja de serlo.', 'A number, stared at long enough, stops being one.'),
    journal: t('Mantuve el dedo sobre la Esencia hasta que dejó de parecer un número. Luego volvió a serlo.', 'I held my finger on the Essence until it stopped looking like a number. Then it was one again.'),
    companion: t('Ese número es exacto. Lo comprobé tres veces.', 'That number is exact. I checked three times.'),
    hints: [
      t('Algunos números quieren que los mires más tiempo.', 'Some numbers want to be looked at longer.'),
      t('Mantén pulsado el contador de Esencia.', 'Press and hold the Essence counter.'),
      t('Mantén pulsado el contador de Esencia 5 segundos.', 'Hold the Essence counter for 5 seconds.'),
    ],
    glyph: 'hold',
  },
  {
    id: 'shake',
    category: 'touch',
    name: t('Agitar antes de usar', 'Shake before use'),
    flavor: t('Viven en su regla, no en tu mano.', 'They live in their rule, not in your hand.'),
    journal: t('Agité la placa. Ni se enteraron: viven en su regla, no en mi mano. Eso me tranquiliza.', 'I shook the dish. They did not notice: they live in their rule, not in my hand. That is reassuring.'),
    companion: t('¡Eh! Ellas ni se enteraron. Yo sí.', 'Hey! They didn’t notice. I did.'),
    hints: [
      t('¿Y si la placa se mueve?', 'What if the dish moves?'),
      t('Agita el dispositivo. En escritorio, agita otra cosa.', 'Shake the device. On desktop, shake something else.'),
      t('Agita el móvil. En escritorio: sacude el ratón de lado a lado sobre la placa, o la ventana.', 'Shake the phone. On desktop: jiggle the mouse side to side over the dish, or the window.'),
    ],
    glyph: 'wave',
  },

  // ── Patience ──
  {
    id: 'oldFriend',
    category: 'patience',
    name: t('Viejo amigo', 'Old friend'),
    flavor: t('Ya no es un número.', 'No longer a number.'),
    journal: t('Lleva media hora conmigo. Ya no le digo «número»; le digo «tú».', 'It has been with me for half an hour. I no longer call it "number"; I call it "you".'),
    companion: t('Media hora juntos. Ya le tengo cariño.', 'Half an hour together. I’m fond of it now.'),
    hints: [
      t('Algunas compañías se ganan con tiempo.', 'Some company is earned with time.'),
      t('Mantén viva a una misma criatura mucho rato.', 'Keep one and the same creature alive for a long while.'),
      t('Una misma criatura viva durante 30 minutos de juego.', 'The same creature alive for 30 minutes of play.'),
    ],
    glyph: 'hourglass',
  },
  {
    id: 'seven',
    category: 'patience',
    name: t('Siete de siete', 'Seven of seven'),
    flavor: t('Ninguna repetida. Parece una fábula.', 'None repeated. It sounds like a fable.'),
    journal: t(
      'Siete criaturas, siete especies, ninguna repetida. Parece el principio de una fábula; no sé cuál es la moraleja.',
      'Seven creatures, seven species, none repeated. It sounds like the start of a fable; I do not know the moral.',
    ),
    companion: t('Siete especies, ninguna repetida. ¡Las conté dos veces!', 'Seven species, no repeats. I counted twice!'),
    hints: [
      t('La variedad también es un número.', 'Variety is a number too.'),
      t('Pocas criaturas, pero todas distintas.', 'Few creatures, but all different.'),
      t('Exactamente 7 criaturas estables, de 7 especies distintas, a la vez.', 'Exactly 7 stable creatures, of 7 different species, at once.'),
    ],
    glyph: 'seven',
  },
  {
    id: 'silence',
    category: 'patience',
    name: t('Silencio', 'Silence'),
    flavor: t('El silencio también es un resultado.', 'Silence is a result too.'),
    journal: t('Cinco minutos sin nada vivo. Anoto la nada con la misma letra que todo lo demás.', 'Five minutes with nothing alive. I write down the nothing in the same handwriting as everything else.'),
    companion: t('Silencio. Lo anoto en voz baja.', 'Silence. I’m noting it quietly.'),
    hints: [
      t('A veces lo que hay que observar es la ausencia.', 'Sometimes what must be observed is absence.'),
      t('Después de haber tenido vida, deja la placa vacía un buen rato.', 'After there has been life, leave the dish empty for a good while.'),
      t('Placa sin criaturas durante 5 minutos (después de haber tenido alguna).', 'No creatures on the dish for 5 minutes (after having had some).'),
    ],
    glyph: 'void',
  },
  {
    id: 'sterile',
    category: 'patience',
    name: t('Esterilizar lo estéril', 'Sterilising the sterile'),
    flavor: t('Por protocolo.', 'By protocol.'),
    journal: t(
      'Esterilicé una placa que ya estaba vacía. Por protocolo. El protocolo no tiene sentido del humor; yo, un poco.',
      'I sterilised a dish that was already empty. By protocol. The protocol has no sense of humour; I have a little.',
    ),
    companion: t('Esterilizar el vacío. Protocolo cumplido, supongo.', 'Sterilising nothing. Protocol complete, I suppose.'),
    hints: [
      t('Hay rituales que no necesitan testigos.', 'Some rituals need no witnesses.'),
      t('Termina una sesión sin nada vivo en la placa.', 'End a session with nothing alive on the dish.'),
      t('Pulsa «Terminar ahora» con 0 criaturas vivas.', 'Tap “End now” with 0 creatures alive.'),
    ],
    glyph: 'flask',
  },
  {
    id: 'palindrome',
    category: 'patience',
    name: t('Capicúa', 'Palindrome'),
    flavor: t('Se lee igual al revés. No significa nada.', 'It reads the same backwards. It means nothing.'),
    journal: t('Se lee igual al derecho y al revés. No significa nada. Lo anoto igual: así empiezan las obsesiones.', 'It reads the same forwards and backwards. It means nothing. I write it down anyway: that is how obsessions start.'),
    companion: t('¡Se lee igual al revés! Lo leí al revés.', 'It reads the same backwards! I read it backwards.'),
    hints: [
      t('Mira bien el contador; a veces dice algo.', 'Look closely at the counter; sometimes it says something.'),
      t('Algunos números se leen igual al derecho y al revés.', 'Some numbers read the same forwards and backwards.'),
      t('Ten una Esencia capicúa de 6 cifras o más (o exactamente 1 234 567).', 'Have a palindromic Essence of 6 digits or more (or exactly 1,234,567).'),
    ],
    glyph: 'mirror',
  },
  {
    id: 'afk',
    category: 'patience',
    name: t('¿Sigues ahí?', 'Still there?'),
    flavor: t('Ellas no saben esperar. Tú sí.', 'They cannot wait. You can.'),
    journal: t('Diez minutos en pausa. Ellas no saben esperar, solo seguir. Yo sí sé esperar; no sé si es mejor.', 'Ten minutes paused. They cannot wait, only go on. I can wait; I do not know if that is better.'),
    companion: t('¿Sigues ahí? Te guardé el sitio.', 'Still there? I saved your seat.'),
    hints: [
      t('Detener el tiempo también cuenta.', 'Stopping time counts too.'),
      t('Pausa la placa y no vuelvas en un buen rato.', 'Pause the dish and stay away for a good while.'),
      t('Deja el juego en pausa 10 minutos.', 'Leave the game paused for 10 minutes.'),
    ],
    glyph: 'pause',
  },

  // ── Sky ──
  {
    id: 'fullMoon',
    category: 'sky',
    name: t('Luna llena', 'Full moon'),
    flavor: t('Esta noche la placa refleja algo más.', 'Tonight the dish reflects something else.'),
    journal: t('Hay luna llena. No afecta a la regla, lo sé. Aun así, esta noche las miro distinto.', 'Full moon. It does not affect the rule, I know. Still, tonight I look at them differently.'),
    companion: t('Luna llena. Mi llama se pone nerviosa.', 'Full moon. My flame gets jittery.'),
    hints: [
      t('El cielo también tiene fases.', 'The sky has phases too.'),
      t('Juega cuando la luna esté llena.', 'Play when the moon is full.'),
      t('Abre el juego en luna llena (± 1 día).', 'Open the game under a full moon (± 1 day).'),
    ],
    glyph: 'moon',
  },
  {
    id: 'birthday',
    category: 'sky',
    name: t('Cumpleaños', 'Birthday'),
    flavor: t('Una vela por cada noche.', 'One candle for every night.'),
    journal: t('Hoy la placa cumple años. Le canto bajito, para no despertar a nadie.', 'Today the dish has a birthday. I sing quietly, so as not to wake anyone.'),
    companion: t('¡Feliz cumpleaños, placa! No tengo velas. Bueno, una.', 'Happy birthday, dish! I have no candles. Well, one.'),
    hints: [
      t('Todo laboratorio tiene una fecha que celebrar.', 'Every lab has a date to celebrate.'),
      t('Hay dos fechas en el año: la de esta placa y la de su regla.', 'There are two dates a year: this dish’s and its rule’s.'),
      t('Juega el 4 de octubre (Bioluma) o el 13 de diciembre (Lenia, 2018).', 'Play on 4 October (Bioluma) or 13 December (Lenia, 2018).'),
    ],
    glyph: 'cake',
  },
  {
    id: 'aurora',
    category: 'sky',
    name: t('Aurora', 'Aurora'),
    flavor: t('Nadie la provocó. Por eso cuenta.', 'No one caused it. That is why it counts.'),
    journal: t('Una luz cruzó la placa sin tocar a nadie. No la provoqué. La anoto con cuidado, por si no vuelve.', 'A light crossed the dish without touching anyone. I did not cause it. I write it down carefully, in case it never returns.'),
    companion: t('¡Mira arriba! Bueno, arriba de la placa.', 'Look up! Well, above the dish.'),
    hints: [
      t('Algunas cosas solo pasan si esperas con la placa llena de vida.', 'Some things only happen if you wait with a dish full of life.'),
      t('Mantén una placa viva mucho tiempo; el cielo hace el resto.', 'Keep a living dish for a long time; the sky does the rest.'),
      t('Evento raro al azar: tras 20 min de juego, con 3 o más criaturas estables (≈ 45 min de media).', 'Rare random event: after 20 min of play, with 3+ stable creatures (≈ 45 min on average).'),
    ],
    glyph: 'aurora',
    cosmetic: 'aurora',
  },
  {
    id: 'orion',
    category: 'sky',
    name: t('Cinturón', 'Belt'),
    flavor: t('Tres en fila, como en el cielo de invierno.', 'Three in a row, like the winter sky.'),
    journal: t(
      'Tres criaturas en fila, a la misma distancia. Les dibujé el cinturón de Orión encima. No se dieron cuenta; yo no he pensado en otra cosa.',
      'Three creatures in a row, evenly spaced. I drew Orion’s belt over them. They did not notice; I have thought of nothing else.',
    ),
    companion: t('Tres en fila. Como el cielo de ahí fuera.', 'Three in a row. Like the sky out there.'),
    hints: [
      t('Mira la placa como mirarías el cielo.', 'Look at the dish the way you would look at the sky.'),
      t('Tres criaturas alineadas, como un cinturón famoso.', 'Three creatures lined up, like a famous belt.'),
      t('3 criaturas estables en línea recta y a igual distancia, durante unos segundos.', '3 stable creatures in a straight line, evenly spaced, for a few seconds.'),
    ],
    glyph: 'belt',
  },

  // ── Meta ──
  {
    id: 'basement',
    category: 'meta',
    name: t('El sótano', 'The basement'),
    flavor: t('Debajo de todo laboratorio hay otro.', 'Under every lab there is another.'),
    journal: t('Encontré una puerta bajo el laboratorio. Dentro, notas con mi letra que no recuerdo haber escrito.', 'I found a door under the lab. Inside, notes in my handwriting that I do not remember writing.'),
    companion: t('No sabía que teníamos sótano. Ni quiero saberlo.', 'I didn’t know we had a basement. I don’t want to know.'),
    hints: [
      t('Encuentra diez cosas que nadie te pidió encontrar.', 'Find ten things nobody asked you to find.'),
      t('Con diez secretos, algo cambia en Ajustes.', 'With ten secrets, something changes in Settings.'),
      t('Encuentra 10 secretos y abre «Laboratorio del sótano» en Ajustes.', 'Find 10 secrets and open "Basement lab" in Settings.'),
    ],
    glyph: 'door',
  },
];

export const SECRET_IDS: readonly SecretId[] = SECRET_DEFS.map((d) => d.id);
export const TOTAL_SECRETS = SECRET_DEFS.length;

export function secretDef(id: SecretId): SecretDef {
  const d = SECRET_DEFS.find((x) => x.id === id);
  if (!d) throw new Error(`unknown secret ${id}`);
  return d;
}

/** Journal variants that depend on the moment of discovery. */
export const JOURNAL_VARIANTS = {
  birthdayLenia: t(
    'Un día como hoy, en 2018, alguien publicó una regla continua y la llamó Lenia. Brindo con agua destilada.',
    'On this day in 2018, someone published a continuous rule and called it Lenia. I toast with distilled water.',
  ),
  exactEssence: t('1 234 567. Uno, dos, tres… siete. Lo anoto antes de que deje de serlo.', '1,234,567. One, two, three… seven. I write it down before it stops being so.'),
  palindrome: (n: string): Text =>
    t(`${n}. Se lee igual al derecho y al revés. No significa nada. Lo anoto igual: así empiezan las obsesiones.`, `${n}. It reads the same forwards and backwards. It means nothing. I write it down anyway: that is how obsessions start.`),
};

/** Whispers drawn over the dish by some secrets. */
export const WHISPERS = {
  afk: t('¿Sigues ahí?', 'Still there?'),
  silence: t('…', '…'),
  chanCredit: t('Lenia — Bert Wang-Chak Chan, 2018. Gracias.', 'Lenia — Bert Wang-Chak Chan, 2018. Thank you.'),
  konami: t('+30 vidas (no aplica)', '+30 lives (not applicable)'),
  orionLabel: t('Cinturón de Orión', 'Orion’s Belt'),
  sevenLabel: t('Siete de siete', 'Seven of seven'),
  birthday: t('Feliz cumpleaños, placa', 'Happy birthday, dish'),
  shake: t('Ni se enteraron.', 'They didn’t notice.'),
};

/** Tiny dry-humour replies when a species gets certain names (not secrets; shown as a whisper). */
export const RENAME_QUIPS: readonly { names: readonly string[]; text: Text }[] = [
  { names: ['galleta', 'cookie', 'galletita'], text: t('No es comestible. Lo comprobé. (No lo comprobé.)', 'Not edible. I checked. (I did not check.)') },
  { names: ['clip', 'clips', 'paperclip', 'paperclips', 'grapa'], text: t('Sé lo que estás pensando. No.', 'I know what you are thinking. No.') },
  { names: ['vela', 'albor'], text: t('Ese nombre ya está ocupado en este laboratorio.', 'That name is already taken in this lab.') },
  { names: ['espécimen', 'especimen', 'specimen'], text: t('Muy original.', 'Very original.') },
];

// ───────────────────────────── Cosmetic colormaps ─────────────────────────────
// Same shape as core/palette MATTER_STOPS: [value, r, g, b, alpha]. Low matter stays
// transparent over the dark dish; the 0.15 / 0.4 / 0.7 stops carry the character.

export const COLORMAPS: Record<CosmeticId, Colormap> = {
  ember: {
    id: 'ember',
    name: t('Brasa', 'Ember'),
    stops: [
      [0.0, 11, 14, 18, 0],
      [0.08, 44, 10, 6, 0.55],
      [0.15, 96, 20, 10, 0.85],
      [0.4, 236, 96, 26, 1],
      [0.7, 255, 214, 130, 1],
      [1.0, 255, 250, 236, 1],
    ],
  },
  phantom: {
    id: 'phantom',
    name: t('Espectro', 'Spectre'),
    stops: [
      [0.0, 11, 14, 18, 0],
      [0.08, 22, 26, 44, 0.35],
      [0.15, 52, 62, 96, 0.6],
      [0.4, 150, 172, 214, 0.85],
      [0.7, 226, 234, 255, 0.95],
      [1.0, 255, 255, 255, 1],
    ],
  },
  selene: {
    id: 'selene',
    name: t('Selene', 'Selene'),
    stops: [
      [0.0, 11, 14, 18, 0],
      [0.08, 14, 20, 44, 0.5],
      [0.15, 32, 46, 96, 0.82],
      [0.4, 122, 152, 214, 1],
      [0.7, 222, 230, 242, 1],
      [1.0, 255, 255, 250, 1],
    ],
  },
  phosphor: {
    id: 'phosphor',
    name: t('Fósforo', 'Phosphor'),
    stops: [
      [0.0, 11, 14, 18, 0],
      [0.08, 0, 24, 8, 0.5],
      [0.15, 0, 64, 22, 0.85],
      [0.4, 40, 206, 92, 1],
      [0.7, 172, 255, 172, 1],
      [1.0, 236, 255, 236, 1],
    ],
  },
  aurora: {
    id: 'aurora',
    name: t('Aurora', 'Aurora'),
    stops: [
      [0.0, 11, 14, 18, 0],
      [0.08, 10, 32, 44, 0.5],
      [0.15, 34, 22, 96, 0.85],
      [0.4, 40, 222, 150, 1],
      [0.7, 196, 146, 255, 1],
      [1.0, 255, 242, 255, 1],
    ],
  },
  abyss: {
    id: 'abyss',
    name: t('Abisal', 'Abyssal'),
    stops: [
      [0.0, 11, 14, 18, 0],
      [0.08, 2, 12, 34, 0.6],
      [0.15, 0, 42, 96, 0.9],
      [0.4, 0, 172, 204, 1],
      [0.7, 124, 255, 222, 1],
      [1.0, 232, 255, 250, 1],
    ],
  },
  gilded: {
    id: 'gilded',
    name: t('Dorada', 'Gilded'),
    stops: [
      [0.0, 11, 14, 18, 0],
      [0.08, 32, 22, 6, 0.55],
      [0.15, 84, 54, 10, 0.85],
      [0.4, 224, 164, 42, 1],
      [0.7, 255, 228, 152, 1],
      [1.0, 255, 252, 236, 1],
    ],
  },
};

export const COSMETIC_IDS: readonly CosmeticId[] = ['ember', 'phantom', 'selene', 'phosphor', 'aurora', 'abyss', 'gilded'];

/** Cryptic note under a locked swatch in the basement (never the secret's name). */
export const COSMETIC_SOURCE: Record<CosmeticId, Text> = {
  ember: t('Una llama que no quema', 'A flame that does not burn'),
  phantom: t('Algo que solo vive despacio', 'Something that only lives slowly'),
  selene: t('Algo que sale de noche', 'Something that comes out at night'),
  phosphor: t('Un código antiguo', 'An old code'),
  aurora: t('Una luz que nadie provoca', 'A light no one causes'),
  abyss: t(`${ABYSS_UNLOCK} secretos`, `${ABYSS_UNLOCK} secrets`),
  gilded: t('Todos los secretos', 'Every secret'),
};

/** Sample a colormap (same interpolation as core/palette matterColor). */
export function colormapColor(stops: readonly (readonly [number, number, number, number, number])[], v: number): [number, number, number, number] {
  const x = Math.min(1, Math.max(0, v));
  for (let i = 1; i < stops.length; i++) {
    const [v1, r1, g1, b1, a1] = stops[i];
    if (x <= v1) {
      const [v0, r0, g0, b0, a0] = stops[i - 1];
      const k = (x - v0) / (v1 - v0 || 1);
      return [r0 + (r1 - r0) * k, g0 + (g1 - g0) * k, b0 + (b1 - b0) * k, a0 + (a1 - a0) * k];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3], last[4]];
}

/** 256×1 RGBA8 lookup table for a colormap (drop-in for core/palette matterLUT()). */
export function colormapLUT(stops: readonly (readonly [number, number, number, number, number])[]): Uint8Array {
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const [r, g, b, a] = colormapColor(stops, i / 255);
    out[i * 4] = Math.round(r);
    out[i * 4 + 1] = Math.round(g);
    out[i * 4 + 2] = Math.round(b);
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}
