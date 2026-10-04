# Lenia incremental con 100 USD

**Recomendación:** construye el juego como PWA (TypeScript + Vite + WebGL2), hospédalo en Cloudflare (producción) con previews en Vercel Hobby, publícalo primero en galaxy.click + itch.io y deja Google Play como segunda ola. Todo el trabajo de agentes corre sobre tu suscripción de Claude (token OAuth en GitHub Actions o scheduled tasks en la nube), nunca sobre una API key en un cron. El escenario "solo web" cuesta **~10.5 USD** (dominio .com en Cloudflare, [10.46 USD/año](https://tldspy.com/registrar/cloudflare)); "web + Android" sube a **~35.5–55.5 USD** (25 USD de Play + 0–20 USD de testers). Apple (99 USD/año) y Steam (100 USD) no caben. Quedan **45–90 USD de reserva** antes de activos opcionales (máximo 11 USD en audio e imagen). Tres correcciones al plan original que salen de la evidencia: Vercel Hobby sirve para previews pero no para producción si algún día añades anuncios; el detector de especies tiene umbrales publicados que se portan directamente; y los framebuffers de 8 bits son marginales para Lenia a T=10, usa RGBA16F.

## Presupuesto: 100 USD alcanzan, el 90% es deliberadamente 0 USD

Casi todo lo necesario tiene tier gratuito sin letra chica que afecte a este proyecto; el gasto se concentra en dominio y tienda Android.

| Partida | Web-only | Web + Android | Fuente |
|---|---|---|---|
| Dominio `.com` (Cloudflare Registrar, precio plano) | 10.46 | 10.46 | [TLDSpy](https://tldspy.com/registrar/cloudflare) (agregador; Cloudflare no publica tabla) |
| Google Play, cuota única | 0 | 25.00 | [Play Console](https://support.google.com/googleplay/android-developer/answer/6112435) |
| Testers para Play (solo si no reclutas 12 gratis) | 0 | 0–19.99 | [primetestlab](https://primetestlab.com/blog/google-play-changed-20-to-12-testers) (vendedor) |
| Audio con licencia comercial, 1 mes (opcional) | 0–6 | 0–6 | [ElevenLabs Starter 6 USD](https://elevenlabs.io/pricing), [Suno Pro 8 USD](https://suno.com/pricing) |
| Créditos de imagen (opcional) | 0–5 | 0–5 | [fal.ai FLUX schnell 0.003 USD/MP](https://fal.ai/pricing) |
| Hosting, CI, analytics, errores, Discord, agentes | 0 | 0 | ver secciones siguientes |
| **Total gasto** | **10.5–21.5** | **35.5–66.5** | |
| **Reserva** | **78.5–89.5** | **33.5–64.5** | |

Alternativa de dominio: `.dev` o `.app` en Porkbun cuestan [8.75 USD el primer año](https://porkbun.com/products/domains) y renuevan a 12.87/14.93; evita `.io` (renueva a [51.80](https://porkbun.com/products/domains)) y `.xyz` (2.04 → 14.21). Cloudflare Registrar obliga a usar Cloudflare DNS, lo que encaja con el hosting elegido.

**Por qué Apple y Steam no caben.** Apple cobra [99 USD/año](https://developer.apple.com/support/compare-memberships/), exige Mac y rechaza PWAs envueltas como "repackaged website" (Guideline 4.2, según [MobiLoud](https://www.mobiloud.com/blog/publishing-pwa-app-store/)). La vía iOS gratis: desde iOS 16.4 las web apps en pantalla de inicio soportan Web Push sin membresía ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). Steam cuesta [100 USD por app, no reembolsable pero recuperable al llegar a 1,000 USD de ingreso bruto ajustado](https://partner.steamgames.com/doc/gettingstarted/appfee), con 21 días de espera y página "coming soon" previa ([onboarding](https://partner.steamgames.com/doc/gettingstarted/onboarding)). Solo tiene sentido si proyectas superar 1,000 USD; en ese caso, demo lista antes del **10 de enero de 2027** para el Next Fest de febrero ([Steamworks](https://partner.steamgames.com/doc/marketing/upcoming_events/nextfest/feb_2027)).

**Lo que no vale la pena.** Reddit Ads: mínimos de 5 USD/día y 25 USD de por vida, CPC 0.75–2.50 USD en gaming ([Stackmatix](https://www.stackmatix.com/blog/how-much-reddit-ads-cost-guide)); 100 USD compran 50–130 clics, sin señal estadística. Tampoco ningún tier pago de analytics o feedback (BetaHub Standard [26 USD/dev/mes](https://betahub.io/pricing/)).

## Stack y herramientas: cada decisión con su razón

**Hosting: Cloudflare en producción, Vercel para previews.** Vercel Hobby [prohíbe anuncios (incluido AdSense) y cualquier método de cobro, pero "Asking for Donations does not fall under commercial usage"](https://vercel.com/docs/limits/fair-use-guidelines); el tope es [100 GB/mes](https://vercel.com/docs/plans/hobby) y al superarlo el sitio queda en 503 hasta 30 días; hay un caso de [110 GB en un día por bots que pausó un Hobby](https://community.vercel.com/t/hobby-team-paused-after-unexpected-usage-spike-unpause-request/49948). Cloudflare Pages/Workers Static Assets da [ancho de banda y requests estáticos ilimitados, 500 builds/mes](https://pages.cloudflare.com/), sin restricción comercial en los docs (staff lo confirmó en [foro 2021](https://community.cloudflare.com/t/is-cloudflare-pages-workers-free-plan-free-for-commercial-use/291741)). Decisión: Vercel (ya conectado por MCP, con logs y analytics) para cada PR y preview nocturno; Cloudflare para el dominio final. Así puedes monetizar después sin migrar.

**Sin anuncios en la build.** galaxy.click prohíbe ["games with paid or unpaid advertisements"](https://galaxy.click/rules), es gratis y ofrece [cloud saves vía iframe API](https://galaxy.click/docs/dev). Sin anuncios, esa regla y la de Vercel Hobby no limitan nada.

**Motor: TypeScript + Vite + WebGL2.** WebGL2 cubre [~98% de móviles activos](https://www.abratabia.com/mobile-web-games/mobile-webgl-support.php); WebGPU ~70% (Chrome 121+ en Android 12+, Safari desde iOS 26 según [web.dev](https://web.dev/blog/webgpu-supported-major-browsers)). No existe una librería Lenia.js mantenida; se reimplementa el enfoque de Chan ([lenia4param.glsl](https://chakazul.github.io/Lenia/WebGL/shadertoy/lenia4param.glsl)) y se cita. Audio: Web Audio procedural + [jsfxr (Unlicense, dominio público)](https://github.com/chr15m/jsfxr).

**CI y pruebas: repo público.** Actions es [gratis e ilimitado en repos públicos](https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions); en privado son 2,000 min/mes y un nightly de Claude Code consume 30–60 min de runner. Playwright y [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) son open source. Dispositivos reales: tu teléfono vía Claude in Chrome, [Firebase Test Lab Spark con 5 runs/día en físicos](https://firebase.google.com/docs/test-lab/usage-quotas-pricing), y [AWS Device Farm con 1,000 minutos gratis una sola vez](https://aws.amazon.com/device-farm/pricing/), reservados para la semana de lanzamiento.

**Analytics y errores: PostHog como pieza única.** Free tier de [1M eventos, 5K replays, 100K excepciones y 1,500 respuestas de encuesta al mes](https://posthog.com/pricing). Complementos: [Vercel Web Analytics 50K eventos/mes](https://vercel.com/docs/analytics/limits-and-pricing) en previews, [UptimeRobot 50 monitores](https://uptimerobot.com/pricing/), [Sentry 5K errores](https://sentry.io/pricing/) si prefieres `sentry-cli` para el agente, [BetaHub free con bot de Discord y triage IA](https://betahub.io/pricing/).

**Activos visuales.** [Canva Free: 20 usos de IA/mes](https://www.canva.com/pricing/) y Figma Starter (gratis; [~500 créditos IA/mes](https://www.appshot.app/posts/2026-07-09-figma-ai-credits-explained/), fuente terciaria), ambos conectados en tu sesión. [Ideogram free permite uso comercial](https://ideogram.ai/pricing) pero publica las imágenes. Para volumen, FLUX schnell cuesta [0.003 USD/MP](https://fal.ai/pricing). En Play se marca la casilla ["AI-generated or edited" por activo del listing](https://support.google.com/googleplay/android-developer/answer/17262077?hl=en-EG); Steam exige declarar contenido pre-generado que llega al jugador, no herramientas de código ([Content Survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey)). Imágenes solo-prompt no son protegibles en EE.UU. ([Copyright Office](https://www.copyright.gov/ai/Copyright-and-Artificial-Intelligence-Part-2-Copyrightability-Report.pdf)); el Diseñador añade edición humana sobre el ícono.

**Audio con música.** Los tiers gratis de Suno y ElevenLabs son [no comerciales](https://suno.com/terms); un loop musical requiere un mes de [ElevenLabs Starter (6 USD, promo 1 USD)](https://elevenlabs.io/pricing) o [Suno Pro (8 USD)](https://suno.com/pricing), descargando dentro del mes pago. [Stable Audio Open](https://stability.ai/license) es gratis con uso comercial bajo 1M USD de ingresos, mejor para ambientes que para música.

## Equipo de agentes: diez roles, tres niveles de modelo

La regla de asignación de modelos viene de los límites de la suscripción: el plan Max reparte muchas más horas de Sonnet que de Opus por semana ([soporte Anthropic](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan)), así que Opus/Fable se reservan para decisiones y crítica, Sonnet para construir, Haiku para lo mecánico.

| Rol | Modelo | Entradas | Salidas | "Hecho" cuando |
|---|---|---|---|---|
| Director | Fable/Opus | Backlog, métricas, retro anterior | Spec del ciclo, asignación de tareas, reporte nocturno | Reporte en `reports/YYYY-MM-DD.md` con decisiones y bloqueos |
| Arquitecto | Opus | Spec, ADRs previos | ADR en `DECISIONS.md`, esqueleto de módulos, contratos TS | ADR aprobado, interfaces compilan, sin dependencias nuevas sin justificar |
| Ing. Simulación | Sonnet | ADR, catálogo animals.json | Shader Lenia, reducción de estadísticas, decoder RLE | Orbium (R=13, mu=0.15, sigma=0.015) sobrevive 2,000 pasos en test; fps ≥ 30 en viewport móvil |
| Ing. Juego/Economía | Sonnet | Spec de loop, curva objetivo | Economía, upgrades, prestigio, guardado | Vitest verde; bot de progresión alcanza hitos en tiempos objetivo ±20% |
| Diseñador UI/Audio | Sonnet | Spec, paleta, Figma/Canva | Componentes, SFX procedurales, ícono/manifest | Lighthouse PWA ≥ 90, touch targets ≥ 44 px, contraste AA |
| QA adversarial | Opus (sin acceso al código) | Build desplegada, spec | Bugs reproducibles con pasos y video Playwright | Cada bug tiene test de regresión asignado |
| Revisor | Opus | PR, checklist | Aprobación o rechazo con razones | 60 fps objetivo en viewport móvil emulado (piso duro 30), bundle ≤ 2 MB gzip (objetivo propio), a11y sin errores críticos |
| Balanceador | Opus + Haiku para corridas | Bot de progresión, logs | Curva, estrategias degeneradas, propuestas A/B | Ninguna estrategia da >3× la curva base; informe con gráficos |
| Playtesters sintéticos | Haiku (3 personas) | Build, guion de persona | Diario de sesión, momentos de frustración/aburrimiento | 3 diarios por ciclo con timestamps |
| Cronista | Haiku | Diff, PRs, decisiones | CHANGELOG, DECISIONS.md, README, créditos MIT | Docs sincronizados con `main` |

El QA adversarial no ve el código a propósito: solo recibe la URL del preview de Vercel y la spec, y juega con Playwright. El Revisor no puede aprobar su propio PR; el Director no escribe código.

## Workflow autónomo: ciclo, compuertas y mecanismos de auto-mejora

**El ciclo.** Spec → Plan → Build en rama → Tests → QA adversarial → Review → Merge → Deploy preview (Vercel) → Playtest sintético → Métricas (PostHog/bot) → Backlog → repetir. Cada noche corre un ciclo sobre 1–3 ítems del backlog; cada ítem es un PR pequeño.

**Compuertas duras (ningún agente las salta).**
- Vitest y Playwright verdes en CI.
- Piso de fps: Playwright mide `requestAnimationFrame` en viewport móvil emulado; menos de 30 fps bloquea el merge.
- Tope de bundle vía presupuesto de [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci).
- Todo bug de QA genera primero un test que falla, luego el fix.

**Mecanismos de auto-mejora.**
- `CLAUDE.md` crece solo desde fallos repetidos: dos rechazos del Revisor por la misma causa producen una regla.
- Procedimientos repetidos tres veces ("generar reporte de curva", "empaquetar TWA") se convierten en skills del repo.
- Retrospectiva por ciclo: el Revisor cuestiona la spec misma ("¿esto mide complejidad o solo masa?") y el Director decide si cambia el backlog.
- A/B del Balanceador: dos ramas de parámetros económicos, el bot corre ambas, gana la métrica declarada antes de correr.
- Feedback real: el Cronista exporta comentarios de Discord/itch/encuestas PostHog y los clasifica en issues; BetaHub free trae [bot de Discord y triage IA](https://betahub.io/pricing/).

**La tarea nocturna.** Una scheduled task en la nube (corre sobre la suscripción, [intervalo mínimo 1 hora, rechaza runs si se agota el límite](https://code.claude.com/docs/en/routines)) dispara a las 23:00 Colombia, fuera de la hora pico 5–11 am PT en que [las sesiones se consumen más rápido](https://www.techradar.com/ai-platforms-assistants/claude/claude-is-limiting-usage-more-aggressively-during-peak-hours-heres-what-changed). Alternativa equivalente: Claude Code GitHub Action con `CLAUDE_CODE_OAUTH_TOKEN`, que ["uses your Claude subscription instead of API billing"](https://code.claude.com/docs/en/github-actions). Deja el reporte en `reports/` y abre PRs; tú revisas en la mañana desde el teléfono.

**Salvaguardas contra costo descontrolado.** Un cron con `ANTHROPIC_API_KEY` exportada en el shell facturó [1,818 USD en dos noches](https://dev.to/runvouch/my-claude-code-cron-ran-up-1800-in-two-nights-the-watchdog-that-stops-it-at-2-3npb); otro loop que reenviaba contexto cada 30 minutos llegó a [~6,000 USD](https://www.cloudzero.com/blog/claude-code-pricing/). Anthropic reporta [~13 USD/día promedio por desarrollador en API](https://code.claude.com/docs/en/costs): 100 USD serían 4–15 noches. Reglas:
- Ninguna API key de Anthropic en secrets, `.env` ni shell de tareas programadas. Solo OAuth token o scheduled task nativa.
- `--max-turns` y `timeout-minutes` en el workflow ([recomendación oficial](https://code.claude.com/docs/en/github-actions)); concurrencia 1.
- Si un experimento puntual usa API: `--max-budget-usd 3` ([guía](https://backgroundclaude.com/blog/pricing)).
- Kill switch: variable `NIGHTLY_ENABLED` en el repo; el workflow sale si es `false`.
- Usage credits de la suscripción apagados, para que al tocar el límite el run se rechace en vez de facturar.

## Plan por fases: de prototipo a tienda en ~8 semanas

Supuesto: agentes cada noche, tú revisas 15–30 minutos al día. Las semanas son estimación, no dato investigado.

**Fase 0 — Fundaciones (semana 1).** Repo público Vite+TS, CI, `CLAUDE.md`, `DECISIONS.md`, licencia MIT propia y aviso ["MIT License, Copyright (c) 2018 Bert Chan"](https://raw.githubusercontent.com/Chakazul/Lenia/master/LICENSE.md) para el catálogo. Shader single-kernel con ping-pong RGBA16F, decoder RLE de `animals.json`, Orbium corriendo, deploy a Vercel preview. Aceptación: Orbium estable 2,000 pasos en Playwright; ≥ 30 fps en viewport móvil emulado y en tu teléfono.

**Fase 1 — Core loop (semanas 2–3).** Siembra por tap con costo, Esencia por masa de gradiente, Gotero, Sembrador automático, Placa más grande, guardado local, detector v1 (vivo/muerto/explotó/móvil), bot de progresión. Aceptación: el bot llega al primer Sembrador en 5–8 min reales; sopa uniforme produce Esencia = 0 (test unitario); Lighthouse PWA ≥ 90.

**Fase 2 — Bestiario y Calibrador (semanas 4–5).** Sliders mu/sigma con rangos crecientes, detección de oscilación/división, registro de especies con multiplicador e "imprimir". QA adversarial corre cada noche. Aceptación: 8 especies del catálogo clasificadas correctamente en tests; el Balanceador no encuentra estrategia >3× la base.

**Fase 3 — Extinción y profundidad (semanas 6–7).** Prestigio con Genoma, kernels multi-anillo, PostHog, Discord, páginas en itch.io y galaxy.click con cloud save, tres playtesters sintéticos. Aceptación: corrida post-prestigio del bot 30–50% más rápida; encuesta in-game activa; build publicada en ambos portales.

**Fase 4 — Lanzamiento y Android (semana 8+).** Dominio en Cloudflare, `assetlinks.json`, TWA con Bubblewrap/PWABuilder, Play Console, 12 testers reclutados en Discord y r/incremental_games, 14 días de prueba cerrada, Microsoft Store (gratis para individuos desde [2025-09-10](https://blogs.windows.com/windowsdeveloper/2025/09/10/free-developer-registration-for-individual-developers-on-microsoft-store/), acepta PWA). Aceptación: 12 testers opt-in continuos; cuestionario de producción respondido; post en r/incremental_games con GIF.

## Diseño técnico de Lenia y del detector de especies

**Regla y parámetros.** Actualización canónica A(t+dt) = clip01(A + dt·G(K∗A)) ([Chan 2019](https://ar5iv.labs.arxiv.org/html/1812.05433)). En GLSL usa el núcleo gaussiano que Chan despacha en web: `bell(r, 0.5, 0.15)` y crecimiento `bell(u, mu, sigma)*2-1` ([lenia1.glsl](https://github.com/Chakazul/chakazul.github.io/blob/master/Lenia/WebGL/shadertoy/lenia1.glsl)). El catálogo fue ajustado con kn=1 polinomial; Orbium tolera el cambio (shader 0.14/0.014 vs catálogo 0.15/0.015), pero prueba cada especie importada. **El campo `b` del catálogo son picos de anillo ("1/2,1" = dos anillos), no un umbral de nacimiento.**

Especies semilla con parámetros exactos de [animals.json](https://github.com/Chakazul/Lenia/blob/master/Python/animals.json) (todas R=13, T=10, b="1" salvo nota):

| Especie | mu | sigma | Comportamiento para el juego |
|---|---|---|---|
| Orbium unicaudatus | 0.15 | 0.015 | Nadador básico (tutorial) |
| Gyrorbium gyrans | 0.156 | 0.0224 | Gira |
| Parorbium dividuus | 0.174 | 0.022 | Se divide |
| Scutium solidus | 0.29 | 0.045 | Estático robusto |
| Helicium solidus | 0.35 | 0.06 | Rotación |
| Hydrogeminium natans (R=18, b="1/2,1,2/3") | 0.26 | 0.036 | Desbloqueo multi-anillo |
| Kronium dividuus (R=18, b="1,1/3") | 0.24 | 0.03 | División multi-anillo |

Rangos del Calibrador: el estudio de 2026 barre 0.1 < mu < 0.5 y 0 < sigma < 0.1 a R=13 ([Hudcova et al.](https://arxiv.org/pdf/2601.01932)); empieza el slider en mu 0.13–0.17 y abre hasta ese rango completo.

**Rendimiento móvil.** Convolución directa cuesta ~πR² taps por celda (R=13 ≈ 531), reducible 4–8× con simetría de 8 pliegues como en [lenia4param.glsl](https://chakazul.github.io/Lenia/WebGL/shadertoy/lenia4param.glsl). Chan corre su demo a 640×360 con `pixelSize=5` en móvil ([index.html](https://chakazul.github.io/Lenia/WebGL/index.html)), señal de que a resolución nativa era lento. Receta: simular a **128–256 celdas en el lado corto**, R=10–13, dt=0.1, 1–2 subpasos por frame, ping-pong RGBA16F (8 bits es marginal: growth·dt puede ser < 1/255), render con filtrado lineal. Ninguna fuente publica fps en teléfonos concretos; el piso de 30 fps se mide en Fase 0. Variantes por fase: multi-kernel/multi-canal ([Chan 2020](https://ar5iv.labs.arxiv.org/html/2005.03742)) en Fase 3 para emisores y replicación; Flow Lenia (masa conservada, especies que compiten, [arXiv 2212.07906](https://arxiv.org/pdf/2212.07906)) post-lanzamiento; Particle Lenia ([Google](https://google-research.github.io/self-organising-systems/particle-lenia/)) para un modo de "pastoreo" táctil después.

**Detector de especies.** Un pase de reducción en GPU calcula sum(A), sum(xA), sum(yA), suma del borde y count(A>0.1); la CPU lee un texel y clasifica con umbrales portados de [calc_categories.py](https://raw.githubusercontent.com/flowersteam/sensorimotor-lenia-search/master/expe/calc_categories.py) y [Leniabreeder](https://raw.githubusercontent.com/maxencefaldor/Leniabreeder/main/lenia/lenia.py), normalizados por R² y T:
- **Muerto:** todas las celdas < 0.1 (Leniabreeder `is_empty`).
- **Explotó:** contacto con borde > 0.1, o masa > ~10% de la grilla (Flowers: 6400/65536), o ratio de masa entre el último cuarto y el segundo cuarto de la ventana fuera de (0.5, 3.0).
- **Estable:** ratio de masa dentro de (0.5, 3.0) durante ≥ 2 ventanas.
- **Móvil:** desplazamiento del centroide > umbral escalado a R (Flowers usa 100 celdas en 1000 pasos a 256×256).
- **Oscilante:** pico dominante en la PSD de la serie de masa (Chan usa Welch, nfft=512).
- **Rotando:** |velocidad angular| sostenida con velocidad lineal baja.
- **Dividiéndose:** fracción de masa dentro de la ventana centrada en el centroide cae bajo 0.9 (`is_spread`, Leniabreeder), sustituto barato de componentes conexas.

Tests unitarios en Vitest: cada especie de la tabla, simulada en CPU a 64×64 por 500 pasos, debe caer en su clase; sopa uniforme debe dar Esencia = 0; ruido blanco debe clasificar como "explotó" o "muerto" en < 200 pasos.

## Distribución y lanzamiento: galaxy.click e itch.io primero, Play después

Orden: (1) galaxy.click, específico del género, publicación en "30 segundos" según [su about](https://galaxy.click/about); (2) itch.io, HTML5 hasta [500 MB](https://itch.io/docs/creators/html5), donaciones y ventas con [10% por defecto ajustable](https://itch.io/docs/creators/payments); su algoritmo fue el **75% del tráfico** del incremental Gamblers Table, que pasó de 0 a 10,000 wishlists en 18 días sin anuncios, con ~10% desde r/incremental_games ([devlog](https://greenpixels.itch.io/gamblers-table/devlog/945763/wishlists-0-to-10000-in-just-three-weeks-)); (3) Microsoft Store, gratis y acepta PWA; (4) CrazyGames, no exclusivo, pago mínimo [100 EUR](https://docs.crazygames.com/faq/), ≤ 50 MB de descarga inicial; (5) Google Play. Evita Poki: exige [exclusividad web](https://developers.poki.com/guide/working-with-poki). Kongregate [no acepta juegos desde 2020](https://www.pcgamer.com/browser-game-portal-kongregate-is-no-longer-accepting-new-games/).

**Google Play paso a paso.** Cuota [25 USD, sin tarjetas prepago, puede pedir ID y tarjeta a tu nombre](https://support.google.com/googleplay/android-developer/answer/6112435). Cuentas personales nuevas: [12 testers opt-in continuos durante 14 días](https://support.google.com/googleplay/android-developer/answer/14151465) antes de pedir producción; el reloj arranca con el tester 12. Reclútalos gratis en tu Discord y r/incremental_games; el servicio pago ([~19.99 USD por 12](https://primetestlab.com/blog/google-play-changed-20-to-12-testers)) es el plan B. Colombia tiene registro de desarrollador y de comerciante ([Play](https://support.google.com/googleplay/android-developer/answer/9306917)). Play cierra cuentas inactivas sin devolver los 25 USD ([política](https://support.google.com/googleplay/android-developer/answer/11605267)) y la verificación global de desarrolladores Android llega en 2027 ([Android](https://developer.android.com/developer-verification)). TWA: Bubblewrap es gratis y exige [`/.well-known/assetlinks.json`](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start) en tu dominio, por eso el dominio propio es obligatorio en este escenario.

**Marketing con 0–25 USD.** Post en r/incremental_games con GIF del momento en que emerge una criatura; devlogs en itch.io; Hacker News ha llevado demos de Lenia a portada repetidamente (154, 118, 89 puntos según [HN Algolia](https://hn.algolia.com/api/v1/search?query=Lenia&tags=story&hitsPerPage=15)); Discord ISAL (~650 miembros, [GuildSeek](https://guildseek.com/server/1123220946686316654)) y un mensaje a Bert Chan (@BertChakovsky) con el crédito visible. Press kit con [presskit.gg](https://presskit.gg/field-guides/indie-game-marketing-zero-budget).

**Dinero desde Colombia.** Sin tratado fiscal con EE.UU. ([IRS](https://www.irs.gov/businesses/international-businesses/united-states-income-tax-treaties-a-to-z)), itch.io y Steam retienen [30%](https://itch.io/docs/creators/payments) de ingresos de origen US. PayPal Colombia solo permite pagos transfronterizos ([PayPal](https://developer.paypal.com/docs/payouts/standard/reference/country-feature/)); el retiro vía Nequi tenía 5% de comisión y tope 700 USD/mes según una [fuente de 2020](https://ourcodeworld.com/articles/read/1355/how-to-withdraw-money-from-paypal-to-a-bank-account-in-colombia-using-nequi) que debes reverificar. Payoneer es la alternativa que ofrece itch.io.

## Riesgos y vacíos de información

- **La investigación de la comunidad de incrementales no se completó.** Reddit bloqueó las búsquedas, así que convenciones como progreso offline, exportar/importar guardado como texto, librerías de números grandes (break_eternity.js) y ritmo de prestigio se basan en conocimiento general, no en fuentes. Validar con una investigación corta de seguimiento o con los primeros 20 jugadores reales.
- **No hay fps medidos en teléfonos para ninguna implementación de Lenia.** El objetivo de 30 fps es un modelo de costo; Fase 0 lo mide en tu teléfono antes de seguir.
- **Precios de Cloudflare Registrar vienen de agregadores.** Verifica en el dashboard antes de comprar.
- **Las horas semanales de Opus/Sonnet por plan son aproximadas** (el artículo de soporte nombra modelos antiguos). Si el ciclo nocturno agota el límite semanal, baja a 3 noches por semana.
- **No se verificó si registradores u hosting rechazan tarjetas colombianas**, ni si aplican IVA.
- **La GLSL de Chan en chakazul.github.io no tiene licencia explícita**; se usa como referencia y se reimplementa. El catálogo y el código Python sí son MIT.
- **Riesgo de diseño:** medir Esencia por gradiente puede premiar ruido de alta frecuencia justo antes de una explosión. El detector debe exigir "estable" antes de pagar.

## Qué necesito del usuario para arrancar

1. **Nombre del juego** (dominio, repo y manifest). Verifico disponibilidad `.com` y `.dev` antes de comprar.
2. **Owner de GitHub** donde crear el repo público.
3. **Escenario de presupuesto:** solo web (~10.5 USD) o web + Android (~35.5–55.5 USD sin activos opcionales).
4. **Activar el ciclo nocturno** desde el día 1 o después de Fase 0 (recomiendo después, con CI y `CLAUDE.md` listos).
5. **Confirmar que no habrá anuncios** en la build inicial (condición de Vercel Hobby y galaxy.click).
6. **Modelo de tu teléfono Android**, para fijar el piso real de fps en Fase 0.

## Conclusión

El cuello de botella de este proyecto no es el dinero sino el límite semanal de tu suscripción: con hosting, CI, analytics y distribución en 0 USD, el único recurso que de verdad se agota es el tiempo de modelo nocturno, y la asignación de modelos del equipo (Opus para pensar, Sonnet para construir, Haiku para repetir) es en el fondo una política de gasto de ese recurso. La segunda conclusión es que Lenia trae su propio sistema de pruebas: el catálogo de 548 especies con parámetros exactos y los umbrales publicados por los laboratorios que lo exploran convierten el detector de especies en código verificable con tests unitarios, no en heurística a ojo. Eso hace que un juego sobre vida artificial sea, paradójicamente, uno de los más fáciles de dejar en manos de agentes que se corrigen solos.
