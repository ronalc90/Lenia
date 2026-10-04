/**
 * Story UI: renders a Story (src/story) on top of the game.
 *
 *   dialogue box   typewriter text, speaker name, animated portrait, tap to
 *                  advance (tap while typing = finish the line), "Skip"
 *   spotlight      dim backdrop with a soft cut-out around the line's target,
 *                  pulsing ring, arrow or tap ripple (never blocks input)
 *   task pill      tutorial step waiting for an action ("Tap the dish.")
 *   choice         two big buttons (+ "Not yet" on deferrable choices)
 *   hints          environmental light over the dish
 *   endings        full-screen cinematics, then "Continue the experiment"
 *
 * Mobile first (360×640), es/en, honours reduce motion (fades, no motion).
 * Runs one rAF loop only while something is on screen.
 */
import './story.css';
import type { Lang, Text } from '../../core/types';
import type { Story } from '../../story/story';
import type { ChoiceOptionView, EndingId, LineView, SceneView, Speaker, TargetId } from '../../story/types';
import { createArchive, type StoryArchive } from './archive';
import { Cinematic } from './cinematic';
import { HintLayer } from './hints';
import { Portrait } from './portraits';
import { Spotlight, type Rect } from './spotlight';
import { S, tr } from './strings';

export type StorySound = 'open' | 'blip' | 'choice' | 'chosen' | 'task' | 'done' | 'ending';

export interface StoryUIOptions {
  /** Viewport rect of a UI target ('dish', 'hud.essence', 'tab.lab', …), or null if not visible. */
  getTargetRect(id: string): DOMRect | null;
  lang(): Lang;
  reduceMotion?(): boolean;
  /** Grid cell → viewport (client) coordinates, for hints drawn over the dish. */
  gridToClient?(x: number, y: number): { x: number; y: number } | null;
  /** Make a target visible before pointing at it (e.g. open the Lab tab for 'upgrade.dropper'). */
  revealTarget?(id: string): void;
  /** UI feedback sounds (the audio module may voice VELA's blips). */
  onSound?(kind: StorySound, speaker?: Speaker): void;
  /**
   * The task pill pointing at this target steps aside for now (e.g. a tree node's sheet is open: the
   * sheet's own button is the next step, and the pill would sit on its head). It keeps waiting.
   */
  hideTask?(target: string | null): boolean;
}

export interface StoryUI {
  /** Mount the "Historia" archive panel into a container (Settings, Bestiary…). */
  mountArchive(container: HTMLElement): StoryArchive;
  /** Play an ending cinematic as a preview (archive "watch again"; no story change). */
  playEnding(id: EndingId): void;
  /** Re-render texts after a language change. */
  relabel(): void;
  /** A scene or an ending is on screen. */
  readonly busy: boolean;
  /** For dev pages and screenshot scripts. */
  readonly debug: {
    completeTyping(): void;
    seekEnding(t: number): void;
    /** Freeze the animation clock at t seconds (null = run). */
    freezeAt(t: number | null): void;
  };
  dispose(): void;
}

const CPS: Record<Speaker, number> = { vela: 40, albor: 34, committee: 62, coro: 11, you: 34 };
const VOWELS = /[aeiouáéíóúAEIOUÁÉÍÓÚyY]/;
const LETTER = /[\p{L}\p{N}]/u;

export function createStoryUI(root: HTMLElement, story: Story, opts: StoryUIOptions): StoryUI {
  const rm = () => opts.reduceMotion?.() ?? false;
  const L = () => opts.lang();

  // ───────────── DOM ─────────────
  const layer = document.createElement('div');
  // VELA speaks from the night lab in both themes (art tokens resolve dark here, docs/ARTE.md §3).
  layer.className = 'sty art-force-dark';
  try {
    if (getComputedStyle(root).position === 'static') layer.style.position = 'fixed';
  } catch {
    /* non-DOM test env */
  }
  const hints = new HintLayer();
  const spot = new Spotlight();

  const box = document.createElement('div');
  box.className = 'sty-box';
  box.hidden = true;
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-live', 'polite');
  box.tabIndex = 0;
  const portraitWrap = document.createElement('div');
  portraitWrap.className = 'sty-portrait-wrap';
  const portrait = new Portrait();
  portraitWrap.appendChild(portrait.canvas);
  const nameEl = document.createElement('div');
  nameEl.className = 'sty-name';
  const recDot = document.createElement('span');
  recDot.className = 'rec';
  const nameText = document.createElement('span');
  nameEl.append(nameText);
  const textEl = document.createElement('p');
  textEl.className = 'sty-text';
  const shownEl = document.createElement('span');
  const restEl = document.createElement('span');
  restEl.className = 'rest';
  restEl.setAttribute('aria-hidden', 'true');
  textEl.append(shownEl, restEl);
  const nextEl = document.createElement('span');
  nextEl.className = 'sty-next';
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'sty-skip';
  box.dataset.testid = 'tutorial-next';
  box.append(portraitWrap, nameEl, textEl, nextEl, skipBtn);

  const task = document.createElement('div');
  task.className = 'sty-task';
  task.hidden = true;
  const taskFace = new Portrait('sty-task-face');
  taskFace.set('vela', 'happy');
  const taskText = document.createElement('span');
  taskText.className = 'sty-task-text';
  const taskX = document.createElement('button');
  taskX.type = 'button';
  taskX.className = 'sty-task-x';
  taskX.textContent = '×';
  task.append(taskFace.canvas, taskText, taskX);

  const choice = document.createElement('div');
  choice.className = 'sty-choice';
  choice.hidden = true;
  const scrim = document.createElement('div');
  scrim.className = 'sty-scrim';

  layer.append(hints.canvas, spot.canvas, scrim, choice, box, task);
  root.appendChild(layer);

  // ───────────── state ─────────────
  let scene: SceneView | null = null;
  let line: LineView | null = null;
  let typed = 0;
  let acc = 0;
  let pause = 0;
  let fullText = '';
  let lastShown = -1;
  let boxTop = false;
  let taskInfo: { text: Text; target: TargetId[] | null } | null = null;
  let options: { list: ChoiceOptionView[]; deferrable: boolean } | null = null;
  let cine: Cinematic | null = null;
  let raf = 0;
  let last = 0;
  let clock = 0;
  let frozen: number | null = null;
  let revealed = '';

  const typing = () => !!line && typed < fullText.length;
  /** The Choir's dots read better as bullets. */
  const display = (l: LineView) => (l.who === 'coro' ? tr(l.text, L()).replace(/·/g, '•') : tr(l.text, L()));

  function setLine(l: LineView): void {
    const changed = !line || line.who !== l.who || l.index === 0;
    line = l;
    fullText = display(l);
    typed = rm() ? fullText.length : 0;
    acc = 0;
    pause = 0.12;
    lastShown = -1;
    portrait.set(l.who, l.mood, l.live);
    for (const c of [...box.classList]) if (c.startsWith('who-')) box.classList.remove(c);
    box.classList.add(`who-${l.who}`);
    if (changed) {
      // Restart the portrait pop when a new speaker takes the stage.
      box.classList.remove('pop');
      void box.offsetWidth;
      box.classList.add('pop');
    }
    nameText.textContent = tr(l.name, L());
    if (l.who === 'albor' && !l.live) nameEl.prepend(recDot);
    else recDot.remove();
    renderText();
    revealFor(l.target);
  }

  function renderText(): void {
    if (typed === lastShown) return;
    lastShown = typed;
    shownEl.textContent = fullText.slice(0, typed);
    restEl.textContent = fullText.slice(typed);
    box.classList.toggle('done', typed >= fullText.length);
  }

  function relabelSkip(): void {
    skipBtn.textContent = scene?.id === 't_intro' ? `${tr(S.skipTutorial, L())} ›` : `${tr(S.skip, L())} ›`;
    // QA selectors shared with the former coach-mark tutorial (tests/e2e/smoke.mjs, tests/e2e/qa).
    skipBtn.dataset.testid = scene?.id === 't_intro' ? 'tutorial-skip' : 'story-skip';
    skipBtn.setAttribute('aria-label', skipBtn.textContent);
    taskX.setAttribute('aria-label', tr(S.closeTask, L()));
    box.setAttribute('aria-label', tr(S.tapToContinue, L()));
  }

  function revealFor(ids: TargetId[] | null): void {
    if (!ids || !opts.revealTarget) return;
    const key = ids.join(',');
    if (key === revealed) return;
    revealed = key;
    // Ask the host to bring the preferred target on screen (later ids are fallbacks).
    opts.revealTarget(ids[0]);
  }

  function showBox(): void {
    if (!box.hidden) return;
    box.hidden = false;
    box.classList.add('enter');
    void box.offsetWidth;
    requestAnimationFrame(() => box.classList.remove('enter'));
  }

  function hideAll(): void {
    scrim.classList.remove('show');
    box.hidden = true;
    task.hidden = true;
    choice.hidden = true;
    choice.innerHTML = '';
    options = null;
    taskInfo = null;
    line = null;
    revealed = '';
    spot.set(null);
  }

  function renderChoice(): void {
    choice.innerHTML = '';
    scrim.classList.toggle('show', !!options);
    if (!options) {
      choice.hidden = true;
      return;
    }
    const accents = ['#5BC0EB', '#B892FF'];
    options.list.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sty-opt';
      b.style.setProperty('--c', o.color ?? accents[i % 2]);
      const orb = document.createElement('span');
      orb.className = 'sty-orb';
      const label = document.createElement('span');
      label.textContent = tr(o.label, L());
      b.append(orb, label);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onSound?.('chosen');
        story.choose(o.id);
      });
      choice.appendChild(b);
    });
    if (options.deferrable) {
      const later = document.createElement('button');
      later.type = 'button';
      later.className = 'sty-later';
      later.textContent = tr(S.later, L());
      later.addEventListener('click', (e) => {
        e.stopPropagation();
        story.defer();
      });
      choice.appendChild(later);
    }
    choice.hidden = false;
  }

  // ───────────── geometry ─────────────

  function rootRect(): DOMRect {
    return layer.getBoundingClientRect();
  }

  function targetRect(ids: TargetId[] | null, r0: DOMRect): { rect: Rect; id: TargetId } | null {
    if (!ids) return null;
    for (const id of ids) {
      let r: DOMRect | null = null;
      try {
        r = opts.getTargetRect(id);
      } catch {
        r = null;
      }
      if (r && r.width > 0 && r.height > 0) {
        const big = id === 'dish';
        const pad = big ? -2 : 8;
        return { id, rect: { x: r.left - r0.left - pad, y: r.top - r0.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 } };
      }
    }
    return null;
  }

  let taskTucked = false;
  function place(r0: DOMRect): void {
    const W = r0.width;
    const H = r0.height;
    const curTarget = line?.target ?? (taskInfo ? taskInfo.target : null);
    const tg = targetRect(curTarget, r0);
    const big = !!tg && (tg.id === 'dish' || tg.rect.w * tg.rect.h > W * H * 0.3);

    // Dialogue box: bottom, unless the target sits low on the screen.
    if (!box.hidden) {
      const wantTop = !!tg && !big && tg.rect.y + tg.rect.h / 2 > H * 0.55;
      if (wantTop !== boxTop) {
        boxTop = wantTop;
        box.classList.toggle('at-top', boxTop);
      }
      if (boxTop) {
        // --sty-top: set by the game UI below its floating objective, so VELA never covers it.
        box.style.top = 'max(var(--sty-top, 64px), calc(env(safe-area-inset-top) + 56px))';
        box.style.bottom = '';
      } else {
        box.style.bottom = 'max(14px, calc(env(safe-area-inset-bottom) + 10px))';
        box.style.top = '';
      }
    }
    if (!choice.hidden) {
      const bh = box.hidden ? 0 : box.offsetHeight;
      if (boxTop) {
        choice.style.top = `${64 + bh + 12}px`;
        choice.style.bottom = '';
      } else {
        choice.style.bottom = `${14 + bh + 14}px`;
        choice.style.top = '';
      }
    }

    // A task pill out of the way while the host says so (and its spotlight with it).
    const tuck = !task.hidden && !line && !!opts.hideTask?.(tg?.id ?? curTarget?.[0] ?? null);
    if (tuck !== taskTucked) {
      taskTucked = tuck;
      task.style.visibility = tuck ? 'hidden' : '';
    }

    // Spotlight.
    if (options || tuck) spot.set(null);
    else if (tg && (line || taskInfo)) {
      const arrow = big ? null : boxTop ? 'above' : 'below';
      const ripple = !!taskInfo && tg.id === 'dish';
      spot.set(tg.rect, { dim: taskInfo ? 0.42 : 0.6, arrow: arrow === 'below' && tg.rect.y + tg.rect.h > H - 60 ? 'above' : arrow, tap: ripple }, clock);
    } else spot.set(null);

    // Task pill near its target.
    if (!task.hidden) {
      const pw = task.offsetWidth || 220;
      const ph = task.offsetHeight || 52;
      let x = (W - pw) / 2;
      let y = H * 0.3;
      if (tg) {
        const cx = tg.rect.x + tg.rect.w / 2;
        x = Math.min(Math.max(10, cx - pw / 2), W - pw - 10);
        // Inside a big target (the dish): below the game's floating objective bar (--sty-top), never over it.
        // And below an Encargo bubble hanging from that bar (--enc-bottom), so the two never stack.
        if (big) {
          const rs = document.documentElement.style;
          y = Math.max(tg.rect.y + 18, parseFloat(rs.getPropertyValue('--sty-top')) || 0, (parseFloat(rs.getPropertyValue('--enc-bottom')) || -8) + 8);
        }
        else if (tg.rect.y + tg.rect.h + 44 + ph < H - 8) y = tg.rect.y + tg.rect.h + 44;
        else y = Math.max(8, tg.rect.y - 44 - ph);
      }
      task.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  // ───────────── loop ─────────────

  function needsLoop(): boolean {
    return !box.hidden || !task.hidden || !choice.hidden || spot.active || hints.active || !!cine;
  }

  function kick(): void {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function frame(now: number): void {
    raf = 0;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    clock = frozen ?? clock + dt;
    const t = clock;
    const reduce = rm();
    layer.classList.toggle('rm', reduce);
    const r0 = rootRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    // Typewriter.
    if (line && typed < fullText.length) {
      if (reduce) typed = fullText.length;
      else {
        pause -= dt;
        if (pause <= 0) {
          acc += dt * CPS[line.who];
          while (acc >= 1 && typed < fullText.length) {
            acc -= 1;
            typed++;
            const ch = fullText[typed - 1];
            if (/[.!?…]/.test(ch)) pause = 0.24;
            else if (/[,;:]/.test(ch)) pause = 0.1;
            if (line.who === 'coro' && ch === '•') {
              portrait.pulse();
              opts.onSound?.('blip', 'coro');
            } else if (LETTER.test(ch) && typed % 3 === 0) opts.onSound?.('blip', line.who);
            if (pause > 0) break;
          }
        }
      }
      renderText();
    }
    if (!box.hidden && line) {
      const ch = typed > 0 ? fullText[typed - 1] : ' ';
      const talking = typed < fullText.length && pause <= 0;
      const target = talking && LETTER.test(ch) ? (VOWELS.test(ch) ? 1 : 0.5) * (0.75 + 0.25 * Math.sin(t * 30)) : 0;
      portrait.state.reduceMotion = reduce;
      portrait.frame(t, dt, target, talking);
    }
    if (!task.hidden) {
      taskFace.state.reduceMotion = reduce;
      taskFace.frame(t, dt, 0, false);
    }
    place(r0);
    spot.resize(r0.width, r0.height, dpr);
    spot.frame(t, dt, reduce);
    hints.resize(r0.width, r0.height, dpr);
    if (hints.active) {
      const dr = opts.getTargetRect('dish');
      hints.frame(t, dt, {
        dish: dr ? { x: dr.left - r0.left, y: dr.top - r0.top, w: dr.width, h: dr.height } : null,
        toScreen: opts.gridToClient
          ? (x, y) => {
              const p = opts.gridToClient!(x, y);
              return p ? { x: p.x - r0.left, y: p.y - r0.top } : null;
            }
          : null,
        view: safeView(),
        rm: reduce,
      });
    } else hints.frame(t, dt, { dish: null, toScreen: null, view: null, rm: reduce });
    if (cine) cine.frame(frozen !== null ? 0 : dt);
    if (needsLoop()) raf = requestAnimationFrame(frame);
  }

  function safeView() {
    try {
      return story.getView();
    } catch {
      return null;
    }
  }

  // ───────────── input ─────────────

  function onBoxTap(e: Event): void {
    e.stopPropagation();
    if (!line) return;
    if (typing()) {
      typed = fullText.length;
      renderText();
      return;
    }
    if (options) return;
    story.advance();
  }
  box.addEventListener('click', onBoxTap);
  // Skipping the WHOLE tutorial asks for a second tap (QA2 H-03); skipping one scene does not.
  let skipArmedUntil = 0;
  skipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (scene?.id !== 't_intro') {
      story.skip();
      return;
    }
    const now = performance.now();
    if (now < skipArmedUntil) {
      skipArmedUntil = 0;
      story.skipTutorial();
      return;
    }
    skipArmedUntil = now + 3000;
    skipBtn.textContent = `${tr(S.skipTutorialSure, L())} ›`;
    skipBtn.classList.add('armed');
    window.setTimeout(() => {
      if (skipArmedUntil && performance.now() >= skipArmedUntil) {
        skipArmedUntil = 0;
        skipBtn.classList.remove('armed');
        relabelSkip();
      }
    }, 3100);
  });
  taskX.addEventListener('click', (e) => {
    e.stopPropagation();
    story.skip();
  });
  const onKey = (e: KeyboardEvent) => {
    if (box.hidden || cine) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName)) return;
    if (e.key === 'Enter' || e.key === ' ') {
      if (options) return;
      e.preventDefault();
      onBoxTap(e);
    } else if (e.key === 'Escape') story.skip();
  };
  window.addEventListener('keydown', onKey);

  // ───────────── story events ─────────────

  function startCinematic(id: EndingId, preview: boolean): void {
    cine?.dispose();
    hideAll();
    opts.onSound?.('ending');
    cine = new Cinematic(layer, id, {
      lang: L,
      rm,
      onDone: () => {
        cine = null;
        if (!preview) story.endingDone();
      },
    });
    kick();
  }

  const offs = [
    story.on('sceneStart', ({ scene: s }) => {
      scene = s;
      hideAll();
      relabelSkip();
      showBox();
      opts.onSound?.('open');
      kick();
    }),
    story.on('line', ({ line: l }) => {
      options = null;
      choice.hidden = true;
      task.hidden = true;
      taskInfo = null;
      showBox();
      setLine(l);
      kick();
    }),
    story.on('choice', ({ options: list, deferrable }) => {
      typed = fullText.length;
      renderText();
      options = { list, deferrable };
      renderChoice();
      opts.onSound?.('choice');
      kick();
    }),
    story.on('chosen', () => {
      options = null;
      renderChoice();
    }),
    story.on('sceneWait', ({ scene: s, text, target }) => {
      scene = s;
      box.hidden = true;
      choice.hidden = true;
      options = null;
      line = null;
      taskInfo = { text, target };
      taskText.textContent = tr(text, L());
      task.hidden = false;
      revealFor(target);
      opts.onSound?.('task');
      kick();
    }),
    story.on('sceneEnd', () => {
      scene = null;
      hideAll();
      opts.onSound?.('done');
      kick();
    }),
    story.on('ending', ({ id }) => startCinematic(id, false)),
    story.on('hint', (h) => {
      hints.add(h);
      kick();
    }),
  ];

  // Mounted mid-scene: catch up.
  const cur = story.current();
  if (cur) {
    scene = cur.scene;
    relabelSkip();
    if (cur.line) {
      showBox();
      setLine(cur.line);
    }
    if (cur.options) {
      options = { list: cur.options, deferrable: cur.deferrable };
      renderChoice();
    }
    if (cur.wait) {
      taskInfo = cur.wait;
      taskText.textContent = tr(cur.wait.text, L());
      task.hidden = false;
    }
    if (cur.ending) startCinematic(cur.ending, false);
    kick();
  }

  const ui: StoryUI = {
    mountArchive(container) {
      return createArchive(container, story, { lang: L, reduceMotion: rm, playEnding: (id) => startCinematic(id, true) });
    },
    playEnding(id) {
      startCinematic(id, true);
    },
    relabel() {
      relabelSkip();
      if (line) {
        const keep = typed >= fullText.length;
        fullText = display(line);
        typed = keep ? fullText.length : Math.min(typed, fullText.length);
        nameText.textContent = tr(line.name, L());
        lastShown = -1;
        renderText();
      }
      if (taskInfo) taskText.textContent = tr(taskInfo.text, L());
      if (options) renderChoice();
      cine?.relabel();
    },
    get busy() {
      return !box.hidden || !task.hidden || !choice.hidden || !!cine;
    },
    debug: {
      completeTyping() {
        typed = fullText.length;
        renderText();
      },
      seekEnding(t) {
        cine?.seek(t);
      },
      freezeAt(t) {
        frozen = t;
        if (t !== null) clock = t;
        kick();
      },
    },
    dispose() {
      for (const off of offs) off();
      window.removeEventListener('keydown', onKey);
      if (raf) cancelAnimationFrame(raf);
      cine?.dispose();
      layer.remove();
    },
  };
  return ui;
}
