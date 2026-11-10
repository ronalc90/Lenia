# Roadmap de Bioluma

Dónde está el juego hoy (**v0.027**, publicada en [bioluma-xi.vercel.app](https://bioluma-xi.vercel.app)) y qué sigue,
en orden. Diseño en [`GDD.md`](GDD.md) (v1.5); el porqué de cada cosa en [`../DECISIONS.md`](../DECISIONS.md) (ADR-001
a ADR-031); plataformas en [`PLATAFORMAS.md`](PLATAFORMAS.md). El plan original de fases (semanas, presupuesto de
100 USD) sigue en [`source/PLAN-100-USD.md`](source/PLAN-100-USD.md) como referencia histórica.

> **Cómo leer este documento.** «Hecho» quiere decir que está en `main`, con pruebas, y que las puertas duras de
> [`../CLAUDE.md`](../CLAUDE.md) pasan. «Pendiente» lista lo que falta, con quién lo decide cuando no es código.

## Dónde estamos: v0.027

Bioluma es un incremental de **sesiones de laboratorio cortas**: siembras con el botón «Sembrar», las criaturas de Lenia
que se estabilizan llenan gotas de **Luz** (`essence` en el código), tocarlas les da un **Pulso** que paga y hace racha,
y al sonar «¡Tiempo!» la Luz se vuelve **Datos** para el **Árbol de investigación**. La noche avanza sin borrar nada.

| Sistema | Hecho | Pendiente |
|---|---|---|
| Simulación | Lenia en WebGL2 (ping-pong RGBA16F), kernel y crecimiento exactos de Chan (ADR-002), referencia CPU con FFT, catálogo de 26 especies; cámara rápida ×1,5 en las sesiones e incubación bajo la tarjeta de inicio (ADR-027) | Medir los 30 fps en teléfonos reales (en CI no hay GPU) |
| Placa | Placa de Petri redonda con cristal que absorbe, deflector para las nadadoras, crece con la ruta Placa (ADR-025); grilla fija por calidad (ADR-010) | — |
| Semillas | Ruido asimétrico y esporas (ADR-003); botón «Sembrar» que elige el sitio libre más seguro; semilla que no prende devuelve su precio, y tras dos fallos la siguiente es segura (ADR-031) | — |
| Detector | Estados, comportamientos, firma sin μ/σ, pruebas a 64² (R = 13) y 128² (R = 18) (ADR-007, ADR-011) | Las maneras «se divide» y «colonia» no las cría ningún mundo |
| Ciclo | Sesiones con reloj (0:15 → 2:30), Datos al final, Nevera, Encargos, Nutrientes, noches (ADR-026, ADR-030); el reloj espera mientras VELA habla o hay una hoja abierta | Borrar el bucle clásico retirado (ver «Siguientes pasos», 2) |
| Luz y Pulso | Gotas que se recogen a mano o con pipetas, la Luz nunca se pierde (ADR-030); Pulso, racha y ¡Chispazo! ×5, toques limitados a 10 por segundo, quien no toca nunca gana menos (ADR-031) | — |
| Árbol y mundos | 62 mejoras en 8 rutas rectas (Reloj, Gotero, Placa, Vida, ↓ Recoger, Descubrir, Mundos, ✦ Pulso) y 7 mundos con su especie y variantes | Afinar con el bot de sesiones cuando lleguen datos de jugadores |
| Historia y explicaciones | VELA como monitor de cultivo MC-7 y doctores en encuadre documental (ADR-029), tutorial con historia, Encargos, finales (ADR-022); Momentos con una sola tarjeta por partida y accidentes explicados (ADR-030) | — |
| Diversión | Destello dorado, objetivos, 32 logros de sesión, secretos, juego visual y sonoro (ADR-014) | — |
| Interfaz y audio | Una pantalla, dock y cajones, es/en, tema oscuro y claro, «Reducir movimiento», «Modo un toque», «Recoger la luz sola»; audio sintetizado en vivo | Lighthouse ≥ 90 sin verificar |
| Guardado | Guardado local, exportar/importar `BIOLUMA2.` (todo el progreso), los `BIOLUMA1.` antiguos se siguen importando | Guardado en la nube de galaxy.click |
| Ranking | Opcional, firmado (ECDSA) y con validación de plausibilidad en el servidor ([`RANKING.md`](RANKING.md)) | — |
| Tienda | Cosméticos y Vestidor implementados con los pagos apagados (`STORE_ENABLED = false`, ADR-021); el modo de prueba (`?store=mock`) solo existe en builds de desarrollo y de prueba | Lo decide el dueño ([`MONETIZACION.md`](MONETIZACION.md)) |
| Plataformas | Electron (Windows, macOS, Linux, Steam), Capacitor (Android), zips para portales; las builds salen en `release.yml` | Ninguna publicada todavía (ver «Siguientes pasos», 6) |
| PWA e infraestructura | Manifest, iconos, service worker con versión, CI (typecheck, pruebas, build y build de un solo archivo), release con logros de Steam comprobados y `butler` fijado | Puertas de tamaño de bundle y de fps en CI |

Nombre: **Bioluma** es definitivo (ADR-023). Sin anuncios, nunca. Analítica: no hay (no existe telemetría).

## Cómo llegamos aquí

- **v0.1** (fases 0 a 3 del plan): simulación, detector, economía continua, Bestiario, Calibrador, Extinción y Genoma.
- **v0.012–v0.018** (octubre de 2026): sesiones de laboratorio con Árbol de rutas rectas y mundos desde la v0.012
  (ADR-026), placa redonda que crece desde la v0.014 (ADR-025), cámara rápida (ADR-027); el bucle clásico (Calibrar,
  Extinción, Genoma) se retira (ADR-028).
- **v0.019–v0.024** (noviembre): realismo científico desde la v0.021 (ADR-029); segunda pasada de claridad: la Esencia
  pasa a llamarse Luz y se recoge a mano, ruta ↓ Recoger, reloj que espera al jugador, accidentes explicados (ADR-030).
- **v0.025–v0.027**: el toque es un Pulso, sembrar es un botón, rachas y Chispazo, muertes que enseñan (ADR-031);
  correcciones de QA sobre la Nevera, el tutorial y el reloj.

## Siguientes pasos, en orden

1. **Puertas que hoy no corre la CI.** Medir los 30 fps con la cámara rápida en un teléfono real y, si se puede, en un
   runner con GPU (`FPS_FLOOR` en `tests/e2e/smoke.mjs`); añadir a `ci.yml` un paso que mida el bundle comprimido
   (hoy el código ronda los 605 KB, por encima del objetivo de 600 KB: cargar tarde el arte de la historia, la intro y
   los Momentos).
2. **Borrar el bucle clásico** (consecuencia pendiente de ADR-028): las ramas `classic` / `!sessions` de
   `src/game/game.ts`, las 19 pruebas con `cycle: 'classic'` (pasarlas al ciclo de sesiones primero),
   `CLASSIC_ONLY_TEXT`, `CLASSIC_ONLY_SCENES`, las ilustraciones de Extinción y Genoma y el camino clásico de
   `server/validate.ts`. Un PR por pieza, con su ADR si toca contratos.
3. **Números de balance fuera de su sitio**: mover a `src/game/cycleBalance.ts` los literales que quedan en
   `legacy.ts`, `worlds.ts`, `tree.ts`, `game.ts`, `session.ts` y en algunos archivos de `src/ui/`, cada uno con su
   comentario y con el informe del bot antes y después.
4. **Dependencias**: revisar y fusionar (o cerrar) los PR de Dependabot y activar sus alertas en el repositorio.
5. **Material para jugadores**: regenerar las capturas de la wiki con `node tests/e2e/wiki-shots.mjs`, rehacer a mano
   `docs/wiki/images/hero.png` y `social-preview.png` (muestran las pestañas viejas; el script no los toca) y las
   capturas del README en `docs/capturas/` (son de la v0.018).
6. **Publicar**, en el orden de [`PLATAFORMAS.md`](PLATAFORMAS.md): dominio propio, galaxy.click e itch.io,
   Microsoft Store, Google Play (12 testers durante 14 días) y Steam (demo para el Next Fest antes del 2027-01-10).
   Antes de la primera tienda: política de privacidad publicada y la revisión pendiente de las dos fotos del NCI
   ([`../CREDITS.md`](../CREDITS.md)).
7. **Tienda** (decisión del dueño): cuentas, productos y webhook, luego `STORE_ENABLED` con su ADR.
8. **Contenido**: un mundo que críe las maneras «se divide» y «colonia», y lo de la §21 del GDD (eventos de placa,
   pastoreo…). La cubeta de prueba sigue diferida (ADR-012).

## Agente nocturno (no activado)

No hay ningún workflow que llame a un modelo: `ci.yml`, `pages.yml`, `release.yml` y `wiki-sync.yml` solo construyen,
prueban o publican, y `ci.yml` tiene `permissions: contents: read` y ningún secreto. Si algún día se activa, lo hace
el dueño y con las salvaguardas de ADR-020:

- ninguna API key de Anthropic en el repo, `.env`, secretos de CI ni shells de tareas programadas; solo
  `CLAUDE_CODE_OAUTH_TOKEN` o una tarea nativa en la nube;
- `timeout-minutes` y `--max-turns` en cada workflow, concurrencia 1;
- interruptor `NIGHTLY_ENABLED` (el workflow termina si vale `false`);
- un PR pequeño por ítem, revisado por otro rol, y todo bug de QA con su prueba que falla primero.
