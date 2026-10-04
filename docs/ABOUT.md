# Cuadro "About" del repositorio, wiki y enlace del juego

Todo lo que el dueño del repositorio (`ronalc90/Lenia`) debe copiar y pegar, **en orden**. Son unos 5 minutos.
Dirección del juego: https://bioluma-xi.vercel.app (ya aplicada en el README y en la wiki).

## 1. El texto exacto

**Description** (300 caracteres; el máximo de GitHub es 350):

```text
Bioluma: juego incremental de vida artificial. Siembra luz y mira nacer criaturas Lenia reales, en vivo en tu navegador (WebGL2). Descubre especies, provoca una extinción y vuelve más fuerte. Gratis, sin anuncios, PWA. / Incremental game of real artificial life (Lenia) in your browser. Free, no ads.
```

**Website:**

```text
https://bioluma-xi.vercel.app
```

*(Es un marcador: quien integre lo cambia por la dirección real del juego, por ejemplo `https://bioluma.example`. Si todavía no hay dirección, deja el campo vacío; no pegues el marcador.)*

**Topics** (20, el máximo de GitHub; se escriben una por una o separadas por espacios):

```text
lenia artificial-life incremental-game idle-game clicker-game webgl2 webgl pwa typescript vite cellular-automata browser-game mobile-game generative-art game procedural-audio emergence simulation no-ads free-game
```

## 2. Pegarlo en GitHub, paso a paso

1. Entra a **https://github.com/ronalc90/Lenia**.
2. A la derecha, junto a **About**, toca el **engranaje** (⚙).
3. En **Description**, pega la descripción de arriba.
4. En **Website**, pega la dirección del juego. (Marcar *"Use your GitHub Pages website"* no hace falta.)
5. En **Topics**, pega las palabras una por una (cada una se confirma con Enter o con un espacio).
6. Deja marcadas **Releases** y **Deployments** si quieres verlas en la barra lateral; **Packages** puede ir apagado.
7. Toca **Save changes**.

**Alternativa por terminal** (con la CLI de GitHub, `gh auth login` antes):

```bash
gh repo edit ronalc90/Lenia \
  --description "Bioluma: juego incremental de vida artificial. Siembra luz y mira nacer criaturas Lenia reales, en vivo en tu navegador (WebGL2). Descubre especies, provoca una extinción y vuelve más fuerte. Gratis, sin anuncios, PWA. / Incremental game of real artificial life (Lenia) in your browser. Free, no ads." \
  --homepage "https://TU-DIRECCION-DEL-JUEGO" \
  --enable-wiki \
  --add-topic lenia,artificial-life,incremental-game,idle-game,clicker-game,webgl2,webgl,pwa,typescript,vite,cellular-automata,browser-game,mobile-game,generative-art,game,procedural-audio,emergence,simulation,no-ads,free-game
```

### Imagen para compartir (opcional, muy recomendable)

Cuando alguien pega el enlace del repositorio en un chat o en una red social, se ve esta imagen.

1. **Settings → General → Social preview → Edit → Upload an image**.
2. Sube [`docs/wiki/images/social-preview.png`](wiki/images/social-preview.png) (1280 × 640).

## 3. Activar la wiki

Las páginas ya están escritas en [`docs/wiki/`](wiki/). Un flujo de trabajo las copia a la wiki de GitHub, pero **GitHub solo crea la wiki cuando existe su primera página**. Haz esto **una sola vez**:

1. **Settings → General → Features** y marca **Wikis**.
   - Marca también **"Restrict editing to users in teams with push access"** (recomendado). La fuente de verdad es `docs/wiki/`; lo que se edite en la web de la wiki se pierde en la siguiente sincronización.
2. Abre la pestaña **Wiki** del repositorio y toca **Create the first page**.
3. Deja el título `Home`, escribe cualquier texto (por ejemplo `Pronto`) y toca **Save page**. Esa página se reemplaza sola en el paso 5.
4. *(Opcional)* Crea la variable con la dirección del juego: **Settings → Secrets and variables → Actions → Variables → New repository variable**.
   - **Name:** `GAME_URL`
   - **Value:** la dirección del juego (por ejemplo `https://bioluma.example`).
   - Sin esta variable, los botones "Jugar ahora" de la wiki llevan a la página del repositorio.
5. Entra a **Actions → Wiki sync → Run workflow** (rama `main`). Tarda menos de un minuto.
6. Abre la pestaña **Wiki** y recarga: debe aparecer la portada con la imagen grande, la barra lateral y el pie de página.

A partir de ahí, **cada cambio en `docs/wiki/**` que entre a `main` actualiza la wiki solo**.

### Si algo sale mal

| Qué ves | Qué significa | Qué hacer |
|---|---|---|
| El trabajo termina en verde con el aviso *"Wiki not initialised"* | Todavía no existe la primera página de la wiki, o las Wikis están apagadas | Repite el apartado 3, pasos 1 a 3, y vuelve a ejecutar el flujo |
| *"GAME_URL not set"* | Falta la variable del apartado 3, paso 4 | Créala (es solo un aviso; la wiki se publica igual) |
| Error al hacer `push` (403) | La organización limita los permisos del `GITHUB_TOKEN` | **Settings → Actions → General → Workflow permissions → Read and write permissions** |
| Los enlaces de la barra lateral salen en rojo | Falta alguna página | Mira que existan los 26 archivos de páginas de `docs/wiki/` (sin contar `README.md`, que no se publica) y vuelve a ejecutar |
| Las imágenes no se ven | Las imágenes no entraron al commit | Comprueba que `docs/wiki/images/` está en `main` |

## 4. Para quien integra (antes de entregar al dueño)

Hay que reemplazar el marcador de la dirección del juego (`GAME_URL` entre llaves dobles) por la dirección real en **dos sitios**:

1. [`README.md`](../README.md): aparece en la imagen grande y en el enlace "Jugar ahora / Play now". Con una sola orden:

   ```bash
   sed -i 's|{{GAME_URL}}|https://TU-DIRECCION-DEL-JUEGO|g' README.md
   ```

2. El campo **Website** de la sección 1 de este archivo (a mano).

**No** hay que tocar `docs/wiki/`: sus marcadores se reemplazan al publicar, con la variable del repositorio `GAME_URL` (apartado 3, paso 4).

Comprobación final (no debe imprimir nada):

```bash
grep -n "{{GAME_URL}}" README.md
```
