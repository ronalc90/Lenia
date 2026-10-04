import raw from './catalog.json';
import type { LeniaParams, Pattern } from '../core/types';

/**
 * Curated subset of Bert Chan's Lenia catalog (animals.json).
 * MIT License, Copyright (c) 2018 Bert Chan — see CREDITS.md.
 * All entries use kernel core kn=1 and growth gn=1 (polynomial), which is what
 * our shaders implement, so catalog params can be used as-is.
 */
export interface CatalogEntry {
  code: string;
  name: string;
  R: number;
  T: number;
  b: number[];
  m: number;
  s: number;
  cells: string;
}

export const CATALOG: CatalogEntry[] = raw as CatalogEntry[];

export function catalogByCode(code: string): CatalogEntry | undefined {
  return CATALOG.find((e) => e.code === code);
}

export function paramsOf(e: CatalogEntry): LeniaParams {
  return { R: e.R, rings: [...e.b], mu: e.m, sigma: e.s, dt: 1 / e.T };
}

/** Chan's RLE value encoding: '.'/'b' = 0, 'A'..'X' = 1..24, 'pA'.. = 25+, 'o' = 255. */
function ch2val(c: string): number {
  if (c === '.' || c === 'b') return 0;
  if (c === 'o') return 255;
  if (c.length === 1) return c.charCodeAt(0) - 65 + 1;
  return (c.charCodeAt(0) - 112) * 24 + (c.charCodeAt(1) - 65 + 25);
}

/** Decode a catalog RLE string into a Pattern (values 0..1). 2D only. */
export function decodeRLE(rle: string): Pattern {
  const rows: number[][] = [];
  let row: number[] = [];
  let count = '';
  let prefix = '';
  const push = (v: number) => {
    const n = count === '' ? 1 : parseInt(count, 10);
    for (let i = 0; i < n; i++) row.push(v);
    count = '';
  };
  for (const ch of rle.replace(/\s+/g, '')) {
    if (ch >= '0' && ch <= '9') {
      count += ch;
    } else if (ch === '$') {
      rows.push(row);
      row = [];
      const n = count === '' ? 1 : parseInt(count, 10);
      for (let i = 1; i < n; i++) rows.push([]);
      count = '';
    } else if (ch === '!') {
      break;
    } else if (ch >= 'p' && ch <= 'y') {
      prefix = ch;
    } else {
      push(ch2val(prefix + ch) / 255);
      prefix = '';
    }
  }
  if (row.length) rows.push(row);
  const h = rows.length;
  const w = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const data = new Float32Array(w * h);
  rows.forEach((r, y) => r.forEach((v, x) => (data[y * w + x] = v)));
  return { w, h, data };
}

const patternCache = new Map<string, Pattern>();

export function catalogPattern(code: string): Pattern {
  let p = patternCache.get(code);
  if (!p) {
    const e = catalogByCode(code);
    if (!e) throw new Error(`unknown species ${code}`);
    p = decodeRLE(e.cells);
    patternCache.set(code, p);
  }
  return p;
}
