/**
 * The human cast under scientific realism (ADR-029, docs/ARTE-REALISTA.md §5): you in first person
 * (a gloved hand, the coat you picked), Albor never face on (from behind in her Polaroid, in profile
 * against the dawn), the three coats on the rack, and the dialogue portraits.
 */
export {
  COAT_GLOVE,
  DOCTOR_MOODS,
  GLOVE_TONES,
  HAND_POSES,
  MOOD_GESTURE,
  drawDoctorAt,
  drawDoctorBust,
  drawGlovedHand,
  drawLantern,
  handAngle,
  handTip,
  mix,
  type DoctorMood,
  type DoctorPose,
  type DoctorSpec,
  type GloveTone,
  type Gesture,
  type HairStyle,
  type HandOpts,
  type HandPose,
  type HeldItem,
} from './doctor';
export { BATA_CARD_TEXT, BATA_FICHA, COAT_IDS, drawBataCard, drawCoat, type BataCardOpts, type CoatId } from './coats';
export {
  POLAROID_CAPTION,
  drawAlborBack,
  drawAlborPolaroid,
  drawAlborProfile,
  type AlborPose,
  type AlborProfileOpts,
  type PolaroidOpts,
} from './albor';
export {
  ALBOR,
  CASSETTE_LABEL,
  LOOK_STORAGE_KEY,
  PLAYER_LOOKS,
  PLAYER_LOOK_IDS,
  PLAYER_LOOK_NAMES,
  doctorMood,
  drawAlborPortrait,
  drawCassette,
  drawYouPortrait,
  getPlayerLook,
  playerSpec,
  setPlayerLook,
  type PeoplePose,
  type PlayerLookId,
} from './people';
export { PEOPLE_CACHE } from './kit';
