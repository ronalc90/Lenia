/**
 * "Historia" archive panel: endings found (X/4, locked silhouettes, a secret
 * card), where the player's night is heading (leanings), and every seen scene
 * to re-watch. Mount it anywhere (Settings, Bestiary) via StoryUI.mountArchive.
 */
import type { Lang } from '../../core/types';
import { ENDINGS, LEANING_NAMES, secretProgress } from '../../story/endings';
import { ACT_TITLES } from '../../story/script';
import type { Story } from '../../story/story';
import { LEANINGS, type Act, type EndingId } from '../../story/types';
import { Portrait } from './portraits';
import { S, secretHint, tr } from './strings';

export interface StoryArchive {
  readonly el: HTMLElement;
  refresh(): void;
  dispose(): void;
}

export function createArchive(
  container: HTMLElement,
  story: Story,
  opts: { lang(): Lang; reduceMotion(): boolean; playEnding(id: EndingId): void },
): StoryArchive {
  const el = document.createElement('section');
  el.className = 'sty-archive';
  container.appendChild(el);
  const face = new Portrait('sa-face');
  face.set('vela', 'happy');
  let raf = 0;
  let last = performance.now();
  const loop = (now: number) => {
    if (!el.isConnected) {
      raf = 0;
      return;
    }
    const dt = (now - last) / 1000;
    last = now;
    face.state.reduceMotion = opts.reduceMotion();
    face.frame(now / 1000, dt, 0, false);
    raf = requestAnimationFrame(loop);
  };

  function render(): void {
    const L = opts.lang();
    const a = story.archive();
    el.innerHTML = '';
    // Header with a small, happy VELA.
    const head = document.createElement('div');
    head.className = 'sa-head';
    const hText = document.createElement('div');
    hText.innerHTML = `<div class="sa-title"></div><div class="sa-sub"></div>`;
    hText.querySelector('.sa-title')!.textContent = tr(S.archiveTitle, L);
    hText.querySelector('.sa-sub')!.textContent = story.enabled ? tr(S.archiveSub, L) : tr(S.storyOff, L);
    head.append(face.canvas, hText);
    el.appendChild(head);

    // Endings.
    const h3 = document.createElement('h3');
    h3.textContent = `${tr(S.endings, L)} · ${a.found}/${a.total}`;
    el.appendChild(h3);
    const grid = document.createElement('div');
    grid.className = 'sa-endings';
    for (const e of a.endings) {
      const card = document.createElement(e.found ? 'button' : 'div');
      card.className = `sa-end${e.found ? ' found' : ''}${e.secret ? ' secret' : ''}`;
      card.style.setProperty('--c', e.color);
      const glyph = document.createElement('span');
      glyph.className = 'sa-glyph';
      glyph.textContent = e.found ? '' : e.secret ? '✦' : '?';
      const label = document.createElement('span');
      const small = document.createElement('small');
      if (e.found) {
        label.textContent = tr(e.title, L);
        small.textContent = tr(S.watch, L);
        (card as HTMLButtonElement).type = 'button';
        card.addEventListener('click', () => opts.playEnding(e.id));
      } else if (e.secret) {
        label.textContent = tr(S.secret, L);
        // Hint at the secret only once the player has seen a first ending.
        small.textContent = a.found > 0 ? secretHint(L, secretProgress(story.serialize().choices, story.getView())) : '· · ·';
      } else {
        label.textContent = '· · ·';
        small.textContent = tr(S.notYet, L);
      }
      card.append(glyph, label, small);
      grid.appendChild(card);
    }
    el.appendChild(grid);

    // Leanings.
    const h3b = document.createElement('h3');
    h3b.textContent = tr(S.yourNight, L);
    el.appendChild(h3b);
    const lean = document.createElement('div');
    lean.className = 'sa-lean';
    const max = Math.max(4, ...LEANINGS.map((k) => a.leanings[k]));
    for (const k of LEANINGS) {
      const dot = document.createElement('span');
      dot.className = 'sa-dot';
      dot.style.background = ENDINGS[k].color;
      dot.style.color = ENDINGS[k].color;
      const name = document.createElement('span');
      name.textContent = tr(LEANING_NAMES[k], L);
      const bar = document.createElement('span');
      bar.className = 'sa-bar';
      const fill = document.createElement('i');
      fill.style.width = `${Math.round((a.leanings[k] / max) * 100)}%`;
      fill.style.background = ENDINGS[k].color;
      bar.appendChild(fill);
      lean.append(dot, name, bar);
    }
    el.appendChild(lean);

    // Scenes by act.
    const h3c = document.createElement('h3');
    h3c.textContent = tr(S.scenes, L);
    el.appendChild(h3c);
    for (const act of [1, 2, 3, 4] as Act[]) {
      const list = a.scenes.filter((s) => s.act === act);
      if (act === 4 && !list.some((s) => s.seen)) continue;
      const box = document.createElement('div');
      box.className = 'sa-act';
      const h4 = document.createElement('h4');
      h4.textContent = tr(ACT_TITLES[act], L);
      const row = document.createElement('div');
      row.className = 'sa-scenes';
      for (const s of list) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'sa-scene';
        if (s.seen) {
          b.textContent = `▶ ${tr(s.title, L)}`;
          b.addEventListener('click', () => story.replay(s.id));
        } else {
          b.textContent = '· · ·';
          b.disabled = true;
        }
        row.appendChild(b);
      }
      box.append(h4, row);
      el.appendChild(box);
    }
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  const off = story.on('change', () => render());
  render();
  return {
    el,
    refresh: render,
    dispose() {
      off();
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      el.remove();
    },
  };
}
