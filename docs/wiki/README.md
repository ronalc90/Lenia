# docs/wiki

**Español:** esta carpeta es la **fuente de verdad de la wiki de GitHub** de Bioluma. El flujo `.github/workflows/wiki-sync.yml` la copia a la wiki cada vez que un cambio en `docs/wiki/**` entra a `main` (o a mano, en *Actions → Wiki sync*). Edita aquí, no en la web de la wiki.

**English:** this folder is the **source of truth for Bioluma's GitHub wiki**. The `.github/workflows/wiki-sync.yml` workflow copies it to the wiki whenever a change to `docs/wiki/**` lands on `main` (or by hand, in *Actions → Wiki sync*). Edit here, not in the wiki's web editor.

| | Español | English |
|---|---|---|
| Portada | `Home.md` | `Home-en.md` |
| Cómo jugar / How to play | `Cómo-jugar.md` | `How-to-play-en.md` |
| Árbol / Tree | `Árbol.md` | `Tree-en.md` |
| Mundos / Worlds | `Mundos.md` | `Worlds-en.md` |
| Especies / Species | `Especies.md` | `Species-en.md` |
| Noche / Night | `Noche.md` | `Night-en.md` |
| (old pages that point to the new ones) | `Mejoras.md`, `Prestigio-y-Genoma.md` | `Upgrades-en.md`, `Prestige-and-Genome-en.md` |
| Logros / Achievements | `Logros.md` | `Achievements-en.md` |
| Secretos / Secrets | `Secretos.md` | `Secrets-en.md` |
| Preguntas / FAQ | `Preguntas-frecuentes.md` | `FAQ-en.md` |
| Plataformas / Platforms | `Plataformas.md` | `Platforms-en.md` |
| Ciencia / Science | `Ciencia-detrás.md` | `Science-behind-en.md` |
| Desarrollo / Development | `Desarrollo.md` | `Development-en.md` |
| Créditos / Credits | `Créditos.md` | `Credits-en.md` |
| Barra lateral y pie / Sidebar and footer | `_Sidebar.md`, `_Footer.md` | (shared) |

## Reglas / Rules

- File names are page titles (`Cómo-jugar.md` → "Cómo jugar"). Links between pages: `[[Page name]]` or `[[Text|Page-name]]` (the text goes first). Do not use `|` inside table cells with such links.
- `{{GAME_URL}}` is replaced when publishing with the repository variable `GAME_URL`. Do not hard-code the game's address here.
- Tone: short sentences, friendly, understandable by a 5-year-old, and a bit of fun. Spanish first; keep both languages in sync.
- **`Secretos` / `Secrets` must stay spoiler-free.** Never describe hidden content in the wiki.
- Images live in `images/` and are generated from the real game, played like a player: `node tests/e2e/wiki-shots.mjs` (it runs `tests/e2e/session-play.mjs`; see the header of both files). Names: `m-NN-*` Spanish phone, `en-NN-*` English phone, `d-NN-*` desktop. Keep each PNG under 400 KB.
