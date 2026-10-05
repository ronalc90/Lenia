# Decision log (ADRs)

Architecture decision records for **Bioluma** (working title, formerly "Petri"). One entry per decision that
changes what the code or the design must do. Newest decisions go at the bottom; never rewrite history, add a new
ADR that supersedes the old one.

- The game design lives in [`docs/GDD.md`](docs/GDD.md) (Spanish). ADR-003 to ADR-013 are the corrections that
  turned the original GDD v1 into v1.1; each changed spot in the GDD is marked **(Corrección v1.1)**.
- Format: **Status** / **Context** / **Decision** / **Consequences**. Dates are ISO (YYYY-MM-DD).

| ADR | Title | Status |
|---|---|---|
| [001](#adr-001-stack-typescript--vite--webgl2-vanilla-ui) | Stack: TypeScript + Vite + WebGL2, vanilla UI | Accepted |
| [002](#adr-002-exact-chan-polynomial-kernel-and-growth-kn1-gn1) | Exact Chan polynomial kernel and growth (kn=1, gn=1) | Accepted |
| [003](#adr-003-seeds-carry-asymmetric-noise-early-seeds-are-spores) | Seeds carry asymmetric noise; early seeds are "spores" | Accepted |
| [004](#adr-004-toroidal-dish-no-border-penalty) | Toroidal dish, no border penalty | Accepted |
| [005](#adr-005-extinction-availability-depends-only-on-the-essence-term) | Extinction availability depends only on the essence term | Accepted |
| [006](#adr-006-genome-discovery-bonus-counts-only-the-first-time-ever) | Genome discovery bonus counts only the first time ever | Accepted |
| [007](#adr-007-species-signature-excludes-mu-and-sigma) | Species signature excludes mu and sigma | Accepted |
| [008](#adr-008-diminishing-returns-per-repeated-species-colony-does-not-stack) | Diminishing returns per repeated species; colony does not stack | Accepted |
| [009](#adr-009-a-creature-is-stable-after-400-steps-behaviour-multiplier-after-1000) | Stable after ~400 steps; behaviour multiplier after ~1000 | Accepted |
| [010](#adr-010-fixed-grid-aspect-ratio-45) | Fixed grid aspect (4:5) | Accepted |
| [011](#adr-011-detector-and-bot-tests-at-128x128-when-r18-species-are-involved) | Detector/bot tests at 128x128 when R=18 is involved | Accepted |
| [012](#adr-012-trial-cuvette-is-deferred) | Trial cuvette is deferred | Accepted (deferral) |
| [013](#adr-013-8-fold-kernel-symmetry-reduces-weight-lookups-not-texture-reads) | 8-fold symmetry reduces weight lookups, not texture reads | Accepted |
| [014](#adr-014-fun-layer-golden-spark-objectives-achievements-juice) | Fun layer: Destello, objectives, achievements, juice | Accepted |
| [015](#adr-015-single-file-build-for-the-shareable-test-build) | Single-file build for the shareable test build | Accepted |
| [016](#adr-016-no-ads-donations-only) | No ads, donations only | Accepted |
| [017](#adr-017-detector-heuristics-are-reimplemented-from-published-research) | Detector heuristics reimplemented from published research | Accepted |
| [018](#adr-018-name-bioluma-and-save-format-prefix) | Name "Bioluma" and save format prefix | Accepted |
| [019](#adr-019-contracts-and-balance-have-single-owners) | Contracts and balance have single owners | Accepted |
| [020](#adr-020-autonomous-agents-use-the-subscription-never-an-api-key) | Autonomous agents use the subscription, never an API key | Accepted (not active yet) |

---

## ADR-001: Stack: TypeScript + Vite + WebGL2, vanilla UI

- **Status:** Accepted (2026-10-04)
- **Context:** Bioluma is a mobile-first, installable PWA that runs a live continuous cellular automaton at
  interactive speed on mid-range Android phones. WebGL2 covers about 98 % of active mobile browsers; WebGPU does
  not (yet). There is no maintained Lenia library for the web. The bundle budget is 600 KB target / 2 MB hard cap
  (GDD section 17), and the project is built largely by agents, which favours a small, explicit codebase.
- **Decision:**
  - Language **TypeScript** (strict), bundler **Vite**, rendering and simulation in **WebGL2** (RGBA16F
    ping-pong textures, never 8-bit).
  - **Vanilla TypeScript UI**: no React/Vue/Svelte, no UI framework, a minimal in-house component helper.
  - Audio is **Web Audio** synthesised at runtime, no audio files and no audio library.
  - **No new runtime dependencies.** Dev dependencies only: `vite`, `typescript`, `vitest`,
    `vite-plugin-singlefile`, `playwright-core`.
  - A verified **CPU reference** (`src/sim/cpu.ts`, FFT) exists for tests and balance bots.
- **Consequences:**
  - No WebGL1 fallback: unsupported devices see an explanatory screen with the repo link.
  - WebGPU is not used in v1; it stays an experiment for the High profile in Phase 4.
  - We reimplement Chan's approach instead of depending on a library; the reimplementation is credited
    (`CREDITS.md`).
  - Every added dependency needs its own ADR.

## ADR-002: Exact Chan polynomial kernel and growth (kn=1, gn=1)

- **Status:** Accepted (2026-10-04). Replaces the Gaussian bell kernel/growth proposed in GDD v1, section 4.
- **Context:** GDD v1 specified Gaussian bells (`K(r) = bell(r, 0.5, 0.15)`, `G(u) = 2*bell(u, mu, sigma) - 1`)
  and accepted that "Orbium tolerates the difference" (0.14/0.014 instead of 0.15/0.015). But the 548-species
  catalog of Bert Chan was fitted with the **polynomial** core (`kn = 1`) and growth (`gn = 1`). Only Orbium was
  known to tolerate the swap; every other species would need re-tuning and re-verification.
- **Decision:** Implement Chan's exact functions in both the CPU reference and the shaders:
  - kernel core per ring: `K_C(r) = (4 r (1 - r))^4`, `r` in `[0, 1]`, rings weighted by `b`, normalised to sum 1;
  - growth: `G(u) = 2 * max(0, 1 - (u - mu)^2 / (9 sigma^2))^4 - 1`;
  - update: `A <- clip01(A + dt * G(K * A))`, `dt = 1/T`.
  Catalog parameters (`mu`, `sigma`, `b`, `R`, `T`) are used **unchanged**. `src/sim/catalog.json` is a curated
  set of 26 species from `animals.json` (all with kn = 1, gn = 1).
- **Consequences:**
  - No parameter translation layer; "Orbium O2u survives 2000 steps at 64x64" is a hard test of the CPU sim, and
    the GPU sim must match it.
  - The risk row "catalog species do not stabilise with the Gaussian kernel" in the GDD is closed; the rule
    "every imported species is verified by a test before entering the bestiary" stays.
  - The shader and the CPU reference must keep the same formulas; a change to either needs this ADR superseded.

## ADR-003: Seeds carry asymmetric noise; early seeds are "spores"

- **Status:** Accepted (2026-10-04). GDD correction 1.
- **Context:** GDD v1 assumed a Gaussian-disc seed with about 25 % chance of producing a stable Orbium. The
  simulation is deterministic, so a radially symmetric seed stays radially symmetric forever and can never swim.
  Measured with the CPU reference sim (Monte Carlo, `scripts/seed-montecarlo.ts`): at **Orbium** parameters
  (mu 0.15, sigma 0.015) purely random blobs **die 100 %** of the time; at **Gyrorbium** parameters (mu 0.156,
  sigma 0.0224) random blobs **survive 50 to 100 %**. Success is a property of the regime, not just of the seed.
- **Decision:**
  - Every seed carries **smoothed, asymmetric noise** (`SeedSpec.noise`, deterministic via `rngSeed`).
  - Early seeds are **spores**: a catalog template of the species **nearest to the current (mu, sigma, R)**,
    blended with noise (`SeedSpec.bias`, 0 to 1), with a random rotation (`SeedSpec.rotation`).
  - The Gotero (dropper) and Estabilizador (stabiliser) upgrades, and the Mutagen reward, raise the **effective
    success rate** (more bias, better density); they never change the Lenia rule.
- **Consequences:**
  - The first-session promise (first stable creature before minute 3) is met by design, not by luck.
  - The balance bot must measure success rate per phase (targets in GDD section 18: 25 % at the start, 60 % with
    Gotero V and Estabilizador 10).
  - Risk: spores could hand out discoveries too cheaply. Mitigation: bias is largest early and shrinks where no
    nearby species exists; tracked in the balance metrics.

## ADR-004: Toroidal dish, no border penalty

- **Status:** Superseded by ADR-025 (round walled dish) for the game; kept for the CPU reference tests and the
  classic loop's legacy saves. Was Accepted (2026-10-04). GDD correction 2; resolves the GDD open question on toroidal dishes.
- **Context:** GDD v1 simulated a torus but treated border contact as "exploded" in the detector, and assumed the
  dish was shown with a border. That punishes a normal behaviour of every swimmer (leaving one side, entering the
  other) and makes the detector disagree with the simulation.
- **Decision:** The dish is toroidal **in the simulation and visually** (creatures wrap). There is **no
  border-contact penalty and no border term** in the GPU reduction. "Exploded" is measured by **mass/fill only**
  (mass above 10 % of the dish, or the quarter-window mass ratio outside (0.5, 3.0)). Centroids, displacements
  and inter-creature distances are computed on the torus (minimum wrapped distance).
- **Consequences:**
  - Swimmers live indefinitely; the camera and overlay must draw wrapped creatures (`src/core/camera.ts`).
  - The detector reduction is simpler (no border sum); connected-component labelling should treat the grid as a
    torus so a creature straddling an edge is still one creature.
  - Tests must include a swimmer crossing the boundary.

## ADR-005: Extinction availability depends only on the essence term

- **Status:** Accepted (2026-10-04). GDD correction 3 (part 1).
- **Context:** GDD v1 offered Extinction as soon as the Genome formula returned at least 5. Since the formula also
  includes discovery bonuses, a player who discovered a lot could become eligible within minutes, skipping the
  intended 45 to 90 min first era and the stall that motivates the decision.
- **Decision:** Extinction is available when `floor(sqrt(E_era / 1e4)) >= 5`, i.e. `E_era >= 250 000`. Discovery
  bonuses still add to the Genome that is **awarded**, but never to the **availability test**. The button always
  shows the full Genome that would be gained now and an estimate for 10 minutes later.
- **Consequences:**
  - The first-era target (45 to 90 min) is defended by the essence curve only; the balance bot checks it.
  - Players may see a large Genome preview while the button is still locked; the locked state must say why
    ("Essence earned this era: x / 250 000").
  - The threshold (`5`, `1e4`) lives in `src/game/balance.ts`.

## ADR-006: Genome discovery bonus counts only the first time ever

- **Status:** Accepted (2026-10-04). GDD correction 3 (part 2).
- **Context:** `G = floor(sqrt(E_era/1e4)) + 2*S_new + B_new`. GDD v1 defined `S_new` and `B_new` as "new in this
  era". The bestiary survives Extinction, so a species rediscovered in era 2 was ambiguous and could be farmed
  (extinguish, re-find, collect the bonus again).
- **Decision:** `S_new` (species) and `B_new` (behaviours, per species) count **only the first time in the whole
  lifetime of the save**. Rediscovering something already in the bestiary pays nothing, in any era.
- **Consequences:**
  - Genome growth from discovery is front-loaded and tapers off as the bestiary fills; late eras depend on the
    essence term (and on new content such as extra channels).
  - The save must keep lifetime "ever seen" sets (species ids, species+behaviour pairs) in `bestiary` / `stats`.
  - The GDD formula section and the degenerate-strategies table were updated accordingly.

## ADR-007: Species signature excludes mu and sigma

- **Status:** Accepted (2026-10-04). GDD correction 4.
- **Context:** GDD v1 put the parameters `(mu, sigma)` inside the signature vector. A species lives in a *range*
  of parameters, so the same creature seen at two nearby regimes would get two different signatures and be
  registered twice; the vector as written also did not add up to the 8 components the text claimed.
- **Decision:** The signature uses **morphology and behaviour only**, invariant to position and rotation: mass/R^2,
  radius of gyration/R, eccentricity, pulsation period, mean speed times T, mean angular speed, number of
  components (7 numbers; `Creature.signature` is documented as "NOT including mu/sigma"). The parameters are
  stored **as the range (mu, sigma) where the species lives**, updated as it is seen, and shown by the
  Microscopio upgrade. Match threshold stays `SPECIES_MATCH_THRESHOLD = 0.15`, calibrated so the 7 seed species
  fall in 7 distinct classes.
- **Consequences:**
  - `SpeciesView.muRange/sigmaRange` is persistent data, not part of identity.
  - Two truly different species that look alike at one regime can merge; the "merge/fuse" escape hatch for the
    player and calibration with the catalog mitigate it.

## ADR-008: Diminishing returns per repeated species; colony does not stack

- **Status:** Accepted (2026-10-04). GDD correction 5.
- **Context:** Filling the dish with clones of the best species was the dominant strategy (only the seeding cost
  grew), and the colony multiplier (x2.5) stacked on top of the divider multiplier (x2.2).
- **Decision:**
  - The k-th creature (k = 0, 1, 2, ...) of the **same species** yields `x 0.85^k` of its production.
  - The colony multiplier **does not stack** with the divider multiplier: take the **maximum**, not the product.
- **Consequences:**
  - Mixing species becomes profitable, which supports pillar 3 (discovering is progressing) and the Symbiosis
    node.
  - Production code must group stable creatures by species id before applying `0.85^k`; the bot's
    "dominant strategy" check (no behaviour above 70 % of income) uses it.
  - `0.85` is a tunable in `src/game/balance.ts`.

## ADR-009: A creature is "stable" after ~400 steps; behaviour multiplier after ~1000

- **Status:** Accepted (2026-10-04). GDD correction 6.
- **Context:** GDD v1 required two full 1000-step windows with a stable mass ratio, so a creature would take 2000
  steps (tens of seconds, plus the 200-step "born" phase) before paying anything. That conflicts with the first
  session promise and with "observe 5 to 20 s" in the main loop.
- **Decision:**
  - A creature becomes **stable** (and starts paying as "still", x1.0) after **~400 steps**: two short
    sub-windows (about 200 steps each) with mass ratio inside (0.5, 3.0), and one connected component holding at
    least 80 % of its mass. "Born" now lasts until ~400 steps.
  - Behaviour is classified over the full **~1000-step window**; **the behaviour multiplier `m_comp` is applied
    once classified**, then re-evaluated every window.
- **Consequences:**
  - At dt = 0.1 and 1 to 2 substeps per frame, 400 steps take about 3 to 7 s at 60 fps.
  - A creature can later be reclassified and the game announces it; income steps up when that happens.
  - Detector tests assert both moments (stable at ~400, behaviour at ~1000).

## ADR-010: Fixed grid aspect ratio (4:5)

- **Status:** Accepted (2026-10-04). GDD correction 8.
- **Context:** GDD v1 sized the grid to "the visible area". The UI panel collapses and expands (45 % down to
  15 % of the height), so the grid would change shape with the UI, which cannot be done without destroying the
  dish state (and the save, which stores the grid byte for byte).
- **Decision:** The grid has a **fixed aspect 4:5 (w x h)**: **medium 192 x 240**, **low 128 x 160**, **high
  224 x 280**. Collapsing or expanding panels **only changes the camera zoom** (`src/core/camera.ts`), never the
  grid. Placa (dish size) upgrades step through the sizes allowed by the device profile.
- **Consequences:**
  - Saves store `gridW`/`gridH`; importing a save from another profile must resample or refuse.
  - The cost model uses ~pi R^2 reads per cell per step (ADR-013): 192 x 240 at R = 13 is about 24 M reads/step.
  - The exact per-level split of the Placa upgrade is left to `src/game/balance.ts`.

## ADR-011: Detector and bot tests at 128x128 when R=18 species are involved

- **Status:** Accepted (2026-10-04). GDD correction 9.
- **Context:** Tests ran species at 64 x 64. An R = 18 kernel is 37 cells wide, more than half of a 64 x 64 torus,
  so the creature starts to feel its own wrapped image and Hydrogeminium and Kronium can misbehave for reasons
  that do not exist in the game (the smallest dish is 128 x 160).
- **Decision:** Detector, signature and bot tests use **64 x 64 for R = 13** species and **128 x 128 whenever an
  R = 18 species is involved**.
- **Consequences:** Those tests are about 4x more expensive on the CPU (FFT, power-of-two sizes); keep their
  step counts as low as the criteria allow and run them only in `npm test`, not on every typecheck.

## ADR-012: Trial cuvette is deferred

- **Status:** Accepted as a deferral (2026-10-04). GDD correction 7.
- **Context:** A review proposed an optional "trial cuvette": a small separate dish to try a seed or a regime
  without touching the main dish.
- **Decision:** Not in v0.1 / v1.1. If reconsidered, it needs its own ADR and a balance run, because it changes
  the seeding economy (free experiments).
- **Consequences:** Nothing to implement now; the GDD lists it under post-launch content as deferred.

## ADR-013: 8-fold kernel symmetry reduces weight lookups, not texture reads

- **Status:** Accepted (2026-10-04). Fixes a wrong claim in GDD v1, section 4.
- **Context:** GDD v1 said that 8-fold symmetry brings R = 13 "from about 531 to about 70 reads per cell". That
  is wrong: the kernel is symmetric, so there are about pi R^2 / 8 (about 70) **distinct weights**, but each of the
  ~pi R^2 (about 531) neighbouring cells is a different texel and must still be read.
- **Decision:** Use a precomputed 1D weight texture (about 70 entries) and sum symmetric neighbours with the same
  weight; keep the performance model at **~pi R^2 texture reads per cell per step**. The GDD text and the
  performance risk row were corrected.
- **Consequences:**
  - Cost scales with `R^2 x cells`; the Low profile (128 x 160) and the R slider range exist because of it.
  - Real savings must come from elsewhere (fewer cells, fewer substeps, FFT on the CPU reference, an optional
    separable approximation in the future), each with its own ADR.

## ADR-014: Fun layer: golden spark, objectives, achievements, juice

- **Status:** Accepted (2026-10-04). Adds GDD section 23.
- **Context:** The owner's brief: *it is a game, it must be a FUN incremental, it does not have to be 100 %
  chemically accurate*. GDD v1 had a sound economy but little moment-to-moment surprise and no guidance past the
  first minutes.
- **Decision:** Add four things on top of the design, none of which fakes life or blocks progress:
  1. **Destello** (golden spark): appears every 90 to 240 s, drifts across the dish for about 12 s; tapping it
     gives a random reward: **Floracion** (x7 production for 30 s), an instant lump (90 s of current production),
     **Lluvia de esporas** (5 free seeds) or **Mutagen** (next 3 seeds guaranteed to succeed).
  2. A **chain of objectives** under the HUD that guides the first hour, each with a small reward.
  3. **Achievements** with small permanent bonuses that survive Extinction.
  4. **Juice**: ripples, floating "+1.2" numbers from creatures, halos, sounds, particles on new species.
- **Consequences:**
  - New state in the save (`stats`, objective index, achievements) and new events (`goldenSpawn`,
    `goldenCollected`, `goldenMissed`, `achievement`, `income`) on the bus.
  - "Reduce motion" must switch off trails, particles and the floating-number animation.
  - The balance bot should include the Destello (average collection rate) so progress curves stay honest.
  - Pillar 1 stays intact: effects are decoration around creatures, never fake creatures.

## ADR-015: Single-file build for the shareable test build

- **Status:** Accepted (2026-10-04)
- **Context:** Early testers (and the owner on a phone) need to try the game without hosting: a file sent by chat or
  email, dropped in itch.io as an HTML5 zip, or opened from a download folder. A multi-file PWA build is awkward
  for that.
- **Decision:** `SINGLE=1 npx vite build` inlines scripts, styles and small assets into one HTML file
  (`dist-single/index.html`) using `vite-plugin-singlefile` and `assetsInlineLimit` raised to the maximum
  (`vite.config.ts`). The normal `npm run build` still produces the multi-file PWA in `dist/`. CI builds both and
  uploads `dist-single` as an artifact. `base` is `./` so both layouts work from any path.
- **Consequences:**
  - The service worker only registers on `http(s)` origins, so the single file (opened from `file://`) runs
    without offline caching; that is intentional.
  - The single file is larger than the split build; it is for sharing and testing, not for the production host.
  - Any new asset must stay inlinable (no runtime fetch of local files that would break from `file://`).

## ADR-016: No ads, donations only

- **Status:** Accepted (2026-10-04). Source: GDD section 19 and the 100-USD plan. **Partly superseded by
  ADR-021:** the "no purchases / no paid cosmetics" part is replaced by a cosmetic-only store (off by default);
  no ads, no accelerators and donations without in-game benefit still hold.
- **Context:** Vercel Hobby forbids ads and any payment method (donations are allowed); galaxy.click forbids
  games with advertisements; the incremental community reacts badly to monetised first versions.
- **Decision:** The game is free, with **no ads, no purchases, no passes, no paid cosmetics, no accelerators**. The
  only revenue path is a donation link ("Invite a coffee") inside Credits, never in the HUD or in toasts, with no
  in-game benefit for donating. Steam stays a later option only if donations exceed 1 000 USD or there is clear
  demand.
- **Consequences:**
  - No ad SDKs, no payment SDKs and no trackers beyond the optional, anonymous, opt-out analytics.
  - Any future monetisation needs a separate document and its own ADR, and cannot ship on galaxy.click.

## ADR-017: Detector heuristics are reimplemented from published research

- **Status:** Accepted (2026-10-04). GDD section 19 refers here for the citation.
- **Context:** The detector must classify dead / exploded / stable / swimming / spinning / pulsating / dividing
  with thresholds that are not invented by us.
- **Decision:** Port the **ideas and thresholds** (not the code) of two published projects, normalised by R and T:
  - Flowers team, `sensorimotor-lenia-search`, `expe/calc_categories.py` (displacement of the centroid scaled to
    the grid, mass limits for "exploded", Welch PSD with `nfft = 512` for oscillation);
  - Leniabreeder (Faldor and Cully), `lenia/lenia.py` (`is_empty`, `is_spread`: mass fraction inside the window
    centred on the centroid below 0.9).
  Thresholds used: dead if every cell is below 0.1; exploded above ~10 % of the dish or mass ratio outside
  (0.5, 3.0) (the border-contact criterion was dropped, ADR-004); stable by mass ratio over windows (ADR-009).
- **Consequences:**
  - Both projects are cited in `CREDITS.md`. The original plan reports their licences as MIT; re-check the licence
    files before copying any code verbatim. No code is copied today.
  - Where our constants differ from the sources (shorter stability window, toroidal wrap), the difference is
    documented in the detector module header and covered by tests on the catalog species.

## ADR-018: Name "Bioluma" and save format prefix

- **Status:** Accepted (2026-10-04)
- **Context:** The game was provisionally "Petri". The owner chose "Bioluma" as the working title (not final;
  domain availability is still to be checked).
- **Decision:** Use **Bioluma** everywhere in code, docs, manifest and UI. Exported saves use the prefix
  `BIOLUMA1.` and the file extension `.bioluma` (GDD v1 said `PETRI1.` and `.petri`); the save schema version is
  carried inside the payload. "Petri dish" remains the generic English word for the dish.
- **Consequences:** If the name changes again, only strings and the prefix change; the importer should keep
  accepting any prefix that was ever released.

## ADR-019: Contracts and balance have single owners

- **Status:** Accepted (2026-10-04)
- **Context:** Several agents work in parallel on `src/sim`, `src/detect`, `src/game`, `src/ui`, `src/audio`.
  Loose contracts and balance numbers scattered in code make parallel work collide and make the nightly balance bot
  unable to tune anything.
- **Decision:**
  - `src/core/types.ts` (and `bus.ts`, `camera.ts`, `palette.ts`) change **only through the integrator**; other
    modules may *add optional fields* and must report them.
  - **All balance numbers live in `src/game/balance.ts`**, each with a comment on its origin, so the balance bot
    and A/B experiments touch one file.
  - Player-facing text is always `Text { es, en }`; code identifiers are English.
- **Consequences:** Reviewers can reject any PR that hardcodes a number the economy depends on, or edits a
  contract without the integrator. This is written into `CLAUDE.md`.

## ADR-020: Autonomous agents use the subscription, never an API key

- **Status:** Accepted (2026-10-04). Source: the 100-USD plan. **Nightly agents are not activated yet.**
- **Context:** Documented incidents of cron jobs with an exported `ANTHROPIC_API_KEY` billing four figures in two
  nights. The plan runs agents on the owner's Claude subscription.
- **Decision:**
  - **No Anthropic API key** in the repo, in `.env`, in CI secrets or in a scheduled task's shell. Future agent
    workflows authenticate only with `CLAUDE_CODE_OAUTH_TOKEN` (subscription) or a native scheduled task.
  - Workflows set `timeout-minutes` and `--max-turns`, use concurrency 1 and read a repo variable
    **`NIGHTLY_ENABLED`** as a kill switch (exit if `false`).
  - Subscription usage credits stay off so hitting the limit rejects the run instead of billing.
  - The current `ci.yml` has `permissions: contents: read`, no secrets and no agent steps.
- **Consequences:** Activating the nightly cycle happens after Phase 0 with CI and `CLAUDE.md` ready (see
  `docs/ROADMAP.md`); until then no workflow may call a model.

## ADR-021: Cosmetic-only store and supporter subscription (supersedes the "no purchases" part of ADR-016)

- **Status:** Proposed (2026-10-04). Implemented behind `STORE_ENABLED = false`.
- **Context:** The owner asked for paid items and a subscription that give no gameplay advantage. ADR-016 allowed
  only donations because Vercel Hobby forbids charging and galaxy.click forbids ads. Payments need a host that
  allows commercial use and a seller that handles foreign taxes for a Colombian developer.
- **Decision:**
  - Sell **cosmetics only** (matter palettes, dish themes, halo/seed-trail/spark skins, music ambiences, ranking
    badges/frames/name colours), packs, and a **"Mecenas del laboratorio"** subscription (monthly 2.99 / yearly
    24.99 USD) whose perks are all cosmetic. No currency, no loot boxes, no timers, no store button in the HUD.
  - Fair play is enforced by tests: no gameplay keys in item data, spark skins keep brightness and geometry,
    palettes meet contrast on every dish, state indicators are never skinned, SFX never change.
  - Free cosmetics unlock through achievements; the wardrobe works everywhere, also with the store off.
  - Web payments through **Lemon Squeezy** (Merchant of Record); Play Billing on Android, Steam DLC on Steam,
    StoreKit on iOS later. Server-side entitlements (webhook HMAC + player ECDSA signature) are authoritative.
  - The paying production site and the store API run on **Cloudflare Pages + Functions + KV**; Vercel previews
    only run the mock or provider test mode. The store is hidden on galaxy.click, itch.io and CrazyGames.
  - Payments stay off (`STORE_ENABLED = false`) until accounts, products, webhook secret, KV and legal pages exist.
- **Consequences:** Adds no npm dependency (lemon.js loads lazily from Lemon Squeezy only when a checkout opens).
  New env vars: LEMONSQUEEZY_WEBHOOK_SECRET, LEMONSQUEEZY_VARIANTS, LEMONSQUEEZY_ALLOW_TEST, STORE_KV,
  STORE_ALLOWED_ORIGINS, VITE_STORE_ENABLED, VITE_BUILD_TARGET. Ranking cosmetics come from the server record.
  Changing which hosts may take payments needs a new ADR. See docs/MONETIZACION.md.

## ADR-022: Story layer: short dialogue scenes, a story-driven tutorial and ending cinematics

- **Status:** Accepted (2026-10-04). Source: owner request; design in [`docs/STORY.md`](docs/STORY.md).
- **Context:** GDD §3 said "no cinematics, no dialogue, only the Journal". The owner asked for an animated tutorial
  with a story, several endings and characters.
- **Decision:** add `src/story` (pure state machine, data-driven script, es/en) and `src/ui/story` (dialogue with
  animated procedural portraits, spotlight tutorial, two-button choices, environmental hints, ending cinematics).
  Guard-rails: lines ≤ 12 words in the tutorial and ≤ 20 elsewhere (tested), every scene skippable, the game never
  pauses, beats ≥ 20 s apart, endings never stop the game ("Continue the experiment"), hints are overlays around real
  creatures (pillar 1), choices do not touch the economy, reduce motion respected, the whole story can be turned off.
- **Consequences:** GDD §3 gets a "(Corrección v1.2)" pointing here; the UI tutorial is disabled in favour of the
  story tutorial. The story persists under its own storage key (`bioluma.story`) and is wired in `src/main.ts`
  (journal entries merged into the Bitácora, tab signals, archive in Settings, ending achievements).

## ADR-023: Final name, no ads, a paid game later

- **Status:** Accepted (2026-10-04). Source: the owner.
- **Context:** The working title, the business model and the storefronts were open. ADR-016 considered portals that
  pay through ads (CrazyGames).
- **Decision:** the name **Bioluma** is final. The game shows **no ads**, ever. It will be sold as a paid game later
  (Steam, mobile stores, web); the cosmetic store of ADR-021 stays optional and cosmetic-only. Ad-funded portals,
  CrazyGames included, are out.
- **Consequences:** no ad SDKs or ad placements in any build. Platform packaging (docs/PLATAFORMAS.md) targets paid
  storefronts; free web builds are demos or test builds.

## ADR-024: Art direction: code-drawn, one icon grid, warm candle against cold life

- **Status:** Accepted (2026-10-04). Source: owner request ("apartado artístico del más alto nivel"); the bible is
  [`docs/ARTE.md`](docs/ARTE.md).
- **Context:** an audit of every screen found mixed stroke widths, emoji next to line icons, no single primary-action
  colour, layering bugs and a cold-blue candle on VELA, which contradicts her name and the story.
- **Decision:**
  - All art stays code-drawn (SVG, Canvas 2D, shaders); still no AI art and no raster assets from generators.
  - One icon set in `src/ui/art/icons.ts`: 24 px grid, **stroke 1.75** (1.5 broke at 16–20 px), round joins, a 20 %
    duotone fill. Legacy icon functions re-export it.
  - Design tokens `--bl-*` (`src/ui/art/tokens.ts` → `art.css`), AA-tested text roles in both themes, z-layers.
  - Type: Inter for UI and **all player-facing numbers with tabular figures**; **Fraunces** for display titles and
    italic Latin names; JetBrains Mono only for instrument readouts.
  - VELA: glass flask, bioluminescent liquid, cork and a **warm** candle flame; six moods. One code-drawn backdrop per
    Mundo, so a world is picked by its look.
  - Matter ramp reaches white at 0.94 (not 0.7) so creature interiors keep structure.
- **Consequences:** GDD §14 gets "(Corrección v1.3)" for stroke and number type. CREDITS.md lists Fraunces. The
  integrators swap the art in following ARTE.md §12.


## ADR-025: Round walled petri dish that grows; glass deflection instead of wrap


- **Status:** Accepted (2026-10-04; live since v0.014). Supersedes ADR-004 (toroidal dish). Owner play-test decision.
  Draft and measurements: [`docs/DISH.md`](docs/DISH.md).
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
  - Placa levels set the rim diameter: **128**, 160, 192, 224 cells, capped by quality (low 160, medium/high 224).
    *(Amended v0.015: the ladder started at Ø96; fitted to a phone a Ø96 Orbium filled a big share of the screen —
    owner: «es muy grande». The start dish holds 3 creatures, measured: `cycleBalance.DISH_CAPACITY`, docs/ESPECIES.md §5.)*
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
  - Saves keep the grid bytes. *(Corrected v0.017, RF-05: old 4:5 saves were never centred and cropped. A saved dish
    is restored only on the grid it was saved on; any other dish — a 4:5 save, a Quality change, an import — is
    dropped and the session on it gets its starter / Nevera again, `Game.dishLost()`.)*
  - The GDD (§4 "Bordes", Placa row of §8, §9 "sobre el toro") gets "(Corrección v1.2)" notes; CLAUDE.md's
    invariant "The dish is toroidal" becomes "The dish is a round walled disc that grows (ADR-025)".
  - *(Amended v0.015)* **The dish never steps blind** (`src/sim/detectGate.ts`): at each 10-step snapshot
    boundary stepping waits until that snapshot is taken; a slow readback slows the dish instead of letting
    swimmers cross ~60 steps unsteered and die on the glass (the empty session-1 dish of v0.014,
    `tests/unit/starter-dish.test.ts`).



## ADR-026: Lab sessions with a clock, a research tree of 7 straight routes, and Worlds

- **Status:** Accepted (2026-10-05; live since v0.012, proposed in [`docs/CICLO.md`](docs/CICLO.md) §16 and moved
  here for the final review, RF-03). Supersedes the GDD's continuous loop (§5 Muestras and Genoma, §8 Laboratorio,
  §10 Extinción, §12 offline) and Calibrar (§4). Owner requests; pacing in [`docs/RITMO.md`](docs/RITMO.md).
- **Context:** the owner asked for a tree with branches and a clearer prestige ("a student with lab time"), then for
  straight routes where you always gain more and no chemistry knobs, and after the second play-test for a short,
  exciting, very incremental game that never punishes growth. The continuous Era loop could not give that: Extinción
  wiped what the player built, Calibrar asked for μ/σ by hand, and nobody reached the Genome.
- **Decision:**
  - The game is played in **lab sessions**: a short run on a fresh dish whose clock starts with the first seed and
    grows with the Reloj route (0:15 → 2:30, `cycleBalance.ts`). Creatures earn Esencia, spent in the run on seeds
    (one price rule, the dish's room is the limit) and Abono.
  - When the clock runs out the Esencia becomes **Datos** with a visible division (Esencia ÷ `DATOS_ESSENCE_DIV`)
    plus discovery bonuses (new species, variants, ways of moving, Encargos, Sparks, records), never fewer than
    `DATOS_MIN` for a run that used its clock. Datos are never lost.
  - Datos buy levels in a **research tree** of 7 straight routes around a centre (Reloj, Gotero, Placa, Vida,
    Descubrimiento, Mundos, Destello): every step needs only the one before, every level improves one number shown as
    "antes → después", price = `start(ring) × factor^level`.
  - The rules of life are 7 **Worlds** (presets checked on the CPU, `src/game/worlds.ts`), opened in order and picked
    on the start card; no sliders.
  - The **night** (the story's era) moves forward for free at the tree's centre once enough sessions and species are
    reached (`NIGHT_GATES`, with a fallback in sessions); the story's last question comes around night 7 (~2 h).
  - Retired: Calibrar and saved regimes, Muestras, Genoma, Extinción, the Turno de laboratorio and offline income.
    Classic saves are migrated generously (`src/game/legacy.ts`).
  - The ranking judges these saves by the session economy (nights, sessions, Datos; RF-01, `server/validate.ts`).
- **Consequences:**
  - The GDD keeps its text with "(Corrección v1.3)" notes on §4 (Calibrar), §5, §8, §10, §12 pointing to CICLO.md,
    RITMO.md and this ADR; §2 adopts the glossary of [`docs/CLARIDAD.md`](docs/CLARIDAD.md).
  - The session bot (`scripts/session-bot.ts`, engine `scripts/sessionBotCore.ts`) plays the integrated game and
    its HARD rule (the median player never earns less than in the session before) gates every balance change.
  - Encargos and the story change their era / Extinción / Calibrar conditions to nights, worlds and the tree.
  - The contract changes this needed are recorded in ADR-028.

## ADR-027: Time-lapse in the session runs and incubation under the start card

- **Status:** Accepted (2026-10-04). Source: the owner ("partidas de ~15 s que crecen, súper fluido"); design in
  [`docs/RITMO.md`](docs/RITMO.md) §4.
- **Context:** a seed needs 400 steps to turn stable (13 s at 30 steps/s), so a 15 s run would end before its first
  creature paid. CLAUDE.md forbids paying for anything that is not stable and "improving" the Lenia rule without an ADR.
- **Decision:** during a run the dish advances **`SESSION_SIM_PACE` = 1.5** times more steps per real second (45
  steps/s; with the Incubadora ×4/3, 60 steps/s; cap `SIM_PACE_MAX` = 4). *(Amended v0.015: was 3 = 90 steps/s; the
  owner found the creatures zipping around — «se mueve muy rápido». A seed is now stable in 8,9 s; the run's first
  seconds are carried by the pre-incubated starter. Session bot before/after: docs/ESPECIES.md §5.)* The update rule, `dt`, kernel, growth, dish
  topology, the RGBA16F state, the detector (400 steps to "stable", 800 for a new species) and the "only stable pays"
  gate **do not change**: there are only more steps per second, like a microscope time-lapse. Every run starts with
  the Nevera's pure-template creature(s) **incubated** for `PREINCUBATE_STEPS` = 420 real simulation steps under the
  start card (at most 40 steps a frame, the detector reading every 10th step as always, `game.tick(0, report)` so
  nothing is paid); production starts with the clock. All numbers live in `src/game/cycleBalance.ts`.
- **Consequences:** (1) the simulation does ~3× more work per second: the 30 fps floor of the mobile-emulated
  Playwright run is measured **with the time-lapse on** (if a phone cannot hold it, lower the grid quality on mobile,
  not the time-lapse); one snapshot every 10 steps and no `readPixels` per frame still hold (120 steps/s at 30 fps is
  4 steps a frame). (2) Creatures move and collide 3× more per real second; the session bot models it per step.
  (3) Hard gates gain one line: the fps floor is measured at `SESSION_SIM_PACE`.
- **Amendment v0.016 (QA4 F-02, F-04, F-07):** (a) the run clock counts **dish time** (steps run ÷ steps per second
  at the current pace, `src/game/dishClock.ts`), not wall time: a phone that cannot hold the pace gets a slower clock,
  never a starved dish; one honest notice says so when the dish runs below 75 % of real time. (b)
  `PREINCUBATE_STEPS` 420 → **1250**: a new species needs its behaviour read (~1000 steps of history) and 800 stable
  steps, so the 420-step starter registered at 17.8 s of clock, after a 15 s run, and the player's seeds sown on its
  path often fused with it first; the World 1 swimmer never entered the Bestiary. The detector, its 400/800-step gates
  and "only stable pays" are unchanged; the starter is simply watched longer before the clock (real steps, 32 frames).
  Measured on the real pipeline in `tests/unit/first-species.test.ts`; session bot: first species median S2 (planner) /
  S3 (kid) → S1 for every run of every policy; HARD rule OK before and after. (c) The glass deflector's bodies are
  extrapolated to the current step with the heading the last turns gave them (`src/sim/extrapolate.ts`): with the
  async readback the stale heading put a turn's pivot ~6 cells off the centroid and tore the starter apart before the
  first seed (`tests/unit/starter-lag.test.ts`).


## ADR-028: Contract removals of the sessions cycle (d9da2ef) and the retired classic loop

- **Status:** Accepted (2026-10-05, integrator; recorded for the final review, RF-03 and RF-09).
- **Context:** CLAUDE.md rule 1 lets agents only *add optional fields* to `src/core/types.ts`; removing or renaming
  one is a breaking change that must stop and ask. Commit `d9da2ef` («Juego: ciclo de sesiones en vivo, fuera
  Calibrar y bot clásico») retired Calibrar with ADR-026 and removed contract members without a record:
  `CalibrationView.muRange`, `sigmaRange`, `RRange`, `dtRange`, `regimes`, `maxRegimes`, `ringsOptions`, `hints`, and
  `GameActions.setCalibration`, `saveRegime`, `loadRegime`, `deleteRegime`, `setRings`.
- **Decision:**
  - The removal is a **deliberate breaking change approved by the integrator**: nothing may call a slider, save a
    regime or pick a ring preset any more (the World sets the rules), and keeping dead members would invite code that
    the game can no longer honour. `CalibrationView` is now the read-only rules of the dish (μ, σ, R, dt, rings).
    Every consumer (UI, story, Encargos, secrets, mock, dev pages) was updated in the same commit and the build is
    green; no later contract field was removed. `Settings.analytics` stays in the contract although the Settings
    switch was removed (RF-07: there is no telemetry); it is simply never read.
  - The classic Era loop in `src/game/game.ts` is **retired**: `createGame` defaults to the sessions cycle (RF-09), the
    app only plays sessions, and classic saves are migrated. The classic code and its unit tests remain, explicitly
    marked `cycle: 'classic'` with a header that says so, until a separate change deletes them together; player-facing
    regressions (seed spacing QA4 F-07/F-13, the round dish, the ranking) run in the sessions cycle.
- **Consequences:** future contract removals need an ADR like this one before they land; the reviewer checks
  `git diff -- src/core/types.ts` for removed members. Deleting the classic loop must delete its tests, its texts
  (`content.ts` UPGRADE_TEXT, the Extinción/Genoma Momentos and illustrations) and the classic validator path of the
  ranking only after no client older than the sessions cycle can submit.
