/**
 * The dish never steps blind (ADR-025, docs/DISH.md §4): swimmers stay off the absorbing glass only
 * if the deflector sees them every `every` steps. At a snapshot boundary whose snapshot has not been
 * taken (one still in flight), stepping waits: a slow readback makes the dish run slower instead of
 * letting a fresh Orbium cross half the Ø96 dish unsteered (~60 steps) and die on the glass — the
 * empty session-1 dish of v0.014.
 */
export function mustWaitForDetection(stepCount: number, detectedStep: number, every: number): boolean {
  return stepCount % every === 0 && detectedStep !== stepCount;
}
