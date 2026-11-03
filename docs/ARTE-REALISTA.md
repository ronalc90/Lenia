# ARTE-REALISTA: biblia de arte de «realismo científico»

> **Encargo del dueño** (rechazo del estilo actual: doctores *chibi*, matraz-vela con cara): «mucho mejor, que no
> sea animado; súper realista y definido, líneas claras, realista al extremo, súper científico». Decisiones del
> dueño: **(1)** VELA deja de ser un matraz simpático y pasa a ser un **instrumento científico**: un monitor de
> cultivo con su lámpara, que habla por su pantalla. **(2)** Los dos doctores (Albor y el tuyo, que eliges entre 3
> batas) tienen que ser lo más hiperrealistas posible: «busca en la web cómo hacerlo, y si hace falta descárgalo,
> haz el diseño tú, o consigue el arte». **(3)** «Si es necesario, aprende a hacer el arte vector por vector.»
>
> **Qué es este documento.** Es la biblia de arte que siguen los implementadores, adoptada por **ADR-029**
> «Realismo científico» ([`DECISIONS.md`](../DECISIONS.md), v0.021). Sustituye la dirección de personajes de
> [`docs/ARTE.md`](ARTE.md) §6 y el tono «cartoon» de algunas reglas de [`docs/ARTE-PULIDO.md`](ARTE-PULIDO.md).
> Mantiene todo lo demás: los tokens, la placa, las criaturas reales, el rendimiento y la accesibilidad.
>
> **Material de apoyo en el repositorio:**
> - `public/art/photos/`: las 7 fotos de archivo que se empaquetan, en WebP; el juego las carga con
>   `loadPhoto(id)` de `src/ui/art/photos.ts`. Su ficha de procedencia (`.txt`) está en `docs/arte-realista/fotos/`
>   y su crédito en `CREDITS.md` (§9).
> - `docs/arte-realista/referencias/`: las 5 fotos de solo referencia (`ref-*`), cada una con su `.txt`. **Nunca**
>   se empaquetan.
> - `docs/arte-realista/prototipo/vela-proto.js` + `vela-proto.html`: VELA dibujada en Canvas 2D con las capas,
>   colores y grosores de §4, para validar la especificación.
> - `docs/arte-realista/prototipo/vela-estados.png`: 8 de los 9 estados de VELA (falta «pensando») y el avatar mini.
> - `docs/arte-realista/prototipo/bezel-capas.png`: el ejemplo resuelto de §3.6, capa por capa.

## Índice

0. [Decisiones en una página](#0-decisiones-en-una-página)
1. [Qué se queda y qué cambia](#1-qué-se-queda-y-qué-cambia)
2. [(a) Investigación con fuentes](#2-a-investigación-con-fuentes)
3. [Método de producción vectorial («vector por vector»)](#3-método-de-producción-vectorial-vector-por-vector)
4. [(b) VELA · Monitor de cultivo MC-7](#4-b-vela--monitor-de-cultivo-mc-7)
5. [(c) Los doctores](#5-c-los-doctores)
6. [(d) Reglas de restyle para el resto del juego](#6-d-reglas-de-restyle-para-el-resto-del-juego)
7. [(e) Paquetes de trabajo y textos que cambian](#7-e-paquetes-de-trabajo-y-textos-que-cambian)
8. [Riesgos, ADR y créditos](#8-riesgos-adr-y-créditos)
9. [Inventario de assets](#9-inventario-de-assets)
10. [Fuentes](#10-fuentes)

---

## 0. Decisiones en una página

| Tema | Decisión |
|---|---|
| **Dirección** | **«Lámina científica, instrumento de laboratorio, documental nocturno.»** El realismo viene de la **luz y el material** (metal, vidrio, tela, fósforo), no de añadir detalle. Línea nítida **solo donde hay un borde real**. Fuera los ojos, el rubor, las bocas, el *squash & stretch* y los rebotes de los personajes. |
| **VELA** | Monitor de cultivo de sobremesa **MC-7**: chasis de aluminio con pintura en polvo blanca cálida, frontal de vidrio ahumado, **pantalla de fósforo teal** (la traza de un osciloscopio es su voz), **lámpara piloto ámbar** de filamento (su «vela», a 2200–3600 K según el ánimo), **LED rojo de alarma** aparte, rejilla de altavoz, mando moleteado, **placa grabada** «VELA · MONITOR DE CULTIVO · MC-7», asa cromada y el cable de la sonda que va a la placa. Expresa sus 9 estados (reposo, hablando, contenta, preocupada, sorprendida, dormida, alarma, orgullosa, pensando) con **traza, etiqueta de pantalla, lámpara y LED**. Prototipo validado: `docs/arte-realista/prototipo/vela-estados.png`. |
| **Doctores** | **Híbrido documental** (§5): **tú** en primera persona (mano con guante y el puño de la bata elegida), **Albor** a contraluz o de espaldas (Polaroid, perfil al alba con vaho al hablar), y sus objetos (grabadora, cuaderno, bufanda). Se usan **fotos de archivo de dominio público o CC BY** solo en los planos fijos de la intro: manos, placas y la estación con aurora. Todo lo que se anima va en **vector escrito a mano**. **Ninguna cara real.** Caras completas solo si se encarga una sesión de fotos con **cesión de derechos de imagen** (opción futura, §5.8). |
| **Elige tu bata** | Pasa a ser literal: **tres batas reales** colgadas, dibujadas en vector, cada una con su tarjeta de identificación: algodón clásica, parka polar sobre la bata y cuello mao con puños. Los ids de partida (`curls`, `beanie`, `bun`) se conservan: el cambio es compatible con las partidas guardadas. |
| **Método** | **Datos de trazado SVG escritos a mano** → `new Path2D(d)` en **Canvas 2D**, siempre en 8 capas: silueta, color local, sombra de forma, luz reflejada, especular, luz de borde, textura y contorno. Las capas estáticas se cachean por tamaño × DPR; solo se repinta lo que se mueve. |
| **Presupuesto** | 7 fotos para empaquetar, en WebP: **≈ 226 KB en total, ≤ 50 KB cada una** (límite del encargo: 600 KB y 60 KB). El resto, código: unos 25–40 KB de JS en total. |
| **Trabajo** | Un **paso 0** del integrador (ADR, tokens, cargador de fotos) y **4 paquetes paralelos**: P1 VELA · P2 Personas · P3 Escenas y portada · P4 Láminas, informes y textos (§7). |

---

## 1. Qué se queda y qué cambia

**Se queda** (ARTE.md, ARTE-PULIDO.md, ADR-024):

- Paleta noche.
- La placa es siempre noche.
- **Cálido contra frío**: ahora es la lámpara de 2700 K contra la vida cian.
- Inter, Fraunces y JetBrains Mono.
- Iconos de trazo 1,75.
- Sistema cerrado de tokens: 8 tallas, 5 radios, 4 elevaciones y las duraciones.
- Las criaturas son **Lenia real**, nunca dibujos.
- Sin `Math.random` y sin `shadowBlur` en el bucle.
- *Reducir movimiento*.
- API de `Portrait`/`drawPortrait` y la caja de 100 × 100 unidades.

**Cambia:**

| Antes | Ahora |
|---|---|
| VELA matraz con cara, manos flotantes y llama | VELA instrumento MC-7: pantalla, lámpara y LED (§4) |
| Doctores *chibi* (cabeza = medio cuerpo, ojos grandes, rubor) | Primera persona y contraluz; manos, batas y objetos realistas (§5) |
| «Pop» de *squash & stretch* al cambiar de humor | Transiciones de instrumento: aguja amortiguada, lámpara con inercia térmica, lecturas que avanzan a saltos (§6.4) |
| Diagramas de Momento con flechas y emblemas de juego | **Láminas científicas**: número de lámina, paneles a/b/c, líneas guía, barra de escala, nombre latino en cursiva (§6.5) |
| Intro con personajes de dibujo en una estación de juguete | Noche de laboratorio realista: fotos de archivo de la Antártida, manos reales, VELA en la mesa (§6.6) |
| Grabadora, télex y ocular «simpáticos» | Los mismos objetos, con el mismo kit de materiales que VELA (§5.7) |

---

## 2. (a) Investigación con fuentes

Cada regla lleva su fuente. Lo que es inferencia nuestra se marca como **(inferencia)**.

### 2.1 Cómo consigue la ilustración científica y técnica «líneas claras y definidas»

| # | Regla | Fuente |
|---|---|---|
| I1 | La mayoría de ilustradores técnicos usan **contorno exterior grueso y líneas interiores finas**. Las aristas van casi siempre en negro. A veces, si hay sombreado, alguna línea interior se dibuja **en blanco**, como un brillo. | Gooch, *Illustrating Smooth Surfaces*, [Northwestern NPR course](https://users.cs.northwestern.edu/~ago820/NPRcourse1/node5.html), [Gooch 1998, tesis](https://www2.cs.utah.edu/gdc/publications/papers/gooch98_thesis.pdf) |
| I2 | Proporción práctica: contorno ≈ **2,5 ×** la línea interior (ej. 0,35 mm / 0,18 mm). Los objetos ligeros, transparentes o blandos llevan un perímetro más fino. | [Line Rendering: Use of Variable Line Weights](https://medium.com/technical-illustration/line-rendering-use-of-variable-line-weights-fa580665849) |
| I3 | **Luz desde arriba a la izquierda** como convención. Un estudio de unas 10 000 obras la encuentra dominante entre 1420 y 1900. En ilustración técnica se **estandariza una sola fuente de luz** para todas las figuras. | [Top-left lighting (Wikipedia)](https://en.wikipedia.org/wiki/Top-left_lighting), [Frontiers in Psychology 2018](https://www.frontiersin.org/articles/10.3389/fpsyg.2018.00454/full), [Design principles for technical illustrations](https://contentmanual.com.au/visuals-data/illustrations/conventions-for-illustrations) |
| I4 | Manual de referencia del oficio, patrocinado por la Guild of Natural Science Illustrators. | [GNSI, *Handbook of Scientific Illustration*](https://www.gnsi.org/handbook-of-science-illustration) |
| I5 | **El especular es el reflejo de la forma de la fuente de luz.** Si la sala tiene una ventana, el brillo es una banda; si tiene una bombilla, es un punto. Por eso un solo brillo coherente vende más realismo que diez brillos sueltos. | (inferencia, práctica de *product rendering*; cf. I3) |
| I6 | Diseño industrial de instrumentos: «tan poco diseño como sea posible». Superficies limpias, rótulos funcionales y nada decorativo. | [Dieter Rams (Wikipedia)](https://en.wikipedia.org/wiki/Dieter_Rams) |

### 2.2 Realismo 2D en Canvas/WebGL sin modelos 3D

| # | Técnica | Cómo se usa aquí | Fuente |
|---|---|---|---|
| R1 | **Degradados en capas** (color local + sombra con `multiply` + luz con `screen`) | Base de todo (§3.2). Las piezas de formas duras con *multiply* dan un sombreado suave sin malla. | Curso «Creating diffused shading», [Lynda/LinkedIn](https://origin-www.lynda.com/Illustrator-tutorials/Creating-diffused-shading/475456/2884076-4.html); [Creative Bloq, *Transparency tricks*](https://www.creativebloq.com/computer-arts/transparency-tricks-1069812) |
| R2 | **Fresnel (Schlick)**: la reflexión sube hacia el borde, `F = F0 + (1−F0)(1−cosθ)^5`. **Luz de borde** como término aparte, con su propio exponente. | Vidrio de la pantalla, lente de la lámpara y borde de la placa: el brillo se concentra a 0,85–1,0 del radio. | [GameDev.net ShaderLab 61, *Fresnel and rim lighting*](https://gamedev.net/shaderlab/61-fresnel-and-rim-lighting/), [Wikibooks, *Cg Programming: Specular highlights at silhouettes*](https://en.wikibooks.org/wiki/Cg_Programming/Unity/Specular_Highlights_at_Silhouettes) |
| R3 | **Luz de borde 2D** a partir del alfa o de un mapa de normales | Contraluz de Albor y de tu silueta (§5.4) | [Godot Shaders, *2D Rim Light*](https://godotshaders.com/shader/2d-rim-light-2/) |
| R4 | **Mapa de normales en un shader de fragmentos** (normal codificada como RGB = n/2 + 0,5) | Solo si algún día se quiere luz dinámica sobre una lámina (WebGL2 ya existe). En Canvas 2D no hace falta. | [mattdesl, *ShaderLesson6: normal mapping for 2D*](https://github.com/mattdesl/lwjgl-basics/wiki/ShaderLesson6) |
| R5 | **Color de cuerpo negro** (Kelvin → RGB, ajuste de Helland, 1000–40 000 K) | La lámpara de VELA: 1900 K `#ff8400`, 2200 K `#ff9227`, 2700 K `#ffa757`, 3000 K `#ffb16e`, 3200 K `#ffb87b`; núcleo `#fff3d6`. El token actual `candle #ffb86b` equivale a unos 3100 K (`#ffb475`). | [Tanner Helland, *Converting temperature (Kelvin) to RGB*](https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html) |
| R6 | **Anisotropía de metal cepillado**: el brillo es alargado y **perpendicular a las estrías** (Kajiya-Kay: se sombrea con la tangente, no con la normal) | Placa de aluminio: estrías horizontales y brillo vertical. Mandos y biseles con **degradado cónico** de 4–8 paradas, que es el brillo radial del torneado. | [Galacean, *Hair (Kajiya-Kay)*](https://galacean.antgroup.com/engine/en/docs/graphics/material/builtinShaders/digitalHuman/hair), [Autodesk, *Anisotropic shader*](https://help.autodesk.com/cloudhelp/2015/ENU/3DSMax/files/GUID-30F365F1-602D-4E7D-8C97-6BF67673683B.htm), [CRYENGINE, *Anisotropic specular*](https://cryengine.com/docs/static/engines/cryengine-3/categories/1114113/pages/1048720) |
| R7 | **Refracción por desplazamiento** | En Canvas: dentro del recorte del vidrio, dibujar el fondo desplazado y escalado un 2–4 % (barato). En WebGL: `uv += normal.xy * k`. Evitar `feDisplacementMap` de SVG: es un filtro por fotograma. | [MDN, `feDisplacementMap`](https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feDisplacementMap) (inferencia para el coste) |
| R8 | **Ruido y grano** contra el *banding*: ruido triangular de unos 2 LSB | Textura de pintura en polvo y aluminio: un tile de 64 × 64 determinista al 3–8 % en `soft-light` | [Gjøl (Playdead), *Banding*](https://pixelmager.github.io/linelight/banding) (ya en ARTE-PULIDO L3) |
| R9 | **Fósforo**: traza gaussiana aditiva, decaimiento exponencial entre fotogramas (0,85–0,95), *bloom* y tinte del vidrio | Traza de la pantalla de VELA con **3 pasadas de trazo** (halo, cuerpo y núcleo caliente) en vez de `shadowBlur` | [Hubert Lim, *Building a multi-pass phosphor rendering pipeline in WebGL*](https://dev.to/the_l_man/building-a-multi-pass-phosphor-rendering-pipeline-in-webgl-113o) |
| R10 | **Sombras en capas**: una sola luz para todo; al subir, más desenfoque y menos opacidad; la sombra lleva el tono del fondo, no negro puro | Sombra de contacto de VELA y de los objetos sobre la mesa | [Comeau, *Designing beautiful shadows*](https://www.joshwcomeau.com/css/designing-shadows/) |
| R11 | **Límites del navegador** | `ctx.filter` **no funciona en Safari/iOS** (desactivado por defecto también en 18–27): no usarlo nunca. `createConicGradient`: Chrome 99, Firefox 112, Safari 16.1 (con *fallback* a lineal). `new Path2D(d)` acepta datos de trazado SVG. | [caniuse: ctx.filter](https://caniuse.com/mdn-api_canvasrenderingcontext2d_filter), [caniuse: createConicGradient](https://caniuse.com/mdn-api_canvasrenderingcontext2d_createconicgradient), [MDN, `Path2D()`](https://developer.mozilla.org/en-US/docs/Web/API/Path2D/Path2D) |

### 2.3 Cómo son los instrumentos de laboratorio reales y sus interfaces

| # | Hecho | Qué tomamos | Fuente |
|---|---|---|---|
| L1 | **Incucyte** (Sartorius) vive **dentro** de la incubadora y fotografía el cultivo sin moverlo, con una interfaz guiada | Es literalmente «un monitor de cultivo». VELA vigila la placa sin tocarla y habla de lo que ve. | [Sartorius, folleto *Live-cell analysis inside the incubator*](https://www.sartorius.hr/media/t4ndhora/live-cell-analysis-inside-incubator-incucyte-brochure-en-sartorius.pdf), [Universidad de Berna, IncuCyte S3](https://www.dbmr.unibe.ch/services/core_facilities/live_cell_imaging_lci/services/incucyte_s3/index_eng.html) |
| L2 | **Eppendorf CellXpert C170i** (Good Design 2019, Koop Industrial Design): cámara de acero inoxidable sin costuras, pantalla táctil VisioNize con **instrucciones ilustradas paso a paso**, gráficas filtrables y USB en el frontal. La pantalla se usa con o sin guantes. | Frontal limpio, rótulos serigrafiados y la pantalla que «explica paso a paso», que es el papel de VELA | [Good Design Australia, CellXpert C170i](https://good-design.org/projects/cellxpert-c170i/), [Eppendorf, CellXpert C170i](https://www.eppendorf.com/AU-en/cellxpert-c170i/) |
| L3 | **Thermo Heracell VIOS** con pantalla iCAN en la puerta: acceso a cada parámetro crítico, **tendencias y alertas** (gas bajo, cambios del ambiente de cultivo) | Estados de **atención** y **alarma** como en un equipo real: un parámetro y su valor, no un emoji | [Thermo Fisher, Heracell VIOS 160i](https://thermofisher.com/order/catalog/product/51033558), [Thermo Fisher, *CO2 incubator features*](https://www.thermofisher.com/us/en/home/life-science/lab-equipment/co2-incubators/features) |
| L4 | **Zeiss ZEN**: diseño claro u oscuro «para adaptarse a la luz ambiente», en tres zonas | El modo noche de VELA y del HUD; la pantalla oscura es lo normal en un laboratorio de noche | [Zeiss Knowledge Base, *User interface*](https://knowledge.zeiss.com/rms/en/zen/getting-started-first-steps/user-interface), [ZEN product info](https://www.scribd.com/document/661769594/En-Product-Info-ZEN) |
| L5 | **Leica LAS X**: barra de escala calibrada que **se ajusta sola** al cambiar el aumento y flota sobre la imagen | Barra de escala viva en las láminas y en la ficha de especie (§6.5) | [Leica DVM6, *LAS X basic functions*](https://www.manualslib.com/manual/1554103/Leica-Dvm6.html?page=51), [Imperial College, guía Leica](https://www.imperial.ac.uk/a-z-research/x-ray-crystallography/crystallisation/leica-microscope/) |
| L6 | Panel real de incubadora de CO₂: óvalo serigrafiado, dos displays LED de 7 segmentos («37.0» y «5.0»), teclas de membrana | Lecturas «37,0 °C · 5,0 % CO₂» en la pantalla de VELA | Asset de referencia `ref-panel-incubadora-co2.jpg` (§9) |
| L7 | **VFD** (display fluorescente de vacío): el fósforo ZnO:Zn emite en torno a **505 nm** (verde azulado) y lleva una **rejilla de control** fina delante | Tinta de la pantalla: teal `#5ee6c8`, prácticamente el token `aurora`, y una malla fina al 5 % | [US 5128063A, *ZnO:Zn phosphor for VFD*](https://patents.google.com/patent/US5128063), [US 6919683B1](https://patents.google.com/patent/US6919683) |
| L8 | **Agujas VU**: llegan al 99 % en **300 ms** con un **1–1,5 %** de sobrepaso (ANSI C16.5-1942, IEC 60268-17) | Aguja amortiguada: ζ ≈ 0,8 y ωn ≈ 19 rad/s (§6.4) | [VU meter (Wikipedia)](https://en.wikipedia.org/wiki/VU_meter) |
| L9 | **LED que «respira»** en reposo (patente de Apple): imita el ritmo de la respiración, en torno a **12/min** según fuentes secundarias | VELA dormida: lámpara a 0,2 Hz, del 8 % al 45 % | [US 6658577 B2, *Breathing status LED indicator*](https://patents.google.com/patent/US6658577), [512pixels, *On sleep indicators*](https://512pixels.net/2010/08/on-sleep-indicators/) |
| L10 | **Antepasada**: la incubadora bacteriológica de Hearson (1911) se calentaba con **una lámpara de petróleo** | Explica el nombre: un monitor de cultivo cuya lámpara nunca se apaga. «Estar **en vela**» es velar de noche, en la **Estación Vigilia**. | Asset `incubadora-hearson-eb1911.webp` (§9) |

### 2.4 Convenciones de figura científica (Nature, Cell y revistas)

| # | Regla | Fuente |
|---|---|---|
| F1 | Texto de figura en **sans-serif estándar** (Arial/Helvetica), **5–7 pt**. Etiquetas de panel **a, b, c** en **8 pt, negrita, redonda (no cursiva), minúscula**. | [Nature, *Preparing figures: our specifications*](http://research-figure-guide.nature.com/figures/preparing-figures-our-specifications/) |
| F2 | **Barras de escala, nunca factores de aumento** («×40» deja de ser verdad al reescalar). La barra y su texto van en una capa aparte y editable. | Ídem; [Cambridge, *Electronic figure guidelines*](https://www.cambridge.org/core/services/aop-file-manager/file/68f2427ac02cb20c83ea752f) |
| F3 | **Nada de texto en color**: el color se señala con claves o recuadros y el texto va en negro. Nada de cuadrícula de fondo, sombras ni adornos. No poner texto sobre imágenes con mucho detalle. | Nature, ídem |
| F4 | **Paleta apta para daltónicos** (Wong, *Nature Methods* 8, 441, 2011). Evitar rojo frente a verde y comprobar con un filtro de daltonismo. Objetivo WCAG 2.1 AA. | Nature, ídem |
| F5 | **Género y especie en cursiva**, pero no «sp.» ni «spp.». | [Freshwater Science, *Preparing figures*](https://www.journals.uchicago.edu/journals/fws/prep-figures) |
| F6 | Grosor de línea en una figura impresa: **0,25–0,35 mm** (0,75–1 pt) para lo principal y ≥ 0,3 pt (0,11 mm) como mínimo | [Cambridge Paleobiology](https://www.cambridge.org/core/services/aop-file-manager/file/5bc4dcf7229f0bdf07a19699), [ESJ formatting guide](https://esj.ne.jp/er/pdf/FormattingGuide.pdf) |
| F7 | **Láminas numeradas**: «Tafel 8» en Haeckel, «Fig. 9.—» en la Britannica de 1911. Letras de referencia (A, B, K, N…) unidas al dibujo por líneas guía. | Haeckel, *Kunstformen der Natur* (1899–1904), [ejemplo Tafel 28](https://sourcelibrary.org/artwork/kunstformen-der-natur-tafel-28-bhl47388103); EB1911 (asset §9) |

### 2.5 Cómo llegan los artistas vectoriales al fotorrealismo

| # | Técnica | Fuente |
|---|---|---|
| V1 | **Malla de degradado** (*gradient mesh*): una malla sencilla bien coloreada ya da un resultado casi fotográfico. Se trabaja **calcando una foto de referencia** en una capa bloqueada debajo. | [Tuts+, *Photo-realistic candle with gradient mesh*](https://design.tutsplus.com/tutorials/create-a-photo-realistic-candle-with-gradient-mesh--vector-4759); [Tuts+, *Photorealistic iMac*](https://design.tutsplus.com/tutorials/how-to-create-a-photorealistic-imac-and-magic-mouse--vector-3252); [Tuts+, *Vector peaches*](https://design.tutsplus.com/tutorials/how-to-draw-two-vector-peaches-using-gradient-mesh-in-adobe-illustrator--cms-30884); [Pixflow, *Intro to the gradient mesh tool*](https://pixflow.net/blog/an-introduction-to-the-gradient-mesh-tool-in-adobe-illustrator/) |
| V2 | **Retrato fotorrealista** en vector: flujo profesional por capas | [Tuts+, *Professional workflow for photorealistic portraits in Illustrator*](https://design.tutsplus.com/tutorials/professional-workflow-for-creating-photorealistic-portraits-in-illustrator--vector-3240); cursos [Skillshare (Parson)](https://www.skillshare.com/en/classes/mastering-gradient-mesh-from-beginner-to-photo-realistic-vector-art/1960604563) y [Pluralsight](https://www.pluralsight.com/courses/understanding-gradient-meshes-illustrator-368) |
| V3 | **Sin malla**: muchas formas apiladas y translúcidas. Formas de borde duro con *multiply* para el sombreado; fundidos (*blends*) entre formas de transparencia reducida; brillos difuminados con su modo de fusión. Las mallas no admiten transparencia, salvo como máscara. | [Adobe Community, *blend blurred shapes*](https://community.adobe.com/t5/illustrator-discussions/blend-blurred-shapes/m-p/12996109); [Adobe, *Blended objects*](https://helpx.adobe.com/ee/illustrator/desktop/manage-colors/apply-transparency-and-blending/blended-objects-overview.html); [Adobe Community, *semi-realistic shading*](https://community.adobe.com/t5/illustrator-discussions/is-semi-realistic-shading-possible-in-illustrator/m-p/12392492); [Gradient mesh guide](https://graphic-design-employment.com/illustrator-gradient-mesh.html) |
| V4 | **Las mallas de SVG 2 no existen en los navegadores.** Se emulan **subdividiendo** cada parche de Coons en celdas pequeñas de color liso. Hacen falta muchos parches, y el archivo crece. | [dvisvgm, *Gradients*](https://dvisvgm.de/Gradients/); [W3C SVG WG, *Advanced gradients*](https://www.w3.org/Graphics/SVG/WG/wiki/Proposals/Advanced_Gradients) |

### 2.6 Derechos: lo que una licencia libre no cubre

| # | Hecho | Fuente |
|---|---|---|
| D1 | CC BY 4.0 **no licencia** los derechos de publicidad, de privacidad ni otros derechos de la personalidad. CC0 sí renuncia a los del autor sobre la imagen, pero no a los de la persona retratada si es otra. | [CC BY 4.0, texto legal §2(b)](https://creativecommons.org/licenses/by/4.0/legalcode); [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/legalcode) |
| D2 | Usar el parecido de alguien en un juego sin su autorización escrita es un riesgo real. Hay demandas de modelos y luchadores. | [Ahn v. Midway](https://cyber.harvard.edu/metaschool/fisher/joint/links/cases/ahn.html); [BTLJ, *Right of publicity lawsuits against video game companies*](https://btlj.org/2014/12/the-right-of-publicity-likeness-lawsuits-against-video-game-companies/); [Game Developer, *Right of publicity in video games*](https://gamedeveloper.com/business/right-of-publicity-in-video-games---how-you-can-legally-include-a-celebrity-in-your-game) |
| D3 | Unsplash (licencia gratuita) **no incluye la autorización** de las personas reconocibles, y la plataforma no comprueba que exista. | [Unsplash Help, *Releases and trademarks*](https://help.unsplash.com/en/articles/2612329-releases-and-trademarks) |

---

## 3. Método de producción vectorial («vector por vector»)

### 3.1 Principio

> **El realismo sale de la luz y del material. La línea solo va donde hay un borde real.**

Una pieza realista no tiene más líneas que una de dibujo animado. Tiene **una fuente de luz coherente**: la
ventana de la sala arriba a la izquierda, la placa cian abajo y la lámpara de VELA a la derecha. Tiene además
**materiales que reaccionan a esa luz de forma distinta**: pintura mate, metal anodizado, aluminio cepillado,
cromo, vidrio, goma, nitrilo y algodón.

### 3.2 Las 8 capas, siempre en este orden

| Capa | Qué es | Cómo se dibuja en Canvas 2D | Alfa típica |
|---|---|---|---|
| **1 · Silueta base** | La forma, rellena con el valor medio | `ctx.fill(path)` con el color medio. `evenodd` para anillos y biseles. | 1 |
| **2 · Color local** | El color propio del material, con su degradado de luz «de mesa» (arriba más claro) | `createLinearGradient` vertical de 3–4 paradas, recortado a la silueta | 1 |
| **3 · Sombra de forma** | Lo que no mira a la luz principal (arriba a la izquierda) | Degradado lineal en diagonal `#ffffff → gris` con **`multiply`** | 1 (el gris marca la fuerza) |
| **4 · Luz reflejada** | La luz que rebota de lo que hay cerca: la placa cian desde abajo y la mesa cálida | Degradado de rgba(91,192,235,a) a 0 con **`screen`** en el borde inferior | 0,12–0,22 |
| **5 · Especular** | El reflejo de la fuente de luz: banda (ventana) o punto (bombilla) | Trazo o elipse blanca con degradado a lo largo, `source-over` | 0,3–0,9 |
| **6 · Luz de borde** | La arista que roza una luz de contraluz o lateral | Trazo fino con degradado de color de la luz a transparente | 0,3–0,5 |
| **7 · Textura** | Grano de pintura, estrías del cepillado, trama de la tela | Patrón de ruido 64 × 64 determinista en **`soft-light`**; estrías como `fillRect` de 0,16–0,22 u | 0,03–0,08 |
| **8 · Contorno nítido** | Solo donde termina un objeto o se encuentran dos materiales | `ctx.stroke(path)` en **px CSS** (§3.8), casi negro con alfa 0,75–0,9. **Nunca** sobre un brillo ni dentro de una misma superficie. | 0,75–0,9 |

**Reglas:**

- Las capas 3 a 7 siempre van **recortadas** (`ctx.clip(path)`) a la silueta de la capa 1.
- Un solo especular por superficie.
- El especular y la luz de borde **nunca** van en el mismo lado: el especular mira a la ventana (arriba a la
  izquierda) y la luz de borde viene de la lámpara (derecha) o de la placa (abajo).

### 3.3 Formato de autoría

- Cada forma es una **cadena de trazado SVG escrita a mano** en un `.ts`. Ejemplo:
  `export const BEZEL = 'M19 23.5H63A3.5 3.5 0 0 1 66.5 27V57A3.5 3.5 0 0 1 63 60.5H19…Z'`. Las coordenadas van
  en la caja de 100 × 100 con un decimal como mucho. Se pueden pegar en cualquier visor SVG para revisarlas, y se
  convierten con `new Path2D(d)` una sola vez, al cargar el módulo.
- Las formas paramétricas (rectángulos redondeados, círculos, anillos) se generan con funciones puras que
  devuelven `d`, como `rr()` y `circ()` del prototipo. Se pueden testear y siguen siendo SVG.
- **Calcar sobre referencia**: la página de arte (`art-dev.html`) gana una sección «calco». Muestra la foto de
  referencia de `docs/arte-realista/referencias/ref-*`, solo en desarrollo y nunca empaquetada, bloqueada y al 35 % debajo del vector, con
  un conmutador para ver la silueta en alambre. Es el flujo de la «capa bloqueada» de los tutoriales (V1).
- **Nada de herramientas generativas**, tampoco para «calcar». Las referencias son fotos humanas con licencia
  (§9).

### 3.4 SVG en línea o Canvas 2D: decisión para este código

| Criterio | SVG en línea | Canvas 2D + `Path2D(d)` |
|---|---|---|
| Nitidez a cualquier DPR | Sí, nativa | Sí, si el lienzo se dimensiona a `css × dpr`, como ya hace `Portrait.fit()` |
| Animación por fotograma (traza, lámpara, aguja) | Cambiar atributos cada fotograma recalcula estilos y repinta. SMIL o CSS no sirven para la traza. | Directo: es el modelo actual (`Portrait.frame()`, `paintScene`) |
| Degradados cónicos y modos de fusión | Sin degradado cónico; `mix-blend-mode` por elemento y caro | `createConicGradient`, `multiply`, `screen` y `soft-light` nativos |
| Desenfoques y ruido | `feGaussianBlur` y `feTurbulence`: caros en móvil y no deterministas entre motores | Degradados radiales y un tile de ruido determinista |
| Tests actuales («mismo fotograma en cualquier instante», «dentro de la caja») | Habría que reescribirlos | Ya existen para Canvas (`portraits.test.ts`, `characters.test.ts`) |
| Composición con escenas (intro, cinemáticas) | Habría que mezclar DOM y canvas | El mismo `drawVelaArt(ctx, …)` dibuja en cualquier escena |
| Caché | El navegador cachea el SVG estático | Mapa de bits en un lienzo fuera de pantalla por tamaño × DPR (§3.9) |

**Decisión:** **autoría en datos de trazado SVG y render en Canvas 2D** con `Path2D`. Las capas estáticas se
cachean y se repinta solo lo dinámico.

**El SVG en línea queda para:**

- los iconos de 24 px, como hoy;
- la placa de identificación de la tarjeta de bata, si se quiere texto seleccionable;
- la exportación de la página de arte.

### 3.5 Cómo emular una malla de degradado en Canvas 2D

1. **Elipses de degradado apiladas** (la técnica principal, equivalente a los degradados libres de Illustrator).
   Cada «nodo» de malla es un `createRadialGradient(0,0,0, 0,0,1)` dibujado tras `ctx.setTransform(...)`, que lo
   escala y rota hasta una elipse. Se apilan de 3 a 6 recortadas a la silueta, del tono más oscuro al más claro,
   con un alfa de 0,25–0,6. Sirve para la piel en contraluz, los pliegues de la bata y las yemas del guante.
2. **Rampa de cilindro de 5 paradas** para tubos, asas, dedos y la manga: borde oscuro → **especular al 28 %** →
   local → **luz reflejada al 82 %** → borde oscuro. Ejemplo del asa del prototipo: `0 #3a3d40 · 0,28 #f7f7f5 ·
   0,5 #a4a8ab · 0,82 #c9dbe4 · 1 #2e3134`.
3. **Degradado cónico** para piezas torneadas o con cepillado radial (mandos, aros cromados): 8–16 paradas que
   alternan claro y oscuro. *Fallback*: un radial.
4. **Parche de Coons teselado** (solo si 1–3 no bastan, por ejemplo en un pliegue de tela muy visible). Se evalúa
   el parche en una rejilla de 24 × 24 y se pinta cada celda como un cuadrilátero de color liso, **una sola vez
   al construir la caché**, nunca por fotograma. Como alternativa, WebGL2 con color por vértice (el juego ya tiene
   el contexto).

**Prohibido:**

- `ctx.filter`: no existe en Safari.
- `shadowBlur` en el bucle: sí se permite en la pasada de caché si no hay otra opción.
- Imágenes generadas.

### 3.6 Ejemplo resuelto 1: el bisel de la pantalla de VELA

**Geometría** (caja 100 × 100):

- Bisel: `rr(15.5, 23.5, 51, 37, 3.5)`.
- Vidrio: `rr(18.5, 26.5, 45, 31, 2)`.
- El aro es el bisel menos el vidrio: un solo `Path2D(bezel + glass)` rellenado en `evenodd`.
- `PX = 100 / tamañoCss` convierte px CSS a unidades.

**Material**: aluminio anodizado gris oscuro, con chaflán interior hacia la pantalla.

| Capa | Operación exacta | Paradas / valores |
|---|---|---|
| 1 · Silueta base | `fill(aro, 'evenodd')` | `#1f252a` |
| 2 · Color local | lineal vertical y 23,5 → 60,5 | `0 #3b434a` · `0,08 #2b3238` · `0,55 #1f252a` · `1 #161a1e` |
| 3 · Sombra de forma | `clip(aro)`, `multiply`, lineal (15,5; 23,5) → (66,5; 60,5) | `0 #ffffff` · `0,55 #d9dde0` · `1 #8e959b` (el chaflán mira abajo a la derecha) |
| 4 · Luz reflejada | `screen`, lineal y 60,5 → 55 | `0 rgba(91,192,235,0,18)` → `1 rgba(91,192,235,0)` (la placa cian, desde abajo) |
| 5 · Especular | trazo de (19; 24,15) a (63; 24,15), **0,6 px CSS** | lineal x: `0 rgba(255,255,255,0)` · `0,2 rgba(255,255,255,0,55)` · `0,7 rgba(255,255,255,0,22)` · `1 rgba(255,255,255,0)` (la ventana); más un filo interior a y 26,1, `rgba(160,172,182,0,5)`, 0,5 px |
| 6 · Luz de borde | trazo vertical x 66,15, de y 27 a 57, **0,55 px CSS** | lineal x 66,5 → 62: `rgba(255,177,110,0,45)` → `0` (la lámpara de VELA, a la derecha) |
| 7 · Textura | `soft-light` 8 %: tile de ruido 64 × 64 a escala 0,2; estrías horizontales cada 0,45 u, de 0,22 u de alto | estría clara `rgba(255,255,255,0,03)` u oscura `rgba(0,0,0,0,04)` según `hash(y)` |
| 8 · Contorno nítido | `stroke(vidrio)` **0,75 px CSS** `rgba(0,0,0,0,9)`; `stroke(bisel)` **1 px CSS** `rgba(0,0,0,0,75)` | solo donde el metal toca el vidrio y el frontal |

Código de referencia: `docs/arte-realista/prototipo/vela-proto.js`, función `drawBezel(ctx, upTo)`. Resultado capa a
capa: `docs/arte-realista/prototipo/bezel-capas.png`.

### 3.7 Ejemplo resuelto 2: la mano con guante de nitrilo (tú, en primera persona)

- **Referencias**: `docs/arte-realista/referencias/ref-guante-nitrilo.jpg`, `public/art/photos/pipeta-guante-csiro.webp`
  y `public/art/photos/pipeteo-nci.webp`.
- **Pose**: mano derecha de tres cuartos sosteniendo la pipeta o la placa. Entra por abajo a la derecha, con el
  puño de la bata elegida (§5.5).

| Capa | Qué | Valores |
|---|---|---|
| 1 · Silueta | Un trazado para la palma y los dedos (dorso visible). Los dedos que se solapan van como trazados aparte, para poder sombrearlos uno a uno. | relleno `#4f9be0` (nitrilo azul medio) |
| 2 · Color local | lineal a lo largo del antebrazo (de muñeca a yemas) | `0 #3c86cf` · `0,6 #5aa7ea` · `1 #7cbcf2`: las yemas son más translúcidas y más claras |
| 3 · Sombra de forma | Por dedo, rampa de cilindro (§3.5-2) perpendicular al dedo, con `multiply`. Bajo cada dedo, una sombra de contacto: elipse radial `rgba(10,40,80,0,35)` → 0. | rampa `0 #9fb3c8` · `0,28 #ffffff` · `0,6 #dfe7ef` · `0,85 #c4d3e2` · `1 #7f97b0` |
| 4 · Luz reflejada | El borde inferior de dedos y palma recibe el cian de la placa | `screen`, `rgba(91,192,235,0,2)` → 0 en 2 u |
| 5 · Especular | **Una** banda alargada por falange, en el lomo del dedo: el nitrilo es satinado y la banda es ancha y suave | elipse rotada, alfa 0,35 en el centro → 0; nudillos con un toque de 0,5 |
| 6 · Luz de borde | La lámpara cálida de VELA roza el canto exterior del índice | trazo 0,55 px, `rgba(255,177,110,0,4)` → 0 |
| 7 · Textura | Arrugas del nitrilo en nudillos y muñeca: 3–5 trazos curvos por nudillo | 0,5 px, `rgba(20,50,90,0,25)`, con su filo claro paralelo `rgba(255,255,255,0,18)`, desplazado 0,3 u hacia la luz |
| 8 · Contorno | Solo la silueta exterior de la mano y el borde del puño enrollado | 1,25 px CSS, `rgba(10,25,45,0,85)` |

**Variantes de guante** (son puramente estéticas):

| Nitrilo | Paradas de color local |
|---|---|
| Azul (por defecto) | `#3c86cf` · `#5aa7ea` · `#7cbcf2` |
| Violeta (bata «cuello mao») | `#5b47b8` · `#7d66d8` · `#a08cf0` |
| Rosa (asset CDC) | `#c8415e` · `#e0657e` · `#f08aa0` |

### 3.8 Escala de grosores de línea (en px CSS, a cualquier DPR)

| Token | Grosor | Para |
|---|---|---|
| `hair` | **1 px de dispositivo** (`1 / dpr` px CSS) | retículas, marcas de escala, estrías visibles, malla VFD |
| `fine` | 0,5 px | filos de grabado, chaflanes interiores |
| `detail` | 0,75 px | líneas interiores reales: borde del vidrio, costuras, pliegues |
| `contour` | **1,25 px** | siluetas de objetos en ilustraciones y retratos (proporción contorno/detalle ≈ 1,7, dentro del rango de I1–I2) |
| `leader` | 1 px, con un punto de 2,5 px en el extremo | líneas guía de las láminas |
| `icon` | 1,75 px a 24 px | iconos (ADR-024, sin cambio) |
| `emph` | 2 px | foco, selección |

**Implementación:**

- Dentro de la caja de 100: `PX = 100 / tamañoCss` y `ctx.lineWidth = grosorCss * PX`.
- Para `hair`: `PX / dpr`.
- Para que una línea de 1 px horizontal o vertical sea nítida, su coordenada se alinea al centro del píxel de
  dispositivo: `snap(v) = (Math.round(v * k) + 0.5) / k`, con `k = (tamañoCss / 100) * dpr`.

### 3.9 Rendimiento y caché

- **Estático**: chasis, frontal, bisel, placa, rejilla y mando de VELA; tela, coat rack y placas de identificación.
  Se dibuja una vez en un lienzo fuera de pantalla con la clave `id|tamañoCss|dpr|tema|vestuario`, y cada
  fotograma solo hace un `drawImage`.
- **Dinámico** (cada fotograma): la pantalla (traza, etiqueta, destello), la lámpara (lente, halo y reflejo) y el
  LED.
- **Presupuesto**: ≤ **0,5 ms** por retrato y fotograma en un móvil medio. Como mucho 6 degradados nuevos por
  fotograma (lámpara 3, pantalla 3). Cero asignaciones en el bucle: trazados y puntos de la traza en un
  `Float32Array` reutilizado.
- El *gate* de 30 fps (CLAUDE.md) se mide con el diálogo abierto y VELA hablando.

### 3.10 Lista de revisión de arte (antes de dar una pieza por terminada)

1. ¿Hay **una** luz principal arriba a la izquierda, coherente con el resto?
2. ¿Tiene **cada material** su respuesta? Mate, satinado, metal y vidrio no se parecen entre sí.
3. ¿Hay **un solo** especular por superficie, con la forma de su fuente?
4. ¿El contorno está **solo** en los bordes reales y con el grosor del token?
5. ¿Se lee a **28 px**, con el avatar mini, y a **240 px**?
6. ¿Es nítido a DPR 1, 2 y 3 (capturas)?
7. ¿Es determinista y queda quieto con *Reducir movimiento* (tests)?
8. ¿Sin `ctx.filter`, sin `Math.random` y sin `shadowBlur` en el bucle?

---

## 4. (b) VELA · Monitor de cultivo MC-7

### 4.1 Concepto

VELA es el **monitor de cultivo** del laboratorio: un instrumento de sobremesa unido a la placa por un cable de
sonda. Vigila el cultivo toda la noche, que es justo lo que hace un Incucyte (L1). Su nombre tiene dos lecturas:

- **la lámpara piloto que Albor nunca apagó**, como la llama que calentaba las incubadoras antiguas (L10);
- **estar en vela**, velar de noche en la Estación Vigilia.

El chiste del guion se queda: «Es un acrónimo. Nadie sabe de qué».

Habla **por su pantalla**: la traza de osciloscopio es su voz, la etiqueta dice su estado como lo diría un equipo
real, y la lámpara es su temperamento. No tiene cara, ni ojos, ni manos.

### 4.2 Anatomía y proporciones (caja 100 × 100, retrato de diálogo)

| Pieza | Geometría (u) | Notas |
|---|---|---|
| Asa | tubo `rr(21, 7.2, 58, 3.2, 1.6)`, postes `rr(24±2, 8.6, 4, 6, 0.8)` y `rr(76±2, …)` | cromo; aquí van la bufanda y la medalla (§4.10) |
| Chasis | `rr(8, 14, 84, 74, 4.5)` | proporción ≈ 8 : 7 (unos 26 × 22 cm, al lado de una placa de 90 mm) |
| Cara superior | banda y 14 → 18,6, con filo a y 18,6 | da volumen: se ve un poco desde arriba |
| Frontal | `rr(12, 20, 76, 62, 3.5)` | vidrio ahumado y anodizado, metido 1 mm en el chasis |
| Bisel de pantalla | `rr(15.5, 23.5, 51, 37, 3.5)` | §3.6 |
| Pantalla (vidrio) | `rr(18.5, 26.5, 45, 31, 2)` | aprox. 3 : 2 |
| Lámpara piloto | centro (77, 31), aro r 6,4, lente r 4,7 | joya facetada ámbar con aro cromado |
| LED de alarma | centro (77; 41,2), r 1,25, rótulo «ALM» | rojo, aparte: una lámpara de filamento no cambia de color |
| Rejilla de altavoz | 3 × 4 agujeros r 0,85 en x 72,6 / 77 / 81,4 e y 46,5 / 50 / 53,5 / 57 | el labio inferior de cada agujero coge luz |
| Mando | centro (77; 71,5), faldón moleteado r 5,4, cara r 4,1 | 40 estrías; cara con cepillado radial (cónico) |
| Placa de identificación | `rr(15.5, 64, 51, 15, 1.2)` | aluminio cepillado y dos remaches |
| Pies | `rr(16, 87.4, 12, 2.8, 1)` y `rr(72, …)` | goma negra |
| Cable de sonda | `M92 70C97 71 99 76 98 84C97.4 89 99 94 104 100` | silicona negra con un brillo largo; sale del encuadre hacia la placa |

**Placa de identificación** (JetBrains Mono, grabado: relleno `#26292c` y filo `rgba(255,255,255,0,55)`
desplazado (+0,12; +0,18) u):

```
VELA                              5,2 u · 700 · tracking 0,22 em
MONITOR DE CULTIVO · MC-7         2,05 u · 600 · tracking 0,06 em
ESTACIÓN VIGILIA · N.º 0451       1,7 u · 500 · tracking 0,06 em
```

Las letras se espacian a mano, carácter a carácter: no se depende de `ctx.letterSpacing`.

### 4.3 Materiales y colores

| Material | Paradas (de arriba abajo o en la dirección indicada) | Acabado |
|---|---|---|
| Pintura en polvo, blanca cálida (chasis) | `#f4f2ed` · 0,12 `#e8e5de` · 0,6 `#d9d5cc` · 1 `#c3beb3`; cara superior `#fbfaf7 → #efece6`; sombra lateral con `multiply` `#ffffff` (0–0,7) → `#cfc8bc` (1) | mate, grano al 6 % en `soft-light` |
| Frontal ahumado | `#272d32` · 0,06 `#1b2024` · 1 `#101316`; sombra de encaje `rgba(0,0,0,0,6)` → 0 en 3,5 u; banda diagonal `rgba(255,255,255,0,07)` → 0,025 → corte a 0 al 35 % | brillo de vidrio |
| Anodizado (bisel) | §3.6 | satinado con cepillado horizontal |
| Aluminio cepillado (placa) | horizontal: `#b9bcbf` · 0,45 `#e8eaeb` · 0,55 `#dcdfe0` · 1 `#a9adb1`; estrías cada 0,32 u | anisotropía: estrías horizontales, brillo vertical |
| Cromo (asa, aro de la lámpara) | asa: rampa de cilindro (§3.5-2); aro: cónico de 8 paradas `#f4f4f1` / `#6c6f72` | espejo |
| Goma y silicona | `#3a3c3e → #141516`; brillo `rgba(255,255,255,0,22)` a 0,45 px | mate |
| Vidrio de pantalla | fondo `#03100d` + emisión mínima `rgba(tinta,0,035)` + viñeta `rgba(0,0,0,0,55)` en el borde + reflejo diagonal `0,10 → 0,03 → 0` (corte al 29 %) | |
| **Tintas de pantalla** | teal (por defecto) núcleo `#dcfff6`, cuerpo `#5ee6c8`, halo `94,230,200` · ámbar `#ffe2b8` / `#f2a541` · rojo `#ffd0c8` / `#ff5a4a` · oro `#fff1c2` / `#ffd166` | fósforo de 505 nm (L7) |
| **Lámpara** (cuerpo negro) | núcleo `#fff6e0`; 0,28 → color a K; 0,72 → color a (K − 700); 1 → 1900 K `#ff8400`. Apagada: `#3c2614 → #1b1109`. Halo en `screen` r 11 (alfa 0,32 × brillo) y r 24 (0,10 × brillo). | joya con 8 facetas `rgba(0,0,0,0,14)` |
| LED de alarma | encendido `#ffd9d2 → #ff3b2e` con halo r 6 `rgba(255,59,46,0,45)`; apagado `#5a2320 → #2a0d0b` | |

### 4.4 Orden de capas de VELA

Del fondo hacia delante:

1. Cable.
2. Asa.
3. Chasis: las 8 capas.
4. Pies.
5. Frontal.
6. Bisel (§3.6).
7. Placa.
8. Rejilla.
9. Mando.

Todo lo anterior es estático y va cacheado. Encima, lo dinámico:

10. Pantalla: fondo → retícula 6 × 4 en `hair` → fila de estado → traza (3 pasadas) → etiqueta → destello →
    malla VFD → viñeta → reflejo del vidrio.
11. Lámpara: aro → lente → facetas → halo → reflejo.
12. LED de alarma.
13. Vestuario: bufanda, medalla y flor (§4.10). Va cacheado aparte por vestuario.

### 4.5 Los estados de expresión

**Velocidad de la traza**: barrido continuo de izquierda a derecha, como un osciloscopio. Nunca rebota.

| Estado | Traza (amplitud en u) | Tinta | Etiqueta de pantalla | Lámpara (K · brillo · parpadeo) | LED | Transición de entrada |
|---|---|---|---|---|---|---|
| **reposo** (`neutral`) | senoide de 0,25 Hz («respiración»), A 1,3, más ruido 0,25 | teal | `MONITORIZANDO` | 2700 K · 0,62 · ±3 % lento | apagado | 300 ms de fundido de la traza |
| **hablando** (`talking`, con cualquier humor) | ráfagas de voz: dos senos (30 y 47 rad/s) por la envolvente de `talk`, A hasta 6; un *tick* de +0,6 u por cada letra escrita | la del humor | `◉ VOZ` delante de la etiqueta del humor | +15 % × `talk` | — | inmediata: es la voz |
| **contenta** (`happy`) | *chirp* que se abre a senoide limpia de 1 Hz, A 3,2 | teal | `✓ ESTABLE` | 3200 K · 0,90 · ±2 % | — | lámpara a 90 % con inercia de 120 ms |
| **preocupada** (`worried`) | irregular, con *jitter* (ruido A 2,4 a frecuencia alta) | **ámbar** | `▲ ATENCIÓN` | 2200 K · 0,45 · parpadeo irregular ±22 % (filamento que flojea) | — | 200 ms; marco ámbar de 0,5 px dentro del vidrio |
| **sorprendida** (`awed`) | pico de 9 u tipo QRS y oscilación amortiguada (`e^{-0,12d}·cos 0,9d`) | teal | `! NUEVO REGISTRO` | 3600 K · 1,0 (destello que baja a 0,8 en 600 ms) | — | destello de exposición de la pantalla de 120 ms que decae en 600 ms; **uno** por cambio de estado |
| **dormida** (`sleepy`) | sin traza: un punto tenue cruza despacio (salvapantallas, 2,2 u/s) | teal al 22 % | `STANDBY  03:12` (la hora de la estación) | respira a 0,2 Hz (12/min), del 8 % al 45 %, a 2400 K | — | pantalla a negro en 400 ms |
| **alarma** (nuevo, `alarm`) | casi plana con ruido de fondo (0,25) | **rojo** | banda roja invertida con rayado de 45°: `ALARMA · <parámetro>` (ej. `T 39,4 °C`, `PLACA LLENA`, `TIEMPO`) | 2200 K · 0,15 | **destello a 2 Hz**, 50 % del ciclo (≤ 3 destellos/s, WCAG 2.3.1) | inmediata |
| **orgullosa** (`proud`) | igual que contenta | **oro** | `★ RÉCORD` o `✓ REGISTRADO` | 3200 K · 0,85 | — | 200 ms |
| **pensando** (`thinking`, el de los doctores) | barra de escaneo que barre la pantalla a 0,8 Hz | teal | `ANALIZANDO…` | 2700 K · 0,62 | — | 200 ms |

**Reglas de expresión:**

- La etiqueta es **funcional** (lo que diría un equipo real) y no sustituye al texto del diálogo. Va siempre en
  español o inglés según el idioma: `MONITORING`, `STABLE`, `ATTENTION`, `NEW RECORD`, `STANDBY`, `ALARM`,
  `RECORD`, `ANALYSING…`. Las cadenas van en `{ es, en }`.
- Las lecturas de la fila de estado (`37,0 °C   5,0 % CO₂`) no son un adorno de otro juego: pueden mostrar datos
  reales del juego (criaturas vivas, Esencia/s) si el integrador expone el `GameView` al retrato. Opcional.
- *Reducir movimiento*:
  - la traza se congela en su forma final de estado;
  - la lámpara no parpadea ni respira (dormida = 25 % fijo);
  - el LED de alarma queda **fijo**;
  - no hay destello;
  - sí cambia la etiqueta.
  - Test: el mismo fotograma en cualquier instante.

### 4.6 Hablar

- `talk` (0..1, ya suavizado por `Portrait.frame`) modula la amplitud de la traza y +15 % de la lámpara.
- Cada carácter que escribe la máquina de escribir del diálogo empuja un *tick* en la traza. El sonido «blip» del
  audio ya existe y se mantiene.
- **Sin boca.** Cuando termina de hablar, la traza vuelve a su estado en 250 ms.

### 4.7 Mapeo con el guion (sin romper contratos)

| `Mood` del guion (`src/story/types.ts`) | Estado de VELA |
|---|---|
| `neutral` | reposo |
| `happy` | contenta |
| `worried` | preocupada |
| `awed` | sorprendida |
| `sleepy` | dormida |
| `proud` | orgullosa |
| `thinking` | pensando (hoy se ve neutral) |

- `ArtMood` en `src/ui/art/vela.ts` gana `'alarm'` y `'thinking'`.
- Si el guion quiere usar la alarma, `Mood` gana `'alarm'`. Es un **campo nuevo en una unión** (ampliación, no
  rotura) en `src/story/types.ts`, que no es contrato de `src/core`. Se anota para el integrador.
- `PortraitState` no cambia. `BLINK` de `portraits.ts` se convierte en los temporizadores del parpadeo de la
  lámpara.

### 4.8 Avatar mini (< 56 px, automático: `MINI_BELOW`)

- Solo el **bisel con la pantalla**, escalado × 1,8, y la **lámpara** en la esquina superior derecha (× 1,5).
- Sin placa, sin mando, sin rejilla y sin vestuario.
- La traza se queda en el 80 % de su amplitud y la etiqueta desaparece por debajo de 40 px.
- En alarma, la lámpara se sustituye por el LED rojo grande.
- Se ve en la fila inferior de `docs/arte-realista/prototipo/vela-estados.png`.

### 4.9 VELA de cuerpo entero en las escenas

En la intro, la placa y las cinemáticas:

- **Escala**: el chasis mide unas 2,4 veces el diámetro de la placa de 90 mm.
- **Apoyo**: sobre la mesa, con una sombra de contacto (§6.6) y el **cable de sonda** que va hasta el borde de la
  placa.
- **Luz que emite**: la lámpara proyecta un charco cálido elíptico en la mesa (`screen`, 2700 K, alfa
  0,10–0,18 × brillo) y la pantalla baña el frontal en teal.
- **Señalar** (tutorial): VELA no se mueve. Lo hace el **foco de la interfaz**, como hoy. Como mucho, la pantalla
  muestra una flecha `→` o un rótulo `OBJETIVO` mientras el foco está activo.
- **Cinemática «Primera luz»** (`src/ui/story/cinematic.ts`, «VELA floats beside her»): VELA **no flota**. Albor
  la lleva del asa o va sobre una caja a su lado, con la lámpara encendida.

### 4.10 Vestuario (Encargos): mismos ids, nuevo dibujo

| Id | Antes | Ahora |
|---|---|---|
| `scarf` | bufanda tejida en el cuello del matraz | **la bufanda mostaza de Albor anudada al asa**: tela de punto (trama de 0,8 u, rampa de cilindro en cada vuelta) que cuelga por la izquierda |
| `medal` | medalla en el pecho | **medalla del Comité colgada del asa** con su cinta: latón con degradado cónico y la cinta en rampa de cilindro; oscila como un péndulo amortiguado (ζ 0,15, 1,2 Hz) cuando cambia el estado |
| `flower` | flor en el corcho | **flor bioluminosa en un tubo de ensayo** sujeto con una pinza al lateral derecho: vidrio con Fresnel en los bordes, el tallo dentro y los pétalos de luz cian (es el único «ser vivo» que VELA lleva) |

### 4.11 Boceto

```
             ┌──────────────────────────────────────┐            ← asa cromada (bufanda / medalla)
            ┌┘                                      └┐
   ╭────────┴────────────────────────────────────────┴───────╮   ← chasis: pintura en polvo blanca
   │ ┌─────────────────────────────────────────────────────┐ │
   │ │ ╭─────────────────────────────────────╮   ╭─────╮    │ │   ← frontal de vidrio ahumado
   │ │ │MC-7  37,0 °C   5,0 % CO₂            │   │ ( ● )│   │ │   ← lámpara piloto ámbar (2200–3600 K)
   │ │ │┊   ┊   ┊   ┊   ┊   ┊  (retícula)    │   ╰─────╯    │ │
   │ │ │~~~~∿∿∿∿~~~~∿∿∿∿~~~~  ← traza = voz  │     ● ALM    │ │   ← LED rojo de alarma
   │ │ │┊   ┊   ┊   ┊   ┊   ┊                │   ∘  ∘  ∘    │ │
   │ │ │✓ ESTABLE        ← etiqueta de estado│   ∘  ∘  ∘    │ │   ← rejilla de altavoz
   │ │ ╰─────────────────────────────────────╯   ∘  ∘  ∘    │ │
   │ │ ┌─────────────────────────────────────┐   ∘  ∘  ∘    │ │
   │ │ │ V E L A                           ◦ │    ╭───╮     │ │   ← placa de aluminio grabada
   │ │ │ MONITOR DE CULTIVO · MC-7           │   │ ╲ │     │═╪══╗ ← cable de sonda hacia la placa
   │ │ │ ESTACIÓN VIGILIA · N.º 0451       ◦ │    ╰───╯     │ │  ║
   │ │ └─────────────────────────────────────┘   mando      │ │  ║
   │ └─────────────────────────────────────────────────────┘ │  ║
   ╰──▄▄▄▄──────────────────────────────────────────▄▄▄▄─────╯  ╚═→ (placa)
       pie                                            pie
```

- **Render real de la especificación**: `docs/arte-realista/prototipo/vela-estados.png`, con 8 de los 9 estados a 240 px CSS
  y DPR 2, más el avatar mini a 48 px.
- **Código**: `docs/arte-realista/prototipo/vela-proto.js`, unas 500 líneas sin dependencias. El paquete P1 lo porta a TS en
  `src/ui/art/vela.ts`.
- **Simplificaciones del prototipo**: «hablando» es un estado aparte (en el juego se superpone al humor); no
  dibuja «pensando» ni el vestuario; la caché de capas estáticas no está hecha (lo dibuja todo cada vez).

### 4.12 No

- Ojos, boca, cejas o caritas en la pantalla. Los símbolos `✓ ▲ ! ★` son de instrumento, no emoticonos.
- VELA que flota, salta, se balancea o se estira.
- Lámpara azul o verde (la lámpara es siempre cuerpo negro de 1900–3600 K).
- Destellos de más de 3 por segundo.
- Una traza que no se mueve de izquierda a derecha.
- Tapar el elemento al que se señala.

---

## 5. (c) Los doctores

### 5.1 Opciones ordenadas

| # | Opción | Realismo | Viabilidad hoy | Riesgo legal | Peso | Anima bien | Veredicto |
|---|---|---|---|---|---|---|---|
| A | **Sesión de fotos encargada**: modelos con **cesión de derechos de imagen** y obra por encargo, fondo neutro y luz de laboratorio | ★★★★★ | Baja: requiere presupuesto, fotógrafo y modelos; semanas | Bajo **si** hay contrato | Medio: 3–6 fotos de ≤ 50 KB | Mal (una foto no cambia de humor) | El ideal si el dueño quiere **caras**. Se deja como mejora futura (§5.8). |
| B | **Stock con autorización de modelo** (agencias de pago) | ★★★★★ | Media | Medio: licencias «editorial» o «no para productos a la venta», y contenido IA mezclado en las agencias | Medio | Mal | No: es caro, ambiguo y difícil de demostrar que no es IA. |
| C | **Fotos libres de personas** (Commons, Unsplash, Pexels) | ★★★★★ | Alta | **Alto**: una licencia CC o la de Unsplash no cubre el derecho de imagen (D1, D3), y usar a alguien real como personaje es lo que el encargo prohíbe | Medio | Mal | **Descartada** para caras. Sí sirve para **manos, objetos y lugares** (§5.2). |
| D | **Vector «grabado» o técnico con caras completas** | ★★★ | Media | Nulo | Muy bajo | Bien | Arriesgado: una cara dibujada a mano por código cae fácil en lo inquietante (*uncanny*) o vuelve a parecer cartoon. Solo en contraluz (E). |
| E | **Encuadre documental sin cara**: primera persona, manos con guante, bata y placa de identificación, cuaderno; Albor de espaldas, en contraluz o en Polaroid | ★★★★ | **Alta** | **Nulo** | Muy bajo (vector) más unos 100 KB de fotos | **Bien**: se expresa por gesto, luz y vaho | **Base de la recomendación.** |
| F | **Híbrido E + fotos de archivo + (A en el futuro)** | ★★★★–★★★★★ | Alta | Nulo, con créditos | ≈ 226 KB | Bien | **Recomendada.** |

### 5.2 Candidatos concretos

Todos están en el repositorio salvo los marcados ○: los que se empaquetan en `public/art/photos/` y los de solo
referencia (`ref-*`) en `docs/arte-realista/referencias/`.

| Asset | Autor · fecha | Licencia | Por qué no es IA | Uso |
|---|---|---|---|---|
| `pipeta-guante-csiro.webp`, [Commons](https://commons.wikimedia.org/wiki/File:CSIRO_ScienceImage_11401_CSIRO_researcher_with_pipette.jpg) | Morgan Brown, CSIRO · 2010 | **CC BY 3.0** (crédito y cambios) | foto de 2010 del archivo de una agencia científica | **tu mano** sembrando (intro «sow») |
| `pipeteo-nci.webp`, [Commons](https://commons.wikimedia.org/wiki/File:Pipetting_(1).jpg) | Diane A. Reid, NCI · 2005 | dominio público (gobierno federal de EE. UU.) | foto de 2005 del NCI | tus manos, alternativa; referencia del puño con guante |
| `placa-microscopio-nci.webp`, [Commons](https://commons.wikimedia.org/wiki/File:Petri_dish.jpg) | Linda Bartlett, NCI · 1980 | dominio público | foto analógica de 1980 | la placa bajo la lámpara: el recuerdo de Albor |
| `congelador-guante-cdc.webp`, [CDC PHIL 22155](https://wwwn.cdc.gov/phil/Details.aspx?pid=22155) | CDC / Emily Cramer, Todd Jordan · 2017 | dominio público (crédito al CDC) | fotograma documental de 2017 | la Nevera |
| `ref-guante-nitrilo.jpg`, [Commons](https://commons.wikimedia.org/wiki/File:Disposable_nitrile_glove.jpg) | Tjwood · 2004 | dominio público | foto de 2004 | referencia para dibujar el guante en vector |
| `ref-cuaderno-lbnl-1941.jpg`, [Commons](https://commons.wikimedia.org/wiki/File:Lab_book_-_Lawrence_Berkeley_National_Laboratory_-_DSC08822.JPG) | Daderot · 2011 (cuaderno de 1941) | dominio público | foto de 2011 de un objeto de 1941 | referencia del cuaderno (no se empaqueta: la letra es de una persona real) |
| ○ [Lab coats.jpg](https://commons.wikimedia.org/wiki/File:Lab_coats.jpg) | Pi. from Leiden · 2007 | CC BY 2.0 | foto de 2007 | referencia de batas colgadas sin persona; empaquetable con crédito |
| ○ [Lab coat and scrubs.jpg](https://commons.wikimedia.org/wiki/File:Lab_coat_and_scrubs.jpg) | Samir · 2006 | CC BY-SA 3.0 | foto de 2006 | **solo referencia** (Share-Alike): bata en percha |
| ✗ CDC PHIL [16809](https://wwwn.cdc.gov/phil/Details.aspx?pid=16809) y [2397](https://wwwn.cdc.gov/phil/Details.aspx?pid=2397) | CDC | dominio público | — | **rechazadas**: se ven caras de personas reales |
| ✗ [Proper lab attire.jpg](https://commons.wikimedia.org/wiki/File:Proper_lab_attire.jpg) | 2024, CC BY 4.0 | — | dibujo de 2024: procedencia no demostrable | **rechazada** |
| ✗ Unsplash y Pexels | — | — | conviven con imágenes IA y no garantizan la autorización de modelo | **rechazadas** para personas |

### 5.3 Recomendación: híbrido documental

1. **Tú eres la cámara.** Te ves en primera persona: tu mano con guante, el **puño de la bata que elegiste**, tu
   tarjeta de identificación colgada y tu cuaderno. Las escenas animadas van en vector (§3.7). Las fotos de manos
   (CSIRO, NCI) solo salen en planos fijos de la intro, con un ligero Ken Burns, y llevan crédito.
2. **Albor es una ausencia.** Siempre aparece de una de estas formas:
   - de espaldas en una Polaroid, mirando la aurora por la ventana;
   - por sus objetos: la grabadora, su cuaderno, su bufanda mostaza (que ahora lleva VELA) y su lámpara, que es
     la de VELA;
   - **una sola vez en vivo**, en el final secreto: de **perfil, a contraluz, al alba**.
   
   Así el personaje gana misterio, que es justo lo que pide la historia.
3. **Nada de caras dibujadas de frente.** El realismo sale de la luz (contraluz, rebote cian y lámpara cálida) y
   del material (algodón, nitrilo, lana, plástico de la tarjeta).

### 5.4 Técnica «contraluz» (Albor en vivo y las siluetas de las escenas)

| Capa | Albor en vivo, perfil izquierdo, al alba detrás |
|---|---|
| 1 · Silueta | Un trazado único: perfil (frente, nariz, labios, barbilla) + cuello + melena corta + bufanda + hombro con la parka. Es la forma más importante y se calca sobre una foto de **perfil genérica propia** (o del implementador con su permiso), **nunca** de una persona identificable de internet. |
| 2 · Color local | casi negro cálido `#14100e → #1d1714` (en sombra se pierde el color) |
| 3 · Sombra de forma | el 85 % de la cara queda en sombra: no hace falta modelarla |
| 4 · Luz reflejada | el cian de la placa por debajo de la mandíbula: `screen rgba(91,192,235,0,18)` → 0 en 6 u |
| 5 · Especular | **el cristal de las gafas redondas**: un arco brillante `rgba(255,236,200,0,9)` y el filo de la montura. Es el detalle que más vende el realismo. |
| 6 · Luz de borde | **el alba** (2200 → 3200 K): trazo 0,75–1,25 px por todo el perfil, más ancho en nariz, labios y pómulo (`rgba(255,184,123,0,85)` → 0 hacia dentro en 1,2 u); en el pelo, 20–40 mechones de 0,5 px con alfa al azar determinista; el **mechón plateado** con luz de borde fría `#dfe7ef` |
| 7 · Textura | lana de la bufanda (trama), plumón de la parka (costuras en arco) |
| 8 · Contorno | ninguno: en contraluz, el borde ya es luz |
| **Hablar** | **vaho**: al hablar salen 1–3 nubecillas de aliento por la boca (radiales `rgba(230,240,250,0,10–0,22)` que suben y se abren en 1,2 s), sincronizadas con `talk` |
| **Humor** | por postura: barbilla hacia arriba (contenta u orgullosa), hacia abajo (preocupada); y por la luz: el alba se aviva con `happy` |

### 5.5 «Elige tu bata»

**Composición del panel `arrive` de la intro:**

- Un **perchero de pared** con tres ganchos cromados.
- Tres batas colgadas en sus perchas, de frente y ligeramente giradas. Cada una lleva una **tarjeta de
  identificación** de PVC con pinza y cordón, con la foto en blanco (silueta gris de «sin foto») y el texto
  `TURNO DE NOCHE · ESTACIÓN VIGILIA`.
- Las batas van en vector con tela realista: color local blanco roto `#eef0ee → #cfd5d8`, pliegues con elipses
  apiladas (§3.5-1), costuras en `detail` y el **rebote cian** de la placa en el bajo.

| Id (compatible con la partida) | Nombre (es / en) | Diseño | Lo que verás de ella en el juego | Ficha (Mono, `caption`) |
|---|---|---|---|---|
| `curls` | **Bata clásica** / *Classic lab coat* | algodón, solapas, tres bolsillos, un bolígrafo en el bolsillo del pecho | puño blanco abotonado | `65 % POLIÉSTER · 35 % ALGODÓN` |
| `beanie` | **Parka polar** / *Polar parka* | parka roja de expedición (como la del programa antártico de EE. UU.) **sobre** la bata, con capucha de pelo sintético | puño rojo acolchado con velcro | `PLUMÓN · −40 °C` |
| `bun` | **Cuello mao** / *Mandarin-collar coat* | bata de bioseguridad de cuello alto, cierre lateral con corchetes y **puños elásticos de punto** | puño de punto gris y guante violeta | `PUÑO ELÁSTICO · NIVEL 2` |

**Interacción:**

- Al tocar una bata, se **descuelga**: sube 6 px y se adelanta, con un cajón de 220 ms con ease-out y sin
  rebote. La tarjeta oscila como un péndulo amortiguado (ζ 0,15, unos 1,5 Hz, 1,2 s).
- La elegida gana un aro de foco de 2 px (`emph`).
- *Reducir movimiento*: solo cambia el aro.
- **Objetivo táctil** ≥ 48 px. La bata entera es el botón, con `aria-label` = nombre.

**Textos:**

- `PLAYER_LOOK_NAMES` cambia a estos nombres.
- La línea del narrador «¿Cómo eres? Elige tu bata.» pasa a «¿Qué bata te pones? Elige una.» (§7.6).

### 5.6 El retrato de Albor en la intro (panel `tape`)

**Composición:**

- Un **tablero de corcho** junto a la ventana del laboratorio.
- **La ventana** es la foto `estacion-aurora-noaa.webp`, oscurecida al 60 % y con su refracción en el vidrio
  (§2.2-R7).
- En el corcho, **una Polaroid** sujeta con una chincheta. Dentro, Albor **de espaldas** frente a esa misma
  ventana, en vector y en contraluz: melena con el mechón plateado, bufanda mostaza y el brazo de las gafas
  brillando.
- Al pie de la Polaroid, escrito a mano (Fraunces cursiva, tinta azul `#23406e`): «Día 1 de la noche · A.».
- Debajo, sobre la mesa, la **grabadora** con los carretes girando y la aguja VU (§6.4) mientras suena la cinta.
- En el panel `dish` puede aparecer `placa-microscopio-nci.webp` en sepia, como «la última foto que tomó».

### 5.7 Retratos de diálogo (misma API: `drawAlbor`, `drawYou`, `drawCommittee`, `drawChoir`)

| Quién | Retrato |
|---|---|
| `albor` en cinta | **Grabadora** realista: plástico crema con la misma pintura que VELA pero más amarilla `#e9dfc8`, ventana ahumada, carretes que giran más rápido al hablar, cinta marrón, aguja VU amortiguada y la etiqueta de cinta de carrocero con «Cinta 3 · A.». En la esquina, la Polaroid. |
| `albor` en vivo | Perfil a contraluz con el alba (§5.4) |
| `you` | **Tu mano escribiendo** con estilográfica en el cuaderno, con el **puño de tu bata**. La tinta aparece trazo a trazo con el texto. |
| `committee` | El télex se queda, con materiales: cromo, papel con la trama del rodillo y el sello rojo con tinta de verdad (bordes irregulares). |
| `coro` | El ocular de latón se queda (el Orbium vivo dentro es real), con el latón moleteado del kit. |

### 5.8 Mejora futura: caras reales con contrato

Si el dueño quiere caras:

- encargar **una sesión de fotos** a un fotógrafo humano, que firme que no usa IA;
- con modelos adultos que firmen una **cesión de derechos de imagen** para uso comercial en videojuegos, en todas
  las plataformas y por tiempo indefinido;
- con **obra por encargo**, cediendo los derechos de autor;
- con fondo neutro, luz de laboratorio, y 3 a 5 expresiones por persona.

Se integra en los mismos huecos: Polaroid, final y tarjeta de identificación. Hasta entonces, **E + F**.

---

## 6. (d) Reglas de restyle para el resto del juego

### 6.1 Tokens nuevos (en `src/ui/art/tokens.ts` → `art.css`)

| Grupo | Token | Oscuro | Claro | Notas |
|---|---|---|---|---|
| Material | `mat.coat` (4 paradas) | `#f4f2ed #e8e5de #d9d5cc #c3beb3` | igual | pintura en polvo |
| | `mat.anod` | `#3b434a #2b3238 #1f252a #161a1e` | igual | bisel y marcos |
| | `mat.alu` | `#b9bcbf #e8eaeb #dcdfe0 #a9adb1` | igual | placas grabadas |
| | `mat.chrome` | `#3a3d40 #f7f7f5 #a4a8ab #c9dbe4 #2e3134` | igual | rampa de cilindro |
| | `mat.glass` | `#03100d` | igual | pantallas (siempre noche) |
| | `mat.rubber` | `#3a3c3e #141516` | igual | |
| Tinta de pantalla | `ink.teal` / `core` | `#5ee6c8` / `#dcfff6` | `#08745e` (texto fuera de la pantalla) | = `aurora` |
| | `ink.amber` / `core` | `#f2a541` / `#ffe2b8` | `#8f4d00` | = `warn` |
| | `ink.red` / `core` | `#ff5a4a` / `#ffd0c8` | `#bf3517` | alarma |
| Luz | `lamp.1900` · `2200` · `2700` · `3000` · `3200` · `3600` | `#ff8400` · `#ff9227` · `#ffa757` · `#ffb16e` · `#ffb87b` · `#ffc392` | igual | Helland (R5); `candle` pasa a ser alias de `lamp.3200` |
| | `bounce.dish` | `rgb(91,192,235)` | igual | luz reflejada de la placa |
| Lámina | `plate.paper` | `#10161c` | `#f3efe6` | papel de la lámina |
| | `plate.ink` / `ink2` | `#dfe7ee` / `#9aa6b2` | `#1d232a` / `#55606b` | AA: lo comprueba `tokens.test.ts` |
| | `plate.rule` | `#2a3540` | `#cfc8b8` | marcos y marcas de corte |

- Paleta categórica para gráficos dentro de las láminas: **Wong** `#E69F00 #56B4E9 #009E73 #F0E442 #0072B2 #D55E00
  #CC79A7` (F4).
- Los comportamientos mantienen sus colores, pero en las láminas van siempre **con su forma** (ya es regla) y con
  una clave, nunca como texto en color (F3).

### 6.2 Tipografía (mismas tres familias)

| Rol | Familia | Uso |
|---|---|---|
| Títulos de lámina y de pantalla | **Fraunces** 600–700, con **SOFT 0 y WONK 0** si el archivo autoalojado trae los ejes (más afilada, más «definida»). Si no, el peso tal cual. | «Lámina 7 · División», «Informe de la sesión 4» |
| Nombres latinos | **Fraunces cursiva**, nunca negrita | *Orbium unicaudatus*; «sp.» en redonda (F5) |
| Texto, cifras y etiquetas de panel | **Inter**, cifras `tabular-nums`; etiquetas **a, b, c en 700, minúscula, redonda** (F1) | texto de interfaz, leyendas «Fig. 2 · …» |
| Instrumentos | **JetBrains Mono** 500–700, MAYÚSCULAS con tracking 0,06–0,22 em | pantalla y placa de VELA, sellos, números de serie, `LÁMINA 07` |

- Las tallas siguen siendo las 8 de ARTE §4: 13, 14, 16, 18, 22, 28, 36 y 48.
- En Canvas se usan las mismas: el texto de lámina más pequeño es 13 px (`caption`) y solo para lo no esencial.
- Lo que hay que leer va a ≥ 14 px.

### 6.3 Líneas

La escala de §3.8 se aplica también al CSS:

- bordes de tarjeta `1px` en `plate.rule` (no sombras grandes);
- líneas guía `1px`;
- marcas de corte `hair`.

### 6.4 Movimiento de instrumento (en vez de movimiento de dibujo animado)

| Pieza | Comportamiento | Valores | *Reducir movimiento* |
|---|---|---|---|
| **Aguja** (VU, reloj, medidores) | segundo orden subamortiguado | ζ = 0,8, ωn = 19 rad/s: 99 % en unos 300 ms, sobrepaso del 1,5 % (L8) | salta al valor |
| **Lectura numérica** | se actualiza a **8 Hz** a saltos enteros, con el último dígito «tecleando»; cuenta en ≤ 600 ms; los dígitos cambian con un fundido de 80 ms, **sin escala ni rebote** | `tabular-nums` | valor final directo (ya hay test) |
| **Traza** | barrido a velocidad constante y reinicio en el borde derecho | 30 u/s | congelada |
| **Lámpara de filamento** | inercia térmica: encender o apagar con una exponencial de τ = 60 ms (encender) y 120 ms (apagar) | | cambio directo |
| **LED** | instantáneo; destello ≤ 3/s | 2 Hz | fijo |
| **Hojas y paneles** | **cajón**: ease-out de 220 ms (`cubic-bezier(.2,0,0,1)`) y salida de 160 ms, sin sobrepaso | ya en tokens | fundido de 80 ms |
| **Conmutadores** | 2 tiempos: desplazamiento de 60 ms y asentamiento de 1 px en 40 ms (el «clic» de un retén) | | sin asentamiento |
| **Péndulos** (tarjeta, medalla) | amortiguado | ζ 0,15, 1,2–1,5 Hz | quieto |

- **Fuera** para personas e instrumentos: `pop`, *squash & stretch* y las rotaciones de «saludo».
- **Se mantiene** en la **materia viva** (siembra, nacimiento: ARTE-PULIDO A-4), porque es Lenia y no un
  personaje.

### 6.5 Momentos como láminas científicas (`src/ui/moments/illustrations.ts`, `moments.css`, `momentsUI.ts`)

**Anatomía de la tarjeta-lámina:**

```
┌───────────────────────────────────────────────────────────┐
│ LÁMINA 07                                   ESTACIÓN VIGILIA│  ← Mono 13 px, tracking .12em, plate.ink2
│ División                                                   │  ← Fraunces 28 px
│ ┌ a ───────────────┐┌ b ───────────────┐┌ c ──────────────┐│  ← paneles a/b/c: Inter 700 14 px minúscula
│ │   ◯  ←───────────┼┼── «se estira»    ││   ◯   ◯         ││  ← líneas guía de 1 px con punto de 2,5 px
│ │  t = 0 s         ││  t = 12 s        ││  t = 24 s       ││  ← tiempo en Inter tabular 13 px
│ └──────────────────┘└──────────────────┘└─────────────────┘│
│ ▬▬▬ 5 mm          Parorbium dividuus                       │  ← barra de escala + nombre latino en cursiva
│ Fig. 7 · Una criatura se parte en dos y las dos viven.     │  ← leyenda Inter 16 px (la línea de VELA)
│ [■ viva] [□ forma] [▲ peligro]     ← clave de colores con su forma                         │
└───────────────────────────────────────────────────────────┘
```

**Reglas:**

1. **Número de lámina** fijo por tipo de Momento (`IllustrationKind` → `LÁMINA 01…24`). Así el jugador
   «colecciona» láminas en la ayuda «¿Qué pasó?».
2. **Paneles en secuencia temporal** (`t = 0 s / 12 s / 24 s`) en vez de una sola animación con flechas. La
   animación en bucle de hoy se mantiene **dentro del panel activo**, y los otros paneles son fotogramas fijos de
   la misma simulación real.
3. **Líneas guía** (1 px, con un punto de 2,5 px sobre la criatura) que salen de la palabra y van hasta el rasgo.
   Fuera las flechas gruesas que rebotan y los anillos que laten. Si hace falta dirección: una flecha técnica
   fina de 1 px con punta abierta de 6 px.
4. **Barra de escala** en cada lámina, abajo a la izquierda, con su número (F2). **Escala propuesta: 1 celda =
   0,7 mm.** Así la placa de Ø128 celdas mide 90 mm, una placa Petri estándar, y la de Ø224 mide 157 mm, cerca de
   la de 150 mm, también estándar. Un Orbium (R 13) mide unos 9 mm. La constante va en `src/ui/art/` (es de arte,
   no de balance).
5. **Nombre latino en cursiva** cuando hay especie, y nada de texto de color: los «chips» de consecuencia pasan a
   una **clave** con muestra de color y forma (F3).
6. **Papel**: en oscuro, `plate.paper` noche con tinta `plate.ink`; en claro, papel `#f3efe6`. Marcas de
   registro en las esquinas (`hair`, 6 px).
7. **VELA** aparece a la derecha de la leyenda como **avatar mini** con su estado (no grande), y su línea es la
   leyenda «Fig. 7 · …».
8. El contador «¿Por qué esta da más Esencia?» (`compare`) es una **lámina comparativa**: dos paneles a la misma
   escala, una barra de valor y la cifra en Inter tabular.

| `IllustrationKind` | Lámina | Paneles y anotaciones |
|---|---|---|
| `seed` | 01 · Siembra | a gota (t 0) · b espora asimétrica (t 2 s) · c forma (t 8 s); guía «ruido asimétrico» |
| `dissolve` | 02 · Disolución | a espora · b se difumina · c nada; guía «demasiado poca» |
| `explode` | 03 · Fusión | a dos semillas cerca · b se tocan · c mancha sin forma; cota de distancia mínima |
| `stable` | 04 · Criatura estable | contorno iso y la guía «borde» |
| `essence` | 05 · Esencia | la criatura con una gráfica pequeña de Esencia/s (ejes con unidades: «Esencia (/s)») |
| `species` | 06 · Especie nueva | retrato a escala + nombre latino + «Fig.» de la ficha |
| `compare` | 07 · Comparación | dos paneles a la misma escala |
| `still` … `division` (6 comportamientos) | 08–13 | trayectoria punteada con marcas cada segundo, como un registro de seguimiento de células |
| `golden` | 14 · Destello | trayectoria y halo; nota «la lámpara de Albor» |
| `upgrade`, `autoseed`, `rules` | 15–17 | esquema técnico de la mejora (cota, regla μ/σ como un dial) |
| `clock` | 18 · Reloj | esfera de cronómetro con aguja amortiguada |
| `seedPrice` | 19 · Precio de la semilla | la «ficha de cálculo» (§6.9) |
| `overgrown`, `extinctionReady`, `keepReset`, `offline` | 20–24 | igual, con paneles de antes y después |

### 6.6 Intro como noche de laboratorio realista (`src/ui/intro/scenes.ts`)

**Luz común de todas las escenas interiores:**

- La sala está casi a oscuras (`#06090d`).
- La **ventana** de la izquierda es la luz principal fría (luz de luna y aurora): la foto NOAA o NSF dentro del
  recorte de la ventana, con refracción.
- La **lámpara de VELA** es la luz cálida de la derecha, 2700 K.
- La **placa** es el rebote cian desde la mesa.
- **Mesa** de laboratorio de resina epoxi negra mate: `#15191c → #0d1012`, con un reflejo difuso de la lámpara.
- **Sombras de contacto** de cada objeto: una elipse radial `rgba(0,0,0,0,55)` → 0.

| Panel | Antes | Ahora |
|---|---|---|
| `station` | estación de juguete, nieve y aurora dibujadas | **foto** `estacion-aurora-noaa.webp` (Ken Burns 1,04 en 4 s; *Reducir movimiento*: fija); nieve real en partículas finas de 1 px; una ventana encendida en ámbar |
| `tape` | Albor *chibi* saludando con el farol | Polaroid de Albor de espaldas en el corcho y la grabadora sonando (§5.6) |
| `arrive` | tú *chibi* con la maleta y el selector de caras | puerta abierta con nieve que entra; **el perchero con las 3 batas** (§5.5); tu mano con guante entra en el encuadre al elegir |
| `candle` (el id se queda) | el matraz con la vela se enciende | **VELA se enciende**: la lámpara calienta en 1,2 s (2200 → 2700 K), la pantalla arranca con una línea de POST (`MC-7 · AUTOTEST OK`) y la traza aparece |
| `dish` | la placa dibujada | placa real (sprites Lenia) bajo la lámpara; posible inserto en sepia de `placa-microscopio-nci.webp` como recuerdo |
| `sow` | gota animada | **foto** `pipeta-guante-csiro.webp` en plano fijo, y la gota real cae en la placa (vector) |
| `essence`, `clock`, `tree` | pastillas e iconos con rebote | **láminas** (§6.5): lectura de Esencia con aguja, cronómetro técnico, el Árbol como diagrama de rutas con cotas |
| `go` | tú y VELA felices | la placa con su primera criatura bajo la lámpara; VELA con `✓ LISTA` |

### 6.7 Portada (`src/ui/splash.ts`)

- Se queda **el Orbium vivo**: es real, es lo mejor de la portada.
- Se enmarca como **lámina 0**:
  - marcas de registro en las esquinas;
  - retícula `hair` al 4 %;
  - **barra de escala** «5 mm» bajo la criatura;
  - *Orbium unicaudatus* en Fraunces cursiva, a 16 px, bajo la barra.
- Rótulo de instrumento arriba (Mono 13 px): `ESTACIÓN VIGILIA · TURNO DE NOCHE`.
- **BIOLUMA** en Fraunces, con una sola pasada de luz, como hoy.
- Opcional: el horizonte de la foto NOAA en el 20 % inferior, oscurecido al 70 %.
- Sin partículas de fantasía: unas pocas motas de polvo en el haz de luz.

### 6.8 HUD e iconos (`src/ui/session/hud.ts`, `session.css`, `src/ui/art/icons.ts`)

- **Contador de Esencia**:
  - cifra en Inter tabular;
  - rótulo `ESENCIA` en Mono 13 px con tracking;
  - unidad «/s» separada;
  - la cifra avanza a 8 Hz (§6.4), sin rebote;
  - el icono de gota recibe las motas (ARTE-PULIDO A-5) con un brillo de 120 ms, no con una escala.
- **Reloj de sesión**:
  - **esfera de cronómetro**: 60 marcas `hair`, 12 marcas mayores `detail` y aguja amortiguada (ζ 0,8);
  - en aviso, la esfera cambia a ámbar;
  - en los últimos 10 s, los dígitos van a saltos (ya existe) y la aguja avanza a pasos de 1 s con un retén.
- **Iconos**:
  - el sistema de 24 px y trazo 1,75 se queda;
  - se revisa que ninguno tenga cara ni sea un robot simpático (`MomentIcon 'robot'`, el sembrador automático,
    pasa a un brazo dosificador o una pipeta multicanal);
  - el icono de VELA, si lo hay, es la silueta del MC-7: un rectángulo con pantalla y un punto de lámpara.

### 6.9 Resumen de sesión y explicaciones de premio o precio

**Resumen** (`src/ui/session/summary.ts`, `session.css`): un **informe de laboratorio**.

- Cabecera en Mono: `INFORME · SESIÓN 4 · 03/11 · 02:41`.
- Las filas, como una **hoja de cálculo**, con las cifras alineadas por la coma decimal (tabulares) y los puntos
  guía:

```
Esencia ganada ..................... 1 240
÷ 100 ..............................    12,4  Datos
Especies nuevas  3 × 5 .............    15    Datos
───────────────────────────────────────────
Total ..............................    27    Datos     [REGISTRADO]
```

- El total cuenta a saltos. El sello `REGISTRADO` es tinta roja o dorada con borde irregular y se «estampa»: una
  sola vez, 120 ms, sin rebote.
- Las especies del día van como **fotografías de espécimen**: retrato `renderSpecimen` + barra de escala + nombre
  latino en cursiva + «¡Nueva!» en un rótulo de tinta.
- VELA, como avatar mediano con `✓ REGISTRADO`, dice su línea.

**Explicaciones de precio** (`src/ui/moments/price.ts`, `seedprice.ts`, `src/ui/seed-price.ts`, `strings.ts`):

> **Ojo con el significado.** En el código, `rsAlive1` y `rsAliveN` («+1 criatura viva → ×{m}») explican que **cada
> criatura viva encarece la próxima semilla** (bucle clásico, `crowdMult`). No son un premio. En el bucle de
> sesiones las vivas ya no suben el precio (`priceRose`, CLARIDAD J-121). La tarjeta tiene que decir sin ambigüedad
> si algo es **coste** (ámbar, ↑) o **premio** (verde, ×).

- **La hoja de precio** es una **ficha de cálculo**, como una línea de cuaderno de laboratorio. Hoy son baldosas
  con iconos que se multiplican.

  ```
  Precio de la semilla
  4  ×  1,25  ×  1  =  5 Esencia
  base   2 vivas  placa con sitio
  ```

  - Cada factor es una **lectura**: cifra Inter 22 px tabular y debajo su etiqueta en Inter 14 px.
  - Los factores inactivos (×1) van en `text3` con el trazo `hair`.
  - El signo `=` y el total en `display` 36 px.
  - Debajo, la regla en una frase («Cada criatura viva sube un poco el precio»), en Inter 16 px.
  - Los puntos de los espacios (`dotsHtml`) pasan a ser **pocillos** de una placa multipocillo: círculos de
    contorno `detail` llenos en cian si están ocupados y con borde ámbar si sobran.
- **El chip del cambio** (`PriceTicker`, 2,2 s) es una **etiqueta de rotuladora**:
  - fondo `mat.alu` oscuro `#2a3036` y texto Mono 13 px en mayúsculas: `+1 VIVA → ×1,25`;
  - flecha ↑ en ámbar si es coste y ↓ en verde si baja;
  - entra como cajón de 160 ms y sale con un fundido de 120 ms;
  - sin rebote.
- **Pastillas de estado** sobre la placa (`status.ts`, `MS.stBorn/stStable/stExploded/stDead`): **etiquetas de
  instrumento** con un **LED** de 6 px.

  | Estado | LED |
  |---|---|
  | Viva | verde fijo |
  | Naciendo | anillo que se llena |
  | Sin forma | ámbar |
  | Se apaga | gris que se apaga en 400 ms |

  Texto en Inter 13 px y fondo `rgba(6,9,13,0,72)`, sin `backdrop-filter`. Se respeta la regla de «como mucho 2
  en pantalla».
- **Premios** (bonus): la única forma de premio es la lectura en verde con su **×** y el sello `REGISTRADO`. Nada
  de confeti de colores sobre la interfaz: las motas de luz son de la materia (ARTE-PULIDO A-5).

### 6.10 Diálogo y burbujas (`src/ui/story/storyUI.ts`, `encargoUI.ts`, `story.css`)

- Caja de diálogo en `surface` con un borde de 1 px `plate.rule` y una sola elevación.
- El retrato de VELA es la **pantalla y la lámpara** (avatar mediano).
- El nombre va como **placa**: `VELA · MC-7` en Mono 13 px, tracking 0,12 em, en `lamp.3200` (sustituye a
  `candle`).
- Texto en Inter 17 px, la máquina de escribir se queda.
- Las burbujas de Encargo cuelgan como **etiquetas de rotuladora** de la barra de objetivo.

---

## 7. (e) Paquetes de trabajo y textos que cambian

### 7.0 Paso 0 · Integrador (un commit pequeño, antes de abrir los paquetes)

> **Hecho en la v0.021.** El kit vectorial no quedó en firmas vacías: cada función tiene una implementación
> sencilla y probada (`src/ui/art/vector/vector.test.ts`) para que P2, P3 y P4 dibujen desde el primer día; P1 la
> afina sin cambiar las firmas. Las 7 fotos, el cargador (`src/ui/art/photos.ts`, con `PHOTOS`: los créditos de
> cada una en `{ es, en }`) y su precaché en `public/sw.js` también son del paso 0.

- **ADR-029** (§8) y el texto «(Corrección)» en ARTE.md §6. CREDITS.md con la sección «Fotografías de archivo».
- `src/ui/art/tokens.ts`: los tokens de §6.1, generando `art.css` con `write-css.mjs`, y pasando
  `tokens.test.ts` (AA).
- `src/ui/art/vector/index.ts` (**solo tipos y firmas**):
  - `rr`, `circ`, `snap`;
  - `px(cssSize)`;
  - `grainPattern(ctx)`;
  - `kelvin(K)`;
  - `cylinderRamp(...)`;
  - `conicMetal(...)`;
  - `LayerCache` (clave → lienzo).

  P1 lo implementa, pero así P2 y P4 ya pueden importar.
- `src/ui/art/photos.ts`: el contrato del cargador de fotos.
  - `loadPhoto(id): Promise<HTMLImageElement | null>` a partir de `public/art/photos/<id>.webp`.
  - En el *single build*, como data URI.
  - Si falla, `null` y la escena se dibuja sin foto.
  - Se registra en `public/sw.js` para el modo sin red.
- `src/story/types.ts`: ampliar `Mood` con `'alarm'` (opcional, §4.7).

### 7.1 P1 · VELA instrumento

- **Archivos**:
  - `src/ui/art/vela.ts` (reescritura: `drawVelaArt`, `ArtMood` + `alarm` y `thinking`);
  - `src/ui/art/vector/*` (implementación del kit);
  - `src/ui/art/portraits.ts` (mapeo de humores, temporizadores de la lámpara en vez de `BLINK`, mini);
  - `src/ui/art/portraits.test.ts`;
  - `src/ui/art/devSections.ts` (sección VELA y sección «calco»);
  - `src/ui/session/night.ts` (solo la llamada y el comentario «with her candle»).
- **Se conservan**: la firma de `drawVelaArt(ctx, pose, t, {mini})` y las de `glow`, `twinkle`, `featherEdges` y
  `wobble` (las usan escenas y retratos). `drawCandleFlame` pasa a `drawPilotLamp`, con un alias temporal.
- **Hecho cuando**:
  - los 9 estados (§4.5) se dibujan dentro de la caja;
  - son deterministas y quietos con *Reducir movimiento*;
  - el mini se distingue a 28, 40 y 48 px;
  - hay capturas a DPR 1, 2 y 3 en oscuro y en claro (con `.art-force-dark`);
  - el *gate* de 30 fps pasa con el diálogo abierto;
  - el vestuario §4.10 está dibujado.

### 7.2 P2 · Personas (doctores y reparto)

- **Archivos**:
  - `src/ui/art/characters/doctor.ts` (sustituye el dibujante *chibi*: kit de **manos y guantes**, **batas**,
    **contraluz**);
  - `src/ui/art/characters/people.ts` (`ALBOR`, `PLAYER_LOOKS` como batas, `PLAYER_LOOK_NAMES`,
    `drawAlborPortrait`, `drawYouPortrait`, `drawCassette` realista);
  - `src/ui/art/characters/index.ts`;
  - `src/ui/art/cast.ts` (grabadora, télex y ocular con el kit de materiales);
  - `src/ui/art/characters/characters.test.ts` (los tests «faces change» y «blink» pasan a «la luz y la postura
    cambian con el humor» y «el vaho sale al hablar»);
  - `src/ui/intro/dev.ts` (galería).
- **Exporta para P3**:
  - `drawBataCard(ctx, id, w, h, t, rm, selected)` (perchero con la bata y la tarjeta);
  - `drawGlovedHand(ctx, pose, x, y, k, look)`;
  - `drawAlborPolaroid(ctx, x, y, w, t, rm, windowImg?)`;
  - `drawAlborProfile(ctx, …)`.
- **Compatibilidad**: los ids `curls`, `beanie` y `bun` y `LOOK_STORAGE_KEY` no cambian. `drawDoctorAt` y
  `drawDoctorBust` quedan como alias que dibujan la mano o la bata, hasta que P3 deje de llamarlos.

### 7.3 P3 · Escenas, portada y fotos

- **Archivos**:
  - `src/ui/intro/scenes.ts` (los 10 pintores, §6.6);
  - `src/ui/intro/intro.ts` y `intro.css` (el selector pasa a perchero con `drawBataCard`; textos de `INTRO_UI`
    que vienen de P4);
  - `src/ui/splash.ts` (§6.7);
  - `src/ui/story/cinematic.ts` (VELA no flota, la lleva Albor; el perfil de Albor al alba con
    `drawAlborProfile`);
  - usa `public/art/photos/*.webp`, `src/ui/art/photos.ts` y la precaché de `public/sw.js`, que ya deja el paso 0;
  - la pantalla de Créditos (Ajustes › Créditos en `src/ui/modals.ts` con sus textos en `src/ui/i18n.ts`, y el
    rodillo final de `src/ui/story/strings.ts`): un crédito por foto a partir de `PHOTOS`.
- **Hecho cuando**:
  - la intro se ve en 390 × 844 y 1366 × 768;
  - funciona **sin fotos** (fallo de red);
  - el *single build* incluye las fotos y sigue por debajo de 2 MB;
  - todas las fotos llevan crédito en la pantalla de Créditos.

### 7.4 P4 · Láminas, informes, HUD y textos

- **Archivos**:
  - `src/ui/moments/illustrations.ts`, `moments.css` y `momentsUI.ts` (solo el marco de la tarjeta), `icons.ts`;
  - `src/ui/moments/price.ts`, `seedprice.ts`, `status.ts`, `strings.ts`;
  - `src/ui/seed-price.ts`;
  - `src/ui/session/summary.ts`, `hud.ts`, `session.css`;
  - `src/ui/story/storyUI.ts`, `encargoUI.ts` y `story.css` (solo el aspecto de la caja y de las burbujas);
  - `src/ui/art/icons.ts` (el icono `robot`);
  - **textos**: `src/story/introScript.ts`, `script.ts`, `encargoScript.ts`, `src/secrets/data.ts` y, opcional,
    `src/store/catalog.ts` (§7.6), respetando los límites de palabras de `script.test.ts`.
- **Hecho cuando**:
  - las 24 láminas tienen número, paneles, barra de escala y leyenda;
  - `css-lint.test.ts` pasa (sistema cerrado);
  - el AA pasa en los dos temas;
  - los textos están en es y en;
  - el informe de sesión sale en móvil sin desbordar.

### 7.5 Cómo no pisarse

- **P1** es dueño de `vector/*` y de la caja de 100 de VELA.
- **P2** solo importa `vector/*`.
- **P3** solo llama a las funciones exportadas por P1 y P2.
- **P4** no toca nada de `art/characters` ni de `vela.ts`.
- `tokens.ts` es del paso 0. Si un paquete necesita un token nuevo, lo pide al integrador.
- Las capturas de antes y después siguen ARTE-PULIDO §8.

### 7.6 Líneas de guion y de interfaz que cambian

Búsqueda hecha con `grep` en `src/story/` y `src/ui/` (y en `src/secrets/`, `src/store/`, `src/game/`) de: vela,
llama, mecha, vidrio, matraz, tapón, corcho, cera, bufanda, flame, flask, candle, cork, wax y scarf.

| Archivo:línea | Hoy (es / en) | Propuesta (es / en) |
|---|---|---|
| `src/story/introScript.ts:73` | «Mi vela da calor. ¡Y la placa da luz!» / "My candle keeps us warm. And the dish gives light!" | «Mi lámpara nunca se apaga. ¡Y la placa da luz!» / "My lamp never goes out. And the dish gives light!" |
| `src/story/introScript.ts:65` | «¿Cómo eres? Elige tu bata.» / "What do you look like? Pick your look." | «¿Qué bata te pones? Elige una.» / "Which lab coat do you wear? Pick one." |
| `src/story/introScript.ts:139` (`pickLook`) | «Elige tu bata» / "Pick your look" | «Elige tu bata» / "Pick your lab coat" |
| `src/ui/art/characters/people.ts:80-84` (`PLAYER_LOOK_NAMES`) | «Rizos y gafas de lab», «Gorro y estetoscopio», «Moño y gafitas» | «Bata clásica» / "Classic lab coat"; «Parka polar» / "Polar parka"; «Cuello mao» / "Mandarin-collar coat" |
| `src/story/encargoScript.ts:240` | «¡Calorcito! Y me tejí una bufanda.» / "Warm at last! And I knitted a scarf." | «¡Calorcito! Me pongo la bufanda de Albor en el asa.» / "Warm at last! I'm wearing Albor's scarf on my handle." |
| `src/story/script.ts:104` (`e_heat`) | «… VELA estrena bufanda. No sé de dónde sacó la lana.» | «Tres criaturas encendieron la calefacción. VELA lleva la bufanda de Albor en el asa.» / "Three creatures turned the heating on. VELA wears Albor's scarf on her handle." |
| `src/story/script.ts:106` (`e_medal`) | «… VELA se la colgó y no se la quita ni para dormir.» | «El Comité mandó una medalla. VELA se la colgó del asa. Ni en standby se la quita.» / "The Committee sent a medal. VELA hung it on her handle. Not even standby takes it off." |
| `src/story/script.ts:108` (`e_seven`) | «… VELA lleva una flor en el tapón.» / "… on her cork." | «… VELA tiene una flor en un tubo, junto a la pantalla.» / "… VELA keeps a flower in a test tube by her screen." |
| `src/secrets/data.ts:491` (luna llena) | «Luna llena. Mi llama se pone nerviosa.» / "My flame gets jittery." | «Luna llena. Mi lámpara parpadea sola.» / "Full moon. My lamp keeps flickering." |
| `src/secrets/data.ts:505` (cumpleaños) | «¡Feliz cumpleaños, placa! No tengo velas. Bueno, una.» | «¡Feliz cumpleaños, placa! No hay velas. Bueno, me tienes a mí.» / "Happy birthday, dish! No candles. Well, you have me." |
| `src/story/encargoScript.ts:239` (opcional) | «… ¡Brrr!» | se puede quedar (VELA tiene temperatura de trabajo); alternativa «Mis circuitos tiritan.» / "My circuits are shivering." |
| `src/store/catalog.ts:476` (opcional) | «noche larga, vela cálida» / "warm candle" | «noche larga, lámpara cálida» / "warm lamp" |
| **Comentarios y docs** | `src/story/script.ts:13` («a little flask robot with a candle flame»), `src/story/introScript.ts:3`, `src/ui/session/night.ts:4`, `src/ui/art/vela.ts` (cabecera), `src/ui/story/cinematic.ts` («VELA floats beside her»); `docs/STORY.md` líneas 48–49, 106–107 y 146 (reparto); `docs/ARTE.md` §6.1–6.6; ADR-024 («VELA: glass flask…») | reescribir con la descripción de §4.1 (lo hace el integrador o P4) |

**Se quedan**:

- «Soy VELA. Es un acrónimo. Nadie sabe de qué.» (`script.ts:172`);
- «la ayudante del laboratorio» (`introScript.ts:72`);
- «Te dejo mi luz» (`introScript.ts`, panel `tape`: ahora la luz es la lámpara de VELA, lo que encaja aún mejor);
- «VELA las guarda en la nevera» (`treeText.ts:270-271`);
- «Llama fría» y «Una llama que no quema» (`secrets/data.ts`: son una criatura y un cosmético, no VELA);
- «Matraz dorado» (`store/catalog.ts:732`: insignia de laboratorio, no VELA);
- el id interno de panel `candle` (cambiarlo obliga a tocar `HERO_TIME` y los tests, y no aporta nada).

---

## 8. Riesgos, ADR y créditos

| Riesgo | Qué hacer |
|---|---|
| **ADR-024 dice «todo el arte, dibujado en código»** | ADR-029, «Realismo científico». (1) VELA pasa a instrumento MC-7. (2) Doctores en encuadre documental, sin caras reales. (3) Se permiten **fotografías de archivo humanas** (dominio público o CC BY, con fecha anterior a 2022 o EXIF de cámara, y nunca de personas identificables) en planos fijos, hasta 600 KB. (4) Método vectorial §3. GDD §14 lleva su «(Corrección v1.x)» si menciona el estilo. |
| **Créditos obligatorios** | CC BY 3.0 (CSIRO) exige crédito, enlace e indicar cambios. CDC y NOAA piden citar la fuente. CREDITS.md gana «Fotografías de archivo» con el autor, la fuente, la licencia y «recortada, reescalada y recomprimida» de cada una. Lo mismo en la pantalla de Créditos. Sin logos de agencias y sin sugerir que respaldan el juego (condiciones del CDC). |
| **NCI Visuals Online no era accesible** desde esta sesión (`visualsonline.cancer.gov` fuera de la red permitida) | Las dos fotos de NCI se verificaron en sus fichas de Commons, que copian los campos de NCI. El integrador debe abrir el campo «Reuse Restrictions» de los ids 2006 y 3870 desde una red que lo alcance. |
| **Un lugar real** (el observatorio de NOAA en el Polo Sur) | Es dominio público y un edificio público. No se nombra: es la ficticia Estación Vigilia. Se oscurece y se recorta. |
| **El *single build* incrusta las fotos** (base64 = +33 %) | 226 KB pasan a unos 300 KB: dentro de los 2 MB. La foto no es imprescindible: la escena tiene que funcionar sin ella. |
| **Se pierde ternura para los niños** al quitar la cara de VELA | Se compensa con la lámpara, que «respira» y se calienta; la traza, que «habla»; los blips del audio; y las etiquetas claras. Probar con niños (ARTE-PULIDO §8): ¿se entiende que VELA está contenta o preocupada sin leer? |
| **Valle inquietante** si alguien dibuja una cara completa | Prohibido en §5. Solo contraluz o de espaldas. |
| **Rendimiento** de muchas capas | Caché de lo estático (§3.9). Medir el *gate* de 30 fps con el diálogo abierto. |
| **Navegadores** | Sin `ctx.filter` (Safari). `createConicGradient` con *fallback*. Tracking manual del texto (no fiarse de `ctx.letterSpacing`). |
| **Fraunces SOFT/WONK** | Comprobar si el `.woff2` autoalojado trae esos ejes. Si no, se queda como está: no se añade otra fuente. |
| **Tests que cambian** | `characters.test.ts` («faces change», «blink») y `portraits.test.ts` (humores y vestuario): reescribirlos de cara a la conducta nueva (§7.2), no borrarlos. |

---

## 9. Inventario de assets

Las fotos que se empaquetan están en `public/art/photos/` (su `.txt` en `docs/arte-realista/fotos/`); las de solo
referencia, en `docs/arte-realista/referencias/`, cada una junto a su `.txt`. El `.txt` lleva la URL, el autor, la
licencia y su URL, la fecha, por qué no es IA y el uso previsto. El crédito de las empaquetadas está en `CREDITS.md`
(«Fotografías de archivo») y lo exporta `PHOTOS` de `src/ui/art/photos.ts` para la pantalla de Créditos.

| Archivo | Tamaño | Licencia | Fecha | ¿Se empaqueta? | Uso |
|---|---|---|---|---|---|
| `estacion-aurora-noaa.webp` | 900 × 596 · **49,9 KB** | dominio público (NOAA) | 2013 | **sí** | intro `station`, ventana del laboratorio, portada |
| `cupula-aurora-nsf.webp` | 800 × 600 · **34,4 KB** | dominio público (NSF) | 2002 | opcional | alternativa de la estación, capítulos de la Noche |
| `placa-microscopio-nci.webp` | 960 × 640 · **31,1 KB** | dominio público (NIH/NCI) | 1980 | **sí** | intro `dish`, recuerdo de Albor |
| `pipeta-guante-csiro.webp` | 640 × 960 · **19,0 KB** | **CC BY 3.0** (Morgan Brown/CSIRO) | 2010 | **sí** | intro `sow`, tu mano |
| `pipeteo-nci.webp` | 960 × 763 · **30,6 KB** | dominio público (NIH/NCI) | 2005 | opcional | tus manos (alternativa) |
| `congelador-guante-cdc.webp` | 700 × 393 · **17,6 KB** | dominio público (CDC) | 2017 | **sí** | la Nevera |
| `incubadora-hearson-eb1911.webp` | 448 × 618 · **43,6 KB** | dominio público (1911) | 1911 | **sí** | la antepasada de VELA (lámina de archivo); estilo de grabado |
| `ref-incubadora-co2-binder.jpg` | 600 × 800 · 81 KB | dominio público | 2010 | no (marca visible) | materiales del chasis |
| `ref-panel-incubadora-co2.jpg` | 720 × 540 · 30 KB | CC BY-SA 4.0 | 2022 (EXIF de cámara) | **no** (SA y marca) | lenguaje de lectura de instrumento |
| `ref-guante-nitrilo.jpg` | 400 × 600 · 27 KB | dominio público | 2004 | no | dibujo del guante (§3.7) |
| `ref-cuaderno-lbnl-1941.jpg` | 720 × 540 · 67 KB | dominio público (foto) | 2011 / 1941 | no (letra real) | el cuaderno |
| `ref-incubadora-guantes-cdc-1978.jpg` | 600 × 581 · 36 KB | dominio público (CDC) | 1978 | no (opcional, en sepia) | interior del laboratorio, guantes de cabina |

**Lo que se empaqueta**: las 7 marcadas «sí» u «opcional» suman **226 KB**, todas ≤ 50 KB. Si se quitan las dos
opcionales, quedan **161 KB**.

---

## 10. Fuentes

**Ilustración y render técnico**
- Gooch et al., NPR course: <https://users.cs.northwestern.edu/~ago820/NPRcourse1/node5.html> · tesis: <https://www2.cs.utah.edu/gdc/publications/papers/gooch98_thesis.pdf>
- Line rendering, variable line weights: <https://medium.com/technical-illustration/line-rendering-use-of-variable-line-weights-fa580665849>
- Top-left lighting: <https://en.wikipedia.org/wiki/Top-left_lighting> · Frontiers 2018: <https://www.frontiersin.org/articles/10.3389/fpsyg.2018.00454/full>
- Convenciones de ilustración técnica: <https://contentmanual.com.au/visuals-data/illustrations/conventions-for-illustrations>
- GNSI Handbook: <https://www.gnsi.org/handbook-of-science-illustration>
- Dieter Rams: <https://en.wikipedia.org/wiki/Dieter_Rams>

**Realismo 2D, shaders y navegador**
- Fresnel y luz de borde: <https://gamedev.net/shaderlab/61-fresnel-and-rim-lighting/> · <https://godotshaders.com/shader/2d-rim-light-2/>
- Mapas de normales 2D: <https://github.com/mattdesl/lwjgl-basics/wiki/ShaderLesson6>
- Kelvin a RGB: <https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html>
- Anisotropía: <https://galacean.antgroup.com/engine/en/docs/graphics/material/builtinShaders/digitalHuman/hair> · <https://help.autodesk.com/cloudhelp/2015/ENU/3DSMax/files/GUID-30F365F1-602D-4E7D-8C97-6BF67673683B.htm> · <https://cryengine.com/docs/static/engines/cryengine-3/categories/1114113/pages/1048720>
- Fósforo en WebGL: <https://dev.to/the_l_man/building-a-multi-pass-phosphor-rendering-pipeline-in-webgl-113o>
- Banding: <https://pixelmager.github.io/linelight/banding> · Sombras: <https://www.joshwcomeau.com/css/designing-shadows/>
- `feDisplacementMap`: <https://developer.mozilla.org/en-US/docs/Web/SVG/Element/feDisplacementMap> · `Path2D`: <https://developer.mozilla.org/en-US/docs/Web/API/Path2D/Path2D>
- caniuse, `ctx.filter`: <https://caniuse.com/mdn-api_canvasrenderingcontext2d_filter> · `createConicGradient`: <https://caniuse.com/mdn-api_canvasrenderingcontext2d_createconicgradient>

**Realismo vectorial**
- Tuts+: <https://design.tutsplus.com/tutorials/create-a-photo-realistic-candle-with-gradient-mesh--vector-4759> · <https://design.tutsplus.com/tutorials/how-to-create-a-photorealistic-imac-and-magic-mouse--vector-3252> · <https://design.tutsplus.com/tutorials/how-to-draw-two-vector-peaches-using-gradient-mesh-in-adobe-illustrator--cms-30884> · <https://design.tutsplus.com/tutorials/professional-workflow-for-creating-photorealistic-portraits-in-illustrator--vector-3240>
- Pixflow, malla de degradado: <https://pixflow.net/blog/an-introduction-to-the-gradient-mesh-tool-in-adobe-illustrator/>
- Sombreado difuso: <https://origin-www.lynda.com/Illustrator-tutorials/Creating-diffused-shading/475456/2884076-4.html> · transparencias: <https://www.creativebloq.com/computer-arts/transparency-tricks-1069812>
- Adobe Community: <https://community.adobe.com/t5/illustrator-discussions/blend-blurred-shapes/m-p/12996109> · Adobe, blends: <https://helpx.adobe.com/ee/illustrator/desktop/manage-colors/apply-transparency-and-blending/blended-objects-overview.html>
- Mallas en SVG: <https://dvisvgm.de/Gradients/> · <https://www.w3.org/Graphics/SVG/WG/wiki/Proposals/Advanced_Gradients>

**Instrumentos**
- Incucyte: <https://www.sartorius.hr/media/t4ndhora/live-cell-analysis-inside-incubator-incucyte-brochure-en-sartorius.pdf> · <https://www.dbmr.unibe.ch/services/core_facilities/live_cell_imaging_lci/services/incucyte_s3/index_eng.html>
- Eppendorf CellXpert: <https://good-design.org/projects/cellxpert-c170i/> · <https://www.eppendorf.com/AU-en/cellxpert-c170i/>
- Thermo Heracell VIOS: <https://thermofisher.com/order/catalog/product/51033558> · <https://www.thermofisher.com/us/en/home/life-science/lab-equipment/co2-incubators/features>
- Zeiss ZEN: <https://knowledge.zeiss.com/rms/en/zen/getting-started-first-steps/user-interface> · Leica LAS X: <https://www.manualslib.com/manual/1554103/Leica-Dvm6.html?page=51>
- VFD ZnO:Zn: <https://patents.google.com/patent/US5128063> · VU: <https://en.wikipedia.org/wiki/VU_meter> · LED que respira: <https://patents.google.com/patent/US6658577>

**Figuras científicas**
- Nature: <http://research-figure-guide.nature.com/figures/preparing-figures-our-specifications/>
- Cambridge: <https://www.cambridge.org/core/services/aop-file-manager/file/68f2427ac02cb20c83ea752f> · Freshwater Science: <https://www.journals.uchicago.edu/journals/fws/prep-figures>
- Haeckel, Tafel 28: <https://sourcelibrary.org/artwork/kunstformen-der-natur-tafel-28-bhl47388103>

**Derechos**
- CC BY 4.0: <https://creativecommons.org/licenses/by/4.0/legalcode> · CC0: <https://creativecommons.org/publicdomain/zero/1.0/legalcode>
- Unsplash, autorizaciones: <https://help.unsplash.com/en/articles/2612329-releases-and-trademarks>
- Ahn v. Midway: <https://cyber.harvard.edu/metaschool/fisher/joint/links/cases/ahn.html> · BTLJ: <https://btlj.org/2014/12/the-right-of-publicity-likeness-lawsuits-against-video-game-companies/>
- Condiciones de uso del CDC: <https://www.cdc.gov/other/agencymaterials.html>
