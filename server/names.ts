/**
 * Player name rules for the ranking, shared by the client (instant feedback) and the server (authority).
 * 3–16 characters: letters (any script, accents, ñ), digits, space, '_' and '-'. A basic Spanish/English
 * profanity filter runs on a normalised form (lowercase, no accents, leetspeak undone). It is meant to
 * stop the obvious, not to be exhaustive. Names are not unique: the server shows them with a "#1234" tag
 * derived from the player id.
 */

export const NAME_MIN = 3;
export const NAME_MAX = 16;

export type NameError = 'name_length' | 'name_chars' | 'name_profanity' | 'name_reserved';
export type NameResult = { ok: true; name: string } | { ok: false; error: NameError };

/**
 * Distinctive roots matched as substrings of the squashed name (letters only). Chosen to avoid the
 * classic false positives: no "puta" (computadora), "rapist" (therapist), "marica" (Maricarmen),
 * "verga" (Vergara), "nazi" (Nazira); those live in WORDS below.
 */
const ROOTS = [
  // en
  'fuck', 'shit', 'cunt', 'bitch', 'nigger', 'nigga', 'faggot', 'whore', 'slut', 'hitler', 'pussy',
  'asshole', 'bastard', 'retard', 'porn', 'penis', 'vagina', 'dildo', 'cumshot', 'jizz', 'blowjob', 'motherf',
  // es
  'mierda', 'joder', 'pendej', 'cabron', 'chinga', 'culero', 'maricon', 'zorra', 'gilipoll', 'follar',
  'malparid', 'hijueput', 'hijodeput', 'putamadre', 'conchetu', 'mamaguev', 'huevon', 'gonorrea', 'pajero',
  'ojete', 'putiza', 'carajo', 'violador',
];
/** Short or ambiguous words matched only as whole words (avoids "calculo", "canal", "cocktail"...). */
const WORDS = new Set([
  'fag', 'cock', 'dick', 'cum', 'anal', 'anus', 'sex', 'rape', 'tits', 'kkk', 'nazi', 'nazis', 'wank', 'wanker',
  'puta', 'puto', 'putas', 'putos', 'polla', 'verga', 'marica', 'culo', 'pene', 'cono', 'hdp', 'ctm', 'ptm',
  'qlo', 'csm', 'mrd', 'tetas', 'mamon',
]);
const RESERVED = ['admin', 'bioluma', 'moderador', 'moderator', 'system', 'sistema', 'oficial', 'official'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i' };

/** Lowercase, strip accents (ñ survives as n), undo leetspeak. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[0-9@$!]/g, (c) => LEET[c] ?? c);
}

/** Trim and collapse whitespace; NFC so "ñ" is one character. */
export function normalizeName(raw: string): string {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateName(raw: string): NameResult {
  const name = normalizeName(raw);
  const len = [...name].length;
  if (len < NAME_MIN || len > NAME_MAX) return { ok: false, error: 'name_length' };
  if (!/^[\p{L}\p{N} _-]+$/u.test(name) || !/\p{L}/u.test(name)) return { ok: false, error: 'name_chars' };
  if (isProfane(name)) return { ok: false, error: 'name_profanity' };
  const squashed = fold(name).replace(/[^a-z]/g, '');
  if (RESERVED.some((r) => squashed.includes(r))) return { ok: false, error: 'name_reserved' };
  return { ok: true, name };
}

export function isProfane(name: string): boolean {
  const folded = fold(name);
  const squashed = folded.replace(/[^a-z]/g, '');
  if (ROOTS.some((r) => squashed.includes(r))) return true;
  // Whole words, also with letter repeats collapsed ("puuuta").
  return folded
    .split(/[^a-z]+/)
    .filter(Boolean)
    .some((w) => WORDS.has(w) || WORDS.has(w.replace(/(.)\1+/g, '$1')));
}
