# Ranking global

Tres tablas: **Esencia total** (de toda la vida), **Especies** registradas y **Eras** alcanzadas. Cada
jugador aparece como `Nombre#1234`: los nombres no son únicos y la etiqueta de 4 cifras sale de su id.
El servidor guarda el top 200 de cada tabla y sirve el top 50 más tu propia fila. Se puntúa lo mejor
que hayas logrado, así que reiniciar la partida no te borra del ranking.

El ranking es **opcional**: no se envía nada hasta que el jugador elige un nombre. A partir de ahí el
juego envía su progreso cada ~5 minutos mientras la pestaña está visible, y poco después de cada
extinción.

## Piezas

| Ruta | Qué hace |
|---|---|
| `src/net/leaderboard.ts` | Cliente: identidad, envíos firmados, lectura de tablas. Nunca lanza errores al juego y funciona sin conexión. |
| `src/net/integrity.ts` | Heurísticas en el navegador: speed hack, reloj atrasado, partida editada, uso del handle de depuración. |
| `api/submit.ts`, `api/leaderboard.ts` | Funciones Edge de Vercel (Request/Response web, sin dependencias). |
| `server/` | Lógica pura compartida: protocolo y criptografía, nombres, validación, almacenamiento, límites. |

Contrato HTTP:

- `POST /api/submit` recibe un JSON firmado (≤ 4 KB) y responde `{ ok, status: 'accepted'|'flagged', ranks, name }`.
  En caso de error responde `{ ok: false, error }`, con 400, 401, 403, 409, 413, 415, 422, 429 o 503.
- `GET /api/leaderboard?board=essence|species|era[&player=<id>]` responde `{ entries (top 50), me, total }`.
- Toda respuesta trae `serverTime`: el cliente corrige con él el reloj del dispositivo.

## Capas anti-trampas (y sus límites, con honestidad)

Bioluma es un juego incremental que corre entero en el navegador del jugador. **No se puede hacer
inhackeable**: quien edite el código del cliente puede enviar lo que quiera. El objetivo es que hacer
trampa cueste esfuerzo y que las puntuaciones imposibles o muy sospechosas no lleguen al top.

1. **Identidad firmada (ECDSA P-256, "confiar en el primer uso").** La primera vez, el navegador crea un
   id aleatorio y un par de claves (WebCrypto). El servidor registra la clave **pública** con el primer
   envío aceptado. Después solo acepta envíos de ese id firmados con esa clave.
   - Impide suplantar a otro jugador y reenviar envíos viejos: cada firma cubre un `nonce` y `clientTime`,
     y `clientTime` debe crecer.
   - No impide que alguien firme números falsos con su propia clave.
   - En el servidor no hay ningún secreto que robar: solo claves públicas.
2. **Prueba de trabajo (hashcash, 14 bits de SHA-256).** Cuesta ~0,1 s en un escritorio y ~0,5–1 s en un
   móvil, y va ligada al contenido exacto del envío. Encarece los scripts que envían en masa. El servidor
   no guarda estado para esto: basta la ventana de ±10 min de `clientTime`.
3. **Límites de frecuencia.** Un envío por jugador cada 60 s (lo comprueba el servidor contra el último
   envío aceptado) y cubos por IP en memoria (orientativos: cada instancia tiene los suyos). Además:
   cuerpo de 4 KB como máximo, `Content-Type: application/json` obligatorio y solo el mismo origen.
   Nunca se envían cabeceras CORS, y un `Origin` ajeno recibe 403.
4. **Plausibilidad en el servidor** (`server/validate.ts`). Las cotas salen de `src/game/balance.ts`.
   El tiempo real lo mide el **reloj del servidor** entre dos envíos aceptados.
   - **Rechazo** (reglas que el juego no puede romper):
     - el tiempo de juego crece más rápido que el tiempo real (speed hack);
     - un contador baja (esencia, especies, comportamientos, eras, semillas, tiempo de juego, pico de producción);
     - una partida anterior a la salida del juego o con fecha futura;
     - más de 6 comportamientos o más de 300 especies;
     - una era sin los 250 000 de esencia que exige cada extinción;
     - un Genoma que no cuadra con la fórmula de prestigio (mínimo 5 por extinción y máximo √(n·E/10⁴) + 2·especies + comportamientos);
     - más de una era cada 2 min de juego;
     - esencia por encima del techo físico.

     El techo físico integra dE/dτ = producción máxima(E): todos los multiplicadores al máximo, mejoras
     limitadas por lo que la partida pudo pagar, 160 criaturas, todas las chispas doradas y lo offline
     al 50 %.
   - **Marca** (la entrada se queda, pero se ve en gris y sale del top):
     - esencia por encima del techo "sospechoso" (unas 40 criaturas en vez de 160);
     - esencia que no cuadra con el **pico de producción** que la propia partida declara: cada fuente de
       esencia está acotada por ese pico, así que editar solo la esencia, o adelantar el reloj para cobrar
       horas offline que no pasaron según el servidor, se detecta;
     - especies creciendo a más de ~20 por hora;
     - importar una partida **más antigua** encima de la actual;
     - cualquier aviso de integridad del cliente.
   - Las marcas son **pegajosas**: un envío limpio posterior no las quita.
   - Cifras reales: en la primera hora de juego el techo "sospechoso" de esencia ronda 10⁹–10¹⁰. La
     partida simulada más agresiva del test (12 criaturas al tope, compras codiciosas, todas las chispas)
     hace ~2·10⁶. Esta capa detiene lo descarado (1e30 en la consola, speed
     hacks, eras o Genoma imposibles). Una trampa sutil de ×10 que mantenga coherentes todos los números
     **no se detecta**. El test `ranking-validate` simula una partida real muy agresiva (criaturas al
     máximo, compras codiciosas, todas las chispas, extinciones): nunca la rechaza ni la marca, y su
     mayor intervalo usa el 0,05 % del techo.
5. **Integridad en el cliente** (`src/net/integrity.ts`). Viaja en cada envío y cualquier aviso marca la
   entrada:
   - `speedHack`: `performance.now()` y `Date.now()` divergen más de un 25 % en varias ventanas de 30 s
     sin pausas (dormir el portátil o una pestaña en segundo plano no cuentan);
   - `clockRollback`: el reloj retrocede más de 10 min respecto a la marca más alta vista, o la partida
     guardada tiene fecha futura (`savedAt`);
   - `tampered`: una partida guardada o importada cuyo checksum no cuadra, o una importación con números
     implausibles según las mismas reglas del servidor;
   - `debug`: alguien leyó `window.bioluma`.

   Quien edite el JavaScript puede apagarlos todos.

## Almacenamiento: Vercel Blob (plan gratuito) y cuotas

El plan Hobby incluye **2 000 operaciones avanzadas al mes** (`put`, `copy`, `list` y navegar el store
desde el panel). Al pasarse, **Blob queda bloqueado 30 días**. Un `put` por envío agotaría la cuota con un
solo jugador en pocos días, así que `server/blob.ts` funciona con **escritura diferida**:

- Cada instancia acumula en memoria los envíos aceptados. Como mucho una vez por
  `LEADERBOARD_FLUSH_MINUTES` (60 por defecto) **entre todas las instancias**, se escriben 2 blobs:
  `players.json` (todos los jugadores, máximo 3 000; se descartan los más inactivos que no están en
  ninguna tabla) y `boards.json` (top 200 por tabla, derivado de `players.json`).
  Coste: 2 × 24 × 30 ≈ **1 440 puts/mes** con 60 min. Fórmula: `puts/mes ≈ 86 400 / minutos`.
  No bajes de ~45 min en Hobby.
- Concurrencia: antes de escribir, la instancia relee `players.json` sin caché (`?cache=0`), mezcla jugador
  por jugador y escribe con `x-if-match` (bloqueo optimista; si otro escribió antes, reintenta).
  - Gana el registro más nuevo.
  - Las marcas se suman.
  - Los récords se quedan con el máximo.
  - Ante dos claves para un mismo id, gana la primera registrada.
  - `boards.json` es "el último que escribe gana", lo cual no importa porque siempre se deriva de un
    `players.json` recién leído.
- Precio de este diseño:
  - Las tablas públicas van con **hasta ~1 h de retraso**. Para compensar, el cliente muestra tu propia
    fila con los datos de tu último envío aceptado.
  - Si una instancia muere antes de escribir, se pierde lo que tenía pendiente. No es grave: el cliente
    reenvía cada 5 min.
- Usa un store **privado**. Los datos no son secretos (claves públicas y puntuaciones), pero nadie más
  necesita leerlos.
- Sin credenciales de Blob, la API usa un **almacén en memoria por instancia**: no rompe nada, pero no
  sirve en producción. En Vercel, `submit` y `leaderboard` son funciones distintas con memorias distintas.
  Úsalo solo para tests y desarrollo.
- El protocolo REST de Blob (versión 12 de la API, el que usa `@vercel/blob` 2.8.0) está aislado en
  `server/blob.ts`. Si Vercel lo cambia, solo hay que tocar ese archivo.
- Para más jugadores, la interfaz `LeaderboardStore` (`server/store.ts`) permite otro backend, como Upstash
  Redis desde el Marketplace de Vercel, también gratis, con 500 000 comandos al mes.

### Variables de entorno en Vercel

| Variable | ¿Obligatoria? | Uso |
|---|---|---|
| `BLOB_READ_WRITE_TOKEN` | Sí (o la siguiente) | Token del store Blob. Se crea solo al crear el store y conectarlo al proyecto. |
| `BLOB_STORE_ID` | Alternativa | Id del store + OIDC de Vercel (cabecera `x-vercel-oidc-token`), si no hay token. |
| `LEADERBOARD_FLUSH_MINUTES` | No (60) | Minutos mínimos entre escrituras a Blob. |
| `LEADERBOARD_BLOB_PREFIX` | No (`bioluma-leaderboard/v1`) | Ruta dentro del store. **Pon otra en Preview** (p. ej. `bioluma-leaderboard/preview`) para que las pruebas no ensucien el ranking real. |
| `LEADERBOARD_ALLOWED_ORIGINS` | No | Orígenes extra permitidos, separados por comas (p. ej. un dominio propio distinto del de la API). |
| `LEADERBOARD_STORE=memory` | No | Fuerza el almacén en memoria. |

`LEADERBOARD_PEPPER` **no hace falta**. Con firmas ECDSA el servidor solo guarda claves públicas, y no hay
ningún secreto que proteger con un pepper.

### Puesta en marcha

1. Vercel → Storage → Create → Blob, con acceso **Private**, y conectarlo al proyecto: añade
   `BLOB_READ_WRITE_TOKEN`.
2. En el entorno Preview, `LEADERBOARD_BLOB_PREFIX=bioluma-leaderboard/preview`.
3. Desplegar y comprobar: `curl https://<dominio>/api/leaderboard?board=essence` debe responder `{"ok":true,…}`.

### Moderación manual

No hay panel de administración. Para quitar una marca o expulsar a alguien:

1. Descarga `players.json` (`vercel blob get …`).
2. Edita la entrada: `flagged: false` y `flags: []`, o bórrala.
3. Súbela sobrescribiendo.

Si ese jugador tenía envíos pendientes en alguna instancia, la marca puede volver al mezclar: en ese caso,
repite tras la siguiente escritura. La tabla se regenera en la escritura siguiente.

## Para el integrador

```ts
import { createIntegrity } from './net/integrity';
import { createLeaderboardClient } from './net/leaderboard';

const integrity = createIntegrity();
integrity.checkSave();            // lee 'bioluma.game' antes de que se escriba la primera partida nueva
integrity.noteSavedAt(saved.savedAt);
integrity.start();
const leaderboard = createLeaderboardClient({ game, integrity });
leaderboard.startAutoSubmit();
createUI(root, { …, leaderboard });                 // UIDeps.leaderboard
// importSave(s): integrity.noteImport(s) antes de game.importString(s)
// handle de depuración: integrity.guardDebugHandle(window, 'bioluma', { game, sim, … })
```

- **`public/sw.js` debe ignorar `/api/`.** Hoy sirve las peticiones GET del mismo origen con estrategia
  "caché primero", así que el ranking se quedaría congelado. Añade
  `if (url.pathname.includes('/api/')) return;` en el manejador `fetch`.
- `main.ts` expone hoy `window.bioluma` también en producción (no solo en desarrollo, y el test e2e lo
  usa). Envuélvelo con `guardDebugHandle` en lugar de asignarlo directamente.
- `leaderboard.identity` presta el mismo id y clave a otras APIs firmadas (las compras de `src/store`) y
  nunca firma mensajes con el prefijo del ranking.
- Tests:
  - `tests/unit/ranking-*.test.ts`: protocolo y criptografía, nombres, validación, API de punta a punta y
    Blob con un servidor falso;
  - `src/net/*.test.ts`: cliente contra la API real con fetch simulado, e integridad.
