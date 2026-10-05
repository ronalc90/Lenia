# Revisión final independiente — Bioluma v0.016

Revisor: agente revisor independiente (no escribió nada de este código; regla 9 de `CLAUDE.md`). Fecha: 2026-10-05.
Base revisada: `HEAD` = `2b5eeb4` («Versión 0.016»), la misma que sirve `https://bioluma-xi.vercel.app/version.json`
(`0.016`, `2b5eeb4`). No se tocó código ni git; el único archivo nuevo es este informe.

Documentos leídos: `CLAUDE.md`, `DECISIONS.md`, `docs/CICLO.md`, `docs/RITMO.md`, `docs/ESPECIES.md`, `docs/DISH.md`,
`docs/CLARIDAD.md`, `docs/ARTE.md`, `docs/qa/QA4-juego-final.md`.

## 1. Puertas y pruebas ejecutadas

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 100 archivos, 1061 pruebas |
| `npm run build` | ✅ JS 402 KB + 25 KB + 4 KB gzip, CSS 36 KB gzip → **≈ 468 KB** (objetivo 600 KB, límite 2 MB) |
| `SINGLE=1 npx vite build` | ✅ `dist-single/index.html` 1,39 MB (468 KB gzip) |
| `npm run e2e` (smoke) | ✅ `SMOKE: OK` |
| `tests/e2e/layers.mjs` | ✅ `LAYERS: OK` (móvil y escritorio) |
| `tests/e2e/moments-shots.mjs` | ✅ 72 capturas, sin errores |
| `tests/e2e/ui-shots.mjs` | ❌ roto: espera `.bl-tabs .tab`, que ya no existe (RF-09) |
| `tests/e2e/integration2-shots.mjs` | ❌ `INTEGRATION2: FAIL` (tiempo agotado y 25 «problemas» falsos: script de antes del ciclo de sesiones, RF-09) |
| `src/game/clarity.test.ts`, `src/moments/plainWords.test.ts`, guardas de `src/story` | ✅ 72 pruebas |
| Orbium 2000 pasos (CPU) · sopa uniforme sin Esencia · detector 64²/128² | ✅ dentro de `npm test` |
| Suelo de 30 fps en Playwright móvil | ⚠️ **no verificable aquí**: SwiftShader da 6,5 fps (móvil) y 1,3 fps (escritorio) en el smoke. Hay que medirlo en un móvil real o con GPU |
| `Math.random` en sim/game/detect/tests | ✅ ninguno (solo efectos de UI y `ui/mock.ts`) |
| `readPixels` por fotograma | ✅ ninguno (lecturas asíncronas cada 10 pasos; la síncrona solo en `pagehide`/exportar y en `finish()` de benchmarks) |
| Secretos o claves en el repo | ✅ ninguno (`git grep` de claves, `.env`, PEM, tokens); `ci.yml` con `permissions: contents: read` |
| Textos `{ es, en }` | ✅ no se encontró texto de jugador en un solo idioma fuera de `dev.ts`/`mock.ts` |

## 2. Hallazgos

Severidad: **P0** arreglar antes de publicar · **P1** debería arreglarse · **P2** conveniente.
Cada hallazgo se verificó (prueba, script o lectura de las dos puntas del flujo) antes de escribirlo.

### RF-01 · P0 · Seguridad/anti-trampas, corrección — el ranking rechaza a todo jugador desde la Noche 2

- **Dónde:** `server/validate.ts:192-193` (`era_requirement`, `genome_min`), `:199`, `:206-207`; `src/net/integrity.ts:78-91`
  (`runStatsOf`) y `:203` (importación).
- **Qué falla:** el validador del servidor sigue modelando el ciclo **clásico**: cada era terminada exige
  `lifetimeEssence ≥ 250 000` (`EXTINCTION_MIN_ESSENCE_TERM² × GENOME_ESSENCE_DIV`) y `genome ≥ 5` por era. En el ciclo de
  sesiones `era` es la Noche (`researchNight`), la Noche 2 llega con ~800 de Esencia total y `genome` es siempre 0
  (`s.genome + s.genomeSpent`, nadie los mueve en sesiones). Resultado: **rechazo duro** (`reject`) de cada envío.
- **Escenario medido:** se pasó `runStatsOf(game.state)` del bot de sesiones (`scripts/session-bot.ts 40 1 --policy=planner`)
  por `validateSubmission` al final de cada partida: partidas 1-3 (Noche 1) `accept`; **partidas 4-40 (Noches 2-6)
  `reject` con `era_requirement,genome_min`** (desde la Noche 5 solo `genome_min`), y además `eps_peak` blando al final.
  En producción el trofeo del HUD está activo (`LEADERBOARD_URL = ''` en `*.vercel.app`, `main.ts:65-66`) y el jugador lee
  «El sistema anti-trampas rechazó la puntuación» (`src/net/leaderboard.ts:65`) tras ~4 minutos de juego honrado. Además,
  importar su propia partida en otro aparato marca `tampered/import_implausible` (`integrity.ts:203`), una bandera pegajosa
  que deja su entrada gris para siempre. La prueba `tests/unit/ranking-validate.test.ts` no lo ve porque juega el ciclo
  clásico.
- **Arreglo:** enviar `cycle` en el payload (campo opcional del protocolo) y, para `sessions`, saltar las reglas de
  prestigio clásicas (`era_requirement`, `genome_min`, `genome_max`) y recalcular los techos de Esencia/`eps_peak` con
  `cycleBalance` (o, mínimo, con una cota por Noche medida por el bot). Añadir una prueba que pase el bot de sesiones
  (40 partidas, 3 políticas) por `validateSubmission` y exija `accept`. Hasta entonces, ocultar el trofeo.

### RF-02 · P1 · Guardado — exportar/importar pierde la historia, los Encargos, los secretos y los Momentos

- **Dónde:** `src/game/game.ts:3059` (`exportString` = solo `serializeState(s)`), `src/main.ts:474-482` (`importSave`),
  claves aparte `bioluma.story`, `bioluma.encargos`, `bioluma.secrets`, `bioluma.moments`; `public/privacy.html` §1.
- **Qué falla:** la exportación solo lleva el estado del juego. Los secretos dan **+1 % de Esencia cada uno (hasta +10 %)**
  (`main.ts:315-318`), así que pasar la partida a otro aparato baja la producción; la historia vuelve al tutorial
  («¡Toca la placa!») sobre una partida avanzada, porque la historia del aparato nuevo ya existe cuando se importa
  (`story.ts:700-716` solo salta el tutorial si no hay estado guardado), y la cadena de Encargos empieza de cero.
- **Escenario:** jugador en Noche 4 con 6 secretos → Ajustes → Exportar → otro móvil → Importar: Esencia −6 %, VELA repite
  el tutorial, Encargos y finales perdidos. La página de privacidad dice que el progreso guardado incluye «historia y
  secretos» y que se puede exportar.
- **Arreglo:** exportar un sobre `BIOLUMA1.` versionado con `{ game, story, encargos, secrets, moments }` (aceptando el
  formato viejo al importar) y, al importar, sustituir esas claves y reiniciar sus módulos; prueba de ida y vuelta.

### RF-03 · P1 · Reglas de CLAUDE.md (1 y 6) — el ciclo de sesiones no tiene ADR y la GDD sigue describiendo otro juego

- **Dónde:** `DECISIONS.md` (salta de ADR-025 a ADR-027; ADR-026 solo existe como propuesta en `docs/CICLO.md:755`),
  `docs/GDD.md:167` (bordes toroidales), `:199` (grilla 4:5), `:378` (fila Placa 4:5), `:410` y `:436` (distancias «sobre
  el toro»), §5/§8/§10 (Muestras, Laboratorio, Extinción) sin «(Corrección v1.2/v1.3)»; commit `d9da2ef` en
  `src/core/types.ts` (quitó `muRange`, `sigmaRange`, `RRange`, `dtRange`, `regimes`, `maxRegimes`, `ringsOptions`, `hints`
  de `CalibrationView` y `setCalibration`, `saveRegime`, `loadRegime`, `deleteRegime`, `setRings` de `GameActions`).
- **Qué falla:** la regla 6 dice que la GDD es la especificación y que cada desvío lleva ADR y «(Corrección)»; ADR-025
  promete esas correcciones en §4, §8 y §9 y ADR-026 en §4, §5, §8, §10 y §12, y no están. La regla 1 prohíbe quitar
  campos de los contratos («si necesitas un cambio que rompe, para y pregunta»); el comentario del contrato cita un
  ADR-026 que no existe.
- **Escenario:** un agente nuevo lee la GDD (obligatorio según `CLAUDE.md`) e implementa bordes toroidales o la Extinción.
- **Arreglo:** pasar el ADR-026 de `CICLO.md §16` a `DECISIONS.md` (Accepted, con la ruptura de contrato explícita) y
  marcar en la GDD cada sección superada con «(Corrección v1.2/v1.3)» apuntando a `CICLO.md`, `RITMO.md` y `DISH.md`.

### RF-04 · P2 · Corrección — en calidad «baja» la ruta Placa vende sitio que la placa no tiene

- **Dónde:** `src/game/tree.ts:441` (`capacity = DISH_CAPACITY[dishLevel]`), `src/sim/perf.ts:23` (baja: Ø160 máx.),
  `src/main.ts:134` (`cores <= 4 || mem <= 2` → baja).
- **Qué falla:** la capacidad (3 · 4 · 5 · 7) sigue al nivel comprado, pero el diámetro se recorta a Ø160 en calidad baja.
  Con Placa 2-3 un móvil de 4 núcleos tiene sitio para 5-7 criaturas en una placa medida para 4 (`cycleBalance.ts:161-164`:
  «más nadadoras solo chocan más»), y el dibujo de «antes → después» del Árbol muestra dos placas iguales.
- **Arreglo:** limitar `capacity` al diámetro real (pasar el máximo del aparato a `TreeEffects` o a `room()`), y en la
  ficha decir «tu aparato ya tiene la placa más grande» en vez de cobrar el nivel.

### RF-05 · P2 · Guardado — cambiar «Calidad» no hace nada hasta recargar, y al recargar la partida en espera pierde su placa

- **Dónde:** `src/main.ts:158-163` (calidad solo al arrancar), `:757-759` (la placa guardada solo se importa si la grilla
  coincide), `src/game/game.ts:3140-3144` (una sesión `ready`/`running` cargada no se vuelve a sembrar).
- **Escenario:** Ajustes → Calidad Baja (no pasa nada visible) → recargar: grilla 232 → 168, la placa guardada se descarta
  y la sesión preparada arranca **sin la criatura de la nevera** (ni incubación: `saved.dish` no es nulo).
- **Arreglo:** si las dimensiones no coinciden, tratar la sesión cargada como nueva (`bootReplant`), y decir en Ajustes
  «se aplica al volver a abrir» (o recargar con confirmación).

### RF-06 · P2 · Reglas de CLAUDE.md — objetivos táctiles por debajo de 48 px

- **Dónde:** `src/ui/story/story.css:314-317` (`.sty-task-x`, la ✕ del aviso de VELA, 36 × 36), `src/ui/ui.css:498`
  (`.mode-pill`, la píldora de la semilla y su precio, 40 px de alto; medida 202 × 42 en 390 × 844); en la ficha del Árbol
  `.rt-pricebox` «¿Por qué cuesta esto?» mide 358 × 40.
- **Escenario:** medido con `elementFromPoint` en el build de producción (390 × 844, pantalla de la placa).
- **Arreglo:** 48 px de alto (o un `::before` con `inset: -6px` como zona de toque).

### RF-07 · P2 · Privacidad — un interruptor que no hace nada y una promesa que la interfaz no cumple

- **Dónde:** `src/ui/modals.ts:498` + `src/ui/i18n.ts:182-185` («Estadísticas anónimas: cifras del juego… para
  equilibrarlo»): `settings.analytics` no se lee en ningún sitio; `public/privacy.html` §6 pide «el identificador que
  aparece en Ajustes», que no aparece.
- **Arreglo:** quitar el interruptor hasta que exista la telemetría (y entonces documentarla en la página), y mostrar el
  identificador (o la etiqueta `#tag`) en Ajustes o cambiar el texto de la página.

### RF-08 · P2 · Reloj de la placa — cuenta tiempo mientras el contexto WebGL está perdido

- **Dónde:** `src/main.ts:1215-1221` con `src/sim/webgl.ts:281` (`advance` no hace nada con `lost`).
- **Qué falla:** con el contexto perdido `stepCount` no avanza pero el bucle suma `stepped += k` hasta agotar `n` (fuera
  de una frontera de 10 pasos `detectionDue()` es falso), así que `dishSeconds` hace correr el reloj y la sesión se gasta
  con la placa congelada hasta `webglcontextrestored`.
- **Arreglo:** no entrar al bucle si `s.contextLost` (o sumar `stepped` solo con los pasos que `stepCount` avanzó).

### RF-09 · P2 · Código muerto y restos

- **Ciclo clásico vivo en `game.ts`:** `cycle` sigue siendo `'classic'` por defecto (`game.ts:322`) y el archivo de 3148
  líneas mantiene Laboratorio, Calibrar, Genoma y Extinción. **16 de los 19 archivos de prueba que crean un juego usan el
  ciclo clásico** (`spacing`, `species`, `overgrowth`, `seeding`, `save`, `golden`, `progress`… y
  `tests/unit/ranking-validate.test.ts`): las regresiones de QA4 F-07/F-13 (`spacing.test.ts`) y la del ranking prueban un
  bucle que ningún jugador ve, y por eso RF-01 pasó. `CICLO.md:750` ya lo reconoce como tarea pendiente.
- **Textos clásicos muertos:** `src/ui/i18n.ts:255-258` (`tutCalibrateTitle`, `tutGenomeTitle`, `tutGenome`) no se usan;
  `src/game/content.ts` (`UPGRADE_TEXT` con «Afinidad sésil», μ/σ), `src/moments/catalog.ts:576-608` (Extinción, Genoma) y
  `src/ui/moments/illustrations.ts:1696,1746-1747` solo viven para el ciclo clásico.
- **Scripts e2e:** `tests/e2e/ui-shots.mjs` falla (espera `.bl-tabs .tab`); `tests/e2e/integration2-shots.mjs` (último cambio
  `f3f7952`, antes del ciclo de sesiones) mide `.bl-tabs` y espera el flujo viejo: da `FAIL` con avisos falsos («no Encargo
  offered», «the seed Momento did not open») y nadie lo corre; 12 scripts e2e y `scripts/species-audit.ts`
  tienen como salida por defecto el scratchpad de una sesión de agente (`/tmp/claude-0/-home-user-Lenia/…`); `moments-shots`
  escribe 72 PNG en la raíz de ese scratchpad.
- **Docs viejas:** `README.md:30-32,42,54,63,113-115,125,144` anuncia Calibrador, Extinción, Genoma y Laboratorio;
  `docs/wiki/Desarrollo.md:84` dice «placa toroidal, aspecto 4:5»; `ADR-025` dice que las partidas 4:5 viejas se
  «centran y recortan», pero `main.ts:757` simplemente descarta la placa si la grilla no coincide.
- **Arreglo:** borrar el ciclo clásico pasando antes esas pruebas a `cycle: 'sessions'`; borrar o reescribir
  `ui-shots.mjs`; salida por defecto en `os.tmpdir()`; actualizar README y wiki.

### RF-10 · P2 · Claridad — dos números distintos antes de la primera semilla

- **Dónde:** etiqueta de criatura de la nevera («Viva +2,0/s», `src/ui/overlay.ts`) y tarjeta «¡VIDA!» («+1,0 Esencia/s»,
  `src/moments/catalog.ts`) frente al HUD «+0/s» (QA4 F-20) mientras el reloj espera.
- **Escenario:** build de producción, 390 × 844: tras «Saltar intro» sale «¡VIDA!» con «+1,0 Esencia/s», luego la placa
  enseña «Viva +2,0/s» y el HUD «+0/s» a la vez (capturas `mobile-03`, `mobile-04` del revisor). Para un niño, tres
  cifras para lo mismo.
- **Arreglo:** con la sesión en `ready`, la etiqueta dice «Viva» sin «/s» (o «+2/s al sembrar») y la tarjeta usa el mismo
  número que la etiqueta.

### RF-11 · P2 · Rendimiento y mantenimiento menores

- `src/main.ts:79` duplica `STEPS_PER_SEC = 30` en vez de importar `SIM_STEPS_PER_SEC` de `cycleBalance.ts:87`, del que
  depende `dishSeconds`: si uno cambia, el reloj se desincroniza en silencio.
- Asignaciones por fotograma en el bucle principal: `pushTints` crea hasta 32 objetos por fotograma (`main.ts:1105`);
  `Overlay.runLayers` copia el array de capas y crea un objeto `frame` con cierre por fotograma y capa
  (`overlay.ts:337-349`). Son pequeñas, pero la guía pide cero en caminos calientes: reutilizar un pool.
- `public/sw.js`: `CACHE_VERSION` fijo y los archivos con hash nunca se borran, así que la caché crece ~1,3 MB por versión
  publicada. Borrar del caché las entradas con hash que el `index.html` nuevo ya no referencia.

## 3. Lo que se revisó y está bien

- **Webhook de la tienda** (`api/store-webhook.ts`, `server/store/*`): HMAC sobre el cuerpo crudo antes de parsear,
  comparación en tiempo constante, 503 sin secreto, límite de tamaño, modo prueba ignorado en producción, compras
  idempotentes, el artículo sale de la variante firmada. Tienda apagada (`STORE_ENABLED = false`).
- **API del ranking** (`server/service.ts`): mismo origen, límites por IP, prueba de trabajo, firma ECDSA, anti-repetición,
  límite de cuerpo, sin CORS. El fallo está en las reglas de validación (RF-01), no en el protocolo.
- **Guardado** (`save.ts`, `session.ts:658-727`): copia de seguridad, partidas ilegibles apartadas, validación indulgente
  con límites, migración v1 → v2 con pruebas.
- **Bucle y placa**: la puerta «nunca a ciegas» (`detectGate.ts`), extrapolación del deflector, vigilancia de fugas y
  lisis, reloj por pasos de placa (F-02), incubación previa de 1250 pasos (F-04, la primera especie entró en la partida 1
  en el pase del revisor: «Sesión 1 · 0:18» con +3 s por especie nueva).
- **Claridad**: más allá de las pruebas, una búsqueda de μ, σ, régimen, Genoma, Muestra, Extinción, Calibr, pasos, Ø,
  sésil, afinidad, simulación, celdas… en los textos del ciclo de sesiones solo encontró textos del ciclo clásico (RF-09).
- **reduceMotion**: la mano del Árbol, la celebración de la Noche y el anillo de «Limpiar placa» lo respetan.

## 4. Pase de juego (build de producción, `vite preview`, Chromium SwiftShader)

Las puertas e2e de la casa (`smoke`, `layers`) cubren móvil 390 × 844 y escritorio 1366 × 768 y pasan. Además, el revisor
jugó el **build de producción** (`vite build` sin `VITE_E2E`, sin manija de depuración) en 390 × 844 táctil, es, con
tiempo real (desde F-02 el reloj sigue a la placa, así que SwiftShader ya no deja las partidas sin vida):

- Título → intro (11 tarjetas) → «Saltar intro» → tarjeta «¡VIDA!» de la criatura de la nevera → VELA «Toca la placa.»
  La partida 1 marca **0:18** (0:15 + 3 s por especie nueva registrada bajo la intro): **F-04 confirmado**.
- 4 toques en la placa: siembra, «Naciendo 15 %», HUD «+2,4/s», Abono «en 0:07». La partida termina sola.
- Resumen «Fin de la sesión 1»: 24 Esencia ÷ 25 = 0, +10 especie nueva, +3 manera de moverse, +4 primeras metas,
  **17 Datos**; «Nadadora celeste · ¡Nueva! · guardada en el Bestiario». Botones «Nueva sesión» / «Ir al Árbol» libres
  (sin VELA encima: F-01 confirmado).
- Árbol: «Más tiempo» comprado (17 → 15 Datos), la ficha se actualiza («Nivel 1 de 6», «Tienes 15 · Cuesta 3»), el Árbol
  sigue abierto.
- Sin errores de consola ni de página en el pase. Objetivos táctiles pequeños: RF-06. Cifras «+0/s» / «+2,0/s» /
  «+1,0 Esencia/s» a la vez: RF-10.
- Límite honesto: SwiftShader da 1–7 fps y el sandbox no pudo completar varias partidas seguidas ni el pase de escritorio
  con el build de producción en tiempo razonable; el escritorio se juzga por `layers.mjs` y el smoke. El suelo de 30 fps
  hay que medirlo en un móvil real.

## 5. Veredicto

**No está lista para publicar (con el ranking activo).** El juego en sí está sano: las cuatro puertas pasan, los
hallazgos de QA4 que se pudieron comprobar están cerrados (F-01, F-04, F-06, F-10, F-11 por `layers.mjs` y el pase del
revisor), no hay secretos, ni `Math.random` en la simulación, ni lecturas por fotograma, y el paquete pesa ~468 KB gzip.
Lo que bloquea es el ranking: en producción rechaza como trampa a todo jugador honrado desde la Noche 2.

Para pasar a **lista**:

| Id | Sev. | Qué cerrar | Resolución (v0.017) |
|---|---|---|---|
| RF-01 | P0 | Validación del ranking para el ciclo de sesiones (o esconder el trofeo hasta tenerla) + prueba con el bot de sesiones | ✅ Cerrado: reglas del ciclo de sesiones en `server/validate.ts`; prueba con el bot real (§6) |
| RF-02 | P1 | Exportar/importar con historia, Encargos, secretos y Momentos (o corregir la página de privacidad y avisar) | ✅ Cerrado: sobre `BIOLUMA2.` con todo el progreso, ida y vuelta probada (§6) |
| RF-03 | P1 | ADR-026 en `DECISIONS.md` (con la ruptura de contrato de `d9da2ef`) y «(Corrección)» en la GDD | ✅ Cerrado: ADR-026 y ADR-028 aceptados; 27 marcas en la GDD (§6) |

Los P2 (RF-04 … RF-11) pueden ir en la versión siguiente; RF-09 (pasar las pruebas al ciclo de sesiones) es el que más
reduce el riesgo de que vuelva a pasar algo como RF-01. *(Resolución: los P2 también se cerraron en la v0.017, §6.)*

## 6. Resolución (v0.017)

Arreglos del agente de cierre sobre `08518e3`. Regla 9 de `CLAUDE.md`: cada fallo tiene primero su prueba, que se vio
fallar contra el código de la v0.016 (las pruebas unitarias nuevas contra el código viejo; `tests/e2e/release-checks.mjs`
contra un build de la v0.016 sacado con `git archive`: falló en RF-02, RF-05, RF-06, RF-07 y RF-10) y pasa ahora.

| Id | Sev. | Resolución | Prueba |
|---|---|---|---|
| RF-01 | P0 | El envío lleva su ciclo (`cycle: 'sessions'`, `sessions`, `datos`: campos opcionales del protocolo, `runStatsOf`). `server/validate.ts` juzga esas partidas con la economía de sesiones: la noche contra las sesiones que piden sus puertas (`NIGHT_GATES`, `NIGHT_MAX`), sesiones contra tiempo de juego, Datos contra lo que paga la Esencia, Esencia/s contra el mejor Árbol que esos Datos compran (Vida eterna limitada por los Datos), Esencia contra ese techo × tiempo y contra su propio pico; nada de Genoma ni eras de 250 000. Los envíos sin `cycle` (clientes clásicos) siguen con las reglas clásicas; una partida de sesiones no puede volver a ellas. La importación de la propia partida ya no marca `tampered` (`integrity.ts` usa las mismas reglas y entiende el sobre nuevo). `api/submit.ts` y `api/leaderboard.ts` solo delegan en `server/service.ts`, que ya pasa los campos; el tablero «era» dice «Noches». El motor del bot se separó en `scripts/sessionBotCore.ts` (salida del bot idéntica byte a byte). | `tests/unit/ranking-sessions.test.ts` (20: 6 partidas reales del bot de las 3 políticas × 40 sesiones, cada fin de sesión como primer envío y contra el último aceptado, **todas `accept`**; importar en otro aparato desde la Noche 2 sin `tampered`; 8 trampas rechazadas o marcadas). `ranking-api.test.ts` (servicio: Noche 3 aceptada dos veces). `ranking-protocol.test.ts` (campos nuevos). Barrido aparte: 36 partidas × 50 sesiones = 1 692 envíos, 0 rechazos, 0 marcas; el pico más alto usa el 4 % del techo «sospechoso». |
| RF-02 | P1 | Exportar crea un sobre versionado `BIOLUMA2.` (`src/app/saveBundle.ts`) con el juego (su `BIOLUMA1.` con checksum), la historia, los Encargos, los secretos, los Momentos vistos y, tal cual, el diario de secretos, la bitácora extra, el aspecto del personaje y la intro vista. Importar acepta también `BIOLUMA1.` (y entonces salta el tutorial si la partida ya se jugó), carga cada módulo, descarta la placa vieja y recarga la página. No viajan el identificador del ranking ni su llave, ni las compras firmadas. La página de privacidad dice exactamente qué se guarda y qué lleva la exportación. | `src/app/saveBundle.test.ts` (ida y vuelta con juego, historia, Encargos y Momentos reales; formato viejo; basura rechazada). `release-checks.mjs`: exportar en un aparato e importar en otro restaura historia, Momentos y Encargos tras recargar. |
| RF-03 | P1 | ADR-026 (sesiones, Árbol, Mundos, noches) pasó de `CICLO.md §16` a `DECISIONS.md` como **Accepted**; ADR-028 registra la ruptura de contrato de `d9da2ef` (campos de `CalibrationView` y acciones de `GameActions`) como cambio deliberado aprobado por el integrador, y el estado del ciclo clásico. ADR-025 corrige la frase de «centrar y recortar» las partidas 4:5. La GDD lleva 27 marcas «(Corrección v1.2/v1.3)» (toro, 4:5, Calibrar, Muestras, Genoma, Extinción, loop continuo, offline, glosario, UI, guardado, rendimiento, analítica, bot, Destello) con una tabla al principio. | Revisión de documentos. |
| RF-04 | P2 | `tree.ts setDishLevelLimit` (lo fija `Game.setDeviceDish(maxDiameter)` al arrancar): el sitio sigue a la placa que el aparato enseña; un nivel de Placa que el aparato no puede enseñar cuesta 0 Datos (la ruta sigue abierta hasta Ecosistema) y su ficha dice «Tu aparato ya tiene la placa más grande». | `tree.test.ts` (2), `sessions.test.ts` (1). |
| RF-05 | P2 | La placa guardada solo se restaura en su misma grilla; si no (cambio de Calidad, importación, sin placa), `Game.dishLost()` vuelve a plantar la criatura inicial y la Nevera de la sesión en espera (o de la que corre, con su reloj) y la incubación se repite. Ajustes dice «Se aplica al volver a abrir el juego» bajo Calidad y lo avisa al cambiarla. | `sessions.test.ts` (3). `release-checks.mjs`: cambiar Calidad y reabrir (grilla 168 → 232) deja viva la criatura inicial (en la v0.016: 0 criaturas). |
| RF-06 | P2 | 48 × 48 px como mínimo en todo lo que se toca: ✕ de VELA, píldora de la semilla, «¿Por qué cuesta esto?», «Saltar tutorial», segmentados, interruptores (zona de toque invisible), deslizadores, botones de Ajustes y de guardado, chips del Bestiario, «No volver a explicar», botones de Momentos, del Árbol y de la tienda. | `release-checks.mjs`: auditoría con `elementFromPoint` a ±23 px del centro de cada control visible en la placa (con la tarea de VELA), Ajustes, ficha del Árbol, ficha de criatura, resumen, tarjeta de inicio y Bestiario: 0 fallos (en la v0.016, 28). |
| RF-07 | P2 | Se quitó el interruptor «Estadísticas anónimas» (no existe telemetría; el campo `Settings.analytics` sigue en el contrato, sin leer, ADR-028). Ajustes → Privacidad enseña el identificador de jugador que pide la página de privacidad, que ahora dice que el juego no envía estadísticas. | `release-checks.mjs` (sin interruptor, identificador visible). |
| RF-08 | P2 | El bucle avanza la placa con `stepDish` (`src/sim/detectGate.ts`), que devuelve los pasos que la placa **de verdad** dio: con el contexto WebGL perdido son 0 y el reloj de la sesión (tiempo de placa) no se mueve. | `src/sim/detectGate.test.ts` (4). |
| RF-09 | P2 | `createGame` arranca en el ciclo de sesiones; las pruebas del ciclo clásico lo piden explícitamente con una cabecera que lo dice (ADR-028), y las regresiones que ve el jugador pasaron a sesiones (`spacing.test.ts` QA4 F-07/F-13, `dish.test.ts`, ranking). Borrados `ui-shots.mjs` e `integration2-shots.mjs` (rotos, del flujo viejo) y 29 textos muertos de `i18n.ts`. Ningún script lleva ya la ruta del scratchpad de un agente: salida en `os.tmpdir()` o en su variable de entorno. README y wiki (Desarrollo/Development) describen el juego actual; las imágenes rotas del README se cambiaron por capturas que existen. El código clásico de `game.ts` sigue (su borrado completo, con sus pruebas y textos, queda definido en ADR-028). | Suite completa con el nuevo valor por defecto: 104 archivos, 1 108 pruebas. |
| RF-10 | P2 | Una sola cifra antes de la primera semilla (`earningNow`): la etiqueta de la criatura dice «Viva» sin «/s», la tarjeta «¡VIDA!» no inventa «+1,0» ni dibuja «+1/s» (su chip y su dibujo usan la cifra de la etiqueta, y ninguna mientras el reloj espera; `liveRateBadge`), la ficha de la criatura dice +0 y la ficha de especie dice «al sembrar». | `status.test.ts` (incluye el dibujo, que el pase de `session-play` encontró con «+1/s»), `species-card.test.ts`, `catalog.test.ts`; `release-checks.mjs`. |
| RF-11 | P2 | `STEPS_PER_SEC` de `main.ts` y la edad de `ui.ts` usan `SIM_STEPS_PER_SEC` de `cycleBalance.ts`. `pushTints` reutiliza 32 objetos y `Overlay.runLayers` un solo `frame` sin copiar la lista. `sw.js` lleva el nombre de caché sellado con la versión en el build (`src/app/swVersion.ts`, `vite.config.ts`): cada versión instala su trabajador y al activarse borra las cachés viejas, así que guarda una sola versión. | `src/app/swVersion.test.ts` (3); `dist/sw.js` sale con `bioluma-0.016-<sha>`. |

**Puertas (todas en este contenedor):** `npm run typecheck` ✅ · `npm test` ✅ 104 archivos, 1 108 pruebas · `npm run build`
✅ (JS 404 + 26 + 4 KB gzip, CSS 37 KB) · `SINGLE=1 npx vite build` ✅ (471 KB gzip) · `npm run e2e` ✅ `SMOKE: OK` ·
`npm run e2e:layers` ✅ `LAYERS: OK` (el caso escritorio falló una vez con la máquina cargada, igual que el build de la v0.016;
repetido, OK) · `npm run e2e:release` ✅ `RELEASE-CHECKS: OK` · `layout-shift.mjs` ✅ estable (CLS 0,001 móvil, 0,000
escritorio) · `session-play.mjs` ✅ `SESSION PLAY: OK` en los 4 casos (móvil y escritorio, es/en, oscuro/claro; 169 capturas revisadas: la tarjeta «¡VIDA!» sin cifra antes de sembrar, la ficha de Placa con «Tu aparato ya tiene la placa más grande» a 0 Datos). Una primera pasada encontró el «+1/s» dibujado (corregido) y esperaba que todo nivel de Placa costara Datos (ahora acepta el nivel gratis de RF-04) · bot de sesiones: salida
**idéntica** antes y después, regla DURA OK (0 bajones). Sigue sin poder medirse aquí el suelo de 30 fps (SwiftShader:
6,2 fps móvil, 1,3 escritorio, como en la revisión).

