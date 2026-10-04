/**
 * Species identity (public surface): what makes each bestiary entry look and sound like itself —
 * accent hue, procedural Latin name, catalog groups, and portrait selection/normalisation.
 * Pure TypeScript, no DOM: the game freezes hue and name at registration; the UI draws portraits.
 */
export {
  CATALOG_COLORS,
  CATALOG_GROUPS,
  COLOR_FAMILIES,
  FIXED_COLORS,
  LOOKALIKE_OF,
  catalogGroup,
  colorFamily,
  fixedFamily,
  lookalikeOf,
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
export { LOOK_BODY, averageLooks, measureLook, type Look, type LookAnchors } from './look';
export {
  LOOKALIKE,
  MEASURED_LOOKS,
  SPECIES_LOOKS,
  VARIANTS,
  closestKnown,
  compareLine,
  compareLooks,
  featureChips,
  isVariant,
  lookName,
  lookSpecies,
  measuredLook,
  newSpeciesComparison,
  speciesFamily,
  speciesFeatures,
  speciesLook,
  speciesSize,
  variantNote,
  visualDistance,
  type FeatureChip,
  type FeatureId,
  type LookDiff,
  type MeasuredLook,
  type SizeClass,
  type SpeciesLook,
} from './looks';
