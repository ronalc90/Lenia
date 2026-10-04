# Bioluma — Story: «La noche de la Estación Vigilia» / "The Night at Vigil Station"

> Story bible, beat sheet and integration notes for the story layer (`src/story/`, `src/ui/story/`).
> Plot in Spanish first, then English. Owner's requests: an **animated tutorial with a story**, **several endings**,
> characters and animations made for the plot; and (later) *"clean, clear, understandable even for a 5-year-old,
> yet extremely fun"*. This document supersedes GDD §3's "no cinematics, no dialogue, only the Journal" — see §9 for the
> proposed ADR.

---

## 0. Research: how small games tell big stories (and what we take from each)

| Source | What they do | What Bioluma takes |
|---|---|---|
| **Universal Paperclips** ([IF50 essay](https://if50.substack.com/p/2017-universal-paperclips), [Wikipedia](https://en.wikipedia.org/wiki/Universal_Paperclips)) | The story *is* the progression: each phase changes the verbs; "an implicit story told in numbers". The ending is a choice that doubles as a prestige restart. | Prestige (Extinction) is the narrative clock: eras are nights. The final choice ends *and* continues ("continue the experiment"). The Harvest ending is told with a counter. |
| **A Dark Room** ([GDC narrative review, A. Davis](https://media.gdcvault.com/GDC+2021/ArthurDavis_ADarkRoomNarrativeReview.pdf), [Slate](https://slate.com/technology/2014/05/a-dark-room-the-cormac-mccarthy-of-text-based-iphone-games.html)) | Terse lines, silences the player fills; the strongest moment *recontextualises a mechanic you already used* ("they are slaves"). | The twist recontextualises the golden **Spark** the player has been catching for days: it is the Choir's memory of Albor calling her back. Lines stay terse; gaps are left open. |
| **Cookie Clicker – Grandmapocalypse** ([wiki](https://cookieclicker.fandom.com/wiki/Grandmapocalypse), [lore explained](https://dinogame.gg/blog/cookie-clicker-grandma-lore/)) | Lore is incidental (ticker, tooltips), never a cutscene; a moral choice that costs production deconstructs the genre. | Committee telexes are deadpan and incidental; the "send the sample" choice trades ethics for the yield fantasy without touching the economy. |
| **Outer Wilds** ([Game Developer: show, don't tell](https://www.gamedeveloper.com/business/explaining-the-value-of-show-don-t-tell-storytelling-in-i-outer-wilds-i-), [curiosity talk](https://www.gdcvault.com/play/mediaProxy.php?sid=1027008)) | Knowledge-based progression; fragments that click into a "web of knowledge". | Three tapes + anomalies are fragments; the truth only clicks in Act III. Nothing is explained before the player has *seen* it on the dish. |
| **Inscryption** ([Game Wisdom](https://game-wisdom.com/analysis/inscryption), [GDC 2022 postmortem](https://gamedeveloper.com/gdc2022/inscryption-s-journey-from-game-jam-joint-to-cult-classic)) | A meta layer: the player is observed while observing. | The secret ending pulls back: the station's lights form an Orbium inside *someone's* eyepiece. "I don't know who discovered whom." |
| **Portal / GLaDOS** ([Game Developer](https://www.gamedeveloper.com/design/how-glados-solved-one-of-i-portal-s-i-biggest-problems)) | A tutorial voice gave the puzzles purpose; the guide becomes the story. | The tutorial *is* VELA's introduction; VELA's secret (Albor's instruction) is the Act III turn. Kind, not villainous — tone matters. |
| **Spiritfarer** ([GDC narrative review](https://media.gdcvault.com/GDC+2022/Game+Narrative+Poster+Review/Meng+Paper.pdf)) | Each character has one consistent voice; farewells are rituals the player chooses when to perform. | Strict voice sheets (§2); the Extinction "lamp" is a small ritual the player may keep. |
| **Undertale** ([multiple endings](https://tvtropes.org/pmwiki/pmwiki.php/MultipleEndings/Undertale)) | Endings decided by *how you played*, not only by a final button. | Leanings computed from playstyle (Genome branch, prints, calibrations, behaviours, choices) pick the two options of the final question. |
| **Kishōtenketsu** ([explainer](https://blog.celtx.com/what-is-kishotenketsu-defined), [in game design](https://timmykokke.com/blog/2023/2023-05-17-kishotenketsu/)) | Introduction, development, *twist without conflict*, reconciliation. | Acts: Ki = tutorial, Shō = anomalies, Ten = "the Spark is a memory / the dish learns you", Ketsu = dawn. The antagonist (Committee) is a foil, not a boss. |
| **Branch-and-bottleneck / foldback** ([sub-Q](https://sub-q.com/making-interactive-fiction-the-branch-and-the-merge/), [TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/BranchAndBottleneckPlotStructure)) | Choices diverge briefly and fold back into fixed beats; avoids combinatorial explosion. | Every mid-game choice has its own reply, journal line and a delayed echo (audit telex, lamp glow, answered rhythm), then folds back. Only the ending branches. |
| **Emily Short on choice** ([storylets & mechanics as choice](https://emshort.blog/2020/01/09/casual-games-and-storylets-or-how-to-make-game-mechanics-express-choice/), [choice poetics](https://emshort.blog/2019/04/09/choice-poetics-peter-mawhorter/)) | Avoid blind/false choices; frame stakes; track *cumulative trends* of play; storylets unlock by state. | Each choice states its stakes in the line before it; leanings track trends; scenes are condition-gated storylets. The archive shows "where your night is heading". |
| **Character voice** ([Writers Helping Writers](https://writershelpingwriters.net/2026/07/write-memorable-character-voices/)) | Emotional default, diction, syntax, rhythm, register, tics; lines must stand alone. | Voice sheet per character (§2); every line works out of context (scenes can be skipped or replayed). |
| **Environmental storytelling** ([Smith & Worch, "What happened here?"](https://www.worch.com/2010/03/11/gdc-2010/)) | The space tells its history; systems can react narratively. | Hints are light drawn *around real creatures* (constellations, echoes, threads to your tap). Pillar 1 holds: the sim is never faked. |
| **Frog Fractions** ([Game Developer](https://www.gamedeveloper.com/design/-i-frog-fractions-2-i-surprising-players-who-expect-to-be-surprised)) & **Candy Box** ([Kill Screen](https://www.killscreen.com/candy-box-2-and-beauty-smart-stupid-game/)) | Surprise needs an expectation first; restraint and slow reveal. | Act I is deliberately "just a cosy tutorial", so the Choir copying your rhythm lands as a surprise. |

**Principles applied (checklist)**

1. **Mechanics are the plot.** Every story fact explains a mechanic (table in §1.3).
2. **Show, don't tell.** VELA points, reacts and celebrates; the dish shows anomalies before anyone names them.
3. **Short and skippable.** Tutorial bubbles ≤ 12 words, all lines ≤ 20 (tests enforce it); 1–6 lines per scene; every scene has "Skip"; nothing pauses the game.
4. **Recontextualise one mechanic.** The golden Spark — a pure "fun layer" reward — becomes the emotional key.
5. **Meaningful, framed choices**, few of them (3 + final), with delayed echoes, folding back.
6. **Endings by playstyle + one explicit choice**, never a hard stop: *Continue the experiment*.
7. **A completionist secret** that rewards the core loop (all seed species, all behaviours) plus one act of listening.
8. **Respect the creatures.** No anthropomorphising beyond "it seems to look for something"; the Choir speaks only in dots and, later, three borrowed words.

---

## 1. Premisa (español)

### 1.1 Sinopsis

Llegas a la **Estación Vigilia**, un laboratorio en una isla polar, justo cuando empieza la **noche polar**: cuatro meses
sin sol. La única luz es la que crece en una placa de cultivo. Te recibe **VELA**, la asistente del laboratorio: un
robotito con forma de matraz y una llama de vela en el tapón, alegre, precisa y un poco nerviosa («Es un acrónimo.
Nadie sabe de qué»). La científica anterior, la **doctora Albor**, se fue antes de la noche. Nadie te dice por qué.

**Acto I · Noche polar (Era 1, el tutorial).** VELA te enseña a sembrar, a fallar sin miedo, a reconocer la primera
criatura («Tiene borde. Tiene forma. ¡Se queda!»), la Esencia, el Gotero, el Bestiario, el Calibrador. Aparece el
**Destello**, una chispa dorada que «empezó a aparecer cuando ella se fue». Llegan los primeros télex del **Comité de
Rendimiento**, que paga la luz y habla en mayúsculas. Cuando la placa madura, VELA cuenta que Albor dejaba la lámpara
encendida antes de esterilizar, «para que no se vayan a oscuras». **Primera decisión.**

**Acto II · Cosas raras (Eras 2–5).** La placa no debería recordar nada, pero tras cada Extinción reconoce a cada
especie al instante. VELA encuentra las **cintas de Albor**: las especies vuelven «como golondrinas»; lo que los
informes llaman *genoma*, ella lo llamaba *memoria*. El Destello rodea a las criaturas como si saludara. Las criaturas
dibujan figuras sobre la placa. Luego el zumbido repite **tu propio ritmo de siembra** con una nota de más, como una
pregunta: Albor las llamaba **el Coro**. El Comité exige la mejor especie para copiarla mil veces (**segunda
decisión**). Y la tercera: **contestar al Coro o recalibrar** la placa para quitar «ese ruido». VELA admite que guarda
un secreto: «Te lo cuento pronto. Anotado: pronto».

**Acto III · Primera luz (Eras 6+).** La confesión: el Comité quería una fábrica de una sola especie; Albor dijo que no
y se fue, y le dejó a VELA un encargo: *«Busca a alguien que escuche. Que primero se enamore»*. La última cinta revela
la verdad: **la placa recuerda todo, y el Destello es lo que el Coro aprendió de Albor —una luz que las miraba cada
noche—, una imitación para llamarla.** Ahora te miran a ti: serán lo que tú les enseñes. El Coro habla, tres palabras
cada vez, con **tus** palabras de la Bitácora. El Destello cambia **al color de tu manera de jugar**. En el horizonte,
una línea gris: la noche se acaba. Albor volverá con el *albor* (su nombre significa «la primera luz del día»). Y el
Coro pregunta: **«¿qué somos para ti?»**.

### 1.2 La verdad oculta (para guionistas)

El medio de la placa conserva memoria entre Extinciones: por eso las esporas salen de plantillas conocidas, el
Bestiario sobrevive y existe el Genoma. Las criaturas, juntas, forman el **Coro**, una mente lenta que aprende de quien
las observa. Durante años aprendieron de Albor: su linterna nocturna se convirtió en el **Destello**, un eco que reparte
regalos (como ella les daba nutrientes) y que apareció cuando ella faltó, para llamarla. Desde que llegas, el Coro
**te aprende a ti**: tu ritmo, tus palabras, tu forma de tratarlas. El final no lo decide un botón, lo decide lo que
les enseñaste; el botón solo elige cuál de tus dos maneras de ser se queda. En el final secreto, la recursión se
completa: alguien, desde muy arriba, mira la estación como tú miras la placa.

### 1.3 Por qué encaja con las mecánicas

| Mecánica | Significado en la historia |
|---|---|
| Esporas con plantilla del catálogo | La placa «recuerda» a las especies y las devuelve |
| El Bestiario sobrevive a la Extinción | «La placa no debería recordar nada» (Acto II) |
| Genoma | Albor: «lo llamo genoma porque suena a ciencia; es memoria» |
| Extinción (prestigio) | Cada Era es una noche; el ritual de la lámpara |
| Destello dorado | El recuerdo de Albor hecho luz; sus regalos son su ayuda |
| Calibrar μ / σ | Las leyes de su mundo; recalibrar = silenciarlas |
| Imprimir especies | La fábrica del Comité (rinde, pero no canta) |
| Audio: cada especie suma un parcial | El canto del Coro |
| Bitácora | Tu voz; el Coro aprende tus palabras |
| Árbol de Genoma (Reglas / Herencia / Fauna) | Ley / Memoria / Marea: tres maneras de cuidar |

---

## 1 (EN). Premise

### Synopsis

You arrive at **Vigil Station**, a lab on a polar island, just as the **polar night** begins: four months without sun.
The only light is what grows in a culture dish. **VELA**, the lab assistant — a tiny flask-shaped robot with a candle
flame on its cork, cheerful, precise and a little anxious ("It's an acronym. Nobody knows for what") — welcomes you. The
previous scientist, **Dr. Albor**, left before the night. Nobody tells you why.

**Act I · Polar Night (Era 1, the tutorial).** VELA teaches you to sow, to fail without fear, to recognise the first
creature ("It has an edge. A shape. It stays!"), Essence, the Dropper, the Bestiary, the Calibrator. The **Spark**
appears, a golden glint that "started showing up after she left". The **Yield Committee**, who pay for the lights and
speak in capitals, starts sending telexes. When the dish is ripe, VELA tells you Albor left the lamp on before
sterilising, "so they don't leave in the dark". **First choice.**

**Act II · Strange Things (Eras 2–5).** The dish should remember nothing, yet after every Extinction it recognises each
species at once. VELA finds **Albor's tapes**: the species return "like swallows"; what reports call *genome*, she
called *memory*. The Spark circles creatures as if saying hello. Creatures draw figures. Then the dish's hum repeats
**your own seeding rhythm** with one extra note, like a question: Albor called them **the Choir**. The Committee demands
your best species to copy it a thousand times (**second choice**). Then the third: **answer the Choir or recalibrate**
the dish to remove "that noise". VELA admits she keeps a secret: "I'll tell you soon. Noted: soon."

**Act III · First Light (Eras 6+).** The confession: the Committee wanted a one-species factory; Albor said no and left,
leaving VELA a task: *"Find someone who listens. Let them fall in love first."* The last tape reveals the truth: **the
dish remembers everything, and the Spark is what the Choir learned from Albor — a light that watched them every night —
an imitation to call her back.** Now they watch you: they'll become what you teach them. The Choir speaks, three words
at a time, with **your** words from the Journal. The Spark turns **the colour of how you play**. A grey line on the
horizon: the night is ending. Albor will return at first light (her name means "the first light of day"). And the Choir
asks: **"what are we to you?"**

### The hidden truth (for writers)

The medium keeps memory across Extinctions — that is why spores come from known templates, the Bestiary survives and
Genome exists. Together the creatures form **the Choir**, a slow mind that learns from whoever watches. For years it
learned from Albor: her night lamp became **the Spark**, an echo that hands out gifts (as she fed them) and appeared when
she was gone, to call her back. Since you arrived, the Choir **learns you**: your rhythm, your words, your care. The
ending is decided by what you taught them; the button only picks which of your two ways of being stays. In the secret
ending the recursion closes: someone, from high above, watches the station the way you watch the dish.

---

## 2. Cast and voice sheets

| Character | Look (all procedural canvas art) | Voice | Wants |
|---|---|---|---|
| **VELA** (companion, tutorial guide) | A round-bottom flask with glowing bioluma inside, a face on the glass, a candle flame on the cork ("vela" = candle), floating hands. Hovers, breathes, blinks, sloshes; moods neutral / happy (^ ^, waves) / worried (brows, sweat drop, small flame) / awed (big shiny eyes, tall flame, sparkles); mouth syncs with typing. | Cheerful, precise, a bit anxious. Short sentences. Counts things. Tic: **«Anotado.» / "Noted."** Calls you «colega» / "colleague". | Keep the lab alive; fulfil Albor's request without lying to you. |
| **Dr. Albor** (mentor, on tape) | Amber photograph with scanlines over a cassette whose reels spin; live (epilogue) with dawn behind. | Warm, tired, poetic-scientific; "Day N of the night"; dry wit. | Protect the Choir from becoming a factory; be understood. |
| **The Committee** (foil) | A telex machine printing a paper strip, red light, a stamp. | CAPITALS, bureaucratic, always ends **FIN / END**. Unintentionally funny. | Numbers. More numbers. |
| **The Choir** (the creatures) | A microscope eyepiece with a **real live Orbium** (CPU Lenia, 64×64) swimming inside; each spoken dot sends a ring out. | First dots (your rhythm), then three small words at a time, lowercase, borrowed from your Journal. | To be answered. |
| **You** (journal voice) | An open notebook, a glowing pen writing. | Terse first person, serif italic. | — the player decides. |

---

## 3. Structure and beat sheet

The prestige loop is the narrative clock. A beat starts only when its conditions hold; non-tutorial beats keep ≥ 20 s
apart (tutorial 1.5 s, chained 0.6 s) and never start while the screen is busy (`isBlocked`).

| Act | Scene id | Trigger (simplified) | Beat |
|---|---|---|---|
| I | `t_intro` | first run (0 seeds) | VELA's hello; **task: tap the dish** (spotlight + tap ripple) |
| I | `t_wait` | 9 s after first seed, nothing yet | "It's deciding if it lives." |
| I | `t_fail` | first death | "It melted away. Too little." **task: sow again** |
| I | `t_explode` | first explosion | "Shape matters, not size." |
| I | `t_stable` | first stable creature | celebration, spotlight on the creature |
| I | `t_essence` | chained | spotlight on the Essence counter |
| I | `t_lab` | Lab visible + Dropper affordable | **task: buy the Dropper** (spotlight on its button) |
| I | `t_bestiary` | first species registered | its name; first mention of Albor (hook); **task: open the Bestiary** |
| I | `t_golden` (urgent) | first Spark on screen | **task: tap the Spark**; it may interrupt a waiting task, which resumes |
| I | `t_golden_caught` / `_missed` | after it | "They appeared after she left." (foreshadowing) |
| I | `t_calibrate` | Calibrate tab visible | the laws of their world; **task: move μ** |
| I | `a1_committee` | 3 species or 10 E/s | first telex (the foil) |
| I | `a1_extinction` | first Extinction available | the lamp — **choice 1** |
| II | `a2_memory` | Era 2 | the dish remembers |
| II | `a2_tape1` | 150 s later, ≥ 1 creature | first tape: "like swallows" |
| II | `a2_orbit` | a Spark near a creature | hint *orbit*: the Spark says hello |
| II | `a2_sample` | Era 3 | the Committee's order — **choice 2** |
| II | `a2_tape2` | 3 min later + 3 behaviours or 6 species | "genome… I think it's memory" |
| II | `a2_constellation` | Era 4, ≥ 4 creatures | hint *constellation* |
| II | `a2_coro_first` | 90 s later | the Choir echoes **your seeding rhythm** (+1 note); named |
| II | `a2_answer` | Era 5 | answer or recalibrate — **choice 3** (answer = task: tap 3 times) |
| II | `a2_answered` | chained | they answer back with four |
| II | `a2_vela_secret` | 2 min later | "I'll tell you soon." |
| II | `a2_audit_send` / `_refuse` | 1 min later | the delayed echo of choice 2 |
| III | `a3_confession` | Era 6 | Albor's instruction to VELA |
| III | `a3_tape3` | 90 s later | the truth about the Spark |
| III | `a3_words` | 2 min later, ≥ 2 creatures | the Choir speaks three words |
| III | `a3_tint` | a Spark appears | hint *tint*: the Spark takes your colour |
| III | `a3_dawn` | half-way to Extinction | hint *dawn*: grey line, night ending |
| III | `a3_final` | Extinction available | **"what are we to you?"** — final choice (deferrable) |
| III | `a3_final_again` | a later era, after any ending | the question again (collect endings) |
| Epi | `ep_*` | after "Continue the experiment" | a short epilogue per ending |

Veteran saves (seeds > 0, no story data) skip the tutorial automatically; Act II/III play on.

---

## 4. Choices (three + the final question)

| # | When | Options | Immediate | Delayed echo | Leaning |
|---|---|---|---|---|---|
| 1 `lamp` | first Extinction ready | **Leave the lamp on** / **Follow protocol** | VELA's reply, journal line | warm lamp glow over the dish at every Extinction ritual | Memory +2 / Harvest +1 |
| 2 `sample` | Era 3 | **Send the sample** / **Say no** | telex reply | audit telex in Era 5 ("it doesn't live outside" / "final notice no. 42") | Harvest +3 / Memory +1, Tide +1 |
| 3 `rhythm` | Era 5 | **Answer them** (tap 3×) / **Recalibrate** | they answer with four dots / "total silence" | required for the secret ending | Tide +3 / Law +3 |
| F `final` | Era 6+, Extinction ready | your **two strongest leanings** (or the secret option) | ending cinematic | epilogue; can be asked again in later eras | — |

No choice changes the economy (balance stays with the Balancer); choices change lines, hints, journal entries and the
ending.

---

## 5. Endings

### 5.1 How the ending is decided

Playstyle → four leaning scores (`computeLeanings`, `src/story/endings.ts`):

| Leaning | Terms |
|---|---|
| **Harvest** | sent the sample +3, followed protocol +1, prints × 0.2 (≤ 4) |
| **Law** | Genome *rules* nodes × 2, calibrations × 0.05 (≤ 3), recalibrated +3 |
| **Memory** | Genome *heritage* nodes × 2, lamp on +2, said no +1, species × 0.05 (≤ 2) |
| **Tide** | Genome *fauna* nodes × 2, behaviours seen × 0.4, answered +3, said no +1, Sparks caught × 0.05 (≤ 2) |

The final question offers the **top two** leanings (ties: Memory > Tide > Law > Harvest). If the **secret** is unlocked
(all 7 seed species registered + all 6 behaviours seen + answered the Choir), the first button becomes
**"· · · answer in their language"**. The archive shows the four bars ("where your night is heading") so the
consequence is legible, not blind.

### 5.2 The five endings

| Ending | Final button | Cinematic (~30–38 s, skippable) | Closing line |
|---|---|---|---|
| **Cosecha / Harvest** | «Mi trabajo.» / "My work." | Many species → one shape copied in rows, colours drain, a counter climbs to a billion, an **APROBADO / APPROVED** stamp slams, the Committee's plane crosses a cold dawn. | «La placa ya no canta. Pero rinde.» / "The dish no longer sings. But it yields." |
| **Ley perfecta / Perfect Law** | «Un mundo que ordenar.» / "A world to put in order." | Chaos snaps into exact orbits → six-fold kaleidoscope mandala → hexagram crystal; time slows to a stop; dawn splits through it like a prism. | «Escribí un mundo sin errores. Ya nada me sorprende.» / "I wrote a world without mistakes. Nothing surprises me anymore." |
| **Archivo / Archive** | «Algo que no quiero perder.» / "Something I don't want to lose." | Creatures rise from the dish like lanterns and become a named constellation (real catalog names), warm dawn. | «Nada se perdió del todo. Recordar también es estar vivo.» / "Nothing was ever fully lost. Remembering is a way of being alive." |
| **Marea / Tide** | «Algo que debo dejar ir.» / "Something I must let go." | They multiply and mutate, the rim breaks, a tide of light spills across the screen, the microscope's light switches off, aurora. | «Siguen brillando sin mí. Ya no me necesitan.» / "They keep glowing without me. They don't need me anymore." |
| **Primera luz / First Light** (secret) | «· · · contestar en su idioma» / "· · · answer in their language" | Three taps answered by every species at once; the Spark leaves the dish and flies to the horizon; the sun rises from the sea; Albor and VELA on the shore; pull back — the station's lights form an Orbium inside someone's eyepiece. | «Ya no sé quién descubrió a quién. Nos descubrimos.» / "I don't know who discovered whom. We discovered each other." |

Every ending ends with a short credits roll and **"Continuar el experimento" / "Continue the experiment"**: the game
keeps running, an epilogue bubble follows, and in a later era the Choir can be asked again — players can collect all
endings without a new game (archive: *Endings X/4* + the secret card).

---

## 6. Delivery rules

- **Dialogue scenes**: 1–6 lines, tap to advance (tap while typing = finish line), "Skip" always visible (first scene:
  "Skip tutorial"); keyboard Enter/Space/Escape. The game never pauses.
- **Tutorial as story**: each tutorial scene may spotlight a UI target per line, then wait for a task (event, UI signal
  or view predicate) with a compact pill near the target; tasks time out gracefully, so nothing can soft-lock.
- **Bitácora**: 19 story entries (`STORY_JOURNAL`), terse first person, unlocked by scenes and choices.
- **Environmental hints** (overlay only, from real creature positions): `orbit`, `constellation`, `echo`, `gather`
  (threads to your last tap), `lamp`, `tint`, `dawn`. Scripted at beats, plus rare ambient ones in Acts II–III.
- **Accessibility**: reduce motion → instant text, still portraits (expressions kept), fades instead of motion,
  cinematics as cross-faded stills; touch targets ≥ 48 px for choices; es/en everywhere.

---

## 7. Implementation and integration

### 7.1 Files

| Path | What |
|---|---|
| `src/story/types.ts` | Types: scenes, lines, choices, waits, hints, endings, events, save |
| `src/story/script.ts` | All scenes, names, journal (es + en) |
| `src/story/endings.ts` | Ending texts, `computeLeanings`, `finalOptions`, `secretUnlocked`, `secretProgress` |
| `src/story/story.ts` | `createStory(deps)` state machine |
| `src/story/index.ts` | Public surface |
| `src/story/*.test.ts`, `testUtil.ts` | Vitest: triggering, tasks, urgent interrupts, choices, endings, persistence, text limits |
| `src/ui/story/storyUI.ts` | `createStoryUI(root, story, opts)`: dialogue, spotlight, tasks, choices, hints, endings |
| `src/ui/story/portraits.ts` | VELA / Albor / Committee / Choir / You animated portraits |
| `src/ui/story/lens.ts` | Live CPU Lenia Orbium for the Choir's portrait |
| `src/ui/story/sprites.ts` | Creature sprites from real catalog patterns (cinematics) |
| `src/ui/story/spotlight.ts`, `hints.ts`, `cinematic.ts`, `archive.ts`, `strings.ts`, `story.css` | Parts |
| `story-dev.html`, `src/ui/story/dev.ts` | Dev page: every scene, choice, task, hint, ending, archive, gallery |
| `tests/e2e/story-shots.mjs` | 36 screenshots at 360×640 into the scratchpad; fails on errors/overflow |

### 7.2 Wiring in `src/main.ts`

```ts
import { createStory } from './story';
import { createStoryUI } from './ui/story';

const story = createStory({
  bus,
  getView: () => game.view(),
  isBlocked: () => ui.blocked?.() ?? false,   // splash, modal or extinction ritual on screen (see 7.4)
});
if (saved.story) story.load(saved.story);      // fold into the main save; serialize() on writeSave
const storyUI = createStoryUI(root, story, {
  lang: () => game.view().settings.lang,
  reduceMotion: () => game.view().settings.reduceMotion,
  getTargetRect: (id) => ui.targetRect?.(id) ?? null,      // see 7.3
  gridToClient: (x, y) => ui.gridToClient?.(x, y) ?? null, // camera.gridToScreen + dish rect offset
  revealTarget: (id) => ui.reveal?.(id),                   // e.g. 'upgrade.dropper' → switchTab('lab') + scrollIntoView
  onSound: (kind, who) => audio.storyCue?.(kind, who),     // optional: VELA blips, choice, ending
});
// Story journal → existing Bitácora UI (toast + dot):
story.on('journal', ({ id, text }) => bus.emit('journalNew', { id, text }));
// In the view pushed to the UI: view.journal = [...view.journal, ...story.journalViews()];
// When the Journal modal opens: story.markJournalRead();
// UI signals: when a tab opens → story.signal(`tab:${tab}`)  (only 'tab:bestiary' is used today)
// onPrint(...) → story.notePrint()    (until GameEvents has 'print')
// resetSave() → story.reset();  Settings "restart tutorial" → story.restartTutorial();
// Settings "Historia" panel → storyUI.mountArchive(container); Settings toggle → story.setEnabled(on)
// writeSave: include story.serialize() (it also self-persists to localStorage 'bioluma.story').
```

`createStoryUI` appends its own absolutely positioned layer (z-index 45: above modals 20 and fx 30, below the splash
60). Only the dialogue box, task pill, choice buttons and the cinematic take pointer events; the dimmed backdrop never
blocks input.

### 7.3 Target ids for `getTargetRect` (viewport `DOMRect`, or `null` when not visible)

| Id | Suggested source in the current UI |
|---|---|
| `dish` | `.bl-dish` |
| `creature` | a 64–80 px square around the first stable creature (`overlay.creatureScreen(id)` + dish offset); falls back to `dish` |
| `hud.essence` | `.hud-ess` |
| `tab.lab` / `tab.bestiary` / `tab.calibrate` / `tab.genome` | `.bl-tabs .tab[data-tab="…"]` |
| `upgrade.dropper` | `[data-up="dropper"] .buy` (needs `revealTarget` to open the Lab tab first) |
| `golden` | a 60 px square around `overlay.goldenScreen()`; falls back to `dish` |
| `extinguish` | `.ext-btn` (Genome panel; `revealTarget('extinguish')` → `switchTab('genome')`) |

### 7.4 Relationship with the UI engineer's coach-mark tutorial

The story tutorial **replaces** it: create the UI with `createUI(root, { …, tutorial: false })`. Step mapping (same
order, same targets): `seed → t_intro`, `wait → t_wait`, `stable → t_stable`, `essence → t_essence`, `lab → t_lab`,
`bestiary → t_bestiary`, `golden → t_golden`, `calibrate → t_calibrate`, `genome → a1_extinction`; plus new
failure/explosion lessons. Keep the UI's first-run "Toca la placa" dish hint (it complements the task pill) or hide it
while `storyUI.busy`. The UI's "restart tutorial" setting should call `story.restartTutorial()`. Small UI additions that
make wiring trivial (UI owner's call): `ui.blocked()`, `ui.targetRect(id)`, `ui.gridToClient(x, y)`, `ui.reveal(id)`.

### 7.5 GameEvents / view fields that would help (all optional)

- `print: { speciesId: string; x: number; y: number }` — counts replication for the Harvest leaning (today:
  `story.notePrint()` from `onPrint`, or the optional `GameView.stats.prints` if the game exposes it; the story reads it).
- `tabOpened: { tab: 'lab' | 'bestiary' | 'calibrate' | 'genome' }` — instead of `story.signal('tab:…')`.
- `GameView.stats.prints?: number` (the game state already has `stats.prints`).

### 7.6 Save

`story.serialize()` returns a small JSON (`StorySave`, v1): done scenes + timestamps, choices, counters, flags, endings,
journal, deferrals. `story.load(data)` validates and ignores unknown ids. Storage errors never throw.

---

## 8. Dev tools and tests

- `npm run dev` → `/story-dev.html` — menu (bottom-left) plays any scene, jumps to choices/tasks, endings, hints,
  archive, language, reduce motion. URL params: `?scene=a2_sample&to=choice`, `?ending=albor&t=20`, `?archive=1`,
  `?gallery=1`, `?lang=en`, `?rm=1`, `?menu=0`.
- `npx vitest run src/story` — 31 tests.
- `node tests/e2e/story-shots.mjs` (optional `ONLY=ending`) — 36 PNGs `story-*.png` in the session scratchpad.

---

## 9. Proposed ADR (for the integrator to add to DECISIONS.md)

**ADR-0xx — Story layer: short dialogue scenes, a story-driven tutorial and ending cinematics.**
*Context:* GDD §3 said "no cinematics, no dialogue, only the Journal". The owner asked for an animated tutorial with a
story, several endings and characters. *Decision:* add `src/story` (pure state machine, data-driven script, es/en) and
`src/ui/story` (dialogue with animated procedural portraits, spotlight tutorial, two-button choices, environmental
hints, ending cinematics). Guard-rails: lines ≤ 12 words in the tutorial and ≤ 20 elsewhere (tested), every scene
skippable, the game never pauses, beats ≥ 20 s apart, endings never stop the game ("Continue the experiment"), hints
are overlays around real creatures (pillar 1), choices do not touch the economy, reduce motion respected, the whole
story can be turned off. *Consequences:* GDD §3 gets a "(Corrección v1.2)" pointing here; the UI tutorial is disabled in
favour of the story tutorial.

---

## 10. Encargos (story-driven objectives) — «¿Para qué? ¿Por qué?»

Owner's request: *dialogues that ask you to CULTIVATE things, for WHAT and WHY, with their animations*. An **Encargo**
is a request from a cast member: one concrete thing to grow, one short line of why, and a reward. Encargos replace the
plain objective text under the HUD.

### 10.1 Anatomy

| Part | Rule | Example |
|---|---|---|
| Speaker | animated portrait (VELA, Albor's tape, the Committee's telex) | VELA, worried |
| Ask | imperative, ≤ 10 words, shown in the objective bar | «Ten 3 criaturas estables a la vez.» |
| Why | ≤ 14 words, kid-simple | «¿Me ayudas? Su luz enciende la calefacción. ¡Brrr!» |
| Goal + progress | read from `GameView` + event counters | stable now 1/3 |
| Reward | Essence, Samples, a VELA accessory, a Journal line | +30 Esencia · Bufanda para VELA · Bitácora |
| Thanks | ≤ 12 words, said on completion (tapes can't react: VELA thanks for Albor) | «¡Calorcito! Y me tejí una bufanda.» |

Tests enforce the word limits, es + en everywhere, and the Committee's CAPITALS + "FIN / END".

### 10.2 The chain (teaches the game)

**Act I mirrors `OBJECTIVES` (balance.ts) one to one**: same ids, same order, same Essence rewards (read from that
table), so the balance bot stays valid. Only the voice changes; the one exception is `two`, which asks for 3 stable
creatures (the heating) instead of 2.

| # | id | Speaker | Ask (es) | Why (es) | Extra reward |
|---|---|---|---|---|---|
| 1 | seed | VELA | Siembra algo en la placa. | La placa duerme. Un toque la despierta. | |
| 2 | stable | VELA | Consigue una criatura que se quede. | Las que se quedan dan luz. Las otras se deshacen. | |
| 3 | look | VELA | Mira tu criatura en el Bestiario. | Cada especie tiene nombre. ¡Vamos a conocerla! | |
| 4 | dropper | VELA | Compra el Gotero. | Con él, tus semillas prenden más a menudo. | |
| 5 | two | VELA | Ten 3 criaturas estables a la vez. | ¿Me ayudas? Su luz enciende la calefacción. ¡Brrr! | 🧣 scarf, Journal |
| 6 | eps3 | Committee | PRODUZCAN 3 ESENCIA/S. FIN. | EL COMITÉ PAGA LA LUZ. LA LUZ CUESTA. FIN. | |
| 7 | calib | VELA | Compra el Calibrador. | Cambia las reglas de su mundo. ¡Y nacen criaturas nuevas! | |
| 8 | move | VELA | Mueve μ un poquito. | Otras reglas, otra fauna. ¡A ver quién sale! | |
| 9 | seeder | VELA | Compra el Sembrador automático. | Siembra solo mientras miras. Yo lo vigilo. | |
| 10 | species3 | Committee | ENVÍEN 3 ESPECIES PARA EL INFORME. FIN. | SIN INFORME NO HAY LUZ. FIN. | |
| 11 | golden | VELA | Atrapa un Destello. | Pasa volando y deja un regalo. ¡Mira bien! | |
| 12 | behaviors2 | VELA | Encuentra 2 maneras de moverse. | Unas nadan, otras giran. ¡Cada una a su manera! | |
| 13 | eps10 | Committee | EXIGIMOS 10 ESENCIA/S. FIN. | LA CALEFACCIÓN NO SE PAGA SOLA. FIN. | |
| 14 | culture | VELA | Compra Cultivo. | Un caldo más rico. ¡Todas dan más luz! | |
| 15 | print | Committee | IMPRIMAN UNA COPIA DE UNA ESPECIE. FIN. | LAS COPIAS RINDEN. AL COMITÉ LE ENCANTAN. FIN. | |
| 16 | species6 | VELA | Encuentra 6 especies. | Seis ya es una familia. ¡Quiero conocerlas a todas! | |
| 17 | eps50 | Committee | EXIGIMOS 50 ESENCIA/S ANTES DEL AMANECER. FIN. | EL AMANECER ESTÁ LEJOS. LA FACTURA, NO. FIN. | |
| 18 | dish | VELA | Compra Placa I. | Más sitio: más criaturas sin apretarse. | |
| 19 | era100k | VELA | Junta 100 000 Esencia esta noche. | Cuando la placa se llena de luz, madura. | |
| 20 | extinct | VELA | Prueba la Extinción. | La noche termina, la memoria queda. | Journal |

**Acts II–III** (gated by Era, one or two per night): `genome` (era 2, buy a Genome node; 60 s of production),
`swimmer` (era 2, *keep a swimmer alive 2 minutes*; 2 Samples), `report10` (era 3, Committee wants 10 species;
120 s of production + 🏅 medal + Journal), `colony` (era 4, Albor: *gather three of a kind*; 3 Samples), `calibNew`
(era 4, *calibrate until something new is born*; 2 Samples), `rings` (era 5, Double rings), `seven` (era 6, Albor:
*find the seven seed species*, a nudge towards the secret ending; 5 Samples + 🌸 flower + Journal), `dawnCrowd`
(era 6, 10 creatures at once).

### 10.3 Side requests (rotating)

These start after step 8 ("move μ"), or from Era 2. One side request is active at a time: the first comes 20 s after
unlocking, the next 90 s after each completion. An unfinished one rotates out after 12 min, and `dismissSide()` puts
it away for 1 min. The "once" story requests come first: Albor's *«Cultiva una que gire. Yo las llamaba bailarinas.»*
(spinner, + Journal), *«Busca una que lata»* (pulsing), and VELA's *«Encuentra una que se divida en dos»*. After those,
repeatables are picked at random:
- *calibrate until something new is born*
- *keep a spinner going 90 s*
- *catch 2 Sparks*
- *have {n} creatures at once* (n = now + 2)
- the Committee's *RAISE OUTPUT TO {n}/S* (n ≈ 1.6 × current)
- *PRINT 3 COPIES*

Their rewards scale with production (N seconds of Essence/s, with a minimum), so they never go stale. The numbers sit
in `SIDE_REWARD` (encargoScript.ts) as proposals for the Balancer to move into `balance.ts`.

### 10.4 On screen

- **Offer bubble**: pops out of the objective bar (tail pointing at it). The speaker's portrait mouths the request for
  a moment; the bubble shows the ask, the why and the reward chips, then **tucks back into the bar** after ~6.5 s.
  Tapping it opens **"¿Por qué?"**, the full dialogue in the story box (`story.speak`). Bubbles wait while a story
  dialogue is on screen, and an offer that completes before it is shown is dropped (the celebration tells it).
- **Celebration**: «✓ ¡Encargo cumplido!», the thanks line, the portrait reacting (awed → happy), reward chips popping
  in one by one, and a particle burst in the speaker's colour + gold. Reduce motion: fades only, no particles.
- **Badge** (`mountBadge`): a ready-made objective-bar row with the mini portrait, the ask (2 lines max), a progress
  bar + count ("1/3", "2,4/3", "1:20/2:00"), and a "?" that opens the full dialogue. A dashed border means a side
  request.
- **VELA's wardrobe**: the scarf (heating), the Committee's medal and Albor's flower are drawn on every VELA portrait
  once earned (`setVelaWear`).

### 10.5 Wiring (exact)

```ts
import { createStory, createEncargos } from './story';
import { createStoryUI, createEncargoUI } from './ui/story';

const story = createStory({ bus, getView: () => game.view(), isBlocked /* … as §7.2 */ });
const encargos = createEncargos({
  bus,
  getView: () => game.view(),
  story,                                   // "¿Por qué?" dialogues + Journal lines
  grant: (r) => game.grantEncargo?.(r),     // GAME: add { essence, samples } to the wallet (+ stats/toast if wanted)
});
if (saved.encargos) encargos.load(saved.encargos);           // writeSave: encargos.serialize()
const storyUI = createStoryUI(root, story, { /* … as §7.2 */ });
const encUI = createEncargoUI(root, encargos, {
  lang: () => game.view().settings.lang,
  reduceMotion: () => game.view().settings.reduceMotion,
  busy: () => storyUI.busy,                                   // bubbles wait for dialogues
  getTargetRect: (id) => ui.targetRect?.(id) ?? null,         // needs 'objective' → the objective bar element
  onSound: (k) => audio.storyCue?.(k === 'done' ? 'ending' : 'open'),
});
encUI.mountBadge(objectiveBarElement);   // or render encargos.current() yourself (label/count/progress/who)
// UI signals: on opening the Bestiary tab → encargos.signal('tab:bestiary') (and story.signal)
// onPrint → encargos.notePrint() (and story.notePrint);  resetSave → encargos.reset()
```

- **Game engineer**:
  - When Encargos are wired, the old objective chain must stop paying and stop showing. Leave `view.objective` /
    `objectiveProgress` null (or behind a flag).
  - Pay rewards in `grantEncargo({ essence, samples })`. `cosmetic` and `journal` are handled by the story layer.
- **UI integrator**:
  - Give the objective bar's rect for `'objective'`.
  - Mount the badge (or draw `encargos.current()`: `who`, `ask`, `count`, `progress.frac`, `kind`). Its tap calls
    `encargos.why()`.
  - A 2-line ask needs ~52 px of bar height.
- **Bus/GameView wishes**: `print` and `tabOpened` events (as §7.5). The Encargos also read `GameView.stats.prints` when
  present.
- **Veteran saves** without Encargos data: already-met Act I steps are skipped silently (no double rewards). From Era 2
  the chain starts at the Act II steps.

### 10.6 API

```ts
createEncargos(deps: { bus; getView; grant?; story?; storage?; now?; random?; pollMs? }): Encargos
```

| Group | Members |
|---|---|
| Read | `current()` (main first, else side), `main()`, `side()`, `chainProgress()`, `cosmetics()` |
| Actions | `why(id?)`, `dismissSide()`, `signal(name)`, `notePrint()`, `tick()` |
| Save | `serialize()`, `load(data)`, `reset()`, `dispose()` |
| Dev | `debug.offer(id)`, `debug.complete()` |

Events:

| Event | When |
|---|---|
| `offer {encargo}` | a request is offered |
| `progress {encargo}` | its progress count changes |
| `done {encargo, reward, thanks}` | it is completed |
| `change` | anything else changes |

`EncargoView` fields: `id`, `kind` (`main` / `side`), `who`, `mood`, `name`, `ask`, `why`, `label` (ask + progress),
`count`, `progress {current, target, unit, frac}`, `reward {essence, samples, cosmetic, journal}`.

Storage: localStorage key `bioluma.encargos` (try/catch everywhere).

Dev page: `?enc=<id>&hold=1`, `&done=1` (celebration), `?why=<id>`, `&wear=scarf,medal,flower`; menu sections
"Encargos · chain / side / actions". Screenshots: `story-encargo-*.png`.
