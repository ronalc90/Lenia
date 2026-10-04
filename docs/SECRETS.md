# Secretos y huevos de pascua de Bioluma

> **⚠ SPOILERS.** Documento interno del equipo: qué secretos hay, cómo se disparan, qué dan, cómo se
> insinúan (escalera de pistas) y cómo se integran. No enlazar desde la tienda ni desde el juego.

El dueño pidió *«coloca easter eggs y cosas para descubrir»*. Esta capa premia la curiosidad con
27 secretos repartidos en siete familias, en el tono del juego (GDD §3: curiosidad serena,
ligeramente melancólica, humor seco y escaso, respeto por las criaturas).

## Reglas

1. **Nunca pay-to-win ni puerta de progreso.** Cada secreto da **+1 % de Esencia** (`M_global`),
   con **tope de +10 %** en total (`BONUS_CAP`): al décimo secreto el bonus ya está al máximo; el resto
   son pura curiosidad. Además hay **paletas cosméticas** para la placa (gratis) y un logro oculto.
   Ningún secreto se compra ni bloquea nada.
2. **La vida es real (pilar 1).** Los efectos (aurora, constelaciones, motas, trazos…) son una capa 2D
   *encima* de la placa; **nunca tocan la simulación**. Las especies ocultas son especies reales del
   catálogo de Chan que viven de verdad en su ventana (medido con la referencia CPU, ver abajo).
3. **Todo es offline y determinista donde importa.** Fecha, luna y hora se calculan en el
   dispositivo (fórmula de Meeus para la luna). Sin red.
4. **Nada se dispara por accidente en la primera sesión**, salvo los dos secretos marcados
   *fácil* (`answer`, `logo`), que sirven de «ah, aquí hay secretos». Un test simula diez minutos
   típicos de juego y lo comprueba (`src/secrets/earlyplay.test.ts`).
5. **Todo secreto es alcanzable en móvil y en escritorio** (ver «Cobertura por plataforma»).
6. **Accesibilidad.** Todo efecto tiene variante para *Reducir movimiento*; la tarjeta de revelación
   se cierra con un toque y es `role="status"`.

## Mapa rápido

| # | Familia | Secretos |
|---|---|---|
| 3 | Especies ocultas | `ignis` Llama fría · `phantasma` Fantasma · `cryptid` Criptozoología |
| 5 | Homenajes | `chan` Gratitud (Bert Chan / Lenia) · `conway` Planeador (Juego de la Vida) · `answer` La respuesta (42) · `maximizer` Maximizadora (Universal Paperclips) · `goldenStreak` Racha dorada (Cookie Clicker) |
| 4 | Trazos en la placa | `spiral` Espiral · `heart` Corazón · `halo` Cerco · `infinity` Lemniscata |
| 4 | Toques | `konami` El código · `logo` Toc, toc · `patience` Contar despacio · `shake` Agitar antes de usar |
| 6 | Paciencia | `oldFriend` Viejo amigo · `seven` Siete de siete · `silence` Silencio · `sterile` Esterilizar lo estéril · `palindrome` Capicúa · `afk` ¿Sigues ahí? |
| 4 | Cielo | `fullMoon` Luna llena · `birthday` Cumpleaños · `aurora` Aurora · `orion` Cinturón |
| 1 | Sótano | `basement` El sótano (se abre con 10 secretos) |

Los homenajes son guiños, nunca texto ajeno: el planeador es una figura matemática, «42» un número,
y las líneas de Bitácora que aluden a *Cookie Clicker* y *Universal Paperclips* son originales
(«galletas doradas», «un juego… con clips, y no acaba bien»), sin nombres comerciales ni citas.

## Los secretos, uno a uno

Cada secreto lista: disparador exacto, recompensa, línea de la tarjeta de revelación, entrada de
Bitácora, reacción de VELA para el sistema de historia y la **escalera de pistas** (1 críptica →
2 más clara → 3 explícita). En el sótano, cada secreto bloqueado muestra su pista actual y un botón
«Otra pista» que sube un peldaño, gratis.

### Especies ocultas

#### Llama fría `ignis`

- **Disparador:** Registrar *Orbium unicaudatus ignis* (aparece en la ventana μ 0.107–0.118, σ 0.0112–0.0128).
- **Recompensa:** +1 % · paleta «Brasa» · logro oculto `SECRET_IGNIS`
- **Revelación:** «Arde sin calor, donde μ apenas alcanza.»
- **Bitácora:** «Bajé μ hasta donde casi nada vive, y algo se encendió. Orbium ignis: el mismo Orbium, con fiebre.»
- **VELA:** «¡Está caliente! No, espera. Está fría. Anotado.»
- **Pistas:** 1) Algunas llamas solo prenden con poco combustible. → 2) Baja μ más de lo que parece sensato; σ también, un poco. → 3) Calibra μ ≈ 0.11 y σ ≈ 0.012 (Calibrador II) y siembra.

#### Fantasma `phantasma`

- **Disparador:** Registrar *Orbium phantasma* (ventana μ 0.127–0.136, σ 0.0087–0.0100, **dt ≤ 0.055**).
- **Recompensa:** +1 % · paleta «Espectro» · logro oculto `SECRET_PHANTASMA`
- **Revelación:** «Solo existe cuando el tiempo va despacio.»
- **Bitácora:** «Bajé dt al mínimo y apareció algo casi transparente. Si acelero, se deshace. Le gusta que lo miren despacio.»
- **VELA:** «¿Lo ves? Yo casi no. Hablemos bajito.»
- **Pistas:** 1) Hay quien solo se deja ver si no tienes prisa. → 2) Con dt al mínimo, busca cerca de Orbium con σ muy fina. → 3) μ ≈ 0.13, σ ≈ 0.009 y dt ≤ 0.05 (Calibrador III).

#### Criptozoología `cryptid`

- **Disparador:** Registrar *Pyroscutium ambiguus* (ventana μ 0.344–0.355, σ 0.058–0.063, solo de 00:00 a 04:00 hora local o con luna llena; 50 % de las esporas).
- **Recompensa:** +1 % · paleta «Selene» · logro oculto `SECRET_CRYPTID`
- **Revelación:** «Nadie la ha visto a pleno día.»
- **Bitácora:** «En el régimen del Helicium, a deshoras, apareció otra cosa. Ambigua. A la luz del día no está. No pienso contárselo a nadie.»
- **VELA:** «De día no estaba en el catálogo. Anotado… en secreto.»
- **Pistas:** 1) Algunas especies tienen horario. → 2) Vuelve al régimen del Helicium pasada la medianoche, o con luna llena. → 3) μ ≈ 0.349, σ ≈ 0.0605, entre las 00:00 y las 04:00 (hora local) o con luna llena.


### Homenajes

#### Gratitud `chan`

- **Disparador:** Renombrar una especie como «Chan», «Bert», «Bert Chan» o «Lenia» (sin importar mayúsculas, tildes ni comillas; también como palabra suelta: «Orbium lenia»).
- **Recompensa:** +1 % · logro oculto `SECRET_CHAN`
- **Revelación:** «Toda placa tuvo una primera mano.»
- **Bitácora:** «Le puse su nombre. Sin Bert Chan no habría regla, ni catálogo, ni este cuaderno. Gracias.»
- **VELA:** «Gracias, Bert Chan. De parte de todas las criaturas.»
- **Pistas:** 1) Los nombres también son una forma de dar las gracias. → 2) Ponle a una especie el nombre de quien inventó Lenia. → 3) Renombra una especie como «Chan» o «Lenia».

#### Planeador `conway`

- **Disparador:** Trazar un **planeador** de un solo trazo con pincel o goma (↘ ↓ ← ←, cualquier orientación o espejo), o renombrar una especie «Conway», «Life», «Vida», «Juego de la vida», «B3/S23».
- **Recompensa:** +1 % · logro oculto `SECRET_CONWAY`
- **Revelación:** «Cinco celdas, 1970, y sigue volando.»
- **Bitácora:** «Dibujé un planeador de memoria, como quien saluda a un abuelo. Aquí todo es continuo, pero aquel sigue planeando en diagonal.»
- **VELA:** «Cinco celdas. Un clásico. Mi abuela era una calculadora.»
- **Pistas:** 1) Antes de esta vida hubo un Juego de la Vida. → 2) Dibuja en la placa la nave más famosa de Conway, de un trazo. → 3) Con pincel o goma, un trazo por las 5 celdas del planeador: ↘ ↓ ← ← (o bautiza una especie «Conway»).

#### La respuesta `answer` (fácil)

- **Disparador:** La siembra **manual** número 42 (contada por el módulo; el Sembrador automático no cuenta).
- **Recompensa:** +1 % · logro oculto `SECRET_ANSWER`
- **Revelación:** «Ahora solo falta la pregunta.»
- **Bitácora:** «Cuarenta y dos siembras. Si esto era la respuesta, la pregunta debe de estar en otra placa.»
- **VELA:** «Cuarenta y dos. Sigo buscando la pregunta.»
- **Pistas:** 1) Cuenta tus gotas. → 2) Un número famoso por responderlo todo. → 3) Siembra a mano 42 veces.

#### Maximizadora `maximizer`

- **Disparador:** 10 explosiones (`creatureExploded`) en menos de 120 s.
- **Recompensa:** +1 % · logro oculto `SECRET_MAXIMIZER`
- **Revelación:** «Más no siempre es más.»
- **Bitácora:** «Diez explosiones en dos minutos. A este ritmo convertiré toda la materia en sopa. Ya hay un juego sobre eso, con clips, y no acaba bien.»
- **VELA:** «¡Diez explosiones! Las conté todas. Por favor, para.»
- **Pistas:** 1) Hay una forma de fracasar con mucho entusiasmo. → 2) Provoca muchas explosiones seguidas. → 3) 10 explosiones en menos de 2 minutos.

#### Racha dorada `goldenStreak`

- **Disparador:** 7 Destellos atrapados seguidos sin perder ninguno (`goldenMissed` reinicia; la racha se guarda).
- **Recompensa:** +1 % · logro oculto `SECRET_GOLDEN_STREAK`
- **Revelación:** «En algún otro laboratorio, alguien hornea.»
- **Bitácora:** «Siete destellos seguidos, ni uno perdido. Hay quien pasó años atrapando galletas doradas; ahora lo entiendo.»
- **VELA:** «Siete de siete. Brillas casi tanto como ellas.»
- **Pistas:** 1) La constancia también brilla. → 2) Atrapa muchos Destellos seguidos sin dejar escapar ninguno. → 3) 7 Destellos seguidos sin perder ninguno.


### Trazos

#### Espiral `spiral`

- **Disparador:** Trazar una espiral (≥ 1.1 vueltas en un sentido, abierta, radio creciente).
- **Recompensa:** +1 % · logro oculto `SECRET_SPIRAL`
- **Revelación:** «Hacia dentro o hacia fuera: la placa no distingue.»
- **Bitácora:** «Dibujé una espiral en la placa. Las criaturas no la siguieron; las giratorias ya sabían hacerlo.»
- **VELA:** «Me mareo solo de mirarla. Anotado.»
- **Pistas:** 1) Las giratorias dibujan algo sin saberlo. → 2) Con el pincel o la goma, traza una curva que se enrosque sobre sí misma. → 3) Dibuja una espiral de un solo trazo (vuelta y media o más).

#### Corazón `heart`

- **Disparador:** Trazar un corazón derecho (± 35°) de un trazo.
- **Recompensa:** +1 % · logro oculto `SECRET_HEART`
- **Revelación:** «No es ciencia. No importa.»
- **Bitácora:** «Dibujé un corazón en la placa. No es un método válido. Lo anoto igual.»
- **VELA:** «Eso no es ciencia. Me gusta igual.»
- **Pistas:** 1) Hay formas que no son científicas. → 2) Dibuja en la placa lo que dibujarías en un cristal empañado. → 3) Traza un corazón de un solo trazo, derecho.

#### Cerco `halo`

- **Disparador:** Trazar un círculo cerrado que **encierre** a una criatura viva (un círculo vacío solo deja un eco: pista).
- **Recompensa:** +1 % · logro oculto `SECRET_HALO`
- **Revelación:** «Por si acaso.»
- **Bitácora:** «Le dibujé un círculo alrededor a una criatura. No la protege de nada. Por si acaso.»
- **VELA:** «Un círculo alrededor. Por si acaso. Bien pensado.»
- **Pistas:** 1) Algunas criaturas merecen un marco. → 2) Rodea a una criatura viva con un trazo. → 3) Dibuja un círculo cerrado alrededor de una criatura viva.

#### Lemniscata `infinity`

- **Disparador:** Trazar ∞ (o un 8, cualquier orientación).
- **Recompensa:** +1 % · logro oculto `SECRET_INFINITY`
- **Revelación:** «La placa ya era infinita: solo da la vuelta.»
- **Bitácora:** «Dibujé un infinito. Luego recordé que la placa es un toro: lo que sale por un lado entra por el otro. Infinito ya era.»
- **VELA:** «Infinito. Y la placa da la vuelta. Cuadra.»
- **Pistas:** 1) Lo que sale por un borde vuelve por el otro. ¿Cómo se dibuja eso? → 2) Un ocho tumbado, de un trazo. → 3) Dibuja ∞ con el pincel o la goma.


### Toques

#### El código `konami`

- **Disparador:** Teclado: ↑ ↑ ↓ ↓ ← → ← → B A. Táctil: 8 trazos rectos en la placa con esas direcciones, en menos de 20 s.
- **Recompensa:** +1 % · paleta «Fósforo» · logro oculto `SECRET_KONAMI`
- **Revelación:** «↑↑↓↓←→←→. Las criaturas no ganan vidas. Tú, nostalgia.»
- **Bitácora:** «Arriba, arriba, abajo, abajo… Las criaturas no ganaron vidas extra. Yo, un poco de nostalgia.»
- **VELA:** «¿Vidas extra? No tenemos. Anotado igualmente.»
- **Pistas:** 1) Hay códigos más viejos que este laboratorio. → 2) Una secuencia famosa de flechas (y dos letras, si tienes teclado). → 3) Teclado: ↑ ↑ ↓ ↓ ← → ← → B A. Táctil: ocho trazos rectos en la placa con esas direcciones.

#### Toc, toc `logo` (fácil)

- **Disparador:** 7 toques al logotipo/wordmark, cada uno a menos de 800 ms del anterior.
- **Recompensa:** +1 % · logro oculto `SECRET_LOGO`
- **Revelación:** «Alguien al otro lado del cristal.»
- **Bitácora:** «Toqué el cristal siete veces, como en un acuario. Nadie contestó. Bueno: casi nadie.»
- **VELA:** «¡Toc, toc! ¿Quién es? …Nadie. ¿O sí?»
- **Pistas:** 1) No golpees el cristal. O sí. → 2) Toca el logotipo varias veces seguidas. → 3) Toca el logo de Bioluma 7 veces seguidas.

#### Contar despacio `patience`

- **Disparador:** Mantener pulsado el contador de Esencia 5 s (aparece un anillo tenue a los 1.2 s).
- **Recompensa:** +1 % · logro oculto `SECRET_PATIENCE`
- **Revelación:** «Un número, mirado lo bastante, deja de serlo.»
- **Bitácora:** «Mantuve el dedo sobre la Esencia hasta que dejó de parecer un número. Luego volvió a serlo.»
- **VELA:** «Ese número es exacto. Lo comprobé tres veces.»
- **Pistas:** 1) Algunos números quieren que los mires más tiempo. → 2) Mantén pulsado el contador de Esencia. → 3) Mantén pulsado el contador de Esencia 5 segundos.

#### Agitar antes de usar `shake`

- **Disparador:** Agitar el móvil (DeviceMotion; en iOS hay que permitir el sensor desde el sótano). Escritorio: sacudir el ratón de lado a lado sobre la placa (7 cambios de sentido en 1.5 s) o sacudir la ventana.
- **Recompensa:** +1 % · logro oculto `SECRET_SHAKE`
- **Revelación:** «Viven en su regla, no en tu mano.»
- **Bitácora:** «Agité la placa. Ni se enteraron: viven en su regla, no en mi mano. Eso me tranquiliza.»
- **VELA:** «¡Eh! Ellas ni se enteraron. Yo sí.»
- **Pistas:** 1) ¿Y si la placa se mueve? → 2) Agita el dispositivo. En escritorio, agita otra cosa. → 3) Agita el móvil. En escritorio: sacude el ratón de lado a lado sobre la placa, o la ventana.


### Paciencia

#### Viejo amigo `oldFriend`

- **Disparador:** La misma criatura (mismo id) viva 30 min de juego **activo** (las pausas de pestaña oculta cuentan como máximo 5 s).
- **Recompensa:** +1 % · logro oculto `SECRET_OLD_FRIEND`
- **Revelación:** «Ya no es un espécimen.»
- **Bitácora:** «Lleva media hora conmigo. Ya no le digo «espécimen»; le digo «tú».»
- **VELA:** «Media hora juntos. Ya le tengo cariño.»
- **Pistas:** 1) Algunas compañías se ganan con tiempo. → 2) Mantén viva a una misma criatura mucho rato. → 3) Una misma criatura viva durante 30 minutos de juego.

#### Siete de siete `seven`

- **Disparador:** Exactamente 7 criaturas vivas, las 7 estables y de 7 especies distintas, a la vez.
- **Recompensa:** +1 % · logro oculto `SECRET_SEVEN`
- **Revelación:** «Ninguna repetida. Parece una fábula.»
- **Bitácora:** «Siete criaturas, siete especies, ninguna repetida. Parece el principio de una fábula; no sé cuál es la moraleja.»
- **VELA:** «Siete especies, ninguna repetida. ¡Las conté dos veces!»
- **Pistas:** 1) La variedad también es un número. → 2) Pocas criaturas, pero todas distintas. → 3) Exactamente 7 criaturas estables, de 7 especies distintas, a la vez.

#### Silencio `silence`

- **Disparador:** Placa sin criaturas durante 5 min de juego activo, después de haber tenido al menos una criatura estable alguna vez.
- **Recompensa:** +1 % · logro oculto `SECRET_SILENCE`
- **Revelación:** «El silencio también es un resultado.»
- **Bitácora:** «Cinco minutos sin nada vivo. Anoto la nada con la misma letra que todo lo demás.»
- **VELA:** «Silencio. Lo anoto en voz baja.»
- **Pistas:** 1) A veces lo que hay que observar es la ausencia. → 2) Después de haber tenido vida, deja la placa vacía un buen rato. → 3) Placa sin criaturas durante 5 minutos (después de haber tenido alguna).

#### Esterilizar lo estéril `sterile`

- **Disparador:** `extinctionStart` con 0 criaturas vivas.
- **Recompensa:** +1 % · logro oculto `SECRET_STERILE`
- **Revelación:** «Por protocolo.»
- **Bitácora:** «Esterilicé una placa que ya estaba vacía. Por protocolo. El protocolo no tiene sentido del humor; yo, un poco.»
- **VELA:** «Esterilizar el vacío. Protocolo cumplido, supongo.»
- **Pistas:** 1) Hay rituales que no necesitan testigos. → 2) Provoca una Extinción sin que quede nada vivo. → 3) Extingue con 0 criaturas en la placa.

#### Capicúa `palindrome`

- **Disparador:** La Esencia (parte entera) es capicúa de 6 cifras o más, o exactamente 1 234 567, en un sondeo (1 vez/s).
- **Recompensa:** +1 % · logro oculto `SECRET_PALINDROME`
- **Revelación:** «Se lee igual al revés. No significa nada.»
- **Bitácora:** «Se lee igual al derecho y al revés. No significa nada. Lo anoto igual: así empiezan las obsesiones.»
- **VELA:** «¡Se lee igual al revés! Lo leí al revés.»
- **Pistas:** 1) Mira bien el contador; a veces dice algo. → 2) Algunos números se leen igual al derecho y al revés. → 3) Ten una Esencia capicúa de 6 cifras o más (o exactamente 1 234 567).

#### ¿Sigues ahí? `afk`

- **Disparador:** Juego en pausa 10 min de reloj (se comprueba en cada sondeo y al reanudar).
- **Recompensa:** +1 % · logro oculto `SECRET_AFK`
- **Revelación:** «Ellas no saben esperar. Tú sí.»
- **Bitácora:** «Diez minutos en pausa. Ellas no saben esperar, solo seguir. Yo sí sé esperar; no sé si es mejor.»
- **VELA:** «¿Sigues ahí? Te guardé el sitio.»
- **Pistas:** 1) Detener el tiempo también cuenta. → 2) Pausa la placa y no vuelvas en un buen rato. → 3) Deja el juego en pausa 10 minutos.


### Cielo

#### Luna llena `fullMoon`

- **Disparador:** Abrir el juego con la luna iluminada ≥ 98 % (≈ ±1.3 días de la llena; fórmula de Meeus, sin red).
- **Recompensa:** +1 % · logro oculto `SECRET_FULL_MOON`
- **Revelación:** «Esta noche la placa refleja algo más.»
- **Bitácora:** «Hay luna llena. No afecta a la regla, lo sé. Aun así, esta noche las miro distinto.»
- **VELA:** «Luna llena. Mi llama se pone nerviosa.»
- **Pistas:** 1) El cielo también tiene fases. → 2) Juega cuando la luna esté llena. → 3) Abre el juego en luna llena (± 1 día).

#### Cumpleaños `birthday`

- **Disparador:** Jugar el 4 de octubre (primer commit de Bioluma, 2026) o el 13 de diciembre (artículo de Lenia en arXiv, 2018), hora local.
- **Recompensa:** +1 % · logro oculto `SECRET_BIRTHDAY`
- **Revelación:** «Una vela por cada Era.»
- **Bitácora:** «Hoy la placa cumple años. Le canto bajito, para no despertar a nadie.»
- **VELA:** «¡Feliz cumpleaños, placa! No tengo velas. Bueno, una.»
- **Pistas:** 1) Todo laboratorio tiene una fecha que celebrar. → 2) Hay dos fechas en el año: la de esta placa y la de su regla. → 3) Juega el 4 de octubre (Bioluma) o el 13 de diciembre (Lenia, 2018).

#### Aurora `aurora`

- **Disparador:** Evento aleatorio: con ≥ 20 min de juego total y ≥ 3 criaturas estables, probabilidad dt/2700 por segundo (media ≈ 45 min). Después sigue apareciendo como adorno (media ≈ 90 min).
- **Recompensa:** +1 % · paleta «Aurora» · logro oculto `SECRET_AURORA`
- **Revelación:** «Nadie la provocó. Por eso cuenta.»
- **Bitácora:** «Una luz cruzó la placa sin tocar a nadie. No la provoqué. La anoto con cuidado, por si no vuelve.»
- **VELA:** «¡Mira arriba! Bueno, arriba de la placa.»
- **Pistas:** 1) Algunas cosas solo pasan si esperas con la placa llena de vida. → 2) Mantén una placa viva mucho tiempo; el cielo hace el resto. → 3) Evento raro al azar: tras 20 min de juego, con 3 o más criaturas estables (≈ 45 min de media).

#### Cinturón `orion`

- **Disparador:** 3 criaturas estables alineadas (desvío ≤ 3.5 % del tramo + 1 celda) y equiespaciadas (razón ≤ 1.15, separación 12–70 celdas, distancias toroidales) durante 2 sondeos seguidos; requiere ≥ 10 min de juego. Luego se redibuja como adorno cada ≥ 15 min.
- **Recompensa:** +1 % · logro oculto `SECRET_ORION`
- **Revelación:** «Tres en fila, como en el cielo de invierno.»
- **Bitácora:** «Tres criaturas en fila, a la misma distancia. Les dibujé el cinturón de Orión encima. No se dieron cuenta; yo no he pensado en otra cosa.»
- **VELA:** «Tres en fila. Como el cielo de ahí fuera.»
- **Pistas:** 1) Mira la placa como mirarías el cielo. → 2) Tres criaturas alineadas, como un cinturón famoso. → 3) 3 criaturas estables en línea recta y a igual distancia, durante unos segundos.


### Sótano

#### El sótano `basement`

- **Disparador:** Abrir «Laboratorio del sótano» en Ajustes (aparece con ≥ 10 secretos).
- **Recompensa:** +1 % · logro oculto `SECRET_BASEMENT`
- **Revelación:** «Debajo de todo laboratorio hay otro.»
- **Bitácora:** «Encontré una puerta bajo el laboratorio. Dentro, notas con mi letra que no recuerdo haber escrito.»
- **VELA:** «No sabía que teníamos sótano. Ni quiero saberlo.»
- **Pistas:** 1) Encuentra diez cosas que nadie te pidió encontrar. → 2) Con diez secretos, algo cambia en Ajustes. → 3) Encuentra 10 secretos y abre «Laboratorio del sótano» en Ajustes.


## Especies ocultas: datos medidos

Las tres son especies del catálogo curado (`src/sim/catalog.json`). Se midió supervivencia con la
referencia CPU (`src/sim/cpu.ts`, 64×64, patrón del catálogo, relación de masa tras 1 200 pasos;
viva = 0.8–1.25):

| Especie | Código | Vive en | Muere / explota en | Ventana del secreto | Condición extra |
|---|---|---|---|---|---|
| *Orbium unicaudatus ignis* | `O2ui` | μ 0.112–0.120, σ 0.0112–0.0128 | μ 0.104 (muere), μ ≤ 0.106 con σ 0.0128 (explota) | μ 0.107–0.118, σ 0.0112–0.0128 | — |
| *Orbium phantasma* | `O2p` (T = 40) | dt 0.025 y **0.05**; μ 0.128–0.135, σ 0.0088–0.0098 | **dt ≥ 0.06** (se disuelve); σ 0.008 | μ 0.127–0.136, σ 0.0087–0.0100, dt 0.01–0.055 | — (dt mínimo del slider = 0.05) |
| *Pyroscutium ambiguus* | `PS3am` | μ 0.344–0.354, σ 0.058–0.063 | μ 0.34 / σ 0.06 (explota) | μ 0.344–0.355, σ 0.058–0.063 | 00:00–04:00 local **o** luna llena; 50 % de las esporas |

Dato curioso que da sentido al críptido: en esa misma esquina de parámetros, las esporas de
*Helicium solidus* (H3s) **explotan** (masa ×4.2) y las de *Pyroscutium ambiguus* viven. De día el
juego ofrece Helicium; de noche, a veces, «otra cosa». Los tests `regimes.test.ts` vuelven a medirlo.

## Cobertura por plataforma

| Secreto | Móvil | Escritorio |
|---|---|---|
| `konami` | 8 trazos rectos ↑↑↓↓←→←→ con pincel o goma | teclado ↑↑↓↓←→←→BA |
| `shake` | agitar el teléfono (iOS: permitir el sensor con el botón del sótano) | sacudir el ratón sobre la placa, o sacudir la ventana |
| `patience` | dedo sobre el contador 5 s | mantener el clic 5 s |
| trazos (`spiral`, `heart`, `halo`, `infinity`, `conway`) | arrastrar con pincel o goma | ídem con ratón |
| `fullMoon`, `birthday`, `cryptid` | calendario real / hora local | ídem |

Los trazos necesitan arrastrar sobre la placa: el pincel llega con Gotero III y la goma con su
herramienta; son secretos de media partida a propósito.

## Arquitectura

```
src/secrets/            lógica pura (sin DOM), con tests
  types.ts              SecretId, SecretView, SecretEffect, SecretEvents, SecretsSave…
  data.ts               SECRET_DEFS (textos es/en, pistas), constantes de ajuste, paletas, colormapLUT()
  secrets.ts            createSecrets(): observador del bus + sondeo de la vista + ganchos de entrada
  gestures.ts           reconocedor de trazos (círculo, espiral, corazón, planeador, ∞) + swipes
  moon.ts               fase lunar (Meeus)
  shake.ts              detectores de agitado (DeviceMotion) y de vaivén (ratón / ventana)
  regimes.ts            ventanas de las especies ocultas + ayudas para la siembra
  achievements.ts       logros ocultos SECRET_* para Steam
  index.ts              superficie pública
src/ui/secrets/         presentación
  secrets-ui.ts         createSecretsUI(): capa de efectos + tarjetas de revelación + logo que despierta
  effects.ts            EffectsLayer (canvas 2D; rAF solo mientras hay efectos)
  reveal.ts             tarjeta «Secreto descubierto» (cola, retrato de especie con su paleta)
  basement.ts           página «Laboratorio del sótano»
  inputs.ts             attachSecretInputs() y createStrokeRecorder()
  glyphs.ts, styles.ts  glifos SVG propios y CSS inyectado (prefijo .bls-)
  dev.ts                banco de pruebas (secrets-dev.html)
```

## API

```ts
const secrets = createSecrets({ bus, getView, storage?, now?, rng?, autoPoll?, grid? });
secrets.on('found' | 'effect' | 'unlockCosmetic' | 'grantJournal' | 'allFound' | 'progress' | 'colormap', fn);
// ganchos que llama la UI
secrets.onKey(key) · onLogoTap() · onEssenceLongPress(ms) · onBrushPath(points /* celdas de grilla */)
secrets.onSpeciesRenamed(name) · onDeviceShake() · setPaused(paused) · onBasementOpened()
// consultas
secrets.list(): SecretView[] · get(id) · isFound(id) · foundCount() · total
secrets.bonusMultiplier()   // 1 + min(0.10, 0.01 × encontrados) → multiplicar en M_global
secrets.cosmetics() · colormap() · setColormap(id|null) · revealHint(id) · rumor() · basementUnlocked()
// guardado
secrets.serialize(): SecretsSave · load(data) /* fusiona: unión, gana el descubrimiento más antiguo */
```

Persistencia propia en `localStorage['bioluma.secrets']` (con try/catch; funciona en modo privado),
y además `serialize()/load()` para meterlo en la partida principal y en la exportación.

Eventos del emisor:

| Evento | Carga | Para quién |
|---|---|---|
| `found` | `{ secret, def, index, total, cue: 'secret.<id>', companion }` | UI (tarjeta), audio, historia, Steam, analítica |
| `effect` | `SecretEffect` (aurora, constellation, motes, trace, halo, glider, moon, pulse, whisper, ripple, logoWake) | `createSecretsUI` lo dibuja solo |
| `grantJournal` | `{ id: 'secret.<id>', text }` | juego (Bitácora) |
| `unlockCosmetic` | `{ id, colormap }` | aviso opcional |
| `colormap` | `{ id, colormap }` (null = original) | renderer WebGL (LUT) |
| `progress` | `{ found, total, basementUnlocked, bonus }` | Ajustes (fila del sótano), HUD |
| `allFound` | `{ total }` | historia (gancho del final secreto), Steam `SECRET_ALL_FOUND` |

## Integración (paso a paso)

1. **main.ts**
   ```ts
   import { createSecrets, colormapLUT } from './secrets';
   import { createSecretsUI, attachSecretInputs, createStrokeRecorder } from './ui/secrets';
   const secrets = createSecrets({ bus, getView: () => game.view(), grid: { w: sim.gridW, h: sim.gridH } });
   const inputs = attachSecretInputs(secrets, { logos: [splashWordmark, aboutLogo], essence: hudEssenceEl, dish: dishEl });
   const sui = createSecretsUI(dishEl, secrets, {
     camera, lang: () => settings.lang, reduceMotion: () => settings.reduceMotion,
     requestMotion: inputs.requestMotionPermission, onSound: (k) => audio.secret?.(k),
   });
   const strokes = createStrokeRecorder(secrets, { endOn: dishEl });
   ```
   `dishEl` es el elemento que cubre el canvas de la placa (la misma caja que usa la `Camera`).
2. **UI**
   - En `onBrush(x, y)` y `onErase(x, y)` (coordenadas de grilla): `strokes.point(x, y)`.
   - Tras `actions.renameSpecies(id, name)`: `secrets.onSpeciesRenamed(name)`.
   - En `onPauseToggle`: `secrets.setPaused(paused)`.
   - Ajustes: si `secrets.basementUnlocked()`, mostrar la fila «Laboratorio del sótano»; al abrirla,
     montar `sui.createBasement().el` y llamar `secrets.onBasementOpened()`. (Escuchar `progress` para
     que la fila aparezca en caliente.)
   - Los elementos pasados en `logos` reciben `data-secret-logo`; el efecto `logoWake` les pone la
     clase `.bls-logo-awake` (brillo y bamboleo de 4 s).
3. **Juego (`src/game`)**
   - **Bonus:** multiplicar `M_global` por `secrets.bonusMultiplier()` (p. ej. una dependencia opcional
     `extraMultiplier?: () => number` en `createGame`). Tope garantizado +10 %.
   - **Bitácora:** `secrets.on('grantJournal', ({ id, text }) => game.addJournalEntry?.(id, text))`
     (acción nueva opcional; ids `secret.<id>`, idempotente).
   - **Siembra de especies ocultas** (donde hoy se llama a `nearestCatalog`):
     ```ts
     const forced = pickSecretSpore(calib, new Date(), rng);
     const entry = forced ? catalogByCode(forced)! : nearestCatalog(calib, secretSporePool(CATALOG, calib, new Date()));
     ```
     y usar `SECRET_REGIMES[i].bias` como `SeedSpec.bias` para esas esporas. **Microscopio III**: no
     marcar especies con `isSecretSpeciesCode(code)`.
   - **Guardado:** `save.secrets = secrets.serialize()`; al cargar/importar `secrets.load(save.secrets)`.
4. **Renderer:** `secrets.on('colormap', ({ colormap }) => sim.setColormapLUT?.(colormap ? colormapLUT(colormap.stops) : matterLUT()))`
   (método opcional nuevo en la simulación WebGL; las paletas usan el formato de `MATTER_STOPS`).
5. **Historia (`src/story`)**
   - `found` trae `cue` (`secret.<id>`) y `companion` (frase de VELA, ≤ 12 palabras) para el globo.
   - `allFound` → bandera `secretsAllFound` (posible condición extra o variante del final «Primera luz»).
   - `secrets.rumor()` devuelve la pista críptica de un secreto aún oculto, para que Albor o VELA la
     deje caer de vez en cuando (p. ej. una vez por Era).
   - La historia puede reutilizar efectos con `sui.play({ kind: 'constellation', … })`.
6. **Audio:** `onSound(kind)` llega cuando aparece la tarjeta:
   - `secret`: campana FM (ratio 1:3.5, GDD §15) con 5 notas de la pentatónica del drone (Re: D–E–F♯–A–D'),
     ascendentes, 90 ms entre notas, cola de reverb; ≈ 1.6 s.
   - `secretSpecies`: lo mismo una octava abajo sobre un acorde lento Re maj9; ≈ 2.2 s.
   - `allFound`: las 5 notas, después acorde sostenido con brillo (shimmer); ≈ 3.5 s.
   Respetar la mezcla del GDD (bus de efectos, máx. 6 voces).
7. **Steam / plataformas:** `SECRET_ACHIEVEMENTS` (`hidden: true`, `steamApiName: 'SECRET_*'`):
   uno por secreto + `SECRET_FIRST`, `SECRET_TEN`, `SECRET_ALL_FOUND`. Desbloquear en `found` y
   sincronizar al arrancar con `earnedSecretAchievements(secrets.isFound)`.
8. **Borrar partida:** llamar `secrets.reset()`.

## Constantes de ajuste

Viven en `src/secrets/data.ts` con su origen comentado (bonus por secreto y tope, 42 siembras, 10
explosiones/120 s, racha de 7 Destellos, 7 toques/800 ms, 5 s de pulsación, 30 min, 5 min, 10 min,
6 cifras, horas de noche, aurora 20 min/3 estables/45 min de media, tolerancias de Orión, fechas).
Si el revisor prefiere tenerlas en `src/game/balance.ts`, se mueven sin cambiar nada más.

Desviación respecto al encargo: «3 Destellos en 60 s» es imposible con el ritmo del Destello
(uno cada 90–240 s, GDD §23.1); se sustituye por **7 seguidos sin perder ninguno**, que premia la misma
atención.

## Pruebas y capturas

- `npx vitest run src/secrets` — cada disparador con reloj, vista y eventos falsos; persistencia,
  fusión y datos corruptos; tope del bonus; paletas; escalera de pistas; reconocedor de trazos
  (tamaños, rotaciones, sentido, ruido, falsos positivos ≤ 1 % en garabatos); luna con llenas y nuevas
  conocidas (eclipses); detectores de agitado; supervivencia real de las especies ocultas en CPU;
  y los **diez primeros minutos típicos** sin secretos salvo los fáciles.
- `node tests/e2e/secrets-shots.mjs` — capturas `secrets-*.png` (tarjetas, efectos, sótano, trazo
  real con el ratón, Reducir movimiento) y medición de fps con los efectos más pesados apilados.
- Banco de pruebas: `npm run dev` y abrir `/secrets-dev.html` (parámetros en la cabecera de
  `src/ui/secrets/dev.ts`: `?lang=en&rm=1&found=12&basement=1&reveal=ignis&effect=aurora&date=…`).

## Cómo añadir un secreto

1. Añadir el id a `SecretId` (`types.ts`) y su entrada en `SECRET_DEFS` (`data.ts`): nombre, línea
   críptica, Bitácora, frase de VELA (≤ 12 palabras), **tres pistas** y glifo.
2. Disparo en `secrets.ts` (evento del bus, sondeo o gancho) llamando a `find(id)` y, si procede, a un
   efecto.
3. Test del disparador **y** comprobar que `earlyplay.test.ts` sigue verde.
4. Actualizar esta página. El logro `SECRET_*` se genera solo.
