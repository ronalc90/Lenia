/** Lab session UI (docs/CICLO.md §2–3): HUD clock, start card, end-of-session summary. */
export {
  createSessionHud,
  hudViewOf,
  hudState,
  type SessionHud,
  type SessionHudView,
  type SessionHudOptions,
  type SessionHudSound,
  type SessionPreviewView,
} from './hud';
export { createSessionStart, type SessionStartView, type SessionStartOptions, type SessionStartExtras } from './start';
export {
  createSessionSummary,
  datosExplain,
  equationRows,
  type SessionSummaryView,
  type SessionSummaryOptions,
  type SummaryExtras,
  type SummarySpecies,
  type SummarySound,
  type EqRow,
} from './summary';
export { createSessionFlow, type SessionFlow, type SessionFlowOptions, type SessionFlowSound } from './flow';
