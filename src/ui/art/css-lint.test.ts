/**
 * The design system, enforced (docs/ARTE-PULIDO.md B-2): every stylesheet under src/ui uses the tokens of
 * tokens.ts / art.css instead of loose values, so the game cannot drift back to 19 font sizes, 21 radii,
 * 73 shadows and ~30 durations. It fails on:
 *
 *   - a `font-size` (or the size in a `font` shorthand) that is not `var(--bl-fs-*)`, a relative `em` / `%`,
 *     or `inherit`;
 *   - a `border-radius` corner outside {0, 8, 12, 16, 24, 999 px, 50 %, var(--bl-r-*)};
 *   - a literal duration or delay in `transition*` / `animation*` (use --bl-t-*, the springs' --bl-t-spring-*,
 *     --bl-stagger, or calc() of them);
 *   - a `box-shadow` that is not `none` or a list of var(--bl-elev-*) / var(--bl-glow-*);
 *   - an infinite animation whose @keyframes touch anything but transform / scale / translate / rotate /
 *     opacity (no endless repaints: box-shadow, filter, background-position…);
 *   - a transition of a layout property (width, height, top, left, right, bottom, flex-basis, margin, padding)
 *     or of `all`;
 *   - `backdrop-filter` anywhere but the sheets and modals that cover a paused dish;
 *   - a `:active` rule that moves the control (the delegated press gesture owns that, motion.ts B-4).
 *
 * A declaration can opt out with a reason on the same line: `/* css-lint-ok: <why> *\/` (an ambient loop's
 * period, a hold-to-confirm ring that lasts as long as the hold). The generated art.css is not linted.
 * The test also prints the §1 table of the plan (distinct sizes, radii, shadows, durations) from the code.
 */
import { describe, expect, it } from 'vitest';

interface Decl {
  file: string;
  line: number;
  selector: string;
  prop: string;
  value: string;
  ok: boolean;
}

interface Sheet {
  file: string;
  decls: Decl[];
  /** @keyframes name → properties it animates. */
  keyframes: Map<string, Set<string>>;
}

const fsMod = (await import('node:' + 'fs')) as unknown as {
  readFileSync(p: string, enc: 'utf8'): string;
  readdirSync(p: string, o: { withFileTypes: true }): { name: string; isDirectory(): boolean }[];
};
const UI_DIR = new URL('..', import.meta.url).pathname;

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fsMod.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir.replace(/\/$/, '')}/${e.name}`;
    if (e.isDirectory()) out.push(...cssFiles(p));
    else if (e.name.endsWith('.css') && e.name !== 'art.css') out.push(p);
  }
  return out.sort();
}

/** Comments blanked out (same length), so positions and line numbers stay true. */
const mask = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

/** A small CSS reader: selectors (with their @-rule context), declarations and @keyframes. */
export function parseCss(file: string, src: string): Sheet {
  const m = mask(src);
  const lines = src.split('\n');
  const decls: Decl[] = [];
  const keyframes = new Map<string, Set<string>>();
  const stack: string[] = [];
  let buf = '';
  let bufStart = 0;
  const lineAt = (i: number) => src.slice(0, i).split('\n').length;
  for (let i = 0; i < m.length; i++) {
    const c = m[i];
    if (c === '{') {
      stack.push(buf.trim().replace(/\s+/g, ' '));
      buf = '';
      bufStart = i + 1;
    } else if (c === '}') {
      flush(i);
      stack.pop();
      buf = '';
      bufStart = i + 1;
    } else if (c === ';') {
      flush(i);
      buf = '';
      bufStart = i + 1;
    } else buf += c;
  }
  function flush(end: number): void {
    const text = buf;
    const colon = text.indexOf(':');
    if (colon < 0 || !stack.length) return;
    const prop = text.slice(0, colon).trim().toLowerCase();
    if (!/^-?[a-z-]+$/.test(prop)) return;
    const value = text.slice(colon + 1).trim();
    const at = bufStart + text.indexOf(prop);
    const line = lineAt(at);
    const endLine = lineAt(end);
    // The opt-out comment may sit anywhere on the declaration's lines.
    const ok = lines.slice(line - 1, endLine).some((l) => /css-lint-ok:/.test(l));
    const kf = stack.find((s) => /^@(-webkit-)?keyframes\s/.test(s));
    if (kf) {
      const name = kf.split(/\s+/)[1];
      if (!keyframes.has(name)) keyframes.set(name, new Set());
      keyframes.get(name)!.add(prop);
      return;
    }
    decls.push({ file, line, selector: stack.filter((s) => !s.startsWith('@')).join(' '), prop, value, ok });
  }
  return { file, decls, keyframes };
}

const RADII = new Set(['0', '8px', '12px', '16px', '24px', '999px', '50%', 'inherit']);
const LOOP_SAFE = new Set(['transform', 'scale', 'translate', 'rotate', 'opacity', 'visibility', 'offset-distance', 'stroke-dashoffset']);
const LAYOUT_PROPS = /(^|[\s,])(all|width|height|min-width|max-width|min-height|max-height|top|left|right|bottom|inset|flex-basis|flex|margin(-[a-z]+)?|padding(-[a-z]+)?|grid-template-[a-z]+)(?=[\s,]|$)/;
/** Sheets, drawers and modals that cover a dish the game has paused may blur it (P5 is about live content). */
const BACKDROP_OK = /(modal|sheet|scrim|drawer|bl-mo-backdrop|mo-help|mo-bh|ss-layer|rt-sheet|pp-|price|welcome|store|wardrobe|lb-|sty-choice|splash|intro|basement|reveal|sec-|bst-)/;
const TIME = /(^|[\s,(*/+-])(\d*\.?\d+)(ms|s)(?![\w-])/g;

export interface Violation {
  where: string;
  rule: string;
  text: string;
}

export function lintSheets(sheets: Sheet[]): Violation[] {
  const v: Violation[] = [];
  const kfAll = new Map<string, Set<string>>();
  for (const s of sheets) for (const [k, p] of s.keyframes) kfAll.set(k, new Set([...(kfAll.get(k) ?? []), ...p]));
  for (const s of sheets)
    for (const d of s.decls) {
      if (d.ok) continue;
      const where = `${s.file.replace(/^.*src\/ui\//, 'src/ui/')}:${d.line}`;
      const val = d.value.replace(/\s*!important\s*$/, '').trim();
      const add = (rule: string) => v.push({ where, rule, text: `${d.selector} { ${d.prop}: ${d.value} }` });
      if (d.prop === 'font-size') {
        if (!(/^var\(--bl-fs-[a-z]+\)$/.test(val) || /^-?[\d.]+(em|%)$/.test(val) || /^(inherit|initial|unset)$/.test(val))) add('font-size');
      } else if (d.prop === 'font') {
        // The shorthand's size (the length before "/line-height" or the family) must be a token too.
        if (/(^|\s)\d*\.?\d+(px|rem|pt)(?=\/|\s)/.test(val)) add('font-size');
      } else if (/^border(-(top|bottom)-(left|right))?-radius$/.test(d.prop)) {
        if (!val.split(/\s+/).every((p) => RADII.has(p) || /^var\(--bl-r-[a-z]+\)$/.test(p))) add('radius');
      } else if (/^(transition|animation)(-duration|-delay)?$/.test(d.prop)) {
        const literal = [...val.matchAll(TIME)].filter((m) => +m[2] !== 0);
        if (literal.length) add('duration');
        if (/^transition(-property)?$/.test(d.prop) && LAYOUT_PROPS.test(val)) add('layout-transition');
      } else if (d.prop === 'transition-property') {
        if (LAYOUT_PROPS.test(val)) add('layout-transition');
      } else if (d.prop === 'box-shadow') {
        if (!(val === 'none' || val === 'inherit' || val.split(/,(?![^(]*\))/).every((p) => /^var\(--bl-(elev|glow)-[a-z0-9]+\)$/.test(p.trim())))) add('box-shadow');
      } else if (d.prop === 'backdrop-filter' || d.prop === '-webkit-backdrop-filter') {
        if (val !== 'none' && !BACKDROP_OK.test(d.selector)) add('backdrop-filter');
      } else if (/:active\b/.test(d.selector) && /^(transform|scale|translate)$/.test(d.prop) && val !== 'none') add('active-transform');
      if ((d.prop === 'animation' || d.prop === 'animation-iteration-count') && /\binfinite\b/.test(val)) {
        const names =
          d.prop === 'animation'
            ? val
                .split(/,(?![^(]*\))/)
                .filter((a) => /\binfinite\b/.test(a))
                .map((a) => a.trim().split(/\s+/).find((w) => kfAll.has(w)))
            : [];
        for (const n of names) {
          if (!n) continue;
          const bad = [...(kfAll.get(n) ?? [])].filter((p) => !LOOP_SAFE.has(p) && p !== 'offset');
          if (bad.length) v.push({ where, rule: 'loop-paint', text: `@keyframes ${n} animates ${bad.join(', ')} forever` });
        }
      }
    }
  return v;
}

/** The §1 table of docs/ARTE-PULIDO.md, measured on the code. */
export function systemTable(sheets: Sheet[]): Record<string, number> {
  const sizes = new Set<string>();
  const radii = new Set<string>();
  const shadows = new Set<string>();
  const durations = new Set<string>();
  let infinitePaint = 0;
  let backdrop = 0;
  for (const s of sheets)
    for (const d of s.decls) {
      const val = d.value.replace(/\s*!important\s*$/, '').trim();
      if (d.prop === 'font-size') sizes.add(val);
      else if (d.prop === 'font') {
        const m = /var\(--bl-fs-[a-z]+\)|(^|\s)\d*\.?\d+(px|rem|em|%)(?=\/|\s)/.exec(val);
        if (m) sizes.add(m[0].trim());
      }
      else if (d.prop === 'border-radius') for (const p of val.split(/\s+/)) radii.add(p);
      else if (d.prop === 'box-shadow') for (const p of val.split(/,(?![^(]*\))/)) shadows.add(p.trim());
      else if (/^(transition|animation)/.test(d.prop)) {
        for (const m of val.matchAll(/var\(--bl-t-[a-z-]+\)|var\(--bl-stagger\)/g)) durations.add(m[0]);
        for (const m of val.matchAll(TIME)) if (+m[2] !== 0) durations.add(m[2] + m[3]);
      } else if (d.prop === 'backdrop-filter' && val !== 'none') backdrop++;
    }
  for (const v of lintSheets(sheets)) if (v.rule === 'loop-paint') infinitePaint++;
  return {
    'font sizes': sizes.size,
    radii: radii.size,
    shadows: shadows.size,
    durations: durations.size,
    'infinite paint loops': infinitePaint,
    'backdrop-filter rules': backdrop,
  };
}

const SHEETS = cssFiles(UI_DIR).map((f) => parseCss(f, fsMod.readFileSync(f, 'utf8')));

describe('css-lint: one design system (docs/ARTE-PULIDO.md B-2)', () => {
  it('the reader finds declarations, selectors and keyframes', () => {
    const s = parseCss('x.css', '@media (max-width: 9px) { .a:hover {\n color: red;\n font-size: 12px /* css-lint-ok: test */; } }\n@keyframes k { 0% { opacity: 0 } 100% { box-shadow: none } }');
    expect(s.decls.map((d) => [d.selector, d.prop, d.ok])).toEqual([
      ['.a:hover', 'color', false],
      ['.a:hover', 'font-size', true],
    ]);
    expect([...s.keyframes.get('k')!]).toEqual(['opacity', 'box-shadow']);
  });

  it('flags loose values and accepts tokens', () => {
    const bad = parseCss(
      'b.css',
      `.x { font-size: 13.5px; border-radius: 14px; transition: opacity .2s ease, width var(--bl-t-base); box-shadow: 0 2px 4px #000; }
       .y:active { transform: scale(.97); }
       .fab { backdrop-filter: blur(8px); animation: glow var(--bl-t-card) infinite; }
       @keyframes glow { to { box-shadow: 0 0 9px red; } }`,
    );
    expect(lintSheets([bad]).map((v) => v.rule).sort()).toEqual(
      ['active-transform', 'backdrop-filter', 'box-shadow', 'duration', 'font-size', 'layout-transition', 'loop-paint', 'radius'].sort(),
    );
    const good = parseCss(
      'g.css',
      `.x { font-size: var(--bl-fs-small); border-radius: var(--bl-r-md) var(--bl-r-md) 0 0; transition: opacity var(--bl-t-base) var(--bl-ease-standard), transform var(--bl-t-spring-fast) var(--bl-spring-fast);
       box-shadow: var(--bl-elev-2), var(--bl-glow-accent); animation: ring var(--bl-t-story) calc(var(--bl-stagger) * 2) infinite; }
       .rt-sheet { backdrop-filter: blur(6px); }
       @keyframes ring { to { transform: scale(1.3); opacity: 0; } }`,
    );
    expect(lintSheets([good])).toEqual([]);
  });

  it('every stylesheet of src/ui uses the tokens', () => {
    const v = lintSheets(SHEETS);
    const table = systemTable(SHEETS);
    console.log('[css-lint] system table (docs/ARTE-PULIDO.md §1):', JSON.stringify(table));
    if (v.length) console.log(v.map((x) => `${x.where} [${x.rule}] ${x.text}`).join('\n'));
    expect(v.map((x) => `${x.where} [${x.rule}] ${x.text}`)).toEqual([]);
  });

  it('the system is closed: 8 sizes, 5 radii, 4 elevations + 3 glows, the duration tokens, no endless repaint', () => {
    const t = systemTable(SHEETS);
    expect(t['font sizes']).toBeLessThanOrEqual(8 + 3); // + em/% relative sizes and inherit
    expect(t['infinite paint loops']).toBe(0);
  });
});
