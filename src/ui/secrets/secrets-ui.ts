/**
 * Presentation of the secrets module: the overlay effects over the dish, the "Secreto
 * descubierto" reveal card and the logo wake. The basement page is created on demand
 * (createBasement) and mounted by the Settings UI.
 *
 *   const sui = createSecretsUI(dishEl, secrets, { camera, lang, reduceMotion, onSound });
 *
 * `root` must be the element that covers the dish canvas (same box the Camera view uses).
 */
import type { Camera } from '../../core/camera';
import type { Lang } from '../../core/types';
import type { Secrets } from '../../secrets/secrets';
import type { SecretEffect, SecretView } from '../../secrets/types';
import { type BasementPanel, createBasementPanel } from './basement';
import { EffectsLayer } from './effects';
import { RevealQueue } from './reveal';
import { injectSecretsStyles } from './styles';

export type SecretSound = 'secret' | 'secretSpecies' | 'allFound';

export interface SecretsUIOptions {
  camera: Camera;
  lang: () => Lang;
  reduceMotion: () => boolean;
  /** Fired when a reveal card appears: play the secret jingle here. */
  onSound?: (kind: SecretSound, secret: SecretView | null) => void;
  /** Where reveal cards go (default: `root`). */
  cardRoot?: HTMLElement;
  /** iOS motion permission (from attachSecretInputs) for the basement button. */
  requestMotion?: (() => Promise<boolean>) | null;
  /** Print the devtools greeting once (default true). */
  consoleGreeting?: boolean;
}

export interface SecretsUI {
  readonly effects: EffectsLayer;
  /** Play an effect directly (story hints may reuse them). */
  play(e: SecretEffect): void;
  /** Show a reveal card for a secret (normally automatic on `found`). */
  reveal(secret: SecretView, index: number, total: number): void;
  /** Build the "Laboratorio del sótano" page (call secrets.onBasementOpened() when shown). */
  createBasement(): BasementPanel;
  /** Call after the dish element changes size, if no ResizeObserver. */
  resize(): void;
  dispose(): void;
}

let greeted = false;

function greet(): void {
  if (greeted || typeof console === 'undefined') return;
  greeted = true;
  console.log(
    '%c◉ Bioluma%c  Si lees esto, eres de quien mira debajo de las cosas. Debajo del laboratorio también hay algo.\n            If you are reading this, you look under things. There is something under the lab, too.',
    'color:#5bc0eb;font-weight:700;font-size:13px',
    'color:#8b98a5',
  );
}

export function createSecretsUI(root: HTMLElement, secrets: Secrets, opts: SecretsUIOptions): SecretsUI {
  injectSecretsStyles();
  if (opts.consoleGreeting !== false) greet();
  const layer = document.createElement('div');
  layer.className = 'bls-layer';
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
  root.appendChild(layer);

  const effects = new EffectsLayer(layer, opts.camera, opts.reduceMotion, opts.lang);
  const cards = document.createElement('div');
  cards.className = 'bls-cards';
  (opts.cardRoot ?? layer).appendChild(cards);

  const syncRM = () => {
    const rm = opts.reduceMotion();
    layer.classList.toggle('bls-rm', rm);
    cards.classList.toggle('bls-rm', rm);
  };
  syncRM();

  const reveals = new RevealQueue({
    host: cards,
    lang: opts.lang,
    reduceMotion: opts.reduceMotion,
    onShow: (item, seal, hue) => {
      syncRM();
      const cr = cards.getBoundingClientRect();
      const lr = layer.getBoundingClientRect();
      effects.burst(seal.x + cr.left - lr.left, seal.y + cr.top - lr.top, hue, item.all ? 70 : 40);
      opts.onSound?.(item.all ? 'allFound' : item.secret.category === 'species' ? 'secretSpecies' : 'secret', item.all ? null : item.secret);
    },
  });

  const wake = (ms: number) => {
    for (const el of document.querySelectorAll<HTMLElement>('[data-secret-logo]')) {
      el.classList.remove('bls-logo-awake');
      void el.offsetWidth; // restart the animation
      el.classList.toggle('bls-rm', opts.reduceMotion());
      el.classList.add('bls-logo-awake');
      setTimeout(() => el.classList.remove('bls-logo-awake'), ms);
    }
  };

  const offs = [
    secrets.on('effect', (e) => {
      syncRM();
      if (e.kind === 'logoWake') wake(e.duration * 1000);
      else effects.add(e);
    }),
    secrets.on('found', (f) => reveals.push({ secret: f.secret, index: f.index, total: f.total })),
    secrets.on('allFound', () => {
      const any = secrets.list()[0];
      reveals.push({ secret: any, index: secrets.total, total: secrets.total, all: true });
      effects.add({ kind: 'aurora', duration: 14 });
      effects.add({ kind: 'motes', count: 120, hue: 'gold', duration: 9, from: 'bottom' });
    }),
  ];

  return {
    effects,
    play: (e) => (e.kind === 'logoWake' ? wake(e.duration * 1000) : effects.add(e)),
    reveal: (secret, index, total) => reveals.push({ secret, index, total }),
    createBasement: () => createBasementPanel(secrets, { lang: opts.lang, requestMotion: opts.requestMotion ?? null }),
    resize: () => effects.resize(),
    dispose() {
      offs.forEach((o) => o());
      reveals.dispose();
      effects.dispose();
      layer.remove();
      cards.remove();
    },
  };
}
