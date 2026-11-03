# Ritmo: partidas de 15 segundos que crecen

> **Cuarta decisión del dueño:** *«Como es un incremental las partidas deben ser más cortas… 15 segundos o así y cada
> vez ir aumentando… Busca en internet una guía y haz el diseño mejor.»* Y después: *«Ajusta los tiempos de vida y eso
> a los tiempos de partida etc. para que todo funcione de forma clara y sea una experiencia de usuario súper fluida y
> animada.»*
>
> Modelo: **Nodebuster** — una partida muy corta, muchas compras entre partidas, cada compra se nota en la siguiente,
> nunca castiga crecer, el dinero llega cada vez más rápido.

Este documento manda sobre los números de ritmo de [`CICLO.md`](CICLO.md) (§2, §3.3, §5, §9, §11), que lo enlaza. Todos
los números viven en [`src/game/cycleBalance.ts`](../src/game/cycleBalance.ts) con su origen `[RITMO §N]`. El bot es
[`scripts/session-bot.ts`](../scripts/session-bot.ts).

## Índice

1. [Lo que dicen las guías (investigación)](#1-lo-que-dicen-las-guías-investigación)
2. [Las reglas que adoptamos](#2-las-reglas-que-adoptamos)
3. [El reloj: de 0:15 a 2:30](#3-el-reloj-de-015-a-230)
4. [La vida a cámara rápida (ADR-027)](#4-la-vida-a-cámara-rápida-adr-027)
5. [La economía: Datos, precios y noches](#5-la-economía-datos-precios-y-noches)
6. [Bot: la tabla partida a partida](#6-bot-la-tabla-partida-a-partida)
7. [Cambios en archivos de otros (lista de parches)](#7-cambios-en-archivos-de-otros-lista-de-parches)
8. [Preguntas abiertas](#8-preguntas-abiertas)
9. [Recoger la luz (ADR-030): el bot antes y después](#9-recoger-la-luz-adr-030-el-bot-antes-y-después)

---

## 1. Lo que dicen las guías (investigación)

| # | Regla | Fuente |
|---|---|---|
| R1 | **Los costes crecen exponencialmente (×1,07–×1,15 por compra) y la producción de forma lineal o polinómica.** Al principio la producción gana de largo a los precios (el jugador compra muchísimo); la diferencia se cierra sola y crea las pausas. | Pecorella, *The Math of Idle Games, Part I* — https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i |
| R2 | **Lo comprado antes debe seguir valiendo**: crecimiento sub-exponencial y mejoras que mantienen útiles los niveles bajos (ej. cada edificio sube un 0,05 % a los de su nivel). | Pecorella, *Part II* — https://www.gamedeveloper.com/game-platforms/the-math-of-idle-games-part-ii |
| R3 | **El prestigio se toma cuando da +50 % a +200 % de la moneda de prestigio**; tres preguntas: ¿el principio tras reiniciar es rápido?, ¿llegas claramente más lejos?, ¿cada ciclo acelera? Con fórmulas de raíz, doblar la moneda pide 4–8× las ganancias. | Pecorella, *Part III* — https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii · *Quest for Progress* (GDC Europe 2016) — https://www.slideshare.net/slideshow/quest-for-progress-gdc-europe-2016/65405507 · https://www.gdcvault.com/play/1023876/Quest-for-Progress-The-Math |
| R4 | **Primera mejora antes de 60 s; una decisión con sentido antes de 5 min; primera automatización antes de 3 min; primer prestigio a los 10–15 min; tras reiniciar, se nota más rápido en los primeros 30 s.** Factor de coste por defecto ×1,15; los costes lineales crean «zonas muertas». | *I Built 7 Idle Games in 30 Days* — https://dev.to/aguier/i-built-7-idle-games-in-30-days-what-i-learned-about-incremental-design-5d3f |
| R5 | **Recompensas que gotean, no a escalones**: Vampire Survivors reparte 12 objetos en 30 min con niveles para que haya algo cada ~23 s (no cada 2,5 min); la meta-progresión elimina las partidas de «progreso cero». | *The Secret Sauce of Vampire Survivors* — https://jboger.substack.com/p/the-secret-sauce-of-vampire-survivors |
| R6 | **Enseñar todo lo que pasa**: si hay 2 000 gnorps golpeando, se ven los 2 000; las unidades simuladas una a una permiten mejoras que cambian el comportamiento, no solo un %. El multiplicador ligado al número de unidades fue «simple, predecible». | Entrevista a Myco, *(the) Gnorp Apologue* — https://www.gamedeveloper.com/design/interview-the-gnorp-apologue |
| R7 | **Nodebuster**: partidas cortas que terminan cuando un virus te drena la vida «cada vez más rápido»; entre partidas, un árbol enorme de nodos baratos; las primeras metas son «aguantar ~60 s»; el juego entero dura 3–4 h. Críticas: el final se alarga sin ideas nuevas y, al maximizar la vida, se desequilibra. | https://higherplaingames.com/pc/nodebuster-review/ · https://mancunion.com/2025/05/08/nodebuster-review-a-short-and-sweet-incremental-game/ · https://www.incrementaldb.com/community/review/5808 · https://game-vault.net/wiki/Guide:Nodebuster_Beginners_Guide |
| R8 | **Rondas muy cortas + tienda entre rondas**: Brotato lleva oleadas de 20–60 s con compras entre medias; el ritmo corto favorece optimizar y buscar sinergias. | https://choostgames.com/blog/vampire-survivors-vs-brotato/ · https://orbit-arcade.com/blog/vampire-survivors-like-games |
| R9 | **Un incremental puede tener final**: Universal Paperclips tiene un ritmo apretado porque quiere llevarte a un sitio y terminar; va jubilando sus propios sistemas (lo enorme se vuelve redondeo). | https://compare.rm.com/blog/2026/04/universal-paperclips/ · https://if50.substack.com/p/2017-universal-paperclips |
| R10 | **Cada capa de reinicio recontextualiza la anterior** (Antimatter Dimensions: Infinity no solo multiplica, cambia qué es comprar dimensiones). | https://playwanderer.online/game-reviews/antimatter-dimensions · https://antimatterdimensions.wiki.gg/wiki/Prestige |

## 2. Las reglas que adoptamos

1. **Partida 1 de 15 s, y la primera compra antes de ~30 s de juego** (R4, R7). Medido: primera compra a los **27 s**
   del primer toque (15 s de reloj + 3 s de especie nueva + resumen + 1 toque).
2. **Lo primero que se compra es tiempo** (R7: «aguantar más» es la mejora más visible). El Reloj tiene **15 niveles
   pequeños** (+5/+10/+15 s): casi cada visita al Árbol alarga la partida siguiente (R5).
3. **Vida desde el segundo 1** (R4: «números que suben sin hacer nada en el primer minuto»): cada partida empieza con
   una criatura **ya viva** (incubada antes del reloj) y la placa corre a **cámara rápida ×1,5** (Corrección v0.015: era ×3, «se mueve muy rápido»): una semilla nace en
   **4,4 s**, no en 13 s. Nada de esto toca la ciencia (§4).
4. **Muchas compras baratas al principio, precio ×1,5–×2 por nivel** (R1, R4): ≥ 2 compras tras cada partida y 4–17
   en las primeras diez.
5. **Nunca menos que la anterior** (R3, R5, regla dura del dueño): lo que varía por suerte se hizo pequeño frente a lo
   que crece por compras (extensiones de +3 s, Destello con ritmo estrecho, Abono barato y proporcional).
6. **Los números explotan, y más al final** (R1, R9): ×2–3 por partida en las noches 1–2, ×1,1–1,5 en el centro y
   ×1,5–1,8 al final con Vida eterna (la historia acaba hacia la partida 40 ≈ **1,7 h**).
7. **Nada de cartas que se coman una partida de 15 s**: los Momentos esperan al resumen en partidas de menos de 60 s
   (R6: que se vea la placa, no menús).

## 3. El reloj: de 0:15 a 2:30

### 3.1 Base

`SESSION_BASE_SECONDS` = **15**. El reloj empieza con la primera semilla (igual que antes).

### 3.2 La ruta ⏱ Reloj

| Nodo | Anillo · 🌙 | Niveles × efecto | Precios | Partida |
|---|---|---|---|---|
| Más tiempo | 1 · 1 | 6 × +5 s | 2 · 3 · 5 · 7 · 10 · 15 (×1,5) | 0:15 → **0:45** |
| Reloj grande | 2 · 1 | 3 × +10 s | 15 · 30 · 60 (×2) | → **1:15** |
| Reloj de arena | 3 · 2 | 3 × +15 s | 400 · 800 · 1 600 (×2) | → **2:00** |
| Reloj eterno | 4 · 3 | 3 × +10 s | 12 000 · 24 000 · 48 000 (×2) | → **2:30** |

Con las extensiones (especie nueva +3 s, Encargo +3 s, Destello +2/+4 s) las partidas largas juegan **≈ 3:00**
(dentro de lo pedido: 2–3 min). Antes era 2:00 → 5:00 y se jugaban 6:10.

### 3.3 Extensiones

| Fuente | Antes | Ahora | Por qué |
|---|---|---|---|
| Especie nueva | +5 s | **+3 s** | en partidas de 35–50 s, +5 s por especie era un 15 % de suerte: la partida con especie nueva rendía más que la siguiente (bajón) |
| Encargo | +5 s (+5/+10 con «Encargos con prisa») | **+3 s** (+3/+6) | igual; y en la **partida 1 no alargan** (`ENCARGO_TIME_FROM_SESSION` = 2): son silenciosos (CLARIDAD §3.3) y convertían 15 s en 35 s |
| Destello | +5/+10 s | **+2/+4 s** | con un Destello cada ~20 s y +10 s, cada chispa traía la siguiente: 2:30 se jugaban 4:30 |

### 3.4 Avisos proporcionales

Un aviso fijo de 30 s pinta de ámbar una partida de 15 s desde el principio. Ahora (funciones en `session.ts`):

| Aviso | Regla | 0:15 | 0:45 | 2:30 |
|---|---|---|---|---|
| Ámbar (`warnSeconds`) | ¼ de la partida, entre 4 y 30 s | 4 s | 11 s | 30 s |
| Cuenta atrás (`countdownSeconds`) | ⅓ de la partida, entre 3 y 10 s | 5 s | 10 s | 10 s |
| Recta final (`sprintSeconds`) | ¼ de la partida, como mucho 30 s | 3,75 s | 11 s | 30 s |
| «¡Último minuto!» | solo si la partida dura más de 65 s | — | — | 60 s |
| Pausa explicativa del reloj | cuando el reloj se vuelve ámbar (*Corrección v0.016*, QA4 F-08: era «queda un minuto» fijo) | 4 s | 11 s | 30 s |
| Sello «¡Tiempo!» | `SESSION_TIMESUP_HOLD` | 1,2 s | 1,2 s | 1,2 s |

## 4. La vida a cámara rápida (ADR-027)

### 4.1 El problema

Una semilla necesita **400 pasos** de simulación para que el detector la llame estable (`detector.ts`: «age ≥ 400
steps», masa estable) y **800 pasos estable más** para registrar una especie nueva (`SPECIES_MIN_STABLE_STEPS`). A 30
pasos/s eso son **13 s** y **40 s**: una partida de 15 s no tendría vida. Las CLAUDE.md dicen además que **nunca se
paga a algo que no es estable**.

### 4.2 Opciones y decisión

| Opción | Ciencia | Diversión | Decisión |
|---|---|---|---|
| Pagar a las semillas «formándose» una fracción (`BORN_PAY`) | ✗ rompe la puerta «solo paga lo estable» | + | **No** |
| Bajar la edad estable (400 → 150 pasos) | ✗ el detector llamaría «criatura» a manchas que aún se pueden deshacer | + | **No** |
| **Cámara rápida**: más pasos por segundo real | ✓ misma regla, mismo `dt`, mismo detector; solo se ve más deprisa (un *time-lapse* de microscopio) | ++ | **Sí: ×1,5 = 45 pasos/s** (era ×3) |
| **Criaturas ya vivas al empezar** (incubadas bajo la tarjeta de inicio) | ✓ la simulación de verdad corre esos pasos; no pagan hasta que corre el reloj | ++ | **Sí: 1 de base + Nevera** |

### 4.3 Los tiempos exactos

| Qué | Valor | Constante | Por qué |
|---|---|---|---|
| Pasos por segundo base | 30 | `SIM_STEPS_PER_SEC` (= `main.ts` `STEPS_PER_SEC`) | sin cambio |
| **Cámara rápida en una partida** | **×1,5 = 45 pasos/s** (era ×3) | `SESSION_SIM_PACE` | el dueño (v0.014): «se mueve muy rápido»; a ×3 una Nadadora cruzaba la placa en 2 s. El arranque lo sostiene la criatura incubada |
| Tope de velocidad | ×4 = 120 pasos/s | `SIM_PACE_MAX` | 2 pasos/fotograma a 60 fps, 4 a 30 fps; una instantánea cada 10 pasos (≤ 12/s), nunca una por fotograma |
| Edad estable | **400 pasos (sin cambio)** → **4,4 s** | `STABLE_AGE_STEPS` | no se toca la ciencia |
| Registro de especie nueva | 800 pasos estable (sin cambio), y además su forma de moverse leída (~1000 pasos de historia) | `balance.SPECIES_MIN_STABLE_STEPS` | *(Corrección v0.016, QA4 F-04: con 420 pasos de incubación la criatura de inicio se registraba a los 17,8 s de reloj, después del final de una partida de 15 s, y las semillas del jugador la fundían antes: la especie del Mundo 1 no entraba nunca.)* Con 1250 pasos de incubación la criatura de inicio llega al reloj ya observada y se registra en la partida 1 |
| Incubadora | ×1 → ×7/6 → ×4/3 sobre la cámara rápida: nacen en **8,9 → 7,6 → 6,7 s** (a ×3 eran 4,4 → 3,8 → 3,3 s) | `MATURE_SPEED_BY_LEVEL` | antes ×2/×3 a 30 pasos/s; ahora el tope de 120 pasos/s; la hoja enseña «Nacen en 4,4 s → 3,8 s» |
| Criaturas vivas al empezar | **1** + Nevera (1/2/3) | `STARTER_CREATURES`, `FRIDGE_PER_LEVEL` | partida 1 con un Orbium pagando desde el segundo 0 |
| Incubación previa | **1250** pasos bajo la tarjeta de inicio (o bajo las primeras frases de VELA) *(Corrección v0.016: eran 420)* | `PREINCUBATE_STEPS` | estables, con su movimiento leído y registrables al arrancar el reloj; no pagan hasta entonces (la producción solo corre con el reloj). 32 fotogramas de ≤ 40 pasos |
| Semilla segura si nada vive | a los **8 s** (antes 45) | `SESSION_PITY_AFTER` | dos nacimientos |
| Una semilla reserva su sitio | **5 s** (antes 12) | `SESSION_RECENT_SEED_MEMORY` | un nacimiento + 0,5 s |

**Una partida 1 (15 s) segundo a segundo** (bot, mediana): 0 s el Orbium de inicio ya nada y paga (+N flotando cada
0,8 s); el jugador siembra (se abre un anillo de luz, 0,35 s); 4,4 s la semilla «¡Viva!» (0,45 s de brillo) y paga;
~9 s «¡Especie nueva! +3 s» (la partida pasa a 18 s); ~13,5 s el reloj se vuelve ámbar; los últimos 6 s cuentan
atrás; «¡Tiempo!» 1,2 s; resumen con
**17 Datos** → 4 compras (Más tiempo ×3 y Gotero).

### 4.4 Animación y ritmo de la placa

| Qué | Valor | Constante | Por qué |
|---|---|---|---|
| Semilla: caída y anillo que se abre | 350 ms | `SEED_BLOOM_MS` | menos que un toque; se puede sembrar en ráfaga |
| «¡Viva!» al volverse estable | 450 ms (escala 1 → 1,15 → 1 + brillo) | `CREATURE_ALIVE_MS` | el momento clave tiene que verse aunque dure 4 s nacer |
| Disolverse (muerte, lisis) | 600 ms de fundido | `DISSOLVE_MS` | la materia se disuelve sola en la simulación; el fundido solo la acompaña |
| «+N» de Esencia por criatura | como mucho cada **0,8 s** (antes 1,5) | `SESSION_INCOME_POP_INTERVAL` | la Esencia se ve fluir desde el primer segundo |
| Destello: primero | a los **6–12 s** (Primer destello: 2–4 s) | `SESSION_GOLDEN_FIRST_DELAY`, `GOLDEN_FIRST_FAST` | dentro de una partida de 20 s |
| Destello: ritmo | cada **40–45 s** (×0,85 por nivel → 25–28 s) | `SESSION_GOLDEN_INTERVAL` | ventana estrecha: el número por partida no es lotería (a 30–40 s una partida de 49 s cazaba 2 y la de 45 s, 1: −6 %) |
| Destello: vida en la placa | **8 s** (Destello lento: 11 → 14 s) | `SESSION_GOLDEN_LIFE`, `GOLDEN_LIFE_BONUS` 3 | 12 s eran casi una partida entera |
| Destello: regalo | **10 s de tu Esencia** (12/14/16 con Regalos mejores), mínimo 10 | `SPARK_GIFT_SECONDS`, `SPARK_GIFT_MIN` | 30 s doblaban una partida de 20 s |
| Destello desde | la **partida 4** (antes 2) | `SPARK_FROM_SESSION` | las partidas 1–3 duran 15–50 s y ya tienen especies nuevas; un Destello en la 3 y no en la 4 era un bajón seguro |
| Abono: a la venta | a los **8 s** de reloj (antes 30) | `BOOST_FROM_SECONDS` | media partida 1 |
| Abono: precio | **8 s de tu Esencia** (mín. 10), ×2 cada uno; ×1,25 la Esencia | `BOOST_SECONDS`, `BOOST_MIN_COST` | a 20 s, un buen arranque encarecía el Abono y la partida rendía menos (bot S3 → S4) |
| Objetivos dentro de la partida | 3 s de tu Esencia (mín. 5) | `SESSION_OBJECTIVE_SECONDS`, `SESSION_OBJECTIVE_MIN` | 10 s por objetivo eran media partida de 45 s |
| Momentos (cartas) | no se abren con el reloj corriendo si la partida dura **< 60 s**; esperan al resumen. Avisos cortos ≤ 1,5 s sí | `MOMENT_MIN_RUN_SECONDS`, `SESSION_TOAST_MAX_MS` | una carta en una partida de 15 s se come la partida |
| Sembrador automático | cada 8 s → 2,6 s (6 niveles) | `AUTOSEED_TREE_INTERVAL` | llega con partidas de 1:15 |
| Archivo (copia gratis) | cada 15 s → 8 s | `ARCHIVE_TREE_INTERVAL` | igual |

### 4.5 ADR-027 (propuesto) — Cámara rápida en las partidas e incubación previa

*Contexto:* el dueño pide partidas de ~15 s que crecen; una semilla tarda 400 pasos en ser estable (13 s a 30 pasos/s)
y la CLAUDE.md prohíbe pagar a lo que no es estable o «mejorar» la regla de Lenia sin ADR.
*Decisión:* durante una partida la placa avanza **`SESSION_SIM_PACE` = 1,5** veces (Corrección v0.015, era 3) más pasos por segundo real (90
pasos/s; con la Incubadora, como mucho `SIM_PACE_MAX` = 4 → 120 pasos/s). La regla de actualización, `dt`, el núcleo, el
crecimiento, el toro, el estado RGBA16F, el detector (400 pasos para «estable», 800 para especie nueva) y la puerta «solo
paga lo estable» **no cambian**: solo hay más pasos por segundo, como un time-lapse de microscopio. Cada partida empieza
con `STARTER_CREATURES` = 1 criatura (más la Nevera) de plantilla pura, **incubada** `PREINCUBATE_STEPS` = 1250 pasos de
simulación real bajo la tarjeta de inicio (Corrección v0.016: eran 420, QA4 F-04); no produce hasta que corre el reloj.
*(Corrección v0.016, QA4 F-02.)* El reloj de la partida cuenta **tiempo de placa**: los pasos que la placa corrió ÷ los
pasos por segundo del ritmo (`src/game/dishClock.ts`). Un móvil lento tiene un reloj más lento, nunca menos vida por
segundo de reloj; una partida de 15 s son siempre 15 s de placa. Si la placa va por debajo del 75 % del tiempo real, un
aviso lo dice una vez.
*Consecuencias:* (1) la simulación hace ~3× más trabajo por segundo: el suelo de **30 fps en el Playwright móvil** de
la CLAUDE.md se vuelve a medir **con la cámara rápida** (si no llega, bajar la calidad de la cuadrícula en móvil, no la
cámara rápida); la regla «una instantánea cada 10 pasos, ningún `readPixels` por fotograma» se mantiene (a 120 pasos/s y
30 fps son 4 pasos por fotograma: una instantánea cada 2,5 fotogramas). (2) Las criaturas se mueven y chocan 3× más por
segundo real: muertes por choque por segundo real ×3 (el bot lo modela por paso). (3) Ninguna puerta de la CLAUDE.md
cambia de texto; se añade a «Hard gates»: *«el suelo de 30 fps se mide con `SESSION_SIM_PACE`»*.

## 5. La economía: Datos, precios y noches

| Número | Antes | Ahora | Por qué |
|---|---|---|---|
| Esencia por Dato (`DATOS_ESSENCE_DIV`) | ÷250 | **÷30** | las partidas son 8× más cortas al principio; con ÷250 los Datos venían solo de especies y las partidas 3–12 se quedaban en 0:35–0:55 |
| Inicio de precio por anillo (`TREE_RING_START`) | 2 · 15 · 100 · 2 000 · 6 000 | **2 · 15 · 400 · 12 000 · 80 000** | con ÷30, los anillos 3–5 al precio viejo se compraban enteros en 2 partidas; con estos, el anillo 3 se reparte entre las noches 2–4 |
| Más tiempo: factor | ×2 (3 niveles) | **×1,5 (6 niveles)** | la partida 1 compra 3–4 niveles de tiempo y aún un Gotero |
| Vida eterna: primer precio | 10 000 | **50 000** | 2–6 niveles por partida al final (×1,5–1,8 por partida: los números explotan sin desbocarse antes del final de la historia) |
| Noches (`NIGHT_GATES`, partidas) | 3 · 6 · 10 · 14 · 19 · 24 · 28 · 32 | **4 · 8 · 13 · 20 · 29 · 40 · 48 · 56** | partidas más cortas → más partidas por hora; la pregunta final (noche 7) llega en la partida 40 ≈ 1,7 h |

Sigue la regla «un precio = inicio × factor^nivel», sin azar; la conversión sigue siendo **una división a la vista**
(«Por cada 30 de Esencia, 1 Dato»).

## 6. Bot: la tabla partida a partida

`npx vite-node scripts/session-bot.ts 80 7` (7 corridas por política; entre partidas 6 s de resumen + 2,5 s por compra,
como mucho 45 s). La placa es el modelo estadístico del bot con la cámara rápida: los riesgos de muerte van **por paso**
(medidos a 30 pasos/s), el choque entre nadadoras empieza por encima del 60 % del sitio de la placa (antes un 3 fijo:
una placa grande moría como una pequeña), las especies nuevas se registran tras 800 pasos estable, y las criaturas de
inicio se incuban antes del reloj.

### 6.1 planner — mediana de 7 corridas

| # | Noche | Reloj dado | Jugado | Esencia | × ant. | Datos | Compras | Especies | Mundo | Min. totales |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 0:15 | 0:18 | 109 | — | 17 | 4 | 1 | Clásico | 0,5 |
| 2 | 1 | 0:35 | 0:38 | 231 | ×2,12 | 16 | 2 | 2 | Clásico | 1 |
| 3 | 1 | 0:40 | 0:49 | 710 | ×3,07 | 31 | 5 | 2 | Clásico | 3 |
| 4 | 2 | 0:45 | 0:45 | 770 | ×1,08 | 28 | 5 | 2 | Clásico | 4 |
| 5 | 2 | 0:45 | 0:45 | 1 303 | ×1,69 | 50 | 4 | 2 | Clásico | 5 |
| 6 | 2 | 0:55 | 1:19 | 7 752 | ×5,95 | 312 | 9 | 5 | Frío | 6 |
| 7 | 2 | 1:15 | 1:30 | 18,8 K | ×2,42 | 709 | 18 | 7 | Remolinos | 9 |
| 8 | 3 | 1:15 | 1:27 | 23,1 K | ×1,23 | 849 | 3 | 7 | Remolinos | 10 |
| 10 | 3 | 1:15 | 1:43 | 58,2 K | ×2,05 | 2 376 | 5 | 11 | Escudos | 14 |
| 12 | 3 | 1:30 | 1:46 | 88,5 K | ×1,23 | 3 573 | 7 | 14 | Discos | 18 |
| 13 | 4 | 1:30 | 1:46 | 113,9 K | ×1,29 | 4 562 | 7 | 14 | Discos | 20 |
| 15 | 4 | 1:45 | 2:05 | 252 K | ×1,48 | 10 947 | 8 | 14 | Discos | 25 |
| 18 | 4 | 2:00 | 2:30 | 1,05 M | ×1,92 | 45 387 | 4 | 16 | Patas | 33 |
| 20 | 5 | 2:10 | 2:34 | 1,18 M | ×1,03 | 51 070 | 4 | 16 | Patas | 38 |
| 24 | 5 | 2:30 | 2:58 | 2,05 M | ×1,06 | 95 623 | 2 | 16 | Patas | 50 |
| 28 | 5 | 2:30 | 3:01 | 7,03 M | ×1,81 | 330 K | 4 | 17 | Gigantes | 63 |
| 29 | 6 | 2:30 | 2:58 | 8,52 M | ×1,21 | 497 K | 5 | 17 | Gigantes | 66 |
| 34 | 6 | 2:30 | 2:58 | 71,8 M | ×1,70 | 6,3 M | 6 | 17 | Gigantes | 82 |
| **40** | **7** | 2:30 | 2:58 | 1 503 M | ×1,83 | 131 M | 6 | 17 | Gigantes | **102 (1,70 h)** |

### 6.2 Objetivos

| Objetivo | Meta | planner | greedy | kid |
|---|---|---|---|---|
| Partida 1 | 0:15 | ✅ 0:15 (0:18 con su especie) | ✅ | ✅ |
| Primera criatura estable en la partida 1 | ≤ 5 s de reloj | ✅ 0,5 s (la de inicio) | ✅ | ✅ |
| Primera compra | ~30 s de juego | ✅ **27 s** | ✅ 27 s | ✅ 27 s |
| Primera especie en el Bestiario *(Corrección v0.016, QA4 F-04)* | partida 1 o 2 | ✅ **P1** en 7/7 (antes P2) | ✅ P1 (antes P2) | ✅ P1 en 7/7 (antes P3: 4/5/2/2/5/3/2) |
| Las partidas crecen y nunca se acortan | 0:15 → 2–3 min | ✅ 0:15 → 0:35 → 0:45 → 1:15 → 2:00 → 2:30 (juega ~3:00) | ✅ | ✅ (hasta 2:10) |
| Compras tras cada partida | ≥ 2 | ✅ mín. 2; primeras diez 4/2/5/5/4/9/18/3/3/5 | ✅ mín. 2; 8/13/3/… | mín. 1 (compra al azar) |
| Esencia por partida, noches 1–2 | ×1,5–3 («que exploten») | ✅ ×2,36 | ×2,48 | ×1,63 |
| La producción sube dentro de la partida (primer ¼ → último ¼) | ×1,5+ | ✅ ×3,3 | ✅ ×3,5 | ×2,1 |
| Rutas tocadas en la partida 12 | ≥ 6/7 | ✅ 7/7 | 7/7 | 7/7 |
| Noches 2/3/4/5 en P4/P8/P13/P20 | | ✅ | | |
| Final de la historia (noche 7 lista) | 1:30–2:15 | ✅ P40 · **1,70 h** | ✅ 1,76 h | 1,18 h |
| Mínimo de Datos por partida | ≥ 3 | 14 | 17 | 5 |
| **REGLA DURA: la mediana nunca rinde menos que la partida anterior** | 0 bajones | ✅ **0** | 1 (P3 −4 %) | 14 (elige mundos viejos al azar, como antes) |
| Corridas sueltas por debajo de la anterior (información) | | 15 de 273 pares (5 %) | | |

*(Corrección v0.016, QA4.)* El bot deja ahora desconocidos los rasgos de movimiento de una forma hasta sus 1000 pasos
de historia, como el detector real (antes registraba especies que el juego no podía registrar), y la incubación previa
es de 1250 pasos. Re-medido con `npx vite-node scripts/session-bot.ts 80 7`: partida 1 en 0:18 (su especie +3 s), 72
Esencia y 21 Datos (antes 39 y 5), primera compra a los 27 s, primera especie en la partida 1 en todas las corridas de las
tres políticas, final de la historia a 1,80 h (planner) y 1,82 h (greedy), **regla dura 0 bajones**. Con 7 corridas el
planner tiene una visita (P11) con mediana de 1 compra; con 15 corridas, mínimo 2.

**Lectura.** El principio es Nodebuster: 15 s, cuatro compras de tiempo, 35 s, otra vez. La primera explosión llega con
el Mundo 2 (P6: tres especies nuevas, ×6) y el Reloj grande. El centro (noches 3–5) crece ×1,1–1,9 por partida con 3–8
compras; al final, Vida eterna sube ×1,5–1,8 por partida y los números llegan a miles de millones justo cuando la
historia hace su pregunta final. El kid sigue teniendo bajones porque vuelve a mundos viejos al azar (la tarjeta de
inicio ya elige el nuevo por él).

## 7. Cambios en archivos de otros (lista de parches)

Estos archivos los edita otro agente; los cambios son pequeños y precisos. Hasta aplicarlos, el juego compila y los
tests pasan, pero la cámara rápida, la incubación previa y los tiempos de animación no se notan en el navegador (el bot
ya los modela).

**`src/game/game.ts`**
1. `get speed()` (≈ l. 2914): en el ciclo de sesiones
   `if (se?.phase === 'over') return 0; return Math.min(C.SIM_PACE_MAX, fx.simPace * (forming() > 0 ? fx.matureSpeed : 1));`
   (`fx.simPace` es nuevo en `TreeEffects`; `matureSpeed` ahora es 1 · 7/6 · 4/3, relativo a la cámara rápida).
2. Destello (≈ l. 1542): `const life = sessions ? C.SESSION_GOLDEN_LIFE + fx.goldenLifeBonus : B.GOLDEN_LIFE;`.
3. Números «+N» (≈ l. 1324): `const popEvery = sessions ? C.SESSION_INCOME_POP_INTERVAL : B.INCOME_POP_INTERVAL;`.
4. Memoria de semillas recientes (l. 525, 803, 832, 1853): en sesiones `C.SESSION_RECENT_SEED_MEMORY` en vez de
   `B.RECENT_SEED_MEMORY` (un helper `recentMemory()`).
5. Nada más: `fridgePlants` ya planta `start.fridgeSlots` (ahora ≥ 1, también en la partida 1: plantilla pura de una
   especie del mundo); `noteEncargo` ya no alarga la partida 1 (`session.ts`); `SPARK_FROM_SESSION` ya se lee.
6. Opcional (diversión): en la partida 1, VELA dice al empezar «¡Ya tienes una criatura! Siembra más para que den más
   Esencia» (texto `{ es, en }` en `src/story`).

**`src/main.ts`**
1. Incubación previa: al recibir `sessionStart` (o `dishSeed` mientras `game.session.phase === 'ready'`), avanzar la
   simulación `C.PREINCUBATE_STEPS` pasos **bajo la tarjeta de inicio**, en trozos de ≤ 40 pasos por fotograma, con el
   detector cada `DETECT_EVERY` pasos como siempre (≈ 42 instantáneas, una sola vez por partida, con una carta encima).
   Sin cobrar: `game.tick(0, report)` (la producción solo corre con la fase `running`).
2. El bucle ya multiplica por `game.speed`; el tope `4 * game.speed` pasos por fotograma (= 12 a ×3) basta. Si el
   móvil no llega, el acumulador ya descarta el atraso (la vida nace algo más despacio en segundos reales; *Corrección
   v0.016:* el reloj va con ella, cuenta tiempo de placa): medirlo en el Playwright móvil (ADR-027).

**`src/ui/session/hud.ts`**
1. `hudState` (l. 78–79): `remaining <= countdownSeconds(limit + bonus)` → `'count'`; `remaining <= warnSeconds(limit + bonus)`
   → `'warn'` (importar de `src/game/session`). Hoy usa 10 s / 30 s fijos: una partida de 15 s saldría ámbar entera.
2. El sello «¡Tiempo!» ya lee `SESSION_TIMESUP_HOLD` (1,2 s).
3. `src/ui/session/session.test.ts`: (a) l. 70–71 con `warnSeconds`/`countdownSeconds` de una vista de 150 s;
   (b) l. 78–81: el ejemplo de `nodePriceExplain('clock', 2)` ahora es ×1,5 → términos `['2', '×2,25']`, total `'5'`,
   regla «cada nivel cuesta la mitad más» (o cambiar el ejemplo a `'clock2'`, que sigue siendo ×2).

**`src/ui/` (placa y Momentos)**
1. Semilla: anillo que se abre en `C.SEED_BLOOM_MS` (350 ms); «¡Viva!» en `C.CREATURE_ALIVE_MS` (450 ms) al pasar a
   `stable`; fundido de muerte/lisis en `C.DISSOLVE_MS` (600 ms) (`ui.ts` ≈ l. 1809). Con `reduceMotion`, sin escala.
2. Momentos: con una partida corriendo y `limit + bonus < C.MOMENT_MIN_RUN_SECONDS`, los Momentos no urgentes se
   encolan hasta el resumen; los avisos cortos duran como mucho `C.SESSION_TOAST_MAX_MS`.
3. La tarjeta de inicio: «Sale de la nevera: 1 criatura» ya sale de `fridgeSlots` (ahora 1 de base). Proponer el texto
   «Tu criatura ya está viva» en la partida 1.

**`src/detect/**`, `src/sim/**`**: **ningún cambio** (la edad estable y el núcleo no se tocan).

**`CLAUDE.md`** (integrador): en *Hard gates*, «el suelo de 30 fps se mide con la cámara rápida
(`SESSION_SIM_PACE`)»; en `DECISIONS.md`, el ADR-027 de §4.5.

## 8. Preguntas abiertas

- **¿×3 o ×4 de cámara rápida de base?** ×3 deja margen para la Incubadora; ×4 haría nacer en 3,3 s desde el principio.
  Depende de los fps medidos en móvil.
- **Las partidas 2 tienen 2 compras** (el planner ahorra para el siguiente Más tiempo); el greedy hace 13. ¿Más barato
  el 5.º nivel de Más tiempo?
- **Final de la historia a 1,7 h** (antes 2 h): ¿se acepta, o se alargan las noches 6–7?
- **Late game**: con Vida eterna a ×1,5–1,8 por partida los números llegan a 10⁹ en la partida 40. Es lo pedido
  («que exploten»); si molesta, Vida eterna a 80 000.

## 9. Recoger la luz (ADR-030): el bot antes y después

Plan: [`docs/CLARIDAD2.md`](CLARIDAD2.md) §2.2, §3. Todas las corridas: `npx vite-node scripts/session-bot.ts 80 7 --runs`
(B4: además `80 15 --policy=planner`), sobre la misma placa modelo de §6.

**El modelo de recogida** (`scripts/sessionBotCore.ts`). Cada criatura estable llena su gota (como el juego:
`src/game/collect.ts`, tope de 4 s de su producción). *planner* y *greedy* tocan cada gota madura (≥ 75 %) un paso
(0,5 s) después de verla, como mucho **3 toques/s**, más los de sembrar. *kid* toca una gota al azar cada 0,8 s (p = 0,7).
**idle** (nueva) juega como el planner pero **no toca nunca** una gota, ni el Destello, ni los Nutrientes: solo recogen
sus pipetas. Columnas nuevas: `hand % · pip % · swept % · capped %` (luz recogida a mano, por pipeta, barrida al
«¡Tiempo!», y producción que esperó en gotas llenas).

**Lo que compra cada uno de la ruta ↓ Recoger.** Quien toca todas las gotas no gana luz con más pipetas: en B1 la ruta
entera, comprada en el orden del plan o como «lo más barato», retrasó los nodos de producción y hundió las últimas
noches un 1–6 %. El planner compra solo la **Pipeta** (2 · 4 · 8, la que el niño ve trabajar desde la sesión 3) y deja el
resto al jugador quieto, que la teje en el orden del planner en cuanto su noche la abre.

### 9.1 Las corridas

| # | Cambio (además del anterior) | planner S1 (luz · Datos · compras) | Crec. noches 1–2 | Fin de la historia | REGLA DURA (bajones, mediana) | Compras tras cada sesión (mín.) | greedy (fin · bajones · mín.) | kid (fin) | idle (bajones desde su Pipeta) |
|---|---|---|---|---|---|---|---|---|---|
| B0 | v0.020 (línea base, §3.1 del plan) | 72 · 21 · 4 | ×1,78 | S44 ≈ 1,80 h | 0 | **1** (S11, S46) | 1,82 h · 0 · 2 | 1,35 h | — |
| B1 | Gotas, pipetas, barrido (planner compra la ruta en orden) | 72 · 21 · 4 | ×1,66 | 1,72 h | **1** (S25 −6 %) | 1 | 1,79 h · 0 · 2 | 1,22 h | 5 |
| B1c | Igual, planner solo la Pipeta, idle la ruta tejida | 72 · 21 · 4 | ×1,66 | 1,76 h | **0** | **2** | 1,79 h · 0 · 2 | 1,22 h | 5 |
| B2 | Precios claros: semilla ×1, Nutrientes desde S2, congelados al salir, fuera los últimos 3 s; Destello frecuente adelanta el primero; ruta Destello «?» hasta S3 | 72 · 21 · 4 | ×1,75 | 1,87 h | **2** (S41 −7 %, S44 −6 %) | **0** | 1,88 h · 5 · 0 | 1,33 h | 7 |
| B2b | Nutrientes congelados con la mejor luz/s de partidas anteriores | 72 · 21 · 4 | **×1,39** | 1,67 h | **1** (S29 −9 %) | 1 | 1,69 h · 6 · 1 | 1,25 h | 7 |
| B2c | Regla del plan (B2) + Vida eterna hasta 199 niveles (`ETERNAL_LIFE_MAX`) | 72 · 21 · 4 | ×1,75 | 1,90 h | **0** | **2** | 1,92 h · 1 (S13 −7 %) · 2 | 1,33 h | 7 |
| B3 | Anillo 3 a 250 | 72 · 21 · 4 | ×1,75 | 1,96 h | 0 | 2 | 2,00 h · 0 · 3 | 1,27 h | 7 |
| B3 | **Anillo 3 a 200** (elegido: el más barato que cumple todo) | 72 · 21 · 4 | ×1,75 | 1,99 h | 0 | 2 | 2,00 h · 0 · 3 | 1,40 h | 4 |
| **B4** | Final (B2c + anillo 3 a 200), **15 corridas** el planner | **72 · 21 · 4** | **×1,77** | **S44 ≈ 1,99 h** | **0** | **2** | 2,00 h · 0 · 3 | 1,40 h | 4 |

Por qué B2 hundía el final: con el precio fijado en el segundo 8, una partida de 2:30 (que sube ×4–5 dentro de la
partida) compraba 5–6 Nutrientes donde antes compraba 3; el planner llegó a los 99 niveles de Vida eterna en la sesión 37,
ya no tenía nada que comprar y la luz quedó plana, con bajones de ruido. B2b (precio desde el récord) lo frenó demasiado.
Se queda la regla del plan, y Vida eterna vuelve a ser «sin final» de verdad (199 niveles; la hoja sigue diciendo ∞).

### 9.2 B4, planner: mediana de 15 corridas

| # | Noche | Reloj | Jugado | Luz | × ant. | Datos | Compras | Especies | a mano % | pipeta % | en gotas llenas % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 0:15 | 0:18 | 72 | — | 21 | 4 | 1 | 80 | 0 | 0,0 |
| 2 | 1 | 0:35 | 0:35 | 132 | ×1,85 | 9 | 2 | 1 | 91 | 0 | 0,0 |
| 3 | 1 | 0:40 | 0:40 | 269 | ×2,04 | 20 | 3 | 1 | 95 | 0 | 0,0 |
| 4 | 2 | 0:45 | 0:45 | 357 | ×1,32 | 17 | 4 | 1 | 30 | 62 | 0,0 |
| 5 | 2 | 0:45 | 0:45 | 357 | ×1,00 | 19 | 4 | 1 | 0 | 94 | 0,0 |
| 6 | 2 | 0:45 | 0:45 | 619 | ×1,73 | 32 | 4 | 1 | 22 | 73 | 0,0 |
| 7 | 2 | 0:45 | 0:48 | 2 224 | ×3,59 | 119 | 4 | 2 | 21 | 75 | 0,0 |
| 8 | 3 | 1:15 | 1:18 | 9 505 | ×4,27 | 447 | 14 | 3 | 25 | 72 | 0,0 |
| 10 | 3 | 1:15 | 1:27 | 16,3 K | ×1,27 | 787 | 4 | 3 | 48 | 49 | 0,0 |
| 12 | 3 | 1:15 | 1:34 | 88,9 K | ×3,06 | 4 286 | 15 | 5 | 51 | 45 | 0,0 |
| 16 | 4 | 2:10 | 2:34 | 1,11 M | ×1,07 | 57 677 | 5 | 6 | 61 | 36 | 0,1 |
| 20 | 5 | 2:30 | 2:58 | 3,69 M | ×1,27 | 191 784 | 4 | 6 | 61 | 35 | 0,5 |
| 24 | 5 | 2:30 | 2:58 | 24,0 M | ×1,65 | 2,0 M | 7 | 7 | 34 | 63 | 0,1 |
| 32 | 6 | 2:30 | 2:58 | 9,3 · 10⁹ | ×2,35 | 9,8 · 10⁸ | 8 | 7 | 35 | 63 | 0,1 |
| **44** | **7** | 2:30 | 2:58 | 1,1 · 10¹⁴ | ×2,11 | 1,2 · 10¹³ | 9 | 7 | 34 | 64 | 0,0 |

(«a mano» + «pipeta» + barrido = 100 %; el barrido final es el 3–6 % restante.)

### 9.3 Las puertas de `docs/CLARIDAD2.md` §3.3

| Puerta | Meta | B4 |
|---|---|---|
| REGLA DURA (planner, mediana de 15) | 0 bajones | ✅ 0 (corridas sueltas: 15 de 645 parejas, 2 %) |
| Sesión 1 (planner) | ≥ 60 luz, ≥ 15 Datos, ≥ 3 compras, 1.ª compra ≤ 45 s | ✅ 72 · 21 · 4 · 27 s |
| ≥ 2 compras tras cada una de las 10 primeras (planner) | se mantiene | ✅ 4/2/3/4/4/4/4/14/11/4; y el «mín. 1» de B0 en S11/S46 sube a **2** |
| ≥ 2 compras tras cada sesión (greedy) | se mantiene | ✅ mín. 3 |
| Noches 2/3/4/5 en S4/S8/S13/S20 | se mantiene | ✅ |
| Final de la historia (planner, greedy) | 1,5–2,2 h | ✅ 1,99 h · 2,00 h |
| Luz esperando en gotas llenas (planner) | ≤ 10 % en S1–S5; ≤ 3 % con Pipetas rápidas | ✅ 0,0 %; ≤ 0,5 % desde S6 (el planner toca y no las compra) |
| idle | nunca < `DATOS_MIN`; su luz no baja nunca desde su 1.ª Pipeta; noche 3 antes de S16 | ✅ mín. 3 · ❌ **4 bajones** (S16 −9 %, S24 −2 %, S33 −1 %, S38 −2 %) · ✅ S8 |
| kid | luz ≥ 60 % del planner en S1–S5; noche 3 en S12 | ✅ 95/112/96/123/117 % · ✅ |
| 1.ª compra del anillo 3 tras la Noche 2 (B3) | ≤ 3 sesiones (planner y kid) | ❌ **6** (planner) · **11** (kid); con 400: 7 · 13 |
| Crecimiento noches 1–2 (planner) | ×1,5–3 | ✅ ×1,77 |

**Lo que no cumple, sin esconderlo:**
- **idle:** recoge todo con sus pipetas (gotas llenas 0 %), pero sin Destellos ni Nutrientes su luz se queda casi plana en la
  Noche 4 (S14–S23: 0–1 compras por sesión, ahorrando para los nodos del anillo 4) y la mediana baja por ruido. No es la
  recogida: es su ingreso frente a los precios de la Noche 4.
- **anillo 3:** ningún precio probado (400, 250, 200) lo baja a 3 sesiones: con 17–32 Datos por sesión en S4–S6, el
  planner ahorra para el primer nodo de 200 hasta la explosión de la S7–S8 (Mundo 2). Llegar a 3 sesiones pediría un
  anillo 3 cerca de 60–80 Datos, que rompe la escalera de precios; queda para el integrador.
- **El final crece más deprisa que en B0:** ×2,1–2,3 por sesión en las noches 6–7 (B0: ×1,7–1,9) y 10¹⁴ de luz en la S44
  (B0: 10¹⁰). La regla dura se cumple y el final llega a la misma sesión; si los números molestan, lo natural es
  `BOOST_SECONDS` de 8 a 12–16 s (no probado).
