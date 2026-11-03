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
import { sceneShowing, storyLook } from './dock';
import { visibleShare, VISIBLE_SHARE } from './occlusion';
import { DURATION, EASING, SPRING, springEasing } from '../art/motion';
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
  /**
   * One layer at a time (QA4 F-01): 'hide' = a screen of its own is up (the summary, the start card,
   * the Tree for a scene that is not about it): the scene waits, invisible and untappable, and comes
   * back when the player leaves that screen. 'dock' = the scene belongs to that screen (VELA in the
   * Tree): her bubble sits at the top, never over the screen's buttons. null = normal.
   */
  hold?(sceneId: string | null): 'hide' | 'dock' | null;
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
    spotRect(): Rect | null;
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

  layer.append(hints.canvas, spot.el, scrim, choice, box, task);
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
  /** Clock time the current line finished typing (-1 = still typing): LineView.auto counts from here. */
  let typedAt = -1;

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
    typedAt = -1;
    portrait.set(l.who, l.mood, l.live);
    for (const c of [...box.classList]) if (c.startsWith('who-')) box.classList.remove(c);
    box.classList.add(`who-${l.who}`);
    if (changed) {
      // Restart the portrait pop when a new speaker takes the stage (no forced reflow: next frame).
      box.classList.remove('pop');
      requestAnimationFrame(() => box.classList.add('pop'));
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

  /**
   * VELA comes in (docs/ARTE-PULIDO.md B-12): anticipation — she dips 4 px in 80 ms, then rises into place
   * with the fast spring; the bubble grows from its tail (0.9 → 1, default spring) and fades in over 140 ms.
   * Reduce motion: an 80-ms fade.
   */
  function showBox(): void {
    if (!box.hidden) return;
    box.hidden = false;
    boxAnim?.cancel();
    if (typeof box.animate !== 'function') return;
    if (rm()) {
      boxAnim = box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 80, easing: 'linear' });
      return;
    }
    box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 140, easing: EASING.standard });
    boxAnim = box.animate(
      [
        { transform: 'translate(-50%, 0) scale(.9)' },
        { transform: 'translate(-50%, 0) scale(1)' },
      ],
      { duration: SPRING.default.ms, easing: springEasing('default') },
    );
    if (typeof portraitWrap.animate === 'function')
      portraitWrap.animate(
        [
          { transform: 'translateY(0)' },
          { transform: 'translateY(4px)', offset: 80 / (80 + SPRING.fast.ms) },
          { transform: 'translateY(0)' },
        ],
        { duration: 80 + SPRING.fast.ms, easing: 'linear' },
      );
  }
  let boxAnim: Animation | null = null;
  /** The box left to change side and comes back on the next frame (see place()). */
  let reenter = false;

  /** VELA leaves: 160 ms `exit`, 8 px down (B-12). */
  function hideBox(): void {
    if (box.hidden) return;
    if (rm() || typeof box.animate !== 'function') {
      box.hidden = true;
      return;
    }
    const ghost = box.cloneNode(true) as HTMLElement;
    ghost.removeAttribute('data-testid');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.style.pointerEvents = 'none';
    box.after(ghost);
    box.hidden = true;
    const a = ghost.animate(
      [
        { opacity: 1, transform: 'translate(-50%, 0)' },
        { opacity: 0, transform: 'translate(-50%, 8px)' },
      ],
      { duration: DURATION.exit, easing: EASING.exit, fill: 'forwards' },
    );
    a.onfinish = () => ghost.remove();
  }

  function hideAll(): void {
    reenter = false;
    scrim.classList.remove('show');
    hideBox();
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
    scrim.classList.toggle('show', !!options && held !== 'dock');
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

  /**
   * Is the target really seen (owner bug B-10.1)? A rect says nothing about what covers it: the
   * Bestiary's dock button keeps its rect under the open drawer. The centre and the four corners are
   * hit-tested (top-most element, VELA's own layer excluded); a target seen at fewer than 3 of 5 points
   * is skipped (the next id, else no ring). Measured at most every 200 ms per target.
   */
  const occ = new Map<string, { key: string; t: number; ok: boolean }>();
  function seen(id: string, r: DOMRect): boolean {
    if (id === 'dish' || typeof document.elementsFromPoint !== 'function') return true;
    const key = `${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.width)}|${Math.round(r.height)}`;
    const c = occ.get(id);
    if (c && c.key === key && clock - c.t < 0.2) return c.ok;
    let ok = true;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) ok = false;
    else {
      const near = (a: DOMRect) => Math.abs(a.left - r.left) < 1 && Math.abs(a.top - r.top) < 1 && Math.abs(a.width - r.width) < 1 && Math.abs(a.height - r.height) < 1;
      const target = document.elementsFromPoint(cx, cy).find((e) => near(e.getBoundingClientRect())) ?? null;
      // A rect made up by the host (a creature, the Spark): nothing to compare with, trust it.
      if (target) {
        const topAt = (x: number, y: number) => document.elementsFromPoint(x, y).find((e) => !layer.contains(e) && !e.classList.contains('bl-press-veil')) ?? null;
        ok = visibleShare({ x: r.left, y: r.top, w: r.width, h: r.height }, topAt, (e) => e === target || target.contains(e)) >= VISIBLE_SHARE;
      }
    }
    occ.set(id, { key, t: clock, ok });
    return ok;
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
      if (r && r.width > 0 && r.height > 0 && seen(id, r)) {
        const big = id === 'dish';
        const pad = big ? -2 : 8;
        return { id, rect: { x: r.left - r0.left - pad, y: r.top - r0.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 } };
      }
    }
    return null;
  }

  let taskTucked = false;
  let held: 'hide' | 'dock' | null = null;
  /** Apply the host's hold (QA4 F-01); true while the scene is hidden. */
  function applyHold(): boolean {
    const want = showing() ? (opts.hold?.(scene?.id ?? null) ?? null) : null;
    if (want !== held) {
      held = want;
      layer.classList.toggle('sty-held', held === 'hide');
      layer.classList.toggle('sty-docked', held === 'dock');
      // The Tree makes room under a docked bubble (src/ui/tree: freeArea).
      try {
        window.dispatchEvent(new Event('bl-story-dock'));
      } catch {
        /* non-DOM test env */
      }
    }
    return held === 'hide';
  }

  function place(r0: DOMRect): void {
    const W = r0.width;
    const H = r0.height;
    if (applyHold()) {
      spot.set(null);
      return;
    }
    const curTarget = line?.target ?? (taskInfo ? taskInfo.target : null);
    const tg = targetRect(curTarget, r0);
    const big = !!tg && (tg.id === 'dish' || tg.rect.w * tg.rect.h > W * H * 0.3);

    // Dialogue box: bottom, unless the target sits low on the screen. Changing side while it shows is a
    // short exit and a new entrance on the other side, never a jump across the screen (a layout shift,
    // tests/e2e/layout-shift.mjs): the ghost leaves this frame, the box comes back on the next one.
    if (reenter && box.hidden && line) {
      reenter = false;
      showBox();
    }
    if (!box.hidden || reenter) {
      const wantTop = held === 'dock' || (!!tg && !big && tg.rect.y + tg.rect.h / 2 > H * 0.55);
      if (wantTop !== boxTop) {
        boxTop = wantTop;
        if (!box.hidden && !rm()) {
          hideBox();
          reenter = true;
        }
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
    // Also a pill whose target is not on screen and lives in the Tree (e.g. "look at the centre of the
    // Tree" while the player is on the dish): it waits for the Tree instead of covering the seed bar.
    const offScreen = !tg && !!curTarget?.length && curTarget.every((id) => id.startsWith('tree.'));
    const tuck = !task.hidden && !line && (offScreen || !!opts.hideTask?.(tg?.id ?? curTarget?.[0] ?? null));
    if (tuck !== taskTucked) {
      taskTucked = tuck;
      task.style.visibility = tuck ? 'hidden' : '';
    }

    // Spotlight. Docked over a screen of its own (the Tree and its sheets), VELA dims, covers and points
    // at nothing (owner bug B-10.2): the sheet's button keeps its colour.
    const look = storyLook(held, !!taskInfo && !line, !!options);
    scrim.classList.toggle('show', look.scrim);
    if (options || tuck || !look.spotlight) spot.set(null);
    else if (tg && (line || taskInfo)) {
      const arrow = big ? null : boxTop ? 'above' : 'below';
      const ripple = !!taskInfo && tg.id === 'dish';
      spot.set(tg.rect, { dim: look.dim, arrow: arrow === 'below' && tg.rect.y + tg.rect.h > H - 60 ? 'above' : arrow, tap: ripple }, clock);
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

  function showing(): boolean {
    return sceneShowing({ box: !box.hidden, reenter, task: !task.hidden, choice: !choice.hidden });
  }

  function needsLoop(): boolean {
    return showing() || spot.active || hints.active || !!cine;
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
    // A line that moves on by itself (LineDef.auto: «Tu reloj empieza ahora», §2.4 step 5), never while held.
    if (line && typed >= fullText.length && !box.hidden && held !== 'hide') {
      if (typedAt < 0) typedAt = t;
      else if (line.auto !== null && !options && t - typedAt >= line.auto) {
        typedAt = Infinity;
        story.advance();
      }
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
      // The task asks again even if a line already pointed there: an open Bestiary counts as done.
      revealed = '';
      revealFor(target);
      opts.onSound?.('task');
      kick();
    }),
    story.on('sceneEnd', () => {
      scene = null;
      hideAll();
      applyHold();
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
      /** The spotlight's hole (layer-relative CSS px) or null: tests check where VELA points. */
      spotRect() {
        return spot.hole;
      },
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
