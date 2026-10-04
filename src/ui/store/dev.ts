/**
 * store-dev.html: the store and wardrobe against the DEV MOCK provider (fake purchases).
 *
 * URL params (also used by tests/e2e/store-shots.mjs):
 *   lang=es|en  open=store|wardrobe|none  tab=<StoreTab>  detail=<item id>
 *   ach=1 (unlock every achievement cosmetic)  sub=1 (active supporter)  own=<id,id>  equip=<id,id>
 *   rm=1 (reduced motion)  fail=cancelled|pending|network (next purchase fails)
 */
import { ACHIEVEMENT_TEXT } from '../../game/content';
import { STORE_TABS, type StoreTab } from '../../store/catalog';
import { Entitlements } from '../../store/entitlements';
import { resolveStoreFlags } from '../../store/flags';
import { createProviders, DevMockProvider } from '../../store/providers';
import { StoreController } from '../../store/store';
import { openStore, openWardrobe } from './index';
import { el } from './dom';

const q = new URLSearchParams(location.search);
const lang = q.get('lang') === 'en' ? 'en' : 'es';
const rm = q.get('rm') === '1' ? true : undefined;

// Fresh state per page load unless ?keep=1 (screenshots must be deterministic).
const storage = q.get('keep') === '1' ? localStorage : null;
const entitlements = new Entitlements({ storage });
const flags = resolveStoreFlags({ isDev: true, search: location.search, hostname: location.hostname });
const providers = createProviders(flags, { entitlements }, { devmock: { latencyMs: Number(q.get('latency') ?? 600) } });
const store = new StoreController(flags, entitlements, providers);
const fail = q.get('fail');
if (fail === 'cancelled' || fail === 'pending' || fail === 'network') (providers[0] as DevMockProvider).failNext = fail;

if (q.get('ach') === '1') entitlements.syncAchievements(Object.keys(ACHIEVEMENT_TEXT));
if (q.get('sub') === '1') {
  entitlements.setSubscription({ plan: 'month', status: 'active', expiresAt: Date.now() + 30 * 86_400_000, willRenew: true, provider: 'devmock', since: Date.now() });
}
for (const id of (q.get('own') ?? '').split(',').filter(Boolean)) entitlements.grant(id, 'dev', { provider: 'devmock' });
for (const id of (q.get('equip') ?? '').split(',').filter(Boolean)) entitlements.equip(id);

const app = document.getElementById('app')!;
const panel = el(
  'div',
  { class: 'dev-panel' },
  el('h1', { text: 'Bioluma · store dev' }),
  el('p', { text: `flags: ${flags.reason} · host ${flags.host} · provider ${store.provider?.id ?? 'none'}` }),
);
const btn = (label: string, fn: () => void) => {
  const b = el('button', { type: 'button', text: label });
  b.addEventListener('click', fn);
  panel.append(b);
  return b;
};

let storeUI: ReturnType<typeof openStore> | null = null;
let wardrobeUI: ReturnType<typeof openWardrobe> | null = null;

function showStore(tab?: StoreTab): void {
  wardrobeUI?.close();
  storeUI?.close();
  storeUI = openStore({
    root: document.body,
    store,
    lang,
    playerName: 'Ada',
    playerTag: '0420',
    tab,
    reduceMotion: rm,
    legal: { terms: '#terms', privacy: '#privacy', refunds: '#refunds' },
    openWardrobe: () => showWardrobe(),
    onClose: () => (storeUI = null),
  });
}

function showWardrobe(): void {
  storeUI?.close();
  wardrobeUI?.close();
  wardrobeUI = openWardrobe({
    root: document.body,
    entitlements,
    lang,
    playerName: 'Ada',
    playerTag: '0420',
    reduceMotion: rm,
    openStore: store.visible ? (tab) => showStore(tab) : undefined,
    onClose: () => (wardrobeUI = null),
  });
}

btn(lang === 'es' ? 'Abrir tienda' : 'Open store', () => showStore());
btn(lang === 'es' ? 'Vestidor' : 'Wardrobe', () => showWardrobe());
btn(lang === 'es' ? 'Desbloquear logros' : 'Unlock achievements', () => entitlements.syncAchievements(Object.keys(ACHIEVEMENT_TEXT)));
btn(lang === 'es' ? 'Expirar suscripción' : 'Expire subscription', () => {
  const s = entitlements.subscription();
  if (s) entitlements.setSubscription({ ...s, expiresAt: Date.now() - 1 });
});
btn('Reset', () => entitlements.reset());
btn(lang === 'es' ? 'English' : 'Español', () => {
  q.set('lang', lang === 'es' ? 'en' : 'es');
  location.search = q.toString();
});
app.append(panel);

entitlements.on('supporterWelcome', () => console.info('[dev] supporterWelcome → add SUPPORTER_JOURNAL to the journal'));

const open = q.get('open') ?? 'store';
const tab = q.get('tab');
if (open === 'store') {
  showStore(tab && (STORE_TABS as string[]).includes(tab) ? (tab as StoreTab) : undefined);
  const detail = q.get('detail');
  if (detail) setTimeout(() => storeUI?.show(detail), 50);
} else if (open === 'wardrobe') showWardrobe();

Object.assign(window, { __store: { store, entitlements, showStore, showWardrobe } });
