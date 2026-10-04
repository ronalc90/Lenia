# Roadmap de Bioluma

Fases del plan original ([`source/PLAN-100-USD.md`](source/PLAN-100-USD.md)), lo que ya cubre la build **v0.1**, los
siguientes pasos y el plan del agente nocturno (**todavía no activado**). Las semanas son una estimación del plan, no
un dato medido. Diseño en [`GDD.md`](GDD.md); decisiones en [`../DECISIONS.md`](../DECISIONS.md).

> **Nota sobre v0.1.** Esta build integra de golpe el alcance de las Fases 0, 1 y 2 y buena parte de la 3 (todo
> lo que se puede probar sin servicios externos). Las casillas de abajo siguen el alcance acordado para v0.1; el
> integrador debe confirmarlas contra la build final (`npm test`, `npm run build`, `npm run e2e`).

## Estado de v0.1 por sistema

| Sistema | Incluido en v0.1 | Pendiente |
|---|---|---|
| Simulación | Lenia WebGL2 (ping-pong RGBA16F), kernel y crecimiento exactos de Chan (ADR-002), referencia CPU con FFT (Orbium O2u estable 2 000 pasos), catálogo de 26 especies con decodificador RLE, placa toroidal de aspecto fijo (ADR-004, ADR-010) | Medir fps en teléfonos reales; perfil Alto afinado; multi-kernel / multicanal |
| Semillas | Semillas con ruido asimétrico y **esporas** desde la plantilla de la especie cercana (ADR-003) | Ajustar la tasa de éxito con datos de jugadores |
| Detector | Estados muerta / explotó / naciendo / estable, comportamientos, firma sin μ/σ, "estable" a ~400 pasos (ADR-007, ADR-009) | Calibrar el umbral de firma con 100 siembras; tests a 128×128 para R = 18 (ADR-011) |
| Economía | Esencia por gradiente, rendimientos decrecientes (ADR-008), Gotero, Sembrador, Calibrador, Placa, afinidades, Reserva, offline | Corridas del bot de progresión contra la curva de §11 del GDD |
| Bestiario | Registro, ficha, Impresión, rareza, Microscopio, Catalogación, Archivo, Marcador | Fusionar especies (válvula de seguridad del detector) |
| Prestigio | Extinción, Genoma (bonus solo la primera vez, ADR-005, ADR-006), Árbol de 11 nodos | Efecto real de **Segundo canal, Flujo y Depredación** (hoy "próximamente") |
| Capa de diversión | Destello, cadena de 20 objetivos, 34 logros, jugo (ADR-014) | Afinar pesos y recompensas con el bot |
| UI y audio | Una pantalla, 4 pestañas, HUD, ajustes es/en, audio procedural | Modo claro (Fase 2 del GDD), Lighthouse ≥ 90 verificado |
| Guardado | Guardado local, export/import `BIOLUMA1.` (ADR-018) | Cloud save de galaxy.click |
| PWA e infraestructura | Manifest, iconos (SVG y PNG), service worker, CI (typecheck, tests, build, build de un solo archivo, ADR-015) | Deploy en Vercel (preview) y Cloudflare (producción) |
| Analítica | Ajuste "Analítica anónima" (apagado por defecto) | Integrar PostHog y Sentry (§18 del GDD) |

## Fases

### Fase 0: Fundaciones (semana 1)

Repo público Vite + TS, CI, `CLAUDE.md`, `DECISIONS.md`, licencia MIT propia y aviso "MIT License, Copyright (c)
2018 Bert Chan" para el catálogo. Shader single-kernel con ping-pong RGBA16F, decoder RLE de `animals.json`, Orbium
corriendo, deploy a Vercel preview.
**Aceptación:** Orbium estable 2 000 pasos en Playwright; ≥ 30 fps en viewport móvil emulado y en el teléfono del dueño.

- [x] Repo, CI (`.github/workflows/ci.yml`), `CLAUDE.md`, `DECISIONS.md`, `LICENSE`, `CREDITS.md`.
- [x] Simulación GPU con ping-pong RGBA16F, decoder RLE, catálogo curado, referencia CPU con test de 2 000 pasos.
- [ ] Orbium estable 2 000 pasos **en la GPU**, medido con Playwright.
- [ ] Deploy a Vercel (preview) y medición de fps en viewport móvil emulado (CPU ×4) y en el teléfono del dueño.

### Fase 1: Core loop (semanas 2 a 3)

Siembra por toque con costo, Esencia por masa de gradiente, Gotero, Sembrador automático, Placa más grande, guardado
local, detector v1 (vivo / muerto / explotó / móvil), bot de progresión.
**Aceptación:** el bot llega al primer Sembrador en 5 a 8 min reales; sopa uniforme produce Esencia = 0 (test
unitario); Lighthouse PWA ≥ 90.

- [x] Siembra, economía, Gotero, Sembrador, Placa, guardado local, detector.
- [ ] Bot de progresión (`greedy`, `explorer`, `idle`) con informe en `reports/balance/`.
- [ ] Lighthouse CI con presupuesto de bundle (≤ 2 MB comprimido, objetivo 600 KB).

### Fase 2: Bestiario y Calibrador (semanas 4 a 5)

Sliders μ / σ con rangos crecientes, detección de oscilación y división, registro de especies con multiplicador e
Impresión. QA adversarial corre cada noche.
**Aceptación:** 8 especies del catálogo clasificadas correctamente en tests; el Balanceador no encuentra una
estrategia > 3× la base.

- [x] Calibrador, bestiario, comportamientos, Impresión, rareza.
- [ ] Tests de las especies del catálogo (R = 13 a 64×64, R = 18 a 128×128) y 100 siembras de ruido sin falsos positivos.
- [ ] QA adversarial nocturno sobre el preview de Vercel.

### Fase 3: Extinción y profundidad (semanas 6 a 7)

Prestigio con Genoma, kernels multi-anillo, PostHog, Discord, páginas en itch.io y galaxy.click con cloud save, tres
playtesters sintéticos.
**Aceptación:** corrida post-prestigio del bot 30 a 50 % más rápida; encuesta in-game activa; build publicada en ambos
portales.

- [x] Extinción, Genoma, Árbol, Anillos dobles y triples.
- [ ] PostHog (opt-in, sin identificadores personales), encuesta tras la primera Extinción, Discord.
- [ ] Páginas en itch.io (HTML5, puede usar el build de un solo archivo) y galaxy.click con cloud save.
- [ ] Tres playtesters sintéticos con diario de sesión.

### Fase 4: Lanzamiento y Android (semana 8 o más)

Dominio en Cloudflare, `assetlinks.json`, TWA con Bubblewrap / PWABuilder, Play Console, 12 testers reclutados en
Discord y r/incremental_games durante 14 días, Microsoft Store.
**Aceptación:** 12 testers opt-in continuos; cuestionario de producción respondido; post en r/incremental_games con GIF.

- [ ] Todo pendiente. Decisión previa del dueño: escenario de presupuesto (solo web o web + Android) y nombre final.

## Siguientes pasos, en orden

1. **Medir de verdad**: fps en el teléfono del dueño y con Playwright (CPU ×4, 8 criaturas); decidir el perfil por defecto.
2. **Cerrar la deuda de pruebas del detector** (ADR-011, 100 siembras de ruido, Orbium impreso 10 de 10).
3. **Bot de progresión** y primera corrida contra la curva de §11; ajustar solo `src/game/balance.ts`.
4. **Deploy**: Vercel para previews de cada PR, Cloudflare para el dominio final; comprobar `sw.js` solo en http(s).
5. **Primera build a jugadores** (build de un solo archivo + itch.io / galaxy.click) y hilo de feedback en
   r/incremental_games; validar las convenciones de incrementales que el plan marcó como no verificadas.
6. **Contenido pendiente**: Segundo canal, Flujo y Depredación (hoy nodos "próximamente"), fusionar especies, entradas
   finales de la Bitácora en `content/` (es/en), modo claro.
7. **Analítica y errores**: PostHog (embudo de §18) y Sentry, siempre opt-out desde ajustes.
8. Post-lanzamiento en el orden de la §21 del GDD (Flujo, eventos de placa, pastoreo, ...). La **cubeta de prueba**
   sigue diferida (ADR-012).

## Plan del agente nocturno (no activado)

**Estado:** no hay ningún workflow que llame a un modelo. `ci.yml` solo verifica; tiene `permissions: contents: read`
y ningún secreto. El plan recomienda activarlo **después de la Fase 0**, con CI y `CLAUDE.md` listos.

**Cómo funcionará**

- **Ejecución:** una *scheduled task* nativa en la nube (sobre la suscripción; intervalo mínimo de 1 hora) a las 23:00
  hora de Colombia, fuera de la hora pico de la tarde en EE. UU.; alternativa equivalente: Claude Code GitHub Action
  con `CLAUDE_CODE_OAUTH_TOKEN`.
- **Ciclo por noche (1 a 3 ítems del backlog, un PR pequeño por ítem):** spec, plan, build en rama, tests, QA
  adversarial, revisión, merge, preview en Vercel, playtest sintético, métricas, backlog.
- **Salidas:** `reports/YYYY-MM-DD.md` (decisiones y bloqueos), `reports/balance/YYYY-MM-DD.json` (informe del bot) y PRs
  para revisar por la mañana desde el teléfono.
- **Roles** (modelo): Director (Opus; no escribe código), Arquitecto (Opus; ADR), Ingeniero de simulación y de
  juego (Sonnet), Diseñador UI/audio (Sonnet), QA adversarial (Opus, sin acceso al código), Revisor (Opus; no
  aprueba su propio PR), Balanceador (Opus con corridas de Haiku), Playtesters sintéticos (Haiku), Cronista (Haiku;
  CHANGELOG, DECISIONS, README, créditos).

**Compuertas duras:** Vitest y Playwright en verde; piso de 30 fps en viewport móvil emulado; presupuesto de bundle;
todo bug de QA genera primero un test que falla.

**Salvaguardas de costo (obligatorias antes de activarlo, ADR-020)**

- Ninguna API key de Anthropic en el repo, `.env`, secretos de CI ni shells de tareas programadas; solo
  `CLAUDE_CODE_OAUTH_TOKEN` o una tarea nativa.
- `timeout-minutes` y `--max-turns` en cada workflow; concurrencia 1; si un experimento puntual usa la API,
  `--max-budget-usd 3`.
- **Interruptor:** variable de repositorio `NIGHTLY_ENABLED`; el workflow termina de inmediato si vale `false`.
- Créditos de uso de la suscripción apagados, para que al tocar el límite la ejecución se rechace en vez de facturar.
- Si el límite semanal se agota, bajar a 3 noches por semana.

**Criterios para activarlo:** Fase 0 cerrada (Orbium estable en GPU, fps medido), CI verde en `main`, `CLAUDE.md` y
`DECISIONS.md` al día, `NIGHTLY_ENABLED` creado en `false`, y el dueño decide arrancar.

**Auto-mejora:** `CLAUDE.md` crece desde fallos repetidos (dos rechazos del Revisor por la misma causa producen una
regla); los procedimientos repetidos tres veces se vuelven skills del repo; retrospectiva por ciclo; A/B de parámetros
del Balanceador con el bot.
