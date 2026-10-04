/**
 * Tiny version label (top centre) so testers can confirm which build is deployed. It shows for the first
 * seconds after load and then fades away, so it never sits on the HUD while playing (art audit, ADR-024);
 * the title screen and Settings keep showing the version. Tap it while visible to see the build date.
 */
import { BUILD_DATE, VERSION_LABEL } from './version';

/** How long the label stays on screen after the page loads. */
const VISIBLE_MS = 10_000;

function mount(): void {
  const el = document.createElement('div');
  el.className = 'bioluma-version';
  el.textContent = VERSION_LABEL;
  el.title = BUILD_DATE ? `Build ${BUILD_DATE}` : VERSION_LABEL;
  el.setAttribute('aria-label', `Versión ${VERSION_LABEL}`);
  Object.assign(el.style, {
    position: 'fixed',
    // Top centre, above the HUD counters: it never covers a button or a panel card.
    left: '50%',
    top: 'calc(1px + env(safe-area-inset-top, 0px))',
    transform: 'translateX(-50%)',
    zIndex: '70',
    font: '500 9px/1.2 "JetBrains Mono", ui-monospace, monospace',
    color: 'rgba(139, 152, 165, 0.7)',
    whiteSpace: 'nowrap',
    letterSpacing: '0.02em',
    pointerEvents: 'auto',
    userSelect: 'text',
    padding: '2px 4px',
  } satisfies Partial<CSSStyleDeclaration>);
  el.addEventListener('click', () => {
    el.textContent = el.textContent === VERSION_LABEL && BUILD_DATE ? `${VERSION_LABEL} · ${BUILD_DATE.slice(0, 16).replace('T', ' ')} UTC` : VERSION_LABEL;
  });
  document.body.appendChild(el);
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  setTimeout(() => {
    el.style.transition = still ? 'none' : 'opacity 1.2s ease';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
  }, VISIBLE_MS);
  console.info(`Bioluma ${VERSION_LABEL}${BUILD_DATE ? ` (${BUILD_DATE})` : ''}`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
