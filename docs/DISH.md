# The round petri dish: walls, growth and collisions

Status: research done (Phase 1, CPU). Decision drafted as **ADR-022** (supersedes ADR-004, toroidal dish).
Owner's play-test asks: creatures must **collide with the walls** (no wrap), the dish must be a **round glass
petri dish**, it must **grow with the Placa upgrade**, and (from QA) several colliding Orbium must **not flood
the dish with the worm maze**.

All numbers below come from the CPU reference (`CpuLenia` maths, FFT on a zero-padded grid) with catalog
creatures warmed up on a torus and then launched at the glass. Scripts and raw logs live in the scratchpad of
the Phase-1 session; the reusable pieces are now in the repo (`src/core/dish.ts`, `src/sim/deflect.ts`,
`CpuLenia.setDish/applyTurns`).

## 1. Summary

| Question | Answer |
|---|---|
| Can a pure Lenia wall (a boundary rule inside the CA) bounce creatures? | **No.** 12 wall models tested; none keeps Orbium alive on near head-on hits, and the ones kind to Orbium kill Scutium or grow a film on the glass. |
| What works? | **Absorbing glass + glass deflection**: matter outside the rim is 0, and every detector update a planner turns each swimmer that is about to reach the rim (or another swimmer) to the mirror direction, by rigidly rotating its matter around its centroid (Lenia is rotation-invariant, so the creature is unharmed). |
| Survival at the rim with it | Orbium **341/345** and **168/170** impacts survived (99 %) in the smallest dish (Ø 96); Scutium 13/13; Hydrogeminium turned away before touching (Ø 160); Gyrorbium is never touched (it spins in place). No rim smearing: longest wall contact 10–105 steps. |
| Carrying capacity (fill/mass budget, local density, growth-rate guard) | **Does not prevent the maze.** The maze is a saturated Turing pattern (88–91 % of its cells at A ≥ 0.99) that survives a uniform growth penalty of **0.3**, while Orbium dies at 0.12 and Scutium at **0.03**. Penalties strong enough to stop it kill the fauna first. |
| What reduces the maze instead | Stop the collisions that seed it: the same deflector bounces swimmers off each other (elastic encounters). A "lysis" safety net (local −1 growth on a runaway blob) stops every maze but also kills the merged creatures. |
| Dish growth | Grid allocated once (square, per quality); Placa only moves the rim (no resampling). Diameters 96 → 128 → 160 → 192 → 224, capped per quality. |

## 2. Wall models (controlled shots)

Setup: flat walls (channel 96 cells wide, periodic along the wall) so the angle of incidence is exact; R = 13
species on 128², R = 18 on 256². "Bounce" = intact afterwards (mass 0.5–2×, one body) and moving away from the
wall. Contact zone = matter within R/2 of the glass.

### Orbium unicaudatus (O2u, μ .15 σ .015) — angles of incidence

| Wall model | 0° | 10° | 20° | 30° | 45° | 60° | Notes |
|---|---|---|---|---|---|---|---|
| (a) absorbing: outside = 0 | dead | — | — | dead | — | dead | front starves (lower potential), dies in 40–400 steps |
| (b) mirror (Neumann) | dead | bounce | dead | dead | bounce | bounce | meets its mirror twin; in a round dish it skates along the rim forever |
| (b') glide/partial mirror | dead | 1/3 | 1/3 | 0/3 | 0/3 | 1/3 | chaotic |
| (c) repulsive band, −λ growth over w cells | dead | — | — | dead | — | 1/6 | λ 0.2–1, w 4–13: erosion kills before it turns |
| (c') kernel-shaped repulsion λ·W | dead | — | — | dead | — | 1/4 | same |
| (d) glass "presence": outside counts as v in U | dead | 2/4 | 3/4 | 4/4 | 4/4 | 4/4 | v .05–.10; **v ≥ .12 grows a labyrinth from the glass that fills the dish** |
| (d') v + sawtooth/sine texture, drift, noise | dead | mixed | mixed | mixed | ok | ok | symmetry breakers do not save head-on hits |
| (d'') u pushed down (−βW) | dead | dead | dead | dead | dead | dead | |
| (e) advection away from the glass | dead | dead | dead | dead | dead | dead | shear tears it |
| (f) renormalised kernel U = K∗A / (1 − αW) | dead | bounce | bounce | bounce | bounce | bounce | α .4–1; exits at 70–77° → skates along a round rim; α 1.3 grows a film |

Reading: Orbium has no repulsion mechanism. Any wall either attracts its front (it flattens, bloats and breaks) or
starves it (it shrinks and dies); it survives only when the encounter is oblique enough that one flank turns it
away. A rotationally symmetric wall can never turn a head-on swimmer.

### Other species (best models)

| Species | absorbing | presence v∝μ | repulsive band | mirror | renormalised |
|---|---|---|---|---|---|
| Scutium solidus (S1s, μ .29) | 6/6 intact but **parks** against the glass | 0–4/6 (dies head-on) | 5/6 intact, parks | 0/6 | 0–2/6 |
| Hydrogeminium natans (3GH2n, R 18) | shrinks to a half-size form 2/3, intact 1/3 | — | — | — | α .5 shrinks, α 1 film |
| Gyrorbium gyrans (OG2g) | never reaches the wall | | | | |

Conclusion: the CA-level wall is species- and regime-dependent; no single rule passes the owner's bar.

## 3. Round dish, free runs ("pinball")

One creature, random start and heading, Ø 96 dish (R = 13), 3000 steps; p = impacts survived / impacts
resolved. Contact sheet: `walls-pinball.png`.

| Model | Orbium p | Notes |
|---|---|---|
| absorbing | 0.00 (0/8) | |
| presence v .05 / .07 / .08 | 0.11 / 0.27 / 0.27 | curvature makes the glass "stronger" than the flat case |
| mirror | 0.00 | 6/8 skate along the rim > 600 steps |
| renormalised α .5 / 1 | 0.33 / 0.11 | glancing exits (75°) → whispering-gallery skating |
| **absorbing + glass deflection** | **0.99** (341/345, then 168/170) | billiard-like star polygons, longest contact 10–105 steps |
| same, Scutium / Gyrorbium | 13/13 / untouched | spinners are never steered |
| same, Hydrogeminium (Ø 160) | turns before contact | 2/2 alive after 2000 steps |

## 4. Glass deflection (`src/sim/deflect.ts`)

Every detector update (10 steps) `Deflector.update(bodies, dish, step, interval)` returns rigid turns:

1. A body is steerable when it moves (≥ 0.04 cells/step), keeps its heading (turned by itself ≤ 0.3 rad since
   the last update — spinners like Gyrorbium are excluded), and is not flagged `steerable: false` (the game
   passes false for exploded blobs and mazes).
2. Rim: if its outline (1.9 × radius of gyration + 3 cells) would reach the glass before it could finish
   turning, it is turned to the **specular reflection** of its heading (angle in = angle out).
3. Other bodies: if two bodies close in on each other, each one moving towards the other reflects off the line
   between centres (elastic encounter), keeping 8 cells between outlines. Already-merged bodies are left to
   Lenia.
4. A turn is applied at most 60° per update (a quick, visible swerve: a head-on bounce takes 3 updates ≈ 1 s).
   GPU and CPU apply the same rotation: each cell within the disc (outline + 1.5 cells) samples the old field
   at its centre rotated by −angle (bilinear), fading to no rotation over 2 more cells so a grazed neighbour
   bends instead of tearing; outside the dish stays 0. Mass is conserved to ±3 % per turn and recovers.

It is not a fake: the creature stays a live Lenia pattern; the glass only turns it, the way a wall turns a
microbe. The detector keeps tracking it (a turn moves the centroid by < 0.5 cell).

Seeds near the rim (spores with the game's seed spec, deflector on, 16 per row):

| Seed distance from the rim | success |
|---|---|
| centre | 11/16 |
| 2 R | 6/16 |
| 1 R | 7/16 |
| 0.5 R | 4/16 |
| 0 (on the glass) | 0/16 |

→ the game clamps seeding points to ≥ seed radius + 0.5 R from the rim (big seeds included) and the auto-seeder
samples free spots with a 2 R margin.

## 5. Mazes and carrying capacity (QA priority)

Reproduction (CPU, Orbium regime): 4–6 Orbium converging (as on a crowded dish) → worm maze in **6/6** on a 128²
torus and **6/12** in the round Ø 96 dish; fill settles at 0.21–0.25 (the detector's overgrown threshold is
0.25). Random pairs mostly annihilate (0–1 survivors of 4–6). Budding regime (σ .021): 2 of 4 seeds explode
into 45–90 buds within 200 steps; the other 2 never bud.

| Carrying capacity tried (penalty subtracted from G) | Prevented the maze | Isolated creatures |
|---|---|---|
| global fill: 0.5·max(0, fill − 0.08) | 0/3 | unchanged |
| total-mass budget ∝ dish area (k .1/.25, φ .04/.06) | 0/7 (thins it to fill 0.17–0.20) | unchanged |
| local density (disc 2R) k 1, d₀ .06 / k .5, d₀ .08 | 1/5, 1/5 | unchanged |
| growth-rate guard (0.05–0.08 while mass grows > 15 %/50 steps) | 2/7 | unchanged |
| constant 0.04 from the start | 1/1 | **kills Scutium (dies at 0.03 in < 100 steps)** |
| lysis: −1 growth for 60 steps on a component > 3 Orbium masses | 7/7 | the merged creatures die; a budding creature is killed (no buds) |
| **glass deflection between creatures** | see below | — |

Why: an established maze survives a uniform growth penalty of 0.3 for 600 steps (its stripes sit at A = 1 with
U ≈ μ, so G ≈ +1); the nucleating blob is fragile (dies at 0.04), but Orbium's own margin is 0.12 and Scutium's
0.03, so a penalty that is safe for every regime never reaches the nucleus in time. (`walls-capacity.png`)

Deflection between creatures (Ø 192 dish, 5 or 8 Orbium spaced 3 R apart, random headings, 2000 steps):

| | maze | Orbium alive at the end (of 5 / of 8) |
|---|---|---|
| no deflection | 1/6 | 0–2 / 0–1 (collisions annihilate) |
| rim + body deflection (final parameters) | 1/6 (nucleated at t < 150 when 8 start 3 R apart) | 2–4 / 3–4 |

Recommendation: (1) body deflection on — it keeps most of the fauna alive and removes most merges; (2) keep the
existing overgrown detection + free sterilise; (3) add the **lysis safety net** gated by the detector: a
component the detector flags as a mass runaway (≥ 3× its own mass within the window, or ≥ 3× the median stable
creature mass) gets a local −1 growth disc for 60 steps (≤ 8 discs as GPU uniforms; CPU mirror trivial). It only
ever fires on blobs that are already merging, which die or turn into the maze anyway. The budding regime
(σ ≈ .021) is all-or-nothing in these runs; none of the caps produced "a handful of buds" (lysis simply removes
the budding parent).

## 6. Dish growth

- Grid allocated once per quality, square, never resampled: **low 168² (dish ≤ 160), medium 232² (≤ 224),
  high 232² (≤ 224, 2 substeps + wider bloom)**. 4 empty cells around the largest dish make clamp-to-edge reads
  exact zero padding, so the step shader needs no wrap and no extra margin of R.
- Rim diameter by size index (`DISH_DIAMETERS`; the game decides what unlocks each size — today the Placa
  upgrade, later a research node): **96, 128, 160, 192, 224** cells, capped by quality. Growth only changes the rim
  radius (all matter is kept). Rim and camera ease out over 1.5 s (cubic); the step shader uses the animated
  radius, so nothing ever lives outside the visible glass.
- Cost: the step shader early-outs outside the disc and the draw is scissored to the dish's bounding box. Max
  dish cells: low 20 106 (old 20 480), medium 39 408 (old 46 080), high 39 408 × 2 substeps (old 62 720 × 2).
  The Ø 96 starting dish is 7 238 cells: 6× cheaper than today's medium grid.
- R = 18 species (Hydrogeminium ≈ 50 cells across) are cramped below Ø 160; the calibrator could warn when
  R > dish/7.

## 7. Public API (Phase 2a) and how the game wires it

| Module | API |
|---|---|
| `core/dish.ts` | `DishShape`, `dishForGrid(w, h, diameter)`, `DISH_DIAMETERS` (96…224), `dishDiameterFor(index, maxDiameter)`, `DishAnimator` (`setTarget(shape, animate)`, `update(dt)`, `rim`, `fit`, `glow`, `done`), `dishDist`, `rimDistance`, `insideDish`, `cellInDish`, `clampToDish`, `randomPointInDish`, `dishArea`, `dishCellCount`, `dishMask`, `moveInDish`, `DISH_GRID_MARGIN`, `DISH_GROW_SECONDS` |
| `core/camera.ts` | `Camera.setDish(shape \| null, fitRadius?)`, `.dish`, `.fitRadius`, `.clamp()`; torus behaviour unchanged without a dish |
| `sim/perf.ts` | `QUALITY_DISH[quality] = { grid, maxDiameter }` (low 168/160, medium 232/224, high 232/224) |
| `sim/webgl.ts` | `setDish(shape \| null)`, `dish`, `applyTurns(turns)`, `setLysis(discs)`, `setDishFx({ grow })`, `setCreatureTints(list, amount?)` |
| `sim/deflect.ts` | `Deflector.update(bodies, dish, step, interval) → Turn[]`, `DEFLECT`; `LysisPlanner.update(targets, step, R) → { discs, started }`, `LYSIS`, `lysisPenalty`, `rotateDiscCpu` |
| `sim/cpu.ts` | `CpuLenia.setDish`, `applyTurns`, `setLysis` (CPU mirror for tests and bots) |
| `sim/seed.ts` | `applySeedCpu(…, { dish })`, `applyEraseCpu(…, { dish })` (no wrap, masked) |

Wiring (main, Phase 2b):

```ts
const q = QUALITY_DISH[quality];
const sim = createSimulation(canvas, { gridW: q.grid, gridH: q.grid, params });
const anim = new DishAnimator(dishForGrid(q.grid, q.grid, dishDiameterFor(sizeIndex, q.maxDiameter)));
sim.setDish(anim.rim); camera.setDish(anim.rim, anim.fit);
// size change (research node, era reset): anim.setTarget(dishForGrid(...), animate)
// every frame:
if (anim.update(dt)) { sim.setDish(anim.rim); camera.setDish(anim.rim, anim.fit); }
sim.setDishFx({ grow: anim.glow });
// every detector report (positions extrapolated by v·(sim.stepCount − report.step)):
sim.applyTurns(deflector.update(bodies, anim.rim, sim.stepCount, DETECT_EVERY));
const { discs, started } = lysis.update(runawayBlobs, sim.stepCount, params.R);
sim.setLysis(discs); // started → bus event → Momento "el laboratorio la disolvió"
// species tints (hue in degrees = SpeciesView.hue): sim.setCreatureTints(creatures.map(c => ({ x: c.x, y: c.y, r: 2 * c.r, hue })))
```

Caveat for the detector (Phase 2b, measured): a swimmer that bounces in the Ø96 dish turns 60–180° every
~100 steps, and the detector's rotation tracking then classifies it as **spinner** after ~1000 steps (CPU run:
stable → spinner at step 1010). The detector must discount the deflection turns (the game can pass the turns
of each creature id) and `steerable` must not depend on the `spinner` label (the deflector's own heading-curl
filter already leaves real spinners alone). Also the detector's `exploded` state fires late for a maze nucleus
(the merged blob splits into worms below 12 R² before the quarter-window ratio exists), so lysis needs an earlier
"runaway" flag: a component ≥ 3× the median stable creature mass, or one whose mass doubled within ~100 steps.

GPU checks (`node tests/e2e/sim-check.mjs`, SwiftShader): Orbium into the glass GPU vs CPU max|Δ| 1e-5–1e-4
(f32/u8) and < 0.02 (f16); seeds/erase without wrap 2.5e-4; deflection turn vs `rotateDiscCpu` 2.4e-4; lysis
vs CPU 7e-4; Orbium bounces 59 times in 2000 steps in the Ø96 GPU dish (mass ×0.96) while the bare-glass control
dies (×0.08); 232² Ø224 runs at the speed of the old 192×240 torus, Ø96 6× faster. Screenshot:
`sim-dish.png` (scratchpad).

## 8. Phase-2 integration checklist

GPU step: `inside = |c − centre| < r` (cell centres), outside → 0 and early-out; state textures clamp-to-edge;
seed/erase/extract without wrap; new rotate pass (mirror of `rotateDiscCpu`); render a round glass dish with rim
highlight over a lab-table background (no tiling), growth ring, species tints. Detector: no wrap, fill over dish
cells. Camera/overlay: fit the circle, clamp pan, no wrapped copies. Game: `dishDist`, free spots in the circle,
Placa = growth, golden spark bounces (`moveInDish`). main: deflector after each detector report (positions
extrapolated by v·Δsteps), `steerable` = state stable/born and behaviour not spinner/colony.

## 9. ADR-022 draft (for DECISIONS.md; supersedes ADR-004)

**ADR-022: Round walled petri dish that grows; glass deflection instead of wrap**

- **Status:** Proposed (2026-10-04). Supersedes ADR-004 (toroidal dish). Owner play-test decision.
- **Context:** The owner rejected creatures passing through the edges: they must collide with the walls, the dish
  must be a round glass petri dish, and it must grow with the Placa upgrade (start small, capped by device
  quality). Measured on the CPU (docs/DISH.md): every boundary rule inside Lenia (absorbing, mirror, repulsive
  band, "glass presence", renormalised kernel, advection, textured/chiral variants) is lethal or regime-dependent
  — Orbium dies on near head-on hits, Scutium dies under the rules that spare Orbium, and stronger rules grow a
  film or labyrinth from the glass. Separately, colliding Orbium seed the worm maze, which no carrying-capacity
  penalty can stop without killing the fauna first (the maze survives a growth penalty of 0.3; Scutium dies at
  0.03).
- **Decision:**
  - The grid stays a fixed square per quality profile (low 168², medium/high 232²), allocated once. The living
    area is the disc of cell centres within the rim radius; matter outside is always 0 (absorbing glass). State
    textures are read clamp-to-edge, so with 4 empty cells around the largest dish the convolution is exactly
    zero-padded. No wrap anywhere (simulation, detector, camera, overlay, game distances).
  - Placa levels set the rim diameter: 96, 128, 160, 192, 224 cells, capped by quality (low 160, medium/high 224).
    Growth only moves the rim (all matter kept), animated over 1.5 s with the camera easing out.
  - **Glass deflection** (`src/sim/deflect.ts`): after each detector update, swimmers about to reach the rim or
    another swimmer are turned to the mirror direction by rigid rotations of their matter (≤ 60° per update,
    bilinear, identical on GPU and CPU). Spinners, exploded blobs and mazes are never steered.
  - **Lysis** (same file, `LYSIS`): a blob the detector flags as a runaway gets a local −1 growth disc for
    60 steps (≤ 8 discs), and the game tells the player why. Overgrown detection + free sterilise stay as the
    last safety net.
  - The update rule A ← clip(A + dt·G(K∗A)) inside the dish is unchanged (ADR-002 holds).
- **Consequences:**
  - Orbium survives 99 % of rim impacts (vs 0 % with a bare wall); swimmers bounce like billiard balls; collisions
    between swimmers become elastic encounters, which also removes most maze nucleation. Remaining mazes keep
    using the overgrown detection and free sterilise.
  - The detector, camera, overlay and game drop toroidal maths; `wrapDist` becomes `dishDist`; seeds and free spots
    keep a margin from the glass (seed radius + 0.5 R; auto-seeder 2 R).
  - The detector must not read deflection turns as spinning (a bouncing swimmer turns 60–180° once per impact).
  - Saves keep the grid bytes; old 4:5 saves are centred and cropped into the new square grid.
  - The GDD (§4 "Bordes", Placa row of §8, §9 "sobre el toro") gets "(Corrección v1.2)" notes; CLAUDE.md's
    invariant "The dish is toroidal" becomes "The dish is a round walled disc that grows (ADR-022)".
