/**
 * Store UI entry points (lazy-load this module: it is only needed when the player opens the store
 * or the wardrobe).
 */
export { openStore, type StoreUIHandle, type StoreUIOptions } from './modal';
export { openWardrobe, type WardrobeHandle, type WardrobeOptions } from './wardrobe';
export { createMusicDemo } from './music-demo';
