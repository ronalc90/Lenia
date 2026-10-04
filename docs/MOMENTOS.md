# Momentos — first-time explainers ("¿Qué pasó?")

> Owner's complaint after play-testing: *"When something happens the game should STOP for a moment and EXPLAIN — with an
> animation and a clear menu — so you understand what happened. Everything happens too fast; you can't tell things apart.
> It must be more descriptive, more animated, more visually explanatory and clear for ANY person."*

**Momentos** answer it. The first time something important happens, the game **slows to a stop**, the camera **zooms on
the event**, the rest of the dish **dims around a spotlight** (pulsing ring + bouncing arrow), and a **card slides up**:
icon and big title, a **looping diagram drawn from real Lenia**, VELA's animated portrait saying **1–2 short lines**,
consequence chips ("+1,2 Esencia/s", "−2 Esencia", "×1,6 Esencia") and a big **"¡Entendido!"**. Closing eases the camera
back and fades the game in. Each moment is explained **once** (persisted); the **"¿Qué pasó?"** sheet re-plays any card.

Also in this layer: **creature status pills** over the dish (*Naciendo 62 %*, *Estable ✓ +1,2/s ➤*, *Explotó ✗*,
*Se disuelve…*), the **seed price explainer** (sheet, slot meter, "¿Por qué cuesta más?" moment) and the **species
card / comparison** ("¿Por qué esta rinde más?", §2b).

The test we hold every card to: *would a 5-year-old and a grandparent understand what just happened?* (QA2-claridad.md).

---

## 1. Catalog (23 moments)

Titles ≤ 4 words, 1–2 lines of ≤ 14 words, es + en (tests enforce it). Priority decides the order when several happen
together; a moment with a delay waits for the player to *see* the event first.

| id | When (first time) | Focus | Diagram (real Lenia unless noted) | Chips | Replaces story scene |
|---|---|---|---|---|---|
| `seed` | first manual seed (`seed`, manual) | the seed, ×2.4 | triptych: same kind of spore → *se apaga* / *lo inunda* / *¡vive!* + "how much matter" bars | −cost Esencia | `t_wait` |
| `dissolve` | first `creatureDied` | the spot, ×2.2 | spore fading away + "Materia" gauge falling to *poca* | 0 Esencia/s | `t_fail` |
| `explode` | first `creatureExploded` | the blob, ×1.5 | blob flooding the box (orange) + gauge to *demasiada* | 0 Esencia/s | `t_explode` |
| `stable` | first `creatureStable` | the creature, ×2.4 | spore settling into an Orbium ✓ + gauge in *justo* + "+1/s" | +eps Esencia/s | `t_stable`, `t_essence` |
| `income` | first `income` | creature + HUD essence | Orbium → drops flying along an arc into a counter (+1 each) | +eps/s | `t_essence` |
| `species` | first `speciesNew` | creature + Bestiary tab | photo flash → card flies into the Bestiary book, "+1 Muestra" | +N Muestra, species name | `t_bestiary` |
| `secondSpecies` | first `speciesNew` while another species is registered | **both** creatures (zoom fits the two) + Bestiary tab | the two **species cards side by side** (portrait in each species' hue, shape, behaviour, yield receipt) + one sentence saying why one earns more | (names, brief label only) | — |
| `behavior.still` | first `behaviorNew` still | creature | Helicium stays put: crosshair, pin, clock | ×1,0, +1 Muestra | — |
| `behavior.pulsing` | … pulsing | creature | Circium ventilans + pulse rings + live "heartbeat" graph of its real mass | ×1,3 | — |
| `behavior.swimmer` | … swimmer | creature | Orbium crossing a strip along its real path, chevron trail | ×1,6 | — |
| `behavior.spinner` | … spinner | creature | Gyrorbium circling, rotating arcs, its real centre path ×3 | ×1,8 | — |
| `behavior.divider` | … divider | creature | 1 → 2 → 4 split (real Orbium frames, composited) | ×2,2 | — (also marks `division`) |
| `behavior.colony` | … colony | creature | three alike + dashed hull | ×2,5 | — |
| `division` | first `creatureDivided` | the spot, ×1.8 | 1 → 2 | ×2 criaturas | — |
| `golden` | first `goldenSpawn` (only if the Spark is still there) | the Spark | spark drifting → finger taps → gift "¡Premio!" (drawn) | Regalo sorpresa, 12 s | `t_golden` |
| `upgrade` | first `upgradeBought` | Lab tab | Dropper: 4 real spores before (1 ✓) / now (3 ✓); Dish: one more cheap slot; others: level pips (drawn) | name + level, effect text | — |
| `autoseed` | first `seed` with manual = false | the seed, ×1.8 | robot dropper planting real spores, "−2" | −cost | — |
| `calibration` | first `calibrationChanged`, **after the slider rests 1.6 s** | Calibrate tab | **the same spore under the old and the new rules** (simulated with the player's μ/σ/R/dt) ✓/✗ | "σ 0,0150 → 0,0260" | — |
| `seedPrice` | seed price first ≥ 2× the empty-dish price, or over the free slots | seed pill | dish with N cheap slots filling; price tag bounces, **×3** past capacity, formula | Siembra: 9, Espacios 2/1 | — |
| `seedCheaper` | price drops right after a death (after `seedPrice`) | the spot | **brief label only**: "Murió una criatura → sembrar es más barato" | Siembra: N | — |
| `overgrown` | `dishOvergrown {on:true}` | **zoom out**, whole dish | Orbium at high σ budding into ×25 blobs → grey/orange, "0/s"; primary button **Limpiar placa** (`sterilizeDish`) + "Entendido" | 0 Esencia/s, Placa llena | — |
| `extinctionReady` | `extinction.available` | Extinguish button / Genome tab | full dish (catalog sprites) → white-out → genome helix "+N" | +N Genoma | — |
| `extinction` | `extinctionDone` (after the ritual) | Genome tab | "Se queda" (Bestiario, Genoma, Muestras) vs "Se reinicia" (Esencia→20, Mejoras→0, Placa→∅) | +N Genoma, Era N | — |
| `offline` | `offlineReturn` with essence > 0 | HUD essence | night lab: creatures working, drops into a jar, counter | +X Esencia, 3 h 10 min | — |

Every behaviour card names its production bonus twice: a chip *"Nadar: ×1,6 Esencia"* (from `BEHAVIOR_MULT`) and a
badge in the diagram. The calibration line also warns that *some rules make life multiply out of control* ("…¡y con σ alto todo se desborda!").

### Behaviour rules (src/moments/moments.ts)

- **One at a time.** A queue ordered by priority; a ready moment waits ≤ 1 s for a more important one that is about to be
  ready (events that happen together open in a sensible order: ¡VIDA! → Esencia → Especie nueva).
- **Cooldown** 3.5 s after a card (1.2 s after a brief label) so the player breathes and sees the game move.
- **Never interrupts**: the extinction ritual (blocked 6.5 s after `extinctionStart`), the splash, a modal, a story dialogue,
  choice or ending cinematic (`isBlocked`), and nothing opens in the first 1.2 s after boot.
- **Once**: seen ids persist in `localStorage['bioluma.moments']` (try/catch; corrupt or blocked storage never throws).
  A moment that could not open (blocked too long, the Spark left, the dish was cleaned, the creature was wiped) is **not**
  marked seen: it explains the next occurrence instead.
- **Stale dish moments** (with a grid focus) are dropped after 45 s in the queue; UI moments (offline, extinction) wait.
- **Modes** (`moments.setMode`): `full` (default) · `brief` = no pause, a big animated label pinned to the event for 3.2 s
  ("¡VIDA! +1,2 Esencia/s", "¡Explotó!", "Se disolvió") · `off` = nothing (and nothing marked seen). "No volver a explicar"
  on a card switches to `brief`.
- `isPausing()` is true while a paused card is open; the UI's `timeScale()` gives the smooth 1 → 0 (≈ 0.45 s) and 0 → 1
  (0.6 s) ramps.

## 2b. Species card and comparison (`src/ui/moments/species-card.ts`)

Owner: *"I see the same specimens with the same colour… explain WHY they are different; the difference, the improvement and
the behaviour must be clear."* A reusable card, for the Bestiary sheet, the creature info card and the Momentos:

```
 (portrait in the species' own hue)  Orbium unicaudatus · Espécimen 1
                                     [disco con cola] [➤ nadadora]
 [ looping behaviour diagram — the same real-Lenia diagram the behaviour Momentos use ]
 forma ×1,02 · nadadora ×1,73 · común ×1,1 = +1,9/s Esencia
 CÓMO MEJORARLA  Afinidad nadadora 1 — +8 % por nivel a las nadadoras   [Ver]
                 Catalogación — Sube a todas las especies registradas   [Ver]
```

- **Colour**: `SpeciesView.hue` / `CreatureView.hue` (optional; cyan when undefined) tints the portrait, ring and tags.
- **Shape label** from the catalog genus (Orbium → *disco con cola*, Gyrorbium → *disco que gira*, Circium → *anillo*,
  Scutium → *escudo*, Helicium → *hélice*, Pteron → *con alas*, Kronium → *corona*…); a player's own species is measured on
  its portrait (*anillo* / *alargada* / *redonda*).
- **Yield equation**: forma (measured complexity of its best living creature) × behaviour (`BEHAVIOR_MULT` × affinity, as
  `game.ts behaviorMult`) × rarity (`SpeciesView.mult`) (× global upgrades when ≠ 1) = its real `eps`. With no creature
  alive it shows the multiplier it would have. Compact cards show it as an aligned receipt.
- **Cómo mejorarla**: the affinity for its behaviour (nadadora/giratoria → Afinidad nadadora; quieta/late → sésil;
  divisora/colonia → colonial), Catalogación and Nutriente, with a **Ver** button (`onShowUpgrade(id)`).
- **vs mode** (`createSpeciesCompare`): two cards side by side, a "rinde más" ribbon on the winner and **one sentence**
  with the factor that explains most of the difference: *"Orbium unicaudatus nada (×1,73) y Scutium solidus se queda
  quieta (×1)."*, *"A es más rara (×1,6) que B (×1,1)."*, *"C tiene más forma: más borde, más Esencia (×1,5 frente a
  ×1,2)."*.

API: `speciesInputFromView(view, speciesId)` → `createSpeciesCard(container, input, { lang, reduceMotion?,
onShowUpgrade?, compact? })` / `createSpeciesCompare(container, a, b, opts)`; pure helpers `speciesBreakdown`,
`compareSpecies`, `shapeLabel`, `boostersFor`, `behaviorMultFor`, `hueColor`, `paintPortrait`.

## 2. One thing per event (story ⇄ moments)

The story tutorial (VELA) has scenes for some of these events. The card **is** VELA (her animated portrait speaks the
moment's lines), so when a moment opens its scenes are **consumed**: marked done, never played, and the tutorial chain
continues (`after: ['t_stable']`, …). `src/moments/storyBridge.ts` (`linkStory(moments, story)`):

| Hook | What it does |
|---|---|
| `bridge.suppresses(sceneId)` | for the story's existing `suppress` dep: hold a scene while a moment that tells it is queued/open/being consumed (no race in the same tick) |
| `bridge.storyShowing()` | for the moments' `isBlocked`: VELA is talking (lines / choice / ending) → moments wait. Task waits do **not** block |
| `bridge.covered(id)` | for the moments' `downgrade`: VELA already told it (scene played) → the moment opens as a brief label |
| consumption | `story.consume(ids)` if present (patch below); otherwise a safe fallback marks the scene done through the public API (`play(id)` + `skip()`) **only while the story is idle**, retrying every 400 ms; `bridge.consuming` is true during that instant so the story UI's blips can be muted |

Consumed: `t_wait` (seed), `t_fail` (dissolve), `t_explode` (explode), `t_stable` + `t_essence` (stable), `t_essence`
(income), `t_bestiary` (species), `t_golden` (golden). Only tutorial explainer scenes, never a choice or a story beat
(a test enforces it). **Note for the story owner:** `t_bestiary` also introduces Dr. Albor ("La doctora Albor les ponía
nombres en latín… Se fue"). Consider moving those two lines to a tiny non-tutorial beat `t_albor` (`after: ['t_bestiary']`,
`when: () => true`) so the lore survives the consumption.

### Exact `story.consume` patch (recommended; src/story/story.ts)

```ts
// in interface Story
  /** Scenes told elsewhere (a Momentos card): mark them done without playing them. */
  consume(sceneIds: string[]): void;

// in the returned object, next to play()
    consume(ids) {
      let changed = false;
      for (const id of ids) {
        if (!SCENE_BY_ID.has(id) || st.done.has(id)) continue;
        if (active && active.def.id === id && !active.replay) {
          finish(active, true);
          continue;
        }
        if (suspended?.def.id === id) suspended = null;
        st.done.add(id); // no doneAt: it was never watched (stays out of the Historia archive)
        changed = true;
      }
      if (changed) {
        persist();
        events.emit('change', {});
      }
    },
```

## 3. Files

| Path | What |
|---|---|
| `src/moments/types.ts` | Types: ids, modes, focus, chips, defs, views, events, save |
| `src/moments/catalog.ts` | The 23 moments: triggers, words (es/en), focus, chips, story links |
| `src/moments/moments.ts` | `createMoments(deps)`: queue, cooldown, blocking, persistence, modes, replay |
| `src/moments/storyBridge.ts` | `linkStory(moments, story)` (one thing per event) |
| `src/moments/config.ts` | Pacing (cooldowns, brief duration, ritual block, stable age 400, text limits) |
| `src/moments/index.ts` | Public surface |
| `src/moments/*.test.ts` | Triggers of every moment, once-only persistence, queue/cooldown, ritual/cinematic, brief/off, es/en, word limits, story bridge with the real `createStory` |
| `src/ui/moments/momentsUI.ts` | `createMomentsUI(root, moments, opts)`: slow-down, camera zoom, spotlight, card, brief labels |
| `src/ui/moments/illustrations.ts` | The 23 looping diagrams (260×140 logical) |
| `src/ui/moments/clips.ts` | Real Lenia clips (CPU reference, 64×64) recorded a few steps per frame and cached |
| `src/ui/moments/status.ts` | Creature status pills: `drawCreatureStatus`, `StatusLayer`, pure pick/place helpers |
| `src/ui/moments/seedprice.ts` | `createSeedPriceSheet`, `SlotMeter`, `drawSlotMeter`, `priceTerms` |
| `src/ui/moments/help.ts` | "¿Qué pasó?" sheet (+ explain-mode and label-mode selectors) |
| `src/ui/moments/species-card.ts` | Species card and "vs" comparison (hue, shape, behaviour diagram, yield equation, boosters) |
| `src/ui/moments/icons.ts`, `strings.ts`, `moments.css`, `index.ts` | Parts |
| `src/ui/moments/*.test.ts` | Pills, price breakdown, species card (equation, affinities, shapes, comparison sentences), **the clips really do what the cards say** (fade dies, flood floods, live = one creature, swimmer travels, spinner circles in place, pulser pulses, overgrow buds into > 10 blobs, high σ overflows) |
| `moments-dev.html`, `src/ui/moments/dev.ts` | Dev page around a real 128×128 CPU dish |
| `tests/e2e/moments-shots.mjs` | 63 screenshots, 390×844 and 1366×768, dark/light, es/en |

No new dependencies. `src/ui/story/portraits.ts` (VELA) is reused read-only.

## 4. Public API

```ts
// src/moments
const moments = createMoments({ bus, getView, storage?, now?, isBlocked?, downgrade?, pollMs? });
moments.isPausing(); moments.isBusy(); moments.current(); moments.dismiss(); moments.neverAgain();
moments.mode / setMode('full' | 'brief' | 'off');  moments.labels / setLabels('auto' | 'always' | 'tap');
moments.labelsOnAll(era);  // status pills on every creature? (auto = Era 1 only)
moments.seen(id); moments.isActive(id); moments.wouldShow(id); moments.help(); moments.replay(id);
moments.show(id, { payload?, mode? });  // dev/tests
moments.forget(id?); moments.serialize(); moments.load(data); moments.reset(); moments.dispose();
moments.on('open' | 'close' | 'change', fn);
const bridge = linkStory(moments, story); // suppresses / storyShowing / covered / consuming

// src/ui/moments
const momentsUI = createMomentsUI(root, moments, {
  camera, getDishRect, lang, reduceMotion?, onPause?(on), onFocus?(x, y, zoom),
  getTargetRect?(id), creaturePos?(id), speciesPortrait?(speciesId), onAction?(action, id),
  portraitFactory?(), onSound?(kind), theme?(), speciesInfo?(speciesId), onShowUpgrade?(upgradeId),
});
momentsUI.timeScale(); momentsUI.busy; momentsUI.mountHelp(el); momentsUI.relabel(); momentsUI.dispose();
drawCreatureStatus(ctx, creatureView, { x, y, r }, { lang, time, reduceMotion, alpha?, selected?, taken?, view? });
new StatusLayer().draw(ctx, creatures, toScreen, { lang, time, dt, reduceMotion, onAll, selectedId, view });
createSeedPriceSheet(root, { lang, reduceMotion?, onSeeDish?, onClose? });  new SlotMeter(lang);  drawSlotMeter(ctx, x, y, price, o);
```

## 5. Wiring guide (integrator)

Everything below is additive. Names refer to the current `src/main.ts` (with `setPause('moment', on)` and the story's
`suppress` dep already there).

### 5.1 `src/main.ts`

```ts
import { createMoments, linkStory, type StoryBridge } from './moments';
import { createMomentsUI, createSeedPriceSheet, SlotMeter, speciesInputFromView, type HelpSheet } from './ui/moments';

// (1) Before createStory: moments engine (late-bound bridge; the story needs moments and vice versa).
let bridge: StoryBridge | null = null;
const moments = createMoments({
  bus,
  getView: () => game.view(),
  // Splash/modal/ritual (UI), the ritual flag, and VELA talking.
  isBlocked: () => (uiRef?.blocked() ?? true) || ritual || (bridge?.storyShowing() ?? false),
  downgrade: (id) => bridge?.covered(id) ?? false,
});

// (2) createStory: don't start a scene while a moment is queued/open, and hold the scenes it tells.
const story = createStory({
  bus,
  getView: () => game.view(),
  isBlocked: () => (uiRef?.blocked() ?? true) || moments.isBusy(),
  suppress: (id) => storySuppressed.has(id) || (bridge?.suppresses(id) ?? false),
});
bridge = linkStory(moments, story);

// (3) After createStoryUI: the moments UI (z-index 46, above the story layer 45, below the splash 60).
const momentsUI = createMomentsUI(root, moments, {
  camera,
  getDishRect: () => glCanvas.getBoundingClientRect(),
  lang: () => game.view().settings.lang,
  reduceMotion: () => game.view().settings.reduceMotion,
  onPause: (on) => setPause('moment', on),
  getTargetRect: (id) =>
    id === 'seed' ? rectOf('.bl .mode-pill') : id === 'hud.samples' || id === 'hud.genome' ? null : ui.targetRect(id),
  creaturePos: (id) => ui.creaturePos?.(id) ?? null, // see 5.2
  speciesPortrait: (sid) => game.view().species.find((s) => s.id === sid)?.portrait ?? null,
  speciesInfo: (sid) => speciesInputFromView(game.view(), sid),      // the "two species" card
  onShowUpgrade: (id) => ui.reveal(`upgrade.${id}`),
  onAction: (a) => {
    if (a === 'sterilize') game.actions.sterilizeDish?.();
  },
  onSound: (k) => {
    const map = { open: 'open', close: 'close', brief: 'tap', blip: null } as const;
    const u = map[k];
    if (u) audio.playUI?.(u);
  },
});
function rectOf(sel: string): DOMRect | null {
  const el = document.querySelector(sel) as HTMLElement | null;
  const r = el?.offsetParent ? el.getBoundingClientRect() : null;
  return r && r.width > 0 ? r : null;
}
// Mute the story's open/done blips while the bridge's fallback consumes a scene:
//   onSound: (kind) => { if (bridge?.consuming) return; … }   (in createStoryUI's options)

// (4) Smooth stop: scale the simulation AND the economy by the moment's time scale.
//     In frame():
const ts = momentsUI.timeScale();
if (!isPaused() && !ritual && !document.hidden) {
  acc += dt * STEPS_PER_SEC * game.speed * ts;
  /* … unchanged … */
}
for (let i = 0; i < n - 1; i++) game.tick(0, reports[i]);
game.tick(dt * ts, n ? reports[n - 1] : null);
const rate = isPaused() || ritual ? 0 : STEPS_PER_SEC * game.speed * ts; // overlay extrapolation
//     onPause(true) fires when ts reaches 0 → setPause('moment', true) (game.isPaused), false on "¡Entendido!".

// (5) Each view update (~10×/s):
ui.setCreatureLabels?.(moments.labelsOnAll(view.era), momentsUI.busy && moments.current()?.mode === 'full'); // 5.2
seedMeter.update(view);
priceSheet.update(view);
if (view.settings.lang !== momentsLang) { momentsLang = view.settings.lang; momentsUI.relabel(); }

// (6) Seed price: meter next to the seed pill + the sheet behind its "i" (UIDeps.onSeedPriceInfo already exists).
const seedMeter = new SlotMeter(() => game.view().settings.lang);
ui.seedMeterSlot.appendChild(seedMeter.el);
const priceSheet = createSeedPriceSheet(root, {
  lang: () => game.view().settings.lang,
  reduceMotion: () => game.view().settings.reduceMotion,
  onSeeDish: () => ui.reveal('upgrade.dish'),
});
//   createUI({ …, onSeedPriceInfo: () => priceSheet.open(game.view()) })

// (7) Offline: the first return is explained by the moment; later returns keep the existing card.
if (gained > 0 && !(moments.mode === 'full' && moments.wouldShow('offline'))) ui.showOfflineCard(…);

// (8) Settings / Bitácora: the "¿Qué pasó?" sheet (re-watch cards, explain mode, label mode).
let momentsHelp: HelpSheet | null = null;
//   settingsSections: (el) => { …story archive…; momentsHelp?.dispose(); momentsHelp = momentsUI.mountHelp(el); }

// (9) Lifecycle.
//   onRestartTutorial: () => { story.restartTutorial(); moments.forget(); }
//   resetSave(): … moments.reset();
//   Debug handle: { …, moments, momentsUI }
//   (Optional) fold moments.serialize() into the main save; it also self-persists ('bioluma.moments').
```

While a card is open the moment owns the camera (it saves and restores `zoom/cx/cy`): if the UI is following a creature
(`ui.follow`), skip the follow update while `momentsUI.busy` (one line in `ui.frame`, see 5.2).

### 5.1b Species cards in the Bestiary / creature card (UI owner)

```ts
import { createSpeciesCard, createSpeciesCompare, speciesInputFromView } from './moments';
// Bestiary species sheet (panel-bestiary / modals 'species'):
const card = createSpeciesCard(container, speciesInputFromView(view, id)!, {
  lang: () => view.settings.lang, reduceMotion: () => view.settings.reduceMotion,
  onShowUpgrade: (up) => ui.reveal(`upgrade.${up}`),   // ui.reveal maps 'upgrade.<id>' → switch tab + scroll
});
card.update(speciesInputFromView(nextView, id)!);       // on view updates; card.dispose() on close
// "Comparar" (two selected species, or the tapped creature vs the best one):
createSpeciesCompare(container, speciesInputFromView(v, a)!, speciesInputFromView(v, b)!, { lang, reduceMotion, onShowUpgrade });
```
`ui.reveal('upgrade.cataloguing')` must switch to the Bestiary tab (Catalogación is a Bestiary upgrade).

### 5.2 `src/ui/ui.ts` (tiny additions, UI owner)

```ts
// UI interface
creaturePos(id: number): { x: number; y: number } | null;          // → this.overlay.creaturePos(id)
setCreatureLabels(onAll: boolean, hidden: boolean): void;           // → overlay.statusOnAll / statusHidden
// frame(): don't move the camera for "follow" while a moment owns it
if (this.follow !== null && !this.deps.cameraBusy?.()) { … }        // deps.cameraBusy = () => momentsUI.busy
```

### 5.3 `src/ui/overlay.ts` (status pills)

```ts
import { StatusLayer } from './moments/status';
// fields
private statusLayer = new StatusLayer();
private cviews: CreatureView[] = [];
private lang: Lang = 'es';
statusOnAll = false;
statusHidden = false;
// setView(view): remember what the pills need
this.cviews = view.creatures;
this.lang = view.settings.lang;
// draw(): right after this.drawCreatures(...) (inside the dish clip)
if (!this.statusHidden && !this.ritual)
  this.statusLayer.draw(ctx, this.cviews, (c) => {
    const s = this.creatures.get(c.id);
    if (!s) return null;
    const p = this.camera.gridToScreen(s.x, s.y);
    return { x: p.x, y: p.y, r: this.haloRadius(s) };
  }, { lang: this.lang, time, dt, reduceMotion: rm, onAll: this.statusOnAll, selectedId: this.selectedId, view: { w: this.w, h: this.h } });
```

Defaults: pills on every creature (6 most informative) during **Era 1**, then **on tap only** (setting in the help sheet:
*Al principio / Siempre / Al tocar*). The tapped creature always has its pill. Pills step aside while a card explains.

### 5.4 Optional contract additions (`src/core/types.ts`)

None required. If Settings should list the two options: `Settings.explain?: 'full' | 'brief' | 'off'` and
`Settings.creatureLabels?: 'auto' | 'always' | 'tap'` → `moments.setMode / setLabels` (the help sheet already offers them).

## 6. Proposed ADR

**ADR-0xx — Momentos: first-time events pause the game and explain themselves.**
*Context:* play-test: "everything happens too fast; stop and explain, with animation". GDD §13 and the story rules said
"nothing pauses the game" and "no modals for normal play". *Decision:* the **first** occurrence of 23 key events pauses the
simulation and the economy (smooth 0.45 s stop), zooms on it and explains it with a card: a real-Lenia diagram, VELA saying
≤ 2 lines of ≤ 14 words, consequence chips and one big button. Once per save; re-watchable; *brief* mode (labels, no pause)
and *off*. The story tutorial scenes covering the same events are consumed (one thing per event). Reduce motion: no zoom
(GDD §13), no typewriter, diagrams as cross-faded stills. *Consequences:* the first minute has 3–4 short pauses (seed,
first fade/explosion, ¡VIDA!, Esencia, Especie nueva); later moments are rare. GDD §13 gets a "(Corrección v1.2)".

## 7. Dev and tests

- `npm run dev` → `/moments-dev.html` — menu (bottom-left) opens any card or brief label, the help sheet, the price sheet,
  the status pills; options for language, theme, reduce motion. URL params: `?m=stable&t=4.4`, `&mode=brief`,
  `?status=1`, `?help=1&seen=all`, `?price=1`, `?replay=species`, `?card=sp1` (species card), `?vs=1` (comparison), `?clips=1` (every real-Lenia clip, 5 frames each;
  `&exp=mu,sigma,noise` to try parameters), `?still=1` (freeze the dish), `?lang=en`, `?theme=light`, `?rm=1`, `?menu=0`.
- `npx vitest run src/moments src/ui/moments` — 117 tests.
- `node tests/e2e/moments-shots.mjs` (`ONLY=card-stable` to filter) → `moments-*.png` in the session scratchpad; fails on
  console errors, page errors or horizontal overflow.

### Clips (measured with the CPU reference, 64×64; `src/ui/moments/clips.test.ts` keeps them honest)

| Clip | Setup | Result |
|---|---|---|
| fade | spore without template, Orbium rules, dt 0.02 (same dynamics, finer time) | mass 100+ → 0 |
| flood | blob at μ 0.35, σ 0.2 | fill 0.1 → 0.94 |
| live | game spore (Orbium template, bias 0.88, noise 0.35) | one Orbium, mass ≈ 73 |
| swim | *Orbium unicaudatus* | ≈ 0.6 cells/step |
| spin | *Gyrorbium gyrans* | circles in place (radius ≈ 4 cells) |
| pulse | *Circium ventilans* | still, mass ±6.6 % |
| still | *Helicium solidus* | 5 cells in 600 steps (turns in place) |
| overgrow | Orbium at σ 0.025 | buds into ~25 blobs |
| rules | the live spore under the player's (μ, σ, R, dt) | whatever the new rules do |
