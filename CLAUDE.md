# CLAUDE.md: rules for AI agents working on Bioluma

Bioluma (formerly "Petri"; the name is final, ADR-023) is an incremental game whose resource is produced by live
**Lenia** artificial life (a continuous cellular automaton by Bert Chan). Mobile-first PWA, TypeScript + Vite + WebGL2,
vanilla UI. It is meant to be a **fun** incremental first and chemically accurate second.

Read before changing anything: [`docs/GDD.md`](docs/GDD.md) (design, Spanish, v1.5), [`DECISIONS.md`](DECISIONS.md)
(why things are the way they are), [`docs/ROADMAP.md`](docs/ROADMAP.md) (phases and what is next).

## Module map

| Path | Owns | Notes |
|---|---|---|
| `src/core/` | **Shared contracts**: `types.ts` (all interfaces), `bus.ts` (typed event bus), `camera.ts` (grid to screen), `palette.ts`; also `dish.ts` (round-dish geometry shared by sim, detector, game and UI) | Change **only via the integrator** (see rules). |
| `src/sim/` | Lenia simulation: `cpu.ts` (verified FFT reference, used by tests and bots), WebGL2 simulation/renderer, `catalog.ts` + `catalog.json` (26 curated species, RLE decoder) | Kernel/growth = exact Chan kn=1/gn=1 (ADR-002). |
| `src/detect/` | Creature detector: states, behaviours, species signatures (`signature.ts`) | Pure CPU, driven by `FieldSnapshot`. Signature has no mu/sigma (ADR-007). |
| `src/game/` | Economy, lab sessions and their clock, research tree, Worlds, collected light (drops, pipettes), pulse and streak, bestiary, golden spark, save; **`balance.ts`** and **`cycleBalance.ts`** (session/tree loop) | No DOM, no GL. Talks to the world through `GameView` / `GameActions` and the bus. The classic loop is retired (ADR-028). |
| `src/ui/` | HUD, dish overlay, dock and drawers, session cards, research tree, Sembrar button, toasts, juice; sub-folders `art/`, `fx/`, `intro/`, `moments/`, `secrets/`, `session/`, `store/`, `story/`, `tree/` (vanilla TS) | Reads `GameView`, calls `GameActions`. |
| `src/audio/` | Procedural Web Audio (drone, event sounds) | No audio files, no libraries. Starts only after the first tap. |
| `src/story/` | VELA's dialogue scenes, the story tutorial, Encargos, endings (data-driven script, es/en) | Pure TS, no DOM (ADR-022, docs/STORY.md). |
| `src/moments/` | Momentos: first-time explainers and their run budget | Pure TS, no DOM (docs/MOMENTOS.md). |
| `src/secrets/` | Secrets and easter eggs | Pure TS. Spoilers: docs/SECRETS.md. |
| `src/species/` | Species identity: hue, Latin name, catalog groups, portraits | Pure TS, no DOM. |
| `src/store/` | Cosmetic store and wardrobe: flags, catalog, entitlements, payment providers | Payments off by default (`STORE_ENABLED`, ADR-021, docs/MONETIZACION.md). |
| `src/net/` | Player identity (signing key), ranking client, integrity | No dependencies. |
| `src/platform/` | Where the game runs (web, PWA, TWA, Electron/Steam, Capacitor, portals) and its native hooks | Never imports a wrapper SDK. |
| `src/app/` | Glue used by `main.ts`: cosmetics setup, lysis, Momento gate, save bundle, extra journal, service-worker version | |
| `src/main.ts` | Integration: sim to detector to game to ui/audio, loop, autosave | Integrator-owned. |
| `scripts/` | Calibration and balance scripts (e.g. `seed-montecarlo.ts`, `session-bot.ts`), `bump-version.mjs` | Not shipped. |
| `server/`, `api/`, `functions/` | Ranking and store back end: `server/` holds the logic (Web `Request`/`Response`), `api/` the Vercel Edge wrappers, `functions/` the Cloudflare Pages Functions | No dependencies; tested from `tests/unit/`. |
| `platforms/` | Packaging: `desktop/` (Electron, Steam), `mobile/` (Capacitor, TWA), `steam/` (achievements, SteamPipe), `portals/` (itch.io, zips), `shared/` | Own `package.json` files; they package the web build in `dist/`. |
| `tests/unit/`, `tests/e2e/` | Cross-module unit tests; Playwright scripts (`smoke.mjs`, `session-play.mjs`, `layers.mjs`, …) and their server helper `vite-server.mjs` | Module unit tests sit next to the code (`*.test.ts`). |
| `public/` | PWA assets: manifest, icons, `sw.js` | Registered only on http(s). |
| `docs/` | `GDD.md`, `ROADMAP.md`, `source/` (original PDF and plan) | The GDD is Spanish; keep it that way. |

## Rules

1. **Contracts change only via the integrator.** `src/core/types.ts`, `bus.ts`, `camera.ts`, `palette.ts` are the
   interface between modules working in parallel. Never rename or remove a field. You may **add optional
   fields**; say so in your report so the integrator can wire them. If you need a breaking change, stop and ask.
2. **All balance numbers live in `src/game/balance.ts`** (or `src/game/cycleBalance.ts` for the session and
   research-tree loop), each with a comment on where it comes from (GDD section, ADR or measurement). No magic
   numbers for costs, rates, probabilities, durations or multipliers in `game/` or `ui/`. A number is not changed
   without a before/after run of the balance bot.
3. **Player-facing text is `Text { es, en }`** (both languages, always). Code identifiers, comments, commit
   messages and test names are English. `docs/GDD.md` stays Spanish.
4. **Simulation invariants** (do not "improve" these without an ADR):
   - Update rule `A <- clip01(A + dt * G(K * A))` with Chan's polynomial kernel core `(4r(1-r))^4` and growth
     `2*max(0, 1-(u-mu)^2/(9 sigma^2))^4 - 1` (ADR-002). CPU reference and shaders must agree.
   - The dish is a **round petri dish with absorbing glass** that grows with the Placa route (Ø128 → Ø224, capped by
     quality); swimmers are turned off the glass by the deflector, which must see every 10-step snapshot (the dish
     never steps blind). No wrap anywhere (ADR-025, supersedes ADR-004; the CPU reference keeps the torus for tests).
   - Fixed square grid per quality profile (low 168², medium/high 232²), allocated once; the dish is the disc inside
     it. Resizing a panel changes zoom only (ADR-010, ADR-025).
   - **RGBA16F ping-pong, never 8-bit** for the simulation state. No `readPixels` per frame (one snapshot every
     10 steps).
   - Seeds always carry asymmetric noise; early seeds are spores built from the nearest catalog template
     (ADR-003).
5. **No new npm dependencies** without an ADR (zero runtime dependencies today). No UI framework.
6. **The GDD is the spec.** If code and GDD disagree, fix the code, or change the GDD with an ADR and mark the
   spot "(Corrección vX.Y)". Do not silently drift.
7. **Never commit secrets or keys.** No Anthropic API key anywhere (repo, `.env`, CI secrets, scheduled-task
   shells). Future agent workflows use only `CLAUDE_CODE_OAUTH_TOKEN`; every such workflow must set
   `timeout-minutes` and `--max-turns`, use concurrency 1 and honour the kill switch repo variable
   **`NIGHTLY_ENABLED`** (exit when `false`). See ADR-020.
8. **Do not commit or push unless asked.** When working as a sub-agent, edit only your assigned folders and
   leave the commit to the integrator. Agents never push to `main`; each work item is a small PR.
9. **Roles keep each other honest:** the reviewer cannot approve their own PR, the director does not write code,
   adversarial QA tests the deployed build without reading the source. Every QA bug gets a failing test first,
   then the fix.
10. **Attribution is part of the code.** Catalog data is Bert Chan's (MIT). Keep `CREDITS.md` accurate when you add
    a source, font or asset. No AI-generated art in the game; all audio is synthesised at runtime.

## Commands

```bash
npm ci                      # install exactly what package-lock.json says
npm run dev                 # Vite dev server
npm run typecheck           # tsc --noEmit (strict, noUnused*)
npm test                    # vitest run (src/**/*.test.ts and tests/unit/**)
npx vitest run src/detect   # tests of one folder
npm run build               # typecheck + production build into dist/
SINGLE=1 npx vite build     # single-file build into dist-single/ (shareable test build, ADR-015)
npm run preview             # serve dist/
npm run e2e                 # Playwright smoke test (tests/e2e/smoke.mjs); builds dist-e2e/ with VITE_E2E=1 itself
npm run e2e:single -- --shots /tmp/shots   # same on a VITE_E2E=1 SINGLE=1 build in dist-e2e-single/, with screenshots
npx vite-node scripts/seed-montecarlo.ts O2u 40 0      # [species code] [trials] [bias]
```

Headless browsers: use `playwright-core` with `executablePath` found under `/opt/pw-browsers`
(`chromium-*/chrome-linux64/chrome`). **Never run `playwright install`.**

## Hard gates (nothing merges unless all are green)

- `npm run typecheck`, `npm test` and `npm run build` pass; `SINGLE=1 npx vite build` passes. CI runs all four.
- Orbium (R = 13, mu = 0.15, sigma = 0.015) survives 2000 steps in the CPU reference test.
- Uniform soup yields 0 Luz (Essence in code); the detector never pays for a creature that is not "stable".
- No light drop fills on a creature that is not stable; light made is never lost: collected, or swept at the end
  (ADR-030).
- A tap on anything but a stable creature pays nothing; an idle player never earns less than before (ADR-031).
- Detector/bot tests at 64x64 for R = 13 species and **128x128 when R = 18 species are involved** (ADR-011).
- Frame floor: at least 30 fps in the mobile-emulated Playwright run (60 is the target); no `readPixels` per frame.
- The 30 fps floor is measured with the session time-lapse on (`SESSION_SIM_PACE`, ADR-027).
- Bundle at most 2 MB compressed (target 600 KB); no new dependency without an ADR.
- Every bug found by QA has a regression test; every balance change has a bot report before and after.
- No API keys or secrets in the repo or in CI. `ci.yml` keeps `permissions: contents: read`.

## Coding style

- TypeScript `strict`, no `any` (use `unknown` and narrow), no unused locals/parameters (the compiler enforces it).
- Small pure functions for rules (economy, detector metrics, audio event programming); side effects at the edges.
- Deterministic code takes an explicit RNG seed; never call `Math.random()` inside simulation or tests.
- ES modules, named exports, no default exports except config files. Relative imports inside a module, public
  surface through the module's main file.
- Comments explain *why* (a constant's origin, a non-obvious invariant), not *what*. Cite the GDD section or ADR
  when a number or rule comes from one.
- Hot paths (convolution, reduction, detector loops) allocate nothing per frame; reuse typed arrays.
- UI: vanilla DOM, touch targets at least 48x48 px, contrast AA, honour `reduceMotion`, no modals for normal play.
- Tests next to the code (`foo.ts` and `foo.test.ts`); test names say the behaviour ("uniform soup yields zero
  essence"), not the function.

## How to grow this file

`CLAUDE.md` grows from repeated failures, not from opinions:

1. When the reviewer **rejects two PRs for the same cause**, the rule that would have prevented it is added
   to *Rules* (one or two lines, imperative, with the ADR/GDD reference if any).
2. When a procedure is repeated three times (for example "generate the balance report"), it becomes a skill or a
   script in the repo and is listed under *Commands*.
3. Rules that were never useful in a full cycle are removed in the cycle retrospective. Keep this file short enough
   to be read in full at the start of every session.
4. Contracts, balance numbers and architecture choices never live only here: they go in `DECISIONS.md` first.

### Rules learned from reviews

*(none yet)*
