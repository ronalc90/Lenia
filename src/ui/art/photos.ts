/**
 * Archive photographs (ADR-029, docs/ARTE-REALISTA.md §5, §9): human-made, public domain or CC BY, no
 * identifiable person, used only in still shots. The files are `public/art/photos/<id>.webp` (≤ 50 KB each,
 * ≤ 600 KB in total, photos.test.ts), served at `./art/photos/<id>.webp` and precached by `public/sw.js`.
 * In the single-file build (ADR-015) they are inlined as data URIs, so the file works from `file://`.
 *
 * A photo is decoration, never a dependency: `loadPhoto` resolves `null` when it cannot load (offline
 * before the first visit, an old browser, Node tests) and every scene must draw without it. Never wait
 * for it before drawing; draw with `peekPhoto(id)` each frame and the photo appears when it is ready.
 *
 * `PHOTOS` carries each photo's credit for the in-game Credits (`{ es, en }`); `CREDITS.md` › «Fotografías
 * de archivo» is the same list. Agencies are credited as sources and must never look like endorsers.
 */
import type { Text } from '../../core/types';

declare const __SINGLE_FILE__: boolean;

export type PhotoId =
  | 'estacion-aurora-noaa'
  | 'cupula-aurora-nsf'
  | 'placa-microscopio-nci'
  | 'pipeta-guante-csiro'
  | 'pipeteo-nci'
  | 'congelador-guante-cdc'
  | 'incubadora-hearson-eb1911';

export interface Photo {
  id: PhotoId;
  /** Pixel size of the shipped WebP, for layout before it loads. */
  w: number;
  h: number;
  /** What it shows (credits, alt text). */
  title: Text;
  /** Author and institution, as the source asks to credit them. */
  author: string;
  /** Page the photo was taken from. */
  source: string;
  /** Licence name, for the credits line. */
  licence: Text;
  licenceUrl: string;
  /** One line for the Credits screen: what, who, licence and what was changed. */
  credit: Text;
}

const PD: Text = { es: 'dominio público', en: 'public domain' };
const PD_MARK = 'https://creativecommons.org/publicdomain/mark/1.0/';
const CHANGED: Text = {
  es: 'Reescalada y recomprimida; el juego puede recortarla y oscurecerla.',
  en: 'Rescaled and recompressed; the game may crop and darken it.',
};

function photo(p: Omit<Photo, 'credit'>, changed: Text = CHANGED): Photo {
  return {
    ...p,
    credit: {
      es: `${p.title.es}: ${p.author} (${p.licence.es}). ${changed.es}`,
      en: `${p.title.en}: ${p.author} (${p.licence.en}). ${changed.en}`,
    },
  };
}

/** The seven shippable photos (docs/arte-realista/fotos/<id>.txt has the full provenance of each). */
export const PHOTOS: Readonly<Record<PhotoId, Photo>> = {
  'estacion-aurora-noaa': photo({
    id: 'estacion-aurora-noaa',
    w: 900,
    h: 596,
    title: { es: 'Aurora austral y Vía Láctea sobre una estación polar', en: 'Aurora australis and the Milky Way over a polar station' },
    author: 'Ross Burgener, NOAA Photo Library',
    source: 'https://commons.wikimedia.org/wiki/File:Aurora_australis_and_Milky_Way_seen_over_NOAA_Atmospheric_Research_Observatory_at_South_Pole_Station_(19771223522).jpg',
    licence: PD,
    licenceUrl: PD_MARK,
  }),
  'cupula-aurora-nsf': photo({
    id: 'cupula-aurora-nsf',
    w: 800,
    h: 600,
    title: { es: 'Una cúpula bajo la aurora austral', en: 'A dome under the aurora australis' },
    author: 'Jonathan Berry, National Science Foundation',
    source: 'https://commons.wikimedia.org/wiki/File:Amundsen-Scott_dome_Aurora_1.jpg',
    licence: PD,
    licenceUrl: PD_MARK,
  }),
  'placa-microscopio-nci': photo({
    id: 'placa-microscopio-nci',
    w: 960,
    h: 640,
    title: { es: 'Placa de cultivo bajo el microscopio', en: 'A culture dish under the microscope' },
    author: 'Linda Bartlett, National Cancer Institute (NCI Visuals Online 2006)',
    source: 'https://commons.wikimedia.org/wiki/File:Petri_dish.jpg',
    licence: PD,
    licenceUrl: PD_MARK,
  }),
  'pipeta-guante-csiro': photo(
    {
      id: 'pipeta-guante-csiro',
      w: 640,
      h: 960,
      title: { es: 'Mano con guante y pipeta', en: 'Gloved hand with a pipette' },
      author: 'Morgan Brown / CSIRO',
      source: 'https://commons.wikimedia.org/wiki/File:CSIRO_ScienceImage_11401_CSIRO_researcher_with_pipette.jpg',
      licence: { es: 'CC BY 3.0', en: 'CC BY 3.0' },
      licenceUrl: 'https://creativecommons.org/licenses/by/3.0/',
    },
    {
      es: 'Reescalada, recomprimida y con el color ajustado; el juego puede recortarla y oscurecerla.',
      en: 'Rescaled, recompressed and colour-graded; the game may crop and darken it.',
    },
  ),
  'pipeteo-nci': photo({
    id: 'pipeteo-nci',
    w: 960,
    h: 763,
    title: { es: 'Manos con guantes pipeteando', en: 'Gloved hands pipetting' },
    author: 'Diane A. Reid, National Cancer Institute (NCI Visuals Online 3870)',
    source: 'https://commons.wikimedia.org/wiki/File:Pipetting_(1).jpg',
    licence: PD,
    licenceUrl: PD_MARK,
  }),
  'congelador-guante-cdc': photo(
    {
      id: 'congelador-guante-cdc',
      w: 700,
      h: 393,
      title: { es: 'Una mano con guante guarda muestras en el congelador', en: 'A gloved hand stores samples in a freezer' },
      author: 'CDC / Emily Cramer, Todd Jordan; CDC Public Health Image Library (PHIL 22155)',
      source: 'https://wwwn.cdc.gov/phil/Details.aspx?pid=22155',
      licence: PD,
      licenceUrl: 'https://www.cdc.gov/other/agencymaterials.html',
    },
    { es: 'Recomprimida; el juego puede recortarla y oscurecerla.', en: 'Recompressed; the game may crop and darken it.' },
  ),
  'incubadora-hearson-eb1911': photo(
    {
      id: 'incubadora-hearson-eb1911',
      w: 448,
      h: 618,
      title: { es: 'Incubadora bacteriológica de Hearson, con lámpara (grabado, 1911)', en: "Hearson's bacteriological incubator with its lamp (engraving, 1911)" },
      author: 'Encyclopaedia Britannica, 11th ed. (1911), "Incubators", fig. 9',
      source: 'https://commons.wikimedia.org/wiki/File:EB1911_Incubators_-_Fig._9.%E2%80%94Hearson%E2%80%99s_Bacteriological_Incubator,_petroleum_lamp.jpg',
      licence: PD,
      licenceUrl: PD_MARK,
    },
    { es: 'Recomprimida sin pérdida en 8 grises; el juego puede recortarla.', en: 'Losslessly recompressed in 8 greys; the game may crop it.' },
  ),
};

export const PHOTO_IDS: readonly PhotoId[] = Object.keys(PHOTOS) as PhotoId[];

/** The closing line of the photo credits: the sources do not endorse the game (CDC terms, ADR-029). */
export const PHOTO_CREDITS_NOTE: Text = {
  es: 'Fotografías de archivo hechas por personas. Las instituciones citadas no respaldan este juego.',
  en: 'Archive photographs taken by people. The institutions credited do not endorse this game.',
};

const isPhotoId = (id: string): id is PhotoId => Object.prototype.hasOwnProperty.call(PHOTOS, id);

/** Where the photo is served in the multi-file build (relative to the page, like every asset: `base: './'`). */
export function photoUrl(id: PhotoId): string {
  return `${import.meta.env.BASE_URL}art/photos/${id}.webp`;
}

// The single-file build cannot fetch local files (file://), so it carries the photos as data URIs; the
// multi-file build leaves this branch out and serves them from public/ (vite.config.ts `__SINGLE_FILE__`).
const INLINE: Record<string, () => Promise<string>> = __SINGLE_FILE__
  ? import.meta.glob<string>('../../../public/art/photos/*.webp', { query: '?inline', import: 'default' })
  : {};

async function photoSource(id: PhotoId): Promise<string | null> {
  if (!__SINGLE_FILE__) return photoUrl(id);
  for (const [path, load] of Object.entries(INLINE)) if (path.endsWith(`/${id}.webp`)) return load();
  return null;
}

const pending = new Map<PhotoId, Promise<HTMLImageElement | null>>();
const ready = new Map<PhotoId, HTMLImageElement>();

async function fetchPhoto(id: PhotoId): Promise<HTMLImageElement | null> {
  try {
    const src = await photoSource(id);
    const Img = (globalThis as { Image?: new () => HTMLImageElement }).Image;
    if (!src || typeof Img !== 'function') return null;
    const img = new Img();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`photo ${id}`));
      img.src = src;
    });
    // Decode off the frame that first draws it (no jank in the intro); a failed decode still draws.
    if (typeof img.decode === 'function') await img.decode().catch(() => undefined);
    ready.set(id, img);
    return img;
  } catch {
    return null;
  }
}

/**
 * The photo `id` as a loaded image, or null if it cannot load. One request per photo: the promise is
 * cached, a failure too (until `forgetPhotos`). Never throws, never rejects.
 */
export function loadPhoto(id: PhotoId): Promise<HTMLImageElement | null> {
  if (!isPhotoId(id)) return Promise.resolve(null);
  let p = pending.get(id);
  if (!p) {
    p = fetchPhoto(id);
    pending.set(id, p);
  }
  return p;
}

/** For draw loops: the photo if it has loaded, else null (and it starts loading). Allocates nothing once started. */
export function peekPhoto(id: PhotoId): HTMLImageElement | null {
  const img = ready.get(id);
  if (img) return img;
  if (!pending.has(id)) void loadPhoto(id);
  return null;
}

/** Forgets every photo, loaded or failed, so the next call asks again (back online, tests). */
export function forgetPhotos(): void {
  pending.clear();
  ready.clear();
}
