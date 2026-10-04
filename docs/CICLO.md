# Ciclo de juego: sesiones de laboratorio y Árbol de investigación

> **Decisión del dueño (tras jugarlo):** *«El menú de mejoras y el prestigio tienen que ser más claros — algo como un
> ÁRBOL CON RAMAS. La idea es que eres como un ESTUDIANTE CON TIEMPO DE LABORATORIO: puedes experimentar X tiempo antes
> de que empiece otra tanda.»*
>
> **Segunda decisión del dueño:** *«Como cambia el menú de evoluciones eso de calibrar ya no iría, ¿no? Deben ser más
> claras las rutas de mejora y prestigio: deben ser lineales siempre para conseguir más recursos u obtener más… al final
> es un juego aunque sea cosas de química.»*
>
> **Plan vinculante:** la página «Rutas de mejora de Bioluma» (7 rutas rectas, 53 mejoras, 7 mundos, la Noche como
> prestigio gratis). Este documento la aplica y dice dónde la medida obligó a desviarse (§4.3 mundos, §4.5 Gotero,
> §11 ritmo).

> **Tercera decisión del dueño (2.ª prueba):** *«Sigo sin ver el tiempo… el juego debe ser relativamente corto,
> emocionante y súper incremental… también debe crecer y no castigar por crecer… para comprar mejoras debo ganar más
> dinero y más rápido.»* → sesión 1 de **2:00** con el reloj a la vista desde la primera semilla; Reloj hasta **5:00**;
> final de la historia a **~2 h**; **un solo precio de semilla por sesión** (los vivos nunca lo suben; el límite es el
> **sitio** de la placa); **≥ 2 compras** tras cada sesión; **Abono** dentro de la sesión.

> **Cuarta decisión del dueño (partidas cortas):** *«Como es un incremental las partidas deben ser más cortas… 15
> segundos o así y cada vez ir aumentando»* y *«ajusta los tiempos de vida… a los tiempos de partida»* → **partida 1 de
> 0:15**, Reloj hasta **2:30** en 15 niveles pequeños, **cámara rápida ×1,5** (45 pasos/s, ADR-027; era ×3), una
> criatura **ya viva** al empezar, **÷30** Esencia por Dato, anillos 2 · 15 · 400 · 12 000 · 80 000, noches en las
> partidas 4/8/13/20/29/40, final de la historia ≈ 1,7 h. **El diseño, la investigación y la tabla del bot están en
> [`docs/RITMO.md`](RITMO.md), que manda sobre los números de ritmo de este documento** (§2.2, §2.3, §3.3, §4.2 Reloj,
> §5, §9, §11 se actualizaron; donde un número de aquí no coincida con `cycleBalance.ts`, vale el código y RITMO).

Todos los números viven en [`src/game/cycleBalance.ts`](../src/game/cycleBalance.ts), reexportado desde `balance.ts`.
Sustituye al ciclo continuo de la GDD (§5 Muestras/Genoma, §8 Laboratorio, §10 Extinción, Calibrar) — ver el ADR-026
propuesto en §16. Los textos siguen [`docs/CLARIDAD.md`](CLARIDAD.md) (sin jerga; un test lo vigila).

**Estado (Fases 2A y 2B, hechas):** el juego vivo corre `createGame({ bus, cycle: 'sessions' })` (sesiones, Árbol,
mundos, noches, Nevera, Abono, guardado v2) con su interfaz (§15.2). El ciclo clásico solo queda para las pruebas.

## Índice

1. [El ciclo en una imagen](#1-el-ciclo-en-una-imagen)
2. [La sesión](#2-la-sesión)
3. [Dos monedas: Esencia y Datos](#3-dos-monedas-esencia-y-datos)
4. [El Árbol: 7 rutas rectas](#4-el-árbol-7-rutas-rectas)
5. [Noches: el prestigio, gratis](#5-noches-el-prestigio-gratis)
6. [Encargos dentro de las sesiones](#6-encargos-dentro-de-las-sesiones)
7. [Progreso offline](#7-progreso-offline)
8. [Qué se conserva y qué se reinicia](#8-qué-se-conserva-y-qué-se-reinicia)
9. [Precios claros](#9-precios-claros)
10. [La pantalla del árbol](#10-la-pantalla-del-árbol)
11. [Ritmo: bot de sesiones](#11-ritmo-bot-de-sesiones)
12. [Anti-frustración](#12-anti-frustración)
13. [Partidas antiguas](#13-partidas-antiguas)
14. [Archivos y API](#14-archivos-y-api)
15. [Cambios para la Fase 2](#15-cambios-para-la-fase-2)
16. [ADR propuesto y preguntas abiertas](#16-adr-propuesto-y-preguntas-abiertas)

---

## 1. El ciclo en una imagen

```mermaid
flowchart LR
    A[Tarjeta de inicio<br/>Sesión 4 · 2:45 · elige mundo] --> B[Sembrar · mirar · descubrir<br/>el reloj corre]
    B --> C{¿Se acabó el tiempo?}
    C -- no --> B
    C -- sí --> D[¡Tiempo! · la placa se congela]
    D --> E[Fin de la sesión<br/>Esencia ÷ 250 = Datos<br/>+ especies, encargos, récords]
    E --> F[Árbol: 7 rutas rectas<br/>cada compra: antes → después]
    F --> A
    F -. cada 3–5 sesiones .-> G[Nueva noche · gratis<br/>se abren mejoras nuevas · la historia avanza]
    G --> A
```

**El prestigio en una sola línea** (la que ve el jugador): *Termina la sesión → ganas N Datos («por cada 250 de
Esencia, 1 Dato») → gástalos en el árbol → la próxima sesión rindes más.* Antes de que acabe la sesión, el HUD ya dice
cuánto vas a ganar y para qué te alcanza: **«📊 +22 Datos al terminar · Más tiempo: te faltan 4 Datos»** (al tocarlo,
la cuenta entera en la hoja «¿Por qué?» de Momentos; oculta en la sesión 1, cuando aún no se sabe qué es un Dato).

*Un estudiante con tiempo de laboratorio.* Cada **sesión** es una placa nueva y un reloj (2:00 al principio). Las
criaturas estables dan **Esencia**, que se gasta en semillas durante la sesión. Al llegar a cero, la Esencia **ganada** se
convierte en **Datos** con una cuenta que se ve entera. Con los Datos se compran mejoras del **Árbol** en **7 rutas
rectas**: en cada ruta, el paso siguiente siempre da más. El **Bestiario** y el **Árbol** nunca se pierden; la placa se
vacía en cada sesión. Cada 3–5 sesiones la **noche avanza** (gratis): se abren mejoras nuevas y VELA cuenta el
siguiente capítulo; la pregunta final de la historia llega hacia la sesión 24 (≈ 2 h). **No hay mandos de química**: las reglas del mundo se eligen como **mundos** con sus especies (§4.3).

## 2. La sesión

### 2.1 Tarjeta de inicio

`src/ui/session/start.ts`. **«Sesión 8 · Tienes 3:15 de laboratorio»**; **«Elige un mundo»**: los mundos abiertos como
tarjetas (nombre, una línea en palabras, retratos de sus especies — las que aún no tienes como siluetas con «?» —, y
«+3 especies» / «Encontradas 1/3» / «¡Todas encontradas!»; el mundo recién abierto lleva **«¡Nuevo!»** y viene elegido);
lo que el árbol regala al empezar (💧 Esencia · 🎁 semillas gratis · ❄ criaturas de la Nevera con sus retratos);
**«Nuevo desde la última vez»**; el **encargo**; «El reloj empieza con tu primera semilla» y **«¡Empezar!»**. Elegir mundo
es la **única** elección de reglas del juego y nunca enseña números. En la sesión 1 la tarjeta se omite (VELA presenta).
Mientras la sesión espera (`phase 'ready'`), comprar un nodo o cambiar de mundo la vuelve a preparar al momento
(`setupSession`): la placa, la cartera y la Nevera ya llevan lo nuevo.

### 2.2 El reloj (HUD)

`src/ui/session/hud.ts`. Una píldora grande sobre la placa (dial + **«2:41»**, «Sesión 4») y debajo la píldora del
prestigio **«📊 +22 Datos al terminar · Más tiempo: te faltan 4 Datos»** (o **«¡Alcanza para Más tiempo!»** en verde).

| Momento | Qué se ve | Sonido (gancho) |
|---|---|---|
| Antes de la primera semilla | «2:00 · Siembra para empezar», en gris | — |
| Corriendo | cifras claras, dial azul | — |
| Queda 1 minuto | cartel **«¡Último minuto!»** sobre la placa (una vez) | `lastMinute` |
| Últimos 30 s | la píldora se vuelve **ámbar** y late | `warn` |
| Últimos 10 s | cada segundo la cifra **rebota** | `tick` |
| Recta final (nodo) | chip dorado **«¡Recta final! ×2»** | — |
| Se alarga | chip verde **«+5 s especie»** bajo el reloj | `extend` |
| 0:00 | sello **«¡TIEMPO!»** sobre la placa congelada (1,6 s), luego el resumen | `timesUp` |

**Cuándo corre:** solo mientras la placa corre; **se detiene** con la pausa, las tarjetas de Momentos, los diálogos y
cualquier pantalla encima (`tickSession(…, {paused})`). **Empieza con la primera semilla.** Al acabar, la placa se
congela (`game.speed` = 0) bajo el resumen.

**Qué lo alarga** (todo visible con «+N s», nada lo resta):

| Fuente | Segundos | De dónde |
|---|---|---|
| Duración base | **0:15** (RITMO §3) | `SESSION_BASE_SECONDS` |
| ⏱ Más tiempo · Reloj grande · Reloj de arena · Reloj eterno | +5·6, +10·3, +15·3, +10·3 → **2:30** | ruta Reloj |
| Cada especie **nueva** para el Bestiario (regla base) | +3 s | `SESSION_TIME_PER_SPECIES` |
| Encargo cumplido (desde la partida 2) | +3 s → +6 → +9 («Encargos con prisa») | `SESSION_TIME_PER_ENCARGO` + nodo |
| Destello atrapado | +2 s → +4 («Destello del tiempo») | nodo |

Los avisos (ámbar, cuenta atrás, Recta final) son **proporcionales** a la partida (RITMO §3.4): ámbar en el último ¼
(4–30 s), cuenta atrás en el último ⅓ (3–10 s); «¡Último minuto!» solo en partidas de más de 65 s.

### 2.3 La Esencia durante la sesión

Entra por las criaturas (cada segundo), el **Destello** («El Destello te regala 30 s de tu Esencia»), los Encargos y los
objetivos; se gasta en semillas, copias y Abono. Los Datos se calculan con la Esencia **ganada**, no la guardada: gastar
nunca castiga.

**Semillas: un solo precio por sesión, nunca castiga crecer** (`seedPrice`/`seedCost` en `game.ts`):

```
precio = 4 (SESSION_SEED_PRICE) × Semillas baratas × 1,05 por cada semilla comprada hoy (como mucho ×3), en Esencia entera
```

Las criaturas vivas **no** suben el precio (sin «recargo por criatura» ni «placa llena ×3»). El límite físico es el
**sitio**: la placa tiene sitio para **5** criaturas (`DISH_CAPACITY` 5 · 7 · 9 · 12 · 15 por tamaño, + Más sitio y Sin
apretujones; en Gigantes cabe la mitad). Vivas + naciendo + recién sembradas cuentan; con la placa llena un toque **se
rechaza gratis** (evento `seedBlocked` con motivo `full`, texto `TEXT.dishFull(n)`: «¡Placa llena! Caben 5. Compra «Placa
más grande» en el Árbol.»). La regla de separación (no sembrar encima) y la guardería (3 naciendo a la vez, 5 con
Guardería) se quedan. `GameView.seedPrice` trae las partes (`base`, `cheapMult`, `stepMult`, `bought`, `capacity`,
`full`). La primera semilla de cada sesión vive seguro (`SESSION_SURE_SEEDS`); en la sesión 1, las tres primeras.

**Abono** (`buyBoost`): comida para la placa — **toda la Esencia ×1,25 hasta el final de la sesión**. Cuesta **8 s de
tu Esencia actual** (mínimo 10; RITMO §4.4) y el siguiente de la misma sesión, **el doble**. Se puede comprar a partir de los 8 s de
reloj (`BOOST_FROM_SECONDS`: comprado en el segundo 1, cuando nada produce, costaba solo el mínimo). Es pura ganancia para
los Datos (cuentan la Esencia ganada). `GameView.boost` = `{ cost, count, mult, nextMult, affordable, wait }`.

**Destello** (desde la partida 4; RITMO §4.4): el primero a los 6–12 s, luego cada 40–45 s (× Destello frecuente), vive 8 s en la
placa y regala **10 s de tu Esencia** (12/14/16 s con Regalos mejores, mínimo 10) y una semilla segura (3 con Semillas mágicas). Proporcional: una sesión con un Destello
menos no es una sesión peor. La ventana estrecha hace del Destello un ritmo, no una lotería.

### 2.4 Terminar antes

Menú de pausa → **«Terminar ahora»** con confirmación «¿Terminar ya? Te llevas 22 Datos.» (`endSessionNow`). Cobra lo
ganado **sin** el mínimo de 3 Datos (si no, terminar al instante sería una fuente gratis); el resumen dice cuánto tiempo
quedaba.

### 2.5 El resumen: «Fin de la sesión N»

`src/ui/session/summary.ts`: título y tiempo usado; **VELA** dice una línea (`velaKey`); **«Cómo se calcularon tus
Datos»** con la fórmula a la vista (**«💧 Por cada 250 de Esencia, 1 Dato»**) y la ecuación fila a fila que suma de
verdad (§3.3), con un total que cuenta hacia arriba; especies de hoy con retratos (**«¡Nueva!»**), la mejor criatura,
récords; dos botones fijos: **«Ir al Árbol · 3 mejoras listas»** y **«Nueva sesión»** (si no alcanza para nada, «Nueva
sesión» va primero y el árbol dice «Te faltan 12 Datos para Más tiempo»). En escritorio, dos columnas.

## 3. Dos monedas: Esencia y Datos

### 3.1 Esencia 💧 (de la sesión)

La producen las criaturas (GDD §5, sin cambios), más el Destello, los Encargos y los objetivos; se gasta en semillas,
copias y Abono y **se convierte al acabar**. Cada sesión empieza con 20 + «Esencia de bolsillo» (+ lo que dejaron los
Encargos cumplidos entre sesiones, que cuenta como ganado cuando el reloj arranca).

### 3.2 Datos 📊 (permanentes)

La moneda del árbol (*Data*): de cada experimento sacas datos y con datos aprendes técnicas nuevas. Se renombra en un
solo sitio (`DATOS_NAME`).

### 3.3 La conversión, a la vista

```
Datos = ⌊ Esencia ganada ÷ 30 ⌋ × noche      (RITMO §5; antes ÷250)            (+10 % por noche después de la primera)
      + especies nuevas × 5 (7, 9, 11 con Cuaderno de campo)
      + maneras de moverse nuevas × 3 (5, 7 con Premio al descubridor)
      + encargos × 2  + destellos × (Destello sabio)  + récords × 1
      + Gran enciclopedia: +25 / 50 / 75 % de todo lo anterior
      (nunca menos de 3, salvo con «Terminar ahora»)
```

En pantalla, cada número es entero y se puede comprobar:

```
💧 Por cada 250 de Esencia, 1 Dato
💧 310.000 Esencia ganada  ÷  250 (= 1 Dato)        = 1.240
1.240 Datos   🌙 ×1,2 Noche 3                        = 1.488
+ 🧬 2 × 9 especies nuevas                            =  +18
+ ↗ 1 × 3 maneras de moverse nuevas                   =   +3
+ 📋 1 × 2 encargos                                   =   +2
+ 1.511 Datos × 25 % 📚 Enciclopedia                  = +377
──────────────────────────────────────────────────────────────
📊 Datos                                               1.888
```

- **División lineal (÷250)**: «cada 250 de Esencia es 1 Dato». La página decía ÷100; con la economía de hoy (≈3× la
  Esencia por sesión que la tabla de la página) ÷100 compraba el árbol entero en 13 sesiones y luego las sesiones se
  estancaban (§11). Es una sola constante (`DATOS_ESSENCE_DIV`). Nada oculto: la noche y la enciclopedia salen como filas.
- **«Especie nueva» = primera vez en la partida**: repetir sesiones no cultiva bonus.
- **Récords** desde la sesión 2; **mínimo 3 Datos**.
- El HUD enseña la misma cuenta **antes** de que acabe la sesión (`sessionPreview` + `datosExplain`).

### 3.4 Lo que se retira

- **Calibrar** (mandos μ/σ/R/dt, Recetas, anillos a mano, «Mapa de especies»): sustituido por la ruta 🌍 **Mundos**
  (§4.3). Nadie mueve μ ni σ.
- **Muestras**: su papel lo cumplen los Datos por especie/comportamiento; sus mejoras son nodos de 🔬 Descubrir.
- **Genoma y Extinción**: el prestigio es la **noche** (§5), gratis y sin reinicio doloroso.
- **Turno de laboratorio, Reserva, Pipeta rápida**: la sesión *es* el turno; sin offline.
- **Pincel y Formas de semilla** (ring/noise): retirados — eran elecciones con contra (más sorpresa, menos éxito). La
  Gota grande se queda (pura ganancia).

## 4. El Árbol: 7 rutas rectas

### 4.1 Forma

`src/game/tree.ts` (datos y lógica, puros) · `src/ui/tree/` (pantalla). **54 nodos**: el **centro** (la noche) y **7
rutas rectas** de 6 a 9 pasos. Reglas fijas (con test):

- **Cadena estricta:** el paso *k* solo necesita el paso *k − 1* de su ruta (nivel ≥ 1); el primero, el centro. Sin
  cruces, sin dos requisitos, sin caminos sin salida.
- **Siempre más:** cada nivel de cada nodo mejora estrictamente **un número** que se enseña como **«antes → después»**
  (`beforeAfter`, test sobre todos los niveles, solo y con el árbol lleno). Si un nodo posterior ya hace todo su trabajo
  (Gotero maestro → «toda semilla prende»; Placa gigante → la placa máxima), el anterior pasa a «¡Completo!»
  (`supersededBy`): nunca se compra un nivel que no da nada.
- **Anillos = bandas:** los nodos de un anillo quedan entre dos círculos de noche; el anillo marca el primer precio y la
  noche que lo abre (anillos 1–2: Noche 1 · anillo 3: Noche 2 · anillo 4: Noche 3 · anillo 5: Noche 4).

| Dirección | Ruta | Color | Para qué |
|---|---|---|---|
| ↑ | ⏱ **Reloj** | celeste | más tiempo por sesión y un arranque más rápido |
| ↗ | 💧 **Gotero** | turquesa | semillas que prenden más y más para sembrar |
| → | 🧫 **Placa** | lavanda | una placa más grande, con sitio para todas |
| ↘ | 🌱 **Vida** | rosa | cada criatura da más Esencia por segundo |
| ↙ | 🔬 **Descubrir** | naranja | más Datos por cada cosa nueva |
| ← | 🌍 **Mundos** | violeta | reglas nuevas donde nacen otras especies (sustituye a Calibrar) |
| ↖ | ✨ **Destello** | dorado | la chispa dorada viene más y regala más |

### 4.2 Todas las mejoras

Precios con la regla de §9 (anillo × factor^nivel). «Antes → después» como lo enseña la hoja (con los pasos anteriores
de la ruta comprados). Tablas generadas del código: `npx vite-node scripts/tree-table.ts`.

**Reloj** — Más tiempo en cada sesión y un arranque más rápido.

| # | Nodo | Anillo · 🌙 | Niveles | Precios (×factor) | Antes → después (de 0 al máximo) |
|---|---|---|---|---|---|
| 1 | Más tiempo | 1 · 1 | 6 | 2 · 3 · 5 · 7 · 10 · 15 (×1,5) | Sesión 0:15 → Sesión 0:20 → Sesión 0:25 → Sesión 0:30 → Sesión 0:35 → Sesión 0:40 → Sesión 0:45 |
| 2 | Reloj grande | 2 · 1 | 3 | 15 · 30 · 60 (×2) | Sesión 0:45 → Sesión 0:55 → Sesión 1:05 → Sesión 1:15 |
| 3 | Nevera | 2 · 1 | 3 | 15 · 30 · 60 (×2) | 1 criatura viva al empezar → 2 criaturas vivas al empezar → 3 criaturas vivas al empezar → 4 criaturas vivas al empezar |
| 4 | Recta final | 3 · 2 | 3 | 400 · 800 · 1600 (×2) | Al final: Esencia ×1 → Al final: Esencia ×1,5 → Al final: Esencia ×2 → Al final: Esencia ×2,5 |
| 5 | Encargos con prisa | 3 · 2 | 2 | 400 · 800 (×2) | +3 s por encargo → +6 s por encargo → +9 s por encargo |
| 6 | Reloj de arena | 3 · 2 | 3 | 400 · 800 · 1600 (×2) | Sesión 1:15 → Sesión 1:30 → Sesión 1:45 → Sesión 2:00 |
| 7 | Reloj eterno | 4 · 3 | 3 | 12.000 · 24.000 · 48.000 (×2) | Sesión 2:00 → Sesión 2:10 → Sesión 2:20 → Sesión 2:30 |

**Gotero** — Viven más semillas, y tienes más para sembrar.

| # | Nodo | Anillo · 🌙 | Niveles | Precios (×factor) | Antes → después (de 0 al máximo) |
|---|---|---|---|---|---|
| 1 | Gotero | 1 · 1 | 3 | 2 · 4 · 8 (×2) | Viven 24 de cada 100 → Viven 32 de cada 100 → Viven 45 de cada 100 → Viven 59 de cada 100 |
| 2 | Esencia de bolsillo | 2 · 1 | 4 | 15 · 30 · 60 · 120 (×2) | Empiezas con 20 de Esencia → Empiezas con 50 de Esencia → Empiezas con 110 de Esencia → Empiezas con 290 de Esencia → Empiezas con 820 de Esencia |
| 3 | Semillas de regalo | 3 · 2 | 3 | 400 · 800 · 1600 (×2) | 1 semilla gratis → 3 semillas gratis → 5 semillas gratis → 7 semillas gratis |
| 4 | Semillas fuertes | 3 · 2 | 5 | 400 · 600 · 900 · 1400 · 2000 (×1,5) | Viven 59 de cada 100 → Viven 65 de cada 100 → Viven 71 de cada 100 → Viven 76 de cada 100 → Viven 80 de cada 100 → Viven 84 de cada 100 |
| 5 | Semilla grande | 3 · 2 | 1 | 400 (×2) | No → Semilla grande (más del doble) |
| 6 | Sembrador automático | 3 · 2 | 6 | 400 · 600 · 900 · 1400 · 2000 · 3000 (×1,5) | Nunca → Cada 8 s → Cada 6,4 s → Cada 5,1 s → Cada 4,1 s → Cada 3,3 s → Cada 2,6 s |
| 7 | Semillas baratas | 4 · 3 | 3 | 12.000 · 24.000 · 48.000 (×2) | Precio normal → Semillas −15 % → Semillas −28 % → Semillas −39 % |
| 8 | Gotero maestro | 5 · 4 | 1 | 80.000 (×2) | Viven 84 de cada 100 → Viven 100 de cada 100 |

**Placa** — Una placa más grande, con sitio para todas.

| # | Nodo | Anillo · 🌙 | Niveles | Precios (×factor) | Antes → después (de 0 al máximo) |
|---|---|---|---|---|---|
| 1 | Placa más grande | 1 · 1 | 2 | 2 · 6 (×3) | Ø128 → Ø160 → Ø192: Sitio para 3 criaturas → Sitio para 4 criaturas → Sitio para 5 criaturas (Corrección v0.015, `docs/ESPECIES.md` §5) |
| 2 | Más sitio | 2 · 1 | 3 | 15 · 30 · 60 (×2) | Sitio para 12 criaturas → Sitio para 13 criaturas → Sitio para 14 criaturas → Sitio para 15 criaturas |
| 3 | Sin apretujones | 3 · 2 | 2 | 400 · 800 (×2) | Sitio para 15 criaturas → Sitio para 16 criaturas → Sitio para 17 criaturas |
| 4 | Guardería | 3 · 2 | 1 | 400 (×2) | 3 creciendo a la vez → 5 creciendo a la vez |
| 5 | Incubadora | 3 · 2 | 2 | 400 · 1200 (×3) | Nacen en 8,9 s → Nacen en 7,6 s → Nacen en 6,7 s |
| 6 | Placa gigante | 4 · 3 | 1 | 12.000 (×2) | Sitio para 17 criaturas → Sitio para 20 criaturas |
| 7 | Placa variada | 4 · 3 | 2 | 12.000 · 24.000 (×2) | +0 % por especie viva → +3 % por especie viva → +6 % por especie viva |

**Vida** — Cada criatura da más Esencia por segundo.

| # | Nodo | Anillo · 🌙 | Niveles | Precios (×factor) | Antes → después (de 0 al máximo) |
|---|---|---|---|---|---|
| 1 | Cultivo | 1 · 1 | 5 | 2 · 3 · 5 · 7 · 10 (×1,5) | Esencia ×1 → Esencia ×1,15 → Esencia ×1,32 → Esencia ×1,52 → Esencia ×1,75 → Esencia ×2,01 |
| 2 | Comida extra | 2 · 1 | 3 | 15 · 30 · 60 (×2) | Esencia +0 % → Esencia +8 % → Esencia +16 % → Esencia +24 % |
| 3 | Superalimento | 3 · 2 | 3 | 400 · 800 · 1600 (×2) | Esencia ×1 → Esencia ×1,25 → Esencia ×1,56 → Esencia ×1,95 |
| 4 | Nadadoras | 3 · 2 | 3 | 400 · 800 · 1600 (×2) | Nadadoras +0 % → Nadadoras +15 % → Nadadoras +30 % → Nadadoras +45 % |
| 5 | Tranquilas | 3 · 2 | 3 | 400 · 800 · 1600 (×2) | Quietas +0 % → Quietas +15 % → Quietas +30 % → Quietas +45 % |
| 6 | Familias | 4 · 3 | 3 | 12.000 · 24.000 · 48.000 (×2) | Colonias +0 % → Colonias +15 % → Colonias +30 % → Colonias +45 % |
| 7 | Amistad | 4 · 3 | 1 | 12.000 (×2) | No → Especies amigas: Esencia ×1,5 |
| 8 | Vida abundante | 4 · 3 | 1 | 12.000 (×2) | Toda la Esencia ×1 → Toda la Esencia ×1,5 |
| 9 | Vida eterna | 5 · 4 | ∞ | 50.000 · 55.000 · 61.000 · 67.000 · 73.000 · … (×1,1) | Esencia ×1 → Esencia ×1,1 → Esencia ×1,21 → Esencia ×1,33 → Esencia ×1,46 → Esencia ×1,61 → Esencia ×1,77 → … |

**Descubrir** — Más Datos por cada cosa nueva que encuentras.

| # | Nodo | Anillo · 🌙 | Niveles | Precios (×factor) | Antes → después (de 0 al máximo) |
|---|---|---|---|---|---|
| 1 | Cuaderno de campo | 1 · 1 | 3 | 2 · 4 · 8 (×2) | 5 Datos por especie nueva → 7 Datos por especie nueva → 9 Datos por especie nueva → 11 Datos por especie nueva |
| 2 | Copiadora | 2 · 1 | 1 | 15 (×2) | No → Copias que siempre viven |
| 3 | Coleccionista | 3 · 2 | 5 | 400 · 600 · 900 · 1400 · 2000 (×1,5) | Bestiario: Esencia +0 % → Bestiario: Esencia +10 % → Bestiario: Esencia +20 % → Bestiario: Esencia +30 % → Bestiario: Esencia +40 % → Bestiario: Esencia +50 % |
| 4 | Archivo | 3 · 2 | 2 | 400 · 800 (×2) | Nunca → Copia gratis cada 15 s → Copia gratis cada 8 s |
| 5 | Microscopio | 3 · 2 | 2 | 400 · 800 (×2) | Ficha simple → Dónde vive y cómo se mueve → Todos los detalles |
| 6 | Premio al descubridor | 4 · 3 | 2 | 12.000 · 24.000 (×2) | 3 Datos por manera nueva → 5 Datos por manera nueva → 7 Datos por manera nueva |
| 7 | Semillas curiosas | 4 · 3 | 1 | 12.000 (×2) | No → Buscan especies que no tienes |
| 8 | Copias sorpresa | 4 · 3 | 1 | 12.000 (×2) | No → Copias con sorpresa |
| 9 | Gran enciclopedia | 5 · 4 | 3 | 80.000 · 160.000 · 320.000 (×2) | Datos +0 % → Datos +25 % → Datos +50 % → Datos +75 % |

**Mundos** — Reglas nuevas en las que nacen otras especies.

| # | Nodo | Anillo · 🌙 | Niveles | Precios (×factor) | Antes → después (de 0 al máximo) |
|---|---|---|---|---|---|
| 1 | Mundo 2 · Frío | 1 · 1 | 1 | 2 (×2) | 2 especies para encontrar → 5 especies para encontrar |
| 2 | Mundo 3 · Remolinos | 2 · 1 | 1 | 15 (×2) | 5 especies para encontrar → 7 especies para encontrar |
| 3 | Mundo 4 · Escudos | 3 · 2 | 1 | 400 (×2) | 7 especies para encontrar → 11 especies para encontrar |
| 4 | Mundo 5 · Discos | 3 · 2 | 1 | 400 (×2) | 11 especies para encontrar → 14 especies para encontrar |
| 5 | Mundo 6 · Patas | 4 · 3 | 1 | 12.000 (×2) | 14 especies para encontrar → 16 especies para encontrar |
| 6 | Mundo 7 · Gigantes | 5 · 4 | 1 | 80.000 (×2) | 16 especies para encontrar → 17 especies para encontrar |

**Destello** — La chispa dorada viene más y regala más.

| # | Nodo | Anillo · 🌙 | Niveles | Precios (×factor) | Antes → después (de 0 al máximo) |
|---|---|---|---|---|---|
| 1 | Destello frecuente | 1 · 1 | 3 | 2 · 4 · 8 (×2) | Llega cada 40–45 s → Llega cada 34–38 s → Llega cada 29–33 s → Llega cada 25–28 s |
| 2 | Destello lento | 2 · 1 | 2 | 15 · 30 (×2) | Se queda 8 s → Se queda 11 s → Se queda 14 s |
| 3 | Destello del tiempo | 2 · 1 | 2 | 15 · 30 (×2) | +0 s por chispa → +2 s por chispa → +4 s por chispa |
| 4 | Primer destello | 3 · 2 | 1 | 400 (×2) | La primera a los 6–12 s → La primera a los 2–4 s |
| 5 | Regalos mejores | 3 · 2 | 3 | 400 · 800 · 1600 (×2) | Regalo: 10 s de Esencia → Regalo: 12 s de Esencia → Regalo: 14 s de Esencia → Regalo: 16 s de Esencia |
| 6 | Destello sabio | 3 · 2 | 2 | 400 · 800 (×2) | +0 Datos por chispa → +1 Dato por chispa → +2 Datos por chispa |
| 7 | Semillas mágicas | 4 · 3 | 1 | 12.000 (×2) | 1 semilla segura por chispa → 3 semillas seguras por chispa |

Diferencias con la página del plan: **Placa más grande tiene 3 niveles** (sitio para 5 → 7 → 9 → 12; Placa gigante, 15);
**Más sitio** y **Sin apretujones** dan sitio (+1 criatura por nivel) en lugar de abaratar; **Guardería** deja crecer más
semillas a la vez; **Coleccionista** (Catalogación) multiplica toda la placa; **Pincel y Formas** se retiran (§3.4);
**«Descubrir da tiempo»** pasa a regla base (+5 s por especie nueva); los precios de los anillos se ajustaron con el bot
(§9, §11). Nombres de nodos según CLARIDAD J-104…J-111 (los ids no cambian).

### 4.3 Mundos: las reglas como tarjetas (sustituye a Calibrar)

`src/game/worlds.ts`. Un mundo es un **preajuste fijo** de `LeniaParams` (μ, σ, R, anillos del núcleo). La ruta 🌍 los
abre en orden; el mundo recién abierto queda elegido para la próxima sesión (`researchBuy`) y la tarjeta de inicio deja
cambiar a cualquiera abierto (`pickWorld`). Las semillas de un mundo salen de **sus** especies (la primera para las
semillas seguras; las que aún no tienes, 3× más probables; ×2 más con Semillas curiosas). En un mundo solo se pueden
revelar **sus** especies del catálogo, por la firma (sin distancia de parámetros: Triscutium vive en Discos a 3,1
unidades de su punto del catálogo).

**Una especie nueva por mundo, que se vea distinta** (Corrección v1.2, `docs/ESPECIES.md`): cada mundo trae UNA forma
que un niño distingue de un vistazo de todas las de los mundos anteriores (un agujero, girar, un escudo hueco, patas, una
escalera, una oruga gigante), con su color propio desde la primera vez. Las formas del catálogo que viven en un mundo
pero se parecen a una especie ya listada son sus **variantes** (`variants`): no se siembran y nunca son «especie nueva».

Comprobación con la simulación de referencia en CPU (`npx vite-node scripts/world-check.ts`): la plantilla exacta de
cada especie, en el preajuste del mundo, en un toro de 128²; «vive» si su masa queda entre 0,4× y 2,5× y no inunda la
placa (< 20 %), y `--features` comprueba además que **guarda la forma** por la que el juego la revela (firma estática a
menos de 1,2 de su referencia) y mide cómo se ve.

| Mundo | Nodo (anillo) | Preajuste μ · σ · R · anillos | Especie (Bestiario) | Variantes | Maneras de moverse (medidas) | Paga por criatura* | Esencia del mundo |
|---|---|---|---|---|---|---|---|
| 1 · Clásico | gratis | 0,15 · 0,015 · 13 · [1] | Nadadora (Orbium unicaudatus) | O2b, O4i | nada | 1,76 | ×1 |
| 2 · Frío | Mundo 2 (1) | 0,38 · 0,07 · 13 · [1] | Anillo (Circium ventilans) | — | quieta, late | 1,84 | ×1,1 |
| 3 · Remolinos | Mundo 3 (2) | 0,16 · 0,0222 · 13 · [1] | Remolino (Gyrorbium gyrans) | O4d | gira | 3,34 | ×1,2 |
| 4 · Escudos | Mundo 4 (3) | 0,356 · 0,063 · 13 · [1] | Escudo (Discutium solidus) | PS3am | nada | 3,37 | ×1,3 |
| 5 · Hélices | Mundo 5 (3) | 0,23 · 0,0355 · 13 · [1] | Bailarina (Helicium cavus pedes) | P3sp | gira | 6,90 | ×1,4 |
| 6 · Patas | Mundo 6 (4) | 0,29 · 0,0465 · 13 · [1] | Escalera (Paraptera cavus pedes) | S1s | nada | 7,68 | ×1,5 |
| 7 · Gigantes | Mundo 7 (5) | 0,25 · 0,033 · 18 · [½, 1, ⅔] | Oruga (Hydrogeminium natans) | — | nada | 9,60 | ×1,6 × **2** (cabe la mitad) |

\* Complejidad medida × manera de moverse × rareza (`world-check.ts --yield`). **Esencia del mundo**
(`worldEssenceMult`): cada mundo después del primero, ×(1 + 0,1·(n − 1)) (`WORLD_ESSENCE_STEP`). Los Gigantes ocupan
el doble (R 18): cabe la mitad (`roomMult` ½) y cada uno vale ×2.

**Maneras de moverse** (`npx vite-node scripts/world-check.ts --behaviors`, 3 colocaciones × 1 500 pasos;
`WORLD_BEHAVIORS`): **nada** en Clásico, Escudos, Patas y Gigantes; **gira** en Remolinos y Hélices; en Frío el Anillo se
queda **quieto** y en una colocación de tres **late**. Ninguna especie se divide ni forma colonia (los Encargos
`s_split` y los logros de dividirse/colonia siguen fuera).

**Lo que la medida cambió** (detalle en `docs/ESPECIES.md` §2):

- El viejo **Frío** (Orbium ignis, Synorbium solidus, phantasma) y la **Pareja** del Clásico (Synorbium ignis) eran
  Orbium: ahora son variantes de la Nadadora. Frío pasa al punto del catálogo de **Circium** (el anillo).
- **Escudos**: Scutium solidus/valvatus y Gyropteron arcus eran tres copas iguales a ese preajuste, y Paraptera cambiaba
  de forma. Ahora Escudos es el **Discutium** (antes en «Discos»); las copas son variantes pequeñas del Escudo.
- **Discos**: Circium moría ahí y Triscutium cambiaba de forma (se registraba como desconocida). El nodo 5 pasa a
  **Hélices** (Helicium cavus pedes, su sitio original); Synptera es su variante.
- **Patas** pasa a **Paraptera cavus pedes** (la Escalera), en 0,29 · 0,0465, donde guarda su forma.
- Total: **7 especies** de Bestiario, una por mundo (antes 17, la mitad repeticiones). Las siete de Albor
  (`ALBOR_SPECIES_CODES`) pasan a ser exactamente las siete.

### 4.4 Qué se ve: reglas de revelado

| Estado | Cuándo | Cómo se ve |
|---|---|---|
| **Tuyo** | nivel ≥ 1 | borde brillante del color de la ruta, halo, insignia «2/5» o ✓ |
| **Comprable ya** | el paso anterior es tuyo, anillo abierto y Datos suficientes | **late en verde**, precio en verde |
| **Disponible** | el paso anterior es tuyo, faltan Datos | icono legible, precio en su color |
| **«?»** | el paso siguiente a algo visible, o en un anillo que la noche aún no abrió | baldosa punteada con «?»; si es por la noche, insignia 🌙2 |
| **Oculto** | más lejos en la ruta | no se dibuja |

### 4.5 Gotero: lo que de verdad prende (medido)

La página marcaba ≈25/35/45/60 % como objetivos. El Gotero y el Estabilizador (en el juego, «Semillas fuertes») mueven el sesgo hacia la plantilla y quitan
ruido (`DROPPER_TREE_BIAS/NOISE`, `STABILIZER_TREE_BIAS/NOISE`, `seedConfig`); los porcentajes que enseña la UI son los
**medidos** (`SEED_SUCCESS`, `npx vite-node scripts/world-check.ts --seeds`: una semilla de radio R con la densidad del
juego y una plantilla del Mundo Clásico, 500 pasos en un toro de 64²; «prende» si queda un cuerpo de criatura).

| Gotero \ Estabilizador | 0 | 1 | 2 | 3 | 4 | 5 | (sesgo · ruido sin Estabilizador) |
|---|---|---|---|---|---|---|---|
| Sin Gotero | **24 %** | 29 % | 35 % | 41 % | 48 % | 54 % | 0,815 · 0,35 |
| Gotero I | **32 %** | 38 % | 44 % | 51 % | 57 % | 63 % | 0,83 · 0,33 |
| Gotero II | **45 %** | 51 % | 58 % | 64 % | 70 % | 75 % | 0,85 · 0,30 |
| Gotero III | **59 %** | 65 % | 71 % | 76 % | 80 % | 84 % | 0,87 · 0,25 |
| Gotero maestro | **100 %** (plantilla pura, ruido 0,08) | | | | | | 1 · 0,08 |

Cada nivel de Estabilizador suma +0,01 de sesgo y quita 0,012 de ruido (+5–7 puntos medidos). Objetivos de la página:
≈25/35/45/60 % → medidos 24/32/45/59 %; Estabilizador «+6 % → +30 %» → medido +25 puntos con Gotero III. Las 24
casillas se midieron con 100 semillas cada una (±5 %) más 13 barridos de sesgo/ruido (~3 000 semillas en CPU); la tabla es
un ajuste logístico de todas ellas para que cada nivel lea más que el anterior. **Fase 2:** volver a medir con la GPU y la
placa redonda (la detección real decide qué es «criatura»).

**Frío (2B, medido):** el juego de prueba de sesiones encontró el Mundo 2 vacío: con la semilla del Clásico prende el 3 %
(`world-check.ts --seeds --world=cold`, 20 semillas por especie: Orbium ignis 0 %, Synorbium solidus 5 %, Orbium phantasma
5 %); hasta la plantilla pura a un ángulo libre vive solo 5–65 %, porque el giro bilineal emborrona su borde fino. En
Frío (`WORLD_SEED_HELP`) la semilla gira en **cuartos de vuelta exactos** (`rotateQuarter`, una copia celda a celda) y
lleva +0,07 de sesgo y −0,12 de ruido: Gotero 0/I/II/III → **30/47/57/83 %**, maestro 93 % (30 semillas por casilla).
Las semillas de plantilla pura (seguras, Nevera, copias) giran en cuartos de vuelta en todos los mundos: viven siempre.
Los demás mundos con la semilla del Clásico (20 por especie): Remolinos 35 %, Escudos 49 %, Discos 41 %, Patas 55 %,
Gigantes 100 %. El bot ya suponía el porcentaje del Clásico en todos (es estadístico): su informe no cambia.

### 4.6 De las mejoras antiguas a los nodos

| Antes | Ahora |
|---|---|
| Gotero I–V | 💧 Gotero (3) · Semilla grande · Gotero maestro (todas las semillas viven) |
| Estabilizador (10) | 💧 Semillas fuertes (5) |
| Sembrador automático | 💧 Sembrador automático (6 niveles, 20 s → 6,6 s) |
| Cultivo · Nutriente | 🌱 Cultivo (5) · Nutriente (3) · Superalimento (3) · Vida abundante · Vida eterna (∞) |
| Afinidad nadadora / sésil / colonial | 🌱 Nadadoras · Tranquilas · Familias (+15 % por nivel) |
| Placa I–IV · Incubadora | 🧫 Placa más grande (3) · Más sitio · Sin apretujones · Guardería · Incubadora (nacen ×2/×3 más rápido) · Placa gigante · Placa variada |
| Calibrador I–IV, Recetas, Anillos dobles/triples, Microscopio III (mapa) | 🌍 **Mundos 2–7** (sin mandos) |
| Microscopio I–II, Marcador, Catalogación, Archivo, Imprimir | 🔬 Microscopio (2) · Coleccionista (5) · Archivo (2) · Copiadora |
| Genoma: Mutaciones / Simbiosis / Arranque con Esencia / Turno doble / Sembrador fiel | 🔬 Copias sorpresa · 🌱 Amistad · 💧 Esencia de bolsillo · ⏱ Reloj grande · 💧 Sembrador |
| Reserva, Pipeta rápida, Termo, Paneles, Recetas guardadas | retirados (se reembolsan al migrar) |

## 5. Noches: el prestigio, gratis

La historia mide los actos con `view.era` (= la noche en el ciclo de sesiones): Acto I = noche 1, Acto II = noches 2–5,
Acto III = noche 6+. La noche avanza con el **nodo central**, que **no cuesta Datos**:

| Pasar a | Sesiones terminadas | Especies en el Bestiario | o bien (nunca atascado) |
|---|---|---|---|
| Noche 2 (abre el anillo 3) | 4 | 2 | 8 sesiones |
| Noche 3 (anillo 4) | 8 | 4 | 12 |
| Noche 4 (anillo 5) | 13 | 7 | 17 |
| Noche 5 | 20 | 10 | 24 |
| Noche 6 (Acto III) | 29 | 12 | 33 |
| Noche 7 (la pregunta final) | 40 | 14 | 44 |

(RITMO §5: con partidas de 0:15 a 2:30 la noche 7 llega en la partida 40 ≈ **1,7 h**.)

Con sesiones de 2:00 a 5:00 y ~45 s de resumen y Árbol, la noche 7 llega hacia los **~2 h** (§11). Cada noche da **+10 %
de Datos** (fila visible en la ecuación) y el ritual de la lámpara (escena `a1_night`: «¡La noche puede avanzar! Mira el
centro del Árbol. No se borra nada. Se abren mejoras nuevas.»). La primera vez lo dice VELA; desde la Noche 3 también un
aviso (`TEXT.nightReady`). En la vista: `research.nightReady` y `research.nightProgress` sustituyen a
`extinction.available`/`progress` (que valen `false`/0 en este ciclo).

## 6. Encargos dentro de las sesiones

La cadena **persiste** entre sesiones; el encargo actual sale en la tarjeta de inicio y en la barra de objetivo. **En la
sesión 1 no se ve ningún Encargo** (CLARIDAD §3.3): los pasos que se cumplen pasan en silencio y el primero que se ve
llega en la sesión 2. Recompensas: Esencia (**como mucho 20 s de tu Esencia**, `SIDE_REWARD.sessionMaxSec`; los 60–180 s
del plan eran un tercio de una sesión), **+5 s** de reloj y **+2 Datos** (`game.grantEncargo`). Si se cumple entre
sesiones (en el Árbol), la Esencia y los +5 s pasan a la sesión siguiente (`GameState.carry`). Los objetivos de
`balance.ts` siguen enseñando por debajo con la misma regla (10 s de Esencia, `SESSION_OBJECTIVE_SECONDS`).

`src/story/encargoScript.ts`: el texto principal de cada Encargo es el del ciclo de sesiones; `classic` guarda el del
ciclo clásico donde cambia (se borra en la Fase 2B) y `resolveEncargo(def, view)` elige. Cambios (CLARIDAD J-14…J-17,
J-37…J-42, J-129…J-135):

| Encargo | Ciclo de sesiones | Métrica |
|---|---|---|
| `dropper`, `culture`, `dish` | «Compra el Gotero / Cultivo / «Placa más grande» en el Árbol.» | `upgrade:<nodo>` |
| `calib` | «Abre el Mundo 2 en el Árbol.» | `upgrade:worldCold` |
| `move` | «Juega una sesión en el Mundo 2.» | `world` = cold, con el reloj corriendo |
| `seeder` | «Compra Más tiempo en el Árbol.» (el Sembrador es de la Noche 2) | `upgrade:clock` |
| `era100k` | «Gana 2 000 Esencia en una sesión.» | `sessionEssence` |
| `extinct` | «Empieza una noche nueva en el Árbol.» | noches − 1 |
| `genome` | «Compra 5 mejoras en el Árbol.» | `treeNodes` |
| `colony` | «Ten tres iguales a la vez.» (ningún mundo da colonias) | `sameSpecies` |
| `calibNew`, `s_new` | «Juega un mundo nuevo hasta que nazca algo.» | especie nueva |
| `rings` | «Abre el Mundo 7 · Gigantes.» | `upgrade:worldGiants` |
| `seven` | «Encuentra las siete especies de Albor.» | `seedSpecies` (nombres exactos) |
| `s_dancer` · `s_heart` · `s_split` | solo si algún mundo abierto da esa manera de moverse (gira sí; late y se divide, ninguno) | `behavior` |
| `swimmer`, `s_spin90` | un minuto | `keepAlive` |
| Premios en Muestras | Esencia (+5 s y +2 Datos de todo Encargo) | — |

El progreso dice qué es cada número: «1 de 3», «2,4 de 3 Esencia/s», «1:20 de 2:00» (J-136).

## 7. Progreso offline

No hay: la sesión solo corre mientras se juega. `OFFLINE_DATOS = 0` queda preparado.

## 8. Qué se conserva y qué se reinicia

| Se conserva siempre | Se reinicia en cada sesión |
|---|---|
| Datos sin gastar, niveles del árbol, mundos abiertos y el elegido | La placa (vuelven las criaturas de la Nevera que viven en ese mundo) |
| Bestiario: especies, retratos, nombres | Esencia (20 + Esencia de bolsillo) |
| Comportamientos, logros, Bitácora, estadísticas, récords, historial | Reloj, buffs, destello, semillas gratis/seguras |
| Historia, Encargos, elecciones, finales, ajustes | Estado «desbordada» |

## 9. Precios claros

1. **Una regla, siempre la misma, sin azar:** `precio = inicio del anillo × factor^nivel`, redondeado amable (enteros
   por debajo de 100; dos cifras por encima). Inicio por anillo: **2 · 15 · 400 · 12 000 · 80 000** (RITMO §5; Vida
   eterna 50 000; Más tiempo ×1,5). Historia: **2 · 15 · 100 · 2 000 · 6 000** (página: 3 · 10 · 100 ·
   2 000 · 20 000; el bot pidió anillo 1 más barato para 3–5 compras tras las primeras sesiones, anillo 2 algo más caro
   para que el Mundo 3 no llegara a la vez que todo lo demás, y anillo 5 al alcance de las últimas noches). Factor
   **×2**; **×1,5** en los nodos de 5 o más niveles; **×3** en Placa más grande e Incubadora; **Vida eterna** tiene su
   propio inicio (**10 000**) y **×1,1** (cuesta un 10 % más y da un 10 % más en cada nivel: las últimas noches compran 3–7
   niveles y crecen ×1,3–2 por sesión; a 6 000 compraban 12 y los números se disparaban ×3 por sesión).
2. **La hoja de cada nodo** enseña el precio como ecuación `[2 · precio de salida] × [×4 · 2 niveles comprados: cada uno
   el doble] = [8 Datos]` con la regla en palabras («Empieza en 2 Datos; cada nivel cuesta el doble.»; ×1,5 «la mitad
   más», ×3 «el triple», ×1,1 «un poquito más»: CLARIDAD J-88, J-89). **Un toque en el precio** abre la hoja compartida
   **«¿Por qué cuesta esto?»** (`createPriceSheet` de Momentos, `nodePriceExplain`): la misma ecuación, la regla, los 3
   niveles siguientes con lo que dan («nivel 3 · 8 Datos → Sesión 2:45») y **«Te faltan 3 Datos — una sesión más»**.
3. **«Próximos niveles»**: mini gráfico de barras (altura = precio, encima lo que da).
4. **«Datos 38 / 50»** con barra y «Te faltan 12 Datos — unas 2 sesiones» (media de las 3 últimas, `sessionsToAfford`).
5. Al comprar, el **PriceTicker** de Momentos junto a los Datos dice **«−12 · Más tiempo»** con la flecha ↓.
6. Las semillas dentro de la sesión siguen con `seedprice` (Momentos).

## 10. La pantalla del árbol

`createTreeView(root, opts)`: pantalla completa, fondo de noche, círculos guía por anillo y círculos punteados con luna
para las noches cerradas (con niebla detrás). Arriba: Datos grandes, «Árbol · Noche 2 · 3 mejoras listas», **«▶ Nueva
sesión»**. Abajo: + / − / centrar (52 px). Arrastrar, pellizcar o rueda (0,16×–1,9×); al alejarse se ocultan los nombres
y salen los de las rutas en el borde. **Tocar un nodo** abre la hoja (abajo en móvil, a la derecha en escritorio): icono,
**NOMBRE**, «Reloj · Paso 1 de 7», **NIVEL 2/3**, el bloque **AHORA → CON UN NIVEL MÁS** («Sesión 2:15 → Sesión 2:30»,
gris → verde), una línea de descripción, el precio tocable (§9), los niveles siguientes, la barra de Datos y el botón
**«Comprar · 📊 12»**. Los nodos de mundo enseñan sus especies (siluetas «?» las que faltan). Comprar: salto, anillo de
partículas del color de la ruta, «2/3» flotando, el contador rebota, la línea crece hacia el «?» siguiente y gira.
Accesible: cada nodo es un botón con nombre y nivel; teclado (Tab/Enter, flechas, +/−, Esc); 48 px; claro/oscuro; es/en.

## 11. Ritmo: bot de sesiones

> **Actualizado:** el ritmo actual (partidas de 0:15 → 2:30, cámara rápida) y su tabla del bot están en
> [RITMO §6](RITMO.md#6-bot-la-tabla-partida-a-partida). Las tablas de abajo son el ritmo anterior (sesiones de 2:00 →
> 5:00) y quedan como historia.

`npx vite-node scripts/session-bot.ts [sesiones=40] [corridas=3] [--verbose] [--policy=planner|greedy|kid] [--trace=N] [--runs]`.
Juega el **juego integrado** (`createGame({ cycle: 'sessions' })`): reloj, cartera, precio y sitio de las semillas,
Destello, Abono, Árbol, mundos, noches y Nevera son el código del juego. Solo la placa es un modelo (el estadístico del antiguo
`balance-bot.ts`, copiado en `session-bot.ts`; el bot del ciclo clásico se borró en 2B): una semilla vive con la probabilidad **medida** (§4.5) y se convierte en la especie de la plantilla que
eligió el juego; las maneras de moverse son las medidas en cada mundo (§4.3). Políticas: **planner** (un jugador
sensato: lo que llena la placa primero, cada mundo nuevo en cuanto se abre, llena la placa y luego Abono), **greedy** (lo
más barato primero), **kid** (siembra cada 0,6 s donde sea, compra al azar, mundo al azar, atrapa menos destellos, casi
nunca Abono). 45 s de resumen y Árbol por sesión.

### 11.1 Planner: mediana de 7 corridas, sesión a sesión

| Ses. | Noche | Reloj | Esencia | × anterior | Datos | Compras | Especies | Mundo | Abonos | Compró después (corrida 1) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 2:25 | 1339 | — | 24 | 5 | 2 | Clásico | 2 | Gotero ×3, Placa más grande ×2 |
| 2 | 1 | 2:15 | 3400 | ×2,54 | 22 | 3 | 2 | Clásico | 3 | Placa más grande, Mundo 2 · Frío, Cultivo ×2 |
| 3 | 2 | 2:25 | 6395 | ×1,88 | 48 | 8 | 5 | Frío | 2 | 🌙, Cultivo ×3, Más tiempo ×3 |
| 4 | 2 | 3:00 | 17,8 K | ×2,78 | 86 | 4 | 5 | Frío | 3 | Mundo 3 · Remolinos, Reloj grande ×2, Comida extra |
| 5 | 2 | 3:40 | 37,7 K | ×2,12 | 186 | 5 | 7 | Remolinos | 3 | Comida extra ×2, Más sitio ×3, Nevera |
| 6 | 3 | 3:15 | 46,9 K | ×1,24 | 208 | 8 | 7 | Remolinos | 3 | 🌙, Nevera ×2, Destello frecuente ×3, Esencia de bolsillo ×2 |
| 7 | 3 | 3:15 | 54,0 K | ×1,15 | 260 | 10 | 7 | Remolinos | 3 | Esencia de bolsillo ×2, Cuaderno de campo ×3, Copiadora, Destello lento ×2 … |
| 8 | 3 | 4:25 | 74,1 K | ×1,37 | 370 | 4 | 7 | Remolinos | 4 | Semillas de regalo, Sin apretujones, Superalimento |
| 9 | 3 | 3:55 | 86,9 K | ×1,17 | 419 | 4 | 7 | Remolinos | 4 | Coleccionista, Mundo 4 · Escudos, Recta final, Semillas fuertes |
| 10 | 4 | 4:15 | 152,0 K | ×1,75 | 768 | 9 | 11 | Escudos | 4 | 🌙, Guardería, Nadadoras, Archivo, Mundo 5 · Discos, Primer destello, Encargos con prisa |
| 11 | 4 | 4:20 | 176,4 K | ×1,16 | 953 | 8 | 14 | Discos | 4 | Semilla grande, Incubadora, Tranquilas, Microscopio, Regalos mejores, Sembrador automático, Destello sabio, Coleccionista … |
| 12 | 4 | 3:55 | 230,1 K | ×1,30 | 1201 | 6 | 14 | Discos | 4 | Sembrador automático, Semillas de regalo, Sin apretujones, Superalimento, Recta final |
| 13 | 4 | 3:55 | 342,1 K | ×1,49 | 1786 | 7 | 14 | Discos | 4 | Nadadoras, Archivo, Encargos con prisa, Tranquilas, Microscopio, Regalos mejores, Destello sabio, Coleccionista … |
| 14 | 5 | 3:55 | 421,1 K | ×1,23 | 2199 | 7 | 14 | Discos | 4 | 🌙, Sembrador automático, Incubadora, Coleccionista, Semillas fuertes, Sembrador automático, Semillas de regalo |
| 15 | 5 | 3:55 | 427,3 K | ×1,01 | 2403 | 5 | 14 | Discos | 4 | Superalimento, Recta final, Nadadoras, Tranquilas, Regalos mejores, Coleccionista |
| 16 | 5 | 4:05 | 882,7 K | ×2,07 | 4954 | 5 | 14 | Discos | 4 | Semillas fuertes, Sembrador automático ×2, Mundo 6 · Patas, Reloj de arena |
| 17 | 5 | 4:15 | 2,11 M | ×2,39 | 11 837 | 5 | 16 | Patas | 4 | Placa gigante, Familias, Premio al descubridor, Semillas baratas, Placa variada |
| 18 | 5 | 4:35 | 2,30 M | ×1,09 | 12 911 | 5 | 16 | Patas | 4 | Amistad, Semillas curiosas, Semillas mágicas, Vida abundante, Copias sorpresa |
| 19 | 6 | 4:35 | 3,32 M | ×1,44 | 18 577 | 6 | 16 | Patas | 4 | 🌙, Reloj de arena, Familias, Premio al descubridor, Semillas baratas, Placa variada |
| 20 | 6 | 5:15 | 4,21 M | ×1,27 | 25 281 | 4 | 16 | Patas | 4 | Mundo 7 · Gigantes, Reloj eterno, Gotero maestro |
| 21 | 6 | 5:35 | 6,73 M | ×1,60 | 43 540 | 4 | 17 | Gigantes | 4 | Gran enciclopedia, Familias, Semillas baratas, Vida eterna ×2 |
| 22 | 6 | 5:30 | 8,48 M | ×1,26 | 63 641 | 5 | 17 | Gigantes | 4 | Reloj eterno, Vida eterna, Gran enciclopedia, Vida eterna ×2 |
| 23 | 6 | 5:45 | 10,24 M | ×1,21 | 92 140 | 5 | 17 | Gigantes | 5 | Vida eterna ×4, Reloj eterno |
| 24 | 7 | 6:10 | 21,08 M | ×2,06 | 189 723 | 7 | 17 | Gigantes | 5 | 🌙, Vida eterna, Gran enciclopedia, Vida eterna ×3 |
| 25 | 7 | 6:10 | 27,09 M | ×1,29 | 303 488 | 6 | 17 | Gigantes | 4 | Vida eterna ×6 |
| 26 | 7 | 6:10 | 56,71 M | ×2,09 | 635 227 | 7 | 17 | Gigantes | 5 | Vida eterna ×6 |

`npx vite-node scripts/session-bot.ts 30 7 --policy=planner --runs` (con `--runs`, cada corrida y la curva sin los
regalos del Destello). Minutos acumulados (con 45 s de resumen y Árbol): S1 3 · S3 9 · S5 18 · S8 31 · S10 41 · S14 60 ·
S18 80 · S21 97 · **S24 117 (noche 7 lista)**.

### 11.2 Objetivos (2.ª prueba del dueño)

| Objetivo | Meta | planner | greedy | kid |
|---|---|---|---|---|
| Sesión 1 de 2:00, reloj a la vista desde la primera semilla | 2:00 | ✅ 2:00 (2:25 con sus «+5 s») | ✅ | ✅ |
| Compras tras cada sesión | ≥ 2 (3–5 al principio) | ✅ mín. 3 · primeras 5/3/8 | ✅ mín. 3 · 9/11/6 | mín. 1 (compra al azar) · 7/4/5 |
| Esencia por sesión en las noches 1–2 | ×1,6–2 | **×2,3** (más rápido de lo pedido) | ×2,7 | ×1,4 |
| La producción sube dentro de la sesión (primeros 30 s → final) | se ve | ✅ ×6 | ✅ ×6 | ✅ ×3,5 |
| Final de la historia (noche 7 lista) | ~2 h | ✅ S24 · 1,95 h | ✅ 2,02 h | S24 · 1,72 h |
| Noches 2/3/4/5 en S3/S6/S10/S14 | | ✅ | | noche 3 en S10 ✅ |
| Mínimo de Datos en una sesión | ≥ 3 | 19 | 22 | 6 |
| Rutas tocadas en la sesión 12 | ≥ 6/7 | 7/7 | 7/7 | 7/7 |
| **REGLA DURA: la mediana nunca rinde menos que en la sesión anterior** | 0 bajones | ✅ **0** (7 corridas; también 0 con 9) | 3 (S6 −11 %, S7 −3 %, S11 −9 %) | 8 (vuelve a mundos viejos al azar) |
| Corridas sueltas por debajo de la sesión anterior (información) | | 19 de 161 pares (12 %) | | |

**Lectura.**

- **Lo que hizo falta para la regla dura**, todo en precios y efectos (nada en el bot): regalos del Destello
  proporcionales y con un ritmo estable (80–100 s; con 50–110 s y ×1,4 por nivel una sesión de 6 min cazaba ~10 y la
  mitad de su Esencia era suerte); el Abono a la venta desde los 30 s y con precio de la Esencia actual (con el precio
  del récord, una gran sesión encarecía los Abonos de la siguiente: bajón seguro); **Coleccionista** para toda la placa
  (antes solo pagaba a especies ya registradas, y el primer turno en un mundo nuevo rendía menos); **cada mundo ×1,1 más
  de Esencia** y Gigantes con la mitad de sitio; objetivos y Encargos con poca Esencia (10–20 s); y Vida eterna con
  su propio precio.
- **Noches 1–2 crecen ×2,3 por sesión** (pedido ×1,6–2): las primeras compras son baratas y cada una se nota (Gotero,
  Placa, Mundo 2 y 3). Bajar más el ritmo (anillo 1 a 3, o Placa ×4) devolvía bajones en S3 y S6. Se deja así: más
  dinero y más rápido, como pidió el dueño.
- **greedy** (lo más barato primero) compra Destellos, Cuadernos y Neveras antes que lo que llena la placa, y entre S6 y
  S11 tiene tres sesiones planas o algo peores; **kid** vuelve a mundos viejos al azar (pagan menos) y por eso tiene
  bajones: elegir mundo es la única decisión que puede rendir menos, y la tarjeta de inicio elige el nuevo por él.

### 11.3 Límites del modelo

La placa estadística no tiene geometría (el sitio la limita por número); muertes y choques siguen el modelo del antiguo
`balance-bot.ts` (borrado en 2B); Encargos de la historia y la Bitácora no entran (solo los objetivos del juego). Fase 2B: medir con la
GPU y la placa redonda.

## 12. Anti-frustración

- **Ninguna sesión vale cero**: mínimo 3 Datos (salvo «Terminar ahora»), y la ecuación lo dice.
- **La primera semilla de cada sesión vive seguro**; en la sesión 1, las tres primeras (+3 gratis); cualquier sesión da
  una semilla segura si a los 45 s no hay nada vivo (`pityDue`).
- **La sesión 1 enseña solo semillas, criaturas y Esencia**: sin Encargos a la vista, sin píldora de Datos, sin Destello
  (CLARIDAD §3.3).
- **El reloj no corre** mientras explicas, lees o pausas; empieza con la primera semilla.
- **Crecer nunca castiga**: el precio de la semilla no sube por tener criaturas; una placa llena dice por qué y qué
  comprar.
- **Sin mandos que estropeen el mundo**: los mundos son preajustes comprobados; la Nevera solo replanta especies que viven
  en el mundo elegido. **Ninguna meta imposible**: lo que piden Encargos, logros y el final secreto existe en algún mundo.
- **Primeras compras baratas** (2 Datos) y siempre algo a la vista con «te faltan X Datos — unas N sesiones».
- **Noches gratis** y con salida por sesiones si faltan especies. Nada se pierde salvo la placa.

## 13. Partidas antiguas

`migrateLegacy(oldState)` (`src/game/legacy.ts`, generosa): **era → noche** (con las sesiones que esa noche pedía);
mejoras y nodos de Genoma → los nodos que hacen lo mismo, **regalando los pasos anteriores de su ruta**; **Calibrador →
los mundos que sus mandos alcanzaban** (I → Frío y Remolinos; II → Escudos y Patas; III → Discos; Anillos
dobles/triples → Gigantes; los mundos anteriores de la ruta, gratis) y el más nuevo queda elegido; lo que cae en un anillo aún cerrado se **reembolsa** a precio de árbol; lo
retirado se reembolsa (10 Datos por nivel; Recetas guardadas, 20); **regalo de bienvenida** (20 + 10 por Genoma sin
gastar + 5 por gastado + 2 por Muestra + 5 por especie + ½·√(Esencia total)). Se aplica una vez, al abrir en el ciclo de
sesiones una partida que no tiene `research` (`Game.migration` dice qué recibió); las especies sin nombre común lo reciben
al cargar (`sanitizeLoaded`, CLARIDAD J-150). Una partida v1 sigue cargando tal cual en el ciclo clásico.

## 14. Archivos y API

| Archivo | Qué |
|---|---|
| `src/game/cycleBalance.ts` | Todos los números del ciclo (reexportados por `balance.ts`) |
| `src/game/game.ts` | `createGame({ bus, cycle: 'sessions' })`: el ciclo entero (abajo) |
| `src/game/tree.ts` (+ test) | 54 nodos en 7 rutas rectas (`routeNodes`), `beforeAfter`, `treeStates`, `canBuy`, `buyNode` (puro), `treeEffects` (con `capacity`, `nurseryMax`), `seedSuccess`/`seedConfig`, `possibleSpecies`, `nodeCost`, `priceRule`, `costRows`, `sessionsToAfford`, `nightInfo`, `nextGoal`, disposición en bandas |
| `src/game/worlds.ts` | `WORLDS` (preajuste, especies, caídas, `essenceMult`, `roomMult`), `worldEssenceMult`, `worldRoom`, `WORLD_BEHAVIORS`, `REACHABLE_BEHAVIORS`, `worldsWithBehavior`, `worldSpeciesGroups`, `worldOfSpecies`, `TOTAL_WORLD_SPECIES` |
| `src/game/treeText.ts` | Textos es/en: rutas, nodos, valores de «antes → después», mundos, HUD, tarjetas, VELA, `growthWord` |
| `src/game/session.ts` (+ test) | `ResearchState`, `SessionState` (con `bought`, `boosts`, `endedEarly`), `beginSession`, `tickSession`, `note*`, `seedStep`, `boostCost`/`boostMult`/`boostWait`, `computeDatos`, `sessionPreview`, `summarize`, `applySummary`, `researchBuy`, `researchPickWorld`, `nightReady`, `pityDue` |
| `src/game/sessions.test.ts` | El ciclo integrado en `game.ts` (reloj, cartera, precio y sitio, Destello, Abono, Árbol, mundos, noches, Encargos, guardado) |
| `src/game/clarity.test.ts` | Guardia de jerga (CLARIDAD P1-10) sobre todos los textos del juego y de la historia |
| `src/game/legacy.ts` (+ test) | `migrateLegacy` |
| `src/game/state.ts` | Guardado **v2**: `research?`, `session?`, `carry?` (lee v1 y v2) |
| `src/story/encargoScript.ts` · `script.ts` · `endings.ts` | Encargos del ciclo de sesiones (+ `classic`, `resolveEncargo`), escenas `t_tree`, `t_world`, `a1_night`, las siete especies de Albor (`alborSpeciesFound`), final secreto con `REACHABLE_BEHAVIORS` |
| `src/ui/tree/` · `src/ui/session/` | Pantalla del Árbol, HUD, tarjeta de inicio y resumen (se montan en la Fase 2B) |
| `scripts/session-bot.ts` · `scripts/world-check.ts` (`--behaviors`, `--yield`, `--seeds`) · `scripts/tree-table.ts` | Ritmo (§11) · mundos, maneras de moverse y semillas medidos (§4.3, §4.5) · tablas de §4.2 |

**`Game` (ciclo de sesiones).** `game.cycle`, `game.research`, `game.session`, `game.sessionStart` (lo que enseña la
tarjeta de inicio), `game.lastSummary` (el resumen, hasta preparar la siguiente), `game.effects` (`TreeEffects`),
`game.migration`, `game.buyNode(id)` → `BuyResult` (con `revealed` para la animación), `game.grantEncargo(r)`;
`game.speed` = 0 con la sesión terminada (placa congelada), la velocidad de la Incubadora mientras nacen semillas y si
no 1. Acciones: `startSession()` (prepara la siguiente tras el resumen), `endSessionNow()`, `buyNode(id)`,
`pickWorld(id)`, `buyBoost()`; `setCalibration`/`setRings`/`saveRegime`/`loadRegime`, `buyUpgrade`, `buyGenomeNode` y
`extinguish` no hacen nada en este ciclo. **Vista** (`GameView`, campos opcionales): `cycle`, `session` (`n`, `world`,
`phase`, `limit`, `bonus`, `elapsed`, `remaining`, `progress`, `essence`, `seeds`, `sprint`, `newSpecies`, `endedEarly`,
`first`), `research` (`datos`, `night`, `nightReady`, `nightProgress`, `gate`, `sessions`, `levels`, `world`, `worlds`,
`affordable`, `capacity`, `recentDatos`), `sessionPreview` (`null` en la sesión 1), `boost`; `era` = noche; `upgrades` =
los nodos del Árbol (nivel, precio en Datos); `genomeNodes` vacío; `extinction.available` = `false`; pestañas
Laboratorio, Calibrar y Genoma ocultas; `seedPrice` con `cheapMult`, `stepMult`, `bought`, `capacity`, `full`.
**Eventos** (`bus.ts`): `sessionStart`, `sessionClock` (`clockStart`, `lastMinute`, `warn`, `countdown`, `sprint`),
`sessionExtended`, `sessionEnd`, `nodeBought` (+ `upgradeBought` con el mismo id), `nightStart`, `worldPicked`,
`boostBought`; `seedBlocked` con motivo `full`. Una sesión preparada al cargar emite `dishClear` + sus semillas de la
Nevera en el primer `tick` (la placa ya existe).

## 15. Cambios para la Fase 2

### 15.1 Fase 2A — hecho (lado del juego, detrás de `cycle: 'sessions'`)

- `game.ts`: estado `research`/`session`; efectos del Árbol en lugar de `level('x')`/`has('x')` (que valen 0/`false` en
  este ciclo): semillas (`seedConfig`, Semilla grande, precio por sesión, sitio, guardería), producción (Vida, mundo,
  Placa variada, Recta final, Abono, Coleccionista, afinidades, Comida extra, Amistad), Sembrador, Archivo/Copiadora (en
  Esencia), Copias sorpresa, Semillas curiosas, Destello (30 s de Esencia, desde la sesión 2), Incubadora (`speed`).
  Ciclo: `setupSession` (cartera, semillas, mundo, Nevera), reloj con la primera semilla, `tickSession`, fin con
  `noteKeep` → `summarize` → `applySummary` → `sessionEnd`; objetivos re-apuntados (`SESSION_OBJECTIVES`) y logros
  (`SESSION_ACHIEVEMENTS`); migración de partidas v1 (§13).
- Contratos **solo añadidos** (`types.ts`, `bus.ts`, §14). Guardado v2 (lee v1). Calibrar marcado `PHASE-2B-REMOVE`.
- Textos según CLARIDAD (filas en el informe de la Fase 2A) y guardia de jerga. Historia: `t_tree`, `t_world`,
  `a1_night`; condiciones con `nightReady`/`nightProgress`; Encargos con `classic`.

### 15.2 Fase 2B — hecho (interfaz e integración)

- **`src/main.ts`**: `createGame({ bus, cycle: 'sessions' })`; `createSessionFlow` monta el reloj en el centro del HUD, la
  vista previa de Datos en la barra de abajo, la tarjeta de inicio, «¡Tiempo!», el resumen y el Árbol; la placa y el reloj
  se paran mientras hay una tarjeta o el Árbol (`PauseSource 'cards'`). Partida vieja → `migrateLegacy` → tarjeta única
  de VELA «¡Bienvenida al laboratorio nuevo!» (`src/ui/session/welcome.ts`). Sin ritual de Extinción ni precarga de
  núcleos de Calibrar. Los Encargos y los Secretos esperan bajo las tarjetas; la historia no empieza escenas sobre ellas
  (`t_tree` y `t_world` hablan solo con el Árbol abierto: `StoryDeps.ui('tree')`).
- **`src/ui/ui.ts`**: tres filas fijas (HUD · placa · barra de abajo) en teléfono y escritorio, sin columna lateral; la
  barra de abajo tiene **Bestiario** (cajón: hoja inferior en teléfono, lateral en escritorio, sobre la placa), **Abono**
  durante la sesión («Abono» sobre «×1,25 · 💧 20», «×1,25 · en 0:12» o «Falta vida», y una pista única J-163) o
  **Árbol** entre sesiones, y la vista previa «+12 Datos al terminar». Pausa con tarjeta («Seguir» · «Terminar ahora» → «¿Terminar ya? Te llevas N
  Datos.», J-162). Borrados: `panel-lab.ts`, `panel-calibrate.ts`, `panel-genome.ts`, `tutorial.ts`, `upgrades.ts`, las
  pestañas, el resumen de Era y el ritual del `overlay.ts`, Muestras/Genoma del HUD; `i18n.ts` sin B-01…B-03.
- **Juego**: Calibrar fuera (`ranges`, `CALIBRATOR_RANGES`, `RING_PRESETS`, regímenes, `setCalibration`, `setRings`;
  `CalibrationView` = reglas de lectura); textos y avisos retirados (B-11, B-17); `SpeciesView.world` y `copyCost`
  /`copyBlocked`; `ResearchView.encargoReward` (los Encargos muestran «+2 Datos» y «+N s» sin adivinar en la UI) y
  `dishLevel` (costura para la placa redonda); Abono solo con criaturas que dan Esencia (`BoostView.needsLife`).
- **Comprobación de jugador**: `tests/e2e/session-play.mjs` juega las sesiones 1–3 con toques (teléfono y escritorio,
  claro y oscuro, es y en) y hace las fotos de la wiki (`tests/e2e/wiki-shots.mjs`). Lo que encontró y se arregló: el
  Mundo 2 no prendía (§4.5, «Frío»); un Encargo del Árbol durante la sesión dice «Al terminar: …»; el resumen de la
  sesión 1 llama «primeras metas» a sus pasos silenciosos (sembrar, la primera criatura); la tarjeta «¡Mejora
  comprada!» salía en la sesión siguiente y ahora es una línea en la hoja del nodo (J-120); los secretos esperan a que
  termine la sesión 1 y al cajón del Bestiario; el Árbol vuelve a encuadrarse al abrirse; la píldora de tarea de VELA
  se aparta mientras la hoja de un nodo está abierta; un nombre por criatura (las copias del toro ponían un segundo
  nombre sin criatura) y lejos de las píldoras; un Encargo que es un objetivo del juego se contaba dos veces en el
  resumen («12 × 2 encargos», `gameGrantOf`); la tarjeta de inicio espera a la de bienvenida de una partida vieja;
  la barra del Encargo se aparta bajo una tarjeta de Momento; las notas y avisos esperan mientras un Momento está por
  abrirse o hay una tarjeta de sesión.
- **Sigue en el código (solo pruebas y bots)**: el ciclo clásico de `game.ts` (Laboratorio, Genoma, Extinción, Muestras,
  offline) aún existe para sus pruebas unitarias; ningún jugador lo ve. Borrarlo entero es una tarea aparte (convertir
  las pruebas de siembra, especies y economía al ciclo de sesiones).

## 16. ADR propuesto y preguntas abiertas

**ADR-026 — Sesiones de laboratorio con reloj, Árbol de 7 rutas rectas y Mundos (sustituye el ciclo continuo, la
Extinción y Calibrar).** *Contexto:* el dueño pidió un árbol con ramas y un prestigio más claro («estudiante con tiempo de
laboratorio»), después rutas lineales donde siempre se gana más y nada de mandos de química, y tras la 2.ª prueba un
juego corto, emocionante y súper incremental que nunca castigue crecer. *Decisión:* sesiones cortas (2:00 → 5:00) en una
placa nueva; la Esencia ganada se convierte en Datos con una división visible (÷250) más bonus de descubrimiento, y el
HUD la enseña antes de acabar; un solo precio de semilla por sesión y el sitio de la placa como límite; Abono dentro de
la sesión; regalos del Destello proporcionales («30 s de tu Esencia»); 53 mejoras en 7 rutas rectas (cada paso necesita
solo el anterior; cada nivel mejora un número que se enseña como «antes → después»); precios `inicio(anillo) ×
factor^nivel`; las reglas del mundo son 7 **mundos** con preajustes comprobados en CPU que se abren en orden y se eligen
como tarjetas; la noche (era) avanza gratis por sesiones y especies, y la historia termina hacia las 2 h. Se retiran
Calibrar, Muestras, Genoma, Extinción, Turno y offline. *Consecuencias:* GDD §4 (Calibrar), §5, §8, §10, §12 llevan
«(Corrección v1.3)» apuntando a `docs/CICLO.md`, y §2 adopta el glosario de `docs/CLARIDAD.md`; migración generosa de
partidas v1; el bot de sesiones verifica el ritmo sobre el juego integrado; Encargos e historia cambian sus condiciones
de era/Extinción/Calibrar.

**Preguntas abiertas**
- **Noches 1–2 crecen ×2,3 por sesión** (pedido ×1,6–2, §11.2): ¿se acepta (más dinero, más rápido) o se frena el
  principio aceptando algún bajón en la mediana?
- **Mundos sin «late», «se divide» ni «colonia»** (§4.3, medido): ¿un mundo futuro con una especie que lata o se divida
  (p. ej. con las caídas del catálogo), o se quitan esas maneras de la Guía para siempre?
- **Abono**: hecho en 2B, botón fijo en el centro de la barra de abajo; solo se vende con criaturas que dan Esencia.
- **Incubadora**: acelera toda la simulación mientras nacen semillas (`game.speed`); comprobar los 30 fps en móvil.
- **Esencia de Encargos y objetivos**: cuenta como ganada (para los Datos); con 10–20 s de Esencia el efecto es pequeño.
