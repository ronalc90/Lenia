# QA #1 — Adversarial functional test report (Bioluma)

*Tester: QA #1 (functional). Date: 2026-10-04. Branch `main`.*

## Scope and method

- Real game, e2e build (`VITE_E2E=1`), served with `vite preview`, driven in headless Chromium (SwiftShader) at
  **mobile 390×844 touch** and **desktop 1366×768 mouse + keyboard**, plus 844×390, 320×568, 600×1024, 1024×600.
- Two builds were tested: the first one at the start of the session (≈ `87d2419` + working tree) and a rebuild at the end
  (`530014e` + working tree, which already includes `ec8da02` "placa desbordada marca todo como explosión"). Every open
  finding below was **re-verified on the final build**; file:line references are to the tree at `1021312` + working tree (the
  working tree kept changing during the session, so lines may drift).
- The suite starts its own `vite preview` (from the repo root, killed at the end); `--dist` is relative to the repo root.
- Player actions went through real input (taps, CDP touch gestures for long press / brush / pinch, mouse, keyboard).
  The debug handle `window.bioluma` was used only to read state, to craft saves for late-game screens
  (`game.importString` of a crafted save, or a crafted `localStorage` before boot) and, for the explosion scenario,
  to drop two large blobs with `sim.seed` — said explicitly where used.
- The machine was shared with other agents (load average 23–31 on 4 cores, frames 400–700 ms): no performance
  verdicts are given; timings below are only relative.
- Regression suite: [`tests/e2e/qa/functional.mjs`](../../tests/e2e/qa/functional.mjs) (helpers in
  `tests/e2e/qa/qa1-lib.mjs`, fixture `tests/e2e/qa/qa1-base-state.json`). Exit code 1 on failure.

```bash
VITE_E2E=1 npx vite build --outDir /tmp/bioluma-e2e
node tests/e2e/qa/functional.mjs --dist /tmp/bioluma-e2e            # all tests (explosion test takes minutes)
node tests/e2e/qa/functional.mjs --dist /tmp/bioluma-e2e --skip-slow --only offlineBoot,rename
BIOLUMA_URL=http://localhost:4173/ node tests/e2e/qa/functional.mjs  # reuse a running preview
```

Screenshots: `/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad/qa-*.png`
(prefix `m-` mobile, `d-` desktop, `n-` final build, `x-` both).

## Findings (prioritised)

### 1. BLOCKER — Every returning player (away > 60 s) gets a dead game

- **Repro:** play, close the tab, come back more than 60 s later (in the test: `bioluma.savedAt = now − 2 h` or
  `now − 61 s` with any valid save). Reload.
- **Expected:** offline card "Mientras no estabas +X", then the game runs.
- **Actual:** uncaught `ReferenceError: Cannot access 'F' before initialization` (minified; `'X'` in the final build).
  Boot aborts before the frame loop: the splash and the offline card still show ("+35.409 de Esencia en 2 h",
  "Continuar"), but after that the dish is black, Essence shows `0`, nothing reacts. A second reload within 60 s
  "fixes" it (the crash happens after the save write), so players experience it every time they return after a while.
  Happens even with zero production history (away 61 s).
- **Evidence:** `qa-m-32-offline-boot.png`, `qa-m-33-offline-boot-after-tap.png`, `qa-m-34-offline-dead.png`;
  console `pageerror: Cannot access 'F' before initialization`.
- **Cause:** `src/main.ts:311` calls `grantOffline()` (`main.ts:303`) during boot → `save()` (`main.ts:420`) →
  `saveWarned = false` at `main.ts:439`, but `let saveWarned` is declared at `main.ts:415`, **after** line 311 →
  temporal dead zone.
- **Fix:** declare `let saveWarned = false` (and ideally `save()`) before the first `grantOffline` call, or run the
  boot-time `grantOffline` at the end of `boot()` (after the loop starts). Regression test: `offlineBoot`.

### 2. MAJOR — Renaming a species is impossible (pencil does nothing) on desktop and on Android-style touch

- **Repro:** Bestiario → open any species card → click/tap the pencil "Renombrar".
- **Expected:** a name field appears. **Actual:** nothing happens (the pencil gets focus, no input). Verified with
  mouse (desktop) and touch tap (mobile emulation) on the final build.
- **Evidence:** `qa-d-21-rename.png`, `qa-n-rename-desktop.png`, `qa-n-rename-mobile.png`; programmatic `click()`
  with the button blurred does open the field.
- **Cause:** `src/ui/modals.ts:595` — `if (renaming && m.body.contains(document.activeElement)) return;` The pencil
  that was just clicked is the focused element inside `m.body`, so the re-render that should show the input returns
  early, and keeps returning on every `update` while the button holds focus.
- **Fix:** only skip the re-render when the focused element is the rename input itself
  (`document.activeElement?.matches('.rename-form input')`), or `blur()` / re-render unconditionally in
  `startRename`. Regression test: `rename`.

### 3. MAJOR — With storage fully blocked the player is never told that nothing is being saved

- **Repro:** private window / "block all cookies" (test: `Storage.prototype.*` throw, or `window.localStorage` getter
  throws). Play, close.
- **Expected:** the existing warning toast "No se pudo guardar la partida en este navegador. Exporta tu partida desde
  Ajustes." **Actual:** no warning; all progress is lost on close. (With a *full* quota the toast does appear.)
- **Cause:** `src/game/save.ts:50–63` `storage()` silently falls back to the in-memory store when the probe throws,
  and `set()` then succeeds, so `writeSave()` returns `true`.
- **Fix:** export `isPersistent()` (or make `writeSave` return `false` when the backing store is `memoryStorage`) so
  `main.ts save()` shows the warning once. Regression test: `storage`.

### 4. MINOR (robustness, total impact) — A corrupted UI preference bricks the game with no way out

- **Repro:** `localStorage['bioluma.tutorial'] = 'null'` → boot crash `Cannot read properties of null (reading
  'done')`; `= '{"done":true}'` → `boolean true is not iterable`; `localStorage['bioluma.ui.v1'] =
  '{"intros":5}'` → `this.prefs.intros.includes is not a function` (game half-built). Settings (and "Borrar partida")
  are unreachable, so a player cannot recover.
- **Cause:** `src/ui/tutorial.ts:259–260` (`new Set(saved.done ?? [])` on unchecked JSON), `src/ui/ui.ts:270`
  (spreads unchecked JSON into `prefs`, later used as arrays: `prefs.intros.includes`, `prefs.hints.push`…). `loadJSON` only guards parse
  errors, not shapes.
- **Fix:** validate shapes (`Array.isArray`, `typeof === 'boolean'`, object not null) and fall back to defaults; the
  game save already does this well (`state.ts validateState`). Regression test: `corruptPrefs`.

### 5. MINOR — Rename/regime names: field allows 28 chars but 24 are kept; truncation breaks emoji

- **Repro:** rename a species with 28 characters → stored 24 silently. Name `'A'×23 + '🦠🦠'` → stored with a lone
  surrogate; `'🦠🧬✨ Ñandú 漢字 👨‍👩‍👧‍👦'` → stored `…👨‍👩‍👧‍` (dangling ZWJ). Same for regimes.
- **Cause:** `src/ui/modals.ts:637` `maxlength: '28'` vs `src/game/game.ts:1703` `sanitizeName(...).slice(0, 24)`
  (UTF-16 units); `game.ts:1618` regimes.
- **Fix:** `maxlength="24"` and truncate by grapheme (`Intl.Segmenter` or at least `Array.from`).
  (HTML injection is correctly neutralised: `<>` stripped on rename, and imported names with
  `<img src=x onerror=…>` render as text in the bestiary, card and regimes.)

### 6. MINOR — Open modals keep the old language in their title

- **Repro:** Ajustes (ES) → English. Body relabels, the header stays "Ajustes" (and vice versa "Settings"); the
  species card keeps "Bestiario". Also default regime names are baked in the language active when saved
  ("Régimen 1" in English UI).
- **Cause:** `src/ui/modals.ts:59` sets the title once in `show()`; `relabel` (`modals.ts:569`, `614`) only rebuilds
  the body.
- **Fix:** keep a reference to `titleEl` and update it (and `aria-label`) in `relabel`. Regression test: `language`.

### 7. MINOR — Import gives no feedback on empty input and replaces the game without confirmation

- Empty textarea → "Importar" does nothing (no toast). Saves from another version (`v:0`/`v:2`) get the generic "No
  se pudo importar esa partida" (no "this save is from a newer version" hint). "Exportar" fills the same textarea, so
  "Exportar" then "Importar" silently re-imports the current save and **wipes the living dish**
  (`game.ts replaceState → dishClear`).
- Robustness is otherwise excellent: garbage, bad base64/UTF-8, raw JSON, bad checksum, negative Essence,
  level > max, 4 MB strings are all rejected with state unchanged and no console errors.
- **Fix:** toast on empty; specific message on version mismatch; a two-step confirm like "Borrar partida" before
  replacing a game.

### 8. MINOR — Desktop: ~40 % of the visible dish silently ignores clicks

- **Repro:** desktop 1366×768: the dish frame is ~878 px wide but the 4:5 grid is ~520 px; clicking the dark side
  bands does nothing (no seed, no ripple, no hint). 3 of my first 5 clicks were lost (`qa-d-01-after60.png`,
  `qa-d-02-marginclick.png`).
- **Cause:** `src/ui/ui.ts:1294` returns on `!cam.isOnDish(...)` without feedback (by design of `camera.isOnDish`).
- **Fix:** since the dish is toroidal (ADR-004), either render/accept the wrapped copy in the bands, or visibly mark
  them as outside (hatched/dimmed) and show a small "toca dentro de la placa" ripple.

### 9. POLISH — Golden spark can be taken while paused

- Pausing freezes the spark (`game.ts tick` returns when paused), so pause → aim → tap always succeeds, and its
  "spores" reward seeds the dish while paused (`qa-d-72-golden-collected-paused.png`).
- **Fix:** ignore `collectGolden()` while `paused` (`src/game/game.ts:1088`), or hide the spark during pause.

### 10. POLISH — Key labels truncated on phones

- Pipette pill "Pipeta de emerg… 100%" (390 px) / "Pipeta d…" (320 px), eraser pill "Toca para borrar m…", toasts
  "Comportamiento nuevo: d…", objective at 320 px (`qa-m-56-pipette.png`, `qa-m-57-erase2.png`,
  `qa-m-70-resize-320x568.png`). At 100 % the pipette does not say what to do ("¡Toca para sembrar gratis!").
- **Fix:** allow two lines / shorter copy; keep the action verb visible.

### 11. POLISH — Two coach marks at once on the first seed

- After the first tap the tutorial bubble "Paciencia de laboratorio" and the Lab inline hint "Gasta Esencia en
  mejoras…" appear together, both with "Entendido" (`qa-m-02-afterTap1.png`); later the "¡Vida!" spotlight lens covers
  the HUD and pause button (`qa-m-06-explosion.png`).
- **Fix:** suppress inline panel intros while a tutorial bubble is visible.

### 12. POLISH — Unsupported screen mixes languages

- Spanish screen shows the raw English error "WebGL2 is not available on this device" (`qa-x-50-noWebgl2-mobile.png`).
  Otherwise correct: friendly screen + "Reintentar", no crash, on mobile and desktop, for `getContext('webgl2') = null`
  and for `getContext` throwing.
- **Fix:** localise the message or hide it behind "Detalles".

### 13. POLISH — "1 huecos → 2" / "1 slots → 2"

- `src/game/content.ts:172–173` pluralises unconditionally. **Fix:** singular for 1.

### 14. POLISH — Bestiary renders every card

- A 5 000-species import (accepted, 1.6 MB save) makes each frame ~3× slower while the Bestiario tab is open; 400
  species is fine. Only matters for very long games or imported saves. **Fix:** paginate / virtualise the grid.

## Verified fixed during the session

- **Objective text invisible in light theme** (build `530014e` + working tree): the floating "OBJETIVO" sentence was
  `rgb(230,237,243)` on `rgba(255,255,255,0.9)` (≈ 1.2:1 contrast, `qa-n-explosion-cleaned.png`) because
  `.bl[data-theme=light] .bl-dish>.bl-objective` painted the pill white. A rebuild of the current working tree
  (`0f27c5d` + wt) already ships the dark glass in both themes (`src/ui/ui.css:3859–3864`). Suggest adding an
  automated contrast check (≥ 4.5:1) for `.obj-text` so it does not come back.

- **Dish-filling explosion paid as dozens of species** (first build): organic tap-spam on mobile produced an explosion
  whose worm pattern (fill 0.36 < `DISH_FILL_EXPLODE` 0.4) was split into ~40 "stable" fragments → 41–46 bestiary
  entries "Espécimen N" in 1 min, +160–300 Essence/s, 44 Samples, achievements species20/eps100/crowd10, and the seed
  cost shown as "341Qa" (3^n saturation). Evidence `qa-m-06-explosion.png`, `qa-m2-blob-late.png`.
  On the final build (`ec8da02` `DISH_OVERGROWN_FILL = 0.25`, capped saturation) the same scenario gives 0 species,
  0 Essence/s, seed cost 2 and a "¡La placa se desbordó! — Limpiar placa" card that clears the dish
  (`qa-n-explosion.png`, `qa-n-explosion-cleaned.png`). Kept as regression test `explosion` (slow).

## What worked (no defect found)

- Seeding: tap spam (25–30 taps) never produced negative Essence, NaN or console errors; long press (big seed),
  brush stroke (12 seeds), eraser (tap + drag, wraps at the toroidal border), emergency pipette (fills in ~9 s,
  banked free seed), one-touch double-tap big seed, letterbox taps ignored consistently.
- Upgrades: ×1 / ×10 / ×máx charge exactly the shown cost and levels, cap at max ("MÁX"), unaffordable buys do
  nothing; selector state shared between Laboratorio and Bestiario. (Under heavy load the card label lags the
  selector by up to ~300 ms — one UI tick.)
- Calibrate: sliders and numeric fields clamp `abc`, `-1`, `1e9`, `NaN`, `Infinity`, `0,2`, empty — no NaN ever
  reached the simulation; R changes 10↔27 with rapid drags recompile without errors.
- Regimes: save with custom name (HTML stripped), cap 8/8 hides "Guardar", load applies, two-step delete (arm expires
  after 2.5 s).
- Pause (button and Space) stops simulation and production; speed ×1/×2/×4 cycles; extinction hold 1.5 s, cancel by
  release or sliding off, extinction while paused works (new Era starts paused), taps during the ritual are ignored,
  no double extinction.
- Offline maths (once booted): 2 h at 10 Essence/s → +36 000 (= 10 × 0.5 × 7200); clock backwards → 0; tab hidden
  2 h → offline card, no simulation while hidden, no double grant on quick hide/show.
- Keyboard: 1–4 tabs, Space, M, E, J. Language es↔en: all panels, journal, achievements, statistics translated.
  Theme auto/dark/light applied and persisted. Reduce motion / one-touch / volumes 0–1 / mute: no exceptions.
- Resize/rotation 390×844 ↔ 844×390, 320×568, 600×1024, 1024×600: camera follows, no horizontal scroll.
  Pinch zoom (clamped 1–3), two-finger pan, and seeding while zoomed lands exactly under the finger.
- Reset: two-step "¿Seguro?" confirm, settings kept, fresh state.
- XSS: `<img src=x onerror>` / `"><script>` names imported or typed never executed (bestiary grid, card, regimes).
- No `NaN`, `Infinity`, `undefined`, `null` or `[object Object]` found in `document.body.innerText` or aria labels on
  any screen visited.
- Leaderboard: the HUD trophy is hidden in this build (no client configured), so its escaping could not be exercised
  end to end; `src/ui/leaderboard.ts` builds names with text nodes.

## Regression suite status

See the run log at the end of this file.

### Last run (final build `530014e` + working tree, SwiftShader under load average ≈ 25)

Full run (`--skip-slow`) plus re-runs of the tests whose harness was fixed, and the slow `explosion` test:

| Test | Result | Failing checks (all are real defects above) |
|---|---|---|
| `offlineBoot` | FAIL | boots after 2 h away; no page error; boots after 61 s away (finding 1) |
| `corruptPrefs` | FAIL | `bioluma.tutorial=null`, `{"done":true}`, `bioluma.ui.v1={"intros":5}` (finding 4) |
| `storage` | FAIL | no warning when storage is blocked / getter throws (finding 3); quota-full case passes |
| `noWebgl` | PASS | |
| `rename` | FAIL | pencil does not open the field (desktop + mobile, finding 2); 28 vs 24 chars and broken emoji (finding 5) |
| `importExport` | FAIL | empty import gives no feedback (finding 7); 10 garbage/edited/versioned/huge inputs rejected with a toast; round trip OK |
| `language` | FAIL | settings title stays "Ajustes" (finding 6) |
| `keyboard` | PASS | |
| `upgrades` | PASS | ×1/×10/×máx charge = shown cost, cap at max |
| `extinction` | PASS | |
| `regimes` | PASS | |
| `tapSpam` | PASS | |
| `explosion` (slow) | PASS | species 0, seed cost 2, 0 Essence/s with fill 0.37 (was 41 species / 3e17 in the first build) |

Runtime under this load: ≈ 25 min for the fast tests, + ≈ 7 min for `explosion`. On a normal CI runner expect a few
minutes. Every failure saves `fail-<test>.png` when `--shots` is given.
