/**
 * Store / wardrobe UI strings (es/en). `{name}` placeholders are filled by tr(key, lang, vars).
 */
import type { Lang, Text } from '../../core/types';

const S = {
  storeTitle: { es: 'Tienda del laboratorio', en: 'Lab store' },
  storeShort: { es: 'Tienda', en: 'Store' },
  cosmeticOnly: { es: 'Solo cosmético · cero ventajas', en: 'Cosmetic only · zero advantages' },
  wardrobe: { es: 'Vestidor', en: 'Wardrobe' },
  close: { es: 'Cerrar', en: 'Close' },
  back: { es: 'Volver', en: 'Back' },
  testBanner: { es: 'MODO PRUEBA · compras falsas, no se cobra dinero real', en: 'TEST MODE · fake purchases, no real money is charged' },
  sandboxBanner: { es: 'MODO SANDBOX · pagos de prueba del proveedor', en: 'SANDBOX MODE · provider test payments' },

  tabPalettes: { es: 'Paletas', en: 'Palettes' },
  tabDish: { es: 'Placa', en: 'Dish' },
  tabEffects: { es: 'Efectos', en: 'Effects' },
  tabMusic: { es: 'Música', en: 'Music' },
  tabProfile: { es: 'Perfil', en: 'Profile' },
  tabSupporter: { es: 'Mecenas', en: 'Supporter' },

  introPalettes: {
    es: 'Viste a la vida misma: cada paleta colorea la materia de tu placa, el bestiario y los retratos.',
    en: 'Dress life itself: each palette colours the matter in your dish, bestiary and portraits.',
  },
  introDish: { es: 'El agar, el vidrio y la luz alrededor de tus criaturas.', en: 'The agar, the glass and the light around your creatures.' },
  introEffects: { es: 'Halos, siembras y destellos con otro estilo. Mismo tamaño, misma duración: solo cambia la forma.', en: 'Halos, seeds and sparks with another style. Same size, same timing: only the look changes.' },
  introMusic: { es: 'Ambientes para la música generativa. Los sonidos de aviso no cambian.', en: 'Ambiences for the generative music. Alert sounds never change.' },
  introProfile: { es: 'Cómo te ven los demás en el ranking.', en: 'How others see you in the ranking.' },

  sectionHalo: { es: 'Halo de criatura estable', en: 'Stable creature halo' },
  sectionTrail: { es: 'Rastro de siembra', en: 'Seed trail' },
  sectionSpark: { es: 'Destello', en: 'Spark' },
  sectionBadges: { es: 'Insignias', en: 'Badges' },
  sectionFrames: { es: 'Marcos', en: 'Frames' },
  sectionNameColors: { es: 'Color de nombre (Mecenas)', en: 'Name colour (supporters)' },
  sectionPacks: { es: 'Packs', en: 'Packs' },
  sectionMonthly: { es: 'Paletas Mecenas reclamadas', en: 'Claimed supporter palettes' },

  owned: { es: 'Tuya', en: 'Owned' },
  equipped: { es: 'Equipada', en: 'Equipped' },
  equip: { es: 'Equipar', en: 'Equip' },
  equipNow: { es: 'Equipar ahora', en: 'Equip now' },
  free: { es: 'Gratis', en: 'Free' },
  buyFor: { es: 'Comprar · {price}', en: 'Buy · {price}' },
  newTag: { es: 'Nuevo', en: 'New' },
  earlyTag: { es: 'Anticipado', en: 'Early access' },
  achievementTag: { es: 'Logro', en: 'Achievement' },
  supporterTag: { es: 'Mecenas', en: 'Supporter' },
  bundleTag: { es: 'Paquete', en: 'Pack' },
  monthlyTag: { es: 'Del mes', en: 'Monthly' },

  lockAchievement: { es: 'Se desbloquea gratis con el logro «{name}».', en: 'Unlocks for free with the achievement “{name}”.' },
  lockAchievementGeneric: { es: 'Se desbloquea gratis con un logro.', en: 'Unlocks for free with an achievement.' },
  lockBundle: { es: 'Solo en: {name}.', en: 'Only in: {name}.' },
  lockSubscription: { es: 'Incluido mientras seas Mecenas.', en: 'Included while you are a supporter.' },
  lockRotation: { es: 'Paleta Mecenas de {month}: se reclama siendo Mecenas ese mes.', en: 'Supporter palette of {month}: claimed by being a supporter that month.' },
  lockEarly: { es: 'Acceso anticipado para Mecenas. Para todos desde el {date}.', en: 'Early access for supporters. For everyone from {date}.' },
  alsoIn: { es: 'También en: {name}.', en: 'Also in: {name}.' },

  waiting: { es: 'Completa el pago en la ventana segura…', en: 'Complete the payment in the secure window…' },
  cancelWait: { es: 'Cancelar', en: 'Cancel' },
  purchased: { es: '¡Listo! «{name}» es tuya.', en: 'Done! “{name}” is yours.' },
  subscribed: { es: '¡Gracias, Mecenas! Tus ventajas cosméticas ya están activas.', en: 'Thank you, supporter! Your cosmetic perks are active.' },
  pending: { es: 'Pago en proceso. Toca «Restaurar compras» en unos minutos.', en: 'Payment processing. Tap “Restore purchases” in a few minutes.' },
  cancelled: { es: 'Compra cancelada. No se cobró nada.', en: 'Purchase cancelled. Nothing was charged.' },
  failed: { es: 'No se pudo completar la compra. No se cobró nada.', en: 'The purchase could not be completed. Nothing was charged.' },
  offline: { es: 'Sin conexión con la tienda. Inténtalo de nuevo.', en: 'Cannot reach the store. Please try again.' },
  unavailable: { es: 'Las compras no están disponibles aquí.', en: 'Purchases are not available here.' },
  restore: { es: 'Restaurar compras', en: 'Restore purchases' },
  restoring: { es: 'Restaurando…', en: 'Restoring…' },
  restored: { es: 'Compras restauradas.', en: 'Purchases restored.' },
  restoredNew: { es: 'Restauradas: {n} cosas nuevas.', en: 'Restored: {n} new items.' },
  equippedToast: { es: '«{name}» equipada.', en: '“{name}” equipped.' },

  terms: { es: 'Términos', en: 'Terms' },
  privacy: { es: 'Privacidad', en: 'Privacy' },
  refunds: { es: 'Reembolsos', en: 'Refunds' },
  pricesNote: { es: 'Precios de referencia en USD; tu tienda muestra el precio final en tu moneda.', en: 'Reference prices in USD; your store shows the final price in your currency.' },

  // Supporter
  supTitle: { es: 'Mecenas del laboratorio', en: 'Lab supporter' },
  supLead: {
    es: 'Financia las noches del laboratorio. A cambio, solo belleza: nada que cambie el juego.',
    en: 'Fund the lab’s long nights. In return, only beauty: nothing that changes the game.',
  },
  planMonth: { es: 'Mensual', en: 'Monthly' },
  planYear: { es: 'Anual', en: 'Yearly' },
  perMonth: { es: '/mes', en: '/month' },
  perYear: { es: '/año', en: '/year' },
  save: { es: 'Ahorra {pct}%', en: 'Save {pct}%' },
  subscribe: { es: 'Hacerme Mecenas · {price}', en: 'Become a supporter · {price}' },
  subFine: {
    es: 'Se renueva automáticamente hasta que canceles. Cancela cuando quieras; conservas las paletas mensuales que ya reclamaste.',
    en: 'Renews automatically until you cancel. Cancel any time; you keep the monthly palettes you already claimed.',
  },
  subActive: { es: 'Eres Mecenas', en: 'You are a supporter' },
  subUntilRenew: { es: 'Se renueva el {date}', en: 'Renews on {date}' },
  subUntilEnd: { es: 'Activa hasta el {date} · no se renovará', en: 'Active until {date} · will not renew' },
  manage: { es: 'Gestionar suscripción', en: 'Manage subscription' },
  thisMonth: { es: 'Este mes: «{name}»', en: 'This month: “{name}”' },
  noSubsHere: { es: 'La suscripción no está disponible en esta plataforma.', en: 'The subscription is not available on this platform.' },
  founderTitle: { es: 'Paquete fundador', en: 'Founder pack' },
  separately: { es: 'Por separado: {price}', en: 'Separately: {price}' },
  includes: { es: 'Incluye', en: 'Includes' },
  exclusiveMark: { es: 'exclusivo', en: 'exclusive' },
  alreadyHave: { es: 'Ya tienes {n} de {total}.', en: 'You already own {n} of {total}.' },
  ownedAll: { es: 'Ya lo tienes todo', en: 'You own it all' },
  fairTitle: { es: 'Juego limpio', en: 'Fair play' },

  // Music
  listen: { es: 'Escuchar', en: 'Listen' },
  stop: { es: 'Detener', en: 'Stop' },
  bpm: { es: '{n} BPM', en: '{n} BPM' },

  // Profile
  yourName: { es: 'Tu nombre', en: 'Your name' },

  // Wardrobe
  wardrobeTitle: { es: 'Vestidor', en: 'Wardrobe' },
  wardrobeLead: { es: 'Equipa lo que ya tienes. Los cosméticos gratis se ganan con logros.', en: 'Equip what you own. Free cosmetics are earned with achievements.' },
  moreInStore: { es: 'Más en la tienda', en: 'More in the store' },
  lockedCount: { es: '{n} por desbloquear', en: '{n} to unlock' },
} satisfies Record<string, Text>;

export type StoreStr = keyof typeof S;

export function tr(key: StoreStr, lang: Lang, vars?: Record<string, string | number>): string {
  let s = S[key][lang];
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

export function tx(t: Text, lang: Lang): string {
  return t[lang];
}

const MONTHS: Record<Lang, string[]> = {
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};

/** "noviembre 2026" / "November 2026" from "2026-11". */
export function monthName(key: string, lang: Lang): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[lang][(m - 1 + 12) % 12]} ${y}`;
}

/** "10 dic 2026" / "Dec 10, 2026". */
export function shortDate(ms: number, lang: Lang): string {
  const d = new Date(ms);
  const m = MONTHS[lang][d.getUTCMonth()];
  return lang === 'es' ? `${d.getUTCDate()} ${m.slice(0, 3)} ${d.getUTCFullYear()}` : `${m.slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
