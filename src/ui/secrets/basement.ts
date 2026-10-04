/**
 * "Laboratorio del sótano": the hidden Settings page that appears after BASEMENT_UNLOCK
 * secrets. Lists found secrets (glyph, name, flavour, date) and locked ones as cryptic hints
 * with a free hint ladder ("Otra pista"), plus the cosmetic dish colormaps.
 * The integrator mounts `panel.el` wherever Settings shows a page, and calls
 * secrets.onBasementOpened() when it is shown (the basement is itself a secret).
 */
import type { Lang, Text } from '../../core/types';
import { BONUS_CAP, CATEGORY_TEXT, COLORMAPS, COSMETIC_IDS, COSMETIC_SOURCE } from '../../secrets/data';
import type { Secrets } from '../../secrets/secrets';
import { SECRET_CATEGORIES, type SecretView } from '../../secrets/types';
import { glyphSVG } from './glyphs';
import { colormapCSS } from './reveal';
import { injectSecretsStyles } from './styles';

const T = {
  title: { es: 'Laboratorio del sótano', en: 'Basement lab' },
  sub: { es: 'Notas con mi letra que no recuerdo haber escrito.', en: 'Notes in my handwriting that I don’t remember writing.' },
  bonus: { es: 'Bonus de Esencia', en: 'Essence bonus' },
  max: { es: 'máx.', en: 'max' },
  palettes: { es: 'Paletas de la placa', en: 'Dish palettes' },
  default: { es: 'Original', en: 'Original' },
  more: { es: 'Otra pista', en: 'Another hint' },
  noMore: { es: 'Sin más', en: 'No more' },
  motion: { es: 'Permitir el sensor de movimiento', en: 'Allow the motion sensor' },
  locked: { es: 'Bloqueada', en: 'Locked' },
} satisfies Record<string, Text>;

export interface BasementPanel {
  readonly el: HTMLElement;
  refresh(): void;
  dispose(): void;
}

export interface BasementOptions {
  lang: () => Lang;
  /** iOS needs a tap to allow DeviceMotion; pass inputs.requestMotionPermission when it applies. */
  requestMotion?: (() => Promise<boolean>) | null;
}

function fmtDate(ms: number, l: Lang): string {
  try {
    return new Date(ms).toLocaleDateString(l === 'es' ? 'es' : 'en', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export function createBasementPanel(secrets: Secrets, opts: BasementOptions): BasementPanel {
  injectSecretsStyles();
  const el = document.createElement('section');
  el.className = 'bls-basement';

  const render = () => {
    const l = opts.lang();
    const list = secrets.list();
    const found = list.filter((s) => s.found).length;
    el.setAttribute('aria-label', T.title[l]);
    el.innerHTML = '';

    const head = document.createElement('header');
    head.className = 'bls-bh';
    head.innerHTML = `<div class="bls-bulb">${bulb()}</div><div><h2></h2><p></p></div>`;
    head.querySelector('h2')!.textContent = T.title[l];
    head.querySelector('p')!.textContent = T.sub[l];

    const meter = document.createElement('div');
    meter.className = 'bls-meter';
    meter.innerHTML = `<div class="bls-count"></div><div class="bls-bar"><i></i></div><div class="bls-bonus"></div>`;
    meter.querySelector('.bls-count')!.innerHTML = `${found}<span>/${list.length}</span>`;
    (meter.querySelector('.bls-bar i') as HTMLElement).style.width = `${(found / list.length) * 100}%`;
    const pct = Math.round(secrets.bonus() * 100);
    meter.querySelector('.bls-bonus')!.innerHTML = `${T.bonus[l]}: <b>+${pct} %</b> (${T.max[l]} +${Math.round(BONUS_CAP * 100)} %)`;

    el.append(head, meter);

    // Palettes.
    const cosH = document.createElement('h3');
    cosH.textContent = T.palettes[l];
    const sw = document.createElement('div');
    sw.className = 'bls-swatches';
    const owned = secrets.cosmetics();
    const current = secrets.colormap();
    sw.appendChild(swatch(T.default[l], null, current === null, false, 'linear-gradient(90deg,#2e1e78,#28bee6 45%,#ffecce 75%,#fff)'));
    for (const id of COSMETIC_IDS) {
      const has = owned.includes(id);
      sw.appendChild(swatch(has ? COLORMAPS[id].name[l] : '· · ·', id, current === id, !has, has ? colormapCSS(id) : '', has ? null : COSMETIC_SOURCE[id][l]));
    }
    el.append(cosH, sw);

    // Secrets by category.
    for (const cat of SECRET_CATEGORIES) {
      const items = list.filter((s) => s.category === cat);
      if (!items.length) continue;
      const h = document.createElement('h3');
      h.innerHTML = `<b></b><span>${items.filter((s) => s.found).length}/${items.length}</span>`;
      h.querySelector('b')!.textContent = CATEGORY_TEXT[cat][l];
      const ul = document.createElement('ul');
      ul.className = 'bls-list';
      for (const s of items) ul.appendChild(item(s, l));
      el.append(h, ul);
    }

    if (opts.requestMotion) {
      const b = document.createElement('button');
      b.className = 'bls-motion';
      b.textContent = T.motion[l];
      b.addEventListener('click', () => {
        void opts.requestMotion?.().then((ok) => {
          if (ok) b.remove();
        });
      });
      el.appendChild(b);
    }
  };

  function swatch(label: string, id: (typeof COSMETIC_IDS)[number] | null, pressed: boolean, locked: boolean, bg: string, source: string | null = null): HTMLElement {
    const b = document.createElement('button');
    b.className = 'bls-sw';
    b.type = 'button';
    b.setAttribute('aria-pressed', String(pressed));
    b.disabled = locked;
    b.innerHTML = `<span class="strip"></span><span class="nm"></span>`;
    (b.querySelector('.strip') as HTMLElement).style.background = bg;
    b.querySelector('.nm')!.textContent = label;
    if (source) {
      const sm = document.createElement('small');
      sm.textContent = source;
      b.appendChild(sm);
    }
    if (!locked) b.addEventListener('click', () => secrets.setColormap(id) && render());
    return b;
  }

  function item(s: SecretView, l: Lang): HTMLElement {
    const li = document.createElement('li');
    li.className = `bls-item ${s.found ? 'found' : 'locked'}`;
    const gl = document.createElement('span');
    gl.className = 'gl';
    gl.innerHTML = s.found ? glyphSVG(s.glyph, 30) : glyphSVG('keyhole', 28);
    const tx = document.createElement('div');
    tx.className = 'tx';
    const b = document.createElement('b');
    const p = document.createElement('p');
    if (s.found) {
      b.textContent = s.name[l];
      tx.appendChild(b);
      if (s.latin) {
        const i = document.createElement('i');
        i.textContent = s.latin;
        tx.appendChild(i);
      }
      p.textContent = s.flavor[l];
      tx.appendChild(p);
      li.append(gl, tx);
      if (s.foundAt) {
        const time = document.createElement('time');
        time.dateTime = new Date(s.foundAt).toISOString();
        time.textContent = fmtDate(s.foundAt, l);
        li.appendChild(time);
      }
    } else {
      b.textContent = '· · ·';
      p.textContent = s.hint[l];
      const tiers = document.createElement('div');
      tiers.className = 'tiers';
      tiers.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < s.hintCount; i++) {
        const dot = document.createElement('i');
        if (i <= s.hintLevel) dot.className = 'on';
        tiers.appendChild(dot);
      }
      tx.append(b, p, tiers);
      const more = document.createElement('button');
      more.className = 'bls-more';
      more.type = 'button';
      const last = s.hintLevel >= s.hintCount - 1;
      more.disabled = last;
      more.textContent = (last ? T.noMore : T.more)[l];
      more.addEventListener('click', () => {
        secrets.revealHint(s.id);
        render();
      });
      li.append(gl, tx, more);
    }
    return li;
  }

  const offs = [secrets.on('progress', render), secrets.on('colormap', render)];
  render();
  return {
    el,
    refresh: render,
    dispose() {
      offs.forEach((o) => o());
      el.remove();
    },
  };
}

function bulb(): string {
  return `<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2v.5h5v-.5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/><path d="M10.5 12.5 12 10l1.5 2.5"/></svg>`;
}
