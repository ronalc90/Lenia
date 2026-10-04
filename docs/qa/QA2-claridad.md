# QA #2 — Claridad y primer contacto ("¿lo entiende una niña de 5 años, y es divertido?")

**Rol:** QA #2 (jugador novato / claridad). **Build principal:** `main` @ d19aace + árbol de trabajo de las 05:22 UTC (`VITE_E2E=1`); **re-verificado** contra `530014e` (06:19) y contra el árbol de las 06:30 con la UI nueva de otro agente (§8). **Fecha:** 2026-10-04. **Dispositivo simulado:** 390×844 táctil, tema claro y oscuro, es-CO y en-US.
**Alcance:** primeros 15 minutos como Lucía (5), Jorge (68, solo español) y Sam (14, inglés) + un salto declarado a Calibrar/Extinción (§7.2). No se editó nada de `src/`; scripts en `tests/e2e/qa/qa2-*.mjs`; capturas en `/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad/qa-qa2-*.png`.

## 1. Veredicto en 10 líneas

* El **título es excelente** y el **momento "¡Vida!"** (foco redondo + "Especie nueva" + `+1,1/s`) es un verdadero "guau". Los toques en la placa devuelven algo (ripple + chispas), incluso cuando el juego los rechaza por precio, **salvo cuando el cartel del tutorial los intercepta** (H-03).
* El **primer minuto no cumple "nadie necesita leer nada"** (GDD §6): el paso 1 es un cartel de texto sin mano; el cartel **tapa el centro de la placa y se come el primer toque** (H-03); la primera criatura casi siempre se apaga y se explica con "Paciencia de laboratorio" (H-04).
* **El tutorial secuestra la pantalla:** 8 de 9 pasos oscurecen y bloquean *todo* salvo un hueco; **no se puede abrir Ajustes, bajar el sonido ni cambiar de idioma** hasta saltar el tutorial (H-01). Jorge no puede silenciar; Sam no puede poner inglés.
* **Un niño que toca rápido choca con un muro rojo**: el precio de la semilla pasa de 2,5 a 12 y a 40 con 2 de esencia (H-05); en 4 corridas con "toque de niño" (≈ 50 s de juego) hubo **16-55 `seedDenied`** de ~75 toques.
* **A los ~37-51 s de juego "explota" la placa** en 3 de 5 corridas de persona (las que toquetean) y 3 de 4 "niño": laberinto azul que "paga" decenas de especies, precios `8,04e21` y ≈ 36 toasts "¡Especie nueva!" (H-06).
* **Letra pequeña:** 60-67 % del texto visible mide ≤ 13 px, la instrucción principal es de 13 px y los botones de Siguiente/Saltar/HUD miden 40 px (H-07). `user-scalable=no` impide el zoom.
* **Traducción: impecable.** 0 claves `ui.xxx`, 0 restos en español en 339 cadenas inglesas; solo el título de Ajustes y los toasts ya en cola no se retraducen (H-02).
* **Jerga** que un niño no entiende: `μ`, `σ`, "Régimen", "Esencia", "Genoma", "Espécimen", "Extinguir", "pasos", `Qa/Qi/e21` (§5).

### KPIs medidos (sin atajos; *(juego)* = pasos/30)

| Métrica | Medido | GDD / objetivo |
|---|---|---|
| Título → primer toque | 6-9 s (Jorge lee 6 s; Sam intenta Ajustes y vuelve) | — |
| Primer toque → criatura **nacida** (brillo visible) | **0,3 s** (1.ª siembra gratis) | "una sola instrucción" ✅ |
| Primer toque → primera criatura **estable** (empieza `+/s`) | **15-24 s de juego**, mediana ≈ 19 s (n = 6 corridas de persona: 14,9 · 17 · 18,8 · 18,9 · ≈19 · 23,7) con **3-7 siembras**; en las 3 corridas con log completo **la 1.ª siembra se apagó a los ≈ 2 s** (pasos 58, 51, 64 tras sembrar) | "antes del minuto 3 / 5.ª-6.ª siembra" ✅ (muy por delante) |
| 1.ª compra **sin guía** (Gotero I, 15 💧) | posible desde el 1.º toque (20 💧 de inicio + 4 💧 de objetivo); Jorge **2 s**, Sam **8 s**, Lucía ≈ 15 s tras la 1.ª siembra (pasos/30) | GDD: 3:00 ✅ |
| 1.ª compra **guiada** por el tutorial | el paso "El Laboratorio" aparece **21 s tras la 1.ª siembra** (corrida `poke`, pasos/30), después de "¡Vida!" y "Tu Esencia"; la cadena completa seed → bestiario dura ≈ 30 s de juego | — |
| Primer "wow" | 1.ª estable: **15-24 s tras el primer toque** (en pared: 35-65 s tras el título) | — |
| Segundo "wow" | "Comportamiento nuevo: Nadadora" a los ≈ 51 s de juego (Sam) | — |
| Explosión de placa llena | 3 de 5 corridas de persona (Sam 51 s y 14 siembras · Lucía ≈ 37 s y ≈ 45 s; Jorge y la corrida `poke`, más pausadas, no) · 3 de 4 corridas "niño" con tutorial saltado (tras 14, 17 y 24 siembras) · 0 de 2 ritmo medio/cuidadoso | GDD §6: a 0:40, "producción sigue en 0" ❌ |
| Toques "niño" rechazados (≈ 50 s de juego, 1 toque cada 0,6 s) | 16, 55, 33, 21 `seedDenied` de 74-75 toques (4 corridas) | — |

> Nota de método: *(juego)* = pasos de simulación ÷ 30. El sandbox simula a ≈ 6-20 pasos/s (carga 20-35) y `playTime` (que gobierna ingresos y temporizadores de economía) ≈ 0,54-0,6× del reloj de pared, así que los tiempos de pared son 2-3× más largos que en un móvil; los de juego son los comparables. La cobertura en *juego* fue: Lucía ≈ 4-6 min, Jorge 6,6 min, Sam 3,9 min (+ el salto declarado de §7.2).

## 1b. Cómo se probó (y límites)

* Build `VITE_E2E=1` servido con `vite preview`; Chromium headless (SwiftShader), viewport **390×844 táctil** (`hasTouch`, `isMobile`), DSF 1,
  toques reales con `page.touchscreen.tap` (nada de clics sintéticos). Guiones en `tests/e2e/qa/qa2-*.mjs`
  (`qa2-lib.mjs` = arnés: capturas, textos visibles + tamaño de fuente, objetivos táctiles, contraste WCAG, log de eventos del bus).
* **No se usó el atajo del debug handle para avanzar** en las corridas de personas (ni `importString` ni `game.tick`): solo se *lee* `bioluma.game.view()` para
  anotar estado y `bioluma.camera` para convertir coordenadas de criaturas en toques. **Única excepción, declarada:** `qa2-late.mjs` (§7.2) escribe `game.state.essence/eraEssence` para llegar a Calibrar y a la Extinción.
* **El reloj de pared de este sandbox NO es el de un móvil.** La máquina estaba con carga ~20-25 y SwiftShader da ~6-20 pasos/s
  de simulación (el juego va a 30 pasos/s nominales) y el `dt` del juego se recorta a 0,25 s/frame. Por eso en cada tabla doy:
  `t_pared` (segundos reales desde el primer pixel) y, cuando es un evento de simulación, **`t_juego = pasos/30`** (lo que tardaría a velocidad nominal).
  `stats.playTime` también va a ~50 % del reloj de pared. Las conclusiones de *claridad* no dependen de esto; las de *ritmo* sí, y están marcadas.
* Personas: **Lucía (5)** = taps rápidos y aleatorios, ignora el texto, pulsa el botón azul grande; **Jorge (68)** = tema claro del
  sistema, espera 6 s antes de cada paso, nunca toca al azar; **Sam (14)** = teléfono en español, tiene que encontrar Ajustes → Idioma, juega eficiente.
* Capturas en `/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad/qa-qa2-*.png` (referenciadas abajo como `qa-qa2-…png`).

## 2. Lucía, 5 años — diario minuto a minuto

Corridas: `lucia` (1 toque/s, tiempos de abajo), `luciaB` (ráfaga de 16 toques en 6 s), `poke` (pulsa todos los botones), `late`. Columnas: **pared** = s desde que cargó la página (inflados 2-3× por el sandbox); **juego** = pasos de simulación ÷ 30 (comparable con un móvil).
😀 deleite · 😐 neutro · 😕 confusión · 😠 frustración.

| Pared | Juego | Qué pasa (lo que ve y oye una niña que toca todo) | | Captura | Qué lo mejoraría (texto / elemento / archivo) |
|---|---|---|---|---|---|
| 3 s | 0,7 s | **Título**: Orbium brillante que respira, "BIOLUMA" con halo, pastilla pulsante "Toca para empezar". | 😀 | `qa-qa2-lucia-01-splash.png` | Perfecto. Añadir un dedo animado dentro de la pastilla y un altavoz 🔊 (hoy no se puede silenciar antes de entrar). `src/ui/splash.ts` |
| 8 s | 2,2 s | Tras el toque, el título se desvanece; la placa vacía aparece. El cartel "**Siembra vida**" sale **0,3 s arriba a la izquierda** (esquina) y luego salta al centro. Sin mano, sin flecha: solo texto. | 😕 | `qa-qa2-luciaB-03-after-splash-0.3s.png`, `qa-qa2-lucia-03-tap-outside-spotlight.png` | Dedo animado + anillos sobre el centro; texto **"¡Toca aquí!" / "Tap here!"**; corregir el salto (H-08). `tutorial.ts:371-373`, `ui.css:3324` |
| 11 s | 3,5 s | Toca el HUD y el cartel: **nada** (ni ripple, ni vibración, ni sonido). | 😕 | `qa-qa2-lucia-03-tap-outside-spotlight.png` | Pulso del anillo + sacudida del cartel + sonido `deny` al tocar fuera del foco. `ui.css .coach-dim` |
| 13,6 s | **4,6 s** | **Primer toque (debajo del cartel)**: ripple azul + chispas, nace una criatura brillante al instante, +2 💧, la barra se pone verde "¡Objetivo cumplido!". | 😀 | `qa-qa2-lucia-04-first-tap-0.4s.png` | Excelente. Mantener. Si toca *dentro* del cartel no pasa nada (H-03). |
| 13,6-15,6 s | 4,6-6 s | A la vez: toast del diario "Materia inerte. La dejo repos…" (cortado), toast "Objetivo cumplido: +4 Esencia", la hoja del Laboratorio sube y el **dish se encoge un 22 %** (la criatura se desplaza), tarjeta "Gasta Esencia… **Entendido**" y el cartel "Paciencia de laboratorio… **Entendido**" **encima de la placa** con "Saltar tutorial" dentro. Seis cosas a la vez, dos botones iguales. | 😕 | `qa-qa2-lucia-04-first-tap-0.4s.png`, `-05-first-tap-2s.png` | Un solo mensaje: ocultar `intro` y toasts no críticos mientras `tutorial.active`; el cartel "Paciencia" no debe tapar la placa (H-03/H-09). |
| 15,6 s | 6 s | La criatura **se apaga a los ≈ 2 s** (anillo discontinuo "fantasma"); cartel "Casi todo se deshace. ¡Es normal!". En las 3 corridas con log completo la 1.ª siembra murió a los 51-64 pasos. | 😕 | `qa-qa2-lucia-05-first-tap-2s.png`, `qa-qa2-lucia-06-rapid-4-taps.png` | Primera siembra segura (H-04); copy **"¡Casi! A veces se apagan. ¡Toca otra vez!"** |
| 21-26 s | 10-14 s | Toca 4-7 veces más: cada toque da ripple + criatura nueva (**siempre pasa algo**). Los siembras suben el precio de 2,5 a 3,5; la esencia baja 22 → 16 → 14. **Compra el Gotero** pulsando el botón azul que late (esencia 14, queda 2). | 😀 | `qa-qa2-lucia-06-rapid-4-taps.png`, `-08-bought-dropper.png` | Muy bien: el botón azul brillante *se entiende solo*. Añadir sonido y mostrar el efecto. |
| 35 s | **22,6 s** | **Primera criatura estable** (3.ª-7.ª siembra): anillo azul + ráfaga verde "¡Especie nueva! Espécimen 1" (**cortada por el borde derecho**: "¡Especie nuev…"), `+1,3/s`, toast del diario cortado. Aparece la pestaña **Bestiario** y la hoja salta a ella. | 😀 | `qa-qa2-lucia-11-event-creatureStable.png` | Es *el* momento "guau": añadir "+💧" que vuela al contador y un sonido; centrar la ráfaga (H-11). `overlay.ts speciesBurst` |
| 37 s | 21-24 s | El **seedDenied** de la corrida: pastilla roja `3,5`, tintineo rojo; la barra de objetivo está **en blanco** unos instantes entre objetivos. | 😐 | `qa-qa2-lucia-10-event-seedDenied.png`, `-11-event-creatureStable.png` | La barra de objetivo nunca debe quedar vacía (H-24). |
| 41 s | 24,8 s | La hoja muestra **Bestiario** con "Mejoras de Muestras → Microscopio (Nv 0/3, 🧪3)" y "Por descubrir → Catalogación"; **su criatura no se ve** (está debajo). El objetivo dice "Mira tu espécimen en el Bestiario". | 😕 | `qa-qa2-lucia-13-tab-bestiary.png` | Cuadrícula de criaturas **arriba** y mejoras debajo (`panel-bestiary.ts:62-70`) (H-14). |
| 70 s | **41,6 s** | **"Explota"**: la placa se tiñe de marrón-naranja y se llena de un laberinto claro; toast del diario "Lo contrario: lo llenó todo y…" (cortado); objetivo "Compra Gotero I en el Laboratorio". Nadie explica nada. Es bonito, no asusta. | 😐 | `qa-qa2-lucia-14-event-creatureExploded.png` | "¡Uy, se llenó! 🌀" + botón "Limpiar" (H-06). |
| 76-124 s | 44-63 s | Tras la explosión: ráfagas "¡Especie nueva! Espécimen 3, 4, 5 … 36" (un toast cada 2 s), `+6,8/s → +168/s`, pastilla `1,45K → 4,73K`; etiqueta "Comportamiento nuevo: Qui…". | 😐 | `qa-qa2-lucia-15-event-creatureDivided.png`, `-17-event-behaviorNew.png` | Agrupar ("+12 criaturas nuevas"); precio tope. |
| 152 s | 75 s | **Toca una criatura**: tarjeta "Orbium unicaudatus / ESTABLE / Comportamiento ? Clasificando… / Produce +0,95/s / Edad 820 **pasos** / Seguir"; se corta por la derecha ("920 paso", "+1,1/", "Clasificando.") y **un toque a la esquina para cerrarla pulsó la pausa** (la corrida quedó en pausa 60 s). | 😕 | `qa-qa2-poke-09-poke-creature-card.png`, `qa-qa2-lucia-21-periodic.png` (pastilla "En pausa") | Tarjeta = emoji + 1 frase ("Vive · da 💧 1,1 por segundo"), dentro de la pantalla; no dejar un botón de pausa donde caen los toques al cerrar (la tarjeta se cierra con cualquier toque fuera). |
| — | — | **Pausa** (botón redondo 48 px): funciona (medido en `qa2-pause`: la pastilla pasa a "▷ En pausa", los pasos se detienen, otro toque reanuda) pero **está bloqueada durante el tutorial** (paso 1). | 😐 | `qa-qa2-lucia-22-pause-on.png` | H-01. |
| — | — | **Borrador** rojo: la pastilla "Toca para borrar materia" queda **tapada por la tarjeta** abierta; el efecto del borrado es sutil (anillo naranja). | 😕 | `qa-qa2-poke-12-poke-eraser-on.png`, `-13-poke-erased.png` | "Toca para borrar"; cerrar la tarjeta al entrar en modo borrar. |
| — | — | Toca la **barra de objetivo**: nada. Toca el **número de esencia**: abre Bitácora → Estadísticas (Era actual, Genoma…). Toca la **pastilla de semilla**: nada. Toca el **altavoz**: se silencia (icono tachado + chip). | 😐 | `qa-qa2-poke-15-poke-objective.png`, `-16-poke-essence-counter.png`, `-17-poke-seed-pill.png`, `-18-poke-mute.png` | Todo lo tocable responde: objetivo → pulso a su destino; esencia → no abrir estadísticas de mayores. |

**Frustración medida (toque de niño, 0,6 s/toque, ≈ 50 s de juego):** 21, 33, 46, 55 `seedDenied` de 74-87 toques (4 corridas en el build de las 05:22; 46 y ≥ 33 de 82-87 en el `HEAD 530014e`, §8). El precio de la pastilla sube 2,5 → 3,5 → 12 → 40 con 2 💧 en el bolsillo (`qa-qa2-luciaB-06-rapid-8-taps.png`, `-07-rapid-16-taps.png`, `-09-event-seedDenied.png`).
**Botones:** HUD 40×48 (<48), cerrar 36×36, "Siguiente/Entendido" 109-114×40, "Saltar tutorial" 103×40, ×1/×10/×máx 48×40, interruptores 48×28, deslizadores 36 de alto, asa de la hoja 22 de alto. Para un dedo de 5 años el botón primario del tutorial debería medir **≥ 64×64**.
**Nada asusta de forma grave**; las palabras fuertes son "**Explotó**" (insignia de la ficha), "Muerta", el rojo del precio y "puede **matar** la vida actual" (Calibrar). Moverse el primer deslizador de Calibrar **mata a todas las criaturas en ≈ 5 s** (H-22), que sí puede doler a una niña.

## 3. Abuelo Jorge, 68 años, solo español — diario (tema **claro** del sistema, lee despacio, nunca toca al azar)

Corrida `jorge` (`qa2-jorge.mjs`, 752 s de pared = **395 s de juego** = 6,6 min). Espera 6,5 s antes de cada "Siguiente". Columna *Juego* = pasos ÷ 30. Contraste calculado con estilos computados (§7.3).

| Pared | Juego | Qué pasa | | Captura | Qué lo mejoraría |
|---|---|---|---|---|---|
| 12 s | 0,6 s | **Título** (siempre oscuro, aunque el sistema esté en claro): 15 px, "Vida artificial que brilla"; "Toca para empezar" bien visible. | 😀 | `qa-qa2-jorge-01-splash-light.png` | OK. Añadir altavoz 🔊 (H-21). |
| 23 s | 2,9 s | Paso 1 en **tema claro**: fondo gris atenuado, placa oscura, tarjeta blanca "Siembra vida / Toca la placa para sembrar vida." (título 16 px, texto 14 px). Lee 6 s. | 😐 | `qa-qa2-jorge-02-tut-1-seed.png` | "¿Qué es sembrar? ¿Qué es la placa?" → **"¡Toca aquí!"** + mano. |
| 28-34 s | 7 s | Toca el **centro de la placa** (195, 393): **no pasa nada** (cae sobre la tarjeta). Esencia 20, sin criatura, mismo paso. | 😠 | `qa-qa2-jorge-03-after-first-tap.png` | H-03: la tarjeta no debe interceptar toques ni cubrir el centro. |
| 39-58 s | 9-17 s | Sigue esperando; relee el cartel; vuelve a intentar en la zona central. **Ninguna pista nueva.** | 😕 | `qa-qa2-jorge-04-tut-Siembra_vida.png` | Tras 5 s sin toque válido → mano animada sobre la placa. |
| ~60 s | ≈ 19 s | **Primera siembra válida** (log: `seed` en el paso 570). Antes de ella el tutorial pasó a `{"skipped":true}`: el único camino es el enlace **"Saltar tutorial"** (12 px, **dentro** de la placa, a 3 cm de donde se toca). Jorge perdió ≈ 17 s de juego (≈ 35 s de pared) y se quedó **sin el resto del tutorial** (¡Vida!, Tu Esencia, El Laboratorio…). | 😠 | `qa-qa2-jorge-diary.json` (campo `tut`), `qa-qa2-jorge-events.json` | H-03: sacar "Saltar tutorial" de la placa; pedir confirmación ("¿Seguro?"). |
| 74 s | 22 s | Compra el Gotero I solo, con el botón azul (2 s después de su 1.ª siembra). La criatura nacida murió en el paso 634 (2,1 s). | 😀 | `qa-qa2-jorge-06-bought-dropper.png` | — |
| 99 s | **37,9 s** | **1.ª criatura estable** ("Orbium unicaudatus", `+1,1/s`): sin tutorial, solo toast + ráfaga. 3 siembras en total. | 😀 | `qa-qa2-jorge-07-event-creatureStable.png`, `-08-event-speciesNew.png` | Bien. |
| 110-117 s | 43-45 s | El Bestiario se abre solo; abre la ficha: "Multiplicador ×1,10 · Veces vista 1 · **Rango μ 0.150–0.150 · Rango σ 0.0150–0.0150** · Imprimir · 🧪1". | 😕 | `qa-qa2-jorge-09-tab-bestiary.png`, `-10-species-card.png` | H-12: ocultar μ/σ hasta el Microscopio; "Imprimir" → "Plantar otra". |
| 192 s | 90 s | Quiere **bajar el sonido**: ve el altavoz (24 px, gris, 40×48) y el engranaje. Abre Ajustes. | 😐 | `qa-qa2-jorge-11-before-settings.png` | Altavoz con chip/borde siempre visible. |
| 202-211 s | 93-94 s | **Ajustes** (claro): "APARIENCIA / IDIOMA / SONIDO (Efectos 70, Ambiente 50, Silencio) / JUEGO / GRÁFICOS / PRIVACIDAD / PARTIDA / CRÉDITOS". Etiquetas claras, controles grandes, aire. | 😀 | `qa-qa2-jorge-12-settings-top.png`, `-13-settings-scrolled-1.png`, `-14-settings-bottom.png` | Mantener. `Silencio` → `Sin sonido`; añadir **Letra grande**. |
| 220 s | 95 s | Cambia a **Oscuro** y vuelve a **Claro**: instantáneo y coherente. | 😀 | `qa-qa2-jorge-15-settings-dark-theme.png` | — |
| 228 s | 97 s | Altavoz del HUD: icono tachado + chip. Se entiende. | 😀 | `qa-qa2-jorge-16-hud-mute-tapped.png` | — |
| 192-228 s | — | Con `+0/s` y 62 💧 (la criatura se fue): **ninguna pista** de que puede volver a tocar la placa. Contraste de "+0/s": **2,84:1** (claro) / 3,41:1 (oscuro). | 😕 | `qa-qa2-jorge-16-hud-mute-tapped.png` | Mano animada si `eps==0` ≥ 8 s; `--dim` ≥ 4,5:1. |
| 306 s | 146 s | **Bitácora**: entradas a 14 px, `#01…#04` a 11 px (contraste 3,2:1), punto rojo en cada una. Legible. | 😐 | `qa-qa2-jorge-17-journal.png` | Entradas a 16 px. |
| 351 s | 172 s | Toca el **número de esencia**: abre "Estadísticas" (Tiempo de juego, Era actual, Esencia total, Genoma 0…). | 😕 | `qa-qa2-jorge-19-stats-modal.png` | "Era" y "Genoma" sin explicar; no abrir nada al tocar el contador. |
| 405-585 s | 202-302 s | Objetivo fijo **"Compra Calibrador I"** con 1.049-1.385 💧 de sobra (cuesta 250); la tarjeta es la 4.ª y no late. Sin tutorial no hay nada que le diga dónde. | 😕 | `qa-qa2-jorge-21-periodic.png` | Toque en la barra → scroll + pulso a la tarjeta (§5b). |
| 745-752 s | 396-398 s | **Prueba "letra grande"** (`html{font-size:20px}`): la UI crece 25 % **sin romperse**. | 😀 | `qa-qa2-jorge-24-bigtext-main.png`, `-25-bigtext-lab.png`, `-26-bigtext-settings.png` | Ofrecerlo como interruptor "Letra grande" (H-07). |

**¿Palabras simples?** Casi todas sí ("Laboratorio", "Ajustes", "Sonido", "Efectos", "Bitácora", "Logros"). **No:** *placa*, *sembrar*, *Esencia*, *estable*, *espécimen*, *Clasificando…*, *Comportamiento*, *μ / σ*, *pasos*, *Régimen*, *Genoma*, `Qa/Qi/e21`.
**¿Tutorial corto, claro; bloquea o confunde?** Corto (≈ 30 s de juego, 6-9 pasos) pero **bloquea** el HUD (H-01), su primer cartel **se come el primer toque** (H-03) y su enlace de saltar está donde se toca: a Jorge le quitó el tutorial entero sin querer. Se recupera en Ajustes → "Repetir tutorial".
**¿Letra y contraste?** Texto principal AA en ambos temas; **60-67 % del texto ≤ 13 px** y varias etiquetas secundarias entre 2,8 y 4,2:1 (H-07).
**¿Encuentra cómo bajar el sonido?** Sí **si no hay tutorial en pantalla**: altavoz del HUD (1 toque) o Ajustes → SONIDO (sliders 0-100 + "Silencio"). Durante el tutorial **no** (H-01).

## 4. Sam, 14 años, inglés — diario (teléfono en español → cambia a English; luego juega eficiente)

Corrida `sam` (`qa2-sam.mjs`, 742 s de pared = **236 s de juego**). *Juego* = pasos ÷ 30. Compra todo lo asequible que ve y toca todo destello.

| Pared | Juego | Qué pasa | | Captura | Qué lo mejoraría |
|---|---|---|---|---|---|
| 4,5 s | 0,8 s | Título en **español** (el navegador está en es-CO). Sin selector de idioma. | 😐 | `qa-qa2-sam-01-splash.png` | Mini selector **ES · EN** en una esquina del título (además de seguir `navigator.language`). `splash.ts` |
| 10 s | 2,2 s | Paso 1: placa vacía + cartel de texto. | 😐 | `qa-qa2-sam-02-tut-1.png` | H-03. |
| 13-16 s | 3,6-4,5 s | Toca el engranaje **dos veces: no abre** (la capa del tutorial lo bloquea). | 😠 | `qa-qa2-sam-03-gear-blocked.png` | H-01. |
| 18-21 s | 6-7 s | Se rinde, toca la placa (primera criatura), reintenta y **ahora sí** abre Ajustes: IDIOMA es el 2.º bloque, `Español | English` en un toque. | 😀 | `qa-qa2-samA-04-settings-es.png` | Mover Idioma al **primer** bloque. `modals.ts:288-322` |
| 26-31 s | 7,7-8,7 s | English aplicado: el cuerpo cambia al instante, **pero el título sigue "Ajustes"**; en inglés "Quality" queda pisado por el selector. | 😕 | `qa-qa2-samA-05-settings-en.png`, `-06-settings-en-scrolled.png`, `-07-settings-en-bottom.png` | H-02, H-13. |
| 36 s | 9,7 s | El cartel del tutorial ya está en inglés ("Lab patience – Most seeds fade away. That is normal! Keep seeding.") pero **parpadea arriba a la izquierda** al reaparecer. | 😕 | `qa-qa2-samA-08-tut-1-en.png` | H-08. |
| 44 s | 13 s | **Primera compra** sin guía: Dropper I (15 💧). Brillo + "+1" saltando + chispas; tarjeta "Dropper Lv 1/5 · Consistent seed → Long press…"; el siguiente precio es **150**. | 😀 | `qa-qa2-sam-11-bought-dropper.png` | Bien. Añadir sonido y explicar el efecto ("¡Toque largo = siembra grande!"). |
| 65 s | **28,3 s** | **1.ª criatura estable**: foco redondo, "New species! *Orbium unicaudatus*", "Life! This creature lives! It keeps giving you Essence.", `+1.1/s`. **Primer "wow"** (23,7 s tras su primer toque, 4 siembras). | 😀 | `qa-qa2-sam-12-event-creatureStable.png`, `-14-tut-Life_.png` | Perfecto para Sam. Añadir apodo corto y animación del contador. |
| 75 s | 33,7 s | Se abre el **Bestiary**: "Sample upgrades · Microscope Lv 0/3 · No lens → μ and σ range i…" y "Yet to unlock · Cataloguing". | 😕 | `qa-qa2-sam-16-tab-bestiary.png` | "μ and σ" = jerga; "Yet to unlock" → "Coming soon". |
| 78 s | 34,5 s | Ficha de la especie: "μ range 0.150–0.150, σ range 0.0150–0.0150, Multiplier ×1.10, Times seen 2, Print · 🧪1". | 😕 | `qa-qa2-sam-17-species-card.png` | H-12. |
| 84 s | 36 s | Paso "**Your Essence** — Your Essence. Spend it on seeds and upgrades." (título = texto), tapando la barra de objetivo. | 😐 | `qa-qa2-sam-18-tut-Your_Essence.png` | H-16. |
| 110 s | 50,8 s | "**New behaviour: Swimmer**" (etiqueta sobre la criatura + toast + logro). Se *mueve*. | 😀 | `qa-qa2-sam-20-event-behaviorNew.png` | Segundo "wow". Dejar que la cámara siga unos segundos a la nadadora. |
| 124 s | 57 s | **Explosión**: laberinto que llena la placa; toast "The opposite: it filled everyt…". Esencia 124 → 5.739 en 2 min de pared; precio de semilla **`8.04e21`**. | 😀/😕 | `qa-qa2-sam-21-event-creatureExploded.png`, `-27-event-seedDenied.png` | Vistoso, pero el objetivo sigue "Buy Calibrator I" y el precio parece roto. H-06. |
| 133 s | 59,7 s | Tutorial "**The Lab — Buy the Dropper**" **aunque ya compró Dropper I** (pide el II: 150 💧). | 😕 | `qa-qa2-sam-23-tut-The_Lab.png` | H-16. |
| 252-274 s | 97-99 s | Diario, Logros (13/34 "+1 % Essence"), Estadísticas: **inglés limpio**, sin claves ni restos. | 😀 | `qa-qa2-sam-29-journal.png`, `-30-achievements.png`, `-31-statistics.png` | — |
| 403-410 s | 134-136 s | "**A spark!**": el foco del tutorial cae **sobre el altavoz del HUD** y el toque **silencia el juego**. | 😠 | `qa-qa2-sam-35-tut-A_spark_.png`, `-36-golden-spark.png`, `-37-golden-after-tap.png` | H-15. |
| 454 s | 147 s | Aparece **Genome** + botón "**Extinguish +121 Genome**" ("Earn 250 000 Essence this Era (you have 94 443)"). | 😐 | `qa-qa2-sam-38-tab-genome.png` | "Extinguish" es duro para 5 años (§5.3). |

**Traducción:** 339 cadenas únicas en 42 capturas de Sam + 108 en la corrida `lateen` (Calibrate, Genome, Era summary) → **ningún `ui.xxx` ni resto en español** salvo H-02 y los nombres latinos. Cadenas "raras" en inglés: `Yet to unlock`, `Print ·`, `Seeds`/`sow` (jerga agrícola), `Specimen 14` (autonombre), `273Qi`, `2.34e23`, y **`Earn 250 000 Essence`** (separador de miles distinto del resto: H-27).
**Primer minuto para Sam:** título → intento de ajustes bloqueado (13-16 s pared) → 1.ª compra a los 13 s de juego → **1.ª criatura estable a los 28 s de juego (24 s tras su primer toque)** → nadadora a los 51 s → explosión a los 57 s: **lo bastante rápido para engancharlo**. Lo que más le frena: el bloqueo del HUD y que la barra de objetivo diga "Get a stable creature" (jerga).

## 5. Auditoría de textos (primeros 15 min)

Criterio: ¿lo entiende alguien de 5 años (o con 3 palabras de lectura)? ¿Jerga? ¿Longitud? Todas las cadenas salen de
`src/ui/i18n.ts` (UI), `src/game/content.ts` (mejoras, objetivos, diario, logros) y `src/ui/tutorial.ts` (pasos). Verificado en pantalla en ambos idiomas.
Resultado de la revisión estática: **no hay claves sin traducir ni `ui.xxx`** (el tipo `StrKey` + `i18n.test.ts` lo garantizan; solo
`'Español'/'English'` están fijos a propósito). Los fallos de idioma reales son de *refresco*, no de contenido (ver H-02, H-14).

Leyenda: 🔴 ilegible/ aterrador para un niño · 🟠 jerga · 🟡 largo o ambiguo · 🟢 bien.

### 5.1 Pantalla de título y HUD

| Dónde | ES actual | EN actual | Problema | ES propuesto | EN propuesto | Archivo |
|---|---|---|---|---|---|---|
| Título | Vida artificial que brilla / Toca para empezar | Artificial life that glows / Tap to begin | 🟢 | — | — | i18n.ts `splashTagline`, `splashTap` |
| HUD Esencia | `20` + gota + `+0/s` (12 px) | idem | 🟠 "/s" y "Esencia" nunca se explican; la gota sola no dice "moneda" | Mostrar `💧 20` y, bajo ella, `+0 por segundo` la 1.ª vez | `💧 20` · `+0 per second` | ui.ts `essRate` / i18n `perSec` |
| HUD Muestras | probeta verde + `1` (sin etiqueta; solo `title`, que en táctil no existe) | idem | 🔴 aparece sin aviso junto al libro | Al aparecer: toast "¡Nueva moneda! 🧪 Muestras: las das al descubrir criaturas" | "New coin! 🧪 Samples: you get them for new creatures" | ui.ts `curSamples` (title) |
| Objetivo (barra) | `OBJETIVO` (11 px) `Toca la placa para sembrar` (13 px) | `OBJECTIVE` `Tap the dish to sow` | 🟠 "placa", "sembrar", "sow" | `Toca aquí para crear vida` | `Tap to make life` | content.ts `OBJECTIVE_TEXT.seed` |
| Objetivo 2 | `Consigue una criatura estable` | `Get a stable creature` | 🟠 "estable" | `Cría una criatura viva` | `Grow a living creature` | `OBJECTIVE_TEXT.stable` |
| Objetivo 3 | `Mira tu espécimen en el Bestiario` | `Look at your specimen in the Bestiary` | 🟠 "espécimen" | `Mira tu criatura en el Bestiario` | `Look at your creature in the Bestiary` | `OBJECTIVE_TEXT.look` |
| Objetivo 4 | `Compra Gotero I en el Laboratorio` | `Buy Dropper I in the Lab` | 🟠 "I" romano | `Compra el Gotero en el Laboratorio` | `Buy the Dropper in the Lab` | `OBJECTIVE_TEXT.dropper` |
| Objetivo 5-8 | `Ten 2 criaturas estables a la vez` · `Produce 3 Esencia/s` · `Compra Calibrador I` · `Mueve μ en la pestaña Calibrar` | `Have 2 stable creatures at once` · `Produce 3 Essence/s` · `Buy Calibrator I` · `Move μ in the Calibrate tab` | 🟠🟠🔴 "μ" | `Ten 2 criaturas vivas` · `Gana 3 💧 por segundo` · `Compra el Calibrador` · `Mueve el mando "Crecimiento"` | `Have 2 living creatures` · `Earn 3 💧 per second` · `Buy the Calibrator` · `Move the "Growth" knob` | `OBJECTIVE_TEXT.two/eps3/calib/move` |

### 5.2 Tutorial (los 9 pasos)

| Paso | Título ES / EN | Texto ES / EN | Problema | Propuesto ES / EN |
|---|---|---|---|---|
| seed | Siembra vida / Seed life | Toca la placa para sembrar vida. / Tap the dish to seed life. | 🔴 solo texto, sin mano; "placa", "sembrar" | **¡Toca aquí!** / **Tap here!** + dedo animado (ver H-03) |
| wait | Paciencia de laboratorio / Lab patience | Casi todo se deshace. ¡Es normal! Sigue sembrando. / Most seeds fade away. That is normal! Keep seeding. | 🟡 "Paciencia de laboratorio" es un chiste adulto; "se deshace" asusta | **¡Casi!** — *A veces se apagan. ¡Toca otra vez!* / **Almost!** — *Some fade out. Tap again!* |
| stable | ¡Vida! / Life! | ¡Esta criatura vive! Te da Esencia sin parar. / This creature lives! It keeps giving you Essence. | 🟢 título perfecto; texto largo | **¡Vida!** — *¡Está viva y te regala gotas 💧!* / **Life!** — *It's alive and gives you drops 💧!* |
| essence | Tu Esencia / Your Essence | Tu Esencia. Gástala en semillas y mejoras. / Your Essence. Spend it on seeds and upgrades. | 🔴 título y texto repiten "Tu Esencia" (ver captura `qa-qa2-sam-18-tut-Your_Essence.png`) | **Tus gotas 💧** — *Úsalas para tocar más y comprar mejoras.* / **Your drops 💧** — *Spend them to tap more and buy upgrades.* |
| lab | El Laboratorio / The Lab | Compra el Gotero: ¡más vida en cada semilla! / Buy the Dropper: more life in every seed! | 🟡 sale aunque ya compraste el Gotero I (pide el II, 150 💧) | Si `dropper ≥ 1`: **Gotero II** — *¡Más suerte en cada toque!* / **Dropper II** — *More luck on every tap!* |
| bestiary | Especie registrada / Species registered | ¡Especie nueva! Mírala en el Bestiario. / New species! See it in the Bestiary. | 🟠 "especie", "Bestiario" | **¡Criatura nueva!** — *Mírala en tu álbum.* / **New creature!** — *See it in your album.* (y renombrar la pestaña a "Álbum"/"Album") |
| golden | ¡Un destello! / A spark! | ¡Tócalo antes de que se vaya! Trae premios. / Tap it before it fades! It brings prizes. | 🟢 | **¡Tócalo!** — *¡Trae premios!* / **Tap it!** — *It brings prizes!* |
| calibrate | Calibrar / Calibrate | Cambia las reglas de la vida. ¡Aparecen especies nuevas! / Change the rules of life. New species appear! | 🟡 | **Los mandos** — *Gíralos: ¡salen criaturas distintas!* / **The knobs** — *Turn them: different creatures appear!* |
| genome | Extinción / Extinction | Reinicia la placa y gana Genoma para siempre. / Restart the dish and earn Genome forever. | 🔴 "Extinción" es una palabra triste; "Genoma" | **Empezar de nuevo** — *Borra el plato y gana genes para siempre.* / **Fresh start** — *Clear the dish and earn genes forever.* |

### 5.3 Laboratorio, tarjetas y bestiario

| Dónde | ES actual | EN actual | Problema | Propuesto |
|---|---|---|---|---|
| Intro Lab | Gasta Esencia en mejoras que hacen mejores siembras. (53 car.) | Spend Essence on upgrades that make better seeds. | 🟡 | ES `Gasta 💧 para que tus semillas salgan mejor.` · EN `Spend 💧 so your seeds work better.` |
| Botón intro | Entendido / Got it (12 px) | | 🟡 pequeño; compite con el "Entendido" del tutorial | Ocultar la intro mientras haya un paso del tutorial |
| Cantidad | Cantidad ×1 ×10 ×máx | Quantity ×1 ×10 ×max | 🟠 inútil con 1 mejora | Mostrar solo cuando hay ≥ 3 mejoras compradas |
| Mejora 1 | Gotero · Nv 0/5 · "Semilla básica → Semilla consistente" (recortado "Semilla …") | Dropper · Lv 0/5 · "Basic seed → Consistent s…" | 🟡 texto cortado con "…" | `Gotero` + línea única corta: `Semillas más fiables` / `More reliable seeds` |
| Bloqueadas | Por descubrir / Ten 2 criaturas estables a la vez | Yet to unlock / Have 2 stable creatures at once | 🟠 "Yet to unlock" no es inglés natural | ES `Próximamente` + `Ten 2 criaturas vivas` · EN `Coming soon` + `Have 2 living creatures` |
| Calibrador (desc) | Desbloquea y amplía los controles de la regla: μ, σ, dt y R. | Unlocks and widens the rule controls: μ, σ, dt and R. | 🔴 jerga pura | ES `Desbloquea los mandos que cambian las reglas de la vida.` · EN `Unlocks the knobs that change life's rules.` |
| Calibrador (niveles) | μ 0.12–0.18, σ 0.010–0.025 | μ 0.12–0.18, σ 0.010–0.025 | 🔴 números griegos | ES `Mandos pequeños → Mandos medianos` · EN `Small knobs → Medium knobs` |
| Afinidad sésil / Nutriente / Catalogación | "sésil", "complejidad medida", "multiplicador de todas las especies registradas" | idem | 🟠 | `Afinidad quieta` · `Cada criatura da un poco más 💧` · `Tus criaturas dan más 💧` |
| Estado de criatura | Naciendo · Estable · **Explotó** · **Muerta** | Forming · Stable · **Exploded** · **Dead** | 🔴 "Explotó/Muerta" dan miedo (aparecen en la ficha al tocar) | `Creciendo` · `Viva` · `Se desbordó` · `Se apagó` / `Growing` · `Alive` · `Overflowed` · `Faded` |
| Ficha | Comportamiento · Produce · Edad `1.200 pasos` | Behaviour · Yields · Age `1,200 steps` | 🟠 "pasos" de simulación | `Edad 40 s` / `Age 40 s` (pasos ÷ 30) |
| Ficha especie | Multiplicador ×1,30 · Veces vista · **Rango μ 0.150–0.150 · Rango σ 0.0150–0.0150** | Multiplier · Times seen · **μ range · σ range** | 🔴 se muestran aun sin Microscopio y con rango degenerado | Ocultar los dos rangos hasta Microscopio ≥ 1; `Rango μ` → `Le gusta crecer` |
| Ficha: botón | Imprimir · 🧪1 / `Coloca esta especie en la placa con las reglas actuales.` | Print · 🧪1 / `Places this species on the dish under the current rules.` | 🟠 "Imprimir" | `Plantar otra` + `Pon otra igual en el plato.` / `Plant another` + `Put another one just like it in the dish.` |
| Nombre auto | Espécimen 1 | Specimen 1 | 🟠 | `Criatura 1` / `Creature 1` (o apodos: Orbi, Chispa…) |
| Calibrar aviso | Cambiar las reglas puede matar la vida actual. | Changing the rules may kill current life. | 🔴 "matar" | `Ojo: al cambiar las reglas, tus criaturas pueden desaparecer.` / `Careful: changing the rules can make your creatures vanish.` |
| Calibrar intro | Cambia las reglas del universo: cada régimen tiene su fauna. | Bend the rules of the universe: every regime has its own fauna. | 🔴 "régimen", "fauna" | `Gira los mandos: ¡cada receta trae criaturas distintas!` / `Turn the knobs: every recipe brings different creatures!` |
| Regímenes | Regímenes · Régimen {n} · Guardar | Regimes · Regime {n} · Save | 🟠 | `Recetas · Receta {n}` / `Recipes · Recipe {n}` |
| Fuera de régimen | Fuera de su régimen: probablemente no sobreviva. | Outside its regime: it will probably not survive. | 🟠 | `Aquí no está a gusto: quizá no viva.` / `It won't be happy here: it may not survive.` |

### 5.4 Mensajes en pantalla (toasts, burbujas, pastilla de semilla)

| Mensaje | Problema | Propuesto |
|---|---|---|
| Toast del diario: "Materia inerte. La dejo repos…" / "Algo se quedó. Tiene borde, …" / "Lo contrario: lo llenó todo y …" | 🔴 frase poética recortada con "…" a 13 px, dura 3 s: nadie la lee; y llega junto a otros 3 mensajes | Toast corto fijo: `📖 Nueva nota del diario` / `📖 New journal note` (el texto completo queda en la Bitácora) |
| "Objetivo cumplido: +4 Esencia" + barra verde "¡Objetivo cumplido!" | 🟡 se dice dos veces | Una sola: barra verde con `+4 💧` animado volando al contador |
| "Nueva mejora: Microscopio" | 🟢 | — |
| Pastilla de semilla `[icono semilla] 💧2,5` (rojo `💧40` / `3,41Qa` cuando no alcanza) | 🔴 el icono "semilla" (espiral) no se entiende; el precio sube a 12, 40, `8,04e21` | Icono de **dedo** + `💧2,5`; si hay > 2 recién nacidas: `⏳ Espera…` en gris en vez de un precio rojo |
| Toast "¡Especie nueva! Espécimen 29" (×36 en 60 s tras una explosión) | 🔴 spam | Agrupar: `¡+12 criaturas nuevas!` / `+12 new creatures!` |
| Gesto: "Mantén pulsado: siembra grande" / "Arrastra: pincel de materia" (+ "Drag: matter brush") | 🟡 "materia" | `Arrastra: ¡pinta vida!` / `Drag: paint life!` |
| Pipeta de emergencia `42 %` | 🟠 "pipeta de emergencia" | `Gota de ayuda: lista en 5 s` / `Helper drop: ready in 5 s` |
| Cifras `3,41Qa` `1,05Qi` `8,04e21` | 🔴 sufijos Qa/Qi y notación científica en una pastilla de coste | Tope visual `¡Muy caro!` / `Too pricey!` con candado |

### 5.5 Ajustes (Jorge) y modales

Todas las etiquetas de Ajustes son claras ("Tema / Idioma / Sonido: Efectos, Ambiente, Silencio / Juego: Vibración, Reducir movimiento, Modo un toque, Repetir tutorial / Gráficos / Privacidad / Partida / Créditos").
Cambios: `Silencio` (interruptor) → `Sin sonido` / `Sound off`; `Analítica anónima` → `Datos anónimos`; `Partida` → `Tu partida guardada` / `Your saved game`;
`Modo un toque` conserva su hint pero a 11 px es ilegible. **Fallo real:** el título "Ajustes" y el `aria-label` de cerrar no se traducen al cambiar de idioma (H-02).

### 5.6 Cadenas que se cortan con "…" (medido en 390 px)

| Dónde | Se ve | Texto completo | Arreglo |
|---|---|---|---|
| Tarjeta de mejora (Lab) | `Sembrador aut…`, `Semilla básica → Semilla …`, `Semilla consistente → Toq…` | "Sembrador automático", "Semilla básica → Semilla consistente" | Una línea de efecto corta ("Semillas más fiables"); nombre `Auto-siembra` / `Auto-seeder` |
| Tarjeta de mejora (Bestiario) | `Sin lente → Rango de μ y …` | "Sin lente → Rango de μ y σ en las fichas" | `Mira más de cerca` / `Look closer` |
| Toast de diario | `Algo se quedó. Tiene borde, …`, `Materia inerte. La dejo repos…`, `Lo contrario: lo llenó todo y …` | frase de 60-90 car. | toast fijo "📖 Nueva nota" |
| Toast de logro / comportamiento | `Comportamiento nuevo: Nad…`, `Comportamiento nuevo: Qui…` | "Comportamiento nuevo: nadadora / quieta" | `¡Nueva forma de moverse: nadadora!` / quitar el toast (ya hay etiqueta sobre la criatura) |
| Ráfaga sobre la criatura | `¡Especie nuev…` | "¡Especie nueva! Espécimen 1" | recolocar dentro de la placa (H-11) |
| Tarjeta de criatura | `920 paso`, `+1,1/`, `Clasificando.` | "920 pasos", "+1,1/s", "Clasificando…" | tarjeta dentro de la pantalla (H-11) |
| Cierre de ficha | botón "Imprimir · 🧪 1" ✅ | — | — |

## 5b. Iconos, "qué toco ahora" y feedback de éxito

**Iconos (primeros 15 min)** — ✅ se entiende solo · ⚠️ ambiguo · ❌ no se entiende
| Icono | Dónde | Juicio |
|---|---|---|
| Gota azul | HUD (esencia), botones de compra | ✅ (es la moneda; falta que el texto la llame "gotas") |
| Probeta verde + número | HUD (Muestras), mejoras del Bestiario | ❌ aparece sin aviso al registrar la 1.ª especie |
| Libro + punto rojo | HUD (Bitácora) | ✅ libro, ⚠️ el punto rojo parece error |
| Altavoz / altavoz tachado | HUD | ✅ (cambia al silenciar, resalta con chip) |
| Engranaje | HUD | ✅ |
| Pausa → "▷ En pausa" | botón redondo 48 px | ✅ |
| Borrador rojo | botón 48 px | ✅ |
| "Semilla" (espiral con rabillo) | pastilla de coste | ❌ parece un caracol; mejor **dedo** |
| Matraz / círculo-espiral / deslizadores / ADN | pestañas | ✅ matraz, ✅ deslizadores, ✅ ADN, ⚠️ Bestiario (círculo con espiral = "mareo") → usar un **álbum con huella** |
| Escudo, rayo, corazón, objetivo, flecha… | mejoras | ⚠️ decorativos, no explican el efecto |

**Siguiente acción (¿siempre obvio qué tocar?)**
* ✅ Paso 1, "¡Vida!", "El Laboratorio": foco + anillo pulsante + flecha. El **botón de compra del primer upgrade asequible late** (`upgrades.ts` `nextId`) y las barras de relleno de cada botón enseñan "cuánto falta": muy bueno.
* ⚠️ Pasos con texto solo (H-03); el "Siguiente" que se mueve (H-20).
* ❌ **Hilo roto tras el tutorial / la explosión:** la barra dice "Compra Calibrador I" (Jorge, 1.385 💧, 9 min de pared) pero la tarjeta está 4.ª en la lista y no late; nada lleva al jugador. Con la criatura muerta (`+0/s`, `qa-qa2-jorge-16-hud-mute-tapped.png`) no hay ninguna indicación "toca la placa otra vez": el aviso "Toca la placa" solo existe antes del primer toque (`ui.ts:933-948`).
* ❌ Con la pastilla en rojo (H-05) la única pista es el número.
* **Propuesta:** (1) al tocar la barra de objetivo, hacer *scroll* + pulso a su destino; (2) si `eps==0` y no hay criaturas ≥ 8 s, reaparecer la mano animada sobre la placa; (3) cuando el objetivo se cumple, la barra se anima y el siguiente objetivo entra con un destello (hoy cambia de texto en seco).

**Feedback de éxito**
* ✅ Siembra: ripple + chispas + anillo de nacimiento; estable: foco + ráfaga verde + "+n" flotantes; compra: destello en la tarjeta, nivel sube, "+1" salta; logro: toast dorado; pestaña nueva: pop + punto.
* ⚠️ Todo es texto pequeño (13 px) y pasa a la vez (H-09); falta una recompensa **grande y silenciosa**: al estabilizarse la 1.ª criatura, una explosión de 💧 que viaja al contador (+ sonido), y al comprar, que la criatura/la placa *cambie* (p. ej. el Gotero "I" hace la siguiente semilla más brillante).
* ✅ El título es una joya (`qa-qa2-lucia-01-splash.png`): es el único sitio donde el juego ya es "para un niño de 5 años".

## 6. Hallazgos (severidad · repro · esperado/real · evidencia · archivo · arreglo)

> Archivos citados contra `main` @ d19aace + árbol de trabajo del 05:22 UTC; re-verificados contra `530014e` en §8. Capturas = `/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad/qa-qa2-*.png`.

### H-01 · **major** · Durante el tutorial no se puede tocar Ajustes, sonido, idioma ni diario
* **Repro:** tocar "Toca para empezar" → en el paso 1 ("Siembra vida") tocar el engranaje (364, 28) o el altavoz.
* **Esperado:** abre Ajustes / silencia (el audio ya suena desde el toque del título).
* **Real:** nada ocurre y sin ningún feedback: la capa `.coach-dim` (`pointer-events:auto`, recorte solo sobre el objetivo) se come el toque. Pasa en **8 de los 9 pasos** (todos con `dim:true` salvo "wait": seed, stable, essence, lab, bestiary, golden, calibrate, genome). La única salida es el enlace "Saltar tutorial" (12 px). Un jugador que busca bajar el volumen (Jorge) o cambiar a inglés (Sam) queda atrapado ≈ 25–60 s.
* **Evidencia:** `qa-qa2-sam-03-gear-blocked.png` (engranaje tocado dos veces; el modal nunca abre), `qa-qa2-pokeA-11-poke-pause-on.png` (en el paso "El Laboratorio" el pausa/borrador/ajustes quedan inertes).
* **Código:** `src/ui/tutorial.ts:95,117,140,…` (`dim:true`), `src/ui/ui.css:3285-3290` (`.coach-dim`), `.bl-hud` queda debajo (`.coach{z-index:15}`).
* **Arreglo:** dejar siempre fuera del recorte la fila `.hud-actions` (mute + ajustes + diario): `.bl-hud .hud-actions{position:relative;z-index:16}` (quedan brillantes y tocables sobre la capa oscura). Además: tocar fuera del foco = *pulso* del anillo + vibración corta + sonido `deny` (hoy: silencio total).

### H-02 · **minor** · Ajustes no se retraduce al cambiar de idioma (queda "Ajustes" en inglés)
* **Repro:** Ajustes → Idioma → English.
* **Real:** el cuerpo cambia ("Appearance, Language, Audio…") pero el **título "Ajustes"** y el `aria-label` del botón de cerrar siguen en español (el selector `[aria-label="Close"]` no existe). Los toasts ya en cola también salen en el idioma anterior unos segundos ("Se disolvió en segundos…" sobre Ajustes en inglés).
* **Evidencia:** `qa-qa2-samA-05-settings-en.png`, `qa-qa2-samA-07-settings-en-bottom.png`.
* **Código:** `src/ui/modals.ts:56-63` (título/aria fijados en `show()`), `:210` (`openSettings` ignora el título en `relabel`).
* **Arreglo:** `ModalHandle.setTitle(text)` y llamarlo desde `m.relabel`; `modal-close` con `aria-label` leído de `t('close')` al relabel.
* **Resto del inglés:** barrido de 339 cadenas únicas en 42 capturas en inglés → **0 claves tipo `ui.xxx` y 0 restos en español** salvo lo anterior y los nombres latinos de especies. Cambio de idioma a mitad de partida (`qa-qa2-poke-22…25`): nombres, tarjetas, bestiario y objetivo se traducen bien.

### H-03 · **major** · El paso 1 es solo texto (sin mano) y el cartel tapa el centro de la placa: **se come el primer toque** y el enlace de saltar está dentro de la placa
* **Repro (re-verificado en `530014e`, `qa2-verify.mjs`):** tocar "Toca para empezar" → esperar 1,2 s → tocar el centro de la placa (195, 334).
* **Esperado:** sembrar (primer toque libre; GDD §6: "una sola instrucción: Toca la placa").
* **Real:** `stats.seeds` 0 → **0**; sin ripple ni sonido. El cartel (`.coach-bubble`, `pointer-events:auto`, 300×126 px en x 45-345, y 271-397) cubre justo el centro. Un toque **justo debajo** (195, 437) sí siembra (0 → 1). Jorge tocó dos veces en el centro y no pasó nada (primera siembra válida a los ≈ 19 s de juego, `qa-qa2-jorge-events.json`; para entonces el tutorial ya estaba en `skipped:true` y el único camino a ese estado es el enlace "Saltar tutorial", que el guion nunca pulsó a propósito: probablemente lo alcanzó uno de sus toques aleatorios en la zona central).
* "Saltar tutorial" (103×40, 12 px) está **dentro de la placa**, a 2 cm del sitio donde se toca; pulsarlo borra **todo** el tutorial (`{"done":[],"skipped":true}`) sin confirmar.
* No hay dedo animado ni anillos: existe la animación (`.dish-hint .tap-rings`, `ui.css:701-735`) pero `wantsDishTap` la apaga en la primera partida (`ui.ts:938`, `tutorial.ts:290`).
* El paso 2 ("Paciencia de laboratorio", `dim:false`) también se coloca **sobre la placa** (x 45-345, y 254-400): en 20 toques aleatorios sobre la placa visible, **5 cayeron en el cartel y se perdieron** (25 %) y 8 más no sembraron por precio.
* **Evidencia:** `qa-qa2-lucia-03-tap-outside-spotlight.png`, `qa-qa2-jorge-03-after-first-tap.png` (esencia 20, sin criatura tras tocar), `qa-qa2-lucia-05-first-tap-2s.png` (el cartel "Paciencia" sobre la placa, con dos "Entendido").
* **Código:** `src/ui/ui.css:3311-3322` (`.coach-bubble{pointer-events:auto}`), `src/ui/tutorial.ts:456-467` (`y = d.y + d.h - bh - 76` sin foco; `y = hole.y + 70` con foco grande), `ui.ts:933-948`.
* **Arreglo:** (1) `.coach-bubble{pointer-events:none}` y `.coach-bubble button{pointer-events:auto}`; (2) en pasos con foco grande la burbuja va **arriba** de la placa (`y = hole.y + 8`) y en el paso "wait" abajo, fuera de la zona de toque; (3) mostrar el dedo animado + anillos (`dish-hint`) también en el paso 1 y mover "Saltar tutorial" a la barra de objetivo con confirmación; (4) texto del paso: **"¡Toca aquí!" / "Tap here!"**.

### H-04 · **major** · El primer toque "casi siempre" disuelve la criatura y el tutorial lo explica con "Paciencia de laboratorio"
* **Medido (sin atajos):** primera criatura **estable** 12–23 s de juego después del primer toque (mediana ≈ 16 s, n=10, 30 pasos/s nominales; 4 siembras en el perfil medio, 7 en el cuidadoso); en la corrida exploratoria `luciaB` la 1.ª siembra se disolvió en ≈ 2 s (`qa-qa2-luciaB-08-tap1-1.5s.png`: anillo discontinuo = fantasma); en las demás hizo falta repetir 4-9 veces.
* **Para Lucía:** toca → ¡brilla! → se apaga → "Casi todo se deshace" (palabra "deshace"). La primera interacción enseña "tocar falla".
* **Arreglo:** hacer la 1.ª siembra **segura** (`charges.guaranteed = 1` y `charges.free = 3` en `src/game/state.ts:210`; el mecanismo del Mutágeno ya existe) y mantener "Paciencia" solo para fallos posteriores. Primer "¡Vida!" a los ≈ 3 s en vez de ≈ 16 s.

### H-05 · **major** · El precio de la semilla se dispara con los toques rápidos (2,5 → 12 → 40) y la deja en un callejón sin salida
* **Repro:** 6-8 toques en 4 s (tutorial hecho o saltado).
* **Real:** con 5 recién nacidas el precio pasa de 2,5 a **12**, luego **40** (rojo) con **2 de esencia** en el bolsillo; ripple rojo + número rojo flotando + la pastilla tiembla. No hay explicación y `pipetteWanted()` exige `aliveCount()==0`, así que tampoco ayuda: hay que esperar a que alguna recién nacida se estabilice o se apague (en `luciaB`: 17 s de pared ≈ 6 s de juego) sin saber por qué. En `qa2-explosion` (perfil "niño", 53 s de juego): **16 `seedDenied`** de 75 toques.
* **Evidencia:** `qa-qa2-luciaB-06-rapid-8-taps.png` (pastilla 12), `-07-rapid-16-taps.png` (40, esencia 2), `-09-event-seedDenied.png`.
* **Código:** `src/game/game.ts:277-284` (`nSat`, `SEED_SATURATION_GROWTH=3`), `src/game/balance.ts:109-117`, `ui.ts:1261-1267` (denied).
* **Arreglo (UI, sin tocar balance):** si hay > `SEED_NURSERY_FREE` recién nacidas, la pastilla pasa a **gris con ⏳ "Espera…"** (en vez de un precio rojo) y un toque da un *wiggle* suave + toast `⏳ Tus semillas están creciendo` / `⏳ Your seeds are growing`. (Balance: contar las recién nacidas solo lineal, no en el exponente, durante la 1.ª Era.)

### H-06 · **major** (fuera de claridad, pero domina los 2 primeros minutos) · La "explosión" llena la placa de laberinto, paga muchísimo y rompe el hilo
* **Medido:** explosión que llena la placa en **3 de 5 corridas de persona** (Sam a 51 s con 14 siembras; Lucía a ≈ 37 s y ≈ 45 s) y en **3 de 4 corridas "niño"** con tutorial saltado (tras 14, 17 y 24 siembras); **0 de 2** corridas pausadas (Jorge, `poke`). Tras ella: 36-53 "especies nuevas" en < 60 s (`¡Especie nueva! Espécimen 29…`), `+168/s` → `+4.535/s`, precio de semilla `1,05Qi`, `3,41Qa` (se lee `3410a` a 13 px), `8,04e21`, el objetivo se queda en "Compra Gotero I" con 5.776 de esencia, y un toast por especie.
* **Contradice** GDD §9/§3 (0:40: "el detector marca *explotó*, la producción sigue en 0").
* **Evidencia:** `qa-qa2-luciaB-18-event-creatureExploded.png` (tarjeta "EXPLOTÓ"), `qa-qa2-lucia-14-event-creatureExploded.png` (placa marrón-naranja y luego laberinto), `qa-qa2-sam-27-event-seedDenied.png` (`8.04e21`).
* **Arreglo para claridad:** agrupar toasts (`+12 criaturas nuevas`), tope visual del precio ("¡Muy caro!"), y no llamar "Explotó" a la ficha (ver §5.3).

### H-07 · **major** · Letra e iconos pequeños para Jorge (y para un dedo de 5 años)
* **Medido**: **60-67 % de los textos visibles miden ≤ 13 px** (corrida de Sam, 384 cadenas únicas: 11 px: 51 · 12 px: 80 · 13 px: 126 · 14 px: 54 · 15 px: 33; sumando Sam+Jorge+poke+late = 900 pares cadena-tamaño: 34 % ≤ 12 px, 60 % ≤ 13 px, solo 21 % ≥ 16 px y esos son títulos/cifras). El texto de la barra de objetivo (la instrucción principal) es de **13 px** y su etiqueta "OBJETIVO" de **11 px**; las etiquetas de pestañas, **11 px**; "+2,0/s" **12 px**; botón "Saltar tutorial" **12 px**; cuerpo del tutorial **14 px**. CSS: 76 de ~118 declaraciones `font-size` son ≤ 0,8125 rem.
* **Objetivos táctiles < 48 px** (CLAUDE.md exige ≥ 48×48): botones del HUD **40×48** (en CSS 46×48; el flex los estrecha), cerrar modal **36×36** (CSS 48), "Siguiente/Entendido/Saltar" **40 de alto**, chips ×1/×10/×máx 48×40, interruptores 48×28, deslizadores 36 de alto, asa de la hoja 22.
* `index.html` declara `user-scalable=no`: **no se puede hacer pellizco-zoom** del texto de la interfaz (WCAG 1.4.4).
* **Contraste** (cálculo WCAG sobre estilos computados, ver §7.3): tema oscuro y claro cumplen AA en el texto principal; los iconos del HUD en claro (gris medio) y las etiquetas secundarias (`--dim`) quedan cerca del límite.
* **Prueba de "letra grande":** poner `html{font-size:20px}` (toda la UI es `rem`) ensancha todo un 25 % sin romper la maquetación (ver §7.3, `qa-qa2-jorge-*bigtext*`). → es un arreglo barato.
* **Arreglo:** suelo de 14 px para todo texto de lectura, 12 px solo para rótulos en mayúsculas; `.hud-btn{min-width:48px}` y `flex-shrink:0`; botones del tutorial `min-height:52px`; quitar `user-scalable=no`; interruptor "Letra grande: Normal / Grande" en Ajustes (`html{font-size:112.5%}`).

### H-08 · **minor** · El recuadro del tutorial "vuela" desde la esquina superior izquierda en cada paso
* `.coach-bubble` se posiciona con `transform: translate(x,y)` en línea (`tutorial.ts:476`), pero `.coach-bubble.pop{animation: bl-pop-in}` (`ui.css:3324`) anima `transform: scale(.92)→none`, y **una animación pisa el `transform` en línea durante 0,3 s**: el recuadro sale de (0,0), se escala y *salta* a su sitio **durante 0,3 s en cada paso** (medido en `qa2-verify`: `getBoundingClientRect` = (12,5) justo tras mostrarlo y luego (45,271); la duración es la de la animación, independiente de los FPS).
* **Evidencia:** `qa-qa2-luciaB-03-after-splash-0.3s.png` ("Siembra vida" arriba a la izquierda, 0,3 s tras el toque del título), `qa-qa2-sam-12-event-creatureStable.png` ("Life!" en la esquina mientras el foco ya está en la criatura), `qa-qa2-samA-08-tut-1-en.png`.
* **Arreglo:** usar la propiedad `scale` (individual) en un `@keyframes bl-coach-pop{from{scale:.92;opacity:0}to{scale:1;opacity:1}}` solo para `.coach-bubble`, o envolver el recuadro en un `div` que lleve el `translate`.

### H-09 · **major** · Cuatro mensajes a la vez en los primeros 3 s (y dos "Entendido")
* **Real al primer toque:** barra de objetivo en verde + toast "Objetivo cumplido: +4 Esencia" + toast del diario + hoja del Laboratorio con tarjeta "Gasta Esencia… **Entendido**" + paso del tutorial "Paciencia… **Entendido**". Pasa lo mismo al aparecer cada pestaña (tarjeta `intro` + paso).
* **Evidencia:** `qa-qa2-lucia-05-first-tap-2s.png`, `qa-qa2-sam-10-tut-Lab_patience.png`.
* **Arreglo:** `introVisible()` falso mientras `tutorial.active`; el toast "Objetivo cumplido" solo en la barra (animación + `+4 💧` volando al contador); toasts del diario en cola hasta salir del tutorial. `ctx.ts:60`, `ui.ts` (`updateObjective`), `toasts.ts`.

### H-10 · **minor** · Los toasts del diario salen cortados con "…" y duran 3 s
* `.toast .tt{white-space:nowrap;text-overflow:ellipsis}` (`ui.css:665-670`): "Materia inerte. La dejo repos…", "Algo se quedó. Tiene borde, …", "Lo contrario: lo llenó todo y …", "Comportamiento nuevo: Qui…". Nadie los lee (13 px, 3 s) y se tapan entre sí (solo uno visible a la vez, máximo 3 en cola).
* **Arreglo:** toast corto fijo `📖 Nueva nota` y el texto íntegro solo en la Bitácora; el toast de comportamiento ya tiene etiqueta sobre la criatura, quitar el duplicado.

### H-11 · **minor** · Etiquetas y tarjeta se cortan por el borde y la tarjeta tapa el botón de pausa
* "¡Especie nueva! Espécimen 1" aparece como "¡Especie nuev…" (la capa del dish recorta en el borde derecho, `qa-qa2-lucia-11-event-creatureStable.png`); la tarjeta de criatura se corta ("920 paso", "+1,1/", "Clasificando.") (`qa-qa2-poke-12-poke-eraser-on.png`) y a veces **tapa el botón de pausa** (`qa-qa2-poke-11-poke-pause-off.png`), de modo que el toque va a la tarjeta.
* **Arreglo:** `x = clamp(x, w/2+8, W-w/2-8)` en `overlay.ts` (labels) y `positionCard()` en `ui.ts`; reservar la zona de los FAB.

### H-12 · **minor** · La ficha de especie enseña "Rango μ / Rango σ" de entrada y con rango degenerado
* `0.150–0.150` y `0.0150–0.0150` (la primera especie ocupa un solo punto). El Microscopio (que "añade μ y σ a las fichas") aún no está comprado (`content.ts:98,135-139`). `modals.ts:562-565`.
* **Evidencia:** `qa-qa2-sam-17-species-card.png`, `qa-qa2-jorge-10-species-card.png`.
* **Arreglo:** ocultar las dos casillas hasta `microscope ≥ 1`; si se muestran, `Le gusta crecer entre 0,12 y 0,18`.

### H-13 · **polish** · En inglés la fila "Quality" queda pisada por el selector Auto/Low/Medium/High
* `qa-qa2-samA-06-settings-en-scrolled.png` (se lee "Qualit"); en español "Calidad" apenas cabe (`qa-qa2-jorge-13-settings-scrolled-1.png`). **Arreglo:** el selector baja a una 2.ª línea (`.set-row.wrap`).

### H-14 · **minor** · El Bestiario se abre sobre las mejoras de Muestras; la criatura del jugador queda fuera de pantalla
* El objetivo dice "**Mira tu espécimen en el Bestiario**", pero la 1.ª pantalla es "Mejoras de Muestras → Microscopio" y "Por descubrir → Catalogación"; la cuadrícula "Registradas 1 / ?" con su retrato y las siluetas "?" están **debajo** (`qa-qa2-lucia-13-tab-bestiary.png` vs. `qa-qa2-poke-24-lang-switched-bestiary-scrolled.png`, que sí es una gran idea: 5 siluetas "Undiscovered").
* **Arreglo:** invertir el orden en `panel-bestiary.ts:62-70` (cuadrícula arriba, mejoras debajo) o hacer scroll automático a la cuadrícula la primera vez.

### H-15 · **minor** · El foco del tutorial del "Destello" puede apuntar fuera de la placa visible
* En la corrida de Sam (t = 134 s de juego, placa a pantalla completa y con la tarjeta de una criatura abierta) `goldenScreen()` devolvió un punto de pantalla **fuera** de la placa visible (`overlay.ts:243`; no aislé la causa exacta de la cámara): el foco cae sobre el **altavoz** del HUD o sobre el botón "80,0K" de comprar Gotero (`qa-qa2-sam-35-tut-A_spark_.png`, `-36-golden-spark.png`) y el toque **silencia el juego** (`-37-golden-after-tap.png`: icono de altavoz tachado). Existe la cadena `goldenOffscreen: 'Destello'` (`i18n.ts:72`) sin uso.
* **Arreglo:** si el destello está fuera de la placa visible, no atenuar y dibujar una flecha en el borde más cercano con `t('goldenOffscreen')`; recortar la posición al rect de la placa.

### H-16 · **minor** · Copys duplicados / contradictorios del tutorial
* `tutEssenceTitle: "Tu Esencia"` + `tutEssence: "Tu Esencia. Gástala…"` repite el título (`qa-qa2-sam-18-tut-Your_Essence.png`).
* El paso "El Laboratorio" dice "**Compra el Gotero**" aunque el jugador ya tiene Gotero I (pide el II, 150 💧): `tutorial.ts:153-157` (`labTarget` elige `dropper` mientras no esté al máximo). `qa-qa2-sam-23-tut-The_Lab.png`.

### H-17 · **minor** · Palabras que asustan a un niño
* `STATE`: "**Explotó**" (insignia naranja), "**Muerta**" (`i18n.ts:345-350`); `calWarning`: "puede **matar** la vida actual" (`:114`); "**Extinguir/Extinción**" como botón y pestaña (`:142,:273`). **Arreglo en §5.3.**

### H-18 · **minor** · Iconos sin significado para un niño
* Pastilla de semilla: el icono "semilla" (espiral con rabillo, `icons.ts`) a 13 px parece un caracol; hay que **dedo**. Probeta verde de Muestras: aparece sin aviso. Punto rojo de la Bitácora: parece una alerta. Icono del Bestiario: círculo con espiral (parece "mareo").
* **Bien:** gota = esencia, matraz = laboratorio, engranaje, libro, altavoz (tachado al silenciar), borrador, pausa/play, ADN, deslizadores.

### H-19 · **polish** · La pista de gesto ("Arrastra: pincel de materia") se superpone a la tarjeta de criatura
* `qa-qa2-sam-28-periodic.png` (la píldora "Drag: matter brush" tapa la fila "Yields"). **Arreglo:** esperar a que no haya tarjeta abierta.

### H-20 · **minor** · El botón "Siguiente" del paso "¡Vida!" viaja con la criatura
* El recuadro se recoloca cada frame sobre la criatura (`tutorial.ts:122-133`, `placeBubble`). Medido: una criatura estable se desplaza **≈ 47 px/s** de pantalla a 30 pasos/s (`qa2-speed.mjs`, escala 2,4 px/celda), y el recuadro salta ~250 px cuando la criatura da la vuelta al toro o cuando cambia entre arriba/abajo. En las dos corridas de `poke` el paso "¡Vida!" necesitó **6 y 2 intentos** (`qa-qa2-pokeA-01…06-tut-*-_Vida_.png`: el recuadro pasa de (240,500) a (160,370) y a (160,230)); mi arnés tarda 1-3 s entre leer la posición y tocar, un dedo humano ≈ 1 s: sigue siendo arriesgado para una niña de 5 años.
* **Arreglo:** el aro sigue a la criatura, el **recuadro y su botón quedan fijos** (abajo, sobre la hoja) con una flecha.

### H-21 · **minor** · El título no deja elegir idioma ni silenciar
* El audio arranca con el toque del título; el título no tiene ni el altavoz ni el selector de idioma (Sam lo necesitó, Jorge querría bajar el volumen). `splash.ts`, `ui.ts bindGesture`.

### H-22 · **major** · Un toque en un deslizador de Calibrar borra toda la vida en ≈ 5 s, sin deshacer
* **Repro (corrida `late`, español, salto declarado §7.2):** comprar Calibrador (250 💧) → pestaña Calibrar se abre sola → tocar la pista del deslizador "Crecimiento μ" al 85 % (la bolita salta de 0,150 a **0,173**).
* **Real:** `+2,4/s` → `+1,09/s` (a 1 s) → `0/s` y **0 criaturas a los 5 s**; solo sale el logro "Ajuste fino". El único aviso es una línea fija "Cambiar las reglas puede matar la vida actual." (13 px). Para una niña de 5 años, tocar un deslizador grande "mata a mis bichos".
* **Evidencia:** `qa-qa2-late-08-calibrar-mu-moved.png`, `qa-qa2-late-09-calibrar-mu-moved+5s.png` (placa vacía), `qa-qa2-late-05-calibrar-top.png` (aviso).
* **Código:** `src/ui/panel-calibrate.ts` (`range.addEventListener('input', …)` llama a `setCalibration` en cada movimiento, sin confirmación).
* **Arreglo:** (1) los cambios solo se *aplican* al soltar y con un botón grande "Probar" (ES `Probar` / EN `Try it`) y un botón "↩ Volver" (ES `Volver a mi receta` / EN `Back to my recipe`) durante 10 s; (2) aviso con icono y tono amable: ES **"Ojo: al cambiar las reglas, tus criaturas pueden desaparecer."** / EN **"Careful: changing the rules can make your creatures vanish."**; (3) marca en el deslizador del valor que mantiene vivas a las criaturas actuales ("tu receta").

### H-23 · **minor** · "Tamaño R" y "Ritmo dt" dicen "Se desbloquea con el Calibrador" justo después de comprarlo
* Tras comprar Calibrador I, la pestaña muestra `Tamaño R 🔒 Se desbloquea con el Calibrador` y `Ritmo dt 🔒 …` (y "Los regímenes llegan con Calibrador II."). R/dt llegan con **Calibrador III y IV** (`content.ts:127-133`).
* **Evidencia:** `qa-qa2-late-07-calibrar-bottom.png`, `qa-qa2-lateen-07-calibrar-bottom.png`. **Código:** `i18n.ts:120` (`sliderLocked`), `panel-calibrate.ts`.
* **Arreglo:** texto por deslizador: ES **"Con Calibrador III"** / EN **"With Calibrator III"** (dt) y **"Con Calibrador IV"** / **"With Calibrator IV"** (R).

### H-24 · **major** · La barra de objetivo se atasca en pasos opcionales y la pista queda desfasada
* "Mira tu espécimen en el Bestiario" exige **abrir la ficha** de la especie (métrica `speciesSeen`, `balance.ts` `OBJECTIVES[2]`); el Bestiario se abre con las mejoras arriba y el tutorial da el paso por hecho al cambiar de pestaña. Resultado: la barra seguía en "Mira tu espécimen…" **tras comprar Gotero, Calibrador, hacer una Extinción y llegar a 20.000 💧** (`qa-qa2-late-04…11`, `qa-qa2-late-20-dish-era2.png`, `qa-qa2-lateen-16-era-summary.png`), y en "Compra Calibrador I" **6 min de juego** con 1.049-1.385 💧 (Jorge, `qa-qa2-jorge-21-periodic.png`; Sam "Buy Calibrator I" 150+ s con 5.000-87.000 💧).
* Además la barra queda **en blanco** entre objetivos (`qa-qa2-lucia-11-event-creatureStable.png`: "OBJETIVO" sin texto).
* **Arreglo:** (1) cada objetivo se da por cumplido si su condición ya se cumplió por otra vía (comprar Gotero/Calibrador/mover μ antes de tiempo, abrir el Bestiario); (2) tocar la barra lleva y pulsa su destino (scroll + brillo de la tarjeta/pestaña); (3) nunca vacía: mostrar el siguiente al instante.

### H-25 · **minor** · Tras la Extinción la placa nueva está vacía y no dice qué hacer
* Fin de Era (ritual blanco 3 s → "Fin de la Era 1 / Esencia de la Era 300.000 / Especies nuevas 2 / GENOMA GANADO +9 / Abrir el Árbol"), luego la placa **vacía** con `+0/s`; no vuelve la mano "Toca la placa" (solo existe antes del primer toque, `ui.ts:933-948`), el objetivo sigue siendo el viejo, y el botón "Abrir el Árbol" lleva a un árbol de nodos con jerga ("Anillos dobles 5, Memoria del Gotero 3, Mutaciones 8, Simbiosis 15…").
* **Evidencia:** `qa-qa2-late-14-ritual-1.png`, `-16-era-summary.png`, `-18-after-summary.png`, `-20-dish-era2.png`; `qa-qa2-late-11-genoma-top.png`, `-12-genoma-scrolled.png`.
* **Arreglo:** al cerrar el resumen, mano animada + `Placa nueva: ¡toca para sembrar!` / `Fresh dish: tap to seed!`; en el resumen ofrecer **dos** botones: `Comprar con mi Genoma` y `A sembrar`. El ritual en sí (blanco → resumen corto) es excelente y no asusta.

### H-26 · **major** · Los pasos de tutorial "Calibrar" y "Extinción" nunca llegan a verse
* **Real:** al comprar el Calibrador la pestaña Calibrar **se abre sola** (`late-04`, sheet=`calibrate`) y `complete()` del paso (`activeTab()==='calibrate' && now - start.at > 400`, `tutorial.ts:209`) se cumple a los 0,4 s: el estado guardado ya incluye `calibrate` en `done` (y `genome` al aparecer la pestaña Genoma, `late-10`) sin que ninguna de las 6+6 lecturas del cartel lo encontrara. El jugador **no lee** "Cambia las reglas de la vida. ¡Aparecen especies nuevas!" ni "Reinicia la placa y gana Genoma para siempre".
* **Código:** `src/ui/tutorial.ts:201-222` (`calibrate`, `genome`) + auto-apertura de pestañas en `ui.ts updateTabs`.
* **Arreglo:** que `complete()` exija pulsar "Siguiente" (o ≥ 3 s visible) o que no se auto-abra la pestaña mientras haya un paso pendiente.

### H-27 · **polish** · Separadores de miles incoherentes
* "Gana **250 000** Esencia en esta Era" (es) / "Earn **250 000** Essence" (en) frente a "**300.000**" / "**300,000**" en el resumen de Era y a "1 000" en logros (`content.ts` usa el formateador de `game/format.ts`; la UI usa `ui/format.ts`).
* **Evidencia:** `qa-qa2-late-12-genoma-scrolled.png` vs `-16-era-summary.png`; `qa-qa2-lateen-16-era-summary.png`. **Arreglo:** un solo formateador (`ui/format.ts`) también para `TEXT.extinctionRequirement`.

### H-28 · **major** (regresión del árbol de las 06:30) · La barra de objetivo flotante corta la instrucción principal con "…"
* La UI nueva pone el objetivo como píldora flotante sobre la placa (ya no empuja el layout: bien) pero con ancho fijo y `nowrap`: "OBJETIVO Toca la placa para …", "OBJETIVO Consigue una criat…", "OBJETIVO Mira tu espécimen …". Es **la** instrucción para el que no sabe qué hacer.
* **Evidencia:** `qa-qa2-luciaC-03-tap-outside-spotlight.png`, `-10-tut-Paciencia_de_laboratorio.png`, `qa-qa2-flood-01-flood-0.0s.png` (HEAD de las 06:30).
* **Arreglo:** que la píldora crezca a 2 líneas (`white-space:normal`, 15 px) o recorte la etiqueta "OBJETIVO" y use un icono (🎯) para dejar sitio a la frase.

### H-29 · **polish** · Los toasts son botones: tocar el de "Logro" abre un modal de media pantalla justo cuando la niña toca la placa
* Con la placa tocada deprisa, uno de los toques cayó en el toast "Logro: Primera gota" y abrió **Bitácora → Logros** tapando la placa (`qa-qa2-luciaC-06-rapid-4-taps.png`). `toasts.ts` (`onClick`) y `ui.ts bindBus` ('achievement' → `openJournal('ach')`, 'speciesNew' → ficha).
* **Arreglo:** toasts no interactivos durante los primeros 3 minutos o con `pointer-events:none` y un "Ver" explícito; o colocarlos fuera de la zona de toque de la placa.

## 7. Apéndice de evidencia

### 7.1 Dónde están los artefactos
* Guiones: `tests/e2e/qa/qa2-lib.mjs` (arnés), `qa2-lucia.mjs`, `qa2-jorge.mjs`, `qa2-sam.mjs`, `qa2-poke.mjs` (pulsa todos los botones), `qa2-explosion.mjs` (perfiles de toque, cuenta eventos del bus), `qa2-speed.mjs` (velocidad de una criatura en pantalla), `qa2-pause.mjs`, `qa2-late.mjs` (salto declarado a Calibrar/Extinción), `qa2-fmt.ts`, `qa2-dump-strings.ts`.
* Capturas: `/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad/qa-qa2-<persona>-NN-<paso>.png` + `…-diary.json` (por captura: tiempo, estado del juego, **todos los textos visibles con su tamaño de fuente**, objetivos táctiles < 44 px) + `…-events.json` (bus de eventos con paso de simulación) + `qa-qa2-jorge-contrast.json`, `qa-qa2-late-contrast.json`.
  Personas: `lucia` (toque pausado), `luciaB` (primera corrida: ráfaga de 16 toques), `samA` (primera corrida de Sam), `sam`, `jorge`, `poke`, `pokeA` (1.ª corrida de `poke`), `late` (es), `lateen` (en).

### 7.2 Salto declarado (regla del brief)
`qa2-late.mjs` **sí** modifica estado: tras la primera criatura estable y el tutorial reales, escribe `bioluma.game.state.essence = 800` (≈ minuto 8 del GDD) y, para la Extinción, `eraEssence = 300000` y `essence += 20000`. Nada más: la compra del Calibrador, la pestaña nueva, el movimiento de μ, el ritual de 1,5 s, el resumen de Era y el Árbol son el código real. Se hizo en es y en en.

### 7.3 Texto, objetivos táctiles y contraste (medidos)
* **Tamaños de letra** (Sam, 384 cadenas únicas): 11 px → 51, 12 px → 80, 13 px → 126, 14 px → 54, 15 px → 33, 16–18 px → 22, 23 px → 34 (cifra de esencia), 51 px → 7 (título). Jorge: 60 % ≤ 13 px. Textos clave: instrucción de la barra de objetivo **13 px**, etiqueta "OBJETIVO" **11 px**, pestañas **11 px**, `+n/s` **12 px**, cuerpo del tutorial **14 px**, título del tutorial **16 px**, "Saltar tutorial" **12 px**, botones "Siguiente/Entendido" **12-14 px**.
* **Objetivos táctiles < 44 px en alto o ancho** (`small` de los diarios): HUD Bitácora/Silenciar/Ajustes **40×48**; Cerrar modal **36×36**; "Saltar tutorial" **103×40**; "Siguiente" **109×40**; "Entendido" **114×40**; chips de cantidad **48×40**; selector Auto/Oscuro/Claro **54-84×40**; interruptores **48×28**; deslizadores de volumen **147×36**; asa de la hoja **390×22**; "Cancelar" (pastilla borrar) **29×32**. (CSS declara 46-48 px; el `flex` los comprime.)
* **Contraste WCAG** (cálculo sobre estilos computados; el título se excluye porque va sobre canvas): tema **claro**: `+0/s` **2,84:1**, "Clasificando…" **2,94:1**, "Registra 3 especies" **3,08:1**, `#01…#04` del diario **3,22:1**, coste de la pastilla de semilla `2,5` **4,09:1**, "Entendido" **4,09:1**, "OBJETIVO" **4,24:1**. Tema **oscuro**: `+0/s` **3,41:1**, extremos de deslizador `0.120/0.180` **2,79:1**; resto ≥ 4,5:1. Los bloqueados ("Anillos triples", 4,42; costes 2,38) son intencionalmente tenues pero aun así ilegibles para un niño.
* **Prueba de "letra grande"** (`html{font-size:20px}`, +25 %): sin roturas de maquetación en Principal, Laboratorio ni Ajustes (`qa-qa2-jorge-24/25/26-bigtext-*.png`).
* `index.html`: `viewport … user-scalable=no`.

### 7.4 Pasos de simulación por segundo en el sandbox
Entre 6 y 20 pasos/s (nominal 30) con carga 20-35; los tiempos de pared de las tablas son por tanto 2-3× los de un móvil. Todo evento de simulación se da también en pasos/30 (*juego*).

### 7.5 Lo que NO se probó
Rendimiento real en móvil, audio audible (solo se comprobó que el botón/slider cambia de estado), vibración, instalación PWA, offline card (`Mientras no estabas`), ranking, tienda y vestidor, historia/diálogos y secretos (están en la carpeta de otros agentes y llegaron al árbol de trabajo mientras se escribía este informe: el build probado es `d19aace` + árbol de trabajo a las 05:22 UTC, y se **re-verificó parcialmente contra `530014e`** más abajo).

## 8. Re-verificación contra el árbol actual (el proyecto se movió mientras probaba)

Otros agentes empujaron commits y editan el árbol de trabajo en paralelo. Foto de cada versión que probé:

| Versión | Qué es | Cuándo |
|---|---|---|
| **A** | `d19aace` + árbol de trabajo | build de las 05:22 UTC (`/tmp/qa2/dist`): **base de §2-§7** |
| **B** | `530014e` (commits `433d7dd` "placa desbordada no produce, limpieza gratis, especies con control y tope de precio", `5a5ab04`, `65e7f2e` desglose de precio…) | build 06:19 (`/tmp/qa2/dist2`) |
| **C** | `530014e` + cambios sin commitear en `ui.ts`, `ui.css` (+423 líneas), `i18n.ts`, `panel-lab.ts`: pestañas siempre visibles con candado, banner/FAB "Limpiar placa", objetivo flotante, divisas en huecos fijos, botón "¿Por qué cuesta esto?" | build 06:30 (`/tmp/qa2/dist3`) |

`src/ui/tutorial.ts` y `panel-calibrate.ts` **no cambian** en A→C. Resultados (`qa2-verify.mjs`, `qa2-explosion.mjs`, `qa2-flood.mjs`, corrida `luciaC`):

| Hallazgo | A (05:22) | B (06:19) | C (06:30) |
|---|---|---|---|
| H-01 HUD bloqueado en el tutorial | sí | **sí**: engranaje → sin modal; altavoz `muted false→false` | **sí**: idem |
| H-03 el cartel se come el primer toque | sí | **sí**: toque en (195,334) → `seeds 0→0`; en (195,437) → `0→1`; paso 2: 5 de 20 toques sobre la placa cayeron en el cartel | **sí, peor**: la placa mide ahora 390×419 y el cartel (y 126-252) cubre su centro: toque en (195,189) → `0→0`; en la corrida `luciaC` el primer toque (a 0,45 de la placa) no sembró y la primera criatura apareció ≈ 12 s de pared después (`qa-qa2-luciaC-04-first-tap-0.4s.png`, `-05-first-tap-2s.png`, `-06-rapid-4-taps.png`); paso 2: 3 de 20 toques perdidos, 6 sembraron |
| H-08 recuadro en (0,0) 0,3 s | sí | sí: (12,5)→(45,271) | sí: (12,5)→(45,126) |
| H-05 muro de precio con toques rápidos | 16-55 `seedDenied` de 74-87 | **46, 34, 29, 40** `seedDenied` de 82-87 toques (4 corridas "niño"); precio final 12 / 2,5 / 2 / 3 (antes hasta `8,04e21`) | `seedDenied` también en `luciaC` (`-11-event-seedDenied.png`, coste 3,5); no re-medido en serie |
| H-06 "explosión" | 3 de 4 corridas "niño" + 3 de 5 de persona | **1 de 4** (`dishOvergrown`), especies finales 1-3 (antes 6-53); toast "⚠ ¡La placa se desbord… Dem…" **cortado** y **sin botón Limpiar** (`qa-qa2-floodHEAD1-01-flood-0.0s.png`) | **arreglado en lo esencial**: banner "¡La placa se desbordó! La materia sin forma no produce. **[Limpiar placa]**" + FAB con escoba; queda el toast duplicado y cortado (`qa-qa2-flood-01-flood-0.0s.png`, `-03-flood-5s.png`) |
| Salto de la placa al primer toque (−22 %) | sí | sí | **arreglado**: la placa ya no cambia de tamaño (hoja inferior fija) |
| Pestañas que aparecen de golpe | sí | sí | **arreglado**: las 4 pestañas existen desde el inicio con candado y una tarjeta explicando cómo se desbloquean (`luciaC-03`) |
| Divisas 🧪/🧬 que aparecen sin aviso (H-18) | sí | sí | **mitigado**: huecos fijos "🧪 — / 🧬 —" desde el principio |
| H-28 objetivo cortado con "…" | no (barra a todo el ancho) | no | **nuevo** (ver §6) |
| H-11 etiqueta "Especie nueva" cortada por el borde | sí | sí | **sí** (`luciaC-11`) |
| H-22, H-23, H-24, H-26 (Calibrar, objetivos, pasos invisibles) | sí | sí (sin cambios en tutorial/panel) | sí |

**Para quien arregle:** al terminar el trabajo en `ui.ts`, repetir `node tests/e2e/qa/qa2-verify.mjs`, `qa2-flood.mjs` y `qa2-explosion.mjs` con `QA_DIST=<build>`; son 3 comprobaciones de menos de 5 min cada una (H-01, H-03, H-06).

## 9. Los 15 cambios con más impacto en claridad + diversión

> Ordenados por (veces que lo vive un jugador nuevo × lo que le cuesta). Cada uno con el texto o diseño exacto. Referencias H-xx = §6.

| # | Cambio | Texto / diseño exacto (ES · EN) | Dónde |
|---|---|---|---|
| 1 | **El primer toque debe funcionar siempre y mostrarse con una mano** (H-03) | Paso 1: un **dedo animado** con anillos sobre el centro de la placa y el texto **"¡Toca aquí!" · "Tap here!"** (título vacío). `.coach-bubble{pointer-events:none}` y solo `button{pointer-events:auto}`; en pasos con foco grande el recuadro va **arriba** (`y = hole.y + 8`), no en el centro; "Saltar tutorial" sale de la placa (a la barra de objetivo, ya con "¿Seguro?"). El paso "Paciencia" nunca se coloca sobre la placa. | `tutorial.ts:465-467`, `ui.css:3311-3322`, `i18n.ts tutSeed/tutSeedTitle` |
| 2 | **Nunca bloquear sonido/ajustes/diario** (H-01) | `.bl-hud .hud-actions{position:relative;z-index:16}` por encima de `.coach-dim`; tocar fuera del foco = pulso del anillo + sacudida del recuadro + sonido `deny` (hoy: silencio). | `ui.css:3275-3290`, `tutorial.ts` |
| 3 | **Que la 1.ª criatura viva casi seguro** (H-04) | `charges.guaranteed = 1` y `free = 3` al empezar (`state.ts:210`), 1.ª "¡Vida!" a los ≈ 3 s en vez de ≈ 19 s. Reescribir el paso de espera: **"¡Casi!" — "A veces se apagan. ¡Toca otra vez!"** · **"Almost!" — "Some fade out. Tap again!"** (`tutWaitTitle/tutWait`). | `state.ts:210`, `i18n.ts:259-260` |
| 4 | **La pastilla de semilla nunca grita en rojo** (H-05) | Con > 2 recién nacidas o sin esencia: pastilla **gris con ⏳ "Espera…" · "Wait…"** y toast **"⏳ Tus semillas están creciendo" · "⏳ Your seeds are growing"** en vez de `12` / `40` rojo + vibración; tocar da un *wiggle* suave. Icono de **dedo** en vez de la espiral. | `ui.ts:1261-1267, 900-935`, `game.ts:277` |
| 5 | **Pasada de palabras para niños** (§5) | `Toca la placa para sembrar` → **"Toca aquí para crear vida" · "Tap to make life"**; `Consigue una criatura estable` → **"Cría una criatura viva" · "Grow a living creature"**; `Espécimen N` → **"Criatura N" · "Creature N"**; pestaña `Bestiario` → **"Álbum" · "Album"**; `Extinguir/Extinción` → **"Empezar de nuevo" · "Fresh start"**; `Régimen` → **"Receta" · "Recipe"**; `Explotó/Muerta` → **"Se desbordó / Se apagó" · "Overflowed / Faded"**; ocultar `μ σ dt R` hasta Microscopio II y llamarlos **Crecimiento / Tolerancia / Ritmo / Tamaño**. | `content.ts OBJECTIVE_TEXT`, `i18n.ts` (tab*, STATE, regime*, muRange…) |
| 6 | **Letra y botones de tamaño legible** (H-07, H-28) | Suelo de **14 px** para texto de lectura; la **píldora de objetivo a 15 px y hasta 2 líneas** (hoy se corta: "Toca la placa para …"); etiquetas de pestaña 12 px; `.hud-btn{min-width:48px;flex:none}`; botones del tutorial `min-height:52px` (**64×64** en el paso 1); quitar `user-scalable=no`; interruptor en Ajustes **"Letra grande: Normal / Grande" · "Large text: Normal / Large"** (`html{font-size:112.5%}`: ya probado, no rompe nada). | `ui.css` (76 reglas ≤ 0,8125 rem), `index.html` |
| 7 | **Un mensaje a la vez** (H-09, H-10) | Ocultar tarjetas `intro` y toasts no críticos mientras `tutorial.active`; toast del diario fijo **"📖 Nueva nota" · "📖 New note"** (el texto íntegro, solo en la Bitácora); "Objetivo cumplido" solo en la barra (con `+4 💧` volando al contador); agrupar **"¡+12 criaturas nuevas!" · "+12 new creatures!"**. | `ctx.ts:60`, `toasts.ts`, `ui.ts bindBus` |
| 8 | **Calibrar sin trampa** (H-22, H-23) | Los deslizadores se aplican al soltar con botón grande **"Probar" · "Try it"** y **"↩ Volver a mi receta" · "↩ Back to my recipe"** 10 s; aviso **"Ojo: al cambiar las reglas, tus criaturas pueden desaparecer." · "Careful: changing the rules can make your creatures vanish."**; candados correctos **"Con Calibrador III/IV" · "With Calibrator III/IV"**. | `panel-calibrate.ts`, `i18n.ts:114,120` |
| 9 | **Que los pasos "Calibrar" y "Extinción" se vean** (H-26) y no se repita el Gotero (H-16) | `complete()` solo al pulsar "Siguiente" (o ≥ 3 s); "El Laboratorio" solo si `dropper===0`, si no **"Gotero II — ¡Más suerte en cada toque!" · "Dropper II — More luck on every tap!"**; `tutEssenceTitle` **"Tus gotas 💧" · "Your drops 💧"**. | `tutorial.ts:153-157, 201-222`, `i18n.ts:263-266` |
| 10 | **El recuadro no vuela ni persigue** (H-08, H-20) | Animar con la propiedad `scale` (no `transform`) para no pisar el `translate`; en "¡Vida!" el aro sigue a la criatura pero **recuadro y botón quedan fijos** abajo, con flecha. | `ui.css:2859,3324`, `tutorial.ts:122-133,476` |
| 11 | **Un objetivo que siempre lleva a algún sitio** (H-24) | Cumplir automáticamente los ya hechos por otra vía; tocar la barra = scroll + brillo a la tarjeta/pestaña; nunca en blanco. Texto de "mira": **"Toca tu criatura nueva en el Álbum" · "Tap your new creature in the Album"**. | `ui.ts updateObjective`, `balance.ts OBJECTIVES[2]` |
| 12 | **El Bestiario abre sobre la criatura** (H-14, H-12) | Cuadrícula "Registradas 1 / ?" con silueta de las que faltan **arriba**, mejoras de Muestras debajo; ficha sin "Rango μ/σ" hasta el Microscopio; botón **"Plantar otra · 🧪1" · "Plant another · 🧪1"**. | `panel-bestiary.ts:62-70`, `modals.ts:562-565` |
| 13 | **Explicar la placa desbordada con un botón** (H-06) | Toast corto **"¡Uy, se llenó! 🌀" · "Oops, it's full! 🌀"** + botón grande **"Limpiar" · "Clean"** (`sterilizeDish` y la tarjeta "Limpiar placa" de `src/moments` ya existen en el árbol; ningún control de `src/ui` las llama todavía y el toast actual sale cortado, §8) y tope visual de precio **"¡Muy caro!" · "Too pricey!"** en lugar de `8,04e21`. | `ui.ts bindBus('dishOvergrown')`, `src/moments/catalog.ts:536-557` |
| 14 | **Idioma y sonido desde el título** (H-21, H-02) | Dos botones ES · EN y un 🔊 en el título; Ajustes con **Idioma primero** y su título retraducido al cambiar (`ModalHandle.setTitle`). | `splash.ts`, `modals.ts:56-63,288-322` |
| 15 | **Después de Extinguir, decir qué hacer** (H-25) | Al cerrar el resumen: mano animada + **"Placa nueva: ¡toca para sembrar!" · "Fresh dish: tap to seed!"**; el resumen con dos botones **"Comprar con mi Genoma" · "Spend my Genome"** / **"A sembrar" · "Let's seed"**. | `ui.ts onExtinctionStart`, `modals.ts openEraSummary` |

**Además (menores):** H-11 clamp de etiquetas/tarjeta al borde y a los FAB; H-13 fila "Calidad"; H-15 destello fuera de la placa (flecha en el borde con `t('goldenOffscreen')`); H-17 palabras que asustan; H-18 iconos (dedo, álbum); H-19 pista de gesto sobre la tarjeta; H-27 un solo formateador de miles.
