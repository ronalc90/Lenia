/**
 * Phase 2B helper: wires a sessions-cycle Game (createGame({ cycle: 'sessions' })) to the session
 * screens already built here and in src/ui/tree — HUD clock, start card, end-of-session summary and
 * the research tree — so main.ts only mounts it, feeds `update(view)` every frame and pauses the dish
 * while `busy` (docs/CICLO.md §15.2).
 *
 *   const flow = createSessionFlow({ root: overlayLayer, hudHost, dish: dishContainer, game, bus, lang: () => lang });
 *   loop: flow.update(game.view()); game.isPaused = userPaused || flow.busy || …;
 *
 * Event map: 'sessionStart' → start card (not in session 1: VELA presents); 'sessionClock' → banner and
 * sounds; 'sessionExtended' → "+5 s"; 'sessionEnd' → "¡Tiempo!" stamp, then the summary
 * (game.lastSummary); summary → tree or game.actions.startSession(); tree buys → game.buyNode().
 */
import type { Bus, GameEvents } from '../../core/bus';
import type { GameView, Lang, Pattern, Text } from '../../core/types';
import type { Game } from '../../game/game';
import type { MomentPlate } from '../../moments/types';
import { treeCtxOf } from '../../game/session';
import { nextGoal, nodeText, sessionsToAfford } from '../../game/tree';
import { WORLD_BY_ID, worldOfSpecies, type WorldId } from '../../game/worlds';
import { catalogGroup, catalogPortrait } from '../../species';
import { createTreeView, type TreeSound, type TreeView } from '../tree';
import { createSessionHud, hudViewOf, type SessionHud, type SessionHudSound } from './hud';
import { createSessionStart, type SessionStartView } from './start';
import { shouldStartClock } from './clockGate';
import { celebrateNight } from './night';
import { createSessionSummary, type SessionSummaryView, type SummarySound } from './summary';
import { momentPlateKind } from '../moments/plates';

/** The Tree's button when it was opened from the dock before the first seed. */
const TREE_BACK: Text = { es: 'A la placa', en: 'To the dish' };

/** Every sound the session screens ask for (the host maps them to src/audio). */
export type SessionFlowSound = SessionHudSound | SummarySound | TreeSound;

export interface SessionFlowOptions {
  /** Layer for the start card, the summary and the tree (above the dish). */
  root: HTMLElement;
  /** Dish diameter (cells) of a Placa level on this device: the Placa nodes draw it to scale. */
  dishDiameter?(level: number): number;
  /** Where the clock pill goes (the centre of the game's HUD). */
  hudHost: HTMLElement;
  /** Where the "+12 Datos al terminar" pill goes (the game's dock); default under the clock. */
  previewHost?: HTMLElement;
  /** The dish container (the "¡Último minuto!" banner and the "¡Tiempo!" stamp go over it). */
  dish: HTMLElement;
  game: Game;
  bus: Bus<GameEvents>;
  lang(): Lang;
  reduceMotion?(): boolean;
  /** The current Encargo's request for the start card ("Ten 3 criaturas vivas a la vez."). */
  encargo?(): Text | null;
  onSound?(kind: SessionFlowSound): void;
  /** Tap on the Datos preview under the clock (the host opens the price sheet with summary.datosExplain). */
  onPreview?(): void;
  /** The start card waits while this is true (the one-time welcome card of an old save): never two cards. */
  holdStart?(): boolean;
  /**
   * (ADR-030 §2.8) What the run had no card for, as plates for the report: main.ts passes
   * moments.drainForSummary (it empties the Momentos' queue: nothing carries into the next run).
   */
  plates?(): MomentPlate[];
  /** A tap on one of today's plates in the report: main.ts opens that Momento again (moments.replay). */
  onPlate?(id: MomentPlate['id']): void;
  /** (§2.12, QA#14) The dish is lit (the Nevera's creatures are visible): «¡Empezar!» waits for it. */
  cultureReady?(): boolean;
  /**
   * (§2.4) The session-1 tutorial still holds the clock (story.holdsClock): while the game's session says
   * `tutorialHold`, the flow starts the clock as soon as this is false (story off or skipped: at once).
   */
  clockHold?(): boolean;
}

export interface SessionFlow {
  /** Call every frame (or every view refresh) with the latest view. */
  update(v: GameView): void;
  /** True while a card or the tree is open: the host keeps the dish (and the clock) paused. */
  readonly busy: boolean;
  /** The research tree is on screen (story scenes about it wait for it). */
  readonly treeOpen: boolean;
  /** A node's sheet is open in the tree (a VELA task pill pointing at the tree waits behind it). */
  readonly treeSheetOpen: boolean;
  /** A card covers the screen ("¡Tiempo!", the summary or the start card): nothing else should talk. */
  readonly cardOpen: boolean;
  openTree(): void;
  /** Re-render texts after a language change. */
  relabel(): void;
  dispose(): void;
}

export function createSessionFlow(o: SessionFlowOptions): SessionFlow {
  const { game, bus } = o;
  /** The run whose start card the player already closed with "¡Empezar!" (0 = none). */
  let startDoneFor = 0;
  /** The run the last 'sessionStart' set up: the same number again is the same run set up anew. */
  let lastStartN = 0;
  /** The night's celebration is on screen (it counts as a card). */
  let celebrating = false;
  const sound = (k: SessionFlowSound) => o.onSound?.(k);
  let stamping = false;
  /** Wall time the session-1 clock started waiting for the tutorial (-1 = not waiting). */
  let holdSince = -1;
  /** Last state pushed to the clock pill's pause chip. */
  let pausedShown = false;
  /** Merges of this run (VELA's tip in the report: «Hoy se juntaron 2…», docs/CLARIDAD2.md §2.5). */
  let merged = 0;

  function speciesInfo(id: string): { name: string; portrait: Pattern | null; hue?: number; latin?: string | null } | null {
    const sp = game.view().species.find((x) => x.id === id);
    // `latin`: the report's specimen photo carries the scientific name (docs/CLARIDAD2.md §2.13).
    return sp ? { name: sp.name, portrait: sp.portrait, hue: sp.hue, latin: sp.scientificName ?? null } : null;
  }

  /** A world's species: catalog portraits, the ones not in the Bestiary yet as silhouettes. */
  function worldSpecies(w: WorldId): { code: string; name: string; portrait: Pattern | null; found: boolean }[] {
    const have = new Map<string, string>();
    for (const sp of game.state.species) if (sp.catalogCode) have.set(catalogGroup(sp.catalogCode), sp.id);
    const seen = new Set<string>();
    return (WORLD_BY_ID[w]?.species ?? [])
      .filter((c) => !seen.has(catalogGroup(c)) && seen.add(catalogGroup(c)))
      .map((code) => {
        const id = have.get(catalogGroup(code));
        return { code, name: id ? (speciesInfo(id)?.name ?? code) : '?', portrait: catalogPortrait(code), found: !!id };
      });
  }

  const hud: SessionHud = createSessionHud(o.hudHost, {
    lang: o.lang,
    reduceMotion: o.reduceMotion,
    onSound: (k) => sound(k),
    onPreview: o.onPreview,
    previewHost: o.previewHost,
  });

  const start: SessionStartView = createSessionStart(o.root, {
    lang: o.lang,
    reduceMotion: o.reduceMotion,
    speciesInfo,
    worldSpecies,
    onPickWorld: (w) => void game.actions.pickWorld?.(w),
    livesIn: (id, w) => {
      const code = game.state.species.find((x) => x.id === id)?.catalogCode;
      return !!code && worldOfSpecies(code) === w;
    },
    onGo: () => {
      startDoneFor = game.session?.n ?? 0;
      start.hide();
    },
  });

  const tree: TreeView = createTreeView(o.root, {
    lang: o.lang,
    reduceMotion: o.reduceMotion,
    onBuy: (id) => game.buyNode(id),
    onNewSession: () => {
      tree.close();
      // The Tree opened from the dock while this run waits for its first seed: back to the dish, the run
      // is already set up (QA4 F-06). After a summary: the next run.
      if (game.session?.phase === 'ready' && !summary.isOpen && startDoneFor === game.session.n) return;
      summary.hide();
      game.actions.startSession?.();
    },
    onClose: () => tree.close(),
    onSound: (k) => sound(k),
    worldSpecies,
    dishDiameter: o.dishDiameter,
    // Opened from the dock while the run waits: the button goes back to the dish (QA4 F-06).
    goText: () => (game.session?.phase === 'ready' && !summary.isOpen && startDoneFor === game.session.n ? TREE_BACK : null),
  });

  const summary: SessionSummaryView = createSessionSummary(o.root, {
    lang: o.lang,
    reduceMotion: o.reduceMotion,
    speciesInfo: (id) => speciesInfo(id),
    onTree: () => openTree(),
    onNext: () => {
      summary.hide();
      game.actions.startSession?.();
    },
    onSound: (k) => sound(k),
    onPlate: o.onPlate ? (ref) => o.onPlate!(ref.id as MomentPlate['id']) : undefined,
  });

  function treeData() {
    const r = game.research!;
    const species = game.state.species.length;
    return { levels: r.levels, datos: r.datos, sessions: r.sessions, species, recentDatos: r.history.map((h) => h.datos) };
  }

  function openTree(): void {
    tree.update(treeData());
    tree.open();
  }

  let startPending = false;
  function showStart(): void {
    const s = game.session;
    const st = game.sessionStart;
    startPending = false;
    // Session 1 has no start card: VELA presents the dish (CLARIDAD §3.2 step 1).
    if (!s || !st || s.phase !== 'ready' || s.n <= 1) return;
    if (o.holdStart?.()) {
      startPending = true;
      return;
    }
    // «¡Empezar!» starts waiting: the run's culture is set to incubate right after this event (main.ts),
    // so the dish's state now is the last run's; update() enables it once the new culture is lit.
    start.show(st, { encargo: o.encargo?.() ?? null, seedPrice: game.view().seedCost, ready: !o.cultureReady });
  }

  function showSummary(): void {
    const sum = game.lastSummary;
    const r = game.research;
    if (!sum || !r) return;
    const ctx = treeCtxOf(r, game.state.species.length);
    const goal = nextGoal(ctx);
    const v = game.view();
    const extras = {
      affordable: Math.max(0, (v.research?.affordable ?? 0) - (v.research?.nightReady ? 1 : 0)),
      nextGoal:
        goal && goal.missingDatos > 0
          ? { name: nodeText(goal.id).name, missing: goal.missingDatos, sessions: sessionsToAfford(goal.missingDatos, r.history.map((h) => h.datos)) }
          : null,
      // The Momentos' plates as the report's PlateRef: the plate number comes from the illustration (PD).
      plates: (o.plates?.() ?? []).map((p) => ({ id: p.id, kind: momentPlateKind(p), title: p.title })),
      merged,
    };
    summary.show(sum, extras);
  }

  const offs = [
    bus.on('sessionStart', ({ n }) => {
      const again = n === lastStartN;
      if (!again) merged = 0;
      lastStartN = n;
      tree.update(treeData());
      // The same run set up anew while it waits (a node bought, a world picked): the player stays where
      // they are (QA4 F-06: each purchase in the dock's Tree closed it and brought the start card back).
      if (again && startDoneFor === n) return;
      if (again && tree.isOpen && !start.isOpen) return;
      // However the new session was asked for (summary, tree, host), the cards from the last one close.
      if (tree.isOpen) tree.close();
      if (summary.isOpen) summary.hide();
      showStart();
    }),
    bus.on('creatureExploded', ({ cause }) => {
      if (cause === 'touch' && game.session?.phase === 'running') merged++;
    }),
    bus.on('sessionExtended', ({ seconds, reason }) => hud.extended(seconds, reason, reason === 'species' && game.state.species.length <= 1)),
    bus.on('sessionClock', ({ type }) => {
      if (type === 'lastMinute') hud.lastMinute(o.dish);
    }),
    bus.on('sessionEnd', () => {
      stamping = true;
      void hud.timesUp(o.dish).then(() => {
        stamping = false;
        showSummary();
      });
    }),
    bus.on('nodeBought', ({ id, level }) => {
      tree.update(treeData());
      // The night moves on: celebrate it (QA4 F-12).
      if (id === 'lab') {
        celebrating = true;
        void celebrateNight(o.root, level, { lang: o.lang, reduceMotion: o.reduceMotion, onSound: (k) => k === 'close' && sound('close') }).then(() => (celebrating = false));
      }
    }),
  ];

  // A game loaded with a session waiting (not the first) opens on its start card.
  showStart();
  lastStartN = game.session?.n ?? 0;

  return {
    update(v) {
      if (startPending && !o.holdStart?.()) showStart();
      const s = game.session;
      if (!s) return;
      // «¡Empezar!» waits until the Nevera's creatures are lit on the dish (QA#14).
      if (start.isOpen) start.setReady(o.cultureReady?.() ?? true);
      // Session 1: the first creature is the player's; the clock starts when VELA lets it (§2.4).
      if (s.phase === 'ready' && v.session?.tutorialHold) {
        const now = performance.now();
        if (holdSince < 0) holdSince = now;
        if (shouldStartClock(v.session, o.clockHold?.() ?? false, now - holdSince)) game.actions.startClock?.();
      } else holdSince = -1;
      // The clock pill says when it waits for the player (VELA talking, a sheet, a card: §2.3).
      const paused = s.phase === 'running' && game.isPaused;
      if (paused !== pausedShown) {
        pausedShown = paused;
        hud.setPaused?.(paused);
      }
      hud.update(hudViewOf(s, v.session?.sprint ?? 1));
      const p = v.sessionPreview;
      hud.preview(p ? { datos: p.datos, goal: p.goal ? { name: nodeText(p.goal.id).name, missing: p.goal.missing } : null } : null);
    },
    get busy() {
      // A start card waiting for its turn (behind the welcome card) counts: nothing slips in between.
      return stamping || startPending || celebrating || start.isOpen || summary.isOpen || tree.isOpen;
    },
    get treeOpen() {
      return tree.isOpen;
    },
    get treeSheetOpen() {
      return tree.sheetOpen;
    },
    get cardOpen() {
      return stamping || startPending || celebrating || start.isOpen || (summary.isOpen && !tree.isOpen);
    },
    openTree,
    relabel() {
      tree.relabel();
    },
    dispose() {
      for (const off of offs) off();
      hud.dispose();
      start.dispose();
      summary.dispose();
      tree.dispose();
    },
  };
}
