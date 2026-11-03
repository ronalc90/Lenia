import { describe, expect, it } from 'vitest';
import { contrast } from '../art/color';
import { PALETTE } from '../art/tokens';

// Read as text (a CSS import is a style module in the test runner), as css-lint.test.ts does.
const fsMod = (await import('node:' + 'fs')) as unknown as { readFileSync(p: string, enc: 'utf8'): string };
const css = fsMod.readFileSync(new URL('./story.css', import.meta.url).pathname, 'utf8');

/** The archive's rules (Settings → Historia), comments stripped. */
function archiveRules(): string {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return src
    .split('}')
    .filter((r) => r.includes('.sty-archive'))
    .join('}');
}

describe('Settings → Historia reads in both themes (QA#34, CLARIDAD2 §5.3 task 9)', () => {
  it('QA#34: the story archive passes AA in both themes: its text and surfaces are theme tokens', () => {
    const rules = archiveRules();
    // Every colour of text or surface comes from the theme (no white text left on a light sheet).
    expect(rules).not.toMatch(/(?:^|[;{\s])(?:color|background|--c-text|--c-dim)\s*:\s*#/m);
    expect(rules).toMatch(/--c-text:\s*var\(--bl-text/);
    expect(rules).toMatch(/--c-dim:\s*var\(--bl-text2/);
    for (const theme of ['dark', 'light'] as const) {
      const p = PALETTE[theme];
      expect(contrast(p.text, p.surface2), `${theme} text`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.text2, p.surface2), `${theme} dim`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
