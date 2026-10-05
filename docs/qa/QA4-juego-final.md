# QA #4 — Juego final (playtest adversarial, 3 personas)

Autor: QA #4 (agente). Fecha: 2026-10-04. **Sin leer el código fuente**: todo se juzga como jugador.

## Build probada

- El deploy público `https://bioluma-xi.vercel.app` responde `version.json` = `{"version":"0.015","sha":"5593da1"}`.
- El Chromium del sandbox no puede abrir HTTPS a través del proxy (`ERR_CERT_AUTHORITY_INVALID`), y no se debilitó
  TLS. Por decisión del coordinador se probó **un build local de producción del mismo commit `5593da1`** (HEAD de
  `main`, idéntico al deploy), con `npm run build` (sin `VITE_E2E`, sin handle de depuración) servido con
  `vite preview`. Por eso la insignia dice `v0.015 · dev`: el `sha` sale de git y la copia no tiene `.git`.
- Fuentes de Google Fonts bloqueadas en el sandbox: los títulos se ven con la serif de reserva. **No es un bug.**
- Capturas: `/tmp/claude-0/-home-user-Lenia/a5114f5a-39a4-539d-9a6a-14e769759a92/scratchpad/qa4/` (en adelante
  `qa4/`).

### Advertencia de rendimiento (importante para leer los tiempos)

SwiftShader (render por software) da **5–10 fps**. El reloj de la sesión avanza casi a tiempo real, pero la
simulación avanza por fotograma, así que a 7 fps la placa recibe ~8× menos pasos por segundo de reloj que un móvil a
60 fps. Resultado en las primeras sesiones a fps real: **ninguna criatura terminó de "Nacer" en 15–20 s**.
Para no culpar al juego de un problema del sandbox, desde la sesión 4 del novato y en el resto de personas se usó el
**reloj falso de Playwright** (`page.clock.install()`): cada `requestAnimationFrame` recibe 16 ms, es decir, el juego
cree que corre a 60 fps (cámara lenta real ×8). Los hallazgos marcados **[fps real]** se vieron sin reloj falso y
deben confirmarse en un móvil antes de priorizarlos; los marcados **[60 fps emulado]** son fiables.

---

## Persona 2 — Adulto novato (ES, tema oscuro, 390×844 táctil)

### Intro y tutorial

- Pantalla de título con insignia de versión visible al cargar (`qa4/probe-5.png`). Bonita.
- Intro de 11 tarjetas (`qa4/m-intro-a.png`, `qa4/m-intro-b.png`): Estación Vigilia, Dra. Albor (cinta), elegir
  bata (3 doctores chibi), VELA, "Cómo se juega 1/4…4/4". Arte cuidado y tierno; el texto es corto y claro.
- `Saltar intro` funciona, pero **justo después, sin que el jugador haya tocado nada, sale una pausa explicativa
  "Se apagó — Era muy poquita y se apagó"** con un foco sobre una placa vacía (`qa4/n2-afterskip.png`). Lo primero
  que ve quien salta la intro es una muerte que no provocó. → **F-07**.
- El tutorial no avanza: tras tocar la placa, VELA sigue diciendo "¡Toca la placa! A ver qué pasa." durante toda la
  primera sesión (`qa4/m-seed.png`, `qa4/m-n2s1.png`). → **F-03**.

### Primera sesión y resumen

- Sesión 1 dura 0:15 (resumen dice 0:16). La placa empieza **vacía**; la criatura del primer toque nace, se mueve,
  desaparece (el rótulo "Naciendo 27 %" queda flotando sin criatura debajo) y se deshace en partículas a 0:00
  (`qa4/m-n2s1.png`). **[fps real]**.
- **El globo de VELA tapa los botones del resumen** ("Ir al Árbol" / "Nueva sesión"): `elementFromPoint` sobre el
  centro de "Ir al Árbol" devuelve el texto de VELA (`qa4/m-run1.png`). Primer toque solo pliega VELA a un aviso
  "Toca la placa." que sigue visible en el resumen y en el Árbol (instrucción equivocada en ese contexto,
  `qa4/m-sum.png`). → **F-01**.
- Resumen: "5 Esencia ganada ÷ 25 = 0", "1 × 2 primeras metas = +2", "+1 mínimo", "Datos 3", "Nunca menos de 3".
  Claro para un adulto; para un niño, una cuenta con división y "= 0" es ruido. Bien: "Los Datos no se pierden
  nunca", "Hoy salió poco. Pero aprendimos algo. ¡Otra vez!" (nada de castigo).

### Árbol y compras

- Primera compra: **"Más tiempo" (2 Datos) justo al terminar la sesión 1**, ≈ 1 min de juego tras la intro (5,6
  min reales en SwiftShader). Ficha muy clara: "AHORA Sesión 0:15 ▶ CON UN NIVEL MÁS Sesión 0:20", "Gris es ahora.
  Verde es lo que tendrás.", barra "Datos 3 / 2", "¡Puedes comprarlo!", "Próximos niveles" con barras
  (`qa4/n-tree-sel2.png`, `qa4/n-tree-bought.png`). Es el mejor "antes → después" del juego.
- Pequeñas confusiones: "Reloj · Paso 1 de 7" junto a "NIVEL 0/6" (¿7 o 6?); "Datos 3 / 2" parece una fracción;
  la sombra del botón "Comprar" pisa "¿Por qué cuesta esto?"; el nodo "Reloj grande" queda medio escondido bajo la
  barra "Árbol · Noche 1" (`qa4/n-tree-bought.png`). → **F-15**.
- **Comprar desde el Árbol abierto con el dock (antes de empezar la sesión) cierra el Árbol y vuelve a la hoja
  "Sesión N · ¡Empezar!" tras CADA compra** (`qa4/m-n2buy.png`). Para comprar 3 cosas hay que hacer 3 viajes
  (¡Empezar! → Árbol → nodo → Comprar). Desde "Ir al Árbol" del resumen sí se puede comprar seguido. → **F-06**.
- Gotero: "Viven 24 de cada 100 → Viven 32 de cada 100": muy claro. Cultivo: "Esencia ×1 → ×1,15": claro para
  adultos. Placa más grande: "Sitio para 3 → 4 criaturas", pero el dibujo de antes/después son dos círculos casi
  iguales.

### Sesiones 2–7 (duración y ritmo)

| Sesión | Reloj | Esencia ganada | Datos | Nota |
|---|---|---|---|---|
| 1 | 0:16 | 5 | 3 | [fps real] ninguna criatura nace |
| 2 | 0:21 | 0 | 3 | [fps real] "Naciendo 37 %" al acabar |
| 3 | 0:21 | 0 | 3 | [fps real] |
| 4 | 0:24 | 18 | 4 | [60 fps emulado] 1ª criatura "Viva +1,0/s" a los ~8 s |
| 5 | 0:26 | 25 | 7 | 2 vivas, 3 récords |
| 6 | 0:26 | 30 | 5 | Abono comprado |
| 7 | 0:29 | 133 | 24 | Mundo 2 · Frío: **Anillo verde** descubierto → Noche 2 disponible |

Con 60 fps emulado el bucle funciona: la sesión se alarga 15 → 29 s y la Esencia por sesión crece 18 → 133. Las
sesiones a fps real (1–3) dan 0 Esencia: en un móvil lento (≤ 30 fps) el riesgo es real → **F-02**.

- **Pausa explicativa del reloj con tres tiempos distintos**: texto "Queda un minuto", chip "Quedan 15 s",
  animación "0:17", reloj real 0:20 (`qa4/n-s2-0.png`). → **F-08**.
- **Hoja de inicio de sesión** ("Sesión 2 · Tienes 0:20 · 20 Esencia · 1 siembra gratis · Sale de la nevera: 1
  criatura · ¡Empezar!") es buena idea, pero a la vez queda visible el aviso viejo "Toca la placa." (dos
  instrucciones contradictorias). "Nevera" no se explica nunca. "Tu encargo" muestra un encargo ya cumplido
  ("Compra el Gotero") mientras la barra ya pide "Ten 3 criaturas vivas". → **F-16**.
- **Objetivo "Mira tu criatura en el Bestiario" cuando el Bestiario está vacío**: tras la sesión 4 (Orbium vivo
  30 s, "Aún sin nombre"), el objetivo pide el Bestiario; al abrirlo dice "0 / 7 · Aún no hay nadie" y VELA suelta
  allí "Espera… ¡mira! Tiene borde. Tiene forma. ¡Se queda! Es una criatura. Tu primera. Hola, pequeña." sobre una
  pantalla vacía (`qa4/n2-best1.png`). La Nadadora azul **nunca entró al Bestiario** en 5 sesiones con criaturas
  vivas hasta 32 s ("Aún sin nombre · Mirando cómo se mueve…", `qa4/m-n2s5.png`). → **F-04**.
- Precio del Abono salta sin explicación (10 → 19 → 18 → 28 → 56) y el botón solo dice "Abono ×1,25 · 💧10"
  (icono de vaso). Un niño no sabe qué es "Abono". → **F-17**.
- "Récord: Más Esencia en una sesión: 18 (5)": el número entre paréntesis (récord anterior) no se explica. Menor.
- Tocar una criatura abre su ficha encima de la placa; en la sesión 7 esa ficha se pisa con el aviso "¡Toca aquí! El
  reloj empieza con tu primera semilla" (texto sobre texto, `qa4/m-n2s7.png` 2.º panel). → **F-05**.

### Descubrimiento de especie (Anillo verde)

- Al nacer: pausa "¡Especie nueva! Nadie la había visto aquí. Se guarda en tu Bestiario. Cada especie nueva te da
  10 Datos y 3 segundos más. +10 Datos +3 s", y luego "Una criatura quieta · Quieta: ×1,0 Esencia · es la base"
  (`qa4/m-n2s7.png`). Muy bien explicado, pero:
  - el resumen paga **"1 × 12 especies nuevas = +12"**, no +10 (probablemente por "Cuaderno de campo", pero la
    explicación no lo dice); → **F-18**;
  - la ficha del Bestiario dice **"Rareza ×1,6 Esencia"** y la tarjeta de explicación "Quieta ×1,0"; las dos
    son ciertas (rareza vs. movimiento), pero el jugador ve dos multiplicadores distintos para la misma criatura.
- **Color en la placa**: el Anillo verde se ve como un **anillo casi blanco con un halo verde fino** (al nacer,
  halo azulado); el verde solo domina en el retrato del Bestiario (`qa4/n2-pause.png`, `qa4/m-n2s7.png`).
- Ficha del Bestiario (`qa4/m-n2card.png`): retrato, "Circium ventilans", etiquetas verde/anillo/Quieta/Rara,
  "La viste 3 veces", "Da ahora +3,3/s", fórmula "×1,15 forma · ×1 quieta · ×1,6 rara · ×1,84 mejoras = +3,3/s",
  "Cómo mejorarla: Comida extra · Ver". Bonita y completa para un adulto; "Afinidad sésil" es jerga. La animación
  de la ficha muestra una nadadora azul, no el anillo.
- Al terminar la sesión 7, **cadena de 4 globos de VELA + una elección de historia ("Dejar la lámpara encendida" /
  "Seguir el protocolo") apilados encima del resumen**, tapando los botones (`qa4/n2-s7-stuck.png`). → **F-01**.
- La hoja "Noche 1 → Noche 2" queda tapada por VELA ("¡Un mundo nuevo!…", mensaje de otra cosa) justo encima del
  botón "Empezar la Noche 2" (`qa4/n2-t8-noche.png`). "Necesita 4 sesiones y 1 especies" (plural). → **F-01**,
  **F-19**.
- Empezar la Noche 2: instantáneo, sin escena ni celebración; se conservan Datos y mejoras (no castiga), pero el
  momento más importante de la partida pasa sin "juice" (`qa4/m-n2noche.png`). → **F-12**.

### Ajustes, pausa, intro repetida

- Ajustes (`qa4/m-n2set.png`): tema Auto/Oscuro/Claro, letra Normal/Grande, Vestidor, idioma, sonido, vibración,
  reducir movimiento, modo un toque, repetir tutorial, calidad, historia (finales, escenas), "Ver la introducción",
  "¿Qué pasó?" (23 explicaciones). Completo. No se puede abrir desde el resumen ni desde la hoja de inicio (los
  bloquea su capa). Menor.
- Pausa: "En pausa · La placa y el reloj esperan · Seguir · Terminar ahora" — claro (`qa4/n2-pause.png`).
- Antes de la primera semilla el reloj y la Esencia están congelados (no hay exploit de espera), **pero el HUD sigue
  mostrando "+3,3/s"** mientras no gana nada. → **F-20**.
- "Ver la introducción" repite la intro y vuelve a Ajustes. Funciona.

### Veredicto novato — diversión y claridad

Las fichas de mejora ("antes → después") y las pausas explicativas son de lo mejor que he visto en un incremental
para principiantes; nunca me sentí castigado ("Nunca menos de 3", "Los Datos no se pierden nunca"). Lo que lo
estropea es **el apilamiento**: VELA tapa los botones del resumen y de la Noche, el tutorial dice "Toca la placa" en
pantallas donde no hay placa, celebra "tu primera criatura" con el Bestiario vacío, y una explicación salta tras
"Saltar intro" sin causa. Claridad 7/10, diversión 7/10 (una vez que las criaturas nacen; 3/10 si no nacen, como en
las sesiones a fps real).

---

## Persona 1 — Niño de 5–7 años (ES, tema claro, 390×844 táctil, 60 fps emulado)

Juega aporreando: el mismo punto muchas veces, luego toques aleatorios por toda la pantalla (200 toques en ~4
sesiones). No lee nada.

- Título e intro: aporreando el botón de abajo pasa la intro en segundos y cae en la hoja "¿Cuánto cuesta sembrar?"
  (texto largo: "Cada semilla que compras hoy cuesta un poquito más…") (`qa4/m-k1.png`). No hay bloqueo.
- Sesión 1: 3 semillas gratis, placa "Llena", 2 criaturas "Viva +1,0/s"; 16 Esencia, 4 Datos. Bien.
- **Tocar varias veces el mismo sitio deja la placa muy ampliada (zoom) y así se queda en las sesiones siguientes**:
  la placa desborda la pantalla, las criaturas ocupan ~¼ del ancho y solo se ve un trozo del borde
  (`qa4/m-k1.png` 4.º y 5.º panel, `qa4/m-k2.png`, `qa4/m-kmash.png`). En la vista de la placa no hay botón
  "Centrar" (el Árbol sí lo tiene). Un niño no sabe pellizcar para volver. → **F-09**.
- **"Muy cerca: se fundirían. ¡Más lejos!" sobre un sitio vacío**: segundo toque en el mismo punto 1,5 s después; la
  semilla del primer toque ya se había desplazado ~100 px, así que el aviso aparece donde no se ve nada
  (`qa4/m-k2.png` 4.º panel). Para el jugador es un "Muy cerca" falso. → **F-13**.
- **"Se apagó" al empezar la sesión 2 sin haber sembrado**: la criatura que "sale de la nevera" muere al instante y
  salta la pausa explicativa (`qa4/m-k2.png` 2.º panel). Igual que tras "Saltar intro" (F-07).
- **"Limpiar placa" está pegado a la barra de semillas**: aporreando apareció "¿Limpiar? Toca otra vez"
  (`qa4/m-kmash.png` 1.er panel); dos toques seguidos borran todas las criaturas. Para un niño que aporrea es un
  borrado accidental. → **F-10**.
- Gasta toda la Esencia en semillas (20 → 3), "Te faltan 2 de Esencia" (`qa4/m-kmash.png`), y las sesiones 2, 3 y
  4 terminan con **0–1 Esencia**: "Hoy salió poco. Pero aprendimos algo. ¡Otra vez!" tres veces seguidas.
  Datos sin gastar: el niño nunca compra nada porque el Árbol no señala por dónde empezar (7 nodos iguales, sin
  mano/flecha de VELA) y sus toques al azar no caen en los nodos de 48 px (`qa4/k-tree1.png`). → **F-11**.
- El objetivo "Mira tu criatura en el Bestiario" sigue fijo durante 4 sesiones aunque el Bestiario está vacío;
  Estadísticas: "Criaturas nacidas 18 · Especies registradas 0" (`qa4/m-kmash.png` 3.er panel). → **F-04**.
- Aporrear el HUD abre la Bitácora (Logros/Estadísticas); se cierra bien. Ningún cuelgue ni bloqueo en 200 toques.
- Tema claro: legible, contraste bueno; la placa sigue oscura dentro de un marco gris claro (`qa4/m-k1.png`).

### Veredicto niño — diversión y claridad

Las criaturas brillantes y VELA le encantarían, y nunca se queda atascado del todo. Pero **un niño que aporrea no
progresa**: se gasta la Esencia, la placa se le queda ampliada, puede borrar sus criaturas sin querer y nadie le
dice "toca aquí" en el Árbol. Tras 4 sesiones no ha comprado nada y lee "Hoy salió poco" cada 16 s. Claridad 4/10,
diversión 5/10.

---

## Persona 3 — Veterano de incrementales (EN, tema oscuro; 1366×768 ratón en intro y sesión 1, luego 390×844)

Optimiza: salta el tutorial, siembra separado (5 puntos), compra lo que más rinde, compara Mundo 1 y Mundo 2, con y
sin Abono. 5 sesiones hasta la primera Noche.

- Escritorio 1366×768: intro a dos columnas (ilustración izquierda, texto y "Next ›" derecha), limpia
  (`qa4/v-intro6.png`). Placa centrada, el globo de VELA tapa el borde inferior de la placa (`qa4/v-game1.png`), y
  también los botones del resumen en escritorio (`qa4/m-v1.png` 4.º panel). → **F-01**.
- Tras "Let's start!" (intro completa, sin saltar) aparece de nuevo **"It faded"** sin haber sembrado
  (`qa4/v-faded.png`). Visto en las 3 personas → **F-07** confirmado.
- "Skip tutorial" pide confirmación ("Sure? Tap again ›"): bien.
- **"Last minute! · 15 s left" sale al empezar una sesión de 0:20**, encima de la barra de objetivo
  (`qa4/m-v2.png` 1.er panel). En una sesión de 20 s todo es "último minuto". → **F-08**.
- La Esencia se muestra con decimales ("3.7", "1.7", "7.6") cuando hay poca; en español se vio "16", "12"…
  Mezclar enteros y decimales en el contador principal resta claridad. Menor.
- Toast "Seeds cost a bit more · Seed: 5" se pinta encima del botón "Tree" del dock (`qa4/m-v3.png` 2.º panel). → **F-05**.
- El aviso "Wait: some seeds are still hatching. Watch them grow." queda debajo del globo de VELA (texto sobre texto,
  `qa4/m-v5.png` 2.º panel). VELA "The night can move on! Look at the centre of the Tree." se queda fijo **toda la
  sesión 5** tapando la barra de semillas. → **F-01**, **F-05**.
- La guía "Still · never moves / Pulses · Not seen yet" (maneras de moverse) se abrió durante el juego y **siguió
  abierta encima del resumen** de las sesiones 3 y 5, tapando el resultado (`qa4/m-v3.png`, `qa4/m-v5.png`). → **F-05**.

### Economía, decisiones y tiempos

| Sesión | Mundo | Reloj | Esencia ganada | Datos | Decisiones |
|---|---|---|---|---|---|
| 1 | 1 | 0:16 | 15 | 4 | Más tiempo + Gotero |
| 2 | 1 | 0:21 | 13 | 3 | Abono (×1,25 → ×1,56) → se queda en 1,7 de Esencia; compra Mundo 2 |
| 3 | 2 | 0:24 | 108 | 22 | Anillo verde nuevo (+10 Datos), 3 récords; Cultivo, Placa más grande ×2, Cuaderno, Destello |
| 4 | 1 | 0:21 | 20 | 3 | Abono otra vez; la Nadadora **sigue sin registrarse** |
| 5 | 2 | 0:26 | 171 | 12 | Sin Abono; 4 criaturas a la vez; "The night can move on!" |
| 6 | — | — | — | — | Noche 2 empezada desde el centro del Árbol |

- **Primera compra**: al acabar la sesión 1 (≈ 40 s de intro + 16 s de sesión). Excelente.
- **Duración de las sesiones**: 16 → 21 → 24 → 21 → 26 s. Crece despacio y depende de comprar "More time"; los
  encargos dan "+3 s". Va en la buena dirección (15 s → más largas) pero en 5 sesiones aún no pasa de medio minuto.
- **El dinero sí llega cada vez más rápido… solo en el Mundo 2**: Mundo 1 da 13–20 Esencia por sesión; Mundo 2 da
  108–171. La estrategia óptima es jugar siempre en el Mundo 2 (el anillo quieto no muere ni se escapa), lo que
  deja el Mundo 1 —el del tutorial y la Nadadora— como una trampa. → **F-14**.
- **Abono es una trampa para el veterano y un misterio para el niño**: cuesta casi toda la Esencia de la sesión
  (precio 10 → 19 → 20 → 27 → 53 → 88 → 122 según el momento), multiplica ×1,25 o ×1,56 "hasta el final", y como los
  Datos salen de la Esencia *ganada* (÷25), gastar en Abono a mitad de una sesión de 20 s casi nunca compensa (sesión
  4 con Abono: 20 Esencia; sesión 5 sin Abono: 171). No hay "antes → después" ni tiempo restante explicado. → **F-17**.
- Al principio la conversión "25 Esencia = 1 Dato" es irrelevante: casi todos los Datos vienen de "mínimo 3",
  "primeras metas", récords y especies. Bien para no castigar, pero el número grande de la pantalla (Esencia) no
  es lo que hace avanzar. Sugerencia: mostrar en el HUD "+N Datos al terminar" (ya existe en el dock) más grande.
- Noche 2 llega en la sesión 5 (requisito "4 sesiones y 1 especie"); los Datos (14) y mejoras se conservan. Sin
  ceremonia (`qa4/m-vnight.png`). → **F-12**.
- **Ficha de mejora atascada (no confirmado al 100 %)**: tras comprar 5 nodos seguidos rápido, la ficha "Culture"
  quedó fija con datos viejos ("Data 7 / 5" mientras la cabecera decía "14 DATA"; antes "Bigger dish · LEVEL 1/2 ·
  You can buy it!" cuando ya estaba 2/2); ni "Buy" ni la ✕ respondían, y seguía igual al cerrar y reabrir el Árbol.
  Solo Escape o recargar lo arreglaron (`qa4/v-t3-buy.png`, `qa4/v-resume.png`). Ocurrió con el reloj falso de
  Playwright en pausa y tras cambiar el viewport de 1366 a 390, así que puede ser del entorno; merece una prueba
  en móvil comprando 4–5 mejoras muy rápido. → **F-21**.
- Sin exploits encontrados: antes de la primera semilla el reloj y la Esencia no corren (esperar no da nada).

### Veredicto veterano — diversión y claridad

El primer minuto es de los mejores del género: compra a los 60 s, fichas con "antes → después", récords que pagan
Datos, ningún castigo. Pero las decisiones aún son pocas y algunas engañan: el Abono resta más de lo que suma, el
Mundo 1 no merece la pena una vez tienes el Mundo 2, y la especie del Mundo 1 nunca se registra. La UI apila demasiadas
capas (VELA fijo, guía abierta sobre el resumen, toasts encima del dock). Claridad 6/10, diversión 6/10, con
potencial de 8 si se arreglan F-01, F-04 y F-17.

---

## Comprobaciones específicas pedidas

| Comprobación | Resultado |
|---|---|
| Insignia de versión al cargar | ✅ "v0.015 · dev" bajo el título (dev = build local sin `.git`) |
| Intro animada con doctores y historia | ✅ 11 tarjetas, Dra. Albor, 3 batas, VELA, "Cómo se juega"; repetible desde Ajustes |
| Criaturas pequeñas y tranquilas | ✅ con zoom normal (≈⅛ del ancho de la placa); la Nadadora cruza media placa en ~4 s (algo rápida). ❌ con el zoom accidental del niño (F-09) |
| Color de especie en la placa | ⚠️ Nadadora azul; **Anillo verde casi blanco con halo verde fino** (verde solo en el Bestiario). Solo 2 especies vistas en ~20 sesiones, no se pudieron comprobar las 7 |
| Placa nunca vacía al empezar | ❌ La sesión 1 empieza vacía; luego "Sale de la nevera: 1 criatura", pero a menudo muere al instante (F-07). VELA dice "Colega… la placa está vacía" |
| Sin "Muy cerca" falso en sitio vacío | ⚠️ Visto una vez sobre un hueco (la semilla anterior se había movido, F-13) |
| Sin laberinto ni inundación sin forma | ✅ No visto en ~20 sesiones (máx. 4 criaturas a la vez) |
| Texto que nombre signos de puntuación | ✅ No encontrado ("«+1/s»" usa comillas, no "signo de…") |
| Cajas solapadas (objetivo vs VELA, escena del Bestiario) | ⚠️ En el Bestiario no se solapan; sí se apilan VELA + resumen, VELA + hoja de Noche, ficha de criatura + aviso, toast + dock (F-01, F-05) |
| Precios y "antes → después" comprensibles | ✅ Árbol (excelente); ❌ Abono (F-17); "Datos 3 / 2", "Paso 1 de 7 / Nivel 0/6" confunden (F-15) |
| Nada parece castigo | ✅ "Nunca menos de 3", "Los Datos no se pierden nunca", Noche conserva todo. Única excepción: "Limpiar placa" accidental (F-10) |
| Destello (Spark) | ⚠️ Visto en la placa (estrella dorada) en 3 sesiones; no logré tocarlo de forma fiable con el script, no puedo juzgar la recompensa |
| Abono, Encargos, pausa, ajustes, repetir intro | ✅ todos accesibles; ver F-17 (Abono) y F-16 (encargo viejo en la hoja) |
| Placa redonda que crece | ⚠️ "Placa más grande" sube los sitios (3 → 4 → 5) pero no noté que la placa se viera más grande |
| 7 especies distintas | ⚠️ Bestiario 0/7 → 1/7 tras 7 sesiones; la Nadadora del Mundo 1 nunca se registró (F-04) |

---

## Hallazgos (todos)

| ID | Sev. | Persona | Pasos | Esperado | Real | Captura |
|---|---|---|---|---|---|---|
| F-01 | **P0** | todas | Terminar la sesión 1 con el tutorial activo; o la sesión en la que se descubre la 1.ª especie | Resumen con "Ir al Árbol / Nueva sesión" tocables | El globo de VELA (y luego una cadena de 4 globos + una elección de historia) tapa los botones; el 1.er toque solo pliega VELA. También tapa "Empezar la Noche 2" y la barra de semillas (sesión 5 veterano) | `m-run1.png`, `n2-s7-stuck.png`, `n2-t8-noche.png`, `m-v1.png`, `m-v5.png` |
| F-02 | P0 (verificar en móvil) | novato | Jugar a 5–10 fps reales (SwiftShader) | Criaturas nacen en una sesión de 15–20 s | Ninguna termina "Naciendo" en 3 sesiones; 0 Esencia. A 60 fps emulado nacen en ~8 s. El reloj va en tiempo real y la simulación por fotograma: en móviles lentos el juego es mucho más difícil | `m-n2s1.png`, `m-s2.png`, `m-n2s4.png` |
| F-03 | P1 | novato | Intro → tocar la placa | VELA avanza al siguiente paso | VELA repite "¡Toca la placa! A ver qué pasa." toda la sesión 1 y el aviso "Toca la placa." sigue en resumen, Árbol y hoja de sesión | `m-seed.png`, `m-sum.png` |
| F-04 | **P0** | todas | Jugar Mundo 1 con Nadadoras vivas 30 s+ (5 sesiones novato, 2 veterano, 4 niño) | La Nadadora entra al Bestiario ("Mundo 1 · +1 especie") | "Aún sin nombre · Mirando cómo se mueve…" para siempre; Bestiario 0/7; Estadísticas "Criaturas nacidas 18 · Especies 0"; objetivo "Mira tu criatura en el Bestiario" con Bestiario vacío y VELA celebrando "Tu primera" sobre la pantalla vacía | `n2-best1.png`, `m-n2s5.png`, `m-kmash.png` |
| F-05 | P1 | novato, veterano | Tocar una criatura cerca del aviso de inicio; sembrar con VELA abierto | Una capa cada vez | Ficha de criatura sobre "¡Toca aquí!…"; toast "Seeds cost a bit more" sobre el dock; aviso "Wait…" bajo VELA; guía de movimientos abierta sobre el resumen | `m-n2s7.png`, `m-v3.png`, `m-v5.png` |
| F-06 | P1 | novato | Hoja de sesión → ¡Empezar! → Árbol (dock) → comprar | Seguir en el Árbol | Tras cada compra se cierra el Árbol y vuelve la hoja "Sesión N · ¡Empezar!" | `m-n2buy.png` |
| F-07 | P1 | todas | Saltar o terminar la intro; o empezar una sesión con "Sale de la nevera" | Placa con vida esperando | Pausa "Se apagó / It faded" sin haber sembrado (3/3 perfiles nuevos y varias sesiones) | `n2-afterskip.png`, `v-faded.png`, `m-k2.png` |
| F-08 | P1 | novato, veterano | Empezar la sesión 2 (0:20) | Un único tiempo coherente | "Queda un minuto" / "Last minute!" + "Quedan 15 s" + animación 0:17 + reloj 0:20 | `n-s2-0.png`, `m-v2.png` |
| F-09 | P1 | niño | Tocar el mismo punto muchas veces | La placa sigue entera en pantalla | Zoom fuerte que persiste entre sesiones; no hay botón "Centrar" en la placa | `m-k1.png`, `m-k2.png`, `m-kmash.png` |
| F-10 | P1 | niño | Aporrear cerca de la barra de semillas | Nada destructivo | "¿Limpiar? Toca otra vez": dos toques borran la placa | `m-kmash.png` |
| F-11 | P1 | niño | Ir al Árbol sin leer | Algo que diga "toca aquí" | 7 nodos iguales, ninguna pista; el niño no compra nada en 4 sesiones y acumula Datos | `k-tree1.png` |
| F-12 | P2 | novato, veterano | Empezar la Noche 2 | Celebración (es el "prestigio") | Cambio instantáneo de texto "Noche 2"; sin escena ni sonido destacado | `m-n2noche.png`, `m-vnight.png` |
| F-13 | P2 | niño | Tocar 2 veces el mismo sitio con 1,5 s de diferencia | Aviso junto a la criatura | "Muy cerca: se fundirían" sobre un hueco vacío (la semilla ya se movió) | `m-k2.png` |
| F-14 | P2 | veterano | Comparar Mundo 1 y Mundo 2 | Ambos valen la pena | Mundo 1: 13–20 Esencia/sesión; Mundo 2: 108–171 | `out` del veterano, `m-v5.png` |
| F-15 | P2 | novato | Abrir "Más tiempo" | Números coherentes | "Paso 1 de 7" vs "NIVEL 0/6"; "Datos 3 / 2" parece fracción; sombra de "Comprar" pisa "¿Por qué cuesta esto?"; nodo bajo la cabecera | `n-tree-sel2.png`, `n-tree-bought.png` |
| F-16 | P2 | novato | Hoja de inicio tras cumplir un encargo | Encargo actual | "Tu encargo: Compra el Gotero" (ya hecho) mientras la barra pide otro; "nevera" sin explicar | `m-n2buy.png` |
| F-17 | P1 | niño, veterano | Comprar Abono en mitad de sesión | Saber qué da y cuánto dura; que compense | Precio salta 10–122 sin explicación; gastarlo deja la sesión en ~20 Esencia frente a 171 sin él; el niño no sabe qué es "Abono" | `m-n2s5.png`, `m-v2.png` |
| F-18 | P2 | novato | Descubrir especie | Mismo número en la explicación y en el resumen | Explicación "+10 Datos", resumen "1 × 12 especies nuevas = +12" (el novato tenía "Cuaderno de campo"; el veterano sin él vio "1 × 10"). La explicación no cuenta la mejora que el jugador compró | `m-n2s7.png` |
| F-19 | P2 | novato | Hoja Noche | Español correcto | "Necesita 4 sesiones y 1 especies" | `n2-t8-noche.png` |
| F-20 | P2 | novato | Abrir sesión y esperar sin sembrar | HUD honesto | Muestra "+3,3/s" mientras la Esencia está congelada | `n2-idle-20.png` |
| F-21 | P1 (no confirmado) | veterano | Comprar 4–5 nodos muy seguidos | La ficha se actualiza o se cierra | Ficha atascada con datos viejos; "Buy" y ✕ no responden; persiste al reabrir el Árbol | `v-t3-buy.png`, `v-resume.png` |

---

## Lista de arreglos priorizada

1. **F-01 — Una sola capa a la vez.** VELA no puede aparecer sobre el resumen, la hoja de Noche ni la barra de
   semillas: encolar sus mensajes y mostrarlos *después* de que el jugador pulse "Ir al Árbol"/"Nueva sesión", o
   integrarlos dentro del propio resumen. Lo mismo para la elección de historia.
2. **F-04 — Registrar la Nadadora.** Revisar por qué la especie del Mundo 1 queda en "Aún sin nombre" 30 s+; y no
   lanzar el objetivo "Mira tu criatura en el Bestiario" ni la escena "Tu primera" hasta que haya una especie
   registrada.
3. **F-02 — Probar en un móvil real de gama baja (30 fps).** Si el reloj va en tiempo real y la simulación por
   fotograma, las criaturas tardan el doble en nacer; valorar avanzar la simulación por tiempo (pasos por segundo
   fijos) o pausar el reloj mientras haya semillas "Naciendo" en la sesión 1.
4. **F-07 — No explicar muertes que el jugador no causó.** La criatura "de la nevera" no debería morir al instante
   ni disparar "Se apagó"; tampoco tras "Saltar intro". Placa con vida garantizada al empezar.
5. **F-03 / F-08 — Tutorial y reloj coherentes.** Que VELA avance al sembrar; quitar "Queda un minuto"/"Last
   minute!" cuando la sesión dura < 60 s.
6. **F-09 / F-10 / F-11 — Modo niño.** Botón "Centrar" en la placa (o deshacer el zoom al empezar cada sesión);
   alejar "Limpiar placa" de la barra de semillas o pedir mantener pulsado; mano de VELA señalando el nodo
   recomendado en el Árbol y un "Comprar" grande.
7. **F-17 / F-14 — Equilibrio de decisiones.** Abono: ficha "antes → después" y duración visible; precio estable
   dentro de la sesión; que no compita con los Datos. Mundo 1: algún motivo para volver (bono propio, especie
   registrable).
8. **F-06 / F-05 / F-21 — Fluidez del Árbol y de las capas.** Comprar varias mejoras sin que se cierre el Árbol;
   cerrar la guía de movimientos y fichas de criatura al acabar la sesión; comprobar la ficha atascada.
9. **F-12 — Celebrar la Noche.** Escena corta (VELA, la lámpara, el cielo) al empezar cada Noche.
10. **Pulido (P2):** F-13, F-15, F-16, F-18, F-19, F-20; el Anillo verde más verde en la placa; decimales en el
    contador de Esencia.
