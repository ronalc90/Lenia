# Monetización de Bioluma: solo cosméticos, juego limpio

> Estado: **implementado y apagado**. `STORE_ENABLED = false` en `src/store/flags.ts`. Nada cobra dinero hasta que
> el dueño cree las cuentas, configure productos y webhook, despliegue el API en Cloudflare y encienda la bandera.
> Este documento reemplaza la parte "sin compras ni cosméticos pagos" de ADR-016 (ver el ADR propuesto al final).

El dueño pidió: *"artículos pagos y una suscripción que no afecten el juego, como skins, cosas que no den ventaja
real"*. Eso es exactamente lo que hay: paletas para la materia, placas, halos, rastros de siembra, destellos,
ambientes musicales, insignias, marcos y color de nombre en el ranking. Nada más.

---

## 1. Principios (no negociables)

1. **Cero pay-to-win.** Ningún artículo da Esencia, velocidad, Muestras, Genoma, semillas, saltos de tiempo,
   ranuras extra, probabilidades ni nada que el detector o la economía lean. Quien no paga juega exactamente el
   mismo juego. Lo hacen cumplir los tests:
   - `src/store/catalog.test.ts` recorre los datos de cada artículo y falla si aparece una clave con olor a
     juego (`essence`, `speed`, `seed`, `mult`, `bonus`, `time`, `reward`…) o una descripción con "+N %".
   - Los cosméticos **no cambian la semántica del estado**: el anillo punteado de "formándose", la onda roja de
     "sin Esencia", el tamaño/área de toque/duración del Destello y su indicador dorado fuera de pantalla son
     iguales con cualquier skin. Las skins del Destello mantienen el núcleo con luminancia 0.6–1 (test), así
     ninguna lo hace más fácil ni más difícil de ver.
   - Las paletas pasan un test de contraste sobre **todas** las placas (borde ≥ 2.75:1, cuerpo ≥ 7:1, núcleo
     ≥ 15:1, luminancia monótona): ninguna paleta esconde criaturas.
   - Los ambientes musicales cambian tempo, modo y timbres; **los sonidos de aviso no cambian** nunca.
2. **Sin cajas de botín ni azar pagado.** Se ve exactamente lo que se compra, con vista previa en vivo.
3. **Sin patrones oscuros.** Sin contadores regresivos, sin "solo hoy", sin monedas intermedias (se paga en
   dinero real, con precio visible), sin notificaciones de ventas, sin botón de compra en el HUD ni en toasts.
   Comprar siempre son dos pasos deliberados (tarjeta → detalle → comprar) más la confirmación del proveedor.
   El plan predeterminado del Mecenas es el **mensual** (el compromiso más pequeño); el ahorro del anual se
   muestra con su porcentaje real (30 %).
4. **Precios claros.** Precio de referencia en USD en cada tarjeta; la tienda del proveedor muestra el precio final
   en la moneda local con impuestos. Los paquetes muestran honestamente "Por separado: US$ X".
5. **Restaurar compras** siempre visible al final de la tienda. Lo comprado vive en el servidor, no en el aparato.
6. **Lo gratis también existe.** 10 cosméticos se desbloquean con logros (2 paletas, placa, halo, rastro,
   destello, ambiente, 2 insignias, marco). El **Vestidor** funciona aunque la tienda esté apagada, incluso en
   galaxy.click.
7. **Menores y COPPA.** El juego no está dirigido a menores de 13. La tienda no recoge datos personales: el
   servidor solo guarda un hash del id de jugador (pseudónimo); correo y pago quedan en el proveedor. En Google
   Play declarar público objetivo 13+ (fuera de Familias). Sin anuncios personalizados (no hay anuncios).
8. **Mecenas cancela cuando quiera** y conserva las paletas mensuales que ya reclamó.

## 2. Catálogo y precios

Precios de referencia (`PRICE_USD` en `src/store/catalog.ts`). Nada en la web cuesta menos de **1.99 USD**: con la
tarifa fija de Lemon Squeezy (0.50 USD) un artículo de 0.99 perdería ~55 % en comisiones.

| Nivel | USD | Uso |
|---|---|---|
| tier1 | 1.99 | Paleta común, halo/rastro sencillo, insignia, marco, placa ámbar |
| tier2 | 2.99 | Paletas raras, placas, efectos, ambientes |
| tier3 | 3.99 | Paletas épicas (Abisal, Pan de oro), Corona boreal |
| tier4 | 4.99 | Paleta legendaria (Prisma) |
| pack | 5.99 | Pack Océano (5 artículos, por separado 14.95) |
| bundle | 9.99 | Paquete fundador (7 artículos, 2 exclusivos; por separado 16.95) |
| subMonth | 2.99 / mes | Mecenas mensual |
| subYear | 24.99 / año | Mecenas anual (−30 %) |

**Paletas de materia** (la vida misma; también bestiario y retratos): Bioluma (gratis, la actual), Aurora,
Arrecife de coral, Brasa, Abisal, Sakura, Tóxico, Pan de oro, Prisma; gratis por logro: **Monocromo de
laboratorio** (Taxónoma, 10 especies) y **Glaciar** (Cazadora de luz, 10 destellos). Cada paleta trae su LUT y
los acentos del shader (contorno, brillo, sombra) para que una criatura "Brasa" no tenga bordes cian.

**Placas**: Laboratorio nocturno (gratis), Agar ámbar, Fosa marina, Obsidiana, Plano técnico (cuadrícula),
Musgo (logro Bullicio), Latón del fundador (solo paquete).

**Efectos**: halos (Clásico, Doble anillo por logro Etóloga, Satélite, Corola, Panal, Corona boreal); rastros de
siembra (Gota, Esporas por logro 1 000 siembras, Polvo de estrellas, Burbujas, Pétalos, Chispas); Destello
(Clásico, Polilla lunar por logro 50 destellos, Luciérnaga, Cometa, Copo).

**Música**: Laboratorio nocturno (gratis, Re dórico 76 BPM), Paciencia (logro: una hora), Corriente abisal,
Invernadero, Caja de música, Bitácora lo-fi. Son presets de datos (`AmbiencePreset`) para el motor de audio.

**Perfil** (lo que ven otros en el ranking; **lo decide el servidor**, no el cliente): insignias (Naturalista y
Tabula rasa por logro, Orbium, Remolino, Cometa, Fundador, Mecenas), marcos (Placa de Petri por logro, Colonia,
Enredadera, Dorado, Mecenas), color de nombre (solo Mecenas: oro, aurora, coral; contraste ≥ 4.5:1 testeado).

### Mecenas del laboratorio (suscripción)

Ventajas, todas cosméticas:
- **Una paleta exclusiva cada mes** (Nebulosa nov-2026, Solsticio dic-2026, Escarcha, Orquídea, Brote, Medusa…;
  la lista rota sola si no se agregan nuevas). Se reclama estando activo ese mes y **queda para siempre**.
- Insignia y marco Mecenas en el ranking, mientras esté activa.
- Color de nombre (oro, aurora o coral), mientras esté activa.
- Una entrada de agradecimiento en la bitácora (una sola vez, `SUPPORTER_JOURNAL`).
- Acceso anticipado: un cosmético nuevo con `earlyAccessUntil` solo lo pueden comprar Mecenas hasta esa fecha.

Al expirar, lo equipado que dependía de la suscripción vuelve al estándar automáticamente y regresa si renueva.

## 3. Proveedores por plataforma

| Plataforma | Proveedor | Comisión aprox. | Neto de US$ 2.99 | Notas |
|---|---|---|---|---|
| Web propia (Cloudflare) | **Lemon Squeezy** (Merchant of Record) | 5 % + 0.50 USD (+ recargos internacionales/PayPal según su tabla) | ≈ 2.34 | Ellos son el vendedor legal: cobran y remiten IVA/VAT/sales tax del comprador |
| Android (TWA o Capacitor) | **Google Play Billing** | 15 % (programa 15 % hasta 1 M USD/año; suscripciones 15 %) | ≈ 2.54 | Obligatorio para bienes digitales en apps de Play. TWA: Digital Goods API |
| iOS (Capacitor) | **App Store IAP** | 15 % (Small Business Program) | ≈ 2.54 | Fuera del presupuesto (99 USD/año). Stub listo |
| Steam (Electron) | **Steam** (DLC) | 30 % | ≈ 2.09 | Obligatorio dentro de la build de Steam. Sin suscripción en Steam |
| galaxy.click, itch.io, CrazyGames | — | — | — | **Tienda oculta** (reglas del portal). El Vestidor sigue disponible |

Cifras orientativas: verifica las tablas vigentes antes de lanzar. Alternativa MoR a Lemon Squeezy: Paddle
(tarifa similar). Código: `src/store/providers/{lemonsqueezy,googleplay,apple,steam,devmock}.ts`.

**Dev mock**: compras falsas instantáneas, solo en `vite dev` o con `?store=mock`, con banner amarillo
"MODO PRUEBA". Nunca llega al ranking (el servidor no lo conoce).

## 4. Reglas de plataforma

- **Vercel Hobby prohíbe cobrar** (uso comercial, incluido procesar pagos; las donaciones sí se permiten). Por eso:
  la **producción con tienda vive en Cloudflare Pages** (dominio propio) y el **API de la tienda corre en
  Cloudflare Pages Functions con KV**. En previews `*.vercel.app` la tienda solo funciona en mock o en modo test
  del proveedor (`flags.ts`: host `preview` → `payments: false`). El ranking puede seguir donde esté.
- **galaxy.click** prohíbe anuncios; no hay regla clara sobre compras, así que la tienda queda **oculta** allí por
  defecto (detección por iframe/referrer y por `VITE_BUILD_TARGET=galaxy`). Revisar https://galaxy.click/rules
  antes de cambiarlo, con ADR.
- **itch.io / CrazyGames**: oculta hasta verificar sus reglas de pagos dentro del juego.
- **Google Play**: bienes digitales → Play Billing sí o sí (no enlazar a la web desde la app de Play). Los
  tokens de compra **deben reconocerse (acknowledge) en 3 días** desde el servidor o Google reembolsa solo.
- **Apple**: guideline 3.1.1, IAP para bienes digitales.
- **Steam**: pagos con Steam dentro de la build de Steam; cosméticos como DLC.

## 5. Impuestos y Colombia (no es asesoría legal: confirmar con un contador)

- Con un **Merchant of Record** (Lemon Squeezy o Paddle) el vendedor ante el comprador es el MoR: calcula, cobra y
  remite el IVA/VAT/GST/sales tax de cada país. Tú no te registras para impuestos extranjeros.
- Lo que recibes es un **pago (payout) del MoR**: en Colombia se declara como ingreso (renta). Pregunta al
  contador por el tratamiento en IVA (suele tratarse como exportación de servicios) y por facturación electrónica
  DIAN si eres responsable de IVA.
- **Verificar antes de abrir la cuenta**: que Lemon Squeezy pague a Colombia (banco o PayPal) y con qué costo. El
  plan de 100 USD ya advierte que PayPal Colombia es limitado y que el retiro tenía comisiones; Payoneer es la
  alternativa habitual. Si LS no paga bien a Colombia, usar Paddle.
- Formularios de EE. UU.: el MoR pedirá **W-8BEN** (persona no estadounidense). Colombia no tiene tratado con EE. UU.;
  pregunta si aplica retención sobre tus pagos.
- Google Play: Colombia tiene cuenta de comerciante. Google actúa como MoR en muchos países y retiene IVA allí.
- Estatuto del Consumidor (Ley 1480 de 2011) para compradores en Colombia: información clara, precio total con
  impuestos (lo muestra el checkout), política de reembolso visible. Recomendación: **reembolso sin preguntas en
  14 días** (lo gestiona el MoR; el webhook `order_refunded` retira el artículo).

## 6. Lo que el dueño debe configurar

1. **Lemon Squeezy**: crear la tienda (`bioluma`), verificar identidad y método de pago a Colombia.
2. Crear un **producto por artículo vendible** (`isForSale`: cosméticos con `unlock: purchase`, packs y las dos
   suscripciones como variantes de un producto de suscripción). Anotar cada **variant id** (número).
3. Copiar el **checkout link** (UUID) de cada variante en la config del cliente (`providers.lemonsqueezy.checkouts`).
   Los de modo test y los de producción son distintos.
4. Crear el **webhook**: URL `https://<dominio>/api/store-webhook`, eventos `order_created`, `order_refunded`,
   `subscription_created`, `subscription_updated`, `subscription_cancelled`, `subscription_resumed`,
   `subscription_expired`, `subscription_paused`, `subscription_unpaused`, `subscription_payment_success`,
   `subscription_payment_recovered`. Guardar el **signing secret**.
5. **Cloudflare**: proyecto Pages con el dominio; un namespace **KV** enlazado como `STORE_KV`; funciones:
   ```ts
   // functions/api/store-webhook.ts
   export { onRequestPost } from '../../api/store-webhook';
   // functions/api/entitlements.ts
   export { onRequestGet, onRequestOptions } from '../../api/entitlements';
   ```
6. Variables de entorno (Cloudflare → Settings → Variables; secretos como "secret"):

   | Variable | Dónde | Ejemplo / nota |
   |---|---|---|
   | `LEMONSQUEEZY_WEBHOOK_SECRET` | servidor (secreto) | el signing secret del webhook. Sin él el webhook responde 503 |
   | `LEMONSQUEEZY_VARIANTS` | servidor | `{"512345":"palette.aurora","512399":"sub.mecenas.month",…}` |
   | `LEMONSQUEEZY_ALLOW_TEST` | servidor | `1` solo en staging; **nunca** en producción |
   | `STORE_KV` | binding KV | entitlements; sin él se usa memoria (solo dev/test) |
   | `STORE_ALLOWED_ORIGINS` | servidor | orígenes extra (p. ej. `https://localhost` de Capacitor) |
   | `VITE_STORE_ENABLED` | build | `1` enciende pagos reales en hosts permitidos |
   | `VITE_BUILD_TARGET` | build | `galaxy` / `itch` / `crazygames` para builds de portal (oculta la tienda) |

7. **Páginas legales**: Términos, Privacidad y Reembolsos (las URLs se pasan a `openStore({ legal })`).
8. Probar todo en **modo test** de Lemon Squeezy (tarjeta de prueba), incluido reembolso y cancelación.
9. **Google Play** (si aplica): productos in-app con id = id del catálogo (`palette.aurora`), una suscripción
   `sub.mecenas` con planes base `month` y `year`, testers de licencia, y un endpoint de verificación de tokens
   (Play Developer API + acknowledge) que aún no existe (`POST /api/store-receipt`, pendiente).
10. Encender: `VITE_STORE_ENABLED=1` en la build de producción de Cloudflare (o `STORE_ENABLED = true` con ADR).

## 7. Arquitectura y archivos

```
src/store/catalog.ts        catálogo (datos puros, también lo usa el servidor)
src/store/entitlements.ts   caché cliente: propiedad, suscripción, equipado, persistencia, evento `changed`
src/store/flags.ts          STORE_ENABLED + reglas por host (galaxy oculto, previews en test…)
src/store/store.ts          controlador: reglas de compra, un checkout a la vez, restaurar, gestionar
src/store/providers/        lemonsqueezy · googleplay · steam · apple · devmock
src/store/apply.ts          paletteLUT, renderStyleFor, bindCosmetics (enganche al renderer/overlay/audio)
src/store/draw.ts           dibujo Canvas de halo, rastro y Destello (preview = juego)
src/store/protocol.ts       formato de la petición firmada y del snapshot del servidor
src/store/api.ts            GET /api/entitlements firmado con la clave del jugador
api/store-webhook.ts        webhook Lemon Squeezy (HMAC-SHA256 del cuerpo crudo)
api/entitlements.ts         estado autoritativo del jugador (firma ECDSA P-256)
server/store/               verify (HMAC/ECDSA) · kv · entitlements (registros, reembolsos, expiración)
src/ui/store/               modal Tienda, Vestidor, vistas previas en vivo (CPU Lenia real), estilos
store-dev.html              página de desarrollo con el mock
```

**Confianza.** El servidor es la autoridad: el webhook verificado concede; el cliente solo cachea (localStorage)
y lo reemplaza con el snapshot firmado del servidor (los reembolsos desaparecen). Editar localStorage solo
cambia lo que ves tú: insignia, marco y color de nombre del ranking salen del registro del servidor
(`publicCosmetics`). La lectura exige la firma ECDSA del jugador con la misma clave del ranking (o la primera
clave vista por la tienda si nunca envió puntaje).

## 8. Integración (para el integrador)

1. **Renderer** (`src/sim/webgl.ts`): añadir `setMatterLUT(lut: Uint8Array)` (256×1 RGBA8 → `texSubImage2D` sobre
   `this.lut`, guardar copia para restaurar contexto) y, recomendado, `setRenderStyle(style: RenderStyle)`:
   convertir en uniforms las constantes `BG, AGAR_IN, AGAR_OUT, RIM, CYAN, GLOW_CORE, GLOW_WIDE`, el tinte de
   sombra `vec3(0.42,0.70,1.0)` y el factor de borde `0.22` (detalle en la cabecera de `src/store/apply.ts`).
2. **Overlay** (`src/ui/overlay.ts`): usar `drawHalo`, `trailBurst/drawTrailParticle/drawTrailRipple` y
   `drawSpark/drawSparkTrail` de `src/store/draw.ts` con los datos equipados; color de motas = `dish.motes`. Solo
   el halo estable, la onda de siembra exitosa y el Destello son personalizables.
3. **Retratos** (`src/ui/portrait.ts`): colorear con `paletteColor(stops, v)` e incluir el id de paleta en la clave
   de caché.
4. **Audio**: `setAmbience?(preset: AmbiencePreset)` en `src/audio/audio.ts`; mapear bpm/modo/tónica/timbres/reverb.
   Pasar `previewMusic` a `openStore` para audicionar con el motor real.
5. **Cableado** en `src/main.ts`:
   ```ts
   const flags = storeFlagsFromEnv(detectPlatform());
   const entitlements = new Entitlements();
   const fetchSnapshot = identity ? createSnapshotFetcher(identity) : undefined; // identity = clave del ranking (src/net)
   const store = new StoreController(flags, entitlements,
     createProviders(flags, { entitlements, fetchSnapshot, openExternal: platform.openExternal }, config));
   bindCosmetics(entitlements, { sim, overlay, portraits, audio });
   entitlements.syncAchievements(view.achievements.filter((a) => a.done).map((a) => a.id)); // y en cada logro
   entitlements.on('supporterWelcome', () => game.addJournal(SUPPORTER_JOURNAL));
   setInterval(() => entitlements.tick(), 60_000);
   if (fetchSnapshot) void fetchSnapshot().then((s) => s && entitlements.applyServerSnapshot(s));
   ```
   Botones: "Vestidor" siempre (Ajustes); "Tienda" solo si `store.visible`, en Ajustes/Créditos, **nunca en el HUD**.
   La UI se carga perezosamente: `import('./ui/store')`.
6. **Ranking**: el servidor del ranking añade a cada fila `publicCosmetics(registro, elegidos, ahora)`.
7. **Identidad**: `PlayerIdentity` (playerId, publicKey, sign) la implementa `src/net` con la clave P-256 existente.

Pruebas: `npx vitest run src/store tests/unit/store-server.test.ts`; capturas: `node tests/e2e/store-shots.mjs`.

## 9. ADR propuesto (pegar en DECISIONS.md)

```markdown
## ADR-021: Cosmetic-only store and supporter subscription (supersedes the "no purchases" part of ADR-016)

- **Status:** Proposed (2026-10-04). Implemented behind `STORE_ENABLED = false`.
- **Context:** The owner asked for paid items and a subscription that give no gameplay advantage. ADR-016 allowed
  only donations because Vercel Hobby forbids charging and galaxy.click forbids ads. Payments need a host that
  allows commercial use and a seller that handles foreign taxes for a Colombian developer.
- **Decision:**
  - Sell **cosmetics only** (matter palettes, dish themes, halo/seed-trail/spark skins, music ambiences, ranking
    badges/frames/name colours), packs, and a **"Mecenas del laboratorio"** subscription (monthly 2.99 / yearly
    24.99 USD) whose perks are all cosmetic. No currency, no loot boxes, no timers, no store button in the HUD.
  - Fair play is enforced by tests: no gameplay keys in item data, spark skins keep brightness and geometry,
    palettes meet contrast on every dish, state indicators are never skinned, SFX never change.
  - Free cosmetics unlock through achievements; the wardrobe works everywhere, also with the store off.
  - Web payments through **Lemon Squeezy** (Merchant of Record); Play Billing on Android, Steam DLC on Steam,
    StoreKit on iOS later. Server-side entitlements (webhook HMAC + player ECDSA signature) are authoritative.
  - The paying production site and the store API run on **Cloudflare Pages + Functions + KV**; Vercel previews
    only run the mock or provider test mode. The store is hidden on galaxy.click, itch.io and CrazyGames.
  - Payments stay off (`STORE_ENABLED = false`) until accounts, products, webhook secret, KV and legal pages exist.
- **Consequences:** Adds no npm dependency (lemon.js loads lazily from Lemon Squeezy only when a checkout opens).
  New env vars: LEMONSQUEEZY_WEBHOOK_SECRET, LEMONSQUEEZY_VARIANTS, LEMONSQUEEZY_ALLOW_TEST, STORE_KV,
  STORE_ALLOWED_ORIGINS, VITE_STORE_ENABLED, VITE_BUILD_TARGET. Ranking cosmetics come from the server record.
  Changing which hosts may take payments needs a new ADR. See docs/MONETIZACION.md.
```

## 10. Pendientes y riesgos

- Endpoint de recibos nativos (`/api/store-receipt`: Play Developer API + acknowledge, JWS de Apple, ownership de
  Steam) no implementado; los proveedores ya llaman al gancho `Entitlements.setVerifier`.
- KV de Cloudflare es eventualmente consistente (último en escribir gana); con un jugador rara vez hay carreras.
  Si importa, migrar a D1 o Durable Objects con la misma interfaz `KV`.
- Reglas de galaxy.click/itch.io sobre compras: sin verificar; la tienda sigue oculta allí.
- Verificar pagos de Lemon Squeezy a Colombia **antes** de crear productos.
