# Revisión de arquitectura y errores (2026-10-04)

Revisión senior de los módulos terminados: `src/core`, `src/sim`, `src/detect`, `src/game`, `src/main.ts` y
`scripts/`. Quedaron fuera de alcance, porque siguen en desarrollo, `src/ui`, `src/audio`, `src/net`, `api/` y
`server/`. De esas carpetas solo se anotan los puntos de integración que afectan a lo revisado.

Primero se buscaron errores reales. Cada corrección lleva un test que falla sin el arreglo y pasa con él. Después
vino la limpieza de arquitectura, con refactors pequeños y seguros. En `src/main.ts` y `src/ui` no se tocó
código; lo que hay que cambiar ahí está en la sección «Pendiente para el integrador», con el parche propuesto.

Verificación final: `npx tsc --noEmit` sin errores; `npx vitest run src/core src/sim src/detect src/game tests/unit`
con 136 tests verdes; `node tests/e2e/sim-check.mjs --quick` con todos los checks de GPU en verde, incluido uno
nuevo; bot de balance antes y después en el escenario de 120 min × 3 corridas.

## 1. Arquitectura

```
                         ┌───────────────────────── src/core (contratos) ─────────────────────────┐
                         │ types.ts (interfaces) · bus.ts (eventos) · camera.ts (grilla⇄pantalla)   │
                         │ palette.ts (colores, LUT)                                               │
                         └─────────────────────────────────────────────────────────────────────────┘
                                   ▲ todos los módulos importan solo tipos/utilidades de core
  ┌──────────── src/main.ts (bucle) ─────────────────────────────────────────────────────────────┐
  │ rAF → acumulador de pasos (30 pasos/s × velocidad) → sim.advance(k)                           │
  │      cada 10 pasos: sim.snapshot() ──FieldSnapshot──▶ detector.update() ──DetectorReport──┐   │
  │      game.tick(dt, report) ◀───────────────────────────────────────────────────────────────┘   │
  │      sim.render(camera) · ui.frame() · ui.update(game.view()) cada 100 ms · autosave 30 s     │
  └───────────────────────────────────────────────────────────────────────────────────────────────┘
        │                         │                               │                      │
  src/sim (GPU/CPU)        src/detect (CPU puro)            src/game (sin DOM/GL)     src/ui · src/audio
  webgl.ts  Simulation     detector.ts  etiquetado          game.ts   estado+acciones  leen GameView,
  shaders.ts GLSL          toroidal, tracking, estados,     economy.ts producción      llaman GameActions,
  cpu.ts referencia FFT    comportamientos                  defs.ts   mejoras/genoma   escuchan el bus
  seed.ts espejo CPU       signature.ts firmas (sin μ/σ)    state.ts  validación
  snapshot.ts definición   catalogRefs.ts firmas catálogo   save.ts   localStorage
  kernel.ts pesos          harness.ts tests/calibración     balance.ts todos los números
        ▲                                                         │
        └─────── bus: dishSeed / dishClear / speciesNew / calibrationChanged ◀──────────────────┘
```

**Lo que está bien y conviene mantener**

- Fronteras claras. `game` no conoce el DOM ni GL: habla con el mundo por `GameView`/`GameActions` y el bus.
  `detect` es CPU puro sobre `FieldSnapshot`. `sim` tiene una referencia CPU (`cpu.ts`, `seed.ts`,
  `snapshot.ts`) que define la semántica, y los shaders la replican; los tests e2e comparan las dos.
- El juego deriva nacimientos, estabilidad, especies y comportamientos de la **lista de criaturas** del reporte, no
  de los eventos. Es robusto ante reportes perdidos: un evento perdido cuesta un sonido o una estadística, nunca
  dinero ni especies.
- Todos los números del balance están en `balance.ts` con su origen. La validación del guardado es estricta, con
  checksum y respaldo.
- La convención de coordenadas es coherente en todo el sistema (celda *i* = `[i, i+1)`, centro `i + 0.5`): pase
  de semillas y su espejo CPU, bloques del snapshot, centroides del detector (`(b + 0.5)·scale`), cámara y shader
  de render. Ahora la fijan tests: `src/core/camera.test.ts` y `tests/unit/coordinates.test.ts`. El segundo
  comprueba que una semilla colocada en (x, y) se detecta en (x, y), también cuando cruza la costura del toro, y que
  la cámara la dibuja sobre la celda correcta.

**Deuda de arquitectura**

- `src/game/game.ts` ocupa unas 1 600 líneas en un único closure (`createGame`). Funciona y está cubierto por tests,
  pero mezcla estado, bestiario, golden, objetivos, vistas y acciones. Ver el plan de división en §4.
- `src/detect/detector.ts` ocupa unas 1 300 líneas, pero está bien seccionado: etiquetado, tracking, estados,
  movimiento, firma. Puede quedarse así.
- Hay lógica duplicada:
  - Los tamaños de grilla están en `main.ts` (`GRIDS`) y también en `sim/perf.ts` (`QUALITY_GRID`).
  - Hay cuatro funciones de distancia toroidal: `core/camera.wrapDelta`, `game/economy.wrapDist`, la de
    `sim/seed.ts` (que debe imitar la de GLSL y está bien que exista) y la de `scripts/balance-bot.ts`.
  - El juego cargaba por su cuenta `catalogSignatures.json` en vez de usar `detect/catalogRefs`; corregido.
- Código muerto o sin usar: `perf.QUALITY_SUBSTEPS`, `perf.benchmarkSimulation` y `recommendQuality` (main elige
  la calidad con una heurística propia); `Track.childIds` en el detector, que se escribía y nunca se leía
  (eliminado); una condición `… || true` en el bot (eliminada).
- `scripts/` queda fuera de `tsconfig.json` y no se verifica tipos. `seed-montecarlo.ts` y `seed-explore.ts` usan
  `process` sin declararlo.
- La firma tiene 15 componentes y umbral 1.0, normalizado por escalas por componente. ADR-007 todavía dice
  «7 números» y «umbral 0.15»: conviene un ADR que lo actualice.

## 2. Hallazgos

Severidad: **Alta**: pérdida de datos o de criaturas, o un exploit de economía. **Media**: comportamiento
incorrecto visible o un problema de rendimiento notable. **Baja**: robustez, limpieza o documentación.

### 2.1 Corregidos (con test)

| # | Sev. | Archivo:línea | Problema y escenario | Arreglo / test |
|---|---|---|---|---|
| F1 | Alta | `src/detect/detector.ts:450-523` (`label`) | Al descartar una mota (componente con poca masa), sus celdas volvían a `-1`. Cada una de sus otras celdas «cuerpo» relanzaba la misma BFS: costo O(cuerpo × tamaño). Además, el búfer de celdas (tamaño N) podía desbordarse y una criatura real, que venía después en orden de barrido, quedaba con masa NaN y **desaparecía** (evento `died` falso, deja de pagar). Pasa con restos tenues tras explosiones o con R grande. | Las motas se marcan con `-2` durante el etiquetado y se pasan a `-1` al final. El resultado es idéntico en el caso normal. Test: «many faint specks before a creature…». |
| F2 | Media | `src/detect/detector.ts:316-320` | Si el bucle reenvía el mismo snapshot (contexto GL perdido: `advance` no hace nada y `snapshot()` devuelve el último), el detector re-mide el mismo instante en cada fotograma y llena las historias de copias. El análisis de pulsación (DFT con muestreo uniforme) se distorsiona y **reclasifica** criaturas (pulsante → quieta) al volver. | `update` es idempotente para un `step` ya visto: devuelve las mismas criaturas y ningún evento. Test: «re-feeding the same step…». |
| F3 | Media | `src/sim/webgl.ts:192-206` | Al restaurar el contexto, `initGL` corre la prueba de ida y vuelta (`seed`/`clear`) mientras `lost` sigue en `true`, así que esas llamadas no hacen nada. Si no había respaldo ni snapshot, **el patrón de prueba (una rampa) quedaba en la placa**: masa 2047 en 64×64. | `lost = false` antes de `initGL`, y se repone si falla. Nuevo check e2e: «context loss before any backup: dish comes back empty». |
| F4 | Alta (exploit) | `src/game/game.ts:965-970` | La Extinción no limpiaba el historial de producción para offline. Extinguir y cerrar la app pagaba horas de offline al 50 % de la producción de la **era anterior** en una placa vacía, y ese ingreso sumaba a `E_era`, lo que acelera la siguiente Extinción. | `extinguish()` vacía `epsHistory`, `bucketSum` y `bucketTime`. Test en `extinction.test.ts`. |
| F5 | Alta | `src/game/state.ts:234-249, 283-288, 404-460` | `JSON.stringify` escribe NaN e Infinity como `null`, y la validación estricta rechaza el guardado entero. Un solo número no finito (una estadística, un temporizador) volvía **ilegible la partida**: se cargaba el respaldo viejo o una partida nueva. | El serializador escribe el valor finito más cercano (NaN → 0, ±∞ → ±MAX_VALUE), y el checksum se calcula sobre esa salida. Estadísticas, temporizadores e historial se validan con tolerancia (si son inválidos, valen 0). Test: «a non-finite number in memory…». |
| F6 | Media | `src/game/state.ts:268-270, 404` | La validación rechazaba bestiarios de más de 2 000 especies, pero el juego no tiene tope: superarlo **borraba la partida** al recargar. | Cota de cordura en 20 000. Test: «accepts large bestiaries». |
| F7 | Alta | `src/game/save.ts:88-102, 211-219` | Con el almacenamiento lleno (cuota), la escritura de la partida fallaba en silencio mientras el respaldo y las dos copias del plato seguían ocupando sitio. Además, `savedAt` avanzaba aunque la partida no se hubiera guardado, y la sesión siguiente perdía el progreso y el tiempo offline. | `setGame()` libera primero `dish.bak`, luego `dish` y por último `game.bak`, y reintenta. `savedAt` solo se escribe si la partida se guardó. Tests: «on a full storage the game state wins…» y «does not move the offline clock…». |
| F8 | Media | `src/game/save.ts:180-186` | Si nada era legible (guardado corrupto, o escrito por una versión más nueva, como al volver a un build viejo o al single-file), el juego empezaba de cero y al segundo autosave **destruía** la única copia. | Se aparta en `bioluma.game.unreadable` (recuperable a mano); `clearSave` también la borra. Test: «keeps an unreadable save aside…». |
| F9 | Baja | `src/game/game.ts:1321-1323` | Con un banco infinito, «comprar ×max» calculaba costo `Infinity ≤ Infinity` y dejaba la esencia en NaN. | Se rechaza un costo no finito. Test en `view.test.ts`. |
| F10 | Baja | `src/sim/webgl.ts:871-880` | Si un shader de fragmento no compilaba (formatos de respaldo en `tryFormat`), el de vértices quedaba sin liberar. | Se libera con `try/catch`. |
| F11 | Baja (limpieza) | `src/game/game.ts:34, 149` | El juego importaba `catalogSignatures.json` directamente, duplicando lo que expone `detect/catalogRefs`. | Usa `CATALOG_REFS`; la interfaz `CatalogSignature` se mantiene para tests y bot. |
| F12 | Baja (limpieza) | `src/game/game.ts` (`view`) | `view()` recalculaba la disponibilidad de la Extinción con su propia fórmula y calculaba la ganancia tres veces. | Usa `extinctionAvailable()` y una sola `currentGenomeGain()`. |
| F13 | Baja (limpieza) | `src/detect/detector.ts`, `src/detect/signature.ts:17` | `Track.childIds` estaba muerto y crecía sin límite en divisoras longevas. El comentario de `SIG.DENSITY` decía «mass/area», pero el código calcula Σv²/Σv. | Campo eliminado; comentario corregido. |
| F14 | — (pedido del integrador) | `src/game/game.ts:1119-1120` | `CreatureView.vx/vy` (celdas por paso) para extrapolar en el overlay. | Se copian de `Creature.vx/vy`; los no finitos pasan a 0. Test en `view.test.ts`. |
| F15 | Baja | `scripts/balance-bot.ts:32` | El modelo del bot asumía 60 pasos/s; `main.ts` ahora usa 30. | `STEPS_PER_SEC = 30`, con referencia a main. Antes/después en §3. |

### 2.2 Pendiente para el integrador (`src/main.ts`, `src/ui`; sin editar)

| # | Sev. | Archivo:línea | Problema y escenario | Parche propuesto |
|---|---|---|---|---|
| P1 | Media | `src/main.ts:221-229` | Si en un fotograma caen dos múltiplos de 10 pasos, el segundo `detector.update` **pisa** al primero en `pending` y se pierden sus eventos (`died`, `exploded`, `divided`): sonidos, estadísticas, bitácora. Ocurre a ×4 con fps bajos (hasta 16 pasos por fotograma). | Acumular eventos: `const r = detector.update(…); if (pending) r.events.unshift(...pending.events); pending = r;`. Otra opción: llamar a `game.tick(0, r)` por cada reporte. |
| P2 | Media (rendimiento) | `src/main.ts:225` | `sim.snapshot()` usa `readPixels` síncrono y frena la tubería de la GPU de 3 a 12 veces por segundo (30 pasos/s × hasta ×4). | Usar `sim.snapshotAsync()` (ya existe y está probado en e2e): una petición en vuelo; al resolverse, `detector.update`. Los pasos son monótonos; no mezclar con `snapshot()` síncrono, porque un paso menor reinicia el detector. |
| P3 | Media | `src/main.ts:161, 279` | Se concede offline pero no se guarda enseguida. Si el SO mata la pestaña antes del próximo autosave (móvil, sin `pagehide`), la sesión siguiente vuelve a pagar el mismo intervalo desde el `savedAt` viejo. | Llamar a `save()` justo después de `grantOffline(...)`, en el arranque y en `visibilitychange`. |
| P4 | Media | `src/main.ts:194-213`, `src/ui/panel-calibrate.ts:117-122, 169-178` | El slider de R aplica `setCalibration` en cada fotograma mientras se arrastra, y cada R entero recompila el shader del paso (0.1-0.7 s; caché LRU de 6). Arrastrar de 10 a 27 congela varios segundos. | En la UI, aplicar `R` (y anillos) solo en `change`/`pointerup`, o con debounce de unos 250 ms. En main, opcional: `(sim as WebGLSimulation).prewarmKernel(R ± 1)` en reposo. |
| P5 | Media (rendimiento) | `src/main.ts:69-72`, `src/ui/ui.ts:1351` | `onDishResize` recibe el `devicePixelRatio` sin tope (3 en muchos teléfonos), mientras que el arranque lo limita a 2. El pase de pantalla se ejecuta por píxel de dispositivo: 2.25× más costo. | `const d = Math.min(dpr, quality === 'low' ? 1.5 : 2)` antes de `resizeCanvas`. |
| P6 | Baja | `src/main.ts:175-182` | Se ignora el `false` de `writeSave` (cuota llena o almacenamiento bloqueado): el jugador no se entera de que no se guarda. | `if (!writeSave(...)) bus.emit('toast', { text: {es:'No se pudo guardar…', en:'Could not save…'}, kind: 'warn' })`, con un cooldown. |
| P7 | Baja | `src/main.ts:109-114` | «Borrar partida» no llama a `clearSave()`: el respaldo conserva la partida anterior y, si la nueva se corrompe, «resucita». | `clearSave(); game.reset(); …; save();`. |
| P8 | Baja | `src/main.ts:87-108` | Doble `sim.clear()` y `detector.reset()`: `extinguish()`, `importString()` y `reset()` ya emiten `dishClear`. | Quitar las llamadas redundantes; dejar solo `save()`. |
| P9 | Baja | `src/main.ts:215` | Con el contexto perdido el bucle sigue alimentando al detector. F2 lo vuelve inocuo, pero gasta CPU. | `if (!paused && !document.hidden && !(s as WebGLSimulation).contextLost)`. |
| P10 | Baja | `src/main.ts:239-245` | `game.view()` se construye dos veces en el mismo segundo (UI y audio). | Guardar la última vista de la UI y reutilizarla para el audio. |
| P11 | Baja | `src/main.ts:16-20` | `GRIDS` duplica `QUALITY_GRID` de `sim/perf.ts`. | Importar `QUALITY_GRID`. |
| P12 | Baja | `src/ui/overlay.ts:226-241` (`creatureAt`, `goldenScreen`) | El hit-test usa solo la copia principal del toro. Tocar la mitad envuelta de una criatura o del Destello junto a la costura falla, aunque se dibuje. | Probar las copias ±W/±H, igual que `copies()`. |
| P13 | Diseño | `src/game/game.ts` (`metric('eps')`, `epsPeak`) | Los objetivos de eps y los logros `eps10/100/1000` usan la producción **con** Floración (×7): un Destello completa `eps50` o adelanta un +5 % permanente. El offline, en cambio, excluye los buffs a propósito. | Decisión del dueño: usar `baseEps` para métricas y logros. Si se cambia, correr el bot antes y después. |
| P14 | Diseño | `src/main.ts:272-280` | Con la partida en pausa y la pestaña oculta igualmente se concede offline. | Aceptable; documentarlo o no conceder si `paused`. |

**Impacto de 30 pasos/s en `src/game`.** El tiempo de juego está en segundos reales y el del detector en pasos, así
que nada se rompe. Cambia el ritmo:

- «born» dura unas 400 pasadas, que ahora son ~13 s (antes ~7 s), y la clasificación de comportamiento llega a
  ~33 s. ADR-009 todavía dice «3 a 7 s a 60 fps» y conviene actualizarlo.
- Los recién nacidos cuentan más tiempo en el costo de siembra (`SEED_NURSERY_FREE`).
- `SEED_PENDING_WINDOW` (1 s) sigue siendo mayor que la cadencia del detector (10 pasos ≈ 0.33 s): correcto.
- `MUTATION_LINK_TIME` (90 s) sigue siendo mayor que el paso a estable (13 s): correcto.

El bot (§3) confirma que los objetivos se cumplen.

## 3. Bot de balance (antes / después de `STEPS_PER_SEC` 60 → 30)

`npx vite-node scripts/balance-bot.ts 120 3`, mediana de 3 corridas:

| política | 1.ª estable | Sembrador | Ext. disponible | muro máx. | eras (corrida 1) |
|---|---|---|---|---|---|
| greedy antes / después | 0:07 / 0:14 | 6:30 / 6:16 | 80m / 81m | 46 s / 87 s | 76m / 88m |
| explorer antes / después | 0:07 / 0:14 | 7:49 / 6:53 | 38m / 53m | 8 s / 16 s | 47m 15m 16m 20m 10m / 46m 33m 17m 12m |
| idle antes / después | 0:07 / 0:14 | 5:01 / 5:01 | — / — | 3 s / 5 s | — / 110m |

Todo sigue dentro de los objetivos: 1.ª estable < 3 min, Sembrador entre 5 y 8 min, Extinción greedy entre 45 y
90 min y compra dentro de 2 min. Con el nuevo ritmo, el explorer queda más cerca del rango previsto (antes 38 min).

## 4. Próximos refactors recomendados (por orden)

1. **Dividir `game.ts` sin cambiar comportamiento**, un PR por paso, con los tests actuales como red. Se crea un
   `GameCtx` interno (`s`, `bus`, `rng`, `grid`, mapas transitorios, `level`, `has`) y se mueven en este orden:
   - `progress.ts`: `metric`, objetivos, logros, desbloqueos, pestañas.
   - `golden.ts`: Destello y recompensas.
   - `bestiary.ts`: `onStable`, `registerSpecies`, `blendSignature`, revelado de catálogo.
   - `views.ts`: los constructores de `GameView`.
   - `actions.ts`.
   `createGame` queda como ensamblador de unas 200 líneas. La API pública (`Game`, `GameActions`) no cambia.
2. **Migraciones de guardado.** Hoy `v !== SAVE_VERSION` devuelve `null`. Añadir una tabla `migrations[v](data)`
   antes de subir la versión, para que una v2 lea saves v1. Con F8, un save futuro ya no se destruye.
3. **Tamaño del guardado.** Cada especie ocupa unos 4.2 K caracteres (retrato de hasta 64×64 en base64), y se
   guarda dos veces (principal y respaldo). La cuota de ~5 M caracteres se alcanza hacia las 500 especies, antes
   si el plato ocupa mucho. Opciones: retratos de 32×32, retratos solo en la copia principal, o IndexedDB para los
   retratos.
4. **Rendimiento por fotograma.**
   - `Camera.gridToScreen` crea un objeto por llamada. Se puede añadir un parámetro `out?` opcional (no rompe el
     contrato) para el overlay.
   - `snapshot()` y `trackBlobs` reservan arrays en cada actualización del detector: unos 3-12 por segundo, así que
     es aceptable, pero reutilizables.
   - `view()` cada 100 ms reconstruye la vista entera. Se podría separar en vista «rápida» (HUD) y «lenta»
     (pestañas).
5. **Unificar utilidades toroidales** (`wrapDelta`/`wrapDist`) en `core/camera.ts`, salvo la de `seed.ts`, que
   imita GLSL. Hacer lo mismo con las grillas de calidad (P11).
6. **Verificar tipos en `scripts/`** con un `tsconfig.scripts.json` (`include: ["scripts"]` y `declare const
   process` o `@types/node` vía ADR).
7. **ADR de actualización** para la firma de 15 componentes y umbral 1.0 (ADR-007), y para el ritmo de 30 pasos/s
   (ADR-009).
8. `WebGLSimulation.dispose()` podría llamar a `WEBGL_lose_context.loseContext()` en simulaciones desechables, como
   la de `benchmarkSimulation`, para no acumular contextos (el navegador limita a ~16). No se hace en la principal
   porque `main` podría reusar el canvas.
