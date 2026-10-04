/**
 * UI chrome strings (es/en). Game-provided `Text` fields are picked with `tx()`.
 * `{name}` placeholders are filled by `t(key, { name: ... })`.
 */
import type { Behavior, CreatureState, Lang, Rarity, Text } from '../core/types';

const S = {
  // Currencies & HUD
  essence: { es: 'Esencia', en: 'Essence' },
  samples: { es: 'Muestras', en: 'Samples' },
  genome: { es: 'Genoma', en: 'Genome' },
  perSec: { es: '/s', en: '/s' },
  journal: { es: 'Bitácora', en: 'Journal' },
  settings: { es: 'Ajustes', en: 'Settings' },
  mute: { es: 'Silenciar', en: 'Mute' },
  unmute: { es: 'Activar sonido', en: 'Unmute' },
  objective: { es: 'Objetivo', en: 'Objective' },
  objectiveDone: { es: '¡Objetivo cumplido!', en: 'Objective complete!' },

  // Tabs
  tabLab: { es: 'Laboratorio', en: 'Lab' },
  tabBestiary: { es: 'Bestiario', en: 'Bestiary' },
  tabCalibrate: { es: 'Calibrar', en: 'Calibrate' },
  tabGenome: { es: 'Genoma', en: 'Genome' },
  introLab: {
    es: 'Gasta Esencia en mejoras que hacen mejores siembras.',
    en: 'Spend Essence on upgrades that make better seeds.',
  },
  introBestiary: {
    es: 'Cada especie estable que descubres queda registrada aquí.',
    en: 'Every stable species you discover is recorded here.',
  },
  introCalibrate: {
    es: 'Cambia las reglas del universo: cada régimen tiene su fauna.',
    en: 'Bend the rules of the universe: every regime has its own fauna.',
  },
  introGenome: {
    es: 'Extingue la placa para ganar Genoma y comprar reglas nuevas.',
    en: 'Extinguish the dish to earn Genome and buy new rules.',
  },
  dismiss: { es: 'Entendido', en: 'Got it' },
  close: { es: 'Cerrar', en: 'Close' },
  collapse: { es: 'Plegar panel', en: 'Collapse panel' },
  expand: { es: 'Desplegar panel', en: 'Expand panel' },

  // Dish
  tapDish: { es: 'Toca la placa', en: 'Tap the dish' },
  tapDishSub: { es: 'Siembra vida y mira qué pasa', en: 'Seed life and watch what happens' },
  hintLongPress: { es: 'Mantén pulsado: siembra grande', en: 'Press and hold: big seed' },
  hintDoubleTap: { es: 'Doble toque: siembra grande', en: 'Double tap: big seed' },
  hintBrush: { es: 'Arrastra: pincel de materia', en: 'Drag: matter brush' },
  pause: { es: 'Pausa', en: 'Pause' },
  paused: { es: 'En pausa', en: 'Paused' },
  resume: { es: 'Reanudar', en: 'Resume' },
  speed: { es: 'Velocidad', en: 'Speed' },
  eraser: { es: 'Borrar', en: 'Erase' },
  eraserMode: { es: 'Toca para borrar materia', en: 'Tap to erase matter' },
  printMode: { es: 'Toca para imprimir {name}', en: 'Tap to print {name}' },
  cancel: { es: 'Cancelar', en: 'Cancel' },
  seed: { es: 'Semilla', en: 'Seed' },
  pipette: { es: 'Pipeta de emergencia', en: 'Emergency pipette' },
  newSpecies: { es: '¡Especie nueva!', en: 'New species!' },
  newBehavior: { es: 'Comportamiento nuevo', en: 'New behaviour' },
  unknownCreature: { es: 'Sin registrar', en: 'Unregistered' },
  classifying: { es: 'Clasificando…', en: 'Classifying…' },
  follow: { es: 'Seguir', en: 'Follow' },
  unfollow: { es: 'Dejar de seguir', en: 'Unfollow' },
  age: { es: 'Edad', en: 'Age' },
  steps: { es: 'pasos', en: 'steps' },
  yields: { es: 'Produce', en: 'Yields' },
  behavior: { es: 'Comportamiento', en: 'Behaviour' },
  goldenOffscreen: { es: 'Destello', en: 'Spark' },

  // Lab / upgrades
  buyQty: { es: 'Cantidad', en: 'Quantity' },
  qtyMax: { es: '×máx', en: '×max' },
  level: { es: 'Nv', en: 'Lv' },
  maxed: { es: 'MÁX', en: 'MAX' },
  buy: { es: 'Comprar', en: 'Buy' },
  locked: { es: 'Bloqueada', en: 'Locked' },
  lockedSection: { es: 'Por descubrir', en: 'Yet to unlock' },
  bestiaryUpgrades: { es: 'Mejoras de Muestras', en: 'Sample upgrades' },
  noUpgrades: { es: 'Aún no hay mejoras.', en: 'No upgrades yet.' },
  multGlobal: { es: 'Producción', en: 'Production' },
  multBuffs: { es: 'Bonos activos', en: 'Active boosts' },
  newSpeciesN: { es: '¡{n} especies nuevas!', en: '{n} new species!' },
  journalNote: { es: 'Nueva nota en la Bitácora', en: 'New note in the Journal' },
  journalNotes: { es: '{n} notas nuevas en la Bitácora', en: '{n} new notes in the Journal' },
  achievementsAll: { es: 'Ver logros', en: 'All achievements' },
  seedPriceWhy: { es: '¿Por qué cuesta esto?', en: 'Why does it cost this?' },
  overgrownTitle: { es: '¡La placa se desbordó!', en: 'The dish overflowed!' },
  overgrownText: { es: 'La materia sin forma no produce.', en: 'Shapeless matter produces nothing.' },
  cleanDish: { es: 'Limpiar placa', en: 'Clean dish' },
  cleanConfirm: { es: '¿Limpiar? Toca otra vez', en: 'Clean? Tap again' },
  labEmpty: { es: 'Siembra vida para ganar Esencia y desbloquear mejoras', en: 'Sow life to earn Essence and unlock upgrades' },
  labEmptyHint: { es: 'Toca la placa para sembrar.', en: 'Tap the dish to sow.' },
  lockLab: { es: 'Se desbloquea al sembrar por primera vez', en: 'Unlocks with your first seed' },
  lockBestiary: { es: 'Se desbloquea al registrar tu primera especie', en: 'Unlocks when you register your first species' },
  lockCalibrate: { es: 'Se desbloquea con la mejora Calibrador del Laboratorio', en: "Unlocks with the Lab's Calibrator upgrade" },
  lockGenome: { es: 'Se desbloquea al acercarte a tu primera Extinción', en: 'Unlocks as you approach your first Extinction' },

  // Bestiary
  registered: { es: 'Registradas', en: 'Registered' },
  all: { es: 'Todas', en: 'All' },
  unknownSpecies: { es: 'Sin descubrir', en: 'Undiscovered' },
  emptyBestiary: {
    es: 'Aún no hay especies. Siembra hasta que algo se estabilice.',
    en: 'No species yet. Keep seeding until something stabilizes.',
  },
  noMatches: { es: 'Ninguna especie coincide con el filtro.', en: 'No species match this filter.' },
  multiplier: { es: 'Multiplicador', en: 'Multiplier' },
  timesSeen: { es: 'Veces vista', en: 'Times seen' },
  discoveredEra: { es: 'Descubierta', en: 'Discovered' },
  era: { es: 'Era', en: 'Era' },
  muRange: { es: 'Rango μ', en: 'μ range' },
  sigmaRange: { es: 'Rango σ', en: 'σ range' },
  print: { es: 'Imprimir', en: 'Print' },
  plantAnother: { es: 'Plantar otra', en: 'Plant another' },
  printHint: {
    es: 'Coloca esta especie en la placa con las reglas actuales.',
    en: 'Places this species on the dish under the current rules.',
  },
  outOfRegime: {
    es: 'Fuera de su régimen: probablemente no sobreviva.',
    en: 'Outside its regime: it will probably not survive.',
  },
  rename: { es: 'Renombrar', en: 'Rename' },
  save: { es: 'Guardar', en: 'Save' },
  unclassified: { es: 'Sin clasificar', en: 'Unclassified' },

  // Calibrate
  calWarning: { es: 'Cambiar las reglas puede matar la vida actual.', en: 'Changing the rules may kill current life.' },
  muLabel: { es: 'Crecimiento', en: 'Growth' },
  sigmaLabel: { es: 'Tolerancia', en: 'Tolerance' },
  RLabel: { es: 'Tamaño', en: 'Size' },
  dtLabel: { es: 'Ritmo', en: 'Pace' },
  rulesOfLife: { es: 'Reglas de la vida', en: 'Rules of life' },
  sliderLocked: { es: 'Se desbloquea con el Calibrador', en: 'Unlocked by the Calibrator' },
  regimes: { es: 'Regímenes', en: 'Regimes' },
  saveRegime: { es: 'Guardar', en: 'Save' },
  regimeName: { es: 'Régimen {n}', en: 'Regime {n}' },
  regimesEmpty: {
    es: 'Guarda la calibración actual para volver a ella.',
    en: 'Save the current calibration to come back to it.',
  },
  regimesLocked: { es: 'Los regímenes llegan con Calibrador II.', en: 'Regimes arrive with Calibrator II.' },
  deleteRegime: { es: 'Borrar régimen', en: 'Delete regime' },
  loadRegime: { es: 'Cargar', en: 'Load' },

  // Genome
  branchRules: { es: 'Reglas', en: 'Rules' },
  branchHeritage: { es: 'Herencia', en: 'Heritage' },
  branchFauna: { es: 'Fauna', en: 'Fauna' },
  genomeBonus: {
    es: 'Cada punto gastado suma +2 % de producción.',
    en: 'Every point spent adds +2% production.',
  },
  owned: { es: 'Adquirido', en: 'Owned' },
  requires: { es: 'Requiere', en: 'Requires' },
  extinguish: { es: 'Extinguir', en: 'Extinguish' },
  holdToConfirm: { es: 'Mantén 1,5 s para confirmar', en: 'Hold 1.5 s to confirm' },
  gainNow: { es: 'Ganarías', en: 'You would gain' },
  gainIn10: { es: 'En 10 min', en: 'In 10 min' },
  extinctionLocked: { es: 'Extinción no disponible', en: 'Extinction unavailable' },

  // Extinction ritual
  eraEnd: { es: 'Fin de la Era {n}', en: 'End of Era {n}' },
  eraDuration: { es: 'Duración', en: 'Duration' },
  eraEssence: { es: 'Esencia de la Era', en: 'Era Essence' },
  eraNewSpecies: { es: 'Especies nuevas', en: 'New species' },
  eraBest: { es: 'Mejor criatura', en: 'Best creature' },
  genomeGained: { es: 'Genoma ganado', en: 'Genome gained' },
  openGenome: { es: 'Abrir el Árbol', en: 'Open the Tree' },

  // Offline
  offlineTitle: { es: 'Mientras no estabas', en: 'While you were away' },
  offlineIn: { es: 'de Esencia en {t}', en: 'Essence in {t}' },
  offlineGo: { es: 'Continuar', en: 'Continue' },

  // Journal modal
  journalTab: { es: 'Bitácora', en: 'Journal' },
  achievementsTab: { es: 'Logros', en: 'Achievements' },
  statsTab: { es: 'Estadísticas', en: 'Statistics' },
  journalEmpty: { es: 'La bitácora está vacía… por ahora.', en: 'The journal is empty… for now.' },
  achievement: { es: 'Logro', en: 'Achievement' },
  statPlayTime: { es: 'Tiempo de juego', en: 'Play time' },
  statTotalEssence: { es: 'Esencia total', en: 'Total Essence' },
  statEraEssence: { es: 'Esencia esta Era', en: 'Essence this Era' },
  statSeeds: { es: 'Siembras', en: 'Seeds' },
  statBorn: { es: 'Criaturas nacidas', en: 'Creatures born' },
  statSpecies: { es: 'Especies registradas', en: 'Species registered' },
  statEra: { es: 'Era actual', en: 'Current Era' },

  // Settings
  language: { es: 'Idioma', en: 'Language' },
  audio: { es: 'Sonido', en: 'Audio' },
  sfxVolume: { es: 'Efectos', en: 'Effects' },
  musicVolume: { es: 'Ambiente', en: 'Ambience' },
  muted: { es: 'Silencio', en: 'Muted' },
  gameplay: { es: 'Juego', en: 'Gameplay' },
  vibration: { es: 'Vibración', en: 'Vibration' },
  reduceMotion: { es: 'Reducir movimiento', en: 'Reduce motion' },
  oneTouch: { es: 'Modo un toque', en: 'One-touch mode' },
  oneTouchHint: {
    es: 'El toque largo pasa a ser doble toque y se desactiva el pincel.',
    en: 'Long press becomes double tap and the brush is disabled.',
  },
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
  themeHint: { es: 'La placa siempre se ve oscura, como en el microscopio.', en: 'The dish always stays dark, like under the microscope.' },
  quality: { es: 'Calidad', en: 'Quality' },
  qAuto: { es: 'Auto', en: 'Auto' },
  qLow: { es: 'Baja', en: 'Low' },
  qMedium: { es: 'Media', en: 'Medium' },
  qHigh: { es: 'Alta', en: 'High' },
  privacy: { es: 'Privacidad', en: 'Privacy' },
  analytics: { es: 'Analítica anónima', en: 'Anonymous analytics' },
  analyticsHint: {
    es: 'Datos agregados para equilibrar el juego. Sin datos personales.',
    en: 'Aggregated data to balance the game. No personal data.',
  },
  saveData: { es: 'Partida', en: 'Save data' },
  exportSave: { es: 'Exportar', en: 'Export' },
  importSave: { es: 'Importar', en: 'Import' },
  copy: { es: 'Copiar', en: 'Copy' },
  copied: { es: 'Copiado', en: 'Copied' },
  savePlaceholder: {
    es: 'Pulsa Exportar para ver tu partida, o pega aquí una para importarla.',
    en: 'Press Export to see your save, or paste one here to import it.',
  },
  importOk: { es: 'Partida importada', en: 'Save imported' },
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
  creditsKeys: {
    es: 'Teclado: 1–4 pestañas · Espacio pausa · E borrar · J bitácora · M silencio · rueda zoom · clic derecho borra.',
    en: 'Keyboard: 1–4 tabs · Space pause · E erase · J journal · M mute · wheel zoom · right-click erases.',
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

  // Tutorial
  tutSkip: { es: 'Saltar tutorial', en: 'Skip tutorial' },
  tutNext: { es: 'Siguiente', en: 'Next' },
  tutGotIt: { es: 'Entendido', en: 'Got it' },
  tutRestart: { es: 'Repetir tutorial', en: 'Replay tutorial' },
  tutRestartHint: { es: 'Vuelve a ver las explicaciones paso a paso.', en: 'See the step-by-step guide again.' },
  tutSeedTitle: { es: 'Siembra vida', en: 'Seed life' },
  tutSeed: { es: 'Toca la placa para sembrar vida.', en: 'Tap the dish to seed life.' },
  tutWaitTitle: { es: 'Paciencia de laboratorio', en: 'Lab patience' },
  tutWait: { es: 'Casi todo se deshace. ¡Es normal! Sigue sembrando.', en: 'Most seeds fade away. That is normal! Keep seeding.' },
  tutStableTitle: { es: '¡Vida!', en: 'Life!' },
  tutStable: { es: '¡Esta criatura vive! Te da Esencia sin parar.', en: 'This creature lives! It keeps giving you Essence.' },
  tutEssenceTitle: { es: 'Tu Esencia', en: 'Your Essence' },
  tutEssence: { es: 'Tu Esencia. Gástala en semillas y mejoras.', en: 'Your Essence. Spend it on seeds and upgrades.' },
  tutLabTitle: { es: 'El Laboratorio', en: 'The Lab' },
  tutLab: { es: 'Compra el Gotero: ¡más vida en cada semilla!', en: 'Buy the Dropper: more life in every seed!' },
  tutBestiaryTitle: { es: 'Especie registrada', en: 'Species registered' },
  tutBestiary: { es: '¡Especie nueva! Mírala en el Bestiario.', en: 'New species! See it in the Bestiary.' },
  tutGoldenTitle: { es: '¡Un destello!', en: 'A spark!' },
  tutGolden: { es: '¡Tócalo antes de que se vaya! Trae premios.', en: 'Tap it before it fades! It brings prizes.' },
  tutCalibrateTitle: { es: 'Calibrar', en: 'Calibrate' },
  tutCalibrate: { es: 'Cambia las reglas de la vida. ¡Aparecen especies nuevas!', en: 'Change the rules of life. New species appear!' },
  tutGenomeTitle: { es: 'Extinción', en: 'Extinction' },
  tutGenome: { es: 'Reinicia la placa y gana Genoma para siempre.', en: 'Restart the dish and earn Genome forever.' },

  // Leaderboard
  ranking: { es: 'Ranking', en: 'Leaderboard' },
  boardEssence: { es: 'Esencia', en: 'Essence' },
  boardSpecies: { es: 'Especies', en: 'Species' },
  boardEra: { es: 'Eras', en: 'Eras' },
  boardEssenceLong: { es: 'Esencia de por vida', en: 'Lifetime Essence' },
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
  pulsing: { es: 'Pulsante', en: 'Pulsing' },
  swimmer: { es: 'Nadadora', en: 'Swimmer' },
  spinner: { es: 'Giratoria', en: 'Spinner' },
  divider: { es: 'Divisora', en: 'Divider' },
  colony: { es: 'Colonia', en: 'Colony' },
};

const RARITY: Record<Rarity, Text> = {
  common: { es: 'Común', en: 'Common' },
  uncommon: { es: 'Poco común', en: 'Uncommon' },
  rare: { es: 'Rara', en: 'Rare' },
  veryRare: { es: 'Muy rara', en: 'Very rare' },
};

const STATE: Record<CreatureState, Text> = {
  born: { es: 'Naciendo', en: 'Forming' },
  stable: { es: 'Estable', en: 'Stable' },
  exploded: { es: 'Explotó', en: 'Exploded' },
  dead: { es: 'Muerta', en: 'Dead' },
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
