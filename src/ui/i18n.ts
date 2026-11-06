/**
 * UI chrome strings (es/en). Game-provided `Text` fields are picked with `tx()`.
 * `{name}` placeholders are filled by `t(key, { name: ... })`.
 */
import type { Behavior, CreatureState, Lang, Rarity, Text } from '../core/types';

const S = {
  // Currencies & HUD
  // The in-run currency is Luz / Glow on screen (ADR-030); code ids stay `essence`.
  essence: { es: 'Luz', en: 'Glow' },
  perSec: { es: '/s', en: '/s' },
  essAria: { es: 'Luz: {n}. Ganas {r} de luz por segundo.', en: 'Glow: {n}. You earn {r} glow per second.' },
  journal: { es: 'Bitácora', en: 'Journal' },
  settings: { es: 'Ajustes', en: 'Settings' },
  mute: { es: 'Silenciar', en: 'Mute' },
  unmute: { es: 'Activar sonido', en: 'Unmute' },
  objective: { es: 'Objetivo', en: 'Objective' },
  objectiveDone: { es: '¡Objetivo cumplido!', en: 'Objective complete!' },

  // Tabs
  tabBestiary: { es: 'Bestiario', en: 'Bestiary' },
  introBestiary: {
    es: 'Aquí se guarda cada especie que descubres. ¡Toca una!',
    en: 'Every species you discover is kept here. Tap one!',
  },
  dismiss: { es: 'Entendido', en: 'Got it' },
  close: { es: 'Cerrar', en: 'Close' },
  collapse: { es: 'Plegar panel', en: 'Collapse panel' },
  expand: { es: 'Desplegar panel', en: 'Expand panel' },

  // Dish
  tapDish: { es: '¡Toca aquí!', en: 'Tap here!' },
  tapDishSub: { es: 'Pon una semilla y mira qué pasa.', en: 'Drop a seed and see what happens.' },
  tapAgain: { es: '¡Toca aquí otra vez!', en: 'Tap here again!' },
  hintLongPress: { es: 'Mantén pulsado: semilla grande', en: 'Press and hold: big seed' },
  hintDoubleTap: { es: 'Doble toque: semilla grande', en: 'Double tap: big seed' },
  hintBrush: { es: 'Arrastra: pincel de materia', en: 'Drag: matter brush' },
  pause: { es: 'Pausa', en: 'Pause' },
  paused: { es: 'En pausa', en: 'Paused' },
  resume: { es: 'Reanudar', en: 'Resume' },
  speed: { es: 'Velocidad', en: 'Speed' },
  eraser: { es: 'Borrar', en: 'Erase' },
  eraserMode: { es: 'Toca para borrar', en: 'Tap to erase' },
  printMode: { es: 'Toca dónde poner la copia de {name}', en: 'Tap where to put the copy of {name}' },
  cancel: { es: 'Cancelar', en: 'Cancel' },
  seed: { es: 'Semilla', en: 'Seed' },
  newSpecies: { es: '¡Especie nueva!', en: 'New species!' },
  newBehavior: { es: '¡Nueva manera de moverse!', en: 'New way of moving!' },
  unknownCreature: { es: 'Aún sin nombre', en: 'No name yet' },
  classifying: { es: 'Mirando cómo se mueve…', en: 'Watching how it moves…' },
  follow: { es: 'Seguir', en: 'Follow' },
  unfollow: { es: 'Dejar de seguir', en: 'Unfollow' },
  // Age in seconds of simulated time (CLARIDAD J-28: no simulation steps on screen).
  age: { es: 'Vive desde hace', en: 'Alive for' },
  yields: { es: 'Da', en: 'Gives' },
  yieldsValue: { es: '+{v} luz/s', en: '+{v} glow/s' },
  behavior: { es: 'Cómo se mueve', en: 'How it moves' },

  // Lab / upgrades
  buyQty: { es: 'Cantidad', en: 'Quantity' },
  level: { es: 'Nv', en: 'Lv' },
  maxed: { es: 'MÁX', en: 'MAX' },
  buy: { es: 'Comprar', en: 'Buy' },
  locked: { es: 'Bloqueada', en: 'Locked' },
  multGlobal: { es: 'Todo da', en: 'Everything' },
  multBuffs: { es: 'Premio ahora', en: 'Prize now' },
  newSpeciesN: { es: '¡{n} especies nuevas!', en: '{n} new species!' },
  journalNote: { es: 'Nueva nota en la Bitácora', en: 'New note in the Journal' },
  journalNotes: { es: '{n} notas nuevas en la Bitácora', en: '{n} new notes in the Journal' },
  achievementsAll: { es: 'Ver logros', en: 'All achievements' },
  seedPriceWhy: { es: '¿Por qué cuesta esto?', en: 'Why does it cost this?' },
  seedWait: { es: 'Espera…', en: 'Wait…' },
  // ADR-031 (docs/MECANICAS.md §4): a living creature crowded out; like every loss, it says what it left.
  crowdLeft: { es: 'Le faltó sitio · su luz quedó aquí', en: 'Ran out of room · its glow stayed here' },
  deniedShort: { es: 'Te faltan {n} de luz', en: 'You need {n} more glow' },
  deniedWait: { es: 'Espera a tus criaturas.', en: 'Wait for your creatures.' },
  seedWaitWhy: { es: 'Hay semillas naciendo: espera a que terminen.', en: 'Seeds are hatching: wait until they finish.' },
  behaviorGuide: { es: 'Maneras de moverse', en: 'Ways of moving' },
  behaviorGuideAria: { es: 'Guía: cómo se mueve cada una', en: 'Guide: how each one moves' },
  multParts: { es: 'De dónde sale tu luz', en: 'Where your glow comes from' },
  overgrownTitle: { es: '¡La placa se desbordó!', en: 'The dish overflowed!' },
  overgrownText: { es: 'La materia sin forma no da luz.', en: 'Shapeless matter gives no glow.' },
  cleanDish: { es: 'Limpiar placa', en: 'Clean dish' },
  cleanConfirm: { es: '¿Limpiar? Toca otra vez', en: 'Clean? Tap again' },
  cleanHold: { es: 'Mantén pulsado para limpiar la placa', en: 'Hold to clean the dish' },
  recenter: { es: 'Centrar', en: 'Centre' },
  // Collecting light by hand, the pipettes and the finger guide (ADR-030, docs/CLARIDAD2.md §2.2, §2.5)
  /** A drop at its ripe share, the first times. */
  dropReady: { es: '¡Lista!', en: 'Ready!' },
  /** A tap on a creature whose drop is empty: the card moved to the long press. */
  hintHoldCard: { es: 'Mantén pulsado para ver su ficha', en: 'Press and hold to see its card' },
  /** The first swimmer on the dish. */
  hintSteer: { es: 'Arrástrala para guiarla', en: 'Drag it to steer' },
  /** A tap outside the glass, once. */
  tapInside: { es: 'Toca dentro de la placa', en: 'Tap inside the dish' },
  /** A refused tap next to a creature (§6 #4): what would happen, in a child's words. */
  tooCloseSeed: { es: '¡Muy cerca! Si se tocan, se juntan y se apagan.', en: 'Too close! If they touch, they merge and go dark.' },

  // Bestiary
  registered: { es: 'Descubiertas', en: 'Found' },
  all: { es: 'Todas', en: 'All' },
  unknownSpecies: { es: 'Sin descubrir', en: 'Undiscovered' },
  emptyBestiary: {
    es: 'Aún no hay nadie. Siembra hasta que nazca una criatura.',
    en: 'Nobody here yet. Sow until a creature is born.',
  },
  noMatches: { es: 'Ninguna especie coincide con el filtro.', en: 'No species match this filter.' },
  multiplier: { es: 'Rareza', en: 'Rarity' },
  multiplierValue: { es: '×{v} luz', en: '×{v} glow' },
  timesSeen: { es: 'La viste', en: 'Seen' },
  timesSeenValue: { es: '{n} veces', en: '{n} times' },
  /** Before the clock runs (B-7): the rate it will charge, never a contradicting +0/s. */
  rateAtStart: { es: '+{r}/s al empezar', en: '+{r}/s at start' },
  /** The HUD's «+2,0/s» before the clock runs: these words beside it on a laptop, for the screen reader on a phone. */
  atStart: { es: 'al empezar', en: 'at start' },
  spcEarnsNow: { es: 'Da ahora', en: 'Earns now' },
  spcAliveNow: { es: 'Vivas ahora', en: 'Alive now' },
  /** §6 #7: the upgrades that help it, said as where they are. */
  spcBoostedBy: { es: 'Le ayuda en el Árbol:', en: 'Helped in the Tree by:' },
  /** §6 #6: how much light it gives among the 7, as beads. */
  spcLight: { es: 'Da luz', en: 'Glow' },
  /** The species sheet before the clock runs (QA-CLARIDAD: "+0/s" read as "it gives nothing"). */
  spcLightAtStart: { es: 'Empieza a dar luz cuando arranque el reloj', en: 'Starts to glow when the clock starts' },
  era: { es: 'Noche', en: 'Night' },
  livesIn: { es: 'Vive en', en: 'Lives in' },
  print: { es: 'Imprimir', en: 'Print' },
  makeCopy: { es: 'Hacer una copia', en: 'Make a copy' },
  copyFree: { es: 'Gratis', en: 'Free' },
  // The seed pill's «Copiar» (Copiadora, docs/CLARIDAD2.md §2.12): which species of this world to copy.
  copyBtn: { es: 'Copiar', en: 'Copy' },
  // The seed pill while seeds are free (docs/CLARIDAD2.md §5.2 task 6: «1 semilla gratis»).
  seedFreeN: { es: '{n} gratis', en: '{n} free' },
  // The Nutrientes button's second line (docs/CLARIDAD2.md §2.7 item 6): waiting, a gain in whole percent.
  boostReadyIn: { es: 'listo en {s} s', en: 'ready in {s} s' },
  boostGain: { es: '+{pct} %', en: '+{pct}%' },
  copyPickTitle: { es: '¿Cuál copias?', en: 'Which one?' },
  copyHint: { es: 'Pon otra igual en la placa. Cuesta luz.', en: 'Put another one like it on the dish. Costs glow.' },
  outOfRegime: {
    es: 'Esta especie vive en otro mundo: {world}.',
    en: 'This species lives in another world: {world}.',
  },
  rename: { es: 'Renombrar', en: 'Rename' },
  save: { es: 'Guardar', en: 'Save' },
  unclassified: { es: '¿Cómo se moverá?', en: 'How will it move?' },

  // Offline
  offlineTitle: { es: 'Mientras no estabas', en: 'While you were away' },
  offlineIn: { es: 'de luz en {t}', en: 'glow in {t}' },
  offlineGo: { es: 'Continuar', en: 'Continue' },

  // Journal modal
  journalTab: { es: 'Bitácora', en: 'Journal' },
  achievementsTab: { es: 'Logros', en: 'Achievements' },
  statsTab: { es: 'Estadísticas', en: 'Statistics' },
  journalEmpty: { es: 'La bitácora está vacía… por ahora.', en: 'The journal is empty… for now.' },
  achievement: { es: 'Logro', en: 'Achievement' },
  statPlayTime: { es: 'Tiempo de juego', en: 'Play time' },
  statTotalEssence: { es: 'Luz total', en: 'Total glow' },
  statEraEssence: { es: 'Mejor sesión', en: 'Best session' },
  statSeeds: { es: 'Semillas', en: 'Seeds' },
  statBorn: { es: 'Criaturas nacidas', en: 'Creatures born' },
  statSpecies: { es: 'Especies registradas', en: 'Species registered' },
  statEra: { es: 'Noche', en: 'Night' },

  // Settings
  language: { es: 'Idioma', en: 'Language' },
  audio: { es: 'Sonido', en: 'Audio' },
  sfxVolume: { es: 'Efectos', en: 'Effects' },
  musicVolume: { es: 'Ambiente', en: 'Ambience' },
  muted: { es: 'Sin sonido', en: 'Sound off' },
  gameplay: { es: 'Juego', en: 'Gameplay' },
  vibration: { es: 'Vibración', en: 'Vibration' },
  reduceMotion: { es: 'Reducir movimiento', en: 'Reduce motion' },
  oneTouch: { es: 'Modo un toque', en: 'One-touch mode' },
  oneTouchHint: {
    es: 'El toque largo pasa a ser doble toque.',
    en: 'Long press becomes double tap.',
  },
  autoCollect: { es: 'Recoger la luz sola', en: 'Collect glow for me' },
  autoCollectHint: { es: 'Una pipeta recoge las gotas por ti desde la primera sesión.', en: 'A pipette collects the drops for you from the first session.' },
  graphics: { es: 'Gráficos', en: 'Graphics' },
  appearance: { es: 'Apariencia', en: 'Appearance' },
  customize: { es: 'Personalización', en: 'Customise' },
  textSize: { es: 'Letra', en: 'Text size' },
  textNormal: { es: 'Normal', en: 'Normal' },
  textLarge: { es: 'Grande', en: 'Large' },
  wardrobe: { es: 'Vestidor', en: 'Wardrobe' },
  wardrobeHint: {
    es: 'Paletas, placas, efectos y música que ya tienes. Solo cosmético.',
    en: 'Palettes, dishes, effects and music you own. Cosmetic only.',
  },
  storeOpen: { es: 'Tienda', en: 'Store' },
  storeHint: {
    es: 'Cosméticos opcionales que apoyan el juego. Nada da ventaja.',
    en: 'Optional cosmetics that support the game. Nothing gives an edge.',
  },
  theme: { es: 'Tema', en: 'Theme' },
  themeAuto: { es: 'Auto', en: 'Auto' },
  themeDark: { es: 'Oscuro', en: 'Dark' },
  themeLight: { es: 'Claro', en: 'Light' },
  quality: { es: 'Calidad', en: 'Quality' },
  qAuto: { es: 'Auto', en: 'Auto' },
  qLow: { es: 'Baja', en: 'Low' },
  qMedium: { es: 'Media', en: 'Medium' },
  qHigh: { es: 'Alta', en: 'High' },
  privacy: { es: 'Privacidad', en: 'Privacy' },
  playerId: { es: 'Tu identificador', en: 'Your player id' },
  playerIdHint: {
    es: 'Al azar, no dice quién eres. Inclúyelo si pides ver o borrar tus datos del ranking. Bioluma no envía estadísticas.',
    en: 'Random, it says nothing about you. Include it if you ask to see or delete your leaderboard data. Bioluma sends no statistics.',
  },
  qualityHint: { es: 'Se aplica al volver a abrir el juego.', en: 'Applies the next time the game opens.' },
  qualityLater: { es: 'Calidad guardada: se aplica al volver a abrir el juego.', en: 'Quality saved: it applies the next time the game opens.' },
  saveData: { es: 'Tu partida guardada', en: 'Your saved game' },
  exportSave: { es: 'Exportar', en: 'Export' },
  importSave: { es: 'Importar', en: 'Import' },
  copy: { es: 'Copiar', en: 'Copy' },
  copied: { es: 'Copiado', en: 'Copied' },
  savePlaceholder: {
    es: 'Pulsa Exportar para ver tu partida, o pega aquí una para importarla.',
    en: 'Press Export to see your save, or paste one here to import it.',
  },
  importOk: { es: 'Partida importada. Volviendo a abrir…', en: 'Save imported. Reopening…' },
  importFail: { es: 'No se pudo importar esa partida', en: 'Could not import that save' },
  resetSave: { es: 'Borrar partida', en: 'Delete save' },
  resetConfirm: { es: '¿Seguro? Pulsa otra vez para borrar todo', en: 'Sure? Press again to erase everything' },
  screenshot: { es: 'Captura de la placa', en: 'Dish screenshot' },
  credits: { es: 'Créditos', en: 'Credits' },
  creditsGame: {
    es: 'Bioluma — un incremental cultivado en Lenia, la vida artificial continua.',
    en: 'Bioluma — an incremental grown from Lenia, continuous artificial life.',
  },
  creditsLenia: {
    es: 'Lenia fue creada por Bert Wang-Chak Chan. Catálogo de especies y artículos de Lenia: MIT License, Copyright (c) 2018 Bert Chan.',
    en: 'Lenia was created by Bert Wang-Chak Chan. Species catalog and Lenia papers: MIT License, Copyright (c) 2018 Bert Chan.',
  },
  creditsPhotos: { es: 'Fotografías de archivo', en: 'Archive photographs' },
  creditsPhotoSource: { es: 'Fuente', en: 'Source' },
  creditsPhotoLicence: { es: 'Licencia', en: 'Licence' },
  creditsKeys: {
    es: 'Teclado: Espacio pausa · E borrar · J bitácora · M silencio · rueda zoom · clic derecho borra.',
    en: 'Keyboard: Space pause · E erase · J journal · M mute · wheel zoom · right-click erases.',
  },
  on: { es: 'Sí', en: 'On' },
  off: { es: 'No', en: 'Off' },

  // Unsupported
  unsupportedTitle: { es: 'Este navegador no puede cultivar vida', en: 'This browser cannot grow life' },
  showMore: { es: 'Ver {n} más', en: 'Show {n} more' },
  importEmpty: { es: 'No se pudo importar: pega primero el texto de una partida exportada.', en: 'Could not import: paste the text of an exported game first.' },
  importVersion: { es: 'No se pudo importar: esa partida es de otra versión del juego.', en: 'Could not import: that save is from another version of the game.' },
  importConfirm: { es: '¿Reemplazar tu partida? Toca otra vez', en: 'Replace your game? Tap again' },
  techDetails: { es: 'Detalles técnicos', en: 'Technical details' },
  unsupportedBody: {
    es: 'Bioluma necesita WebGL2. Prueba con una versión reciente de Chrome, Firefox, Safari o Edge, y activa la aceleración por hardware.',
    en: 'Bioluma needs WebGL2. Try a recent Chrome, Firefox, Safari or Edge, with hardware acceleration enabled.',
  },
  retry: { es: 'Reintentar', en: 'Retry' },

  // Splash
  splashTagline: { es: 'Vida artificial que brilla', en: 'Artificial life that glows' },
  splashTap: { es: 'Toca para empezar', en: 'Tap to begin' },
  splashCredit: { es: 'Lenia © Bert Chan · MIT', en: 'Lenia © Bert Chan · MIT' },
  splashPlate: { es: 'ESTACIÓN VIGILIA · TURNO DE NOCHE', en: 'VIGIL STATION · NIGHT SHIFT' },

  // Tutorial
  tutRestart: { es: 'Repetir tutorial', en: 'Replay tutorial' },
  tutRestartHint: { es: 'Vuelve a ver las explicaciones paso a paso.', en: 'See the step-by-step guide again.' },

  // Leaderboard
  ranking: { es: 'Ranking', en: 'Leaderboard' },
  boardEssence: { es: 'Luz', en: 'Glow' },
  boardSpecies: { es: 'Especies', en: 'Species' },
  boardEra: { es: 'Noches', en: 'Nights' },
  boardEssenceLong: { es: 'Luz de por vida', en: 'Lifetime glow' },
  nickTitle: { es: 'Elige tu nombre de científico', en: 'Choose your scientist name' },
  nickHint: { es: 'Entre 3 y 16 caracteres: letras, números, espacio, punto, _ o -.', en: '3 to 16 characters: letters, numbers, space, dot, _ or -.' },
  nickPlaceholder: { es: 'Dra. Placa', en: 'Dr. Petri' },
  nickSave: { es: 'Guardar nombre', en: 'Save name' },
  nickTooShort: { es: 'Mínimo 3 caracteres.', en: 'At least 3 characters.' },
  nickTooLong: { es: 'Máximo 16 caracteres.', en: 'At most 16 characters.' },
  nickInvalid: { es: 'Solo letras, números, espacio, punto, _ o -.', en: 'Only letters, numbers, space, dot, _ or -.' },
  nickChange: { es: 'Cambiar nombre', en: 'Change name' },
  submitScore: { es: 'Enviar puntuación', en: 'Submit score' },
  submitOk: { es: 'Puntuación enviada', en: 'Score submitted' },
  submitFail: { es: 'No se pudo enviar', en: 'Could not submit' },
  lbError: { es: 'No se pudo cargar el ranking.', en: 'Could not load the leaderboard.' },
  lbOffline: { es: 'Sin conexión con el laboratorio central.', en: 'No connection to the central lab.' },
  lbEmpty: { es: 'Aún no hay científicos en este ranking. ¡Sé el primero!', en: 'No scientists on this board yet. Be the first!' },
  lbYou: { es: 'Tú', en: 'You' },
  lbFlagged: { es: 'En revisión', en: 'Under review' },
  lbNotRanked: { es: 'Aún no apareces. Envía tu puntuación.', en: 'You are not ranked yet. Submit your score.' },
  lbSpeciesShort: { es: 'esp.', en: 'sp.' },
} satisfies Record<string, Text>;

export type StrKey = keyof typeof S;
/** All chrome strings (exported for the completeness test). */
export const STRINGS: Readonly<Record<StrKey, Text>> = S;

let lang: Lang = 'es';

export function setLang(l: Lang): void {
  lang = l;
}

export function getLang(): Lang {
  return lang;
}

/** Translate a UI chrome string. */
export function t(key: StrKey, vars?: Record<string, string | number>): string {
  let s = S[key][lang];
  if (vars) for (const k in vars) s = s.split(`{${k}}`).join(String(vars[k]));
  return s;
}

/** Pick a game-provided Text in the current language. */
export function tx(text: Text | null | undefined): string {
  if (!text) return '';
  return text[lang] ?? text.es ?? '';
}

const BEHAVIOR: Record<Behavior, Text> = {
  still: { es: 'Quieta', en: 'Still' },
  pulsing: { es: 'Late', en: 'Pulses' },
  swimmer: { es: 'Nadadora', en: 'Swimmer' },
  spinner: { es: 'Gira', en: 'Spins' },
  divider: { es: 'Se divide', en: 'Splits' },
  colony: { es: 'Colonia', en: 'Colony' },
};

const RARITY: Record<Rarity, Text> = {
  common: { es: 'Común', en: 'Common' },
  uncommon: { es: 'Poco común', en: 'Uncommon' },
  rare: { es: 'Rara', en: 'Rare' },
  veryRare: { es: 'Muy rara', en: 'Very rare' },
};

const STATE: Record<CreatureState, Text> = {
  born: { es: 'Naciendo', en: 'Hatching' },
  stable: { es: 'Viva', en: 'Alive' },
  exploded: { es: 'Sin forma', en: 'Shapeless' },
  dead: { es: 'Se apagó', en: 'Faded' },
};

export const BEHAVIORS: Behavior[] = ['still', 'pulsing', 'swimmer', 'spinner', 'divider', 'colony'];
export const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'veryRare'];

export function behaviorName(b: Behavior | null): string {
  return b ? BEHAVIOR[b][lang] : t('classifying');
}
export function rarityName(r: Rarity): string {
  return RARITY[r][lang];
}
export function stateName(s: CreatureState): string {
  return STATE[s][lang];
}
