/** Public surface of the Momentos UI (DOM/canvas). See docs/MOMENTOS.md. */
export { createMomentsUI, type MomentsUI, type MomentsUIOptions, type MomentsSound, type PortraitLike } from './momentsUI';
export { createHelp, type HelpSheet } from './help';
export { drawCreatureStatus, drawBehaviorGlyph, statusInfo, pickStatusIds, placePill, StatusLayer, type StatusInfo } from './status';
export {
  createSeedPriceSheet,
  SlotMeter,
  drawSlotMeter,
  priceTerms,
  seedPriceExplain,
  seedPriceReason,
  seedPriceToday,
  bigSeedReason,
  snapOf,
  type SeedPriceSheet,
  type PriceBreakdown,
  type PriceSnap,
} from './seedprice';
export { Illustration, ILLUSTRATION_KINDS, ILLUS_W, ILLUS_H } from './illustrations';
export {
  createSpeciesCard,
  createSpeciesCompare,
  speciesInputFromView,
  speciesBreakdown,
  compareSpecies,
  shapeLabel,
  boostersFor,
  behaviorMultFor,
  hueColor,
  paintPortrait,
  type SpeciesCardInput,
  type SpeciesCard,
  type SpeciesCompare,
} from './species-card';
export {
  createBehaviorGuide,
  createBehaviorGuideSheet,
  behaviorRowsHtml,
  type BehaviorGuide,
  type BehaviorGuideSheet,
  type BehaviorGuideOpts,
  type ExtraBooster,
} from './behavior-guide';
export {
  createPriceSheet,
  PriceTicker,
  priceSheetHtml,
  dotsHtml,
  REASON_MS,
  type PriceExplain,
  type PriceTermView,
  type PriceRowView,
  type PriceReason,
  type PriceSheet,
} from './price';
