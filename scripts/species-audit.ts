/**
 * Species audit: do seeds become varied, finished, recognisable species?
 *
 *   npx vite-node scripts/species-audit.ts [tag=after] [players=4] [seedsPerPlayer=48] [steps=3000]
 *
 * Simulates game-style spore seeding on the CPU reference (CpuLenia + applySeedCpu, the same seed
 * geometry as the GPU), with the REAL seed specs from the game (createGame → actions.seedAt), the
 * REAL detector and the REAL game logic (fake bus). Each "player" is one game walking through a few
 * calibrations inside the Calibrador I/II ranges, 4 spores per 128×128 dish. Players run in parallel
 * child processes. Portraits are captured exactly like src/main.ts does (sim.capture on speciesNew)
 * plus any portrait requests the game makes (game.takePortraitRequests, when it exists).
 *
 * Output (scratch dir or $AUDIT_OUT): species-<tag>.json, species-<tag>.html and a contact sheet
 * species-<tag>.png rendered with playwright-core + the preinstalled Chromium (never `playwright install`).
 * Not shipped; used to measure and to show before/after evidence.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bus, type GameEvents } from '../src/core/bus';
import { matterLUT } from '../src/core/palette';
import type { DetectorReport, Pattern, SeedSpec } from '../src/core/types';
import { createDetector } from '../src/detect/detector';
import { CATALOG_REFS } from '../src/detect/catalogRefs';
import { signatureDistance, SIG, SIG_UNKNOWN } from '../src/detect/signature';
import * as B from '../src/game/balance';
import { createGame, type Game } from '../src/game/game';
import { scaledTemplate } from '../src/game/seeding';
import { seededRng } from '../src/game/testUtil';
import { CATALOG } from '../src/sim/catalog';
import { CpuLenia } from '../src/sim/cpu';
import { applySeedCpu } from '../src/sim/seed';
import { snapshotFromCpu } from '../src/sim/snapshot';

const SCRATCH = '/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad';
const OUT = process.env.AUDIT_OUT ?? (existsSync(SCRATCH) ? SCRATCH : join(process.cwd(), 'audit-out'));
const SIZE = 128;
const EVERY = 10; // steps between detector updates (game: one snapshot every 10 steps)
const STEPS_PER_SEC = 30; // src/main.ts
const SPOTS = [
  [32, 32],
  [96, 32],
  [32, 96],
  [96, 96],
] as const;

/** Calibrations a player walks through: base first, then Calibrador I, then Calibrador II. */
const CALIBS: { mu: number; sigma: number; cal: number }[] = [
  { mu: 0.15, sigma: 0.015, cal: 0 },
  { mu: 0.156, sigma: 0.0224, cal: 1 },
  { mu: 0.174, sigma: 0.022, cal: 1 },
  { mu: 0.13, sigma: 0.012, cal: 1 },
  { mu: 0.165, sigma: 0.019, cal: 1 },
  { mu: 0.22, sigma: 0.034, cal: 2 },
  { mu: 0.25, sigma: 0.04, cal: 2 },
  { mu: 0.122, sigma: 0.0106, cal: 1 },
  { mu: 0.29, sigma: 0.045, cal: 2 },
  { mu: 0.2, sigma: 0.03, cal: 2 },
  { mu: 0.14, sigma: 0.02, cal: 1 },
  { mu: 0.283, sigma: 0.047, cal: 2 },
];

interface Crop {
  w: number;
  h: number;
  /** base64 uint8 */
  d: string;
}
interface SpeciesRec {
  player: number;
  id: string;
  name: string;
  subtitle: string | null;
  catalogCode: string | null;
  catalogName: string | null;
  hue: number | null;
  behavior: string | null;
  rarity: string;
  timesSeen: number;
  regStep: number;
  regCalib: { mu: number; sigma: number };
  regAge: number;
  regSig: number[];
  regComplete: boolean;
  regParts: number;
  nearestCatalog: string;
  nearestDist: number;
  /** Portrait as the game captured it (raw capture handed to setSpeciesPortrait). */
  rawPortrait: Crop | null;
  /** Portrait as the bestiary shows it (view().species[].portrait). */
  viewPortrait: Crop | null;
  /** Members captured later (any creature assigned to this species). */
  members: Crop[];
  /** Per-member signature distance to the species signature at the time (shape coherence). */
  memberDist: number[];
  /** Founder still alive & stable 1000 steps after registration. */
  founderPersisted: boolean | null;
}
interface PlayerResult {
  player: number;
  seeds: number;
  stableEver: number;
  firstStableSec: number | null;
  firstSpeciesSec: number | null;
  templates: Record<string, number>;
  species: SpeciesRec[];
  /** Synchronous portrait captures the integrator had to make. */
  captures: number;
  /** Creatures that became stable, by calibration "μ/σ" (and spores seeded there). */
  stableByCalib?: Record<string, number>;
  seedsByCalib?: Record<string, number>;
  secs: number;
}

const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64');
function toCrop(p: Pattern): Crop {
  const u = new Uint8Array(p.w * p.h);
  for (let i = 0; i < u.length; i++) u[i] = Math.round(Math.min(1, Math.max(0, p.data[i] || 0)) * 255);
  return { w: p.w, h: p.h, d: b64(u) };
}

/** Same crop as WebGLSim.capture: top-left at round(x - n/2), wrapping. */
function cpuCapture(sim: CpuLenia, x: number, y: number, size: number): Pattern {
  const n = Math.max(1, Math.round(size));
  const x0 = Math.round(x - n / 2);
  const y0 = Math.round(y - n / 2);
  const data = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    const gy = (((y0 + j) % sim.h) + sim.h) % sim.h;
    for (let i = 0; i < n; i++) {
      const gx = (((x0 + i) % sim.w) + sim.w) % sim.w;
      data[j * n + i] = sim.A[gy * sim.w + gx];
    }
  }
  return { w: n, h: n, data };
}

function nearestRef(sig: number[]): { code: string; d: number } {
  let best = { code: '-', d: Infinity };
  for (const r of CATALOG_REFS) {
    if (!r.viable) continue;
    const d = signatureDistance(sig, r.signature);
    if (d < best.d) best = { code: r.code, d };
  }
  return best;
}

type PortraitReq = { speciesId: string; creatureId: number; x: number; y: number; size: number };
type GameExt = Game & {
  takePortraitRequests?: () => PortraitReq[];
  setSpeciesPortrait: (id: string, p: Pattern, creatureId?: number) => void;
};

function runPlayer(player: number, seedsWanted: number, steps: number): PlayerResult {
  const t0 = Date.now();
  const bus = new Bus<GameEvents>();
  let clock = 1e12;
  const game = createGame({ bus, rng: seededRng(9000 + player * 7919), now: () => clock, grid: { w: SIZE, h: SIZE } }) as GameExt;
  game.setGridSize(SIZE, SIZE);
  const st = game.state as unknown as {
    essence: number;
    upgrades: Record<string, number>;
    unlocked: string[];
    objective: number;
    stats: { stableEver: number };
    charges?: { free: number; guaranteed: number };
  };
  st.objective = B.OBJECTIVES.length;
  st.charges = { free: 0, guaranteed: 0 }; // plain spores only (comparable across versions)
  st.upgrades.calibrator = 2;
  if (!st.unlocked.includes('calibrator')) st.unlocked.push('calibrator');

  const species = new Map<string, SpeciesRec>();
  const pendingFounder = new Map<string, { id: number; step: number; dish: number }>();
  let sim: CpuLenia | null = null;
  let last: DetectorReport | null = null;
  let globalStep = 0;
  let dishNo = 0;
  let firstStableSec: number | null = null;
  let firstSpeciesSec: number | null = null;
  let gameSec = 0;
  const templates: Record<string, number> = {};
  const stableByCalib: Record<string, number> = {};
  const seedsByCalib: Record<string, number> = {};
  let calibKey = '';
  let captures = 0;
  const captureSize = () => Math.min(64, Math.ceil(game.simParams.R * 4));

  bus.on('creatureStable', () => {
    if (firstStableSec === null) firstStableSec = gameSec;
    stableByCalib[calibKey] = (stableByCalib[calibKey] ?? 0) + 1;
  });
  /** Template code of a spore (scaledTemplate caches one Pattern object per code and R). */
  const codeOf = (p: Pattern | undefined): string => {
    if (!p) return 'none';
    const e = CATALOG.find((c) => scaledTemplate(c, game.simParams.R) === p);
    return e ? e.code : `${p.w}x${p.h}`;
  };
  bus.on('speciesNew', ({ speciesId, x, y }) => {
    if (firstSpeciesSec === null) firstSpeciesSec = gameSec;
    const raw = cpuCapture(sim!, x, y, captureSize());
    // Legacy wiring (src/main.ts before portrait requests): capture on 'speciesNew'.
    if (!game.takePortraitRequests) game.setSpeciesPortrait(speciesId, raw);
    const c = last?.creatures.reduce<{ c: DetectorReport['creatures'][number] | null; d: number }>(
      (best, cr) => {
        const d = Math.hypot(cr.x - x, cr.y - y);
        return d < best.d ? { c: cr, d } : best;
      },
      { c: null, d: Infinity },
    ).c;
    const sig = c?.signature ?? [];
    const near = nearestRef(sig);
    species.set(speciesId, {
      player,
      id: speciesId,
      name: '',
      subtitle: null,
      catalogCode: null,
      catalogName: null,
      hue: null,
      behavior: null,
      rarity: '',
      timesSeen: 0,
      regStep: globalStep,
      regCalib: { mu: game.simParams.mu, sigma: game.simParams.sigma },
      regAge: c?.age ?? -1,
      regSig: sig.map((v) => +v.toFixed(4)),
      regComplete: sig.length > 0 && sig.every((v) => v !== SIG_UNKNOWN),
      regParts: sig[SIG.PARTS] ?? -1,
      nearestCatalog: near.code,
      nearestDist: +near.d.toFixed(3),
      rawPortrait: toCrop(raw),
      viewPortrait: null,
      members: [],
      memberDist: [],
      founderPersisted: null,
    });
    if (c) pendingFounder.set(speciesId, { id: c.id, step: globalStep, dish: dishNo });
  });

  const seedsPerCalib = Math.max(SPOTS.length, Math.ceil(seedsWanted / CALIBS.length / SPOTS.length) * SPOTS.length);
  let seeds = 0;
  for (const cal of CALIBS) {
    if (seeds >= seedsWanted) break;
    game.setRulesForTests({ mu: cal.mu, sigma: cal.sigma });
    calibKey = `${cal.mu}/${cal.sigma}`;
    for (let k = 0; k < seedsPerCalib / SPOTS.length && seeds < seedsWanted; k++) {
      dishNo++;
      // A fresh dish: the game forgets the old creatures (empty report), new sim + detector.
      game.tick(0, { step: 0, creatures: [], events: [], totalMass: 0, fill: 0 });
      sim = new CpuLenia(SIZE, SIZE, game.simParams);
      const det = createDetector();
      st.essence = 1e12;
      for (const [x, y] of SPOTS) {
        const spec = game.actions.seedAt(x, y) as SeedSpec | null;
        if (!spec) continue;
        seeds++;
        seedsByCalib[calibKey] = (seedsByCalib[calibKey] ?? 0) + 1;
        const tplKey = codeOf(spec.pattern);
        templates[tplKey] = (templates[tplKey] ?? 0) + 1;
        applySeedCpu(sim.A, SIZE, SIZE, spec, seeds);
        // The game lets only a few spores form at once; the audit's 4 spaced spores are one batch.
        game.tick(B.SEED_PENDING_WINDOW + 0.1, null);
      }
      for (let s = 0; s < steps; s += EVERY) {
        sim.step(EVERY);
        globalStep += EVERY;
        gameSec += EVERY / STEPS_PER_SEC;
        clock += (EVERY / STEPS_PER_SEC) * 1000;
        last = det.update(snapshotFromCpu(sim.A, SIZE, SIZE, 2, sim.stepCount), game.simParams);
        game.tick(EVERY / STEPS_PER_SEC, last);
        for (const r of game.takePortraitRequests?.() ?? []) {
          captures++;
          game.setSpeciesPortrait(r.speciesId, cpuCapture(sim, r.x, r.y, r.size), r.creatureId);
        }
        // Founder persistence check.
        for (const [sid, f] of pendingFounder) {
          if (f.dish !== dishNo) {
            species.get(sid)!.founderPersisted ??= false;
            pendingFounder.delete(sid);
          } else if (globalStep - f.step >= 1000) {
            const c = last.creatures.find((cr) => cr.id === f.id);
            species.get(sid)!.founderPersisted = !!c && c.state === 'stable';
            pendingFounder.delete(sid);
          }
        }
        // Member samples every 500 steps after the creatures had time to settle.
        if (sim.stepCount >= 1000 && sim.stepCount % 500 === 0) {
          const v = game.view();
          for (const cv of v.creatures) {
            if (!cv.speciesId || cv.state !== 'stable') continue;
            const rec = species.get(cv.speciesId);
            if (!rec || rec.members.length >= 7) continue;
            rec.members.push(toCrop(cpuCapture(sim, cv.x, cv.y, captureSize())));
            const cr = last.creatures.find((x) => x.id === cv.id);
            const spv = v.species.find((x) => x.id === cv.speciesId);
            void spv;
            const ss = (game.state as unknown as { species: { id: string; signature: number[] }[] }).species.find(
              (x) => x.id === cv.speciesId,
            );
            if (cr && ss) rec.memberDist.push(+signatureDistance(cr.signature, ss.signature).toFixed(2));
          }
        }
      }
    }
  }
  for (const [sid] of pendingFounder) species.get(sid)!.founderPersisted ??= null;
  // Final species views.
  const v = game.view();
  for (const sv of v.species) {
    const rec = species.get(sv.id);
    if (!rec) continue;
    rec.name = sv.name;
    rec.subtitle = [sv.scientificName, sv.shapeLabel?.es, sv.subtitle].filter(Boolean).join(' · ') || null;
    const ext = sv;
    rec.catalogName = sv.catalogName;
    rec.catalogCode = (game.state as unknown as { species: { id: string; catalogCode: string | null }[] }).species.find(
      (x) => x.id === sv.id,
    )!.catalogCode;
    rec.hue = typeof ext.hue === 'number' ? ext.hue : null;
    rec.behavior = sv.behavior;
    rec.rarity = sv.rarity;
    rec.timesSeen = sv.timesSeen;
    rec.viewPortrait = sv.portrait ? toCrop(sv.portrait) : null;
  }
  return {
    player,
    seeds,
    stableEver: st.stats.stableEver,
    firstStableSec,
    firstSpeciesSec,
    templates,
    species: [...species.values()],
    captures: game.takePortraitRequests ? captures : species.size,
    stableByCalib,
    seedsByCalib,
    secs: (Date.now() - t0) / 1000,
  };
}

// ───────────────────────────── contact sheet ─────────────────────────────

function sheetHtml(tag: string, results: PlayerResult[], summary: string[]): string {
  const lut = Array.from(matterLUT());
  const data = JSON.stringify(results.map((r) => r.species));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{background:#0B0E12;color:#E6EDF3;font:13px/1.35 system-ui,sans-serif;margin:16px;width:1500px}
h1{font-size:20px;margin:0 0 6px} pre{color:#8B98A5;margin:0 0 12px;font-size:12px;white-space:pre-wrap}
.p{margin:14px 0 4px;font-weight:600;color:#5BC0EB}
.row{display:flex;align-items:center;gap:8px;border-top:1px solid #1B232C;padding:4px 0}
.lab{width:330px;flex:none} .lab b{font-size:14px} .lab i{color:#8B98A5} .lab small{color:#8B98A5;display:block}
canvas{background:#05070a;border-radius:6px} .big{outline:2px solid #2a3440} .sw{width:14px;height:14px;border-radius:50%;display:inline-block;vertical-align:middle;margin-right:6px}
.tag{font-size:11px;padding:1px 6px;border-radius:8px;background:#1B232C;margin-left:4px}
.bad{background:#5a1f12;color:#ffb39c}.ok{background:#173d12;color:#bdf59a}
</style></head><body><h1>Bioluma species audit — ${tag}</h1><pre>${summary.join('\n')}</pre><div id=root></div><script>
const LUT=${JSON.stringify(lut)};
const players=${data};
function dec(c){const s=atob(c.d);const a=new Float32Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i)/255;return {w:c.w,h:c.h,data:a};}
function bounds(p){let x0=p.w,y0=p.h,x1=-1,y1=-1;for(let y=0;y<p.h;y++)for(let x=0;x<p.w;x++)if(p.data[y*p.w+x]>0.04){if(x<x0)x0=x;if(y<y0)y0=y;if(x>x1)x1=x;if(y>y1)y1=y;}if(x1<0)return{x0:0,y0:0,x1:p.w-1,y1:p.h-1};return{x0,y0,x1,y1};}
function samp(p,x,y){const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;const at=(a,b)=>a<0||b<0||a>=p.w||b>=p.h?0:p.data[b*p.w+a];const a=at(x0,y0)*(1-fx)+at(x0+1,y0)*fx,b=at(x0,y0+1)*(1-fx)+at(x0+1,y0+1)*fx;return a*(1-fy)+b*fy;}
// Same as src/ui/portrait.ts renderPattern (bounds-fit, fill 0.72) when fit=true; raw 1:1 crop otherwise.
function draw(p,size,fit){const c=document.createElement('canvas');c.width=size;c.height=size;const g=c.getContext('2d');const img=g.createImageData(size,size);
 let sc,cx,cy;if(fit){const b=bounds(p);sc=Math.max(b.x1-b.x0+1,b.y1-b.y0+1)/(size*0.72);cx=(b.x0+b.x1+1)/2;cy=(b.y0+b.y1+1)/2;}else{sc=Math.max(p.w,p.h)/size;cx=p.w/2;cy=p.h/2;}
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const v=samp(p,cx+(x+0.5-size/2)*sc-0.5,cy+(y+0.5-size/2)*sc-0.5);const k=Math.max(0,Math.min(255,Math.round(v*255)))*4;const i=(y*size+x)*4;img.data[i]=LUT[k];img.data[i+1]=LUT[k+1];img.data[i+2]=LUT[k+2];img.data[i+3]=255;}
 g.putImageData(img,0,0);return c;}
const root=document.getElementById('root');
players.forEach((list,pi)=>{const h=document.createElement('div');h.className='p';h.textContent='Player '+(pi+1)+' — '+list.length+' species';root.appendChild(h);
 list.forEach(s=>{const row=document.createElement('div');row.className='row';const lab=document.createElement('div');lab.className='lab';
  const sw=s.hue!=null?'<span class=sw style="background:hsl('+s.hue+',70%,60%)"></span>':'';
  const cat=s.catalogCode?'<span class="tag ok">'+s.catalogCode+'</span>':'<span class="tag">unknown</span>';
  const pers=s.founderPersisted===false?'<span class="tag bad">founder lost</span>':'';
  const inc=s.regComplete?'':'<span class="tag bad">sig incomplete</span>';
  lab.innerHTML=sw+'<b>'+s.name+'</b>'+cat+inc+pers+(s.subtitle?'<small>'+s.subtitle+'</small>':'')+(s.catalogName&&s.catalogName!==s.name?'<i> '+s.catalogName+'</i>':'')+
   '<small>'+s.id+' · '+(s.behavior||'—')+' · seen '+s.timesSeen+' · μ '+s.regCalib.mu+' σ '+s.regCalib.sigma+' · age '+s.regAge+' · parts '+(+s.regParts).toFixed(2)+'</small>'+
   '<small>nearest catalog '+s.nearestCatalog+' d='+s.nearestDist+' · member d: '+s.memberDist.join(' ')+'</small>';
  row.appendChild(lab);
  if(s.viewPortrait){const c=draw(dec(s.viewPortrait),112,true);c.className='big';c.title='bestiary portrait';row.appendChild(c);} else {const d=document.createElement('div');d.style.width='112px';d.textContent='(no portrait)';row.appendChild(d);}
  if(s.rawPortrait){const c=draw(dec(s.rawPortrait),80,false);c.title='raw capture';row.appendChild(c);}
  const sep=document.createElement('div');sep.style.width='10px';row.appendChild(sep);
  s.members.forEach(m=>row.appendChild(draw(dec(m),80,false)));
  root.appendChild(row);});});
</script></body></html>`;
}

async function screenshot(htmlPath: string, pngPath: string): Promise<void> {
  const { chromium } = await import('playwright-core');
  const base = '/opt/pw-browsers';
  const dir = readdirSync(base).find((d) => /^chromium-\d+$/.test(d));
  if (!dir) throw new Error('no chromium under /opt/pw-browsers');
  const exe = [join(base, dir, 'chrome-linux', 'chrome'), join(base, dir, 'chrome-linux64', 'chrome')].find(existsSync);
  if (!exe) throw new Error('chrome binary not found');
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1540, height: 900 } });
  await page.goto('file://' + htmlPath);
  await page.waitForTimeout(300);
  await page.screenshot({ path: pngPath, fullPage: true });
  await browser.close();
}

// ───────────────────────────── stats ─────────────────────────────

function summarize(tag: string, results: PlayerResult[]): string[] {
  const all = results.flatMap((r) => r.species);
  const catalog = all.filter((s) => s.catalogCode);
  const unknown = all.filter((s) => !s.catalogCode);
  const distinctCodes = new Set(catalog.map((s) => s.catalogCode));
  const incomplete = all.filter((s) => !s.regComplete);
  const multiPart = all.filter((s) => s.regParts > 1.2);
  const lost = all.filter((s) => s.founderPersisted === false);
  const incoherent = all.filter((s) => s.memberDist.length && s.memberDist.reduce((a, b) => a + b, 0) / s.memberDist.length > 2);
  // "Amorphous": an unknown species registered from an unfinished shape (incomplete signature,
  // multi-part, founder vanished/changed, or members that do not even match their own species).
  const amorph = unknown.filter(
    (s) => !s.regComplete || s.regParts > 1.2 || s.founderPersisted === false || incoherent.includes(s),
  );
  const seeds = results.reduce((a, r) => a + r.seeds, 0);
  const stable = results.reduce((a, r) => a + r.stableEver, 0);
  const tpl: Record<string, number> = {};
  for (const r of results) for (const [k, n] of Object.entries(r.templates)) tpl[k] = (tpl[k] ?? 0) + n;
  const fs = results.map((r) => (r.firstStableSec === null ? '—' : r.firstStableSec.toFixed(0) + 's')).join(', ');
  const fsp = results.map((r) => (r.firstSpeciesSec === null ? '—' : r.firstSpeciesSec.toFixed(0) + 's')).join(', ');
  const perPlayer = results.map((r) => r.species.length).join(', ');
  return [
    `tag ${tag} · ${results.length} players · ${seeds} spores · ${stable} stable creatures`,
    `species registered: ${all.length} (per player ${perPlayer})`,
    `  catalog-revealed: ${catalog.length} (distinct codes ${distinctCodes.size}: ${[...distinctCodes].join(' ')})`,
    `  unknown: ${unknown.length} · amorphous-looking unknown: ${amorph.length}`,
    `  registered with incomplete signature: ${incomplete.length} · multi-part: ${multiPart.length} · founder lost <1000 steps: ${lost.length} · incoherent members: ${incoherent.length}`,
    `spore templates: ${Object.entries(tpl)
      .map(([k, n]) => `${k}×${n}`)
      .join(' ')}`,
    `first stable creature (game s): ${fs} · first species: ${fsp}`,
    `portrait captures (sync GPU reads): ${results.reduce((a, r) => a + r.captures, 0)} for ${all.length} species`,
    `stable creatures / spores by calibration: ${Object.keys(results[0]?.seedsByCalib ?? {})
      .map((k) => `${k} ${results.reduce((a, r) => a + (r.stableByCalib?.[k] ?? 0), 0)}/${results.reduce((a, r) => a + (r.seedsByCalib?.[k] ?? 0), 0)}`)
      .join(' · ')}`,
  ];
}

// ───────────────────────────── main ─────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const wi = argv.indexOf('--worker');
  if (wi >= 0) {
    const player = Number(argv[wi + 1]);
    const seeds = Number(argv[wi + 2]);
    const steps = Number(argv[wi + 3]);
    const outFile = argv[wi + 4];
    const res = runPlayer(player, seeds, steps);
    writeFileSync(outFile, JSON.stringify(res));
    return;
  }
  const tag = argv[0] ?? 'after';
  const players = Number(argv[1] ?? 4);
  const seeds = Number(argv[2] ?? 48);
  const steps = Number(argv[3] ?? 3000);
  mkdirSync(OUT, { recursive: true });
  const self = fileURLToPath(import.meta.url);
  const t0 = Date.now();
  const files = await Promise.all(
    Array.from({ length: players }, (_, p) => {
      const f = join(OUT, `species-${tag}-p${p}.json`);
      return new Promise<string>((resolve, reject) => {
        const child = spawn('npx', ['vite-node', self, '--', '--worker', String(p), String(seeds), String(steps), f], {
          stdio: ['ignore', 'inherit', 'inherit'],
        });
        child.on('exit', (code) => (code === 0 ? resolve(f) : reject(new Error(`worker ${p} exited ${code}`))));
      });
    }),
  );
  const results = files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as PlayerResult);
  const summary = summarize(tag, results);
  summary.push(`wall time ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  for (const l of summary) console.log(l);
  for (const r of results) {
    for (const s of r.species) {
      console.log(
        `p${r.player} ${s.id.padEnd(5)} ${(s.name || '').padEnd(28)} ${(s.catalogCode ?? '-').padEnd(6)} ${(s.behavior ?? '-').padEnd(8)} ` +
          `μ${s.regCalib.mu} σ${s.regCalib.sigma} age ${s.regAge} complete ${s.regComplete ? 'y' : 'n'} parts ${(+s.regParts).toFixed(2)} ` +
          `near ${s.nearestCatalog} ${s.nearestDist} founder ${s.founderPersisted} seen ${s.timesSeen} memberD [${s.memberDist.join(',')}]`,
      );
    }
  }
  writeFileSync(join(OUT, `species-${tag}.json`), JSON.stringify({ summary, results }));
  const html = join(OUT, `species-${tag}.html`);
  writeFileSync(html, sheetHtml(tag, results, summary));
  const png = join(OUT, `species-${tag}.png`);
  await screenshot(html, png);
  console.log('contact sheet:', png);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
