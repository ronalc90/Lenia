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

- **Inter**, by Rasmus Andersson, and **JetBrains Mono**, by JetBrains. Both are licensed under the
  **SIL Open Font License 1.1**. Currently they are requested from Google Fonts at runtime, with system-font
  fallbacks; they are not redistributed in this repository. If they are ever bundled, their license texts will be
  added next to the font files.
- **Fraunces**, by Undercase Type (Phaedra Charles and Flavia Zimbardi), licensed under the **SIL Open Font License
  1.1** and requested from Google Fonts in the same way. Used for display titles and italic Latin species names
  (ADR-024).

## Audio

**All audio is synthesized at runtime** with the Web Audio API (oscillators, noise, filters, envelopes). The
repository contains no audio files and no samples. jsfxr (public domain / Unlicense) was used only as a design
reference for envelopes, not as a library.

## Art

**No AI-generated art is used in the game.** The app icon (`public/icon.svg`) and the in-game icons are drawn as SVG
by hand/in code; the dish, the creatures and the colormap are rendered live by the simulation. Bestiary portraits and
store screenshots are captured from the game itself.

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
