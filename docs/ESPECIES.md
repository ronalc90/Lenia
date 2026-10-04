# Especies: que cada una se vea distinta

> Queja del dueño (v0.012, móvil): «sigo viéndolas muy iguales y dice que es nueva… Tienen que tener diferencias que se
> notan: una cola, una línea, otro color… más pequeña… más grande». El Momento «Dos especies distintas» comparó «Pareja
> verde» con «Nadadora coral» y la propia tarjeta decía «Rinden casi lo mismo: se parecen mucho».

Este documento mide cómo se ve cada especie del catálogo en su mundo, marca las que un niño no distingue y fija la lista
final: **una especie nueva por mundo**, cada una con su silueta, su tamaño y su color propio desde la primera vez.

Código: `src/species/look.ts` (medir un retrato), `src/species/looks.ts` (especies, variantes, rasgos, comparación),
`src/species/identity.ts` (`FIXED_COLORS`, `LOOKALIKE_OF`), `src/game/worlds.ts`. Datos: `src/species/looks.json`.
Comprobación: `npx vite-node scripts/world-check.ts --features [--write] [--crops=f.json]`; hoja de contactos:
`npx vite-node scripts/species-audit.ts --sheet=f.json`.

## 1. Cómo se mide

Cada forma del catálogo se estampa **en el preajuste de su mundo** (simulación de referencia en CPU, toro de 128², 1 600
pasos, el detector del juego encima). En los últimos 300 pasos se recorta la criatura cada 50 pasos y `measureLook` mide:

| Medida | Qué es | Para qué |
|---|---|---|
| radio | celda de cuerpo (≥ 0,1) más lejana del centro, en R y en **celdas de la placa** | tamaño S/M/L/XL (placa de 192 celdas = ancho del móvil) |
| agujeros | bolsas oscuras **encerradas** por materia ≥ 0,2·máx, ≥ 0,04 R² | «agujero», «agujeros» |
| centro | materia del 30 % central / banda 30–80 % | «centro brillante» (> 2,5) |
| alargamiento | √ de la razón de momentos de segundo orden | «redonda» (≤ 1,3), «ovalada», «larga» (≥ 1,6) |
| cuerpos | piezas separadas ≥ 0,15 R² | «dos cuerpos» (parejas) |
| manera de moverse | el detector del juego | «nada», «gira», «quieta» |
| forma | distancia de la firma estática a la referencia del catálogo | < 1,2: el juego la puede revelar |

**Por qué 0,2·máx para los agujeros**: con el umbral del detector (0,1) el borde tenue de un Orbium encierra bolsas que
nadie ve como agujeros (medía «2 agujeros»), y el agujero del Anillo no salía (su centro está a ~0,15). A 0,2·máx el
Orbium no tiene agujeros, el Anillo tiene uno, Helicium y la Escalera dos.

Patas, «muchas patitas» y «retorcida» no salen de un número: se comprueban a ojo en la hoja de contactos (son la forma
del cuerpo de Helicium y de Hydrogeminium en la imagen, nada se dibuja encima).

## 2. Antes: lo que se registraba como «nueva»

Mundos de v0.012, cada forma en el preajuste de su mundo (radio en celdas de la placa):

| Mundo | Forma | Se ve como | Radio | Agujeros | Largo | Nota |
|---|---|---|---|---|---|---|
| 1 Clásico | O2u Orbium unicaudatus | disco de centro brillante | 10,4 | 0 | 1,24 | |
| 1 Clásico | O2b O. bicaudatus | **el mismo disco** | 10,5 | 0 | 1,25 | ya era la misma especie (detector) |
| 1 Clásico | O4i Synorbium ignis | **dos Orbium pegados** | 18,5 | 0 | 1,70 | «Pareja verde» = dos Nadadoras |
| 2 Frío | O2ui, O4s, O2p | **tres Orbium más** | 10,6–10,7 | 0 | 1,26 | O2ui muere en un ángulo libre |
| 3 Remolinos | OG2g Gyrorbium gyrans | disco que gira | 12,7 | 0 | 1,33 | |
| 3 Remolinos | O4d Parorbium dividuus | **dos Orbium separados** | 21,9 | 0 | 2,19 | 2 cuerpos |
| 4 Escudos | S1v, S1s, PG1a | **tres copas idénticas** | 11,1–11,3 | 1 | 1,0 | PG1a aquí no es su «C», es una copa |
| 4 Escudos | P4cp Paraptera | escalera | 23,5 | 4 | 2,34 | **cambia de forma** (el juego no la revela) |
| 5 Discos | S2s / PS3am | escudo en D | 14,6 | 1 | 1,48 | ya era una especie |
| 5 Discos | C0v Circium | — | — | — | — | **muere** en ese preajuste (1 500 pasos, ángulo libre) |
| 5 Discos | S3s Triscutium | escalera larga | 25,1 | 2 | 2,39 | **cambia de forma**: se registraba como desconocida |
| 6 Patas | H3cp Helicium cavus pedes | cuerpo retorcido con patas | 16,9 | 2 | 1,51 | |
| 6 Patas | P3sp Synptera | el mismo cuerpo, más recto | 19,0 | 2 | 1,76 | |
| 7 Gigantes | 3GH2n Hydrogeminium | oruga con patitas | 34,4 | 1 | 2,58 | |

Grupos que un niño no distingue: **Orbium ×6** (O2u, O2b, O2ui, O4s, O2p y las parejas O4i, O4d, O4a), **copas ×3**
(S1s, S1v, PG1a en Escudos), **escaleras** (P4cp, S3s), **Helicium/Synptera**. De 17 «especies» del Bestiario, la
mitad eran repeticiones; el primer y el segundo mundo solo daban Orbium.

## 3. Después: una especie nueva por mundo

| Mundo | Especie (nombre) | Catálogo | Color | Tamaño (radio) | Rasgos (chips) | Frase al descubrirla |
|---|---|---|---|---|---|---|
| 1 Clásico | **Nadadora celeste** | O2u *Orbium unicaudatus* | celeste 198° | M (10,9) | mediana · centro brillante · redonda | Tu primera especie: un disco de centro brillante. |
| 2 Frío | **Anillo verde** | C0v *Circium ventilans* | verde 112° | S (7,1) | pequeña · quieta · agujero | Como la Nadadora, pero con un agujero y sin centro brillante. |
| 3 Remolinos | **Remolino violeta** | OG2g *Gyrorbium gyrans* | violeta 272° | M (13,4) | mediana · gira · redonda | Como la Nadadora, pero sin centro brillante y que gira en el sitio. |
| 4 Escudos | **Escudo coral** | S2s *Discutium solidus* | coral 8° | M (14,8) | mediana · ovalada · agujero | Como el Anillo, pero mucho más grande y que nada. |
| 5 Hélices | **Bailarina turquesa** | H3cp *Helicium cavus pedes* | turquesa 172° | L (17,1) | grande · retorcida · patas | Como el Remolino, pero con agujeros y con patas. |
| 6 Patas | **Escalera dorada** | P4cp *Paraptera cavus pedes* | dorado 45° | L (23,5) | grande · agujeros · larga | Como el Escudo, pero con más agujeros y más grande. |
| 7 Gigantes | **Oruga rosada** | 3GH2n *Hydrogeminium natans* | rosado 325° | XL (35,0) | gigante · muchas patitas · larga | Como el Escudo, pero mucho más grande y con muchas patitas. |

Preajustes (μ · σ · R · anillos): Clásico 0,15 · 0,015 · 13 · [1]; Frío **0,38 · 0,07** · 13 (el punto del catálogo de
Circium; vive en 0,37–0,39 × 0,067–0,076); Remolinos 0,16 · 0,0222 · 13; Escudos 0,356 · 0,063 · 13; Hélices
**0,23 · 0,0355** · 13; Patas **0,29 · 0,0465** · 13; Gigantes 0,25 · 0,033 · 18 · [½, 1, ⅔]. Todas guardan su masa y
su forma (distancia de forma 0,01–1,03 < 1,2).

**Tamaños**: del Anillo (7 celdas) a la Oruga (35), ×5. Se probó dar a cada mundo su R (pequeño R 9–10, grande 18): la
mayoría de formas viven a R 10 (O2u, S1s, P4cp, C0v, S2s…), pero la complejidad (y la Esencia) crece con R, así que un
mundo de R 10 paga menos que el anterior y rompe la regla «un mundo nuevo nunca paga menos». Los tamaños propios de las
especies ya dan la escala S → XL, así que todos los mundos siguen en R 13 salvo Gigantes (R 18).

### Matriz de distinción (después)

Suma de diferencias visibles de `compareLooks` (agujeros 4–5, centro 3,5, patas 3–4, contorno 2–3,5, tamaño ×1,35 3,2
o ×2 4,5, manera de moverse 2,5; el color no cuenta). **Mínimo 5** para ser especies distintas (`LOOKALIKE`).

| | Nadad | Anillo | Remol | Escudo | Bailar | Escal | Oruga |
|---|---|---|---|---|---|---|---|
| Nadadora | · | 13,2 | 6 | 12,7 | 18,2 | 15,5 | 18,5 |
| Anillo | 14,2 | · | 10,7 | 9 | 16 | 14,5 | 13,5 |
| Remolino | 6 | 9,7 | · | 8,5 | 9 | 13,2 | 17,5 |
| Escudo | 13,7 | 9 | 9,5 | · | 9,5 | 9,2 | 9,5 |
| Bailarina | 20,2 | 18 | 11 | 11,5 | · | 11,7 | 17 |
| Escalera | 16,5 | 15,5 | 14,2 | 10,2 | 10,7 | · | 11,2 |
| Oruga | 20,5 | 14,5 | 19,5 | 10,5 | 17 | 11,2 | · |

El par más cercano es Nadadora/Remolino (6: uno tiene el centro brillante y nada, el otro gira en el sitio sin él), y
además van en celeste y violeta. Test: `looks.test.ts` «distinctiveness matrix».

### Variantes (nunca «¡Nueva especie!»)

Formas del catálogo que viven en algún mundo pero que un niño no distingue de una especie: cuentan como esa especie,
con una nota pequeña en su tarjeta («variante: pareja»). No se siembran; si una se forma sola, es de su especie.

| Especie | Variantes |
|---|---|
| Nadadora | O2b (dos colas), O2ui (más fina), O2p (fantasma), O4s (rayada), O4i (pareja pegada), O4d y O4a (pareja) |
| Remolino | OG2r (que da vueltas) |
| Escudo | PS3am (de fuego), S1s y S1v (pequeña), PG1a (pequeña que gira) |
| Bailarina | P3sp (más recta, que nada) |

## 4. Reglas

1. **Una especie del Bestiario = una forma que se ve distinta** de todas las anteriores: al menos `LOOKALIKE` puntos de
   diferencias visibles, medidas en su mundo. Lo que no llega es una **variante**: sin celebración, sin entrada nueva.
2. **Color propio desde la primera vez** (`FIXED_COLORS`): siete familias distintas, vecinas del Bestiario a ≥ 60°;
   sus variantes llevan su mismo color. El color de una especie no depende del orden en que se encuentren.
3. **La comparación señala la diferencia que se ve** (agujero, centro, patas, contorno, tamaño, manera de moverse) y
   nunca solo los multiplicadores. Los datos (`newSpeciesComparison`) dan la frase, los chips y hasta dos diferencias
   con su lado y su ancla (`holes`, `tip`, `centre` de `measureLook(retrato).anchors`) para dibujar flechas.
4. **Nada inventado**: cada rasgo sale de la medida (`measuredFeatures`) o, para patas/patitas/retorcida, de la forma
   que la materia ya tiene en la imagen. No se dibuja nada encima de la criatura.
5. Un mundo nuevo **nunca paga menos** que el anterior (`world-check.ts --yield`): 1,76 · 1,84 · 3,34 · 3,37 · 6,90 ·
   7,68 · 9,60 por criatura.
6. Cambiar un preajuste o una especie: `world-check.ts --features --write`, los tests de `src/species` y
   `src/game/worlds`, y la hoja de contactos.

## 5. Ritmo: pase de balance (bot de sesiones, v0.015)

`npx vite-node scripts/session-bot.ts 80 7` (7 corridas por política, mediana). **Antes** = balance de v0.014 con
los mundos nuevos (placa Ø96 de 5, cámara rápida ×3, puertas de noche 2/4/7/10…). **Después** = este pase.

| Comprobación (planner) | Antes | Después |
|---|---|---|
| HARD: la mediana nunca gana menos que la sesión anterior | **FAIL** (2 caídas: S25 −4 %, S29 −5 %) | **OK (0)** |
| Noches en S4/S8/S13/S20 = 2/3/4/5 | FAIL (1/2/3/4) | **OK (2/3/4/5)** |
| ≥ 2 compras tras cada sesión | FAIL (mín. 1) | **OK (mín. 2)** |
| Esencia ×1,5–3 por sesión en las noches 1–2 | ×1,63 | **×1,83** |
| Final de la historia 1:30–2:15 | 1,69 h | **1,77 h** |
| Greedy: ≥ 2 compras tras cada sesión | FAIL | FAIL (política que compra lo más barato; igual que antes) |

Cambios (todos en `src/game/cycleBalance.ts`, con su comentario):

- **Placa de inicio Ø128** (era Ø96; `core/dish DISH_DIAMETERS` = 128 · 160 · 192 · 224): en el móvil la criatura se
  ve un 25 % más pequeña (el dueño: «es muy grande»). **Sitio** `DISH_CAPACITY` = 3 · 4 · 5 · 7, medido en CPU con
  deflexión (8 corridas × 1 200 pasos de Orbium): vivas al final ≈ 1,3 / 1,4 / 0,9 con 2 / 3 / 4 en Ø128; 1,6–1,8
  con 2–5 en Ø160 y Ø192 (más nadadoras solo chocan más). Placa más grande: 2 niveles (Ø128 → Ø160 → Ø192); Placa
  gigante Ø224. El bot modela el choque desde `cap − 1` nadadoras (Ø128: desde 2, como pedía DISH.md §8d).
- **Cámara rápida ×1,5** (era ×3; el dueño: «se mueve muy rápido»): 45 pasos/s, una semilla nace en 8,9 s. El
  arranque lo lleva la criatura incubada (viva y pagando desde el primer segundo, ver §6).
- **Puertas de noche** por especies 1 · 2 · 3 · 4 · 5 · 6 · 7 · 7 (hay 7), sesiones 4 · 8 · 13 · 20 · 29 · 44 · 52 · 60.
- **Datos**: especie nueva 10 (era 5), variante 2 (nuevo), récord 2 (era 1), Esencia ÷25 (era ÷30).
- **Encargos**: solo suman tiempo si se cumplen con el reloj en marcha (uno ya cumplido al preparar la partida no es
  algo que hiciste en ella; hacía de la primera partida de cada noche un pico que la siguiente no superaba).
- **Variantes en la placa**: con la especie ya en el Bestiario, el 12 % de las semillas de un mundo son una de sus
  variantes (`VARIANT_SPORE_CHANCE`): variedad sin «especie nueva».
- **Placa variada** (Ecosistema) cuenta las especies del Bestiario (antes «vivas a la vez», siempre 1 con una especie
  por mundo); **Amistad** (Simbiosis) vale para dos criaturas juntas de cualquier especie (antes «dos especies
  distintas», imposible ahora; además en sesiones no se aplicaba).

## 6. Errores corregidos con test

- **Placa vacía al empezar la sesión 1** (captura v0.014 «s1-running»): la criatura incubada nacía y moría contra el
  vidrio. La placa avanzaba pasos mientras la foto del detector seguía en camino, así que el deflector no la giraba
  (~60 pasos a ciegas cruzan media Ø96). Ahora la placa espera en cada frontera de 10 pasos a su foto
  (`src/sim/detectGate.ts`, ADR-025 enmendado); test `tests/unit/starter-dish.test.ts`.
- **«Muy cerca» con la placa vacía** (dueño, v0.014): una semilla plantada quedaba como obstáculo 3 s en el sitio donde
  se plantó, aunque la criatura ya se hubiera ido nadando o la espora se hubiera disuelto. Ahora deja de serlo en cuanto
  el detector la ha mirado dos veces (`SEED_SEEN_STEPS`); el aro rojo se dibuja sobre la materia que estorba
  (`seedBlocked.near`). Tests en `src/game/dish.test.ts`.

## 7. Límites conocidos

- Con una especie por mundo **nunca hay dos especies distintas en la placa a la vez**: la comparación se ve en el
  Momento «Dos especies distintas» y en el Bestiario (tarjetas lado a lado con aros sobre la diferencia).
- Los secretos «Llama fría» (O2ui) y «Fantasma» (O2p) vivían en el viejo Frío; ahora ningún mundo los cría (no viven en
  ningún preajuste actual). Hace falta decidir dónde encontrarlos.
- El tinte en materia muy brillante (el Anillo es casi todo materia a 1) está limitado por la gama: se ve blanco con
  borde verde. Subí el tinte del núcleo (80 %, croma 0,15); más exige bajar la luz del núcleo teñido (ARTE §8.2).
