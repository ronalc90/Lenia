# Claridad: «hasta un niño lo entiende»

> **Pedido del dueño:** *«Una persona sin saber nada del tema debe aprender del mismo y entender; no debe ser confuso
> hasta para un niño. Un niño no entiende qué es alfa ni cómo calibrar… debe ser un juego 100 % divertido e
> incremental… claro.»*

**Rol:** auditor de claridad (solo lectura sobre `src/`). **Fecha:** 2026-10-04. **Instantánea:** `main` @ `43403d5` +
árbol de trabajo de las 10:20 UTC. Otros agentes editaban a la vez (`src/game/treeText.ts`, `src/ui/i18n.ts` y el nuevo
`src/ui/seed-price.ts` cambiaron durante la auditoría): **las líneas pueden moverse; cada fila nombra también la clave**
para encontrarla con `grep`.

**Método.** Lectura completa de `src/game/content.ts`, `defs.ts`, `treeText.ts`, `src/ui/i18n.ts`, `src/story/script.ts`,
`encargoScript.ts`, `endings.ts`, `src/moments/catalog.ts`, `behaviors.ts`, `src/ui/moments/strings.ts`,
`src/secrets/data.ts`, `src/species/identity.ts`, `src/ui/story/strings.ts`; `grep` de cadenas (`t('`, `es:`,
`lang === 'es' ?`, `L(env, …)`) en todo `src/ui/**`, `src/game/game.ts`, `src/main.ts`, `src/store/**`; barrido de jerga
(μ σ mu sigma R dt núcleo anillos calibr régimen firma complejidad gradiente entropía toro espécimen Genoma Muestra
Extinción Era pasos Ø estable registrar producción) sobre todo `src/**`. Excluidos: `*.test.ts`, `dev.ts`, `mock.ts` y
comentarios. Contexto: `docs/CICLO.md`, la página «Rutas de mejora de Bioluma», `docs/STORY.md`, `docs/MOMENTOS.md`,
`docs/qa/QA2-claridad.md` (esta auditoría no repite sus hallazgos de tamaño de letra y toques; parte de ellos).

**Límites que los tests ya imponen** (todas las propuestas los cumplen; contadas con la misma función `words()` de los
tests): tutorial ≤ 12 palabras por línea; escena ≤ 20; tarea ≤ 6; botón de elección ≤ 5; Momento: título ≤ 4, etiqueta
breve ≤ 7, ≤ 2 líneas de ≤ 14 (`src/moments/config.ts`); Encargo: pedido ≤ 10, porqué ≤ 14, gracias ≤ 12; el Comité en
MAYÚSCULAS y termina en FIN / END. Texto del jugador siempre `{ es, en }` (CLAUDE.md, regla 3).

**Etiquetas de acción**

| Etiqueta | Qué hace el integrador |
|---|---|
| **[BORRAR]** | Obsoleto con el ciclo nuevo (CICLO §3.4, §15): se borra la clave y su uso. No se reescribe. |
| **[REESCRIBIR]** | El texto sigue vivo: se cambia por el propuesto, tal cual. |
| **[OCULTAR]** | Se enseña solo detrás de un toque («¿Por qué?», Microscopio). |
| **[UNIFICAR]** | Sinónimo: se cambia por la palabra del glosario (§2). |

---

## 0. Resumen

| Categoría | Filas | De ellas obsoletas (borrar) |
|---|---|---|
| 1.1 Parámetros de la simulación a la vista (μ, σ, R, dt, régimen, calibrar, pasos, clasificar) | 30 | 2 |
| 1.2 Sistemas retirados (Muestras, Genoma, Extinción, Era, Imprimir, Pipeta, offline, Laboratorio, Objetivos, tutorial de carteles) | 19 bloques + 28 filas | 19 bloques + 1 |
| 1.3 HUD, placa, criatura y Bestiario | 25 | 0 |
| 1.4 Árbol, sesión y tarjetas (incluye 7 nombres de nodos) | 28 | 0 |
| 1.5 Momentos | 12 | 0 |
| 1.6 Historia | 6 | 0 |
| 1.7 Encargos | 7 | 0 |
| 1.8 Logros y Bitácora | 7 | 0 |
| 1.9 Secretos | 3 | 0 |
| 1.10 Nombres de especies y de maneras de moverse | 8 | 0 |
| 1.11 Ajustes, ranking, tienda | 5 | 0 |
| 1.12 Textos que faltan (el ciclo nuevo los necesita) | 11 | 0 |
| 1.13 Textos nuevos del ciclo añadidos durante la auditoría | 10 (2 de ellos, bien) | 0 |
| **Total** | **19 bloques + 180 filas** | |

Además: **16 sinónimos a unificar** (§2.2), **23 pasos** de la ruta de aprendizaje (§3), **20 problemas de diversión**
(§4) y un TODO de **9 P0 · 10 P1 · 6 P2** (§5).

### Los 10 peores

1. **La Guía de maneras de moverse enseña μ y σ** — «Con μ y σ altos salen formas que no se mueven», «Sube σ un
   poquito», ejemplo «Orbium unicaudatus · μ 0,15 · σ 0,015» (`src/moments/behaviors.ts:89-123, 199-205`). Es la hoja que
   más se abre, y sin mandos el consejo es imposible. → J-01…J-08.
2. **La ficha de especie** enseña «Rango μ 0.150–0.150 · Rango σ 0.0150–0.0150» y, con Mundos, dirá en *todas* las
   especies de otros mundos «Fuera de su régimen: probablemente no sobreviva» (`src/ui/modals.ts:762-772`). → J-09, J-10.
3. **Cuatro avisos para una sola manera de moverse nueva**: toast de `game.ts:908` («Comportamiento nuevo: nadadora») +
   toast de `ui.ts:1890` («…: Nadadora», con mayúscula: el filtro de duplicados no lo ve) + etiqueta sobre la criatura +
   tarjeta de Momento. → F-07.
4. **El precio de la semilla se explica con la regla vieja**: «Cuantas más criaturas viven, más cuesta sembrar», «Murió
   una criatura → más barato» (celebra una muerte) (`src/moments/catalog.ts:470-530`, `src/ui/moments/strings.ts:47-61`).
   La regla nueva (`cycleBalance.ts`: los vivos no suben el precio) los deja mintiendo. → J-121, B-13, B-14.
5. **Las pistas de los secretos de especie piden mover mandos que no existen**: «Calibra μ ≈ 0.11 y σ ≈ 0.012
   (Calibrador II)», «dt ≤ 0.05 (Calibrador III)», «Vuelve al régimen del Helicium» (`src/secrets/data.ts:122-172`).
   → J-24…J-26.
6. **Palabras que asustan en el estado de una criatura**: «Explotó», «Muerta», «Se disuelve…»; Momento «¡Explotó!» cuyo
   texto dice «se fundieron» (`src/ui/i18n.ts:392-395`, `src/moments/catalog.ts:227-232`). → J-59, J-115.
7. **Muestras prometidas que ya no existen**: «Cada especie nueva te da Muestras para el Bestiario», chips «+1 Muestra»,
   premios de Encargos en Muestras (`src/moments/catalog.ts:172, 296`; `src/story/encargoScript.ts`). → J-31…J-37.
8. **Genoma y Extinción en Encargos e historia**: «Prueba la Extinción.», «Compra un nodo del Genoma.», «El Genoma es lo
   que la placa recuerda.», «Compra Anillos dobles en el Genoma.», «Se borra todo.»
   (`src/story/encargoScript.ts:307-386`, `src/story/script.ts:333-361`). → J-17, J-40…J-46.
9. **Calibrar sigue en el tutorial y en los Encargos**: «Mueve μ un poquito.», «Mueve μ en Calibrar.», «Calibra hasta
   que nazca algo nuevo. Hay especies escondidas entre los números.» (`encargoScript.ts:191, 369, 464`;
   `script.ts:313`). → J-13…J-16.
10. **VELA dice el nombre en latín y el Bestiario otro**: «¡Especie nueva! Se llama Orbium unicaudatus.» mientras el
    Bestiario la llama «Nadadora celeste» (`src/story/story.ts:358-363`, `src/ui/moments/species-card.ts:244, 382`).
    → J-128, J-148.

**Fuera de la lista pero P0 de diversión:** el final secreto y el Encargo `seven` piden las «siete especies de la
semilla», y **dos de ellas (Helicium solidus, Kronium dividuus) no viven en ningún mundo** (`src/game/worlds.ts`,
`dropped`): son metas imposibles (J-129, F-09).

---

## 1. Inventario de jerga

Columnas: **ID · Dónde (archivo:línea · clave) · Actual (es / en) · Por qué confunde · Propuesta (es / en) · Acción**.

### 1.1 Parámetros de la simulación a la vista

| ID | Dónde | Actual | Por qué confunde | Propuesta | Acción |
|---|---|---|---|---|---|
| J-01 | `src/moments/behaviors.ts:89` `TEXT.still.how` | «Con μ y σ altos salen formas que no se mueven.» / "High μ and σ give shapes that do not move." | Letras griegas; con Mundos no hay mandos: consejo imposible. | «En el Mundo 5 · Discos vive una que no se mueve.» / "In World 5 · Discs lives one that never moves." (Circium ventilans, «quieta» para el detector) | [REESCRIBIR] |
| J-02 | `behaviors.ts:95` `pulsing.how` | «Formas redondas que respiran: búscalas con μ y σ altos.» | Ídem. | «Algunas del Mundo 5 · Discos laten como un corazón.» / "Some in World 5 · Discs beat like a heart." **Verificar** (F-09): ninguna especie de los 7 mundos sale «late» en `catalogSignatures.json`. | [REESCRIBIR] |
| J-03 | `behaviors.ts:101` `swimmer.how` | «Formas de disco con cola, con las reglas del principio.» | «las reglas del principio» = calibración base. | «Casi todas nadan. Empieza en el Mundo 1 · Clásico.» / "Most of them swim. Start in World 1 · Classic." | [REESCRIBIR] |
| J-04 | `behaviors.ts:107` `spinner.how` | «Sube σ un poquito: algunos discos empiezan a girar.» | σ, mando inexistente. | «En el Mundo 3 · Remolinos nace una que gira.» / "In World 3 · Whirls one is born that spins." | [REESCRIBIR] |
| J-05 | `behaviors.ts:113` `divider.how` | «Con σ algo alto, algunas crecen y se parten en dos.» | Ídem. | «En el Mundo 3 · Remolinos vive una que se parte en dos.» / "In World 3 · Whirls lives one that splits in two." **Verificar** (Parorbium dividuus sale «nadadora» en el catálogo del detector). | [REESCRIBIR] |
| J-06 | `behaviors.ts:123` `colony.how` | «Siembra o imprime varias de la misma especie muy juntas.» | «imprimir» se retira. | «Siembra o copia tres iguales muy juntas.» / "Sow or copy three alike, close together." | [REESCRIBIR] |
| J-07 | `behaviors.ts:128-129` nota de colonia | «3 o más de la misma especie, a menos de 3 R entre sí.» / "…within 3 R of each other." | «R» es el radio del núcleo. | «3 o más de la misma especie, a menos de dos cuerpos.» / "3 or more of one species, less than two bodies apart." | [REESCRIBIR] |
| J-08 | `behaviors.ts:199-205` `exampleParamsText` → `src/ui/moments/behavior-guide.ts:80-82` | «Orbium unicaudatus · μ 0,15 · σ 0,015» en «Cómo conseguir más» | μ/σ y latín en la guía. `behaviorExample` elige por cercanía a la calibración base, puede devolver una especie que no vive en ningún mundo. | «Nadadora celeste · Mundo 1 · Clásico» (nombre común si está en el Bestiario; si no, silueta «?» + mundo). Elegir el ejemplo solo entre especies de `WORLDS` (`worldOfSpecies`). | [REESCRIBIR] |
| J-09 | `src/ui/modals.ts:762-766` + `src/ui/i18n.ts:124-125` `muRange`, `sigmaRange` | «Rango μ 0.150–0.150 · Rango σ 0.0150–0.0150» / "μ range · σ range" | Griego con 4 decimales; con mundos fijos el «rango» es un punto. | Una casilla: «Vive en: Mundo 2 · Frío» / "Lives in: World 2 · Cold" (clave nueva `livesIn` = «Vive en» / "Lives in"). | [BORRAR] + nueva |
| J-10 | `modals.ts:768-772` + `i18n.ts:132` `outOfRegime` | «Fuera de su régimen: probablemente no sobreviva.» / "Outside its regime: it will probably not survive." | «Régimen»; con Mundos saldría en todas las especies de otro mundo y suena a amenaza. | «Esta especie vive en otro mundo: {mundo}.» / "This species lives in another world: {world}." Solo si el mundo de la sesión no es el suyo. | [REESCRIBIR] |
| J-11 | `src/game/treeText.ts:135` `VALUE_TEXT.microscope[1]` | «Rangos y marcas» / "Ranges and marks" | «Rangos» = rangos μ/σ. | «Dónde vive y cómo se mueve» / "Where it lives and how it moves" | [REESCRIBIR] |
| J-12 | `src/moments/catalog.ts:440-468` Momento `calibration`, `calibChip` (79-102), `src/ui/moments/illustrations.ts:1477` | «Cambiaste las reglas» · «¡y con σ alto todo se desborda!» · chip «μ 0,150 → 0,160» · dibujo «σ 0,0260» | Calibrar se retira. | Lo sustituye la escena `t_world` (§3, paso 19). | [BORRAR] |
| J-13 | `src/story/script.ts:299-317` escena `t_calibrate` | «Esto cambia las reglas de su mundo.» · «Si las mueves, todo cambia. ¡Con cuidado!» · tarea «Mueve μ en Calibrar.» / "Move μ in Calibrate." | μ en una tarea del tutorial. | Escena nueva `t_world` (§3, paso 19). | [REESCRIBIR] |
| J-14 | `src/story/encargoScript.ts:177-186` `calib` | «Compra el Calibrador.» · «Cambia las reglas de su mundo. ¡Y nacen criaturas nuevas!» · «¡Ahora mandas tú! Con cuidado, ¿eh?» | Calibrador retirado. | Pedido «Abre el Mundo 2 en el Árbol.» · porqué «Otro mundo, otras reglas. ¡Allí nacen criaturas nuevas!» · gracias «¡Mundo nuevo! Te lo dejo elegido para la próxima.» / "Open World 2 in the Tree." · "Another world, other rules. New creatures are born there!" · "A new world! It is picked for your next session." (CICLO §6) | [REESCRIBIR] |
| J-15 | `encargoScript.ts:187-196` `move` | «Mueve μ un poquito.» / "Nudge μ a little." · «Otras reglas, otra fauna. ¡A ver quién sale!» | μ; «fauna». | Pedido «Juega una sesión en el Mundo 2.» · porqué «Allí viven criaturas que aún no conoces.» · gracias igual / "Play a session in World 2." · "Creatures you have not met yet live there." | [REESCRIBIR] |
| J-16 | `encargoScript.ts:364-375` `calibNew` y `:459-470` `s_new` | «Calibra hasta que nazca algo nuevo.» · «Hay especies escondidas entre los números.» | «Calibrar», «entre los números». | «Juega un mundo nuevo hasta que nazca algo.» · «Cada mundo esconde especies que aún no tienes.» / "Play a new world until something is born." · "Every world hides species you do not have yet." | [REESCRIBIR] |
| J-17 | `encargoScript.ts:376-386` `rings` | «Compra Anillos dobles en el Genoma.» · «Dos anillos, reglas nuevas, criaturas enormes.» | «Anillos» del núcleo; Genoma. | «Abre el Mundo 7 · Gigantes.» · «Criaturas enormes: caben menos, pero valen el doble.» · gracias igual / "Open World 7 · Giants." · "Huge creatures: fewer fit, but each is worth double." | [REESCRIBIR] |
| J-18 | `script.ts:494, 508-509` `a2_answer` | «Puedo recalibrar y quitar ese ruido. Todo limpio. Perfecto.» · opción «Recalibrar» · «Recalibrado. Silencio total. Muy… limpio.» | «Recalibrar» ya no es un verbo del juego. | «Puedo ajustar la placa y quitar ese ruido. Todo limpio.» · opción «Quitar el ruido» · «Ruido quitado. Silencio total. Muy… limpio.» / "I can tune the dish and remove that noise. All clean." · "Remove the noise" · "Noise removed. Total silence. Very… clean." | [REESCRIBIR] |
| J-19 | `src/story/endings.ts:69` final Marea | «Dejé de calibrar. Dejé de elegir. Solo miré.» | «Calibrar». | «Dejé de ordenar. Dejé de elegir. Solo miré.» / "I stopped arranging. I stopped choosing. I just watched." | [REESCRIBIR] |
| J-20 | `endings.ts:43` final Ley | «Ajusté las reglas hasta el último decimal.» | «Decimal» (es cinemática adulta; P2). | «Ordené las reglas hasta el último detalle.» / "I put the rules in order, down to the last detail." | [REESCRIBIR] |
| J-21 | `src/game/content.ts:233` `JOURNAL.calibrator` | «Si muevo μ un poco, el mundo cambia de reglas. Tengo que anotar todo.» | μ en la Bitácora. | Id `firstWorld`: «Abrí otro mundo. Otras reglas, otras criaturas. Tengo que anotarlo todo.» / "I opened another world. Other rules, other creatures. I must write it all down." | [REESCRIBIR] |
| J-22 | `content.ts:270` logro `tinkerer` | «Ajuste fino» · «Cambia la calibración.» | Calibración. | «Viajera» · «Visita 3 mundos.» / "Traveller" · "Visit 3 worlds." (CICLO §15) | [REESCRIBIR] |
| J-23 | `content.ts:271` logro `regime` | «Archivista» · «Guarda un régimen.» | Régimen. | «Archivista» · «Encuentra todas las especies de un mundo.» / "Archivist" · "Find every species of one world." | [REESCRIBIR] |
| J-24 | `src/secrets/data.ts:122-132` `ignis` | flavor «Arde sin calor, donde μ apenas alcanza.» · diario «Bajé μ hasta donde casi nada vive…» · pistas «Baja μ más de lo que parece sensato; σ también, un poco.» / «Calibra μ ≈ 0.11 y σ ≈ 0.012 (Calibrador II) y siembra.» | Pistas imposibles (sin mandos). El Mundo 2 (μ 0,1207) queda fuera de la ventana de `regimes.ts` (0,107–0,118), pero O2ui vive en el Mundo 2 como especie normal: el «secreto» se encuentra sin buscarlo. | flavor «Arde sin calor, en el mundo más frío.» · diario «En el Mundo Frío algo se encendió. Orbium ignis: el mismo Orbium, con fiebre.» · pistas «Algunas llamas solo prenden donde hace frío.» / «Juega en el Mundo 2 · Frío y siembra mucho.» / «Mundo 2 · Frío: una nadadora rosada que parece una llama.» (EN paralelo). El dueño de secretos decide si sigue siendo secreto. | [REESCRIBIR] |
| J-25 | `data.ts:142-152` `phantasma` | diario «Bajé dt al mínimo y apareció algo casi transparente…» · pistas «Con dt al mínimo, busca cerca de Orbium con σ muy fina.» / «μ ≈ 0.13, σ ≈ 0.009 y dt ≤ 0.05 (Calibrador III).» | dt, μ, σ, «Calibrador III». | diario «En el Mundo Frío apareció algo casi transparente. Le gusta que lo miren despacio.» · pistas «Hay quien solo se deja ver si no tienes prisa.» / «Búscala en el Mundo 2 · Frío.» / «Mundo 2 · Frío: una nadadora casi transparente.» | [REESCRIBIR] |
| J-26 | `data.ts:163-172` `cryptid` | diario «En el régimen del Helicium, a deshoras…» · pistas «Vuelve al régimen del Helicium pasada la medianoche…» / «μ ≈ 0.349, σ ≈ 0.0605, entre las 00:00 y las 04:00…» | Régimen, μ, σ; Helicium no vive en ningún mundo; PS3am se agrupa con S2s (`CATALOG_GROUPS`) y quizá nunca se registre con su nombre: **verificar** que el secreto se pueda conseguir. | diario «En el mundo de los discos, a deshoras, apareció otra cosa. Ambigua.» · pistas «Algunas especies tienen horario.» / «Vuelve al Mundo 5 · Discos pasada la medianoche.» / «Mundo 5 · Discos, entre las 00:00 y las 04:00, o con luna llena.» | [REESCRIBIR] |
| J-27 | `data.ts:315-325` `infinity` | diario «…recordé que la placa es un toro: lo que sale por un lado entra por el otro.» · flavor «La placa ya era infinita: solo da la vuelta.» | «Toro» (un niño piensa en el animal). Si llega la placa redonda con rebotes (plan v0.012), la frase deja de ser verdad. | «Dibujé un infinito. La placa da la vuelta: lo que sale por un lado entra por el otro.» / "…The dish wraps around: what leaves one side enters the other." Con placa redonda: flavor «Un ocho tumbado. Ojalá la placa no tuviera borde.» | [REESCRIBIR] |
| J-28 | `src/ui/ui.ts:1672` + `i18n.ts:68-69` `age`, `steps` | «Edad 820 pasos» / "Age 820 steps" | «Pasos» de simulación: unidad interna. | «Vive desde hace 27 s» / "Alive for 27 s" (pasos ÷ 30). Borrar `steps`. | [REESCRIBIR] |
| J-29 | `src/ui/moments/species-card.ts:75` booster `nutrient` | «Más forma medida: más Esencia» / "More measured shape: more Essence" | «Medida» = complejidad del detector. | «Criaturas con más forma dan más Esencia.» / "Creatures with more shape give more Essence." | [REESCRIBIR] |
| J-30 | `i18n.ts:65` `classifying`, `:138` `unclassified`, `species-card.ts:132` | «Clasificando…» · «Sin clasificar» · «aún sin clasificar» | «Clasificar» es del detector. | «Mirando cómo se mueve…» · «¿Cómo se moverá?» · «aún no sabemos cómo se mueve» / "Watching how it moves…" · "How will it move?" · "not sure how it moves yet" | [REESCRIBIR] |

### 1.2 Sistemas retirados

#### 1.2.a Bloques que se borran enteros

| ID | Dónde | Claves / ids | Motivo |
|---|---|---|---|
| B-01 | `src/ui/i18n.ts:23, 33, 105, 141-156` | `tabCalibrate`, `introCalibrate` («cada régimen tiene su fauna»), `lockCalibrate`, `calWarning` («Cambiar las reglas puede **matar** la vida actual»), `muLabel`, `sigmaLabel`, `RLabel`, `dtLabel`, `rulesOfLife`, `sliderLocked`, `regimes`, `saveRegime`, `regimeName`, `regimesEmpty`, `regimesLocked`, `deleteRegime`, `loadRegime` | Calibrar → Mundos (CICLO §3.4, §15). Con `src/ui/panel-calibrate.ts`. |
| B-02 | `i18n.ts:11, 24, 37, 106, 160-173, 176-182` | `genome`, `tabGenome`, `introGenome` («Extingue la placa…»), `lockGenome`, `branchRules`, `branchHeritage`, `branchFauna`, `genomeBonus`, `owned`, `requires`, `extinguish`, `holdToConfirm`, `gainNow`, `gainIn10`, `extinctionLocked`, `eraEnd`, `eraDuration`, `eraEssence`, `eraNewSpecies`, `eraBest`, `genomeGained`, `openGenome` | Genoma y Extinción → Noche gratis (CICLO §5). Con `panel-genome.ts` y `openEraSummary` (`modals.ts:840-875`). |
| B-03 | `i18n.ts:10, 82` | `samples`, `bestiaryUpgrades` («Mejoras de Muestras») | Muestras retiradas. |
| B-04 | `i18n.ts:21, 25, 75-81, 83, 101-103` | `tabLab`, `introLab`, `buyQty`, `qtyMax`, `level`, `maxed`, `locked`, `lockedSection` («Por descubrir» / "Yet to unlock"), `noUpgrades`, `labEmpty`, `labEmptyHint`, `lockLab` | Laboratorio → Árbol. Con `panel-lab.ts`, `upgrades.ts`. |
| B-05 | `i18n.ts:17-18` | `objective`, `objectiveDone` | Objetivos → Encargos (STORY §10.5). |
| B-06 | `i18n.ts:61, 185-187` | `pipette` («Pipeta de emergencia»), `offlineTitle`, `offlineIn`, `offlineGo` | Pipeta y offline retirados (CICLO §3.4, §7). |
| B-07 | `i18n.ts:51, 126` | `hintBrush` («Arrastra: pincel de materia»), `print` («Imprimir») | Pincel retirado; «Imprimir» sin uso. |
| B-08 | `i18n.ts:303-320` | `tutSeedTitle` … `tutGenome` (los 9 pasos de carteles) | `tutorial: false` (`src/main.ts:345`): el tutorial es VELA. **Mantener** `tutSkip`, `tutNext`, `tutGotIt`, `tutRestart`, `tutRestartHint`. |
| B-09 | `src/game/content.ts:30-169` | `UPGRADE_TEXT` (incluye «Afinidad sésil», «Realza la complejidad medida…», «Pipeta rápida», «Reserva», «…en el régimen actual»), `DROPPER_LEVEL_TEXT`, `CALIBRATOR_LEVEL_TEXT` («μ 0.12–0.18, σ 0.010–0.025»…), `MICROSCOPE_LEVEL_TEXT` («Rango de μ y σ», «Velocidad, periodo y firma»), `effectText` | Mejoras de Esencia → nodos de `treeText.ts`. |
| B-10 | `content.ts:173-219` | `GENOME_TEXT` («Elige el anillo en Calibrar», «Segundo canal», «Depredación»…) | Genoma. |
| B-11 | `content.ts:285-313, 323-327, 330, 339-341, 344, 349` | `OBJECTIVE_TEXT`, `objectiveText`, `TEXT.objectiveDone`, `upgradeUnlocked`, `tabUnlocked`, `extinctionReady`, `pipetteReady`, `extinctionRequirement`, `extinctionGain`, `multGenome`, `offline` | Sistemas retirados. Con los Encargos activos (`objectiveOverride` en `main.ts`) la barra de objetivos no se ve; si se mantiene, usar el nuevo `SESSION_OBJECTIVE_TEXT` con J-171…J-173. |
| B-12 | `src/game/defs.ts` (todo) | `UPGRADES`, `GENOME_NODES`, `genomeGain` | Sin texto propio, pero su `value()` producía «Nv 3/5», «+8 %». |
| B-13 | `src/moments/catalog.ts:74-76, 133-140, 501-530, 556-611` | `samplesChip`, `genomeChip`, `offlineShare`, Momentos `seedCheaper` («Murió una criatura → sembrar es más barato»), `extinctionReady`, `extinction`, `offline` | Precio por criaturas vivas, Extinción y offline retirados. |
| B-14 | `src/ui/moments/strings.ts:47-50, 52-57, 61` | `spRule` («Sembrar cuesta más cuantas más criaturas viven…»), `rsAlive1`, `rsAliveN`, `rsFull` («Placa llena: 4 de 3 espacios → ×3»), `rsDied1`, `rsDiedN` («Murió una criatura → más barato»), `rsBase` | Regla de precio vieja; la nueva vive en `src/ui/seed-price.ts` (otro agente). Revisar que ese archivo tampoco las use (`ruleCrowd`, `ruleSat`, `rsAlive*`, `rsGone*`). |
| B-15 | `src/ui/moments/illustrations.ts:1316, 1575-1649, 1721-1781` | dibujos `seedPrice`/`seedCheaper` («espacios baratos», «Precio de siembra», «más barato»), `extinctionReady`, `keepReset` («Genoma», «Muestras», «Se reinicia») | Ilustraciones de sistemas retirados. |
| B-16 | `src/ui/ui.ts:200-202, 679-680, 1368` | `TAB_LABEL`/`TAB_ICON`/`LOCK_HINT` de `lab`, `calibrate`, `genome`; `title` de `curSamples`/`curGenome`; píldora «Pipeta de emergencia 42 %» | CICLO §15. |
| B-17 | `src/game/game.ts:1096, 1102` | toasts «Nueva pestaña: Genoma», «La placa está madura: la Extinción está disponible» | Ídem. |
| B-18 | `src/story/script.ts:218-235` escena `t_lab` | «Esto es el Laboratorio. Aquí compras mejoras.» · «¡Compra el Gotero! Tus semillas prenderán más.» | Lo sustituye `t_tree` (§3, paso 11). |
| B-19 | Objetivos de foco de la historia (STORY §7.3) | `tab.lab`, `tab.calibrate`, `tab.genome`, `extinguish`, `upgrade.dropper` | Nuevos: `tree.node.<id>`, `start.world`, `hud.clock`, `hud.datos`. |

#### 1.2.b Textos que se quedan pero nombran lo retirado

| ID | Dónde | Actual | Por qué confunde | Propuesta | Acción |
|---|---|---|---|---|---|
| J-31 | `catalog.ts:296` Momento `species`, línea 2 | «Cada especie nueva te da Muestras para el Bestiario.» | Muestras ya no existen. | «Cada especie nueva te da 5 Datos y 5 segundos más.» / "Every new species gives you 5 Data and 5 more seconds." Chips «+5 Datos» (`DATOS_PER_NEW_SPECIES`) y «+5 s» (`SESSION_TIME_PER_SPECIES`). | [REESCRIBIR] |
| J-32 | `catalog.ts:172` chips de comportamiento | «+1 Muestra» | Ídem. | «+3 Datos» (`DATOS_PER_NEW_BEHAVIOR`) | [REESCRIBIR] |
| J-33 | `illustrations.ts:775` | «+1 Muestra» dibujado | Ídem. | «+5 Datos» | [REESCRIBIR] |
| J-34 | `modals.ts:774-780` + `i18n.ts:127-128` `plantAnother`, `printHint` | botón «Plantar otra · [probeta] 3» · «Coloca esta especie en la placa con las reglas actuales.» | Precio en Muestras; «reglas actuales». | Botón «Hacer una copia · [gota] 12» (Esencia; solo con Copiadora y dentro de una sesión) · ayuda «Pon otra igual en la placa. Cuesta Esencia.» / "Make a copy · 12" · "Put another one like it on the dish. Costs Essence." | [REESCRIBIR] |
| J-35 | `i18n.ts:58` `printMode` | «Toca para imprimir {name}» | «Imprimir». | «Toca dónde poner la copia de {name}» / "Tap where to put the copy of {name}" | [REESCRIBIR] |
| J-36 | `content.ts:331` `freePrintReady` | «Archivo: Impresión gratis lista» | «Impresión». | «Archivo: ¡copia gratis lista!» / "Archive: free copy ready!" | [REESCRIBIR] |
| J-37 | Premios `samples` de `encargoScript.ts` (`swimmer` :339, `colony` :362, `calibNew` :374, `seven` :397, `s_dancer` :432, `s_heart` :445, `s_split` :457, `s_new` :469, `s_spin90` :480) + chip probeta `src/ui/story/encargoUI.ts:127` | «+2 [probeta]» | Muestras. | Chips «+2 Datos» (`DATOS_PER_ENCARGO`) y «+5 s» (`SESSION_TIME_PER_ENCARGO`) junto a la Esencia (CICLO §6). | [REESCRIBIR] |
| J-38 | `encargoScript.ts:257-266` `print` | «IMPRIMAN UNA COPIA DE UNA ESPECIE. FIN.» / "PRINT A COPY OF A SPECIES. END." | «Imprimir». | «HAGAN UNA COPIA DE UNA ESPECIE. FIN.» / "MAKE A COPY OF A SPECIES. END." | [REESCRIBIR] |
| J-39 | `encargoScript.ts:516-526` `s_print` | «IMPRIMAN 3 COPIAS. FIN.» | Ídem. | «HAGAN 3 COPIAS. FIN.» / "MAKE 3 COPIES. END." | [REESCRIBIR] |
| J-40 | `encargoScript.ts:297-306` `era100k` | «Junta 100 000 Esencia esta noche.» | «Noche» = Era; no cabe en sesiones de 2:00. | «Gana 2 000 Esencia en una sesión.» / "Earn 2,000 Essence in one session." (CICLO §6) | [REESCRIBIR] |
| J-41 | `encargoScript.ts:307-316` `extinct` | «Prueba la Extinción.» · «La noche termina, la memoria queda.» | Palabra triste; sistema retirado. | «Empieza una noche nueva en el Árbol.» · «La noche avanza y la memoria se queda.» · gracias igual / "Start a new night in the Tree." · "The night moves on, the memory stays." | [REESCRIBIR] |
| J-42 | `encargoScript.ts:319-329` `genome` | «Compra un nodo del Genoma.» · «El Genoma es lo que la placa recuerda.» | Genoma, «nodo». | «Compra 5 mejoras en el Árbol.» · «Lo que aprendes se queda en el Árbol.» · gracias igual / "Buy 5 upgrades in the Tree." · "What you learn stays in the Tree." | [REESCRIBIR] |
| J-43 | `script.ts:333-361` `a1_extinction` | «La placa está llena. Toca empezar de nuevo.» · «Se borra todo. Pero lo aprendido se queda.» (focos `tab.genome`, `extinguish`) | Miedo a perder; ya no se borra nada. | Id `a1_night`: «¡La noche puede avanzar! Mira el centro del Árbol.» · «No se borra nada. Se abren mejoras nuevas.» · (la línea de la lámpara, igual) / "The night can move on! Look at the centre of the Tree." · "Nothing gets wiped. New upgrades open." Foco `tree.node.lab`. Condición `nightReady`. | [REESCRIBIR] |
| J-44 | `script.ts:78` `STORY_JOURNAL.s_lamp` | «Dejé la lámpara encendida durante la Extinción. Es una tontería. Lo haré siempre.» | Extinción. | «Dejé la lámpara encendida al empezar la noche. Es una tontería. Lo haré siempre.» / "I left the lamp on as the night began. It is silly. I will always do it." | [REESCRIBIR] |
| J-45 | `script.ts:93` `e_extinct` | «Primera Extinción. La placa quedó en blanco, pero el Bestiario no…» | Ídem. | «Primera noche nueva. La placa se lavó, pero el Bestiario no. Nada se perdió.» / "First new night. The dish was washed, the Bestiary was not. Nothing was lost." | [REESCRIBIR] |
| J-46 | `script.ts:448` `a2_tape2` | «En los informes lo llamo «genoma». Suena a ciencia.» | «Genoma» ya no aparece. | «En los informes lo llamo «datos». Suena a ciencia.» / "In my reports I call it “data”. It sounds scientific." (une la moneda con la historia: los Datos son memoria) | [REESCRIBIR] |
| J-47 | `content.ts:235-236` `JOURNAL.extinctionNear`, `firstExtinction` | «La placa está madura. Quizá sea hora de empezar de cero…» · «Esterilizo la placa. Me duele…» | Extinción. | `nightReady`: «La placa está madura. La noche puede avanzar.» · `firstNight`: «Empieza otra noche. La placa se lava; lo aprendido se queda conmigo.» (EN paralelo) | [REESCRIBIR] |
| J-48 | `content.ts:272-273` logros `extinction`, `heritage` | «Tabula rasa» · «Provoca una Extinción.» · «Herencia» · «Compra un nodo del Genoma.» | Latín; sistemas retirados. | «Primera noche» · «Empieza una noche nueva.» · «Jardinera» · «Compra 10 mejoras del Árbol.» / "First night" · "Start a new night." · "Gardener" · "Buy 10 upgrades in the Tree." | [REESCRIBIR] |
| J-49 | `content.ts:276` logro `returned` | «De vuelta» · «Vuelve tras una ausencia.» | Sin offline; «ausencia». | «De vuelta» · «Vuelve a jugar otro día.» / "Come back to play another day." | [REESCRIBIR] |
| J-50 | `i18n.ts:122-123` `discoveredEra`, `era` (insignia de la ficha `modals.ts:751`; ranking `src/ui/leaderboard.ts:219-222`) | «Era 3» / "Era 3" | Era = Noche. | «Noche 3» / "Night 3" | [UNIFICAR] |
| J-51 | `i18n.ts:197, 201` `statEraEssence`, `statEra` | «Esencia esta Era» · «Era actual» | Ídem; la Esencia es por sesión. | «Mejor sesión» · «Noche» / "Best session" · "Night" | [REESCRIBIR] |
| J-52 | `i18n.ts:326` `boardEra` | «Eras» | Ídem. | «Noches» / "Nights" | [UNIFICAR] |
| J-53 | `src/store/catalog.ts:720` insignia `badge.tabula` | «Un brote nuevo: sobreviviste a tu primera Extinción.» | Extinción. | «Un brote nuevo: tu primera noche nueva.» / "A new sprout: your first new night." | [REESCRIBIR] |
| J-54 | `store/catalog.ts:861` | «Nada de esta tienda da Esencia, velocidad, Muestras, Genoma, semillas ni atajos de tiempo…» | Monedas retiradas. | «Nada de esta tienda da Esencia, Datos, semillas ni tiempo extra…» / "Nothing here gives Essence, Data, seeds or extra time…" | [REESCRIBIR] |
| J-55 | `src/secrets/data.ts:448-452` `sterile` | «Provoca una Extinción sin que quede nada vivo.» · «Extingue con 0 criaturas en la placa.» | Extinción. | «Termina una sesión sin nada vivo en la placa.» · «Pulsa «Terminar ahora» con 0 criaturas vivas.» / "End a session with nothing alive on the dish." · "Tap “End now” with 0 creatures alive." | [REESCRIBIR] |
| J-56 | `data.ts:503` `birthday` flavor | «Una vela por cada Era.» | Era. | «Una vela por cada noche.» / "One candle for every night." | [UNIFICAR] |
| J-57 | `content.ts:328` `dishSaturated` | «La placa está saturada: el Sembrador no encuentra hueco» | «Saturada». | «Placa llena: el Sembrador espera a que haya sitio.» / "Dish full: the Auto-seeder waits for room." | [REESCRIBIR] |
| J-58 | `src/game/game.ts:908` + `content.ts:329` `TEXT.newBehavior` | toast «Comportamiento nuevo: nadadora» | Duplica el toast de `ui.ts:1890` (otra mayúscula: el filtro de duplicados de `toasts.ts:43` no lo ve) + etiqueta + tarjeta (F-07). | Sin toast. | [BORRAR] |

### 1.3 HUD, placa, criatura y Bestiario

| ID | Dónde | Actual | Por qué confunde | Propuesta | Acción |
|---|---|---|---|---|---|
| J-59 | `i18n.ts:392-395` `STATE` + `src/ui/moments/strings.ts:29-32` `stBorn…stDead` | «Naciendo · Estable · Explotó · Muerta» · píldora «Se disuelve…» / "Forming · Stable · Exploded · Dead" · "Fading…" | «Explotó» y «Muerta» asustan (QA2 H-17); «Estable» es jerga. | «Naciendo · Viva · Sin forma · Se apagó» · píldora «Se apaga…» / "Hatching · Alive · Shapeless · Faded" · "Fading…" | [REESCRIBIR] |
| J-60 | `i18n.ts:12` `perSec` + `ui.ts:904, 907` | «+0/s» · aria «Esencia: 20, +0/s» | «/s» no se lee. | Se queda «+1/s» (cabe) pero el Momento `income` lo nombra la primera vez (§3, paso 4); aria «Esencia: 20. Ganas 1 por segundo.» / "Essence: 20. You earn 1 per second." | [REESCRIBIR] |
| J-61 | `ui.ts:913` + `i18n.ts:84-85` `multGlobal`, `multBuffs` | «Producción ×1,2 · Bonos activos ×2» | «Producción», «bonos». | «Todo da ×1,2 · Premio ahora ×2» / "Everything ×1.2 · Prize now ×2" | [REESCRIBIR] |
| J-62 | `i18n.ts:96` `multParts` | «De dónde sale la producción» | «Producción». | «De dónde sale tu Esencia» / "Where your Essence comes from" | [UNIFICAR] |
| J-63 | `i18n.ts:47-48` `tapDish`, `tapDishSub` | «Toca la placa» · «Siembra vida y mira qué pasa» | «Sembrar vida» es abstracto. | «¡Toca aquí!» · «Pon una semilla y mira qué pasa.» / "Tap here!" · "Drop a seed and see what happens." | [REESCRIBIR] |
| J-64 | `i18n.ts:49-50` `hintLongPress`, `hintDoubleTap` | «Mantén pulsado: siembra grande» | «Siembra» como sustantivo (usar «semilla»). | «Mantén pulsado: semilla grande» / «Doble toque: semilla grande» | [UNIFICAR] |
| J-65 | `i18n.ts:57` `eraserMode` | «Toca para borrar materia» | «Materia». | «Toca para borrar» / "Tap to erase" | [REESCRIBIR] |
| J-66 | `i18n.ts:63` `newBehavior` (+ etiqueta `ui.ts:1889`) | «Comportamiento nuevo» | Palabra adulta. | «¡Nueva manera de moverse!» / "New way of moving!" | [UNIFICAR] |
| J-67 | `i18n.ts:64` `unknownCreature` | «Sin registrar» | «Registrar». | «Aún sin nombre» / "No name yet" | [REESCRIBIR] |
| J-68 | `i18n.ts:70-71` `yields`, `behavior` (tarjeta de criatura `ui.ts:1585-1589`, valor `ui.ts:1671`) | «Produce +1,1/s» · «Comportamiento» | «Produce», «comportamiento». | «Da +1,1 Esencia/s» · «Cómo se mueve» / "Gives +1.1 Essence/s" · "How it moves" | [REESCRIBIR] |
| J-69 | `i18n.ts:92` `seedWaitWhy` | «Hay semillas formándose: espera un poco y sembrar costará menos» | Con la regla nueva esperar **no** abarata: miente. | «Hay semillas naciendo: espera a que terminen.» / "Seeds are hatching: wait until they finish." | [REESCRIBIR] |
| J-70 | `i18n.ts:98` `overgrownText` | «La materia sin forma no produce.» | «Produce». | «La materia sin forma no da Esencia.» / "Shapeless matter gives no Essence." | [REESCRIBIR] |
| J-71 | `src/main.ts:841-849` toast de lisis | «Materia sin forma: dos manchas se juntaron y crecían sin control. La disolví para salvar la placa.» | 17 palabras en un toast de 3 s; «manchas». | «Dos semillas se fundieron sin forma. La disolví para salvar la placa.» / "Two seeds melted into shapeless matter. I dissolved it to save the dish." | [REESCRIBIR] |
| J-72 | `content.ts:335-338` `dishAutoCleaned` | «La placa se desbordó y se limpió sola. Siembra con calma: si chocan muchas criaturas, se forma un laberinto.» | Largo. | «La placa se desbordó y la limpié. ¡Siembra separado!» / "The dish overflowed and I cleaned it. Sow apart!" | [REESCRIBIR] |
| J-73 | `content.ts:318-322` regalos del Destello | «¡Floración! ×7 producción durante 15 s» · «¡Lluvia de esporas! 3 siembras gratis» · «¡Mutágeno! Las próximas 3 siembras prenderán seguro» | «Floración», «producción», «esporas», «Mutágeno», «prender». | En sesiones el regalo es «30 s de tu Esencia» y ya existe `TEXT.sparkGift` (bien, J-179): borrar `lumpReward`, `bloom` y `bloomReward` si el ×7 se retiró. `sporeReward` «¡Lluvia de semillas! {n} gratis» · `mutagenReward` «¡Semillas mágicas! Las próximas {n} siempre viven» / "Seed shower! {n} free" · "Magic seeds! Your next {n} always live" | [REESCRIBIR] |
| J-74 | `strings.ts:59` `rsFree` y `src/ui/seed-price.ts:50` | «¡Gratis! (lluvia de esporas)» | «Esporas». | «¡Gratis! (lluvia de semillas)» / "Free! (seed shower)" | [UNIFICAR] |
| J-75 | `strings.ts:66-68` `spHint`, `spHintRoom`, `spDish` | «Mejora la Placa para tener más espacios baratos.» · «Cada criatura viva sube un poco el precio.» · «Ver Placa» | Regla vieja; «Placa» era una mejora del Laboratorio. | `spHint`: «¿Placa llena? Compra «Más sitio» en el Árbol.» · `spHintRoom`: [BORRAR] · `spDish`: «Ver en el Árbol» / "Dish full? Buy “More room” in the Tree." · "See in the Tree" | [REESCRIBIR] |
| J-76 | `i18n.ts:112` `emptyBestiary` | «Aún no hay especies. Siembra hasta que algo se estabilice.» | «Estabilice». | «Aún no hay nadie. Siembra hasta que nazca una criatura.» / "Nobody here yet. Sow until a creature is born." | [REESCRIBIR] |
| J-77 | `i18n.ts:29` `introBestiary` | «Cada especie estable que descubres queda registrada aquí.» | «Estable», «registrada». | «Aquí se guarda cada especie que descubres. ¡Toca una!» / "Every species you discover is kept here. Tap one!" | [REESCRIBIR] |
| J-78 | `i18n.ts:104` `lockBestiary` | «Se desbloquea al registrar tu primera especie» | «Registrar». | «Se abre con tu primera criatura» / "Opens with your first creature" | [REESCRIBIR] |
| J-79 | `i18n.ts:109` `registered` | «Registradas 3 / ?» | Ídem; «?» cuando el total se conoce. | «Descubiertas 3 / 17» (`TOTAL_WORLD_SPECIES`) / "Found 3 / 17" | [REESCRIBIR] |
| J-80 | `i18n.ts:117-118` `multiplier`, `timesSeen` (`modals.ts:758-759`) | «Multiplicador ×1,10 · Veces vista 3» | «Multiplicador» de qué. | «Rareza: ×1,1 Esencia · La viste 3 veces» / "Rarity: ×1.1 Essence · Seen 3 times" | [REESCRIBIR] |
| J-81 | `i18n.ts:94-95` `behaviorGuide`, `behaviorGuideAria` + `strings.ts:71, 85` `bhGuide`, `bhOpen` | «Comportamientos» · «Guía de comportamientos» | Palabra adulta. | «Maneras de moverse» · «Guía: cómo se mueve cada una» / "Ways of moving" · "Guide: how each one moves" | [UNIFICAR] |
| J-82 | `strings.ts:75-76` `bhChange`, `bhGet` | «Qué cambia» · «Cómo conseguir más» | «Qué cambia» no dice qué. | «Cuánta Esencia da» · «Dónde encontrarla» / "How much Essence" · "Where to find it" | [REESCRIBIR] |
| J-83 | `behaviors.ts:193-196` `affinityStepText` + `behavior-guide.ts:95-101` + `species-card.ts:64-76` | «Afinidad nadadora · nivel 1 · +8 % por nivel» (ids `swimAffinity`, `sessileAffinity`, `colonyAffinity`) | Nombre y número viejos: el Árbol dice «Nadadoras +15 %». | Usar el nodo del Árbol: «Nadadoras · +15 % por nivel» (`stillAffinity` en vez de `sessileAffinity`; el % desde `cycleBalance.ts`). | [REESCRIBIR] |

### 1.4 Árbol, sesión y tarjetas

| ID | Dónde | Actual | Por qué confunde | Propuesta | Acción |
|---|---|---|---|---|---|
| J-84 | `treeText.ts:19` `BRANCH_TEXT.core` | «Tu laboratorio» · «El centro del árbol. Aquí empieza cada noche.» | El centro es la Noche; «laboratorio» era la pestaña vieja. | «La noche» · «El centro del Árbol. Aquí avanza la noche.» / "The night" · "The heart of the Tree. The night moves on here." | [UNIFICAR] |
| J-85 | `treeText.ts:31-33` `NODE_TEXT.lab.desc` y `:206` `nightRule` | «La noche avanza: se abre un anillo nuevo del árbol.» · «…Abre anillos nuevos y da +10 % de Datos.» | «Anillo» choca con la forma «Anillo» y con los anillos del núcleo. | «La noche avanza: se abren mejoras nuevas.» · «La noche es gratis: llega jugando sesiones y encontrando especies. Abre mejoras nuevas y da +10 % de Datos.» / "The night moves on: new upgrades open." · "The night is free: it comes as you play sessions and find species. It opens new upgrades and gives +10% Data." | [REESCRIBIR] |
| J-86 | `src/ui/session/start.ts:113` | «Noche nueva» escrito a mano | El nodo se llama «Nueva noche». | Leer `nodeText('lab').name`. | [UNIFICAR] |
| J-87 | `treeText.ts:166` `TREE_UI.hint` | «Toca un nodo» | «Nodo». | «Toca una mejora» / "Tap an upgrade" | [REESCRIBIR] |
| J-88 | `treeText.ts:191` `ringStart` (+ `src/ui/tree/treeView.ts:689-700, 1076`) | casilla «3 · Anillo 1» | «Anillo». | «3 · precio de salida» / "3 · starting price" | [REESCRIBIR] |
| J-89 | `treeText.ts:182-184, 193-195` `priceRule`, `levelsBought` | «Empieza en 3 Datos y cada nivel cuesta ×2.» · «2 niveles comprados: ×2 cada uno» | «×2», «×1,5», «×3», «×1,1» son álgebra. | Palabras: ×2 «el doble», ×1,5 «la mitad más», ×3 «el triple», ×1,1 «un poquito más». «Empieza en 3 Datos; cada nivel cuesta el doble.» / "Starts at 3 Data; each level costs double." | [REESCRIBIR] |
| J-90 | `treeView.ts:689-700` caja del precio en la hoja | «[3 · Anillo 1] × [×4 · 2 niveles comprados: ×2 cada uno] = [12 Datos]» siempre visible | Mucha cuenta para comprar. | En la hoja: «Cuesta 12 Datos · cada nivel, el doble»; la ecuación, detrás de «¿Por qué este precio?» (ya existe la hoja `nodePriceExplain`). | [OCULTAR] |
| J-91 | `treeText.ts:111` `VALUE_TEXT.success` | «Prenden 24 %» / "24% take" | «Prender» no es de niños; %. | «Viven 24 de cada 100» / "24 in 100 live" (+ 10 puntitos). | [REESCRIBIR] |
| J-92 | `treeText.ts:114` `bigSeed` | «Semilla grande ×2,25» | ×2,25 es el área. | «Semilla grande (más del doble)» / "Big seed (more than double)" | [REESCRIBIR] |
| J-93 | `treeText.ts:118-120` `diameter`, `room`, `roomOnly` | «Placa Ø96» · «Sitio para 5 · Ø96» · «Sitio para 5» | «Ø» y 96 sin unidad. | «Sitio para 5 criaturas» / "Room for 5 creatures" (el tamaño se ve en la animación). | [REESCRIBIR] |
| J-94 | `treeText.ts:122` `mature` | «Maduran ×2» | «Madurar». | «Nacen ×2 más rápido» / "Hatch ×2 faster" | [REESCRIBIR] |
| J-95 | `treeText.ts:109` `sprint` | «Últimos 30 s ×1,5» | ×1,5 de qué. | «Últimos 30 s: Esencia ×1,5» / "Last 30 s: Essence ×1.5" | [REESCRIBIR] |
| J-96 | `treeText.ts:130` `pairs` | «Parejas ×1,5» | Choca con la forma «Pareja» (`identity.ts:311`). | «Especies amigas: Esencia ×1,5» / "Friend species: Essence ×1.5" | [REESCRIBIR] |
| J-97 | `treeText.ts:137-138` `seekNew`, `variants` | «Buscan formas nuevas» · «Copias con variantes» | «Formas» = especies; «variantes». | «Buscan especies que no tienes» · «Copias con sorpresa» / "Seek species you don’t have" · "Copies with surprises" | [REESCRIBIR] |
| J-98 | `treeText.ts:141` `species` | «5 especies posibles» | «Posibles». | «5 especies para encontrar» / "5 species to find" | [REESCRIBIR] |
| J-99 | `treeText.ts:216` `startHint` | «El reloj empieza con tu primera gota.» | La gota es el icono de la Esencia. | «El reloj empieza con tu primera semilla.» / "The clock starts with your first seed." | [UNIFICAR] |
| J-100 | `treeText.ts:235` `SESSION_UI.sparks` | «destellos sabios» | Nombre del nodo como unidad. | «destellos atrapados» / "sparks caught" | [REESCRIBIR] |
| J-101 | `treeText.ts:261` `previewNext` (HUD `src/ui/session/hud.ts:192`, resumen) | «Más tiempo: faltan 4» | Número sin unidad. | «Más tiempo: te faltan 4 Datos» / "More time: 4 more Data" | [REESCRIBIR] |
| J-102 | `treeView.ts:678-679` botón de la noche | «Aún no» (gris) | No dice cuánto falta. | «Aún no: faltan 2 sesiones» (desde `nightInfo`) / "Not yet: 2 sessions to go" | [REESCRIBIR] |
| J-103 | `treeText.ts:178` `nightLocked` | «Se abre en la Noche 3.» | No dice cómo llegar. | «Se abre en la Noche 3 (toca el centro cuando brille).» / "Opens on Night 3 (tap the centre when it glows)." | [REESCRIBIR] |
| J-104 | `treeText.ts:224` y `:39` | «¡Sprint!» · «Sprint final» | Anglicismo (P2). | «¡Recta final!» · «Recta final» / "Final stretch!" | [REESCRIBIR] |

Nombres de nodos poco infantiles (P2; los ids no cambian), `treeText.ts:44-94`:

| ID | Nodo | Actual | Propuesta es / en |
|---|---|---|---|
| J-105 | `stabilizer` | Estabilizador | Semillas fuertes / Strong seeds |
| J-106 | `freeSeeds` | Esporas de regalo | Semillas de regalo / Gift seeds |
| J-107 | `bigSeed`, `cheapSeeds` | Gota grande · Gotas baratas | Semilla grande · Semillas baratas / Big seed · Cheap seeds |
| J-108 | `ecosystem` · `nutrient` | Ecosistema · Nutriente | Placa variada · Comida extra / Mixed dish · Extra food |
| J-109 | `symbiosis` · `cataloguing` | Simbiosis · Catalogación | Amistad · Coleccionista / Friendship · Collector |
| J-110 | `mutations` · `rareSpores` | Mutaciones · Esporas curiosas | Copias sorpresa · Semillas curiosas / Surprise copies · Curious seeds |
| J-111 | `sparkMutagen` | Mutágeno potente | Semillas mágicas / Magic seeds |

Incubadora, Guardería, Nevera, Sembrador automático, Copiadora, Archivo, Microscopio, Cuaderno de campo y Gran
enciclopedia: bien.

### 1.5 Momentos

| ID | Dónde | Actual | Por qué confunde | Propuesta | Acción |
|---|---|---|---|---|---|
| J-112 | `catalog.ts:187-192` `seed` + `main.ts:105-108` `MOMENT_COPY.seed` | título «Sembraste materia» · breve «Materia sembrada» · «Cada toque pone materia. Espera: ¿se apaga, lo inunda o vive?» · «Siembra separado: si dos manchas se tocan, se funden sin forma.» | «Materia»; dos ideas en un evento. | título «¡Una semilla!» · breve «¡Semilla!» · «Cada toque pone una semilla de luz. ¿Vivirá?» · «Si se queda con forma, ¡es una criatura!» / "A seed!" · "Each tap drops a seed of light. Will it live?" · "If it keeps its shape, it is a creature!" («Separado» pasa a `explode` y al aviso `seedTooClose`.) | [REESCRIBIR] |
| J-113 | `illustrations.ts:333-337, 529-531` | «poca · justo · demasiada · Materia» · «Se apaga · Lo inunda · ¡Vive!» | «Materia». | «Luz: poca · justa · mucha» · «Se apaga · Se desborda · ¡Vive!» / "Light: too little · just right · too much" · "Fades · Overflows · Lives!" | [UNIFICAR] |
| J-114 | `catalog.ts:209-214` `dissolve` | título «Se disolvió» · «Muy poquita materia, o mal repartida: se apagó.» · «No pasa nada. Sembrar es barato: ¡prueba otra vez!» | «Disolver» es lo que VELA hace a la materia sin forma; «mal repartida». | título y breve «Se apagó» · «Era muy poquita y se apagó. ¡Pasa mucho!» · «Sembrar es barato: prueba en otro sitio.» / "It faded" · "It was too little and faded. That happens a lot!" · "Seeds are cheap: try another spot." | [REESCRIBIR] |
| J-115 | `catalog.ts:227-232` `explode` + `main.ts:109-112` | título y breve «¡Explotó!» · «Sembraste pegado o chocaron: se fundieron en materia sin forma.» · «La materia sin forma no da nada…» | El título dice «explotó» y el texto «se fundieron»; «explotar» asusta. | título «Materia sin forma» · breve «¡Sin forma!» · «Dos semillas se tocaron y se fundieron: ya no tienen forma.» · «Sin forma no da Esencia. La disuelvo para salvar la placa.» / "Shapeless matter" · "No shape!" · "Two seeds touched and melted together: no shape any more." · "No shape, no Essence. I dissolve it to save the dish." | [REESCRIBIR] |
| J-116 | `catalog.ts:248` `stable`, línea 2 | «Ni muy poca materia ni demasiada: justo lo necesario.» | «Materia». | «Ni poca luz ni demasiada: justo la que necesita.» / "Not too little light, not too much: just what it needs." | [UNIFICAR] |
| J-117 | `catalog.ts:270-271` `income` y `main.ts:113-116` | «Las criaturas estables fabrican Esencia, tu moneda.» · «Gasta tu Esencia en semillas y mejoras: más criaturas, más Esencia.» | Las mejoras ahora se pagan con Datos: enseña algo falso. | «Cada criatura con forma te da Esencia cada segundo.» · «Arriba: «+1/s» quiere decir 1 de Esencia cada segundo.» / "Every creature with a shape gives you Essence every second." · "Up top: “+1/s” means 1 Essence every second." | [REESCRIBIR] |
| J-118 | `catalog.ts:336-340` `secondSpecies`, chip | «Orbium unicaudatus y Scutium solidus» | Latín. | Nombres comunes: «Nadadora celeste y Escudo jade». | [REESCRIBIR] |
| J-119 | `catalog.ts:379-390` `golden` | línea 2 «Si la atrapas, te deja un regalo sorpresa.» · chip «12 s» | Número sin decir qué; el regalo ya no es sorpresa. | «Si la atrapas, te regala 30 segundos de tu Esencia.» · chip «Se va en 12 s» / "Catch it and it gives you 30 seconds of your Essence." · "Leaves in 12 s" | [REESCRIBIR] |
| J-120 | `catalog.ts:399-421` `upgrade` | foco `tab.lab` · «Las mejoras cambian cómo funciona tu laboratorio.» · «Mira el efecto: así estaba y así queda.» | La pestaña ya no existe. | foco `tree.node.<id>` · «Es tuya para siempre: nunca se pierde.» · «La próxima sesión ya lo vas a notar.» / "It is yours forever: it is never lost." · "You will feel it next session." | [REESCRIBIR] |
| J-121 | `catalog.ts:470-500` `seedPrice` | «¿Por qué cuesta más?» · «Cuantas más criaturas viven, más cuesta sembrar.» · «Con la placa llena, cada extra cuesta mucho más. ¡Mejora la Placa!» | Regla vieja que castiga crecer (`cycleBalance.ts`: los vivos ya no suben el precio). | título «¿Por qué sube?» · «Cada semilla que compras hoy cuesta un poquito más.» · «En la próxima sesión vuelve a costar lo de siempre.» / "Why does it rise?" · "Each seed you buy today costs a tiny bit more." · "Next session it costs the usual price again." Disparador: primer escalón `SEED_PRICE_STEP`. | [REESCRIBIR] |
| J-122 | `catalog.ts:534-554` `overgrown` | «Demasiada vida sin forma: deja de producir.» · «Límpiala y siembra con calma.» · breve «¡Placa desbordada! 0/s» | «Vida sin forma» contradice «materia sin forma»; «producir»; «0/s». | «Mucha materia sin forma: ya no da Esencia.» · «Límpiala gratis y siembra separado.» · breve «¡Placa desbordada! 0 Esencia/s» / "Lots of shapeless matter: no more Essence." · "Clean it for free and sow apart." | [REESCRIBIR] |
| J-123 | `catalog.ts:147` `BEHAVIOR_TEXT.pulsing.brief` | «¡Pulsante!» | «Pulsante». | «¡Late!» / "It pulses!" | [UNIFICAR] |

### 1.6 Historia (VELA, Albor, Comité)

| ID | Dónde | Actual | Por qué confunde | Propuesta | Acción |
|---|---|---|---|---|---|
| J-124 | `script.ts:138` `t_intro`, línea 3 | «Aquí siempre es de noche. La luz crece en la placa.» | Luego el juego dice «Nueva noche», «La noche avanza»: contradicción. | «Aquí la noche dura meses. La luz crece en la placa.» / "Here the night lasts months. Light grows in the dish." | [REESCRIBIR] |
| J-125 | `script.ts:153` `t_wait`, línea 3 | «No siembres encima: dos manchas juntas se estropean.» | «Manchas», «se estropean» es vago. | «Siembra separado: si dos se tocan, se funden.» / "Sow apart: if two touch, they melt together." | [REESCRIBIR] |
| J-126 | `script.ts:165` `t_fail` | «Oh… se deshizo. Era muy poquito.» | Sinónimo de «se apagó». | «Oh… se apagó. Era muy poquito.» / "Oh… it faded. Too little." | [UNIFICAR] |
| J-127 | `script.ts:214` `t_essence`, línea 5 | «Gástala en semillas y mejoras. Más criaturas, más Esencia.» | Las mejoras se pagan con Datos. | «Gástala en semillas. Más criaturas, más Esencia.» / "Spend it on seeds. More creatures, more Essence." | [REESCRIBIR] |
| J-128 | `script.ts:245-247` + `src/story/story.ts:358-363` (`{first}`, `{best}`) | «¡Especie nueva! Se llama Orbium unicaudatus.» | El Bestiario la llama «Nadadora celeste»: dos nombres para lo mismo. | `{first}`/`{best}` = nombre común: «¡Especie nueva! Se llama Nadadora celeste.»; la línea «La doctora Albor les ponía nombres en latín.» se queda (el latín se ve pequeño en la ficha). | [REESCRIBIR] |
| J-129 | `script.ts:64-72` `SEED_SPECIES` + `src/ui/story/strings.ts:35-36` `secretHint` + `encargoScript.ts:387-398` `seven` | «Especies semilla 5/7» · «Encuentra a las siete de la semilla.» | «Especies semilla» es jerga del GDD; y **Helicium solidus y Kronium dividuus no viven en ningún mundo**: final secreto y Encargo imposibles. | Renombrar «Las siete especies de Albor» y elegir siete que existan, una por mundo (p. ej. Orbium unicaudatus, Orbium unicaudatus ignis, Gyrorbium gyrans, Scutium solidus, Circium ventilans, Helicium cavus pedes, Hydrogeminium natans). Pedido «Encuentra las siete especies de Albor.» / "Find Albor’s seven species." · pista «Especies de Albor 5/7» / "Albor’s species 5/7". | [REESCRIBIR] P0 |

### 1.7 Encargos

| ID | Dónde | Actual | Por qué confunde | Propuesta | Acción |
|---|---|---|---|---|---|
| J-130 | `encargoScript.ts:161` `two` | «Ten 3 criaturas estables a la vez.» | «Estables». | «Ten 3 criaturas vivas a la vez.» / "Have 3 living creatures at once." | [UNIFICAR] |
| J-131 | `encargoScript.ts:171, 241, 281` `eps3`, `eps10`, `eps50` | «PRODUZCAN 3 ESENCIA/S. FIN.» · «EXIGIMOS 10 ESENCIA/S. FIN.» · «EXIGIMOS 50 ESENCIA/S ANTES DEL AMANECER. FIN.» | «/S». | «PRODUZCAN 3 ESENCIA POR SEGUNDO. FIN.» · «EXIGIMOS 10 ESENCIA POR SEGUNDO. FIN.» · «EXIGIMOS 50 ESENCIA POR SEGUNDO ANTES DEL AMANECER. FIN.» / "PRODUCE 3 ESSENCE PER SECOND. END." … | [REESCRIBIR] |
| J-132 | `encargoScript.ts:510` `s_rate` | «SUBAN LA PRODUCCIÓN A {n}/S. FIN.» | «Producción», «/S». | «SUBAN LA ESENCIA A {n} POR SEGUNDO. FIN.» / "RAISE ESSENCE TO {n} PER SECOND. END." | [REESCRIBIR] |
| J-133 | `encargoScript.ts:151, 201, 251, 291` `dropper`, `seeder`, `culture`, `dish` | «Compra el Gotero.» · «Compra el Sembrador automático.» · «Compra Cultivo.» · «Compra Placa I.» | No dicen dónde; «Placa I» (romano, mejora vieja). | «Compra el Gotero en el Árbol.» · «Compra el Sembrador automático en el Árbol.» · «Compra Cultivo en el Árbol.» · «Compra «Placa más grande» en el Árbol.» (CICLO §6) | [REESCRIBIR] |
| J-134 | `encargoScript.ts:132` `stable`, porqué | «Las que se quedan dan luz. Las otras se deshacen.» | «Luz» por Esencia; «se deshacen». | «Las que se quedan dan Esencia. Las otras se apagan.» / "The ones that stay give Essence. The others fade." | [UNIFICAR] |
| J-135 | `encargoScript.ts:152` `dropper`, porqué | «Con él, tus semillas prenden más a menudo.» | «Prender». | «Con él, viven más semillas.» / "With it, more of your seeds live." | [UNIFICAR] |
| J-136 | Barra de progreso (`src/story/encargos.ts:309-330`, `encargoUI.ts`) | «2,4/3» (Esencia/s) · «1:20/2:00» | Fracción decimal sin unidad. | «2,4 de 3 Esencia/s» · «1:20 de 2:00» / "2.4 of 3 Essence/s" · "1:20 of 2:00" | [REESCRIBIR] |

### 1.8 Logros y Bitácora

| ID | Dónde | Actual | Por qué confunde | Propuesta | Acción |
|---|---|---|---|---|---|
| J-137 | `content.ts:245-268` descripciones | «Consigue una criatura estable.» · «Registra 3/10/20 especies.» · «Observa una criatura pulsante / giratoria / divisora.» · «Alcanza 10/100/1 000 Esencia/s.» · «Ten 5/10 criaturas estables a la vez.» · «Registra una especie rara / muy rara.» · «Observa los 6 comportamientos.» | «Estable», «registra», «pulsante», «/s», «comportamientos». | «Consigue una criatura viva.» · «Descubre 3 especies.» · «Mira una criatura que late / que gira / que se divide.» · «Gana 10 Esencia por segundo.» · «Ten 5 criaturas vivas a la vez.» · «Descubre una especie rara.» · «Mira las 6 maneras de moverse.» (EN paralelo) | [UNIFICAR] |
| J-138 | `content.ts:269` `printer` | «Impresora» · «Imprime una especie.» | Imprimir. | «Copiona» · «Haz una copia con la Copiadora.» / "Copycat" · "Make a copy with the Copier." | [REESCRIBIR] |
| J-139 | `content.ts:274-275` `variant`, `symbiosis` | «Registra una variante mutada.» · «Forma una pareja simbiótica.» | Jerga. | «Encuentra una copia que salió distinta.» · «Junta dos especies amigas.» / "Find a copy that came out different." · "Put two friend species together." | [REESCRIBIR] |
| J-140 | `content.ts:249, 254, 256` nombres `species10`, `divider`, `allBehaviors` | «Taxónoma» · «Mitosis» · «Etóloga» | Biología adulta (P2). | «Coleccionista» · «Una se hace dos» · «Observadora» / "Collector" · "One becomes two" · "Watcher" | [REESCRIBIR] |
| J-141 | `content.ts:228` `JOURNAL.firstStable` | «…La llamo espécimen 1.» | «Espécimen». | «Algo se quedó. Tiene borde, tiene forma. Le pongo nombre.» / "Something stayed. It has an edge, it has a shape. I give it a name." | [REESCRIBIR] |
| J-142 | `content.ts:348` `variantSuffix` | « var.» («Nadadora celeste var.») | Abreviatura latina (P2). | « (sorpresa)» («Nadadora celeste (sorpresa)») / " (surprise)" | [REESCRIBIR] |
| J-143 | `src/secrets/data.ts:397` `oldFriend` flavor | «Ya no es un espécimen.» | La palabra desaparece del juego (P2). | «Ya no es un número.» / "No longer a number." | [REESCRIBIR] |

### 1.9 Secretos (además de J-24…J-27, J-55, J-56)

| ID | Dónde | Actual | Por qué confunde | Propuesta | Acción |
|---|---|---|---|---|---|
| J-144 | `data.ts:240-243` `maximizer` pistas | «Provoca muchas explosiones seguidas.» · «10 explosiones en menos de 2 minutos.» | «Explosión» ya no es el nombre (P2). | «Crea mucha materia sin forma seguida.» · «10 veces materia sin forma en menos de 2 minutos.» | [UNIFICAR] |
| J-145 | `data.ts:159, 314` nombres `cryptid`, `infinity` | «Criptozoología» · «Lemniscata» | Palabras difíciles (son secretos: P2). | «Bicho de medianoche» · «Infinito» / "Midnight critter" · "Infinity" | [REESCRIBIR] |
| J-146 | `data.ts:223` `answer`, pista 1 | «Cuenta tus gotas.» | La gota es la Esencia (P2). | «Cuenta tus semillas.» / "Count your seeds." | [UNIFICAR] |

### 1.10 Nombres de especies y de maneras de moverse

| ID | Dónde | Actual | Por qué confunde | Propuesta | Acción |
|---|---|---|---|---|---|
| J-147 | `content.ts:13-20` `BEHAVIOR_NAMES` + `i18n.ts:375-382` `BEHAVIOR` + `species-card.ts:125-133` | quieta · pulsante · nadadora · giratoria · divisora · colonia | Tres palabras para lo mismo («pulsante / late / latiente», «giratoria / gira», «divisora / se divide / Mitosis»). | quieta · late · nadadora · gira · se divide · colonia / still · pulses · swimmer · spins · splits · colony. Plurales: quietas · las que laten · nadadoras · las que giran · las que se dividen · colonias. | [UNIFICAR] |
| J-148 | `species-card.ts:244-245, 382-383` | título y frase de comparación en latín («Orbium unicaudatus nada (×1,73) y Scutium solidus se queda quieta (×1).») | El resto del juego usa el nombre común. | Título = nombre común, latín en `<small>`; frase «Nadadora celeste nada (×1,7) y Escudo jade se queda quieta (×1).» | [REESCRIBIR] |
| J-149 | `ui.ts:1654` tarjeta de criatura | Sin `scientificName`, el título es `catalogName` (latín). | Ídem. | Siempre nombre común (o «Aún sin nombre»). | [REESCRIBIR] |
| J-150 | `src/game/game.ts:444` `speciesName` | Si falta `common` (partidas viejas): `catalogName ?? latin ?? «Criatura N»`. | Latín como nombre. | Calcular `common` al migrar (`src/game/legacy.ts`). | [REESCRIBIR] (código) |
| J-151 | `src/species/identity.ts:315` `SHAPE_NOUNS.spindle` | «Huso» / "spindle" | Un niño no lo conoce (P2). | «Hoja» / "leaf" | [REESCRIBIR] |
| J-152 | `identity.ts:335` `BEHAVIOR_ADJ.pulsing` | «latiente» | Palabra rara (P2). | Desempate con «que late» al final: «Trébol rosado que late». | [REESCRIBIR] |
| J-153 | `identity.ts:341` `ROMAN` | «Nadadora celeste II» | Números romanos (P2). | «Nadadora celeste 2» | [REESCRIBIR] |
| J-154 | `species-card.ts:162, 169` `GENUS_SHAPE` | «hélice» · «corona» | «Hélice» no es de niños; Kronium («corona») ya no vive en ningún mundo (P2). | «molinillo» / "pinwheel"; «corona» se queda para el futuro. | [REESCRIBIR] |

### 1.11 Ajustes, ranking, tienda

| ID | Dónde | Actual | Por qué confunde | Propuesta | Acción |
|---|---|---|---|---|---|
| J-155 | `i18n.ts:244-245` `analytics`, `analyticsHint` | «Analítica anónima» · «Datos agregados para equilibrar el juego. Sin datos personales.» | «Datos» ahora es la moneda. | «Estadísticas anónimas» · «Cifras del juego, sin nada tuyo, para equilibrarlo.» / "Anonymous stats" · "Game numbers, nothing about you, to balance it." | [REESCRIBIR] |
| J-156 | `i18n.ts:272` `creditsKeys` | «Teclado: 1–4 pestañas · Espacio pausa…» | Ya no hay 4 pestañas. | «Teclado: Espacio pausa · E borrar · J bitácora · M silencio · rueda zoom · clic derecho borra.» | [REESCRIBIR] |
| J-157 | `i18n.ts:213` `oneTouchHint` | «El toque largo pasa a ser doble toque y se desactiva el pincel.» | Pincel retirado. | «El toque largo pasa a ser doble toque.» / "Long press becomes double tap." | [REESCRIBIR] |
| J-158 | `i18n.ts:208` `muted` | «Silencio» (interruptor) | Ambiguo (QA2 §5.5; P2). | «Sin sonido» / "Sound off" | [REESCRIBIR] |
| J-159 | `i18n.ts:249` `saveData` | «Partida» | QA2 §5.5 (P2). | «Tu partida guardada» / "Your saved game" | [REESCRIBIR] |

### 1.12 Textos que faltan (el ciclo nuevo los necesita y no existen)

| ID | Dónde irían | Propuesta es / en |
|---|---|---|
| J-160 | Toque rechazado por placa llena (`seedBlocked` con motivo `full`; el integrador acaba de añadir `TEXT.dishFull`, ver J-175) | «¡Placa llena! Caben {n}. Más sitio en el Árbol.» / "Dish full! Room for {n}. More room in the Tree." + parpadea el círculo de cada criatura. |
| J-161 | Toque rechazado por falta de Esencia (`seedDenied`) | «Te faltan 2 de Esencia: espera a tus criaturas.» / "You need 2 more Essence: wait for your creatures." |
| J-162 | Menú de pausa «Terminar ahora» (CICLO §2.4) + confirmación | «Terminar ahora» · «¿Terminar ya? Te llevas 22 Datos.» / "End now" · "End now? You take 22 Data." |
| J-163 | Abono (`src/game/session.ts`; el nombre ya existe: `TEXT.boost` «Abono» / "Fertiliser") | descripción «Todo da Esencia ×1,25 hasta el final de la sesión.» · precio «Cuesta 20 s de tu Esencia; el siguiente de hoy, el doble.» / "Everything gives Essence ×1.25 until the session ends." · "Costs 20 s of your Essence; the next one today costs double." |
| J-164 | Cuando todas las criaturas se apagan y pasan 8 s sin tocar (QA2 §5b) | Vuelve el dedo animado: «¡Toca aquí otra vez!» / "Tap here again!" |
| J-165 | Fila de especies del resumen | «¡Nueva! · guardada en el Bestiario» / "New! · kept in the Bestiary" |
| J-166 | Debajo del total de Datos del resumen | «Los Datos no se pierden nunca.» / "Data is never lost." |
| J-167 | Línea de VELA en la tarjeta de inicio (primera vez) | «Esto te regala el Árbol hoy. ¡Y tienes un encargo!» / "This is the Tree’s gift today. And you have a request!" |
| J-168 | Pista fija en la hoja de un nodo (primera vez) | «Gris es ahora. Verde es lo que tendrás.» / "Grey is now. Green is what you will get." |
| J-169 | Pista en el selector de mundos (primera vez con dos) | «Toca un mundo para jugar allí.» / "Tap a world to play there." |
| J-170 | Chip bajo el reloj al alargarlo (`hud.ts:151` ya pone «+5 s especie») | etiqueta breve la primera vez: «¡Especie nueva: +5 segundos!» / "New species: +5 seconds!" |

### 1.13 Textos nuevos del ciclo añadidos durante la auditoría (`src/game/content.ts`, árbol de trabajo)

| ID | Dónde | Actual | Por qué confunde | Propuesta | Acción |
|---|---|---|---|---|---|
| J-171 | `SESSION_OBJECTIVE_TEXT.calib`, `culture`, `dropper`, `extinct` | «…en el árbol» / "…in the tree" | «Árbol» es nombre propio del glosario y en todo el juego va con mayúscula. | «…en el Árbol» / "…in the Tree" | [UNIFICAR] |
| J-172 | `SESSION_OBJECTIVE_TEXT.dish` | «Compra Placa más grande» | No dice dónde. | «Compra «Placa más grande» en el Árbol» / "Buy “Bigger dish” in the Tree" | [REESCRIBIR] |
| J-173 | `SESSION_OBJECTIVE_TEXT.era100k` | «Gana 10 000 Esencia en esta noche» / "…this night" | «Esta noche» se lee como «hoy por la noche». | «Gana 10 000 Esencia antes de la próxima Noche» / "Earn 10,000 Essence before the next Night" | [REESCRIBIR] |
| J-174 | `TEXT.sparkSure` | «…y tu próxima semilla prenderá seguro» | «Prender». | «…y tu próxima semilla vivirá seguro» / "…and your next seed will surely live" | [UNIFICAR] |
| J-175 | `TEXT.dishFull` | «Placa llena: mejora la Placa para más sitio.» / "…upgrade the Dish…" | ¿Qué mejora? En el Árbol hay «Placa más grande» y «Más sitio», ninguna se llama «la Placa»; sin número. | J-160: «¡Placa llena! Caben {n}. Más sitio en el Árbol.» / "Dish full! Room for {n}. More room in the Tree." | [REESCRIBIR] |
| J-176 | `TEXT.boostBought` | «¡Abono! Tus criaturas dan ×1,25 el resto de la sesión» | ×1,25 de qué. | «¡Abono! Tus criaturas dan Esencia ×1,25 hasta el final de la sesión.» / "Fertiliser! Your creatures give Essence ×1.25 until the session ends." | [REESCRIBIR] |
| J-177 | `TEXT.nightReady` | «¡La noche 2 está lista! Ábrela en el centro del árbol.» | Minúsculas (Noche, Árbol); y la primera vez coincide con la escena `a1_night`: dos avisos para un evento. | «¡La Noche 2 está lista! Ábrela en el centro del Árbol.»; el toast solo cuando la escena ya se vio (noches 3+). | [UNIFICAR] |
| J-178 | `TEXT.multEcosystem`, `TEXT.multSprint` | «Ecosistema», «Sprint final» | Siguen los nombres de nodo (J-108, J-104; P2). | Lo que se decida en J-104/J-108. | [UNIFICAR] |
| J-179 | `TEXT.sparkGift` | «El Destello te regala 30 s de tu Esencia: +120» | Bien: el número dice qué es. | Modelo a seguir para los demás regalos. | — |
| J-180 | `TEXT.printOtherWorld` | «Esta especie vive en el Mundo 2: cópiala allí.» | Bien. | Reutilizar en la ficha de especie (J-10). | — |

---

## 2. Glosario

### 2.1 Las únicas palabras que el jugador necesita

Una línea que entiende un niño de 5 años, el icono que ya existe (id en `src/ui/icons.ts`, `src/ui/tree/icons.ts` o
`src/ui/moments/icons.ts`), cómo lo dice VELA y en qué paso de la ruta (§3) se enseña.

| Palabra | Icono | Para un niño | Así lo dice VELA | Paso |
|---|---|---|---|---|
| **Esencia** | `essence` (gota azul) | La luz que dan tus criaturas. Con ella compras semillas. | «Cada criatura con forma te da Esencia cada segundo.» | 4 |
| **Datos** | `datos` | Lo que aprendes en cada sesión. Compra mejoras que son tuyas para siempre. | «¡Primera sesión! Tu Esencia se volvió Datos.» | 10 |
| **semilla** (sembrar) | `seed` (QA2 H-18: parece un caracol; mejor un brote) y el gesto `hand` | Lo que pones al tocar la placa. A veces se convierte en criatura. | «Cada toque pone una semilla de luz. ¿Vivirá?» | 2 |
| **criatura** | su retrato (genérico `species`) | Una semilla que se quedó con forma. Vive y da Esencia. | «Tiene borde. Tiene forma. ¡Se queda!» | 3 |
| **especie** | `bestiary` | Una clase de criatura. Las de una especie se parecen y se llaman igual. | «¡Especie nueva! Se llama Nadadora celeste.» | 18 |
| **forma** | insignia de forma («disco con cola», `shapeLabel`) | El dibujo de una criatura. Más forma, más Esencia. | «Si se queda con forma, ¡es una criatura!» | 2-3 |
| **manera de moverse** | `behavior` | Cómo vive una criatura en la placa. Cada manera da distinta Esencia. | «¡Una nadadora! Se desliza sin parar.» | 17 |
| · nadadora | `swimmer` | Se desliza siempre hacia delante. | | 17 |
| · gira | `spinner` | Da vueltas casi sin salir de su sitio. | | 23 |
| · late | `pulsing` | Crece y encoge, como un corazón. | | 23 |
| · se divide | `divider` | Se parte en dos criaturas. | | 23 |
| · quieta | `still` | No se mueve de su sitio. | | 23 |
| · colonia | `colony` | Tres o más iguales, muy juntas: ganan más en equipo. | | 23 |
| **materia sin forma** | `burst` (naranja) | Semillas que se fundieron y perdieron la forma. No da nada; VELA la disuelve. | «Sin forma no da Esencia. La disuelvo para salvar la placa.» | 7 |
| **placa** | `dish` | El plato de cristal donde nacen las criaturas. | «La luz crece en la placa.» | 1 |
| **Mundo** | `world` | Un sitio con sus propias reglas, donde nacen otras especies. | «¡Un mundo nuevo! Otras reglas, otras criaturas.» | 19 |
| **Noche** | `moon` | Un capítulo de la historia. Al avanzar se abren mejoras nuevas. Es gratis. | «¡La noche puede avanzar!» | 22 |
| **Destello** | `spark` (dorado) | Una chispa dorada que pasa volando. Si la tocas, te regala Esencia. | «¡Ahí! ¡Un Destello! ¡Tócalo, rápido!» | 16 |
| **Encargo** | `encargo` | Un favor que te piden VELA, Albor o el Comité. Si lo cumples, hay premio. | «¿Me ayudas? Su luz enciende la calefacción. ¡Brrr!» | 15 |
| **Bestiario** | `bestiary` (QA2: un álbum con huella se entiende mejor) | Tu álbum de especies. Lo que guardas aquí nunca se pierde. | «…Mira tu Bestiario.» | 18 |
| **Árbol** | `tree` | Donde gastas Datos en mejoras que son tuyas para siempre. | «Esto es el Árbol. Aquí gastas tus Datos.» | 11 |
| sesión · reloj | `clockIcon` | Tu tiempo de laboratorio. Al llegar a 0:00 se cuenta lo que ganaste. | «Este reloj es tu tiempo de laboratorio.» | 8 |
| mejora | icono del nodo | Algo que compras en el Árbol. Siempre te deja mejor. | «Es tuya para siempre: nunca se pierde.» | 13 |
| Gotero | `dropper` | La herramienta que pone semillas. Mejor Gotero, más semillas viven. | | 13+ |
| Nevera | `fridge`, `snow` | Tus mejores criaturas esperan en frío y salen al empezar. | | 23 |
| Copiadora | `print` | Hace una copia de una especie de tu Bestiario. | | 23 |
| Abono | **falta icono** (propuesta: un brote) | Comida para la placa: todo da más Esencia hasta que acabe la sesión. | | 23 |
| Bitácora | `journal` | Tu diario: VELA y tú apuntan lo que pasa. | | 23 |

### 2.2 Sinónimos que se retiran

| # | Palabra del glosario | Se retira | Dónde aparece hoy |
|---|---|---|---|
| U-01 | **semilla** / sembrar | gota, espora, materia, siembra (como sustantivo), mancha, impresión | `startHint` «primera gota»; nodos Gota grande, Gotas baratas, Esporas de regalo, Esporas curiosas; «lluvia de esporas» (`content.ts:321`, `strings.ts:59`, `seed-price.ts:50`); logro «Primera gota»; pista «Cuenta tus gotas»; Momento «Sembraste materia»; «pincel de materia», «borrar materia»; «dos manchas» (`t_wait`, `t_explode`, lisis). **La gota es el icono de la Esencia**: usarla para semillas confunde las dos monedas. |
| U-02 | **Esencia** | producción, luz (en pedidos y premios), moneda, rinde | `UPGRADE_TEXT.dish`, «×7 producción», `multGlobal`, `multParts`, `s_rate`, `overgrownText`; encargos «dan luz», «más luz»; `cmpMore` «rinde más» → «da más Esencia». «Luz» se queda solo en frases de historia sin número. |
| U-03 | **Datos** | Muestras, Genoma, «puntos», «datos» en Ajustes | §1.2; `genomeBonus`; `analyticsHint`. |
| U-04 | **criatura** (en la placa) / **especie** (en el Bestiario) | espécimen, «Sin registrar», registrar, registrada, fauna | `firstStable`, `oldFriend`, `unknownCreature`, `registered`, logros «Registra…», `move` «otra fauna», `introCalibrate`. |
| U-05 | **materia sin forma** | explotó, explosión, «vida sin forma» | `STATE.exploded`, Momento `explode`, `overgrown` línea 1, secreto `maximizer`. «Laberinto» solo para la placa desbordada. |
| U-06 | **se apagó** (semilla que no vivió) | se disolvió, se deshizo, se deshacen, se disuelve, Muerta, murió | Momento `dissolve`, `t_fail`, encargo `stable`, `STATE.dead`, `stDead`, `rsDied*`. **«Disolver» queda reservado a lo que VELA hace con la materia sin forma.** |
| U-07 | **Noche** | Era, Extinción, prestigio, «esta noche» como «en esta sesión», «Noche nueva» vs «Nueva noche» | `era`, `statEra`, `boardEra`, `birthday`, `era100k`, `start.ts:113`; `t_intro` «Aquí siempre es de noche». |
| U-08 | **Árbol** / **mejora** | Laboratorio (pestaña), Genoma (árbol), nodo, anillo (del árbol), «Tu laboratorio» (el centro) | `tabLab`, `t_lab`, `TREE_UI.hint`, encargo `genome`, `ringStart`, `nightRule`, `BRANCH_TEXT.core`. «Laboratorio» queda para la Estación (historia, «tiempo de laboratorio»). |
| U-09 | **manera de moverse** | comportamiento, estilo, «formas de moverse», Afinidad, pulsante, giratoria, divisora, latiente, Mitosis | `newBehavior`, `behaviorGuide`, `bhGuide`, `multBehaviors`, logros, `behaviors2`, `affinityStepText`, `BEHAVIOR_NAMES`, `BEHAVIOR_ADJ`. |
| U-10 | **Destello** | «destellos sabios» (como unidad), Floración, Mutágeno, glint | `SESSION_UI.sparks`, `content.ts:318-322`, nodo `sparkMutagen`. «Chispa dorada» solo en la primera explicación. |
| U-11 | **Encargo** | Objetivo, Objective | `objective`, `objectiveDone`, `TEXT.objectiveDone`. En inglés «request» (ya en `encargoUI.ts`). |
| U-12 | **Bestiario** | catálogo, Catalogación (nodo), Registradas | `cataloguing`, `registered`. «Colección» se queda solo como nombre del bonus. |
| U-13 | **placa** | Placa I/II (romanos), Ø96, toro, grilla | encargo `dish`, `VALUE_TEXT.diameter/room`, secreto `infinity`. |
| U-14 | **Mundo** | reglas (solas), régimen, receta, calibración, «Hélices» | §1.1. |
| U-15 | **copia** / hacer una copia | imprimir, impresión, «Plantar otra» | `printMode`, `plantAnother`, `freePrintReady`, encargos `print` y `s_print`, logro `printer`, guía `colony`. |
| U-16 | **sesión** | turno, Era como unidad de tiempo, «esta noche» | `era100k`, `statEraEssence`. |

---

## 3. Ruta de aprendizaje: los primeros ~15 minutos del ciclo nuevo

### 3.1 Reglas

1. **Un concepto cada vez; nunca dos avisos para un evento.** Lo que pasa en la placa lo explica un **Momento** (la
   tarjeta *es* VELA); lo que es de pantalla (Árbol, tarjeta de inicio, Noche) lo explica una **escena** de VELA; un
   favor con premio es un **Encargo**. Una cosa por evento: si hay tarjeta, no hay toast.
2. **Primero se ve, luego se dice.** La tarjeta se abre con retardo (`delayMs`) para que el jugador vea el suceso; los
   avisos de rechazo dibujan antes el motivo (el círculo del sitio de una criatura, la placa llena).
3. **Cada número dice qué es**: «+1/s» se nombra una vez («1 de Esencia cada segundo»); los precios llevan «Datos» o
   «Esencia»; los tiempos, «s»; los progresos, «2 de 3».
4. **La historia y el tutorial son lo mismo**: VELA presenta la Estación Vigilia, la doctora Albor aparece como gancho
   (Destello, Bestiario) y la primera Noche trae la primera decisión (la lámpara). Las cintas de Albor llegan en la Noche 2.

Duración: la sesión base dura **2:00** en el código (`SESSION_BASE_SECONDS = 120`; CICLO §2.2 decía 3:00) + 5 s por
especie nueva; resumen y Árbol ≈ 1 min; cada vuelta ≈ 3-4 min, así que 15 min ≈ sesiones 1-4 y la primera Noche.

### 3.2 La ruta

| # | Min. | Concepto | Cuándo | Mecanismo | Líneas (es / en) | Lo que se ve | Historia |
|---|---|---|---|---|---|---|---|
| 1 | 0:00 | Tocar para sembrar | Primer arranque, 0 semillas (en la sesión 1 no hay tarjeta de inicio) | Escena `t_intro` (existe; cambia la línea 3, J-124) + tarea `seeds` | «¡Oh! ¡Hola, hola! Esto es la Estación Vigilia.» · «Soy VELA. Es un acrónimo. Nadie sabe de qué.» · «Aquí la noche dura meses. La luz crece en la placa.» · «¡Toca la placa! A ver qué pasa.» / "…Here the night lasts months. Light grows in the dish." | Foco en la placa, dedo animado + anillos (`dish-hint`, QA2 H-03); el reloj gris «2:00 · Siembra para empezar» se ve pero aún no se explica. | VELA, la Estación, la noche polar. |
| 2 | 0:05 | Esperar mientras nace | Primer `seed` manual | Momento `seed` (J-112; consume `t_wait`) | «Cada toque pone una semilla de luz. ¿Vivirá?» · «Si se queda con forma, ¡es una criatura!» / "Each tap drops a seed of light. Will it live?" · "If it keeps its shape, it is a creature!" | Zoom ×2,4; píldora «Naciendo 62 %» con anillo que se llena; chip «Gratis» (la primera semilla es segura). El reloj empieza a correr al cerrar la tarjeta. | |
| 3 | 0:10 | Criatura | Primer `creatureStable` | Momento `stable` (J-116; consume `t_stable`) | «Esta forma se mantiene sola: ¡es una criatura!» · «Ni poca luz ni demasiada: justo la que necesita.» | Aro verde; píldora «Viva». | VELA asombrada. |
| 4 | 0:13 | Esencia cada segundo (y qué es «+1/s») | Primer `income` | Momento `income` (J-117; consume `t_essence`) | «Cada criatura con forma te da Esencia cada segundo.» · «Arriba: «+1/s» quiere decir 1 de Esencia cada segundo.» | Gotas que vuelan de la criatura al contador; foco en el contador; chip «+1 Esencia/s». | |
| 5 | 0:20-0:40 | No todas viven | Primer `creatureDied` | Momento `dissolve` (J-114; consume `t_fail`) | «Era muy poquita y se apagó. ¡Pasa mucho!» · «Sembrar es barato: prueba en otro sitio.» | La semilla se desvanece; medidor de luz en «poca»; chip «0 Esencia/s». | |
| 6 | al tocar cerca | Sembrar separado | Primer `seedBlocked` con motivo `tooClose` | Etiqueta breve junto al dedo (sin pausa) | «Muy cerca: se fundirían. ¡Más lejos!» / "Too close: they would melt. Further away!" | **Antes** de la frase: círculo punteado alrededor de la criatura (su sitio) y una X suave. | |
| 7 | si pasa | Materia sin forma | Primer `creatureExploded` o primera lisis | Momento `explode` (J-115; consume `t_explode`); el toast de lisis (J-71) solo las veces siguientes | «Dos semillas se tocaron y se fundieron: ya no tienen forma.» · «Sin forma no da Esencia. La disuelvo para salvar la placa.» | Mancha naranja que crece → «puf» de VELA; chip «0 Esencia/s». | VELA cuida la placa. |
| 8 | 1:00 restante | El reloj y el fin de la sesión | El reloj cruza 60 s en la sesión 1 (banner «¡Último minuto!») | **Momento nuevo `clock`** | Título «Tu tiempo de laboratorio» · «Este reloj es tu tiempo de laboratorio. Queda un minuto.» · «Al llegar a 0:00, tu Esencia se cuenta. ¡No pierdes nada!» / "Your lab time" · "This clock is your lab time. One minute left." · "At 0:00 your Essence is counted. You lose nothing!" | Foco en la píldora del reloj; el dial da una vuelta rápida. | El turno de laboratorio. |
| 9 | 0:10 → 0:00 | (sin texto) | Últimos 10 s | UI | — | Cifras que rebotan, `tick`; sello «¡TIEMPO!» 1,6 s sobre la placa congelada. | |
| 10 | ~2:15 | Esencia → Datos (y qué se queda) | Primer `sessionEnd` | Línea de VELA del resumen (`VELA_LINES.first` reescrita) + J-165, J-166 | «¡Primera sesión! Tu Esencia se volvió Datos. Ahora, al Árbol.» / "First session! Your Essence became Data. Now, to the Tree." | Gotas que vuelan del total de Esencia a la casilla de Datos; filas una a una («3 474 Esencia ÷ 250 = 13 Datos»); bajo el total «Los Datos no se pierden nunca»; especie «¡Nueva! · guardada en el Bestiario». | VELA lo anota. |
| 11 | ~3:00 | Comprar en el Árbol | Primera vez en el Árbol con Datos ≥ 3 | **Escena nueva `t_tree`** (sustituye `t_lab`) + tarea «Compra una mejora.» | «Esto es el Árbol. Aquí gastas tus Datos.» · «¡Ese late en verde! Lo puedes comprar. Tócalo.» / "This is the Tree. You spend your Data here." · "That one glows green! You can buy it. Tap it." | Foco en los nodos verdes; el resto atenuado; Datos grandes arriba. | |
| 12 | ~3:10 | Antes → después | Primera hoja de nodo abierta | Pista fija en la hoja (J-168), sin pausa | «Gris es ahora. Verde es lo que tendrás.» | «AHORA → CON UN NIVEL MÁS» con flecha animada gris → verde; precio «Cuesta 3 Datos» (la cuenta, detrás de «¿Por qué este precio?», J-90). | |
| 13 | ~3:20 | Una mejora es para siempre | Primera compra | Pista en la hoja del nodo, en el sitio de la de J-168 (J-120; el Momento `upgrade` esperaba a que se cerrara el Árbol y salía al empezar la sesión siguiente, con los niveles del Laboratorio: en sesiones ya no se abre) | «¡Es tuya para siempre! La notarás en la próxima sesión.» | Anillo de partículas del color de la ruta; «1/3» flota; Datos «−3 · Más tiempo» con flecha abajo. | |
| 14 | ~4:00 | Lo que regala el Árbol | Primera tarjeta de inicio (sesión 2) | Línea de VELA en la tarjeta (J-167) | «Esto te regala el Árbol hoy. ¡Y tienes un encargo!» | Regalos que entran uno a uno (Esencia de inicio, semilla gratis); el encargo con retrato; «El reloj empieza con tu primera semilla» (J-99). | |
| 15 | ~4:20 | Encargo = favor + premio | Oferta de `two` (la calefacción), sesión 2 | Burbuja de Encargo | Pedido «Ten 3 criaturas vivas a la vez.» · porqué «¿Me ayudas? Su luz enciende la calefacción. ¡Brrr!» · gracias «¡Calorcito! Y me tejí una bufanda.» | Chips de premio que saltan uno a uno: Esencia · «+5 s» · «+2 Datos» · bufanda; barra «1 de 3 → 3 de 3». | La Estación tiene frío: VELA estrena bufanda. |
| 16 | ~4:40 | Destello | Primer `goldenSpawn` (**no en la sesión 1**, F-08) | Momento `golden` (J-119; consume `t_golden`) y luego escena `t_golden_caught` | «Una chispa dorada cruza la placa. ¡Tócala rápido!» · «Si la atrapas, te regala 30 segundos de tu Esencia.» → «¡Bien! Siempre deja un regalo.» · «Aparecen desde que ella se fue. Qué raro.» | Foco en la chispa, dedo, chip «Se va en 12 s». | Primer gancho de Albor. |
| 17 | ~5:00 | Maneras de moverse | Primer `behaviorNew` con tarjeta (en la sesión 1 solo etiqueta) | Momento `behavior.swimmer` | «Se desliza por la placa sin parar, siempre hacia delante.» + fila «Nadadora: ×1,6 Esencia, comparada con una quieta ×1» | Recorrido real con estela; botón «Maneras de moverse» (guía). | |
| 18 | ~6:30 | Especie y Bestiario | Tras el resumen de la sesión 2: Encargo `look` + escena `t_bestiary` (condición nueva: sesiones ≥ 1) | Encargo + escena | Pedido «Mira tu criatura en el Bestiario.» → «¡Especie nueva! Se llama Nadadora celeste.» · «La doctora Albor les ponía nombres en latín.» · «Trabajaba aquí antes. Se fue. …Mira tu Bestiario.» | El botón del Bestiario brilla; ficha con retrato, nombre común y el latín pequeño. | Segundo gancho de Albor. |
| 19 | ~7:00 | Mundos | Primer nodo de mundo comprado (`worldCold`, 3 Datos) | **Escena nueva `t_world`** (sustituye `t_calibrate`) | «¡Un mundo nuevo! Otras reglas, otras criaturas.» · «Te lo dejo elegido para la próxima sesión.» / "A new world! Other rules, other creatures." · "I picked it for your next session." | Tarjeta del mundo con 3 siluetas «?»; nodo violeta. | |
| 20 | ~7:30 | Elegir mundo | Tarjeta de inicio con dos mundos | Pista en el selector (J-169) + Encargo `move` (J-15) | «Toca un mundo para jugar allí.» · pedido «Juega una sesión en el Mundo 2.» | El mundo nuevo con «¡Nuevo!» y ya elegido. | |
| 21 | ~8:30 | Descubrir alarga el reloj | Primera especie nueva con el reloj corriendo | Chip bajo el reloj + etiqueta breve (J-170) | «¡Especie nueva: +5 segundos!» | El dial retrocede un poco; chip verde «+5 s · especie». | |
| 22 | ~14-16 | Noche | `nightReady` (4 sesiones y 2 especies) | Escena `a1_night` (J-43) + elección de la lámpara | «¡La noche puede avanzar! Mira el centro del Árbol.» · «No se borra nada. Se abren mejoras nuevas.» · «Albor dejaba la lámpara encendida. «Para que no se vayan a oscuras».» | El centro late en dorado; barras «Sesiones 4 de 4 · Especies 2 de 2»; al pulsar, el ritual de la lámpara; la niebla se levanta del anillo 3; en el resumen siguiente aparece la fila «Noche 2 · ×1,1 Datos». | Primera decisión de la historia. |
| 23 | > 15 | Nevera, Copiadora, Abono, gira / late / se divide / quieta / colonia, el Comité | Primera compra de cada nodo; primera vez de cada manera de moverse; `a1_committee` | Momento `upgrade` con su «antes → después»; Momentos `behavior.*`; escena del télex | (las existentes, con J-147 y J-163) | | El Comité paga la luz. |

### 3.3 Choques de la sesión 1 y cómo se ordenan

| Evento | Hoy | Propuesta |
|---|---|---|
| `t_intro` + Encargo `seed` («Siembra algo en la placa.») | Dos pedidos para el mismo toque. | En la sesión 1 no hay Encargos a la vista; `seed` y `stable` se cumplen en silencio; el primer Encargo visible es `two` en la sesión 2 (paso 15). |
| `creatureStable` + `income` + `speciesNew` + `behaviorNew` (0:10-0:40) | 4 tarjetas con pausa + toasts. | En la sesión 1, tarjeta solo para `seed`, `stable`, `income`, `dissolve`/`explode` y `clock`; `species`, `secondSpecies` y `behavior.*` salen como etiqueta breve (modo `brief` forzado) y su tarjeta completa llega la primera vez en la sesión 2. |
| `behaviorNew` | Toast de `game.ts:908` + toast de `ui.ts:1890` + etiqueta + tarjeta. | Una sola cosa: la tarjeta (o la etiqueta en modo breve). Borrar los dos toasts. |
| `speciesNew` | Ráfaga + toast agrupado + tarjeta. | Ráfaga + tarjeta; el toast solo si las explicaciones están en «Ninguna». |
| Primer Destello a los 25-50 s (`SESSION_GOLDEN_FIRST_DELAY`) | Cae justo entre ¡VIDA! y Esencia. | No en la sesión 1; desde la sesión 2, a los 25-50 s. (Regla de aparición, no número: el número se queda en `cycleBalance.ts`.) |
| Píldora «+22 Datos al terminar» del HUD | Aparece antes de saber qué es un Dato. | Oculta en la sesión 1; visible desde la sesión 2. |
| `t_bestiary` (especie + Albor) | En la sesión 1, encima de la tarjeta de especie. | Después del resumen de la sesión 1 (paso 18). |

### 3.4 Lo que la ruta necesita y no existe

Momento `clock` (`src/moments/catalog.ts`); escenas `t_tree`, `t_world`, `a1_night` (`src/story/script.ts`); la regla
«sesión 1 = Momentos de especie y comportamiento en breve» (`src/moments/moments.ts` o `main.ts`); focos `hud.clock`,
`hud.datos`, `tree.node.<id>`, `start.world` (`ui.targetRect`); `VELA_LINES.first` reescrita; las pistas fijas J-165…J-170;
la condición «sesiones ≥ 1» en `t_bestiary`; Encargos ocultos en la sesión 1.

---

## 4. Diversión e incremental: dónde el jugador se siente castigado o perdido

| ID | Dónde | Qué siente | Por qué | Arreglo | Prioridad |
|---|---|---|---|---|---|
| F-01 | Precio de la semilla: textos viejos (J-121, B-13, B-14, J-69) | «Me castigan por crecer»; «¿me alegro de que muera una?» | La regla nueva ya no sube el precio por criaturas vivas, pero los textos siguen enseñándolo. | Borrar y reescribir como en J-121: el único aumento es «cada semilla que compras hoy, un poquito más», con flecha y motivo. | P0 |
| F-02 | Toque rechazado con la placa llena (`DISH_CAPACITY`) | Tocar y que no pase nada. | El rechazo no dice por qué. | J-160: «¡Placa llena! Caben 5. Más sitio en el Árbol.» y el círculo de cada criatura parpadea. | P0 |
| F-03 | Sesión 1 sin Gotero: viven 24 de cada 100 semillas (`SEED_SUCCESS`) | Tres de cada cuatro toques «fallan». | Aprender que falla es bueno, pero tantas veces seguidas frustra a un niño. | Primera semilla segura (existe) + semilla segura a los 45 s (existe) + **el Gotero es el primer nodo verde que señala VELA** (paso 11). Propuesta para el Balancer (con bot antes/después): en la sesión 1, una semilla que se apaga devuelve su Esencia («¡Te devuelvo la Esencia!»). | P1 |
| F-04 | Fin de sesión: la Esencia vuelve a 20 | «Me quitaron todo.» | Sin animación, la Esencia simplemente desaparece. | Paso 10: las gotas vuelan del total a los Datos, y la línea «Tu Esencia se volvió Datos». | P0 |
| F-05 | La placa se vacía en cada sesión | «Mis criaturas murieron.» | Nadie lo dice. | J-165 en el resumen («guardada en el Bestiario»); la Nevera lo vuelve una mejora visible. | P1 |
| F-06 | «¡Último minuto!» en ámbar | Prisa y nervios. | Un niño cree que va a perder algo. | Línea 2 del Momento `clock`: «¡No pierdes nada!». El reloj nunca resta segundos (CICLO §12). | P1 |
| F-07 | Manera de moverse nueva | Cuatro avisos a la vez. | `game.ts:908` + `ui.ts:1890` + etiqueta + tarjeta. | Borrar los dos toasts (J-58); §3.3. | P0 |
| F-08 | Primeros 40 s de la sesión 1 | Cinco tarjetas y un Destello encima. | `stable`, `income`, `species`, `behavior`, `golden` caen juntos. | §3.3: breves en la sesión 1, Destello desde la sesión 2, Encargos desde la sesión 2. | P0 |
| F-09 | Metas imposibles | Buscar algo que no existe. | (a) «Las siete de la semilla» (final secreto y Encargo `seven`) piden Helicium solidus y Kronium dividuus, que no viven en ningún mundo; (b) «late» y «se divide»: ninguna especie de los 7 mundos se clasifica así en `catalogSignatures.json` — la Guía, las siluetas «¿Has visto alguna latir?», los Encargos `s_heart`/`s_split` y el final secreto (6 de 6 maneras) podrían ser imposibles; (c) pistas de secretos con μ (J-24…J-26). | (a) J-129; (b) **medir** con `scripts/world-check.ts` qué maneras de moverse aparecen en cada mundo; si faltan, que la Guía diga «Aún no vive en ningún mundo» y que el final secreto pida las que existen; (c) J-24…J-26. | P0 |
| F-10 | Esencia por segundo que baja sin motivo | «¿Por qué gano menos?» | Una criatura se apagó o se fundió y nadie lo dice. | Chip junto a «+X/s»: «−1,1/s · se apagó una» (rojo suave, 2 s). | P2 |
| F-11 | Rechazos sin motivo | «No me deja.» | `seedDenied` solo pinta el precio de rojo; la Noche bloqueada dice «Se abre en la Noche 3» sin decir cómo; la Copiadora deshabilitada no dice por qué. | J-161, J-102, J-103; Copiadora: «Se abre con Copiadora en el Árbol». | P1 |
| F-12 | Esperas sin pista | No saber qué hacer. | Con la placa vacía y `+0/s` no vuelve el dedo (QA2 §5b); «Clasificando…» largo. | J-164; J-30 con una barra de 5 s. | P1 |
| F-13 | Precio de un nodo como ecuación | Matemáticas para comprar. | `[3 · Anillo 1] × [×4 · 2 niveles: ×2 cada uno] = [12]` siempre visible. | J-88, J-89, J-90. | P1 |
| F-14 | Abono: el segundo de la sesión cuesta el doble | «Sube porque compré.» | Precio que crece por comprar, dentro de la sesión. | Decirlo antes de comprar (J-163). | P1 |
| F-15 | «Terminar ahora» | Miedo a perder lo ganado. | La confirmación no dice qué te llevas. | J-162: «¿Terminar ya? Te llevas 22 Datos.» | P1 |
| F-16 | Palabras que asustan | Tristeza o miedo. | «Explotó», «Muerta», «Murió una criatura», «puede matar la vida actual», «Extinción», «Esterilizo… Me duele». | J-59, J-115, B-13, B-01, J-41, J-47. | P0 |
| F-17 | Dos nombres para la misma especie | «¿Es otra?» | VELA, la tarjeta de comparación y la ficha dicen el latín; el Bestiario, el nombre común. | J-128, J-148, J-149, J-118. | P0 |
| F-18 | «Aquí siempre es de noche» y luego «Nueva noche» | Contradicción. | `t_intro` línea 3. | J-124. | P1 |
| F-19 | Sesiones que rinden menos que la anterior | «Lo hice igual y gané menos.» | Antes, la suerte del Destello ×7 (CICLO §11.2). | Ya corregido con el regalo «30 s de tu Esencia» (`SPARK_GIFT_SECONDS`); los textos deben decirlo (J-73, J-119). | P1 |
| F-20 | Mundo nuevo con menos Esencia | Bajón al cambiar de mundo. | Ya resuelto: los mundos van ordenados por lo que pagan (CICLO §4.3). | Mantener; que la tarjeta del mundo no enseñe un número de Esencia que lo contradiga. | — |

---

## 5. TODO priorizado para los integradores

Cada punto dice archivo(s) y texto exacto; cuando el texto ya está en una fila, se cita la fila (su columna «Propuesta»
es el reemplazo literal). Al cerrar cada punto: `npm run typecheck`, `npm test` (los tests de palabras de `script.test.ts`,
`catalog.test.ts`, `encargos.test.ts` y `i18n.test.ts` comprueban los límites), y nada de esto toca números de balance.

### P0 — antes de publicar

1. **Fuera μ, σ, R, dt, régimen y Calibrar de todo lo visible.**
   - Borrar B-01 (`src/ui/i18n.ts`) con `src/ui/panel-calibrate.ts`; Momento `calibration` y `calibChip`
     (`src/moments/catalog.ts`) y el dibujo «σ» (`src/ui/moments/illustrations.ts:1477`) (J-12).
   - `src/moments/behaviors.ts`: `how` de las seis maneras = J-01…J-06; nota de colonia = J-07; `exampleParamsText` →
     mundo de la especie (J-08).
   - `src/ui/modals.ts:762-772`: borrar las casillas μ/σ y poner «Vive en: {mundo}» (J-09); `outOfRegime` = J-10.
   - `src/game/treeText.ts:135`: «Dónde vive y cómo se mueve» (J-11).
2. **Nada promete un sistema retirado.**
   - Muestras: J-31, J-32, J-33, J-34, J-35, J-36, J-37, J-38, J-39.
   - Genoma / Extinción / Era: J-40, J-41, J-42, J-43 (`a1_night`), J-44, J-45, J-46, J-47, J-48, J-17.
   - Calibrar en Encargos y tutorial: J-13 (→ `t_world`), J-14, J-15, J-16, J-18.
   - Mejoras con Esencia: `income` = J-117; `t_essence` = J-127.
   - Precio de la semilla: `seedPrice` = J-121; borrar B-13 `seedCheaper` y B-14; `seedWaitWhy` = J-69; `spHint`, `spDish` = J-75.
3. **Un evento, un mensaje.**
   - Borrar `toast(TEXT.newBehavior(b), 'good')` en `src/game/game.ts:908` (J-58) y `this.toasts.push(…newBehavior…)` en
     `src/ui/ui.ts:1890`.
   - `src/ui/ui.ts:1878-1885`: el toast de especie solo si `moments.mode === 'off'`.
   - Sesión 1: Momentos `species`, `secondSpecies`, `behavior.*` en modo breve; Encargos ocultos; píldora de Datos oculta;
     Destello desde la sesión 2 (§3.3).
   - `TEXT.nightReady`: no la primera vez, cuando habla la escena `a1_night` (J-177).
4. **Ninguna meta imposible.**
   - `src/story/script.ts:64-72` `SEED_SPECIES`: siete especies que vivan en algún mundo (J-129); renombrar «especies
     semilla» → «especies de Albor» en `src/ui/story/strings.ts:35-36` y en el Encargo `seven`.
   - Medir con `scripts/world-check.ts` qué maneras de moverse salen en cada mundo; si «late» o «se divide» no salen en
     ninguno, ajustar la Guía, `s_heart`, `s_split` y `secretUnlocked` (`src/story/endings.ts:148-154`) (F-09).
   - Secretos de especie: J-24, J-25, J-26 (y que el dueño de secretos confirme que se pueden conseguir).
5. **Palabras que asustan.** `STATE` y `stBorn…stDead` = J-59; Momento `explode` = J-115; `dissolve` = J-114; borrar
   `rsDied*` y `seedCheaper` (B-13, B-14).
6. **Un solo nombre por especie.** `src/story/story.ts:358-363`: `{first}`/`{best}` con `sp.name` (común) (J-128);
   `src/ui/moments/species-card.ts:244-245, 382-383` (J-148); `src/moments/catalog.ts:336` (J-118); `src/ui/ui.ts:1654`
   (J-149).
7. **Rechazos con motivo.** Placa llena = J-160 / J-175 (`TEXT.dishFull` en `src/game/content.ts`, mostrado por el
   manejador de `seedBlocked` con motivo `full`).
8. **Números del ciclo nuevo con unidad.** `previewNext` = J-101; progreso de Encargos = J-136; edad de criatura = J-28.
9. **La ruta de aprendizaje del ciclo nuevo** (§3): Momento `clock` (paso 8); escenas `t_tree` (paso 11), `t_world`
   (paso 19), `a1_night` (paso 22); `VELA_LINES.first` (paso 10, `src/game/treeText.ts:269`): «¡Primera sesión! Tu
   Esencia se volvió Datos. Ahora, al Árbol.» / "First session! Your Essence became Data. Now, to the Tree."; Momentos
   `seed` = J-112, `golden` = J-119, `upgrade` = J-120; `t_intro` línea 3 = J-124.

### P1 — en la misma versión si cabe

1. **Unificar sinónimos** (§2.2 U-01…U-16): J-50, J-52, J-56, J-62, J-64, J-66, J-81, J-84, J-86, J-99, J-113, J-116,
   J-123, J-126, J-130, J-134, J-135, J-137, J-147, J-74.
2. **HUD y placa:** J-60, J-61, J-63, J-65, J-67, J-68, J-70, J-71, J-72, J-73, J-30, J-57; Momento `overgrown` = J-122.
3. **Bestiario:** J-76, J-77, J-78, J-79, J-80, J-82, J-83, J-29.
4. **Árbol y sesión:** J-85, J-87, J-88, J-89, J-90, J-91, J-92, J-93, J-94, J-95, J-96, J-97, J-98, J-100, J-102, J-103.
5. **Historia y Encargos:** J-19, J-21, J-22, J-23, J-125, J-131, J-132, J-133.
6. **Logros y Bitácora:** J-49, J-51, J-138, J-139, J-141; tienda J-53, J-54; secretos J-27, J-55.
7. **Textos que faltan:** J-161…J-170.
8. **Ajustes:** J-155, J-156, J-157.
9. **Nombres:** J-150 (nombres comunes al migrar partidas viejas, `src/game/legacy.ts`). Textos nuevos del ciclo:
   J-171, J-172, J-173, J-174, J-176, J-177.
10. **Guardia contra la regresión** (CLAUDE.md: todo fallo de QA lleva su test): un test de vitest que recorra todo
    `Text` del jugador (`STRINGS`, `TEXT`, `NODE_TEXT`, `VALUE_TEXT`, `SESSION_UI`, `SCENES`, `CHAIN`, `SIDE`, `MOMENTS`,
    `SECRET_DEFS`, `MS`) y falle si contiene `μ`, `σ`, `régimen`, `regime`, `Genoma`, `Genome`, `Muestra`, `Sample`,
    `Extinci`, `Extinct`, `Calibr`, `espécimen`, `specimen`, `pasos`, `Ø` o `/s` dentro de una frase (permitido solo en
    el chip «+1/s»). Y en `docs/GDD.md` §2, «(Corrección v1.3)»: el glosario pasa a ser el de este documento (con el
    ADR-026 de CICLO §16).

### P2 — pulido

1. Nombres de nodos J-104…J-111 (`src/game/treeText.ts`; los ids no cambian) y sus etiquetas J-178.
2. Nombres de logros J-140; sufijo J-142; espécimen J-143.
3. Secretos J-144, J-145, J-146.
4. Especies J-151, J-152, J-153, J-154.
5. Final Ley J-20; Ajustes J-158, J-159.
6. `docs/wiki/` (Prestigio-y-Genoma, Mejoras, Cómo-jugar…) describe el ciclo viejo: reescribir cuando el ciclo nuevo
   esté publicado.
