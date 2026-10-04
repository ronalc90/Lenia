/** Public surface of the story module (pure TS, no DOM). See docs/STORY.md. */
export { createStory, STORY_STORAGE_KEY, type Story, type StoryCurrent } from './story';
export { ENDINGS, LEANING_NAMES, computeLeanings, finalOptions, rankLeanings, secretUnlocked, secretProgress } from './endings';
export { SCENES, SCENE_BY_ID, STORY_JOURNAL, SPEAKER_NAMES, ACT_TITLES, SEED_SPECIES } from './script';
export * from './types';
