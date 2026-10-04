**Español** · [[English|Science-behind-en]]

# Ciencia detrás: la vida que se inventa sola

Las criaturas de Bioluma **no están dibujadas**. Nacen de una regla matemática. Esta página te cuenta cómo, con palabras fáciles. Al final hay un rinconcito para curiosos.

## La idea en 30 segundos

Imagina un tablero enorme de cuadritos. Cada cuadrito es una **lucecita** con un brillo entre **0** (apagada) y **1** (muy brillante).

En cada momento, cada lucecita **mira a sus vecinas** y piensa: *"¿me gusta lo que veo?"*

- Si ve **justo lo que le gusta**, brilla un poquito más.
- Si ve **demasiado** o **muy poco**, se apaga un poquito.

Eso pasa en todos los cuadritos a la vez, una y otra vez, unas 30 veces por segundo.

¿Y qué sale? De pronto aparecen **manchas de luz que se mueven solas**. Nadan, giran, laten y hasta se parten en dos. Son las criaturas. **Nadie les dijo cómo moverse.** Salen de la regla.

> A esto los científicos le dicen **emergencia**: cosas complicadas que nacen de reglas muy simples. Como una bandada de pájaros, que nadie dirige.

## Qué son μ y σ

Cuando mueves los deslizadores de **Calibrar**, cambias estos números:

| Letra | Se lee | Quiere decir… |
|---|---|---|
| **μ** | "mu" | **Lo que le gusta a la lucecita.** Cuánto brillo de vecinas le parece perfecto. |
| **σ** | "sigma" | **Qué tan exigente es.** Con σ chiquita solo acepta algo muy preciso. Con σ grande acepta casi cualquier cosa. |
| **R** | "erre" | **Hasta dónde mira.** El tamaño del anillo de vecinas. Con R más grande, las criaturas son más grandes. |
| **dt** | "de te" | **Qué tan rápido pasa el tiempo** en cada paso. Muy alto rompe a las criaturas delicadas. |

Cada par de μ y σ es **un universo distinto**, con sus propios bichos. Por eso cambiar las reglas es la forma más rápida de descubrir especies nuevas.

## ¿Quién inventó esto?

**Lenia** la creó **Bert Wang-Chak Chan**. Es como el famoso *Juego de la Vida* de Conway, pero en vez de cuadritos que se prenden o se apagan, usa **brillos suaves** y **tiempo suave**. Por eso las criaturas se ven vivas, no como pixeles.

Bert Chan encontró cientos de criaturas y las puso en un **catálogo** con nombres en latín, como *Orbium unicaudatus*. Bioluma usa **26** de ellas, con sus nombres y números originales.

- Código y catálogo de Lenia: [github.com/Chakazul/Lenia](https://github.com/Chakazul/Lenia)
- Artículo: *Lenia: Biology of Artificial Life.* Complex Systems 28(3), 2019. [arXiv:1812.05433](https://arxiv.org/abs/1812.05433)
- Artículo: *Lenia and Expanded Universe.* ALIFE 2020. [arXiv:2005.03742](https://arxiv.org/abs/2005.03742)

¡Gracias, Bert! Más agradecimientos en [[Créditos]].

## Qué añade Bioluma

- **La regla corre en la tarjeta gráfica** de tu teléfono o computador (con una tecnología llamada WebGL2), unas 30 veces por segundo.
- Un **detector** mira la placa cada pocos pasos y se pregunta: ¿esto vive?, ¿explotó?, ¿nada?, ¿gira?, ¿se divide?
- La **economía** convierte *forma* en **Esencia**: una criatura bien formada vale mucho; una mancha sin forma, nada.
- **Las semillas** llevan un poco de azar y, al principio, un empujoncito hacia la criatura que mejor vive con las reglas de ese momento. Así sembrar es emocionante y no frustrante.
- **Todo el sonido** se inventa en el momento: no hay grabaciones.

> **¿Es ciencia exacta?** Es un **juego**. Primero diversión, después exactitud. Pero la vida que ves es real: sale de la simulación, no de una animación.

## Mini-experimentos

1. **Mueve μ muy despacito** en Calibrar y mira qué pasa con una criatura que nada. ¿Se deshace? ¿Cambia de forma?
2. **Mira cómo sale una criatura por un lado** de la placa y vuelve a entrar por el otro. La placa es como un donut.
3. **Siembra dos veces en el mismo sitio.** ¿Salen iguales? (Spoiler: casi nunca.)
4. **Haz que algo se divida**, ¡y mira cómo se llena la placa!

## Para curiosos: la fórmula

En cada paso, el brillo nuevo de cada cuadrito es:

```
A(nuevo) = recortar_entre_0_y_1( A + dt · G( K * A ) )
```

- **K** es un **anillo** de radio R que suma 1. Cada vecina pesa según su distancia. El perfil del anillo es `(4·r·(1−r))⁴`, con `r` entre 0 y 1.
- **K \* A** es lo que "ve" la lucecita: el promedio ponderado del brillo de sus vecinas.
- **G** es la función de crecimiento: `G(u) = 2·max(0, 1 − (u − μ)² / (9σ²))⁴ − 1`. Vale +1 cuando `u = μ` (crece), y baja hasta −1 cuando `u` se aleja (se apaga).
- **dt** es el paso de tiempo.

Bioluma usa **exactamente estas funciones de Chan**, así que los números del catálogo valen sin cambiarlos. Hay una versión en CPU (con FFT) que se usa en las pruebas y verifica que la tarjeta gráfica hace lo mismo. Detalles en [`DECISIONS.md`](https://github.com/ronalc90/Lenia/blob/main/DECISIONS.md) (ADR-002 y ADR-013) y en [[Desarrollo]].

**[▶ ¡Experimenta!]({{GAME_URL}})**
