/**
 * Species identity (public surface): what makes each bestiary entry look and sound like itself —
 * accent hue, procedural Latin name, catalog groups, and portrait selection/normalisation.
 * Pure TypeScript, no DOM: the game freezes hue and name at registration; the UI draws portraits.
 */
export {
  CATALOG_COLORS,
  CATALOG_GROUPS,
  COLOR_FAMILIES,
  catalogGroup,
  colorFamily,
  commonName,
  formatLatin,
  hashString,
  hueDistance,
  latinName,
  nameNoun,
  sameCatalogSpecies,
  shapeTraits,
  signatureKey,
  speciesHue,
  type ColorFamily,
  type NameParts,
} from './identity';
export { SHAPE_LABELS, shapeImageFeatures, shapeKind, shapeLabel, type ShapeKind } from './shape';
export {
  canonicalAngle,
  catalogPortrait,
  isolateCreature,
  normalizePortrait,
  portraitScore,
  tightSquare,
  type CaptureStats,
} from './portrait';
