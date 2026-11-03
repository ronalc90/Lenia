# PLAN-CLARIDAD (2.ª pasada): que se entienda, que se toque y que divierta

> **Estado (2026-11-03):** el dueño aprobó las decisiones de §7 (Luz / Glow, Nutrientes, recoger a mano con
> tope, la 8.ª ruta ↓ Recoger y el reloj que espera). El ADR-030 está en [`DECISIONS.md`](../DECISIONS.md) como
> *Accepted*. Este documento es la copia del plan tal cual se aprobó; los informes del bot (B0–B4) van en el PR de
> PA y en `docs/RITMO.md`.

> **Pedido del dueño:** *«Haz que el juego sea divertido, interactivo y, lo más importante, que cualquiera que lo
> juegue pueda entender qué está haciendo y para qué.»* Antes había dicho: *«un niño no entiende qué es alfa ni cómo
> calibrar»*, partidas cortas (~15 s) que crecen, no castigar nunca por crecer y que cada mejora haga ganar más y más
> rápido. Idea suya pendiente, aprobada ahora: *«la Esencia debería recogerse y hay mejoras para que se recojan por
> pequeñas cositas… pero al inicio se recupera a mano».*

**Rol:** diseñador de juego. Solo lectura sobre el repositorio. **Base:** `main` v0.020 (`c0badf2`).
**Entradas:**
- `qa-claridad/QA-CLARIDAD.md`: QA de caja negra con un jugador nuevo, v0.019, con `log.md` y 206 capturas. Miré
  las 24 capturas clave que cita.
- `CLAUDE.md`, `docs/GDD.md`, `DECISIONS.md` (ADR-022, ADR-024…028; el ADR-029 lo propone la biblia de arte),
  `docs/CICLO.md`, `docs/RITMO.md`, `docs/CLARIDAD.md` y `docs/ESPECIES.md` §5.
- La biblia de arte `realismo/ARTE-REALISTA.md`. Su paquete **P4** (§6.5, §6.8, §6.9, §6.10 y §7.4) queda
  absorbido aquí (§5.7).
- El código que toca cada arreglo.

**Línea base medida** (`npx vite-node scripts/session-bot.ts 80 7` sobre `c0badf2`): los informes están en esta
carpeta, en `bot-before-{planner,greedy,kid}.txt`. §3.1 da los números.

**No se toca:** la regla de Lenia, el detector, «solo paga lo estable», la placa redonda con cristal y la cámara
rápida (ADR-002, ADR-025, ADR-027). Tampoco los archivos de P1, P2 y P3, ni el bucle de incubación y el ritmo de
fotogramas de `main.ts` (el ingeniero de rendimiento).

---

## Índice

0. [Decisiones en una página](#0-decisiones-en-una-página)
1. [El juego en una frase y el bucle de las sesiones 1–6](#1-el-juego-en-una-frase-y-el-bucle-de-las-sesiones-16)
2. [Una decisión por hallazgo](#2-una-decisión-por-hallazgo)
3. [Impacto en el balance](#3-impacto-en-el-balance)
4. [ADR-030 (borrador) y correcciones de la GDD](#4-adr-030-borrador-y-correcciones-de-la-gdd)
5. [Paquetes de trabajo](#5-paquetes-de-trabajo)
6. [Las 10 reescrituras de texto más importantes](#6-las-10-reescrituras-de-texto-más-importantes)
7. [Lo que tiene que decidir el dueño](#7-lo-que-tiene-que-decidir-el-dueño)
8. [Anexo: contratos y claves de texto](#8-anexo-contratos-y-claves-de-texto)

---

## 0. Decisiones en una página

| Tema | Decisión |
|---|---|
| **Frase del juego** | «Siembra criaturas de luz, recoge la luz que hacen y úsala para descubrir las 7 especies de la doctora Albor.» |
| **Monedas** | **Esencia → Luz** (en: *Glow*), porque se ve, brilla y se recoge. **Datos se queda** (encaja con el instrumento, el informe y el sello «REGISTRADO» de la dirección científica). La conversión se ve **durante** la sesión: cada 25 de luz recogida, «+1 Dato» salta al chip de Datos. Se rechaza «Estrellas»: choca con las estrellas del cielo de la Noche, con las cuentas de valor ●●● y con el estilo de laboratorio. |
| **Recoger a mano** | Cada criatura **estable** llena su **gota de luz** con lo que produce. Tocarla (o pasar el dedo por encima) la recoge y la luz vuela al contador. **Nada se pierde**: una gota llena espera y deja de crecer, la luz de una criatura que se apaga se queda en la placa, y al «¡Tiempo!» VELA recoge todo lo que quede. |
| **Ayudantes** | Una ruta nueva del Árbol, **↓ Recoger**, con 6 nodos: **Pipeta** (1 → 3), Pipetas rápidas, Gotas grandes, Más pipetas (→ 8), Pipetas con imán y Pipeta maestra. Las pipetas se ven trabajando en el borde de la placa. Son instrumentos, no seres vivos (pilar 1: la vida es real). |
| **Reloj** | **Se para** mientras VELA habla, mientras hay cualquier hoja o tarjeta abierta (Bestiario, Bitácora, Ajustes, «?», precio, ficha) y en la pausa. El reloj pone «⏸ en pausa». Una sesión nunca termina detrás de una hoja. |
| **Primera sesión** | La placa **empieza vacía**. El jugador pone la primera semilla con un toque: es su primera criatura, nace segura e incuba en oscuro (ADR-027). El **reloj arranca cuando VELA termina** su frase: 15 s de juego de verdad, y la lección de recoger va con el reloj en pausa. |
| **Muertes y fusiones** | Hay un **aviso previo** («¡Cuidado! Se van a tocar», con un enlace rojo que late). La primera fusión o desbordamiento de la partida abre **una tarjeta con pausa** («¡Se juntaron!»). Las siguientes se explican con una etiqueta de 2 s en el sitio. Cada semilla que se apaga dice por qué («muy pegada al cristal», «muy cerca de otra», «no prendió»). |
| **Dedo guía** | **Sí, solo para nadadoras.** Se arrastra desde la nadadora y ella gira hacia el dedo. Usa el mismo giro rígido que ya hace el deflector del cristal (ADR-025): no hay regla de simulación nueva. **Empujar** (trasladar) a las quietas o a las que giran **queda para después**, con medida en CPU antes (§2.5). |
| **Meta visible** | El botón del Bestiario pasa a «**3/7**». Cada tarjeta de mundo dice «Te falta 1 por descubrir» o «✓ Completo: aquí ganas menos Datos», y la sesión elige por defecto un mundo con especies por encontrar. |
| **Abono** | Ya era manual en el código. El «se compró solo» fue un **toque fantasma** a través del globo de VELA, que tapa la barra de abajo. Se arregla con test. Pasa a llamarse **Nutrientes** (propuesta), no sale en la sesión 1, su **precio se congela** en cada sesión («hoy 16, el siguiente 32») y deja de venderse en los últimos 3 s. |
| **Interrupciones** | Cada sesión (desde la 2) tiene un **presupuesto**: como mucho **1 tarjeta con pausa**, solo para un accidente visto por primera vez. Ninguna en los primeros 5 s y ningún globo de diálogo con el reloj en marcha. Lo demás va a una etiqueta breve en la placa y a la **lámina** del informe. **Nunca** se pasan tarjetas a la sesión siguiente. |
| **Resumen** | Es un **informe de laboratorio** y cuenta una historia en orden: lo emocionante primero; luego «Luz recogida 963 ÷ 25 = 38 Datos (ayer 20 ↑)»; luego los premios de descubrimiento («solo la primera vez»); luego los encargos y récords **por su nombre**. Si da menos Datos que ayer, dice por qué y qué hacer. |
| **Árbol** | No se mueve al tocar un nodo si el nodo se ve. Al abrirse, encuadra todo lo que se puede comprar. Cuando la cámara se mueve, ignora los toques 350 ms. Lleva una tira «Puedes comprar (3)». Los textos se arreglan (§2.10). |
| **Color** | **Ámbar con ↑ = cuesta.** **Verde con × o + = premio.** **Gris = no hace nada (×1).** **Rojo = peligro.** La ficha de precio de la semilla se rehace con esta regla y desaparece el «+1 criatura viva → ×m»: parecía un premio y era un recargo del bucle clásico. |
| **Semilla** | **Un solo precio**: «Una semilla cuesta 4 de luz. Siempre.» `SEED_PRICE_STEP` 1,05 → 1. El escalón invisible (4,2 → 4) contradecía el texto. |

---

## 1. El juego en una frase y el bucle de las sesiones 1–6

### 1.1 La frase (para una niña de 9 años)

> **«Siembra criaturas de luz, recoge la luz que hacen y úsala para descubrir las 7 especies de la doctora Albor.»**
>
> en: *"Sow creatures of light, collect the glow they make, and use it to discover all 7 of Dr. Albor's species."*

Esta frase va en tres sitios:
- la última viñeta de la intro (texto de `introScript.ts`; la viñeta es de P3);
- la ayuda «¿Cómo se juega?» de Ajustes;
- la GDD §1 (Corrección v1.4).

**La meta visible es la colección («3/7»). La luz es el medio y los Datos son lo que aprendes por el camino.**

### 1.2 Las tres preguntas que la pantalla siempre contesta

| Pregunta del niño | Dónde la contesta la pantalla |
|---|---|
| **¿Qué hago ahora?** | La barra de meta de arriba: una meta con su **cómo** (§2.8). Una mano solo en la sesión 1. |
| **¿Para qué sirve?** | El contador de **LUZ** (siembras con ella) y el chip **Datos** («38 Datos · próximo en 12 de luz»), que dice en qué se convierte la luz. |
| **¿Cuánto me falta?** | «**3/7**» en el botón del Bestiario y el reloj con su esfera. |

### 1.3 El bucle sesión a sesión, como lo ve el jugador

Los números son aproximados (≈), sacados del bot de v0.020 con la recogida modelada (§3). La tabla describe lo que se
ve. Los paquetes de §5 lo hacen real.

| Ses. | Antes (tarjeta de inicio) | Durante (lo que hace y ve) | Al terminar (informe) | En el Árbol | Lo que aprende |
|---|---|---|---|---|---|
| **1** · 0:15 de juego (+ tutorial sin reloj) | Sin tarjeta. Placa **vacía** y lámpara encendida. El reloj gris dice «0:15 · aún no corre». VELA: «Toca la placa para poner una semilla de luz.» y una mano señala un buen sitio. | Toca. La semilla se abre en un anillo de luz (350 ms) y sale el arco «Naciendo…» (incuba en oscuro ~1 s). Se enciende: **«¡Vive! Es tu primera criatura.»** Luego: «Tu reloj empieza ahora: 15 segundos.» Arranca el reloj. A los ~3 s la gota está madura y la placa se para con suavidad. VELA: **«¡Hizo luz! Tócala para recogerla.»** La mano va a la gota. Toque: *pop*, **«+8 LUZ»** vuela al contador y la placa sigue. Siembra 2–3 más (seguras, `FIRST_SESSION_SURE_SEEDS` = 3) y recoge 10–15 gotas. Si dos se juntan, sale la tarjeta «¡Se juntaron!» con pausa. | «¡Tiempo!» y VELA recoge lo que quedó: «+12». **INFORME · SESIÓN 1**: «¡Especie nueva! Nadadora celeste · +10 Datos (solo la primera vez)». «Luz recogida 70 ÷ 25 = 2 Datos». «Primeros pasos: sembrar ✓ · primera criatura ✓ · recoger luz ✓ · +6». **Total ≈ 18–21 Datos**. «Colección 1/7». | VELA: «Toca el círculo que brilla.» Compra **Pipeta** (2), **Más tiempo** ×2 (2 · 3) y **Gotero** (2). | Sembrar, criatura, luz, recoger. Los Datos se quedan para siempre. |
| **2** · 0:25 | «Sesión 2 · Tienes 0:25 (antes 0:15, gracias a Más tiempo).» «❄ Ya viva: Nadadora celeste» con su retrato; **«¡Empezar!» espera a que se vea en la placa**. Meta: «Ten 3 criaturas vivas a la vez». | La pipeta sale del borde, va a la gota más madura, la sorbe y vuelve. **La ve trabajar**, pero tocar sigue siendo más rápido. Siembra hasta «Placa llena · caben 3». El rato con la placa llena ya no es muerto: hay gotas que recoger. | «Luz recogida 150 ÷ 25 = 6 Datos (**ayer 2 ↑**)». «Hoy no hubo especie nueva (ayer +10).» «**Para descubrir otra: compra Mundo 2 en el Árbol (2 Datos)**». «✓ Ten 3 criaturas a la vez +2». **Total ≈ 9–12**. | Mundo 2 · Frío (2) con el texto «¡Una especie nueva te espera!». Pipeta nivel 2 (4). | Una especie nueva por mundo. Las pipetas ayudan. |
| **3** · 0:30 | El Mundo 2 viene **elegido** («¡Nuevo! · Te falta 1 por descubrir»). | Nace el Anillo verde, quieto y fácil de recoger. Etiqueta breve «¡Especie nueva! +3 s» y el dial retrocede. **Sin tarjeta.** | Arriba, el retrato con su lámina («LÁMINA 06 · Especie nueva»), +10 Datos. Luz ↑. **Total ≈ 20–25**. | Mundo 3 (15) o Pipetas rápidas (15). | Descubrir rinde. Los mundos tienen reglas propias. |
| **4** · 0:35–0:45 | «¡La noche puede avanzar!» en el centro del Árbol; el premio va antes que la condición (§2.10). | **Primer Destello** (desde la sesión 4). La placa se para y VELA dice «¡Ahí! ¡Un Destello! ¡Tócalo!». Es el único globo con el reloj en marcha que queda (paso del tutorial). **Nutrientes** a la venta: «hoy 16 · ×1,25 de luz hasta el final». | Destello «+60 luz» en la fila de Luz. Noche lista. | Noche 2: «+10 % de Datos y mejoras nuevas. Nada se borra». **Tira «Lo más barato ahora»** (§2.10). | La noche es un capítulo y no se pierde nada. |
| **5** · 0:45 | Noche 2 · «7 mejoras nuevas». Mundo 3 · Remolinos elegido. | Remolinos (giran). Un **aviso**: «¡Cuidado! Se van a tocar» con un enlace rojo. Si se funden, sale una etiqueta (la tarjeta ya se vio). Las nadadoras se **guían con el dedo**: primera vez, «Arrástrala para desviarla». | «¡Descubriste el Remolino violeta! +10». «Hoy se juntaron 2: siembra más lejos» (consejo de VELA). | Pipetas con imán (anillo 3) o Más pipetas. | Cuidar a las criaturas (no chocar) también es jugar. |
| **6** · 0:45–0:55 | «Colección 3/7 · la siguiente vive en Mundo 4.» | Pipetas ×3 rápidas; el jugador decide dónde sembrar, cuándo echar Nutrientes y a quién guiar. | Luz ↑ (×1,5–3 por sesión en las noches 1–2, RITMO). | Encargo «Planta una copia» → **Copiar** junto a la semilla (§2.12). | Automatizar sin dejar de jugar. |

**Por qué divierte en 15–30 s** (lo que pedía el dueño):
- El jugador **toca cada 1–2 s**: unos 4–6 toques de siembra y 10–25 de recogida por partida, más el Destello.
- Siempre hay algo que coger. Las mejoras se **ven** trabajar (R6 de RITMO: *Gnorp*, si hay 8 pipetas se ven 8).
- La recogida automática llega poco a poco: 1 pipeta, luego 3, luego rápidas, luego 8. Cada compra hace ganar
  **más y más rápido** (lo pidió el dueño).

---

## 2. Una decisión por hallazgo

**Formato:** **HACER** (se acepta tal cual), **CAMBIAR** (se acepta con otro diseño) o **RECHAZAR**, con el motivo.
Cada texto va en es / en, con dónde sale, cuándo sale y cuándo se va. Los paquetes (PA, PB, PC, PD) están en §5.

### 2.1 Monedas: ¿renombrar?

| Opción | A favor | En contra | Decisión |
|---|---|---|---|
| Esencia → **Luz** | Se ve y se toca (gotas que brillan). Encaja con «Bioluma», con «Te dejo mi luz», con la lámpara del MC-7 y con la bioluminiscencia. Un instrumento de cultivo real **mide luz**. El niño no dirá «agua». | Un barrido de textos (es/en) por todos los módulos. «Luz» ya sale en frases de historia (eso suma). | **HACER** (pendiente del dueño, §7). Inglés: **Glow** («+12 glow/s»). |
| Datos → **Estrellas** | Suena a premio. | Choca con el cielo de la Noche, con las cuentas ●●● (§2.13) y con el **informe de laboratorio** de la biblia de arte (`REGISTRADO`). Un niño no ve por qué las estrellas compran «Más tiempo». | **RECHAZAR.** |
| Datos se queda, **con la conversión a la vista** | El estudiante con tiempo de laboratorio de verdad saca datos de cada experimento (CICLO §3.2). | «Suena a informática» (QA): se arregla con una línea de VELA y con verlo crecer. | **HACER.** |

**UI concreta:**
- **Contador de arriba** (`ui.ts`, PB; con el estilo de instrumento de ARTE-REALISTA §6.8):
  - rótulo `LUZ` / `GLOW` en Mono 13 px con espaciado;
  - la cifra en Inter tabular, avanzando a 8 Hz;
  - debajo, «+12 luz/s» / «+12 glow/s», en enteros (§2.14).
  - Siempre a la vista.
- **Chip de Datos** (barra de abajo, desde la sesión 2): «**38 Datos** · próximo en 12 de luz» / «**38 Data** · next in
  12 glow», con una barrita del 0 al 25.
  - Cuando se completa, un «+1» vuela del contador de luz al chip (`fly.ts`, 450 ms; con *Reducir movimiento*, un
    fundido de 120 ms).
  - Al tocarlo se abre la hoja «¿Por qué?» que ya existe.
- **Primera vez que aparece el chip** (inicio de la sesión 2), una línea de VELA en la tarjeta de inicio: «Cada 25 de
  luz que recoges es 1 Dato. Los Datos no se pierden.» / "Every 25 glow you collect is 1 Data. Data is never lost."
- **El código no cambia de nombre**: `essence`, `Essence…` y el formato de guardado se quedan. Solo cambian los textos
  del jugador. Una guarda de jerga (PA) falla si queda «Esencia» o «Essence» en un `Text` del jugador.

### 2.2 Recoger la luz a mano y las pipetas (idea del dueño, diseño completo)

#### 2.2.1 Qué se toca

| Gesto | Dónde | Qué hace | Desde |
|---|---|---|---|
| **Toque** en una gota o en una criatura que tiene luz | Placa | Recoge **toda** la luz de esa gota, aunque no esté llena (tocar pronto nunca es peor). Hace *pop* y «+N LUZ» vuela al contador. **Nunca siembra.** | Sesión 1 |
| **Pasar el dedo** (arrastre que empieza en un hueco vacío) | Placa | Recoge todas las gotas que el dedo toca por el camino («barrido»). No siembra. | Sesión 1 |
| **Toque** en un hueco vacío | Placa | Siembra, como siempre. | — |
| **Mantener** 400 ms sobre una criatura | Placa | Abre su ficha (antes, el toque corto). | Sesión 1 |
| **Mantener** sobre un hueco vacío | Placa | Semilla grande (si está comprada), como hoy. | Semilla grande |
| **Arrastrar desde una nadadora** | Placa | La guía (§2.5). | Primera nadadora |

El radio de toque de una gota es de **32 px CSS** a cualquier zoom: un círculo de 64 px, por encima del mínimo de 48 px
de `CLAUDE.md`. El radio de una criatura es su contorno más 16 px. Ya no hay conflicto con sembrar: un toque junto a una
criatura ya se rechazaba («Muy cerca»), así que ese toque pasa a recoger y no se le quita nada a la siembra.

#### 2.2.2 Qué pasa si no se toca: un tope, nunca una pérdida

- Cada criatura **estable** llena **una** gota con su propia producción (la fórmula de GDD §5 sin cambios). La gota
  crece pegada a ella y se dibuja con su color.
- La gota guarda como mucho `LIGHT_CAP_SECONDS` = **4 s** de esa producción (6, 8 o 10 s con Gotas grandes).
  - Al **75 %** está **madura**: late y sale «¡Lista!» la primera vez.
  - **Llena, espera**: la criatura deja de llenarla hasta que alguien la recoge. No se resta nada de lo ganado y no
    hay cuenta atrás que asuste.
- **La luz que hizo una criatura nunca se pierde.**
  - Si la criatura se apaga, se funde o se borra, su gota se queda en la placa, suelta, donde estaba, y se puede
    recoger.
  - Al «¡Tiempo!», VELA recoge todas las gotas que queden. Vuelan juntas al contador durante el sello, y el informe
    pone «Recogida final +24».
  - Si la partida se cierra a medias, al cargar se recoge todo.
- **Para los Datos cuenta la luz que se hizo** (recogida a mano, por pipeta o al final). Se mantiene la regla «los
  Datos cuentan la luz ganada, no la guardada», así que gastar nunca castiga.
- **Por qué no «se pierde en 5 s»**, como proponía el QA: perder lo que ya brilla en pantalla castiga a quien mira.
  Con el tope, a quien no toca solo le falta crecer: no ve cómo le quitan nada.
- **Accesibilidad** (Ajustes → Accesibilidad → «Recoger la luz sola» / "Collect glow for me"): equivale a una Pipeta
  de nivel 1 gratis desde la sesión 1. Es para quien no puede tocar a menudo. Viene apagada.

#### 2.2.3 Las pipetas (los «cositas que recogen» del dueño)

- **Qué son:** micropipetas de laboratorio con punta de vidrio y un brillo cian cuando van cargadas. Se dibujan como
  instrumentos, en vector, con el kit de P1 (`vector/*`). **No están vivas**, así que respetan el pilar 1 («si no se ve
  en la placa, no existe»: la vida sigue siendo solo Lenia).
- **Dónde:** descansan en el borde de la placa, repartidas como en una gradilla. Se ven tantas como tienes.
- **Qué hacen:**
  - Cada una va a la gota más madura (≥ 50 % del tope) que ninguna otra haya cogido, la sorbe (la gota encoge dentro
    de la punta en 150 ms) y vuelve.
  - La luz vuela al contador.
  - Un viaje dura `PIPETTE_CYCLE_S` (2,5 s → 1,3 s).
  - El tiempo y el objetivo los decide el juego, de forma determinista (lo ve el bot). La UI solo anima el camino del
    borde a la gota.
- **Nunca te quitan nada:** si tocas tú la gota a la que iba una pipeta, la pipeta elige otra. Tocar a mano siempre es
  más rápido, porque la pipeta tiene que viajar.

#### 2.2.4 La ruta nueva del Árbol: ↓ Recoger (la 8.ª, en la dirección que estaba libre)

Las 7 rutas ocupan ↑ ↗ → ↘ ↙ ← ↖. **↓ está libre**, así que la octava cierra la estrella. Siguen las reglas de CICLO §4.1:
- cadena estricta;
- cada nivel mejora **un** número que se enseña como «antes → después»;
- precio = inicio del anillo × factor^nivel.

El color nuevo lo pide el paso 0 de tokens: propuesta `route.collect`, plata de instrumento (`mat.alu`), con su AA
comprobado.

| # | Nodo (`id`) | Anillo · 🌙 | Niveles | Precios (×factor) | Antes → después |
|---|---|---|---|---|---|
| 1 | **Pipeta** (`pipette`) | 1 · 1 | 3 | 2 · 4 · 8 (×2) | Recoges tú → 1 pipeta → 2 pipetas → 3 pipetas |
| 2 | **Pipetas rápidas** (`pipetteFast`) | 2 · 1 | 3 | 15 · 30 · 60 (×2) | Una gota cada 2,5 s → 2 s → 1,6 s → 1,3 s (por pipeta) |
| 3 | **Gotas grandes** (`dropBig`) | 2 · 1 | 3 | 15 · 30 · 60 (×2) | La gota guarda 4 s de luz → 6 s → 8 s → 10 s |
| 4 | **Más pipetas** (`pipetteMore`) | 3 · 2 | 5 | 400 · 600 · 900 · 1 400 · 2 000 (×1,5) | 3 → 4 → 5 → 6 → 7 → 8 pipetas |
| 5 | **Pipetas con imán** (`pipetteMagnet`) | 3 · 2 | 2 | 400 · 800 (×2) | Una gota por viaje → también las que están a 2 R → a 4 R |
| 6 | **Pipeta maestra** (`pipetteMaster`) | 4 · 3 | 1 | 12 000 (×2) | Las pipetas tardan 1,3 s → la luz llega sola, al momento |

Textos de los nodos:

| Nodo | es | en |
|---|---|---|
| Pipeta | «Recoge la luz por ti.» | "Collects the glow for you." |
| Pipetas rápidas | «Van y vuelven antes.» | "There and back sooner." |
| Gotas grandes | «Cada gota guarda más luz antes de llenarse.» | "Each drop holds more glow before it is full." |
| Más pipetas | «Más manos en la placa.» | "More hands on the dish." |
| Pipetas con imán | «De paso, se llevan las gotas de al lado.» | "They pick up the nearby drops on the way." |
| Pipeta maestra | «Toda la luz llega sola.» | "All the glow arrives on its own." |

#### 2.2.5 Cómo encaja con «solo paga lo estable»

- La gota se llena **solo** mientras el detector dice `stable` y con la misma `eps` de hoy. Una semilla que se forma,
  una mancha sin forma o un laberinto **no tienen gota**.
- La sopa uniforme sigue dando 0: sin criaturas estables no hay gotas. Es el *hard gate* de `CLAUDE.md`, con test.
- La recogida está después de la producción: no toca el campo, ni el detector, ni la simulación.
  Las pipetas son UI y juego.
- *Hard gates* nuevos que propone el ADR-030:
  - «ninguna gota se llena en una criatura que no es estable»;
  - «la luz hecha nunca se pierde: se recoge o se barre al final».

#### 2.2.6 Cómo cambia el bucle de 15–30 s

- **Sesión 1 (15 s, 1–4 criaturas):** unos 2 de luz/s por criatura, gotas de ~8. Se toca cada 1–2 s. Es el primer
  «¡pop!», y es más divertido que mirar un número.
- **Sesiones 2–4:** la primera pipeta ayuda y el niño ve a su ayudante. La placa llena ya no es un rato muerto
  (hallazgo 2.1 del QA).
- **Noches 2–3:** 3–8 pipetas rápidas. El jugador decide **qué** sembrar y **dónde**, **cuándo** echar Nutrientes,
  **a quién** guiar y **cazar el Destello**.
- **Final:** la Pipeta maestra es la ociosidad honrada (pilar 5).

### 2.3 El reloj se para mientras lees

**HACER.** Corrige el ADR-022 en el ciclo de sesiones: hoy «el juego no se pausa por la historia».

| Fuente de pausa (nueva en `main.ts`) | Cuándo | Qué se ve |
|---|---|---|
| `story` | Hay una línea de VELA en pantalla **con la sesión en marcha**. Solo pasa en el tutorial de la sesión 1 y con el primer Destello: §2.8 prohíbe los demás globos con reloj. | La placa se para con suavidad (como un Momento, 0,45 s). El reloj gris pone «⏸». |
| `sheet` | Cajón del Bestiario, Bitácora, Ajustes, ficha de criatura, hoja de precio, guía de maneras de moverse, «?» de la meta o pausa. | Chip «⏸ Reloj en pausa» / "⏸ Clock paused" en la píldora del reloj (`hud.ts`, PD), mientras dure. |
| `moment`, `cards`, `user` | Como hoy. | Como hoy. |

- **Una sesión nunca termina detrás de una hoja.** Pausado, el reloj no puede llegar a 0. Sigue cerrando lo abierto al
  «¡Tiempo!» como hoy (`sessionEnd`, QA4 F-05).
- **Riesgo aceptado:** «abrir el Bestiario para parar el tiempo». Es un juego de un jugador; poder pensar sin prisa es
  justo lo que pide el QA.
- **El reloj sube a la vista:** con «+3 s · especie nueva», el chip se queda **2 s** y el dial retrocede en 300 ms
  (`hud.ts`, PD). Responde a «¿el reloj sube o baja?».

### 2.4 Tutorial de la primera sesión: quién siembra y cuándo arranca el reloj

**CAMBIAR** la propuesta del QA (primera sesión de 45 s): **se mantiene la partida 1 de 15 s de juego, pero el
tutorial no cuenta**.
- **Motivo:** las partidas nunca se acortan (RITMO §6.2). Una sesión 1 de 45 s haría la 2 más corta si el jugador no
  compra tiempo.
- **Con el tutorial fuera del reloj**, el jugador juega 15 s reales y aprende sin prisa, unos 30–40 s de reloj de pared
  en total.

**Flujo exacto** (las líneas tienen ≤ 12 palabras; `script.test.ts` lo vigila):

| Paso | Estado del juego | VELA (es / en) | Qué se ve | Se va cuando |
|---|---|---|---|---|
| 1 | Sesión 1, fase `ready`, placa vacía y **sin criatura de inicio** (solo en la primera sesión de la partida). | «Hola. Soy VELA, el monitor de esta placa.» / "Hello. I'm VELA, this dish's monitor." | VELA MC-7 (P1) en el globo. | Toque en el globo. |
| 2 | Igual. | «Toca la placa para poner una semilla de luz.» / "Tap the dish to drop a seed of light." | Mano animada sobre un hueco libre (`freeSpot`). Píldora «Gratis». | El jugador toca la placa. |
| 3 | El toque planta la **plantilla pura** del mundo en ese punto con `dishSeed`. La fase sigue en `ready` y el **reloj no arranca**. `main.ts` ya incuba sin luz toda semilla puesta en `ready` (`bus.on('dishSeed')`). | «Está naciendo… un momento.» / "It's being born… one moment." | Anillo de luz (350 ms) y arco «Naciendo…» que se llena. | Se enciende (700 ms). |
| 4 | Encendida, estable y registrada como especie (1 250 pasos, ADR-027). | «¡Vive! Es tu primera criatura.» / "It's alive! Your first creature." | Pulso «¡Viva!». | Toque. |
| 5 | Al cerrar esta línea, `game.actions.startClock()`. | «Tu reloj empieza ahora: tienes 15 segundos.» / "Your clock starts now: you have 15 seconds." | El reloj se pone azul y corre. | Sola, a los 2,5 s. |
| 6 | Primera gota al 75 %: pausa `story`. | «¡Hizo luz! Tócala para recogerla.» / "It made glow! Tap it to collect it." | Mano sobre la gota. **La gota se puede tocar con la placa en pausa.** | El jugador recoge (o 6 s → se recoge sola). |
| 7 | Pausa `story`. | «Con 4 de luz pones otra semilla.» / "4 glow buys another seed." | El contador brilla. | Toque. Se reanuda. |
| 8 | Juego libre: 3 semillas seguras. Si pasa un accidente, sale su tarjeta (§2.5). | — | — | — |
| 9 | «¡Tiempo!» | «Recojo la luz que quedó.» / "I'll collect the glow that's left." | Las gotas vuelan al contador. | Informe. |

- **Se borra** «¡Ya estamos! Tu primera semilla, colega.» (la decía sobre una criatura que el jugador no había puesto).
- **Se borran** «Espera… ¡mira!» y su flecha.
- **Si la historia está apagada o se salta el tutorial:** el primer toque siembra la plantilla y arranca el reloj, como
  hoy.
- **Botón «Saltar tutorial»** siempre visible en el globo (existe; se mantiene).

### 2.5 Muertes y fusiones: aviso previo, tarjeta y dedo guía

**HACER** los puntos 1 y 2 del QA, con estos textos y reglas:

| Evento | Detección (pura, PA `src/game/contact.ts`) | Primera vez en la partida | Siguientes veces |
|---|---|---|---|
| **Choque a la vista** (`dangers`) | `predictContacts(creatures, horizon)` con `x, y, vx, vy, r` de `CreatureView`. Se avisa si dos contornos se tocan antes de `CONTACT_WARN_S` = 2 s de placa **y** al menos uno no lo va a desviar el deflector (no es nadadora, está naciendo o va demasiado rápido). | Etiqueta breve (Momento `contact`, sin pausa): «¡Cuidado! Se van a tocar» / "Careful! They're about to touch". Si una es nadadora: «¡Cuidado! Arrástrala para desviarla» / "Careful! Drag it to steer it away". Enlace rojo que late entre las dos (overlay, PB). | Igual, como mucho una vez por pareja. |
| **Fusión** (`creatureExploded`, `cause: 'touch'`) | Ya existe el evento; se añade la causa. | **Tarjeta con pausa** «LÁMINA 03 · ¡Se juntaron!» / "They merged!". Líneas: «Al tocarse, dos criaturas se hacen una mancha sin forma.» · «Sin forma no hay luz. Siembra lejos de las demás.» / "When two creatures touch they become one shapeless blob." · "No shape, no glow. Sow away from the others." | Etiqueta de 2 s en el sitio: «Se juntaron: sin forma no da luz» / "Merged: no shape, no glow". |
| **Placa desbordada** (`dishOvergrown` o lisis) | Existe. | **Tarjeta con pausa** «LÁMINA 20 · ¡Demasiada vida junta!» / "Too much life at once!". Líneas: «Muchas se juntaron y la mancha creció sin parar.» · «VELA limpió la placa. Deja sitio entre criaturas.» | Etiqueta + el aviso actual de desbordada. |
| **Semilla que se apaga** (`creatureDied` de algo que nunca fue estable) | `deathCause()`: cerca del cristal (`rim − d < r + 0,5 R`) → `glass`; cerca de otra (`< 2 R`) → `crowd`; si no → `faded`. | Etiqueta de 2 s: «Se apagó: muy pegada al cristal» / "Went dark: too close to the glass"; «Se apagó: muy cerca de otra» / "Went dark: too close to another"; «Se apagó: no prendió. ¡Prueba otra!» / "Went dark: didn't take. Try another!". Fundido **gris** de 600 ms, **sin confeti de colores** (QA 071). | Igual. |
| **Criatura viva que se apaga** (choque con el cristal, fallo raro del deflector) | Igual (`glass`). | «Chocó con el cristal y se apagó. Su luz sigue ahí.» / "It hit the glass and went dark. Its glow is still there." Su gota queda suelta. | Igual. |

- La **tarjeta con pausa** sale solo la primera vez **en toda la partida guardada**. Ocupa el único hueco de tarjeta de
  la sesión (§2.8). En la sesión 1 cabe aunque esté el tutorial.
- El informe añade un **consejo de VELA** si hubo accidentes: «Hoy se juntaron 2. Siembra más lejos de las demás.» /
  "2 merged today. Sow further from the others."

**Dedo guía (empujar con el dedo): viabilidad comprobada en `src/sim/`**

- **Qué hay hoy.** `src/sim/deflect.ts` ya gira la materia de las nadadoras en un disco alrededor de su centroide:
  - es un giro rígido, de ≤ 60° por actualización del detector;
  - se muestrea igual en GPU (`applyTurns`) y en CPU (`rotateDiscCpu`);
  - mide un 99 % de supervivencia en los choques con el cristal (ADR-025).
  - Lenia no cambia al girar: un giro rígido no hace daño.
- **Guiar** es lo mismo con otra fuente de giro:
  - un nuevo `src/sim/steer.ts` (puro) convierte la petición `{id, heading}` en objetos `Turn`;
  - el giro máximo es de 30° por actualización, más suave que el rebote;
  - **nunca hacia el cristal**: si el rumbo pedido llega al borde antes de poder girar, se recorta a la tangente;
  - el deflector manda: sus giros de cristal tienen prioridad.
  - `main.ts` los junta con los del deflector en `detect()` (6 líneas, §5.4, fuera del bucle de incubación) y se los
    pasa al detector con `noteTurn`, para que la nadadora siga leyéndose como nadadora.
  - **No hay regla de simulación nueva, ni paso de shader nuevo, ni cambio en el detector.**
- **Gesto** (`input.ts`, PB): apoyar el dedo sobre una nadadora y arrastrar más de 10 px. Una línea fina de 1 px
  enseña el rumbo nuevo y la nadadora gira hacia el dedo mientras se arrastra. Primera vez, etiqueta «Arrástrala para
  guiarla» / "Drag it to steer". Las que giran, las quietas y las manchas no se guían (la misma regla del deflector:
  `minSpeed`, `maxCurl`).
- **Empujar (trasladar)** quietas o las que giran: **RECHAZAR por ahora.**
  - Se podría hacer: Lenia tampoco cambia al trasladar, y un desplazamiento de **celdas enteras** de un disco aislado
    es una copia exacta, sin el emborronado bilineal que mata al Anillo (CICLO §4.5).
  - Pero pide un paso `shift` nuevo en `webgl.ts` y en `cpu.ts`, en la carpeta que está tocando el ingeniero de
    rendimiento, y una medida de supervivencia.
  - Queda escrito en el ADR-030 como «después, con prueba de CPU antes».

### 2.6 La meta visible «3/7 especies»

**HACER.**

**Bestiario (barra de abajo).** El botón pasa de «Bestiario» a «**Colección 3/7**» / "**Collection 3/7**", con un anillo
de progreso de 7 marcas. El punto rojo de «nuevo» se queda.

**Tarjeta de inicio (cada mundo):**

| Estado del mundo | es | en |
|---|---|---|
| Faltan especies | «Te falta 1 por descubrir» (con la silueta «?») | "1 still to discover" |
| Completo | «✓ Completo · aquí ganas menos Datos» | "✓ Complete · fewer Data here" |

**Mundo por defecto** (PA): la sesión elige el último mundo elegido **que aún tenga especies por descubrir**. Si todos
están completos, el más nuevo. El jugador puede cambiarlo. Es el hallazgo 36: la sesión 4 en un Mundo 1 ya completo
dio 15 Datos y nadie lo dijo.

**Informe:** «Colección 3/7 · la siguiente vive en el Mundo 4 (Árbol, 400 Datos)» / "Collection 3/7 · the next one
lives in World 4 (Tree, 400 Data)".

### 2.7 Abono → Nutrientes, manual y explicado

**HACER y CAMBIAR:**

1. **Toque fantasma** (hallazgos 17 y 29):
   - **Qué pasaba:** el globo de VELA tapa la barra de abajo. Al cerrarse, el toque siguiente cae en el botón del
     centro, que es el Abono. El juego **no** lo compra solo: `buyBoost` solo lo llama el botón.
   - **Arreglo:** el botón está inerte mientras lo tapa un globo, y durante 350 ms después de que se destape cualquier
     capa. Test e2e primero (§5.3).
2. **Nombre:** «Nutrientes» / "Nutrients" (propuesta, §7). Encaja con el laboratorio y con el icono `nutrient`, y
   cualquier niño la conoce de las etiquetas de comida.
3. **No sale en la sesión 1** (`BOOST_FROM_SESSION` = 2). La sesión 1 enseña semillas, criaturas y luz, y el bot ya
   compraba 0 Abonos en la sesión 1.
4. **Precio congelado por sesión:**
   - se fija cuando sale a la venta: 8 s de tu luz/s de ese momento, como mínimo 10;
   - el siguiente cuesta el doble;
   - **ya no sube solo** al crecer la producción (hallazgo 22).
5. **Fuera de venta en los últimos 3 s** (`BOOST_UNTIL_REMAINING` = 3). El botón dice «Ya no da tiempo» / "No time
   left". Es el hallazgo 8: comprado a 0:01, no servía.
6. **Botón** (barra de abajo, centro; las tres celdas no se mueven nunca):

   | Estado | es | en |
   |---|---|---|
   | Esperando | «Nutrientes · listo en 7 s», con una barra que se llena | "Nutrients · ready in 7 s" |
   | A la venta | «Nutrientes · 16 luz» (precio en ámbar ↑) | "Nutrients · 16 glow" |
   | Sin vida | «Nutrientes · falta vida» | "Nutrients · no life yet" |

7. **Primera vez a la venta**: aviso de un toque sobre el botón (hoy ya hay uno, J-163, que se reescribe), que se va a
   los 7 s o al tocarlo. «Ahora 2 luz/s → con Nutrientes 2,5 luz/s. Hasta el final de la sesión. El siguiente cuesta
   el doble.» / "Now 2 glow/s → with Nutrients 2.5 glow/s. Until the session ends. The next one costs double."
8. **Al comprar:** «+25 %» en verde sale de cada criatura viva (600 ms) y sus gotas se llenan visiblemente más rápido.

### 2.8 Interrupciones: un presupuesto por sesión

**CAMBIAR** el punto 9 del QA (máximo una tarjeta cada 10 s) por una regla más estricta, porque una partida de 15–45 s
aguanta poco.

| Canal | Sesión 1 | Sesión ≥ 2, reloj en marcha | Fuera del reloj (tarjeta de inicio, informe, Árbol) |
|---|---|---|---|
| **Tarjeta con pausa** (Momento) | Las del tutorial (§2.4) + 1 de accidente | **Como mucho 1** (`RUN_CARD_MAX`), solo para un **accidente visto por primera vez**. Nunca en los primeros 5 s (`RUN_QUIET_START_S`). | Sí, en el informe como **láminas** que se abren si el jugador quiere. |
| **Globo de VELA** | Solo el tutorial (con pausa `story`) | **Ninguno**, salvo el primer Destello de la partida (`t_golden`, con pausa) | Sí: tarjeta de inicio, informe, Árbol, Noche. |
| **Globo de Encargo / Comité** | Ninguno (CLARIDAD §3.3) | **Ninguno.** Un Encargo nuevo cambia la barra de meta (sonido corto). Uno cumplido hace brillar la barra: «✓ +2 Datos · +3 s». | El globo completo va en la tarjeta de inicio y el «gracias», en el informe. |
| **Secreto** | Ninguno | Un aviso de ≤ 1,5 s: «Secreto: Viejo amigo» | Su tarjeta, en el informe. |
| **Aviso** (toast) | ≤ 1,5 s | ≤ 1,5 s, separados ≥ 4 s (`TOAST_GAP_S`) | — |
| **Etiqueta breve en la placa** | Sí | Sí, de una en una (regla de ARTE §10) | — |

- **Nunca se pasa nada a la sesión siguiente:** hoy, los Momentos que esperan saltan al empezar la sesión 3 (4 tarjetas
  seguidas, hallazgo 25), porque el bloqueo de partida corta termina con el reloj. Ahora se entregan al informe con
  `moments.drainForSummary()` y la cola se vacía.
- **Lo que hoy tiene tarjeta y pasa a etiqueta + lámina:** especie nueva, «dos especies distintas», maneras de moverse
  y mejora comprada.
- **El Bestiario siempre se abre** cuando el jugador lo toca. La escena `t_bestiary` espera a que se cierre (hallazgo
  16). Test primero.
- **«Saltar todo»**: el «Saltar» del globo, siempre visible. Ya existe y se mantiene.

### 2.9 Un informe de sesión que cuente una historia

**HACER**, con el estilo de «informe de laboratorio» de ARTE-REALISTA §6.9 (PD).

Orden fijo:

```
INFORME · SESIÓN 4 · 03/11 · 02:41                                   ← Mono
¡Descubriste el Remolino violeta!   [retrato + barra de escala + Gyrorbium gyrans]  +10 Datos
   (premio de descubrimiento: solo la primera vez)
Luz recogida ...................... 963
÷ 25 .............................. 38 Datos      ↑ ayer 20
Noche 2 ×1,1 ...................... +4
Premios de descubrimiento (solo la primera vez)
   Especie nueva · Remolino violeta ......... +10
   Manera de moverse nueva · gira ........... +3
Encargos
   ✓ Ten 3 criaturas a la vez ............... +2
   ✓ Atrapa un Destello ..................... +2
Récords
   ✓ Más luz en una sesión .................. +2
Recogida final (VELA) ............. +24 luz (ya está en la luz de arriba)
────────────────────────────────────────────
Total ............................. 61 Datos     [REGISTRADO]
Colección 3/7 · la siguiente vive en el Mundo 4
Láminas de hoy:  [LÁMINA 07 · Dos especies]  [LÁMINA 10 · Gira]      ← las que no se abrieron en la partida
VELA: «Hoy se juntaron 2. Siembra más lejos de las demás.»
[ Ir al Árbol · 3 mejoras listas ]   [ Nueva sesión ]
```

- **Si da menos Datos que la sesión anterior** (hallazgo 36; el bot lo hace en la sesión 2: 21 → 9), una línea con
  fondo neutro, nunca en rojo, debajo del total:
  - «Hoy no hubo especie nueva (ayer +10). Tu luz sí creció: 2 → 6 Datos.» / "No new species today (yesterday +10).
    Your glow grew: 2 → 6 Data."
  - y la acción: «Para descubrir otra: compra Mundo 2 en el Árbol.» / "To discover another: buy World 2 in the Tree."
- **«Primeras metas» pasa a «Primeros pasos»**, con su nombre (hallazgo 9): «sembrar ✓ · primera criatura ✓ · recoger
  luz ✓» / "first steps: sow ✓ · first creature ✓ · collect glow ✓".
- **«7 × 2 encargos»** (hallazgo 24) pasa a **una fila por encargo, con su nombre**. Los objetivos silenciosos que
  `gameGrantOf` contaba como Encargos se separan en «Primeros pasos».
- **La Esencia de inicio** (hallazgo 26: «20» en el resumen frente a 320 en el HUD) se explica en la tarjeta de inicio
  siguiente (PC): «20 luz + 300 de un encargo que cumpliste en el Árbol = 320» / "20 glow + 300 from a request you
  finished in the Tree = 320".
- En las sesiones 1–2, el sello `REGISTRADO` es la única «animación de premio». Nada de confeti sobre la interfaz
  (ARTE-REALISTA §6.9).

### 2.10 El Árbol: no se mueve solo y no se contradice

| Hallazgo | Decisión | Detalle |
|---|---|---|
| 12 · Se desplaza solo, nodos fuera de pantalla, compras sin querer | **HACER** | `select(id)` ya **no** llama a `focusNode` si el nodo se ve entero por encima de la hoja. Si lo tapa, se desplaza **lo mínimo** (16 px dentro), **sin cambiar el zoom**, y al cerrar la hoja la cámara **vuelve a donde estaba**. Al abrir el Árbol, la cámara encuadra todos los nodos comprables y disponibles (Mundo 4 nunca queda en x = −6). Si la cámara se movió hace menos de 350 ms, el toque se ignora. **Comprar solo con el botón de la hoja**, que nombra su nodo; el nodo elegido lleva un aro. |
| 10 · «¡Toca el nodo verde…!» (es azul) | **HACER** | «¡Toca el círculo que brilla! Lo puedes comprar.» / "Tap the glowing circle! You can buy it." Los nodos comprables llevan un aro que late en **su** color. El verde se reserva para «premio» (§2.11). |
| 11 · «Tu aparato ya tiene la placa más grande», con la barra llena y «Cuesta 6» | **HACER** | Nodo con el estado `deviceMax`, sin barra de Datos y sin «Comprar». Línea: «En este móvil la placa ya no crece más. Gasta tus Datos en otra mejora.» / "On this device the dish can't grow any more. Spend your Data on something else." Insignia «✓ Máximo en este móvil» / "✓ Max on this device". |
| «Mejora 1 de 7» y «Nivel 0 de 6» | **HACER** | Un solo contador: «Ruta Placa · paso 1 de 7» / "Dish route · step 1 of 7", y los niveles como puntos ●●○. |
| 13 · «Destello: llega cada 40–45 s» con partidas de 15–25 s | **HACER** | (a) La ruta Destello sale como «?» con «Llega en la sesión 4» hasta que termina la sesión 3 (ya no se compra algo que no hace nada durante 3 sesiones). (b) **Destello frecuente adelanta también el primer Destello** (6–12 s × 0,85^nivel), así se nota en cada partida. Texto: «El primero llega a los 6–12 s → 5–10 s» / "The first one comes at 6–12 s → 5–10 s". |
| 37 · «Noche 2: necesita 4 sesiones y 1 especie» (tiene 3) | **HACER** | El premio va antes que la condición: «Noche 2 · capítulo 2 de la historia. **+10 % de Datos y mejoras nuevas. Nada se borra.**» Después, una línea por condición, con «tienes / hace falta»: «Juega 4 sesiones · llevas 3» y «Especies en tu colección · ✓ tienes 3 (hace falta 1)». |
| 38 · Tras la Noche 2 todo cuesta 400 y tiene 18 | **CAMBIAR** | (a) **Tira «Puedes comprar (n)»** abajo del Árbol: la lista horizontal de comprables (toque = foco). Si no hay ninguno: «Lo más barato: Reloj grande · 30 Datos · unas 2 sesiones». (b) **Experimento de balance**: inicio del anillo 3 a 400, 250 y 200 con el bot (§3.3). No se cambia sin el informe. |
| Comprar un Mundo no lleva al mundo | **HACER** | Tras comprarlo, «Nueva sesión» late con «¡Juega en el Mundo 2!» / "Play in World 2!" y la tarjeta de inicio lo trae elegido (ya lo hace `researchBuy`) y marcado. |
| «Un anillo con un agujero» (¿el mundo o la criatura?) | **HACER** | «Aquí vive: el Anillo verde, un anillo con un agujero.» / "Lives here: the Green Ring, a ring with a hole." |
| «¿Por qué cuesta esto?» es para adultos | **HACER** | Primera línea en palabras: «Empieza en 2 Datos; cada nivel cuesta el doble.» La ecuación queda debajo, en «ver cuentas». |
| «Lista vertical en vez de árbol» (propuesta del QA) | **RECHAZAR** | El árbol con ramas lo pidió el dueño (CICLO). La tira «Puedes comprar» da la lista sin quitar el árbol. |

### 2.11 Regla de color coste / premio y la ficha del precio de la semilla

**HACER.** Es una regla para toda la interfaz; la piden los tokens semánticos al paso 0: `--bl-cost`, `--bl-gain`,
`--bl-off` y `--bl-danger`.

| Significado | Color | Signo | Ejemplos |
|---|---|---|---|
| **Cuesta** | Ámbar (`ink.amber` / `warn`) | **↑** o el precio | «4 luz», «Nutrientes · 16», «Cuesta 30 Datos» |
| **Premio / bonus** | Verde (`good`) | **×** o **+** | «+25 %», «−15 % · Semillas baratas ↓» (un descuento es un premio), «+10 Datos» |
| **No hace nada** | Gris (`text3`, trazo `hair`) | ×1 | Factores inactivos en las cuentas |
| **Peligro** | Rojo (`ink.red`) | ! | El aviso de choque y el LED de alarma de VELA |

**La ficha «¿Cuánto cuesta sembrar?»** (PD; se juntan `src/ui/seed-price.ts` y `src/ui/moments/seedprice.ts`, que hoy
están duplicados):

```
Precio de la semilla
4 luz          × 0,85 ↓        = 3 luz
base           Semillas baratas  (en verde: es un descuento)
Una semilla cuesta lo mismo toda la sesión.
Huecos  ◉ ◉ ◉ ○   caben 1 más        ← pocillos de una placa multipocillo (ARTE-REALISTA §6.9)
```

- **Se borran** `rsAlive1` y `rsAliveN` («+1 criatura viva → ×m»), en sus dos copias, y la ficha `crowd`.
  - En sesiones, las vivas **nunca** suben el precio.
  - El dueño la leía como un premio y era un **recargo** del bucle clásico (`crowdMult`).
  - Test primero: «ninguna explicación de precio del ciclo de sesiones nombra a las criaturas vivas como un coste».
- **«Cada semilla que compras hoy cuesta un poquito más» se borra**, y con ella el escalón (`SEED_PRICE_STEP` = 1,
  §3.2). El texto mentía porque el redondeo amable dejaba 4,2 en 4.
  - Texto nuevo, fijo: «Una semilla cuesta 4 de luz. Siempre.» / "A seed costs 4 glow. Always."
- **El chip de cambio** (`PriceTicker`) solo sale cuando de verdad cambia algo: «GRATIS ↓», «−15 % ↓». Lleva el estilo
  de etiqueta de rotuladora de ARTE-REALISTA §6.9.

### 2.12 Copiadora, Nevera y herramientas: que se vea dónde se usa lo que compras

| Hallazgo | Decisión | UI |
|---|---|---|
| 39 · Copiadora sin botón de copiar | **HACER** | Botón **«Copiar»** / "Copy" en la píldora de siembra (PB) cuando se tiene la Copiadora. Abre una tira con las especies **de este mundo** que hay en la colección. Toque: modo copia («Toca dónde poner la copia», que ya existe). Si no hay ninguna de este mundo: «Copiar · ninguna de este mundo todavía» (gris). El Encargo «Planta una copia» dice **cómo**: «Toca «Copiar» junto a la semilla. Necesitas la Copiadora (Árbol, 15 Datos).» Hoy el botón solo está en la ficha del Bestiario, y no sale si la especie vive en otro mundo o la sesión terminó (`copyBlocked`). |
| 14 · «Ya viva: 1 criatura (nevera)» con la placa vacía | **HACER** | La tarjeta de inicio pone su retrato: «❄ Sale de la nevera: Nadadora celeste». **«¡Empezar!» espera a que la placa esté encendida**, con el texto «La criatura se está despertando…» y el progreso. En la placa, una etiqueta de 2 s «❄ de la nevera». |
| 14b · «1 siembra gratis» (¿sembrar cuesta?) | **HACER** | «1 semilla gratis · las demás, 4 de luz» / "1 free seed · others 4 glow". |
| 35 · Goma «Toca para borrar» | **CAMBIAR** | La Goma y la escoba solo salen cuando hay **materia sin forma** en la placa. Rótulo la primera vez: «Goma: quita manchas sin forma» / "Eraser: removes shapeless blobs", y «Limpiar placa: mantén pulsado» / "Clean dish: press and hold". |
| 41 · «Pincel» arriba a la derecha que no hace nada | **HACER** | Es la escoba de «Limpiar placa», que pide mantener pulsado. Mismo arreglo: oculta sin materia sin forma, y con rótulo. |
| 200 · «Da +0/s» en una criatura VIVA | **HACER** | Si el reloj aún no corre: «Empieza a dar luz cuando arranque el reloj» / "Starts making glow when the clock starts". |

### 2.13 Bestiario y números: fuera los decimales y el latín sin rótulo

| Hallazgo | Decisión | UI (PB `modals.ts` ficha · PD `species-card.ts`) |
|---|---|---|
| 18 · «×1,6 · ×1,1 · ×1,65 = ×2,91 si estuviera viva» | **CAMBIAR** | «Da luz: ●●●○○» (5 cuentas: la posición entre las 7 especies según lo que paga cada una, CICLO §4.3) + «Viva, casi ×3 con tus mejoras» / "Alive, almost ×3 with your upgrades". La cadena exacta, detrás de «Ver cuentas» / "Show the maths" (cerrado de serie). |
| Nombres latinos | **HACER** | Debajo del nombre común, en Fraunces cursiva y pequeño, con el rótulo «nombre científico» / "scientific name". Encaja con las láminas de ARTE-REALISTA §6.5. |
| «Le ayudan: Afinidad sésil / nadadora» | **HACER** | Los nombres reales de los nodos: «Le ayuda en el Árbol: Tranquilas» / "Helped in the Tree by: Calm ones", y «Nadadoras». Al tocarlo se abre ese nodo. |
| 27 · Tarjeta «¡Gira!» con «Cómo mejorarla: Nadadoras +15 %» | **HACER** | El nodo Nadadoras también sube a las que giran (GDD §8: «nadadora o giratoria»). Su valor pasa a «Nadadoras y las que giran +15 %» / "Swimmers and spinners +15 %". |
| 33 · Estadísticas «Todo da ×2,71», «Premio ahora ×1,00» | **HACER** | «Tus mejoras: casi ×3 de luz» / "Your upgrades: almost ×3 glow". «Premio ahora» se oculta cuando es ×1. «Comportamientos vistos» pasa a «Maneras de moverse vistas · 3 de 6». |
| «Late» ambiguo | **HACER** | Con su icono de corazón y, la primera vez, «late como un corazón» / "beats like a heart". |
| Multiplicadores decimales en general | **HACER** | Regla de `format.ts` (PD): en el flujo principal, ×N entero o «casi ×N» (si redondea hacia arriba más de 0,05). Los decimales, solo en «Ver cuentas». Los ritmos ≥ 1 en enteros («+12/s»); por debajo de 1, un decimal. |
| Miniaturas borrosas (027, 167) | **HACER** | Retrato capturado a 2× DPR y como «foto de espécimen» con barra de escala (ARTE-REALISTA §6.9). |

### 2.14 Lo visual

| Hallazgo | Decisión | Paquete |
|---|---|---|
| Un cuarto de pantalla vacío bajo la placa (105, 117, 138) | **HACER**: la píldora de siembra sube junto a la placa y la placa crece hasta ocupar el hueco. Se comprueba en 360 × 640, 390 × 844 y 1366 × 768. | PB |
| Etiquetas despegadas de su criatura (186, 205) | **HACER**: se anclan al `track` del mismo cuerpo, ya en uso para el foco. Test. | PB |
| «+4,1/s» con un «1» fantasma (083) | **HACER**: pool de números flotantes que borra el anterior. Además, la recogida sustituye a los «+N» periódicos. | PB |
| Barra de abajo descolocada al comprar Abono (143) | **HACER**: tres celdas fijas. Test de capas. | PB |
| Cuatro voces para dar instrucciones | **HACER**: (1) **caja de VELA** como instrumento: borde de 1 px `plate.rule` y placa `VELA · MC-7` en Mono (ARTE-REALISTA §6.10); (2) **láminas** para explicar; (3) **etiquetas de rotuladora** para avisos y chips; (4) el **télex del Comité**, como cita dentro de la caja de VELA. | PC (caja), PD (láminas, etiquetas) |
| Ajustes → Historia: blanco sobre claro (158/159) | **HACER**: los tokens de texto pasan AA. Los finales que no se han visto salen como «???» (no «Cosecha / Ley / Memoria / Marea»), con la línea «La historia tiene 4 finales.» / "The story has 4 endings." | PC |
| Textos cortados («El Destello te regala 10 s de tu Esencia: +10…») | **HACER**: textos cortos que caben en 360 px: «¡Destello! +60 luz» / "Spark! +60 glow". | PA (texto), PB (aviso) |
| Iconos sin rótulo (semilla «ó», «i») | **HACER**: rótulo visible o `aria-label` + un toque = rótulo. | PB |
| «v0.019 · 669f058» y «Lenia © Bert Chan · MIT» en el título | **CAMBIAR → se pasa a P3/integrador** (`splash.ts` es de P3): la versión va a Ajustes → Acerca de. En el título queda «Criaturas Lenia, de Bert Chan» / "Lenia creatures by Bert Chan" y la licencia en Créditos (regla 10: la atribución se mantiene). | P3 |
| Intro: 11 viñetas, 4 de reglas | **CAMBIAR**: PC acorta en `introScript.ts` el texto de las viñetas de reglas a una línea cada una. **Se pide a P3** quitar las viñetas `essence`, `clock` y `tree` (se enseñan jugando). | PC + P3 |
| 3 · «Te dejo mi luz. Cuídalas mucho» | **HACER**: «Te dejo mi luz y mis criaturas. Cuídalas mucho.» / "I leave you my light and my creatures. Take good care of them." | PC |

### 2.15 Los 41 hallazgos de la línea de tiempo, de un vistazo

| # | Decisión | Dónde | # | Decisión | Dónde |
|---|---|---|---|---|---|
| 1 | Cambiar (versión a Ajustes; atribución llana) | P3 | 22 | Hacer (precio congelado; meta con cómo) | §2.7, §2.8 · PA, PC |
| 2 | Cambiar (texto corto; pedir a P3 quitar 3 viñetas) | §2.14 · PC | 23 | Hacer («?» = cómo + quién es el Comité) | §2.8 · PC |
| 3 | Hacer | §2.14 · PC | 24 | Hacer (encargos con nombre) | §2.9 · PA, PD |
| 4 | Hacer (el jugador siembra la primera) | §2.4 · PA, PC | 25 | Hacer (nada pasa a la sesión siguiente) | §2.8 · PC |
| 5 | Hacer (Nutrientes desde la sesión 2; cada «+N» con su motivo; «Caben 2 más») | §2.7, §6 · PA, PB | 26 | Hacer (de dónde sale cada luz de inicio) | §2.9 · PA, PC |
| 6 | Hacer (se borra «Espera… ¡mira!») | §2.4 · PC | 27 | Hacer | §2.13 · PA |
| 7 | Hacer (reloj fuera del tutorial) | §2.3, §2.4 · PC | 28 | Hacer (tarjeta de fusión) | §2.5 · PA, PB, PC |
| 8 | Hacer (no a la venta en los últimos 3 s) | §2.7 · PA | 29 | Hacer | §2.14 · PB |
| 9 | Hacer (Primeros pasos con nombre) | §2.9 · PA, PD | 30 | Hacer (aviso + tarjeta) | §2.5 |
| 10 | Hacer | §2.10 · PC, PD | 31 | Hacer | §2.14 · PA, PB |
| 11 | Hacer | §2.10 · PA, PD | 32 | Hacer (causa de cada apagado) | §2.5 · PA, PC |
| 12 | Hacer | §2.10 · PD | 33 | Hacer | §2.13 · PB |
| 13 | Hacer | §2.10 · PA | 34 | Hacer | §2.14 · PC |
| 14 | Hacer | §2.12 · PA, PC | 35 | Cambiar (solo con manchas) | §2.12 · PB |
| 15 | Hacer («?» = cómo) | §2.8 · PC | 36 | Hacer (mundo por defecto + informe) | §2.6, §2.9 |
| 16 | Hacer (el Bestiario siempre se abre) | §2.8 · PC | 37 | Hacer | §2.10 · PA, PD |
| 17 | Hacer (toque fantasma) | §2.7 · PB | 38 | Cambiar (tira + experimento con el bot) | §2.10, §3.3 |
| 18 | Cambiar (cuentas ●) | §2.13 · PB, PD | 39 | Hacer (botón Copiar + encargo posible) | §2.12 · PB, PC |
| 19 | Hacer (pausa con hojas; «+3 s» visible) | §2.3 · PC, PD | 40 | Hacer | §2.3 · PC |
| 20 | Hacer (toque rechazado sin flor; apagado en gris) | §2.5 · PB | 41 | Hacer | §2.12 · PB |
| 21 | Hacer (un precio; la luz ya no sobra porque se recoge) | §2.11 · PA, PD | | | |

**Tramos muertos (QA §2):**
1. Placa llena → recoger y guiar (§2.2, §2.5).
2. Mundos quietos → el Anillo quieto es la criatura más fácil de recoger; además, Nutrientes y Destello.
3. Intro y tutorial → §2.4 y §2.14.
4. Repetir un mundo completo → §2.6.
5. Muro de la Noche → §2.10 y §3.3.
6. Sembrar siempre igual → decidir dónde (lejos), recoger, guiar, copiar y Nutrientes.

**Feedback que falta (QA §3):** cubierto en §2.5, §2.7, §2.9, §2.12 y §2.14. Además, **cada luz que entra en la
cartera sin ser una gota lleva su motivo** junto al contador: «+5 · primera semilla», «+60 · Destello», «+12 ·
encargo». Hoy el contador salta de 20 a 34 sin decir por qué (hallazgo 5). Lo hace el evento `luzGift`.

**Las 15 mejoras del QA (§6):**

| # | Decisión |
|---|---|
| 1 | Hacer (§2.5) |
| 2 | Hacer, cambiando «se pierden» por el tope (§2.2), y el dedo guía solo para nadadoras (§2.5) |
| 3 | Cambiar: 15 s, pero el tutorial no cuenta (§2.4) |
| 4 | Hacer (§2.8) |
| 5 | Hacer (§2.6) |
| 6 | Luz sí, Estrellas no (§2.1) |
| 7 | Hacer (§2.7) |
| 8 | Hacer (§2.3) |
| 9 | Hacer, más estricto (§2.8) |
| 10 | Hacer, con la tira en vez de la lista (§2.10) |
| 11 | Hacer (§2.9) |
| 12 | Hacer, con cuentas ● en vez de estrellas (§2.13) |
| 13 | Hacer (§2.12) |
| 14 | Hacer (§2.10, §2.11, §2.12, §2.13) |
| 15 | Hacer y experimento (§2.10) |

---

## 3. Impacto en el balance

### 3.1 Línea base medida (v0.020, `c0badf2`, `session-bot.ts 80 7`)

| Política | S1 | Primera compra | Crecimiento noches 1–2 | Final de la historia | REGLA DURA (bajones de la mediana) | Otros |
|---|---|---|---|---|---|---|
| planner | 72 Esencia · 21 Datos · 4 compras | 27 s | ×1,78 | S44 ≈ 1,80 h | **0** ✅ | **FALLA «≥ 2 compras tras cada sesión» (mín. 1, en S11 y S46)**. Datos S1–S6: 21 · 9 · 20 · 16 · 24 · 80. La sesión 2 da menos Datos que la 1: el bajón que se nota (§2.9). |
| greedy | 72 · 21 · 9 | 27 s | ×2,17 | 1,82 h | — | mín. 2 compras ✅ |
| kid | 72 · 21 · 7 | 27 s | ×1,46 | 1,35 h | 15 bajones (vuelve a mundos viejos al azar) | noche 3 en S12 ✅ |

### 3.2 Números que cambian (propuesta, estilo `cycleBalance.ts`)

```ts
// ───────────────────────────── Luz: by hand first, then pipettes (ADR-030) ──
/**
 * A stable creature fills its own drop of light with its production; the drop holds at most this many
 * seconds of it and then waits (nothing made is ever lost: it is collected by hand, by a pipette, or swept
 * at "¡Tiempo!"). [owner: "la Esencia debería recogerse… al inicio a mano"; design: one tap per creature
 * every few seconds in a 15 s run; bot: capped production ≤ 10 % for the planner in S1–S5]
 */
export const LIGHT_CAP_SECONDS = 4;
/** Gotas grandes: cap by level (index = level). [design; bot] */
export const LIGHT_CAP_BY_LEVEL = [4, 6, 8, 10];
/** A drop is "ripe" (pulses, "¡Lista!" the first time) at this share of its cap. [design] */
export const LIGHT_RIPE_SHARE = 0.75;
/** Touch radius of a drop in CSS px at any zoom: a 64 px target, above CLAUDE.md's 48 px. [design] */
export const LIGHT_TAP_RADIUS_PX = 32;
/** Collect pop and flight to the counter (reduceMotion: a 120 ms fade). [design; RITMO §4.4] */
export const LIGHT_POP_MS = 150;
export const LIGHT_FLY_MS = 450;
/** Pipeta: pipettes by level (index = level); Más pipetas adds PIPETTES_MORE_PER_LEVEL per level (→ 8). [owner: "más cositas"] */
export const PIPETTES_BY_LEVEL = [0, 1, 2, 3];
export const PIPETTES_MORE_PER_LEVEL = 1;
/** Seconds of one pipette trip (go, take, come back), by Pipetas rápidas level; Pipeta maestra = 0. [owner: "más rápidas"; bot] */
export const PIPETTE_CYCLE_S = [2.5, 2.0, 1.6, 1.3];
/** A pipette only goes for a drop holding at least this share of its cap (no sipping empty drops). [design] */
export const PIPETTE_MIN_SHARE = 0.5;
/** Pipetas con imán: a trip also takes every drop within this many kernel radii R of its target, by level. [design] */
export const PIPETTE_MAGNET_R = [0, 2, 4];

// ───────────────────────────── Seeds (changed) ─────────────────────
/** One seed price for the whole session ("Una semilla cuesta 4 de luz. Siempre."). Was 1.05: the friendly
 * rounding hid the first steps (4.2 → 4) and the sheet said "a bit more" while showing 4 (QA-CLARIDAD #21). [owner; bot] */
export const SEED_PRICE_STEP = 1;

// ───────────────────────────── Nutrientes (Abono, changed) ─────────
/** Not on sale in session 1, which teaches seeds, creatures and light (the planner bought 0 there anyway). [CLARIDAD §3.3; bot] */
export const BOOST_FROM_SESSION = 2;
/** Its price is set once per session, when it goes on sale (BOOST_SECONDS of the Luz/s of that moment,
 * at least BOOST_MIN_COST), ×BOOST_GROWTH per one bought: it never rises on its own (QA #22). [design; bot] */
// (rule in session.ts boostCost; BOOST_SECONDS, BOOST_MIN_COST, BOOST_GROWTH unchanged)
/** Off sale in the last N seconds: bought at 0:01 it did nothing visible (QA #8). [design] */
export const BOOST_UNTIL_REMAINING = 3;

// ───────────────────────────── Destello (changed) ──────────────────
// Destello frecuente now also shortens SESSION_GOLDEN_FIRST_DELAY by GOLDEN_INTERVAL_FACTOR^level, so it is
// felt in 15–45 s runs (QA #13). The route shows "?" until session SPARK_FROM_SESSION − 1 ends (tree.ts rule).

// ───────────────────────────── Interruptions (new; replaces MOMENT_MIN_RUN_SECONDS) ──
/** Pausing cards per running session from session 2: one, and only for an accident seen for the first time. [QA-CLARIDAD #25; design] */
export const RUN_CARD_MAX = 1;
/** No card in the first seconds of a run. [QA §6.9] */
export const RUN_QUIET_START_S = 5;
/** Seconds between two toasts in a run (each ≤ SESSION_TOAST_MAX_MS). [design] */
export const TOAST_GAP_S = 4;
/** Collision warning horizon, seconds of dish time. [design: one swerve of the deflector plus a reaction] */
export const CONTACT_WARN_S = 2;

// ───────────────────────────── Experiment (bot decides) ────────────
// TREE_RING_START[3]: 400 (today) vs 250 vs 200 — keep the smallest that holds the HARD rule and ends the story ≥ 1.5 h.
```

**Lo que no cambia:**
- `SESSION_BASE_SECONDS` 15, `PREINCUBATE_STEPS` 1 250, `SESSION_SIM_PACE` 1,5, `DATOS_ESSENCE_DIV` 25 y
  `DATOS_PER_NEW_SPECIES` 10;
- las puertas de noche y los precios de los anillos 1, 2, 4 y 5;
- `FIRST_SESSION_SURE_SEEDS` 3 y `STARTER_CREATURES` 1. En la sesión 1, la criatura de inicio la planta el toque del
  jugador; desde la 2, como hoy.

**Lo que se retira:**
- `MOMENT_MIN_RUN_SECONDS` (60), que pasa a `RUN_CARD_MAX`;
- `SEED_PRICE_STEP_MAX`, que queda sin uso;
- `SESSION_INCOME_POP_INTERVAL` en sesiones: la recogida lo sustituye, pero se mantiene para el bucle clásico.

**Bot (`scripts/sessionBotCore.ts`, PA): modelo de recogida.**
- La placa del bot lleva una gota por criatura estable, con su tope.
- Políticas:

  | Política | Cómo recoge |
  |---|---|
  | planner / greedy | Recogen toda gota ≥ 75 % con 0,3 s de retraso, con un tope de **3 toques/s** a mano (más 1 por semilla). |
  | kid | Cada 0,8 s toca una gota al azar (p = 0,7). |
  | **idle** (nueva) | Nunca toca: solo pipetas. Es la prueba de «nunca castigar». |

- Columnas nuevas: `hand % · pipette % · swept % · capped s` (segundos de producción perdidos por gotas llenas).

### 3.3 Corridas del bot que hacen falta (antes y después; `CLAUDE.md` regla 2)

| # | Cuándo | Comando | Qué se mira |
|---|---|---|---|
| B0 | **Hecha** (§3.1) | `npx vite-node scripts/session-bot.ts 80 7 --policy={planner,greedy,kid}` | La línea base. |
| B1 | PR «recogida» de PA (solo recogida y ruta Recoger, nada más) | La misma, + `--policy=idle` y `--runs` | El efecto aislado del tope y de las pipetas. |
| B2 | PR «precios claros» de PA (`SEED_PRICE_STEP` 1, Nutrientes congelado y desde la sesión 2, Destello frecuente adelanta el primero, ruta Destello oculta hasta la sesión 3) | Igual que B1 | El efecto de cada regla, una a una si alguna puerta falla. |
| B3 | Experimento del anillo 3 | B2 con `TREE_RING_START[3]` = 400, 250 y 200 | Se elige el más barato que cumple todo. |
| B4 | Antes de fusionar (integrador) | B2/B3 final, con 15 corridas el planner | La regla dura con más muestras (RITMO lo hizo así). |

**Puertas que el informe tiene que cumplir:**

| Puerta | Meta |
|---|---|
| **REGLA DURA (planner, mediana)** | 0 bajones de luz entre sesiones (B0: 0). |
| Sesión 1 (planner) | ≥ 60 luz, ≥ 15 Datos, ≥ 3 compras; primera compra ≤ 45 s tras el primer toque (el bot no modela el tutorial, que no lleva reloj). |
| ≥ 2 compras tras cada una de las 10 primeras sesiones (planner) | Se mantiene (B0: OK). El «mín. 1» de S11/S46 **no empeora**; se anota. |
| Noches 2/3/4/5 en S4/S8/S13/S20 (planner) | Se mantiene. |
| Final de la historia (planner y greedy) | 1,5–2,2 h. |
| Producción perdida por gotas llenas (planner) | ≤ 10 % en S1–S5; ≤ 3 % desde que tiene Pipetas rápidas. |
| idle | Nunca < `DATOS_MIN`; su luz **no baja nunca** (mediana) desde su primera Pipeta. Llega a la noche 3 antes de S16. |
| kid | Luz ≥ 60 % del planner en S1–S5; noche 3 en S12 (se mantiene). |
| Primera compra del anillo 3 tras la Noche 2 (B3) | ≤ 3 sesiones (planner y kid). |
| Crecimiento noches 1–2 (planner) | ×1,5–3 (B0: ×1,78). |

**Documentos que se actualizan con el informe** (PA):
- CICLO §2.3 y §4.2 (tablas con `scripts/tree-table.ts`, ruta Recoger incluida);
- RITMO §4.4 y §6;
- una sección nueva «Recoger» en RITMO, con antes y después.

---

## 4. ADR-030 (borrador) y correcciones de la GDD

### 4.1 ADR-030 (English, house format)

```markdown
## ADR-030: Collected light, a clock that waits for the player, and explained accidents (clarity pass 2)

- **Status:** Proposed (2026-11-03). Source: owner ("divertido, interactivo y que cualquiera entienda qué está haciendo
  y para qué"; "la Esencia debería recogerse… al inicio a mano"), black-box QA of v0.019
  (QA-CLARIDAD: 41 findings, 4 blocking), plan `docs/CLARIDAD2.md` (this plan, copied to docs/).
  Amends ADR-022, ADR-025, ADR-026, ADR-027 and RITMO §2 rule 7.
- **Context:** a naive player of v0.019 does not know what to achieve, does not understand why creatures die, and spends
  half of every run watching: the tutorial's lines run on the clock (session 1 is gone before the player acts), the
  explanations wait for the summary (`MOMENT_MIN_RUN_SECONDS`) and then all land at the start of the next run, the clock
  runs behind the Bestiary, fusions empty the dish without a word, and a full dish leaves nothing to do. The owner
  green-lit collecting the currency by hand, with upgrades that add collectors.
- **Decision:**
  - **Currency names:** the in-run currency is shown as **Luz / Glow** (code ids stay `essence`); **Datos** stays.
    Every 25 Luz collected visibly ticks one Dato on the Datos chip.
  - **Collection:** a stable creature fills its own drop with its production (GDD §5 formula unchanged); the drop holds
    at most `LIGHT_CAP_SECONDS` of it and then waits. A tap or a swipe collects; tap on a creature = collect, long press
    = its card. Light made is never lost: a dead creature's drop stays on the dish; everything left is swept at "¡Tiempo!"
    and on load. Datos count light made. Uniform soup, forming seeds, blobs and mazes have no drop.
  - **Pipettes:** an 8th straight route, **↓ Recoger** (6 nodes: Pipeta, Pipetas rápidas, Gotas grandes, Más pipetas,
    Pipetas con imán, Pipeta maestra), same price rule and "before → after" rule as ADR-026. Pipettes are drawn as lab
    instruments, never as living things (pillar 1); the game decides their trips deterministically.
  - **Clock:** in a running session the dish and the clock pause while VELA has a line on screen (only the session-1
    tutorial and the first Spark may speak during a run) and while any sheet is open (Bestiary, journal, settings, help,
    price, creature card). Amends ADR-022 ("the game does not pause for the story") for the sessions cycle.
  - **Session 1:** the first-ever session starts on an empty dish; the player's first tap plants the sure template,
    which incubates unlit (ADR-027 v0.019 path) while the session is still `ready`; the clock starts when VELA's line
    after it closes (`startClock`). Run length stays 15 s of play.
  - **Interruptions:** from session 2, at most one pausing card per run (`RUN_CARD_MAX`), only for an accident seen for
    the first time, never in the first `RUN_QUIET_START_S`; other Momentos become brief labels and summary plates;
    nothing is carried to the next run. Replaces `MOMENT_MIN_RUN_SECONDS`.
  - **Accidents:** collisions are predicted from creature views (`src/game/contact.ts`) and warned; fusions,
    overgrowth and failed seeds are explained with their cause.
  - **Finger steering:** the player may steer a swimmer by dragging from it. `src/sim/steer.ts` emits rigid rotations
    of the same kind as the glass deflector (≤ 30° per detector update, never into the glass, the deflector's rim turns
    first), applied by the existing rotate pass and told to the detector. No new simulation rule. Translating
    non-swimmers (whole-cell shifts, exact by translation invariance) is **not** adopted; it needs a CPU survival
    measurement and a new pass first.
  - **Prices:** one seed price per session (`SEED_PRICE_STEP` = 1); the Nutrientes (Abono) price is set when it goes on
    sale and only doubles per purchase; not on sale in session 1 nor in the last 3 s. Colours: amber ↑ = cost,
    green ×/+ = gain, grey = inactive, red = danger.
  - **Tree reveal:** the Destello route shows "?" until session 3 ends; Destello frecuente also shortens the first
    Spark of a run.
- **Consequences:**
  - CLAUDE.md hard gates gain: "No light drop fills on a creature that is not stable" and "Light made is never lost:
    collected, or swept at the end". The update rule, the detector and "only stable pays" are unchanged.
  - The session bot models drops and collection and gains the `idle` policy; every balance PR of this plan carries
    before/after reports (B0–B4).
  - GDD v1.4 notes at §1, §2, §3, §5, §6, §7, §8, §9, §13, §20 and a new §23.5; CICLO §2–§4, RITMO §2 and §4.4, and
    CLARIDAD §2–§3 are updated; the tree has 59 buyable nodes on 8 routes.
  - Contracts: optional additions only (types.ts, bus.ts), listed in the plan's annex; no removal.
  - Save format v2 gains optional session fields (drops, pipettes); a save mid-run sweeps its drops on load.
```

### 4.2 Correcciones de la GDD («Corrección v1.4, ADR-030»)

| Sección | Qué dice la nota (en español, en el sitio) |
|---|---|
| Cabecera, tabla «Correcciones v1.2 y v1.3» | Fila nueva **v1.4 · ADR-030**: luz que se recoge, pipetas, el reloj espera al jugador, accidentes explicados. |
| §1 «En una frase» | La frase nueva de §1.1. El pilar 4 («un pulgar basta… sin precisión fina») se cumple con un toque de 64 px y el barrido. El pilar 5 («idle honesto»): las pipetas. |
| §2 Glosario | **Luz** (antes Esencia, solo en pantalla), **gota de luz**, **pipeta** y **Nutrientes** (antes Abono). |
| §3 (nota ADR-022) | «El juego no se pausa por la historia» → en el ciclo de sesiones, el reloj y la placa se paran mientras VELA habla, y con la sesión en marcha solo habla en el tutorial y con el primer Destello. |
| §5 «Esencia: producción» | La producción llena la gota de cada criatura estable. La luz entra en la cartera al recogerla. Los Datos cuentan la luz hecha. |
| §5 «Esencia: gasto» | Un solo precio: 4 de luz. |
| §6 Loop y «Primera sesión, minuto a minuto» | El bucle de §1.3. El primer toque del jugador es su primera criatura y el reloj arranca después de VELA. |
| §7 Controles | Filas: toque en luz → recoger; arrastre en vacío → barrido; mantener sobre criatura → ficha (sustituye a «Toque sobre criatura»); arrastrar desde una nadadora → guiar. |
| §8 Catálogo | El Árbol tiene **8** rutas (↓ Recoger). |
| §9 Estados | Fusión, desbordada y apagada se explican con su causa (§2.5). |
| §13 UI/UX | «Elementos flotantes»: gotas, pipetas, el enlace rojo de aviso. «Pausa automática con hojas». Presupuesto de interrupciones. |
| §20 Balance | Política `idle` y puertas de §3.3. |
| §23.5 (nueva) «Recoger la luz» | Resumen de §2.2. |

---

## 5. Paquetes de trabajo

### 5.0 Reglas de convivencia

- **Paso 0 · Integrador**, un commit pequeño antes de abrir los paquetes:
  1. contratos opcionales del anexo §8 (`types.ts`, `bus.ts`), solo añadidos;
  2. tokens `route.collect`, `--bl-cost`, `--bl-gain`, `--bl-off` y `--bl-danger` (con `tokens.test.ts` AA);
  3. ADR-030 en `DECISIONS.md` como *Proposed*;
  4. copia de este plan a `docs/CLARIDAD2.md`.
- **Orden de fusión:**
  1. paso 0;
  2. **PA-textos** (claves de §8.2, para que nadie espere);
  3. PA, PB, PC y PD en paralelo;
  4. **PA-balance** al final, con los informes del bot;
  5. el integrador enciende la guarda de «Luz» (`LUZ_RENAME` en `clarity.test.ts`) y aplica las correcciones de la
     GDD, CICLO y RITMO;
  6. QA ingenuo otra vez, en caja negra.
- **Con P1, P2 y P3:**
  - no se tocan `src/ui/art/vela.ts`, `vector/*`, `src/ui/art/portraits.ts`, `devSections.ts`,
    `src/ui/art/characters/*`, `cast.ts`, `src/ui/intro/*`, `splash.ts` ni `src/ui/story/cinematic.ts`, ni las
    regiones de créditos de `modals.ts` y `src/ui/story/strings.ts`;
  - PB y PC solo tocan **sus regiones** de esos dos archivos compartidos y rebasan sobre P3;
  - PB **importa** `vector/*` (P1) para dibujar las pipetas, con un `Path2D` simple de reserva hasta que P1 entregue.
- **Con el ingeniero de rendimiento:**
  - `main.ts` lo toca **solo PC**, en un PR propio de ≤ 15 líneas en los 6 sitios de §5.4, ninguno dentro del bucle
    de incubación ni del ritmo de fotogramas;
  - `src/sim/steer.ts` es un archivo **nuevo** (PB): no se editan `deflect.ts`, `webgl.ts`, `shaders.ts` ni
    `src/detect/*`.
- **Cada hallazgo del QA lleva primero un test que falla** (`CLAUDE.md` regla 9). En las listas, «QA#n» marca el test
  de regresión de ese hallazgo.

### 5.1 PA · Economía, Árbol y bot (juego puro)

**Archivos (exclusivos):**
- `src/game/**`: `game.ts`, `session.ts`, `cycleBalance.ts`, `balance.ts`, `tree.ts`, `treeText.ts`, `content.ts`,
  `defs.ts`, `worlds.ts`, `state.ts`; nuevos `collect.ts` y `contact.ts`, con sus tests; `clarity.test.ts`;
- `scripts/sessionBotCore.ts`, `session-bot.ts`, `tree-table.ts`;
- `docs/CICLO.md` y `docs/RITMO.md` (tablas del bot y del árbol).

**Tareas:**
1. **Recogida** (`collect.ts` + gancho en `econTick`):
   - la producción por criatura llena su gota hasta el tope; el «ganado» cuenta al producir (`noteEssence`) y la
     cartera, al recoger;
   - acciones `collect(dropId)`, `collectAt(x, y, rCells)` y `collectPath(points)`;
   - gota suelta al morir; barrido al final y al cargar;
   - pipetas: temporizadores, objetivo, imán y maestra; la vista `GameView.drops` y `pipettes`;
   - evento `lightCollected`; evento `luzGift` con motivo para todo lo que entra sin gota (Destello, objetivos,
     encargos).
2. **Ruta ↓ Recoger** en `tree.ts`: 6 nodos, disposición en la dirección ↓, `beforeAfter` y efectos en `TreeEffects`.
   Sus textos van en `treeText.ts`. 53 → 59 nodos comprables.
3. **Sesión 1:** sin criatura de inicio en la primera sesión de la partida. El primer toque en `ready` planta la
   plantilla con `dishSeed` y no arranca el reloj. `startClock()`. Si la historia está apagada, el comportamiento de
   hoy.
4. **Precios:**
   - `SEED_PRICE_STEP` = 1;
   - Nutrientes: precio congelado al salir a la venta, `BOOST_FROM_SESSION` y `BOOST_UNTIL_REMAINING`;
   - Destello frecuente también sobre el primer Destello;
   - ruta Destello «?» hasta que termina la sesión 3.
5. **`contact.ts`:**
   - `predictContacts` → `GameView.dangers`;
   - `deathCause` → `creatureDied.cause` y `creatureExploded.cause`.
6. **Datos de pantalla:**
   - informe con los nombres de encargos, récords y primeros pasos;
   - Datos «por tu luz» frente a «premios de descubrimiento»;
   - `lessReason` cuando da menos Datos que la sesión anterior;
   - desglose de la luz de inicio (`carry`);
   - mundo por defecto con especies por descubrir;
   - estado `deviceMax` del nodo de Placa;
   - líneas de puerta de la noche con «tienes / hace falta».
7. **Textos** de los archivos de `src/game/`:
   - Esencia → Luz;
   - Abono → Nutrientes;
   - nodos nuevos;
   - reescrituras 2, 3, 8, 9 y 10 de §6;
   - «Nadadoras y las que giran +15 %»;
   - «¡Destello! +60 luz»;
   - el nodo «Comida extra» pasa a llamarse «Bordes nítidos» para no confundirlo con Nutrientes (el id no cambia).
8. **Bot:** modelo de gotas, política `idle`, columnas nuevas y corridas B1–B4. Informes en el PR y en RITMO.

**Tests primero:**
- `collect.test.ts`:
  - «uniform soup fills no drop of light»;
  - «a forming seed fills no drop until it is stable»;
  - «a full drop waits and nothing made is lost»;
  - «tapping a creature collects its drop into the wallet»;
  - «light of a creature that went dark stays on the dish and is swept at the end»;
  - «Datos count light made, collected or swept»;
  - «a pipette takes a ripe drop every cycle and never one below half»;
  - «tapping a drop a pipette is heading for sends the pipette elsewhere»;
  - «collection works while the dish is paused»;
  - «a session restored mid-run sweeps its drops».
- `sessions.test.ts`:
  - QA#4/#7 «the first-ever session starts empty and the player's first tap plants the sure creature without starting
    the clock» y «startClock starts the clock once»;
  - QA#21 «the seed price never changes within a session»;
  - QA#22 «the Nutrientes price does not rise while nothing is bought»;
  - QA#5 «no Nutrientes in session 1»;
  - QA#8 «no Nutrientes in the last 3 s»;
  - QA#13 «Destello frecuente brings the first Spark sooner» y «the Destello route is hidden until session 3 ends»;
  - QA#26 «the start view says where every Luz of the wallet comes from»;
  - QA#36 «the next session defaults to a world with species to find» y «a summary with fewer Datos than the one
    before says why»;
  - QA#24/#9 «the summary names every Encargo, record and first step it pays for».
- `tree.test.ts`:
  - «8 straight routes; every Recoger level shows a better number»;
  - QA#11 «a Placa level past this device's dish is the device's maximum, never affordable»;
  - QA#37 «night gate lines say have and need».
- `contact.test.ts`:
  - «two bodies on a collision course within 2 s are reported once»;
  - «a swimmer that the glass will turn is not a danger»;
  - «death cause: near the rim → glass, near another → crowd, else → faded».
- `clarity.test.ts`:
  - «no player text says Esencia/Essence» (detrás de `LUZ_RENAME`);
  - «no multiplier with two decimals outside "Show the maths"».

**Hecho cuando:**
- `typecheck`, `test`, `build` y `SINGLE=1` en verde;
- B1–B4 cumplen las puertas de §3.3 y están en el PR;
- CICLO y RITMO tienen sus tablas actualizadas;
- las claves de §8.2 existen en es y en.

### 5.2 PB · Placa, toques y ayudantes (UI de la placa; incluye el HUD de luz de P4 §6.8)

**Archivos (exclusivos):**
- `src/ui/ui.ts`, `src/ui/ui.css`, `src/ui/overlay.ts`, `src/ui/input.ts`, `src/ui/fx/**`, `src/ui/toasts.ts`,
  `src/ui/i18n.ts`, `src/ui/panel-bestiary.ts`, `src/audio/**` (sonidos de recoger, pipeta y aviso);
- `src/ui/modals.ts` **solo** en la ficha de especie y la tarjeta de pausa (los créditos son de P3);
- nuevos `src/sim/steer.ts` y `src/sim/steer.test.ts`.

**Tareas:**
1. **Gotas en la placa:**
   - dibujo en el lienzo del overlay, sin DOM por gota y sin reservar memoria por fotograma (pools);
   - llenado con el color de la especie y latido al madurar (sin latido con *Reducir movimiento*);
   - toque y barrido; vuelo al contador; recogida final durante «¡Tiempo!»;
   - sonido *pop* sintetizado.
2. **Pipetas:**
   - dibujo de instrumento (con el kit de P1) en la gradilla del borde;
   - animación del viaje que marca `GameView.pipettes`;
   - como mucho 8; pruebas a 30 fps.
3. **Gestos** (§2.2.1):
   - toque en criatura = recoger;
   - mantener = ficha;
   - arrastre en vacío = barrido;
   - arrastre desde una nadadora = guiar (`deps.onSteer`, con la línea guía);
   - toque fuera del círculo: «Toca dentro de la placa» una vez.
4. **Avisos en la placa:**
   - enlace rojo que late entre las dos de `GameView.dangers` (el texto lo pone el Momento breve de PC);
   - fundido gris de las semillas que se apagan, sin confeti;
   - los toques rechazados no florecen.
5. **Barra de abajo:**
   - tres celdas fijas: «Colección 3/7» · Nutrientes / Árbol · chip de Datos con «próximo en N de luz» y su «+1»;
   - guarda contra el toque fantasma (inerte bajo un globo y 350 ms después);
   - aviso de Nutrientes reescrito.
6. **Píldora de siembra:**
   - «Caben 2 más», «Placa llena», «1 semilla gratis»;
   - botón **Copiar** (Copiadora) con su tira de especies;
   - rótulos en los iconos;
   - sube junto a la placa (fuera el hueco gris).
7. **Contador de LUZ** (ARTE-REALISTA §6.8):
   - rótulo Mono, cifra tabular a 8 Hz, «+12 luz/s» en enteros;
   - el motivo de cada `luzGift` junto al contador («+5 · primera semilla»).
8. **Ficha de especie** (`modals.ts`):
   - cuentas ●;
   - latín con rótulo;
   - «Le ayuda en el Árbol: …»;
   - «Empieza a dar luz cuando arranque el reloj»;
   - Copiar con su motivo.
9. **Fallos visuales:** etiquetas ancladas, números sin fantasmas, avisos sin elipsis en 360 px, Goma y escoba solo con
   manchas, la barra que no se descoloca.
10. **`steer.ts`** puro: petición → `Turn[]`, nunca hacia el cristal, solo para cuerpos que el deflector guiaría.
11. Textos de `i18n.ts`: Luz, reescrituras 1, 2 y 4 de §6 y los rótulos de herramientas.

**Tests primero:**
- `src/ui/dishTap.test.ts` (ayudante puro `routeTap`):
  - «a tap on a drop collects and never sows»;
  - «a tap on a creature collects its light; a long press opens its card»;
  - «a swipe across three drops collects all three»;
  - «a drag from a swimmer steers it and collects nothing».
- e2e `tests/e2e/layers.mjs`:
  - **QA#17** «a tap that closes VELA's line over the dock never buys Nutrientes»;
  - **QA#29** «buying Nutrientes keeps the dock's three cells in place».
- `steer.test.ts`:
  - «an Orbium steered 90° over three updates survives 2 000 steps (CPU, 64²)»;
  - «steering never turns a body into the glass»;
  - «spinners and blobs are never steered».
- Overlay:
  - «labels stay on their creature's track» (QA 186/205);
  - «floating numbers never overlap».
- **QA#20** «a refused tap shows no bloom»; **QA#32** «a seed that goes dark fades grey».
- **QA#31** «gift toasts fit 360 px without an ellipsis».
- **QA#35/#41** «eraser and broom hidden without shapeless matter».
- **QA#39** «with the Copiadora bought, the seed pill shows Copy».

**Hecho cuando:**
- la sesión 1 se juega con toques en 390 × 844 y 1366 × 768, en claro y oscuro, en es y en (`session-play.mjs`);
- el suelo de 30 fps del Playwright móvil pasa con 8 pipetas y 16 gotas (`SESSION_SIM_PACE`);
- ninguna lectura de píxeles por fotograma;
- la sopa uniforme no pinta ninguna gota.

### 5.3 PC · Flujo, reloj, tutorial, historia y avisos (incluye los ganchos de `main.ts` y P4 §6.10/§7.6)

**Archivos (exclusivos):**
- `src/main.ts`, **solo** los 6 sitios de §5.4, en un PR propio;
- `src/moments/**`: `moments.ts`, `catalog.ts`, `config.ts`, `storyBridge.ts`, `behaviors.ts`;
- `src/story/**`: `script.ts`, `story.ts`, `encargoScript.ts`, `encargos.ts`, `endings.ts`, `introScript.ts`;
- `src/secrets/**`;
- `src/ui/story/**`, menos `cinematic.ts` y las claves de créditos de `strings.ts`; incluye `storyUI.ts`,
  `encargoUI.ts`, `story.css`, `archive.ts`, `hints.ts`, `spotlight.ts` y `dock.ts`;
- `src/ui/session/flow.ts`, `start.ts`, `welcome.ts`;
- `src/store/catalog.ts` (una línea de texto, opcional).

**Tareas:**
1. **Pausas `story` y `sheet`** (§2.3). El estado de pausa se pasa al reloj (`hud.setPaused`, de PD).
2. **Política de Momentos** (`moments.ts`):
   - presupuesto `RUN_CARD_MAX` y `RUN_QUIET_START_S`, con la lista de accidentes permitidos;
   - `drainForSummary()`;
   - nada pasa a la sesión siguiente;
   - fuera `shortRunRunning` como bloqueo.
3. **Catálogo:**
   - tarjetas de accidente (fusión, desbordada) y breves (`contact`, apagados por causa, cristal, «Arrástrala para
     guiarla», «❄ de la nevera»);
   - láminas nuevas 25 «Recoger la luz» y 26 «Guiar», con números fijos por tipo junto con PD.
4. **Tutorial** (§2.4): líneas nuevas en `script.ts`; `startClock` al cerrar el paso 5; se borran «Tu primera semilla,
   colega» y «Espera… ¡mira!»; con la sesión en marcha solo hablan el tutorial y `t_golden`.
5. **El Bestiario nunca lo secuestra una escena** (QA#16).
6. **Encargos:**
   - cada definición gana `ask` (frase llana, ≤ 10 palabras) y `how` (≤ 14);
   - la barra enseña `ask`, en minúsculas;
   - la cita del Comité, en MAYÚSCULAS con FIN, va solo en el globo y en la tarjeta de inicio (`script.test.ts` sigue
     vigilándola);
   - «?» = `how` + «El Comité es quien paga la luz de la Estación.»;
   - con la sesión en marcha, solo la barra (§2.8);
   - **`encargoFeasible(def, view)`**: un Encargo sin camino real no se ofrece (QA#39).
7. **Tarjeta de inicio:**
   - desglose de la luz de inicio;
   - «1 semilla gratis · las demás, 4 de luz»;
   - retrato de la Nevera y «¡Empezar!» que espera a que se encienda la placa;
   - cartas de mundo con «Te falta 1 / ✓ Completo», y el mundo nuevo marcado;
   - tras una Noche: «Noche 2: +10 % de Datos · 7 mejoras nuevas»;
   - la línea de VELA sobre los Datos (§2.1) al empezar la sesión 2.
8. **Secretos** con la sesión en marcha: aviso ≤ 1,5 s; su tarjeta, al informe.
9. **Ajustes → Historia:** AA y finales sin ver como «???».
10. **P4 §6.10** (caja de diálogo como instrumento: `VELA · MC-7` en Mono y `lamp.3200`, borde de 1 px, burbujas de
    Encargo como etiquetas de rotuladora) y **P4 §7.6** (la tabla de líneas «vela → lámpara»: `introScript.ts`,
    `script.ts`, `encargoScript.ts`, `secrets/data.ts`, `store/catalog.ts`), con los límites de palabras de los tests.
11. **Intro** (`introScript.ts`, solo texto): viñetas de reglas de una línea, la frase de §1.1 en la última y «Te dejo
    mi luz y mis criaturas.» La nota a P3 para quitar `essence`, `clock` y `tree` va en el PR.

**Tests primero:**
- `moments.test.ts`:
  - **QA#25** «Momentos of a run never open at the start of the next run»;
  - «a run shows at most one pausing card, and only for a first-time accident»;
  - «no card in the first 5 s»;
  - «deferred Momentos are handed to the summary as plates».
- `story.test.ts`:
  - **QA#16** «opening the Bestiary is never blocked by a tutorial scene»;
  - «no dialogue scene starts in a running session after session 1, except the first Spark»;
  - **QA#7** «session-1 tutorial lines never run with the clock running».
- `encargos.test.ts`:
  - **QA#39** «every offered Encargo has a how that names a real button or tree node»;
  - **QA#22/#23** «the task bar shows the plain ask; the Committee quote stays in the bubble».
- e2e `session-play.mjs`:
  - **QA#19/#40** «the clock does not move while the Bestiary is open» y «a session cannot end behind a sheet»;
  - **QA#4** «session 1 starts on an empty dish and the first creature is where the player tapped»;
  - **QA#14** «¡Empezar! waits until the Nevera creature is visible».
- `css-lint` / AA: **QA#34** «the story archive passes AA in both themes».

**Hecho cuando:**
- un jugador nuevo hace la sesión 1 sin que el reloj corra mientras VELA habla;
- en las sesiones 2–6 nunca ve más de una tarjeta por partida;
- todos los Encargos de las noches 1–3 se pueden cumplir desde lo que ve;
- el PR de `main.ts` tiene ≤ 15 líneas y el ingeniero de rendimiento lo ha revisado.

### 5.4 Los 6 ganchos de `main.ts` (los hace PC, en un solo PR)

| # | Sitio | Cambio | Líneas |
|---|---|---|---|
| 1 | `type PauseSource` | + `'story' \| 'sheet'` | 1 |
| 2 | Bloque de vista cada 100 ms, junto a `setPause('cards', flowBusy())` | `setPause('story', storyBusy() && game.session?.phase === 'running')` · `setPause('sheet', ui.drawerOpen \|\| sheetOpen() \|\| ui.blocked())` | 2 |
| 3 | `createMoments({ isBlocked })` | Quitar `shortRunRunning(game.session)`: la política pasa a `moments.ts` | 1 |
| 4 | `createSessionFlow(...)` | `plates: () => moments.drainForSummary()` · `cultureReady: () => culture.lit && !culture.incubating` | 2 |
| 5 | `detect()`, tras `deflector.update` | `const steer = steering.update(bodies, dish, s.stepCount)` → concatenar con `turns` antes de `applyTurns` y `noteTurn` | 5 |
| 6 | `createUI` deps | `onSteer: (id, heading) => steering.request(id, heading)` | 1 |

En total ≈ 12 líneas. Ninguna toca `culture.frame`, el presupuesto de incubación ni el acumulador de pasos.

### 5.5 PD · Informes, láminas, Árbol y números (el P4 de la biblia de arte)

**Archivos (exclusivos):**
- `src/ui/session/summary.ts`, `hud.ts`, `session.css`, `session.test.ts`;
- `src/ui/moments/**`: `illustrations.ts`, `momentsUI.ts`, `moments.css`, `price.ts`, `seedprice.ts`, `status.ts`,
  `strings.ts`, `species-card.ts`, `help.ts`, `behavior-guide.ts`, `icons.ts`, `clips.ts`;
- `src/ui/seed-price.ts` (se junta con `moments/seedprice.ts`);
- `src/ui/tree/**`: `treeView.ts`, `why.ts`, `tree.css`, `icons.ts`;
- `src/ui/art/icons.ts`, `src/ui/format.ts`, `src/ui/portrait.ts`, `src/ui/art/specimen.ts`.

**Tareas:**
1. **Informe de sesión** (§2.9, ARTE-REALISTA §6.9):
   - orden fijo;
   - filas de hoja de cálculo con puntos guía;
   - `lessReason`;
   - «Colección 3/7»;
   - láminas de hoy (`SummaryExtras.plates`);
   - sello `REGISTRADO`;
   - especies como foto de espécimen.
2. **Reloj** (`hud.ts`, §6.8):
   - esfera de cronómetro con aguja amortiguada;
   - ámbar en el aviso;
   - `setPaused` («⏸ en pausa»);
   - chip «+3 s · especie nueva» de 2 s con el dial que retrocede.
3. **Láminas** (§6.5):
   - número fijo por `IllustrationKind` (01–24, más 25 Recoger y 26 Guiar);
   - paneles a/b/c en secuencia temporal;
   - líneas guía de 1 px;
   - barra de escala (1 celda = 0,7 mm; la constante va en `src/ui/art/`);
   - latín en cursiva;
   - clave de color con forma;
   - VELA en mini con la leyenda «Fig. N».
4. **Precios** (§2.11):
   - un solo módulo;
   - ficha de cálculo;
   - regla de color;
   - fuera `rsAlive*` y `crowd`;
   - pocillos para los huecos;
   - `PriceTicker` como etiqueta de rotuladora.
5. **Pastillas de estado** como etiquetas de instrumento con LED (§6.9).
6. **Árbol** (§2.10):
   - sin desplazarse solo;
   - encuadre de lo comprable al abrir;
   - volver a la cámara anterior al cerrar la hoja;
   - toques ignorados 350 ms tras mover la cámara;
   - tira «Puedes comprar (n)»;
   - `deviceMax`;
   - «Ruta · paso k de n» con puntos de nivel;
   - la ruta ↓ con su icono (pipeta);
   - hoja de la Noche con el premio primero;
   - «Nueva sesión» que late tras comprar un mundo.
7. **Tarjeta de especie:** cuentas ●, «casi ×3», latín con rótulo, «Le ayuda: …».
8. **`format.ts`:** multiplicadores amables y ritmos en enteros (§2.13).
9. **Iconos:**
   - el `robot` del sembrador pasa a brazo dosificador;
   - nuevos: pipeta, gota de luz (icono de Luz: la gota de siempre con halo) y ruta Recoger.
10. **Retratos** a 2× DPR (miniaturas nítidas).

**Tests primero:**
- `treeView` (ayudantes puros):
  - **QA#12** «selecting a visible node never moves the camera»;
  - «opening the tree fits every buyable node on screen»;
  - «a tap right after a camera move is ignored».
- `session.test.ts`:
  - «the exciting row comes first»;
  - «rows add up to the total»;
  - **QA#9** «first steps are named».
- `seedprice.test.ts`:
  - «no price explanation in the sessions cycle names living creatures as a cost»;
  - «costs carry the cost class with ↑ and bonuses the gain class with ×».
- `format.test.ts`:
  - «rates ≥ 1 show whole numbers»;
  - «×2,91 reads "casi ×3"».
- `species-card.test.ts`: **QA#18** «beads and a labelled scientific name; no "Afinidad"».
- `illustrations`: «every IllustrationKind has a plate number, panels and a scale bar».
- `css-lint.test.ts` y AA en los dos temas.

**Hecho cuando:**
- las 26 láminas tienen número, paneles, barra y leyenda;
- el informe cabe en 360 × 640 sin desbordar;
- el Árbol nunca deja un nodo comprable fuera de pantalla al abrirse;
- `css-lint` pasa (sistema cerrado).

### 5.6 Quién usa qué de quién

| Productor → consumidor | Qué | Cómo se evita esperar |
|---|---|---|
| Paso 0 → todos | Contratos opcionales (§8.1) y tokens | El primer commit. |
| PA → PB | `GameView.drops`, `pipettes`, `dangers`; acciones `collect*`; `luzGift` | PB trabaja con `mock.ts` (es de PB: `src/ui/mock.ts`) hasta que PA entrega. |
| PA → PC / PD | Claves de texto de §8.2; `SessionSummary` con nombres; `research.gate` con «tienes / hace falta»; estado `deviceMax` | PA-textos primero (día 1). |
| PC → PD | `plates` en `SummaryExtras`; `hud.setPaused` | Interfaces fijadas aquí (§8.1); PD las declara y PC las conecta. |
| PB → PC | `deps.onSteer` (interfaz de `ui.ts`) y `steer.ts` | PC solo conecta (gancho 5–6 de §5.4). |
| P1 → PB / PC | `vector/*`, MC-7 en la caja | Reserva simple hasta que P1 entregue. |

### 5.7 El P4 de la biblia de arte, absorbido

| P4 (ARTE-REALISTA) | Va a |
|---|---|
| §6.5 Láminas (`illustrations.ts`, `moments.css`, marco de `momentsUI.ts`) | PD, tarea 3 |
| §6.8 HUD: contador | PB, tarea 7 (está en `ui.ts`) |
| §6.8 HUD: reloj | PD, tarea 2 (`hud.ts`) |
| §6.8 Iconos (`robot` → brazo dosificador) | PD, tarea 9 |
| §6.9 Informe de sesión | PD, tarea 1 |
| §6.9 Fichas de precio, `PriceTicker` y pastillas | PD, tareas 4–5 |
| §6.10 Caja de diálogo y burbujas de Encargo | PC, tarea 10 |
| §7.4 «Textos» (`introScript`, `script`, `encargoScript`, `secrets/data`, `store/catalog`) | PC, tareas 10–11 |
| §7.6 Comentarios y docs («flask», «candle») | Integrador, al final, junto con las correcciones de la GDD |

---

## 6. Las 10 reescrituras de texto más importantes

| # | Hoy | es (nuevo) | en (nuevo) | Dónde · cuándo | Paquete |
|---|---|---|---|---|---|
| 1 | **Esencia** / Essence (HUD y todo) | **Luz** · «LUZ 340 · +12 luz/s» | **Glow** · "GLOW 340 · +12 glow/s" | En todas partes, siempre | Todos (guarda de PA) |
| 2 | «2 sitios» · «1 sitio» · «Llena» | «Caben 2 más» · «Cabe 1 más» · «Placa llena · caben 3» | "Room for 2 more" · "Room for 1 more" · "Dish full · holds 3" | Píldora de siembra, siempre en la sesión | PB (i18n) |
| 3 | «Abono ×1,25 · en 0:07» | «Nutrientes · listo en 7 s» → «Nutrientes · 16 luz» + aviso «Ahora 2 luz/s → con Nutrientes 2,5 luz/s. Hasta el final. El siguiente, el doble.» | "Nutrients · ready in 7 s" → "Nutrients · 16 glow" + "Now 2 glow/s → with Nutrients 2.5 glow/s. Until the end. The next one costs double." | Barra de abajo, desde la sesión 2; el aviso solo la primera vez (7 s o toque) | PA (nombre), PB (botón) |
| 4 | «Muy cerca: se fundirían. ¡Más lejos!» | «¡Muy cerca! Si se tocan, se juntan y se apagan.» | "Too close! If they touch, they merge and go dark." | Junto al dedo, en un toque rechazado (1,5 s) | PB |
| 5 | «ENVÍEN 3 ESPECIES PARA EL INFORME. FIN.» en la barra; «?» = «QUEREMOS NÚMEROS. MUCHOS. FIN.» | Barra: «Consigue 3 especies distintas · 2/3». «?»: «Cómo: compra un Mundo nuevo en el Árbol y juega allí. El Comité es quien paga la luz de la Estación.» | "Get 3 different species · 2/3" · "How: buy a new World in the Tree and play there. The Committee pays for the Station's light." | Barra de meta mientras el Encargo está activo. La cita en MAYÚSCULAS, solo en su globo (tarjeta de inicio) | PC |
| 6 | «×1,6 · ×1,1 · ×1,65 = ×2,91 si estuviera viva» | «Da luz: ●●●○○ · Viva, casi ×3 con tus mejoras» (+ «Ver cuentas») | "Glow: ●●●○○ · Alive, almost ×3 with your upgrades" (+ "Show the maths") | Ficha de especie y tarjeta del Bestiario | PB, PD |
| 7 | «Le ayudan: Afinidad sésil» / «Afinidad nadadora» | «Le ayuda en el Árbol: Tranquilas» / «Nadadoras» | "Helped in the Tree by: Calm ones" / "Swimmers" | Ficha de especie | PB |
| 8 | «Necesita 4 sesiones y 1 especie — o 8 sesiones» | «Noche 2 · capítulo 2. +10 % de Datos y mejoras nuevas. Nada se borra.» · «Juega 4 sesiones · llevas 3» · «Especies en tu colección · ✓ tienes 3» | "Night 2 · chapter 2. +10 % Data and new upgrades. Nothing is lost." · "Play 4 sessions · 3 so far" · "Species in your collection · ✓ you have 3" | Centro del Árbol | PA (texto), PD (hoja) |
| 9 | «Tu aparato ya tiene la placa más grande» | «En este móvil la placa ya no crece más. Gasta tus Datos en otra mejora.» | "On this device the dish can't grow any more. Spend your Data on another upgrade." | Hoja del nodo Placa en un móvil con tope | PA, PD |
| 10 | «Cada semilla que compras hoy cuesta un poquito más» | «Una semilla cuesta 4 de luz. Siempre.» | "A seed costs 4 glow. Always." | Ficha del precio de la semilla | PA (regla), PD (ficha) |

**Otras reescrituras** (van en los mismos PR):

| Hoy | es | en |
|---|---|---|
| «Toca el nodo verde que señala la mano» | «Toca el círculo que brilla» | "Tap the glowing circle" |
| «primeras metas» | «primeros pasos» | "first steps" |
| «Destello: llega cada 40–45 s» | «El primero llega a los 6–12 s → 5–10 s» | "The first one comes at 6–12 s → 5–10 s" |
| «Goma: Toca para borrar» | «Goma: quita manchas sin forma» | "Eraser: removes shapeless blobs" |
| «Todo da ×2,71» | «Tus mejoras: casi ×3 de luz» | "Your upgrades: almost ×3 glow" |
| «Comportamientos vistos» | «Maneras de moverse vistas» | "Ways of moving seen" |
| «El Destello te regala 10 s de tu Esencia: +10…» | «¡Destello! +60 luz» | "Spark! +60 glow" |
| «aparato» | «móvil» | "device" |
| «Te dejo mi luz. Cuídalas mucho» | «Te dejo mi luz y mis criaturas. Cuídalas mucho.» | "I leave you my light and my creatures. Take good care of them." |

---

## 7. Lo que tiene que decidir el dueño

1. **Nombres:**
   - **Esencia → Luz / Glow** (recomendado);
   - **Abono → Nutrientes** (recomendado);
   - **Datos se queda**, y «Estrellas», rechazado.
   - Es lo que más se ve del juego.
2. **Recoger a mano con tope**: una gota llena **espera** y no se pierde nunca. La otra opción, «se pierde en 5 s»,
   castiga a quien mira. Hay que confirmar que una gota que espera no cuenta como «castigo».
3. **Una 8.ª ruta en el Árbol (↓ Recoger).** Rompe el «7 rutas» del plan publicado y deja la estrella completa.
4. **El reloj se para mientras VELA habla y con cualquier hoja abierta.** Cambia el ADR-022 («el juego no se pausa
   por la historia»).
5. **Tocar una criatura recoge su luz**; su ficha pasa a «mantener pulsado». Cambia la GDD §7.
6. **Dedo guía solo para nadadoras** ahora; empujar a las demás, después y con medida.
7. **Un solo precio de semilla** (se quita el escalón ×1,05).
8. **Título:** la versión pasa a Ajustes y la atribución de Lenia se escribe en llano. Es de P3; la decisión de
   cómo atribuir es del dueño.

---

## 8. Anexo: contratos y claves de texto

### 8.1 Añadidos opcionales a los contratos (paso 0, `CLAUDE.md` regla 1: no se quita nada)

```ts
// src/core/types.ts
interface CreatureView { /* … */ light?: number /* 0..1 fill of its drop */; lightAmount?: number }
interface DropView { id: number; x: number; y: number; amount: number; fill: number; owner: number | null }
interface PipetteView { id: number; dock: number /* 0..1 around the rim */; target: number | null; trip: number /* 0..1 */ }
interface GameView { /* … */ drops?: DropView[]; pipettes?: PipetteView[]; dangers?: { a: number; b: number; inS: number }[] }
interface GameActions { /* … */ collect?(dropId: number): number; collectAt?(x: number, y: number, rCells: number): number;
  collectPath?(pts: { x: number; y: number }[], rCells: number): number; startClock?(): void }
interface SessionView { /* … */ tutorialHold?: boolean }
interface SpeciesView { /* … */ lightBeads?: number /* 1..5 */ }
// src/core/bus.ts
lightCollected: { x: number; y: number; amount: number; by: 'hand' | 'pipette' | 'sweep' };
luzGift: { amount: number; reason: Text };
creatureDied: { /* … */ cause?: 'faded' | 'glass' | 'crowd' };
creatureExploded: { /* … */ cause?: 'touch' | 'crowd' };
// Not core (owned by their packages): ui.ts UIDeps.onSteer?(id, heading) · SummaryExtras.plates?: PlateRef[]
// · SessionHud.setPaused?(on) · SessionFlowOptions.plates?() / cultureReady?() · moments.drainForSummary()
```

### 8.2 Claves de texto nuevas (las escribe PA en `treeText.ts` / `content.ts`, en es y en, el día 1)

| Grupo | Claves |
|---|---|
| `SESSION_UI` | `luz`, `luzPerSec`, `collected`, `sweptEnd`, `datosNext`, `lessReason(…)`, `fromLight`, `discoveryOnce`, `firstSteps`, `collection(n, total)`, `nextSpeciesIn(world)`, `startCarry(base, extra)`, `freeSeeds(n, price)`, `fridgeWaking`, `worldLeft(n)`, `worldDone`, `paused`, `boostReady(s)`, `boostPrice(n)`, `boostNoTime`, `boostTip(a, b)` |
| `NODE_TEXT` / `VALUE_TEXT` | `pipette`, `pipetteFast`, `dropBig`, `pipetteMore`, `pipetteMagnet`, `pipetteMaster` (nombre, descripción, valores); `nutrient` → «Bordes nítidos»; `affinitySwim` → «Nadadoras y las que giran» |
| `TREE_UI` | `tapGlowing`, `routeStep(route, k, n)`, `deviceMax`, `deviceMaxLine`, `canBuyStrip(n)`, `cheapestNow(name, n, s)`, `nightPrize`, `gateSessions(have, need)`, `gateSpecies(have, need)`, `playWorld(name)` |
| `TEXT` (avisos del juego) | `gift(reason)`, `sparkGift(n)`, `boostBought` (Nutrientes), `deathGlass`, `deathCrowd`, `deathFaded`, `merged`, `contactSoon`, `contactSteer` |

(Los textos de Momentos, de la historia y de los Encargos son de PC, y los de `i18n.ts`, de PB, cada uno en sus
archivos.)
