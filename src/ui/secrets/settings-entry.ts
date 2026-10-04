/**
 * The Settings row that leads to the "Laboratorio del sótano" (spoilers: docs/SECRETS.md). It exists
 * only once BASEMENT_UNLOCK secrets are found (no hint before), appears while Settings is open if the
 * tenth secret is found then, and opens the basement page in place (a tap: no popup over the game).
 * Opening it is itself a secret (secrets.onBasementOpened()).
 */
import type { Lang, Text } from '../../core/types';
import type { Secrets } from '../../secrets/secrets';
import type { BasementPanel } from './basement';
import { injectSecretsStyles } from './styles';

const T = {
  title: { es: 'Laboratorio del sótano', en: 'Basement lab' },
  sub: { es: 'Hay una puerta que antes no estaba.', en: 'There is a door that was not there before.' },
  open: { es: 'Bajar', en: 'Go down' },
  close: { es: 'Subir', en: 'Go up' },
} satisfies Record<string, Text>;

export interface BasementEntry {
  dispose(): void;
}

export function mountBasementEntry(
  container: HTMLElement,
  secrets: Secrets,
  opts: { lang(): Lang; createBasement(): BasementPanel },
): BasementEntry {
  injectSecretsStyles();
  const group = document.createElement('div');
  group.className = 'set-group bls-entry';
  group.hidden = true;
  const h4 = document.createElement('h4');
  const card = document.createElement('div');
  card.className = 'set-card bls-entry-card';
  const p = document.createElement('p');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn';
  btn.setAttribute('data-testid', 'basement-open');
  card.append(p, btn);
  const slot = document.createElement('div');
  slot.className = 'bls-entry-panel';
  group.append(h4, card, slot);
  container.appendChild(group);

  let panel: BasementPanel | null = null;
  const label = () => {
    const l = opts.lang();
    h4.textContent = T.title[l];
    p.textContent = T.sub[l];
    btn.textContent = (panel ? T.close : T.open)[l];
    btn.setAttribute('aria-expanded', panel ? 'true' : 'false');
  };
  const sync = () => {
    group.hidden = !secrets.basementUnlocked();
    label();
  };
  btn.addEventListener('click', () => {
    if (panel) {
      panel.dispose();
      panel = null;
    } else {
      panel = opts.createBasement();
      slot.appendChild(panel.el);
      secrets.onBasementOpened();
      // Scroll only the Settings sheet (scrollIntoView would also nudge the page sideways).
      let sc: HTMLElement | null = slot.parentElement;
      while (sc && !(sc.scrollHeight > sc.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
      if (sc) sc.scrollTop += Math.max(0, btn.getBoundingClientRect().top - sc.getBoundingClientRect().top - 12);
    }
    label();
  });
  const offs = [
    secrets.on('progress', () => {
      sync();
      panel?.refresh();
    }),
    secrets.on('colormap', () => panel?.refresh()),
  ];
  sync();
  return {
    dispose() {
      offs.forEach((o) => o());
      panel?.dispose();
      panel = null;
      group.remove();
    },
  };
}
