/**
 * Behaviour check for platform.ts against fake hosts (browser, iOS Safari, Electron/Steam,
 * Capacitor Android, galaxy.click iframe, itch.io, TWA). No dependencies, no DOM library:
 *   node --experimental-strip-types platforms/shared/platform.selftest.ts
 * When platform.ts moves to src/platform/, port these cases to a vitest file next to it.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { detectPlatform, initPlatform } from './platform.ts';
let fails = 0;
const ok = (c: unknown, m: string) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
function fakeWindow(opts: { ua?: string; host?: string; referrer?: string; framed?: boolean; ancestor?: string; extra?: Record<string, unknown>; standalone?: boolean } = {}) {
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const store = new Map<string, string>();
  const w: any = {
    navigator: { userAgent: opts.ua ?? 'Mozilla/5.0 (Linux; Android 14) Chrome/140', maxTouchPoints: 5, vibrate: (n: number) => (w.vibrated = n) },
    location: { hostname: opts.host ?? 'bioluma.vercel.app', protocol: 'https:', ancestorOrigins: opts.ancestor ? [opts.ancestor] : [] },
    document: { referrer: opts.referrer ?? '', documentElement: {}, fullscreenElement: null },
    matchMedia: (q: string) => ({ matches: !!opts.standalone && q.includes('standalone') }),
    sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
    addEventListener: (t: string, f: any) => (listeners[t] ??= []).push(f),
    removeEventListener: (t: string, f: any) => (listeners[t] = (listeners[t] ?? []).filter((x) => x !== f)),
    dispatchEvent: (e: any) => { (listeners[e.type] ?? []).forEach((f) => f(e)); return true; },
    history: { pushState: () => (w.pushes = (w.pushes ?? 0) + 1), back: () => (w.backs = (w.backs ?? 0) + 1) },
    open: (u: string) => (w.opened = u),
    posted: [] as unknown[],
    ...opts.extra,
  };
  w.self = w;
  w.top = opts.framed ? { postMessage: (m: unknown, o: string) => w.posted.push([m, o]) } : w;
  (globalThis as any).window = w;
  (globalThis as any).KeyboardEvent = class { type: string; key: string; constructor(t: string, i: any) { this.type = t; this.key = i.key; } };
  return { w, listeners };
}
// 1. plain web on Android
{ const { w } = fakeWindow(); const p = initPlatform(); ok(p.kind === 'web' && p.os === 'android' && !p.native, 'web android detected'); ok(p.shouldRegisterServiceWorker(), 'web registers SW'); ok(p.installHint() === null, 'no install hint without bip'); w.dispatchEvent({ type: 'beforeinstallprompt', preventDefault() {}, prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' }) }); ok(p.installHint() === 'prompt', 'bip captured'); p.haptic('light'); ok(w.vibrated === 10, 'web vibrate'); }
// 2. iOS Safari
{ fakeWindow({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit Safari' }); const p = initPlatform(); ok(p.os === 'ios' && p.installHint() === 'ios', 'iOS add-to-home hint'); }
// 3. Electron bridge
{ const calls: unknown[] = []; fakeWindow({ extra: { bioluma_platform: { kind: 'electron', os: 'win32', version: '0.1.0', store: 'steam', steam: true, unlockAchievement: async (id: string) => (calls.push(['ach', id]), true), setStats: async (s: unknown) => (calls.push(['stats', s]), true), toggleFullscreen: async () => true, openExternal: async () => true, quit() {}, cloudSave: { read: async () => 'X', write: async () => true } } } });
  const p = initPlatform(); ok(p.kind === 'electron' && p.os === 'windows' && p.steam, 'electron steam detected'); ok(!p.shouldRegisterServiceWorker(), 'electron no SW'); p.unlockAchievement('firstSeed'); p.syncAchievements(['a', 'b']); p.reportStats({ STAT_SPECIES: 3 }); ok(calls.length === 4, 'bridge calls forwarded'); ok(p.cloudSave?.provider === 'steam', 'steam cloud save'); ok((await p.cloudSave!.load()) === 'X', 'cloud load'); }
// 4. Capacitor Android
{ const native: unknown[] = []; const cbs: Record<string, () => void> = {};
  const { w } = fakeWindow({ extra: { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android', nativePromise: async (pl: string, m: string, o: unknown) => (native.push([pl, m, o]), undefined), nativeCallback: (pl: string, m: string, o: any, cb: () => void) => { cbs[o.eventName] = cb; return 'id'; } } } });
  let consumed = true; let paused = 0;
  const p = initPlatform({ onBack: () => consumed, onPause: () => paused++ });
  ok(p.kind === 'capacitor' && p.os === 'android' && p.native, 'capacitor detected'); ok(!p.shouldRegisterServiceWorker(), 'capacitor no SW');
  ok(native.some((n: any) => n[0] === 'SystemBars' && n[1] === 'setStyle'), 'system bars styled');
  cbs.backButton(); ok(!native.some((n: any) => n[1] === 'minimizeApp'), 'consumed back does not minimise');
  consumed = false; cbs.backButton(); ok(native.some((n: any) => n[1] === 'minimizeApp'), 'unconsumed back minimises');
  cbs.pause(); ok(paused === 1, 'pause forwarded');
  p.haptic('success'); p.haptic('heavy'); ok(native.some((n: any) => n[0] === 'Haptics' && n[1] === 'notification' && n[2].type === 'SUCCESS') && native.some((n: any) => n[1] === 'impact' && n[2].style === 'HEAVY'), 'haptics mapped');
  p.setImmersive(true); ok(native.some((n: any) => n[0] === 'SystemBars' && n[1] === 'hide'), 'immersive hides bars'); void w; }
// 5. galaxy.click iframe + cloud save round trip
{ const { w } = fakeWindow({ framed: true, host: 'bioluma.vercel.app', referrer: 'https://galaxy.click/play/123' });
  const p = initPlatform(); ok(p.portal === 'galaxy' && !p.shouldRegisterServiceWorker(), 'galaxy detected, no SW');
  const saving = p.cloudSave!.save('BIOLUMA1.abc', 'Era 3');
  const [msg, origin] = w.posted[0] as [any, string]; ok(msg.action === 'save' && msg.slot === 0 && msg.data === 'BIOLUMA1.abc' && origin === 'https://galaxy.click', 'save message format');
  w.dispatchEvent({ type: 'message', origin: 'https://evil.example', data: { type: 'saved', error: false, slot: 0 } });
  w.dispatchEvent({ type: 'message', origin: 'https://galaxy.click', data: { type: 'saved', error: false, slot: 0 } });
  ok(await saving, 'save resolved by galaxy reply only');
  const loading = p.cloudSave!.load(); w.dispatchEvent({ type: 'message', origin: 'https://galaxy.click', data: { type: 'save_content', error: false, slot: 0, content: 'BIOLUMA1.abc' } }); ok((await loading) === 'BIOLUMA1.abc', 'load content'); }
// 6. itch.io + TWA
{ fakeWindow({ framed: true, host: 'html-classic.itch.zone' }); ok(detectPlatform().portal === 'itch', 'itch detected'); }
{ const { w } = fakeWindow({ referrer: 'android-app://com.bioluma.twa/' }); const p = initPlatform(); ok(p.kind === 'twa', 'twa detected'); ok(w.pushes === 1, 'back trap pushed'); let esc = 0; w.addEventListener('keydown', (e: any) => e.key === 'Escape' && esc++); w.dispatchEvent({ type: 'popstate' }); ok(esc === 1 && w.pushes === 2, 'first back -> Escape + re-trap'); w.dispatchEvent({ type: 'popstate' }); ok(w.backs === 1, 'second back within 2s exits'); }
console.log(fails ? `${fails} FAILED` : 'ALL OK'); process.exit(fails ? 1 : 0);
