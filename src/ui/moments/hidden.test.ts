import { describe, expect, it } from 'vitest';

// Release check RF-06 on the merged clarity pass: while a Momento showed as a brief label («¡VIDA!» in
// session 1), its full card stayed in the layout with `hidden` set (`.mo-card { display: flex }` beats the
// browser's [hidden] rule): invisible at opacity 0, yet it caught taps over the bottom of the dish and the
// seed pill, «Nunca más» included. A hidden card must not be on the page at all.
const fsMod = (await import('node:' + 'fs')) as unknown as { readFileSync(p: string, enc: 'utf8'): string };
const css = fsMod.readFileSync(new URL('./moments.css', import.meta.url).pathname, 'utf8');

describe('a hidden Momento card is not on the page', () => {
  it('.mo-card[hidden] is display: none (the card sets display: flex)', () => {
    const rule = /\.mo-card\[hidden\]\s*\{([^}]*)\}/.exec(css);
    expect(rule, 'no .mo-card[hidden] rule').not.toBeNull();
    expect(rule![1]).toMatch(/display:\s*none/);
  });
});
