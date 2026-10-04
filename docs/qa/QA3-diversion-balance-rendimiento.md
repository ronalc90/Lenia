# QA #3 — Fun, balance & performance (Bioluma)

Tester profile: r/incremental_games regular (Cookie Clicker, Antimatter Dimensions, Universal Paperclips, Melvor, NGU).
Date: 2026-10-04. Author: QA #3 (agent). No source files were changed; harness scripts live in `tests/e2e/qa/qa3-*`.

**Builds tested**

| Build | Commit | Served at | Used for |
|---|---|---|---|
| e2e (minified) | `d19aace` (start of session) | `:5737` | Part A real play, perf matrix, memory, R slider, step cost |
| e2e unminified | worktree ≈ 05:55 (pre-`433d7dd`) | `:5738` | CPU profiles with readable names |
| e2e HEAD | `530014e` (includes `ec8da02`/`433d7dd` "placa desbordada") | `:5739` | Regression check of finding #1, second real play |

`main` moved under me (≈35 commits during the session, incl. the overgrowth fix at 06:13). Every finding below says which
build it was seen on and whether it still holds on HEAD.

**Machine caveat (Part B).** The 4-core sandbox ran 4–6 other agents' SwiftShader browsers at the same time: load average
**22–37** during every perf window (logged per row). Absolute fps is therefore meaningless (0.5–7 fps); I report it, but
the conclusions rest on things that do not depend on CPU contention: main-thread CPU profiles, counts (DOM nodes,
listeners, heap after forced GC, canvases), sim-step throughput ratios and same-run relative comparisons.

---

## 0. Top findings (summary)

| # | Sev. | Area | Finding | Fix (short) |
|---|---|---|---|---|
| 1 | blocker → **fixed on HEAD** | balance | Orbium collisions at the start regime grow a dish-filling **worm maze** that the detector paid as 25–40 "stable" creatures and registered as 30–50 **new species** in ~1 min: +60–90 Genome, 40+ Samples, ~10 achievements, M_global ×2.5, 56–317 Essence/s by minute 8. Seen in **7 of 8** pre-fix sessions that kept ≥ 4 Orbium on the dish for > ~2 min (natural play, 2 prestige attempts, both perf matrices, the memory run, a CPU-profile run). | HEAD `433d7dd`+`ec8da02` (overgrown at fill > 25 %, pays 0, species token bucket, "Limpiar placa"): **verified** with a forced flood. Keep `qa3-overgrowth.mjs --flood` as regression. |
| 2 | major | perf | **Synchronous `readPixels` stalls dominate the main thread**: `sim.capture()` on every new species (`src/main.ts` `bus.on('speciesNew')` → `webgl.ts` `capture()`/`readCells()` → `gl.readPixels`) and the 30-s autosave (`main.ts` `save()` → `sim.exportState()` → `readState()`). 82 % of main-thread busy time in the profile. | Read portraits/dish asynchronously (PBO + fence like `snapshotAsync`), or crop portraits from the latest detector snapshot; save the dish only on `pagehide`/`visibilitychange` (+ every 5 min). |
| 3 | major | balance | On HEAD the bot's **greedy Era 1 takes 115 min** (target 45–90) and explorer/idle Essence is **6.7×** (target ≤ 3×); Calibrador/Incubadora/Placa II+ are dead in Era 1. | Package "Hh" (6 constants, §2.12): Era 1 greedy 44–53 min, explorer/idle 2.7×, walls 0 %, every bot criterion green. |
| 4 | major | fun | **Population is the missing "building"**: `SEED_SATURATION_GROWTH = 3` with `DISH_FREE_SLOTS[0] = 1` makes seed #7 cost 4 010 and #10 cost 137 781 (pre-cap). Production only grows through +10 % multipliers → doubling time ≈ 20 min (GDD §11 wants 8–12). | `SEED_SATURATION_GROWTH 3 → 1.6`, `DISH_FREE_SLOTS → [3, 5, 7, 9, 12]` (keep HEAD's `SEED_SATURATION_MAX_STEPS = 4`). |
| 5 | major | fun | **Early-game seed-die loop**: in real play a stable Orbium lives a median **≈ 27 s** (≈ 460–680 steps) when 3–5 share the dish; 40 seeds → 9 stable in the first 225 s; Essence/s oscillates 0–6 for 4 min. The bot assumes a 40-min mean life (`BASE_HAZARD = 1/2400`), so its early numbers are 2–3× optimistic. | Recalibrate the bot dish model from real runs; give early creatures room (spacing-aware auto-seed, slower Orbium at ×1, or a sessile tutorial species); see §2.2. |
| 6 | major | balance | **Genome tree runs out**: purchasable tree = **63 Genome**; explorer earns **41–47** in Era 1 (target 8–15) and owns everything by Era 3. After that an Extinction gives nothing (unspent Genome is worth 0). | `GENOME_PER_SPECIES 2 → 1` (Era 1 explorer 41 → 27–29) + an infinite sink (e.g. +1 % per *unspent* Genome, or a repeatable node). |
| 7 | major | fun | **Objective chain stalls on "Mira tu espécimen en el Bestiario"**: only opening the species *card* counts (`actions.markSpeciesSeen`, called only from the species modal in `modals.ts`), the card list sits below the Sample upgrades (off-screen on 390×844) and objectives are strictly sequential (`game.ts` `checkProgress()` objective `while` loop), so 5 later rewards wait. Still pending at 3:09 in play #1 and **into Era 2** in the prestige run. | Count opening the Bestiary tab (or auto-open the newest card), or reorder the panel: species first. |
| 8 | minor | fun | **Era 2 does not feel faster or different at the start**: with the normal 8–10 Genome the player can afford doubleRings (5, needs Calibrador to use), dropperMemory (3, ≈ +4 % bias) or mutations (8). The "speed" nodes (essenceStart 6, persistentSeeder 10) sit at the end of a 23-Genome chain. Measured Era 2 first 90 s: 0 → 4.5 Essence/s, same as Era 1. | Make `essenceStart` the Herencia root (cost 3) so Era 2 opens with 1 000 Essence; node copy for a 5-year-old ("criaturas de doble anillo, más grandes y raras"). |
| 9 | minor | fun | **Golden spark comes too late**: `GOLDEN_FIRST_DELAY = [150, 240]` vs GDD §23.1 **40–80 s**. First spark appeared at 3:36 in play #1; the best hook in the genre is invisible in the first 3 minutes. | `GOLDEN_FIRST_DELAY → [40, 80]` (in package Hh). |
| 10 | minor | balance | **First 4 minutes have one purchase**: Gotero I (15) is bought at 0:08 with the start money; next Lab item is Gotero II **150** / Calibrador **250** while real income is 1–4/s and seeds eat the rest → no Lab purchase from 0:08 to 4:13 in play #1. | `DROPPER_COSTS[1] 150 → 60` (doc value), `CALIBRATOR_COSTS[0] 250 → 150`; the tutorial should not push Gotero I before the first creature. |
| 11 | minor | perf | **R slider recompiles the step shader on every new R**: first use 0.37–1.48 s vs 0.01–0.18 s cached (SwiftShader); `prewarmKernel()` exists (`webgl.ts`, ≈ line 565 on HEAD) but is never called; the step-program LRU holds 6 (`stepCache.size >= 6`, ≈ line 751) — fewer than the 18 values of the R range. | Prewarm R±1..2 on idle frames when the Calibrar tab opens / the R drag starts; LRU ≥ 18. |
| 12 | minor | perf | **GDD §12 idle mode missing**: after 60 s without input only the audio goes idle (`main.ts` frame loop, `isIdle → audio.setIdle`); render stays at full rate at DPR 2. | Render every 2nd frame (30 fps) when idle; keep sim rate. |
| 13 | minor | fun | **Multipliers are invisible**: M_global reached ×2.49 by minute 6 (play #1) but the HUD only shows timed buffs; the Stats tab (`modals.ts` `openJournal`, `stats` rows) has no multiplier row. Upgrade cards show no "time to afford". | Stats: "Multiplicador ×2,49" with breakdown (Cultivo, Placa, Genoma, colección, comportamientos, logros); card subtitle "en 45 s". |
| 14 | minor | balance | **Noise unlocks a 2 000-Essence trap**: `case 'divided'` sets `flags.firstDivision` even when no creature is stable (`game.ts` `processReport`, `case 'divided'`), so *Afinidad colonial* (2 000) and the "Una se volvió dos" journal appear in the first minute from spore noise (HEAD play and flood test). | Only count a division whose parent was `stable`. |
| 15 | polish | feel | Number/label polish: costs show "5,00K" / "1,50K" (trailing zeros), HUD shows "1.752"; on HEAD the objective is truncated to "Consigue una cr…" at 390 px; overgrowth card title has low contrast; species-card popover clipped at the right edge (play #1 end shot). | `fmtShort`: drop trailing zeros ("5K", "1,5K"); objective bar two lines / marquee; contrast ≥ 4.5:1. |

---

## 1. Method

- Builds: `VITE_E2E=1 npx vite build --outDir <scratchpad>/qa3/dist{,-nomin,-head}` + `vite preview` on 5737/5738/5739.
- Headless Chromium 1194 (playwright-core), SwiftShader GL, mobile 390×844 @DPR 2 (touch) and desktop 1366×768 @DPR 1.
- **Real play** (`qa3-play.mjs`): an attentive-player policy through the real UI only — follows the tutorial, taps the
  golden spark, taps free spots of the dish when a seed costs ≤ 35 % of the bank, buys the cheapest affordable Lab card
  by tapping its button, drags the real μ slider every ~2 min. Bus events + a 5-s timeline + screenshots.
- **Fast-forward** (only for late screens, as allowed by the brief): `qa3-prestige.mjs` sets
  `bioluma.game.state.eraEssence = 249 850` plus a mid-Era set of Lab levels after a *real* first creature; the last
  150 Essence, the Extinction (real 1.5-s hold), ritual, summary, node purchase and Era 2 are real input. Perf scripts
  create N creatures with `state.charges.guaranteed = N` + `actions.seedAt` + `sim.seed` (the tap path minus the pointer),
  unlock ×2/×4 with `state.upgrades.incubator = 2`, and the R slider with `state.upgrades.calibrator = 4`.
- **Balance bot**: `npx vite-node scripts/balance-bot.ts 120 3` (as asked) and 180 3 on copies of `src/` in the
  scratchpad with modified `balance.ts` (the repo `src/` was never edited).
- Screenshots: `/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad/qa3-*.png`, raw JSON next to them.

---

## 2. Part A — Fun & pacing

### 2.1 The first 60 seconds (play #1, mobile, build d19aace, tutorial on)

| t (s) | What happened | Feel |
|---|---|---|
| 0 | Title "BIOLUMA — vida artificial que brilla", one big "Toca para empezar" (`qa3-play-mobile-00-title.png`). | Beautiful, clear. |
| 3 | First tap → ripple, toast "Logro: Primera gota", objective +4. | Instant reward — good. |
| 8 | Gotero I bought with the start money (24 → 5 Essence). | Too early: leaves 2 seeds of budget (§2.3). |
| 9–35 | 5 Essence, one "born" blob with a dashed ring, nothing to buy, "+0/s". | 25 s of waiting, no feedback beyond the ring. |
| 36 | First stable creature (step 485 ≈ **16 s on a device** at 30 steps/s), Orbium registered, "+1,6" floats, +1,1/s. | The hook lands: a living thing pays you. |
| 60 | 46 Essence, objective "Mira tu espécimen en el Bestiario" (stuck until 3:09, finding #7). | Momentum drops. |

On SwiftShader the sim ran at 11.5 steps/s (target 30), so sim-driven events (stabilisation, classification) are ~2.6×
slower than on a phone; income per second is real-time. Device-equivalent first stable ≈ 16 s — well inside the GDD's
"< 3 min". The first minute is a good hook; minutes 1–4 are the weak spot.

### 2.2 Core loop: the seed-die loop (minutes 1–4)

Play #1, first 225 s (before the maze): **40 seeds, 9 stabilisations, 27 deaths, 0 explosions**; stable creatures
lived 7–123 s, **median 27 s** (≈ 460 steps). `qa3-lifetime.mjs` (4 guaranteed Orbium, desktop): of 4, one never
stabilised, one lived 681 steps, two survived 1 270 steps. Essence/s in the timeline: 1.1 → 2.0 → 4.1 → 1.9 → 3.0 → 6.6
→ 3.8 → 1.3 → 4.8 → 0 → 3.5 … The player keeps re-seeding dead Orbium; the number does not go up, it wobbles.

Why it matters: an incremental's first five minutes must be monotonic. Cookie Clicker never takes a cursor away.
Here each death costs the ~2.5 seeds that made the creature *and* 400 unpaid "born" steps of its replacement.

The balance bot cannot see this: its dish model kills a stable creature at `BASE_HAZARD = 1/2400 s` (40-min mean life)
plus 0.6/s within 1.5 R of a *moving* pair (`scripts/balance-bot.ts:37-40`). Its greedy reaches 4 stable creatures and
7.8 Essence/s at minute 3; the real game had 1–3 stable and ≈ 3 Essence/s.

Proposals (pick one design lever, then recalibrate the bot):
- Auto-seeder and manual "free spot" logic already avoid creatures; swimmers still cross. Make the **start regime
  forgiving**: e.g. Orbium collisions at ×1 are frequent because the dish is a 192×240 torus with 4–8 swimmers at
  0.24 cells/step — a slightly bigger starting dish slot count with more spacing (`DISH_SPACING[0] 3 → 4`) helps.
- Pay a **"survivor" bonus** instead of nothing during "born" (e.g. born pays 25 % once its shape is stable for 200
  steps) so replacements are not dead time.
- Recalibrate the bot: `BASE_HAZARD` from real lifetimes (≈ 1/30 s per creature when ≥ 3 swimmers share the dish).

### 2.3 Upgrade cadence ("is there always something to buy within ~2 min?")

Real play #1 Lab purchases (from 3:48 on funded by the maze income of F1): **0:08 Gotero I → 4:13 Gotero II → 4:40 Calibrador I → 5:14 Estabilizador → 5:23 Cultivo
→ 5:34 Estabilizador 2 → 5:39 Cultivo 2 → 7:41 Estabilizador 3**. Between 0:08 and 4:13 only Microscopio (3 Samples) is
buyable. Cost ladder at that time: Gotero II 150, Calibrador 250, Sembrador 750, Afinidad nadadora 800 against 1–4
Essence/s minus seeds. After minute 5 the cadence is fine (one buy every ~30–120 s).

Bot (d19aace, 120 min × 3): greedy max wall **87 s**, 7.0 % of producing time walled; explorer 16 s / 0.6 %; idle 5 s.
HEAD: greedy 0 %, explorer **33 s / 1.3 %**.

Payback of the multiplier upgrades (`qa3-econ.ts`, at the production a bot actually has at that level):

| Production | Cultivo next level | Afinidad nadadora next | Placa next (bonus only) |
|---|---|---|---|
| 8 /s | 14 min | 26 min | 62 min |
| 25 /s | 20 min | 28 min | 20 min |
| 60 /s | 28 min | 57 min | 92 min |
| 150 /s | 37 min | 49 min | 400 min |

Genre reference: early purchases in Cookie Clicker/AD pay back in 1–5 min. A 20–40 min payback is why every purchase
feels like "+10 %, nothing changed". The fix is not cheaper multipliers but a second growth axis (population, #4).

### 2.4 Number-go-up feel

Good: big HUD counter with tweened ticking, green "+X/s", floating "+1,6" per creature, "×7" buff chip, toasts per
achievement/objective, purchase bursts, hold-to-repeat buy, ×1/×10/×máx.
Missing / off:
- **M_global is never shown** (finding #13). In play #1 it went 1.03 → 2.49 in 6 minutes (species milestones +
  behaviours + 12 achievements) and the player could not know why production tripled.
- No "time to afford" on cards (genre convention; AD/Melvor show it).
- Formatting: costs "5,00K", "1,50K", "2,86K" (3 significant digits with trailing zeros) next to HUD "1.752" — in
  Spanish locale "1.752" vs "1,50K" reads inconsistent. Prefer "1,5K"/"5K". During the maze the seed chip showed
  "501K", "1,05Qi", "9,90Qi", "111Qa" (pre-HEAD; HEAD caps it via `SEED_SATURATION_MAX_STEPS`).

### 2.5 Automation (Sembrador)

Unlock: 2 stable at once (≈ 2:10 in play #1), cost 750. Bot: bought at 5–6 min (greedy/explorer/idle), within the
5–8 min target on d19aace; on HEAD explorer buys it at **9:30** and with package Hh greedy at 8:12 (slightly late).
Interval 20 s → 2 s at level 28 (`AUTOSEED_DECAY 0.92`): level 8 = 11.2 s, level 16 = 5.7 s. With the saturation ×3 the
Sembrador mostly pays to re-seed the dead (it only seeds when cost ≤ 50 % of the bank), which is fine as an idle
tool but makes it a *maintenance* upgrade, not a *growth* upgrade. After #4 it becomes the classic "auto-buyer of
buildings" and feels much better.

### 2.6 Golden spark (Destello)

`GOLDEN_FIRST_DELAY [150, 240]` s after the first stable creature vs GDD §23.1 "40 a 80 s" (finding #9); interval
90–240 s, life 12 s. Expected value for a player who catches every spark: bloom = +180 s, lump = +90 s → **≈ 97 s of
production per spark, +57 % income** (`qa3-econ.ts`). That is a strong, Cookie-Clicker-like presence reward — good.
Play #1: first spawn 3:36, reward "Lluvia de esporas" (5 free seeds) — the weakest reward when the bank is full; the
tutorial "golden" step correctly waits for it. Suggest: reroll spores→lump when `essence > 10 × seedCost` (same rule
as the existing bloom→spores reroll when nothing produces).

### 2.7 Objectives and achievements

20 objectives worth 18 027 Essence in total; 34 achievements worth +91 % if all are earned (additive in one factor).
- Sequential chain + the "look" objective (finding #7) means rewards bunch up: play #1 completed 0:03, 0:36, then
  **3:09 ×2, 3:46 ×2**, 4:40, 5:16. Two-at-once completions waste the "next goal" pull.
- Achievements are well spread in a clean run (firstSeed 0:03, firstLife 0:36, swimmer 1:19, golden1 3:37). In the maze
  run 12 came in 5 minutes (fixed on HEAD by the species token bucket).

### 2.8 First prestige (Extinción) and Era 2

Clean run (`qa3-prestige.mjs`, mobile): the Genome tab appears at 35 % of the requirement (toast "Nueva pestaña:
Genoma"), the Extinguish button always shows the requirement ("Gana 250 000 Esencia en esta Era (llevas 249 410)"), and
when ready: "+8 Genoma · En 10 min: +8" — **a correct, genre-standard prestige preview**. Short tap does nothing; a
1.5-s hold with a ring confirms; the ritual whites the dish; the summary modal ("Fin de la Era 1 · Esencia 250.212 ·
Especies nuevas 1 · Mejor criatura Orbium · +5,4/s · GENOMA GANADO +8 · Abrir el Árbol") is clear
(`qa3-prestige-mobile-6-ritual-1200.png`, `-7-summary.png`). Understandable: yes. Tempting: weakly.

- With 8 Genome the choices are doubleRings 5 / dropperMemory 3 / mutations 8; none speeds up the first minutes.
  Era 2 first 90 s: 0 → 4.5 Essence/s, essentially Era 1 again with M_global 1.38 instead of 1.03 (finding #8).
- Node text is jargon for a 5-year-old: "El kernel admite 2 picos: el Calibrador gana un selector de perfil…"
  (`qa3-prestige-mobile-9-node-detail.png`).
- "En 10 min: +8" equals the current gain, so the button tells the player "waiting is useless": good honesty, but at
  the threshold E_era = 250 K the essence term moves 5 → 6 only at 360 K; the preview could also show "next +1 at
  360 000".
- Bot: Era 2 is shorter than Era 1 for every policy (greedy 88 → 57 min on d19aace; 44 → 45 → 35 → 29 → 24 with Hh).

Explorer prestige economy (finding #6): Era 1 Genome 41 (d19aace) / 47 (HEAD) vs target 8–15, purchasable tree 63.

### 2.9 Genre conventions checklist

| Convention | Status |
|---|---|
| Offline progress | ✓ 50 % of last-5-min average, 2 h cap (Reserva → 24 h), card on return. Reserva only unlocks after a return. |
| Buy ×1/×10/max, hold-to-repeat | ✓ |
| Prestige preview (now + in 10 min) | ✓ (finding #8 suggests "next point at …") |
| Export / import save | ✓ (Ajustes) |
| Notation | K…Qi then scientific; no engineering/scientific option (not needed before 1e21). |
| Multiplier breakdown / stats | ✗ (finding #13) |
| Time-to-afford on cards | ✗ |
| Golden-cookie equivalent | ✓ but late (finding #9) |
| Automation of the core action | ✓ Sembrador; see §2.5 |
| Visible next goal | ✓ objective bar; truncated on HEAD at 390 px (finding #15) |

### 2.10 Balance bot cross-check (`npx vite-node scripts/balance-bot.ts 120 3`, build d19aace)

| policy | first stable | Sembrador | Calibrador | Ext. avail. | 1st Ext. | Genome | sp@30/60/120 | eps@3/8/15/30/60/90 | E total | max wall | wall % | era lengths |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| greedy | 0:14 | 6:16 | 1:28 | 81m | 81m | 10 | 2/2/2 | 7.8/12/16/23/50/20 | 381K | 87s | 7.0% | 88m |
| explorer | 0:14 | 6:53 | 1:11 | 53m | 53m | 41 | 11/17/24 | 12/21/22/96/92/315 | 1.31M | 16s | 0.6% | 46m 33m 17m 12m |
| idle | 0:14 | 5:01 | 5:05 | — | — | — | 2/2/2 | 6.6/6.7/7.9/17/24/32 | 234K | 5s | 0.1% | 110m |

GDD §20 criteria on d19aace: first stable < 4 min ✓ · explorer > greedy species ✓ · ≤ 3× spread at 2 h **✗ (5.6×)** ·
Era 1 greedy 45–90 min ✓ (81–88) · Era 3 < Era 2 ✓ · purchase within 2 min **✗ (greedy 7 % walled, max 87 s)**.
Doubling time of production: greedy 7.8 → 50 in 57 min ≈ **21 min per doubling**, explorer ≈ 19.5 min (GDD §11: 8–12).

On HEAD (`530014e`, 180 min × 3):

| policy | Sembrador | 1st Ext. | Genome | eps@3/8/15/30/60/90 | E total | max wall | era lengths |
|---|---|---|---|---|---|---|---|
| greedy | 6:16 | **115m** | 10 | 7.8/12/13/20/29/25 | 460K | 0s | 115m |
| explorer | 9:30 | 68m | **47** | 12/11/22/59/215/332 | 1.99M | 33s | 43m 25m 22m 42m 20m |
| idle | 5:01 | 145m | 10 | 6.6/6.7/8.0/13/26/33 | 299K | 0s | 145m |

HEAD fails "Era 1 greedy 45–90" (115 min) and the spread (explorer/idle 6.7×).

### 2.11 Dominant strategies, dead upgrades, walls, numbers that feel off

- **Dominant (pre-HEAD)**: let Orbium collide → maze → species/achievement storm (finding #1). Fixed on HEAD.
- **Dominant (all builds)**: exploring μ beats everything because each species is +2 Genome lifetime, +1 Sample, +5 %
  per 5 species, +10 % per behaviour, and rarity ×1.1–2.0; unregistered "Espécimen N" default to *uncommon* ×1.3, so an
  un-revealed Orbium fragment pays **more** than a revealed Orbium (*common* ×1.1) (`RARITY_BY_CODE` / `DEFAULT_RARITY`).
  Fine as intent ("explorer > greedy"), too strong in magnitude (6–7×).
- **Dead in Era 1** (never bought by any bot policy before the first Extinction, 3 runs): Calibrador III (60 K) and IV
  (600 K) → the dt and **R sliders are unreachable in Era 1**; Incubadora II (80 K) → **×4 never used**; Incubadora I
  bought at 45–78 min; Placa II–IV (30 K–3 M); Nutriente (50 K). The coolest toys are where nobody gets.
- **Walls**: minutes 0:08–4:13 (one purchase); greedy minute 20–56 on d19aace (production flat 20–35/s while the
  7th creature costs 4 K and the 10th 138 K).
- **Numbers that feel off**: Gotero 15 → 150 (×10) and Calibrador 250 → 5 000 (×20) jumps; seed cost swinging
  12 → 4 739 → 12 within seconds as newborns appear (`young` beyond `SEED_NURSERY_FREE = 2` counts for saturation);
  Afinidad colonial (2 000) unlocked by spore noise (finding #14).

### 2.12 Proposed `balance.ts` changes (with bot before/after on HEAD sources)

All variants were run on a copy of HEAD `src/` (`scratchpad/qa3/bot-H*`), 180 simulated minutes × 3 runs.

| Constant | HEAD | Proposed | Why |
|---|---|---|---|
| `SEED_SATURATION_GROWTH` | 3 | **1.6** | Population becomes a purchasable growth axis (the "buildings"): 8th creature 13 K → ~60, 12th 1.4 M → ~400 with HEAD's cap. |
| `DISH_FREE_SLOTS` | [1, 2, 3, 4, 5] | **[3, 5, 7, 9, 12]** | Placa becomes "+2–3 creatures" — tangible; first 3 creatures never feel punished. |
| `GENOME_PER_SPECIES` | 2 | **1** | Explorer Era 1: 47 → 27–29 Genome; greedy 10 → 8 (still inside 8–15). |
| `GOLDEN_FIRST_DELAY` | [150, 240] | **[40, 80]** | GDD §23.1; the spark is the best "present player" hook. |
| `INCUBATOR_COSTS` | [8 000, 80 000] | **[2 000, 20 000]** | ×2/×4 is a toy, not a multiplier (production is per real second); must be reachable in Era 1. |
| `CALIBRATOR_COSTS` | [250, 5 000, 60 000, 600 000] | **[250, 2 500, 25 000, 200 000]** | σ, dt and R sliders reachable in Era 1. |

Bot, HEAD vs package (**Hh** = all six):

| policy | build | Sembrador | 1st Ext. | Genome | eps@3/8/15/30/60 | E total (180 m) | max wall | era lengths |
|---|---|---|---|---|---|---|---|---|
| greedy | HEAD | 6:16 | 115m | 10 | 7.8/12/13/20/29 | 460K | 0s | 115m |
| greedy | **Hh** | 8:12 | **53m** | 8 | 15/25/33/53/40 | 1.14M | 0s | 44m 45m 35m 29m 24m |
| explorer | HEAD | 9:30 | 68m | 47 | 12/11/22/59/215 | 1.99M | 33s | 43m 25m 22m 42m 20m |
| explorer | **Hh** | 11m | 36m | 29 | 15/32/25/335/— | 2.16M | 8s | 43m 19m 16m 64m 12m |
| idle | HEAD | 5:01 | 145m | 10 | 6.6/6.7/8.0/13/26 | 299K | 0s | 145m |
| idle | **Hh** | 5:01 | 65m | 8 | 7.9/13/19/29/94 | 810K | 2s | 70m 50m 45m |

GDD §20 criteria with Hh: first stable ✓ · explorer 15–27 species vs greedy 2 ✓ · spread explorer/idle **2.7×** ✓ ·
Era 1 greedy 44–53 min ✓ · Era 3 < Era 2 ✓ (greedy 35 < 45, idle 45 < 50) · walls ≤ 0.2 % ✓. Also tried: only the
population pair + Genome (**He**: greedy 65–71 min, spread 3.1×), and `SEED_SATURATION_MAX_STEPS 4 → 6` (**Hi**: worse,
Sembrador at 33 min — rejected). Explorer "0.0" eps checkpoints are the bot's random μ walk landing in barren regimes
right after an Extinction, not a game state.

Second wave (not bot-tested, low risk): `DROPPER_COSTS[1] 150 → 60` (GDD value) and `CALIBRATOR_COSTS[0] 250 → 150`
for the minute 1–4 dead zone; `CULTURE_GROWTH 1.35 → 1.3` if Cultivo still feels flat after the population change.

### 2.13 Feature tweaks for "extremely fun"

1. **Creatures are the buildings.** Show a "next creature costs X, pays ≈ Y/s" hint on the seed chip; let the Sembrador
   be the auto-buyer. This is the single biggest feel change (number goes up by *more life on the dish*).
2. **Infinite Genome sink**: "+1 % per unspent Genome" (Cookie-Clicker heavenly chips) or a repeatable Herencia node
   ("Vigor", 10·1.5ⁿ Genome, +10 % each), so every Extinction after the tree still matters.
3. **Era 2 must start fast**: Herencia root = Arranque con Esencia (cost 3); Era 2 opens with 1 000 Essence (Gotero I+II,
   Calibrador I and Cultivo I in the first 10 seconds) — the classic "prestige makes the start trivial" rush.
4. **Multiplier panel + time-to-afford** (finding #13).
5. **Golden spark first at 40–80 s** and a reroll of "spores" into "lump" when the bank is rich.
6. **"Born" pays a little** (25 %) after 200 calm steps, so replacing dead creatures is not dead time.
7. **Objective chain**: never gate on a hidden UI action; when two objectives complete at once, delay the second toast
   by 1.5 s so each gets its moment.
8. **Species storms on HEAD**: the token bucket (3 burst, 1 per 15 s) queues real discoveries too; show "1 especie
   esperando registro" so a player in a rich regime understands the delay.

---

## 3. Part B — Performance

### 3.1 Matrix: fps / frame time / main-thread work (build d19aace, 60-s windows, real UI)

Columns: fps and p50/p95/max frame time (ms) from rAF; steps/s actually simulated (target 30 × speed); long tasks
(count / total ms); script / style ms of main-thread work per wall second (CDP `Performance.getMetrics`); creatures as
stable/alive at window start→end; load = host load average.

| Viewport | Condition | fps | p50 | p95 | max | steps/s | long tasks | script ms/s | style ms/s | heap MB | DOM | creatures | load |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| mobile | empty dish ×1 | 3.0 | 267 | 817 | 1217 | 10.6 | 0 / 0 | 6.3 | 0.5 | 8.1 | 353 | 0/0 | 27 |
| mobile | 1 creature ×1, panel open | 5.2 | 150 | 433 | 1100 | 18.9 | 2 / 517 | 16.7 | 0.9 | 9.1 | 575 | 1/1 | 28 |
| mobile | "8" → maze ×1, open | 1.8 | 533 | 1100 | 1467 | 6.6 | 15 / 10 625 | 179.1 | 1.3 | 11.9 | 940 | 5/37→37/40 | 28 |
| mobile | maze ×1, panel closed | 0.9 | 1100 | 2217 | 2967 | 3.6 | 6 / 7 287 | 125.3 | 0.8 | 12.9 | 994 | 38/41→37/40 | 32 |
| mobile | maze ×1, open | 1.7 | 500 | 1133 | 1483 | 6.5 | 9 / 7 410 | 130.1 | 1.7 | 13.1 | 1094 | 37/40→38/38 | 34 |
| mobile | maze ×2, open | 1.2 | 633 | 1917 | 2550 | 9.8 | 7 / 8 025 | 152.6 | 1.4 | 14.6 | 1154 | 38/38→37/38 | 32 |
| mobile | maze ×4, open | 1.0 | 683 | 2900 | 4117 | 15.5 | 8 / 12 409 | 209.0 | 2.4 | 13.6 | 1186 | 37/38→41/41 | 31 |
| mobile | maze ×4, closed | 0.6 | 1400 | 3217 | 3233 | 9.9 | 7 / 6 755 | 174.6 | 1.0 | 12.8 | 1190 | 41/41→36/36 | 33 |
| desktop | empty dish ×1 | 1.0 | 867 | 2050 | 2050 | 4.2 | 0 / 0 | 5.0 | 0.4 | 9.7 | 346 | 0/0 | 34 |
| desktop | 1 creature ×1, open | 1.6 | 517 | 1267 | 1950 | 6.5 | 5 / 2 929 | 44.4 | 1.4 | 8.6 | 571 | 1/1 | 29 |
| desktop | "8" ×1, open | 1.4 | 600 | 1517 | 1983 | 5.8 | 3 / 1 456 | 29.2 | 0.8 | 9.5 | 575 | 1/2 | 28 |
| desktop | "8" ×1, closed | 1.0 | 800 | 2483 | 3617 | 3.9 | 1 / 887 | 19.9 | 0.6 | 9.3 | 588 | 2/2 | 32 |
| desktop | "20" → maze ×1, open | 0.8 | 1000 | 2117 | 2433 | 3.2 | 1 / 1 311 | 152.8 | 0.7 | 10.5 | 656 | 1/6→7/35 | 37 |
| desktop | maze ×2, open | 0.7 | 1250 | 2683 | 2833 | 6.0 | 12 / 21 657 | 394.2 | 0.8 | 13.3 | 881 | 7/35→32/41 | 34 |
| desktop | maze ×4, open | 1.0 | 900 | 2050 | 2767 | 15.8 | 10 / 15 070 | 268.5 | 2.4 | 13.0 | 1031 | 32/41→40/41 | 32 |
| desktop | maze ×4, closed | 1.1 | 817 | 1833 | 2333 | 17.6 | 4 / 7 146 | 154.4 | 2.0 | 13.1 | 1105 | 43/44→41/43 | 31 |

Reading it:
- Main-thread work: **6 ms/s (empty) → 17–44 ms/s (1–2 creatures) → 125–394 ms/s with the maze (35–44 blobs)**, plus
  6–15 long tasks per minute. Layout/style stay ≤ 2.4 ms/s (the DOM UI is cheap; the panel open/closed difference is
  noise-level). The jump is not the detector or the overlay: see the profile (§3.2).
- Speed ×2/×4 raise steps/s 6.5 → 9.8 → 15.5 (mobile) but never reach 30×speed: the frame loop caps work at
  `4 × speed` steps per frame (`main.ts` frame loop, `Math.min(whole, 4 * game.speed)`), so a slow GPU silently runs the sim slower instead of dropping
  frames — a good guard, but the player is not told (GDD §7: the speed button should grey out below 30 fps; no fps
  check exists in `main.ts`/`ui.ts`).
- A clean "8 / 20 sessile creatures" matrix (`--still`, Scutium at μ .29; `qa3-perf-matrix-both-still.json`) could not
  be completed: at 3–10 steps/s under load (31–32) the spores never reached 400 steps (0–1 stable of 5–7 alive). The
  1-creature rows and the profiles are the trustworthy baseline.

### 3.2 Where the main thread goes (CPU profile, unminified build, mobile, 25 s)

| Case | Busy (non-idle) | `readPixels` | of which `capture()` (new species) | of which autosave `exportState()` | `toDataURL` (portraits) | GC |
|---|---|---|---|---|---|---|
| 12 Orbium → maze (10 new species in window) | 5.0 s | **4.10 s (82 %)** | 2.86 s | 1.25 s | 0.24 s | 0.22 s |
| 20 Scutium (1 new species, 1 autosave) | 3.4 s | **2.96 s (87 %)** | 1.11 s | 1.85 s | 0.14 s | 0.01 s |

Call chains: `registerSpecies → bus.emit('speciesNew') → main.ts sim.capture → webgl.ts readCells → gl.readPixels`
and `frame → save() → sim.exportState → readState → readCells → readPixels`. Each is a
**synchronous GPU round-trip**: in SwiftShader it waits for the whole queued step backlog (≈ 0.3–1.8 s per call); on a
phone GPU a sync `readPixels` after a frame of work typically costs 5–30 ms (more on tiled GPUs) → a visible hitch
exactly at the "¡Especie nueva!" celebration and every 30 s. Everything else (detector, game tick/view, overlay
drawing, DOM updates) is < 5 % of the busy time.

### 3.3 CPU micro-benchmarks (node, `qa3-cpu-bench.ts`)

| Path | mean | p95 | cost at ×1 / ×4 |
|---|---|---|---|
| detector.update, 1 Orbium (192×240, scale-2 snapshot) | 0.55 ms | 3.8 ms | 1.6 / 6.6 ms/s |
| detector.update, 8 Orbium | 1.13 ms | 4.6 ms | 3.4 / 13.6 ms/s |
| detector.update, synthetic maze (40 % fill) | 1.82 ms | 4.5 ms | 5.5 / 21.8 ms/s |
| game.tick, 20 creatures / 40 species | 0.08 ms | 0.02 ms | 5 ms/s at 60 fps |
| game.view(), 20 creatures / 40 species | 0.31 ms | 0.14 ms | 3.4 ms/s (11 calls/s) |
| game.serialize() | 0.80 ms | 3.1 ms | every 30 s |

`view()` allocates ≈ 37 KB of objects per call (≈ 400 KB/s): fine for minor GC, but the audio block (`main.ts` frame loop,
`view ?? game.view()`) calls `game.view()` a second time once per second when the 100-ms UI view was not built in the same frame. Node is ~3–6×
faster than a mid-range phone: detector at ×4 ≈ 40–130 ms/s on a phone, i.e. 4–13 % of the main thread. OK.

### 3.4 Memory over 10 minutes (mobile, Sembrador every 2.4 s, maze churn, GC forced before each sample)

| min | heap MB | DOM | listeners | canvases | stable/alive | species | creatures born | save KB |
|---|---|---|---|---|---|---|---|---|
| 0 | 6.79 | 349 | 130 | 2 | 0/0 | 0 | 0 | 0 |
| 2 | 10.11 | 865 | 199 | 2 | 23/27 | 28 | 57 | 69 |
| 4 | 10.62 | 997 | 226 | 2 | 27/28 | 41 | 77 | 176 |
| 6 | 10.81 | 1020 | 221 | 2 | 25/25 | 43 | 94 | 189 |
| 8 | 11.05 | 1163 | 238 | 2 | 27/27 | 48 | 116 | 205 |
| 10 | 11.20 | 1169 | 237 | 2 | 29/29 | 55 | 136 | 230 |

**No leak found.** Heap and DOM grow only with the number of registered species (≈ 80 KB heap and ≈ 15 DOM nodes per
species: Bestiary card, portrait data URL, signature); from minute 4 to 10 the heap grew 0.6 MB for +14 species. Listeners
oscillate 218–245 (transient), the canvas count stays 2 (portraits are offscreen → data URL), overlay particle/float
arrays are capped (`MAX_FLOATS 40`, `MAX_PARTICLES 420`, ripples 24, flashes 16) and the game's per-creature maps are
pruned when ids vanish (`game.ts` processReport). The save grows ≈ 4 KB per species (230 KB at 55): with the `.bak`
copies ≈ 0.5 MB written synchronously to localStorage every 30 s at 55 species — fine, but another reason to slow the
dish autosave (finding #2).

### 3.5 R slider: shader recompiles (`qa3-compile.mjs`, `qa3-perf.mjs rslider`)

| R | first use (setParams + 1 step + finish) | again (cached) |
|---|---|---|
| 10 | 365 ms | 78 ms |
| 14 | 1 476 ms | 11 ms |
| 18 | 1 076 ms | 25 ms |
| 22 | 1 154 ms | 169 ms |
| 27 | 1 246 ms | 181 ms |

Dragging the real R slider (10 values, 2.5 s apart): worst frame per change 400–2 250 ms; returning to R = 13 after six
other values recompiled again (LRU of 6 evicted it). The code comment estimates 0.1–0.7 s per compile on devices
(`webgl.ts` above `prewarmKernel`). Fix in finding #11.

### 3.6 Simulation cost by R (`qa3-perf.mjs stepcost`, steps only, mobile)

| R | texture fetches / cell | steps/s (SwiftShader) | relative |
|---|---|---|---|
| 13 | 39.75 | 26.2 | 1.0 |
| 18 | 77.25 | 16.9 | 0.65 |
| 27 | 161.75 | 8.8 | 0.34 |

Cost is linear in fetches (≈ R²). Real-device estimate at 192×240: R 13 ×1 ≈ 55 M fetches/s, ×4 ≈ 220 M/s (trivial for
any GLES 3 GPU); R 27 ×4 ≈ 0.9 G fetches/s — 20–45 % of a low-end Adreno/Mali budget on top of the DPR-2 screen pass, so
×4 at R 27 is where low-end phones will drop below 30 fps (the "low" profile's 128×160 grid is 2.25× cheaper).

### 3.7 Real-device impact estimate

- **Steady state** (≤ 20 creatures, no discoveries): main-thread JS ≈ 20–60 ms/s on a mid-range phone (detector +
  tick + view + overlay), GPU well inside budget at R 13. Expect a solid 60 fps at ×1–×2 and ≥ 30 fps at ×4.
- **Hitches**: one dropped frame or more on every new species (sync portrait read) and every 30 s (sync full-dish read);
  0.1–0.7 s freeze per new R value; these are the things a player will notice. Fix #2 and #11 first.
- **Battery**: no idle throttle (finding #12); a phone left on the dish keeps rendering at 60 fps at DPR 2.

---

## 4. Detailed findings (repro / expected / actual / evidence / fix)

**F1 — Worm maze pays and floods the Bestiary** (blocker on d19aace; fixed on HEAD)
- Repro (d19aace): fresh save → title → skip tutorial → seed 8 Orbium (natural play with a few taps, or
  `qa3-overgrowth.mjs http://…:5737/`) → wait 1–3 min.
- Expected: a collision that fills the dish is "exploded", pays 0, registers nothing (GDD §5/§20 hard gate).
- Actual: 25–41 tracked "stable" blobs, Espécimen 2…55 registered, M_global ×2.49 by 6 min, eps 56 at 8 min;
  prestige run: first Extinction +69 Genome (32 new species). Seen in 7 of 8 sessions with ≥ 4 Orbium for > ~2 min
  (the exception: `qa3-lifetime.mjs`, 4 Orbium for 150 s).
- Evidence: `qa3-play-mobile-t0240.png`, `-t0300.png`, `-end.png`, `qa3-perf-mobile-8-panel-closed.png`,
  `qa3-prestige-mobile-3-ready.png`, `qa3-play-mobile.json`.
- Cause: `detector.ts` exploded only for blob area > 2 % of the dish when fill > 40 %; maze fragments are < 2 %.
- HEAD: `DISH_OVERGROWN_FILL = 0.25` in detector and game, token bucket, crowd rule, "Limpiar placa". Verified:
  forced flood → overgrown in 1 report, 0 Essence/s, 0 species, toast + button
  (`qa3-overgrowth-mobile-5739-flood-flooded.png`). Keep `qa3-overgrowth.mjs --flood` as the regression test.

**F2 — Sync readPixels hitches** (major, perf; present on HEAD and in the current worktree: `main.ts` `speciesNew` handler and `save()`, `webgl.ts` `capture()`, `exportState()`/`readState()`, `readCells()`)
- Repro: `qa3-profile.mjs http://…:5738/ orbium 12 25 mobile`.
- Expected: no synchronous GPU readback on the main thread (CLAUDE.md: "No readPixels per frame").
- Actual: 82–87 % of main-thread busy time is `readPixels` from portrait capture and autosave.
- Fix: portraits from an async PBO read (reuse `snapshotAsync`'s fence path for a 64×64 rect) or from the latest
  detector field; dish autosave on `pagehide`/`visibilitychange`/every 5 min via the same async path.
- Heads-up: the uncommitted worktree adds `PORTRAIT_MAX_CAPTURES = 6` and `PORTRAIT_RECAPTURE_STEPS = [150, 400, 900]`
  to `balance.ts`; if recaptures go through the same synchronous `capture()`, the hitch count per species multiplies.

**F3/F4/F6 — Bot criteria & population/Genome balance** (major) — §2.10–2.12, constants table.

**F5 — Early seed-die loop** (major, fun) — §2.2; evidence `qa3-play-mobile.json` (events), `qa3-lifetime-desktop.json`.

**F7 — "Mira tu espécimen" objective** (major, fun)
- Repro: fresh save, play normally; open the Bestiary tab when the objective says so.
- Expected: objective completes. Actual: only tapping the species card (below the Sample upgrades, off-screen at
  390×844) completes it; chain blocked (play #1 until 3:09; prestige run never, carried into Era 2).
- Evidence: `qa3-play-mobile-t0060.png`, `-t0120.png`, `-t0180.png`, `qa3-prestige-mobile-4-genome-tab.png` (still
  pending at the first Extinction and at the start of Era 2 in `qa3-prestige-mobile.json`).
- Fix: `metric('speciesSeen')` also counts opening the Bestiary tab with ≥ 1 species, or list species before upgrades.

**F8 — Era 2 start** (minor) — §2.8; `qa3-prestige-mobile.json` (era2 timeline).

**F9 — Golden first delay** (minor) — `balance.ts` `GOLDEN_FIRST_DELAY = [150, 240]` vs GDD §23.1 `40–80 s`; first spawn 3:36 in play #1.

**F10 — Minute 1–4 purchase gap** (minor) — §2.3; `qa3-play-mobile.json` purchases.

**F11 — R slider recompiles** (minor, perf) — §3.5.

**F12 — No idle render throttle** (minor, perf) — the `IDLE_AFTER_MS` branch of the `main.ts` frame loop only calls `audio.setIdle`.

**F13 — Multipliers invisible** (minor) — `modals.ts` `openJournal` stats rows; HUD `updateHUD` shows only buffs.

**F14 — Divisions from noise unlock Afinidad colonial** (minor)
- Repro (HEAD): fresh save, 8 spores → toast "Nueva mejora: Afinidad colonial" at step 204 with 0 stable creatures
  (`qa3-overgrowth-mobile-5739.json` toasts).
- Fix: in `processReport` `case 'divided'` (`game.ts` `processReport`), require the parent id to be a known stable creature.

**F15 — Formatting / labels** (polish) — `src/ui/format.ts` `suffixed()` keeps 2 decimals for 1–10 K
("5,00K"); HEAD objective truncated to "Consigue una cr…" and covered by VELA's "Toca la placa." bubble
(`qa3-play-mobile-head-t0005.png`, `-t0120.png`); flood card title contrast (`qa3-overgrowth-mobile-5739-flood-flooded.png`);
creature popover clipped at the right edge (`qa3-play-mobile-end.png`).

---

## 5. Harness scripts (all under `tests/e2e/qa/`)

| Script | What it does |
|---|---|
| `qa3-lib.mjs` | Launch, viewports, open game, pass splash/tutorial, tap dish, state snapshot, percentiles. |
| `qa3-play.mjs <url> [min] [mobile\|desktop] [--tutorial]` | Attentive-player real play with timeline, events, screenshots. |
| `qa3-prestige.mjs <url> [vp]` | First Extinction via real hold + Era 2 start (fast-forward documented in the header). |
| `qa3-perf.mjs <url> matrix\|memory\|rslider\|stepcost …` | fps/frame-time/long tasks/CDP metrics matrix, 10-min memory, R slider, step cost. `--still` uses a sessile regime. |
| `qa3-profile.mjs <url> still\|orbium [n] [secs] [vp]` | CPU profile + self-time table + `.cpuprofile`. |
| `qa3-compile.mjs <url> [vp]` | Step-shader compile cost per R. |
| `qa3-lifetime.mjs <url> [n] [secs] [vp]` | Stable-creature lifetimes and re-identification. |
| `qa3-overgrowth.mjs <url> [vp] [secs] [--flood]` | Regression test for F1 (PASS/FAIL line). |
| `qa3-soup.mjs`, `qa3-soup2.mjs` | Early attempts to trigger the maze by taps / one big blob (both negative; kept for reference). |
| `qa3-econ.ts` | Static economy tables (seed cost, ladders, paybacks, Genome, golden EV) from the real `balance.ts`. |
| `qa3-cpu-bench.ts` | Node micro-benchmarks of detector / tick / view / serialize. |
