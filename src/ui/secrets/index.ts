/** Secrets UI — public surface (spoilers: docs/SECRETS.md). */
export { createSecretsUI } from './secrets-ui';
export type { SecretsUI, SecretsUIOptions, SecretSound } from './secrets-ui';
export { createBasementPanel } from './basement';
export type { BasementPanel, BasementOptions } from './basement';
export { attachSecretInputs, createStrokeRecorder } from './inputs';
export type { SecretInputs, SecretInputsOptions, StrokeRecorder } from './inputs';
export { EffectsLayer, lifeStep } from './effects';
export { glyphSVG } from './glyphs';
export { colormapCSS } from './reveal';
export { mountBasementEntry } from './settings-entry';
export type { BasementEntry } from './settings-entry';
