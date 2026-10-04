/**
 * Styles of the secrets UI, injected once (no edits to ui.css, which another engineer owns).
 * Night-lab look (GDD §14): near-black glass, hairlines, gold (#FFD166) for discovery.
 * Everything animated is switched off under `.bls-rm` (reduce motion).
 */
const CSS = /* css */ `
.bls-layer{position:absolute;inset:0;pointer-events:none;z-index:6;overflow:hidden}
.bls-fx{position:absolute;inset:0;width:100%;height:100%;display:block}
.bls-cards{position:absolute;left:0;right:0;top:0;display:flex;justify-content:center;padding:clamp(10px,4%,28px) 16px 0;pointer-events:none}

.bls-reveal{--acc:#ffd166;--acc-rgb:255,209,102;position:relative;pointer-events:auto;cursor:pointer;
  width:min(330px,100%);padding:18px 18px 16px;border-radius:20px;text-align:center;color:#e6edf3;
  font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;
  background:radial-gradient(120% 70% at 50% 0%,rgba(var(--acc-rgb),.13),rgba(var(--acc-rgb),0) 62%),
    linear-gradient(180deg,rgba(16,21,28,.9),rgba(8,11,15,.93));
  border:1px solid rgba(var(--acc-rgb),.30);
  box-shadow:0 18px 50px rgba(0,0,0,.62),0 0 0 1px rgba(255,255,255,.025) inset,0 0 42px rgba(var(--acc-rgb),.10);
  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
  animation:bls-card-in .55s cubic-bezier(.2,0,0,1) both;user-select:none;-webkit-user-select:none}
.bls-reveal.out{animation:bls-card-out .5s cubic-bezier(.4,0,1,1) forwards}
.bls-reveal::before{content:'';position:absolute;left:22%;right:22%;top:-1px;height:1px;
  background:linear-gradient(90deg,transparent,rgba(var(--acc-rgb),.9),transparent)}
.bls-reveal.c-ember{--acc:#ff9a4d;--acc-rgb:255,154,77}
.bls-reveal.c-silver{--acc:#cfe0ff;--acc-rgb:207,224,255}
.bls-reveal.c-violet{--acc:#c3a6ff;--acc-rgb:195,166,255}
.bls-reveal.c-all{--acc:#ffe29a;--acc-rgb:255,226,154}

.bls-seal{position:relative;width:112px;height:112px;margin:0 auto 10px;display:grid;place-items:center;color:var(--acc)}
.bls-seal .bls-ring{position:absolute;inset:0;animation:bls-spin 28s linear infinite}
.bls-seal::after{content:'';position:absolute;inset:22px;border-radius:50%;
  background:radial-gradient(circle,rgba(var(--acc-rgb),.20),rgba(var(--acc-rgb),0) 70%);animation:bls-breathe 2.6s ease-in-out infinite}
.bls-seal .bls-glyph{position:relative;z-index:1;filter:drop-shadow(0 0 6px rgba(var(--acc-rgb),.75)) drop-shadow(0 0 16px rgba(var(--acc-rgb),.35))}
.bls-seal .bls-glyph .g{stroke-dasharray:1;stroke-dashoffset:1;animation:bls-draw 1.15s cubic-bezier(.4,0,.2,1) forwards}
.bls-seal canvas{position:relative;z-index:1;width:78px;height:78px;border-radius:50%;
  filter:drop-shadow(0 0 10px rgba(var(--acc-rgb),.55));animation:bls-portrait 1.4s cubic-bezier(.2,0,0,1) both,bls-float 5s ease-in-out 1.4s infinite}

.bls-kicker{font:600 .6875rem/1 var(--bl-font-ui,Inter,system-ui,sans-serif);letter-spacing:.24em;text-transform:uppercase;
  color:var(--acc);opacity:0;animation:bls-fade .6s .35s ease forwards}
.bls-kicker .n{color:rgba(230,237,243,.55);letter-spacing:.12em}
.bls-name{margin:9px 0 0;font-size:1.375rem;font-weight:650;letter-spacing:.01em;line-height:1.15;
  text-shadow:0 0 18px rgba(var(--acc-rgb),.35)}
.bls-name .l{display:inline-block;opacity:0;filter:blur(6px);transform:translateY(4px);animation:bls-letter .7s cubic-bezier(.2,0,0,1) forwards}
.bls-latin{margin-top:3px;font-family:var(--bl-font-display,Georgia,serif);font-style:italic;font-weight:500;font-size:.875rem;color:rgba(var(--acc-rgb),.92);opacity:0;animation:bls-fade .7s .95s ease forwards}
.bls-flavor{margin:9px auto 0;max-width:30ch;font-size:.875rem;line-height:1.4;color:#a9b6c3;opacity:0;animation:bls-fade .8s 1.1s ease forwards}
.bls-reward{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin-top:12px;opacity:0;animation:bls-fade .7s 1.45s ease forwards}
.bls-chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:12px;
  font:600 .6875rem/1 var(--bl-font-ui,Inter,system-ui,sans-serif);letter-spacing:.04em;color:#e6edf3;
  background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08)}
.bls-chip .sw{width:22px;height:8px;border-radius:4px}
.bls-chip.gold{color:#ffd166;border-color:rgba(255,209,102,.28);background:rgba(255,209,102,.07)}

@keyframes bls-card-in{from{opacity:0;transform:translateY(-10px) scale(.965)}to{opacity:1;transform:none}}
@keyframes bls-card-out{to{opacity:0;transform:translateY(-8px) scale(.985)}}
@keyframes bls-spin{to{transform:rotate(360deg)}}
@keyframes bls-breathe{0%,100%{opacity:.55;transform:scale(.94)}50%{opacity:1;transform:scale(1.05)}}
@keyframes bls-draw{to{stroke-dashoffset:0}}
@keyframes bls-fade{to{opacity:1}}
@keyframes bls-letter{to{opacity:1;filter:none;transform:none}}
@keyframes bls-portrait{from{opacity:0;transform:scale(.6) rotate(-30deg);filter:blur(6px)}to{opacity:1;transform:none}}
@keyframes bls-float{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-2px) rotate(4deg)}}

/* ── Basement ── */
.bls-basement{--acc:#ffd166;color:#e6edf3;font-family:Inter,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-size:.875rem;line-height:1.35;
  background:radial-gradient(90% 40% at 50% 0%,rgba(255,196,110,.07),rgba(255,196,110,0) 70%),#0b0e12;
  padding:18px 16px 28px;min-height:100%;box-sizing:border-box;-webkit-font-smoothing:antialiased;max-width:760px;margin:0 auto}
.bls-basement *{box-sizing:border-box}
.bls-bh{display:flex;gap:14px;align-items:center}
.bls-bulb{flex:none;width:48px;height:48px;display:grid;place-items:center;color:#ffcf7a;border-radius:50%;
  background:radial-gradient(circle,rgba(255,200,110,.22),rgba(255,200,110,0) 70%);animation:bls-flicker 7s infinite}
.bls-bh h2{margin:0;font-size:1.125rem;font-weight:650;letter-spacing:.01em}
.bls-bh p{margin:3px 0 0;color:#8b98a5;font-style:italic;font-size:.8125rem}
.bls-meter{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center;margin:18px 0 6px;padding:12px 14px;border-radius:14px;
  background:#141a21;border:1px solid rgba(230,237,243,.08)}
.bls-count{font:700 1.375rem/1 var(--bl-font-ui,Inter,system-ui,sans-serif);color:#ffd166}
.bls-count span{color:#5d6874;font-weight:600;font-size:.9375rem}
.bls-bar{height:6px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden}
.bls-bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,#c9932f,#ffd166 70%,#fff1c4);box-shadow:0 0 12px rgba(255,209,102,.5);transition:width .6s cubic-bezier(.2,0,0,1)}
.bls-bonus{grid-column:1/-1;color:#8b98a5;font-size:.75rem}
.bls-bonus b{color:#e6edf3;font-weight:600}
.bls-basement h3{display:flex;justify-content:space-between;align-items:baseline;margin:22px 2px 8px;font:600 .6875rem/1 var(--bl-font-ui,Inter,system-ui,sans-serif);
  letter-spacing:.2em;text-transform:uppercase;color:#8b98a5}
.bls-basement h3 span{letter-spacing:.06em;color:#5d6874}
.bls-swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}
.bls-sw{display:flex;flex-direction:column;gap:5px;min-height:48px;padding:8px 9px;border-radius:12px;text-align:left;cursor:pointer;color:#e6edf3;
  background:#141a21;border:1px solid rgba(230,237,243,.08);font:inherit;font-size:.75rem}
.bls-sw .strip{height:14px;border-radius:7px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.06)}
.bls-sw[aria-pressed=true]{border-color:rgba(255,209,102,.7);box-shadow:0 0 0 1px rgba(255,209,102,.35),0 0 18px rgba(255,209,102,.15)}
.bls-sw:disabled{cursor:default;color:#5d6874}
.bls-sw:disabled .strip{background:repeating-linear-gradient(135deg,rgba(255,255,255,.05) 0 6px,transparent 6px 12px)!important}
.bls-sw small{color:#5d6874;font-size:.6875rem;font-style:italic;line-height:1.2}
.bls-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.bls-item{display:flex;gap:12px;align-items:flex-start;padding:10px 12px;border-radius:14px;background:#141a21;border:1px solid rgba(230,237,243,.07)}
.bls-item .gl{flex:none;width:40px;height:40px;display:grid;place-items:center;border-radius:12px;color:#ffd166;
  background:radial-gradient(circle,rgba(255,209,102,.14),rgba(255,209,102,0) 72%)}
.bls-item .gl .bls-glyph{filter:drop-shadow(0 0 4px rgba(255,209,102,.5))}
.bls-item .tx{flex:1;min-width:0}
.bls-item .tx b{display:block;font-weight:600;font-size:.9375rem}
.bls-item .tx i{display:block;color:#ffd166;opacity:.85;font-size:.8125rem}
.bls-item .tx p{margin:3px 0 0;color:#a9b6c3;font-size:.8125rem}
.bls-item time{flex:none;color:#5d6874;font:500 .6875rem/1.6 var(--bl-font-ui,Inter,system-ui,sans-serif)}
.bls-item.locked{background:rgba(20,26,33,.55);border-style:dashed;border-color:rgba(230,237,243,.09)}
.bls-item.locked .gl{color:#4f5b67;background:rgba(255,255,255,.025)}
.bls-item.locked .tx b{color:#5d6874;letter-spacing:.3em}
.bls-item.locked .tx p{color:#8b98a5;font-style:italic}
.bls-item .tiers{display:flex;gap:4px;margin-top:7px}
.bls-item .tiers i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.1)}
.bls-item .tiers i.on{background:#8b98a5}
.bls-more{flex:none;align-self:center;min-width:48px;min-height:48px;padding:0 12px;border-radius:12px;cursor:pointer;
  color:#5bc0eb;background:rgba(91,192,235,.08);border:1px solid rgba(91,192,235,.22);font:600 .75rem/1.1 Inter,system-ui,sans-serif}
.bls-more:disabled{opacity:.35;cursor:default}
.bls-motion{margin-top:18px;width:100%;min-height:48px;border-radius:12px;cursor:pointer;color:#e6edf3;background:#1b232c;border:1px solid rgba(230,237,243,.1);font:inherit}
@keyframes bls-flicker{0%,100%{opacity:1}3%{opacity:.4}4%{opacity:1}43%{opacity:1}44%{opacity:.6}45%{opacity:1}46%{opacity:.75}47%{opacity:1}}

/* ── Long-press ring over the essence counter ── */
.bls-hold{position:fixed;pointer-events:none;z-index:50;border-radius:50%;opacity:0;transition:opacity .4s}
.bls-hold.on{opacity:1}
.bls-hold.done{animation:bls-hold-done .7s ease forwards}
@keyframes bls-hold-done{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.5)}}

/* ── Logo wake (HUD logo / wordmark marked with data-secret-logo) ── */
.bls-logo-awake{animation:bls-wake 1.3s cubic-bezier(.3,0,.2,1) 3}
@keyframes bls-wake{0%{filter:none;transform:none}30%{filter:drop-shadow(0 0 10px rgba(255,209,102,.9)) brightness(1.4);transform:rotate(-8deg) scale(1.08)}
  60%{filter:drop-shadow(0 0 14px rgba(91,192,235,.8));transform:rotate(6deg) scale(1.04)}100%{filter:none;transform:none}}

.bls-rm .bls-reveal,.bls-rm .bls-reveal.out{animation-duration:.01s}
.bls-rm .bls-seal .bls-ring,.bls-rm .bls-seal::after,.bls-rm .bls-seal canvas,.bls-rm .bls-bulb{animation:none}
.bls-rm .bls-seal .bls-glyph .g{animation:none;stroke-dashoffset:0}
.bls-rm .bls-name .l,.bls-rm .bls-kicker,.bls-rm .bls-latin,.bls-rm .bls-flavor,.bls-rm .bls-reward{animation:none;opacity:1;filter:none;transform:none}
.bls-rm.bls-logo-awake,.bls-rm .bls-logo-awake{animation:none}
`;

let injected = false;

export function injectSecretsStyles(doc: Document = document): void {
  if (injected || doc.getElementById('bl-secrets-css')) return;
  injected = true;
  const s = doc.createElement('style');
  s.id = 'bl-secrets-css';
  s.textContent = CSS;
  doc.head.appendChild(s);
}
