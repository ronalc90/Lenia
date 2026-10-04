# Bioluma

**Español** · [English](#english)

## Español

**Bioluma** (nombre de trabajo, antes "Petri") es un juego incremental donde la vida artificial de una placa
produce el recurso. Las criaturas son [Lenia](https://github.com/Chakazul/Lenia) de Bert Chan, un autómata celular
continuo que corre en vivo en tu navegador (WebGL2): nada está animado a mano, cada criatura emerge de la
simulación. Siembra materia, descubre especies, provoca una extinción y vuelve con mejores genes.

### Cómo se juega

- **Toca la placa para sembrar.** Cuesta Esencia; la mayoría de las siembras se disuelve, y algunas se estabilizan en
  criaturas que producen Esencia por segundo. Estructura bien formada rinde, masa suelta no.
- **Descubre especies y calibra la regla.** Cada especie nueva entra al bestiario con un multiplicador permanente;
  mover μ y σ en el Calibrador cambia la fauna posible. Toca el **Destello** dorado cuando cruce la placa.
- **Extingue y repite.** Cuando la placa se estanca, provoca una Extinción: ganas Genoma, que compra reglas nuevas, y
  empiezas una Era nueva conservando todo lo descubierto.

Es una PWA móvil primero (vertical, un pulgar), instalable, sin cuenta, **sin anuncios**.

### Ejecutar en local

```bash
npm ci
npm run dev          # servidor de desarrollo (Vite)
npm run build        # typecheck + build de producción en dist/
SINGLE=1 npx vite build   # build de un solo archivo en dist-single/ (para compartir)
```

Requiere Node 22 y un navegador con WebGL2.

### Pruebas

```bash
npm run typecheck    # tsc --noEmit
npm test             # vitest (simulación, detector, economía, ...)
npm run e2e          # prueba de humo con Playwright (ejecuta antes npm run build)
```

### Documentación

[`docs/GDD.md`](docs/GDD.md) (diseño, en español) · [`DECISIONS.md`](DECISIONS.md) (ADR) ·
[`docs/ROADMAP.md`](docs/ROADMAP.md) · [`CLAUDE.md`](CLAUDE.md) (reglas para agentes de IA)

### Créditos y licencia

Las especies, sus nombres y parámetros son del catálogo de Bert Chan (MIT); ver [`CREDITS.md`](CREDITS.md) para el
detalle, los papers y las fuentes. Todo el audio se sintetiza en tiempo de ejecución y no hay arte generado por IA.
Código bajo licencia [MIT](LICENSE), Copyright (c) 2026 ronalc90.

---

## English

**Bioluma** (working title, formerly "Petri") is an incremental game where live artificial life on a dish produces
the resource. The creatures are [Lenia](https://github.com/Chakazul/Lenia) by Bert Chan, a continuous cellular
automaton running live in your browser (WebGL2): nothing is hand-animated, every creature emerges from the
simulation. Seed matter, discover species, trigger an extinction and come back with better genes.

### How to play

- **Tap the dish to seed it.** Seeding costs Essence; most seeds dissolve, some settle into creatures that produce
  Essence per second. Well-formed structure pays, loose mass does not.
- **Discover species and tune the rule.** Each new species joins the bestiary with a permanent multiplier; moving
  μ and σ in the Calibrator changes which fauna can live. Tap the golden **Destello** (glint) when it drifts by.
- **Go extinct and repeat.** When the dish stalls, trigger an Extinction: you earn Genome, which buys new rules, and
  start a new Era keeping everything you discovered.

It is a mobile-first PWA (portrait, one thumb), installable, no account, **no ads**.

### Run locally

```bash
npm ci
npm run dev          # development server (Vite)
npm run build        # typecheck + production build into dist/
SINGLE=1 npx vite build   # single-file build into dist-single/ (shareable)
```

Needs Node 22 and a browser with WebGL2.

### Tests

```bash
npm run typecheck    # tsc --noEmit
npm test             # vitest (simulation, detector, economy, ...)
npm run e2e          # Playwright smoke test (run npm run build first)
```

### Documentation

[`docs/GDD.md`](docs/GDD.md) (design, Spanish) · [`DECISIONS.md`](DECISIONS.md) (ADRs) ·
[`docs/ROADMAP.md`](docs/ROADMAP.md) · [`CLAUDE.md`](CLAUDE.md) (rules for AI agents)

### Credits and license

Species, names and parameters come from Bert Chan's catalog (MIT); see [`CREDITS.md`](CREDITS.md) for details, papers
and fonts. All audio is synthesized at runtime and no AI-generated art is used. Code is [MIT](LICENSE) licensed,
Copyright (c) 2026 ronalc90.
