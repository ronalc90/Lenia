/** Styles of the art-dev.html page only (not shipped with the game). */
export const DEV_CSS = `
html, body { margin: 0; background: var(--bl-bg); color: var(--bl-text); font-family: var(--bl-font-ui);
  -webkit-font-smoothing: antialiased; }
body { padding: 0 16px 48px; }
#app { max-width: 1280px; margin: 0 auto; }
.ad-top { position: sticky; top: 0; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px;
  padding: 12px 0; background: color-mix(in srgb, var(--bl-bg) 92%, transparent); backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--bl-line); }
.ad-top h1 { margin: 0; font: 700 22px/28px var(--bl-font-display); letter-spacing: .01em; }
.ad-top h1 em { color: var(--bl-candle); font-style: italic; font-weight: 600; }
.ad-top nav { display: flex; flex-wrap: wrap; gap: 4px; }
.ad-top a { color: var(--bl-text2); text-decoration: none; font: 600 13px/18px var(--bl-font-ui); padding: 6px 10px;
  border-radius: 999px; border: 1px solid var(--bl-line); }
.ad-top a.ad-theme { color: var(--bl-accent); border-color: var(--bl-accent); }
.ad-sec { padding: 28px 0 8px; border-bottom: 1px solid var(--bl-line); }
.ad-sec > header h2 { margin: 0 0 4px; font: 700 28px/34px var(--bl-font-display); }
.ad-sec > header h2 small { font: 600 14px var(--bl-font-ui); color: var(--bl-text3); margin-left: 6px; }
.ad-sec > header p { margin: 0 0 16px; color: var(--bl-text2); font-size: 15px; line-height: 22px; max-width: 760px; }
.ad-sec h3 { margin: 20px 0 10px; font: 700 13px/18px var(--bl-font-ui); letter-spacing: .08em; text-transform: uppercase;
  color: var(--bl-text2); }
.ad-sec h3 small { color: var(--bl-text3); font-weight: 600; margin-left: 4px; }
.ad-grid.sw { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.ad-sw { display: grid; grid-template-columns: 28px 1fr; grid-template-rows: auto auto auto; column-gap: 8px; padding: 8px;
  border-radius: 12px; background: var(--bl-surface); border: 1px solid var(--bl-line); }
.ad-sw span { grid-row: 1 / 4; width: 28px; height: 28px; border-radius: 8px; box-shadow: inset 0 0 0 1px rgba(127,127,127,.25); }
.ad-sw b { font-size: 13px; } .ad-sw code, .ad-sw small { font: 500 11px/15px var(--bl-font-mono); color: var(--bl-text2); }
.ad-types { display: grid; gap: 6px; }
.ad-type { display: grid; grid-template-columns: 170px 1fr; align-items: baseline; gap: 12px; padding: 6px 0;
  border-bottom: 1px dashed var(--bl-line); overflow: hidden; }
.ad-type small { color: var(--bl-text3); font: 500 12px var(--bl-font-mono); }
.ad-type > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ad-display { font: 700 36px/40px var(--bl-font-display); font-variation-settings: 'SOFT' 100, 'opsz' 72; }
.ad-latin { font: italic 600 24px/30px var(--bl-font-display); font-variation-settings: 'SOFT' 100; }
.ad-num { font: 700 28px/32px var(--bl-font-ui); font-variant-numeric: tabular-nums; }
.ad-mono { font: 700 15px/20px var(--bl-font-mono); letter-spacing: .04em; }
.ad-icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 6px; color: var(--tone, var(--bl-text)); }
.ad-icons figure { margin: 0; display: grid; justify-items: center; gap: 4px; padding: 10px 4px 8px; border-radius: 12px;
  background: var(--bl-surface); border: 1px solid var(--bl-line); }
.ad-icons figcaption { font: 500 11px/14px var(--bl-font-mono); color: var(--bl-text2); text-align: center; word-break: break-all; }
.ad-ic { width: 32px; height: 32px; }
.ad-sizes { display: grid; gap: 10px; }
.ad-sizes > div { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 8px 12px; border-radius: 12px;
  background: var(--bl-surface); border: 1px solid var(--bl-line); }
.ad-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
.ad-card { background: var(--bl-surface); border: 1px solid var(--bl-line); border-radius: 16px; padding: 12px;
  display: grid; gap: 8px; justify-items: center; }
.ad-card > b { font: 700 14px/18px var(--bl-font-ui); }
.ad-card > small { color: var(--bl-text2); font-size: 12px; text-align: center; max-width: 220px; }
.ad-night { background: radial-gradient(120% 90% at 50% 30%, #121b27, #06090d); border-color: #1f2a36; color: #e6edf3; }
.ad-night > small { color: #a7b3bf; }
canvas.ad-cv { display: block; }
.ad-minis { align-items: center; }
.ad-mini { padding: 6px; border-radius: 12px; background: #0d131b; border: 1px solid #1f2a36; }
.ad-on-surface { background: var(--bl-surface2); }
.ad-worlds { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.ad-wcard { position: relative; display: block; aspect-ratio: 16 / 10; padding: 0; border: 0; border-radius: 16px; overflow: hidden;
  background: #06090d; color: #f2f6fa; text-align: left; font: inherit; cursor: pointer;
  box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 10px 28px rgba(0,0,0,.35); transition: transform 140ms var(--bl-ease-standard); }
.ad-wcard:active { transform: scale(.98); }
.ad-wcard > svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.ad-wcard.picked { box-shadow: 0 0 0 3px var(--w-ring), 0 0 24px color-mix(in srgb, var(--w-glow) 45%, transparent), 0 10px 28px rgba(0,0,0,.35); }
.ad-wtext { position: absolute; left: 14px; top: 12px; right: 28%; display: grid; gap: 4px; }
.ad-wname { display: flex; align-items: center; gap: 6px; font: 700 17px/22px var(--bl-font-display); font-variation-settings: 'SOFT' 100;
  text-shadow: 0 1px 8px rgba(0,0,0,.6); }
.ad-wname .bl-ic { color: var(--w-ring, #fff); flex: none; }
.ad-wdesc { font: 500 13px/18px var(--bl-font-ui); color: rgba(235,242,248,.86); text-shadow: 0 1px 6px rgba(0,0,0,.7); }
.ad-wpick { position: absolute; right: 10px; top: 10px; width: 30px; height: 30px; border-radius: 999px; display: grid; place-items: center;
  background: var(--w-ring); color: #06121a; }
.ad-wnew { position: absolute; right: 10px; top: 10px; padding: 3px 9px; border-radius: 999px; background: #ffd166; color: #2a1d00;
  font: 800 12px/16px var(--bl-font-ui); letter-spacing: .02em; }
.ad-wcard.locked { cursor: default; }
.ad-wcard.locked .ad-wname { color: #c3ccd5; }
.ad-ramprow { display: grid; grid-template-columns: 220px 1fr; align-items: center; gap: 12px; margin: 6px 0; }
.ad-ramprow small { color: var(--bl-text2); font: 500 12px var(--bl-font-mono); }
.ad-ramp { width: 100%; height: 28px; border-radius: 8px; box-shadow: 0 0 0 1px var(--bl-line); }
.ad-pair { display: flex; gap: 8px; }
.ad-fams .ad-fam { padding: 8px; gap: 6px; }
.ad-fam small { font: 600 11px var(--bl-font-mono); }
.ad-acc { width: 56px; height: 6px; border-radius: 3px; }
.ad-paper { background: #ffffff; border-color: #dfe5eb; color: #0f1720; }
.ad-dishwrap { display: grid; place-items: center; }
.ad-dish { border-radius: 20px; }
@media (max-width: 600px) { .ad-ramprow { grid-template-columns: 1fr; gap: 4px; } }
.ad-icons.ad-ems { grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); }
.ad-ems figure { padding: 10px 6px; }
.ad-emrow { display: flex; gap: 8px; align-items: center; }
.ad-pill { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 6px 14px 6px 10px; border-radius: 999px;
  background: var(--bl-surface); border: 1px solid var(--bl-line); color: var(--bl-text); }
.ad-pill small { color: var(--bl-text2); font: 600 13px var(--bl-font-ui); }
.ad-pill b { font: 700 16px var(--bl-font-ui); }
.ad-pill.gold { border-color: color-mix(in srgb, var(--bl-gold) 55%, transparent); }
.ad-num-s { font-variant-numeric: tabular-nums; }
.ad-comp { display: grid; gap: 18px; }
.ad-btns { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.ad-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 0 22px; border-radius: 16px;
  border: 1.5px solid var(--bl-line2); background: var(--bl-surface2); color: var(--bl-text); font: 700 16px var(--bl-font-ui); cursor: pointer; }
.ad-btn.primary { background: var(--bl-accent-fill); border-color: transparent; color: var(--bl-accent-ink); box-shadow: var(--bl-shadow-glow); }
.ad-btn.ghost { background: transparent; border-color: transparent; color: var(--bl-text2); }
.ad-btn.small { min-height: 48px; padding: 0 16px; font-size: 15px; }
.ad-iconbtn { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 16px; border: 1.5px solid var(--bl-line2);
  background: var(--bl-surface2); color: var(--bl-text); cursor: pointer; }
.ad-nodes { display: flex; flex-wrap: wrap; gap: 18px; }
.ad-node { position: relative; display: grid; justify-items: center; gap: 8px; width: 92px; }
.ad-node small { font: 600 12px var(--bl-font-ui); color: var(--bl-text2); }
.ad-tile { width: 64px; height: 64px; border-radius: 18px; display: grid; place-items: center; color: var(--r);
  background: color-mix(in srgb, var(--r) 14%, var(--bl-surface)); border: 2px solid color-mix(in srgb, var(--r) 45%, transparent); }
.ad-node.owned .ad-tile { border-color: var(--r); box-shadow: 0 0 0 4px color-mix(in srgb, var(--r) 18%, transparent), 0 0 22px color-mix(in srgb, var(--r) 35%, transparent); }
.ad-node.buy .ad-tile { border-color: var(--bl-good); box-shadow: 0 0 0 4px color-mix(in srgb, var(--bl-good) 22%, transparent); }
.ad-node.mystery .ad-tile { border-style: dashed; color: var(--bl-text3); background: var(--bl-surface); border-color: var(--bl-line2); }
.ad-badge { position: absolute; top: 46px; right: 6px; padding: 1px 7px; border-radius: 999px; background: var(--r); color: #06121a;
  font: 800 12px/18px var(--bl-font-ui); }
.ad-cost { display: inline-flex; align-items: center; gap: 3px; padding: 1px 8px; border-radius: 999px; font: 700 13px/20px var(--bl-font-ui);
  background: var(--bl-surface2); color: var(--bl-aurora); border: 1px solid var(--bl-line); }
.ad-node.buy .ad-cost { color: var(--bl-good); border-color: color-mix(in srgb, var(--bl-good) 45%, transparent); }
.ad-toast { display: inline-flex; align-items: center; gap: 10px; max-width: 520px; padding: 12px 16px; border-radius: 14px;
  background: var(--bl-surface2); border: 1px solid var(--bl-line); color: var(--bl-text); box-shadow: var(--bl-shadow-md); justify-self: start; }
.ad-toast .bl-ic { color: var(--bl-good); flex: none; }
.ad-latin-s { font: italic 600 15px var(--bl-font-display); font-variation-settings: 'SOFT' 100; }
.ad-dialog { display: grid; grid-template-columns: 88px 1fr auto; gap: 12px; align-items: center; max-width: 640px; padding: 12px 14px 12px 8px;
  border-radius: 20px; background: linear-gradient(180deg, #1a2330, #121922); border: 1px solid #2a3542; color: #e6edf3;
  box-shadow: 0 0 0 1px rgba(255,184,107,.12), 0 18px 40px rgba(0,0,0,.4); }
.ad-dialog p { margin: 2px 0 0; font: 500 17px/24px var(--bl-font-ui); }
.ad-who { font: 800 12px/16px var(--bl-font-ui); letter-spacing: .14em; color: #ffb86b; }
.ad-dialog .ad-btn.small { background: #222c38; color: #e6edf3; border-color: #3a4652; }
.ad-curves { border-radius: 12px; background: var(--bl-surface); }
.ad-juice { margin-top: 14px; align-items: center; }
@media (max-width: 600px) {
  .ad-dialog { grid-template-columns: 72px 1fr; }
  .ad-dialog .ad-btn.small { grid-column: 1 / -1; justify-self: end; }
  .ad-dialog-pic canvas { width: 72px !important; height: 72px !important; }
}
.ad-lab { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
.ad-lab figure { margin: 0; display: grid; justify-items: center; gap: 4px; }
.ad-lab figcaption { font: 500 11px var(--bl-font-mono); color: var(--bl-text2); }
.ad-lab-ic { position: relative; width: 72px; height: 72px; display: grid; place-items: center; background: var(--bl-surface);
  border-radius: 8px; color: var(--bl-text); }
.ad-kl { position: absolute; inset: 4px; width: 64px; height: 64px; fill: none; stroke: rgba(127,160,200,.14); stroke-width: .05; }
.ad-kl .m { stroke: rgba(255,120,120,.45); stroke-width: .08; }
.ad-lab-ic .bl-ic { position: relative; }
@media (max-width: 600px) {
  .ad-type { grid-template-columns: 1fr; gap: 2px; }
  .ad-display { font-size: 30px; }
  .ad-icons { grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); }
}
`;
