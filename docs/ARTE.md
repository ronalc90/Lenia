# Biblia de arte de Bioluma

> **Pedido del dueño:** *«El juego debe ser súper intuitivo y fácil para todas las edades y claro… también debe tener
> excelente dibujo y calidad artística, debe ser de un apartado artístico del más alto nivel.»*
>
> Este documento fija la identidad visual del juego. Todo lo que dice está dibujado en código en `src/ui/art/` y se ve
> en vivo en **`art-dev.html`** (`npm run dev` → `/art-dev.html`, parámetros `?theme=light`, `?section=vela`, `?rm=1`,
> `?t=2.5`). Las capturas de referencia salen de `node tests/e2e/art-shots.mjs`.
>
> **Reglas que no se negocian** (CLAUDE.md regla 10, ADR-020): nada de arte generado por IA; todo se dibuja con SVG,
> Canvas 2D, WebGL o CSS; ninguna dependencia nueva; fuentes solo de Google Fonts con su licencia en `CREDITS.md`.
> Móvil primero (390 × 844) y escritorio (1366 × 768), tema claro y oscuro, es/en, *Reducir movimiento*, objetivos
> táctiles ≥ 48 px, contraste AA.

## Índice

1. [El concepto](#1-el-concepto)
2. [Lo que hoy falla (auditoría)](#2-lo-que-hoy-falla-auditoría)
3. [Paleta](#3-paleta)
4. [Tipografía](#4-tipografía)
5. [Iconografía y emblemas](#5-iconografía-y-emblemas)
6. [Personajes](#6-personajes)
7. [Movimiento](#7-movimiento)
8. [La materia y la placa](#8-la-materia-y-la-placa)
9. [Los siete Mundos](#9-los-siete-mundos)
10. [Composición](#10-composición)
11. [Hacer / no hacer](#11-hacer--no-hacer)
12. [Integración: qué cambiar en cada archivo](#12-integración-qué-cambiar-en-cada-archivo)
13. [Licencias](#13-licencias)

---

## 1. El concepto

**Una estación polar en la noche que no termina.** Afuera, cuatro meses de oscuridad y escarcha. Adentro, un
laboratorio de vidrio y acero donde lo único que brilla es la vida de la placa.

Dos luces cuentan la historia, y **nunca se mezclan**:

| Luz | Color | Quién la tiene | Qué significa |
|---|---|---|---|
| **Fría, viva** | cian bioluminoso `#5BC0EB` → índigo | las criaturas, la Esencia, la acción principal | «esto está vivo, tócalo» |
| **Cálida, humana** | vela `#FFB86B`, oro `#FFD166` | VELA (su llama), el Destello, los premios, la Dra. Albor | «alguien te cuida», «¡bien hecho!» |

Los materiales del mundo son tres: **vidrio** (placas, matraces, el cuerpo de VELA: bordes blanco-escarcha, brillo
especular arriba a la izquierda), **escarcha** (en las esquinas, en el borde de la placa, en el Mundo Frío) y **papel
y metal viejo** (las cintas de Albor, el télex del Comité, el cuaderno). La interfaz es un **instrumento**: superficies
oscuras y sobrias que nunca compiten con la placa (GDD §14: la placa es la única fuente de color saturado).

**Para todas las edades** significa: cada concepto tiene **una forma** que se reconoce antes de leer (una gota es
Esencia, una estrella de cuatro puntas es el Destello, una luna es la Noche), cada pantalla tiene **una** acción
principal, y nada importante depende solo del color.

## 2. Lo que hoy falla (auditoría)

Capturas de la v0.009 (build `VITE_E2E=1`) y de las páginas de desarrollo, 390 × 844 y 1366 × 768, oscuro y claro. Los
nombres de archivo son los que generan `tests/e2e/ui-shots.mjs`, `tree-shots.mjs`, `moments-shots.mjs`,
`story-shots.mjs`, `store-shots.mjs` y `sim-check.mjs --dish-shot` (*walls-dish-gpu.png*).

**P0 — rompen la identidad o la claridad**

1. **La llama de VELA es azul fría** (`story-companion.png`): contradice su nombre («vela») y la historia de luz cálida
   contra vida fría. Su cara es tinta oscura sobre vidrio oscuro: a 28–40 px la boca desaparece (`objective` del HUD).
2. **No hay un color de acción principal**: «¡Empezar!», «Ir al Árbol», «¡Entendido!» y los botones de compra son verde
   lima `#8AE234` (`session-start.png`, `session-summary-rich.png`, `moments-card-stable.png`), «Nueva sesión» es cian
   (`tree-mid.png`) y «Plantar otra» es verde oscuro (`ui-light-mobile-species.png`). El ojo no sabe qué importa; el
   lima, además, grita.
3. **Capas mal ordenadas**: el aviso «Toca la placa.», la onda del toque y el halo del borde de la placa se dibujan
   **encima** del modal de Ajustes; burbujas apiladas sobre la barra de objetivo; el botón fijo del resumen tapa el
   total de Datos (`session-summary-rich.png`); la barra «Árbol · Noche 2» tapa un nodo (`tree-mid.png`).
4. **Etiquetas de la placa que chocan**: «aptera cavus pedeParaptera cavus pedes», nombres cortados en el borde, y a la
   vez números flotantes, marcas, chip de mejora y objetivo (`ui-mobile-bestiary-grid.png`).
5. **Cuatro grosores de trazo en los iconos** (1,5 · 1,6 · 1,8 · 2) y emoji mezclados con iconos de línea (⏳ en la
   barra de semilla, 💧 📊 🌙 ✨ en los textos). El Mundo 5 «Discos» usa un icono de hélice de ADN
   (`tree-late-laptop-light.png`).
6. **Los Mundos son solo texto y un borde de color** (`session-start.png`): un niño no puede elegir por cómo se ven.

**P1 — calidad**

7. **La materia se quema a blanco** desde el 70 %: el interior de las criaturas pierde estructura (Scutium e
   Hydrogeminium son manchas blancas en *walls-dish-gpu.png*); el tinte de especie es una mancha rosada o verdosa en el
   centro, no un color de especie.
8. **La placa es una línea gris**: sin vidrio, sin mesa, sin escarcha. En escritorio flota en una columna vacía con el
   botón de pausa huérfano a la izquierda.
9. **Criaturas pixeladas** al ampliar en las tarjetas de Momentos (vecino más cercano) y retratos del Bestiario
   borrosos sobre discos negros, sin el color de su especie (`ui-mobile-bestiary.png`).
10. **Contraste**: «Nadadora» en lima sobre blanco (1,6 : 1, `ui-light-mobile-species.png`); etiquetas de 8–9 px en el
    árbol de escritorio; líneas de ruta finísimas en claro.
11. **Texto de depuración** «v0.009 · 43403d5» encima del HUD en todas las pantallas; marcadores crípticos «▯ —»,
    «🧬 —» y «○○○» sin etiqueta.
12. **Monoespaciada para todo número** («Nv 0/5», «+0/s», «Encontradas 1/2»): parece una herramienta de programador;
    los nombres latinos van en cursiva sintética.
13. **El tema claro no está diseñado**: tarjeta oscura dentro de página clara con dos marcos oscuros anidados; el
    confeti se sale de la placa sobre el HUD.
14. **Retratos**: el papel del télex se corta arriba (`story-dialogue-committee.png`); Albor es un dibujo de línea fino.
15. **Ciencia sin traducir para niños**: «Rango μ 0.142–0.158» con punto decimal en español.
16. **Escritorio**: la tarjeta de inicio es una columna estrecha en un mar negro (`session-start-laptop.png`); el
    resumen son siete cajas con borde dentro de otra caja.

## 3. Paleta

Fuente única: `src/ui/art/tokens.ts` → `src/ui/art/art.css` (generado; variables `--bl-*`). El test
`tokens.test.ts` comprueba **AA** de cada rol de texto sobre `bg`, `surface` y `surface2` en los dos temas.

| Rol | Oscuro («noche polar») | Claro («lámpara encendida») | Uso |
|---|---|---|---|
| `night` | `#06090d` | `#dbe3eb` | bordes de página, detrás de la placa |
| `bg` | `#0b0e12` (GDD) | `#eef2f6` | fondo |
| `surface` / `surface2` / `surface3` | `#141a21` / `#1b232c` / `#24303c` | `#ffffff` / `#f5f8fb` / `#e8eef4` | paneles, tarjetas, pulsado |
| `text` / `text2` / `text3` | `#e6edf3` / `#a7b3bf` / `#7d8995` | `#0f1720` / `#44505d` / `#6b7784` | texto (text3 solo para lo no esencial, ≥ 3 : 1) |
| `accent` · `accentFill` · `accentInk` | `#5bc0eb` · `#5bc0eb` · `#04202e` | `#0a72a6` · `#0a72a6` · `#ffffff` | **la** acción principal, foco, enlaces |
| `candle` | `#ffb86b` | `#a54f08` | VELA, historia, Encargos |
| `gold` | `#ffd166` (GDD) | `#855600` | Destello, premios, récords |
| `aurora` | `#5ee6c8` | `#08745e` | Datos (la aurora polar) |
| `moon` | `#c9d1ff` | `#4a4ea6` | la Noche, capítulos |
| `good` | `#8ae234` | `#2b7210` | «¡nuevo!», «alcanza»; **nunca** relleno grande |
| `warn` / `danger` | `#f2a541` / `#ff7a5c` | `#8f4d00` / `#bf3517` | avisos, peligro |
| `frost` | `#cfe8f5` | `#527d97` | bordes de vidrio, divisores de paneles de vidrio |

**Rutas del Árbol** (`--bl-route-*`, CICLO §4.1): Reloj celeste `#5bc0eb`, Gotero turquesa `#36d6c3`, Placa lavanda
`#8c9eff`, Vida rosa `#ff7fa8`, Descubrir naranja `#ffa552`, Mundos violeta `#c792ff`, Destello dorado `#ffd166`
(los del árbol de hoy, por continuidad); en claro, sus versiones profundas AA (`#0a6f9f`, `#087567`, `#3f4fc4`,
`#b1235a`, `#a14b06`, `#7131c0`, `#855600`).

**Comportamientos** (`--bl-beh-*`): los de `core/palette` en oscuro, profundizados en claro. La forma (círculo, doble
círculo, flecha, espiral, dos puntos, racimo) va siempre con el color.

**La placa es siempre noche** (GDD §14): en el tema claro, el contenedor de la placa, la portada y las cinemáticas usan
la clase `.art-force-dark`.

## 4. Tipografía

| Familia | Para qué | Por qué |
|---|---|---|
| **Inter** (400–800) | toda la interfaz, **todos los números** con `font-variant-numeric: tabular-nums` | legible a 13 px, altura de x grande, cifras tabulares (no hay saltos de layout), ya cargada |
| **Fraunces** (SOFT 100, 500–800, cursiva) | títulos de pantalla, nombres de Mundo, **nombres latinos de especie en cursiva**, carteles de capítulo y finales | una serif blanda, de cuaderno de naturalista: calidez de vela frente al vidrio; la cursiva real da a «*Orbium unicaudatus*» aire de guía de campo. Solo para display (≥ 17 px) |
| **JetBrains Mono** (500, 700) | **solo instrumentos**: el télex del Comité, la versión, lecturas técnicas del Microscopio | la monoespaciada es la voz de las máquinas, no del jugador |

Cambio frente a hoy: los números dejan de ir en JetBrains Mono (salvo instrumentos) y se suma Fraunces. Una sola
petición a Google Fonts (`FONT_URL` en `tokens.ts`). Escala (px, ×1,25 desde 16, a la rejilla de 2):

| Rol | Tamaño / interlínea | Peso | Ejemplo |
|---|---|---|---|
| `caption` | 13 / 18 | 600 | etiquetas de chip, nunca información esencial |
| `small` | 14 / 20 | 500 | descripciones secundarias |
| `body` | **16 / 24** | 500 | texto corriente, diálogo (17 en el globo de VELA) |
| `lead` | 18 / 26 | 600 | líneas de tarjeta |
| `title` | 22 / 28 | 700 | títulos de hoja |
| `headline` | 28 / 34 | 700 | títulos de pantalla (Fraunces) |
| `display` | 36 / 40 | 700 | carteles (Fraunces) |
| `hero` | 48 / 52 | 800 | la cifra grande del HUD y del resumen |

Mínimo para niños: **14 px** para cualquier texto que haya que leer; 16 px para instrucciones. Todo escala con el
tamaño de fuente del sistema hasta 130 % (GDD §13).

## 5. Iconografía y emblemas

`src/ui/art/icons.ts`: **157 iconos**, un solo sistema (iconos de línea) para monedas, las 7 rutas, los 54 nodos del
Árbol (cada uno con dibujo propio, test), los 6 comportamientos, los 7 Mundos, los Momentos, el HUD, los ajustes y la
tienda. Se ve todo en `art-dev.html?section=icons` y, ampliado con su rejilla, en `?section=iconlab`.

**Reglas** (comprobadas por `icons.test.ts`):

- **Rejilla 24**, margen 2 (el dibujo vive entre 1,25 y 22,75 contando el trazo); formas clave: círculo r 8,75,
  cuadrado 16,5, rectángulo vertical 14 × 18.
- **Un solo trazo: 1,75**, puntas y uniones redondas, `currentColor`. *(Propuesta de Corrección GDD §14: «trazo 1,5»
  → 1,75; a 16–20 px el 1,5 se deshace en pantallas 1×, y los niños necesitan siluetas firmes.)*
- **Capa dúo**: una silueta rellena al 20 % (oscuro) / 14 % (claro) (`--bl-ic-fill`) da cuerpo al icono; el
  significado nunca depende de ella.
- **Motivos compartidos** (`geometry.ts`): la gota de Esencia, la estrella de cuatro puntas del Destello, la luna, el
  reloj, el matraz son **idénticos** en todos los iconos que los usan.
- **Nodo = motivo de su ruta + un modificador**: «+» arriba a la derecha (más), una insignia abajo a la derecha (reloj,
  gota, estrella). Así un niño reconoce la familia antes de leer.
- **Comportamientos** = los marcadores de la placa (GDD §14): círculo (quieta), doble círculo (pulsante), flecha
  (nadadora), espiral (giratoria), dos puntos (divisora), racimo (colonia). Las afinidades del Árbol reusan esos
  símbolos con un «+».
- Los colores los pone el CSS (`color:` del contenedor): el color de la ruta en el Árbol, `text` en el HUD.

**Emblemas** (`emblems.ts`): los conceptos clave en color para sustituir los emoji de los textos (💧 📊 🌙 ✨ 📋 🎁 🏆
⏱ 🌱): misma silueta que el icono, degradado de dos tonos del color del concepto, contorno fino oscuro (se leen en
claro y oscuro) y un brillo blanco. Uso: junto a cifras (HUD, resumen, chips de regalo). Nunca como botón.

### Lenguaje de formas por concepto

| Concepto | Forma | Color | Dónde |
|---|---|---|---|
| **Esencia** | gota redonda con brillo abajo a la izquierda | cian | HUD, precios de semilla, resumen |
| **Datos** | tarjeta redondeada con tres barras crecientes | aurora | árbol, resumen, «+N Datos al terminar» |
| **Semilla** | esfera con núcleo y un brote | cian + verde | siembras gratis, Gotero |
| **Mundo** | globo; cada Mundo, su silueta propia (§9) | violeta (ruta) / el tono del Mundo | ruta Mundos, tarjeta de inicio |
| **Noche** | luna creciente con una estrellita | luna | centro del Árbol, capítulos, multiplicador |
| **Destello** | estrella de cuatro puntas cóncava | oro | la chispa, sus nodos, premios |
| **Encargo** | portapapeles con tilde; pinza color vela | vela | barra de objetivo, tarjeta de inicio |
| **Bestiario** | libro con una criatura en la tapa | texto / tono de la especie | pestaña, registro |
| **Árbol** | un nodo central con tres ramas | cian | botón «Ir al Árbol» |
| **Tiempo** | cronómetro | celeste | el reloj de la sesión, ruta Reloj |

## 6. Personajes

Todos se dibujan en Canvas 2D dentro de una caja de 100 × 100 unidades (`src/ui/art/vela.ts`, `cast.ts`;
API idéntica a `src/ui/story/portraits.ts` en `src/ui/art/portraits.ts`). Sin imágenes, sin `Math.random`, sin
`shadowBlur` en el bucle (los brillos son degradados radiales), bordes que se desvanecen (se apoyan en cualquier
panel). *Reducir movimiento* congela el balanceo, el oleaje y el parpadeo de la llama, pero conserva expresiones y la
boca al hablar (test: el mismo fotograma en cualquier instante).

### 6.1 VELA

**Anatomía** (de abajo arriba): matraz de fondo redondo de **vidrio claro** (borde blanco-escarcha, más brillante
arriba donde la ilumina la vela; brillo especular largo a la izquierda; reflejo cálido de la llama en el hombro
derecho) → **líquido bioluminoso** cian→índigo que llena tres cuartos, con burbujas por los costados y dos motas que
brillan (nunca sobre la cara) → cuello corto con labio redondeado → **corcho** (tres tonos de marrón, poros) → **vela
de cera** crema con una gota derretida → **llama cálida**: cuerpo naranja, corazón amarillo, núcleo casi blanco y la
base azul de una vela de verdad. Manos: dos orbes de vidrio flotantes.

**La cara vive sobre el líquido** (no sobre el vidrio): tinta azul noche sobre cian claro se lee a 28 px. Ojos grandes
con iris bioluminoso, pupila profunda y dos brillos (el cálido es la vela, el frío la placa). Rubor rosado.

| Humor | Ojos | Boca | Manos | Llama | Extra |
|---|---|---|---|---|---|
| **neutral** | abiertos, miran despacio | sonrisa pequeña | relajadas a los lados | normal | — |
| **happy** (contenta) | ^ ^ cerrados | abierta, lengua | una saluda | más alta y brillante | destello |
| **worried** (preocupada) | pequeños, cejas en V invertida, miran abajo | ondulada | juntas abajo | baja, inclinada, tiembla rápido | gota de sudor, leve temblor |
| **awed** (asombrada) | enormes, muchos brillos, cejas alzadas | «o» | junto a las mejillas | la más alta | chispas alrededor |
| **sleepy** (con sueño) | cerrados suaves ︶ ︶ con pestañas | «o» pequeña | una se frota un ojo | baja, lenta, tenue | «z z z» suben; ladeada |
| **proud** (orgullosa) | entrecerrados por abajo (pícara) | sonrisa ladeada | en las caderas | alta y quieta | barbilla arriba, destello dorado |

**Animación**: balanceo 0,25 Hz (más lento con sueño), respiración ±1,2 %, parpadeo cada 2,6–5,4 s (con sueño, lento y
frecuente; asombrada, casi nunca), oleaje del líquido con retraso, burbujas, parpadeo de llama por ruido suave,
«pop» de squash & stretch al cambiar de humor. **Avatar mini** (< 56 px, automático): sin manos, burbujas ni
accesorios grandes; cara un 18 % mayor y contorno más grueso.

**Vestuario** (Encargos): bufanda tejida roja con rayas doradas, medalla dorada del Comité, flor bioluminosa en el
corcho.

**No**: llama azul o verde; VELA sin vela; boca o cejas sobre el vidrio vacío; VELA tapando el elemento que señala.

### 6.2 Dra. Albor — la grabadora

Grabadora de casete portátil de los 70: plástico crema, ventana ahumada con **dos carretes** que giran (más rápido
cuando habla), cinta marrón, etiqueta de cinta de carrocero escrita a mano, **aguja de VU** que salta con la voz, teclas
de piano (PLAY hundida mientras habla) y luz ámbar. Encima, **una Polaroid** pegada con cinta: Albor con melenita
oscura, gafas redondas, pecas, parka verde azulado y bufanda mostaza. Un destello dorado discreto cerca de la foto
(la pista de la historia). **En vivo** (epílogo): solo ella, más grande, respirando y parpadeando, con el **alba**
(oro abajo, rosa arriba) detrás.

### 6.3 El Comité — el télex

Teletipo pesado verde grisáceo con moldura cromada, **rodillo** negro, **tira de papel** que sube y se enrolla arriba
(nunca sale de la caja), líneas impresas en MAYÚSCULAS y un **sello rojo**; teclas redondas que martillean al hablar,
**luz roja** «recibiendo» y una placa con escudo. Su texto va en JetBrains Mono, mayúsculas.

### 6.4 El Coro — el ocular

Ocular de microscopio de latón con moleteado; dentro, **un Orbium vivo de verdad** (`LeniaLens`, simulación CPU): el
Coro habla con anillos violetas que salen de la criatura. Retícula con escala y viñeta.

### 6.5 Tú — el cuaderno

Cuaderno de campo abierto bajo la lámpara: papel cálido rayado, un Orbium dibujado en tinta cian, una pluma estilográfica
que escribe línea a línea cuando «hablas».

## 7. Movimiento

`src/ui/art/motion.ts` (y `--bl-t-*`, `--bl-ease-*` en `art.css`).

| Token | ms | Curva | Para |
|---|---|---|---|
| `tap` | 90 | `standard` | escala .96 al apoyar el dedo |
| `quick` | 140 | `standard` | hover, cambios de color |
| `base` | 200 | `standard` | aparecer/desaparecer, chips |
| `sheet` | 260 | `enter` / `exit` | hojas inferiores, paneles laterales |
| `card` | 320 | `pop` | un valor que cambia: rebote |
| `story` | 480 | `enter` | VELA entra, carteles |
| `celebrate` | 700 | `enter` | compra: anillo del color de la ruta + cifra que cuenta |

Curvas: `standard` (0,2 0 0 1), `enter` (0,05 0,7 0,1 1), `exit` (0,3 0 0,8 0,15), `pop` (0,34 1,56 0,64 1).

**El jugo de comprar** (`buyBurst`): el nodo da un salto (×1,12), un anillo del color de la ruta se expande y se
desvanece, el contador de Datos cuenta hacia abajo (`countUp`), la línea crece hacia el siguiente «?». Todo en
≤ 700 ms y nunca bloquea el siguiente toque.

**Lo que nunca se mueve**: el marco del HUD, la barra de pestañas, el marco de la placa, el ancho de los números
(cifras tabulares), el texto que se está leyendo. **Lo único que late en bucle**: el halo de las criaturas, el punto de
«nuevo», VELA en reposo y el Destello. Con *Reducir movimiento*: nada en bucle, los movimientos se vuelven fundidos de
≤ 80 ms, las cifras saltan al valor final.

## 8. La materia y la placa

`src/ui/art/matter.ts` (datos), `specimen.ts` (criaturas reales dibujadas como en la GPU), `dishref.ts` (referencia
de la placa). Vista previa en `?section=matter` y `?section=dish`.

### 8.1 Paleta de la materia (LUT)

| Valor | Hoy (`core/palette`) | Recomendada `MATTER_ART.night` |
|---|---|---|
| 0 | transparente | transparente |
| 0,04 | — | bruma índigo (22, 20, 70, α .35) |
| 0,12–0,15 | índigo (46, 30, 120) | violeta índigo (46, 34, 134, α .82) |
| 0,24 | — | azul real (38, 84, 204) |
| 0,38–0,40 | cian (40, 190, 230) | cian bioluma (30, 148, 226) |
| 0,54 | — | cian claro (58, 196, 240) |
| 0,70 | **blanco cálido** (255, 236, 205) | hielo (132, 228, 250) |
| 0,84 | — | hielo pálido (206, 246, 252) |
| 0,94 | — | blanco de vela (255, 240, 214) |
| 1 | blanco | blanco cálido (255, 250, 240) |

**Por qué**: hoy el blanco llega al 70 % y todo el interior de una criatura se quema; la recomendada sube la luminancia
de forma pareja (test: ningún salto > 2 %, a 0,8 aún bajo el blanco) y deja el blanco para el núcleo caliente.
`MATTER_ART.paper` es la misma criatura **como tinta sobre papel** (azul de tinción), para retratos sobre superficies
claras (Bestiario en tema claro); nunca para la placa.

### 8.2 Tintes de especie

Una fila de LUT por cada una de las 12 familias de color de `src/species` (`FAMILY_HUES`, test de espejo): el **cuerpo**
de la criatura toma el tono de su familia **a la misma luminosidad OKLCH** que la paleta sin tinte (test ±0,05), la
bruma y el núcleo caliente se comparten. Resultado: todas las especies igual de brillantes, inconfundibles y aún
«bioluma». `matterLUT2D()` empaqueta sin tinte + 12 familias en una textura 256 × 13; `familyAccent(hue, theme)` da el
acento de UI de cada especie (anillos, etiquetas) con la misma luminosidad para todas.

### 8.3 La placa

Capas, de abajo arriba (`drawDishReference`): **mesa de acero** en la noche polar (viñeta, vetas apenas visibles) →
sombra suave y la **luz fría** que el cultivo derrama sobre la mesa → **agar** azulado, más claro en el centro, con el
**menisco** iluminado donde sube por la pared → **criaturas** con su tinte → **vidrio**: dos paredes con vidrio claro
entre ellas, **borde blanco-escarcha** (el cian es de la vida, no del vidrio), brillo de tapa en media luna arriba a la
izquierda, un **reflejo cálido** pequeño arriba a la derecha (VELA está cerca) → **escarcha** fina en dos arcos del
borde → **anillo de crecimiento** discontinuo (el tamaño que da la siguiente mejora de Placa).

Valores para el shader: `ART_RENDER_STYLE` (misma forma que `SimRenderStyle`, validado por `normalizeRenderStyle`):
fondo `#06090d`, agar `#131c26` → `#0c131b`, borde `#cfe8f5` a 0,26.

## 9. Los siete Mundos

`src/ui/art/worlds.ts` → `worldArt(id)`: una ilustración SVG por Mundo (320 × 200, `slice`, llena cualquier tarjeta).
**Una idea por Mundo**, para elegir antes de leer; la esquina de arriba a la izquierda queda calma para el título (el
blanco del título tiene ≥ 7 : 1 sobre el fondo, test).

| Mundo | Tono | La idea | Se reconoce por |
|---|---|---|---|
| 1 · Clásico | celeste 198° | agua tranquila, tres Orbium-campana que nadan, ondas | ondas concéntricas y nadadoras |
| 2 · Frío | azul 222° | helechos de escarcha desde las esquinas, copos, una criatura-fantasma | la escarcha |
| 3 · Remolinos | turquesa 172° | un remolino con criaturas montadas en sus brazos | la espiral |
| 4 · Escudos | dorado 45° | panal de armadura y criaturas-escudo redondas | los hexágonos ámbar |
| 5 · Discos | rosado 325° | anillos como un disco de vinilo, discos y triángulos flotando | los anillos y el triángulo |
| 6 · Patas | verde 112° | suelo, criaturas con patitas que caminan, huellas | las patas |
| 7 · Gigantes | violeta 272° | una criatura enorme junto a una diminuta | la escala |

Cerrado: `worldArt(id, { locked: true })` desatura y atenúa (con candado en el título). El anillo de selección usa
`worldColors(id).ring`. El icono de cada Mundo (`WORLD_ICON`) repite la idea en pequeño.

## 10. Composición

- **Una acción principal por pantalla**, en `accentFill` (cian), abajo, ancho completo en móvil (≥ 52 px de alto).
  Secundarias: contorno (`line2`) sobre `surface2`. Terciarias: texto (`text2`), sin caja.
- **Márgenes** de 16 px en móvil, rejilla de 4 px; radios 8 / 12 / 16 / 24; objetivos táctiles ≥ 48 px.
- **Zonas seguras**: `env(safe-area-inset-*)` en el HUD (arriba) y en la barra de acción (abajo).
- **Sin saltos de layout**: alturas fijas para HUD, barra de objetivo y pestañas; cifras tabulares; los avisos se
  superponen, no empujan (los tests de layout ya lo miden: `layout-shift.mjs`).
- **Capas** (`--bl-z-*`): placa 0 · efectos de placa 5 · etiquetas de placa 10 · HUD 20 · hojas 30 · avisos 40 ·
  diálogo 50 · modal 60 · celebración 70 · cinemática 80. **Todo lo que pertenece a la placa queda por debajo de las
  hojas** (arregla el aviso sobre Ajustes).
- **Etiquetas en la placa**: como mucho una por criatura, con el nombre corto; si dos chocan, gana la más cercana al
  dedo y la otra se oculta; nunca se cortan en el borde (se desplazan hacia dentro).
- **Escritorio**: placa a la izquierda centrada en su columna (con mesa y viñeta, no una columna vacía), panel a la
  derecha; las tarjetas de inicio y resumen a dos columnas en lugar de una columna estrecha.
- **Tema claro**: superficies papel, la placa sigue de noche **sin marcos oscuros anidados** (una sola tarjeta con la
  mesa de acero claro, como en `?section=dish&theme=light`).
- **Para niños**: números grandes y redondos («+22», no «+22,4»), unidades con icono, «Rango μ» solo en el
  Microscopio II; comas decimales en español.

## 11. Hacer / no hacer

| Hacer | No hacer |
|---|---|
| Un botón cian por pantalla («¡Empezar!», «Comprar · 12») | Botones lima gigantes; tres colores de primario (`session-start.png`, `tree-mid.png`) |
| Llama de VELA cálida, cara sobre el líquido | Llama azul; cara oscura sobre vidrio oscuro (`story-companion.png`) |
| Iconos de `art/icons.ts`, trazo 1,75 | Mezclar 1,5 / 1,8 / 2; emoji junto a iconos de línea (⏳ en la barra de semilla) |
| Emblemas de color junto a cifras | Emoji 💧 📊 🌙 en el texto de la interfaz |
| Tarjetas de Mundo con su ilustración | Tarjetas de solo texto con un borde de color (`session-start.png`) |
| Criaturas con la LUT nueva y su tinte de familia | Núcleos quemados a blanco; mancha de color en el centro (*walls-dish-gpu.png*) |
| Criaturas ampliadas con muestreo suave (`renderSpecimen`) | Ampliar píxeles (`moments-card-stable.png`) |
| Efectos de placa debajo de los modales | El aviso «Toca la placa» sobre Ajustes (`m-dark-07-settings`) |
| Una etiqueta corta por criatura | Nombres que se pisan y se cortan (`ui-mobile-bestiary-grid.png`) |
| Inter con cifras tabulares; Fraunces para nombres latinos | Monoespaciada para todo; cursiva sintética |
| Borde de placa blanco-escarcha | Borde cian que compite con la vida |
| Versión en Ajustes › Acerca de | «v0.009 · 43403d5» sobre el HUD |

## 12. Integración: qué cambiar en cada archivo

Nada de esto lo toca el arte: lo aplican los integradores en sus archivos. Todo es **compatible por firma**.

**Tokens y fuentes**
- `src/main.ts` **y cada página de desarrollo** (`src/ui/tree/dev.ts`, `src/ui/moments/dev.ts`, `src/ui/story/dev.ts`,
  `src/ui/store/dev.ts`, `src/ui/dev.ts`…): `import './ui/art/art.css';` (ruta relativa a cada uno) una vez, antes de
  las hojas de cada módulo. **Probado en una copia del juego**: si una página no carga `art.css`, un
  `var(--bl-accent-fill)` sin respaldo deja el botón principal invisible; mientras dure la migración, escribir siempre
  con respaldo: `var(--bl-accent-fill, #5bc0eb)`.
- `index.html` y las páginas `*-dev.html`: cambiar el `<link>` de Google Fonts por `FONT_URL` de `tokens.ts` (añade
  Fraunces).
- `src/ui/ui.css` (bloque `.bl`): `--bg: var(--bl-bg)`, `--surface: var(--bl-surface)`, `--surface-2:
  var(--bl-surface2)`, `--surface-3: var(--bl-surface3)`, `--text: var(--bl-text)`, `--dim: var(--bl-text2)`,
  `--faint: var(--bl-text3)`, `--accent: var(--bl-accent)`, `--accent-ink: var(--bl-accent-ink)`, `--warn:
  var(--bl-warn)`, `--danger-text: var(--bl-danger)`, `--good: var(--bl-good)`, `--gold: var(--bl-gold)`, `--font:
  var(--bl-font-ui)`, `--mono: var(--bl-font-mono)`, `--ease: var(--bl-ease-standard)`, `--t-panel: var(--bl-t-base)`;
  borrar los valores de `.bl[data-theme='light']` (los da `art.css`). Al contenedor de la placa y a `.splash`, la clase
  `art-force-dark`. `.btn.good` → fondo `var(--bl-accent-fill)`, texto `var(--bl-accent-ink)`.
- `src/ui/tree/tree.css`: `--rt-bg1/--rt-surface/--rt-ink/--rt-dim/--rt-faint` → `--bl-*`; `--c-time … --c-spark`
  → `var(--bl-route-time) … var(--bl-route-spark)` (sus valores claros pasan a ser los AA de `ROUTE_COLOR.light`);
  `.rt-buy` → `--bl-accent-fill`/`--bl-accent-ink`; `--rt-datos` → `var(--bl-aurora)`.
- `src/ui/session/session.css`: `--ss-*` → `--bl-*`; `.ss-btn.primary` → `--bl-accent-fill`/`--bl-accent-ink`
  (hoy lima); `--ss-datos` → `var(--bl-aurora)`; `--ss-mono` solo para el reloj si se quiere instrumento.
- `src/ui/moments/moments.css`: `--mo-*` → `--bl-*`; el botón «¡Entendido!» usa el acento, no `--mo-good`.
- `src/ui/story/story.css`: nombre del hablante VELA en `var(--bl-candle)`; el globo, `surface2` con un filo cálido
  (`0 0 0 1px rgba(255,184,107,.12)`).

**Iconos** (misma firma, mismas clases CSS `ic` / `rt-ic` / `mo-ic` / `bst-ic`, más `bl-ic`)
- `src/ui/icons.ts`: `export { icon } from './art/icons';` (conservar `logo()`).
- `src/ui/tree/icons.ts`: `export { treeIcon, hasTreeIcon } from '../art/icons'; export type TreeIconName = string;`
  (su test sigue pasando).
- `src/ui/moments/icons.ts`: `export { moIcon } from '../art/icons';` (mantener `MoIconName` si se usa como tipo).
- `src/ui/store/icons.ts`: `export { sicon, svgInner } from '../art/icons';`
- `src/ui/tree/treeView.ts` `BRANCH_ICON` → `ROUTE_ICON` de `art/icons` (Reloj `time`, Vida `life`, Descubrir
  `discovery`, Placa `dishRoute`, Destello `sparkRoute`).
- `src/ui/ui.css` 3981–4008 y `tree.css` 269–302 fijan `stroke-width` de otros SVG (no de iconos): revisar que no
  apliquen a `.bl-ic`.
- Emoji en textos (`treeText.ts`, cadenas de sesión): sustituir por `emblem(EMOJI_EMBLEM[e], 18)` al renderizar.

**Personajes**
- `src/ui/story/portraits.ts`: sustituir su contenido por `export * from '../art/portraits';` — un solo cambio y
  `storyUI.ts`, `archive.ts`, `encargoUI.ts`, `cinematic.ts`, `session/summary.ts`, `moments/momentsUI.ts` y
  `story/index.ts` usan el arte nuevo (mismo `Portrait`, `drawVela`, `setVelaWear`).
- Humores nuevos `sleepy` y `proud`: ampliar `Mood` en `src/story/types.ts` y `VelaMood` en `src/moments/types.ts`
  para usarlos (sueño: volver tras una ausencia, sesiones largas; orgullo: comprar, cumplir un Encargo, noche nueva).

**Mundos**
- `src/ui/session/start.ts` (tarjeta de mundo): primer hijo de la tarjeta `worldArt(w.id)` (o `mountWorldArt`), la
  tarjeta con `position: relative; overflow: hidden; aspect-ratio: 16/10`, el texto encima; anillo de selección
  `worldColors(id).ring`. Icono del título: `artIcon(WORLD_ICON[id], 18)`.
- Nodos de Mundo en el Árbol: la hoja del nodo puede mostrar `worldArt(id)` como cabecera.

**Materia** (agente de la placa)
- `sim.setMatterLUT(lutFromStops(MATTER_ART.night))` en lugar de `matterLUT()`; `setRenderStyle(ART_RENDER_STYLE)`
  como estilo por defecto; `setCreatureTints(list)` sin cantidad (las filas de tinte de `src/sim/tintlut.ts` ya están calibradas; 0,6 las volvía grisáceas). Para tintes exactos: textura `matterLUT2D()` y la
  fila `familyIndex(hue) + 1`.
- `src/core/palette.ts` (`MATTER_STOPS`, contrato): el integrador puede copiar `MATTER_ART.night` para que
  `sprites.ts` y `lens.ts` coincidan.
- Retratos del Bestiario y ampliaciones de Momentos: `renderSpecimen(pattern, px, stops)` (muestreo B-spline, sin
  píxeles), con `MATTER_ART.paper` en el tema claro.

## 13. Licencias

- **Fraunces** — Undercase Type (Phaedra Charles, Flavia Zimbardi), SIL Open Font License 1.1, vía Google Fonts.
  *Añadir a `CREDITS.md`.*
- **Inter** — Rasmus Andersson, OFL 1.1. **JetBrains Mono** — JetBrains, OFL 1.1 (ya acreditadas).
- Todo lo demás (iconos, emblemas, personajes, Mundos, placa) está dibujado en código para este juego. Las criaturas
  son patrones reales del catálogo de Bert Chan (MIT).
