# MECÁNICAS: tocar mucho emociona, ninguna muerte sin explicar

> **Pedido del dueño (literal):** *«revisa jugabilidad es algo aburrido que se mueran sin entender por qué ... dar
> muchos click debería ser emocionante y no un castigo, re plantea las mecánicas»*.
> Siguen en pie los pedidos anteriores: divertido y súper incremental, partidas cortas (~15–30 s) que crecen, no
> castigar nunca por crecer, dinero cada vez más rápido, y que cualquiera (un niño) entienda qué hace y para qué.

**Rol:** diseñador jefe. Solo lectura sobre el repositorio. **Base:** `main` v0.024 (`f1ef61c`).

**Estado:** aprobado por el dueño el 2026-11-06 (las tres recomendaciones de §9): [ADR-031](../DECISIONS.md) *Accepted*.
La línea base del bot (`bot-baseline-10x3.txt`) no se copia aquí: se regenera con `npx vite-node scripts/session-bot.ts 10 3`.

**Entradas leídas:**
- `CLAUDE.md`, `docs/GDD.md` (§1, §7, §20, §23), `DECISIONS.md` (ADR-025 … ADR-030), `docs/CLARIDAD2.md`, `docs/CICLO.md`,
  `docs/RITMO.md` §9;
- QA en caja negra `qa-claridad/QA-CLARIDAD.md` (v0.019) y `qa-claridad2/QA-CLARIDAD-2.md` (v0.023): muertes, tramos
  muertos, «tareas»;
- código: `src/ui/dishTap.ts`, `src/ui/input.ts`, `src/ui/ui.ts` (`onTap`), `src/game/collect.ts`, `contact.ts`,
  `game.ts` (`seedAt`, `clearSpotNear`, `findFreeSpot`), `cycleBalance.ts`, `seeding.ts`, `tree.ts`, `src/ui/deathLabel.ts`,
  `sowHint.ts`, `src/sim/deflect.ts`, `steer.ts`, `runaway.ts`, `src/main.ts` (`detect()`), `src/audio/sfx.ts`,
  `scripts/sessionBotCore.ts`, `src/story/script.ts`.
- Línea base del bot medida hoy: `npx vite-node scripts/session-bot.ts 10 3`, salida completa en
  `bot-baseline-10x3.txt`, en esta misma carpeta.

**No se toca** (CLAUDE.md, ADR-002, ADR-025, ADR-027): la regla de Lenia, el estado RGBA16F, una foto cada 10 pasos,
«la placa nunca avanza a ciegas», el cristal absorbente y su deflector, el detector, «solo paga lo estable» y «la sopa
uniforme da 0». **Este plan no cambia ni una línea de `src/sim/` ni de `src/detect/`.**

---

## Índice

0. [Decisiones en una página](#0-decisiones-en-una-página)
1. [Investigación: cómo hacen los buenos clickers que tocar sea un placer](#1-investigación)
2. [Diagnóstico: por qué hoy tocar castiga](#2-diagnóstico-por-qué-hoy-tocar-castiga)
3. [Los verbos nuevos](#3-los-verbos-nuevos)
4. [Las muertes, rediseñadas](#4-las-muertes-rediseñadas)
5. [Economía: fórmulas, números y bot](#5-economía-fórmulas-números-y-bot)
6. [Lo que se ve en pantalla, sesiones 1–3](#6-lo-que-se-ve-en-pantalla-sesiones-13)
7. [Viabilidad en este código](#7-viabilidad-en-este-código)
8. [Paquetes de trabajo](#8-paquetes-de-trabajo)
9. [Lo que decide el dueño](#9-lo-que-decide-el-dueño)
10. [Anexos: ADR-031 (borrador), correcciones de la GDD, contratos y textos](#10-anexos)

---

## 0. Decisiones en una página

**El bucle nuevo en tres frases:**
1. **Tocas a tus criaturas y brillan:** cada toque saca luz, los toques seguidos forman una **racha** que multiplica
   toda la luz que entra, y cada 10.º toque seguido es un **¡Chispazo!** que suelta chispitas para atrapar.
2. **Siembras con el botón de la semilla:** VELA la pone siempre en un hueco seguro (o tú la arrastras y se coloca
   sola en el sitio bueno más cercano), y si no prende **te devuelve la luz**. Tocar la placa ya no siembra nunca.
3. **Cada muerte se avisa antes, se nombra cuando pasa y deja algo:** su luz queda en la placa, la primera vez
   «aprendes por qué» (+2 Datos), y si salvas a una criatura de un choque, la racha sube.

| Tema | Decisión | Por qué, en una línea |
|---|---|---|
| **Toque en una criatura viva** | **HACER: Pulso.** Brilla (solo dibujo), recoge su gota y suma luz extra = `max(1, 2,5 % de tu luz/s) × racha`. | Tocar = jugar. Escala con tu luz, como el ratón de Cookie Clicker (+1 % de CpS por clic). La bioluminiscencia real se enciende al tocarla (§1.4). |
| **Medidor de racha** | **HACER.** +2,5 % por toque seguido, tope ×1,25 (×1,75 con la ruta). Se vacía despacio, **nunca de golpe**. Multiplica **toda** la luz que entra mientras dura. | Muchos toques = más luz, y se ve. Una pausa corta no castiga. |
| **Toques críticos** | **CAMBIAR → ¡Chispazo! fijo** cada 10.º toque seguido (×5), no al azar. | Se ve venir (10 puntitos que se llenan), lo entiende un niño, y el bot no tiene ruido de suerte. La sorpresa la pone el Destello. |
| **«Cargar» una criatura** | **RECHAZAR como medidor propio**; **HACER su dibujo** (el halo sube y baja con cada toque). | Dos medidores confunden. Cargar premia machacar una sola criatura quieta; la racha premia moverse por la placa. |
| **Toque en agar vacío** | **CAMBIAR:** nunca siembra ni cuesta. Recoge gotas y chispitas en un radio generoso (48 px) y **no rompe** la racha. Si no hay nada, una onda de agua y ya. | «Nunca castigar el clic». Un pulso de nutrientes tendría que tocar Lenia: no. |
| **Sembrar** | **HACER: botón «Sembrar».** Toque = la semilla vuela al hueco más seguro. Arrastrar la semilla = eliges sitio y se **ajusta** al sitio seguro más cercano (nunca se rechaza). Mantener el botón = semilla grande (si está comprada). | El jugador **no puede** provocar una fusión sembrando. Desaparece «Muy cerca: se fundirían. ¡Más lejos!». |
| **Chispitas** | **HACER**, pero solo tras un Chispazo (5 chispitas, 2,5 s). La que no atrapas **se posa** como gota suelta (no se pierde). | Da blancos al dedo en el agar vacío. «Lo que brilla en pantalla no se quita» (CLARIDAD2 §2.2.2). |
| **Motas doradas** | **RECHAZAR.** El dorado sigue siendo **solo** el Destello. | Dorado = regalo raro. Si todo brilla en oro, nada lo es. |
| **Barrido** | **AMPLIAR:** el dedo que cruza la placa recoge gotas **y** hace brillar cada criatura que cruza (1 toque cada una). | Pasar la mano por agua bioluminiscente. Es la versión «zig-zag» del tocar rápido. |
| **Semilla que no prende** | **SE QUEDA** (es Lenia real y es el porqué del Gotero), pero **devuelve lo que costó** y tras 2 fallos seguidos la siguiente prende seguro. | Fallar solo cuesta tiempo. |
| **Choque y fusión** | **SE QUEDA**, casi solo entre criaturas que se mueven. Aviso **solo si puedes hacer algo** («¡Van a chocar! Arrastra una»). Salvarla: «¡Salvada! Racha +5». Si se funden: su luz queda (+3 s de su luz), lámina la 1.ª vez y +2 Datos. | El peligro pasa de bronca a reto. |
| **Cristal** | **SE QUEDA** (el deflector ya salva el 99 %). Etiqueta + su luz queda. | Rarísimo; que al menos regale. |
| **Desbordamiento (lisis)** | **SE QUEDA como red de seguridad invisible.** La mancha sin forma se ve vigilada (contorno ámbar «VELA la vigila») antes de disolverse. No da luz (nunca fue criatura). | Avisada, explicada, sin premio que invite a hacerlo. |
| **Ruta del Árbol** | La ruta **✦ Destello** pasa a **✦ Pulso** (la ruta de quien toca) con 3 nodos nuevos: **Pulso**, **Racha larga**, **Chispazo seguido**; los 7 nodos del Destello siguen en ella. ↓ Recoger sigue siendo la de quien mira. | Dos estilos opuestos y claros, como los Ancestros activos/ociosos de Clicker Heroes. Una 9.ª ruta rompería la estrella de 8. |
| **Quien no toca** | Gana **exactamente lo de hoy** o más (devoluciones y luz de las muertes). | «Idle honesto» (pilar 5). |
| **Quien toca mucho** | Gana ×1,5 sobre quien no toca a media partida, y hasta ×3 con la ruta Pulso completa. En la sesión 1, unas 3 veces la luz del planner de hoy. | Lo pidió el dueño; tope para que mirar siga valiendo. |

---

## 1. Investigación

### 1.1 Tocar que da gusto: lo que hacen los grandes

| Juego / fuente | Qué hace | Qué tomamos |
|---|---|---|
| **Cookie Clicker**: ratones de plástico, hierro… | Cada mejora de ratón: «Clicking gains +1 % of your CpS». El clic **escala con lo que produces**, así que nunca queda viejo. ([wiki, Cookies per Click](https://cookieclicker.fandom.com/wiki/Cookies_per_Click)) | El Pulso da **un % de tu luz/s** (con un mínimo de 1 para que la sesión 1 tenga números que se lean). |
| **Cookie Clicker**: galleta dorada | Frenzy ×7 durante 77 s, Click Frenzy ×777 por clic durante 13 s. La galleta dura 13 s y si no la tocas **no pasa nada**: solo se va. ([wiki.gg, Golden Cookie](https://cookieclicker.wiki.gg/wiki/Golden_Cookie)) | Nuestro Destello ya es esto. Se queda como el único regalo dorado. |
| **Clicker Heroes**: Ancestros | Hay Ancestros **ociosos** (Siyalatas, Libertas) y **activos** (Fragsworth, Bhaal, Juggernaut, que crece con el combo de clics). El jugador elige estilo y los dos funcionan. ([ClickerHeroes Wiki, Builds](https://clickerheroes.fandom.com/wiki/Builds); [Steam, combo frente a ocioso](https://steamcommunity.com/app/363970/discussions/0/490124466468680800)) | Dos rutas del Árbol para dos estilos: **✦ Pulso** (tocar) y **↓ Recoger** (mirar). |
| **Clicker Heroes**: oro | Las monedas caen al suelo y se recogen pasando el ratón por encima, o solas al rato. ([MobyGames](https://www.mobygames.com/game/clicker-heroes)) | Las **chispitas** del Chispazo se atrapan con el dedo; si no, se posan como gota y las recoge la pipeta. |
| **Tap Titans 2** | El daño por toque, la probabilidad de crítico y el daño crítico son estadísticas **separadas**, cada una con su mejora. ([Giant Bomb](https://giantbomb.com/wiki/Games/Tap_Titans_2); [guía BlueStacks](https://www.bluestacks.com/blog/game-guides/tap-titans-2/tt2-beginner-guide-en.html)) | Tres nodos separados, un número cada uno: **Pulso** (cuánto da un toque), **Racha larga** (tope del multiplicador), **Chispazo seguido** (cada cuántos toques). |
| **Egg, Inc.** | Se toca o se **mantiene** el botón rojo para soltar gallinas; la investigación «Hold to Hatch» automatiza el mantener. ([Wikipedia](https://en.wikipedia.org/wiki/Egg,_Inc.); [guía de r/EggsInc](https://lr.eu.psf.lt/r/EggsInc/wiki/patashu_guide)) | Un ajuste de accesibilidad **«Pulso fácil»**: mantener el dedo sobre una criatura da 4 toques/s (§3.5). |
| **AdVenture Capitalist** | Al principio tocas cada negocio; luego contratas **gerentes** que lo hacen por ti. Automatizar es el premio. ([Pocket Gamer](https://www.pocketgamer.com/adventure-capitalist/idle-tapper-adventure-capitalist-lets-you-simulate-capitalism-and-get-rich-with); [guía Mistplay](https://www.mistplay.com/blog/adventure-capitalist-guide)) | Ya lo tenemos con las pipetas. Lo nuevo: **al principio el dedo manda** (unas 3 veces la luz de hoy en la sesión 1) y luego las pipetas igualan a quien mira. |
| **Pecorella, «The Math of Idle Games»** | Costes exponenciales contra producción; el prestigio y otros sistemas sirven para empujar al juego activo sin depender del tiempo. ([Game Developer, parte I](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i); [parte III](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii)) | El bono activo es **proporcional** (un % de tu luz), nunca una cifra fija que el crecimiento deje vieja. |
| **«Playing to wait»** (taxonomía de idle games) | El núcleo es participación activa, progreso inactivo y una vuelta que premia. ([Monash](https://research.monash.edu/en/publications/playing-to-wait-a-taxonomy-of-idle-games/)) | La partida de 15–30 s es la parte activa; el Árbol es la vuelta que premia. |

### 1.2 Jugo: números que vuelan, sacudida y tono que sube

| Fuente | Idea | Qué tomamos |
|---|---|---|
| Jonasson y Purho, **«Juice It or Lose It»** (GDC Europe 2012) | Las mismas reglas, con ~20 retoques de respuesta (rebote, partículas, sonido), se sienten otro juego. ([GDC Vault](https://gdcvault.com/play/1016487/Juice-It-or-Lose)) | Cada toque responde en < 1 fotograma: brillo, «+N», motas al contador y un tono. |
| Nijman, **«The Art of Screenshake»** (Vlambeer, 2013) | Añadir respuesta paso a paso a un juego simple lo convierte en algo que da gusto. ([Game Developer](https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games)) | Sacudida **solo** en el Chispazo (no en cada toque: a 8 toques/s marea). |
| Eiserloh, **«Juicing Your Cameras With Math»** (GDC 2016) | Sacudida por «trauma» que decae, con ruido suave. Ya la usamos (`src/ui/fx/shake.ts`). ([GDC Vault](https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing)) | Chispazo = trauma 0,15, por debajo del Destello (0,35). |
| **Peggle / Peggle 2** | Cada clavija seguida suena **un grado más arriba** en una escala que encaja con la música; al final, «Extreme Fever» y la Oda a la Alegría. ([Wikipedia](https://en.wikipedia.org/wiki/Peggle); [Audiogang, audio de Peggle 2](https://www.audiogang.org/?p=1798)) | `sfx.ts` ya sube un grado por gota en un barrido rápido (`collectRun`). Se extiende a la racha: cada toque, un grado de la escala del dron; en el Chispazo, un acorde. |

### 1.3 Que fallar se entienda

| Fuente | Idea | Qué tomamos |
|---|---|---|
| Game Developer, **«Enemy attacks and telegraphing»** | Un aviso solo sirve si se reconoce y deja tiempo para reaccionar; entonces el golpe se siente culpa propia y no injusticia. ([Game Developer](https://gamedeveloper.com/design/enemy-attacks-and-telegraphing)) | Aviso **solo** cuando el jugador puede actuar, con ≥ 1 s de margen (`CONTACT_WARN_S` = 2 s ya existe). |
| **Hades** | Morir hace avanzar la historia y deja recursos: el fracaso es productivo, no un castigo. ([VICE](https://www.vice.com/en/article/how-hades-made-a-genre-known-for-being-impossibly-hard-accessible)) | Cada muerte deja luz, y la primera de cada tipo da Datos («aprendiste por qué»). En un laboratorio, un experimento fallido **es** un dato. |
| **Cookie Clicker** | La galleta dorada que no tocas no te quita nada. | Ninguna muerte resta lo ya ganado. La luz de la criatura muerta se queda en la placa. |

### 1.4 La ciencia lo respalda: la bioluminiscencia se enciende al tocarla

Los dinoflagelados (el «mar que brilla») emiten luz cuando una fuerza mecánica los deforma. La respuesta depende del
esfuerzo de cizalla, no del tipo de flujo, y la explicación ecológica es la de un depredador que los manipula
([Biol. Bull. 2007, PubMed 17565113](https://pubmed.ncbi.nlm.nih.gov/17565113/); célula aislada con micropipeta:
[Jalaal et al.](https://core.ac.uk/download/323304127.pdf); revisión 2023:
[Frontiers in Marine Science](https://www.frontiersin.org/articles/10.3389/fmars.2023.1299602/full)).

«Tócala y brilla» es la regla de un laboratorio de verdad, no un truco de juego. Encaja con *Bioluma*, con el MC-7 y
con el tono «súper científico» del ADR-029. Hay un periodo de recarga real; aquí lo simplificamos en un tope de
toques por segundo (§5.1), porque gana la diversión (GDD §1).

---

## 2. Diagnóstico: por qué hoy tocar castiga

Medido en el código de v0.024 y en los dos QA:

1. **Tocar el agar vacío siembra** (`ui.ts onTap` → `onDishTap` → `game.actions.seedAt`). Cada toque de más es una
   semilla de más:
   - cuesta 4 de luz;
   - ocupa uno de los 3 huecos de «naciendo» (`SEED_NURSERY_MAX`);
   - si cae cerca de otra, sale **«Muy cerca: se fundirían. ¡Más lejos!»** (`TEXT.seedTooClose`, una bronca).
2. **Una semilla al azar prende 1 de cada 4** con el Gotero a 0 (`SEED_SUCCESS[0][0]` = 0,24). Tres de cada cuatro
   toques de siembra acaban en «Se apagó: no prendió». Es **la muerte más común del juego**, y además cuesta luz.
3. **Tocar más no da más.** Una gota guarda lo que la criatura hizo (tope de 4 s, `LIGHT_CAP_SECONDS`). Tocarla dos
   veces no saca nada. El único premio por tocar rápido es no esperar.
4. **Más criaturas, más muertes.** Medido en CPU (ESPECIES §5, `DISH_CAPACITY`): con 4 Orbium sembradas en Ø128 quedan
   **0,9 vivas** tras 1 200 pasos. El bot usa una vida mediana de 27 s para una nadadora con 3–5 en la placa
   (`MOVER_HAZARD`).
5. **El niño del bot** (`kid`) siembra en un punto al azar cada 0,6 s. En el juego real, eso es justo lo que llena la
   placa de semillas que se tocan; el bot solo lo modela como un riesgo de muerte.
6. **QA-CLARIDAD-2:**
   - C7: «tres Nadadoras desaparecieron sin ninguna etiqueta» (ya arreglado con `deathLabel.ts`, pero la etiqueta solo
     dice lo que se perdió);
   - «Tocar cada gota a mano» sale en la lista de **tareas**;
   - «arrastrar para salvarlas» sale en la lista de **lo que da gusto**.

   La conclusión: el reto da gusto y la bronca no.

**La raíz:** hoy un toque significa dos cosas opuestas (recoger, que es bueno; sembrar, que es arriesgado), y lo único
que decide cuál es *dónde* cae el dedo. Un niño que toca deprisa siembra sin querer. **La solución es separar los
verbos: el dedo en la placa siempre suma, y sembrar es un botón.**

---

## 3. Los verbos nuevos

### 3.1 La tabla de gestos (sesiones)

| Gesto | Dónde | Qué hace | Cuesta | Desde |
|---|---|---|---|---|
| **Toque** | Criatura **estable** | **Pulso:** brilla 250 ms (halo, solo dibujo); recoge su gota si tiene; suma `pulso × racha`; +1 a la racha. | Nada | Sesión 1 |
| **Toque** | Semilla que nace, mancha sin forma | Un parpadeo gris («aún no brilla»). No suma, **no rompe** la racha. | Nada | Sesión 1 |
| **Toque** | Gota suelta, chispita | La recoge (× racha). +1 a la racha. | Nada | Sesión 1 / 2 |
| **Toque** | Agar vacío | Onda de agua. Recoge gotas y chispitas a ≤ 48 px. No siembra nunca. No rompe la racha. | Nada | Sesión 1 |
| **Toque** | Destello | Su regalo (× racha) y +5 a la racha. | Nada | Sesión 4 (como hoy) |
| **Pasar el dedo** (empieza en vacío) | Placa | Barrido: recoge las gotas del camino **y** hace brillar cada criatura que cruza (1 toque por criatura cada 0,3 s). | Nada | Sesión 1 |
| **Arrastrar desde una nadadora** | Placa | La guía (como hoy, `steer.ts`). Si así evita un choque avisado: «¡Salvada! Racha +5». | Nada | Primera nadadora |
| **Mantener** 400 ms | Criatura | Su ficha (como hoy). | — | Sesión 1 |
| **Toque** | Botón **Sembrar** | La semilla vuela al hueco más seguro y nace allí. | 4 de luz o gratis | Sesión 1 |
| **Arrastrar** | Del botón Sembrar a la placa | Eliges sitio: zonas seguras en verde suave, prohibidas rayadas. Al soltar, se ajusta al sitio seguro más cercano. **Nunca se rechaza.** | Igual | Sesión 2 (la mano lo enseña) |
| **Mantener** | Botón Sembrar | Semilla grande (si está comprada). | ×2,25 | Gota grande |
| **Toque** | Botón Copiar → especie | Igual que Sembrar: va sola al hueco seguro, o la arrastras. | Como hoy | Copiadora |

**Reglas fijas** (para que el juego nunca castigue un toque):
- Ningún toque en la placa cuesta luz, mata, siembra ni mueve materia. El Pulso es **dibujo y economía**: no escribe
  en el campo de Lenia.
- La racha **nunca** cae a 0 de golpe. Tras 1 s sin acertar, baja 8 toques por segundo. Con la placa en pausa (VELA,
  una hoja abierta), la racha también se congela.
- Se cuentan como mucho **10 toques por segundo** (`TAP_HITS_MAX_PER_S`). Por encima siguen el brillo y el sonido,
  pero no la luz, para que un autoclicker no rompa la economía.
- La vibración solo suena en el Chispazo. A 8 toques/s, vibrar en cada uno molesta.

### 3.2 Qué pasa cuando el jugador toca mucho y rápido (segundo a segundo)

1. **Toque 1** en una criatura: brillo cian-blanco y «+1» que sube desde ella. Tres motas vuelan al contador y
   suena una nota.
2. **Toques 2–9:** cada nota es un grado más alta (escala del dron, `sfx.ts`). El chip junto al contador pasa de
   «Racha ×1,03» a «×1,23». Alrededor del chip, 10 puntitos se van llenando. El «+N» crece un 4 % por toque (tope
   ×1,4 de tamaño).
3. **Toque 10:** **«¡CHISPAZO! +5»** grande, en blanco cálido. Hit-stop de 60 ms, sacudida de 0,15 y un acorde. Cinco
   chispitas del color de la criatura salen a 40–60 px. Los puntitos vuelven a 0 y la racha sigue.
4. **Chispitas:** cada una que atrapas es «+1» y un toque más de racha. Las que no, a los 2,5 s se posan en el agar como
   una gota suelta pequeña (la pipeta o el barrido final las recogen).
5. **Racha llena** (×1,25 al principio): el chip brilla en verde «¡Racha máxima!». El contador muestra debajo
   «×1,25 por tu racha».
6. **Dejar de tocar:** a 1 s el chip se pone gris y baja poco a poco. **Nada suena a error.**

### 3.3 Las propuestas, una por una

| Propuesta | Decisión | Motivo |
|---|---|---|
| **Medidor de combo que multiplica la luz recogida** | **HACER** («Racha»). Multiplica **toda** la luz que entra mientras dura: gotas (a mano o por pipeta), Pulsos, chispitas y Destello. No multiplica el barrido final ni los premios fijos de encargos. | Si solo multiplicara lo que recoge la mano, comprar la Pipeta maestra le bajaría la luz a quien toca: castigaría crecer. Con «toda la luz», la regla cabe en una frase: «Mientras dura la racha, toda tu luz vale ×1,25». |
| **Toques críticos** | **CAMBIAR:** el **Chispazo** es fijo, cada 10.º toque seguido (×5). Con «Chispazo seguido» pasa a cada 8 y luego cada 6. | Un crítico al azar del 10 % daría lo mismo de media (×1,4), pero no se ve venir y mete ruido en la REGLA DURA del bot. RITMO ya eligió «el Destello es un ritmo, no una lotería». La sorpresa al azar la pone el Destello. |
| **«Cargar» una criatura** | **RECHAZAR** el medidor por criatura. **HACER** el dibujo: el halo sube con cada toque y baja en 300 ms. | Un niño no maneja dos medidores. Un bono por criatura premia machacar una quieta, y la racha global premia ir de una a otra y cazar chispitas. **Nunca toca Lenia:** ni materia, ni crecimiento, ni μ. |
| **Toque en vacío que hace algo bueno** | **CAMBIAR:** recoge en un radio generoso, no rompe la racha, y tras un Chispazo hay chispitas que cazar. **RECHAZAR** el «pulso de nutrientes». | Un pulso que alimente de verdad cambiaría la regla de Lenia (ADR-002); uno de mentira sería un efecto falso que el niño no puede ver en la placa (pilar 1). |
| **Sembrar como acción deliberada, con sitio seguro** | **HACER:** botón Sembrar, sitio seguro automático y arrastre con ajuste. | Es el arreglo de raíz (§2). Ya existen las piezas: `findFreeSpot`, `clearSpotNear` (`game.ts`) y `safeSowSpot` (`sowHint.ts`). |
| **Motas doradas que tocar** | **RECHAZAR.** Las chispitas del Chispazo llevan el color de la criatura. | El dorado se reserva al Destello: así se lee de un vistazo. |

### 3.4 Lo que se quita

- Sembrar con un toque en la placa (sesiones). El ciclo clásico retirado conserva su comportamiento.
- `TEXT.seedTooClose` («Muy cerca: se fundirían. ¡Más lejos!») deja de salir en las sesiones. Al arrastrar la semilla a
  un sitio malo, se ajusta y sale una vez «Aquí cabe mejor».
- La espera de doble toque de 280 ms en la placa en modo «un toque» (`input.ts handleTap`). Retrasaba **cada** toque. La
  semilla grande pasa al doble toque sobre el botón Sembrar.
- El toque en una criatura sin luz que solo enseñaba «mantén pulsado» (`cardHint`). Ahora ese toque es un Pulso. La
  pista de «mantener» sale cuando el jugador toca la píldora de la criatura.

### 3.5 Accesibilidad

- **«Recoger la luz sola»** (existe): una pipeta gratis.
- **«Pulso fácil»** (nuevo, apagado por defecto, al estilo «Hold to Hatch» de Egg, Inc.): con el dedo quieto sobre
  una criatura, 4 toques por segundo. En este modo la ficha se abre tocando su píldora.
- **Reducir movimiento:** sin sacudida, sin hit-stop, sin chispitas que vuelen. Las chispitas aparecen quietas y se
  recogen igual, y el «+N» sale sin escala.

---

## 4. Las muertes, rediseñadas

**Principios:**
1. **Ninguna muerte que no se pudiera ver venir:** o se avisa antes, o es tan barata que no importa (la semilla que no
   prende).
2. **Avisar solo si el jugador puede hacer algo.** Si nadie puede, se ve el enlace, pero sin texto de alarma.
3. **Cada muerte se nombra donde pasa**: etiqueta de 2 s con la causa (`deathLabel.ts` ya lo hace) **y lo que deja**.
4. **Nunca se resta lo ganado.** La gota de una criatura muerta se queda (ADR-030), y ahora además crece.
5. **La primera vez de cada causa enseña.** Es la única tarjeta con pausa de la sesión (`RUN_CARD_MAX`) y da **+2 Datos**:
   «Aprendiste por qué pasa». Solo una vez por causa en toda la partida guardada (máximo 10 Datos).

| Causa | ¿Debe existir? | Cómo se avisa antes | Qué puede hacer el jugador | Qué ve cuando pasa (es / en) | Qué devuelve |
|---|---|---|---|---|---|
| **Semilla que no prende** (`faded`, nunca fue estable) | **Sí.** Es Lenia de verdad (ruido asimétrico, ADR-003) y el motivo del Gotero. Con la siembra segura ya no hay «muy pegada al cristal» ni «muy cerca de otra». | El arco de «Naciendo…» se vuelve **ámbar** («Le cuesta…» / "Struggling…") cuando el detector ve que pierde masa (umbral medido, §7.3). Si la medida no da ≥ 85 % de acierto, no se avisa: es mejor no avisar que avisar mal. | Nada en la placa (no se toca Lenia). En el botón: dos puntitos de «mala suerte»; tras 2 fallos seguidos, anillo dorado «¡Esta prende seguro!». | Fundido gris de 600 ms y «No prendió · +4 de vuelta» / "Didn't take · +4 back". Una moneda vuelve al contador. | **El precio entero** (o la semilla gratis). 1.ª vez: «Aprendiste: no todas prenden. +2 Datos». |
| **Choque y fusión** (`creatureExploded`, `touch`) | **Sí** (Lenia real; el deflector ya evita casi todos los choques entre nadadoras). Con la siembra segura solo quedan los choques entre criaturas que **se mueven**. | Enlace rojo que late entre las dos (`contact.ts`, 2 s). Texto **solo si una se puede guiar**: «¡Van a chocar! Arrastra una» / "About to bump! Drag one away". Si no, solo el enlace, sin alarma. | Arrastrar la nadadora (`steer.ts`). Si la pareja no se toca en los 2 s + 1 s siguientes y el jugador guió a una: **«¡Salvada! Racha +5»** / "Saved! Streak +5". | La mancha se marca en ámbar: «Mancha sin forma · VELA la vigila». Luego «Se juntaron · su luz quedó aquí» / "They merged · their glow stayed here". **1.ª vez:** lámina «¡Se juntaron!» con pausa. | Sus gotas, sueltas y **+3 s de la luz de cada una** (`DEATH_BURST_SECONDS`). 1.ª vez: +2 Datos. |
| **Cristal** (criatura viva) | **Sí**, como rareza (el deflector salva el 99 % de los choques, ADR-025). | Si un cuerpo que el deflector no guía (mancha, fragmento) va al cristal en < 1 s, el borde se ilumina donde va a tocar (`stepsToGlass` ya existe en `contact.ts`). | Guiarla si es nadadora. | «Chocó con el cristal · su luz quedó aquí» / "Hit the glass · its glow stayed here". | Su gota + 3 s de su luz. 1.ª vez: +2 Datos. |
| **Perdió la forma sola** (`deathLost`, `shapeLost`) | Sí (Lenia real; poco frecuente). | El halo parpadea irregular durante el último segundo (si el detector lo ve venir). Si no, sin aviso: es barata y deja luz. | Nada. | «Perdió la forma · su luz quedó aquí» / "Lost its shape · its glow stayed here". | Su gota + 3 s de su luz. 1.ª vez: +2 Datos. |
| **Mancha que crece sin parar** (lisis de `runaway.ts`, placa desbordada) | **Sí, como red de seguridad** (ADR-025). Nunca debería verse con la siembra segura. | Toda mancha sin forma (`exploded`) lleva contorno ámbar y «VELA la vigila». | Nada (o la Goma, si la tiene). | «VELA disolvió una mancha que crecía sin parar» / "VELA dissolved a blob that kept growing". | **Nada extra:** nunca fue criatura (solo paga lo estable). Las criaturas que se tragó dejan su gota. 1.ª vez: +2 Datos. |
| **Goma, Pincel, esterilizar** (las quita el jugador) | Sí (herramientas). | Es una acción del jugador. | — | Como hoy. | Su gota queda (como hoy). **Sin** +3 s, para que borrar no sea negocio. |

**La «huella»:** donde muere una criatura viva, su contorno se queda 1,5 s como un fantasma tenue (dibujo del overlay
con la última posición y el radio que dio el detector) y se funde en la gota.

**Rechazado:**
- **Una colección de fósiles en el Bestiario:** más pantallas, sin ayudar a entender. Queda para después.
- **«La fusión hace una criatura más grande»:** Lenia no lo hace de forma fiable, y fingirlo rompe el pilar 1.

**Por qué +3 s no invita a provocar muertes:** una criatura viva rinde `P_c` por segundo hasta el final. Perderla cuesta
`P_c × (lo que queda) + 4 de luz + ~9 s de incubación` y devuelve `3 × P_c`. Solo sale a cuenta en los últimos 3 s, y
ahí da igual. El jugador no puede provocar una fusión sembrando, y la Goma no da nada.

---

## 5. Economía: fórmulas, números y bot

### 5.1 Fórmulas

`P` = luz por segundo de la placa ahora mismo: la fórmula de GDD §5, solo con criaturas estables y con Nutrientes y
Recta final. Con sopa uniforme, `P = 0`.

```
n            = toques de la racha (0 … STREAK_HITS[ℓr])
m_racha(n)   = 1 + STREAK_STEP · n                                    ×1,00 … ×1,25 (×1,75 con Racha larga II)
pulso        = PULSE_MULT[ℓp] · max(PULSE_MIN, PULSE_SECONDS · P)     solo si se toca una criatura ESTABLE
luz_toque    = pulso · m_racha(n) · (Chispazo ? CHISPAZO_MULT : 1)    Chispazo: k mod CHISPAZO_EVERY[ℓc] = 0, con k = aciertos
                                                                       desde que empezó la racha (vuelve a 0 solo si n llega a 0)
chispita     = pulso · m_racha(n)   (+1 a n)   ·   sin atrapar: pulso · 1, como gota suelta (MOTE_SETTLE_SHARE)
gota         = cantidad · m_racha(n)   (a mano o por pipeta, mientras n > 0)   ·   barrido final: × 1
Destello     = SPARK_GIFT_SECONDS · P · regalo · m_racha(n)   (+SPARK_STREAK_HITS a n)
muerte viva  = su gota += DEATH_BURST_SECONDS · P_c   (causas glass / touch / lost; nunca Goma ni esterilizar)
semilla que no prende = + lo que costó (SEED_REFUND_SHARE)  ·  2 fallos seguidos → la siguiente es segura
```

**Garantías** (cada una lleva su test, §8):
- **Solo paga lo estable:** el Pulso exige un objetivo `stable` y `P > 0`. Con sopa uniforme, 1 000 toques dan 0.
- **El ocioso no pierde nada:** sin toques no hay racha (`n = 0`, ×1), y su luz es la de hoy más las devoluciones y la
  luz de las muertes. **Nunca menos.**
- **Crecer nunca castiga:** el Pulso escala con `P` (más criaturas, Nutrientes o Árbol dan toques mayores), y la racha
  también multiplica lo que recogen las pipetas.
- **La luz hecha nunca se pierde** (ADR-030): las chispitas que no atrapas se posan como gota. Lo que se ve brillar no
  se quita nunca.
- **Los Datos** siguen contando la luz hecha ÷ 25. Lo que saca el dedo es luz hecha.

### 5.2 Números, al estilo de `cycleBalance.ts`

```ts
// ───────────────────────────── Pulso: the tap (ADR-031, docs/MECANICAS.md §5) ──

/**
 * A tap on a STABLE creature (a "pulse") makes it flash and adds this many seconds of the dish's current Luz/s.
 * Scale-free, like Cookie Clicker's mouse upgrades (+1 % of CpS per click): a tap never goes stale as the
 * dish grows. 1/40 s: 5 taps a second at the base streak add ≈ +15 % of production (the drops' ×1,25 does
 * the rest). [owner: "dar muchos click debería ser emocionante"; design; bot]
 */
export const PULSE_SECONDS = 0.025;
/** …at least this much Luz (only with a stable creature): session 1 shows "+1", not "+0". [design: a child reads integers] */
export const PULSE_MIN = 1;
/** Pulso (3 levels): the pulse ×this by level, floor included ("Un toque ×1 → ×1,5 → ×2 → ×2,5"). [design; bot] */
export const PULSE_MULT_BY_LEVEL = [1, 1.5, 2, 2.5];
/** Hits counted per second, sliding 1 s window (human tapping tops out at ~7–10/s); more = juice only. [design: anti-autoclicker] */
export const TAP_HITS_MAX_PER_S = 10;
/** Swipe: a creature the finger crosses counts as one hit, again only after this many seconds. [design] */
export const SWEEP_REHIT_S = 0.3;

/** Streak: +this per hit in a row (a creature, a drop, a glimmer, the Spark). [design] */
export const STREAK_STEP = 0.025;
/** Racha larga (2 levels): hits the streak can hold, by level: ×1,25 → ×1,5 → ×1,75. [design; bot: ≤ ×3 over idle at the end of the route] */
export const STREAK_HITS_BY_LEVEL = [10, 20, 30];
/** No hit for this long: the streak starts to drain (it is frozen while the dish is paused). [design: kids pause] */
export const STREAK_GRACE_S = 1.0;
/** …then it loses this many hits a second: never a reset, never a "fail" sound. [design] */
export const STREAK_DRAIN_PER_S = 8;
/** The Spark caught adds this many hits; a swimmer saved from a warned contact too. [design] */
export const SPARK_STREAK_HITS = 5;
export const SAVE_STREAK_HITS = 5;

/** ¡Chispazo!: every N-th hit of a streak pays ×CHISPAZO_MULT (Chispazo seguido: 10 → 8 → 6). Fixed, not random: it is seen coming. [design; RITMO "a rhythm, not a lottery"] */
export const CHISPAZO_EVERY_BY_LEVEL = [10, 8, 6];
export const CHISPAZO_MULT = 5;
/** Glimmers a Chispazo throws (from session 2), each worth one pulse × streak and +1 hit; they live this long. [design] */
export const CHISPAZO_MOTES = 5;
export const MOTES_FROM_SESSION = 2;
export const MOTE_LIFE_S = 2.5;
/** A glimmer not caught settles as a loose drop worth this share of one pulse (light on screen is never taken away). [ADR-030 principle] */
export const MOTE_SETTLE_SHARE = 1;

// ───────────────────────────── Losses that give something back (ADR-031) ──

/** A seed that never became stable gives back what it cost (Luz, or the free seed). Failing costs only time. [owner: "no castigar"] */
export const SEED_REFUND_SHARE = 1;
/** After this many failed seeds in a row, the next one is sure (a pure template). [design; bot: Gotero still pays: fewer waits] */
export const SEED_FAIL_PITY = 2;
/** A STABLE creature that dies (glass, fusion, lost shape) adds this many seconds of its last Luz/s to its drop. Not for Goma / sterilise. [design: < LIGHT_CAP_SECONDS, a loss stays a loss] */
export const DEATH_BURST_SECONDS = 3;
/** The first time ever a cause is seen (faded, touch, glass, lost, runaway): its card and this many Datos ("aprendiste por qué"). [design: a failed experiment is data] */
export const FIRST_ACCIDENT_DATOS = 2;
```

**Precios de los nodos nuevos** (misma regla de precio de ADR-026):

| Nodo (`id`) | Anillo · 🌙 | Niveles | Precios | Antes → después | es / en |
|---|---|---|---|---|---|
| **Pulso** (`pulse`) | 1 · 1 | 3 | 2 · 4 · 8 (×2) | Un toque ×1 → ×1,5 → ×2 → ×2,5 | «Cada toque saca más luz.» / "Every tap draws more glow." |
| **Racha larga** (`streakLong`) | 2 · 1 | 2 | 15 · 30 (×2) | La racha llega a ×1,25 → ×1,5 → ×1,75 | «Tu racha sube más alto.» / "Your streak climbs higher." |
| **Chispazo seguido** (`chispazoOften`) | 3 · 2 | 2 | 200 · 400 (×2) | Un Chispazo cada 10 toques → 8 → 6 | «Chispazos más a menudo.» / "Flashes more often." |

- La ruta pasa de llamarse «Destello» a **«Pulso» / "Pulse"** (✦). En código se queda `branch: 'spark'`, así que no
  hay migración de guardado.
- Los 3 nodos nuevos se ven **desde la sesión 1**. Los 7 del Destello siguen con su «?» hasta que acaba la sesión 3
  (`tree.ts` línea ~717: la excepción va por id).
- El Árbol pasa de 59 a **62 nodos comprables** (7 niveles nuevos).

### 5.3 Cuánto gana cada estilo (modelo, a confirmar con el bot)

Supuestos: quien toca (*tapper*) acierta 5 toques/s y atrapa el 60 % de las chispitas; quien no toca (*idle*) recoge
con pipetas.

| Momento | idle | planner (≈2 toques/s) | tapper (5/s) | kid (ráfagas de 8/s, 70 % de aciertos) |
|---|---|---|---|---|
| **Sesión 1** (`P` ≈ 4, 15 s, mínimo de 1 por toque) | 33 (hoy; sin pipeta, la mayor parte espera en gotas llenas) | ~100 (hoy 72) | **~210** (×3 sobre el planner de hoy) | ~160 |
| **Media partida** (`P` = 1 000, ruta Pulso a 0) | 1,00 P | ~1,27 P | **1,52 P** | ~1,4 P |
| **Ruta Pulso completa** (×2,5 · ×1,75 · cada 6) | 1,00 P | ~1,9 P | **2,93 P** | ~2,4 P |

Desglose del tapper con la ruta completa: gotas 1,75 P; Pulsos 5 × 0,0625 × 1,75 = 0,55 P; Chispazos
4 × 0,0625 × 1,75 × 5/6 = 0,36 P; chispitas 5 × 0,0625 × 1,75 × 0,6 × 5/6 = 0,27 P. **Total ≈ 2,9 P.**

**El arco** es el de AdVenture Capitalist: al principio **el dedo manda** (×2–3), y con pipetas y Árbol quien mira se
acerca a ×1/1,5–1/3 de quien toca. Nunca baja de lo que gana hoy.

**Datos:** la luz de la sesión 1 sube, pero sus Datos casi no (21 → ~23–26): allí manda el premio de especie nueva
(+10). En la media partida, el planner gana un ~+25 %, así que la historia acabaría ~1–2 sesiones antes. Para eso
están las puertas de §5.5.

### 5.4 El bot (`scripts/sessionBotCore.ts`, `scripts/session-bot.ts`)

**Modelo del Pulso** (el bot avanza en pasos `DT` = 0,5 s; la racha se calcula en forma cerrada en cada paso):
- `aciertos = min(τ, TAP_HITS_MAX_PER_S) · DT`. Con `τ > 1/STREAK_GRACE_S`, `n` sube hasta su tope; si no, se vacía.
- `luz_toques = aciertos · pulso(P) · m_racha · (1 + (CHISPAZO_MULT − 1)/EVERY)`.
- Chispitas: `(aciertos/EVERY) · CHISPAZO_MOTES` por paso. Las atrapa con probabilidad `q`; el resto se posan.
- Todo pasa por las **acciones reales** del juego (`pulse`, `catchMote`, `sow`), como ya hace con `collect`: el bot
  juega el juego integrado.

| Política | Toques | Siembra | Árbol | Qué demuestra |
|---|---|---|---|---|
| **planner** (cambia) | Las gotas maduras como hoy (≤ 3/s) **+ 1 Pulso/s** en la criatura con más gota. | `sow()` (sitio seguro), no `seedAt(freeSpot)`. | Su `PLAN`, con **Pulso I** después de la Pipeta. | El jugador sensato gana algo más sin cambiar de estilo. |
| **tapper** (nueva) | **5 aciertos/s** seguidos en la sesión (`TAPPER_HITS_PER_S` = 5), chispitas con q = 0,6, Destello con 0,5. | `sow()` | `PLAN`, pero la ruta ✦ Pulso va justo después de la Pipeta y de Más tiempo. | Que tocar mucho paga y que no rompe la curva. |
| **kid** (cambia) | Ráfagas de 3 s a 8 toques/s con 70 % de aciertos y 2 s de descanso (`KID_BURST_S` = 3, `KID_REST_S` = 2). | `sow()` cada 0,6 s si se puede: **ya no siembra al azar en cualquier punto**. | Al azar, como hoy. | Que un niño que toca a lo loco ya no se hace daño. |
| **greedy** | Como planner. | `sow()` | Lo más barato. | Sin cambios de criterio. |
| **idle** | **Ninguno**, como hoy. | `sow()` | `IDLE_PLAN` | **Que no pierde nada.** |

**Columnas nuevas del informe:** `tap %` (luz de Pulsos, Chispazos y chispitas, más el extra de la racha),
`mejor racha`, `chispazos`, `devueltas` (luz de semillas que no prendieron), `muertes vivas` y `fusiones` por sesión.

### 5.5 Puertas (antes y después, `npx vite-node scripts/session-bot.ts 80 7 --runs`; planner y tapper con `80 15`)

| # | Puerta | Meta |
|---|---|---|
| G1 | REGLA DURA (mediana) | 0 bajones en planner, tapper, greedy e idle (este desde su 1.ª Pipeta) |
| G2 | El ocioso no pierde | En cada sesión, la luz del idle es ≥ la de la línea base con el mismo Árbol (mismas compras) |
| G3 | Tocar paga | tapper/idle (mismo Árbol): ≥ ×1,8 en S1–S5; entre ×1,3 y ×2 en las noches 3+ sin ruta Pulso; ≤ ×3,2 con la ruta completa |
| G4 | Tocar a lo loco paga | luz del kid ≥ la del planner en S1–S5; noche 3 en S12 (se mantiene) |
| G5 | Ritmo de la historia | planner 1,5–2,2 h (se mantiene); tapper ≥ 1,3 h |
| G6 | Sesión 1 | planner ≥ 60 luz, ≥ 15 Datos, ≥ 3 compras, 1.ª compra ≤ 45 s (se mantiene) |
| G7 | Menos muertes | fusiones por sesión del kid: −50 % o más frente a la línea base; las del planner, sin subir |
| G8 | Crecimiento | ×1,5–3 por sesión en las noches 1–2 (se mantiene) |

**Mandos si algo no cumple**, en este orden:
1. `PULSE_SECONDS` (0,025 ± 0,01);
2. `STREAK_STEP`;
3. los precios de Racha larga y Chispazo seguido;
4. solo después, `TREE_RING_START`.

`DATOS_ESSENCE_DIV` **no se toca**: el texto «25 de luz = 1 Dato» es del jugador.

**Línea base de hoy** (`bot-baseline-10x3.txt`, 10 sesiones × 3 corridas):

| Política | Luz S1 … S5 | Nota |
|---|---|---|
| planner | 72 · 132 · 269 · 290 · 305 | |
| kid | 68 · 158 · 292 · 380 · 742 | Luego S7 ×0,97 y S9 ×0,45 (en S9 cambia de mundo al azar) |
| idle | 33 · 15 · 72 · 126 · 134 | En S1–S3, antes de la Pipeta, el 70–86 % de su producción espera en gotas llenas (fuera del alcance de este plan; la puerta del idle empieza en su Pipeta, como en ADR-030) |

---

## 6. Lo que se ve en pantalla, sesiones 1–3

Las líneas de VELA tienen ≤ 12 palabras (`script.test.ts`). Las cifras son las del modelo de §5.3.

### 6.1 Sesión 1: 0:15 de juego; el tutorial va con el reloj parado (ADR-030)

| Paso | Estado | VELA o rótulo (es / en) | Lo que ve el niño | Se va cuando |
|---|---|---|---|---|
| 1 | `ready`, placa vacía | «Hola. Soy VELA, el monitor de esta placa.» / "Hello. I'm VELA, this dish's monitor." | Abajo, el **botón Sembrar** (64 px, una semilla que brilla) con «Gratis». | Toque |
| 2 | Igual | «Toca la semilla para sembrar.» / "Tap the seed to sow it." | Una mano sobre el botón. | Toca el botón |
| 3 | La semilla vuela al centro (arco de 300 ms) y nace (plantilla segura) | «Está naciendo… un momento.» / "It's being born… one moment." | Anillo de luz y el arco «Naciendo…». | Se enciende |
| 4 | Estable | «¡Vive! Es tu primera criatura.» / "It's alive! Your first creature." | Pulso «¡Viva!». | Toque |
| 5 | Pausa `story`; el Pulso funciona con la placa parada | **«Tócala: brilla y te da luz.»** / "Tap it: it glows and gives you glow." | La mano sobre la criatura. Al tocar: brillo, «+1», motas al contador y una nota. Estos toques pagan el mínimo (+1): el niño ve el número desde el primero. | 3 toques (o 6 s) |
| 6 | Igual | **«¡Más! Toques seguidos dan más luz.»** / "More! Taps in a row give more glow." | Aparece el chip **«Racha ×1,08»** con sus 10 puntitos. Cada toque, una nota más alta. | Sola, a los 2,5 s |
| 7 | `startClock()` | «Tu reloj empieza ahora: tienes 15 segundos.» / "Your clock starts now: you have 15 seconds." | El reloj se pone azul. | Sola, a los 2,5 s |
| 8 | Juego libre | Al 10.º toque seguido: **«¡CHISPAZO! +5»** / "FLASH! +5". La primera vez, rótulo de 2 s: «Cada 10 toques seguidos, ¡un Chispazo!» / "Every 10 taps in a row: a Flash!" | Sacudida suave y acorde. Los puntitos vuelven a cero. | — |
| 9 | Con ≥ 4 de luz o semillas gratis | El botón late: «Sembrar · 4 de luz» / "Sow · 4 glow". | La 2.ª y la 3.ª semilla (seguras) vuelan a huecos libres. **Nunca** sale «Muy cerca». | — |
| 10 | «¡Tiempo!» | «Recojo la luz que quedó.» / "I'll collect the glow that's left." | Las gotas vuelan al contador. | Informe |
| 11 | Informe | Línea nueva: **«Tu dedo: 74 toques · mejor racha ×1,25 · 4 Chispazos · +96 de luz»** / "Your finger: 74 taps · best streak ×1.25 · 4 Flashes · +96 glow" | — | — |

**El niño aprende:** «toco y brilla; si sigo tocando, da más; la semilla se siembra con el botón».
Se borran «Toca la placa para poner una semilla de luz.» y «¡Hizo luz! Tócala para recogerla.»: tocar la criatura ya
recoge su gota.

### 6.2 Sesión 2: 0:25–0:35, Mundo 1, ya se venden Nutrientes

| Momento | Rótulo (es / en) | Lo que ve |
|---|---|---|
| Tarjeta de inicio | «Nuevo: un Chispazo suelta chispitas. ¡Atrápalas!» / "New: a Flash throws out glimmers. Catch them!" | El retrato de la Nevera y «¡Empezar!» (como hoy). |
| Primer Chispazo | La primera vez, junto a las chispitas: «¡Atrápalas!» / "Catch them!" | 5 chispitas del color de la criatura. Atrapar una: «+1» y un toque más de racha. Las que no, se posan como gotitas. |
| Primera vez que arrastra (o al 3.er toque del botón) | Mano que arrastra la semilla: «También puedes arrastrarla.» / "You can drag it too." | Mientras arrastra: verde suave donde se puede y rayado donde no. Al soltar en rayado, la semilla salta al verde más cercano y sale «Aquí cabe mejor» / "There's more room here" (una vez). |
| Una semilla no prende | «No prendió · +4 de vuelta» / "Didn't take · +4 back" | Fundido gris y una moneda vuelve al contador. En el botón se enciende un puntito «●○». |
| La primera vez de todas | Chip, sin pausa: «Aprendiste: no todas prenden. +2 Datos» / "You learned: not every seed takes. +2 Data" | El +2 vuela al chip de Datos. |
| 2 fallos seguidos | En el botón: «¡Esta prende seguro!» / "This one will surely take!" | Anillo dorado en el botón. |
| Informe | «Tu dedo: 160 toques · mejor racha ×1,25 · 9 Chispazos · chispitas 27 de 45» / "Your finger: 160 taps · best streak ×1.25 · 9 Flashes · glimmers 27 of 45" y, si las hubo, «Semillas que no prendieron: 2 (te devolví 8 de luz)» / "Seeds that didn't take: 2 (8 glow back)" | — |

### 6.3 Sesión 3: primera compra de Pulso, nadadoras, el primer choque

| Momento | Rótulo (es / en) | Lo que ve |
|---|---|---|
| Árbol tras la sesión 2 | En «Puedes comprar»: **«Pulso · 2 Datos · Un toque ×1 → ×1,5»** / "Pulse · 2 Data · A tap ×1 → ×1.5" | La ruta ✦ brilla. La ficha dice «AHORA +1 → CON UN NIVEL MÁS +2» con la luz de la última sesión. |
| Tarjeta de inicio | «Gracias a Pulso, cada toque da más.» / "Thanks to Pulse, every tap gives more." | — |
| Dos nadadoras van a chocar | **«¡Van a chocar! Arrastra una»** / "About to bump! Drag one away" | Enlace rojo que late, un icono de mano en la nadadora y un tono suave. |
| La guía y no chocan | **«¡Salvada! Racha +5»** / "Saved! Streak +5" | Los puntitos de la racha saltan 5 y suena un «tin-tin». |
| No la guía y se funden (1.ª vez de todas) | Lámina con pausa «**¡Se juntaron!**» / "They merged!" con tres líneas: «Al tocarse, dos criaturas se hacen una mancha sin forma.» / "When two creatures touch they become one shapeless blob." · «Su luz quedó en la placa: ¡recógela!» / "Their glow stayed on the dish: collect it!" · «Aprendiste por qué pasa: +2 Datos» / "Now you know why: +2 Data" | Al cerrar: una gota grande y brillante con «+18», y la mancha con contorno ámbar «VELA la vigila» / "VELA is watching it". |
| La mancha se disuelve | «VELA disolvió una mancha que crecía sin parar» / "VELA dissolved a blob that kept growing" (solo si la lisis actúa) | — |
| Choques siguientes | «Se juntaron · su luz quedó aquí» / "They merged · their glow stayed here" (2 s, sin pausa) | — |
| Informe | «Salvaste a 1 · se juntaron 1 · su luz: +18» / "You saved 1 · 1 merged · their glow: +18" | Un consejo positivo de VELA: «¡Guiar a las nadadoras las salva!» / "Steering swimmers saves them!" |

---

## 7. Viabilidad en este código

### 7.1 Archivos que cambian

| Módulo | Archivo | Cambio |
|---|---|---|
| **game** | `src/game/pulse.ts` (**nuevo**, puro) | Estado de la racha: `n`, reloj de gracia, ventana de 10 toques/s, contador de Chispazo y chispitas. `pulse(P, fx, t)`, `tickStreak(dt, paused)`, `catchMote(id)`, `settleMotes()`. Sin DOM, sin bus, sin azar. |
| | `src/game/collect.ts` | Multiplicador de racha al entrar luz (mano y pipeta; no el barrido); `burst(dropOwner, seconds)`; gota suelta para la chispita posada. |
| | `src/game/game.ts` | Acciones `pulse(id)`, `pulseMany(ids)`, `catchMote(id)` y `sow(opts)`. `sow` elige sitio con `findFreeSpot` o, con `at`, `clearSpotNear` y luego el sitio libre más cercano. Libro de semillas (`seedLedger`: qué semilla dio qué criatura y cuánto costó) para devolver lo pagado; mala suerte (`SEED_FAIL_PITY`); +3 s al morir; Datos de la 1.ª vez; `contactSaved`. Vista: `streak`, `motes` y `sowSpot`. |
| | `src/game/contact.ts` | `Danger.actionable` (una de las dos es una nadadora que el dedo puede guiar). |
| | `src/game/session.ts` | Estadísticas de la sesión (`taps`, `bestStreak`, `chispazos`, `motes`, `saved`, `refunds`) y líneas del informe. |
| | `src/game/cycleBalance.ts` | Constantes de §5.2. |
| | `tree.ts`, `treeText.ts` | 3 nodos y el nombre de la ruta («Pulso»). |
| | `content.ts` | Textos de §10.4. |
| | `clarity.test.ts` | Guarda de broncas: ningún `Text` de sesión dice «Muy cerca», «se fundirían» ni «¡Cuidado!». |
| **ui** | `src/ui/dishTap.ts` | Rutas: `pulse` (criatura estable), `grey` (forma), `collect`, `catch` (chispita), `ripple` (vacío). `sow` sale de las sesiones. El barrido devuelve también las criaturas que cruza. |
| | `src/ui/input.ts` | En sesiones, sin la espera del doble toque. Un toque de < 180 ms es toque aunque el dedo resbale hasta 24 px (si no, a 8 toques/s el dedo «arrastra» sin querer y guía a la nadadora). |
| | `src/ui/fx/pulse.ts` (**nuevo**) | Destello del halo, «+N» que escala con la racha, Chispazo (hit-stop de 60 ms, sacudida de 0,15) y chispitas. Todo en pools, sin memoria nueva por fotograma. |
| | `src/ui/overlay.ts` | Dibuja los anteriores; contorno ámbar de la mancha; enlace con o sin texto; huella; arco ámbar «Le cuesta…». |
| | `src/ui/sowButton.ts` (**nuevo**) | El botón, su arrastre con zonas seguras (vista previa con `safeSowSpot`) y los puntitos de mala suerte. Sustituye a la píldora de siembra. |
| | `deathLabel.ts`, `session/hud.ts`, `session/summary.ts`, `ui.ts`, `i18n.ts`, `ui.css` | Textos nuevos, chip de racha, líneas del informe y conexiones. |
| **audio** | `src/audio/sfx.ts` | `pulse`: un grado por toque de racha, en la escala del dron, que vuelve a la octava. `chispazo`: un acorde. `refund`: un blip suave. `saved`: dos notas. |
| **story** | `src/story/script.ts` | Tutorial de §6.1 (pasos 2, 5 y 6 nuevos). |
| **main** | `src/main.ts` (integrador, ≤ 15 líneas, fuera del bucle de incubación y del ritmo de fotogramas) | `onDishTap` ya no siembra en sesiones; `onSow(at?, big?)` → `game.actions.sow` → `bus.emit('dishSeed')`; el evento `pulse` llega al audio. |
| **scripts** | `sessionBotCore.ts`, `session-bot.ts` | §5.4. Nuevo `scripts/vigor-calibrate.ts` (CPU, §7.3). |
| **sim / detect** | — | **Nada.** |

### 7.2 Lo que no debe cambiar

- La regla `A ← clip01(A + dt·G(K∗A))`, el núcleo, el crecimiento y `dt` (ADR-002). El Pulso **no escribe en el
  campo**: ni materia, ni μ, ni σ, ni giros.
- El estado RGBA16F, una foto cada 10 pasos, sin `readPixels` por fotograma y «la placa nunca avanza a ciegas»
  (ADR-025). El brillo se dibuja en el overlay de Canvas 2D, no en la textura de la simulación.
- El deflector y el dedo guía: `steer.ts` sigue por debajo de `maxCurl` y nunca hacia el cristal. «Salvada» solo
  **lee** si hubo guía; no añade giros.
- El detector, sus 400 / 800 pasos, «solo paga lo estable» y «la sopa uniforme da 0», **también para los toques**.
- La cámara rápida (ADR-027) y el reloj que cuenta tiempo de placa.
- Contratos: **solo añadidos opcionales** (§10.3). `seedAt` se queda (lo usan la Copiadora, el bot y el ciclo clásico).
- Los Datos son la luz hecha ÷ 25 (`DATOS_ESSENCE_DIV`).

### 7.3 Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| **Rendimiento:** 10 toques/s, cada uno con brillo, «+N», motas y nota | Media | Pools de tamaño fijo (≤ 24 «+N», ≤ 40 motas, ≤ 15 chispitas); a partir de 6 toques/s se juntan los «+N» de 100 ms en uno. Test e2e: el suelo de 30 fps con un toque sintético cada 100 ms y `SESSION_SIM_PACE`. |
| **Inflación:** la historia acaba demasiado pronto | Media | Puertas G5/G3 y mandos de §5.5. El idle no cambia, así que la parte de abajo de la curva está garantizada. |
| **Toque frente a guía:** a 8 toques/s el dedo resbala y guía sin querer | Media | Umbral de tiempo en `input.ts` (< 180 ms = toque) y test con secuencias de punteros grabadas. |
| **Avisar mal que una semilla «le cuesta»** | Alta, sin medida | `scripts/vigor-calibrate.ts`: 2 000 semillas en CPU (Gotero 0–3, Mundos 1–3); masa y complejidad a los pasos 40/80/120 frente al resultado. Se activa solo si una regla da ≥ 85 % de acierto con ≥ 1 s de margen. Si no, **no se avisa** (es barata y devuelve la luz). |
| **Libro de semillas:** asociar la semilla con la criatura | Baja | En el primer informe, la recién nacida a < 1 R de una semilla reciente (`recentSeeds` ya guarda el sitio y lo pagado) hereda su precio. Test con informes falsos. |
| **Fatiga, o que la luz dependa de machacar** | Media | Tope de 10/s, la gracia de 1 s, «Pulso fácil» y «Recoger la luz sola». El idle no pierde nunca (G2). |
| **«Salvada» en falso** (el deflector la habría salvado igual) | Baja | Solo cuenta si el jugador guió a una de las dos durante el aviso y la pareja era `actionable`. Da un premio pequeño (racha +5), sin Datos. |
| **Ruido en la REGLA DURA** | Baja | Chispazo fijo, sin azar nuevo. |
| **Choque con P1–P3 o con el ingeniero de rendimiento** | Baja | No se toca `src/sim/`, `vector/*`, el arte ni el bucle de incubación; `main.ts`, solo en los ganchos. |

---

## 8. Paquetes de trabajo

### 8.0 Reglas

- **Paso 0 (integrador)**, un commit pequeño:
  1. contratos opcionales de §10.3 en `types.ts` y `bus.ts` (**solo añadidos**);
  2. ADR-031 como *Proposed*;
  3. copia de este plan a `docs/MECANICAS.md`.
- **Orden de fusión:**
  1. paso 0;
  2. **PA-textos** (las claves de §10.4, el primer día);
  3. PA, PB y PC en paralelo;
  4. **PA-balance** al final, con los informes del bot antes y después;
  5. el integrador aplica las correcciones de la GDD (§10.2);
  6. QA ingenuo en caja negra, con la consigna «toca todo lo que puedas, lo más rápido que puedas».
- **Cada test se escribe antes que su código.** Cada hallazgo de QA lleva primero un test que falla (`CLAUDE.md` regla 9).
- **Nadie toca `src/sim/` ni `src/detect/`.**

### 8.1 PA · Reglas del juego y bot

**Archivos (exclusivos):** `src/game/**` (sobre todo `pulse.ts` nuevo, `collect.ts`, `game.ts`, `contact.ts`,
`session.ts`, `cycleBalance.ts`, `tree.ts`, `treeText.ts`, `content.ts`, `clarity.test.ts`), `scripts/sessionBotCore.ts`,
`scripts/session-bot.ts`, `scripts/vigor-calibrate.ts` (nuevo), `docs/RITMO.md` §10 (informe).

**Tests primero:**
- `pulse.test.ts`:
  - «with only uniform soup a thousand taps yield zero light»;
  - «a tap on a forming seed pays nothing and keeps the streak»;
  - «the tenth hit of a streak is a Chispazo worth five pulses»;
  - «a pause in tapping drains the streak, never resets it at once»;
  - «the streak is frozen while the dish is paused»;
  - «hits above ten a second pay nothing»;
  - «a tap scales with the dish's light and never falls below one».
- `collect.test.ts`:
  - «a pipette's drop is worth the streak while it lasts»;
  - «the final sweep is never multiplied»;
  - «an uncaught glimmer settles as a loose drop: light on screen is never taken away».
- `game` (nuevos `sow.test.ts` y `deaths.test.ts`):
  - «sow places a seed clear of every body, its path and the glass»;
  - «a seed dragged onto a creature lands on the nearest safe spot and is never refused»;
  - «a seed that never takes gives back what it cost»;
  - «after two failures in a row the next seed is sure»;
  - «a living creature that dies leaves three seconds of its light in its drop»;
  - «an erased creature leaves only its drop»;
  - «the first fusion ever pays two Datos once».
- `contact.test.ts`: «a danger is actionable only when a swimmer can be steered».
- Bot (`tests/unit`): «idle light never falls below the baseline with the same tree»; «tapper beats idle by at least
  ×1.8 in sessions 1–5».
- `clarity.test.ts`: «no session text scolds (Muy cerca, se fundirían, ¡Cuidado!)».

**Hecho cuando:**
- todos los tests están en verde;
- `npm run typecheck`, `npm test` y `npm run build` pasan;
- el informe antes y después (`80 7 --runs`, planner y tapper `80 15`) cumple G1–G8 o dice qué no cumple y por qué;
- hay una tabla de 62 nodos (`scripts/tree-table.ts`);
- la calibración del aviso de «le cuesta» está hecha, con su veredicto (activar o no).

### 8.2 PB · Tacto de la placa (overlay, gestos, jugo y audio)

**Archivos (exclusivos):** `src/ui/dishTap.ts`, `src/ui/input.ts`, `src/ui/overlay.ts` (sus regiones de dibujo de la
placa), `src/ui/fx/pulse.ts` (nuevo) y su test, `src/ui/fx/drops.ts` (la gota de las muertes), `src/ui/fx/shake.ts`
(trauma del Chispazo), `src/audio/sfx.ts`.

**Tests primero:**
- `dishTap.test.ts`:
  - «a tap on empty agar never sows»;
  - «a tap on a stable creature is a pulse»;
  - «a tap on a forming seed is grey and never sows»;
  - «a swipe pulses each creature it crosses once per 0.3 s»;
  - «a glimmer under the finger is caught before the creature behind it».
- `input.test.ts`: «a 150 ms touch that slides 20 px is still a tap»; «in sessions a tap is never delayed by the
  double-tap wait».
- `fx/pulse.test.ts`: tiempos y tamaños puros (brillo de 250 ms, el «+N» crece un 4 % por toque hasta ×1,4,
  *Reducir movimiento* sin escala ni sacudida); «pools: 600 taps allocate nothing after warm-up».
- `sfx` (`dsp.test.ts`): «each hit of a streak is one scale step higher and wraps at the octave»; «a Chispazo plays a
  chord of the current harmony».

**Hecho cuando:**
- e2e en el móvil emulado con un toque sintético cada 100 ms durante 20 s: **≥ 30 fps** con la cámara rápida, sin
  `readPixels` nuevo;
- capturas de las sesiones 1–3 (Pulso, Chispazo, chispitas, mancha vigilada, huella) en `release-checks`;
- *Reducir movimiento* respetado.

### 8.3 PC · Siembra, muertes explicadas, HUD, tutorial y ganchos de `main.ts`

**Archivos (exclusivos):** `src/ui/sowButton.ts` (nuevo) y su test, `src/ui/sowHint.ts` (reutiliza `safeSowSpot` para
la vista previa), `src/ui/deathLabel.ts`, `src/ui/session/hud.ts` (chip de racha), `src/ui/session/summary.ts`,
`src/ui/ui.ts` (conexiones), `src/ui/i18n.ts`, `src/ui/ui.css`, `src/story/script.ts` (tutorial), y **los ganchos de
`src/main.ts`** en un solo PR de ≤ 15 líneas.

**Tests primero:**
- `sowButton.test.ts`:
  - «tapping the button sows at the safest spot»;
  - «a full dish greys the button and names the Placa upgrade»;
  - «three failures light the sure-seed ring after the second»;
  - «holding the button sows a big seed only when bought».
- `deathLabel.test.ts`: «every death names its cause and what it left behind»; «a runaway blob says VELA dissolved it
  and pays nothing».
- `script.test.ts`: «session 1 teaches sow → pulse → streak before the clock starts»; «every line has twelve words or
  fewer».
- `summary` (test de la vista): «the report shows taps, best streak and Flashes in both languages».
- e2e `session-play`: «a child who taps the dish thirty times in a row never sows a seed».

**Hecho cuando:**
- la sesión 1 se juega entera con el botón y el Pulso en `session-play` (escritorio y móvil);
- ningún texto de sesión regaña;
- `SINGLE=1 npx vite build` pasa;
- `node tests/e2e/smoke.mjs --single --shots` deja capturas de los pasos de §6.1.

### 8.4 Quién usa qué de quién

| Necesita | De | Cómo, mientras no llega |
|---|---|---|
| PB y PC: las acciones `pulse`, `catchMote`, `sow` y las vistas `streak`, `motes` | PA (contratos del paso 0) | Con `src/ui/mock.ts`: una racha falsa que sube con cada toque. |
| PC: el evento `pulse` para el chip y el informe | PA | Bus del paso 0. |
| PB: la gota de las muertes | PA (`burst`) | Ya se dibuja una gota suelta (ADR-030); solo cambia la cantidad. |

---

## 9. Lo que decide el dueño

1. **Sembrar pasa a un botón y tocar la placa ya nunca siembra.**
   - **Recomendado:** botón «Sembrar» con sitio seguro automático y arrastre que se ajusta solo.
   - Alternativa: seguir sembrando con un toque en el vacío, pero recolocando siempre la semilla. Es peor: el niño que
     toca mucho seguiría sembrando sin querer.
   - Cambia la GDD §7 («un dedo siempre siembra») y el primer gesto del tutorial.
2. **Cuánto más gana quien toca mucho.**
   - **Recomendado:** en la sesión 1, unas 3 veces la luz de hoy; ×1,5 a media partida y como mucho ×3 con la ruta Pulso completa. Quien no toca
     gana lo de hoy o más.
   - Alternativas: más suave (×1,25–×2), o sin tope, como Cookie Clicker. Sin tope, mirar deja de valer.
   - Cambia la frase de la GDD §1 «se progresa… no tocando más rápido».
3. **El Chispazo es fijo, cada 10 toques seguidos.**
   - **Recomendado:** fijo. Se ve venir con 10 puntitos, un niño lo cuenta y no mete suerte en la economía. La sorpresa
     la sigue poniendo el Destello.
   - Alternativa: crítico al azar (10 %, ×5). Da lo mismo de media, pero no se ve venir.

---

## 10. Anexos

### 10.1 ADR-031 (borrador, house format)

> ## ADR-031: The tap is a pulse: tapping never sows, streaks pay, and every loss gives something back
>
> - **Status:** Proposed (v0.025 plan, `docs/MECANICAS.md`). Amends ADR-030 (gestures, Destello reveal), GDD §1, §7, §20,
>   §23.4, §23.5. Source: owner («es algo aburrido que se mueran sin entender por qué … dar muchos click debería ser
>   emocionante y no un castigo»); QA-CLARIDAD-2 §2c, §4.
> - **Context:** a tap on empty agar sowed a seed: it cost Luz, filled the nursery, and was refused with «Muy cerca: se
>   fundirían» next to other matter. A random seed takes 24 % of the time at Gotero 0 (`SEED_SUCCESS`). Tapping a drop
>   twice gained nothing (a drop holds what its creature made). Tapping fast was risky and never rewarding, and most
>   deaths were the player's own taps.
> - **Decision:**
>   - In sessions a finger on the dish never sows. A tap on a **stable** creature is a *pulse*: it adds
>     `PULSE_MULT · max(PULSE_MIN, PULSE_SECONDS · P)` Luz (`P` = the dish's Luz/s), collects its drop and adds one hit
>     to a **streak**. The streak multiplies all Luz that comes in while it lasts (`1 + STREAK_STEP · n`, capped), drains
>     after `STREAK_GRACE_S` and never resets at once. Every `CHISPAZO_EVERY`-th hit pays ×`CHISPAZO_MULT` and throws
>     glimmers; a glimmer not caught settles as a loose drop.
>   - Sowing is a button: the game picks the safest free spot (`findFreeSpot`), or the nearest safe spot to where the
>     seed is dragged; it is never refused for spacing.
>   - A seed that never becomes stable refunds its price, and after `SEED_FAIL_PITY` failures the next seed is sure. A
>     stable creature that dies of glass, fusion or lost shape adds `DEATH_BURST_SECONDS` of its Luz/s to its drop. The
>     first death of each cause ever pays `FIRST_ACCIDENT_DATOS`. A contact is worded only when the player can act.
>   - The ✦ route is renamed «Pulso» and gains Pulso, Racha larga and Chispazo seguido (visible from session 1).
>   - **No simulation or detector change:** the pulse is drawing plus economy. It writes nothing to the field. Only
>     stable creatures pay, and uniform soup yields 0 under any number of taps.
> - **Consequences:**
>   - New hard gates: «a tap on anything but a stable creature pays nothing», «an idle player never earns less than
>     before».
>   - The session bot gains the `tapper` policy and gates G1–G8 (`docs/MECANICAS.md` §5.5). The kid sows through `sow()`.
>   - Contracts: optional additions only (§10.3). `TEXT.seedTooClose` stays for the classic loop only.
>   - The one-touch double-tap wait leaves the dish (the big seed is a double tap on the button).

### 10.2 Correcciones de la GDD («Corrección v1.5, ADR-031»)

- **§1, frase y pilar 4:** «se progresa descubriendo y estabilizando criaturas, no tocando más rápido» →
  «se progresa descubriendo criaturas; **tocarlas las hace brillar y da más luz**, y quien prefiere mirar avanza con
  las pipetas».
- **§1, pilar 5:** se añade «quien no toca nunca gana menos que antes».
- **§7, tabla y reglas:**
  - el toque en el vacío ya no siembra;
  - filas nuevas: Pulso, botón Sembrar, arrastrar la semilla, barrido que hace brillar;
  - «un dedo siempre siembra» → «un dedo nunca siembra: se siembra con el botón».
- **§20:** la política `tapper` y las puertas G1–G8.
- **§23.4:** racha, Chispazo, tono que sube y sacudida solo en el Chispazo.
- **§23.5:** la racha multiplica también lo que recogen las pipetas; la chispita posada.
- **§23.6 (nueva): «Muertes que enseñan»**, con la tabla de §4.

### 10.3 Añadidos opcionales a los contratos (paso 0; `CLAUDE.md` regla 1: no se quita nada)

```ts
// src/core/types.ts — GameActions (all optional)
pulse?(creatureId: number): number;            // Luz the pulse paid (0: not stable, over the rate cap, no session)
pulseMany?(creatureIds: number[]): number;     // a swipe across creatures
catchMote?(moteId: number): number;
sow?(opts?: { at?: { x: number; y: number }; big?: boolean }): SeedSpec | null;   // safe spot; never refused for spacing
noteSteer?(creatureId: number): void;          // the player guided this swimmer (for "Salvada")

// GameView (all optional)
streak?: { hits: number; max: number; mult: number; toChispazo: number; every: number; draining: boolean };
motes?: { id: number; x: number; y: number; age: number; life: number; owner: number | null }[];
sowSpot?: { x: number; y: number } | null;     // where the button would sow now (null: no room)
seedLuck?: { fails: number; need: number };    // pity dots on the button
// existing `dangers` entries gain: actionable?: boolean

// src/core/bus.ts (new events)
pulse: { id: number; x: number; y: number; amount: number; hits: number; chispazo: boolean };
moteCaught: { id: number; x: number; y: number; amount: number };
seedRefund: { x: number; y: number; amount: number; free: boolean };
deathBurst: { id: number; x: number; y: number; amount: number; cause: 'glass' | 'touch' | 'lost' };
contactSaved: { a: number; b: number };
accidentLearned: { cause: 'faded' | 'touch' | 'glass' | 'lost' | 'runaway'; datos: number };
```

### 10.4 Claves de texto nuevas (las escribe PA en `content.ts` / `treeText.ts`, es y en, el primer día)

| Clave | es | en |
|---|---|---|
| `sow` | Sembrar | Sow |
| `sowFree` / `sowCost(n)` | Gratis / {n} de luz | Free / {n} glow |
| `sowFull(n)` | Llena ({n} de {n}) | Full ({n} of {n}) |
| `sowSnap` | Aquí cabe mejor | There's more room here |
| `sowSure` | ¡Esta prende seguro! | This one will surely take! |
| `tutSow` | Toca la semilla para sembrar. | Tap the seed to sow it. |
| `tutPulse` | Tócala: brilla y te da luz. | Tap it: it glows and gives you glow. |
| `tutStreak` | ¡Más! Toques seguidos dan más luz. | More! Taps in a row give more glow. |
| `tutDrag` | También puedes arrastrarla. | You can drag it too. |
| `streak(m)` | Racha ×{m} | Streak ×{m} |
| `streakMax` | ¡Racha máxima! | Max streak! |
| `streakLine(m)` | ×{m} por tu racha | ×{m} from your streak |
| `chispazo(n)` | ¡CHISPAZO! +{n} | FLASH! +{n} |
| `chispazoHint` | Cada 10 toques seguidos, ¡un Chispazo! | Every 10 taps in a row: a Flash! |
| `motesNew` | Nuevo: un Chispazo suelta chispitas. ¡Atrápalas! | New: a Flash throws out glimmers. Catch them! |
| `motesCatch` | ¡Atrápalas! | Catch them! |
| `refund(n)` | No prendió · +{n} de vuelta | Didn't take · +{n} back |
| `struggling` | Le cuesta… | Struggling… |
| `contactAct` | ¡Van a chocar! Arrastra una | About to bump! Drag one away |
| `saved` | ¡Salvada! Racha +5 | Saved! Streak +5 |
| `mergedLeft` | Se juntaron · su luz quedó aquí | They merged · their glow stayed here |
| `glassLeft` | Chocó con el cristal · su luz quedó aquí | Hit the glass · its glow stayed here |
| `lostLeft` | Perdió la forma · su luz quedó aquí | Lost its shape · its glow stayed here |
| `blobWatched` | Mancha sin forma · VELA la vigila | Shapeless blob · VELA is watching it |
| `blobDissolved` | VELA disolvió una mancha que crecía sin parar | VELA dissolved a blob that kept growing |
| `learned(n)` | Aprendiste por qué pasa: +{n} Datos | Now you know why: +{n} Data |
| `learnedSeed(n)` | Aprendiste: no todas prenden. +{n} Datos | You learned: not every seed takes. +{n} Data |
| `mergedCard2` | Su luz quedó en la placa: ¡recógela! | Their glow stayed on the dish: collect it! |
| `finger(t, m, c, n)` | Tu dedo: {t} toques · mejor racha ×{m} · {c} Chispazos · +{n} de luz | Your finger: {t} taps · best streak ×{m} · {c} Flashes · +{n} glow |
| `refundLine(k, n)` | Semillas que no prendieron: {k} (te devolví {n} de luz) | Seeds that didn't take: {k} ({n} glow back) |
| `savedLine(s, m, n)` | Salvaste a {s} · se juntaron {m} · su luz: +{n} | You saved {s} · {m} merged · their glow: +{n} |
| `tipSteer` | ¡Guiar a las nadadoras las salva! | Steering swimmers saves them! |
| `routePulse` | Pulso | Pulse |
| `nodePulse` | Cada toque saca más luz. | Every tap draws more glow. |
| `nodeStreakLong` | Tu racha sube más alto. | Your streak climbs higher. |
| `nodeChispazoOften` | Chispazos más a menudo. | Flashes more often. |
| `pulseThanks` | Gracias a Pulso, cada toque da más. | Thanks to Pulse, every tap gives more. |
| `settingEasyPulse` | Pulso fácil (mantén el dedo) | Easy pulse (hold your finger) |

---

**Fuentes** (todas consultadas para este plan): [Cookie Clicker Wiki, Cookies per Click](https://cookieclicker.fandom.com/wiki/Cookies_per_Click) ·
[Cookie Clicker wiki.gg, Golden Cookie](https://cookieclicker.wiki.gg/wiki/Golden_Cookie) ·
[ClickerHeroes Wiki, Builds](https://clickerheroes.fandom.com/wiki/Builds) ·
[Steam, Clicker Heroes: combo e inactividad](https://steamcommunity.com/app/363970/discussions/0/490124466468680800) ·
[MobyGames, Clicker Heroes](https://www.mobygames.com/game/clicker-heroes) ·
[Giant Bomb, Tap Titans 2](https://giantbomb.com/wiki/Games/Tap_Titans_2) ·
[BlueStacks, guía de Tap Titans 2](https://www.bluestacks.com/blog/game-guides/tap-titans-2/tt2-beginner-guide-en.html) ·
[Wikipedia, Egg, Inc.](https://en.wikipedia.org/wiki/Egg,_Inc.) ·
[r/EggsInc, guía de patashu](https://lr.eu.psf.lt/r/EggsInc/wiki/patashu_guide) ·
[Pocket Gamer, AdVenture Capitalist](https://www.pocketgamer.com/adventure-capitalist/idle-tapper-adventure-capitalist-lets-you-simulate-capitalism-and-get-rich-with) ·
[Mistplay, guía de AdVenture Capitalist](https://www.mistplay.com/blog/adventure-capitalist-guide) ·
[Game Developer, The Math of Idle Games I](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i) y
[III](https://www.gamedeveloper.com/design/the-math-of-idle-games-part-iii) ·
[Monash, Playing to wait](https://research.monash.edu/en/publications/playing-to-wait-a-taxonomy-of-idle-games/) ·
[GDC Vault, Juice It or Lose It](https://gdcvault.com/play/1016487/Juice-It-or-Lose) ·
[Game Developer, Nijman sobre la sensación de juego](https://gamedeveloper.com/design/vlambeer-co-founder-shares-advice-on-building-better-action-games) ·
[GDC Vault, Juicing Your Cameras With Math](https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing) ·
[Wikipedia, Peggle](https://en.wikipedia.org/wiki/Peggle) · [Audiogang, el audio de Peggle 2](https://www.audiogang.org/?p=1798) ·
[Game Developer, Enemy attacks and telegraphing](https://gamedeveloper.com/design/enemy-attacks-and-telegraphing) ·
[VICE, cómo Hades hizo accesible el género](https://www.vice.com/en/article/how-hades-made-a-genre-known-for-being-impossibly-hard-accessible) ·
[PubMed 17565113, bioluminiscencia y cizalla](https://pubmed.ncbi.nlm.nih.gov/17565113/) ·
[Jalaal et al., estímulo mecánico de una célula](https://core.ac.uk/download/323304127.pdf) ·
[Frontiers in Marine Science 2023](https://www.frontiersin.org/articles/10.3389/fmars.2023.1299602/full).
