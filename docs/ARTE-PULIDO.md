# Pulido de arte y movimiento

> Encargo del dueño (v0.018, `73842e7`): «Siento que los gráficos no son profesionales ni las animaciones. Busca en
> internet cómo hacerlo mejor y déjalo fino.»
>
> Este documento es la especificación de ese pulido. Complementa la biblia de arte ([`ARTE.md`](ARTE.md), ADR-024): no
> cambia la dirección artística (vela cálida contra vida fría, todo dibujado en código), sino **cómo se aplica y cómo se
> mueve**. Tiene cuatro partes: lo que dice la investigación (§2), lo que vimos al jugar (§3), el plan en dos paquetes
> independientes con valores exactos (§4–§5) y el presupuesto de rendimiento (§6).

## Índice

1. [Diagnóstico en una página](#1-diagnóstico-en-una-página)
2. [Investigación: reglas con su fuente](#2-investigación-reglas-con-su-fuente)
3. [Auditoría: lo que vimos, ordenado por impacto](#3-auditoría-lo-que-vimos-ordenado-por-impacto)
4. [Paquete A: PLACA Y MUNDO](#4-paquete-a-placa-y-mundo)
5. [Paquete B: INTERFAZ Y MOVIMIENTO](#5-paquete-b-interfaz-y-movimiento)
6. [Presupuesto de rendimiento](#6-presupuesto-de-rendimiento)
7. [Fuera de los dos paquetes (integrador)](#7-fuera-de-los-dos-paquetes-integrador)
8. [Cómo verificar: capturas antes / después](#8-cómo-verificar-capturas-antes--después)

---

## 1. Diagnóstico en una página

El juego ya tiene casi todas las piezas de un acabado profesional: tokens de diseño (`src/ui/art/tokens.ts`), un
vocabulario de movimiento (`src/ui/art/motion.ts`), un render de criaturas de calidad (`src/ui/art/specimen.ts`, con
B-spline cúbica y *bloom*) y un shader de placa cuidado. **El problema es que no se aplican.** Medido sobre el CSS
del juego (12 717 líneas en `src/ui/**/*.css`):

| Medida | Hoy | Debería |
|---|---|---|
| Tamaños de letra distintos | **19** (incluye 10,5 · 11,5 · 12,5 · 13,5 · 14,5 · 17,5 px) | 8 (la escala de ARTE §4) |
| Radios de esquina distintos | **21** | 5 (`RADIUS`: 8 / 12 / 16 / 24 / pill) |
| Sombras `box-shadow` distintas en `ui.css` | **73**; los tokens `--bl-shadow-*` se usan **5** veces | 4 niveles de elevación + 3 brillos |
| Duraciones de animación distintas | **~30** (0,12 s … 3,2 s); los tokens `--bl-t-*` / `--bl-ease-*` aparecen 34 veces | 9 tokens + 3 muelles |
| Escalas de «botón pulsado» (35 reglas `:active`) | **7** distintas (0,94 … 0,99), sin retorno con muelle; `pressable()` existe y **no se usa** en el juego | 1 gesto: 0,96 / 0,98 y muelle de vuelta |
| Animaciones infinitas sobre `box-shadow` / `filter` | **9** (`rt-pulse` en los 7 nodos a la vez, `rt-moon`, `bl-letter-glow`, `bl-breathe`, `bl-next`, `dock-pulse`, `ss-warn`, `sty-glow`, `bl-clean-arm`) + `bl-shimmer` sobre `background-position` | 0 (solo `transform`/`opacity`) |
| `backdrop-filter` encima de la placa animada | 7 selectores (`.fab`, `.mode-pill`, `.toast`, `.ccard`, `.buff`, objetivo, banner) | 0 |
| Retratos de especie | `renderPattern` bilineal a 128 px (40–52 px en Inicio/Árbol), **pixelados** | `renderSpecimen` cúbico a `px × devicePixelRatio` |
| Fuente de títulos (Fraunces) en una primera visita | **no llega a tiempo** (`display=optional` solo la espera ~100 ms, sin precarga, el SW no la guarda): sale Georgia/Times/Noto Serif, y así toda la visita | autoalojada, precargada, con *fallback* de métricas iguales |

A eso se suma lo que se **siente** al jugar: sembrar no hace nada visible en el momento del toque, nacer no tiene
anticipación, la Esencia aparece como cifras de 12 px que no viajan a ningún sitio, las partículas son círculos planos,
las etiquetas «Viva +2,3/s ➤» tapan la vida, y en el Árbol la celebración de compra ocurre **detrás** de la hoja.

**Las 10 mejoras que más suben la calidad percibida** (detalle y valores en §4–§5):

1. **Retratos nítidos y luminosos** en Bestiario, ficha, resumen, inicio, Árbol y portada: cambiar `renderPattern` por
   `renderSpecimen` a la resolución real de pantalla (B-1). Es la mejora más barata y la más visible.
2. **La materia brilla en todos los perfiles**: *bloom* en cadena de mips (también en `low`), recorte suave de altas
   luces y relieve en las especies teñidas, para que las criaturas sean luz y no pegatinas (A-1, A-2).
3. **Un solo sistema aplicado**: 8 tamaños de letra, 5 radios, 4 elevaciones, 9 duraciones y 3 muelles, con un test
   que impide volver a los valores sueltos (B-2, B-3).
4. **Fraunces de verdad**: autoalojada y precargada, para que los títulos no caigan en Times (§7, integrador + B).
5. **El ciclo de vida con jugo**: gota y onda al sembrar, latido que se acelera al incubar, anticipación y estallido
   al nacer, disolución al morir (A-3, A-4).
6. **La Esencia vuela al contador**: motas de luz desde la criatura hasta el icono del HUD, que late al recibirlas
   (A-5 + B-6). Es el gesto de recompensa de todos los incrementales buenos.
7. **Pulsar se siente**: un único gesto de pulsado con muelle en todos los botones, nodos y tarjetas (B-4).
8. **Hojas y tarjetas que entran con orquestación**: entrada con desaceleración enfática, contenido escalonado 40 ms,
   salida más corta que la entrada, y nunca cajas dentro de cajas dentro de cajas (B-5, B-3).
9. **Nada tapa lo importante**: foco (spotlight) que comprueba que su objetivo se ve, VELA que se acopla encima de una
   hoja en vez de taparla, avisos que se cierran con un toque, contadores «4/4 ✓» (B-10, bugs del dueño).
10. **Etiquetas de la placa calladas**: anillo de progreso al incubar y una sola etiqueta mínima, para que la vida sea
    la protagonista (B-8 + A-4).

---

## 2. Investigación: reglas con su fuente

Cada regla dice qué hacer y de dónde sale. Donde la fuente no lo dice literalmente y es inferencia nuestra, se indica.

### 2.1 Jugo y sensación de juego

| # | Regla | Fuente |
|---|---|---|
| J1 | El *juice* son efectos no esenciales (tween, escala, partículas, sonido, sacudida, congelación, «personalidad») que se **apilan** sobre una mecánica que no cambia. En la demo de referencia cada efecto es un interruptor aislado: entrada con tween (0,7 s por defecto), estirar/aplastar, partículas al chocar, sacudida (potencia 0,5), **congelación de 0–320 ms** con entrada/salida, ojos y sonrisa. | Jonasson y Purho, *Juice it or lose it*, GDC Europe 2012: [GDC Vault](https://gdcvault.com/play/1016487/Juice-It-or-Lose); código de la demo: [`Settings.as` de juicy-breakout](https://raw.githubusercontent.com/grapefrukt/juicy-breakout/master/src/com/grapefrukt/games/juicy/Settings.as) |
| J2 | Muchos retoques pequeños suman más que uno grande: en la charla, 30 cambios menores convierten un juego soso en uno satisfactorio; uno de ellos es sacudir la pantalla **en dirección contraria** a la acción. | Nijman, *The art of screenshake* (2013), resumen en [Game Developer](https://www.gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games) |
| J3 | El *polish* es uno de los tres pilares de la sensación de juego y tiene cinco tipos: animación, efectos visuales, sonido, efectos cinematográficos (cámara) y táctiles. | Swink, *Game Feel* (2008), resumido en [Wikipedia: Game feel](https://en.wikipedia.org/wiki/Game_feel) |
| J4 | Sacudida de cámara con «trauma»: un valor 0–1 que suben los eventos y baja con el tiempo; el desplazamiento es proporcional a trauma² (ruido suave, no aleatorio por fotograma), para que lo pequeño casi no se note y lo grande sí. | Eiserloh, *Juicing Your Cameras With Math*, GDC 2016: [GDC Vault](https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing) (detalle del modelo: de la charla; los valores concretos de §4 son nuestros) |
| J5 | El jugo tiene coste: demasiado efecto rompe la inmersión. En un juego tranquilo (placa de noche), los efectos deben ser **del mundo** (luz, materia) y proporcionales al evento. | Kelly, *Don't Juice It or Lose It*, GDC Europe 2014: [GDC Vault](https://gdcvault.com/play/1020861/Don-t-Juice-It-or) |
| J6 | La respuesta debe ser inmediata; si algo tarda más de ~1 s, enséñalo con un indicador; un indicador continuo hace que la gente espere de media **3 veces más** y más contenta. Para 2–9 s, indicador en bucle; para ≥ 10 s, porcentaje. | NN/g, [Progress indicators](https://www.nngroup.com/articles/progress-indicators/) |

### 2.2 Movimiento de interfaz

| # | Regla | Fuente |
|---|---|---|
| M1 | La mayoría de animaciones de UI duran **100–500 ms**; respuesta simple ≈ 100 ms; cambios grandes 200–300 ms; > 400 ms ya es lento; «a 500 ms empiezan a ser un lastre». Las **salidas son más cortas** que las entradas (300 ms entrar, 200–250 ms salir). Lo que se ve a menudo debe ser más corto. | NN/g, [Animation duration](https://www.nngroup.com/articles/animation-duration/) |
| M2 | Nunca lineal para movimiento. **Ease-out** (desacelerar) para lo que entra, **ease-in** (acelerar) para lo que sale. | NN/g, ídem |
| M3 | Tokens de Material 3: duraciones 50–1000 ms en pasos de 50 (short1 50 … long4 600 … extra-long4 1000); curvas *standard* `cubic-bezier(.2,0,0,1)`, *emphasized decelerate* `(.05,.7,.1,1)` para entrar, *emphasized accelerate* `(.3,0,.8,.15)` para salir, *standard decelerate* `(0,0,0,1)`, *standard accelerate* `(.3,0,1,1)`. La duración crece con el área y el recorrido. | [Flutter `motion.dart`](https://github.com/flutter/flutter/blob/master/packages/flutter/lib/src/material/motion.dart), [Material Components Android: Motion](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md) |
| M4 | Patrones de transición: *fade through* 300 ms; *fade* entra en 150 ms y sale en 75 ms. | [Material Components Android: Motion](https://github.com/material-components/material-components-android/blob/master/docs/theming/Motion.md) |
| M5 | Muelles de M3 Expressive (masa 1): **rápido espacial** rigidez 800, amortiguación 0,6; **por defecto espacial** 380 / 0,8; **lento espacial** 200 / 0,8; los de **efecto** (color, opacidad) están críticamente amortiguados (1,0). | [androidx `ExpressiveMotionTokens.kt`](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/ExpressiveMotionTokens.kt) |
| M6 | Los muelles parecen físicos porque frenan como las cosas reales; úsalos para **movimiento**, no para color u opacidad; la mayoría no deben rebotar; en CSS se aproximan con `linear()`. | Comeau, [A friendly introduction to spring physics](https://www.joshwcomeau.com/animation/a-friendly-introduction-to-spring-physics/) |
| M7 | `linear()` aproxima muelles y rebotes con puntos muestreados; doblar los puntos ya da un resultado suave. Soporte: Chrome/Edge 113, Firefox 112, Safari 17.2. | Chrome for Developers, [CSS `linear()` easing](https://developer.chrome.com/docs/css-ui/css-linear-easing-function) |
| M8 | Escalonado de listas: cada elemento empieza **50 ms** después del anterior y dura 250 ms. | Flutter cookbook, [Staggered menu animation](https://docs.flutter.dev/cookbook/effects/staggered-menu-animation) |
| M9 | Principios de Disney en UI: **anticipación** (un pequeño gesto previo anuncia la acción), **acción continuada** (las partes se asientan a destiempo, ligero sobrepaso), **puesta en escena** (una sola cosa animada a la vez guía la mirada; muchas compiten). | [IxDF: Disney's 12 principles in UI](https://ixdf.org/literature/article/ui-animation-how-to-apply-disney-s-12-principles-of-animation-to-ui-design), [Marvel: Disney's motion principles](https://blog.marvelapp.com/disneys-motion-principles-in-designing-interface-animations/) |
| M10 | Estirar y aplastar es «con mucho» el principio más importante; la regla es **conservar el volumen** (si se estira ×1,2 en un eje, se aplasta ≈ ×0,83 en el otro). | [Wikipedia: Squash and stretch](https://en.wikipedia.org/wiki/Squash_and_stretch) |

### 2.3 Números y recompensa

| # | Regla | Fuente |
|---|---|---|
| N1 | Cifras que cambian: `font-variant-numeric: tabular-nums` (todas las cifras del mismo ancho, OpenType `tnum`), así el texto no baila. | MDN, [`font-variant-numeric`](https://developer.mozilla.org/en-US/docs/Web/CSS/font-variant-numeric) |
| N2 | El valor que cambia se anima (cuenta, rueda de dígitos) en vez de saltar; la plataforma de Apple lo ofrece como transición `numericText`. | Apple, [`ContentTransition.numericText`](https://developer.apple.com/documentation/swiftui/contenttransition/numerictext(countsdown:)) |
| N3 | En los incrementales de referencia, la recompensa **se ve viajar**: el «+N» nace donde se gana y lo ganado vuela o se suma al contador, que reacciona. En *(the) Gnorp Apologue* lo que más se elogia es que «rocía partículas» y que la UI se siente física. | Observación de juego; [PC Gamer vía inkl](https://www.inkl.com/news/my-new-favorite-idler-is-about-these-little-guys-who-hit-their-heads-against-a-rock), [Backloggd](https://backloggd.com/reviews/everyone/year/recent/the-gnorp-apologue/) |

### 2.4 Luz, materia y postproceso

| # | Regla | Fuente |
|---|---|---|
| L1 | *Bloom* físico: cadena de reducción (filtro de 13 tomas) y ampliación (tienda 3×3, radio ≈ 0,005 en UV) acumulando con `ONE, ONE`; 5–6 mips bastan; mezclar con `mix(hdr, bloom, 0,03–0,15)`; sin umbral duro (si hace falta, umbral suave); media de Karis en el primer paso contra los «luciérnagas». | LearnOpenGL, [Physically Based Bloom](https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom) |
| L2 | Curva fílmica ACES aproximada: `x(2,51x+0,03)/(x(2,43x+0,59)+0,14)`; 1,0 de entrada → ~0,8; satura algo las altas luces. | Narkowicz, [ACES Filmic Tone Mapping Curve](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/) |
| L3 | Contra el *banding* en degradados oscuros: ruido de distribución **triangular** de 2 LSB, animado por fotograma, también en alfa si hay mezcla (≈ 10 LSB), sin ruido en negro y blanco puros. | Gjøl (Playdead), [Banding](https://pixelmager.github.io/linelight/banding) |
| L4 | Grano y viñeta son efectos de cámara: sutiles, por encima de todo lo demás, y nunca sobre la UI. (Inferencia nuestra a partir de L3 y de la práctica de motores; los valores de §4 son nuestros y se calibran con capturas.) | — |

### 2.5 Profundidad en una interfaz oscura

| # | Regla | Fuente |
|---|---|---|
| D1 | Una sola fuente de luz para toda la interfaz; al subir de elevación crecen desplazamiento y desenfoque y **baja** la opacidad; sombras en capas (2–5) mejor que una; color de sombra con el tono del fondo, no negro puro. No animar sombras en capas. | Comeau, [Designing beautiful shadows](https://www.joshwcomeau.com/css/designing-shadows/) |
| D2 | En tema oscuro las sombras se ven poco: la elevación se expresa **aclarando y tiñendo** la superficie. Fórmula de Material: opacidad del tinte = (4,5 · ln(1 + dp) + 2) / 100 → 1 dp 5,1 %, 3 dp 8,2 %, 6 dp 10,8 %, 12 dp 13,5 %. | Material Components Android, [Dark theme](https://github.com/material-components/material-components-android/blob/master/docs/theming/Dark.md) y [`ElevationOverlayProvider`](https://github.com/material-components/material-components-android/blob/master/lib/java/com/google/android/material/elevation/ElevationOverlayProvider.java) |

### 2.6 Tipografía y composición móvil

| # | Regla | Fuente |
|---|---|---|
| T1 | Escala tipográfica de M3: display 57/45/36, headline 32/28/24, title 22/16/14, body 16/14/12, label 14/12/11 (px, con interlineado 1,12–1,5). Pocas tallas, bien separadas. | [Flutter `typography.dart`](https://github.com/flutter/flutter/blob/master/packages/flutter/lib/src/material/typography.dart) |
| T2 | Contraste AA: 4,5 : 1 texto normal, 3 : 1 texto grande y componentes. Objetivos táctiles ≥ 48 px (ya en ARTE §10). | W3C, [WCAG 2.2 §1.4.3 y §1.4.11](https://www.w3.org/TR/WCAG22/#contrast-minimum) |

### 2.7 Rendimiento a 60 fps en móvil

| # | Regla | Fuente |
|---|---|---|
| P1 | A 60 Hz hay 16,66 ms por fotograma, pero **tu trabajo debe caber en ~10 ms**. Tubería: JS → estilo → *layout* → pintura → composición; `transform`/`opacity` se saltan *layout* y pintura; `box-shadow`, `color`, `background` repintan; `width`, `height`, `top`, `left` rehacen *layout*. | web.dev, [Rendering performance](https://web.dev/articles/rendering-performance) |
| P2 | Animar solo `transform` y `opacity`; `will-change` como último recurso, añadido justo antes y quitado después; no abusar de capas. En la prueba, `top/left` perdió el 50 % de fotogramas y `transform` el 1 %. | web.dev, [High-performance CSS animations](https://web.dev/articles/animations-guide) |
| P3 | Nada de *layout* síncrono forzado: leer primero, escribir después; nunca alternar lectura y escritura en un bucle. | web.dev, [Avoid layout thrashing](https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing) |
| P4 | Canvas 2D: pre-renderizar lo repetido en un canvas fuera de pantalla, coordenadas enteras, agrupar llamadas, evitar cambios de estado, **evitar `shadowBlur`**, evitar texto, capas de canvas separadas, `requestAnimationFrame`. | MDN, [Optimizing canvas](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) |
| P5 | `backdrop-filter` sobre contenido que cambia en cada fotograma obliga a re-desenfocar cada fotograma. (Inferencia de P1: es pintura + filtro por fotograma; se verifica con *Paint flashing*.) | — |

### 2.8 Movimiento accesible

| # | Regla | Fuente |
|---|---|---|
| R1 | El movimiento provocado por la interacción debe poder apagarse salvo que sea esencial; respetar `prefers-reduced-motion`; el paralaje casi nunca es esencial. | W3C, [Understanding SC 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) |

---

## 3. Auditoría: lo que vimos, ordenado por impacto

**Cómo se hizo.** `npm run build` y una build e2e (`VITE_E2E=1`, que expone `window.bioluma` para acelerar el reloj),
servidas con `vite preview`; Chromium de `/opt/pw-browsers` con SwiftShader (`--use-gl=angle --use-angle=swiftshader`).
Se jugaron dos sesiones completas tocando como un jugador, en móvil 390 × 844 (táctil, DPR 2) y escritorio
1366 × 768, en oscuro y claro, español e inglés; más las páginas de desarrollo (`tree-dev.html`, `ui-dev.html`,
`art-dev.html`) para estados lentos de alcanzar. **Ojo:** SwiftShader elige el perfil de calidad `low`, que hoy
**apaga el *bloom*** (`QUALITY_GLOW.low.amount = 0`); un móvil medio verá algo de brillo, uno modesto verá lo mismo que
estas capturas.

**Capturas** (temporales, en el *scratchpad* de la sesión; §8 dice cómo regenerarlas):
raíz `/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad/pulido/`, con las carpetas
`play/` (partida completa, 4 casos × ~30 capturas), `audit/` (secuencias de fotogramas: siembra, Chispa, fin de
sesión), `harness/` (páginas de desarrollo) y recortes ampliados `zoom-*.png`.

Cada hallazgo: **qué se ve**, **por qué se lee como amateur**, **causa** y **paquete** que lo arregla.

### 3.1 [Muy alto] La materia se ve plana, como pegatinas — Paquete A

- Capturas: `play/play-desktop-es-dark-21-s2-midway.png`, `play/play-desktop-en-light-23-s2-midway.png`,
  `zoom-anillo.png`; comparar con la referencia `harness/h-art-dish.png` (la placa de la biblia, con brillo).
- Qué se ve: las «Anillo verde» son discos verde pastel uniformes con un contorno claro duro, sin halo; las criaturas
  «Naciendo» son discos blancos quemados con borde azul; la silueta tiene facetas visibles a 4–5 px por celda.
- Por qué es amateur: la identidad del juego es *bio-luminiscencia*; sin halo ni gradación interna la vida parece un
  icono plano encima de un fondo, no luz dentro de agar.
- Causa: `src/sim/webgl.ts` `QUALITY_GLOW.low = { amount: 0, passes: 0 }`; el *glow* es un único desenfoque de 9
  tomas a media resolución (radio corto); no hay recorte de altas luces (el blanco de la LUT satura); el relieve
  (`shade`, `spec`) es débil en las especies teñidas y el contorno iso (`v = 0.13`) pesa 0,85.

### 3.2 [Muy alto] Retratos de especie pixelados — Paquete B

- Capturas: `zoom-portrait.png`, `play/play-mobile-es-dark-18-s2-species.png`, `play/play-mobile-es-dark-17-s2-bestiary.png`,
  `play/play-mobile-es-dark-21-s2-summary.png`, portada `play/play-desktop-es-dark-00-title.png`.
- Qué se ve: escalones de píxel en todos los retratos (Bestiario, ficha, resumen, tarjeta de inicio, Árbol) y en la
  criatura de la portada; en la ficha, a 130 px CSS sobre DPR 2, el retrato es un PNG de 128 px estirado al doble.
- Causa: `src/ui/portrait.ts` `renderPattern()` muestrea el patrón con **bilineal** (C0: deja diamantes y escalones)
  a 128 px fijos (`portraitURL`) o 40–52 px (`session/start.ts`, `tree/treeView.ts`), sin multiplicar por
  `devicePixelRatio`. El renderer bueno, `src/ui/art/specimen.ts` `renderSpecimen()` (B-spline cúbica y *bloom*), solo
  lo usa la página de arte.

### 3.3 [Muy alto] El sistema visual existe pero no se aplica — Paquete B (+ integrador para la fuente)

- Capturas: títulos en Times/Georgia en `play/play-mobile-es-dark-06-s1-summary.png` («Fin de la sesión 1»),
  `…-08-s1-node-worldCold.png`, `…-10-s2-start-card.png`, `…-19-s2-running.png` (sello «¡TIEMPO!»),
  `play/play-desktop-es-dark-08-s1-tree.png`; la misma hoja con Fraunces cargada en `harness/h-night-sheet-5of4.png`.
- Qué se ve: en la build de producción los títulos salen en la serif del sistema; en el mismo cajón el título
  «Bestiario» sale en serif (lista) y en Inter (ficha); 19 tallas, 21 radios, 73 sombras, ~30 duraciones (tabla de §1).
- Por qué es amateur: la inconsistencia es la señal número uno de «hecho a trozos»; Times de sistema junto a Inter
  parece un error de carga (lo es).
- Causa: `index.html` pide Google Fonts con `display=optional` (si la fuente no llega en ~100 ms, esa visita se queda
  sin ella; en la máquina de pruebas Inter estaba instalada en el sistema y Fraunces no), sin `preload`, sin *fallback* métrico para Fraunces, y `public/sw.js` no toca orígenes externos
  (sin red, nunca hay Fraunces). Los tokens `--bl-*` se generan pero el CSS sigue con valores sueltos.

### 3.4 [Alto] Cajas dentro de cajas dentro de cajas — Paquete B

- Capturas: `play/play-mobile-es-dark-16-moment-behavior.still.png` (Momento: tarjeta → 4 cajas con borde → chips con
  borde), `…-21-s2-summary.png` (tarjeta → filas → fichas con borde), `…-08-s1-node-worldCold.png` (hoja → 2 cajas →
  caja «+1 especie» → caja «?»).
- Por qué es amateur: cada nivel con su borde de 1 px y su radio crea ruido de líneas; la jerarquía se pierde. La
  elevación debe contarla la superficie (D2), no un borde más.

### 3.5 [Alto] El ciclo de vida no tiene jugo — Paquete A

- Capturas: `audit/seed-strip2.png` (5 fotogramas 40–1300 ms tras sembrar), `play/play-desktop-en-light-20-s2-boost-ready.png`
  («+6,9» de 12 px), `audit/mobile-dark-03-moment-stable-enter.png`.
- Qué se ve: al tocar, la semilla aparece **ya con forma de criatura** y una etiqueta «Naciendo 2 %»; no hay gota, ni
  onda, ni luz en el punto del toque. Nacer («Viva») es un anillo fino, un destello y 10 partículas, sin anticipación. La Esencia son números de 12 px con
  trazo negro que suben 30 px y desaparecen; no viajan al contador. Las partículas son círculos de color plano sin
  brillo ni mezcla aditiva.
- Causa: `src/ui/overlay.ts` (`ripple`, `stableDing`, `income`, `burst`, `drawParticles`); `SEED_BLOOM_MS` (350 ms,
  `cycleBalance.ts`) existe pero el gesto apenas se percibe.

### 3.6 [Alto] Las etiquetas tapan la vida — Paquete B (dibujo) + A (sitio)

- Capturas: `play/play-mobile-es-dark-19-s2-running.png`, `play/play-desktop-es-dark-21-s2-midway.png`,
  `audit/seed-strip2.png`.
- Qué se ve: cada criatura lleva una píldora con borde verde, icono ✓, «Viva», «+2,3/s», punto y flecha; las de
  incubación dicen «Naciendo 77 %». Con 3 criaturas ya hay 3 píldoras grandes sobre una placa de Ø 600 px; compiten
  con la materia y con los «+N».
- Causa: `src/ui/moments/status.ts` (dibujo de píldoras, llamado desde `overlay.ts`).

### 3.7 [Alto] Capas que se pisan — Paquete B

- `play/play-mobile-es-dark-13-scene-t_bestiary.png` y `…-15-drawer-open.png`: con el cajón del Bestiario abierto, la
  flecha y el anillo del foco señalan **un hueco vacío abajo a la izquierda** (el botón del dock, tapado por el cajón).
  **Bug del dueño.**
- `…-14-moment-species.png`: el anillo del foco se dibuja encima del título «Bestiario» del cajón.
- `…-16-moment-behavior.still.png`: el anillo del foco cruza el reloj del HUD («0:18 SESIÓN 2»).
- `audit/mobile-dark-02-dish-first-look.png`: un arco del foco asoma cortado sobre el contador de Esencia.
- `audit/spark-strip.png` (60 / 300 / 700 / 1300 ms del «¡VIDA!» al empezar): mientras la cámara se acerca a la
  criatura, el anillo del foco **no está sobre ella** (la criatura queda en su borde inferior derecho) y lo persigue
  con retraso; además la placa se sale de la pantalla por los lados.
- `…-12-s2-ready.png`: el globo de VELA tapa la cabecera del cajón.
- `play/play-desktop-es-dark-08-s1-tree.png`: la pista «¡Toca el nodo verde…!» tapa los nodos «Cuaderno de campo» y
  «Cultivo»; en móvil los botones de zoom tapan los «?» de abajo (`audit/mobile-dark-42-s2-ready.png`).
- `harness/h-hud-run.png`: el «+5 s especie» cae encima de la previsión de Datos del HUD.
- Resumen e inicio: el contenido pasa por debajo de la barra fija inferior sin degradado (`…-06-s1-summary.png`,
  `…-10-s2-start-card.png`); en escritorio el resumen se corta arriba (`harness/h-summary-laptop.png`).
- Causa común: los elementos flotantes no conocen las zonas ocupadas; `src/ui/story/spotlight.ts` no comprueba si el
  objetivo está visible.

### 3.8 [Alto] El Árbol: todo grita igual y la compra se esconde — Paquete B

- `play/play-mobile-es-dark-07-s1-tree.png`, `audit/mobile-dark-42-s2-ready.png`: los 7 nodos disponibles tienen el
  mismo borde verde intenso y el mismo halo pulsante (`rt-pulse`, `box-shadow` infinito en los 7 a la vez). La mano es
  el **emoji** 👉 (se ve distinto en cada sistema; ADR-024 prohíbe emoji junto a iconos de línea).
- `audit/mobile-dark-38-buy-200ms.png`: tras «Comprar», la hoja sigue abierta y el estallido ocurre en el nodo
  **detrás** de la hoja: la celebración no se ve.
- `harness/h-tree-why.png`: «¿Por qué cuesta esto?» abre una **segunda hoja apilada** sobre la primera (dos bordes de
  color, cabecera de la de atrás asomando); el texto repite lo que ya dice la hoja. **Bug del dueño.**
- `harness/h-night-sheet-5of4.png`, `…-8.png`: «Especies 6/2» (y «Sesiones 5/4» del dueño): el contador pasa del
  máximo. **Bug del dueño.** «Aún no» es un botón fantasma que parece roto. La barra de título se corta («10 mejo…»).
- Nodo ↔ etiqueta ↔ insignia de coste no comparten eje; la barra «Árbol · Noche 1» tapa nodos al desplazar la cámara.

### 3.9 [Medio-alto] Resumen de sesión — Paquete B

- `play/play-mobile-en-light-20-s2-midway.png` y `play/play-mobile-es-dark-04-s1-running.png`: los primeros
  fotogramas del recuento son una **caja vacía de 600 px** con «Datos 0» al fondo (las filas reservan sitio pero son
  invisibles). Parece un fallo de carga.
- Fichas de la ecuación de anchos desiguales, «= 2» flotando a la derecha, separadores discontinuos: mucho trazo.

### 3.10 [Medio] HUD — Paquete B

- `zoom-clock-warn.png` (de `play/play-desktop-es-dark-25-s2-last-seconds.png`): en los últimos segundos las cifras
  del reloj se montan sobre el dial. Causa: `@keyframes ss-tick` escala a **1,35** desde el centro.
- Antes de que corra el reloj, la píldora de la criatura inicial dice «Viva +2,0/s» y el HUD «+0/s»: dos cifras que se
  contradicen (`audit/seed-strip2.png` frente al HUD de `audit/mobile-dark-05-dish-empty.png`).
- El contador de Esencia sube con suavizado exponencial (bien) pero el realce usa `void el.offsetWidth` (reflujo
  forzado, P3).

### 3.11 [Medio] Portada e intro — Paquete B

- `play/play-mobile-es-dark-00-title.png`: la versión aparece **dos veces** (arriba en mono y bajo el lema); la
  criatura pixelada (3.2); el logotipo es Inter espaciada con un brillo `filter: drop-shadow` animado sin fin
  (`bl-letter-glow`, caro); 40 % de la pantalla vacía entre logo y botón.
- `play/play-mobile-es-dark-01-intro.png`: líneas horizontales (efecto «cinta») por encima de la doctora, que se leen
  como un fallo de render; titular en serif de sistema; hueco grande entre escena y texto.

### 3.12 [Medio] Tema claro — Paquete B

- `play/play-mobile-en-light-17-s2-bestiary.png`: huecos «Undiscovered» como **discos negros** sobre papel; la
  tarjeta de Encargo oscura flota sobre la página clara con confeti.
- `play/play-desktop-en-light-05-s1-midway.png`: la mesa clara tiene rayas horizontales marcadas (parece *scanline*).

### 3.13 [Medio] Escritorio — Paquete B

- `play/play-desktop-es-dark-21-s2-midway.png`: dos columnas vacías a los lados de la placa; el dock reparte 3 cosas
  en 1366 px; la barra de objetivo pisa el borde del vidrio. ARTE §10 ya pedía panel a la derecha.

### 3.14 [Medio] La Chispa

- No se pudo fotografiar en juego (forzarla con `game.state.goldenTimer` coincide con el Momento «¡VIDA!», que para
  la placa); se audita por código (`src/ui/overlay.ts` `drawGolden`, `goldenCollected`).
- Qué hay: aparece con un fundido de 0,5 s sin anuncio; halo radial de 26–32 px, estrella de 4 puntas que gira
  ~7 s/vuelta, estela de puntos, chispas cada 90 ms. Al recogerla: destello, 44 + 16 partículas planas y una etiqueta
  con la recompensa. **Falta:** anticipación al aparecer, una pausa de impacto al recogerla (J1), y que la recompensa
  **vaya** a donde se suma (reloj, Esencia o Datos). Coste: `createRadialGradient` y cadenas `rgba()` nuevas en cada
  fotograma.

### 3.15 [Bajo, rápido] Textos

- «La viste **1 veces**» (`…-18-s2-species.png`), «Te faltan **1 Datos**» (`harness/h-tree-why.png`): plurales.
- «Naciendo 77 %» se queda en una línea con «%» separado; «Nadadora ce…» truncado sin necesidad en 3 columnas.

### 3.16 Rendimiento (lo que más cuesta por fotograma)

- 7 `backdrop-filter` sobre la placa animada (P5); 9 animaciones infinitas sobre `box-shadow`/`filter` (P1): el
  `rt-pulse` repinta 7 nodos a 60 Hz, `bl-letter-glow` aplica dos `drop-shadow` animados al logotipo.
- `src/ui/story/spotlight.ts`: un canvas a pantalla completa redibujado **cada fotograma** con `shadowBlur` (P4).
- `src/ui/overlay.ts`: `burst()` crea un objeto por partícula, `particles.shift()`/`splice()` (O(n)), una cadena
  `rgba(…)` nueva por partícula y fotograma, `ctx.font` + `measureText` por cada «+N» y fotograma.
- `.coach-ring` declara `will-change: transform, width, height` (P2) y ningún `.ts` lo usa: CSS muerto que borrar. Hay
  más reglas huérfanas de pantallas retiradas en 12 717 líneas de CSS: el test de B-2 las lista de paso.

### 3.17 Bugs del dueño: causa y arreglo

| Bug | Causa (vista en código o captura) | Arreglo | Paquete |
|---|---|---|---|
| La flecha del foco apunta a un sitio vacío y tapado con el Bestiario abierto | `spotlight.ts` dibuja sobre el `Rect` del objetivo sin comprobar oclusión; el paso de la historia apunta al botón del dock, que queda debajo del cajón | B-10.1 | B |
| La hoja de la Noche queda tapada y atenuada por VELA; su botón parece desactivado | la escena de VELA pone su caja y el *scrim* encima de la hoja abierta; «Aún no»/CTA en estilo fantasma | B-10.2 | B |
| «Sesiones 5/4» se desborda | `treeView.ts` `gateBar()` y `treeText.ts` muestran el valor crudo | B-10.3 | B |
| Logros y avisos deberían cerrarse al tocarlos | `toasts.ts` solo escucha el clic si hay `onClick` | B-10.4 | B |
| «¿Por qué?» repite el mismo texto debajo | la hoja de precio (`moments/price.ts`) repite la descripción del nodo y se apila | B-10.5 | B |
| La criatura inicial corre a toda velocidad al empezar | `src/main.ts`: la preincubación (`PREINCUBATE_STEPS = 1250`, hasta 40 pasos por fotograma) corre mientras la fase es `ready` **aunque el juego esté en pausa** y con la placa a la vista (la sesión 1 no tiene tarjeta de inicio que la tape). La criatura inicial se vuelve estable durante esa carrera, salta el Momento «¡VIDA! · PAUSA» y la criatura sigue cruzando la placa **debajo de la tarjeta que dice pausa** (`audit/spark-strip.png`, `audit/seed-strip2.png`); después, el ritmo ×1,5 (`SESSION_SIM_PACE`) | A-6 + §7 | A + integrador |
| Las criaturas tardan mucho en nacer | estable a los 400 pasos (`STABLE_AGE_STEPS`) a 45 pasos/s ≈ 8,9 s sin nada que mirar | A-4 (percepción) + §7 (equilibrio) | A + integrador |

Regla 9 de `CLAUDE.md`: cada uno lleva **primero un test que falle**, luego el arreglo.

---

## 4. Paquete A: PLACA Y MUNDO

**Dueño de:** `src/sim/**` (sobre todo `shaders.ts`, `webgl.ts`, `style.ts`), `src/ui/overlay.ts` y los archivos
**nuevos** de `src/ui/fx/**`. **Solo lee** (no edita): `src/ui/art/motion.ts` (curvas, `reduceMotion()`),
`src/ui/art/tokens.ts` (colores, capas), `src/game/cycleBalance.ts` (duraciones de juego). No toca
`src/ui/moments/status.ts` (las píldoras son del Paquete B) ni `src/main.ts` (integrador, §7).

**Invariantes que no se tocan** (`CLAUDE.md` regla 4): la regla de actualización, el núcleo y la función de
crecimiento, RGBA16F *ping-pong*, una lectura cada 10 pasos, placa redonda con vidrio absorbente. Todo lo de este
paquete es **render y efectos**: no cambia la simulación ni lo que ve el detector.

**Contrato con el Paquete B** (interno a `src/ui`, no es `core/`): A crea `src/ui/fx/types.ts` con

```ts
export type FxAnchorId = 'essence' | 'datos' | 'clock' | 'bestiary';
export interface FxAnchors {
  /** Rectángulo en px CSS del viewport del destino (icono del HUD), o null si no se ve. */
  rect(id: FxAnchorId): DOMRect | null;
  /** Llegó una mota (o un grupo, `n`): el HUD reacciona (B-6). */
  arrive(id: FxAnchorId, n: number): void;
}
```

y B lo implementa en `src/ui/ui.ts`. Hasta que B lo tenga, A usa un *stub* que devuelve `null` (sin vuelo).

### A-1 Bloom en cadena, también en `low`

- **Archivos:** `src/sim/webgl.ts` (`QUALITY_GLOW`, objetivos), `src/sim/shaders.ts` (`GLOW_DOWN`, `GLOW_BLUR` →
  `BLOOM_DOWN`, `BLOOM_UP`, `RENDER`).
- **Qué:** sustituir el desenfoque único de 9 tomas a media resolución por la cadena de L1: reducción con filtro de
  13 tomas (Karis en el primer paso) y ampliación con tienda 3×3 acumulando `ONE, ONE`.
- **Valores:**

  | Perfil | Mips (respecto a la rejilla) | Fuerza núcleo / halo | Hoy |
  |---|---|---|---|
  | `low` (168²) | ½, ¼, ⅛ → 84², 42², 21² | 0,45 / 0,30 | **sin brillo** |
  | `medium` (232²) | ½ … ¹⁄₁₆ (4) | 0,55 / 0,35 | 1 pasada, 0,55 |
  | `high` (232²) | ½ … ¹⁄₃₂ (5) | 0,60 / 0,40 | 2 pasadas, 0,65 |

  Radio de la tienda: 1 texel del mip de destino. Composición en `RENDER`:
  `col += glowCore(tinte) · núcleo(mip ½) · fuerzaNúcleo + glowWide(tinte) · halo(suma de la cadena) · fuerzaHalo`,
  con el tinte de especie que ya hay (`tw`, `tintBody`). Formato de los mips: `RGBA16F` si `floatField`, si no
  `RGBA8` (el brillo es suave: 8 bits bastan con el *dither* final).
- **Aceptación:** (1) con `low` forzado, una Nadadora sola muestra halo visible: a 0,6 R por fuera del contorno el
  brillo añadido es ≥ 25 % del del borde (medido en captura, recorte de 3R); (2) la placa de juego se parece a
  `art-dev.html?section=dish` a la misma escala (comparación lado a lado en el PR); (3) la cadena cuesta ≤ 0,4 ms GPU
  en un móvil medio (medir con `EXT_disjoint_timer_query_webgl2` si existe; si no, el suelo de 30 fps del e2e móvil).

### A-2 Materia con volumen y altas luces que no se queman

- **Archivo:** `src/sim/shaders.ts` (`RENDER`), valores por defecto en `src/sim/style.ts`.
- **Hombro suave de altas luces** (inspirado en L2, pero sin tocar la LUT por debajo del 78 %): sobre
  `materia + bloom`, con `m = max(r, g, b)`; si `m > k` (k = 0,78) se escala el color por `f(m)/m` con
  `f(m) = k + (1 − k)·(1 − exp(−(m − k)/(1 − k)))`. Conserva el tono, deja el núcleo blanco-vela pero con detalle.
- **Relieve en especies teñidas** (`tw > 0`): ganancia de sombra 1,4 → **1,8**, realce `1 + 0,35·shade` →
  `1 + 0,45·shade`, especular 0,35 → **0,5**. Sin teñir, igual que hoy.
- **Contorno iso** (`v = 0,13`): opacidad 0,85 → **0,55**; semiancho `0,55·dpr` → **0,45·dpr**; color del cuerpo
  ×1,0 (hoy ×1,15). Deja de parecer una pegatina recortada.
- **Aceptación:** (1) ninguna criatura «Naciendo» tiene más del 15 % de su área con los tres canales ≥ 250 (captura
  e2e, recorte); (2) en el Anillo verde se distinguen ≥ 3 bandas de luminancia del borde al centro (perfil de una línea
  en la captura); (3) `tests/e2e/sim-check.mjs` y el test de tintes de especie (`session-play.mjs`, tono ± 30°) pasan.

### A-3 Postproceso de cámara: viñeta, grano y gradación

- **Archivos:** `src/sim/shaders.ts` (`RENDER`, al final, **antes** del *dither* existente), `src/sim/style.ts`
  (nuevos campos con valor por defecto: `vignette`, `grain`, `grade`; los cosméticos pueden cambiarlos).
- **Viñeta** en espacio de pantalla, centrada en la placa: elipse de radio 1,15 × radio de la placa en pantalla,
  `smoothstep(0,55, 1,25, d)`, oscurece hasta **0,28** (oscuro) / **0,12** (claro) en las esquinas. Nunca sobre la UI
  (la UI es DOM encima: ya se cumple).
- **Grano** animado a **24 Hz** (cambia la semilla cada 41,7 ms, no cada fotograma): ruido triangular (L3) con
  amplitud según luminancia: **2,5/255** en `L < 0,1` → **0,8/255** en `L > 0,6`. En tema claro ×0,5. Con *Reducir
  movimiento*: semilla fija (grano estático).
- **Gradación**: sombras levantadas hacia índigo (+1,5/255 en B por debajo de L 0,08), altas luces ×(1,02, 1,00, 0,97)
  (la vela de VELA calienta lo brillante). El *dither* de 1 LSB de hoy se queda el último.
- **Aceptación:** capturas antes/después de la placa vacía y con 3 criaturas, oscuro y claro; sin *banding* visible
  en el agar a 100 % (recorte ampliado ×4); coste ≤ 0,15 ms (son unas pocas operaciones por píxel ya existente).

### A-4 El ciclo de vida: sembrar, incubar, nacer, morir

**Archivos:** `src/ui/overlay.ts` (llamadas), `src/ui/fx/lifecycle.ts` (nuevo: estados y tiempos),
`src/ui/fx/particles.ts` (A-10), y para la luz en la materia un *array* de pulsos en `RENDER`
(`uniform vec4 uPulse[4]` = x, y, t0, tipo; `uPulseCount`). Duraciones de juego de `cycleBalance.ts`
(`SEED_BLOOM_MS` 350, `CREATURE_ALIVE_MS` 450, `DISSOLVE_MS` 600): no se cambian aquí.

| Momento | t (ms) | Qué se ve | Curva |
|---|---|---|---|
| **Sembrar** (toque aceptado) | 0–120 | gota: núcleo blanco→acento de 7 px que cae (escala 1,6 → 1) y al tocar el agar se **aplasta** (x 1,25 / y 0,80, volumen constante, M10) y vuelve | `enter` |
| | 60–410 | onda: radio 6 → 34 px CSS, trazo 2 → 0,6 px, opacidad 0,85 → 0 | `enter` (0,05, 0,7, 0,1, 1) |
| | 60–510 | 6 motas radiales aditivas, 60–90 px/s, vida 450 ms | arrastre 2,4/s |
| | 0–500 | luz en el agar: `uPulse` aclara un disco de 1,2 R un **+12 %** que se apaga | `standard` |
| **Siembra rechazada** | 0–240 | onda naranja `danger` sin motas; la onda tiembla ±3 px, 3 ciclos | lineal en x, *ease-out* en amplitud |
| **Incubando** (forming) | continuo | arco de progreso alrededor (radio halo + 6 px, 2 px, color de especie al 70 %, pista al 12 %); el arco **sigue** el progreso real con amortiguación crítica (k = 6/s), nunca salta | — |
| | continuo | latido del halo: periodo **1,2 s → 0,45 s** según el progreso (0 → 90 %), amplitud de opacidad 0,15 → 0,35 (J6: la espera se ve avanzar) | seno |
| | ≥ 92 % | **anticipación**: el halo se contrae a 0,9 en 150 ms (M9) | `exit` |
| **Nace** («Viva», evento estable) | 0–140 | destello: disco blanco de 0,8 R, opacidad 0,9 → 0 | `standard` |
| | 0–450 | halo 1 → 1,18 → 1 (`CREATURE_ALIVE_MS`) | muelle rápido (M5) |
| | 0–700 | 16 partículas del color de la especie + 6 blancas, aditivas, 110–160 px/s | arrastre 2,4/s |
| | 0–300 | la materia «inspira»: `uPulse` tipo nacimiento, +18 % de brillo en la criatura | `standard` |
| | 0 | trauma de cámara +0,12 (A-9) | — |
| **Especie nueva** | — | lo de «nace» ×1,5 partículas, trauma +0,25, y el resto lo cuenta el Momento (B) | — |
| **Muere / se disuelve** | 0–600 | la materia se desatura hacia gris y baja un 40 % (`uPulse` tipo disolución); 10 motas grises suben 18 px con arrastre; anillo de 1 px | `exit` |

- **Aceptación:** (1) secuencia de fotogramas a 40 / 160 / 360 / 700 ms tras sembrar (como `audit/seed-strip2.png`)
  muestra gota, onda y motas; (2) un nacimiento grabado a 60 fps muestra contracción antes del destello;
  (3) con *Reducir movimiento*: sin motas ni contracción, la onda es un fundido de ≤ 80 ms (ARTE §7) y el arco de
  progreso se queda (es información, no adorno).

### A-5 La Esencia vuela al contador

- **Archivos:** `src/ui/fx/fly.ts` (nuevo: un canvas propio, a pantalla completa, `pointer-events: none`, en la capa
  `--bl-z-fx` = **25**, entre HUD 20 y hojas 30; B añade el token), `src/ui/overlay.ts` (`income()` emite).
- **Cuándo:** una mota por pago, como mucho 1 por criatura cada 0,8 s (`SESSION_INCOME_POP_INTERVAL`) y **≤ 12 en
  vuelo**; pagos más pequeños que el 0,5 % de la Esencia del HUD no vuelan (solo «+N»).
- **Cómo:** núcleo de 5 px + halo de 14 px (sprite pre-renderizado, aditivo en oscuro), color de la especie que pasa a
  `accent` en el último 30 %. Trayectoria Bézier cuadrática del centro de la criatura al centro de
  `anchors.rect('essence')`, punto de control en el punto medio desplazado en perpendicular un 25–35 % de la distancia
  (alternando lado). Duración `clamp(520, 560 + 0,12·distancia_px, 760)` ms; curva **acelerando**
  `cubic-bezier(0.55, 0, 1, 0.45)` (cae al contador). Escala 1 → 0,6; estela de 4 muestras. Varias motas de un mismo
  pago salen escalonadas **60 ms**.
- **Llegada:** `anchors.arrive('essence', n)` agrupando las llegadas de 80 ms en una sola (B-6 hace el latido).
- **El «+N»:** se queda sobre la criatura, pero a **15 px / 600** (hoy 12 px / 700 con trazo negro), relleno del color
  de la especie, trazo de 2 px solo en tema claro; sube 22 px en 700 ms `easeOutCubic`, se apaga en el último 35 %.
- **Aceptación:** captura a mitad de vuelo con ≥ 1 mota entre placa y HUD; contador sin saltos de anchura (tabular);
  con *Reducir movimiento*: no hay motas, el «+N» aparece y se funde en su sitio; en `low`: ≤ 6 en vuelo.

### A-6 Arranque tranquilo: la criatura inicial no corre

- **Causa** (§3.17): el integrador preincuba 1250 pasos a 40 pasos/fotograma mientras la fase es `ready`, también con
  el juego en pausa por un Momento, y la placa se dibuja mientras tanto (en la sesión 1 no hay tarjeta que la tape);
  luego el ritmo es ×1,5.
- **Parte A** (`shaders.ts`, `webgl.ts`): un uniforme `uMatterFade` 0..1 que multiplica la materia y su brillo (el
  agar y el vidrio se dibujan igual). Mientras se preincuba vale **0**: «el cultivo aún no está iluminado». Al acabar,
  sube a 1 en **700 ms** `enter`, con un pulso de nacimiento sin partículas en cada criatura inicial: la vela enciende
  el cultivo. Expuesto como `sim.setMatterFade(v)`.
- **Parte del integrador** (§7): poner `setMatterFade(0)` mientras `preincubate > 0` y la rampa de ritmo.
- **Aceptación:** test e2e: entre el primer fotograma de la sesión y el fin de la incubación, ningún píxel de la
  placa por encima del agar supera la luminancia del agar + 4/255; ninguna criatura recorre más de 0,5 R de su cuerpo
  en el primer segundo visible.

### A-7 La Chispa

Ver §3.14 para lo que hay hoy. Valores (`src/ui/overlay.ts` `drawGolden`, nuevo `src/ui/fx/spark.ts`):

- **Anuncio** (anticipación, M9): 300 ms antes de aparecer, 10 motas doradas convergen al punto (implosión) y un
  anillo de 40 → 8 px se cierra.
- **Cuerpo:** estrella de 4 puntas pre-renderizada (32 px) aditiva + núcleo blanco; rayos que giran **12 s/vuelta**;
  centelleo: escala 1 ↔ 1,08 en 900 ms seno; estela de 12 muestras que se apaga en 400 ms. Indicador en el borde de la
  placa si sale del encuadre (ya existe) con la misma estrella.
- **Recoger:** **congelación 60 ms** (J1: las partículas del *overlay* y la Chispa se paran, la simulación no), escala
  1,4 y destello radial dorado de 0 → 90 px en 220 ms; 24 partículas doradas + 6 blancas; trauma +0,35; las motas
  doradas vuelan al destino de la recompensa (`essence`, `clock` o `datos`) con A-5.
- **Perder:** se encoge a 0 en 400 ms `exit` dejando 6 motas que caen; sin trauma.
- **Aceptación:** secuencia 80 / 300 / 700 / 1300 ms (aparición) y 50 / 200 / 500 / 1000 ms (recogida), forzando la
  Chispa en la sesión 2 con la placa sin Momento abierto;
  con *Reducir movimiento*: sin rayos girando ni congelación, fundidos.

### A-8 Motas ambientales con profundidad

- **Archivo:** `src/ui/overlay.ts` (`drawMotes`, hoy 34 motas de una capa).
- **Valores:** 3 capas: lejana 14 motas de 1 px al 25 %, 2 px/s; media 10 de 1,5 px al 35 %, 4 px/s; cercana 4
  «bokeh» de 6–9 px al 10 % (sprite borroso), 6 px/s; deriva con ruido suave (no aleatorio por fotograma); paralaje
  ×0,3 / ×0,6 / ×1,0 con la micro-cámara (A-9). `low`: 16 en total. Tema claro: 60 % de opacidad.
- **Aceptación:** sin coste medible (sprites, sin `shadowBlur`); apagadas con *Reducir movimiento*.

### A-9 Cámara viva, sin marear

- **Dónde:** transformación CSS del contenedor de la placa (`transform`, compositor), **nunca** la cámara de la
  rejilla (los toques siguen mapeando bien porque `getBoundingClientRect` incluye la transformación).
- **Trauma** (J4): eventos suman (nace +0,12, especie nueva +0,25, Chispa +0,35, «¡Tiempo!» +0,30), baja 1,8/s;
  desplazamiento = **4 px × trauma²** × ruido suave a 18 Hz por eje (dos semillas); sin rotación. Golpe de zoom al nacer:
  escala 1 → 1,012 → 1 en 300 ms con el muelle por defecto.
- **Respiración:** la placa no respira; solo la mesa, la viñeta y las motas se desplazan ±1,5 px en 12 s (paralaje).
- **Nunca:** durante un arrastre o pulsación larga, con *Reducir movimiento*, ni más de 4 px.
- **Aceptación:** test de unidad del modelo (`src/ui/fx/shake.test.ts`): con trauma 1 el desplazamiento nunca pasa de
  4 px; tras +0,35 vuelve a 0 en ≤ 0,2 s; con *Reducir movimiento* siempre 0.

### A-10 Sistema de partículas sin basura

- **Archivo:** `src/ui/fx/particles.ts` (nuevo), usado por `overlay.ts` y `fly.ts`.
- **Valores:** *pool* de capacidad fija en estructura de *arrays* (`Float32Array` para x, y, vx, vy, vida, t0,
  tamaño; `Uint8Array` para sprite y color): **384** (`high`), **256** (`medium`), **128** (`low`); al llenarse se
  recicla la más vieja (índice circular, sin `shift`/`splice`). Sprites pre-renderizados una vez por color en un atlas
  (disco con degradado radial 32 px, estrella de 4 puntas 32 px, gota 24 px) y dibujados con `drawImage` a coordenadas
  enteras; `globalCompositeOperation = 'lighter'` en oscuro, `source-over` en claro; opacidad con `globalAlpha`, no
  con cadenas `rgba()` nuevas; **cero `shadowBlur`**; el texto de los «+N» se cachea (`measureText` solo cuando cambia
  la cadena).
- **Aceptación:** test de unidad: 10 000 emisiones no crecen la memoria del *pool*; perfil de 10 s con 3 nacimientos y
  una Chispa: 0 asignaciones en `draw()` (pestaña *Memory → Allocation sampling*, o contador en desarrollo).

### A-11 El vidrio

- **Archivo:** `src/sim/shaders.ts` (`glassDish`).
- **Valores:** Fresnel en el borde: +10 % de brillo en los últimos 6 px del vidrio, mayor en el lado de la luz
  (arriba a la izquierda, como `LIGHT`); en `high`, un destello especular que recorre 15° de la media luna superior cada
  20 s (estático con *Reducir movimiento*). Mesa clara (§3.12): las vetas del acero bajan de contraste un 60 % (hoy se
  leen como *scanlines*).
- **Aceptación:** capturas oscuro/claro de la placa vacía; en claro, las rayas no se ven a 100 %.

### A-12 Fin de sesión sobre la placa

- «¡Tiempo!»: la placa se congela con una desaturación de 0 → 35 % y oscurecimiento de 0 → 20 % en 300 ms (`uniform`
  `uFreeze`), trauma +0,30; el sello es de B (B-7).
- **Aceptación:** fotogramas a 0 / 150 / 400 ms del fin de sesión: la placa pasa a gris oscuro bajo el sello y vuelve
  a color al cerrar el resumen.

---

## 5. Paquete B: INTERFAZ Y MOVIMIENTO

**Dueño de:** `src/ui/**` **salvo** `src/ui/overlay.ts` y `src/ui/fx/**`; incluye `src/ui/art/**` (tokens, `art.css`,
`motion.ts`, `specimen.ts`), `src/ui/portrait.ts`, `src/ui/moments/status.ts` (las píldoras de la placa) y todos los
`.css` de `src/ui`. **Solo lee:** `src/ui/fx/types.ts` (implementa `FxAnchors`). Textos nuevos siempre `Text { es, en }`.

### B-1 Retratos nítidos en todas partes

- **Archivos:** `src/ui/portrait.ts`, `src/ui/art/specimen.ts`, usos en `panel-bestiary.ts`, `modals.ts`,
  `session/summary.ts`, `session/start.ts`, `tree/treeView.ts`, `splash.ts`.
- **Qué:** `portraitURL()` y `renderPattern()` pasan a dibujar con `renderSpecimen()` (B-spline cúbica, *bloom*) con
  las paradas teñidas de la especie (`tintRow`, igual que hoy). Tamaño de dibujo = **tamaño CSS × min(devicePixelRatio,
  3)**, redondeado a múltiplo de 8: Bestiario 72 → 216 px, ficha 130 → 384 (tope), resumen 60 → 184, inicio 52 → 160,
  Árbol 44 → 136, portada 300 → 768. *Bloom* 0,55 en oscuro; en claro, la paleta `MATTER_ART.paper` sin *bloom*
  (ARTE §8.1). Caché por (patrón, paleta, tono, px).
- **Sin bloquear:** como mucho 2 retratos nuevos por fotograma (`requestIdleCallback` con respaldo `setTimeout(0)`);
  mientras, un marcador: degradado radial del color de la especie al 35 % (nunca la mancha gris de hoy).
- **El «?» de especie por descubrir** (`play/play-mobile-es-dark-08-s1-node-worldCold.png`, `…-10-s2-start-card.png`):
  un anillo discontinuo con signo de
  interrogación dibujado (icono de `icons.ts`), no una mancha gris borrosa.
- **Aceptación:** recorte ampliado ×2 de la ficha y del Bestiario sin escalones (comparar con `zoom-portrait.png`);
  ≤ 8 ms por retrato de 384 px en escritorio, ≤ 20 ms en móvil medio (medir); test de unidad: la caché devuelve el
  mismo canvas para la misma clave.

### B-2 Un solo sistema: tokens y un test que lo guarda

**Archivos:** `src/ui/art/tokens.ts` (fuente), `art.css` (generado), todos los `.css` de `src/ui`, test nuevo
`src/ui/art/css-lint.test.ts`.

**Tipografía** (ARTE §4, cerrada a 8 tallas; T1):

| Token | px / interlínea | Peso | Antes (tallas que absorbe) | Uso |
|---|---|---|---|---|
| `--bl-fs-caption` | 13 / 18 | 600 | 10,5 · 11 · 11,5 · 12 · 12,5 | etiquetas de chip, eyebrow en mayúsculas (+0,06 em) |
| `--bl-fs-small` | 14 / 20 | 500 | 13 · 13,5 · 14 · 14,5 | texto secundario |
| `--bl-fs-body` | 16 / 24 | 500 | 15 · 16 | texto y diálogo (17 en el globo de VELA) |
| `--bl-fs-lead` | 18 / 26 | 600 | 17 · 17,5 · 18 | líneas de tarjeta, botones grandes |
| `--bl-fs-title` | 22 / 28 | 700 | 20 · 21 | títulos de hoja (Inter) |
| `--bl-fs-headline` | 28 / 34 | 700 | 25 · 26 | títulos de pantalla (**Fraunces**, `opsz` auto, `SOFT` 100, −0,01 em) |
| `--bl-fs-display` | 36 / 40 | 700 | 34 | carteles, «¡Tiempo!» (Fraunces) |
| `--bl-fs-hero` | 48 / 52 | 800 | — | cifra grande del HUD y total del resumen (Inter, `tabular-nums`) |

Regla: todo título de pantalla y de hoja de Momento en Fraunces (hoy unos sí y otros no: «Bestiario» en la lista y en
la ficha salen distintos); toda cifra en Inter `tabular-nums`.

**Radios** (5): `--bl-r-sm` 8 (chips, insignias), `--bl-r-md` 12 (botones, fichas dentro de tarjetas), `--bl-r-lg` 16
(tarjetas, botón principal), `--bl-r-xl` 24 (bordes de arriba de las hojas, tarjetas de Momento), `--bl-r-pill` 999.
Los 14 px → 12; 18, 20, 22 → 16 (o 24 si es una hoja); 3, 5, 6, 7 → 8; 9, 10, 11 → 12. **Radio anidado = radio de
fuera − relleno** (una ficha de 16 con 12 de relleno lleva dentro radios de 4–8, nunca 14).

**Espaciado** (rejilla de 4): relleno de tarjeta 16 en móvil, 20 en escritorio; entre secciones 24; entre elementos
relacionados 8 / 12; márgenes de página 16 (ARTE §10).

**Capas:** `LAYER` gana `fx: 25` (`--bl-z-fx`, entre HUD 20 y hojas 30) para el vuelo de motas de A-5.

**Movimiento** (M1–M8): se mantienen los nombres de ARTE §7 y se completan:

| Token | Valor | Para |
|---|---|---|
| `--bl-t-tap` | 90 ms, `standard` | apoyar el dedo (escala) |
| `--bl-t-quick` | 140 ms | color, opacidad de un estado |
| `--bl-t-base` | 200 ms | aparecer/desaparecer pequeño, chips |
| `--bl-t-exit` | 160 ms, `exit` | **toda salida** (M1: más corta que la entrada) |
| `--bl-t-sheet` | 300 ms entrar (`enter`) / 200 ms salir (`exit`) | hojas, cajón, paneles (hoy 260 / 180) |
| `--bl-t-card` | 320 ms | valor que cambia (pop) |
| `--bl-t-story` | 480 ms | VELA, carteles |
| `--bl-t-celebrate` | 700 ms | compra, Datos, especie nueva |
| `--bl-stagger` | 40 ms por elemento, **máx. 6** elementos (240 ms) | listas, filas del resumen, contenido de hoja |
| `--bl-spring-fast` | `linear(0, 0.103, 0.309, 0.546, 0.758, 0.914, 1.02, 1.074, 1.093, 1.087, 1.07, 1.048, 1.027, 1.011, 1, 0.994, 0.992, 0.992, 0.993, 0.995, 0.997, 0.999, 1, 1, 1)` en **400 ms** (rigidez 800, amortiguación 0,6: sobrepasa 9 %) | soltar un botón, latidos, pops |
| `--bl-spring-default` | `linear(0, 0.066, 0.21, 0.374, 0.532, 0.669, 0.781, 0.864, 0.924, 0.965, 0.99, 1.004, 1.012, 1.014, 1.014, 1.012, 1.01, 1.008, 1.005, 1.004, 1.002, 1.001, 1.001, 1, 1)` en **480 ms** (380 / 0,8: sobrepasa 1,4 %) | tarjetas, hojas que se asientan, VELA |
| `--bl-spring-slow` | la misma forma en **650 ms** (200 / 0,8) | celebraciones grandes, la Noche |

Curvas: `standard` (0,2, 0, 0, 1), `enter` (0,05, 0,7, 0,1, 1), `exit` (0,3, 0, 0,8, 0,15), `pop` (0,34, 1,56, 0,64, 1)
— ya en `tokens.ts`. Los `linear()` se generaron simulando el muelle (masa 1); respaldo para navegadores sin `linear()`
(Safari < 17.2): `pop` para *fast*, `enter` para *default* y *slow* (`@supports (animation-timing-function:
linear(0, 1))`). `motion.ts` exporta los tres muelles también como funciones JS (para canvas y WAAPI).

**El test** `css-lint.test.ts` lee los `.css` de `src/ui` y falla si encuentra: `font-size` fuera de `var(--bl-fs-*)`
(o `em`/`%`); `border-radius` fuera de {8, 12, 16, 24, 999 px, 50 %, `var(--bl-r-*)`}; duraciones sueltas fuera de
`var(--bl-t-*)`/muelles (con una lista de excepciones con comentario); `box-shadow` fuera de `var(--bl-elev-*)` /
`var(--bl-glow-*)` / `none`; `@keyframes` con `animation-iteration-count: infinite` que toquen algo que no sea
`transform` u `opacity`; `backdrop-filter` en selectores que viven sobre la placa. Entra en modo informe (lista) y
pasa a obligatorio cuando el contador llegue a 0.

- **Aceptación:** tabla de §1 rehecha con el script del test: 8 tallas / 5 radios / 4 elevaciones + 3 brillos /
  9 duraciones + 3 muelles, y 0 animaciones infinitas sobre propiedades de pintura.

### B-3 Profundidad sin cajas dentro de cajas

**Elevación** (D1, D2; una luz arriba a la izquierda, la misma que `LIGHT` en el shader; color de sombra con el tono
del fondo, 215°):

| Token | Superficie (oscuro) | Sombra (oscuro) | Para |
|---|---|---|---|
| `--bl-elev-0` | `bg` `#0b0e12` | ninguna | página, mesa |
| `--bl-elev-1` | `surface` `#141a21` | `inset 0 1px 0 rgb(207 232 245 / .05), 0 1px 2px hsl(215 50% 2% / .5), 0 2px 6px hsl(215 50% 2% / .3)` | tarjetas sobre la página |
| `--bl-elev-2` | `surface2` `#1b232c` | `inset 0 1px 0 rgb(207 232 245 / .06), 0 2px 4px hsl(215 50% 2% / .35), 0 8px 16px hsl(215 50% 2% / .35), 0 16px 32px hsl(215 50% 2% / .3)` | hojas, cajón, VELA, avisos |
| `--bl-elev-3` | `surface2` + tinte 13 % | lo de 2 + `0 32px 64px hsl(215 50% 2% / .35)` | tarjetas de Momento, modales |
| `--bl-glow-accent` / `-candle` / `-gold` | — | `0 0 0 1px rgb(c / .35), 0 0 24px rgb(c / .22)` | foco, Chispa, VELA |

`SHADOW.sm/md/lg` de `tokens.ts` pasan a llamarse `elev-1/2/3` (con alias `--bl-shadow-*` mientras dure la migración).
En claro, las mismas capas con `hsl(215 30% 30% / .08–.14)`. Las superficies oscuras ya siguen la fórmula de D2
(5,1 % → `#15191e`, 8,2 % → `#1b2025`, 13,5 % → `#262c31`): se conservan las de `tokens.ts`, que son las mismas con
un poco más de azul.

**Reglas de anidado** (§3.4): como mucho **dos** niveles con borde. Dentro de una tarjeta, los grupos se separan
con 12–16 px de espacio o un cambio de superficie (`elev-1` → `surface2` sin borde), y las filas de una lista con un
divisor de 1 px al 8 %. Los chips de cifra del resumen («51 Esencia ganada», «25 = 1 Dato») pierden el borde y van
sobre `surface2`.

- **Momento** (`…-16-moment-behavior.still.png`): las 4 cajas con borde pasan a 3 filas sin caja (icono 32 px a la
  izquierda, eyebrow + texto), separadas por divisores; la ilustración queda como único bloque con fondo.
- **Hoja de nodo** (`…-08-s1-node-worldCold.png`): «Ahora → Con un nivel más» se queda como único par de cajas; «+1
  especie» y la barra de Datos van sin caja.
- **Aceptación:** capturas de Momento, hoja de nodo y resumen con ≤ 2 niveles de borde (revisión visual en el PR).

### B-4 Pulsar se siente (un solo gesto)

- **Archivos:** `src/ui/art/motion.ts` (`pressable`), `src/ui/ui.ts` (raíz), CSS de botones.
- **Qué:** `motion.ts` gana `installPressFeedback(root)`: **delegación** en la raíz (`pointerdown` en `.bl`,
  `closest('button, [role=button], .rt-node, .ss-world, .sp, .dock-btn')`), no un *listener* por elemento (el
  `pressable(el)` de hoy queda para casos sueltos). Se quitan las 35 reglas `:active` con escalas distintas.
- **Valores:** al apoyar: escala **0,96** (botones, nodos) / **0,98** (tarjetas y filas anchas) en 90 ms `standard`, y
  una capa `::after` blanca que pasa de opacidad 0 a 0,08 (en claro, negra a 0,06). Al soltar o cancelar: vuelta con
  `--bl-spring-fast` (400 ms). Solo `transform` y `opacity`. Si el puntero se aleja > 10 px, se cancela.
- **Desactivado ≠ «aún no»:** desactivado = sin pulsado, opacidad 0,5, cursor normal. «Aún no» (la Noche, un nodo sin
  Datos) **no** es desactivado: es un botón secundario con borde `line2`, texto `text2` y la razón («Faltan 3
  sesiones»), pulsable para explicar.
- **Háptica** (opcional, ajuste «Vibración», apagado por defecto en iOS porque no existe la API): `navigator.vibrate(8)`
  al sembrar, comprar y recoger la Chispa.
- **Aceptación:** test e2e: un `pointerdown` en «Comprar», en un nodo y en una tarjeta de Mundo produce
  `getAnimations()` con `transform` en ≤ 1 fotograma; con *Reducir movimiento*, solo la capa de opacidad.

### B-5 Hojas, tarjetas y escalonado

| Elemento | Entrada | Salida |
|---|---|---|
| **Hoja inferior** (nodo, precio, ajustes, cajón) | `translateY(100%) → 0` en 300 ms `enter`; *scrim* 0 → 0,5 en 200 ms `standard` | `0 → translateY(100%)` en 200 ms `exit`; *scrim* 160 ms |
| **Contenido de la hoja** | tras 80 ms, cada bloque pasa de `translateY(12px)` y opacidad 0 a `translateY(0)` y opacidad 1 en 240 ms `enter`, escalonado **40 ms**, máx. 6 bloques (el 7.º y siguientes entran con el 6.º) | todo junto con la hoja |
| **Tarjeta de Momento** | escala 0,92 → 1 y `translateY(24px) → 0` con `--bl-spring-default`; opacidad 0 → 1 en 160 ms; luego ilustración (+80 ms), texto de VELA (+160 ms), botón (+240 ms) | escala 0,96 + opacidad → 0 en 160 ms `exit` |
| **Tarjeta de inicio / resumen** | sube 32 px con `--bl-spring-default`; secciones escalonadas 60 ms | 200 ms `exit` hacia abajo |
| **Modal** (logro, especie) | escala 0,94 → 1 `--bl-spring-default` + opacidad 160 ms | 160 ms `exit` |
| **Cajón lateral** (escritorio) | `translateX(−100%) → 0` 300 ms `enter` | 200 ms `exit` |

- Nunca se anima `height`, `width`, `top`, `left`, `flex-basis` (hoy: `transition: width .8s`, `flex-basis 380ms`). Para un acordeón, fundido del contenido en 150 ms sin animar la altura.
- Con *Reducir movimiento*: todas las entradas/salidas son un fundido de 80 ms (ARTE §7).
- **Aceptación:** grabación a 60 fps de abrir/cerrar la hoja de nodo: ninguna caída de fotograma en Chrome DevTools
  (*Rendering → Frame rendering stats*) en un perfil móvil con CPU ×4; `getAnimations()` solo con `transform`/`opacity`.

### B-6 Números que cuentan y reciben

- **HUD de Esencia** (`ui.ts tweenEssence`): se conserva el suavizado exponencial (k = 9/s). Nuevo `arrive('essence',
  n)` (contrato A-5): icono de gota escala 1 → 1,18 → 1 con `--bl-spring-fast`, el número sube un 8 % de brillo con
  una capa de opacidad (no `filter`) durante 200 ms; las llegadas en 80 ms se agrupan. El realce actual con
  `void el.offsetWidth` se sustituye por `el.animate()` (P3).
- **Datos del resumen**: cuenta de 0 al total en **900 ms** `easeOutCubic` (`countUp`), luego *pop* 1 → 1,08 → 1 en
  260 ms y un barrido de luz aurora (gradiente que cruza con `translateX`, 600 ms) sobre la caja de Datos.
- **Datos en el Árbol al comprar**: cuenta hacia abajo en 600 ms (`tweenDatos` existe: alinear duración y curva).
- **Cifras nuevas** («+3 s», «+12 Datos»): entran con `translateY(6px) → 0` + opacidad 200 ms y un *pop* 320 ms.
- Todas con `tabular-nums` (N1).
- **Aceptación:** captura a mitad de cuenta sin cambio de anchura de la caja; con *Reducir movimiento* las cifras
  saltan al valor final (ya en `countUp`).

### B-7 HUD

- **Reloj en los últimos segundos** (`session/session.css`, `@keyframes ss-tick`): escala **1,12** (hoy 1,35) con
  `transform-origin: left center`; el color de aviso y el anillo bastan. **Aceptación:** captura de los últimos 5 s sin
  solape cifra/dial (comparar con `zoom-clock-warn.png`).
- **«+5 s especie»** (`harness/h-hud-run.png`): sale del lugar del evento, viaja al reloj en 450 ms `enter` y se funde
  allí; nunca se coloca sobre la previsión de Datos (hueco propio bajo el reloj).
- **Tasa al empezar**: mientras el reloj no corre, el HUD muestra la tasa que se cobrará («+2,0/s al empezar», `text3`)
  y la píldora no dice «+N/s» (B-8): nunca dos cifras contradictorias.
- **Sello «¡Tiempo!»** (`hud.ts timesUp`): Fraunces 36/700 (hoy cae en serif de sistema), entra con anticipación: escala
  1,6 → 0,94 → 1 (`--bl-spring-fast`) y rotación −8°, opacidad 0 → 1 en 120 ms; una onda de 0 → 160 px detrás; A añade
  la congelación de la placa (A-12).
- **«¡Último minuto!»**: desliza desde arriba 300 ms `enter`, se queda 1,6 s, sale 200 ms `exit`; sin bucles.
- **Aceptación:** `tree-dev.html?view=hud&t=154&total=210&menu=0&ext=5` sin solape del «+5 s» con la previsión;
  `…&phase=over&stamp=1` con el sello en Fraunces; captura del inicio de la sesión 1 sin «+0/s» frente a una píldora con
  tasa.

### B-8 Etiquetas de la placa calladas

- **Archivo:** `src/ui/moments/status.ts` (dibujo); A dibuja el arco de incubación (A-4).
- **Valores:** por defecto **ninguna píldora permanente**: cada criatura lleva solo un punto de estado de 6 px sobre su
  borde superior (verde viva, gris disolviéndose, naranja accidente). La píldora completa aparece: (1) en la criatura
  tocada; (2) 2,5 s tras un evento (nace, especie nueva, explota); (3) en la Era 1 si el ajuste «etiquetas en todas»
  está activo, en versión compacta. Como mucho **2** visibles a la vez (hoy 6).
- **Píldora compacta:** 22 px de alto, sin borde, fondo `surface` al 72 %, `--bl-r-pill`, texto 13/600, solo
  «+2,3/s» y el glifo de comportamiento; «Naciendo 77 %» desaparece (lo dice el arco).
- **Aceptación:** captura con 4 criaturas: ≤ 2 píldoras, ninguna tapa más del 15 % del cuerpo de una criatura.

### B-9 El Árbol

- **Estados de nodo** (`tree/tree.css`, `treeView.ts`):

  | Estado | Borde | Fondo | Movimiento |
  |---|---|---|---|
  | comprado | 2 px color de ruta | color de ruta al 18 % | ninguno |
  | disponible, sin Datos | 1,5 px color de ruta al 45 % | `surface` | ninguno |
  | **se puede comprar** | 2 px color de ruta | `surface2` | insignia de coste en `good`; sin halo |
  | **recomendado** (uno solo: el que señala VELA o el más barato) | 2 px color de ruta | `surface2` | anillo `::after` que escala 1 → 1,35 y se apaga 0,6 → 0 en 1,6 s, en bucle (solo `transform`/`opacity`) |
  | misterio | 1,5 px discontinuo `line2` | transparente | ninguno |

  Se elimina `rt-pulse` (`box-shadow` infinito) de todos los nodos.
- **La mano**: icono dibujado `pointer` en `icons.ts` (rejilla 24, trazo 1,75, ADR-024) en vez del emoji 👉; gesto de
  toque cada 1,8 s: `translate(−4px, −4px) scale(.9)` a 0 ms, vuelta a 120 ms, reposo a 240 ms.
- **Compra que se ve** (§3.8): al pulsar «Comprar» → la hoja baja a modo «asomada» (`translateY` hasta dejar 96 px
  visibles, 260 ms `exit`) → `buyBurst` en el nodo, **visible** (700 ms) + cuenta atrás de Datos (600 ms) + la línea
  hacia el siguiente «?» crece (400 ms, `scaleX` o `stroke-dashoffset` en un SVG pequeño) → a los 900 ms la hoja vuelve
  (300 ms `enter`) con el nivel nuevo y *pop* de la cifra. Con *Reducir movimiento*: sin bajar la hoja, fundido de 120 ms
  del nivel.
- **«¿Por qué cuesta esto?»**: ver B-10.5.
- **Barra de título**: «Árbol · Noche 2 · 10 listas» en una línea, «¡La noche puede avanzar!» como chip aparte con
  icono de luna; nunca «…».
- **Zonas reservadas**: la cámara deja libre la altura de la barra de título + 12 px arriba y la de los controles de
  zoom a la derecha; la pista inferior se coloca a la izquierda de los controles y se esconde tras el primer toque.
- **Aceptación:** capturas `tree-dev.html?view=tree&preset=mid` y `&preset=new` con un único nodo pulsando; la compra
  grabada muestra el estallido sin hoja encima.

### B-10 Los bugs del dueño (cada uno con su test primero)

1. **Foco que señala un sitio tapado** (`src/ui/story/spotlight.ts`, `storyUI.ts`): antes de dibujar, comprobar
   oclusión con `document.elementsFromPoint` en el centro y las 4 esquinas (inset 4 px) del objetivo; si el elemento
   de encima no es el objetivo ni un descendiente, **re-apuntar** a su equivalente visible (con el cajón del Bestiario
   abierto: la primera ficha de especie del cajón) o, si no hay, ocultar flecha y anillo y dejar solo el texto. El
   anillo sigue al objetivo en cada fotograma (no con retraso: §3.7, `audit/spark-strip.png`), nunca se dibuja sobre el
   HUD ni sobre el título de una hoja (recorte con el rectángulo de la capa activa). Test e2e: abrir el cajón durante
   `t_bestiary` → el anillo no intersecta `.bl-dock` ni queda fuera del cajón.
2. **Hoja de la Noche tapada por VELA** (`storyUI.ts`, `tree/treeView.ts`): si hay una hoja abierta, VELA entra en
   modo **acoplado**: su globo se coloca **encima** de la hoja (por debajo del HUD), sin *scrim* y sin atenuar la hoja;
   el botón principal de la hoja conserva su color. «Empezar la Noche N» es primario (acento, icono de luna); «Aún no»
   pasa a secundario informativo (B-4). Test: con la hoja de la Noche lista y una escena de VELA, el CTA es visible,
   no tiene opacidad < 1 y `elementFromPoint` en su centro es el propio botón.
3. **«Sesiones 5/4»** (`tree/treeView.ts gateBar`, `game/treeText.ts` es de `game/`: el texto lo cambia el integrador):
   mostrar `min(valor, necesario)/necesario` y un ✓ cuando se alcanza («Sesiones 4/4 ✓», «Especies 2/2 ✓»); la barra
   se recorta al 100 %. Test de unidad sobre el formateo con 5/4 y 6/2.
4. **Avisos y logros que se cierran al tocar** (`toasts.ts`, `ui.ts`): cualquier aviso se cierra con un toque
   (`pointerup` sin arrastre) o deslizando hacia arriba > 24 px; si el aviso tiene acción (logro → ficha), la acción va
   en un botón «Ver» de 48 px dentro del aviso, y tocar el resto lo cierra. Entrada `translateY(−12px) → 0` + opacidad
   en 220 ms `enter`; salida 160 ms `exit` (hoy 190 ms). Línea fina de tiempo restante (`scaleX` 1 → 0, lineal) para que
   se vea que se irá solo. Test: tocar un aviso sin acción lo quita en ≤ 200 ms.
5. **«¿Por qué?» repite el texto** (`moments/price.ts`, `tree/treeView.ts`, `story/encargoUI.ts`): la explicación deja
   de ser una segunda hoja apilada y pasa a desplegarse **dentro** de la hoja del nodo (fundido 150 ms), con lo que la
   hoja no dice: la fórmula en fichas (precio de salida × multiplicador = coste) y los 3 siguientes niveles. La hoja
   del nodo deja de repetir esa descripción. Test: el texto del despliegue no contiene ninguna frase del cuerpo de la
   hoja (comparación de cadenas).

(Los dos bugs de la placa —criatura inicial veloz e incubación larga— son A-6, A-4 y §7.)

### B-11 Resumen de sesión

- **Coreografía** (`session/summary.ts`, `session.css`): las filas del recuento están **desde el fotograma 0** al 35 %
  de opacidad (se lee la estructura, nunca una caja vacía, §3.9); cada fila «se enciende» (opacidad 1 + su cifra cuenta
  en 300 ms) con **120 ms** de escalonado; al final, el total cuenta 900 ms y hace *pop* (B-6). Tocar en cualquier
  momento salta al final. Total del recuento ≤ 1,8 s.
- **Pie fijo**: degradado de 32 px del color de la superficie a transparente sobre el contenido que pasa por debajo;
  el contenido tiene `padding-bottom` = alto del pie + 16.
- **Escritorio**: `max-height: calc(100dvh − 32px)` con desplazamiento interno; el título nunca se corta (§3.7).
- **Aceptación:** fotogramas a 0 / 250 / 600 / 1200 / 2400 ms (como `audit/mobile-dark-28…32-summary-*.png`) sin
  ningún fotograma con la caja vacía.

### B-12 VELA y el diálogo

- **Entrada** (`story/storyUI.ts`, `story.css`): anticipación: VELA baja 4 px en 80 ms y sube a su sitio con
  `--bl-spring-fast`; el globo crece desde la cola (`transform-origin` en la cola) de escala 0,9 → 1 con
  `--bl-spring-default`, opacidad 0 → 1 en 140 ms.
- **Texto:** se mantiene la velocidad de `CPS` (VELA 40 caracteres/s) y se añaden pausas de 120 ms tras «, . ! ?» si
  no las hay; un toque completa la línea, otro avanza. La altura del globo se fija con el texto completo desde el principio: nunca crece mientras escribe
  (las tarjetas de Momento ya reservan el alto; el globo de VELA debe hacer lo mismo).
- **Reposo:** balanceo de 2 px en 3,2 s (seno, `transform`), parpadeo cada 3–6 s si el dibujo lo permite; llama de la
  vela con un parpadeo de opacidad 0,85–1 a 6–9 Hz irregular (barato: `opacity`).
- **Salida:** 160 ms `exit` hacia abajo 8 px.
- **Acoplado:** ver B-10.2.
- **Aceptación:** grabación de la entrada de `t_intro` con la caída de 4 px antes de subir; el globo no cambia de alto
  mientras se escribe (comparar su `getBoundingClientRect().height` al principio y al final de la línea).

### B-13 Portada e intro

- **Portada** (`splash.ts`, `ui.css`): una sola versión (la de la esquina, 13 px `text3`); criatura con `renderSpecimen`
  a DPR (B-1); logotipo en Fraunces 700 `SOFT` 100 con tracking 0,08 em (hoy Inter espaciada), con **un** barrido de
  luz al cargar (máscara con gradiente que cruza con `translateX`, 1,2 s) en vez de `bl-letter-glow` infinito con
  `filter`; botón «Toca para empezar» con un anillo `::after` que respira (escala 1 → 1,06, opacidad 0,5 → 0, 2,4 s);
  composición: criatura al 38 % de la altura, logo al 62 %, botón a 88 % (hoy hay un 40 % de pantalla vacía en medio).
- **Intro** (`intro/*`): las líneas de «cinta» solo en el marco del magnetófono, no sobre la doctora; titular en
  Fraunces (con §7 cargado); el texto sube junto a la escena (hueco máximo 24 px).
- **Aceptación:** capturas de portada (móvil y escritorio) con una sola versión y la criatura sin escalones; en
  *Performance*, la portada en reposo no repinta (0 animaciones sobre `filter`).

### B-14 Tema claro

- Huecos por descubrir del Bestiario: disco `surface3` (`#e8eef4`) con anillo discontinuo `line2` y «?» en `text3`
  (hoy discos negros).
- Tarjeta de Encargo cumplido: versión clara (`surface` blanco, borde `candle` 1,5 px, sombra `elev-2`) en vez de la
  oscura flotando sobre papel.
- Sombras claras de B-3; el confeti en claro con `source-over` y colores profundos AA (ARTE §3).
- **Aceptación:** captura del Bestiario y del Encargo cumplido en claro (`play/play-mobile-en-light-17-s2-bestiary.png`
  como «antes») sin superficies negras ni tarjetas oscuras sobre papel.

### B-15 Escritorio

- Placa a la izquierda centrada en su columna, **panel a la derecha** (360 px) con Bestiario y objetivo (ARTE §10); el
  dock baja a una barra compacta de 64 px centrada; la barra de objetivo nunca pisa el vidrio (se coloca en el panel).
- **Aceptación:** captura 1366 × 768 sin columnas vacías mayores de 120 px a cada lado.

### B-16 Textos

- «La viste 1 **vez** / N veces», «Te falta 1 **Dato** / Te faltan N Datos»: función de plural en `format.ts` con test.
- Nombres en el Bestiario: dos líneas antes de truncar («Nadadora celeste» cabe en 2 × 104 px).
- **Aceptación:** test de unidad del plural (1 y N, `es` y `en`); captura del Bestiario sin «…» en los nombres del
  catálogo.

### B-17 El foco (spotlight), barato

- `spotlight.ts`: el recorte con `shadowBlur` a pantalla completa en cada fotograma (P4) se dibuja **una vez por
  cambio de objetivo** en un canvas fuera de pantalla; por fotograma solo se componen ese canvas (con
  `transform` si el objetivo se mueve) y los anillos (sprites). Se borra el `.coach-ring` sin uso.
- **Aceptación:** perfil de 5 s con el foco activo: el canvas del foco no aparece como «Paint» de pantalla completa en
  cada fotograma; 0 llamadas a `shadowBlur` por fotograma.

---

## 6. Presupuesto de rendimiento

Objetivo: **60 fps** en un móvil medio (clase Adreno 610 / Mali-G57, 2022), suelo **30 fps** en el e2e móvil con el
time-lapse de sesión (`CLAUDE.md`, *Hard gates*). Presupuesto de un fotograma: 16,7 ms, de los que **≤ 10 ms** son
nuestros (P1). Reparto:

| Parte | Presupuesto | Dueño |
|---|---|---|
| Pasos de simulación (≤ 2 por fotograma a ×1,5) | ≤ 3,5 ms GPU | sin cambios |
| Render de la placa (`RENDER` + *bloom* + postproceso) | ≤ 3,0 ms GPU a DPR ≤ 2 (*bloom* ≤ 0,4, postproceso ≤ 0,15) | A |
| *Overlay* 2D + vuelo de motas | ≤ 1,5 ms CPU | A |
| UI (JS de estilo, animaciones, HUD) | ≤ 1,5 ms CPU por fotograma; 0 *layout* forzado | B |
| Margen | ≥ 1 ms | — |

### 6.1 Paquete A

- **GPU:** ninguna pasada nueva a resolución de pantalla salvo la de `RENDER` que ya existe (viñeta, grano y gradación
  van dentro); el *bloom* trabaja a resolución de **rejilla** (≤ 116² en su mip más grande), no de pantalla.
- **Sin lecturas nuevas:** ni un `readPixels` más (sigue una instantánea cada 10 pasos); los pulsos (`uPulse`) y la
  oclusión de la incubación son uniformes.
- **CPU, 0 asignaciones por fotograma** en `overlay.ts` y `src/ui/fx/**`: *pools* de capacidad fija, sin
  `push/shift/splice` en caliente, sin cadenas `rgba()` ni `createRadialGradient` por fotograma (sprites pre-hechos),
  `ctx.font` y `measureText` solo cuando cambia el texto, coordenadas enteras, **0 `shadowBlur`** (P4).
- **Por perfil:**

  | | `low` | `medium` | `high` |
  |---|---|---|---|
  | Mips de *bloom* | 3 | 4 | 5 |
  | Partículas (capacidad) | 128 | 256 | 384 |
  | Motas en vuelo (A-5) | 6 | 12 | 12 |
  | Motas ambientales | 16 | 28 | 28 |
  | Grano | estático cada 83 ms (12 Hz) | 24 Hz | 24 Hz |
  | Destello del vidrio (A-11) | no | no | sí |

- **Cuando cae el ritmo:** si el tiempo de fotograma medido supera 22 ms (< 45 fps) durante 2 s seguidos, se baja un
  perfil **de efectos** (no de simulación: la calidad de la rejilla la decide `recommendQuality` en `perf.ts`) y se
  anota en el registro de desarrollo; el integrador expone la medida a `webgl.ts`.
- **Verificación:** `npm run e2e` (suelo 30 fps), `node tests/e2e/sim-check.mjs --quick` (sin regresiones del shader),
  un perfil de *Performance* de 10 s con 4 criaturas, una Chispa y 3 nacimientos adjunto al PR (GPU y *Allocation
  sampling*).

### 6.2 Paquete B

- **Solo `transform` y `opacity`** en cualquier animación (P1, P2). Excepciones permitidas, en la lista del test:
  transiciones de `color`/`background-color`/`border-color` ≤ 150 ms en elementos pequeños por un cambio de estado (no
  en bucle).
- **0 animaciones infinitas** sobre `box-shadow`, `filter`, `text-shadow`, `background-position` (hoy 9 + `bl-shimmer`);
  **≤ 3 bucles a la vez en pantalla** (p. ej., nodo recomendado, VELA en reposo, punto de «nuevo»).
- **0 `backdrop-filter`** en lo que vive sobre la placa (`.fab`, `.mode-pill`, `.toast`, `.ccard`, `.buff`, objetivo,
  banner): superficie `elev-2` al 88 % de opacidad + borde superior claro (B-3), que en una escena oscura se lee igual de
  «vidrio» (P5). Se permite en hojas y modales que tapan una placa en pausa.
- **0 *layout* forzado:** fuera `void el.offsetWidth` para reiniciar animaciones (usar `el.animate()`); lecturas de
  `getBoundingClientRect` agrupadas al principio del fotograma y escrituras después (P3); el foco (B-10.1, B-17) lee
  rectángulos una vez por fotograma como mucho.
- **`will-change`** solo durante la animación (se pone al empezar y se quita en `finish`), nunca en reposo; ninguna
  `will-change: width/height`.
- **Delegación** de eventos para el pulsado (B-4): 1 *listener* en la raíz, no uno por botón.
- **Retratos** (B-1): ≤ 2 por fotograma, en tiempo ocioso, cacheados.
- **Verificación:** `css-lint.test.ts` en verde; `node tests/e2e/layout-shift.mjs` (sin saltos); perfil de 10 s abriendo
  y cerrando la hoja de nodo y el resumen con CPU ×4: 0 tareas largas > 50 ms, 0 *forced reflow* en el panel de
  *Insights*.

### 6.3 Movimiento reducido (los dos paquetes)

`reduceMotion()` de `motion.ts` (ajuste del juego o del sistema, R1) apaga: motas, partículas, sacudida, zoom,
paralaje, rayos girando, congelación, latidos en bucle, escalonado y muelles. Se mantienen, como fundidos de ≤ 80 ms:
la onda de siembra, el arco de incubación (información), las cifras (saltan al valor final) y el estado de cada botón.

---

## 7. Fuera de los dos paquetes (integrador)

Cosas que este plan necesita y que no pertenecen a ninguno de los dos paquetes (regla 8 y regla 2 de `CLAUDE.md`):

1. **Fraunces de verdad** (§3.3): autoalojar Fraunces (OFL) en `public/fonts/` como un solo `woff2` variable de
   subconjunto latino (pesos 500–800, ejes `opsz` y `SOFT`; objetivo ≤ 60 KB), con `<link rel="preload" as="font"
   crossorigin>`, `@font-face` con `font-display: swap` y una `Fraunces Fallback` local (Georgia) con `size-adjust`,
   `ascent-override` y `descent-override` medidos para que el cambio no mueva el texto (como ya se hizo con Inter en
   `index.html`); el SW la precachea (mismo origen, nombre con hash). Igual para Inter y JetBrains Mono si se quiere
   jugar sin red. `CREDITS.md` ya lista Fraunces; añadir que se sirve desde el propio sitio. No es una dependencia npm.
   **Aceptación:** en una primera visita con red lenta (Playwright, *Slow 3G*), la captura de «Fin de la sesión 1»
   muestra Fraunces; CLS 0 en `layout-shift.mjs`.
2. **`src/main.ts`:** (a) la preincubación no avanza mientras el juego está en pausa por un Momento, y en la sesión 1
   se hace **debajo de la portada o la intro** (que tapan la placa), no con la placa a la vista; (b) el Momento «¡VIDA!»
   de la criatura inicial espera a que acabe su aparición (A-6); (c) cablear `sim.setMatterFade()` durante la
   preincubación (A-6) y el `FxAnchors` de B en el `fly.ts` de A (A-5).
3. **Equilibrio** (regla 2: número en `cycleBalance.ts` con comentario, informe del bot antes y después, nota en
   ADR-027):
   - *Rampa de ritmo* al arrancar el reloj: de 0 a `SESSION_SIM_PACE` en **1,0 s** (`SESSION_PACE_RAMP_S = 1`), para
     que la criatura inicial no salga disparada (bug del dueño).
   - *Incubación* (bug del dueño): hoy una semilla es estable en 400 pasos / 45 pasos/s ≈ 8,9 s. Propuesta a medir con el
     bot: que el multiplicador de incubación del nivel 0 de la Incubadora sea **4/3** (`MATURE_SPEED_BY_LEVEL =
     [4/3, 3/2, 5/3]`, sin pasar de `SIM_PACE_MAX`), ≈ 6,7 s, y que A-4 haga visible la espera. **Ojo:** ese
     multiplicador acelera **toda** la placa mientras hay semillas formándose (`game.ts`: `simPace × matureSpeed`), así
     que las nadadoras también corren más; por eso la primera palanca es la percepción (A-4) y esta, la segunda, con su
     informe del bot y una captura de velocidad. No se toca `STABLE_AGE_STEPS` (ADR-009).
4. **Textos de `game/`:** «Sesiones 5/4» también nace en `src/game/treeText.ts` (`` t(`Sesiones ${s}/${sNeed}…`) ``):
   recortar ahí con `min()` (B-10.3 hace la parte de la vista).
5. **Herramientas de captura:** los scripts de `tests/e2e/*.mjs` buscan `chrome-linux/chrome`, pero en esta máquina
   Chromium está en `/opt/pw-browsers/chromium-1243/chrome-linux64/chrome`: `findChromium()` debe probar ambos (hoy
   `session-play.mjs` falla con «chromium not found»).
6. **Token de capa** `--bl-z-fx: 25` (lo añade B en `tokens.ts`; A lo usa).

Ningún cambio de este plan toca `src/core/` (contratos). Si A necesita un evento nuevo del bus (p. ej. «semilla
rechazada» con posición), se pide al integrador como campo opcional.

**Orden de PRs** (pequeños, regla 8; A y B van en paralelo desde el primer día):

| # | Paquete A | Paquete B |
|---|---|---|
| 1 | A-10 partículas en *pool* (sin cambio visible, prepara todo) | B-2 tokens + `css-lint` en modo informe; B-16 plurales |
| 2 | A-1 + A-2 *bloom* y materia | B-1 retratos |
| 3 | A-4 ciclo de vida + arco de incubación | B-10 bugs del dueño (con sus tests) |
| 4 | A-5 vuelo de Esencia (con *stub*) | B-4 pulsado + B-5 hojas y tarjetas + B-6 números (implementa `FxAnchors`) |
| 5 | A-6 aparición del cultivo + A-12 | B-7 HUD + B-8 etiquetas + B-9 Árbol |
| 6 | A-3 postproceso + A-11 vidrio + A-8 motas | B-3 profundidad + B-11 resumen + B-12 VELA |
| 7 | A-7 Chispa + A-9 cámara | B-13 portada + B-14 claro + B-15 escritorio + B-17 foco; `css-lint` obligatorio |

El integrador hace §7.1 (fuente) en cuanto entre B-2, y §7.2–7.3 cuando entren A-5 y A-6.

---

## 8. Cómo verificar: capturas antes / después

Cada PR adjunta sus capturas **antes y después** en los mismos estados que la auditoría, con los mismos tamaños
(390 × 844 DPR 2 táctil; 1366 × 768 DPR 1), en oscuro y claro.

```bash
npm run build && VITE_E2E=1 npx vite build --outDir /tmp/dist-e2e
node tests/e2e/session-play.mjs --dist /tmp/dist-e2e --out /tmp/pulido/play --sessions 2   # partida completa
node tests/e2e/tree-shots.mjs                                                              # Árbol, resumen, HUD
npx vite --port 5173   # páginas de desarrollo:
#   tree-dev.html?view=tree&preset=mid&sessions=5&menu=0&sel=lab        hoja de la Noche (5/4)
#   tree-dev.html?view=tree&preset=early&datos=4&menu=0&sel=culture&why=1  «¿Por qué?»
#   tree-dev.html?view=hud&t=24&total=210&menu=0                         reloj en aviso
#   art-dev.html?section=dish                                            referencia de la placa
```

Los recortes ampliados se hacen con ImageMagick (`convert in.png -crop WxH+X+Y -filter point -resize 400% out.png`) y
las tiras de fotogramas con `convert a.png b.png … +append tira.png`.

| Estado | Captura de referencia (antes) | Qué tiene que verse después |
|---|---|---|
| Placa con 3 criaturas, `low` | `play/play-desktop-es-dark-21-s2-midway.png` | halo visible, núcleos sin quemar, ≤ 2 píldoras |
| Siembra 40–1300 ms | `audit/seed-strip2.png` | gota → onda → motas; arco de incubación |
| Ficha de especie | `play/play-mobile-es-dark-18-s2-species.png`, `zoom-portrait.png` | retrato sin escalones; título en Fraunces; «1 vez» |
| Bestiario + foco | `play/play-mobile-es-dark-13-scene-t_bestiary.png`, `…-15-drawer-open.png` | el foco señala una ficha visible del cajón |
| Momento | `play/play-mobile-es-dark-16-moment-behavior.still.png` | ≤ 2 niveles de borde; el foco no cruza el HUD |
| Resumen 0–2400 ms | `audit/mobile-dark-28…32-summary-*.png`, `play/play-mobile-en-light-20-s2-midway.png` | ningún fotograma con la caja vacía |
| Árbol | `audit/mobile-dark-42-s2-ready.png`, `play/play-desktop-es-dark-08-s1-tree.png` | un solo nodo pulsando; mano dibujada; la pista no tapa nodos |
| Compra | `audit/mobile-dark-38-buy-200ms.png` | estallido visible, hoja asomada |
| Noche | `harness/h-night-sheet-5of4.png`, `…-8.png` | «4/4 ✓», «2/2 ✓»; CTA claro; VELA acoplada |
| «¿Por qué?» | `harness/h-tree-why.png` | despliegue dentro de la hoja, sin repetir |
| Reloj en aviso | `zoom-clock-warn.png` | cifras sin pisar el dial |
| Portada | `play/play-mobile-es-dark-00-title.png` | una versión; criatura nítida; logo Fraunces |
| Tema claro | `play/play-mobile-en-light-17-s2-bestiary.png` | huecos claros; Encargo claro |
| Escritorio | `play/play-desktop-es-dark-21-s2-midway.png` | panel a la derecha, sin columnas vacías |

**Puertas de calidad** (además de las de `CLAUDE.md`): `css-lint.test.ts` en verde, `layout-shift.mjs` sin saltos,
suelo de 30 fps en el e2e móvil, y la revisión visual del director con estas capturas lado a lado.
