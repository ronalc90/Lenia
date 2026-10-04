**Español** · [[English|Development-en]]

# Desarrollo: para quien quiere ayudar

¡Gracias por querer ayudar! Esta página es para **personas que programan** (o quieren aprender). Si solo quieres jugar, vuelve a [[Cómo jugar]].

El repositorio: [github.com/ronalc90/Lenia](https://github.com/ronalc90/Lenia) · Licencia **MIT**.

## Qué usamos

| Cosa | Con qué |
|---|---|
| Lenguaje | **TypeScript** estricto |
| Empaquetador | **Vite** |
| Simulación y dibujo | **WebGL2** (texturas RGBA16F en ping-pong) |
| Interfaz | **TypeScript puro**: sin React, Vue ni Svelte |
| Sonido | **Web Audio**, todo sintetizado en el momento (sin archivos de audio) |
| Pruebas | **Vitest** (unitarias) y **Playwright** (`playwright-core`) para las de navegador |
| Dependencias de ejecución | **Cero** |

Cada dependencia nueva necesita su propio ADR en [`DECISIONS.md`](https://github.com/ronalc90/Lenia/blob/main/DECISIONS.md).

## Empezar en 1 minuto

```bash
git clone https://github.com/ronalc90/Lenia.git
cd Lenia
npm ci                    # instala exactamente lo del package-lock
npm run dev               # servidor de desarrollo (Vite)
```

Hace falta **Node 22** y un navegador con **WebGL2**. En desarrollo, `window.bioluma` (`{ game, sim, detector, camera, bus }`) queda disponible en la consola para investigar.

## Comandos

| Comando | Para qué |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run typecheck` | `tsc --noEmit` (estricto, sin variables sin usar) |
| `npm test` | **Vitest**: `src/**/*.test.ts` y `tests/unit/**` |
| `npx vitest run src/detect` | Solo las pruebas de una carpeta |
| `npm run build` | Typecheck + build de producción en `dist/` |
| `SINGLE=1 npx vite build` | Build de **un solo archivo** en `dist-single/` (para compartir) |
| `npm run preview` | Sirve `dist/` |
| `npm run e2e` | Build con `VITE_E2E=1` y prueba de humo con Playwright |
| `npm run e2e:sim` | Comprobaciones de la simulación en GPU |
| `npm run e2e:audio` | Render de audio sin conexión, con control de picos |
| `npm run calibrate` | Recalibra las firmas del detector con el catálogo (~4 min) |
| `npm run bot` | Bot de balance: juega el juego acelerado y mide la curva |
| `node tests/e2e/ui-shots.mjs` | Capturas de la interfaz con datos de ejemplo (`ui-dev.html`) |
| `node tests/e2e/wiki-shots.mjs` | Regenera las capturas de esta wiki desde el juego real |

Para navegadores sin pantalla usa `playwright-core` con el Chromium que haya en `/opt/pw-browsers`. **Nunca** ejecutes `playwright install`.

## Mapa del código

| Ruta | Qué hay | Cuidado |
|---|---|---|
| `src/core/` | **Contratos** compartidos: `types.ts`, `bus.ts`, `camera.ts`, `palette.ts` | Solo se cambian a través del integrador. Puedes **añadir campos opcionales**, nunca renombrar |
| `src/sim/` | Simulación: shaders WebGL2, referencia en CPU con FFT, catálogo de 26 especies | Fórmulas exactas de Chan (ADR-002) |
| `src/detect/` | Detector: estados, comportamientos, firmas de especie | CPU puro; la firma no incluye μ ni σ (ADR-007) |
| `src/game/` | Economía, mejoras, prestigio, bestiario, objetivos, logros, Destello, guardado y **`balance.ts`** | Sin DOM ni GL |
| `src/ui/` | HUD, placa, pestañas, modales, tutorial, textos (`i18n.ts`) | Toda la interfaz en TypeScript puro |
| `src/audio/` | Audio procedural | Solo arranca tras el primer toque |
| `src/net/` | Cliente del ranking e integridad | Opcional para el jugador |
| `src/store/` | Catálogo de cosméticos y derechos | Solo visual o sonoro; nada toca la economía |
| `src/story/`, `src/secrets/` | Narrativa y contenido escondido | **Con spoilers**: léelo solo si quieres |
| `src/main.ts` | Une todo: sim → detector → juego → UI y audio; bucle y autoguardado | Lo toca el integrador |
| `api/`, `server/` | Ranking (funciones Edge de Vercel y lógica pura) | Ver `docs/RANKING.md` |
| `platforms/` | Envoltorios: escritorio (Electron), móvil (Capacitor), Steam | Ver `docs/PLATAFORMAS.md` |
| `scripts/` | Calibración, bot de balance, iconos | No se publican |
| `tests/unit/`, `tests/e2e/` | Pruebas entre módulos y de navegador | Las de un módulo viven junto a su código |
| `docs/` | `GDD.md` (diseño), `ROADMAP.md`, `REVIEW.md`, `wiki/` (esta wiki) | El GDD está en español |

El flujo de cada fotograma: `requestAnimationFrame` → pasos de simulación (30 por segundo × velocidad) → cada 10 pasos se lee la placa → el **detector** → el **juego** (`game.tick`) → `sim.render` y la interfaz.

## Las reglas de oro

Resumen de [`CLAUDE.md`](https://github.com/ronalc90/Lenia/blob/main/CLAUDE.md):

1. **Contratos solo por el integrador** (`src/core`). Añadir campos opcionales está bien.
2. **Todos los números del balance viven en `src/game/balance.ts`**, cada uno con un comentario de dónde sale. Nada de números mágicos en `game/` ni `ui/`.
3. **Todo texto para el jugador es `Text { es, en }`**, en los dos idiomas. Identificadores, comentarios y nombres de pruebas, en inglés.
4. **Invariantes de la simulación**: fórmulas de Chan, placa toroidal, aspecto 4:5, RGBA16F (nunca 8 bits), semillas con ruido asimétrico. No se "mejoran" sin ADR.
5. **Sin dependencias nuevas** sin ADR. Sin framework de interfaz.
6. **El GDD manda.** Si el código y el GDD no coinciden, se arregla uno de los dos con un ADR.
7. **Nada de secretos ni llaves en el repo.** Ninguna API key de IA en ningún sitio.
8. **Pull requests pequeños.** Nadie sube a `main` directamente.
9. **Cada bug trae su prueba.** Primero la prueba que falla, después el arreglo.
10. **La atribución es parte del código**: mantén `CREDITS.md` al día.

## Pruebas y CI

- **Unitarias** (`npm test`): simulación, detector, economía, guardado, texto, ranking… Las del detector usan 64×64 para especies de R = 13 y **128×128** si interviene una de R = 18 (ADR-011).
- **De navegador** (`npm run e2e`, `e2e:sim`, `e2e:audio`): la simulación en GPU, el audio y un recorrido real del juego.
- **CI** (`.github/workflows/ci.yml`): en cada push y PR corre **typecheck, pruebas, build PWA y build de un solo archivo**, y sube el archivo único como artefacto. Solo tiene permiso de lectura y ningún secreto.
- **Release** (`.github/workflows/release.yml`): arma los paquetes de web, escritorio y Android en cada etiqueta `v*`.
- **Wiki** (`.github/workflows/wiki-sync.yml`): publica `docs/wiki/` en la wiki de GitHub (ver más abajo).

## Cómo añadir una especie

Las especies vienen del catálogo de Bert Chan (MIT). Pasos:

1. Copia la entrada de `animals.json` a **`src/sim/catalog.json`** con los campos `code`, `name`, `R`, `T`, `b`, `m`, `s` y `cells`. **Solo entradas con `kn = 1` y `gn = 1`** (lo que implementan nuestros shaders).
2. Asigna su **rareza** en `RARITY_BY_CODE`, en `src/game/balance.ts`.
3. Corre **`npm run calibrate`** (unos 4 minutos). Con `ONLY=codigo` mide solo una especie, sin escribir el archivo. Esto regenera **`src/detect/catalogSignatures.json`**, que el juego usa para ponerle su nombre real al registrarla.
4. Si es de R = 18 o más, sus pruebas van a **128×128** (ADR-011).
5. Corre `npx vitest run src/sim src/detect src/game` y mira que se estabiliza con sus propios μ y σ.
6. Añade la fila a la tabla de **`CREDITS.md`**.

## Cómo añadir una mejora

1. **Números** en `src/game/balance.ts`: costos, crecimiento, bonus, tope. Con un comentario de su origen.
2. **Definición** en la lista `UPGRADES` de `src/game/defs.ts`: `id`, `tab` (`'lab'` o `'bestiary'`), `currency`, `maxLevel`, `costs` o `base` y `growth`, `value(level)` y `unlock(ctx)`.
3. **Textos** en `UPGRADE_TEXT` de `src/game/content.ts`: `name`, `desc` y `hint`, cada uno con `es` y `en`. Si el efecto necesita una frase por nivel, añade el caso en `effectText`.
4. **Efecto**: úsalo donde corresponda en `src/game/game.ts` o `economy.ts` (por ejemplo `level('miMejora')`).
5. **Icono** de la tarjeta en `UP_ICONS` de `src/ui/upgrades.ts` (si no, usa uno genérico).
6. **Pruebas** en `src/game/upgrades.test.ts` (y de economía si cambia la producción): costo, tope, desbloqueo y efecto.
7. Corre el **bot de balance** antes y después: `npm run bot`. Ningún número cambia sin ese informe.

## Cómo añadir un idioma o un texto

- Textos del juego (mejoras, logros, objetivos): `src/game/content.ts`, siempre `{ es, en }`.
- Textos de la interfaz: el objeto `S` de `src/ui/i18n.ts`. Una prueba revisa que cada clave tenga los dos idiomas y los mismos `{marcadores}`.

## Esta wiki

Las páginas viven en **`docs/wiki/`** del repositorio. Cuando entra a `main` un cambio en esa carpeta, **`wiki-sync.yml`** la copia a la wiki de GitHub.

- Los nombres de archivo son los títulos (`Cómo-jugar.md` → "Cómo jugar"). Las versiones en inglés terminan en `-en`.
- `{{GAME_URL}}` se reemplaza por la variable del repositorio `GAME_URL`.
- Las imágenes están en `docs/wiki/images/`. Para regenerarlas desde el juego real: `node tests/e2e/wiki-shots.mjs` (tarda unos 15 minutos; mira la cabecera del archivo).
- **`Secretos` no debe tener spoilers.** Si añades contenido escondido al juego, no lo describas en la wiki.

## Mapa de la documentación

| Documento | Qué cuenta |
|---|---|
| [`docs/GDD.md`](https://github.com/ronalc90/Lenia/blob/main/docs/GDD.md) | Diseño del juego (en español) |
| [`DECISIONS.md`](https://github.com/ronalc90/Lenia/blob/main/DECISIONS.md) | Decisiones (ADR) y por qué |
| [`docs/ROADMAP.md`](https://github.com/ronalc90/Lenia/blob/main/docs/ROADMAP.md) | Fases y qué sigue |
| [`docs/REVIEW.md`](https://github.com/ronalc90/Lenia/blob/main/docs/REVIEW.md) | Revisión de arquitectura y errores |
| [`docs/PLATAFORMAS.md`](https://github.com/ronalc90/Lenia/blob/main/docs/PLATAFORMAS.md) | Cómo se publica en cada plataforma |
| [`docs/RANKING.md`](https://github.com/ronalc90/Lenia/blob/main/docs/RANKING.md) | Ranking y anti-trampas |
| [`CREDITS.md`](https://github.com/ronalc90/Lenia/blob/main/CREDITS.md) | Atribuciones y licencias |
| [`CLAUDE.md`](https://github.com/ronalc90/Lenia/blob/main/CLAUDE.md) | Reglas para agentes de IA y personas |

¿Dudas? Abre un *issue*: [github.com/ronalc90/Lenia/issues](https://github.com/ronalc90/Lenia/issues).
