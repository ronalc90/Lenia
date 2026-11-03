# Credits and licenses

Bioluma is free, has no ads and uses no AI-generated art. This file lists everything the game owes to other people.

## The species catalog and names: Bert Chan's Lenia

The creature catalog, the species names (*Orbium unicaudatus*, *Gyrorbium gyrans*, ...) and their parameters come from
Bert Chan's **Lenia** project, <https://github.com/Chakazul/Lenia> (`Python/animals.json`), which is distributed under
the MIT License:

```
MIT License

Copyright (c) 2018 Bert Chan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Bioluma ships a curated subset of 26 of the catalog's species (`src/sim/catalog.json`), with parameters and RLE
patterns unchanged, and names used as in the catalog. Columns: catalog code, name, kernel radius `R`, time resolution
`T` (`dt = 1/T`), ring peaks `b`, growth center `mu` and width `sigma`.

| Code | Species | R | T | b | mu | sigma |
|---|---|---|---|---|---|---|
| `O2u` | *Orbium unicaudatus* | 13 | 10 | 1 | 0.15 | 0.015 |
| `O2b` | *Orbium bicaudatus* | 13 | 10 | 1 | 0.15 | 0.014 |
| `O2ui` | *Orbium unicaudatus ignis* | 13 | 10 | 1 | 0.11 | 0.012 |
| `O4s` | *Synorbium solidus* | 13 | 10 | 1 | 0.122 | 0.0106 |
| `O2p` | *Orbium phantasma* | 13 | 40 | 1 | 0.13 | 0.009 |
| `OG2r` | *Gyrorbium revolvens* | 13 | 10 | 1 | 0.133 | 0.0177 |
| `O4i` | *Synorbium ignis* | 13 | 10 | 1 | 0.152 | 0.0156 |
| `OG2g` | *Gyrorbium gyrans* | 13 | 10 | 1 | 0.156 | 0.0224 |
| `O4d` | *Parorbium dividuus* | 13 | 10 | 1 | 0.174 | 0.022 |
| `O4a` | *Parorbium adhaerens* | 13 | 10 | 1 | 0.23 | 0.0323 |
| `H3cp` | *Helicium cavus pedes* | 13 | 10 | 1 | 0.22 | 0.034 |
| `P3sp` | *Synptera sinus pedes* | 13 | 10 | 1 | 0.22 | 0.035 |
| `PG1c` | *Gyropteron cavus* | 13 | 10 | 1 | 0.25 | 0.04 |
| `PG1a` | *Gyropteron arcus* | 13 | 10 | 1 | 0.283 | 0.0481 |
| `S1v` | *Scutium valvatus* | 13 | 10 | 1 | 0.283 | 0.0461 |
| `S1s` | *Scutium solidus* | 13 | 10 | 1 | 0.29 | 0.045 |
| `SN+` | *Catenoscutium bidirectus* | 13 | 10 | 1 | 0.29 | 0.0432 |
| `H3s` | *Helicium solidus* | 13 | 10 | 1 | 0.35 | 0.06 |
| `S2s` | *Discutium solidus* | 13 | 10 | 1 | 0.356 | 0.063 |
| `H5s` | *Pentahelicium solidus* | 13 | 10 | 1 | 0.34 | 0.045 |
| `C0v` | *Circium ventilans* | 13 | 10 | 1 | 0.38 | 0.07 |
| `PS3am` | *Pyroscutium ambiguus* | 13 | 10 | 1 | 0.349 | 0.0605 |
| `S3s` | *Triscutium solidus* | 13 | 10 | 1 | 0.4 | 0.0797 |
| `P4cp` | *Paraptera cavus pedes* | 13 | 10 | 1 | 0.3 | 0.0454 |
| `3GH2n` | *Hydrogeminium natans* | 18 | 10 | 1/2,1,2/3 | 0.26 | 0.036 |
| `K4d` | *Kronium dividuus* | 18 | 10 | 1,1/3 | 0.24 | 0.03 |

The catalog was fitted with Chan's polynomial kernel and growth (`kn = 1`, `gn = 1`); Bioluma implements exactly that
rule (ADR-002 in `DECISIONS.md`), so the parameters above are used without modification.

## Papers

- Bert Wang-Chak Chan. **"Lenia: Biology of Artificial Life."** *Complex Systems* 28(3), 2019.
  arXiv:[1812.05433](https://arxiv.org/abs/1812.05433).
- Bert Wang-Chak Chan. **"Lenia and Expanded Universe."** *ALIFE 2020: The 2020 Conference on Artificial Life*, 2020.
  arXiv:[2005.03742](https://arxiv.org/abs/2005.03742).

Chan's WebGL demos (for example `lenia4param.glsl`) were read as a reference for the approach and **reimplemented
from scratch**; no shader code from them is included (that file carries no explicit license).

## Detector heuristics

The thresholds and ideas behind the creature detector (dead, exploded, stable, moving, oscillating, spinning,
dividing) are inspired by, and reimplemented from, published research code. No code is copied. See ADR-017 in
`DECISIONS.md`.

- **Flowers team (Inria), `sensorimotor-lenia-search`**, `expe/calc_categories.py`:
  <https://github.com/flowersteam/sensorimotor-lenia-search>.
- **Leniabreeder**, Maxence Faldor and Antoine Cully, *"Toward Artificial Open-Ended Evolution within Lenia using
  Quality-Diversity"* (ALIFE 2024): <https://github.com/maxencefaldor/Leniabreeder>.
- Parameter ranges for the Calibrator follow the published sweep of 0.1 < mu < 0.5 and sigma < 0.1 at R = 13
  (Hudcova et al., arXiv:[2601.01932](https://arxiv.org/abs/2601.01932)).

## Fonts

- **Fraunces**, by Undercase Type (Phaedra Charles and Flavia Zimbardi), **SIL Open Font License 1.1**. Used for
  display titles and italic Latin species names (ADR-024). Served by the game itself since the polish pass
  (docs/ARTE-PULIDO.md §7.1): the latin subset of the variable font (roman: weights 500–800, `opsz`, `SOFT` 100;
  italic: 500–700) as obtained from Google Fonts, unmodified, in `public/fonts/`, licence in
  `public/fonts/OFL-Fraunces.txt`. Source: <https://github.com/undercasetype/Fraunces>.
- **Inter**, by Rasmus Andersson (The Inter Project Authors), **SIL Open Font License 1.1**: the latin subset of the
  variable font (400–800), self-hosted in `public/fonts/`, licence in `public/fonts/OFL-Inter.txt`.
  Source: <https://github.com/rsms/inter>.
- **JetBrains Mono**, by JetBrains, **SIL Open Font License 1.1**: the latin subset (500–700), self-hosted in
  `public/fonts/`, licence in `public/fonts/OFL-JetBrainsMono.txt`. Source: <https://github.com/JetBrains/JetBrainsMono>.
- The font data is unmodified (each file name carries a content hash, a cache key); the service worker keeps them
  for offline play. The dev pages (`*-dev.html`) still request them from Google Fonts.

## Audio

**All audio is synthesized at runtime** with the Web Audio API (oscillators, noise, filters, envelopes). The
repository contains no audio files and no samples. jsfxr (public domain / Unlicense) was used only as a design
reference for envelopes, not as a library.

## Art

**No AI-generated art is used in the game.** The app icon (`public/icon.svg`) and the in-game icons are drawn as SVG
by hand/in code; the dish, the creatures and the colormap are rendered live by the simulation. Apart from the PNG
renderings of that icon, the only raster images in the game are the archive photographs listed below. Bestiary portraits and
store screenshots are captured from the game itself.

### Reference photographs (repository only, never shipped)

`docs/arte-realista/referencias/` holds five photographs that the artists trace over in the dev art page
(docs/ARTE-REALISTA.md §3.3). They are **not** part of any build. Each sits next to a `.txt` with its source and
licence; all are downscaled copies.

| File | Author | Source | Licence |
|---|---|---|---|
| `ref-guante-nitrilo.jpg` | Tjwood | <https://commons.wikimedia.org/wiki/File:Disposable_nitrile_glove.jpg> | Public domain (released by the author) |
| `ref-cuaderno-lbnl-1941.jpg` | Daderot | <https://commons.wikimedia.org/wiki/File:Lab_book_-_Lawrence_Berkeley_National_Laboratory_-_DSC08822.JPG> | Public domain (released by the author) |
| `ref-incubadora-co2-binder.jpg` | Shinryuu | <https://commons.wikimedia.org/wiki/File:Binder_CB_210_incubator_interior.jpg> | Public domain (released by the author) |
| `ref-incubadora-guantes-cdc-1978.jpg` | CDC / Betty Partin | <https://wwwn.cdc.gov/phil/Details.aspx?pid=31827> | Public domain (US federal government work) |
| `ref-panel-incubadora-co2.jpg` | Darja.Lavogina | <https://commons.wikimedia.org/wiki/File:CO2_inkubaator_rakukultuur_DL20221105.jpg> | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (rescaled and recompressed) |

The VELA prototype in `docs/arte-realista/prototipo/` (code and its two renders) was written for this project.

## Fotografías de archivo (archive photographs)

Since ADR-029 the intro and a few scenes show **archive photographs taken by people** in still shots: public domain
or CC BY, none generated, none of an identifiable person. They ship in `public/art/photos/` (WebP, 226 KB in all,
each under 50 KB) and the game lists the same credits on its Credits screen (`PHOTOS` in `src/ui/art/photos.ts`).
Every photo was **recortada, reescalada y recomprimida** for the game: downscaled (all but two) and recompressed to
WebP here, and cropped and darkened on screen by the scene that shows it, if it needs to (each one's changes are
below).
The full provenance of each file (title, date, why it is not AI, intended use) is in `docs/arte-realista/fotos/`.
**No agency or institution named here endorses Bioluma**; no logo of theirs is used.

| File | What | Author / credit | Source | Licence | Changes |
|---|---|---|---|---|---|
| `estacion-aurora-noaa.webp` | Aurora australis and the Milky Way over the NOAA Atmospheric Research Observatory, South Pole (2013) | Ross Burgener, NOAA/OAR/ESRL/GMD; **NOAA Photo Library** (image anta0151) | <https://commons.wikimedia.org/wiki/File:Aurora_australis_and_Milky_Way_seen_over_NOAA_Atmospheric_Research_Observatory_at_South_Pole_Station_(19771223522).jpg> (via <https://www.flickr.com/photos/noaaphotolib/19771223522/>) | Public domain, US federal government work ([PDM 1.0](https://creativecommons.org/publicdomain/mark/1.0/)); the Flickr copy also carries [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/), which this credit satisfies | 4272 × 2830 → 900 × 596, WebP; may be cropped and darkened on screen; the station is never named in the game |
| `cupula-aurora-nsf.webp` | The geodesic dome of Amundsen-Scott South Pole Station under the aurora australis (2002) | Jonathan Berry, **National Science Foundation** | <https://commons.wikimedia.org/wiki/File:Amundsen-Scott_dome_Aurora_1.jpg> | Public domain, US federal government work ([PDM 1.0](https://creativecommons.org/publicdomain/mark/1.0/)) | 2100 × 1575 → 800 × 600, WebP; may be cropped and darkened on screen |
| `placa-microscopio-nci.webp` | A tissue culture dish under a microscope, gloved hands adjusting it (1980) | Linda Bartlett, **National Cancer Institute** (NCI Visuals Online, image 2006) | <https://commons.wikimedia.org/wiki/File:Petri_dish.jpg> | Public domain, US federal government work ([PDM 1.0](https://creativecommons.org/publicdomain/mark/1.0/)) | 2700 × 1800 → 960 × 640, WebP; may be cropped and darkened on screen |
| `pipeta-guante-csiro.webp` | "CSIRO researcher with pipette", a gloved hand using a pipette (2010) | **Morgan Brown / CSIRO** (CSIRO ScienceImage 11401) | <https://commons.wikimedia.org/wiki/File:CSIRO_ScienceImage_11401_CSIRO_researcher_with_pipette.jpg> | **[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)** | 1771 × 2657 → 640 × 960, colour-graded, WebP; may be cropped and darkened on screen |
| `pipeteo-nci.webp` | "Pipetting", gloved hands attaching a pipette to a pipet aid (2005) | Diane A. Reid, **National Cancer Institute** (NCI Visuals Online, image 3870) | <https://commons.wikimedia.org/wiki/File:Pipetting_(1).jpg> | Public domain, US federal government work ([PDM 1.0](https://creativecommons.org/publicdomain/mark/1.0/)) | 2284 × 1815 → 960 × 763, WebP; may be cropped and darkened on screen |
| `congelador-guante-cdc.webp` | A gloved hand storing influenza samples in a freezer (2017) | **CDC** / Emily Cramer (content provider), Todd Jordan (videographer); CDC Public Health Image Library, PHIL 22155 | <https://wwwn.cdc.gov/phil/Details.aspx?pid=22155> | Public domain, US federal government work; credit as the CDC asks, no endorsement implied ([CDC terms](https://www.cdc.gov/other/agencymaterials.html)) | 700 × 393 JPEG → WebP; may be cropped and darkened on screen |
| `incubadora-hearson-eb1911.webp` | "Hearson's Bacteriological Incubator, petroleum lamp", engraving, fig. 9 of "Incubators" (1911) | Anonymous engraver, **Encyclopaedia Britannica**, 11th edition | <https://commons.wikimedia.org/wiki/File:EB1911_Incubators_-_Fig._9.%E2%80%94Hearson%E2%80%99s_Bacteriological_Incubator,_petroleum_lamp.jpg> | Public domain (published 1911; [PDM 1.0](https://creativecommons.org/publicdomain/mark/1.0/)) | 448 × 618 scan → lossless WebP in 8 greys; may be cropped on screen |

The two NCI photos were checked on their Wikimedia Commons pages, which copy NCI's record fields ("Reuse
Restrictions: None" for image 3870); NCI Visuals Online itself could not be reached when they were added, so check those two records again before
a store release.

## Code

Bioluma's own code is MIT licensed, Copyright (c) 2026 ronalc90; see [`LICENSE`](LICENSE). Build tooling (Vite,
TypeScript, Vitest, Playwright) is used under its own licenses and is not redistributed in the game bundle.

## Support

Bioluma has no ads. If you want to support it, there will be a donation link in the in-game Credits screen;
donating gives no in-game advantage. An optional **cosmetic-only** store (palettes, dish themes, effects, music
ambiences, ranking badges) exists in the code but is switched off (`STORE_ENABLED = false`, ADR-021); nothing in it
gives any gameplay advantage.

## Payments (only when the store is switched on)

- **lemon.js**, by Lemon Squeezy (the Merchant of Record for web payments), is **not bundled**: it loads lazily from
  `https://app.lemonsqueezy.com/js/lemon.js` only when a player opens a checkout, and never otherwise. Google Play
  Billing and Steam use the platforms' own clients. No payment SDK ships in the game bundle.
