[[Español|Desarrollo]] · **English**

# Development: for people who want to help

Thank you for wanting to help! This page is for **people who code** (or want to learn). If you just want to play, go back to [[How to play|How-to-play-en]].

The repository: [github.com/ronalc90/Lenia](https://github.com/ronalc90/Lenia) · **MIT** license.

## What we use

| Thing | With what |
|---|---|
| Language | Strict **TypeScript** |
| Bundler | **Vite** |
| Simulation and drawing | **WebGL2** (RGBA16F ping-pong textures) |
| UI | **Plain TypeScript**: no React, Vue or Svelte |
| Sound | **Web Audio**, all synthesised on the fly (no audio files) |
| Tests | **Vitest** (unit) and **Playwright** (`playwright-core`) for browser tests |
| Runtime dependencies | **Zero** |

Every new dependency needs its own ADR in [`DECISIONS.md`](https://github.com/ronalc90/Lenia/blob/main/DECISIONS.md).

## Start in 1 minute

```bash
git clone https://github.com/ronalc90/Lenia.git
cd Lenia
npm ci                    # installs exactly what package-lock says
npm run dev               # development server (Vite)
```

You need **Node 22** and a browser with **WebGL2**. In development, `window.bioluma` (`{ game, sim, detector, camera, bus }`) is available in the console for poking around.

## Commands

| Command | What for |
|---|---|
| `npm run dev` | Development server |
| `npm run typecheck` | `tsc --noEmit` (strict, no unused variables) |
| `npm test` | **Vitest**: `src/**/*.test.ts` and `tests/unit/**` |
| `npx vitest run src/detect` | Only one folder's tests |
| `npm run build` | Typecheck + production build into `dist/` |
| `SINGLE=1 npx vite build` | **Single-file** build into `dist-single/` (for sharing) |
| `npm run preview` | Serves `dist/` |
| `npm run e2e` | Build with `VITE_E2E=1` and a Playwright smoke test |
| `npm run e2e:sim` | GPU simulation checks |
| `npm run e2e:audio` | Offline audio render, with peak control |
| `npm run calibrate` | Recalibrates the detector signatures with the catalog (~4 min) |
| `npm run bot` | Balance bot: plays the game sped up and measures the curve |
| `node tests/e2e/ui-shots.mjs` | UI screenshots with sample data (`ui-dev.html`) |
| `node tests/e2e/wiki-shots.mjs` | Regenerates this wiki's screenshots from the real game |

For headless browsers use `playwright-core` with the Chromium found in `/opt/pw-browsers`. **Never** run `playwright install`.

## Code map

| Path | What is there | Careful |
|---|---|---|
| `src/core/` | Shared **contracts**: `types.ts`, `bus.ts`, `camera.ts`, `palette.ts` | Only changed through the integrator. You may **add optional fields**, never rename |
| `src/sim/` | Simulation: WebGL2 shaders, CPU reference with FFT, 26-species catalog | Chan's exact formulas (ADR-002) |
| `src/detect/` | Detector: states, behaviours, species signatures | Pure CPU; the signature has no μ or σ (ADR-007) |
| `src/game/` | Economy, upgrades, prestige, bestiary, objectives, achievements, Spark, saving and **`balance.ts`** | No DOM or GL |
| `src/ui/` | HUD, dish, tabs, modals, tutorial, texts (`i18n.ts`) | All UI in plain TypeScript |
| `src/audio/` | Procedural audio | Only starts after the first tap |
| `src/net/` | Leaderboard client and integrity | Optional for the player |
| `src/store/` | Cosmetics catalog and entitlements | Visual or audible only; nothing touches the economy |
| `src/story/`, `src/secrets/` | Narrative and hidden content | **Spoilers**: read only if you want to |
| `src/main.ts` | Wires everything: sim → detector → game → UI and audio; loop and autosave | Touched by the integrator |
| `api/`, `server/` | Leaderboard (Vercel Edge functions and pure logic) | See `docs/RANKING.md` |
| `platforms/` | Wrappers: desktop (Electron), mobile (Capacitor), Steam | See `docs/PLATAFORMAS.md` |
| `scripts/` | Calibration, balance bot, icons | Not shipped |
| `tests/unit/`, `tests/e2e/` | Cross-module and browser tests | A module's own tests live next to its code |
| `docs/` | `GDD.md` (design), `ROADMAP.md`, `REVIEW.md`, `wiki/` (this wiki) | The GDD is in Spanish |

Each frame goes: `requestAnimationFrame` → simulation steps (30 per second × speed) → every 10 steps the dish is read → the **detector** → the **game** (`game.tick`) → `sim.render` and the UI.

## The golden rules

Summary of [`CLAUDE.md`](https://github.com/ronalc90/Lenia/blob/main/CLAUDE.md):

1. **Contracts only through the integrator** (`src/core`). Adding optional fields is fine.
2. **Every balance number lives in `src/game/balance.ts`**, each with a comment saying where it comes from. No magic numbers in `game/` or `ui/`.
3. **All player-facing text is `Text { es, en }`**, in both languages. Identifiers, comments and test names are in English.
4. **Simulation invariants**: Chan's formulas, toroidal dish, 4:5 aspect, RGBA16F (never 8-bit), seeds with asymmetric noise. They are not "improved" without an ADR.
5. **No new dependencies** without an ADR. No UI framework.
6. **The GDD is the spec.** If code and GDD disagree, one of them is fixed with an ADR.
7. **No secrets or keys in the repo.** No AI API key anywhere.
8. **Small pull requests.** Nobody pushes to `main` directly.
9. **Every bug brings its test.** First the failing test, then the fix.
10. **Attribution is part of the code**: keep `CREDITS.md` up to date.

## Tests and CI

- **Unit** (`npm test`): simulation, detector, economy, saving, text, leaderboard… Detector tests use 64×64 for R = 13 species and **128×128** when an R = 18 one is involved (ADR-011).
- **Browser** (`npm run e2e`, `e2e:sim`, `e2e:audio`): the GPU simulation, the audio and a real walk through the game.
- **CI** (`.github/workflows/ci.yml`): on every push and PR it runs **typecheck, tests, PWA build and single-file build**, and uploads the single file as an artifact. It only has read permission and no secrets.
- **Release** (`.github/workflows/release.yml`): builds the web, desktop and Android packages on every `v*` tag.
- **Wiki** (`.github/workflows/wiki-sync.yml`): publishes `docs/wiki/` to the GitHub wiki (see below).

## How to add a species

Species come from Bert Chan's catalog (MIT). Steps:

1. Copy the entry from `animals.json` into **`src/sim/catalog.json`** with the fields `code`, `name`, `R`, `T`, `b`, `m`, `s` and `cells`. **Only entries with `kn = 1` and `gn = 1`** (what our shaders implement).
2. Assign its **rarity** in `RARITY_BY_CODE`, in `src/game/balance.ts`.
3. Run **`npm run calibrate`** (about 4 minutes). With `ONLY=code` it measures a single species without writing the file. This regenerates **`src/detect/catalogSignatures.json`**, which the game uses to give a species its real name when it is registered.
4. If it has R = 18 or more, its tests run at **128×128** (ADR-011).
5. Run `npx vitest run src/sim src/detect src/game` and check it stabilises with its own μ and σ.
6. Add its row to the table in **`CREDITS.md`**.

## How to add an upgrade

1. **Numbers** in `src/game/balance.ts`: costs, growth, bonus, cap. With a comment about their origin.
2. **Definition** in the `UPGRADES` list of `src/game/defs.ts`: `id`, `tab` (`'lab'` or `'bestiary'`), `currency`, `maxLevel`, `costs` or `base` and `growth`, `value(level)` and `unlock(ctx)`.
3. **Texts** in `UPGRADE_TEXT` of `src/game/content.ts`: `name`, `desc` and `hint`, each with `es` and `en`. If the effect needs a sentence per level, add the case to `effectText`.
4. **Effect**: use it where it belongs in `src/game/game.ts` or `economy.ts` (for example `level('myUpgrade')`).
5. **Card icon** in `UP_ICONS` of `src/ui/upgrades.ts` (otherwise a generic one is used).
6. **Tests** in `src/game/upgrades.test.ts` (and economy tests if production changes): cost, cap, unlock and effect.
7. Run the **balance bot** before and after: `npm run bot`. No number changes without that report.

## How to add a language or a text

- Game texts (upgrades, achievements, objectives): `src/game/content.ts`, always `{ es, en }`.
- UI texts: the `S` object in `src/ui/i18n.ts`. A test checks that every key has both languages and the same `{placeholders}`.

## This wiki

The pages live in **`docs/wiki/`** in the repository. When a change to that folder lands on `main`, **`wiki-sync.yml`** copies it to the GitHub wiki.

- File names are the titles (`Cómo-jugar.md` → "Cómo jugar"). English versions end in `-en`.
- `{{GAME_URL}}` is replaced by the repository variable `GAME_URL`.
- Images are in `docs/wiki/images/`. To regenerate them from the real game: `node tests/e2e/wiki-shots.mjs` (takes about 15 minutes; read the header of the file).
- **`Secrets` must stay spoiler-free.** If you add hidden content to the game, do not describe it in the wiki.

## Documentation map

| Document | What it tells |
|---|---|
| [`docs/GDD.md`](https://github.com/ronalc90/Lenia/blob/main/docs/GDD.md) | Game design (in Spanish) |
| [`DECISIONS.md`](https://github.com/ronalc90/Lenia/blob/main/DECISIONS.md) | Decisions (ADRs) and why |
| [`docs/ROADMAP.md`](https://github.com/ronalc90/Lenia/blob/main/docs/ROADMAP.md) | Phases and what is next |
| [`docs/REVIEW.md`](https://github.com/ronalc90/Lenia/blob/main/docs/REVIEW.md) | Architecture and bug review |
| [`docs/PLATAFORMAS.md`](https://github.com/ronalc90/Lenia/blob/main/docs/PLATAFORMAS.md) | How it is published on each platform |
| [`docs/RANKING.md`](https://github.com/ronalc90/Lenia/blob/main/docs/RANKING.md) | Leaderboard and anti-cheat |
| [`CREDITS.md`](https://github.com/ronalc90/Lenia/blob/main/CREDITS.md) | Attributions and licenses |
| [`CLAUDE.md`](https://github.com/ronalc90/Lenia/blob/main/CLAUDE.md) | Rules for AI agents and people |

Questions? Open an *issue*: [github.com/ronalc90/Lenia/issues](https://github.com/ronalc90/Lenia/issues).
