/**
 * Tiny always-on version label (bottom-left corner) so testers can confirm which
 * build is deployed. Independent of the game UI; tap it to see the build date.
 */
import { BUILD_DATE, VERSION_LABEL } from './version';

function mount(): void {
  const el = document.createElement('div');
  el.className = 'bioluma-version';
  el.textContent = VERSION_LABEL;
  el.title = BUILD_DATE ? `Build ${BUILD_DATE}` : VERSION_LABEL;
  el.setAttribute('aria-label', `Versión ${VERSION_LABEL}`);
  Object.assign(el.style, {
    position: 'fixed',
    left: 'calc(6px + env(safe-area-inset-left, 0px))',
    bottom: 'calc(4px + env(safe-area-inset-bottom, 0px))',
    zIndex: '70',
    font: '500 10px/1.2 "JetBrains Mono", ui-monospace, monospace',
    color: 'rgba(139, 152, 165, 0.75)',
    letterSpacing: '0.02em',
    pointerEvents: 'auto',
    userSelect: 'text',
    padding: '2px 4px',
  } satisfies Partial<CSSStyleDeclaration>);
  el.addEventListener('click', () => {
    el.textContent = el.textContent === VERSION_LABEL && BUILD_DATE ? `${VERSION_LABEL} · ${BUILD_DATE.slice(0, 16).replace('T', ' ')} UTC` : VERSION_LABEL;
  });
  document.body.appendChild(el);
  console.info(`Bioluma ${VERSION_LABEL}${BUILD_DATE ? ` (${BUILD_DATE})` : ''}`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
