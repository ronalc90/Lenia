# Plataformas de Bioluma: cómo se publica en cada dispositivo

Guía de despliegue para web, galaxy.click, itch.io, CrazyGames, Microsoft Store, PC (Windows, macOS, Linux), Steam,
Android e iOS. Para cada plataforma indica qué ya está listo en el repo, los pasos exactos, el costo y lo que solo puede
hacer el dueño (cuentas, pagos, dominio, llaves de firma). Los costos y el orden siguen
[`source/PLAN-100-USD.md`](source/PLAN-100-USD.md). Fecha de revisión de requisitos de tiendas: **2026-10-04**.

## Resumen

| Plataforma | Estado en el repo | Costo | Lo que falta del dueño |
|---|---|---|---|
| Web (Vercel) | Listo: `npm run build` → `dist/` | 0 (dominio .com ~10.46 USD/año más adelante) | Conectar el repo a Vercel; comprar el dominio cuando toque |
| galaxy.click | Listo: zip de portal y gancho de guardado en la nube | 0 | Cuenta y subida |
| itch.io (web y escritorio) | Listo: zip, script de `butler`, builds de escritorio | 0 (itch cobra 10 % por defecto, ajustable) | Cuenta, página, `BUTLER_API_KEY` si quiere subir desde CI |
| CrazyGames | Zip listo; el SDK no está integrado (choca con ADR-016) | 0 | Decidir si acepta anuncios de la plataforma |
| Microsoft Store | Listo para PWABuilder (la PWA ya cumple) | 0 (cuenta individual gratis desde 2025-09-10) | Cuenta de Partner Center; mejor después del dominio |
| PC: Windows, macOS, Linux | Listo: Electron en `platforms/desktop`; AppImage compilado y probado aquí | 0 sin firma de código | Opcional: certificados de firma |
| Steam | Integración lista y probada sin Steam; plantillas SteamPipe; 84 logros planificados con iconos | 100 USD por app | Pagar, App ID, depots, página de tienda, arte |
| Android | Listo: Capacitor (APK de debug compilado aquí) y plantillas TWA | 25 USD una vez (+0 a 20 USD si se pagan testers) | Cuenta de Play, 12 testers durante 14 días, llave de subida |
| iOS | Proyecto Capacitor generado; falta compilar en un Mac | 99 USD/año + un Mac | Mac, Apple Developer, firma |
| iOS gratis (PWA) | Funciona hoy con "Añadir a pantalla de inicio" | 0 | Nada (faltan 5 metaetiquetas, ver Integración) |

### Orden recomendado

1. **Web** en Vercel (preview y producción mientras no hay dominio).
2. **galaxy.click e itch.io** (web y, en itch, también las descargas de escritorio). Gratis; la primera audiencia de
   incrementales está ahí.
3. **Microsoft Store** con PWABuilder: gratis, pero conviene publicarla con el dominio definitivo, porque el paquete
   apunta a la URL.
4. **Android** (Google Play, 25 USD). Capacitor no necesita dominio; TWA sí.
5. **Steam** (100 USD), solo si se espera superar 1 000 USD brutos, que es cuando Valve devuelve la cuota. Demo
   lista antes del 10 de enero de 2027 para el Next Fest de febrero.
6. **iOS** (99 USD al año y un Mac). Mientras tanto, la PWA en iPhone es gratis.

Pasos 1 a 3: 0 USD. Con Android: 25 a 45 USD. Steam e iOS no caben en el presupuesto de 100 USD (lo mismo dice el plan)
y quedan para cuando el juego genere ingresos.

## Estructura en el repo

Cada envoltorio tiene su propia carpeta y su propio `package.json`. La app principal sigue sin dependencias de
ejecución y `npm ci` en la raíz no instala nada de esto.

| Ruta | Contenido |
|---|---|
| `src/platform/platform.ts` | Capa de plataforma (sin dependencias): detecta el entorno; botón atrás, barras del sistema, háptica, logros y stats de Steam, guardado en la nube (galaxy.click y Steam), aviso de instalación de la PWA |
| `platforms/shared/platform.selftest.ts` | 28 comprobaciones de `platform.ts` contra entornos simulados (`node --experimental-strip-types …`) |
| `platforms/shared/make-icons.mjs` | Genera los iconos de escritorio (`.png`, `.ico`, `.icns`) y los de móvil a partir de `public/icon.svg` |
| `platforms/desktop/` | Electron: `main.cjs`, `preload.cjs`, `steam.cjs`, configuraciones de electron-builder (normal y Steam), `build/` con iconos |
| `platforms/steam/` | `achievements.json` / `.csv` (logros y stats), `achievement-icons/` (168 JPG), plantillas SteamPipe, `scripts/upload.sh` |
| `platforms/mobile/` | Capacitor 8 (`capacitor.config.ts`, `assets/`, `scripts/patch-native.mjs`, `scripts/check-bridge.mjs`), `twa/` (Bubblewrap y assetlinks) |
| `platforms/portals/` | `zip-web.sh` (zip para portales) e `itch-push.sh` (butler) |
| `.github/workflows/release.yml` | Compila todo en cada tag `v*` o a mano |

## Integración en `src/` (para el integrador)

Este trabajo no modifica `src/`. Hay que conectar esto:

1. **Mover `src/platform/platform.ts` a `src/platform/platform.ts`**, para que lo revise el `tsconfig` de la raíz.
   La autoprueba también se puede pasar a vitest. En `src/main.ts`:
   ```ts
   const platform = initPlatform({ onBack: () => ui.handleBack(), onPause: save });
   bus.on('achievement', (e) => platform.unlockAchievement(e.id));
   platform.syncAchievements(game.view().achievements.filter((a) => a.done).map((a) => a.id));
   // en cada autoguardado:
   platform.reportStats({ STAT_SPECIES: …, STAT_ERA: v.era, STAT_GOLDEN: …, … }); // lista en platform.ts STEAM_STATS
   // en registerServiceWorker():
   if (!platform.shouldRegisterServiceWorker()) return;
   ```
   - `ui.handleBack()` todavía no existe. Debe ejecutar la misma rama que la tecla Escape en `ui.ts` (`bindKeys`) y
     devolver `true` si cerró algo (modal, ficha o modo). Sin él, el botón atrás manda un Escape y una segunda pulsación
     antes de 2 s minimiza la app.
   - Historia y secretos: `platform.unlockAchievement(endingAchievementId(id))` al mostrar un final, y
     `platform.unlockAchievement(secretAchievementId(id))` al revelar un secreto.
   - El botón "Instalar app" de Ajustes solo se muestra si `platform.installHint()` no es `null`: `'prompt'` llama a
     `platform.promptInstall()` y `'ios'` muestra "Compartir → Añadir a pantalla de inicio".
   - Opcional: `platform.haptic('light')` al sembrar y `'success'` con especie nueva (respetando un ajuste),
     `platform.setImmersive(true)` para ocultar las barras en móvil, y `platform.toggleFullscreen()` para el botón de
     pantalla completa.
2. **Faltan metaetiquetas en `index.html`.** Ya están `viewport-fit=cover`, `theme-color`, `apple-touch-icon` de 180
   px y el manifest. Faltan:
   ```html
   <meta name="mobile-web-app-capable" content="yes" />
   <meta name="apple-mobile-web-app-capable" content="yes" />
   <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
   <meta name="apple-mobile-web-app-title" content="Bioluma" />
   <meta name="format-detection" content="telephone=no" />  <!-- iOS convierte números largos en enlaces tel: -->
   <meta name="color-scheme" content="dark" />
   ```
3. **Manifest** (`public/manifest.webmanifest`). Conviene añadir `screenshots`: al menos uno `narrow` de 1080×1920 y uno
   `wide` de 1920×1080. Activan el diálogo de instalación enriquecido de Chrome y PWABuilder los usa para la Microsoft
   Store.
4. **Ranking.** En `createLeaderboardClient({ baseUrl })`, `baseUrl` tiene que ser una URL https **absoluta** en
   cualquier sitio que no sea el dominio web principal: Electron (`app://bioluma`), Capacitor (`https://localhost` en
   Android, `capacitor://localhost` en iOS) e iframes de itch.io o galaxy.click. El servidor debe permitir por CORS esos
   orígenes y `*.itch.zone`. La CSP de Electron ya permite `connect-src https:`.
5. **Fuentes.** Inter y JetBrains Mono se cargan de Google Fonts en tiempo de ejecución. Sin conexión (Electron,
   Capacitor) se usan las fuentes del sistema. Recomendado: servirlas desde `public/fonts/` (la licencia OFL lo permite).
   Así funcionan offline, no se envía la IP a Google y el formulario de Play queda más simple.
6. **Enlaces de donación.** Hay que ocultarlos en Play, App Store y Steam, porque sus políticas de pagos prohíben
   enviar a cobros externos. Mostrarlos solo si `platform.kind` es `'web'` o `'pwa'`, o si `platform.portal` es
   itch o galaxy.
7. **Guardado en la nube.** `platform.cloudSave` existe en galaxy.click y en Electron/Steam. Uso previsto: en cada
   autoguardado, `cloudSave.save(game.exportString(), etiqueta)`. Al arrancar, si el guardado remoto es más nuevo, se
   ofrece cargarlo. galaxy.click admite 256 000 bytes por ranura.
8. **Métricas nuevas** para los logros planificados: `era` (`extinctions + 1`), `catalogSpecies` y la hora de inicio
   de la era (para `speedEra`). Ver la tabla de logros.

---

## 1. Web (Vercel ahora, Cloudflare con dominio)

**Listo.** `npm run build` genera `dist/` con base relativa `./`. El service worker solo se registra en https.

1. En Vercel: *Add New Project*, importar el repo, *Framework*: Vite, *Build command*: `npm run build`, *Output*:
   `dist`, Node 22. Cada PR genera un preview.
2. Vercel Hobby es gratis, pero prohíbe anuncios y cobros. Las donaciones sí están permitidas (ADR-016).
3. **Dominio.** El plan es un .com en Cloudflare Registrar (~10.46 USD/año). Cómpralo **antes** de publicar la TWA o la
   Microsoft Store, que quedan atadas a la URL. Cambiar de origen deja atrás el `localStorage`: los jugadores deben
   exportar e importar su guardado (`BIOLUMA1.`) o hace falta un aviso de migración.
4. Para Android con TWA, `public/.well-known/assetlinks.json` llega tal cual a `dist/` (comprobado: Vite copia las
   carpetas que empiezan por punto).

## 2. galaxy.click

**Listo:** zip de portal, detección del iframe y guardado en la nube (`platform.cloudSave` con `provider: 'galaxy'`).

1. `npm run build && platforms/portals/zip-web.sh` → `platforms/portals/out/bioluma-web-<versión>.zip`, con
   `index.html` en la raíz y sin `sw.js`.
2. Crear la cuenta en galaxy.click, publicar el juego y subir el zip, o enlazar la URL de producción.
3. **Reglas:** no se permiten anuncios de ningún tipo (ya se cumple).
4. **API de guardado en la nube** ([docs](https://galaxy.click/docs/dev/features/saving)), ya implementada en
   `platform.ts`. El juego envía `{action:'save', slot, label, data}` y `{action:'load', slot}` a
   `window.top.postMessage(…, 'https://galaxy.click')`, y recibe `saved` y `save_content`. Hay 11 ranuras (0 a 10) de
   256 000 bytes cada una. Se prueba en `galaxy.click/iframe-test`.
5. Dentro de un iframe, el navegador separa el `localStorage` del de la web principal. Por eso conviene el guardado en
   la nube.

## 3. itch.io (navegador y descargas de escritorio)

**Listo:** zip web, builds de escritorio y `platforms/portals/itch-push.sh`.

1. Crear el proyecto: *Kind of project*: HTML. Subir el zip y marcar "This file will be played in the browser".
   - Embed: 540×900 (vertical) o "Click to launch in fullscreen", más *Mobile friendly* (vertical) y el botón de
     pantalla completa.
2. Descargas de escritorio: subir los ejecutables del workflow o usar butler por canal:
   ```bash
   butler login                                       # una vez
   ITCH_TARGET=usuario/bioluma platforms/portals/itch-push.sh
   # canales: html5 (zip), windows (win-unpacked), linux (linux-unpacked), mac (mac-universal)
   ```
3. CI: con el secreto `BUTLER_API_KEY` y la variable `ITCH_TARGET`, cada tag sube el canal html5 solo.
4. Dinero: "No payments" o donaciones con mínimo de 0. Desde Colombia no hay tratado fiscal con EE. UU.: se retiene el
   30 % de los ingresos de origen estadounidense. Cobro por Payoneer o PayPal.

## 4. CrazyGames

- No exige exclusividad. El *Basic Launch* no necesita su SDK, pero tampoco paga. El *Full Launch* obliga a integrar el
  SDK, que monetiza con anuncios. Eso **choca con ADR-016 (sin anuncios)**: hace falta una ADR nueva si el dueño lo
  quiere.
- Límites: descarga inicial de 50 MB como máximo (20 MB para la portada móvil), 250 MB y 1 500 archivos en total.
  Bioluma pesa unos 0.6 MB en zip. El pago mínimo es de 100 EUR.
- Recomendación: como mucho un Basic Launch para ganar visibilidad, con el mismo zip y sin enlaces de donación.

## 5. Microsoft Store (PWABuilder)

**Listo:** la PWA ya cumple (manifest, iconos, service worker, https). Gratis para cuentas individuales desde
2025-09-10.

1. Crear la cuenta individual de Partner Center (verificación de identidad) y reservar el nombre "Bioluma".
2. En pwabuilder.com, poner la URL de producción → *Package for stores* → Windows. Copiar *Package ID*, *Publisher ID*
   y *Publisher display name* de Partner Center (*Product identity*). Se descarga un `.msixbundle`.
3. Envío en Partner Center:
   - subir el paquete;
   - clasificación por edad (cuestionario IARC; se espera "Todos" o PEGI 3);
   - URL de política de privacidad;
   - capturas de 1920×1080 o más grandes;
   - arte para juegos: caja 1:1 de 1080×1080 y póster 2:3 de 720×1080.
4. El paquete abre la URL. Si cambia el dominio, hay que rehacerlo, así que conviene publicarlo con el dominio
   definitivo.
5. Alternativa sin URL: empaquetar el Electron como `appx` con electron-builder (`win.target: appx`, usando la
   identidad de Partner Center). Funciona offline pero pesa unos 100 MB.

## 6. PC: Windows, macOS y Linux (Electron)

**Listo y verificado aquí:** el AppImage de Linux se compiló y arrancó con `--self-test` (carga por `app://`, módulos
ES, WebGL2, CSP sin errores, sin service worker y sin Node en la página).

Cómo funciona `platforms/desktop/main.cjs`:
- Sirve `dist/` (copiado a `web/`) por el esquema privilegiado `app://bioluma/`. Funcionan los módulos ES y `fetch`.
  El service worker no se registra (no es https) y además no se copia `sw.js`.
- Seguridad: `contextIsolation`, `sandbox`, sin `nodeIntegration`, CSP en cabecera, navegación limitada al origen, todo
  permiso denegado salvo pantalla completa y escritura en el portapapeles, y *fuses* de Electron (sin `RunAsNode`, asar
  con integridad, sin `--inspect`).
- Ventana: 1280×800 por defecto (resolución de la Steam Deck), mínimo 400×600. Recuerda tamaño, posición y pantalla
  completa. F11 o Alt+Enter alternan la pantalla completa (Escape queda para el juego).
- Sin barra de menú en Windows y Linux. En macOS hay un menú mínimo del sistema (Cmd+Q, copiar y pegar).
- Solo una instancia a la vez. Los enlaces externos (`http(s)`) se abren en el navegador del sistema.
- El puente `window.bioluma_platform` (preload) ofrece logros y stats de Steam, pantalla completa, enlaces externos y
  una copia del guardado en archivo.

```bash
npm run build                    # en la raíz
cd platforms/desktop && npm ci
npm start                        # probar (npm run dev = con DevTools, F12)
npm run smoke                    # autoprueba: carga el juego, imprime JSON y sale con 0 o 1
npm run dist:linux               # release/Bioluma-<v>-linux-x86_64.AppImage   (~124 MB)
npm run dist:win                 # release/Bioluma-<v>-win-setup-x64.exe y -win-portable-x64.exe (compilar en Windows o CI)
npm run dist:mac                 # release/Bioluma-<v>-mac-universal.dmg (requiere macOS: lo hace el CI)
npm run icons                    # regenera iconos (platforms/shared/make-icons.mjs)
```

Firma de código (desactivada hasta tener certificados):
- **Windows:** sin firma, SmartScreen avisa ("Más información → Ejecutar de todas formas"). Para firmar: definir
  `CSC_LINK` y `CSC_KEY_PASSWORD` con un certificado de firma de código, o usar Azure Trusted Signing (unos 10 USD al
  mes; comprobar si está disponible para particulares de Colombia).
- **macOS:** firma ad-hoc (`identity: '-'`). La primera vez: clic derecho → Abrir, o *Ajustes → Privacidad y
  seguridad → Abrir igualmente*. También `xattr -dr com.apple.quarantine /Applications/Bioluma.app`. Notarizar exige
  Apple Developer (99 USD al año) y las variables `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` y `APPLE_TEAM_ID`.
- **Linux:** `chmod +x` al AppImage. Si Ubuntu 24.04 o posterior muestra el error "SUID sandbox", arrancar con
  `--no-sandbox` o usar AppImageLauncher.

Los guardados de escritorio están separados de los del navegador: para pasar la partida se usa exportar/importar.
Actualizaciones: las gestionan la app de itch y Steam. En GitHub Releases se descargan a mano (`electron-updater` se
puede añadir más adelante).

## 7. Steam

**Listo:**
- `steamworks.js` es una dependencia *opcional* de `platforms/desktop`.
- `electron-builder.steam.cjs` compila carpetas por depot.
- El juego funciona sin Steam: verificado con la build de Steam sin cliente, donde el log dice "Steam not running,
  continuing without it" y la autoprueba pasa.
- Están listos el puente de logros y stats, Steam Cloud (Remote Storage), las plantillas SteamPipe y los 84 logros con
  sus iconos de prueba.

### Costos y calendario

- **100 USD por app**, no reembolsables. Valve los devuelve al llegar a 1 000 USD brutos ajustados. Una demo es otro
  App ID, gratis, dentro de la misma app.
- **Espera tras pagar:** la página de Steamworks (consultada 2026-10-04) dice **21 días** entre pagar la cuota y poder
  lanzar. El encargo hablaba de 30: planificar con 30 por seguridad.
- La página "Próximamente" tiene que estar pública **al menos 2 semanas**. Valve revisa la página de tienda y la build
  por separado, entre 1 y 5 días cada una.
- Impuestos y banco: el formulario fiscal se verifica en 10 a 15 días hábiles. El titular de la cuenta bancaria debe
  coincidir con el nombre del registro. Desde Colombia se retiene el 30 % de las ventas en EE. UU. (no hay tratado).
- **Next Fest de febrero de 2027** (22 de febrero al 1 de marzo):
  - inscripción hasta el **10 de enero de 2027**;
  - demo y página revisadas antes del 25 de enero para la vista previa de prensa;
  - entrega final hasta el 8 de febrero.

  Requisitos: página pública, demo jugable y lanzamiento del juego **después** del festival.

### Pasos

1. Registrarse en partner.steamgames.com, pagar la cuota y completar los datos fiscales, bancarios y de identidad.
   Anotar el **App ID**.
2. *SteamPipe → Depots*: crear 3 depots (Windows 64-bit, macOS, Linux + SteamOS) y anotar sus IDs.
3. *Installation → General*, opciones de arranque:
   - Windows: `Bioluma.exe`;
   - macOS: `Bioluma.app`;
   - Linux: `bioluma` (si falla dentro del Steam Linux Runtime, añadir el argumento `--no-sandbox`).
4. *Steam Cloud*: cuota de 1 MB y 4 archivos por usuario. El juego usa Remote Storage (`bioluma-save.txt`), así que no
   hace falta configurar rutas de Auto-Cloud.
5. *Stats & Achievements*: crear primero las 11 **stats** y después los **logros** de `platforms/steam/achievements.csv`
   (texto en inglés más *Spanish* y *Latin American Spanish*). Subir los iconos de
   `platforms/steam/achievement-icons/` y luego **Publish** en Steamworks.
6. Compilar y subir:
   ```bash
   cd platforms/desktop && STEAM_APP_ID=<app> npm run dist:steam -- --win --linux   # --mac en un Mac (o artefactos de CI)
   STEAM_APP_ID=<app> STEAM_DEPOT_WIN=<id> STEAM_DEPOT_MAC=<id> STEAM_DEPOT_LINUX=<id> \
   STEAM_BUILDER_USER=<cuenta> STEAM_SET_LIVE=beta platforms/steam/scripts/upload.sh
   ```
   `upload.sh` rellena `steampipe/app_build_APPID.vdf` y `depot_build_{win,mac,linux}.vdf` y omite los depots que
   no se compilaron. La rama `default` se activa a mano en Steamworks.
7. Pruebas locales: crear `platforms/desktop/steam_appid.txt` con el App ID (o 480, Spacewar) y lanzar `npm run dev`
   con Steam abierto. `STEAM_RELAUNCH=1` en la build hace que, si se abre fuera de Steam, se relance desde Steam.
   Por defecto está apagado para que el juego también arranque sin Steam.
8. **Steam Deck:**
   - arranca en pantalla completa y la pantalla táctil funciona;
   - para el sello "Verified" hace falta control completo con mando (falta configurar Steam Input con el trackpad como
     ratón); con lo actual, lo esperable es "Playable".
9. *Content Survey*: el juego no incluye contenido generado por IA (CLAUDE.md, regla 10). Si el arte de la tienda usa
   IA, hay que declararlo.

### Logros de Steam (84) y stats (11)

Fuente de verdad: `platforms/steam/achievements.json`, que genera
`npx vite-node platforms/steam/scripts/gen-achievements.ts`:
- los 34 logros que ya existen salen de `src/game/balance.ts` y `content.ts`;
- los finales salen de `src/story`;
- los secretos salen de la unión `SecretId` de `src/secrets/types.ts`.

`--check` falla si el archivo quedó desactualizado; en el CI ese paso solo avisa. Los iconos se generan con
`node platforms/steam/scripts/gen-achievement-icons.mjs`.

- **Puente:** `bridgeMap` (id del juego → nombre API de Steam) se copia a `platforms/desktop/steam-achievements.json`
  y lo usa `unlockAchievement` del preload. Los ids que falten siguen la regla `steamApiName()`
  (`firstLife` → `ACH_FIRST_LIFE`).
- **Reglas:**
  - Steam permite 100 logros hasta alcanzar el umbral de *Profile Features*. Usamos 84: 52 visibles y 32 ocultos.
  - Los ocultos (finales y secretos) no aparecen en el perfil hasta conseguirlos, así no hay spoilers.
  - Los logros por niveles llevan una *progress stat*: Steam muestra la barra y los desbloquea solo al llegar al
    máximo.
  - Para no dar sensación de spam de logros, ninguna serie tiene más de 4 niveles.
- **Iconos:** 256×256 JPG por logro: uno a color (conseguido) y otro en escala de grises y oscurecido (sin conseguir).
  Steam todavía acepta el tamaño antiguo de 64×64.
  - Estilo: fondo casi negro, aro de placa de Petri de vidrio, un glifo luminoso con el color de la categoría y una
    etiqueta de nivel ("100", "1K/s", "ALL").
  - Colores: cian para inicio, verde agua para bestiario, azul para comportamiento, lima para economía, oro para
    Destello, violeta para prestigio, rosa para historia, magenta para secretos, naranja para velocidad e índigo para
    idle.
  - Los actuales son provisionales y generados como SVG. El arte final se reemplaza archivo por archivo, con los mismos
    nombres.
- **Bonus** de los logros nuevos dentro del juego: `achievements.json` trae `bonus` sugeridos. Los fija el Balanceador
  en `balance.ts` con corridas del bot (CLAUDE.md, regla 2).

| # | API name (Steam) | id del juego | Nombre es / en | Se desbloquea cuando | Oculto | Barra (stat) |
|---|---|---|---|---|---|---|
| 1 | `ACH_FIRST_SEED` | `firstSeed` | Primera gota / First drop | ya existe: `seeds ≥ 1` | no | — |
| 2 | `ACH_FIRST_LIFE` | `firstLife` | Algo se quedó / Something stayed | ya existe: `stableEver ≥ 1` | no | — |
| 3 | `ACH_SEEDS_100` | `seeds100` | Mano firme / Steady hand | ya existe: `seeds ≥ 100` | no | `STAT_SEEDS` 0–100 |
| 4 | `ACH_SEEDS_1000` | `seeds1000` | Lluvia constante / Steady rain | ya existe: `seeds ≥ 1000` | no | `STAT_SEEDS` 0–1000 |
| 5 | `ACH_SPECIES_3` | `species3` | Naturalista / Naturalist | ya existe: `species ≥ 3` | no | `STAT_SPECIES` 0–3 |
| 6 | `ACH_SPECIES_10` | `species10` | Taxónoma / Taxonomist | ya existe: `species ≥ 10` | no | `STAT_SPECIES` 0–10 |
| 7 | `ACH_SPECIES_20` | `species20` | Fauna propia / A fauna of my own | ya existe: `species ≥ 20` | no | `STAT_SPECIES` 0–20 |
| 8 | `ACH_SWIMMER` | `swimmer` | Nadadora / Swimmer | ya existe: `behavior:swimmer ≥ 1` | no | — |
| 9 | `ACH_SPINNER` | `spinner` | Remolino / Whirl | ya existe: `behavior:spinner ≥ 1` | no | — |
| 10 | `ACH_PULSING` | `pulsing` | Latido / Heartbeat | ya existe: `behavior:pulsing ≥ 1` | no | — |
| 11 | `ACH_DIVIDER` | `divider` | Mitosis / Mitosis | ya existe: `behavior:divider ≥ 1` | no | — |
| 12 | `ACH_COLONY` | `colony` | Colonia / Colony | ya existe: `behavior:colony ≥ 1` | no | — |
| 13 | `ACH_ALL_BEHAVIORS` | `allBehaviors` | Etóloga / Ethologist | ya existe: `behaviors ≥ 6` | no | `STAT_BEHAVIORS` 0–6 |
| 14 | `ACH_EPS_10` | `eps10` | Productiva / Productive | ya existe: `epsPeak ≥ 10` | no | `STAT_EPS_PEAK` 0–10 |
| 15 | `ACH_EPS_100` | `eps100` | Floreciente / Flourishing | ya existe: `epsPeak ≥ 100` | no | `STAT_EPS_PEAK` 0–100 |
| 16 | `ACH_EPS_1000` | `eps1000` | Ecosistema / Ecosystem | ya existe: `epsPeak ≥ 1000` | no | `STAT_EPS_PEAK` 0–1000 |
| 17 | `ACH_ESSENCE_1E4` | `essence1e4` | Diez mil / Ten thousand | ya existe: `totalEssence ≥ 10000` | no | `STAT_ESSENCE_LOG10` 0–4 |
| 18 | `ACH_ESSENCE_1E6` | `essence1e6` | Millonaria / Millionaire | ya existe: `totalEssence ≥ 1e+06` | no | `STAT_ESSENCE_LOG10` 0–6 |
| 19 | `ACH_GOLDEN_1` | `golden1` | Destello / Spark | ya existe: `golden ≥ 1` | no | — |
| 20 | `ACH_GOLDEN_10` | `golden10` | Cazadora de luz / Light catcher | ya existe: `golden ≥ 10` | no | `STAT_GOLDEN` 0–10 |
| 21 | `ACH_GOLDEN_50` | `golden50` | Polilla / Moth | ya existe: `golden ≥ 50` | no | `STAT_GOLDEN` 0–50 |
| 22 | `ACH_RARE` | `rare` | Rareza / Rarity | ya existe: `rare ≥ 1` | no | — |
| 23 | `ACH_VERY_RARE` | `veryRare` | Joya / Jewel | ya existe: `veryRare ≥ 1` | no | — |
| 24 | `ACH_CROWD_5` | `crowd5` | Placa viva / Living dish | ya existe: `stablePeak ≥ 5` | no | `STAT_STABLE_PEAK` 0–5 |
| 25 | `ACH_CROWD_10` | `crowd10` | Bullicio / Bustle | ya existe: `stablePeak ≥ 10` | no | `STAT_STABLE_PEAK` 0–10 |
| 26 | `ACH_PRINTER` | `printer` | Impresora / Printer | ya existe: `prints ≥ 1` | no | — |
| 27 | `ACH_TINKERER` | `tinkerer` | Ajuste fino / Fine tuning | ya existe: `calibrations ≥ 1` | no | — |
| 28 | `ACH_REGIME` | `regime` | Archivista / Archivist | ya existe: `regimesSaved ≥ 1` | no | — |
| 29 | `ACH_EXTINCTION` | `extinction` | Tabula rasa / Tabula rasa | ya existe: `extinctions ≥ 1` | no | — |
| 30 | `ACH_HERITAGE` | `heritage` | Herencia / Heritage | ya existe: `genomeNodes ≥ 1` | no | — |
| 31 | `ACH_VARIANT` | `variant` | Variación / Variation | ya existe: `variants ≥ 1` | no | — |
| 32 | `ACH_SYMBIOSIS` | `symbiosis` | Simbiosis / Symbiosis | ya existe: `symbiosis ≥ 1` | no | — |
| 33 | `ACH_RETURNED` | `returned` | De vuelta / Back again | ya existe: `returns ≥ 1` | no | — |
| 34 | `ACH_HOUR` | `hour` | Paciencia / Patience | ya existe: `playTime ≥ 3600` | no | `STAT_PLAY_MINUTES` 0–60 |
| 35 | `ACH_SPECIES_25` | `species25` | Herbario / Herbarium | `species ≥ 25` | no | `STAT_SPECIES` 0–25 |
| 36 | `ACH_SPECIES_CATALOG` | `speciesCatalog` | El catálogo de Chan / Chan's catalogue | `catalogSpecies ≥ 26` (métrica nueva) | no | `STAT_CATALOG_SPECIES` 0–26 |
| 37 | `ACH_GOLDEN_100` | `golden100` | Enjambre de luz / Swarm of light | `golden ≥ 100` | no | `STAT_GOLDEN` 0–100 |
| 38 | `ACH_ERA_5` | `era5` | Quinta placa / Fifth dish | `era ≥ 5` (métrica nueva) | no | `STAT_ERA` 0–5 |
| 39 | `ACH_ERA_10` | `era10` | Linaje / Lineage | `era ≥ 10` (métrica nueva) | no | `STAT_ERA` 0–10 |
| 40 | `ACH_ERA_25` | `era25` | Tiempo profundo / Deep time | `era ≥ 25` (métrica nueva) | no | `STAT_ERA` 0–25 |
| 41 | `ACH_GENOME_COMPLETE` | `genomeComplete` | Genoma completo / Complete genome | `genomeNodes ≥ 11` | no | `STAT_GENOME_NODES` 0–11 |
| 42 | `ACH_EPS_1E4` | `eps1e4` | Biosfera / Biosphere | `epsPeak ≥ 10000` | no | `STAT_EPS_PEAK` 0–10000 |
| 43 | `ACH_ESSENCE_1E9` | `essence1e9` | Mil millones / A billion | `totalEssence ≥ 1e+09` | no | `STAT_ESSENCE_LOG10` 0–9 |
| 44 | `ACH_ENDING_HARVEST` | `endingHarvest` | Final: Cosecha / Ending: Harvest | `src/story`: story ending "harvest" shown | sí | — |
| 45 | `ACH_ENDING_LAW` | `endingLaw` | Final: Ley perfecta / Ending: Perfect Law | `src/story`: story ending "law" shown | sí | — |
| 46 | `ACH_ENDING_MEMORY` | `endingMemory` | Final: Archivo / Ending: Archive | `src/story`: story ending "memory" shown | sí | — |
| 47 | `ACH_ENDING_TIDE` | `endingTide` | Final: Marea / Ending: Tide | `src/story`: story ending "tide" shown | sí | — |
| 48 | `ACH_ENDING_ALBOR` | `endingAlbor` | Final secreto: Primera luz / Secret ending: First Light | `src/story`: story ending "albor" shown | sí | — |
| 49 | `ACH_ALL_ENDINGS` | `allEndings` | Todas las voces / Every voice | `src/story`: story.endings() contains every main ending | no | — |
| 50 | `ACH_SECRET_IGNIS` | `secretIgnis` | Ignis / Ignis | `src/secrets`: secret "ignis" revealed (hidden species) | sí | — |
| 51 | `ACH_SECRET_PHANTASMA` | `secretPhantasma` | Phantasma / Phantasma | `src/secrets`: secret "phantasma" revealed (hidden species) | sí | — |
| 52 | `ACH_SECRET_CRYPTID` | `secretCryptid` | Críptido / Cryptid | `src/secrets`: secret "cryptid" revealed (hidden species) | sí | — |
| 53 | `ACH_SECRET_CHAN` | `secretChan` | Gracias, Bert / Thank you, Bert | `src/secrets`: secret "chan" revealed (homages) | sí | — |
| 54 | `ACH_SECRET_CONWAY` | `secretConway` | Homenaje a Conway / Homage to Conway | `src/secrets`: secret "conway" revealed (homages) | sí | — |
| 55 | `ACH_SECRET_ANSWER` | `secretAnswer` | La respuesta / The answer | `src/secrets`: secret "answer" revealed (homages) | sí | — |
| 56 | `ACH_SECRET_MAXIMIZER` | `secretMaximizer` | Maximizadora / Maximizer | `src/secrets`: secret "maximizer" revealed (homages) | sí | — |
| 57 | `ACH_SECRET_GOLDEN_STREAK` | `secretGoldenStreak` | Racha dorada / Golden streak | `src/secrets`: secret "goldenStreak" revealed (homages) | sí | — |
| 58 | `ACH_SECRET_SPIRAL` | `secretSpiral` | Espiral / Spiral | `src/secrets`: secret "spiral" revealed (gestures drawn on the dish) | sí | — |
| 59 | `ACH_SECRET_HEART` | `secretHeart` | Corazón / Heart | `src/secrets`: secret "heart" revealed (gestures drawn on the dish) | sí | — |
| 60 | `ACH_SECRET_HALO` | `secretHalo` | Halo / Halo | `src/secrets`: secret "halo" revealed (gestures drawn on the dish) | sí | — |
| 61 | `ACH_SECRET_INFINITY` | `secretInfinity` | Infinito / Infinity | `src/secrets`: secret "infinity" revealed (gestures drawn on the dish) | sí | — |
| 62 | `ACH_SECRET_KONAMI` | `secretKonami` | Código antiguo / Old code | `src/secrets`: secret "konami" revealed (touches / keys / sensors) | sí | — |
| 63 | `ACH_SECRET_LOGO` | `secretLogo` | El logo / The logo | `src/secrets`: secret "logo" revealed (touches / keys / sensors) | sí | — |
| 64 | `ACH_SECRET_PATIENCE` | `secretPatience` | Toque paciente / Patient touch | `src/secrets`: secret "patience" revealed (touches / keys / sensors) | sí | — |
| 65 | `ACH_SECRET_SHAKE` | `secretShake` | Sacudida / Shake | `src/secrets`: secret "shake" revealed (touches / keys / sensors) | sí | — |
| 66 | `ACH_SECRET_OLD_FRIEND` | `secretOldFriend` | Vieja amiga / Old friend | `src/secrets`: secret "oldFriend" revealed (patience / behaviour) | sí | — |
| 67 | `ACH_SECRET_SEVEN` | `secretSeven` | Siete / Seven | `src/secrets`: secret "seven" revealed (patience / behaviour) | sí | — |
| 68 | `ACH_SECRET_SILENCE` | `secretSilence` | Silencio / Silence | `src/secrets`: secret "silence" revealed (patience / behaviour) | sí | — |
| 69 | `ACH_SECRET_STERILE` | `secretSterile` | Placa estéril / Sterile dish | `src/secrets`: secret "sterile" revealed (patience / behaviour) | sí | — |
| 70 | `ACH_SECRET_PALINDROME` | `secretPalindrome` | Palíndromo / Palindrome | `src/secrets`: secret "palindrome" revealed (patience / behaviour) | sí | — |
| 71 | `ACH_SECRET_AFK` | `secretAfk` | Ausente / Away | `src/secrets`: secret "afk" revealed (patience / behaviour) | sí | — |
| 72 | `ACH_SECRET_FULL_MOON` | `secretFullMoon` | Luna llena / Full moon | `src/secrets`: secret "fullMoon" revealed (sky / calendar / rare visuals) | sí | — |
| 73 | `ACH_SECRET_BIRTHDAY` | `secretBirthday` | Cumpleaños / Birthday | `src/secrets`: secret "birthday" revealed (sky / calendar / rare visuals) | sí | — |
| 74 | `ACH_SECRET_AURORA` | `secretAurora` | Aurora / Aurora | `src/secrets`: secret "aurora" revealed (sky / calendar / rare visuals) | sí | — |
| 75 | `ACH_SECRET_ORION` | `secretOrion` | Orión / Orion | `src/secrets`: secret "orion" revealed (sky / calendar / rare visuals) | sí | — |
| 76 | `ACH_SECRET_BASEMENT` | `secretBasement` | El sótano / The basement | `src/secrets`: secret "basement" revealed (meta) | sí | — |
| 77 | `ACH_SECRETS_ALL` | `secretsAll` | Nada más que esconder / Nothing left to hide | `src/secrets`: every SecretId revealed | no | — |
| 78 | `ACH_SPEED_EXTINCTION` | `speedExtinction` | Prisa evolutiva / Evolutionary rush | `src/game`: extinctionDone with stats.extinctions === 1 && stats.playTime < 2700 | no | — |
| 79 | `ACH_SPEED_SPECIES` | `speedSpecies` | Ojo rápido / Quick eye | `src/game`: speciesNew with species.length >= 10 && stats.playTime < 1800 | no | — |
| 80 | `ACH_SPEED_ERA` | `speedEra` | Era relámpago / Lightning era | `src/game`: extinctionDone with era play time < 600 s (new: track era start time) | no | — |
| 81 | `ACH_AWAY_NIGHT` | `awayNight` | Dormir sobre ello / Sleep on it | `src/main.ts`: bus 'offlineReturn' with seconds >= 28800 | no | — |
| 82 | `ACH_OFFLINE_HARVEST` | `offlineHarvest` | Cosecha nocturna / Night harvest | `src/main.ts`: bus 'offlineReturn' with essence >= 1e6 | no | — |
| 83 | `ACH_HANDS_OFF` | `handsOff` | Manos quietas / Hands off | `src/main.ts`: no pointer/key input for 900 s while essencePerSec > 0 and the tab is visible | no | — |
| 84 | `ACH_PLAY_10H` | `play10h` | Cultivo largo / Long culture | `playTime ≥ 36000` | no | `STAT_PLAY_MINUTES` 0–600 |

| Stat (INT) | Valor que envía el juego |
|---|---|
| `STAT_SEEDS` | stats.seeds (lifetime) |
| `STAT_SPECIES` | species.length |
| `STAT_CATALOG_SPECIES` | catalog species registered (new metric) |
| `STAT_BEHAVIORS` | behaviorsSeen.length |
| `STAT_GOLDEN` | stats.golden |
| `STAT_ERA` | stats.extinctions + 1 |
| `STAT_GENOME_NODES` | nodes.length |
| `STAT_STABLE_PEAK` | stats.stablePeak |
| `STAT_EPS_PEAK` | floor(min(stats.epsPeak, 2^31-1)) |
| `STAT_ESSENCE_LOG10` | floor(log10(max(1, stats.totalEssence))) |
| `STAT_PLAY_MINUTES` | floor(stats.playTime / 60) |

### Recursos de la página de tienda (tamaños exactos)

| Recurso | Tamaño | Formato | Nota |
|---|---|---|---|
| Header capsule | 920×430 | JPG/PNG | |
| Small capsule | 462×174 | JPG/PNG | Steam genera 120×45 y 184×69 |
| Main capsule | 1232×706 | JPG/PNG | |
| Vertical capsule | 748×896 | JPG/PNG | |
| Capturas | mínimo 5, 1920×1080 o mayores, 16:9 | JPG/PNG | |
| Page background | 1438×810 | JPG/PNG | Opcional (si falta, se genera de las capturas) |
| Library capsule | 600×900 | PNG | |
| Library header | 920×430 | PNG | |
| Library hero | 3840×1240 (zona segura 860×380) | PNG | Sin texto |
| Library logo | 1280 de ancho y/o 720 de alto | PNG transparente | |
| Shortcut icon | 256×256 o 512×512 | ICO/PNG | Ya existe: `platforms/desktop/build/icon.ico` y `icon.png` |
| App icon | 184×184 | JPG | |
| Mac icon | — | ICNS | Ya existe: `platforms/desktop/build/icon.icns` |
| Logros | 256×256, dos por logro | JPG | Ya existen (provisionales) |
| Eventos (opcional) | portada 800×450, cabecera 1920×622 | JPG/PNG | |
| Tráiler | 1920×1080 recomendado | MP4 | Muy recomendable para el Next Fest |

También hacen falta:
- descripción corta de 300 caracteres como máximo;
- "Acerca del juego";
- idiomas: español e inglés;
- etiquetas: Incremental, Idle, Simulation, Relaxing, Science;
- requisitos mínimos: Windows 10 de 64 bits, 4 GB de RAM, GPU con OpenGL ES 3.0 / WebGL2 (DirectX 11), 400 MB de
  disco;
- precio o la opción gratis.

## 8. Android

Hay dos caminos. Usan paquetes distintos (`com.bioluma.game` y `com.bioluma.twa`): no hay que publicar los dos.

### Camino B (recomendado hoy): Capacitor, sin dominio y offline

**Listo y verificado aquí:**
- `npm run add:android` y `./gradlew assembleDebug` produjeron `app-debug.apk` de 7.2 MB;
- datos del paquete: `com.bioluma.game`, versionCode 100, versionName 0.1.0, **targetSdk 36**;
- permisos: `INTERNET` y `VIBRATE`.

```bash
npm run build                             # raíz: genera dist/ (webDir = ../../dist)
cd platforms/mobile && npm ci
npm run add:android                       # cap add android + iconos/splash (assets/) + patch-native
npm run apk:debug                         # android/app/build/outputs/apk/debug/app-debug.apk
npm run open:android                      # Android Studio (emulador o dispositivo)
npm run aab:release                       # AAB firmado si existen las variables BIOLUMA_KEYSTORE_* (ver firma)
```

En local hacen falta Node 22, JDK 21 y Android Studio, o el SDK con la plataforma 36.

`scripts/patch-native.mjs` se puede ejecutar varias veces sin efectos acumulados. Hace esto:
- versionName = versión del juego;
- versionCode = mayor×10000 + menor×100 + parche;
- firma release leída de variables de entorno;
- orientación vertical.

`scripts/check-bridge.mjs` falla si una actualización de Capacitor quita alguna de las piezas que usa `platform.ts`.

Comportamiento nativo, todo desde `platform.ts` y sin dependencias en la web:
- **Botón atrás:** primero cierra modales, fichas o modos (`onBack`). Si no hay nada que cerrar, minimiza la app
  (`App.minimizeApp`): la partida sigue en memoria y no se cierra por error.
- **Barras del sistema:** usa el plugin *SystemBars* que trae Capacitor 8. Iconos claros (`DARK`), de borde a borde
  y con `env(safe-area-inset-*)` correctos, que la UI ya usa. Android 15 y 16 obligan al modo de borde a borde.
- **Modo inmersivo:** `platform.setImmersive(true)` oculta las barras; reaparecen al deslizar. Se puede ofrecer como
  ajuste.
- **Pausa:** el evento `pause` de la app llama a `onPause`, es decir, guarda al pasar a segundo plano.
- **Háptica** con `Haptics`. WebView 100 como mínimo (si es más vieja, Capacitor pide actualizarla).
- La orientación vertical se ignora en pantallas de 600 dp o más (tablets y plegables) en Android 16. La UI ya tiene
  diseño ancho.

### Camino A: TWA con Bubblewrap (exige dominio propio)

Ventajas: unos 1 MB y se actualiza con cada despliegue web. Desventajas: hace falta el dominio y Chrome, y la primera
carga necesita red.

1. Comprar el dominio y publicar la web en él.
2. En `platforms/mobile/twa/twa-manifest.json`, reemplazar `__DOMAIN__` y ejecutar
   `npx @bubblewrap/cli build` en esa carpeta. Se puede empezar también con `bubblewrap init --manifest
   https://DOMINIO/manifest.webmanifest`.
3. Copiar `platforms/mobile/twa/assetlinks.json` a **`public/.well-known/assetlinks.json`** con los SHA-256 de la
   llave de firma de Play (*Play Console → Integridad de la app*) y de la llave de subida. Desplegar y comprobar
   `https://DOMINIO/.well-known/assetlinks.json`.
4. Si el archivo no valida, la TWA muestra la barra de URL. Es la señal de que algo falla.

### Lista de Play Console

- **Cuenta:** 25 USD una vez, cuenta personal, verificación de identidad y de un dispositivo Android. Colombia es
  elegible. Play cierra las cuentas inactivas sin devolver el pago.
- **Prueba cerrada obligatoria** (cuentas personales creadas después del 2023-11-13): **12 testers** con opt-in
  **continuo durante 14 días**. Después se pide acceso a producción con un cuestionario. Los testers se reclutan gratis
  en Discord y r/incremental_games; el plan B es un servicio de unos 20 USD.
- **Nivel de API:** desde el **2026-08-31**, apps nuevas y actualizaciones deben apuntar a **Android 16 (API 36)**
  (había prórroga hasta el 2026-11-01). Capacitor 8 ya usa 36.
- **Firma:**
  - Play App Signing es obligatorio para apps nuevas (AAB). Google guarda la llave de la app; tú guardas la **llave
    de subida**.
  - Crearla: `keytool -genkeypair -v -keystore bioluma-upload.keystore -alias bioluma -keyalg RSA -keysize 4096 -validity 10000`.
  - Guardar la llave y su contraseña en un gestor de contraseñas, con copia de respaldo. **Nunca** en el repo
    (`.gitignore` ya excluye `*.keystore` y `*.jks`).
  - Para el CI: `base64 -w0 bioluma-upload.keystore` → secreto `ANDROID_KEYSTORE_BASE64`, más
    `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`.
- **Contenido de la app:**
  - política de privacidad (URL obligatoria; puede ser una página estática en el sitio web);
  - acceso a la app: sin inicio de sesión;
  - anuncios: **No**;
  - público objetivo: **13 años o más** (evita la política de Familias);
  - clasificación IARC: sin violencia, sexo, apuestas ni compras. Se espera **Todos / PEGI 3**; si el ranking muestra
    apodos, responder que los usuarios pueden compartir contenido;
  - sin funciones financieras ni de salud.
- **Seguridad de los datos**:

  | Pregunta | Sin ranking | Con ranking (apodo opcional) |
  |---|---|---|
  | ¿Recopila o comparte datos? | **No** | Sí, solo recopila; no comparte con terceros |
  | Información personal → Nombre (apodo; Google define "Name" incluyendo *nickname*) | — | Recopilado, **opcional**, finalidad: funcionalidad de la app |
  | Actividad en la app → Otras acciones (puntuación, especies, era) | — | Recopilado, opcional, funcionalidad de la app |
  | Identificadores del dispositivo u otros (id aleatorio del jugador, si el servidor lo usa) | — | Recopilado, funcionalidad y prevención de fraude |
  | Cifrado en tránsito | — | Sí (HTTPS) |
  | ¿Se puede pedir el borrado? | — | Sí (correo o "borrar mi entrada" en el juego) |
  | Analítica PostHog (cuando exista, siempre opt-in) | — | Añadir: interacciones con la app, registros de fallos, diagnósticos → analítica, opcional |

- **Ficha de la tienda:**
  - icono de 512×512 PNG de 32 bits (usar `platforms/mobile/assets/icon-only.png` redimensionado);
  - gráfico destacado de 1024×500;
  - de 2 a 8 capturas de teléfono, 9:16, por ejemplo 1080×1920;
  - capturas de tablet de 7 y 10 pulgadas para aparecer en tablets;
  - descripción corta de 80 caracteres y larga de 4 000;
  - marcar "generado o editado con IA" en cada recurso donde aplique.
- **Lanzamiento:** prueba interna → prueba cerrada (los 12 testers) → producción con despliegue escalonado.
- Más adelante: la verificación global de desarrolladores de Android llega en 2027. Las cuentas de Play ya verificadas
  la cumplen.

## 9. iOS

### App Store (Capacitor, el mismo proyecto que Android)

**Listo:** `npm run add:ios` genera el proyecto (Swift Package Manager, iOS 15 como mínimo) y `patch-native.mjs` deja
listo `Info.plist`:
- `CFBundleDisplayName` = Bioluma;
- solo vertical en iPhone;
- `ITSAppUsesNonExemptEncryption = false` (solo usa HTTPS, así que no hace falta trámite de exportación);
- versión.

Comprobado aquí en Linux: el proyecto se genera y el plist es válido. **Compilar requiere un Mac.**

Requisitos: un Mac con **Xcode 26** (desde el 2026-04-28 App Store Connect solo acepta builds con el SDK de iOS 26; `npx cap doctor` revisa el entorno)
y Apple Developer Program a **99 USD al año**.

1. En el Mac: `npm ci && npm run build` en la raíz, y `cd platforms/mobile && npm ci && npm run add:ios`.
2. `npm run open:ios` → en Xcode, *Signing & Capabilities*: elegir el *Team* y el bundle `com.bioluma.game`. Probar
   en un iPhone real.
3. *Product → Archive → Distribute App → App Store Connect* → TestFlight → enviar a revisión.
4. Etiquetas de privacidad en App Store Connect: "Datos no recopilados" sin ranking. Con ranking: Contenido del
   usuario → Contenido de juego, e Identificadores → ID de usuario, no vinculados a la identidad. Revisar el informe de
   privacidad del archivo (*Generate Privacy Report*).

**Riesgo de la directriz 4.2 (funcionalidad mínima):** Apple rechaza las webs "reempaquetadas". Bioluma lo mitiga así:
- el juego completo va **dentro del paquete** y funciona **sin conexión**; no carga una URL remota;
- integración nativa: háptica, barras del sistema y áreas seguras, ciclo de vida (pausa → guardado) y sin interfaz de
  navegador;
- es una simulación WebGL2 en tiempo real, con audio sintetizado y diseño táctil pensado para el móvil;
- no tiene enlaces fuera de la app ni donaciones en la build de iOS (además lo exige la directriz 3.2.2);
- a futuro: logros de Game Center con los mismos ids, mediante un plugin de Capacitor.

### Camino gratis: PWA ("Añadir a pantalla de inicio")

- Funciona hoy en Safari: Compartir → Añadir a pantalla de inicio. Abre a pantalla completa y funciona offline gracias
  al service worker.
- Las web apps de pantalla de inicio admiten Web Push desde iOS 16.4.
- `platform.installHint() === 'ios'` permite mostrar la instrucción en Ajustes.
- Faltan las metaetiquetas de la sección de Integración, punto 2.
- Safari puede borrar el almacenamiento de webs que no se usan en mucho tiempo: hay que recordar al jugador que puede
  exportar su guardado.

## 10. CI: `.github/workflows/release.yml`

Se ejecuta con cada tag `v*` (`git tag v0.2.0 && git push origin v0.2.0`) o a mano (*Actions → Release → Run
workflow*). Permisos: `contents: read`; solo el trabajo que crea el borrador de release tiene `contents: write`. Todos
los trabajos tienen `timeout-minutes`. No usa ninguna llave de IA.

| Trabajo | Qué hace | Artefacto |
|---|---|---|
| `web` | tests, `npm run build`, autoprueba de `platform.ts`, comprobación del plan de logros (solo avisa), zip de portal | `web-dist`, `bioluma-web-<v>` |
| `desktop` (Windows, macOS, Ubuntu) | `npm run dist -- --win/--mac/--linux` y `--self-test` de la app empaquetada | `.exe` (NSIS + portable), `.dmg`, `.AppImage` |
| `android` | JDK 21, `cap add android` si no hay `android/`, `assembleDebug`; AAB firmado solo con los secretos | `app-debug.apk` (+ `.aab`) |
| `itch` | Solo con tag y con `BUTLER_API_KEY` + `ITCH_TARGET`: `butler push` del canal html5 | — |
| `github-release` | Solo con tag: **borrador** de release con todos los binarios | — |

| Secreto o variable | Activa |
|---|---|
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (secretos) | AAB firmado para Play |
| `BUTLER_API_KEY` (secreto) + `ITCH_TARGET` (variable, `usuario/bioluma`) | Subida a itch.io |
| `STEAM_APP_ID` (variable) | Carpetas de depot de Steam como artefactos |
| `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | Firma de Windows y macOS (por conectar cuando se compren) |

La subida a Steam no está en el CI: se hace con `upload.sh` desde la máquina que tiene Steam Guard.

## 11. Pendiente del dueño

- [ ] Conectar el repo a Vercel (proyecto Vite, salida `dist`).
- [ ] Decidir y comprar el dominio (.com en Cloudflare, ~10.46 USD/año) **antes** de la TWA y la Microsoft Store.
      Después, cambiar `appId` (`com.bioluma.game`) si se quiere otro identificador: una vez publicado es permanente.
- [ ] Cuentas gratuitas: galaxy.click, itch.io y Partner Center (Microsoft).
- [ ] Política de privacidad publicada en una URL (la piden Play, Microsoft y Apple).
- [ ] Google Play: pagar 25 USD, verificar identidad, crear la llave de subida, reclutar 12 testers durante 14 días y
      completar los formularios de la sección 8.
- [ ] Steam (cuando haya presupuesto): pagar 100 USD, datos fiscales y bancarios, App ID y depots, arte de la tienda,
      tráiler, inscripción en el Next Fest antes del 2027-01-10.
- [ ] iOS (cuando haya presupuesto): un Mac y Apple Developer (99 USD al año).
- [ ] Opcional: certificados de firma de código para Windows y macOS.
- [ ] Decidir sobre CrazyGames (sus anuncios contra ADR-016).
